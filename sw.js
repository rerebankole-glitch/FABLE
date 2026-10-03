// FABLE offline cache. Version bump = new deploy; old caches are cleared on activate.
const VERSION = 'fable-3216cff90b09';
const SITE_ASSETS = ["./assets/apple-touch-icon.png","./assets/icon-192.png","./assets/icon-512-maskable.png","./assets/icon-512.png","./assets/icon.svg","./assets/logo.svg","./assets/og.jpg","./assets/shot-creative.webp","./assets/shot-inventory.webp","./assets/shot-mining.webp","./assets/shot-night.webp","./assets/shot-overworld.webp","./assets/shot-sunset.webp","./assets/shot-title.webp"]; // GENERATED_BY_BUILD
const GAME_ASSETS = ["./game/assets/index-CSim0n-3.js","./game/assets/shot-creative-DGnopl4j.webp","./game/assets/shot-mining-DBJ7sEQE.webp","./game/assets/shot-night-DlpwegjH.webp","./game/assets/shot-overworld-BM6FFXFm.webp","./game/assets/shot-sunset-C-odWxyw.webp","./game/assets/style-vTBHnqgR.css"]; // GENERATED_BY_BUILD
const CORE = [...new Set(['./', './index.html', './play.html', './privacy.html', './style.css', './font.css', './manifest.webmanifest', './assets/logo.svg', './assets/icon.svg', './game/index.html', ...SITE_ASSETS, ...GAME_ASSETS])];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Network first, caching successful responses so a new deploy appears immediately and later works offline.
  // Never answer a missing script/image with the HTML play page: that masks a real offline cache miss.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('./play.html') : Response.error()))));
});
