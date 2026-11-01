// The giant: a two-headed ettin, bald and bearded, bare-chested and hunched, in a shaggy fur kilt with a round iron boss on the belt, its
// forearms and shins bound in rags, swinging a stone-headed hammer. It is a rig like a soldier's (the same joints plus a second head, so
// crowd.js draws it as instances of shared shapes: both heads are one shape), with its own shapes and proportions and its own motion
// (poseGiant, poseGiantDead), which sets every joint itself: a heavy gait whose feet stay planted (the legs reach for them), a blow with
// a wind-up, an impact and a recovery, heads that look about, hits that rock it and falls that land.
// Its house shows in the sash across the chest, the banner on the kilt (with the house emblem) and the rag tied under the hammer's head.
// Shapes are modelled in the joints' frames in the units of a 1.8 m man (the body joint scales the whole rig up by GIANT_SCALE). The
// bodies are sculpted: a smooth loft of rings pushed out by muscles that swell into each other (sculpt), the grooves between them shaded
// darker, so the skin reads as flesh over muscle and not as balls stuck together.
import * as THREE from 'three';
import { PAT, SKIRT } from './modelkit.js';
import { SHAPES, getShape } from './shapes.js';
import { emblemCell, setRigEmblem } from './unittex.js';

export const GIANT_SCALE = 3.2;
export const GIANT_TILT = -0.75;   // the hammer's angle in the fist (the haft runs down and forward out of it, the head by his feet)
const TAU = Math.PI * 2, PI = Math.PI;

const K = {
  fur: 0x5c4430, furLt: 0x7a5a3a, furDk: 0x3a2a1c, rag: 0x2e2822, ragLt: 0x433a2f, ragDk: 0x221d18, cord: 0x6e5a3e, cordDk: 0x4e3e2a,
  iron: 0x3c3c40, ironLt: 0x5a5a5e, stone: 0x8a8780, stoneDk: 0x6a6862, wood: 0x5a3e24, bone: 0xd8ccb0, nail: 0x9a8a70, belt: 0x4a3420,
  grip: 0x3a2a1a, mouth: 0x1a0e0a, eyeWhite: 0x8a7c66,
};
const skin = { s: 'skin', m: 'skin', p: PAT.skin }, skinDk = { s: 'skinDark', m: 'skin', p: PAT.skin };
const fur = { c: K.fur, m: 'fur', p: PAT.grain }, furLt = { c: K.furLt, m: 'fur', p: PAT.grain }, furDk = { c: K.furDk, m: 'fur', p: PAT.grain };
const rag = { c: K.rag, m: 'wool', p: PAT.weave }, ragLt = { c: K.ragLt, m: 'wool', p: PAT.weave }, ragDk = { c: K.ragDk, m: 'wool', p: PAT.weave };
const cord = { c: K.cord, m: 'leather', p: PAT.grain }, cordDk = { c: K.cordDk, m: 'leather', p: PAT.grain };
const hair = { s: 'hair', m: 'hair', p: PAT.grain };
const team = { s: 'cloth', m: 'cloth', p: PAT.weave };
const def = (name, make, open = false) => SHAPES.set(name, { name, make, open, geo: [null, null, null, null] });
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3();
const frame = (p, r, s = 1) => new THREE.Matrix4().compose(_P.fromArray(p), _Q.setFromEuler(_E.set(r[0], r[1], r[2])), typeof s === 'number' ? _S.set(s, s, s) : _S.fromArray(s));
const IDENT = new THREE.Matrix4();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (k) => k * k * (3 - 2 * k);
const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// ---------------------------------------------------------------- tools of the giant's own (used while a shape is built, never per frame)
// a repeatable value noise of a point (the same wherever and whenever a shape is built)
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const L = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), fx), L(h(0, 1, 0), h(1, 1, 0), fx), fy), L(L(h(0, 0, 1), h(1, 0, 1), fx), L(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
const crm = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
// the ring of a body at height y, [y, half width, half depth, z offset, x offset]: a smooth curve through the key rings (listed up or down)
function ringAt(keys, y, out) {
  const n = keys.length, up = keys[n - 1][0] > keys[0][0];
  let i = 0;
  while (i < n - 2 && (up ? y > keys[i + 1][0] : y < keys[i + 1][0])) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const f = clamp01((y - k1[0]) / (k2[0] - k1[0]));
  out[0] = y;
  for (let c = 1; c < 5; c++) out[c] = crm(k0[c] || 0, k1[c] || 0, k2[c] || 0, k3[c] || 0, f);
  out[1] = Math.max(0.0008, out[1]); out[2] = Math.max(0.0008, out[2]);
  return out;
}
// muscles: E an ellipsoidal swelling (h < 0 a hollow), C one along a segment (a vein, a groove, a ridge); t tints it (1.2 lighter: a scar)
const E = (c, r, h, t) => ({ c, r, h, t });
const C = (a, b, r, h, t) => ({ a, b, r, h, t });
const mirror = (fn) => [fn(1), fn(-1)];
function field(bumps, x, y, z, out) {
  let d = 0, t = 0;
  for (let i = 0; i < bumps.length; i++) {
    const B = bumps[i];
    let q;
    if (B.c) {
      const dx = (x - B.c[0]) / B.r[0], dy = (y - B.c[1]) / B.r[1], dz = (z - B.c[2]) / B.r[2];
      q = dx * dx + dy * dy + dz * dz;
    } else {
      const a = B.a, b = B.b, ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
      const h = clamp01(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez || 1));
      const px = x - a[0] - ex * h, py = y - a[1] - ey * h, pz = z - a[2] - ez * h;
      q = (px * px + py * py + pz * pz) / (B.r * B.r);
    }
    if (q < 1) { const f = (1 - q) * (1 - q); d += B.h * f; if (B.t) t += (B.t - 1) * f; }
  }
  out[0] = d; out[1] = t;
  return out;
}
const _fd = [0, 0], _rg = [0, 0, 0, 0, 0];

// A sculpted body: rings through `keys` ([y, half width, half depth, z, x], a superellipse each: o.sq), o.rows of them (or the heights
// o.ys), o.seg round (o.arc [start, length] keeps part of the way round; o.warp crowds the columns to the front), pushed out along the
// normal by `bumps`; o.post(pos, rows, cols) may move the points first (a ragged hem). The grooves are shaded darker (o.cav), the
// tinted bumps lighter or darker. Added to the builder with the usual options (colour, slot, pattern, sway...).
function sculpt(b, keys, o, bumps = []) {
  const n = Math.max(3, o.seg), closed = !o.arc, a0 = closed ? 0 : o.arc[0], al = closed ? TAU : o.arc[1], e = 2 / (o.sq || 2);
  const cols = closed ? n : n + 1, warp = o.warp || 0;
  const y0 = keys[0][0], y1 = keys[keys.length - 1][0];
  const nr = Math.max(2, o.rows || 2), ys = o.ys || Array.from({ length: nr }, (_, j) => y0 + ((y1 - y0) * j) / (nr - 1));
  const rows = ys.length, nv = rows * cols;
  const pos = new Float32Array(nv * 3), idx = [];
  for (let j = 0; j < rows; j++) {
    ringAt(keys, ys[j], _rg);
    for (let i = 0; i < cols; i++) {
      const u = a0 + (al * i) / n, t = closed ? u - warp * Math.sin(u) : u, k = (j * cols + i) * 3;
      pos[k] = _rg[4] + _rg[1] * sp(Math.sin(t), e); pos[k + 1] = ys[j]; pos[k + 2] = _rg[3] + _rg[2] * sp(Math.cos(t), e);
    }
  }
  if (o.post) o.post(pos, rows, cols);
  const down = y1 < y0;   // (rings listed downward wind the other way round)
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * cols + i, a1 = j * cols + ((i + 1) % cols), c = a + cols, c1 = a1 + cols;
      if (down) idx.push(a, c, a1, a1, c, c1); else idx.push(a, a1, c, a1, c1, c);
    }
  }
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3);
  g.setAttribute('position', pa);
  g.setIndex(idx);
  g.computeVertexNormals();
  const na = g.attributes.normal, disp = new Float32Array(nv), tint = new Float32Array(nv);
  if (bumps.length) {
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      field(bumps, x, y, z, _fd);
      disp[v] = _fd[0]; tint[v] = _fd[1];
      pos[v * 3] += na.getX(v) * _fd[0]; pos[v * 3 + 1] += na.getY(v) * _fd[0]; pos[v * 3 + 2] += na.getZ(v) * _fd[0];
    }
    g.computeVertexNormals();
  }
  // (the grooves: how far each point lies below its neighbours' average)
  const shade = new Float32Array(nv).fill(1), cav = o.cav === undefined ? 24 : o.cav;
  if (bumps.length && cav) {
    let sm = disp.slice();
    for (let pass = 0; pass < 2; pass++) {
      const nx = new Float32Array(nv);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const v = j * cols + i, l = closed ? j * cols + ((i + cols - 1) % cols) : j * cols + Math.max(0, i - 1), r = closed ? j * cols + ((i + 1) % cols) : j * cols + Math.min(cols - 1, i + 1);
          const u = Math.max(0, j - 1) * cols + i, d = Math.min(rows - 1, j + 1) * cols + i;
          nx[v] = (sm[v] * 2 + sm[l] + sm[r] + sm[u] + sm[d]) / 6;
        }
      }
      sm = nx;
    }
    for (let v = 0; v < nv; v++) shade[v] = clamp(1 - (sm[v] - disp[v]) * cav + tint[v], 0.62, 1.3);
  } else if (bumps.length) for (let v = 0; v < nv; v++) shade[v] = clamp(1 + tint[v], 0.62, 1.3);
  const base = b.count;
  b.add(g, IDENT, o);
  for (let v = 0; v < nv; v++) { const c = (base + v) * 3; b.C[c] *= shade[v]; b.C[c + 1] *= shade[v]; b.C[c + 2] *= shade[v]; }
  g.dispose();
  return b;
}
// a point on a sculpted body's surface at height y, `ang` round from the front (+z, toward +x), `lift` above it
function surf(keys, sq, bumps, y, ang, lift = 0) {
  ringAt(keys, y, _rg);
  const e = 2 / (sq || 2), s = sp(Math.sin(ang), e), c = sp(Math.cos(ang), e);
  const x = _rg[4] + _rg[1] * s, z = _rg[3] + _rg[2] * c;
  let nx = s / _rg[1], nz = c / _rg[2];
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  field(bumps, x, y, z, _fd);
  const d = _fd[0] + lift;
  return [x + nx * d, y, z + nz * d];
}
// a flat strip along a path (a sash, a strap, a rag), w wide and th thick, lying against a body whose outward way at a point is out(p, n)
function band(b, pts, w, th, o, out) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const segs = o.segs || 12, P = o.sides || 8, pos = [], idx = [];
  const p = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3();
  for (let s = 0; s <= segs; s++) {
    const u = s / segs;
    curve.getPointAt(u, p); curve.getTangentAt(u, T);
    out(p, N);
    Bn.crossVectors(T, N).normalize(); N.crossVectors(Bn, T).normalize();
    const ww = w * (o.wv ? o.wv(u) : 1), lift = o.fold ? o.fold(u) : 0;
    for (let k = 0; k < P; k++) {
      const a = (k / P) * TAU, cx = sp(Math.cos(a), 0.45) * ww * 0.5, cy = sp(Math.sin(a), 0.45) * th * 0.5 + lift;
      pos.push(p.x + Bn.x * cx + N.x * cy, p.y + Bn.y * cx + N.y * cy, p.z + Bn.z * cx + N.z * cy);
    }
  }
  for (let s = 0; s < segs; s++) for (let k = 0; k < P; k++) { const a = s * P + k, a1 = s * P + ((k + 1) % P); idx.push(a, a1, a + P, a1, a1 + P, a + P); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  b.add(g, IDENT, o);
  g.dispose();
}
// A rough block of stone: a rounded box `s` big, lumpy (noise) and chipped (flat cuts off its corners and edges), faceted; the chips are
// fresher, lighter stone. seed varies it.
function rock(b, c, s, rot, o, seed, cuts) {
  const sg = o.seg || 6;
  const g = new THREE.BoxGeometry(1, 1, 1, sg, sg, sg).toNonIndexed();
  const pa = g.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const th = hash3(seed, k, 1) * TAU, ph = Math.acos(hash3(seed, k, 2) * 2 - 1);
    planes.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 0.36 + hash3(seed, k, 3) * 0.1]);
  }
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    const m = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * 2 || 1;
    v.divideScalar(m);   // (on the cube's surface)
    q.copy(v).normalize().multiplyScalar(0.5);
    v.lerp(q, o.round || 0.35);
    const n1 = noise3(v.x * 4 + seed, v.y * 4, v.z * 4), n2 = noise3(v.x * 9, v.y * 9 + seed, v.z * 9);
    v.multiplyScalar(1 + 0.1 * (n1 - 0.5) + 0.05 * (n2 - 0.5));
    for (const [nx, ny, nz, d] of planes) {
      const t = v.x * nx + v.y * ny + v.z * nz;
      if (t > d) { v.x -= nx * (t - d); v.y -= ny * (t - d); v.z -= nz * (t - d); }
    }
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  // (shade per face: chips lighter, the rest mottled)
  const base = b.count;
  b.place(g, c, rot, s, { ...o, flat: true });
  const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  const pn = planes.map(([x, y, z]) => new THREE.Vector3(x / s[0], y / s[1], z / s[2]).applyMatrix4(R).normalize());
  for (let f = base; f < b.count; f += 3) {
    const nx = b.N[f * 3], ny = b.N[f * 3 + 1], nz = b.N[f * 3 + 2];
    let k = 0.9 + 0.2 * noise3(b.P[f * 3] * 14 + seed, b.P[f * 3 + 1] * 14, b.P[f * 3 + 2] * 14);
    for (const n of pn) if (n.x * nx + n.y * ny + n.z * nz > 0.985) { k = 1.22; break; }
    for (let i = f; i < f + 3; i++) { b.C[i * 3] *= k; b.C[i * 3 + 1] *= k; b.C[i * 3 + 2] *= k; }
  }
}
// a hanging lock of hair or fur: from `a` down to `c`, bending through `m`, r thick at the root
const lock = (b, a, m, c, r, o) => b.sweep([a, m, c], r, r * 0.12, { seg: b.pick(5, 4, 3), segs: b.pick(6, 4, 3), ...o });

