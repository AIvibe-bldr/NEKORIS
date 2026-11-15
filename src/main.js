// ねこハウスチェイス — ゲーム本体
import * as THREE from '../vendor/three.module.min.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildWorld, boxes, resolveCircle, groundAt, ceilingAt, rayT, los, mouseBlocked, mouseCovered, NavGrid, BOUNDS, WALL_H } from './world.js';
import { buildCat, buildDog, buildMouse, buildPerson, buildVacuum, animateQuad, animateMouse, animatePerson, makeAlert, makeBlob, setFur } from './actors.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAngle = (a, b, t) => a + angDiff(b, a) * Math.min(1, t);
const rand = (a, b) => a + Math.random() * (b - a);

// ───────────── 描画 ─────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const coarse = matchMedia('(pointer: coarse)').matches;
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fc0f0);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.38;
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 120);

scene.add(new THREE.HemisphereLight(0xfff3e0, 0x8a7460, 0.3));
// 太陽は南西の空にあり、窓から室内に差し込む
const sun = new THREE.DirectionalLight(0xfff0d8, 4.2);
sun.position.set(-11, 15, 13); sun.castShadow = true;
sun.shadow.mapSize.setScalar(coarse ? 1536 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 46 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

buildWorld(scene);
const navDog = new NavGrid(0.28, 0.55), navMan = new NavGrid(0.3, 1.7);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 80 : 62;                       // 縦持ちでは上下を広く写す
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 300)); resize();

// 端末が重いときは解像度を自動で下げる
let perfT = 0, perfN = 0, furShown = true;
function adaptQuality(rawDt) {
  perfT += rawDt; perfN++;
  if (perfN < 90) return;
  const avg = perfT / perfN; perfT = perfN = 0;
  if (avg < 0.024) return;
  if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
  else if (furShown && avg > 0.03) { furShown = false; setFur(false); }          // それでも重ければ毛並みを省く
  else if (pixelRatio > 0.75) { pixelRatio = 0.75; renderer.setPixelRatio(pixelRatio); resize(); }
}

// ───────────── 音 ─────────────
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
function tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, freq, vol = 0.2, delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = vol;
  s.connect(f).connect(g).connect(ac.destination); s.start(t);
}
const sfx = {
  meow() { tone('sawtooth', 620, 980, 0.16, 0.07); tone('sawtooth', 980, 560, 0.3, 0.07, 0.15); },
  squeak() { tone('sine', 2400, 3600, 0.07, 0.12); tone('sine', 3200, 2200, 0.09, 0.1, 0.08); },
  bark(vol = 1) { for (const d of [0, 0.2]) { tone('square', 210, 120, 0.12, 0.1 * vol, d); noise(0.12, 600, 0.25 * vol, d); } },
  hiss() { noise(0.5, 4500, 0.3); tone('sawtooth', 500, 250, 0.4, 0.05); },
  jump() { tone('sine', 300, 520, 0.09, 0.05); },
  hey() { tone('triangle', 330, 260, 0.14, 0.14); tone('triangle', 260, 200, 0.2, 0.14, 0.16); },
  bump() { tone('square', 140, 70, 0.12, 0.1); },
  clear() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.12, i * 0.13)); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.3, 0.12, i * 0.2)); },
};

