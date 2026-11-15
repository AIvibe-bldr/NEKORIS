// オフラインでも遊べるようにファイルをキャッシュする（通信できるときは常に最新版を取得）
const CACHE = 'neko-chase-v1';
const FILES = ['./', 'index.html', 'manifest.json', 'src/main.js', 'src/world.js', 'src/actors.js',
  'vendor/three.module.min.js', 'vendor/three.core.min.js', 'vendor/RoomEnvironment.js', 'vendor/RoundedBoxGeometry.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
