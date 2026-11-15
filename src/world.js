// 家の構築（壁・床・家具）、当たり判定、経路探索
import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

export const BOUNDS = { x0: -10, x1: 10, z0: -7, z1: 7 };
export const WALL_H = 2.7;
/** 当たり判定ボックス {x0,x1,z0,z1,y0,y1,sight} */
export const boxes = [];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────── 当たり判定 ─────────────

/** 円(p.x,p.z,半径r)を高さ範囲[yLo,yHi]に重なるボックスから押し出す */
export function resolveCircle(p, r, yLo, yHi) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.y0 >= yHi || b.y1 <= yLo) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
    } else {
      const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r;
      else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
    }
  }
  return hit;
}

/** 足元の高さ（y以下にある一番高い天面） */
export function groundAt(x, z, r, y) {
  let g = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.y1 > g && b.y1 <= y + 0.06 && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) g = b.y1;
  }
  return g;
}

/** 頭上の高さ（yTop以上にある一番低い底面） */
export function ceilingAt(x, z, r, yTop) {
  let c = WALL_H;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.y0 < c && b.y0 >= yTop - 0.05 && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) c = b.y0;
  }
  return c;
}

/** カメラだけが避ける物（観葉植物の葉など） */
export const camBoxes = [];
function segBox(b, ax, az, dx, dz, best) {
  let t0 = 0, t1 = best;
  if (Math.abs(dx) < 1e-9) { if (ax < b.x0 || ax > b.x1) return best; }
  else {
    let u = (b.x0 - ax) / dx, v = (b.x1 - ax) / dx;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > t0) t0 = u; if (v < t1) t1 = v;
    if (t0 > t1) return best;
  }
  if (Math.abs(dz) < 1e-9) { if (az < b.z0 || az > b.z1) return best; }
  else {
    let u = (b.z0 - az) / dz, v = (b.z1 - az) / dz;
    if (u > v) { const s = u; u = v; v = s; }
    if (u > t0) t0 = u; if (v < t1) t1 = v;
    if (t0 > t1) return best;
  }
  return t0;
}
/** 線分a→bが背の高い物（壁・タンス等）に当たる位置 t(0..1)。当たらなければ1 */
export function rayT(ax, az, bx, bz, cam = false) {
  const dx = bx - ax, dz = bz - az;
  let best = 1;
  for (let i = 0; i < boxes.length; i++) if (boxes[i].sight) best = segBox(boxes[i], ax, az, dx, dz, best);
  if (cam) for (let i = 0; i < camBoxes.length; i++) best = segBox(camBoxes[i], ax, az, dx, dz, best);
  return best;
}
export const los = (ax, az, bx, bz) => rayT(ax, az, bx, bz) >= 1;

/** ネズミが通れない場所か（床まで届いている物の中） */
export function mouseBlocked(x, z) {
  if (x < BOUNDS.x0 + 0.06 || x > BOUNDS.x1 - 0.06 || z < BOUNDS.z0 + 0.06 || z > BOUNDS.z1 - 0.06) return true;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.y0 < 0.08 && x > b.x0 - 0.06 && x < b.x1 + 0.06 && z > b.z0 - 0.06 && z < b.z1 + 0.06) return true;
  }
  return false;
}
/** ネズミが家具の下に隠れているか（ネコの手が届かない） */
export function mouseCovered(x, z) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.y0 >= 0.08 && b.y0 < 0.3 && x > b.x0 + 0.08 && x < b.x1 - 0.08 && z > b.z0 + 0.08 && z < b.z1 - 0.08) return true;
  }
  return false;
}

// ───────────── 経路探索（グリッドA*） ─────────────

