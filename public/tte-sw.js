/* Keeps the handheld ticket check working with no network (RRS-F-018).
   The page is network first (fresh when online, cached copy offline); its
   scripts, styles and fonts are cache first. API calls are never cached:
   the chart itself is stored in IndexedDB by the page. */
var CACHE = 'rrs-tte-v2';
var ASSETS = [
  '/tte', '/handheld/app.js', '/handheld/verify.js', '/vendor/html5-qrcode.min.js',
  '/style.css', '/motion.css', '/pickers.css', '/app.js', '/pickers.js', '/favicon.svg',
  '/fonts/atkinson-hyperlegible-latin-400-normal.woff2', '/fonts/atkinson-hyperlegible-latin-700-normal.woff2',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  if (url.pathname === '/tte') {
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      if (res.ok) caches.open(CACHE).then(function (c) { c.put('/tte', copy); });
      return res;
    }).catch(function () { return caches.match('/tte'); }));
    return;
  }
  if (ASSETS.indexOf(url.pathname) >= 0) {
    e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
  }
});