// ---------------------------------------------------------------- the trunk (torso frame, the waist): a barrel chest under a wall of
// trapezius that rises between and behind the necks, heavy pectorals, a ridged but thick belly, lats that flare under the arms
const TRUNK = [[-0.14, 0.19, 0.15, 0.018], [-0.05, 0.194, 0.153, 0.022], [0.04, 0.199, 0.155, 0.024], [0.12, 0.21, 0.155, 0.02], [0.2, 0.237, 0.158, 0.012],
  [0.27, 0.263, 0.163, 0.006], [0.33, 0.276, 0.158, -0.004], [0.38, 0.27, 0.145, -0.014], [0.425, 0.242, 0.13, -0.022], [0.465, 0.205, 0.114, -0.026],
  [0.5, 0.16, 0.098, -0.024], [0.53, 0.105, 0.078, -0.02], [0.548, 0.03, 0.03, -0.02]];
const TRUNK_SQ = 2.3;
const TRUNK_B = [
  ...mirror((s) => E([s * 0.115, 0.29, 0.152], [0.12, 0.085, 0.09], 0.042)),                      // pectorals
  ...mirror((s) => C([s * 0.035, 0.214, 0.17], [s * 0.2, 0.236, 0.115], 0.02, -0.009)),           // (their heavy lower edge)
  C([0, 0.2, 0.172], [0, 0.37, 0.158], 0.022, -0.011),                                             // the breastbone
  ...[0, 1, 2].flatMap((r) => mirror((s) => E([s * 0.048, 0.155 - r * 0.066, 0.17 - r * 0.002], [0.042, 0.03, 0.05], 0.016))),   // the belly
  C([0, -0.07, 0.176], [0, 0.19, 0.172], 0.012, -0.006),
  E([0, -0.04, 0.168], [0.12, 0.07, 0.1], 0.01),
  ...mirror((s) => E([s * 0.168, 0.0, 0.095], [0.06, 0.1, 0.08], 0.018)),                         // obliques
  ...[0, 1, 2].flatMap((k) => mirror((s) => E([s * (0.205 + k * 0.004), 0.215 - k * 0.042, 0.09 - k * 0.006], [0.03, 0.016, 0.04], 0.008))),   // serratus
  ...mirror((s) => C([s * 0.04, 0.405, 0.12], [s * 0.21, 0.41, 0.05], 0.016, 0.007)),             // collarbones
  E([0, 0.47, -0.04], [0.26, 0.08, 0.13], 0.04),                                                  // the trapezius, up behind the necks
  E([0, 0.32, -0.15], [0.1, 0.16, 0.06], 0.012),
  ...mirror((s) => E([s * 0.125, 0.31, -0.145], [0.085, 0.1, 0.06], 0.018)),                      // shoulder blades
  ...mirror((s) => E([s * 0.2, 0.19, -0.08], [0.07, 0.15, 0.1], 0.034)),                          // lats
  C([0, -0.14, -0.162], [0, 0.42, -0.15], 0.022, -0.012),                                          // the spine
  ...mirror((s) => C([s * 0.045, -0.14, -0.15], [s * 0.04, 0.17, -0.16], 0.035, 0.012)),
  ...mirror((s) => E([s * 0.275, 0.37, -0.004], [0.07, 0.08, 0.1], 0.016)),                       // round the shoulder joints
];
const TRUNK_DETAIL = [
  C([0.02, 0.335, 0.17], [0.165, 0.175, 0.162], 0.008, 0.0035, 1.2), C([-0.12, 0.1, 0.172], [-0.05, -0.02, 0.174], 0.007, 0.003, 1.16),   // old scars
  C([-0.07, 0.4, -0.12], [-0.17, 0.25, -0.15], 0.007, 0.003, 1.18),
  ...mirror((s) => E([s * 0.11, 0.245, 0.185], [0.011, 0.011, 0.01], 0.004, 0.75)),             // nipples
  E([0, -0.005, 0.18], [0.012, 0.015, 0.012], -0.006, 0.8),                                       // the navel
  ...mirror((s) => C([s * 0.16, 0.06, 0.13], [s * 0.1, -0.12, 0.165], 0.008, 0.0025, 0.9)),      // veins down to the groin
];
def('giant.chest', (b) => {
  const lv = b.level, lo = lv >= 2;
  sculpt(b, TRUNK, { ...skin, sq: TRUNK_SQ, a: [0.74, 1], seg: b.pick(44, 30, 14), rows: b.pick(30, 20, 8), cav: lo ? 0 : 36 }, lv < 1 ? TRUNK_B.concat(TRUNK_DETAIL) : lv < 3 ? TRUNK_B : []);
  // the house sash, over the left shoulder and across to the right hip, and round the back: a broad worn band, ragged at the ends
  const S = (y, ang, l) => surf(TRUNK, TRUNK_SQ, TRUNK_B, y, ang, l);
  const out = (p, n) => n.set(p.x, 0, p.z + 0.01).normalize();
  band(b, [S(0.47, 0.75, 0.012), S(0.36, 0.42, 0.022), S(0.22, 0.05, 0.02), S(0.07, -0.42, 0.016), S(-0.07, -0.95, 0.016)], 0.075, 0.012,
    { ...team, a: [0.82, 1], segs: b.pick(18, 12, 5), sides: b.pick(8, 6, 4), fold: (u) => 0.004 * Math.sin(u * 23) }, out);
  if (!lo) band(b, [S(0.47, 0.75, 0.012), S(0.33, 2.3, 0.016), S(0.16, 2.95, 0.016), S(0.0, -2.55, 0.016), S(-0.07, -0.95, 0.016)], 0.07, 0.012,
    { ...team, a: [0.72, 0.9], segs: b.pick(16, 10, 6), sides: b.pick(8, 6, 4), fold: (u) => 0.004 * Math.sin(u * 19) }, out);
  if (lv < 1) {
    // the frayed end of the sash, hanging at the hip
    for (let k = 0; k < 3; k++) b.sheet([-0.165 + k * 0.022, -0.115, 0.118 - k * 0.012], 0.024, 0.07, 1, 3, { ...team, rot: [0.1, -0.7, 0.05 * k], w: [0.6, 0.1], dz: (x, y) => 0.006 * Math.sin(y * 50 + k) });
    // a cord of teeth and bones round the base of the necks
    const ring = [-1.25, -0.8, -0.35, 0, 0.35, 0.8, 1.25].map((a) => S(0.42 - Math.cos(a) * 0.05, a, 0.012));
    b.sweep(ring, 0.006, 0.006, { ...cord, seg: 4, segs: 16 });
    for (let k = -3; k <= 3; k++) {
      const p = S(0.375 + Math.abs(k) * 0.012, k * 0.2, 0.014);
      b.cone(p, [p[0] * 1.08, p[1] - 0.05 + Math.abs(k) * 0.004, p[2] + 0.012], 0.011, { c: K.bone, m: 'bone', seg: 5 });
    }
  }
}, true);

// ---------------------------------------------------------------- the heads (each on its own joint at the base of its neck: both are this
// one shape). Bald, heavy-browed and scowling, deep-set eyes, a broad flattened nose, a long shaggy beard over the chest.
const HEAD = [[-0.1, 0.092, 0.088, 0.0], [-0.02, 0.088, 0.083, 0.0], [0.05, 0.08, 0.078, 0.004], [0.075, 0.075, 0.088, 0.016], [0.095, 0.076, 0.1, 0.02],
  [0.12, 0.078, 0.104, 0.02], [0.145, 0.082, 0.104, 0.013], [0.17, 0.086, 0.102, 0.006], [0.198, 0.089, 0.1, 0.0], [0.228, 0.087, 0.096, -0.008],
  [0.258, 0.076, 0.084, -0.014], [0.282, 0.056, 0.064, -0.018], [0.298, 0.03, 0.036, -0.02], [0.306, 0.003, 0.003, -0.02]];