// ───────────── 入力 ─────────────
const input = { x: 0, y: 0, dash: false, jumpBuf: 0, camDragT: 9 };
const keys = new Set();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && !e.repeat) input.jumpBuf = 0.15;
  if ((e.code === 'Enter') && game.state !== 'play') $('oBtn').click();
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let camYaw = Math.PI / 2, camPitch = 0.3, camDist = 1.7;
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 };
const stickEl = $('stick'), knob = stickEl.firstElementChild;
canvas.addEventListener('pointerdown', (e) => {
  if (game.state !== 'play') return;
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45 && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
    Object.assign(stickEl.style, { left: e.clientX + 'px', top: e.clientY + 'px', bottom: 'auto', opacity: 0.9 });
  } else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === stick.id) {
    let dx = (e.clientX - stick.ox) / 50, dy = (e.clientY - stick.oy) / 50; const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    stick.x = dx; stick.y = -dy; knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
  } else if (e.pointerId === look.id) {
    const k = e.pointerType === 'touch' ? 0.007 : 0.005;
    camYaw -= (e.clientX - look.x) * k; camPitch = Math.max(0.08, Math.min(1.15, camPitch + (e.clientY - look.y) * k * 0.7));
    look.x = e.clientX; look.y = e.clientY; input.camDragT = 0;
  }
});
const pUp = (e) => {
  if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.style.opacity = ''; }
  if (e.pointerId === look.id) look.id = null;
};
canvas.addEventListener('pointerup', pUp); canvas.addEventListener('pointercancel', pUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
let touchDash = false;
const hold = (el, down, up) => {
  let px = 0, py = 0;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); px = e.clientX; py = e.clientY; down(); });
  el.addEventListener('pointermove', (e) => {      // ボタンを押したまま指をずらすと視点が回る
    if (!el.classList.contains('on')) return;
    camYaw -= (e.clientX - px) * 0.007; camPitch = Math.max(0.08, Math.min(1.15, camPitch + (e.clientY - py) * 0.005));
    px = e.clientX; py = e.clientY; input.camDragT = 0;
  });
  const u = () => { el.classList.remove('on'); up && up(); };
  el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('contextmenu', (e) => e.preventDefault());
};
hold($('bJump'), () => { input.jumpBuf = 0.15; });
hold($('bDash'), () => { touchDash = true; }, () => { touchDash = false; });

function readInput(dt) {
  let x = stick.x, y = stick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  input.x = x; input.y = y;
  input.dash = touchDash || keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (keys.has('KeyQ')) { camYaw += dt * 2.2; input.camDragT = 0; }
  if (keys.has('KeyE')) { camYaw -= dt * 2.2; input.camDragT = 0; }
  input.jumpBuf -= dt; input.camDragT += dt;
}

// ───────────── ゲーム状態 ─────────────
const CAT_H = 0.28, CAT_R = 0.16, SPAWN = { x: -7.4, z: 2 };
const game = { state: 'title', level: 1, score: 0, lives: 5, time: 0, mice: [], dogs: [], people: [], vac: null, caught: 0 };
const cat = { x: SPAWN.x, y: 0, z: SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI / 2, onGround: true, coyote: 0, stamina: 1, tired: false, inv: 0, stun: 0, dashing: false, model: buildCat() };
scene.add(cat.model.group);
const catBlob = makeBlob(0.3); catBlob.scale.set(0.8, 1.25, 1); scene.add(catBlob);

function randFree(minCatDist = 0) {
  for (let i = 0; i < 200; i++) {
    const x = rand(BOUNDS.x0 + 0.5, BOUNDS.x1 - 0.5), z = rand(BOUNDS.z0 + 0.5, BOUNDS.z1 - 0.5);
    if (navMan.isFree(x, z) && Math.hypot(x - cat.x, z - cat.z) >= minCatDist) return { x, z };
  }
  return { x: 5, z: 2 };
}

