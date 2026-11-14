const CACHE_NAME = 'masar-v6';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SKIP = ['googleapis.com', 'firebaseio.com', 'gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (SKIP.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return;
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const root = await caches.match('./index.html') || await caches.match('./');
        if (root) return root;
      }
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
