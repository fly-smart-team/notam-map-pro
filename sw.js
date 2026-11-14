// NOTAM Pro (개인용 AI 버전) — 오프라인 캐시 서비스 워커
// 전략: 온라인이면 최신 페이지를 먼저 받아 바로 보여주고(4초 안에 응답 없으면 저장본), 오프라인이면 저장본
// 배포 버전(notammap)과 같은 도메인을 쓰므로 캐시 이름을 따로 씀
const CACHE = 'notam-pro-v66';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './coad-ko.json', './notam-ko.json', './wx-brief.json'];
const EXTRA = ['./hot/FAA-HOT-2026-27.pdf', './hot/hot-data.json', './twy/index.json', './mel-ko.json', './mel-extra.json', './mel-img/neo-1.jpg', './mel-img/neo-2.jpg', './mel-img/a200-171-1.jpg', './mel-img/a200-171-2.jpg', './mel-img/a200-174-1.jpg', './mel-img/a200-174-2.jpg', './mel-img/a200-195-1.jpg', './mel-img/a200-195-2.jpg', './mel-img/door-neo.jpg', './mel-img/door-a200.jpg', './twy/RCTP.txt', './twy/RKSI.txt', './docs/ZBAA-deicing.html', './docs/ZBAA-deice-pads.jpg', './docs/ZBAA-deice-stop.jpg', './docs/wind-limits.html'];   // 제빙액 HOT 표 (오프라인용, 실패해도 무시)

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
    const res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
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
  // OCR 인식 데이터(./ocr/): 앱 업데이트와 무관한 별도 캐시 — 한 번 받으면 오프라인에서도 사용
  if (url.pathname.includes('/ocr/')) {
    e.respondWith(caches.open('notam-ocr-v1').then(async c => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }));
    return;
  }
  if (req.mode === 'navigate') {
    const scope = new URL(self.registration.scope).pathname;
    let rel = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname.replace(/^\//, '');
    const path = (rel === '' || rel === 'index.html') ? './index.html' : './' + rel;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      // 1순위: 네트워크 (최신 버전 즉시 반영) — 4초 넘으면 저장본
      try {
        const res = await Promise.race([
          fetch(url.pathname + '?v=' + Date.now(), { cache: 'no-store' }),
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
  // 저장 이름은 폴더를 포함한 경로(예: ./hot/hot-data.json) — 예전 방식(파일명만)으로 저장된 것도 찾아 줌
  if (url.pathname.endsWith('.json')) {
    const scope = new URL(self.registration.scope).pathname, rel = './' + (url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname.replace(/^\//, '')), base = './' + url.pathname.split('/').pop();
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(rel, cp)); }
      return res;
    }).catch(async () => {
      const c = await caches.open(CACHE);
      const hit = (await c.match(rel)) || (await c.match(base));
      if (hit) return hit;
      // 폴더 안 데이터(HOT 표·유도로 목록)는 빈 {}를 주면 화면이 깨지므로 '없음'으로 응답
      if (/\/(hot|twy)\//.test(url.pathname)) return new Response('', { status: 504 });
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  })));
});
self.addEventListener('message', e => { if (e.data === 'check-update') e.waitUntil(refresh('./index.html')); });
