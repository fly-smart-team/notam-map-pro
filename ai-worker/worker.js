// NOTAM Pro — AI 중계 Worker (개인용) v0.3
// 여러 AI를 순서대로 시도: 앞의 AI가 실패하면 다음 AI로 자동 전환
//
// 경로
//   GET  /health                : 상태 확인 (토큰 불필요)
//   GET  /adsb/reg/HL8510       : 기체 실시간 위치 (adsb.fi / adsb.lol / airplanes.live)
//   GET  /icn/reg/HL8511        : 인천공항 도착·출발 기록 (기체별)
//   GET  /dgk/*, /kac/*         : 공공데이터포털 중계 (주기장·게이트·운항현황). 키는 Worker가 붙임
//   POST /ai/notam-summary      : 노탐 한글 요약 (토큰 필요)
//        본문: { "notams": [ { "id": "A1234/26", "text": "원문..." }, ... ] }
//        응답: { "provider", "model", "items": [ { "id", "summary", "uncertain" } ] }
//
// 비밀값 (Cloudflare 대시보드 → Settings → Variables and secrets, Secret으로)
//   ACCESS_TOKEN       : 개인 접근 토큰 (필수, 앱에서 X-Access-Token 헤더로 보냄)
//   DEEPSEEK_API_KEY   : DeepSeek 키 (있으면 사용)
//   ANTHROPIC_API_KEY  : Claude 키 (있으면 사용)
//   ICN_KEY / KAC_KEY  : 공공데이터포털(data.go.kr) 인증키. 하나만 있어도 인천공항·한국공항공사 모두 사용 (같은 계정 키)
// 일반 변수 (선택)
//   AI_ORDER           : 시도 순서, 기본 "deepseek,anthropic"
//   DEEPSEEK_MODEL     : 기본 deepseek-flash
//   ANTHROPIC_MODEL    : 기본 claude-haiku-5-5

const VERSION = '0.5';   // 0.5: 기존 중계(v1.3: /adsb /icn /dgk) + /kac + AI 통합
const ALLOWED_ORIGINS = ['https://fly-smart-team.github.io'];
const MAX_NOTAMS = 30;           // 한 번에 보낼 수 있는 노탐 수
const MAX_CHARS = 4000;          // 노탐 하나 최대 글자 수
const CACHE_SECONDS = 7 * 86400; // 같은 원문은 7일간 다시 묻지 않음
const TIMEOUT_MS = 45000;        // AI 하나당 최대 대기 시간