function clearActors() {
  for (const a of [...game.mice, ...game.dogs, ...game.people]) scene.remove(a.model.group);
  if (game.vac) scene.remove(game.vac.mesh);
  game.mice = []; game.dogs = []; game.people = []; game.vac = null;
}
function resetCat() {
  Object.assign(cat, { x: SPAWN.x, y: 0, z: SPAWN.z, vx: 0, vy: 0, vz: 0, yaw: Math.PI / 2, stamina: 1, tired: false, stun: 0, onGround: true });
  camYaw = Math.PI / 2;
}
function startLevel(n) {
  clearActors(); resetCat(); cat.inv = 2;
  game.level = n; game.time = 0; game.caught = 0;
  const nm = Math.min(12, 4 + n), nd = n >= 4 ? 2 : 1, np = n >= 5 ? 3 : n >= 2 ? 2 : 1;
  for (let i = 0; i < nm; i++) {
    const p = randFree(5), model = buildMouse();
    game.mice.push({ ...p, yaw: rand(0, TAU), tx: p.x, tz: p.z, wt: 0, pause: rand(0, 2), fleeT: 0, fs: Math.min(4.2, 3.3 + n * 0.1), spd: 0, model });
    const bl = makeBlob(0.11, 0.35); bl.position.y = 0.011; model.group.add(bl);
    scene.add(model.group);
  }
  const dogStart = [{ x: 8.9, z: 0.2 }, { x: 7.5, z: 5 }];
  for (let i = 0; i < nd; i++) {
    const model = buildDog(i), alert = makeAlert(); alert.position.y = 0.95; model.group.add(alert);
    const bl = makeBlob(0.55); bl.scale.set(0.8, 1.3, 1); bl.position.y = 0.011; model.group.add(bl);
    game.dogs.push({ ...dogStart[i], yaw: Math.PI, r: 0.2, yLo: 0.15, yHi: 0.55, state: 'patrol', path: null, pi: 0, wait: 3 + i * 2, ignore: 0, lost: 0, repath: 0, barkT: 0, giveup: 0, timer: 0, lx: 0, lz: 0, spd: 0, cs: Math.min(5.2, 4.1 + n * 0.15), model, alert });
    scene.add(model.group);
  }
  const manStart = [{ x: 5, z: -1.5 }, { x: -6, z: 5 }, { x: 1.5, z: 5 }];
  for (let i = 0; i < np; i++) {
    const model = buildPerson(i + n), alert = makeAlert(); alert.position.y = 1.95; alert.scale.setScalar(0.32); model.group.add(alert);
    const bl = makeBlob(0.42, 0.4); bl.position.y = 0.011; model.group.add(bl);
    game.people.push({ ...manStart[i], yaw: 0, r: 0.2, yLo: 0.15, yHi: 1.7, state: 'walk', path: null, pi: 0, wait: 1 + i, cool: 0, timer: 0, repath: 0, spd: 0, cs: Math.min(3.1, 2.5 + n * 0.08), model, alert });
    scene.add(model.group);
  }
  game.vac = { x: 0, z: 2, dir: 0.4, mesh: buildVacuum(), turn: 0 }; { const bl = makeBlob(0.26, 0.45); bl.position.y = 0.011; game.vac.mesh.add(bl); } scene.add(game.vac.mesh);
  game.state = 'play'; $('overlay').classList.add('hide');
  showMsg(`ステージ ${n}　ネズミを ${nm} 匹つかまえよう！`, 2.6);
}