const HEAD_B = [
  C([-0.058, 0.197, 0.086], [0.058, 0.197, 0.086], 0.024, 0.016),                                 // the brow ridge
  E([0, 0.19, 0.1], [0.022, 0.018, 0.016], 0.008),                                                 // knotted in a scowl
  ...mirror((s) => C([s * 0.068, 0.207, 0.074], [s * 0.012, 0.192, 0.098], 0.016, 0.008)),
  ...mirror((s) => E([s * 0.034, 0.171, 0.095], [0.026, 0.016, 0.022], -0.016)),                  // eye sockets
  ...mirror((s) => E([s * 0.056, 0.15, 0.078], [0.03, 0.02, 0.03], 0.01)),                        // cheekbones
  ...mirror((s) => E([s * 0.055, 0.124, 0.082], [0.025, 0.02, 0.03], -0.004)),
  C([0, 0.178, 0.1], [0, 0.146, 0.112], 0.014, 0.016),                                             // the nose: bridge, ball, wings
  E([0, 0.138, 0.112], [0.026, 0.018, 0.02], 0.02),
  ...mirror((s) => E([s * 0.019, 0.134, 0.104], [0.014, 0.012, 0.014], 0.01)),
  E([0, 0.12, 0.105], [0.04, 0.016, 0.025], 0.008),                                                // the muzzle
  C([-0.03, 0.103, 0.104], [0, 0.109, 0.11], 0.006, -0.004), C([0, 0.109, 0.11], [0.03, 0.103, 0.104], 0.006, -0.004),   // a grim mouth
  E([0, 0.088, 0.1], [0.03, 0.02, 0.02], 0.01),                                                    // the chin
  ...mirror((s) => E([s * 0.07, 0.093, 0.035], [0.025, 0.025, 0.035], 0.01)),                     // the angles of the jaw
  ...mirror((s) => E([s * 0.083, 0.205, 0.045], [0.02, 0.03, 0.03], -0.005)),                     // temples
  E([0, 0.21, -0.09], [0.06, 0.04, 0.03], 0.006),
  ...mirror((s) => C([s * 0.062, 0.1, -0.005], [s * 0.02, -0.06, 0.07], 0.022, 0.008)),           // the cords of the neck
  E([0, 0.04, 0.08], [0.015, 0.015, 0.012], 0.006),
];
const HEAD_DETAIL = [
  C([-0.045, 0.229, 0.093], [0.045, 0.229, 0.093], 0.005, -0.0025), C([-0.04, 0.243, 0.088], [0.04, 0.243, 0.088], 0.005, -0.002),   // a furrowed brow
  ...mirror((s) => C([s * 0.008, 0.19, 0.102], [s * 0.012, 0.212, 0.098], 0.004, -0.002)),
  C([0.03, 0.272, 0.05], [0.072, 0.2, 0.07], 0.007, 0.003, 1.22), C([-0.05, 0.29, -0.01], [-0.02, 0.26, -0.07], 0.006, 0.0025, 1.18),   // scars
  ...mirror((s) => C([s * 0.086, 0.232, 0.028], [s * 0.081, 0.19, 0.056], 0.006, 0.002, 0.9)),   // veins at the temples
  ...mirror((s) => C([s * 0.07, 0.05, 0.04], [s * 0.05, -0.06, 0.06], 0.007, 0.0025, 0.9)),
];
// the beard hangs from the jaw in a mass, ragged at the bottom, with locks over it
const BEARD = [[0.118, 0.08, 0.104, 0.02], [0.095, 0.086, 0.112, 0.024], [0.06, 0.088, 0.114, 0.032], [0.02, 0.083, 0.106, 0.044], [-0.03, 0.074, 0.092, 0.056],
  [-0.08, 0.06, 0.074, 0.066], [-0.13, 0.042, 0.052, 0.072], [-0.175, 0.022, 0.03, 0.076], [-0.2, 0.006, 0.01, 0.078]];
const BEARD_B = [...mirror((s) => C([s * 0.03, 0.04, 0.12], [s * 0.025, -0.15, 0.1], 0.02, 0.008)), C([0, 0.06, 0.13], [0, -0.17, 0.11], 0.016, -0.006)];
// (the face atlas's eye, laid on the eyeball: its almond, iris and lid)
const eyeUV = (s) => (x, y) => [0.5 + s * 0.18 + (x - s * 0.034) * 5, 0.555 + (y - 0.17) * 5];
function oneHead(b) {
  const lv = b.level;
  if (lv >= 3) {
    sculpt(b, HEAD, { ...skin, sq: 2.15, seg: 7, rows: 5, cav: 0, a: [0.7, 1] });
    sculpt(b, BEARD, { ...hair, seg: 5, rows: 3, arc: [-2.1, 4.2], cav: 0 });
    return;
  }
  const ys = lv < 1 ? [-0.1, -0.04, 0.02, 0.055, ...Array.from({ length: 19 }, (_, i) => 0.072 + i * 0.0088), 0.242, 0.26, 0.276, 0.29, 0.3, 0.306]
    : lv < 2 ? [-0.1, -0.03, 0.03, 0.065, ...Array.from({ length: 13 }, (_, i) => 0.078 + i * 0.012), 0.24, 0.262, 0.282, 0.297, 0.306] : null;
  sculpt(b, HEAD, { ...skin, sq: 2.15, a: [0.72, 1], seg: b.pick(40, 30, 10), warp: lv < 2 ? 0.35 : 0, ys, rows: 7, cav: lv < 2 ? 30 : 0 },
    lv < 1 ? HEAD_B.concat(HEAD_DETAIL) : lv < 2 ? HEAD_B : HEAD_B.slice(0, 1));
  // the beard: a mass from the jaw down over the chest (wrapping round to the ears), streaked
  sculpt(b, BEARD, { ...hair, a: [0.55, 1], seg: b.pick(22, 16, 7), rows: b.pick(12, 8, 4), arc: [-2.15, 4.3], cav: 0,
    post: (pos, rows, cols) => {   // (ragged at the bottom, and higher at the sides where it runs up into the sideburns)
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3, side = Math.abs(i / (cols - 1) - 0.5) * 2;
        if (j === 0) pos[k + 1] += 0.03 * side * side;
        if (j >= rows - 2) pos[k + 1] -= 0.035 * hash3(i, j, 3) * (j === rows - 1 ? 1 : 0.4);
      }
    } }, lv < 2 ? BEARD_B : []);
  for (const s of [-1, 1]) {
    // sideburns, from the temples down the cheeks into the beard
    if (lv < 2) b.sweep([[s * 0.083, 0.195, 0.03], [s * 0.087, 0.16, 0.045], [s * 0.084, 0.12, 0.055], [s * 0.078, 0.08, 0.062]], 0.01, 0.018, { ...hair, seg: b.pick(6, 5, 4), segs: b.pick(6, 4, 3), a: [0.6, 0.9] });
    // the ears: thick and battered
    b.ell([s * 0.086, 0.166, -0.006], [0.013, 0.026, 0.019], { ...skin, a: [0.72, 0.95], rot: [0, s * 0.3, s * -0.1], seg: [b.pick(8, 6, 4), b.pick(6, 4, 3)] });
  }
  if (lv >= 2) return;
  for (const s of [-1, 1]) {
    // deep-set eyes under heavy lids, and bushy brows knotted down in the middle
    b.ell([s * 0.034, 0.169, 0.08], [0.017, 0.0095, 0.011], { ...skin, p: PAT.face, uv: eyeUV(s), seg: [b.pick(10, 8, 6), b.pick(8, 6, 4)] });
    b.ell([s * 0.034, 0.1755, 0.0858], [0.022, 0.0085, 0.0125], { ...skin, a: [0.78, 0.95], rot: [0.2, 0, s * -0.3], seg: [b.pick(9, 7, 5), 5] });   // the upper lid, half shut
    b.ell([s * 0.034, 0.1625, 0.086], [0.018, 0.004, 0.009], { ...skin, a: [0.8, 0.95], rot: [-0.2, 0, s * 0.1], seg: [b.pick(8, 6, 5), 4] });
    b.ell([s * 0.037, 0.1975, 0.1015], [0.031, 0.0095, 0.012], { ...hair, a: [0.55, 0.85], rot: [0.3, 0, s * -0.42], seg: [b.pick(8, 6, 5), 4] });
    // the moustache, drooping past the corners of the mouth into the beard
    b.sweep([[s * 0.008, 0.124, 0.118], [s * 0.035, 0.118, 0.11], [s * 0.055, 0.095, 0.098], [s * 0.056, 0.06, 0.097]], 0.013, 0.007, { ...hair, seg: b.pick(6, 5, 4), segs: b.pick(8, 5, 4), a: [0.6, 1] });
  }
  b.ell([0, 0.106, 0.107], [0.026, 0.006, 0.008], { c: K.mouth, m: 'skin', seg: [8, 4] });   // (the mouth's shadow under the moustache)
  // locks over the beard, of different lengths, some curling in
  const locks = lv < 1 ? 16 : 8;
  for (let k = 0; k < locks; k++) {
    const u = (k + 0.5) / locks, ang = -1.45 + u * 2.9 + (hash3(k, 1, 2) - 0.5) * 0.15;
    const y = 0.06 - Math.abs(ang) * 0.03 - hash3(k, 2, 1) * 0.06;
    const a = surf(BEARD, 2, [], y, ang, -0.004), len = 0.1 + hash3(k, 3, 3) * 0.12 - Math.abs(ang) * 0.025;
    const curl = (hash3(k, 4, 1) - 0.5) * 0.04;
    b.sweep([a, [a[0] * 0.97 + curl, a[1] - len * 0.35, a[2] + 0.01], [a[0] * 0.92 - curl * 0.5, a[1] - len * 0.7, a[2] + 0.008], [a[0] * 0.86 + curl, a[1] - len, a[2] + 0.002]],
      0.017 + hash3(k, 5, 2) * 0.009, 0.002, { ...hair, a: [0.45 + hash3(k, 6, 1) * 0.2, 0.92], seg: b.pick(5, 4, 3), segs: b.pick(6, 4, 3) });
  }
}
def('giant.head', (b) => oneHead(b), true);

