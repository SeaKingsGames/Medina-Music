const CACHE_NAME = 'neonplay-v4'; // v4: nuevo proxy propio (ytdl-core) + fallback YouTube
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca cachear:
  // - /api/* (nuestro proxy de audio — cachear rompería el Range/seek y
  //   serviría audio viejo)
  // - Cualquier dominio externo (YouTube, Google APIs, lyrics.ovh, fuentes,
  //   etc.) — siempre red, así no dependemos de mantener una lista manual
  //   de hostnames que se desactualiza.
  const isSameOrigin = url.origin === self.location.origin;
  const isStreamProxy = url.pathname.startsWith('/api/');

  if (!isSameOrigin || isStreamProxy) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // App shell (mismo origen) — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