// ───────────── HUD ─────────────
let msgT = 0;
function showMsg(t, dur = 1.6) { const m = $('msg'); m.textContent = t; m.classList.add('on'); msgT = dur; }
const hudCache = {};
function setText(id, t) { if (hudCache[id] !== t) { hudCache[id] = t; $(id).textContent = t; } }
function updateHud(dt) {
  setText('sLives', '❤️ ' + game.lives); setText('sMice', `🐭 のこり ${game.mice.length}`);
  setText('sScore', `スコア ${game.score}`); setText('sLvl', `ステージ ${game.level}`);
  $('stam').firstElementChild.style.transform = `scaleX(${cat.stamina.toFixed(3)})`;
  $('stam').classList.toggle('tired', cat.tired);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').classList.remove('on'); }
}
const map = $('map'), mg = map.getContext('2d'), MS = map.width / 20;
const mapBg = document.createElement('canvas'); mapBg.width = map.width; mapBg.height = map.height;
{
  const g = mapBg.getContext('2d');
  g.fillStyle = 'rgba(214,190,150,.5)'; g.fillRect(0, 0, map.width, map.height);
  for (const pass of [0, 1]) for (const b of boxes) {
    if (!!b.sight !== !!pass || b.y0 > 1) continue;
    g.fillStyle = pass ? '#2b221a' : 'rgba(110,84,56,.75)';
    g.fillRect((b.x0 + 10) * MS, (b.z0 + 7) * MS, (b.x1 - b.x0) * MS, (b.z1 - b.z0) * MS);
  }
}
function drawMap() {
  mg.clearRect(0, 0, map.width, map.height); mg.drawImage(mapBg, 0, 0);
  const dot = (a, c, r) => { mg.fillStyle = c; mg.beginPath(); mg.arc((a.x + 10) * MS, (a.z + 7) * MS, r, 0, TAU); mg.fill(); };
  for (const m of game.mice) dot(m, '#fff', 3.2);
  if (game.vac) dot(game.vac, '#666', 3);
  for (const p of game.people) dot(p, p.state === 'chase' ? '#ff5a4a' : '#5aa2ff', 5.5);
  for (const d of game.dogs) dot(d, d.state === 'chase' ? '#ff2a1a' : '#b5651d', 5.5);
  mg.save(); mg.translate((cat.x + 10) * MS, (cat.z + 7) * MS); mg.rotate(-cat.yaw);
  mg.fillStyle = '#ffb13d'; mg.strokeStyle = '#2a1a08'; mg.lineWidth = 1.5;
  mg.beginPath(); mg.moveTo(0, 9); mg.lineTo(6, -6); mg.lineTo(0, -3); mg.lineTo(-6, -6); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
}

// ───────────── ネコ ─────────────
function updateCat(dt) {
  const c = cat;
  c.inv = Math.max(0, c.inv - dt); c.stun = Math.max(0, c.stun - dt);
  let mx = input.x, my = input.y, mag = Math.hypot(mx, my);
  if (c.stun > 0) mx = my = mag = 0;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const dx = fx * my - fz * mx, dz = fz * my + fx * mx;
  c.dashing = input.dash && !c.tired && mag > 0.3;
  if (c.dashing) { c.stamina -= dt / 3.5; if (c.stamina <= 0) { c.stamina = 0; c.tired = true; } }
  else { c.stamina = Math.min(1, c.stamina + dt / 5); if (c.stamina > 0.3) c.tired = false; }
  const sp = c.dashing ? 5.8 : 3.3;
  if (c.stun <= 0) {
    const k = Math.min(1, dt * (c.onGround ? 12 : 4));
    c.vx += (dx * sp - c.vx) * k; c.vz += (dz * sp - c.vz) * k;
  } else { c.vx *= 1 - Math.min(1, dt * 3); c.vz *= 1 - Math.min(1, dt * 3); }
  if (mag > 0.1) c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), dt * 12);
  c.coyote = c.onGround ? 0.1 : c.coyote - dt;
  if (input.jumpBuf > 0 && c.coyote > 0 && c.stun <= 0) { c.vy = 5.7; c.onGround = false; c.coyote = 0; input.jumpBuf = 0; sfx.jump(); }

  c.x += c.vx * dt; c.z += c.vz * dt;
  resolveCircle(c, CAT_R, c.y + 0.02, c.y + CAT_H);
  c.vy -= 14 * dt;
  let ny = c.y + c.vy * dt;
  const ceil = ceilingAt(c.x, c.z, 0.1, c.y + CAT_H);
  if (ny + CAT_H > ceil) { ny = ceil - CAT_H; if (c.vy > 0) c.vy = 0; }
  const ground = groundAt(c.x, c.z, 0.06, c.y);
  if (ny <= ground && c.vy <= 0) { ny = ground; c.vy = 0; c.onGround = true; } else c.onGround = false;
  c.y = ny;

  const hs = Math.hypot(c.vx, c.vz), g = c.model.group;
  g.position.set(c.x, c.y, c.z); g.rotation.y = c.yaw;
  const gy = groundAt(c.x, c.z, 0.06, c.y);
  catBlob.position.set(c.x, gy + 0.012, c.z); catBlob.rotation.z = c.yaw; catBlob.material.opacity = 0.45 * Math.max(0.25, 1 - (c.y - gy) * 0.8);
  g.visible = c.inv <= 0 || Math.floor(c.inv * 12) % 2 === 0;
  animateQuad(c.model, dt, hs, { run: hs > 4.2, air: !c.onGround, vy: c.vy });
}

