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

  // Audio streams (propio proxy /api/stream) y APIs externas — siempre
  // network, nunca cachear. /api/stream es same-origin así que hay que
  // excluirlo a mano o el bloque de "app shell" de abajo lo cachearía,
  // rompiendo las peticiones parciales (Range) que usa el <audio> para el seek.
  const isStreamProxy = url.pathname.startsWith('/api/');
  const isExternal =
    isStreamProxy ||
    url.hostname.includes('nadeko') ||
    url.hostname.includes('invidious') ||
    url.hostname.includes('chocolatemoo') ||
    url.hostname.includes('melmac') ||
    url.hostname.includes('tux.pizza') ||
    url.hostname.includes('protokolla') ||
    url.hostname.includes('private.coffee') ||
    url.hostname.includes('drgnz') ||
    url.hostname.includes('datura') ||
    url.hostname.includes('fdn.fr') ||
    url.hostname.includes('perennialte') ||
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
