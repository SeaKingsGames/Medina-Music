const CACHE_NAME = 'neonplay-v3';
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

  // Audio streams y APIs externas — siempre network, nunca cachear
  const isExternal =
    url.hostname.includes('nadeko') ||
    url.hostname.includes('invidious') ||
    url.hostname.includes('artemislena') ||
    url.hostname.includes('flokinet') ||
    url.hostname.includes('nerdvpn') ||
    url.hostname.includes('privacyredirect') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('lyrics.ovh') ||
    url.hostname.includes('fonts.g');

  if (isExternal) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // App shell — cache first
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