function updateCamera(dt, title) {
  if (title) camYaw += dt * 0.12;
  else if (input.camDragT > 1.2 && Math.hypot(cat.vx, cat.vz) > 0.5) {
    const d = angDiff(cat.yaw, camYaw);
    if (Math.abs(d) < 2.5) camYaw += d * Math.min(1, dt * 1.4);
  }
  const tx = cat.x, ty = cat.y + 0.3, tz = cat.z, D = 1.7;
  const cp = Math.cos(camPitch), dx = -Math.sin(camYaw) * cp, dy = Math.sin(camPitch), dz = -Math.cos(camYaw) * cp;
  const t = rayT(tx, tz, tx + dx * (D + 0.25), tz + dz * (D + 0.25), true, cat.y);
  const want = Math.max(0.3, Math.min(D, (D + 0.25) * t - 0.25));
  camDist = want < camDist ? want : camDist + (want - camDist) * Math.min(1, dt * 3);
  camera.position.set(tx + dx * camDist, Math.min(WALL_H - 0.15, ty + dy * camDist + (D - camDist) * 0.18), tz + dz * camDist);
  camera.lookAt(tx, ty + 0.08, tz);
}

// ───────────── ネズミ ─────────────
function updateMouse(m, dt) {
  const dx = m.x - cat.x, dz = m.z - cat.z, dist = Math.hypot(dx, dz);
  if (dist < (cat.y < 0.6 ? 2.8 : 1.2) && los(m.x, m.z, cat.x, cat.z)) m.fleeT = 0.8;
  let sp = 0;
  if (m.fleeT > 0) {
    m.fleeT -= dt;
    const base = Math.atan2(dx, dz); let best = base, bs = -99;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
      const a = base + off, sx = Math.sin(a), sz = Math.cos(a);
      const s = Math.cos(off) - (mouseBlocked(m.x + sx * 0.3, m.z + sz * 0.3) ? 2 : 0) - (mouseBlocked(m.x + sx * 0.7, m.z + sz * 0.7) ? 1 : 0) + Math.cos(angDiff(a, m.yaw)) * 0.35;
      if (s > bs) { bs = s; best = a; }
    }
    m.yaw = lerpAngle(m.yaw, best, dt * 14); sp = m.fs; m.pause = 0; m.wt = 0;
  } else if (m.pause > 0) m.pause -= dt;
  else {
    const tx = m.tx - m.x, tz = m.tz - m.z; m.wt -= dt;
    if (Math.hypot(tx, tz) < 0.15 || m.wt <= 0) {
      const a = rand(0, TAU), d = rand(0.8, 3), nx = m.x + Math.sin(a) * d, nz = m.z + Math.cos(a) * d;
      if (!mouseBlocked(nx, nz) && los(m.x, m.z, nx, nz)) { m.tx = nx; m.tz = nz; m.wt = 4; m.pause = Math.random() < 0.5 ? rand(0.3, 1.8) : 0; }
    } else { m.yaw = lerpAngle(m.yaw, Math.atan2(tx, tz), dt * 8); sp = 0.9; }
  }
  m.x += Math.sin(m.yaw) * sp * dt; m.z += Math.cos(m.yaw) * sp * dt;
  resolveCircle(m, 0.05, 0, 0.08);
  m.spd = sp;
  m.model.group.position.set(m.x, 0, m.z); m.model.group.rotation.y = m.yaw;
  animateMouse(m.model, dt, sp);
  return dist < 0.42 && cat.y < 0.3 && cat.stun <= 0 && !mouseCovered(m.x, m.z);
}

