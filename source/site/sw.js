// FABLE offline cache. Version bump = new deploy; old caches are cleared on activate.
const VERSION = 'fable-__BUILD_ID__';
const SITE_ASSETS = []; // GENERATED_BY_BUILD
const GAME_ASSETS = []; // GENERATED_BY_BUILD
const CORE = [...new Set(['./', './index.html', './play.html', './privacy.html', './style.css', './font.css', './manifest.webmanifest', './assets/logo.svg', './assets/icon.svg', './game/index.html', ...SITE_ASSETS, ...GAME_ASSETS])];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first, caching successful responses so a new deploy appears immediately and later works offline.
  // Never answer a missing script/image with the HTML play page: that masks a real offline cache miss.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('./play.html') : Response.error()))));
});