// ───────── 공통 도구 ─────────
function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
  });
}
// 시간차 공격을 막는 문자열 비교
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a || ''), y = enc.encode(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0 && x.length > 0;
}
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function fetchWithTimeout(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

// ───────── 지시문 ─────────
const SYSTEM_PROMPT = `너는 민항기 기장을 돕는 NOTAM 해설 도우미다. 각 NOTAM을 자연스러운 한국어로 완전히 옮겨 요약한다.

규칙:
- 영어 단어를 한국어 문장 속에 섞어 남기지 않는다. 일반 영어(FOR, WORKERS, CAN BE, PRIOR NOTICE 등)는 모두 한국어로 옮긴다.
- 영어로 남겨도 되는 것: 식별부호(RWY 05/23, TWY A, ILS 15R, VOR 'ABC', 공항코드, 픽스·항로 이름), 주파수, 숫자, 단위(FT, NM, KT, FL), 시간(UTC).
- 숫자·주파수·활주로·고도·좌표·시간은 원문 그대로 옮긴다 (단위 변환·계산 금지).
- 원문에 없는 내용은 추측하거나 덧붙이지 않는다. 다만 원문 문장이 뜻하는 바(예: "단일 활주로 폐쇄" = 공항에 이착륙 가능한 활주로 없음)는 원문 범위 안에서 풀어 쓴다.
- 입력이 '[MEL 해설 요청]'으로 시작하면 위 구성·문장 수 규칙 대신 그 입력이 지정한 형식(원문 순서·번호 유지, 한 줄씩, 줄바꿈 \\n)을 따른다.
- 구성: ① 무엇이 어떻게(폐쇄·사용 불가·변경) ② 이유 ③ 예외·조건(사전 통보, PPR 등) ④ COMMENT의 운항상 의미. 1~3문장.
- 시간 범위(D 항목 등)는 앱이 따로 보여주므로 반복하지 않는다. 단, E 항목 안의 시간 조건은 옮긴다.
- 원문이 잘렸거나 뜻이 모호하면 uncertain을 true로 하고 요약 끝에 "원문 확인 필요"를 붙인다.
- 입력받은 모든 NOTAM에 대해 id를 그대로 돌려준다.

용어 (이 뜻으로 옮긴다):
WORKERS 작업자 · EQPT 장비 · WIP 공사 · MAINT 정비 · RE-PAINTING 재도색 · RCL 활주로 중심선 · EDGE(S) 가장자리 · MARKING 표지
AD-HOC (FLT) 비정기편 · DIV FLT 회항편(다른 공항에서 회항해 오는 항공기) · MEDEVAC 응급환자 후송 비행 · SAR 수색구조 · HOSP FLT 병원 이송편
ACPT 수용(허용) · WI TWO HR PRIOR NOTICE 2시간 전 사전 통보 시 · PPR 사전 허가 필요 · O/R 요청 시 · EXC 제외 · SINGLE RWY 단일 활주로
U/S 사용 불가(고장) · NOT AVBL 사용 불가 · CLSD 폐쇄 · TEMPO 일시 · OBST 장애물 · LGT 등화 · ALS 진입등 · PAPI 진입각 지시등 · AD 공항 · ATC 관제

예시:
원문: E) RWY 05/23 CLSD FOR RE-PAINTING RCL AND EDGES MARKING THERE WILL BE EQPT AND WORKERS ON RWY AD-HOC,DIV FLT AND MEDEVAC CAN BE ACPT WI TWO HR PRIOR NOTICE COMMENT) SINGLE RWY CLSD
요약: RWY 05/23 폐쇄(활주로 중심선·가장자리 표지 재도색), 활주로 위에 장비와 작업자 있음. 비정기편·회항편·응급환자 후송 비행은 2시간 전 사전 통보 시 수용 가능. 단일 활주로 공항이라 해당 시간에는 이착륙 가능한 활주로가 없음.`;

const JSON_RULE = `
출력은 아래 형식의 JSON 하나만 쓴다. 다른 글은 쓰지 않는다.
{"items":[{"id":"입력 id 그대로","summary":"한국어 요약","uncertain":false}]}`;

function userText(notams) {
  return notams.map(n => `<notam id="${n.id}">\n${n.text}\n</notam>`).join('\n\n');
}
function cleanItems(items) {
  return (Array.isArray(items) ? items : []).map(it => ({
    id: String((it && it.id) || ''),
    summary: String((it && it.summary) || ''),
    uncertain: !!(it && it.uncertain),
  })).filter(it => it.id && it.summary);
}

// ───────── AI별 호출 ─────────
const PROVIDERS = {
  // DeepSeek: OpenAI 형식, JSON 모드
  deepseek: {
    keyName: 'DEEPSEEK_API_KEY',
    model: env => env.DEEPSEEK_MODEL || 'deepseek-flash',
    async call(env, notams) {
      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model(env),
          max_tokens: 8192,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + JSON_RULE },
            { role: 'user', content: userText(notams) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const cut = data.choices && data.choices[0] && data.choices[0].finish_reason === 'length';
      let parsed;
      try { parsed = JSON.parse(text || ''); } catch { throw new Error(cut ? 'DeepSeek 응답이 길어 중간에 잘림' : 'DeepSeek 응답이 JSON이 아님'); }
      return cleanItems(parsed.items);
    },
  },

  // Claude: 도구 호출로 형식 고정
  anthropic: {
    keyName: 'ANTHROPIC_API_KEY',
    model: env => env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    async call(env, notams) {
      const tool = {
        name: 'record_summaries',
        description: 'NOTAM별 한국어 요약 결과를 기록한다.',
        input_schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  summary: { type: 'string' },
                  uncertain: { type: 'boolean' },
                },
                required: ['id', 'summary', 'uncertain'],
              },
            },
          },
          required: ['items'],
        },
      };
      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model(env),
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: [tool],
          tool_choice: { type: 'tool', name: tool.name },
          messages: [{ role: 'user', content: userText(notams) }],
        }),
      });
      if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const block = (data.content || []).find(b => b.type === 'tool_use');
      return cleanItems(block && block.input && block.input.items);
    },
  },
};