// ───────────── イヌ・人（経路追従） ─────────────
function setPath(a, nav, x, z) { a.path = nav.path(a.x, a.z, x, z); a.pi = 0; }
function follow(a, nav, speed, dt) {
  if (!a.path || a.pi >= a.path.length) { a.spd = 0; return true; }
  let k = Math.min(a.path.length - 1, a.pi + 6);
  for (; k > a.pi; k--) if (nav.visible(a.x, a.z, a.path[k].x, a.path[k].z)) break;
  a.pi = k;
  const t = a.path[k], dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
  if (d < 0.15) { a.pi++; return a.pi >= a.path.length; }
  steer(a, dx / d, dz / d, Math.min(speed, d / dt), dt);
  return false;
}
function steer(a, ux, uz, speed, dt) {
  const ty = Math.atan2(ux, uz);
  a.yaw = lerpAngle(a.yaw, ty, dt * 10);
  const turn = Math.max(0.25, Math.cos(angDiff(ty, a.yaw)));
  a.x += ux * speed * turn * dt; a.z += uz * speed * turn * dt; a.spd = speed * turn;
  resolveCircle(a, a.r, a.yLo, a.yHi);
}
function canSee(a, range, near) {
  const dx = cat.x - a.x, dz = cat.z - a.z, dist = Math.hypot(dx, dz);
  if (cat.inv > 0 || dist > range) return false;
  const front = Math.cos(angDiff(Math.atan2(dx, dz), a.yaw)) > -0.15;
  return (front || dist < near) && los(a.x, a.z, cat.x, cat.z);
}

function updateDog(d, dt) {
  const dx = cat.x - d.x, dz = cat.z - d.z, dist = Math.hypot(dx, dz);
  d.ignore = Math.max(0, d.ignore - dt);
  const sees = d.ignore <= 0 && canSee(d, 8, 2.5);
  let wag = false;
  if (d.state === 'patrol') {
    if (sees) { d.state = 'chase'; d.lost = 0; d.repath = 0; d.giveup = 0; d.alert.visible = true; sfx.bark(); showMsg('イヌに見つかった！ 高いところへ逃げろ！', 1.6); }
    else if (follow(d, navDog, 1.4, dt)) { d.wait -= dt; if (d.wait <= 0) { const p = randFree(); setPath(d, navDog, p.x, p.z); d.wait = rand(1, 3.5); } }
  } else if (d.state === 'chase') {
    if (sees) { d.lost = 0; d.lx = cat.x; d.lz = cat.z; } else d.lost += dt;
    if (d.lost > 1.5 || cat.inv > 0) { d.state = 'search'; setPath(d, navDog, d.lx, d.lz); d.timer = 2.5; }
    else if (cat.y >= 0.6 && dist < 1.2) {            // 高い所にいて届かない → 吠える
      d.spd = 0; d.yaw = lerpAngle(d.yaw, Math.atan2(dx, dz), dt * 8); wag = true;
      d.barkT -= dt; if (d.barkT <= 0) { sfx.bark(0.7); d.barkT = 1; }
      d.giveup += dt; if (d.giveup > 6) { d.state = 'patrol'; d.ignore = 7; d.alert.visible = false; d.path = null; d.wait = 0; }
    } else if (sees && dist < 1.4 && cat.y < 0.6) steer(d, dx / dist, dz / dist, d.cs, dt);
    else { d.repath -= dt; if (d.repath <= 0) { setPath(d, navDog, d.lx, d.lz); d.repath = 0.3; } follow(d, navDog, d.cs, dt); }
  } else {                                             // search
    if (sees) { d.state = 'chase'; d.lost = 0; d.giveup = 0; sfx.bark(0.7); }
    else if (follow(d, navDog, 2.8, dt)) { d.yaw += dt * 2.4; d.timer -= dt; if (d.timer <= 0) { d.state = 'patrol'; d.alert.visible = false; d.path = null; d.wait = 0; } }
  }
  d.model.group.position.set(d.x, 0, d.z); d.model.group.rotation.y = d.yaw;
  animateQuad(d.model, dt, d.spd, { run: d.spd > 3, wag, alert: d.state !== 'patrol' });
  return cat.inv <= 0 && dist < 0.6 && cat.y < 0.6;
}

