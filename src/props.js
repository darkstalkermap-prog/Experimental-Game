// Life in and around a castle: barrels, crates, sacks, hay, weapon racks, a well, a forge, training dummies, tents, a market stall, a
// cart, fences, a cooking fire and braziers. They are decoration only (no colliders, nothing the nav grid knows about), so they stand
// where nobody walks: along the walls under the wall walk, in the corners of the yard and outside behind the castle. Placement is
// fixed per house (a seeded generator), so every browser draws the same yard. Q.detail decides how many there are.
// The pieces go into the castle's own merged meshes (see castlegeo.js / castle.js): no draw calls of their own.
import * as THREE from 'three';
import { Parts, place, between, rgb, mul } from './parts.js';
import { TEAM_COLORS } from './config.js';
import { mulberry32 } from './noise.js';
import { C } from './castlegeo.js';

const STRAW = rgb(0xb89a4a), SACK = rgb(0xa8946a), CANVAS = rgb(0xcfc6aa), LEATHER = rgb(0x4a3020), COAL = rgb(0x2a0c06), WATER = rgb(0x16222c);
const at = (m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().multiplyMatrices(m, place(x, y, z, ry, rx, rz, s));
const pt = (m, x, y, z) => [x, y, z] && new THREE.Vector3(x, y, z).applyMatrix4(m).toArray();
// a flat piece (canvas, awning) from four corners given in the prop's own frame
const qd = (P, key, m, a, b, c, d, col) => P.quad(key, pt(m, ...a), pt(m, ...b), pt(m, ...c), pt(m, ...d), col, [0, 0, 1, 0, 1, 1, 0, 1], true);

// ---------------------------------------------------------------- the pieces (each stands on y = 0 at the origin of matrix m)
function barrel(P, m) {
  const prof = [[0.001, 0], [0.3, 0], [0.37, 0.15], [0.43, 0.42], [0.43, 0.5], [0.37, 0.78], [0.3, 0.92], [0.001, 0.92]].map(([r, y]) => new THREE.Vector2(r, y));
  P.add('timber', new THREE.LatheGeometry(prof, 10), m, P.jitter(C.wood, 0.1), { uv: 'keep', uvMul: [1.6, 0.9] });
  for (const [y, r] of [[0.14, 0.375], [0.44, 0.44], [0.76, 0.385]]) P.cyl('metal', r, r, 0.05, 10, at(m, 0, y, 0), C.iron, { open: true });
}
function crate(P, m, s = 1) {
  P.obox('timber', at(m, 0, 0.45 * s, 0), 0.45 * s, 0.45 * s, 0.45 * s, P.jitter(C.wood, 0.1));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.obox('timber', at(m, x * 0.43 * s, 0.45 * s, z * 0.43 * s), 0.05 * s, 0.46 * s, 0.05 * s, C.woodDark);
}
function sack(P, m) {
  P.add('plain', new THREE.IcosahedronGeometry(1, 1), at(m, 0, 0.27, 0, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeScale(0.34, 0.3, 0.28)), P.jitter(SACK, 0.12));
  P.cyl('plain', 0.03, 0.1, 0.14, 6, at(m, 0, 0.5, 0), mul(SACK, 0.8));
}
function sacks(P, m) { sack(P, at(m, -0.32, 0, 0)); sack(P, at(m, 0.32, 0, 0.08, 0.8)); sack(P, at(m, 0, 0.3, 0.02, 1.9)); }
function bale(P, m) {
  P.obox('plain', at(m, 0, 0.25, 0), 0.5, 0.25, 0.3, P.jitter(STRAW, 0.1));
  for (const x of [-0.25, 0.25]) P.obox('plain', at(m, x, 0.25, 0), 0.03, 0.26, 0.31, mul(STRAW, 0.45));
}
function haystack(P, m) {
  P.cyl('plain', 1.5, 1.5, 0.9, 8, at(m, 0, 0, 0), P.jitter(STRAW, 0.08));
  P.cyl('plain', 0, 1.5, 1.6, 8, at(m, 0, 0.9, 0), P.jitter(mul(STRAW, 0.95), 0.08));
}
function rack(P, m, col) {   // spears and shields on a timber frame, standing against a wall (its back is toward -z)
  for (const x of [-1.1, 1.1]) P.obox('timber', at(m, x, 0.95, 0), 0.05, 0.95, 0.05, C.woodDark);
  for (const y of [0.5, 1.45]) P.obox('timber', at(m, 0, y, 0), 1.15, 0.05, 0.05, C.woodDark);
  for (let i = 0; i < 6; i++) {
    const x = -0.9 + i * 0.36, b = between(...pt(m, x, 0, 0.22), ...pt(m, x + 0.05, 2.45, 0.06));
    P.obox('timber', b.m, 0.022, 0.022, b.half, C.wood);
    P.add('metal', new THREE.ConeGeometry(0.05, 0.22, 5), at(m, x + 0.05, 2.55, 0.06), C.ironLight);
  }
  for (const x of [-0.55, 0.55]) P.cyl('plain', 0.42, 0.42, 0.07, 14, at(m, x, 1.0, 0.12, 0, Math.PI / 2), col);
}
function well(P, m) {
  P.cyl('masonry', 1.0, 1.05, 0.95, 12, at(m, 0, 0, 0), C.stone);
  P.cyl('masonry', 1.12, 1.12, 0.14, 12, at(m, 0, 0.95, 0), C.pale);
  P.cyl('plain', 0.72, 0.72, 0.02, 14, at(m, 0, 1.08, 0), WATER);
  for (const x of [-1.0, 1.0]) P.obox('timber', at(m, x, 1.2, 0), 0.09, 1.2, 0.09, C.woodDark);
  P.cyl('timber', 0.1, 0.1, 2.0, 8, at(m, -1.0, 1.75, 0, 0, 0, -Math.PI / 2), C.wood);
  for (const sz of [-1, 1]) P.obox('timber', at(m, 0, 2.62, sz * 0.5, 0, sz * 0.65, 0), 1.3, 0.04, 0.7, P.jitter(C.woodDark, 0.1));
  P.obox('plain', at(m, 0.1, 1.45, 0), 0.015, 0.3, 0.015, LEATHER);                      // the rope
  P.cyl('timber', 0.17, 0.15, 0.26, 8, at(m, 0.1, 1.05, 0), C.woodDark);                 // the bucket
}
function forge(P, m, fires) {
  P.obox('masonry', at(m, 0, 0.42, 0), 0.9, 0.42, 0.6, C.stone);
  P.obox('masonry', at(m, 0, 1.55, -0.38), 0.6, 0.72, 0.22, C.stone);
  P.obox('masonry', at(m, 0, 2.6, -0.38), 0.33, 0.45, 0.2, C.dark);
  P.obox('plain', at(m, 0, 0.85, 0.05), 0.62, 0.03, 0.36, COAL);
  P.obox('timber', at(m, -1.3, 0.28, 0.1), 0.25, 0.28, 0.2, C.woodDark);                  // a stump with the anvil on it
  P.obox('metal', at(m, -1.3, 0.62, 0.1), 0.2, 0.06, 0.12, C.iron);
  P.obox('metal', at(m, -1.3, 0.76, 0.1), 0.38, 0.07, 0.13, C.ironLight);
  P.add('metal', new THREE.ConeGeometry(0.1, 0.34, 8), at(m, -0.82, 0.76, 0.1, 0, 0, -Math.PI / 2), C.ironLight);
  P.obox('timber', at(m, 1.35, 0.3, 0.2), 0.5, 0.3, 0.28, C.woodDark);                    // the quenching trough
  P.obox('plain', at(m, 1.35, 0.58, 0.2), 0.44, 0.01, 0.22, WATER);
  P.cyl('masonry', 0.36, 0.36, 0.16, 14, at(m, 0.2, 0.62, 1.1, 0, Math.PI / 2, 0), C.dark);   // a grindstone
  P.obox('timber', at(m, 0.2, 0.3, 1.1), 0.34, 0.3, 0.05, C.woodDark);
  const f = (x, y, z) => pt(m, x, y, z);
  fires.push([0, ...f(0, 1.2, 0.05), 0.9], [1, ...f(0, 1.1, 0.1), 2.6], [2, ...f(0, 3.1, -0.38), 1.1, 0], [2, ...f(0, 3.1, -0.38), 1.1, 0.5]);
}
function dummy(P, m) {
  P.obox('timber', at(m, 0, 0.06, 0), 0.5, 0.06, 0.1, C.woodDark);
  P.obox('timber', at(m, 0, 0.06, 0, 1.57), 0.5, 0.06, 0.1, C.woodDark);
  P.cyl('timber', 0.08, 0.1, 1.5, 7, at(m, 0, 0.1, 0), C.wood);
  P.obox('timber', at(m, 0, 1.3, 0), 0.5, 0.05, 0.05, C.woodDark);
  P.obox('plain', at(m, 0, 1.0, 0), 0.2, 0.3, 0.14, P.jitter(STRAW, 0.1));
  P.add('plain', new THREE.IcosahedronGeometry(1, 1), at(m, 0, 1.7, 0).multiply(new THREE.Matrix4().makeScale(0.17, 0.2, 0.17)), SACK);
  P.cyl('plain', 0.22, 0.22, 0.03, 12, at(m, 0, 1.0, 0.15, 0, Math.PI / 2), rgb(0xa02a22));
}
function tent(P, m, col) {   // a canvas A-frame, door toward +z
  const w = 1.4, l = 1.8, h = 2.0;
  qd(P, 'plain', m, [-w, 0, l], [-w, 0, -l], [0, h, -l], [0, h, l], CANVAS);
  qd(P, 'plain', m, [w, 0, -l], [w, 0, l], [0, h, l], [0, h, -l], mul(CANVAS, 0.92));
  P.quad('plain', ...[[-w, 0, -l], [w, 0, -l], [0, h, -l]].map((p) => pt(m, ...p)), pt(m, 0, h, -l), mul(CANVAS, 0.8), [0, 0, 1, 0, 0.5, 1, 0.5, 1], true);
  P.quad('plain', ...[[w, 0, l], [-w, 0, l], [0, h, l]].map((p) => pt(m, ...p)), pt(m, 0, h, l), mul(CANVAS, 0.8), [0, 0, 1, 0, 0.5, 1, 0.5, 1], true);
  P.quad('plain', ...[[-0.45, 0, l + 0.01], [0.45, 0, l + 0.01], [0.3, 1.2, l + 0.01]].map((p) => pt(m, ...p)), pt(m, -0.3, 1.2, l + 0.01), LEATHER, [0, 0, 1, 0, 1, 1, 0, 1], true);   // the door
  P.cyl('timber', 0.04, 0.04, 0.9, 6, at(m, 0, h - 0.05, 0), C.woodDark);
  qd(P, 'plain', m, [0, h + 0.85, 0], [0, h + 0.85, 0.7], [0, h + 0.5, 0.65], [0, h + 0.5, 0], col);   // a pennant
}
function stall(P, m, col) {   // a market stall, open toward +z
  P.obox('timber', at(m, 0, 0.45, 0.2), 1.25, 0.45, 0.4, C.wood);
  for (const [x, z] of [[-1.25, 0.95], [1.25, 0.95], [-1.25, -0.9], [1.25, -0.9]]) P.obox('timber', at(m, x, 1.25, z), 0.05, 1.25, 0.05, C.woodDark);
  for (let i = 0; i < 6; i++) {                              // a striped awning sloping down toward the front
    const x0 = -1.5 + i * 0.5, c = i % 2 ? CANVAS : col;
    qd(P, 'plain', m, [x0, 2.75, -1.0], [x0 + 0.5, 2.75, -1.0], [x0 + 0.5, 2.3, 1.15], [x0, 2.3, 1.15], c);
  }
  P.obox('plain', at(m, 0, 2.28, 1.15), 1.5, 0.08, 0.02, mul(col, 0.8));
  for (let i = 0; i < 7; i++) P.add('plain', new THREE.IcosahedronGeometry(0.12, 0), at(m, -0.9 + (i % 4) * 0.28 + (i > 3 ? 0.14 : 0), 0.98 + (i > 3 ? 0.17 : 0), 0.35 + (i > 3 ? 0.05 : 0)), i % 3 ? rgb(0xa8321f) : rgb(0x6a8a2a));
  crate(P, at(m, 1.9, 0, 0.4, 0.3), 0.7);
  sack(P, at(m, -1.9, 0, 0.3));
}
function wheel(P, m) {         // a cartwheel in the x = 0 plane
  P.add('timber', new THREE.TorusGeometry(0.5, 0.05, 4, 12), at(m, 0, 0, 0, Math.PI / 2), C.woodDark);
  for (let i = 0; i < 4; i++) P.obox('timber', at(m, 0, 0, 0, 0, i * Math.PI / 4, 0), 0.03, 0.5, 0.025, C.wood);
  P.cyl('metal', 0.09, 0.09, 0.16, 8, at(m, 0.08, 0, 0, 0, 0, Math.PI / 2), C.iron);
}
function cart(P, m) {          // the bed is 2.2 long (z), the shafts reach toward +z
  P.obox('timber', at(m, 0, 0.78, 0), 0.62, 0.05, 1.1, C.wood);
  for (const x of [-0.62, 0.62]) P.obox('timber', at(m, x, 1.0, 0), 0.03, 0.2, 1.1, C.woodDark);
  for (const z of [-1.1, 1.1]) P.obox('timber', at(m, 0, 1.0, z), 0.62, 0.2, 0.03, C.woodDark);
  for (const x of [-0.78, 0.78]) wheel(P, at(m, x, 0.5, 0));
  P.obox('timber', at(m, 0, 0.5, 0), 0.8, 0.04, 0.04, C.iron);
  for (const x of [-0.4, 0.4]) { const b = between(...pt(m, x, 0.8, 1.0), ...pt(m, x * 0.8, 0.45, 2.9)); P.obox('timber', b.m, 0.04, 0.04, b.half, C.woodDark); }
  bale(P, at(m, 0, 0.83, -0.3, 0)); bale(P, at(m, 0, 1.08, -0.3, 0.1)); bale(P, at(m, 0, 0.83, 0.45, 0.05));
}
function fence(P, m, len) {    // a post and rail fence along +x
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) P.obox('timber', at(m, i * len / n, 0.55, 0), 0.06, 0.55, 0.06, C.woodDark);
  for (const y of [0.45, 0.85]) P.obox('timber', at(m, len / 2, y, 0.05), len / 2, 0.04, 0.025, C.wood);
}
function cookfire(P, m, fires) {
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P.add('masonry', new THREE.IcosahedronGeometry(1, 0), at(m, Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55).multiply(new THREE.Matrix4().makeScale(0.17, 0.12, 0.15)), mul(C.stone, 0.7 + (i % 3) * 0.1));
  }
  for (let i = 0; i < 3; i++) { const a = i * 2.09, b = between(...pt(m, Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7), ...pt(m, 0, 1.5, 0)); P.obox('metal', b.m, 0.025, 0.025, b.half, C.iron); }
  P.add('metal', new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), at(m, 0, 1.0, 0), C.iron);   // the pot, hung over the fire
  P.obox('timber', at(m, 0.12, 0.1, 0.1, 0.5), 0.4, 0.05, 0.05, C.woodDark);
  P.obox('timber', at(m, -0.1, 0.1, -0.12, -0.7), 0.4, 0.05, 0.05, C.woodDark);
  const f = (x, y, z) => pt(m, x, y, z);
  fires.push([0, ...f(0, 0.5, 0), 0.95], [1, ...f(0, 0.5, 0), 2.6], [2, ...f(0, 1.3, 0), 1.0, 0], [2, ...f(0, 1.3, 0), 1.0, 0.5]);
}
function brazier(P, m, fires) {
  P.cyl('metal', 0.4, 0.25, 0.3, 10, at(m, 0, 0.95, 0), C.iron);
  for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.5, b = between(...pt(m, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), ...pt(m, Math.cos(a) * 0.2, 1.0, Math.sin(a) * 0.2)); P.obox('metal', b.m, 0.03, 0.03, b.half, C.iron); }
  const f = (x, y, z) => pt(m, x, y, z);
  fires.push([0, ...f(0, 1.6, 0), 1.2], [1, ...f(0, 1.5, 0), 3.0]);
}

