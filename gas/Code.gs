// NOTAM Pro — Google Apps Script 백엔드 (회사 구글 워크스페이스용)
// Cloudflare Worker(v0.4)를 대신한다: 파일 제공(Drive) · 공공데이터 중계(/dgk,/kac) · AI 요약.
//
// 스크립트 속성 (프로젝트 설정 → 스크립트 속성)
//   ASSET_FOLDER_ID : 앱 파일(index.html, *.json, mel.enc, hot/, twy/ 등)을 올린 Drive 폴더 ID  (필수)
//   KAC_KEY         : 공공데이터포털(data.go.kr) 인증키 — 인천공항·한국공항공사 공용
//   ACCESS_TOKEN    : AI 접근 토큰 (앱의 AI 설정에 넣은 값과 같게)
//   DEEPSEEK_API_KEY / ANTHROPIC_API_KEY : AI 키 (있는 것만 사용)

const MAX_NOTAMS = 30, MAX_CHARS = 4000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('NOTAM Pro')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 앱(브라우저)에서 google.script.run.api(요청) 으로 호출
function api(req) {
  try {
    if (req.k === 'file') return apiFile_(req.name);
    if (req.k === 'dg') return apiDataGo_(req.path, req.search);
    if (req.k === 'ai') return apiAi_(req);
    if (req.k === 'health') return { status: 200, text: JSON.stringify({ ok: true, backend: 'apps-script', kac: !!prop_('KAC_KEY'), deepseek: !!prop_('DEEPSEEK_API_KEY'), anthropic: !!prop_('ANTHROPIC_API_KEY'), token: !!prop_('ACCESS_TOKEN') }) };
    return { status: 404, text: JSON.stringify({ error: '없는 경로입니다' }) };
  } catch (e) {
    return { status: 502, text: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
}
const prop_ = k => PropertiesService.getScriptProperties().getProperty(k);

// ───────── 파일 (Drive 폴더에서 읽기) ─────────
const MIME_ = { json: 'application/json', txt: 'text/plain', html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gz: 'application/gzip', pdf: 'application/pdf', enc: 'application/octet-stream', wasm: 'application/wasm', svg: 'image/svg+xml', webmanifest: 'application/json' };
function apiFile_(name) {
  const rootId = prop_('ASSET_FOLDER_ID');
  if (!rootId) return { status: 500, text: JSON.stringify({ error: 'ASSET_FOLDER_ID가 설정되지 않았습니다' }) };
  const parts = String(name || '').split('/').filter(Boolean);
  if (!parts.length || parts.some(p => p === '..')) return { status: 400, text: '{"error":"bad path"}' };
  let folder = DriveApp.getFolderById(rootId);
  for (let i = 0; i < parts.length - 1; i++) {
    const it = folder.getFoldersByName(parts[i]);
    if (!it.hasNext()) return { status: 404, text: '' };
    folder = it.next();
  }
  const fn = parts[parts.length - 1], it = folder.getFilesByName(fn);
  if (!it.hasNext()) return { status: 404, text: '' };
  const f = it.next(), ext = (fn.split('.').pop() || '').toLowerCase();
  return { status: 200, mime: MIME_[ext] || 'application/octet-stream', b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

// ───────── 공공데이터포털 중계 ─────────
function apiDataGo_(path, search) {
  path = String(path || '').replace(/^\/(dgk|kac)/, '');
  if (!/^\/(B551177|B551178)\/[A-Za-z0-9_\-\/]+$/.test(path)) return { status: 403, text: '{"error":"허용되지 않은 경로"}' };
  let key = prop_('KAC_KEY') || prop_('DGK_KEY');
  if (!key) return { status: 500, text: '{"error":"KAC_KEY가 설정되지 않았습니다"}' };
  try { if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); } catch (e) { }
  const qs = String(search || '').replace(/^\?/, '').split('&').filter(p => p && !/^servicekey=/i.test(p)).join('&');
  const url = 'https://apis.data.go.kr' + path + '?serviceKey=' + encodeURIComponent(key) + (qs ? '&' + qs : '');
  const cache = CacheService.getScriptCache(), ck = 'dg' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, url)).slice(0, 40);
  const hit = cache.get(ck);
  if (hit) return { status: 200, text: hit };
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  const text = res.getContentText();
  if (res.getResponseCode() === 200 && text.length < 90000) cache.put(ck, text, 120);
  return { status: res.getResponseCode(), text: text };
}

// ───────── AI 요약 (DeepSeek → Claude 순) ─────────
const SYSTEM_PROMPT_ = `너는 민항기 기장을 돕는 NOTAM 해설 도우미다. 각 NOTAM을 자연스러운 한국어로 완전히 옮겨 요약한다.

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
const JSON_RULE_ = '\n출력은 아래 형식의 JSON 하나만 쓴다. 다른 글은 쓰지 않는다.\n{"items":[{"id":"입력 id 그대로","summary":"한국어 요약","uncertain":false}]}';
function apiAi_(req) {
  const tok = prop_('ACCESS_TOKEN');
  if (!tok) return { status: 500, text: '{"error":"ACCESS_TOKEN이 설정되지 않았습니다"}' };
  if (String(req.token || '') !== tok) return { status: 401, text: '{"error":"접근 토큰이 맞지 않습니다"}' };
  let body; try { body = JSON.parse(req.body || '{}'); } catch (e) { return { status: 400, text: '{"error":"JSON 형식이 아닙니다"}' }; }
  const list = Array.isArray(body.notams) ? body.notams : [];
  if (!list.length) return { status: 400, text: '{"error":"notams 배열이 비었습니다"}' };
  if (list.length > MAX_NOTAMS) return { status: 400, text: '{"error":"한 번에 ' + MAX_NOTAMS + '개까지 보낼 수 있습니다"}' };
  const notams = list.map((n, i) => ({ id: String((n && n.id) || 'N' + (i + 1)).slice(0, 40), text: String((n && n.text) || '').slice(0, MAX_CHARS) })).filter(n => n.text.trim());
  const cache = CacheService.getScriptCache(), out = {}, missing = [];
  notams.forEach(n => {
    const ck = 'ai' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, n.text)).slice(0, 40), hit = cache.get(ck);
    if (hit) out[n.id] = Object.assign(JSON.parse(hit), { id: n.id, cached: true }); else missing.push({ id: n.id, text: n.text, ck: ck });
  });
  let provider = 'cache', model = '';
  if (missing.length) {
    const errors = [];
    const order = [['deepseek', prop_('DEEPSEEK_API_KEY'), aiDeepseek_], ['anthropic', prop_('ANTHROPIC_API_KEY'), aiClaude_]].filter(x => x[1]);
    let items = null;
    for (const [name, key, fn] of order) {
      try { const r = fn(key, missing); if (r.items.length) { items = r.items; provider = name; model = r.model; break; } throw new Error('빈 응답'); } catch (e) { errors.push(name + ': ' + e.message); }
    }
    if (!items) return { status: 502, text: JSON.stringify({ error: errors.length ? '모든 AI 실패 — ' + errors.join(' / ') : '사용할 수 있는 AI 키가 없습니다' }) };
    items.forEach(it => {
      const src = missing.find(m => m.id === it.id); if (!src) return;
      const rec = { summary: it.summary, uncertain: it.uncertain, provider: provider, model: model };
      out[src.id] = Object.assign({ id: src.id }, rec, { cached: false });
      try { cache.put(src.ck, JSON.stringify(rec), 21600); } catch (e) { }
    });
  }
  const items = notams.map(n => out[n.id] || { id: n.id, summary: '', uncertain: true, error: '요약 실패' });
  return { status: 200, text: JSON.stringify({ provider: provider, model: model, items: items }) };
}
const userText_ = ns => ns.map(n => '<notam id="' + n.id + '">\n' + n.text + '\n</notam>').join('\n\n');
const clean_ = a => (Array.isArray(a) ? a : []).map(it => ({ id: String((it && it.id) || ''), summary: String((it && it.summary) || ''), uncertain: !!(it && it.uncertain) })).filter(it => it.id && it.summary);
function aiDeepseek_(key, ns) {
  const model = prop_('DEEPSEEK_MODEL') || 'deepseek-flash';
  const res = UrlFetchApp.fetch('https://api.deepseek.com/chat/completions', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ model: model, max_tokens: 8192, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM_PROMPT_ + JSON_RULE_ }, { role: 'user', content: userText_(ns) }] }) });
  if (res.getResponseCode() !== 200) throw new Error('DeepSeek ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  const d = JSON.parse(res.getContentText()), ch = d.choices && d.choices[0];
  let p; try { p = JSON.parse((ch && ch.message && ch.message.content) || ''); } catch (e) { throw new Error(ch && ch.finish_reason === 'length' ? 'DeepSeek 응답이 길어 중간에 잘림' : 'DeepSeek 응답이 JSON이 아님'); }
  return { items: clean_(p.items), model: model };
}
function aiClaude_(key, ns) {
  const model = prop_('ANTHROPIC_MODEL') || 'claude-haiku-5-5';
  const tool = { name: 'record_summaries', description: 'NOTAM별 한국어 요약 결과를 기록한다.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' }, uncertain: { type: 'boolean' } }, required: ['id', 'summary', 'uncertain'] } } }, required: ['items'] } };
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: 8192, system: SYSTEM_PROMPT_, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: userText_(ns) }] }) });
  if (res.getResponseCode() !== 200) throw new Error('Claude ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  const b = (JSON.parse(res.getContentText()).content || []).find(x => x.type === 'tool_use');
  return { items: clean_(b && b.input && b.input.items), model: model };
}
