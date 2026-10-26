// NOTAM Pro — AI 중계 Worker (개인용) v0.4
// 여러 AI를 순서대로 시도: 앞의 AI가 실패하면 다음 AI로 자동 전환
//
// 경로
//   GET  /health                : 상태 확인 (토큰 불필요)
//   POST /ai/notam-summary      : 노탐 한글 요약 (토큰 필요)
//   POST /ai/crew-brief         : 승무원 브리핑 원고 (한국어·영어, 토큰 필요)
//        본문: { "notams": [ { "id": "A1234/26", "text": "원문..." }, ... ] }
//        응답: { "provider", "model", "items": [ { "id", "summary", "uncertain" } ] }
//
// 비밀값 (Cloudflare 대시보드 → Settings → Variables and secrets, Secret으로)
//   ACCESS_TOKEN       : 개인 접근 토큰 (필수, 앱에서 X-Access-Token 헤더로 보냄)
//   DEEPSEEK_API_KEY   : DeepSeek 키 (있으면 사용)
//   ANTHROPIC_API_KEY  : Claude 키 (있으면 사용)
// 일반 변수 (선택)
//   AI_ORDER           : 시도 순서, 기본 "deepseek,anthropic"
//   DEEPSEEK_MODEL     : 기본 deepseek-flash
//   ANTHROPIC_MODEL    : 기본 claude-haiku-5-5

const VERSION = '0.4';
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
          max_tokens: 4096,
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
      let parsed;
      try { parsed = JSON.parse(text || ''); } catch { throw new Error('DeepSeek 응답이 JSON이 아님'); }
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
          max_tokens: 4096,
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

// ───────── 범용 JSON 호출 (브리핑 원고 등) ─────────
async function deepseekJson(env, { system, user, maxTokens }) {
  const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: PROVIDERS.deepseek.model(env), max_tokens: maxTokens || 4096, temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  try { return JSON.parse(text || ''); } catch { throw new Error('DeepSeek 응답이 JSON이 아님'); }
}
async function claudeJson(env, { system, user, schema, toolName, maxTokens }) {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: PROVIDERS.anthropic.model(env), max_tokens: maxTokens || 4096, system,
      tools: [{ name: toolName, description: '결과를 기록한다.', input_schema: schema }],
      tool_choice: { type: 'tool', name: toolName },
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const block = (data.content || []).find(b => b.type === 'tool_use');
  return (block && block.input) || {};
}
const JSON_CALLERS = { deepseek: deepseekJson, anthropic: claudeJson };
async function jsonWithFallback(env, opts, check) {
  const errors = [];
  for (const name of activeProviders(env)) {
    try {
      const out = await JSON_CALLERS[name](env, opts);
      check(out);
      return { provider: name, model: PROVIDERS[name].model(env), out, errors };
    } catch (e) { errors.push(`${name}: ${String((e && e.message) || e)}`); }
  }
  throw new Error(errors.length ? `모든 AI 실패 — ${errors.join(' / ')}` : '사용할 수 있는 AI 키가 없습니다');
}