// ---------------------------------------------------------------- placement
// ctx: { team, detail, ground(lx, lz) -> height above the castle floor, fires }. Masonry pieces go to `fixed` (the wall mesh), the rest to A.
export function populate(A, fixed, fires, ctx) {
  const d = ctx.detail;
  if (d < 1) return;
  const rng = mulberry32(ctx.team * 977 + 13), tc = rgb(TEAM_COLORS[ctx.team]), P = new Parts(ctx.team + 50);
  const g = ctx.ground;
  const M = (x, z, ry = 0) => place(x, g(x, z), z, ry);
  const j = (v) => (rng() - 0.5) * v;
  // ---- along the walls, under the wall walk
  for (const s of [-1, 1]) {
    const x = s * 16.4, rot = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    const kinds = s < 0 ? ['barrels', 'crates', 'sacks', 'barrels', 'bales', 'crates'] : ['bales', 'crates', 'barrels', 'sacks', 'crates', 'barrels'];
    const zs = [-12.5, -9.2, -3.4, 2.6, 8.2, 12.2];
    const n = d >= 2 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const z = zs[i] + j(0.6), m = M(x + j(0.2), z, rot + j(0.3));
      if (kinds[i] === 'barrels') { barrel(P, at(m, 0, 0, -0.5)); barrel(P, at(m, 0, 0, 0.5)); if (d >= 2) barrel(P, at(m, 0.35, 0.9, 0)); } else if (kinds[i] === 'crates') { crate(P, at(m, 0, 0, -0.5)); crate(P, at(m, 0, 0, 0.5, 0.2)); if (d >= 2) crate(P, at(m, 0, 0.9, 0, 0.5), 0.8); } else if (kinds[i] === 'sacks') { sacks(P, at(m, 0, 0, -0.4)); if (d >= 2) sacks(P, at(m, 0.1, 0, 0.9, 1)); } else { bale(P, at(m, 0, 0, -0.5)); bale(P, at(m, 0, 0, 0.35)); bale(P, at(m, 0, 0.5, -0.1, 0.3)); }
    }
  }
  // ---- the corners of the yard
  stall(P, M(-13.9, 12.4, Math.PI / 2), tc);
  if (d >= 2) stall(P, M(-13.9, 8.2, Math.PI / 2), mul(tc, 0.8));
  for (const [x, z] of d >= 2 ? [[11, 12.5], [13.4, 10.4], [11.2, 8.4]] : [[11, 12.5], [13.4, 10.4]]) dummy(P, M(x + j(0.2), z + j(0.2), j(1.5)));
  rack(P, M(13.6, 16.9, Math.PI), tc);
  forge(P, M(-14.6, -16.2, 0), fires);
  well(P, M(13.4, -14.4));
  if (d >= 2) haystack(P, M(16.1, -10.2));
  cart(P, M(10.6, -16.4, 0.4 + j(0.2)));
  if (d >= 2) { cookfire(P, M(-9.6, -8.6), fires); P.obox('timber', at(M(-9.6, -8.6, 0), 1.2, 0.2, 0.4, 0.3), 0.6, 0.18, 0.18, C.wood); P.obox('timber', at(M(-9.6, -8.6, 0), -1.0, 0.2, -0.8, 2.2), 0.6, 0.18, 0.18, C.wood); }
  for (const s of [-1, 1]) brazier(P, M(s * 7.0, -0.2), fires);
  // ---- outside, behind and beside the castle (only well away from the gate side)
  if (d >= 2) {
    tent(P, M(-9, -31, 0.2 + j(0.2)), tc);
    tent(P, M(6.5, -32, -0.1 + j(0.2)), mul(tc, 0.85));
    haystack(P, M(18.5, -28));
    cart(P, M(-20, -27, 2.4));
    fence(P, M(-14, -36, 0), 14);
    for (const z of [-8, 2]) fence(P, M(-35, z, Math.PI / 2), 8);
    for (const [x, z] of [[-31, 9], [-31.8, 10.2], [-30.4, 10.4]]) barrel(P, M(x, z));
    crate(P, M(35, 6, 0.3)); crate(P, M(36, 7.4, 0.9)); sacks(P, M(34, 8.6, 0.4));
  }
  // the masonry of the props joins the walls mesh, everything else the castle's timber / metal / plain meshes
  for (const key of P.keys()) {
    const one = new Parts(1);
    one.acc[key] = P.acc[key];
    (key === 'masonry' ? fixed : A).merge(one);
  }
}