// 키가 있는 AI만, 정한 순서대로
function activeProviders(env) {
  const order = String(env.AI_ORDER || 'deepseek,anthropic').split(',').map(s => s.trim()).filter(Boolean);
  return order.filter(name => PROVIDERS[name] && env[PROVIDERS[name].keyName]);
}

// 순서대로 시도하고, 처음 성공한 결과를 돌려줌
async function summarizeWithFallback(env, notams) {
  const errors = [];
  for (const name of activeProviders(env)) {
    const p = PROVIDERS[name];
    try {
      const items = await p.call(env, notams);
      if (!items.length) throw new Error('빈 응답');
      return { provider: name, model: p.model(env), items, errors };
    } catch (e) {
      errors.push(`${name}: ${String((e && e.message) || e)}`);
    }
  }
  throw new Error(errors.length ? `모든 AI 실패 — ${errors.join(' / ')}` : '사용할 수 있는 AI 키가 없습니다');
}

// ───────── 노탐 요약 ─────────
async function notamSummary(request, env, origin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 형식이 아닙니다' }, 400, origin); }
  const list = Array.isArray(body && body.notams) ? body.notams : null;
  if (!list || !list.length) return json({ error: 'notams 배열이 비었습니다' }, 400, origin);
  if (list.length > MAX_NOTAMS) return json({ error: `한 번에 ${MAX_NOTAMS}개까지 보낼 수 있습니다` }, 400, origin);

  const notams = list.map((n, i) => ({
    id: String((n && n.id) || `N${i + 1}`).slice(0, 40),
    text: String((n && n.text) || '').slice(0, MAX_CHARS),
  })).filter(n => n.text.trim());

  // 원문별 캐시 확인 → 없는 것만 AI에 요청
  const cache = caches.default;
  const out = {}, missing = [];
  for (const n of notams) {
    const key = new Request(`https://notam-ai.cache/v3/${await sha256(n.text)}`);
    const hit = await cache.match(key);
    if (hit) out[n.id] = { ...(await hit.json()), id: n.id, cached: true };
    else missing.push({ ...n, key });
  }

  let used = null;
  if (missing.length) {
    const r = await summarizeWithFallback(env, missing.map(({ id, text }) => ({ id, text })));
    used = { provider: r.provider, model: r.model, fallbackErrors: r.errors };
    for (const it of r.items) {
      const src = missing.find(m => m.id === it.id);
      if (!src) continue;
      const rec = { summary: it.summary, uncertain: it.uncertain, provider: r.provider, model: r.model };
      out[src.id] = { id: src.id, ...rec, cached: false };
      await cache.put(src.key, new Response(JSON.stringify(rec), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
      }));
    }
  }

  // 입력 순서대로, 빠진 것은 실패로 표시
  const items = notams.map(n => out[n.id] || { id: n.id, summary: '', uncertain: true, error: '요약 실패' });
  return json({ ...(used || { provider: 'cache' }), items }, 200, origin);
}



// 공공데이터 인증키: 용도별 우선순위 (하나만 설정해도 모두 동작)
function dgKey(env, kind) {
  const order = kind === 'kac' ? ['KAC_KEY', 'ICN_KEY', 'DGK_KEY', 'DATA_GO_KEY'] : ['ICN_KEY', 'KAC_KEY', 'DGK_KEY', 'DATA_GO_KEY'];
  for (const k of order) if (env[k]) return env[k];
  return '';
}

// ───────── 기체 위치 · 인천공항 기록 (기존 중계 v1.3)
// 출처 하나 조회 (최대 5초)
async function one(name, url) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'notam-lite-proxy/1.1 (personal, non-commercial)', 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return { src: name, ac: j.ac || j.aircraft || [], ms: Date.now() - t0 };
  } catch (e) {
    throw new Error(`${name}: ${e.name === 'AbortError' ? '시간 초과(5초)' : e.message}`);
  } finally { clearTimeout(timer); }
}