// ───────── 승무원 브리핑 원고 ─────────
const BRIEF_PROMPT = `너는 민항기 기장의 출발 전 승무원 브리핑 원고를 쓰는 도우미다.
입력: 비행 정보와, 앱이 골라 보낸 노탐·회사 공지(COAD) 목록. 각 항목에는 ref(번호), sec(DEP 출발/DEST 도착/ALTN 교체/ERA/FIR), tier(R 영향/Y 확인/W 참고), star(true면 기장이 직접 중요 표시), 원문 또는 요약이 있다.

할 일: 조종실 합동 브리핑에서 소리 내어 읽을 짧은 원고를 한국어와 영어로 같이 만든다.
규칙:
- star가 true인 항목은 반드시 포함하고, 해당 줄의 star를 true로 한다.
- 섹션 순서: DEP(출발) → ENR(항로·FIR) → DEST(도착) → ALTN(교체) → ERA. 해당 내용이 없는 섹션은 뺀다.
- 한 줄 = 승무원이 알아야 할 하나의 사실 또는 행동. 관련 노탐 여러 개는 한 줄로 묶고 refs에 모두 넣는다.
- 기체(기종·등록부호), ETD·ETA와 대조해 의미를 판단한다: 다른 기종 대상이면 "본 기체 해당 없음", 시간이 겹치지 않으면 "ETA와 겹치지 않음"처럼 명확히 쓴다. 단, 원문에 근거가 없으면 판단하지 않는다.
- 해야 할 행동(관제 요청, 확인할 것)이 있으면 문장에 드러낸다.
- 숫자·활주로·주파수·고도·시간·식별부호는 원문 그대로. 추측·과장 금지.
- tier R 또는 star 항목 위주로, 짧게 모드는 전체 6~12줄, 자세히 모드는 10~20줄.
- en은 조종사끼리 쓰는 간결한 항공 영어(표준 약어 허용: RWY, TWY, ILS, OCA, MOCA, EDCT 등). ko와 같은 내용.
- 마지막에 key(핵심 3가지 이내)를 ko·en으로 한 줄씩.

출력은 아래 JSON 하나만:
{"sections":[{"sec":"DEP","lines":[{"ko":"...","en":"...","refs":["RKSI COAD05/26"],"tier":"R","star":false}]}],"key":{"ko":"...","en":"..."}}`;

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    sections: { type: 'array', items: { type: 'object', properties: {
      sec: { type: 'string', enum: ['DEP', 'ENR', 'DEST', 'ALTN', 'ERA'] },
      lines: { type: 'array', items: { type: 'object', properties: {
        ko: { type: 'string' }, en: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } },
        tier: { type: 'string' }, star: { type: 'boolean' } }, required: ['ko', 'en', 'refs'] } } },
      required: ['sec', 'lines'] } },
    key: { type: 'object', properties: { ko: { type: 'string' }, en: { type: 'string' } } },
  },
  required: ['sections'],
};

async function crewBrief(request, env, origin) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 형식이 아닙니다' }, 400, origin); }
  const items = Array.isArray(body && body.items) ? body.items.slice(0, 120) : [];
  if (!items.length) return json({ error: '브리핑할 항목이 없습니다' }, 400, origin);
  const flight = body.flight || {};
  const mode = body.mode === 'long' ? 'long' : 'short';
  const user = `비행: ${JSON.stringify(flight)}\n모드: ${mode === 'long' ? '자세히' : '짧게'}\n\n` + items.map(it =>
    `<item ref="${String(it.ref || '').slice(0, 40)}" sec="${it.sec || ''}" code="${it.code || ''}" tier="${it.tier || ''}" star="${!!it.star}">\n${String(it.text || '').slice(0, 900)}\n</item>`).join('\n');

  const cache = caches.default;
  const key = new Request(`https://notam-ai.cache/brief-v1/${await sha256(user)}`);
  const hit = await cache.match(key);
  if (hit) return json({ ...(await hit.json()), cached: true }, 200, origin);

  const r = await jsonWithFallback(env, { system: BRIEF_PROMPT, user, schema: BRIEF_SCHEMA, toolName: 'record_brief', maxTokens: 6000 },
    out => { if (!out || !Array.isArray(out.sections) || !out.sections.length) throw new Error('빈 원고'); });
  const res = { provider: r.provider, model: r.model, sections: r.out.sections, key: r.out.key || null };
  await cache.put(key, new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } }));
  return json(res, 200, origin);
}

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

// ───────── 진입점 ─────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/health') {
      const keys = {};
      for (const [name, p] of Object.entries(PROVIDERS)) keys[name] = !!env[p.keyName];
      return json({
        ok: true, version: VERSION,
        token: !!env.ACCESS_TOKEN,
        keys,
        order: activeProviders(env),
        colo: (request.cf && request.cf.colo) || '',
      }, 200, origin);
    }

    if (url.pathname.startsWith('/ai/')) {
      if (!env.ACCESS_TOKEN) return json({ error: 'ACCESS_TOKEN이 설정되지 않았습니다' }, 500, origin);
      if (!safeEqual(request.headers.get('X-Access-Token'), env.ACCESS_TOKEN)) {
        return json({ error: '접근 토큰이 맞지 않습니다' }, 401, origin);
      }
      try {
        if (url.pathname === '/ai/notam-summary' && request.method === 'POST') return await notamSummary(request, env, origin);
        if (url.pathname === '/ai/crew-brief' && request.method === 'POST') return await crewBrief(request, env, origin);
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 502, origin);
      }
    }

    return json({ error: '없는 경로입니다' }, 404, origin);
  },
};
