// オフラインでも遊べるようにファイルをキャッシュする（通信できるときは常に最新版を取得）
const CACHE = 'neko-chase-v3';
const FILES = ['./', 'index.html', 'manifest.json', 'src/main.js', 'src/world.js', 'src/actors.js',
  'vendor/three.module.min.js', 'vendor/three.core.min.js', 'vendor/RoomEnvironment.js', 'vendor/RoundedBoxGeometry.js',
  'vendor/GLTFLoader.js', 'vendor/BufferGeometryUtils.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  'assets/glb/ArmChair_01.glb',
  'assets/glb/ClassicConsole_01.glb',
  'assets/glb/ClassicNightstand_01.glb',
  'assets/glb/GothicBed_01.glb',
  'assets/glb/WoodenTable_01.glb',
  'assets/glb/dining_chair_02.glb',
  'assets/glb/drawer_cabinet.glb',
  'assets/glb/modern_coffee_table_01.glb',
  'assets/glb/potted_plant_02.glb',
  'assets/glb/sofa_02.glb',
  'assets/glb/steel_frame_shelves_01.glb',
  'assets/glb/street_rat.glb',
  'assets/sky/suburban_garden.jpg',
  'assets/textures/denim_fabric/denim_fabric_diff_1k.jpg',
  'assets/textures/denim_fabric/denim_fabric_nor_gl_1k.jpg',
  'assets/textures/floor_tiles_06/floor_tiles_06_arm_1k.jpg',
  'assets/textures/floor_tiles_06/floor_tiles_06_diff_1k.jpg',
  'assets/textures/floor_tiles_06/floor_tiles_06_nor_gl_1k.jpg',
  'assets/textures/laminate_floor_02/laminate_floor_02_arm_1k.jpg',
  'assets/textures/laminate_floor_02/laminate_floor_02_diff_1k.jpg',
  'assets/textures/laminate_floor_02/laminate_floor_02_nor_gl_1k.jpg',
  'assets/textures/painted_plaster_wall/painted_plaster_wall_arm_1k.jpg',
  'assets/textures/painted_plaster_wall/painted_plaster_wall_nor_gl_1k.jpg'];
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
