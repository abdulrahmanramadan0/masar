/* مسار - Service Worker
   غيّر رقم الإصدار هنا عند كل نشر لتُحذف الكاشات القديمة تلقائياً. */
const CACHE_NAME = 'masar-v8';

/* ملفات التطبيق التي تُخزَّن مسبقاً للعمل دون إنترنت */
const APP_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

/* خوادم لا يتدخل فيها الـ Service Worker إطلاقاً (Firebase / Google) */
const BYPASS_HOSTS = ['googleapis.com', 'firebaseio.com', 'gstatic.com', 'firebaseapp.com'];
const isBypass = (host) => BYPASS_HOSTS.some((h) => host === h || host.endsWith('.' + h));

/* مفتاح الكاش بدون معاملات الاستعلام (?_=… أو ?u=…) كي لا تتراكم نسخ كثيرة */
const keyFor = (url) => new Request(url.origin + url.pathname);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_FILES.map((f) =>
          fetch(new Request(f, { cache: 'reload' }))
            .then((res) => (res && res.ok ? cache.put(keyFor(new URL(f, self.location)), res) : null))
            .catch(() => null)
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isBypass(url.hostname)) return;          /* Firebase / Google: مباشرة للشبكة */
  if (url.origin !== self.location.origin) return; /* أي نطاق خارجي آخر: بلا تدخل */

  event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const key = keyFor(url);
  try {
    /* الشبكة أولاً مع تجاوز كاش المتصفح لضمان أحدث نسخة من GitHub */
    const fresh = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-store' }) : new Request(req, { cache: 'no-store' }));
    if (fresh && fresh.ok && fresh.type === 'basic') {
      const copy = fresh.clone();
      caches.open(CACHE_NAME).then((c) => c.put(key, copy)).catch(() => {});
    }
    return fresh;
  } catch (err) {
    /* لا إنترنت: نرجع للنسخة المحفوظة */
    const cached = await caches.match(key);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const page = (await caches.match(keyFor(new URL('./index.html', self.location)))) || (await caches.match(keyFor(new URL('./', self.location))));
      if (page) return page;
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/* ===== إشعارات الهاتف (Push) ===== */
self.addEventListener('push', (event) => {
  let j = {};
  try { j = event.data ? event.data.json() : {}; } catch (e) { try { j = { body: event.data.text() }; } catch (e2) {} }
  const d = Object.assign({}, j.notification || {}, j.data || {});
  const title = String(d.title || 'مسار').slice(0, 100);
  const opts = {
    body: String(d.body || '').slice(0, 300),
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    silent: false,
    renotify: true,
    tag: 'masar-' + Date.now(),
    data: { url: d.url || './' }
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push' })))
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = new URL('./', self.registration.scope).href;
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope);
    if (u.origin === self.location.origin) target = u.href;
  } catch (e) {}
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});
