// NOTAM Pro (개인용 AI 버전) — 오프라인 캐시 서비스 워커
// 전략: 온라인이면 최신 페이지를 먼저 받아 바로 보여주고(4초 안에 응답 없으면 저장본), 오프라인이면 저장본
// 배포 버전(notammap)과 같은 도메인을 쓰므로 캐시 이름을 따로 씀
const CACHE = 'notam-pro-v5';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './coad-ko.json', './notam-ko.json', './wx-brief.json'];
const EXTRA = [];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    await Promise.all(EXTRA.map(u => c.add(u).catch(() => { })));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('notam-pro-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function notify(msg) {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage(msg));
}
// 페이지 새 버전을 받아 저장본과 다르면 교체 (index.html이면 화면에 알림)
async function refresh(path) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) return;
    const c = await caches.open(CACHE);
    const old = await c.match(path);
    const fresh = await res.clone().text();
    const prev = old ? await old.text() : '';
    if (fresh !== prev) {
      const mk = () => new Response(fresh, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      await c.put(path, mk());
      if (path === './index.html') await c.put('./', mk());
      if (prev) notify({ type: 'updated', path });
    }
  } catch (err) { /* 오프라인: 저장본 유지 */ }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 기상(METAR)·지도 타일 등 외부 요청은 그대로 통과
  if (req.mode === 'navigate') {
    const scope = new URL(self.registration.scope).pathname;
    let rel = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname.replace(/^\//, '');
    const path = (rel === '' || rel === 'index.html') ? './index.html' : './' + rel;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      // 1순위: 네트워크 (최신 버전 즉시 반영) — 4초 넘으면 저장본
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
        if (res && res.ok) {
          const body = await res.clone().text();
          const mk = () => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          e.waitUntil((async () => { await c.put(path, mk()); if (path === './index.html') await c.put('./', mk()); })());
          return res;
        }
      } catch (err) { /* 오프라인·느린 망: 저장본 사용 */ }
      const hit = await c.match(path);
      if (hit) { e.waitUntil(refresh(path)); return hit; }
      return new Response('오프라인 저장본이 없습니다. 온라인에서 한 번 열어 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }
  // 데이터 파일(coad-ko.json 등): 온라인이면 최신, 오프라인이면 저장본
  if (url.pathname.endsWith('.json')) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./' + url.pathname.split('/').pop(), cp)); }
      return res;
    }).catch(() => caches.match('./' + url.pathname.split('/').pop()).then(hit => hit || new Response('{}', { headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
self.addEventListener('message', e => { if (e.data === 'check-update') e.waitUntil(refresh('./index.html')); });