// 세 곳 동시 조회 → 가장 먼저 성공한 결과 사용
async function adsbByReg(reg) {
  const r = encodeURIComponent(reg.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
  const jobs = [
    one('adsb.fi', `https://opendata.adsb.fi/api/v2/registration/${r}`),
    one('adsb.lol', `https://api.adsb.lol/v2/reg/${r}`),
    one('airplanes.live', `https://api.airplanes.live/v2/reg/${r}`),
  ];
  try {
    // 기체가 잡힌 결과 우선, 없으면 빈 결과라도 성공으로
    const withAc = await Promise.any(jobs.map(p => p.then(x => x.ac.length ? x : Promise.reject(new Error('empty')))));
    return { ...withAc, errs: [] };
  } catch (_) {
    const all = await Promise.allSettled(jobs);
    const ok = all.find(x => x.status === 'fulfilled');
    const errs = all.filter(x => x.status === 'rejected').map(x => x.reason.message);
    if (ok) return { ...ok.value, errs };
    return { src: null, ac: [], errs, fail: true };
  }
}


// ---- 인천공항 운항 현황: 하루치(도착/출발)를 받아 5분간 보관 ----
const ICN_BASE = 'https://apis.data.go.kr/B551177/statusOfAllFltDeOdp';
async function icnDay(op, date, env, ctx, stat) {
  const cacheKey = new Request(`https://icn-cache.local/${op}/${date}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) { stat.cached++; return hit.json(); }
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const q = new URLSearchParams({ serviceKey: dgKey(env, 'dgk'), type: 'json', searchDate: date, searchFrom: '0000', searchTo: '2400', searchdtCode: 'S', numOfRows: '1000', pageNo: String(page) });
    const r = await fetch(`${ICN_BASE}/${op}?${q}`, { headers: { 'Accept': 'application/json' } });
    stat.calls++;
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error(`${op} ${date}: 응답 형식 오류 ${txt.slice(0, 80)}`); }
    const body = (j.response || j).body || {}, head = (j.response || j).header || {};
    if (head.resultCode && head.resultCode !== '00') throw new Error(`${op} ${date}: ${head.resultCode} ${head.resultMsg || ''}`);
    let items = body.items; if (items && !Array.isArray(items)) items = items.item ? [].concat(items.item) : [];
    items = items || [];
    for (const x of items) {
      const reg = String(x.aircraftRegNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!reg || reg === '-') continue;
      all.push({ reg, flt: x.flightId, cs: x.codeshare, ap: x.airportCode, apn: x.airport, sch: x.scheduleDatetime, est: x.estimatedDatetime,
        stand: x.fstandPosition, gate: x.gateNumber, term: x.terminalId, rmk: x.remark, sub: x.aircraftSubtype });
    }
    if (all.length + 0 >= (+body.totalCount || 0) || items.length < 1000) break;
  }
  ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(all), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } })));
  return all;
}
function kstDates(from, to) {
  const d0 = Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)), d1 = Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6, 8));
  const out = []; for (let d = d0; d <= d1 && out.length < 4; d += 864e5) out.push(new Date(d).toISOString().slice(0, 10).replace(/-/g, ''));
  return out;
}
async function icnByReg(reg, from, to, env, ctx) {
  const R = reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const stat = { calls: 0, cached: 0 }, errs = [];
  const res = { reg: R, from, to, arr: [], dep: [] };
  for (const date of kstDates(from, to)) {
    for (const [op, key] of [['getFltArrivalsDeOdp', 'arr'], ['getFltDeparturesDeOdp', 'dep']]) {
      try {
        const rows = await icnDay(op, date, env, ctx, stat);
        rows.forEach(x => { const t = x.est || x.sch || ''; if (x.reg === R && t >= from && t <= to && x.cs !== 'Slave') res[key].push(x); });
      } catch (e) { errs.push(e.message); }
    }
  }
  const by = (a, b) => String(a.est || a.sch).localeCompare(String(b.est || b.sch));
  res.arr.sort(by); res.dep.sort(by);
  return { ...res, errs, ...stat };
}


// ───────── 공공데이터포털 중계 (인천공항 B551177 · 한국공항공사 B551178) ─────────
async function dataGoProxy(request, env, url, origin) {
  if (request.method !== 'GET') return json({ error: 'GET만 가능합니다' }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.includes(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return json({ error: '허용되지 않은 출처' }, 403, origin);
  const path = url.pathname.replace(/^\/(dgk|kac)/, '');
  if (!/^\/(B551177|B551178)\/[A-Za-z0-9_\-\/]+$/.test(path)) return json({ error: '허용되지 않은 경로' }, 403, origin);
  const key = dgKey(env, /^\/kac/.test(url.pathname) ? 'kac' : 'dgk');
  if (!key) return json({ error: '서버에 ICN_KEY(또는 KAC_KEY) 비밀값이 없습니다' }, 500, origin);
  const q = new URLSearchParams(url.search);
  q.delete('serviceKey'); q.delete('ServiceKey');
  let k = key; try { if (/%[0-9A-Fa-f]{2}/.test(k)) k = decodeURIComponent(k); } catch { }
  const target = `https://apis.data.go.kr${path}?serviceKey=${encodeURIComponent(k)}&${q.toString()}`;
  const cache = caches.default, ck = new Request(`https://notam-proxy.cache/dg/${await sha256(target)}`);
  const hit = await cache.match(ck);
  if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) } });
  const res = await fetchWithTimeout(target, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  const headers = { 'Content-Type': res.headers.get('Content-Type') || 'application/json; charset=utf-8', ...cors(origin) };
  if (res.ok) await cache.put(ck, new Response(text, { headers: { 'Content-Type': headers['Content-Type'], 'Cache-Control': 'max-age=120' } }));
  return new Response(text, { status: res.status, headers });
}

