// Offline support. App files: network first, cache fallback. Map data from the relay: kept for use without a connection.
const SHELL = 'kdrone-shell-v1', DATA = 'kdrone-data';
const FILES = ['./', 'index.html', 'css/app.css', 'lib/leaflet.js', 'lib/leaflet.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png',
  'js/app.js', 'js/config.js', 'js/util.js', 'js/geo.js', 'js/data.js', 'js/settings.js', 'js/check.js', 'js/map.js', 'js/panel.js', 'js/laanc.js', 'js/sun.js', 'js/wx.js', 'js/records.js', 'js/more.js'];

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(FILES.map(f => c.add(f))))); });
self.addEventListener('activate', e => e.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('kdrone-shell-') && n !== SHELL).map(n => caches.delete(n))))])));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (url.hostname.endsWith('workers.dev') && /^\/(faa|tfr)\b/.test(url.pathname)) {
    // Map squares and TFRs: use the network, and fall back to the last copy when offline.
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(DATA).then(c => c.put(req.url, copy)); } return res; })
      .catch(() => caches.match(req.url).then(r => r || Response.error())));
  }
});
