// Heads with a shape: the skull, face, hair and beard of a character as smooth single surfaces instead of stacked balls. Each is the
// iso-surface of a few ellipsoids and rods blended together (a signed distance, smooth union: the brow runs into the temples, the cheekbones
// into the jaw), found along the rays of a sphere from the middle of the head and lit by the field's own gradient, so there is no seam and no
// crease where two parts meet. The hair and the beard are the same field grown outward where they grow (a soft hairline, a beard that thins
// up the cheeks), so they fit the face they sit on. Built once per shape and level (shapes.js), in the frame of the head joint: the base of
// the neck at 0, the eyes at 0.18, the chin at 0.065, the crown at 0.3; the face atlas (unittex.js) is laid flat on the front.
import * as THREE from 'three';
import { PAT } from './modelkit.js';

// ---------------------------------------------------------------- the distance field
const sdEll = (x, y, z, c, r) => {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
};
const sdRod = (x, y, z, a, b, ra, rb) => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2];
  const h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// The face of a man: `f` tunes it (brow: how heavy the brow ridge; jaw: how broad; nose: how big; cheek: cheekbones; age: hollower
// cheeks and a longer face). Returns the signed distance at (x, y, z).
export function faceField(f = {}) {
  const brow = f.brow || 1, jaw = f.jaw || 1, nose = f.nose || 1, cheek = f.cheek || 1, age = f.age || 0;
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = sdEll(ax, y, z, [0, 0.205, -0.008], [0.077, 0.097, 0.097]);                                    // the skull
    d = smin(d, sdEll(ax, y, z, [0, 0.152 - age * 0.004, 0.022], [0.064, 0.08 + age * 0.004, 0.071]), 0.03);   // the face
    d = smin(d, sdEll(ax, y, z, [0, 0.106, 0.027], [0.055 * jaw, 0.048, 0.062]), 0.026);                        // the jaw
    d = smin(d, sdEll(ax, y, z, [0, 0.074, 0.064], [0.024 * jaw, 0.02, 0.019]), 0.016);                         // the chin
    if (d > 0.045 || z < 0.0) return d;   // (the features below are all on the front of the face, none stands 4 cm off it)
    d = smin(d, sdEll(ax, y, z, [0.043, 0.162, 0.058], [0.025 * cheek, 0.016, 0.024]), 0.014);                 // a cheekbone
    d = smin(d, sdEll(ax, y, z, [0, 0.202, 0.081], [0.064, 0.015 * brow, 0.022 * brow]), 0.012);                 // the brow ridge
    d = smin(d, sdRod(ax, y, z, [0, 0.19, 0.089], [0, 0.141, 0.111 + 0.004 * nose], 0.007, 0.0105 * nose), 0.009);   // the nose
    d = smin(d, sdEll(ax, y, z, [0.0115, 0.138, 0.099], [0.0105 * nose, 0.0085, 0.0095]), 0.006);              // a nostril's wing
    d = smin(d, sdEll(ax, y, z, [0, 0.112, 0.083], [0.02, 0.0065, 0.0095]), 0.006);                             // the upper lip
    d = smin(d, sdEll(ax, y, z, [0, 0.099, 0.081], [0.018, 0.007, 0.0095]), 0.006);                             // the lower lip
    d = smax(d, -sdEll(ax, y, z, [0, 0.1055, 0.091], [0.019, 0.0018, 0.012]), 0.003);                           // the line of the mouth
    d = smax(d, -sdEll(ax, y, z, [0.033, 0.18, 0.089], [0.023, 0.0145, 0.016]), 0.01);                          // an eye socket
    d = smin(d, sdEll(ax, y, z, [0.033, 0.179, 0.071], [0.016, 0.0105, 0.012]), 0.004);                         // the eye under its lid
    if (age > 0) d = smax(d, -sdEll(ax, y, z, [0.047, 0.125, 0.07], [0.018, 0.022, 0.012]), 0.012 * age);      // hollow cheeks
    return d;
  };
}