function updatePerson(p, dt) {
  const dx = cat.x - p.x, dz = cat.z - p.z, dist = Math.hypot(dx, dz);
  p.cool = Math.max(0, p.cool - dt);
  if (p.state === 'walk') {
    if (p.cool <= 0 && canSee(p, 4.2, 1.2)) { p.state = 'chase'; p.timer = 5; p.repath = 0; p.alert.visible = true; sfx.hey(); showMsg('「こらっ、待ちなさい！」', 1.4); }
    else if (follow(p, navMan, 1.25, dt)) { p.wait -= dt; if (p.wait <= 0) { const t = randFree(); setPath(p, navMan, t.x, t.z); p.wait = rand(1.5, 5); } }
  } else {
    p.timer -= dt;
    if (p.timer <= 0 || cat.inv > 0) { p.state = 'walk'; p.cool = 6; p.alert.visible = false; p.path = null; p.wait = 1; }
    else if (dist < 1.3 && los(p.x, p.z, cat.x, cat.z)) { if (dist > 0.3) steer(p, dx / dist, dz / dist, p.cs, dt); }
    else { p.repath -= dt; if (p.repath <= 0) { setPath(p, navMan, cat.x, cat.z); p.repath = 0.35; } follow(p, navMan, p.cs, dt); }
  }
  p.model.group.position.set(p.x, 0, p.z); p.model.group.rotation.y = p.yaw;
  animatePerson(p.model, dt, p.spd, p.state === 'chase');
  return cat.inv <= 0 && dist < 0.48 && cat.y < 1.3;
}

function updateVacuum(v, dt) {
  if (v.turn > 0) { v.turn -= dt; v.dir += dt * 2.5; }
  else {
    v.x += Math.sin(v.dir) * 0.55 * dt; v.z += Math.cos(v.dir) * 0.55 * dt;
    if (resolveCircle(v, 0.18, 0, 0.09) || v.x < -9.8 || v.x > 9.8 || v.z < -6.8 || v.z > 6.8) v.turn = rand(0.4, 1.3);
  }
  v.mesh.position.set(v.x, 0, v.z); v.mesh.rotation.y = v.dir;
  const dx = cat.x - v.x, dz = cat.z - v.z, d = Math.hypot(dx, dz);
  if (d < 0.32 && cat.y < 0.09 && cat.stun <= 0 && cat.inv <= 0) {
    cat.stun = 0.7; cat.vx = (dx / (d || 1)) * 4; cat.vz = (dz / (d || 1)) * 4; cat.vy = 3.2; cat.onGround = false; cat.stamina = 0; cat.tired = true;
    v.turn = 1; sfx.bump(); sfx.hiss(); showMsg('ロボット掃除機にびっくり！', 1.3);
  }
}

// ───────────── ルール ─────────────
function loseLife(who) {
  game.lives--; sfx.hiss(); if (navigator.vibrate) navigator.vibrate(120);
  const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  if (game.lives <= 0) {
    game.state = 'over'; sfx.over();
    panel('ゲームオーバー', `<p>${who}につかまってしまった…</p><p>ステージ ${game.level}　／　スコア <b>${game.score}</b></p>`, 'もう一度あそぶ');
    return;
  }
  showMsg(`${who}につかまった！ のこり ❤️${game.lives}`, 2);
  resetCat(); cat.inv = 3;
  for (const d of game.dogs) { d.state = 'patrol'; d.ignore = 4; d.alert.visible = false; d.path = null; d.wait = 0.5; }
  for (const p of game.people) { p.state = 'walk'; p.cool = 4; p.alert.visible = false; }
}
function panel(title, html, btn) { $('oTitle').textContent = title; $('oBody').innerHTML = html; $('oBtn').textContent = btn; $('overlay').classList.remove('hide'); }