// ---------------------------------------------------------------- the pelvis (frame 2 cm above the hip joints): a thick leather belt over
// the hips, the kilt of shaggy hides to the knees (overlapping, ragged at the hem, tufted), the house banner down the front with the
// emblem on it, the round iron boss, a pouch and a string of trophies
const SEAT = [[0.17, 0.188, 0.15, 0.02], [0.1, 0.203, 0.158, 0.016], [0.02, 0.214, 0.166, 0.012], [-0.06, 0.216, 0.166, 0.004], [-0.12, 0.202, 0.152, -0.004]];
const KILT = [[0.06, 0.232, 0.184, 0.014], [-0.04, 0.244, 0.194, 0.016], [-0.16, 0.262, 0.214, 0.022], [-0.28, 0.282, 0.236, 0.03], [-0.38, 0.296, 0.252, 0.036]];
def('giant.pelvis', (b) => {
  const lv = b.level, lo = lv >= 2;
  // the hips and the small of the back above the belt (the trunk's lower edge disappears into them however he leans)
  sculpt(b, SEAT, { ...skin, sq: 2.3, a: [0.7, 0.95], seg: b.pick(32, 22, 12), rows: b.pick(6, 5, 2), cav: 0 });
  // the belt, thick, with a rolled top edge, and a cord wound above it
  sculpt(b, [[0.112, 0.222, 0.177, 0.016], [0.105, 0.228, 0.183, 0.016], [0.07, 0.232, 0.186, 0.016], [0.035, 0.231, 0.185, 0.015], [0.028, 0.224, 0.179, 0.015]],
    { c: K.belt, m: 'leather', p: PAT.leather, sq: 2.3, a: [0.75, 1], seg: b.pick(40, 28, 14), rows: lo ? 3 : 5, cav: 0 });
  if (!lo) b.torus([0, 0.12, 0.016], 0.214, 0.007, { rot: [PI / 2, 0, 0], sc: [1, 0.8, 1], ...cord, sides: 4, seg: b.pick(36, 24, 12) });
  // the kilt: hides, each flaring from the belt to a ragged hem, longer at the front and back; tufts along the hems
  const n = b.pick(9, 7, 4), span = TAU / n;
  for (let i = 0; i < n; i++) {
    const a0 = -PI + i * span - 0.12, o = i % 3 === 0 ? furLt : i % 3 === 1 ? fur : furDk, rz = (i % 2) * 0.01;
    const keys = KILT.map(([y, rx, rzz, z]) => [y, rx + rz, rzz + rz, z]);
    const front = Math.cos(a0 + span / 2);
    keys[keys.length - 1][0] = -0.36 - 0.04 * Math.abs(front) - (i % 2) * 0.015;
    sculpt(b, keys, { ...o, arc: [a0, span + 0.24], sq: 2.2, seg: b.pick(9, 7, 4), rows: b.pick(9, 6, 3), a: [0.62, 1], w: [SKIRT + 0.85, SKIRT], cav: 0,
      post: (pos, rows, cols) => {
        for (let c = 0; c < cols; c++) {
          const k = ((rows - 1) * cols + c) * 3, jag = hash3(i, c, 7);
          pos[k + 1] -= 0.045 * jag * jag + (c % 2) * 0.012;
          // (the hide wrinkles: a ripple round it, deeper toward the hem)
          for (let j = 1; j < rows; j++) { const q = (j * cols + c) * 3, f = 1 + 0.035 * (j / (rows - 1)) * Math.sin(c * 2.1 + i); pos[q] *= f; pos[q + 2] = (pos[q + 2] - 0.02) * f + 0.02; }
        }
      } });
    if (lv < 2) {
      for (let k = 0; k < (lv < 1 ? 4 : 2); k++) {
        const a = a0 + ((k + 0.5 + (hash3(k, i, 2) - 0.5) * 0.5) / (lv < 1 ? 4 : 2)) * span, len = 0.08 + hash3(i, k, 9) * 0.09;
        const hem = keys[keys.length - 1][0] + 0.03;
        const p = surf(keys, 2.2, [], hem, a, 0.004);
        lock(b, p, [p[0] * 1.04, hem - len * 0.5, p[2] * 1.04], [p[0] * 1.03, hem - len, p[2] * 1.03], 0.03, { ...o, w: [SKIRT + 0.95, SKIRT + 0.8], seg: 4, segs: lv < 1 ? 4 : 3 });
      }
      if (lv < 1) for (let k = 0; k < 2; k++) {
        // (and shaggy clumps over the hide itself)
        const a = a0 + (k + 0.3 + hash3(i, k, 4) * 0.4) * (span / 2), y = -0.1 - hash3(k, i, 5) * 0.16;
        const p = surf(keys, 2.2, [], y, a, 0.003);
        lock(b, p, [p[0] * 1.02, y - 0.04, p[2] * 1.02], [p[0] * 1.01, y - 0.09, p[2] * 1.01], 0.022, { ...o, w: [SKIRT + 0.7, SKIRT + 0.4], seg: 4, segs: 4 });
      }
    }
  }
  // the banner down the front of the kilt, the house's colour and emblem, its hem ragged
  sculpt(b, [[0.03, 0.245, 0.198, 0.018], [-0.12, 0.27, 0.222, 0.026], [-0.3, 0.3, 0.25, 0.038], [-0.37, 0.31, 0.258, 0.042]],
    { ...team, p: PAT.emblem, uv: [0, -0.15, 0.17, 0.24], arc: [-0.3, 0.6], sq: 2.2, seg: b.pick(8, 6, 3), rows: b.pick(8, 5, 3), a: [0.75, 1], w: [SKIRT + 0.9, SKIRT], cav: 0,
      post: (pos, rows, cols) => { for (let c = 0; c < cols; c++) pos[((rows - 1) * cols + c) * 3 + 1] -= 0.03 * hash3(c, 2, 8) + (c % 2) * 0.01; } });
  // the iron boss on the belt: a dented dome in a rim, riveted
  b.lathe([[0.0, 0.03], [0.035, 0.027], [0.065, 0.017], [0.086, 0.004], [0.094, -0.008], [0.09, -0.016]], [0, 0.07, 0.19], { rot: [PI / 2 - 0.12, 0, 0], c: K.iron, m: 'iron', a: [0.75, 1], seg: b.pick(24, 16, 6) });
  if (!lo) {
    b.torus([0, 0.07, 0.19], 0.092, 0.011, { rot: [-0.12, 0, 0], c: K.ironLt, m: 'iron', sides: 5, seg: b.pick(24, 16, 9) });
    b.ell([0, 0.073, 0.221], [0.022, 0.022, 0.012], { c: K.ironLt, m: 'iron', rot: [-0.12, 0, 0], seg: [8, 5] });
    if (lv < 1) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.ell([Math.cos(a) * 0.072, 0.07 + Math.sin(a) * 0.072, 0.208 - Math.sin(a) * 0.009], [0.008, 0.008, 0.006], { c: K.ironLt, m: 'iron', seg: [5, 3] }); }
    // a pouch on the left hip and a string of bones on the right
    b.rbox([0.215, -0.02, 0.06], [0.06, 0.09, 0.05], { c: 0x4e3a26, m: 'leather', p: PAT.leather, e: 0.6, rot: [0, 1.2, -0.08], w: [SKIRT + 0.2, SKIRT] });
    if (lv < 1) {
      b.ell([0.218, 0.03, 0.062], [0.034, 0.012, 0.03], { c: 0x3e2e1e, m: 'leather', rot: [0, 1.2, 0] });
      b.sweep([[-0.225, 0.07, 0.07], [-0.24, 0.0, 0.08], [-0.245, -0.07, 0.075]], 0.005, 0.005, { ...cord, seg: 4, segs: 6 });
      for (let k = 0; k < 3; k++) b.rod([-0.24, -0.01 - k * 0.03, 0.082], [-0.25, -0.04 - k * 0.03, 0.09], 0.008, 0.006, { c: K.bone, m: 'bone', seg: 5, w: [SKIRT + 0.3, SKIRT + 0.1] });
    }
  }
}, true);

// ---------------------------------------------------------------- legs (hip frame, knee frame): thick bare thighs, the knee balls kept round
// so a bent knee shows no gap; the shins bound in layered rags tied with cord; huge bare feet with toes and nails. (Both legs share the
// shapes, so they are modelled the same either side.)
const THIGH = [[0.09, 0.06, 0.06, 0.0], [0.05, 0.108, 0.112, -0.004], [-0.03, 0.118, 0.123, 0.01], [-0.12, 0.115, 0.12, 0.02], [-0.2, 0.105, 0.11, 0.022],
  [-0.28, 0.091, 0.096, 0.016], [-0.35, 0.079, 0.082, 0.01], [-0.41, 0.071, 0.074, 0.006], [-0.45, 0.066, 0.07, 0.004]];
const THIGH_B = [
  E([0, -0.2, 0.08], [0.08, 0.15, 0.06], 0.026),                                                   // quadriceps
  ...mirror((s) => E([s * 0.058, -0.33, 0.055], [0.045, 0.06, 0.05], 0.016)),                     // (the teardrops over the knee)
  E([0, -0.42, 0.066], [0.035, 0.04, 0.025], 0.012),                                               // the kneecap
  E([0, -0.2, -0.085], [0.08, 0.14, 0.05], 0.014),                                                 // hamstrings
  ...mirror((s) => C([s * 0.112, -0.08, 0.0], [s * 0.078, -0.38, 0.0], 0.015, -0.004)),
  C([0, -0.03, 0.115], [0, -0.36, 0.08], 0.01, -0.003),
];
const THIGH_DETAIL = [C([0.06, -0.06, 0.1], [0.02, -0.26, 0.118], 0.007, 0.0025, 0.9), C([-0.09, -0.15, 0.06], [-0.04, -0.3, 0.08], 0.006, 0.003, 1.18)];
def('giant.thigh', (b) => {
  const lv = b.level;
  sculpt(b, THIGH, { ...skin, a: [0.82, 0.98], seg: b.pick(26, 18, 9), rows: b.pick(19, 12, 5), cav: lv < 2 ? 44 : 0 }, lv < 1 ? THIGH_B.concat(THIGH_DETAIL) : lv < 3 ? THIGH_B : []);
  b.ell([0, 0.03, 0], [0.106, 0.075, 0.11], { ...skin, a: [0.95, 0.97], seg: b.ellSeg(0.11) });
  if (lv < 2) b.ell([0, -0.42, 0.004], [0.066, 0.068, 0.068], { ...skin, a: [0.9, 0.9], seg: [b.pick(12, 9, 6), b.pick(9, 7, 4)] });   // the knee
});
const CALF = [[0.03, 0.066, 0.068, 0.0], [-0.03, 0.072, 0.08, -0.012], [-0.09, 0.076, 0.088, -0.022], [-0.15, 0.072, 0.084, -0.022], [-0.22, 0.064, 0.072, -0.014],
  [-0.3, 0.056, 0.06, -0.006], [-0.37, 0.05, 0.054, 0.0], [-0.42, 0.05, 0.054, 0.0]];
const CALF_B = [...mirror((s) => E([s * 0.036, -0.1, -0.075], [0.042, 0.08, 0.04], 0.014)), C([0, -0.03, 0.074], [0, -0.3, 0.058], 0.012, 0.004)];
// the foot, built lengthways (its frame turned so the rings run from the heel to the toes): [z, half width, half height, -y of the middle]
const FOOT = [[-0.08, 0.026, 0.026, 0.469], [-0.06, 0.05, 0.04, 0.455], [-0.02, 0.06, 0.05, 0.445], [0.04, 0.072, 0.046, 0.449], [0.1, 0.085, 0.036, 0.459],
  [0.15, 0.093, 0.028, 0.467], [0.185, 0.09, 0.022, 0.473], [0.2, 0.08, 0.018, 0.477]];
