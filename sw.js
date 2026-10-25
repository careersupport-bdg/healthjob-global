/* HealthJob Global service worker.
 * Strategy: precache the static shell; network-first for pages; stale-while-revalidate for static assets.
 * NEVER cached: Supabase/API calls, anything not same-origin GET, admin page/script (private area).
 */
var VERSION = 'hj-v1';
var SCOPE = self.registration.scope; // e.g. https://careersupport-bdg.github.io/jobs/
var SHELL = [
  './', 'index.html', 'offline.html', 'manifest.webmanifest',
  'assets/css/style.css', 'assets/js/config.js', 'assets/js/supabase.js',
  'assets/js/app.js', 'assets/js/jobs.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isPrivate(url) {
  return /\/admin(\.html|\.js)?(\/|$|\?)/.test(url.pathname) || url.pathname.indexOf('/admin') !== -1;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // Supabase, CDN: browser handles it
  if (url.href.indexOf(SCOPE) !== 0) return;
  if (isPrivate(url)) return;                            // admin: never cached

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('index.html') || caches.match('offline.html'); })
          .then(function (m) { return m || caches.match('offline.html'); });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
