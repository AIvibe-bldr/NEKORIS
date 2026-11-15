// キャラクターのモデルとアニメーション（ネコ・イヌ・ネズミ・人・ロボット掃除機）
import * as THREE from '../vendor/three.module.min.js';
import { rng } from './world.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...o });
const SPH = new THREE.SphereGeometry(1, 24, 16);
const capZ = (r, len) => { const g = new THREE.CapsuleGeometry(r, len, 6, 16); g.rotateX(Math.PI / 2); return g; };
const capY = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);

function part(geo, mat, parent, x, y, z, sx = 1, sy = sx, sz = sx) {
  const f = mat.userData.fur;
  if (f) {                                   // 毛皮：拡縮を形状に焼き込み、毛の層（シェル）を重ねる
    geo = (geo === SPH ? SPHZ : geo).clone().scale(sx, sy, sz);   // 球は縞が胴を一周する向きに
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) {
      const a = n.getX(i) / sx, b = n.getY(i) / sy, c = n.getZ(i) / sz, l = Math.hypot(a, b, c) || 1;
      n.setXYZ(i, a / l, b / l, c / l);
    }
    sx = sy = sz = 1;
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m);
  if (f) {
    const sh = new THREE.InstancedMesh(geo, f.shell, f.layers);
    for (let i = 0; i < f.layers; i++) sh.setMatrixAt(i, IDENT);
    sh.frustumCulled = false; sh.visible = furOn; shells.push(sh); m.add(sh);
  }
  return m;
}
const IDENT = new THREE.Matrix4(), SPHZ = SPH.clone().rotateX(Math.PI / 2), shells = [];
let furOn = true;
/** 毛の層の表示切り替え（重い端末では消す） */
export function setFur(on) { furOn = on; for (const s of shells) s.visible = on; }

/** 毛皮マテリアル。毛の1本1本を、外側へ少しずつ膨らませた半透明の層で表現する */
function furMat(map, color, len, density, layers = 12) {
  const base = std(color, { map });
  base.color.multiplyScalar(0.7);            // 地肌は暗め
  const shell = std(color, { map, roughness: 1 });
  shell.onBeforeCompile = (sd) => {
    sd.uniforms.furLen = { value: len }; sd.uniforms.furLayers = { value: layers }; sd.uniforms.furDensity = { value: density };
    sd.vertexShader = 'uniform float furLen; uniform float furLayers; varying vec3 vFurP; varying float vFurL;\n' + sd.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vFurL = (float(gl_InstanceID) + 1.0) / furLayers; vFurP = position;
       transformed += normalize(objectNormal) * furLen * vFurL + vec3(0.0, -0.45, -0.75) * furLen * vFurL * vFurL;`);
    sd.fragmentShader = 'uniform float furDensity; varying vec3 vFurP; varying float vFurL;\n' + sd.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       vec3 fp = vFurP * furDensity; vec3 fc = floor(fp); vec3 ff = fract(fp) - 0.5;
       float rnd = fract(sin(dot(fc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
       float hgt = 0.6 + 0.4 * rnd;
       if (vFurL > hgt || length(ff) > 0.86 * (1.0 - 0.72 * vFurL / hgt)) discard;
       diffuseColor.rgb *= mix(0.64, 1.15, vFurL) * (0.86 + 0.28 * rnd);`);
  };
  shell.customProgramCacheKey = () => 'fur-shell';
  base.userData.fur = { shell, layers };
  return base;
}