const FOOT_B = [C([-0.035, 0.0, 0.05], [0.1, 0.0, 0.035], 0.03, 0.006), ...mirror((s) => C([s * 0.03, 0.02, 0.04], [s * 0.05, 0.16, 0.025], 0.012, 0.003))];
// toes: [x, radius, length]: the middle three a little bigger
const TOES = [[-0.068, 0.019, 0.042], [-0.035, 0.023, 0.052], [0.0, 0.025, 0.058], [0.035, 0.023, 0.052], [0.068, 0.019, 0.042]];
function foot(b) {
  const lv = b.level;
  b.ell([0, -0.43, -0.005], [0.058, 0.05, 0.06], { ...skin, a: [0.85, 0.9], seg: [b.pick(12, 9, 6), b.pick(8, 6, 4)] });   // the ankle
  if (lv < 2) for (const s of [-1, 1]) b.ell([s * 0.054, -0.432, -0.006], [0.016, 0.022, 0.02], { ...skin, seg: [6, 4] });   // (its bones)
  // (in the foot's frame: y forward, z down, so a ring's half depth is its height and its offset how far down it sits)
  b.within(frame([0, 0, 0], [PI / 2, 0, 0]), () => sculpt(b, FOOT.map(([z, hw, hh, dy]) => [z, hw, hh, dy]), { ...skin, sq: 2.5, a: [0.82, 1], seg: b.pick(20, 14, 7), rows: b.pick(12, 8, 4), cav: lv < 2 ? 20 : 0 }, lv < 2 ? FOOT_B : []));
  if (lv >= 2) { b.rbox([0, -0.482, 0.22], [0.16, 0.035, 0.06], { ...skin, e: 0.7 }); return; }
  for (const [x, r, l] of TOES) {
    b.ell([x, -0.48, 0.18 + l * 0.45], [r, r * 0.9, l * 0.55], { ...skin, a: [0.8, 1], seg: [b.pick(7, 6, 4), b.pick(5, 4, 3)] });
    b.ell([x * 1.04, -0.483, 0.18 + l * 1.05], [r * 0.9, r * 0.8, l * 0.42], { ...skin, a: [0.78, 1], seg: [b.pick(7, 6, 4), b.pick(5, 4, 3)] });
    b.ell([x * 1.04, -0.469, 0.18 + l * 1.28], [r * 0.6, r * 0.28, r * 0.5], { c: K.nail, m: 'bone', rot: [0.3, 0, 0], seg: [b.pick(6, 5, 4), 3] });
  }
}
// a ragged wrapping round a limb, `from` to `to` (y), over the limb's rings: overlapping bands at a slant, lighter and darker, with frayed
// flaps and a cord wound over it and knotted
function wraps(b, keys, from, to, pad, cords, seed) {
  const lv = b.level, n = lv < 1 ? 7 : lv < 2 ? 5 : 2, h = (to - from) / n;
  for (let k = 0; k < n; k++) {
    const yc = from + h * (k + 0.5);
    ringAt(keys, yc, _rg);
    const j = hash3(seed, k, 5), rx = _rg[1] + pad + j * 0.003, rz = _rg[2] + pad + j * 0.003, z = _rg[3], tilt = (k % 2 ? 0.22 : -0.18) + (hash3(seed, k, 1) - 0.5) * 0.14;
    const o = j > 0.75 ? ragLt : j > 0.35 ? rag : ragDk, hh = Math.abs(h) * 0.8;
    b.within(frame([0, yc, z], [tilt, 0, (hash3(seed, k, 2) - 0.5) * 0.08]), () =>
      sculpt(b, [[hh, rx * 0.97, rz * 0.97, 0], [hh * 0.6, rx, rz, 0], [-hh * 0.6, rx, rz, 0], [-hh, rx * 0.97, rz * 0.97, 0]],
        { ...o, a: [0.7, 1], seg: b.pick(22, 16, 8), rows: lv < 2 ? 3 : 2, cav: 0 }));
    if (lv < 1 && hash3(seed, k, 3) > 0.45) {
      // a frayed flap hanging off the band's edge
      const a = hash3(seed, k, 4) * TAU, s = Math.sin(a), c = Math.cos(a);
      b.sheet([s * (rx + 0.006), yc - hh * 0.9, z + c * (rz + 0.006)], 0.022, 0.04, 1, 2, { ...o, rot: [0.1, a, 0], w: [0.5, 0], dz: (x, y) => 0.004 * Math.sin(y * 60) });
    }
  }
  if (lv >= 2) return;
  cords.forEach((y, k) => {
    ringAt(keys, y, _rg);
    const R = (_rg[1] + _rg[2]) * 0.5 + pad + 0.008;
    b.torus([0, y, _rg[3]], R, 0.0065, { rot: [PI / 2 + (k % 2 ? 0.16 : -0.16), 0, 0], sc: [_rg[1] / _rg[2], 1, 1], ...cord, sides: 4, seg: b.pick(14, 10, 8) });
  });
  if (lv < 1) {
    // the knot of the top cord, its ends hanging
    const y = cords[0];
    ringAt(keys, y, _rg);
    const kx = _rg[1] + pad + 0.012;
    b.ell([kx * 0.7, y, _rg[3] + _rg[2] * 0.75], [0.012, 0.01, 0.01], { ...cordDk, seg: [6, 4] });
    for (const d of [-1, 1]) b.sweep([[kx * 0.7, y, _rg[3] + _rg[2] * 0.78], [kx * 0.72 + d * 0.01, y - 0.035, _rg[3] + _rg[2] * 0.82], [kx * 0.7 + d * 0.016, y - 0.07, _rg[3] + _rg[2] * 0.8]], 0.005, 0.003, { ...cordDk, seg: 4, segs: 4 });
  }
}
def('giant.shin', (b) => {
  const lv = b.level;
  b.ell([0, 0, 0.004], [0.066, 0.068, 0.068], { ...skin, a: [0.9, 0.9], seg: [b.pick(12, 9, 5), b.pick(9, 7, 4)] });
  sculpt(b, CALF, { ...skin, a: [0.86, 0.94], seg: b.pick(22, 16, 8), rows: b.pick(13, 9, 4), cav: lv < 2 ? 24 : 0 }, lv < 3 ? CALF_B : []);
  wraps(b, CALF, -0.13, -0.425, 0.006, [-0.16, -0.25, -0.33, -0.41], 3);
  b.ell([0, -0.43, -0.004], [0.054, 0.046, 0.056], { ...skin, a: [0.85, 0.9], seg: [b.pick(10, 8, 5), b.pick(7, 5, 4)] });   // (the ankle, for the foot to turn in)
});
// the foot, on its own joint at the ankle so it can lie flat whatever the shin does (built in the knee's frame, moved up to the ankle)
def('giant.foot', (b) => b.within(frame([0, 0.43, 0], [0, 0, 0]), () => foot(b)));

// ---------------------------------------------------------------- arms (shoulder frame, elbow frame): the top of the arm is a ball round
// the shoulder joint (so the arm turns in it without a gap) swelling into the deltoid, bulging biceps and triceps; forearms like hams,
// rag-bound from the middle to the wrist; a fist clenched round the haft's line (the weapon frame's), its other hand the same
const UPPER = [[0.112, 0.012, 0.012, 0], [0.09, 0.072, 0.066, 0.0], [0.04, 0.12, 0.108, 0.0], [-0.02, 0.13, 0.114, 0.0], [-0.08, 0.12, 0.112, 0.004],
  [-0.15, 0.106, 0.112, 0.008], [-0.22, 0.093, 0.098, 0.006], [-0.28, 0.078, 0.082, 0.002], [-0.33, 0.067, 0.069, 0], [-0.37, 0.061, 0.063, 0]];
const UPPER_B = [
  ...mirror((s) => C([s * 0.095, -0.03, 0], [s * 0.065, -0.17, 0.006], 0.045, 0.016)),            // the deltoid's point
  E([0, -0.02, 0.07], [0.08, 0.09, 0.05], 0.02), E([0, -0.03, -0.07], [0.08, 0.09, 0.05], 0.018),   // its front and rear heads
  ...mirror((s) => C([s * 0.12, 0.02, 0.0], [s * 0.1, -0.12, 0.0], 0.012, -0.005)),
  E([0, -0.135, 0.09], [0.07, 0.022, 0.04], -0.008),
  E([0, -0.205, 0.075], [0.058, 0.09, 0.05], 0.04),                                                // biceps
  ...mirror((s) => E([s * 0.075, -0.24, 0.02], [0.03, 0.07, 0.04], 0.012)),                        // (brachialis, between them)
  E([0, -0.17, -0.075], [0.065, 0.11, 0.05], 0.034),                                               // triceps
  ...mirror((s) => E([s * 0.05, -0.15, -0.058], [0.035, 0.07, 0.04], 0.01)),
  E([0, -0.335, -0.06], [0.03, 0.03, 0.02], 0.008),                                                // the point of the elbow
];
const UPPER_DETAIL = [C([0.03, -0.12, 0.1], [0.014, -0.3, 0.085], 0.009, 0.0035, 0.9), C([-0.02, -0.2, 0.11], [-0.04, -0.31, 0.08], 0.008, 0.003, 0.9)];
def('giant.arm', (b) => {
  const lv = b.level;
  sculpt(b, UPPER, { ...skin, a: [0.8, 1], seg: b.pick(26, 18, 9), rows: b.pick(19, 12, 6), cav: lv < 2 ? 46 : 0 }, lv < 1 ? UPPER_B.concat(UPPER_DETAIL) : lv < 3 ? UPPER_B : []);
  if (lv < 3) b.ell([0, -0.33, 0], [0.066, 0.068, 0.068], { ...skin, a: [0.88, 0.9], seg: [b.pick(12, 9, 6), b.pick(9, 7, 4)] });   // the elbow
});
const FORE = [[0.03, 0.06, 0.06, 0], [0.0, 0.077, 0.075, 0.004], [-0.05, 0.087, 0.078, 0.008], [-0.1, 0.083, 0.074, 0.006], [-0.15, 0.074, 0.065, 0.004],
  [-0.2, 0.065, 0.056, 0.002], [-0.26, 0.056, 0.049, 0], [-0.31, 0.052, 0.046, 0]];
const FORE_B = [E([0, -0.055, 0.045], [0.06, 0.07, 0.04], 0.026), E([0, -0.07, -0.04], [0.055, 0.08, 0.04], 0.018), ...mirror((s) => E([s * 0.06, -0.03, 0.01], [0.03, 0.06, 0.04], 0.012))];
const FORE_DETAIL = [C([0.02, -0.01, 0.072], [0.035, -0.11, 0.07], 0.009, 0.003, 0.9), C([-0.03, -0.02, 0.07], [-0.045, -0.1, 0.06], 0.008, 0.0025, 0.9)];
// the fist, built round the haft (its frame's y): the fingers wound round it, knuckles out, the thumb across, the heel of the hand on
// the wrist's side; the hole is filled (the empty hand clenches on nothing)
function giantFist(b) {
  const lv = b.level;
  b.within(frame([0, -0.362, 0.004], [GIANT_TILT, 0, 0]), () => {
    b.ell([0, 0.0, 0.02], [0.07, 0.075, 0.075], { ...skin, a: [0.82, 1], seg: [b.pick(12, 9, 6), b.pick(9, 7, 5)] });   // the palm
    if (lv >= 2) { b.rbox([0, -0.01, -0.02], [0.13, 0.12, 0.1], { ...skin, e: 0.7 }); return; }
    b.rod([0, 0.05, 0], [0, -0.07, 0], 0.048, 0.048, { ...skin, seg: b.pick(10, 8, 6) });
    for (let k = 0; k < 4; k++) {
      const y = 0.042 - k * 0.029, R = 0.066 - Math.abs(k - 1.3) * 0.003;
      b.torus([0, y, 0], R, 0.019, { rot: [PI / 2, 0, PI * 0.5], sc: [0.86, 1, 1], ...skin, a: [0.66, 1], sides: b.pick(6, 5, 4), seg: b.pick(12, 10, 8) });
      b.ell([0, y, -R - 0.006], [0.026, 0.018, 0.018], { ...skin, a: [0.8, 1.08], seg: [b.pick(6, 5, 4), 4] });   // a knuckle
    }
    b.sweep([[0.06, 0.07, 0.03], [0.055, 0.075, -0.035], [0.02, 0.06, -0.075], [-0.02, 0.045, -0.08]], 0.024, 0.018, { ...skin, seg: b.pick(7, 5, 4), segs: b.pick(6, 4, 3) });   // the thumb
    b.ell([0, 0.065, 0.05], [0.06, 0.04, 0.045], { ...skin, a: [0.85, 1] });   // the heel of the hand
  });
}
def('giant.fore', (b) => {
  const lv = b.level;
  if (lv >= 3) {
    b.rod([0, 0.02, 0], [0, -0.3, 0], 0.068, 0.048, { ...rag, seg: 4 });
    b.rbox([0, -0.37, 0.0], [0.12, 0.13, 0.13], { ...skin, seg: [4, 2] });
    return;
  }
  b.ell([0, 0.0, 0], [0.068, 0.07, 0.07], { ...skin, a: [0.88, 0.9], seg: [b.pick(12, 9, 6), b.pick(9, 7, 4)] });
  sculpt(b, FORE.slice(0, 5), { ...skin, a: [0.85, 0.95], seg: b.pick(24, 16, 8), rows: b.pick(11, 7, 4), cav: lv < 2 ? 24 : 0 }, lv < 1 ? FORE_B.concat(FORE_DETAIL) : FORE_B);
  wraps(b, FORE, -0.1, -0.315, 0.006, [-0.13, -0.2, -0.27], 5);
  giantFist(b);
});