export class NavGrid {
  constructor(inflate, yMax) {
    this.cell = 0.25;
    this.nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / this.cell);
    this.nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / this.cell);
    const n = this.nx * this.nz;
    this.blocked = new Uint8Array(n);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = BOUNDS.x0 + (i + 0.5) * this.cell, z = BOUNDS.z0 + (j + 0.5) * this.cell;
      let bl = x < BOUNDS.x0 + inflate || x > BOUNDS.x1 - inflate || z < BOUNDS.z0 + inflate || z > BOUNDS.z1 - inflate;
      for (let k = 0; k < boxes.length && !bl; k++) {
        const b = boxes[k];
        if (b.y0 < yMax && b.y1 > 0.15 && x > b.x0 - inflate && x < b.x1 + inflate && z > b.z0 - inflate && z < b.z1 + inflate) bl = true;
      }
      this.blocked[j * this.nx + i] = bl ? 1 : 0;
    }
    this.g = new Float32Array(n); this.from = new Int32Array(n);
    this.mark = new Uint32Array(n); this.closed = new Uint32Array(n); this.gen = 0;
    this.heap = [];
  }
  ci(x) { return clamp(Math.floor((x - BOUNDS.x0) / this.cell), 0, this.nx - 1); }
  cj(z) { return clamp(Math.floor((z - BOUNDS.z0) / this.cell), 0, this.nz - 1); }
  isFree(x, z) { return !this.blocked[this.cj(z) * this.nx + this.ci(x)]; }
  nearestFree(i, j) {
    if (!this.blocked[j * this.nx + i]) return j * this.nx + i;
    for (let r = 1; r < 14; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= this.nx || b >= this.nz || this.blocked[b * this.nx + a]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = b * this.nx + a; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  /** 見通し（グリッド上） */
  visible(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.12);
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }
  path(ax, az, bx, bz) {
    const nx = this.nx, nz = this.nz;
    const s = this.nearestFree(this.ci(ax), this.cj(az)), e = this.nearestFree(this.ci(bx), this.cj(bz));
    if (s < 0 || e < 0) return [];
    const ei = e % nx, ej = (e / nx) | 0;
    const gen = ++this.gen, g = this.g, from = this.from, mark = this.mark, closed = this.closed, heap = this.heap;
    heap.length = 0;
    const h = (i, j) => { const dx = Math.abs(i - ei), dz = Math.abs(j - ej); return dx + dz - 0.586 * Math.min(dx, dz); };
    const push = (f, id) => {
      let k = heap.length; heap.push([f, id]);
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m;
        }
      }
      return top[1];
    };
    g[s] = 0; from[s] = -1; mark[s] = gen; push(h(s % nx, (s / nx) | 0), s);
    let best = s, bestH = h(s % nx, (s / nx) | 0), found = false;
    while (heap.length) {
      const c = pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === e) { found = true; break; }
      const ci = c % nx, cj = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ci + di, b = cj + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const id = b * nx + a;
        if (this.blocked[id] || closed[id] === gen) continue;
        if (di && dj && (this.blocked[cj * nx + a] || this.blocked[b * nx + ci])) continue;
        const ng = g[c] + (di && dj ? 1.414 : 1);
        if (mark[id] !== gen || ng < g[id]) {
          g[id] = ng; from[id] = c; mark[id] = gen;
          const hh = h(a, b);
          if (hh < bestH) { bestH = hh; best = id; }
          push(ng + hh, id);
        }
      }
    }
    const out = [];
    for (let c = found ? e : best; c >= 0; c = from[c]) {
      out.push({ x: BOUNDS.x0 + ((c % nx) + 0.5) * this.cell, z: BOUNDS.z0 + (((c / nx) | 0) + 0.5) * this.cell });
    }
    return out.reverse();
  }
}

// ───────────── テクスチャ ─────────────

function tex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}

const woodTex = (rx, ry) => tex(512, 512, (g, w, h) => {
  const R = rng(7), rows = 8, ph = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * w * 0.4;
    while (x < w) {
      const len = w * (0.32 + R() * 0.3);
      g.fillStyle = `hsl(${28 + R() * 4},${42 + R() * 6}%,${45 + R() * 6}%)`;
      g.fillRect(x, r * ph, len, ph);
      g.fillStyle = 'rgba(35,18,6,.6)'; g.fillRect(x, r * ph, 1.5, ph);
      x += len;
    }
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(${R() < 0.5 ? '60,30,10' : '255,220,170'},${0.04 + R() * 0.08})`;
      g.lineWidth = 0.6 + R();
      const y = r * ph + 3 + R() * (ph - 6), x0 = R() * w, l = 40 + R() * 200;
      g.beginPath(); g.moveTo(x0, y); g.bezierCurveTo(x0 + l / 3, y + R() * 4 - 2, x0 + (2 * l) / 3, y + R() * 4 - 2, x0 + l, y); g.stroke();
    }
    g.fillStyle = 'rgba(35,18,6,.55)'; g.fillRect(0, r * ph, w, 1.5);
  }
}, rx, ry);

const tileTex = (rx, ry) => tex(256, 256, (g, w) => {
  const R = rng(3); g.fillStyle = '#8f8a80'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    g.fillStyle = `hsl(40,${8 + R() * 6}%,${80 + R() * 6}%)`;
    g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(120,110,95,${R() * 0.07})`; g.fillRect(i * 128 + R() * 120, j * 128 + R() * 120, 3 + R() * 14, 2 + R() * 8); }
  }
}, rx, ry);

