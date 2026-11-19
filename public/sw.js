// 완도뱃길 서비스워커: 항상 네트워크 먼저, 끊기면 마지막으로 받은 화면·자료를 보여 줌
const CACHE = 'wando-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? '/' : url.pathname; // 쿼리 무시
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(key, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>완도뱃길</title><p style="font-family:sans-serif;padding:24px">인터넷에 연결되어 있지 않습니다. 연결 후 다시 열어 주세요.</p>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  })());
});