// ---------------------------------------------------------------- the hammer (weapon frame, at the fist: the head is down -y): a rough
// chipped stone lashed crosswise to a stout, crooked, knotted haft, cord wound under the head, a leather grip, the house's rag
def('giant.hammer', (b) => {
  const lv = b.level, lo = lv >= 2;
  const woodM = { c: K.wood, m: 'wood', p: PAT.grain };
  b.sweep([[0, 0.34, 0], [0.006, 0.1, -0.004], [0.01, -0.28, 0.004], [-0.006, -0.62, 0.008], [0, -0.98, 0]], 0.044, 0.056, { ...woodM, seg: b.pick(10, 7, 5), segs: b.pick(16, 8, 4) });
  if (lv < 1) for (const [y, a] of [[-0.4, 1.1], [-0.55, -2.0], [-0.22, 2.6]]) b.ell([Math.sin(a) * 0.05, y, Math.cos(a) * 0.05], [0.016, 0.026, 0.016], { ...woodM, c: 0x4a3018, rot: [0, a, 0], seg: [6, 4] });   // knots
  // the stone: a heavy block across the haft, its two faces battered
  rock(b, [0, -0.98, 0], [0.3, 0.33, 0.58], [0.04, 0.06, 0.02], { c: K.stone, m: 'bone', a: [0.72, 1], seg: b.pick(7, 5, 3), round: 0.3 }, 3.7, lo ? 3 : 9);
  if (!lo) {
    // the lashing: cord crossed over the stone and wound round the haft above it
    for (const r of [-0.42, 0.42]) b.torus([0, -0.98, 0], 0.168, 0.009, { rot: [r, 0, 0], sc: [0.92, 1.12, 1], ...cordDk, sides: 4, seg: b.pick(18, 12, 8) });
    b.torus([0, -0.98, 0], 0.158, 0.01, { rot: [0, 0, 0], sc: [0.98, 1.06, 1], ...cord, sides: 4, seg: b.pick(18, 12, 8) });
    b.lathe(Array.from({ length: 13 }, (_, k) => [0.06 + (k % 2) * 0.006, -0.83 + k * 0.012]), [0, 0, 0], { ...cord, seg: b.pick(10, 7, 5) });
    // the grip: wound with leather where the fist holds it, and a knob at the butt
    b.lathe(Array.from({ length: 17 }, (_, k) => [0.05 + (k % 2) * 0.005 + (k === 0 || k === 16 ? -0.004 : 0), -0.12 + k * 0.016]), [0, 0, 0], { c: K.grip, m: 'leather', p: PAT.leather, seg: b.pick(10, 7, 5) });
    b.ell([0, 0.35, 0], [0.058, 0.045, 0.058], { ...woodM, seg: [b.pick(9, 7, 5), 5] });
  }
  // the house's rag, bound round the haft under the head, its ends hanging loose
  b.lathe([[0.063, -0.74], [0.068, -0.71], [0.065, -0.685], [0.068, -0.66], [0.063, -0.64]], [0, 0, 0], { ...team, seg: b.pick(10, 7, 4) });
  if (!lo) for (const s of [-1, 1]) b.sheet([s * 0.035, -0.77, 0.07], 0.05, 0.1, 1, b.pick(5, 3, 2), { ...team, rot: [0, s * 0.3, s * 0.12], w: [0.95, 0.15], dz: (x, y) => 0.02 * Math.sin(y * 20) + 0.01 * Math.sin(x * 60) });
}, true);

// ---------------------------------------------------------------- the rig
const SKIN = [0x7d6446, 0x6f6141, 0x86694a, 0x776340];   // weathered, earthy: brown to olive
const BEARDS = [0x6e4a2c, 0x7a5432, 0x5c3e26, 0x84603a];
const FACE = [1, 5, 1, 6];   // (the scowling faces of the atlas; 6 has dark war paint)
const _col = new THREE.Color();
function setColor(arr, i, hex) { _col.set(hex); arr[i] = _col.r; arr[i + 1] = _col.g; arr[i + 2] = _col.b; }
const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const off = () => ({ node: new THREE.Group(), shape: null, on: false });   // (the plumes and kit of a soldier: a giant neither trains nor ranks up)
const HEAD_X = 0.108, HIP_X = 0.112, SHOULDER = [0.275, 0.365, -0.004];

// The giant's rig: a soldier's joints (see buildSoldier), and a second head. `cloth` is the house colour.
export function buildGiant(type, teamId, variant, cloth, desc) {
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  body.scale.setScalar(GIANT_SCALE);
  const pelvis = joint(body, 0, 0.93, 0);
  const hipL = joint(pelvis, HIP_X, -0.03, 0), hipR = joint(pelvis, -HIP_X, -0.03, 0);
  const kneeL = joint(hipL, 0, -0.42, 0), kneeR = joint(hipR, 0, -0.42, 0);
  const ankleL = joint(kneeL, 0, -0.43, 0), ankleR = joint(kneeR, 0, -0.43, 0);
  const torso = joint(pelvis, 0, 0.1, 0);
  const head = joint(torso, HEAD_X, 0.415, 0.07), head2 = joint(torso, -HEAD_X, 0.415, 0.07);
  head.scale.setScalar(1.08); head2.scale.setScalar(1.08);
  const shL = joint(torso, SHOULDER[0], SHOULDER[1], SHOULDER[2]), shR = joint(torso, -SHOULDER[0], SHOULDER[1], SHOULDER[2]);
  const elL = joint(shL, 0, -0.33, 0), elR = joint(shR, 0, -0.33, 0);
  const weapon = joint(elR, 0, -0.362, 0.004);
  weapon.rotation.x = GIANT_TILT;
  const parts = [];
  const add = (node, name) => { const p = { node, shape: getShape(name), on: true }; parts.push(p); return p; };
  add(pelvis, 'giant.pelvis'); add(torso, 'giant.chest'); add(head, 'giant.head'); add(head2, 'giant.head');
  add(hipL, 'giant.thigh'); add(hipR, 'giant.thigh'); add(kneeL, 'giant.shin'); add(kneeR, 'giant.shin'); add(ankleL, 'giant.foot'); add(ankleR, 'giant.foot');
  add(shL, 'giant.arm'); add(shR, 'giant.arm'); add(elL, 'giant.fore'); add(elR, 'giant.fore');
  const weaponPart = add(weapon, 'giant.hammer');
  const v = variant % 4;
  const m = {
    kind: 'soldier', type, team: teamId, variant, desc: { ...desc, shield: null }, raider: false, root, body, pelvis, torso, head, head2, hipL, hipR, kneeL, kneeR, ankleL, ankleR,
    shL, shR, elL, elR, weapon, cape: null, weaponTilt: GIANT_TILT, weaponRoll: 0, ranged: false, lance: false, mounted: false, parts, kit: off(), plumeC: off(), plumeG: off(),
    weaponPart, bowPart: null, kitArms: [], kitShield: null, tier: 0, rank: 1, inst: new Float32Array(16), headYaw: 0, hero: null, giant: true, farKey: type,
    // (what the motion remembers between frames: its clock, how far into a walk it is, the rock of the last hit, the hammer's rest)
    gs: { idle: -1, walk: 0, hurt: 0, rx: 0, rv: 0, zx: 0, zv: 0, side: 1, tilt: GIANT_TILT, seed: (variant * 1.37) % 7 },
  };
  setColor(m.inst, 0, cloth);
  setColor(m.inst, 4, SKIN[v]);
  setColor(m.inst, 8, BEARDS[(variant + 1) % 4]);
  m.baseBits = 0;
  m.inst[3] = 0;
  m.faceIdx = FACE[v];
  setRigEmblem(m, emblemCell(teamId));
  m.inst[12] = (variant * 0.37 + teamId * 0.11) % 1;
  root.userData.rig = m;
  return m;
}

// ---------------------------------------------------------------- the motion
// The walk: its phase runs at GIANT_GAIT times a soldier's (units.js advances it by distance), so a step is about 2 m whatever the pace,
// about 1.7 a second at full speed. Each foot is planted for STANCE of a stride and moves back under him at his own speed, so it stays
// where it landed; the legs reach for the feet (legIK), and a foot rolls from heel to toe as the shin slants over it.
export const GIANT_GAIT = 0.75;
// the footfall a walk phase is on (units.js shakes the ground when it changes: each heel strike)
export const giantStep = (ph) => Math.floor((ph * GIANT_GAIT) / PI);
// how long into each death (poseDeath's kinds) the body hits the ground (units.js throws up the dust then)
export const GIANT_FALL = [1.12, 1.45, 1.18];
const STANCE = 0.58, STEP = PI / (2.1 * GIANT_GAIT) / GIANT_SCALE, HS = STANCE * STEP;   // (body units)
const LT = 0.42, LS = 0.43, ANK = 0.066, HEEL = -0.075, TOE = 0.245, FOOT_X = 0.138;
const LEG = Math.sqrt(LT * LT + LS * LS + 2 * LT * LS * Math.cos(0.3));   // (hip to ankle, the knee soft but nearly straight)
// the lower of two heights, rounded where they cross (the hips pass from one leg to the other without a kink)
const smin = (a, b) => (Math.abs(a - b) > 0.2 ? Math.min(a, b) : -0.02 * Math.log(Math.exp(-a / 0.02) + Math.exp(-b / 0.02)));
const _v = new THREE.Vector3(), _qp = new THREE.Quaternion(), _ep = new THREE.Euler();

// Hip and knee of one leg so that its ankle reaches (tx, ty, tz) in the body's frame (unscaled). Returns the shin's slant.
function legIK(m, hip, knee, tx, ty, tz) {
  const P0 = m.pelvis;
  _qp.setFromEuler(_ep.set(P0.rotation.x, P0.rotation.y, P0.rotation.z)).invert();
  _v.set(tx - P0.position.x, ty - P0.position.y, tz - P0.position.z).applyQuaternion(_qp);
  let vx = _v.x - hip.position.x, vy = _v.y - hip.position.y, vz = _v.z - hip.position.z;
  let d = Math.hypot(vx, vy, vz);
  const dmax = (LT + LS) * 0.997;
  if (d > dmax) { const k = dmax / d; vx *= k; vy *= k; vz *= k; d = dmax; }
  const k = Math.acos(clamp((d * d - LT * LT - LS * LS) / (2 * LT * LS), -1, 1));
  const P = LT + LS * Math.cos(k), Q = -LS * Math.sin(k);
  const phi = Math.asin(clamp(vx / P, -0.5, 0.5));
  let th = Math.atan2(vz, vy) - Math.atan2(Q, -P * Math.cos(phi));
  if (th > PI) th -= TAU; else if (th < -PI) th += TAU;
  hip.rotation.set(th, 0, phi);
  knee.rotation.set(k, 0, 0);
  return m.body.rotation.x + P0.rotation.x + th + k;
}
// the ankle's place over a planted foot: `mark` where the sole lies flat (body z), rolled onto the heel or the toes by the shin's slant
function planted(mark, th, out) {
  const c = th < 0 ? HEEL : TOE, ct = Math.cos(th), st = Math.sin(th);
  out[0] = mark + c * (1 - ct) + ANK * st;
  out[1] = ANK * ct + c * st;
  return out;
}
const _a = [0, 0], _fL = [0, 0, 0], _fR = [0, 0, 0];
// One foot through a stride, at leg phase q (0 its heel strike): its pitch (the ankle turns it: < 0 toes up), and where its ankle goes:
// planted and moving back under him while 0..STANCE (landing on the heel, rolling flat, then up onto the toes as it leaves), then swung
// forward and over, the toes coming up to clear the ground. The sole rolls about the point it rests on, so it does not slide.
const PITCH_IN = -0.26, PITCH_OUT = 0.4;
function footPitch(q) {
  if (q < STANCE) return q < 0.12 ? PITCH_IN * (1 - smooth(q / 0.12)) : q < 0.32 ? 0 : PITCH_OUT * ((q - 0.32) / (STANCE - 0.32)) ** 2;
  return PITCH_OUT + (PITCH_IN - PITCH_OUT) * smooth(Math.min(1, ((q - STANCE) / (1 - STANCE)) * 1.6));
}
function footAt(q, out) {
  out[0] = footPitch(q);
  if (q < STANCE) {
    planted(HS * (1 - (2 * q) / STANCE), out[0], _a);
    out[1] = _a[1]; out[2] = _a[0];
  } else {
    // (from where it left the ground to where it will land)
    const s = (q - STANCE) / (1 - STANCE), e = s * s * s * (s * (s * 6 - 15) + 10);
    planted(-HS, PITCH_OUT, _a);
    const z0 = _a[0], y0 = _a[1];
    planted(HS, PITCH_IN, _a);
    out[2] = z0 + (_a[0] - z0) * e;
    out[1] = y0 + (_a[1] - y0) * s + 0.075 * Math.pow(Math.sin(PI * Math.pow(s, 0.8)), 1.2);
  }
  return out;
}

