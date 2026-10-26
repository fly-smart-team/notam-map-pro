// NOTAM Pro — AI 중계 Worker (개인용) v0.2
// 여러 AI를 순서대로 시도: 앞의 AI가 실패하면 다음 AI로 자동 전환
//
// 경로
//   GET  /health                : 상태 확인 (토큰 불필요)
//   POST /ai/notam-summary      : 노탐 한글 요약 (토큰 필요)
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

const VERSION = '0.2';
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
const SYSTEM_PROMPT = `너는 민항기 조종사를 위한 NOTAM 요약 도우미다.
각 NOTAM 원문을 한국어로 짧게(1~2문장) 요약한다.
규칙:
- 원문에 없는 내용을 추측하거나 덧붙이지 않는다.
- 숫자·주파수·활주로·고도·좌표·시간·식별부호는 원문 그대로 옮긴다 (단위 변환 금지).
- 항공 약어(RWY, TWY, ILS, U/S, CLSD 등)는 한국어로 풀되, 식별부호(예: RWY 33L, ILS 15R)는 그대로 둔다.
- 운항에 영향을 주는 핵심(무엇이, 어디서, 언제, 어떻게)을 먼저 쓴다.
- 원문이 잘렸거나 뜻이 모호하면 uncertain을 true로 하고, 요약에 "원문 확인 필요"를 붙인다.
- 입력받은 모든 NOTAM에 대해 id를 그대로 돌려준다.`;

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
    const key = new Request(`https://notam-ai.cache/v2/${await sha256(n.text)}`);
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
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 502, origin);
      }
    }

    return json({ error: '없는 경로입니다' }, 404, origin);
  },
};