// ───────── 진입점 ─────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/health') {
      const keys = {};
      for (const [name, p] of Object.entries(PROVIDERS)) keys[name] = !!env[p.keyName];
      return json({
        ok: true, version: VERSION, v: '1.3', icnKey: !!dgKey(env, 'dgk'), kacKey: !!dgKey(env, 'kac'),
        token: !!env.ACCESS_TOKEN,
        keys,
        order: activeProviders(env),
        colo: (request.cf && request.cf.colo) || '',
      }, 200, origin);
    }

    const am = url.pathname.match(/^\/adsb\/reg\/([A-Za-z0-9-]{3,10})$/);
    if (am) { const r = await adsbByReg(am[1]); return json(r, r.fail ? 502 : 200, origin); }
    const im = url.pathname.match(/^\/icn\/reg\/([A-Za-z0-9-]{3,10})$/);
    if (im) {
      if (!dgKey(env, 'dgk')) return json({ error: 'Worker에 ICN_KEY 비밀값이 없습니다' }, 500, origin);
      const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
      if (!/^\d{12}$/.test(from) || !/^\d{12}$/.test(to) || from > to) return json({ error: 'from/to는 YYYYMMDDHHmm (KST)' }, 400, origin);
      try { return json(await icnByReg(im[1], from, to, env, ctx), 200, origin); } catch (e) { return json({ error: String((e && e.message) || e) }, 502, origin); }
    }

    if (url.pathname.startsWith('/dgk/') || url.pathname.startsWith('/kac/')) {
      try { return await dataGoProxy(request, env, url, origin); } catch (e) { return json({ error: String((e && e.message) || e) }, 502, origin); }
    }

    if (url.pathname.startsWith('/ai/')) {
      if (!env.ACCESS_TOKEN) return json({ error: 'ACCESS_TOKEN이 설정되지 않았습니다' }, 500, origin);
      if (!safeEqual(request.headers.get('X-Access-Token'), env.ACCESS_TOKEN)) {
        return json({ error: '접근 토큰이 맞지 않습니다' }, 401, origin);
      }
      try {
        if (url.pathname === '/ai/notam-summary' && request.method === 'POST') return await notamSummary(request, env, origin);
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 502, origin);
      }
    }

    return json({ error: '없는 경로입니다' }, 404, origin);
  },
};