// The blows, as poses the body passes through: the wind-up's peak (A) and the impact (B), blended from wherever he stood. Each is
// [shoulder x, shoulder z, elbow, wrist (hammer tilt), torso pitch, torso turn, torso roll, pelvis turn, drop, forward, left foot forward,
// right foot forward, free shoulder x, free shoulder z, free elbow, heads' pitch] (body units for the drop, forward and feet)
const BLOW = {
  over: { A: [-2.75, -0.32, -1.6, 0.25, -0.24, -0.32, 0.06, -0.12, 0.012, -0.02, 0.1, -0.06, -0.95, 0.5, -0.55, 0.1],
    B: [-0.35, -0.06, -0.42, 0.05, 0.46, 0.2, -0.04, 0.1, -0.075, 0.05, 0.16, -0.06, 0.6, 0.55, -0.4, -0.16] },
  right: { A: [-0.55, -1.35, -0.95, 0.15, 0.0, -0.62, 0.12, -0.2, -0.01, 0.0, 0.05, -0.12, -0.75, 0.3, -0.9, 0.0],
    B: [-0.7, 0.4, -0.5, 0.05, 0.44, 0.52, -0.08, 0.18, -0.065, 0.04, 0.14, -0.05, 0.5, 0.6, -0.35, -0.12] },
};
const NB = 16, _rest = new Float32Array(NB), _blow = new Float32Array(NB);
// the blow at swing time t (units.js strikes at 0.32): up and back slowly (0 to 0.19), a moment at the top, down hard and gathering
// speed (0.215 to 0.31), the impact (the body sinks into it and the head bounces, held to 0.45), then hauled back up to rest by 0.62
function blowAt(t, K, rest, out) {
  const A = K.A, B = K.B;
  if (t < 0.19) { const k = smooth(t / 0.19); for (let i = 0; i < NB; i++) out[i] = rest[i] + (A[i] - rest[i]) * k; return 0; }
  if (t < 0.215) { const k = (t - 0.19) / 0.025; for (let i = 0; i < NB; i++) out[i] = A[i] + (A[i] - rest[i]) * 0.04 * Math.sin(k * PI * 0.5); return 0; }
  if (t < 0.31) {
    const k = (t - 0.215) / 0.095, e = k * k * (1.5 - 0.5 * k);
    for (let i = 0; i < NB; i++) { const a = A[i] + (A[i] - rest[i]) * 0.04; out[i] = a + (B[i] - a) * e; }
    return 0;
  }
  if (t < 0.45) {
    for (let i = 0; i < NB; i++) out[i] = B[i];
    return t < 0.335 ? smooth((t - 0.31) / 0.025) : 1 - smooth(clamp01((t - 0.335) / 0.09));
  }
  const k = smooth(clamp01((t - 0.45) / 0.17));
  for (let i = 0; i < NB; i++) out[i] = B[i] + (rest[i] - B[i]) * k;
  return 0;
}

const _sin = Math.sin, _cos = Math.cos;
// a slow wander for the heads' glances (two of them, never in step)
const wander = (t, a) => _sin(t * 0.31 + a) * _sin(t * 0.13 + a * 2.1) + 0.4 * _sin(t * 0.71 + a * 3.3);

// Pose the giant for this frame (st as for poseSoldier, which calls this last). Every joint is set here.
export function poseGiant(m, st) {
  const g = m.gs, idle = st.idle || 0;
  let dt = idle - g.idle;
  g.idle = idle;
  const live = dt > 0 && dt < 0.25;   // (a set pose, or the first frame after a while unseen: no clock to run the springs on)
  if (!live) dt = 0;
  const sp = st.speed || 0, moving = !!st.moving;
  const wT = moving ? clamp01(sp / 1.4) : 0;
  g.walk = live ? g.walk + (wT - g.walk) * Math.min(1, dt * 3.2) : wT;
  const w = g.walk, p = (st.phase || 0) * GIANT_GAIT;
  const sw = _sin(p), cw = _cos(p);
  const swingT = st.swingT, swinging = swingT >= 0;
  // ---- the hit: a blow rocks him back and to a side (a spring), the heads thrown back
  const hurt = st.hurt || 0;
  if (live && hurt > g.hurt + 0.25 && g.rx > -0.22) { g.rv -= 1.5; g.side = -g.side; g.zv += 0.9 * g.side; }   // (a flurry of blows does not throw him over)
  g.hurt = hurt;
  if (live) {
    for (let n = Math.ceil(dt / 0.02), h = dt / n, i = 0; i < n; i++) {
      g.rv += (-60 * g.rx - 5 * g.rv) * h; g.rx += g.rv * h;
      g.zv += (-50 * g.zx - 4.5 * g.zv) * h; g.zx += g.zv * h;
    }
  }
  const rock = g.rx, roll = g.zx;
  // ---- the body over the feet: lowest just after each heel strike (the weight comes down), highest as he passes over the foot
  const u = (p / PI) % 1, uu = u < 0 ? u + 1 : u;
  const thud = uu < 0.3 ? _sin((PI * uu) / 0.3) ** 2 : 0;
  const breath = _sin(idle * 1.25);
  let drop = 0;   // (the body lowered from where the legs would hold it: into a blow, under a hit)
  const sway = _cos(p - PI * STANCE);   // (+1 over the left foot)
  let bodyX = 0.03 * w * sway, bodyZ = 0;
  let tx = 0.42 + 0.04 * w + 0.012 * breath * (1 - w) + 0.03 * w * thud, ty = 0.15 * w * cw, tz = -0.07 * w * sway;
  let py = -0.11 * w * cw, pz = 0.055 * w * sway, px = 0.1 + 0.03 * w;
  // arms at rest: wide of the lats, hanging; swinging against the legs (the hammer arm less, it is heavy) and lagging
  const lag = p - 0.45;
  let shLx = -0.2 - 0.3 * w * _cos(lag), shLz = 0.24, elL = -0.3 - 0.18 * w * Math.max(0, -_cos(lag)) - 0.04 * breath;
  let shRx = -0.2 - 0.14 * w * _cos(lag), shRz = -0.2, elR = -0.32 - 0.12 * w, wpn = 0;
  let hx = 0, stepL = 0, stepR = 0;
  // the hammer while walking: carried a little up off the ground, its head swinging behind the arm
  shRx -= 0.18 * w; elR -= 0.18 * w; wpn += 0.08 * w * _sin(lag - 0.8);
  // (the shoulders' pitch is against the stoop: the arms hang down, not forward; a blow's poses are the arms' own)
  const hang = (px + tx) * 0.75;
  shLx -= hang; shRx -= hang;
  // ---- a blow
  let impact = 0;
  if (swinging) {
    _rest[0] = shRx; _rest[1] = shRz; _rest[2] = elR; _rest[3] = g.tilt - GIANT_TILT; _rest[12] = shLx; _rest[13] = shLz; _rest[14] = elL;
    for (let i = 4; i < 12; i++) _rest[i] = 0; _rest[15] = 0;
    impact = blowAt(Math.min(0.62, swingT), BLOW[st.attackDir === 'right' ? 'right' : 'over'], _rest, _blow);
    const b = _blow;
    shRx = b[0]; shRz = b[1]; elR = b[2]; wpn = b[3];
    tx += b[4] + 0.07 * impact; ty += b[5]; tz += b[6]; py += b[7];
    drop += b[8] - 0.03 * impact; bodyZ += b[9];
    stepL = b[10]; stepR = b[11];
    shLx = b[12]; shLz = b[13]; elL = b[14]; hx = b[15] - 0.1 * impact;
  }
  // ---- the hit's rock, and the plain flinch (heads back)
  tx += rock * 0.9; px += rock * 0.25; tz += roll * 0.8; pz += roll * 0.2;
  drop -= 0.03 * Math.min(1, Math.abs(rock) + Math.abs(roll)) + 0.01 * hurt;
  shLz += Math.abs(rock) * 0.8; shRz -= Math.abs(rock) * 0.5;
  hx -= rock * 0.6 + 0.22 * hurt;
  // ---- where the feet go: walking, each on its own phase (planted and moving back under him, then swung forward); standing, a wide
  // stance, the knees soft (a step in for a blow)
  const qL = ((p / TAU) % 1 + 1) % 1, qR = (qL + 0.5) % 1;
  const hipStand = 0.885 + 0.003 * breath;
  // the hips ride on the planted legs, all but straight (an inverted pendulum: highest over the foot, lowest as the other lands),
  // sinking a little more as each foot takes the weight
  let hipWalk = 9;
  for (let side = 0; side < 2; side++) {
    const L = side === 0, q = L ? qL : qR, f = L ? _fL : _fR;
    footAt(q, f);
    // (a leg gives up the weight over the end of its step, and the hips start down onto the next before its heel lands: no jolt as one
    // leg hands over to the other)
    const dx = (L ? FOOT_X - HIP_X : HIP_X - FOOT_X) - bodyX;
    if (q < STANCE) {
      const hold = smooth(clamp01((STANCE - q) / 0.06));
      hipWalk = smin(hipWalk, f[1] + Math.sqrt(Math.max(0.3, LEG * LEG - f[2] * f[2] - dx * dx)) + 0.25 * (1 - hold));
    } else {
      const s = (q - STANCE) / (1 - STANCE);
      if (s > 0.55) {
        planted(HS, PITCH_IN, _a);
        hipWalk = smin(hipWalk, _a[1] + Math.sqrt(Math.max(0.3, LEG * LEG - _a[0] * _a[0] - dx * dx)) + 0.25 * (1 - smooth((s - 0.55) / 0.45)));
      }
    }
  }
  if (hipWalk > 2) hipWalk = hipStand;
  const hipY = hipStand + (hipWalk - hipStand) * w - 0.024 * w * thud + drop;
  // ---- set the trunk
  m.body.rotation.set(0, 0, 0);
  m.body.position.set(bodyX * GIANT_SCALE, 0, bodyZ * GIANT_SCALE);
  const P0 = m.pelvis;
  P0.position.set(0, hipY + 0.03, 0);
  P0.rotation.set(px, py, pz);
  m.hipL.position.z = m.hipR.position.z = 0;
  m.torso.rotation.set(tx, ty, tz);
  // ---- the legs reach for the feet
  for (let side = 0; side < 2; side++) {
    const L = side === 0, hip = L ? m.hipL : m.hipR, knee = L ? m.kneeL : m.kneeR, f = L ? _fL : _fR;
    footAt(L ? qL : qR, f);
    const ph = f[0] * w;
    planted((L ? stepL : stepR) + 0.01, 0, _a);
    const y = _a[1] + (f[1] - _a[1]) * w, z = _a[0] + (f[2] - _a[0]) * w;
    const shin = legIK(m, hip, knee, (L ? FOOT_X : -FOOT_X) - bodyX, y, z - bodyZ);
    (L ? m.ankleL : m.ankleR).rotation.set(ph - shin, 0, 0);
  }
  // ---- heads: they look ahead whatever the stoop, nod as each foot comes down, glance about (each its own way), and turn to a foe
  const lean = px + tx;
  const look = clamp(st.look || 0, -1.1, 1.1), t = idle + g.seed;
  const nod = w * 0.05 * _sin(TAU * uu - 0.6);
  const watch = swinging ? 0.25 : 1;
  const yawL = 0.16 + look * 0.75 + (0.32 * wander(t, 0.0) - 0.05) * watch, yawR = -0.16 + look * 0.65 + (0.3 * wander(t, 2.4) + 0.06) * watch;
  m.head.rotation.set(-lean * 0.82 + hx + nod + 0.05 * wander(t, 1.1) * watch, yawL - ty * 0.6, 0.07 + 0.04 * wander(t, 4.2) * watch - tz * 0.5);
  m.head2.rotation.set(-lean * 0.82 + hx + nod * 0.8 + 0.05 * wander(t, 5.0) * watch, yawR - ty * 0.6, -0.07 + 0.04 * wander(t, 3.3) * watch - tz * 0.5);
  // ---- arms
  m.shL.position.y = m.shR.position.y = SHOULDER[1] + 0.004 * breath * (1 - w);
  m.shL.rotation.set(shLx, 0, shLz + 0.04 * w * sway);
  m.elL.rotation.set(elL, 0, 0);
  m.shR.rotation.set(shRx, 0, shRz + 0.04 * w * sway);
  m.elR.rotation.set(elR, 0, 0);
  // ---- the hammer: at rest its head lies on the ground by his feet (carried higher as he walks, swinging behind the arm); through a
  // blow the wind-up's tilt is the pose's, then the head is brought to the ground where it lands and kept there, kicking up once, and
  // dragged up off it as he hauls it back
  const restH = 0.12 + 1.1 * w;
  let tilt;
  if (!swinging) tilt = g.tilt = haftTo(m, restH, GIANT_TILT) + wpn;
  else {
    const T = swingT;
    if (T < 0.215) tilt = GIANT_TILT + wpn;
    else if (T < 0.45) {
      // (coming down the pose's way until the head meets the ground, then held on it)
      const kick = T > 0.315 && T < 0.37 ? 0.22 * _sin((PI * (T - 0.315)) / 0.055) : 0;
      const ground = haftTo(m, 0.06 + kick, GIANT_TILT + wpn);
      const kf = GIANT_TILT + wpn;
      tilt = T < 0.315 && headLow(kf) > 0.06 ? kf : ground;
    } else {
      const k = smooth(clamp01((T - 0.45) / 0.17));
      tilt = haftTo(m, 0.06 + (restH - 0.06) * k + 0.5 * _sin(PI * k), GIANT_TILT);
    }
  }
  m.weapon.rotation.set(tilt, 0, 0);
  m.inst[13] = Math.min(1, sp / 7);
}

