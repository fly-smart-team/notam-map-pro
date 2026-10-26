// NOTAM Pro — AI 중계 Worker (개인용) v0.1
// 경로
//   GET  /health                : 상태 확인 (토큰 불필요)
//   POST /ai/notam-summary      : 노탐 한글 요약 (토큰 필요)
//        본문: { "notams": [ { "id": "A1234/26", "text": "원문..." }, ... ] }
//        응답: { "model": "...", "items": [ { "id", "summary", "uncertain" } ] }
// 비밀값 (Cloudflare 대시보드 → Settings → Variables and Secrets)
//   ANTHROPIC_API_KEY : Anthropic API 키
//   ACCESS_TOKEN      : 개인 접근 토큰 (앱에서 X-Access-Token 헤더로 보냄)
// 일반 변수 (선택)
//   AI_MODEL          : 기본 claude-sonnet-5-5

const ALLOWED_ORIGINS = [
  'https://fly-smart-team.github.io',
];
const MAX_NOTAMS = 30;          // 한 번에 보낼 수 있는 노탐 수
const MAX_CHARS = 4000;         // 노탐 하나 최대 글자 수
const CACHE_SECONDS = 7 * 86400; // 같은 원문은 7일간 다시 묻지 않음

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

const SYSTEM_PROMPT = `너는 민항기 조종사를 위한 NOTAM 요약 도우미다.
각 NOTAM 원문을 한국어로 짧게(1~2문장) 요약한다.
규칙:
- 원문에 없는 내용을 추측하거나 덧붙이지 않는다.
- 숫자·주파수·활주로·고도·좌표·시간·식별부호는 원문 그대로 옮긴다 (단위 변환 금지).
- 항공 약어(RWY, TWY, ILS, U/S, CLSD 등)는 한국어로 풀되, 식별부호(예: RWY 33L, ILS 15R)는 그대로 둔다.
- 운항에 영향을 주는 핵심(무엇이, 어디서, 언제, 어떻게)을 먼저 쓴다.
- 원문이 잘렸거나 뜻이 모호하면 uncertain을 true로 하고, 요약에 "원문 확인 필요"를 붙인다.
- 반드시 record_summaries 도구로 모든 NOTAM의 결과를 한 번에 돌려준다.`;

const TOOL = {
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
            id: { type: 'string', description: '입력으로 받은 id 그대로' },
            summary: { type: 'string', description: '한국어 요약 1~2문장' },
            uncertain: { type: 'boolean', description: '원문이 모호하거나 잘렸으면 true' },
          },
          required: ['id', 'summary', 'uncertain'],
        },
      },
    },
    required: ['items'],
  },
};

async function callClaude(env, notams) {
  const model = env.AI_MODEL || 'claude-sonnet-5-5';
  const userText = notams.map(n => `<notam id="${n.id}">\n${n.text}\n</notam>`).join('\n\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const block = (data.content || []).find(b => b.type === 'tool_use');
  const items = (block && block.input && block.input.items) || [];
  return { model, items };
}

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
  const model = env.AI_MODEL || 'claude-sonnet-5-5';
  const cache = caches.default;
  const out = {}, missing = [];
  for (const n of notams) {
    const key = new Request(`https://notam-ai.cache/${model}/${await sha256(n.text)}`);
    const hit = await cache.match(key);
    if (hit) out[n.id] = { ...(await hit.json()), id: n.id, cached: true };
    else missing.push({ ...n, key });
  }

  if (missing.length) {
    const r = await callClaude(env, missing);
    for (const it of r.items) {
      const src = missing.find(m => m.id === it.id);
      if (!src) continue;
      const rec = { summary: String(it.summary || ''), uncertain: !!it.uncertain };
      out[src.id] = { id: src.id, ...rec, cached: false };
      await cache.put(src.key, new Response(JSON.stringify(rec), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
      }));
    }
  }

  // 입력 순서대로, 빠진 것은 실패로 표시
  const items = notams.map(n => out[n.id] || { id: n.id, summary: '', uncertain: true, error: '요약 실패' });
  return json({ model, items }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/health') {
      return json({
        ok: true, version: '0.1',
        key: !!env.ANTHROPIC_API_KEY, token: !!env.ACCESS_TOKEN,
        model: env.AI_MODEL || 'claude-sonnet-5-5',
      }, 200, origin);
    }

    if (url.pathname.startsWith('/ai/')) {
      if (!env.ANTHROPIC_API_KEY || !env.ACCESS_TOKEN) return json({ error: '비밀값이 설정되지 않았습니다' }, 500, origin);
      if (!safeEqual(request.headers.get('X-Access-Token'), env.ACCESS_TOKEN)) {
        return json({ error: '접근 토큰이 맞지 않습니다' }, 401, origin);
      }
      try {
        if (url.pathname === '/ai/notam-summary' && request.method === 'POST') return await notamSummary(request, env, origin);
      } catch (e) {
        return json({ error: String(e.message || e) }, 502, origin);
      }
    }

    return json({ error: '없는 경로입니다' }, 404, origin);
  },
};