const rugTex = (c1, c2, c3) => tex(256, 256, (g, w) => {
  g.fillStyle = c1; g.fillRect(0, 0, w, w);
  g.strokeStyle = c2; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, w - 28);
  g.strokeStyle = c3; g.lineWidth = 3; g.strokeRect(30, 30, w - 60, w - 60);
  const R = rng(11);
  for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},.05)`; g.fillRect(R() * w, R() * w, 2, 2); }
  g.fillStyle = c3;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { g.save(); g.translate(64 + i * 32, 64 + j * 32); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore(); }
});

const booksTex = (seed) => tex(256, 512, (g, w, h) => {
  const R = rng(seed); g.fillStyle = '#2b1a10'; g.fillRect(0, 0, w, h);
  const sh = h / 5;
  for (let s = 0; s < 5; s++) {
    g.fillStyle = '#1a0f08'; g.fillRect(8, s * sh + 6, w - 16, sh - 14);
    let x = 12;
    while (x < w - 22) {
      const bw = 8 + R() * 14, bh = (sh - 20) * (0.65 + R() * 0.33);
      if (R() < 0.12) { x += bw; continue; }
      g.fillStyle = `hsl(${R() * 360},${25 + R() * 45}%,${25 + R() * 40}%)`;
      g.fillRect(x, s * sh + sh - 8 - bh, bw - 1, bh);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, s * sh + sh - 8 - bh * 0.8, bw - 5, 2);
      x += bw;
    }
    g.fillStyle = '#4a2e1c'; g.fillRect(0, s * sh + sh - 8, w, 8);
  }
  g.strokeStyle = '#4a2e1c'; g.lineWidth = 12; g.strokeRect(0, 0, w, h);
});

const doorsTex = (base, line, n) => tex(256, 256, (g, w) => {
  g.fillStyle = base; g.fillRect(0, 0, w, w);
  g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, w - 4);
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 5; g.strokeRect(22, 22, w - 44, w - 44);
  g.fillStyle = '#b9b9b9'; g.fillRect(w - 20, w / 2 - 22, 5, 44);
}, n, 1);

const skyTex = () => tex(256, 256, (g, w) => {
  const gr = g.createLinearGradient(0, 0, 0, w);
  gr.addColorStop(0, '#7fb7f2'); gr.addColorStop(0.6, '#d9ecff'); gr.addColorStop(0.61, '#7fae6a'); gr.addColorStop(1, '#4f8a48');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (const [x, y, r] of [[60, 50, 22], [85, 45, 28], [112, 54, 20], [190, 80, 18], [210, 76, 22]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = '#3f7a3d';
  for (const [x, r] of [[40, 34], [150, 42], [225, 30]]) { g.beginPath(); g.arc(x, 160, r, 0, 7); g.fill(); }
  g.fillStyle = '#f4f4f4'; g.fillRect(w / 2 - 4, 0, 8, w); g.fillRect(0, w / 2 - 4, w, 8);
});

const artTex = (seed) => tex(128, 128, (g, w) => {
  const R = rng(seed); g.fillStyle = `hsl(${R() * 360},30%,85%)`; g.fillRect(0, 0, w, w);
  for (let k = 0; k < 7; k++) {
    g.fillStyle = `hsla(${R() * 360},${50 + R() * 30}%,${40 + R() * 30}%,.8)`;
    g.beginPath(); g.arc(R() * w, R() * w, 10 + R() * 34, 0, 7); g.fill();
  }
});

// ───────────── 家の構築 ─────────────

export function buildWorld(scene) {
  boxes.length = 0; camBoxes.length = 0;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const M = {
    wall: std(0xefe6d6, { roughness: 0.95 }), base: std(0xfbfaf6, { roughness: 0.6 }),
    ceil: std(0xf7f4ee, { roughness: 1 }),
    wood: std(0x8a5a36, { roughness: 0.55 }), woodDark: std(0x4a2e1c, { roughness: 0.6 }), woodLight: std(0xc9a373, { roughness: 0.6 }),
    white: std(0xf2f2ef, { roughness: 0.5 }), sofa: std(0x4f6d8a, { roughness: 1 }), sofa2: std(0x9b5a45, { roughness: 1 }),
    cushion: std(0xd9b36a, { roughness: 1 }), linen: std(0xe9e4da, { roughness: 1 }), duvet: std(0x6f8fb0, { roughness: 1 }),
    metal: std(0xc4c8cc, { roughness: 0.28, metalness: 0.9 }), black: std(0x121214, { roughness: 0.35 }),
    stone: std(0x2f3033, { roughness: 0.22, metalness: 0.1 }), cabinet: std(0xe6e1d6, { roughness: 0.5 }),
    leaf: std(0x3f7d3a, { roughness: 0.8 }), pot: std(0xb5653c, { roughness: 0.9 }), card: std(0xb58e5f, { roughness: 1 }),
    carpet: std(0xb9a58a, { roughness: 1 }), rope: std(0xcdb890, { roughness: 1 }), wicker: std(0xa98458, { roughness: 1 }),
    lamp: std(0xfff3d6, { emissive: 0xffe2a8, emissiveIntensity: 2.2 }), glass: std(0x0b1220, { roughness: 0.08, metalness: 0.6, emissive: 0x0a1626 }),
    red: std(0xb5403a), steelDark: std(0x55585c, { roughness: 0.4, metalness: 0.8 }),
  };

  const col = (x0, z0, x1, z1, y0, y1) => boxes.push({ x0, z0, x1, z1, y0, y1, sight: y0 < 0.4 && y1 > 1.4 });
  function B(x0, z0, x1, z1, y0, y1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = o.r ? new RoundedBoxGeometry(w, h, d, 3, Math.min(o.r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    scene.add(m);
    if (o.col !== false) col(x0, z0, x1, z1, y0, y1);
    return m;
  }
  const V = (x0, z0, x1, z1, y0, y1, mat, o = {}) => B(x0, z0, x1, z1, y0, y1, mat, { ...o, col: false });
  function cyl(x, z, r, y0, y1, mat, r2 = r, cast = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, y1 - y0, 20), mat);
    m.position.set(x, (y0 + y1) / 2, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
  }
  function plane(x0, z0, x1, z1, y, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
  }
  /** 壁に貼る板（axis: 'x'なら±x向き） */
  function panel(x, y, z, w, h, facing, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[facing];
    scene.add(m); return m;
  }
  function legs(x0, z0, x1, z1, h, t, mat) {
    for (const [x, z] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) V(x, z, x + t, z + t, 0, h, mat);
  }

  // 床・天井
  plane(-10, -7, 10, 7, 0, std(0xffffff, { map: woodTex(10, 7), roughness: 0.42 }));
  plane(0.1, -7, 10, 0.9, 0.003, std(0xffffff, { map: tileTex(9.9, 7.9), roughness: 0.3 }));
  plane(5.1, 3.1, 10, 7, 0.003, std(0xffffff, { map: tileTex(4.9, 3.9), roughness: 0.3 }));
  const ceil = plane(-10.2, -7.2, 10.2, 7.2, WALL_H, M.ceil); ceil.rotation.x = Math.PI / 2; ceil.receiveShadow = false;

  // 壁
  const wall = (x0, z0, x1, z1) => {
    B(x0, z0, x1, z1, 0, WALL_H, M.wall, { cast: false });
    V(x0 - 0.012, z0 - 0.012, x1 + 0.012, z1 + 0.012, 0, 0.09, M.base, { cast: false });
  };
  const lintel = (x0, z0, x1, z1) => {
    B(x0, z0, x1, z1, 2.08, WALL_H, M.wall, { cast: false });
    const horiz = x1 - x0 > z1 - z0, e = 0.03;
    if (horiz) { V(x0 - 0.05, z0 - e, x0, z1 + e, 0, 2.08, M.base); V(x1, z0 - e, x1 + 0.05, z1 + e, 0, 2.08, M.base); V(x0 - 0.05, z0 - e, x1 + 0.05, z1 + e, 2.08, 2.14, M.base); }
    else { V(x0 - e, z0 - 0.05, x1 + e, z0, 0, 2.08, M.base); V(x0 - e, z1, x1 + e, z1 + 0.05, 0, 2.08, M.base); V(x0 - e, z0 - 0.05, x1 + e, z1 + 0.05, 2.08, 2.14, M.base); }
  };
  wall(-10.2, -7.2, 10.2, -7); wall(-10.2, 7, 10.2, 7.2); wall(-10.2, -7, -10, 7); wall(10, -7, 10.2, 7);
  // リビング｜キッチン (x=0)
  wall(-0.1, -7, 0.1, -4.2); wall(-0.1, -1.2, 0.1, 0.9); lintel(-0.1, -4.2, 0.1, -1.2);
  // リビング・キッチン｜廊下 (z=1)
  wall(-10, 0.9, -6, 1.1); lintel(-6, 0.9, -4.6, 1.1); wall(-4.6, 0.9, 4.6, 1.1); lintel(4.6, 0.9, 6, 1.1); wall(6, 0.9, 10, 1.1);
  // 廊下｜個室 (z=3)
  wall(-10, 2.9, -7, 3.1); lintel(-7, 2.9, -5.7, 3.1); wall(-5.7, 2.9, 1, 3.1); lintel(1, 2.9, 2.3, 3.1);
  wall(2.3, 2.9, 7, 3.1); lintel(7, 2.9, 8.3, 3.1); wall(8.3, 2.9, 10, 3.1);
  wall(-2.1, 3.1, -1.9, 7); wall(4.9, 3.1, 5.1, 7);

  // 窓・絵・照明器具
  const sky = new THREE.MeshBasicMaterial({ map: skyTex(), toneMapped: false });
  const win = (x, z, facing, w = 1.8) => {
    panel(x, 1.5, z, w, 1.2, facing, sky);
    const f = facing[1] === 'x';
    V(...(f ? [x - 0.03, z - w / 2 - 0.05, x + 0.03, z + w / 2 + 0.05] : [x - w / 2 - 0.05, z - 0.03, x + w / 2 + 0.05, z + 0.03]), 0.84, 0.9, M.base, { cast: false });
  };
  win(-9.995, -1.2, '+x', 2.2); win(-3, -6.995, '+z'); win(9.995, -3.5, '-x', 2.2); win(-6, 6.995, '-z'); win(1.3, 6.995, '-z', 1.6); win(7.5, 6.995, '-z', 1.2);
  const art = (x, y, z, facing, w, h, seed) => panel(x, y, z, w, h, facing, std(0xffffff, { map: artTex(seed), roughness: 0.6 }));
  art(-2.5, 1.6, 1.105, '+z', 0.9, 0.6, 5); art(3, 1.6, 1.105, '+z', 0.6, 0.8, 9); art(-3.5, 1.6, 0.895, '-z', 1.1, 0.7, 21);
  art(-9.995, 1.7, 5, '+x', 0.8, 0.5, 33); art(-1.895, 1.6, 5, '+x', 0.7, 0.9, 41); art(0.105, 1.7, -5.6, '+x', 0.6, 0.6, 51);
  const lights = [[-5, -3], [5, -3], [-5, 2], [5, 2], [-6, 5], [1.5, 5], [7.5, 5]];
  for (const [x, z] of lights) cyl(x, z, 0.24, WALL_H - 0.06, WALL_H, M.lamp, 0.24, false);
  for (const [x, z, i] of [[-5, -3, 9], [5, -3, 9], [-6, 5, 6], [1.5, 5, 6]]) {
    const pl = new THREE.PointLight(0xffe6bf, i, 11, 1.6); pl.position.set(x, 2.35, z); scene.add(pl);
  }

  // ── リビング ──
  plane(-7.7, -5.4, -4.3, -2.7, 0.006, std(0xffffff, { map: rugTex('#7a3b35', '#d8c39a', '#e9dcc0'), roughness: 1 }));
  B(-7.2, -6.98, -4.8, -6.5, 0, 0.5, M.woodDark);                                   // テレビ台
  V(-6.2, -6.82, -5.8, -6.66, 0.5, 0.56, M.black);
  B(-6.75, -6.78, -5.25, -6.71, 0.56, 1.42, M.black);                               // テレビ
  panel(-6, 0.99, -6.705, 1.42, 0.78, '+z', M.glass);
  V(-7.2, -2.4, -4.8, -1.4, 0.12, 0.34, M.sofa, { r: 0.05 });                       // ソファ
  V(-6.93, -2.38, -6.02, -1.68, 0.33, 0.5, M.sofa, { r: 0.07 }); V(-5.98, -2.38, -5.07, -1.68, 0.33, 0.5, M.sofa, { r: 0.07 });
  col(-7.2, -2.4, -4.8, -1.4, 0.12, 0.5);
  B(-7.2, -1.7, -4.8, -1.4, 0.34, 0.92, M.sofa, { r: 0.09 });
  B(-7.2, -2.4, -6.95, -1.7, 0.34, 0.64, M.sofa, { r: 0.08 }); B(-5.05, -2.4, -4.8, -1.7, 0.34, 0.64, M.sofa, { r: 0.08 });
  V(-6.7, -1.95, -6.3, -1.72, 0.5, 0.86, M.cushion, { r: 0.09 });
  legs(-7.15, -2.35, -4.85, -1.45, 0.12, 0.07, M.woodDark);
  B(-6.6, -4.45, -5.4, -3.65, 0.36, 0.41, M.wood, { r: 0.015 });                    // ローテーブル
  legs(-6.55, -4.4, -5.45, -3.7, 0.36, 0.06, M.woodDark);
  cyl(-5.75, -4.0, 0.05, 0.41, 0.52, M.white);                                       // マグカップ
  B(-9.98, -6.3, -9.6, -4.3, 0, 1.9, M.woodDark);                                   // 本棚
  panel(-9.595, 0.95, -5.3, 2, 1.9, '+x', std(0xffffff, { map: booksTex(4), roughness: 0.8 }));
  V(-9.5, -3.6, -8.6, -2.7, 0.12, 0.44, M.sofa2, { r: 0.08 }); col(-9.5, -3.6, -8.6, -2.7, 0.12, 0.44);   // 一人掛け
  B(-9.5, -3.6, -9.28, -2.7, 0.3, 0.9, M.sofa2, { r: 0.08 });
  B(-9.3, -3.6, -8.6, -3.42, 0.3, 0.62, M.sofa2, { r: 0.07 }); B(-9.3, -2.88, -8.6, -2.7, 0.3, 0.62, M.sofa2, { r: 0.07 });
  // 観葉植物
  const plant = (x, z, s = 1) => {
    cyl(x, z, 0.17 * s, 0, 0.4 * s, M.pot, 0.23 * s); col(x - 0.2 * s, z - 0.2 * s, x + 0.2 * s, z + 0.2 * s, 0, 0.42 * s);
    cyl(x, z, 0.025, 0.4 * s, 1.0 * s, M.woodDark);
    camBoxes.push({ x0: x - 0.4 * s, x1: x + 0.4 * s, z0: z - 0.4 * s, z1: z + 0.4 * s });
    const R = rng(Math.round(x * 31 + z * 17));
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), M.leaf);
      const a = R() * 6.28, rr = 0.1 + R() * 0.22;
      l.position.set(x + Math.cos(a) * rr * s, (0.75 + R() * 0.7) * s, z + Math.sin(a) * rr * s);
      l.scale.set((0.1 + R() * 0.1) * s, (0.2 + R() * 0.14) * s, (0.1 + R() * 0.1) * s);
      l.rotation.set(R() - 0.5, R() * 3, R() - 0.5); l.castShadow = true; scene.add(l);
    }
  };
  plant(-0.7, -6.4); plant(-9.5, 6.55, 0.8); plant(4.4, 3.6, 0.9);
  // フロアランプ
  cyl(-4.3, -1.6, 0.16, 0, 0.03, M.steelDark); cyl(-4.3, -1.6, 0.015, 0.03, 1.5, M.steelDark);
  cyl(-4.3, -1.6, 0.2, 1.42, 1.72, M.lamp, 0.13, false); col(-4.36, -1.66, -4.24, -1.54, 0, 1.5);
  const fl = new THREE.PointLight(0xffc98a, 3, 6, 1.8); fl.position.set(-4.3, 1.3, -1.9); scene.add(fl);
  // キャットタワー
  B(-9.85, -0.4, -8.75, 0.75, 0, 0.06, M.carpet);
  for (const [x, z, h] of [[-9.5, 0.4, 1.5], [-9.05, 0.45, 1.0], [-9.5, -0.1, 0.5]]) { cyl(x, z, 0.06, 0.06, h, M.rope); col(x - 0.06, z - 0.06, x + 0.06, z + 0.06, 0, h); }
  B(-9.85, -0.4, -9.2, 0.2, 0.5, 0.55, M.carpet, { r: 0.02 });
  B(-9.35, 0.15, -8.75, 0.75, 1.0, 1.05, M.carpet, { r: 0.02 });
  B(-9.88, 0.1, -9.2, 0.78, 1.5, 1.56, M.carpet, { r: 0.02 });

  // ── キッチン・ダイニング ──
  B(0.5, -6.98, 1.4, -6.2, 0, 1.85, M.metal, { r: 0.03 });                          // 冷蔵庫
  V(1.3, -6.2, 1.33, -6.17, 0.9, 1.6, M.steelDark);
  const cabM = std(0xffffff, { map: doorsTex('#e6e1d6', '#bdb7a8', 14), roughness: 0.5 });
  V(1.5, -6.98, 9.98, -6.32, 0, 0.86, cabM); V(1.5, -6.98, 9.98, -6.28, 0.86, 0.9, M.stone); col(1.5, -6.98, 9.98, -6.28, 0, 0.9);
  B(1.5, -6.98, 9.98, -6.62, 1.5, 2.25, std(0xffffff, { map: doorsTex('#e6e1d6', '#bdb7a8', 14), roughness: 0.5 }));
  V(3.6, -6.9, 4.4, -6.36, 0.9, 0.912, M.black);                                    // コンロ
  for (const [x, z] of [[3.8, -6.75], [4.2, -6.75], [3.8, -6.5], [4.2, -6.5]]) cyl(x, z, 0.08, 0.912, 0.918, M.steelDark, 0.08, false);
  V(6, -6.85, 6.9, -6.4, 0.895, 0.905, M.metal);                                    // シンク
  cyl(6.45, -6.86, 0.018, 0.9, 1.2, M.metal);
  cyl(8.2, -6.6, 0.11, 0.9, 1.12, M.red);                                           // 鍋
  cyl(9.3, -6.6, 0.08, 0.9, 1.2, M.white);
  V(5, -4.4, 7, -3.5, 0, 0.86, std(0xffffff, { map: doorsTex('#5d6f78', '#3f4d54', 3), roughness: 0.5 }));   // アイランド
  V(4.95, -4.45, 7.05, -3.45, 0.86, 0.9, M.woodLight, { r: 0.012 }); col(4.95, -4.45, 7.05, -3.45, 0, 0.9);
  cyl(6, -3.95, 0.16, 0.9, 0.97, M.wicker, 0.2);
  for (const [dx, dz, c] of [[0, 0, 0xd8472b], [0.08, 0.05, 0xe8a530], [-0.07, 0.06, 0x7fae3a]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), std(c, { roughness: 0.5 })); f.position.set(6 + dx, 1.0, -3.95 + dz); f.castShadow = true; scene.add(f);
  }
  B(2.2, -2.2, 4.4, -1.0, 0.7, 0.75, M.wood, { r: 0.015 });                         // ダイニングテーブル
  legs(2.28, -2.12, 4.32, -1.08, 0.7, 0.08, M.wood);
  const chair = (x, z, back) => {   // back: 背もたれが+z側なら1、-z側なら-1
    B(x - 0.21, z - 0.21, x + 0.21, z + 0.21, 0.4, 0.45, M.woodLight, { r: 0.012 });
    legs(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0.4, 0.04, M.woodLight);
    const bz = z + back * 0.19;
    B(x - 0.21, bz - 0.02, x + 0.21, bz + 0.02, 0.6, 0.92, M.woodLight, { r: 0.012 });
    V(x - 0.2, bz - 0.02, x - 0.16, bz + 0.02, 0.45, 0.6, M.woodLight); V(x + 0.16, bz - 0.02, x + 0.2, bz + 0.02, 0.45, 0.6, M.woodLight);
  };
  chair(2.8, -2.55, -1); chair(3.8, -2.55, -1); chair(2.8, -0.65, 1); chair(3.8, -0.65, 1);
  cyl(3.3, -1.6, 0.09, 0.75, 0.95, std(0x9fc4d8, { roughness: 0.1, transparent: true, opacity: 0.7 }), 0.06);   // 花瓶
  cyl(8.9, 0.2, 0.46, 0, 0.1, std(0x6b4a38, { roughness: 1 }), 0.4);                // 犬のベッド
  cyl(8.9, 0.2, 0.33, 0.06, 0.12, M.cushion, 0.33);
  cyl(9.55, -1.3, 0.1, 0, 0.06, M.metal, 0.085); cyl(9.55, -1.0, 0.1, 0, 0.06, M.metal, 0.085);   // えさ皿
  cyl(0.55, 0.5, 0.16, 0, 0.5, M.steelDark, 0.18); col(0.38, 0.33, 0.72, 0.67, 0, 0.5);           // ゴミ箱

  // ── 廊下 ──
  B(9.5, 1.3, 9.98, 2.7, 0, 0.9, std(0xffffff, { map: doorsTex('#c9a373', '#8f6c44', 1), roughness: 0.6 }));   // 下駄箱
  B(-0.7, 2.6, 0.7, 2.88, 0.72, 0.76, M.woodDark); legs(-0.68, 2.62, 0.68, 2.86, 0.72, 0.04, M.woodDark);       // コンソール
  cyl(-0.3, 2.74, 0.06, 0.76, 1.0, M.pot, 0.035);
  V(-9.99, 1.45, -9.95, 2.55, 0, 2.05, std(0x6b4630, { roughness: 0.5 }), { cast: false });                     // 玄関ドア
  cyl(-9.93, 2.4, 0.02, 1.0, 1.04, M.metal);
  plane(-9.7, 1.6, -8.9, 2.4, 0.005, std(0x4b5a44, { roughness: 1 }));
  plane(-4, 1.5, 4, 2.5, 0.005, std(0xffffff, { map: rugTex('#3d4f63', '#c8b78f', '#d9cfb6'), roughness: 1 }));

  // ── 寝室 ──
  plane(-7.5, 3.9, -5.5, 6.1, 0.006, std(0xffffff, { map: rugTex('#b8ad9a', '#8d7f66', '#f0e9da'), roughness: 1 }));
  V(-9.75, 4.2, -7.7, 5.8, 0.2, 0.32, M.woodLight); V(-9.72, 4.23, -7.72, 5.77, 0.32, 0.55, M.linen, { r: 0.07 });   // ベッド
  V(-8.9, 4.19, -7.69, 5.81, 0.46, 0.6, M.duvet, { r: 0.06 });
  V(-9.62, 4.35, -9.12, 4.95, 0.53, 0.66, M.white, { r: 0.06 }); V(-9.62, 5.05, -9.12, 5.65, 0.53, 0.66, M.white, { r: 0.06 });
  col(-9.75, 4.2, -7.7, 5.8, 0.2, 0.58);
  B(-9.98, 4.15, -9.75, 5.85, 0, 1.05, M.woodLight, { r: 0.02 });
  legs(-9.7, 4.25, -7.75, 5.75, 0.2, 0.08, M.woodDark);
  B(-9.98, 6.0, -9.5, 6.5, 0, 0.5, M.woodLight);                                    // ナイトテーブル
  cyl(-9.74, 6.25, 0.07, 0.5, 0.56, M.steelDark); cyl(-9.74, 6.25, 0.012, 0.56, 0.75, M.steelDark); cyl(-9.74, 6.25, 0.12, 0.72, 0.9, M.lamp, 0.08, false);
  B(-5.5, 6.4, -3.5, 6.98, 0, 2.05, std(0xffffff, { map: doorsTex('#d9c7a6', '#a08a63', 3), roughness: 0.6 }));   // 洋服ダンス
  B(-2.7, 3.9, -2.12, 5.3, 0, 0.8, std(0xffffff, { map: doorsTex('#d9c7a6', '#a08a63', 1), roughness: 0.6 }));    // チェスト

  // ── 書斎 ──
  B(0.4, 6.3, 2.2, 6.97, 0.72, 0.76, M.woodLight, { r: 0.012 }); legs(0.44, 6.33, 2.16, 6.93, 0.72, 0.05, M.steelDark);   // 机
  V(1.25, 6.75, 1.35, 6.82, 0.76, 0.9, M.black); V(0.95, 6.78, 1.65, 6.81, 0.86, 1.28, M.black);
  panel(1.3, 1.07, 6.775, 0.66, 0.38, '-z', M.glass);
  V(1.05, 6.45, 1.55, 6.6, 0.76, 0.775, M.black);
  B(1.08, 5.55, 1.52, 5.99, 0.42, 0.48, M.black, { r: 0.02 }); cyl(1.3, 5.77, 0.03, 0.06, 0.42, M.steelDark); cyl(1.3, 5.77, 0.26, 0.02, 0.06, M.steelDark, 0.04);   // 椅子
  B(1.08, 5.52, 1.52, 5.57, 0.55, 1.0, M.black, { r: 0.02 });
  B(4.5, 4.4, 4.88, 6.4, 0, 1.9, M.woodDark);
  panel(4.495, 0.95, 5.4, 2, 1.9, '-x', std(0xffffff, { map: booksTex(8), roughness: 0.8 }));
  B(-1.75, 6.2, -1.15, 6.8, 0, 0.45, M.card); B(-1.68, 6.28, -1.25, 6.7, 0.45, 0.8, M.card); B(-1.05, 6.4, -0.55, 6.9, 0, 0.4, M.card);   // 段ボール
  plane(-0.4, 4.0, 2.6, 5.9, 0.006, std(0xffffff, { map: rugTex('#4d6b52', '#d9cfb6', '#e9dcc0'), roughness: 1 }));

  // ── 洗面・物置 ──
  const washer = (z0) => {
    B(9.2, z0, 9.97, z0 + 0.72, 0, 0.9, M.white, { r: 0.03 });
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), M.glass); d.position.set(9.195, 0.48, z0 + 0.36); d.rotation.y = -Math.PI / 2; scene.add(d);
  };
  washer(4.9); washer(5.7);
  V(5.15, 4.2, 5.55, 6.6, 0, 0.04, M.steelDark);                                    // スチールラック
  for (const y of [0.45, 0.9, 1.35, 1.8]) V(5.15, 4.2, 5.55, 6.6, y - 0.03, y, M.steelDark);
  for (const [x, z] of [[5.15, 4.2], [5.52, 4.2], [5.15, 6.57], [5.52, 6.57]]) V(x, z, x + 0.03, z + 0.03, 0, 1.8, M.steelDark);
  col(5.15, 4.2, 5.55, 6.6, 0, 1.8);
  const R = rng(99);
  for (const y of [0.04, 0.45, 0.9, 1.35]) for (let z = 4.3; z < 6.3; z += 0.5) if (R() < 0.75) V(5.2, z, 5.5, z + 0.3 + R() * 0.12, y, y + 0.18 + R() * 0.16, R() < 0.5 ? M.card : std(new THREE.Color().setHSL(R(), 0.35, 0.55)));
  B(7, 6.3, 7.6, 6.9, 0, 0.5, M.wicker, { r: 0.04 });                               // 洗濯かご
  B(9.2, 3.3, 9.8, 3.9, 0, 0.45, M.card);
  plane(7, 4.6, 8.4, 5.4, 0.006, std(0x7fa3b8, { roughness: 1 }));

  return { lights };
}