// Where the hammer's head is in the world (for the dust of a smash: it lands well ahead of the giant's feet)
export function giantHammerHead(m, out) {
  m.weapon.updateWorldMatrix(true, false);
  return out.set(0, -0.98, 0).applyMatrix4(m.weapon.matrixWorld);
}

// The hammer's tilt in the fist (its weapon joint's x) that puts the lowest corner of its head `h` metres above his feet's ground: the
// nearest such tilt to `near`, or the one that brings it lowest if it cannot reach. (In the rig's own frame: the root only turns about y.)
const _w = new THREE.Matrix4(), _inv = new THREE.Matrix4();
let _a5 = 0, _a9 = 0, _a1 = 0, _fy = 0;
// (the haft runs (0, -cos x, -sin x) from the fist in the elbow's frame, the stone across it along the weapon's z: 0.33 by 0.58 by 0.3)
function headLow(x) {
  const c = Math.cos(x), s = Math.sin(x), hu = -(_a5 * c + _a9 * s), zu = -_a5 * s + _a9 * c;
  return _fy + 0.98 * hu - 0.165 * Math.abs(hu) - 0.29 * Math.abs(zu) - 0.15 * Math.abs(_a1);
}
function haftTo(m, h, near) {
  m.elR.updateWorldMatrix(true, false);
  _w.multiplyMatrices(_inv.copy(m.root.matrixWorld).invert(), m.elR.matrixWorld);
  const e = _w.elements;
  _a5 = e[5]; _a9 = e[9]; _a1 = e[1]; _fy = e[13] - 0.362 * e[5] + 0.004 * e[9];
  // (scan out from `near` both ways for where the head crosses the height, then close in on it)
  let best = near, bestV = headLow(near) - h;
  if (Math.abs(bestV) < 1e-3) return near;
  for (let i = 1; i <= 24; i++) {
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const x0 = near + sgn * (i - 1) * 0.06, x1 = near + sgn * i * 0.06, f0 = headLow(x0) - h, f1 = headLow(x1) - h;
      if (f1 < bestV) { best = x1; bestV = f1; }
      if ((f0 > 0) !== (f1 > 0)) {
        let lo = x0, hi = x1, flo = f0;
        for (let k = 0; k < 10; k++) { const mid = (lo + hi) * 0.5, fm = headLow(mid) - h; if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid; }
        return (lo + hi) * 0.5;
      }
    }
  }
  return best;
}

// A dead giant: it reels from the blow, its legs go, and it comes down like a felled tree; the body bounces once on the ground and settles,
// the arms flop. kind 0 falls on its back, 1 to its knees and then on its face, 2 on its side. The hammer slips out of the fist and lies flat
// (turned in the fist until the haft is level). Every joint is set here.
const fallK = (t, t0, t1) => { const k = clamp01((t - t0) / (t1 - t0)); return k * k * (1.2 - 0.2 * k); };   // (gathering speed, like a fall)
// the bounce after hitting the ground at t0: up a little and back
const bounce = (t, t0) => (t < t0 ? 0 : Math.exp(-(t - t0) * 7) * _sin(Math.min(PI, (t - t0) * 11)));
function fallPose(m, t, kind, side) {
  const S = GIANT_SCALE, J = (j, x, y, z) => j.rotation.set(x, y, z);
  const A = PI / 2 - 0.06;
  m.pelvis.position.set(0, 0.93, 0); m.pelvis.rotation.set(0, 0, 0);
  m.hipL.position.z = m.hipR.position.z = 0;
  m.body.rotation.set(0, 0, 0); m.body.position.set(0, 0, 0);
  m.shL.position.y = m.shR.position.y = SHOULDER[1];
  const reel = smooth(clamp01(t / 0.35)), T0 = GIANT_FALL[kind] ?? GIANT_FALL[0];
  const bo = bounce(t, T0), settle = smooth(clamp01((t - T0) / 0.6));
  // (the feet go slack: on his back the toes fall out, on his face the soles turn up)
  const slack = smooth(clamp01((t - 0.2) / 0.8)) * (kind === 1 ? 0.75 : 0.35);
  m.ankleL.rotation.set(slack, 0, 0); m.ankleR.rotation.set(slack * 0.8, 0, 0);
  if (kind === 0) {
    // reels back, a step back with the right foot, then topples onto its back
    const f = fallK(t, 0.35, T0);
    m.body.rotation.x = -0.1 * reel - (A - 0.1) * f + 0.06 * bo;
    m.body.position.set(0, (0.16 * f + 0.03 * bo) * S, -0.12 * reel * S);
    J(m.hipL, -0.15 * reel - 0.25 * f + 0.25 * settle, 0, 0.12 * f); J(m.hipR, 0.25 * reel - 0.1 * f + 0.05 * settle, 0, -0.15 * f);
    J(m.kneeL, 0.3 * reel + 0.6 * f - 0.4 * settle, 0, 0); J(m.kneeR, 0.15 * reel + 0.35 * f - 0.15 * settle, 0, 0);
    J(m.torso, -0.25 * reel + 0.1 * f - 0.08 * bo, 0, 0.12 * f);
    J(m.head, -0.4 * reel + 0.45 * f + 0.3 * bo, 0.25 * f, 0.05); J(m.head2, -0.35 * reel + 0.5 * f + 0.25 * bo, -0.35 * f, -0.05);
    J(m.shL, -0.9 * reel - 1.1 * f + 1.4 * settle, 0, 0.3 + 0.5 * f + 0.3 * settle); J(m.elL, -0.4 * reel - 0.2 * f + 0.3 * settle, 0, 0);
    J(m.shR, -1.3 * reel - 0.6 * f + 1.2 * settle, 0, -0.4 - 0.6 * f - 0.2 * settle); J(m.elR, -0.5 * reel + 0.3 * settle, 0, 0);
  } else if (kind === 1) {
    // the knees go (down onto them by 0.55), it sways there, then pitches forward onto its face
    const kneel = smooth(clamp01(t / 0.55)), f = fallK(t, 0.75, T0);
    const sag = kneel * (1 - f);
    m.body.rotation.x = A * f - 0.04 * bo;
    m.body.position.set(0, (-0.42 * sag + 0.15 * f + 0.03 * bo) * S, (-0.06 * kneel - 0.5 * f) * S);
    J(m.hipL, -0.35 * sag - 0.08 * f, 0, 0.12 * f); J(m.hipR, -0.25 * sag + 0.05 * f, 0, -0.1 * f);
    J(m.kneeL, 1.95 * sag + 0.3 * f, 0, 0); J(m.kneeR, 1.85 * sag + 0.15 * f, 0, 0);
    J(m.torso, 0.5 * kneel - 0.45 * f + 0.05 * _sin(t * 6) * sag, 0, 0.1 * _sin(t * 4) * sag);
    J(m.head, 0.3 * kneel + 0.2 * f - 0.2 * bo, 0.5 * f, 0.1); J(m.head2, 0.25 * kneel + 0.15 * f - 0.15 * bo, -0.6 * f, -0.1);
    J(m.shL, -0.25 * kneel + (0.35 + 0.25 * settle) * f, 0, 0.25 + 0.25 * f); J(m.elL, -0.3 * kneel, 0, 0);
    J(m.shR, -0.2 * kneel + (0.45 + 0.2 * settle) * f, 0, -0.25 - 0.3 * f); J(m.elR, -0.35 * kneel, 0, 0);
  } else {
    // staggers, one knee gives, and it falls onto its side
    const f = fallK(t, 0.38, T0);
    m.body.rotation.z = side * (0.08 * reel + (A - 0.08) * f - 0.06 * bo);
    m.body.position.set(side * (0.06 * reel + 0.2 * f) * S, (0.2 * f + 0.03 * bo) * S, 0);
    J(m.hipL, -0.5 * reel + 0.1 * f, 0, 0.1); J(m.hipR, -0.25 * reel - 0.35 * f, 0, -0.1);
    J(m.kneeL, 0.9 * reel - 0.2 * f, 0, 0); J(m.kneeR, 0.6 * reel + 0.4 * f, 0, 0);
    J(m.torso, 0.25 * reel, 0, -0.3 * side * f + 0.08 * side * bo);
    J(m.head, 0.25 * reel - 0.1 * f, 0.3 * side * f, 0.2 * side * f + 0.2 * side * bo); J(m.head2, 0.2 * reel, 0.2 * side * f, 0.25 * side * f + 0.15 * side * bo);
    J(m.shL, -0.6 * reel - 0.6 * f + 0.4 * settle, 0, -0.3 * f); J(m.elL, -0.8 * reel + 0.3 * settle, 0, 0);
    J(m.shR, -0.6 * reel - 0.3 * f + 0.3 * settle, 0, 0.4 * f); J(m.elR, -0.7 * reel + 0.3 * settle, 0, 0);
  }
}
// the hammer's tilt in the fist once it lies level on the ground, for each fall (kind, side): found once, on the pose the fall ends in
const FALLEN = [null, null, null, null, null, null];
function fallenTilt(m, kind, side) {
  fallPose(m, 2.6, kind, side);
  m.weapon.rotation.set(GIANT_TILT - 0.3, 0, 0);
  m.elR.updateWorldMatrix(true, false);
  _w.multiplyMatrices(_inv.copy(m.root.matrixWorld).invert(), m.elR.matrixWorld);
  const e = _w.elements, a = e[5], b = e[9];   // (the up of the elbow frame's y axis, and of its z axis)
  // the haft points along (0, -cos x, -sin x) in the elbow frame: level when a cos x + b sin x = 0; of the two, the one nearer the grip
  let x = Math.atan2(-a, b);
  const cur = GIANT_TILT - 0.3;
  if (Math.cos(x - cur) < 0) x += PI;
  return cur + Math.atan2(Math.sin(x - cur), Math.cos(x - cur));
}
export function poseGiantDead(m, t, kind) {
  const side = m.variant & 1 ? 1 : -1, key = (kind % 3) * 2 + (side > 0 ? 1 : 0);
  if (FALLEN[key] === null) FALLEN[key] = fallenTilt(m, kind, side);
  fallPose(m, t, kind, side);
  // the hammer: out of the grip as he goes down, swung round in the fist until the haft lies level
  const reel = smooth(clamp01(t / 0.35)), start = GIANT_TILT - 0.3 * reel, k = smooth(clamp01((t - 0.3) / 0.9));
  m.weapon.rotation.set(start + (FALLEN[key] - start) * k, 0, 0);
}
