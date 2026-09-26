// NeonPlay service worker — v5
// • HTML: primero red (así siempre recibes la versión nueva) y caché si no hay señal.
// • Íconos/manifest/fuentes: caché con actualización en segundo plano.
// • /api/* y YouTube: NO se interceptan. Pasar el audio por el service worker
//   rompe las peticiones Range en iPhone y hacía fallar el seek.
const VERSION = 'neonplay-v5';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon.svg'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith('/api/')) return;           // audio y búsqueda: directo a red
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;       // YouTube, letras, etc.

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