function step(dt) {
  game.time += dt;
  updateCat(dt);
  for (let i = game.mice.length - 1; i >= 0; i--) {
    if (updateMouse(game.mice[i], dt)) {
      scene.remove(game.mice[i].model.group); game.mice.splice(i, 1);
      game.score += 100; game.caught++; sfx.squeak(); sfx.meow();
      showMsg(game.mice.length ? `ネズミをつかまえた！ +100（のこり ${game.mice.length}）` : 'ぜんぶつかまえた！', 1.4);
    }
  }
  for (const d of game.dogs) if (updateDog(d, dt) && game.state === 'play') { loseLife('イヌ'); break; }
  if (game.state === 'play') for (const p of game.people) if (updatePerson(p, dt) && game.state === 'play') { loseLife('人'); break; }
  if (game.state === 'play' && game.vac) updateVacuum(game.vac, dt);
  if (game.state === 'play' && game.mice.length === 0) {
    const tb = Math.max(0, Math.round(300 - game.time * 2)), lb = game.lives * 50;
    game.score += tb + lb; game.state = 'clear'; sfx.clear();
    panel(`ステージ ${game.level} クリア！`, `<p>タイムボーナス +${tb}　／　ライフボーナス +${lb}</p><p>スコア <b>${game.score}</b></p><p>次はネズミが増えて、イヌも速くなります。</p>`, '次のステージへ');
  }
}

const HELP = `<p>おうちの中でネズミをぜんぶつかまえよう。<br>イヌと人に見つかったら、すばやく逃げて！</p><ul>
<li>🕹️ 移動：${isTouch ? '画面左をドラッグ' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 矢印キー'}</li>
<li>⤴️ ジャンプ：${isTouch ? 'ジャンプボタン' : '<kbd>Space</kbd>'}　💨 ダッシュ：${isTouch ? 'ダッシュボタン長押し' : '<kbd>Shift</kbd>'}</li>
<li>🎥 視点：${isTouch ? '画面右をドラッグ（ダッシュ中はボタンから指をずらす）' : 'マウスドラッグ / <kbd>Q</kbd><kbd>E</kbd>'}</li>
<li>🐕 イヌはテーブルや棚の上までは届かない。あきらめるまで待とう</li>
<li>🧍 人は手が届くので、高い所でも油断しないで</li>
<li>🐭 ベッドやソファの下に逃げ込んだネズミは、出てくるまで手が出せない</li></ul>`;
$('oBody').innerHTML = HELP;
$('oBtn').addEventListener('click', () => {
  audio();
  if (game.state === 'clear') startLevel(game.level + 1);
  else { game.score = 0; game.lives = 5; startLevel(1); }
});
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// ───────────── メインループ ─────────────
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.033, Math.max(0.001, raw)); last = now;
  if (document.hidden) return;
  if (raw < 0.25) adaptQuality(raw);
  document.body.classList.toggle('playing', game.state === 'play');
  if (game.state === 'play') { readInput(dt); step(dt); updateCamera(dt, false); }
  else {
    if (game.state === 'title') { cat.model.group.position.set(cat.x, cat.y, cat.z); cat.model.group.rotation.y = cat.yaw; animateQuad(cat.model, dt, 0); }
    updateCamera(dt, true);
  }
  updateHud(dt); drawMap();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.__game = { camera, game, cat, input, keys, step, startLevel, navDog, navMan, boxes, setCam: (y, p) => { camYaw = y; if (p != null) camPitch = p; input.camDragT = 0; } };

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