function furTex(base, stripe, seed, n = 16, alpha = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = stripe; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {           // 胴をぐるっと回る縞
    g.globalAlpha = alpha * (0.6 + R() * 0.6); g.lineWidth = 2.5 + R() * 5;
    const y = ((i + 0.5) / n) * 128 + R() * 4 - 2;
    g.beginPath(); g.moveTo(-5, y); g.bezierCurveTo(40, y + R() * 12 - 6, 90, y + R() * 12 - 6, 133, y); g.stroke();
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 1800; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},.06)`; g.fillRect(R() * 128, R() * 128, 3, 1.5); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 四つ足の動物（+z向き、原点は足元） */
function buildQuad(p) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const { fur, belly } = p, br = p.bodyR, hl = p.bodyLen / 2, hr = p.headR;
  const hipY = p.legLen + p.legR * 1.2, by = hipY + br * 0.55;
  part(capZ(br, p.bodyLen), fur, body, 0, by, 0, 0.92, 1, 1);
  part(SPH, fur, body, 0, by + br * 0.05, hl * 0.95, br * 1.02, br * 1.06, br * 1.0);
  part(SPH, fur, body, 0, by, -hl, br * 1.0, br * 1.04, br * 1.02);
  part(SPH, belly, body, 0, by - br * 0.28, hl * 0.75, br * 0.72, br * 0.8, br * 0.95);

  const head = new THREE.Group();
  head.position.set(0, by + br * p.neckUp, hl + br * 0.55 + hr * 0.75); body.add(head);
  const neck = part(capZ(hr * 0.72, br * 0.9), fur, body, 0, by + br * p.neckUp * 0.55, hl + br * 0.45);
  neck.rotation.x = -0.75;
  part(SPH, fur, head, 0, 0, 0, hr, hr * 0.92, hr * 0.98);
  part(SPH, belly, head, 0, -hr * 0.28, hr * 0.7 + p.snout / 2, hr * 0.5, hr * 0.42, hr * 0.42 + p.snout / 2);
  part(SPH, fur, head, 0, -hr * 0.05, hr * 0.55 + p.snout * 0.35, hr * 0.42, hr * 0.38, hr * 0.5 + p.snout * 0.4);
  const noseM = std(p.nose, { roughness: 0.4 });
  part(SPH, noseM, head, 0, -hr * 0.14, hr * 1.1 + p.snout, hr * 0.13, hr * 0.1, hr * 0.09);
  const eyeM = std(p.eye, { roughness: 0.1, emissive: p.eye, emissiveIntensity: 0.25 }), black = std(0x050505, { roughness: 0.15 });
  for (const s of [-1, 1]) {
    part(SPH, eyeM, head, s * hr * 0.42, hr * 0.16, hr * 0.74, hr * 0.21);
    part(SPH, black, head, s * hr * 0.45, hr * 0.16, hr * 0.9, hr * p.pupil[0], hr * p.pupil[1], hr * 0.07);
    if (p.ear === 'cat') {
      const e = part(new THREE.ConeGeometry(hr * 0.4, hr * 0.8, 4), p.earFur, head, s * hr * 0.55, hr * 0.9, -hr * 0.05);
      e.rotation.set(-0.1, Math.PI / 4, -s * 0.28);
      const ei = part(new THREE.ConeGeometry(hr * 0.26, hr * 0.56, 4), std(0xe9a9a0), head, s * hr * 0.54, hr * 0.86, hr * 0.03);
      ei.rotation.copy(e.rotation); ei.castShadow = false;
      for (let k = -1; k <= 1; k++) {
        const w = part(new THREE.CylinderGeometry(0.0012, 0.0006, hr * 1.3, 4), std(0xffffff), head, s * hr * 1.0, -hr * 0.25 + k * hr * 0.06, hr * 0.85);
        w.rotation.set(0, s * -0.35, Math.PI / 2 + s * k * 0.16); w.castShadow = false;
      }
    } else {
      const e = part(SPH, p.earMat, head, s * hr * 0.88, hr * 0.2, -hr * 0.1, hr * 0.2, hr * 0.62, hr * 0.42);
      e.rotation.z = s * 0.3;
    }
  }
  if (p.collar) { const c = part(new THREE.TorusGeometry(hr * 0.75, hr * 0.1, 8, 20), std(p.collar, { roughness: 0.5 }), body, 0, by + br * p.neckUp * 0.5, hl + br * 0.42); c.rotation.x = 0.8; }

  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const L = new THREE.Group(); L.position.set(sx * br * 0.55, hipY, sz * hl * 0.92); body.add(L);
    part(capY(p.legR * (sz < 0 ? 1.15 : 1), p.legLen * 0.8), fur, L, 0, -p.legLen * 0.45, 0);
    if (sz < 0) part(SPH, fur, L, 0, -p.legLen * 0.05, 0, p.legR * 1.9, p.legLen * 0.45, p.legR * 2.4);
    part(SPH, belly, L, 0, -p.legLen, p.legR * 0.5, p.legR * 1.25, p.legR * 0.8, p.legR * 1.7);
    legs.push(L);
  }
  const tail = []; let parent = body;
  const n = 7, sl = p.tailLen / n;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group();
    if (i === 0) s.position.set(0, by + br * 0.5, -hl - br * 0.7); else s.position.set(0, 0, -sl);
    part(capZ(p.tailR * (1 - i * 0.07), sl), fur, s, 0, 0, -sl / 2);
    parent.add(s); parent = s; tail.push(s);
  }
  return { group: g, body, head, legs, tail, phase: 0, t: Math.random() * 10, p, headY: head.position.y };
}

export function buildCat() {
  const map = furTex('#d98a3d', '#8a4a18', 5, 9), fur = furMat(map, 0xffffff, 0.013, 520);
  return buildQuad({ earFur: std(0xffffff, { map }),
    bodyR: 0.075, bodyLen: 0.24, legLen: 0.145, legR: 0.02, headR: 0.075, snout: 0.012, neckUp: 0.9,
    tailLen: 0.34, tailR: 0.017, fur, belly: furMat(null, 0xf6efe4, 0.009, 520, 8), nose: 0xd98080, eye: 0xa8d848, pupil: [0.06, 0.17],
    ear: 'cat', stride: 9, tailCurl: 0.11, tailBase: 0.45, collar: 0x2f6fd0,
  });
}

export function buildDog(i = 0) {
  const tones = [['#a8743e', '#6f4420', 0x5a3a20], ['#3a3a3c', '#151515', 0x1c1c1c]][i % 2];
  const fur = furMat(furTex(tones[0], tones[1], 12 + i, 4, 0.14), 0xffffff, 0.02, 330);
  return buildQuad({
    bodyR: 0.15, bodyLen: 0.48, legLen: 0.33, legR: 0.04, headR: 0.12, snout: 0.1, neckUp: 1.25,
    tailLen: 0.36, tailR: 0.028, fur, belly: furMat(null, 0xead9bf, 0.014, 330, 8), nose: 0x111111, eye: 0x3a2412, pupil: [0.13, 0.13],
    ear: 'dog', earMat: furMat(null, tones[2], 0.012, 330, 8), stride: 4.6, tailCurl: 0.1, tailBase: 0.8, collar: 0xb5302a,
  });
}

/** 四つ足のアニメーション。speed[m/s]、o.run で全力疾走、o.air で空中 */
export function animateQuad(m, dt, speed, o = {}) {
  m.t += dt; m.phase += dt * speed * m.p.stride;
  const ph = m.phase, a = Math.min(1, speed / 1.2) * (o.run ? 0.95 : 0.6), L = m.legs;
  if (o.air) {
    const k = Math.min(1, dt * 14);
    L[0].rotation.x += (-1.0 - L[0].rotation.x) * k; L[1].rotation.x += (-1.0 - L[1].rotation.x) * k;
    L[2].rotation.x += (0.9 - L[2].rotation.x) * k; L[3].rotation.x += (0.9 - L[3].rotation.x) * k;
    m.body.rotation.x += (Math.max(-0.5, Math.min(0.5, -(o.vy || 0) * 0.07)) - m.body.rotation.x) * k;
    m.body.position.y = 0;
  } else {
    if (o.run) {
      L[0].rotation.x = Math.sin(ph) * a; L[1].rotation.x = Math.sin(ph + 0.5) * a;
      L[2].rotation.x = Math.sin(ph + 2.6) * a; L[3].rotation.x = Math.sin(ph + 3.1) * a;
      m.body.rotation.x = Math.sin(ph + 0.8) * 0.09 * a;
      m.body.position.y = (0.5 + 0.5 * Math.sin(ph + 1.2)) * m.p.bodyR * 0.3 * a;
    } else {
      L[0].rotation.x = L[3].rotation.x = Math.sin(ph) * a;
      L[1].rotation.x = L[2].rotation.x = Math.sin(ph + Math.PI) * a;
      m.body.rotation.x *= 0.8;
      m.body.position.y = Math.abs(Math.sin(ph)) * m.p.bodyR * 0.08 * a;
    }
  }
  const still = speed < 0.1 && !o.air;
  m.head.rotation.y = still ? Math.sin(m.t * 0.6) * 0.35 : m.head.rotation.y * 0.9;
  m.head.rotation.x = o.alert ? -0.25 : Math.sin(m.t * 0.9) * 0.04;
  const wag = o.wag ? 1 : 0;
  for (let i = 0; i < m.tail.length; i++) {
    const s = m.tail[i];
    s.rotation.x = (i === 0 ? m.p.tailBase + (o.run ? -m.p.tailBase : 0) : m.p.tailCurl * (o.run ? 0.25 : 1));
    s.rotation.y = Math.sin(m.t * (2 + wag * 12) - i * 0.7) * (0.12 + wag * 0.25) + (o.run ? Math.sin(ph - i) * 0.08 : 0);
  }
}

export function buildMouse() {
  const g = new THREE.Group(), s = 1.6;
  const grey = std(0x8c8780), pink = std(0xe2a39a, { roughness: 0.6 }), black = std(0x050505, { roughness: 0.2 });
  const body = new THREE.Group(); g.add(body); body.scale.setScalar(s);
  part(SPH, grey, body, 0, 0.028, 0, 0.027, 0.026, 0.048);
  part(SPH, grey, body, 0, 0.03, 0.046, 0.019, 0.018, 0.03);
  part(SPH, pink, body, 0, 0.027, 0.076, 0.005);
  for (const sx of [-1, 1]) {
    part(SPH, pink, body, sx * 0.017, 0.05, 0.036, 0.012, 0.012, 0.004);
    part(SPH, black, body, sx * 0.011, 0.038, 0.062, 0.0038);
    part(SPH, pink, body, sx * 0.016, 0.004, 0.03, 0.006, 0.004, 0.01);
    part(SPH, pink, body, sx * 0.018, 0.004, -0.028, 0.006, 0.004, 0.012);
  }
  const tail = []; let parent = body;
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Group(); t.position.set(0, i ? 0 : 0.02, i ? -0.018 : -0.044);
    part(capZ(0.0032 - i * 0.0004, 0.018), pink, t, 0, 0, -0.009);
    parent.add(t); parent = t; tail.push(t);
  }
  return { group: g, body, tail, t: Math.random() * 10 };
}
export function animateMouse(m, dt, speed) {
  m.t += dt * (1 + speed * 4);
  m.body.position.y = speed > 0.1 ? Math.abs(Math.sin(m.t * 4)) * 0.006 : 0;
  m.body.rotation.x = speed < 0.1 ? -0.25 - Math.sin(m.t * 3) * 0.05 : 0;   // 止まると後ろ足で立って匂いをかぐ
  for (let i = 0; i < m.tail.length; i++) { m.tail[i].rotation.y = Math.sin(m.t * 2.2 - i * 0.8) * 0.22; m.tail[i].rotation.x = i === 0 ? 0.2 : -0.04; }
}

export function buildPerson(i = 0) {
  const v = [
    { shirt: 0x3f6f9f, pants: 0x2b3345, hair: 0x2a1c12, skin: 0xe3b28f, shoe: 0x8a8f96, s: 1.0 },
    { shirt: 0xc9606a, pants: 0x6b6258, hair: 0x4a2a16, skin: 0xedc3a4, shoe: 0xd8c7b0, s: 0.93, long: true },
    { shirt: 0x5f8f5a, pants: 0x3a4a5f, hair: 0x15110f, skin: 0xd9a57f, shoe: 0x444444, s: 0.97 },
  ][i % 3];
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.scale.setScalar(v.s);
  const shirt = std(v.shirt), pants = std(v.pants), skin = std(v.skin, { roughness: 0.7 }), hair = std(v.hair, { roughness: 0.8 }), shoe = std(v.shoe, { roughness: 0.8 });
  part(capY(0.15, 0.36), shirt, body, 0, 1.2, 0, 1.12, 1, 0.76);
  part(SPH, pants, body, 0, 0.96, 0, 0.175, 0.14, 0.125);
  part(capY(0.045, 0.06), skin, body, 0, 1.56, 0);
  const head = new THREE.Group(); head.position.set(0, 1.68, 0.01); body.add(head);
  part(SPH, skin, head, 0, 0, 0, 0.1, 0.12, 0.108);
  part(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, head, 0, 0.012, -0.012, 0.108, 0.124, 0.116);
  if (v.long) part(SPH, hair, head, 0, -0.08, -0.06, 0.1, 0.16, 0.07);
  part(SPH, skin, head, 0, -0.01, 0.105, 0.014, 0.02, 0.016);
  const dark = std(0x1a1210, { roughness: 0.3 });
  for (const s of [-1, 1]) { part(SPH, dark, head, s * 0.036, 0.012, 0.098, 0.011, 0.008, 0.006); part(SPH, skin, head, s * 0.1, -0.005, 0, 0.015, 0.028, 0.02); }
  const legs = [], knees = [], arms = [], elbows = [];
  for (const s of [-1, 1]) {
    const L = new THREE.Group(); L.position.set(s * 0.088, 0.93, 0); body.add(L);
    part(capY(0.072, 0.3), pants, L, 0, -0.2, 0);
    const K = new THREE.Group(); K.position.y = -0.44; L.add(K);
    part(capY(0.056, 0.3), pants, K, 0, -0.2, 0);
    part(SPH, shoe, K, 0, -0.45, 0.045, 0.052, 0.038, 0.115);
    legs.push(L); knees.push(K);
    const A = new THREE.Group(); A.position.set(s * 0.205, 1.44, 0); A.rotation.z = s * 0.07; body.add(A);
    part(capY(0.046, 0.22), shirt, A, 0, -0.14, 0);
    const E = new THREE.Group(); E.position.y = -0.29; A.add(E);
    part(capY(0.038, 0.2), skin, E, 0, -0.13, 0);
    part(SPH, skin, E, 0, -0.29, 0, 0.042, 0.052, 0.03);
    arms.push(A); elbows.push(E);
  }
  return { group: g, body, head, legs, knees, arms, elbows, phase: Math.random() * 6, t: 0 };
}
export function animatePerson(m, dt, speed, chase) {
  m.t += dt; m.phase += dt * speed * 3.4;
  const ph = m.phase, a = Math.min(1, speed / 1.0) * (chase ? 0.75 : 0.5), k = Math.min(1, dt * 8);
  for (let i = 0; i < 2; i++) {
    const s = Math.sin(ph + i * Math.PI);
    m.legs[i].rotation.x = s * a;
    m.knees[i].rotation.x = Math.max(0, Math.sin(ph + i * Math.PI + 1.3)) * a * 1.5;
    const armT = chase ? -1.15 + s * 0.1 : -s * a * 0.75;
    m.arms[i].rotation.x += (armT - m.arms[i].rotation.x) * k;
    m.elbows[i].rotation.x += ((chase ? -0.5 : -0.2 - a * 0.3) - m.elbows[i].rotation.x) * k;
  }
  m.body.rotation.x += ((chase ? 0.32 : 0.02) - m.body.rotation.x) * k;
  m.body.position.y = Math.abs(Math.cos(ph)) * 0.02 * a - (chase ? 0.06 : 0);
  m.head.rotation.x = chase ? 0.25 : Math.sin(m.t * 0.5) * 0.05;
  m.head.rotation.y = speed < 0.1 ? Math.sin(m.t * 0.4) * 0.5 : 0;
}

export function buildVacuum() {
  const g = new THREE.Group();
  const b = part(new THREE.CylinderGeometry(0.17, 0.17, 0.075, 32), std(0x1d1f22, { roughness: 0.3, metalness: 0.4 }), g, 0, 0.05, 0);
  b.receiveShadow = true;
  part(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), std(0x4a4d52, { roughness: 0.3, metalness: 0.7 }), g, 0, 0.093, 0);
  part(SPH, std(0x30ff70, { emissive: 0x30ff70, emissiveIntensity: 3 }), g, 0, 0.09, 0.12, 0.012, 0.006, 0.012).castShadow = false;
  return g;
}

/** 頭上の「！」マーク */
export function makeAlert() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e8362a'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  s.scale.setScalar(0.28); s.visible = false; s.renderOrder = 10;
  return s;
}

/** 足元の丸い影 */
let blobTex = null;
export function makeBlob(r, opacity = 0.42) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  return m;
}
