// FABLE offline cache. Version bump = new deploy; old caches are cleared on activate.
const VERSION = 'fable-7.6.0';
const CORE = ['./', './index.html', './play.html', './style.css', './font.css', './manifest.webmanifest', './assets/logo.svg', './assets/icon.svg', './game/index.html'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // network first (so a new deploy shows up immediately), cache fallback (so the game keeps working offline)
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./play.html'))));
});