const O = [0, 0.17, 0.004];   // where the rays start: inside every head
const RMAX = 0.26;
// the distance along the ray (dx, dy, dz) from O to the outermost surface of field `F`: marched in from outside by the field's own distance
// (a few steps; the smooth unions understate it a little, so the step is shortened), then pinned between the last two points
function rayHit(F, dx, dy, dz) {
  let r = RMAX, prev = RMAX;
  for (let i = 0; i < 40; i++) {
    const f = F(O[0] + dx * r, O[1] + dy * r, O[2] + dz * r);
    if (f < 0.0002) {
      if (f > -0.0002 || i === 0) return r;
      let a = r, b = prev;   // (stepped past it: a inside, b outside)
      for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (F(O[0] + dx * m, O[1] + dy * m, O[2] + dz * m) > 0) b = m; else a = m; }
      return (a + b) / 2;
    }
    prev = r;
    r -= Math.max(f * 0.9, 0.0004);
    if (r < 0.01) return 0.01;
  }
  return r;
}

// A closed surface of field `F` as a geometry: a sphere of nu x nv cut, each vertex pushed out along its ray to the surface, the normal from
// the field. `keep(x, y, z, n)` -> false drops the triangles whose three corners all fail it (the parts of a hair cap that lie on the skin).
export function fieldGeometry(F, nu, nv, keep = null) {
  const g = new THREE.SphereGeometry(1, nu, nv);
  const pa = g.attributes.position, na = g.attributes.normal;
  const e = 0.0012, ok = keep ? new Uint8Array(pa.count) : null;
  for (let i = 0; i < pa.count; i++) {
    let dx = pa.getX(i), dy = pa.getY(i), dz = pa.getZ(i);
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const r = rayHit(F, dx, dy, dz);
    const x = O[0] + dx * r, y = O[1] + dy * r, z = O[2] + dz * r;
    pa.setXYZ(i, x, y, z);
    let gx = F(x + e, y, z) - F(x - e, y, z), gy = F(x, y + e, z) - F(x, y - e, z), gz = F(x, y, z + e) - F(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    na.setXYZ(i, gx, gy, gz);
    if (ok) ok[i] = keep(x, y, z) ? 1 : 0;
  }
  if (ok) {
    const idx = g.index.array, kept = [];
    for (let t = 0; t < idx.length; t += 3) if (ok[idx[t]] || ok[idx[t + 1]] || ok[idx[t + 2]]) kept.push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex(kept);
  }
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------- what is laid on the face
// (the face atlas's planar projection: the eyes at u 0.5 +- 0.18, v 0.555; the back of the head reads none of it)
export const faceUV = (x, y, z) => (z < 0.0 ? [-3, -3] : [x / 0.175 + 0.5, (y - 0.167) / 0.234 + 0.5]);
const RES = [[30, 22], [20, 14], [12, 9]];
// (the same face, hair or beard is wanted by many shapes, a kettle hat's and a crown's alike: each surface is found once per level)
const made = new Map();
function cached(key, make) {
  let g = made.get(key);
  if (!g) { g = make(); made.set(key, g); }
  return g;
}
const I4 = new THREE.Matrix4();

// the head itself (skin, the face atlas on the front)
// (shade: the baked light from the chin to the crown; a hood's deep shadow is darker)
export function sculptHead(b, f = {}, shade = null) {
  const [nu, nv] = RES[Math.min(2, b.level)];
  const g = cached(`h${JSON.stringify(f)}|${b.level}`, () => fieldGeometry(faceField(f), nu, nv));
  b.add(g, I4, { s: 'skin', m: 'skin', p: PAT.face, uv: faceUV, a: shade || [0.78, 1] });
}

// How far the hair stands off the scalp at a point, by cut: 0 short, 1 long (to the shoulders behind), 2 thinning on the crown, 3 a
// warrior's top-knot cut (shaved sides, a thick ridge); `wild` roughs it up (locks that stand out).
function hairDepth(cut, wild = 0) {
  return (x, y, z) => {
    const ax = Math.abs(x);
    // the hairline: high on the forehead, down round the temples, over the ears, low at the nape
    const front = sstep(0.215, 0.245, y + 0.02 * sstep(0.03, 0.07, ax)) * (z > 0.03 ? 1 : 0);
    const side = sstep(0.17, 0.2, y) * (1 - sstep(0.06, 0.03, z)) * (z <= 0.03 ? 1 : 0);
    const back = sstep(cut === 1 ? 0.06 : 0.115, cut === 1 ? 0.09 : 0.14, y) * sstep(0.02, -0.03, z);
    let m = Math.max(front, side, back);
    if (ax > 0.06 && y < 0.2 && y > 0.12 && z > -0.035 && z < 0.03) m *= sstep(0.165, 0.2, y);   // (round the ears)
    let t = 0.006 + 0.012 * sstep(0.18, 0.3, y) + 0.004 * sstep(0.0, -0.08, z);
    if (cut === 1) t += 0.012 * sstep(0.2, 0.08, y) * sstep(0.0, -0.06, z);
    if (cut === 2) m *= 1 - sstep(0.27, 0.29, y) * sstep(-0.02, 0.04, z + 0.03);
    if (cut === 3) { m *= sstep(0.03, 0.022, ax) + (1 - sstep(0.03, 0.022, ax)) * 0.18; t += 0.01 * sstep(0.03, 0.0, ax) * sstep(0.2, 0.28, y); }
    if (wild) t += wild * 0.006 * Math.sin(x * 160 + z * 90) * Math.sin(y * 140 - z * 70);
    return t * m;
  };
}
// hair over the head of face `f` (cut as above), in the hair colour, with strands in the shader
export function sculptHair(b, f, cut, o = {}) {
  const [nu, nv] = RES[Math.min(2, b.level)];
  const g = cached(`r${JSON.stringify(f)}|${cut}|${o.wild || 0}|${b.level}`, () => {
    const head = faceField(f), dep = hairDepth(cut, o.wild || 0);
    const F = (x, y, z) => head(x, y, z) - dep(x, y, z) + 0.0007;
    return fieldGeometry(F, Math.round(nu * 0.75), Math.round(nv * 0.75), (x, y, z) => dep(x, y, z) > 0.0018);
  });
  b.add(g, I4, { s: 'hair', m: 'hair', p: PAT.hair, a: [0.55, 1], ...o.opt });
}
// A beard on the face `f`: big scales it, shape 0 trimmed close, 1 full and rounded, 2 long (to the chest), 3 forked in two braids' roots.
export function sculptBeard(b, f, big = 1, shape = 1, o = {}) {
  const [nu, nv] = RES[Math.min(2, b.level)];
  const g = cached(`b${JSON.stringify(f)}|${big}|${shape}|${b.level}`, () => beardGeometry(f, big, shape, nu, nv));
  b.add(g, I4, { s: 'hair', m: 'hair', p: PAT.hair, a: [0.6, 1], ...o.opt });
}
function beardGeometry(f, big, shape, nu, nv) {
  const head = faceField(f);
  const dep = (x, y, z) => {
    const ax = Math.abs(x);
    if (z < -0.035) return 0;
    // up the jaw to the sideburns, round the mouth, a moustache over the lip
    let m = sstep(0.16, 0.13, y) * sstep(-0.035, -0.005, z);
    if (ax < 0.045 && y > 0.118) m *= sstep(0.13, 0.122, y) * (ax < 0.03 ? 1 : 0);
    if (z > 0.06) m *= 1 - sstep(0.03, 0.018, ax) * sstep(0.084, 0.094, y) * sstep(0.12, 0.112, y);   // (the mouth stays bare)
    let t = (0.006 + 0.014 * sstep(0.13, 0.07, y) * sstep(0.0, 0.05, z)) * big;
    if (shape === 0) t *= 0.55;
    return t * m;
  };
  let F = (x, y, z) => head(x, y, z) - dep(x, y, z) + 0.0007;
  if (shape >= 1) {
    const low = shape === 2 ? [[0, 0.02, 0.07], [0.04 * big, 0.065 * big, 0.034]] : shape === 3 ? [[0, 0.045, 0.072], [0.042 * big, 0.04 * big, 0.03]] : [[0, 0.06, 0.068], [0.044 * big, 0.034 * big, 0.034]];
    const G = F;
    F = (x, y, z) => smin(G(x, y, z), sdEll(Math.abs(x), y, z, low[0], low[1]), 0.02);
  }
  return fieldGeometry(F, Math.round(nu * 0.75), Math.round(nv * 0.85), (x, y, z) => dep(x, y, z) > 0.0015 || (shape >= 1 && y < 0.075 && z > 0.0));
}
