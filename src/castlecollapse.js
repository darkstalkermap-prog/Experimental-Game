// The fall of a keep. When a keep is brought down it and the four corner towers crumble: the top of each structure leans and shakes, the stone
// breaks away in blocks from the top downwards, tumbles and lands round the foot, and a stump is left, burning.
// How it is done: the keep and the towers are drawn again from the very same shapes (castlegeo.js) but with every large box cut into blocks about
// 2.5 m across (and roofs cut into patches), each block a separate PIECE. Nothing is simulated while it plays: every piece has a plan worked out once
// (when it lets go, how long it flies, where it lands and how it lies), and a frame only evaluates the plan at the time `t` (a rigid move of the
// piece's own vertices, written straight into the mesh). So a collapse is the same on every screen, costs a millisecond or two a frame while it
// plays and nothing afterwards, and needs no new draw calls: the three meshes it draws (stone, roof tiles, timber) stand in for the keep's own.
// What is left standing is the "ruin": the stone is charred, and a stump and its rubble stay for the rest of the match.
//   new Collapse(castle, instant)      builds it (instant: shows the end state at once, as after a change of graphics quality)
//   collapse.update(dt, fx, audio)     advances it; `collapse.done` is true once everything lies still
import * as THREE from 'three';
import { Parts, UV_CFG, place } from './parts.js';
import * as G from './castlegeo.js';
import { CASTLE } from './config.js';
import { mulberry32 } from './noise.js';

const { keepW, keepH, towerH } = CASTLE;
const KEEP_Z = G.KEEP_Z;
const CELL = 2.6;         // the size of a block of stone
const GRAV = 30;          // m/s2: heavier than the real thing, so that it reads as massive
const CHAR = 0.32;        // the stone is charred
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the pieces
// A table of the pieces (centre, half size and what they belong to), shared by the Parts that collect them.
class Table {
  constructor() { this.n = 0; this.c = []; this.h = []; }
  add(cx, cy, cz, hx, hy, hz) {
    this.c.push(cx, cy, cz);
    this.h.push(hx, hy, hz);
    return this.n++;
  }
}

// Parts that remembers which piece every vertex belongs to, and cuts big boxes and quads into blocks.
class ChunkParts extends Parts {
  constructor(seed, table) { super(seed); this.table = table; this.cur = 0; }

  piece(cx, cy, cz, hx, hy, hz) { this.cur = this.table.add(cx, cy, cz, hx, hy, hz); }

  _vert(a, x, y, z, nx, ny, nz, u, v, col) {
    super._vert(a, x, y, z, nx, ny, nz, u, v, col);
    (a.pid || (a.pid = [])).push(this.cur);
  }

  _box(key, m, x0, x1, y0, y1, z0, z1, color, o) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    if (m || (dx <= CELL * 1.25 && dy <= CELL * 1.25 && dz <= CELL * 1.25)) {
      if (m) { const c = _v.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyMatrix4(m); this.piece(c.x, c.y, c.z, dx / 2, dy / 2, dz / 2); } else this.piece((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx / 2, dy / 2, dz / 2);
      super._box(key, m, x0, x1, y0, y1, z0, z1, color, o);
      return;
    }
    const nx = Math.max(1, Math.round(dx / CELL)), ny = Math.max(1, Math.round(dy / CELL)), nz = Math.max(1, Math.round(dz / CELL));
    const cfg = this.cfg[key] || UV_CFG.metal, skip = (o && o.skip) || '';
    const grain = cfg.mode === 'grain' ? (o && o.grain != null ? o.grain : (dx >= dy && dx >= dz) ? 0 : (dy >= dz ? 1 : 2)) : undefined;
    // the cuts are not quite regular, so that the blocks are of different sizes
    const cuts = (a0, d, n) => { const c = [a0]; for (let i = 1; i < n; i++) c.push(a0 + d * (i + (this.rng() - 0.5) * 0.6) / n); c.push(a0 + d); return c; };
    const cx = cuts(x0, dx, nx), cy = cuts(y0, dy, ny), cz = cuts(z0, dz, nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const ax = cx[i], bx = cx[i + 1], ay = cy[j], by = cy[j + 1], az = cz[k], bz = cz[k + 1];
      // a block keeps the faces its big box had on the outside; the ones between blocks stay (they show when the blocks come apart)
      let sk = '';
      if (skip) {
        if (i === nx - 1 && skip.includes('e')) sk += 'e';
        if (i === 0 && skip.includes('w')) sk += 'w';
        if (j === ny - 1 && skip.includes('u')) sk += 'u';
        if (j === 0 && skip.includes('d')) sk += 'd';
        if (k === nz - 1 && skip.includes('n')) sk += 'n';
        if (k === 0 && skip.includes('s')) sk += 's';
      }
      this.piece((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, (bx - ax) / 2, (by - ay) / 2, (bz - az) / 2);
      super._box(key, null, ax, bx, ay, by, az, bz, color, grain !== undefined ? { ...o, skip: sk, grain } : { ...o, skip: sk });
    }
  }

  // any three.js shape (cylinders, cones, spheres): one piece
  add(key, geo, m = null, color, o) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    _v.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    let hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, hz = (bb.max.z - bb.min.z) / 2;
    if (m) {
      _v.applyMatrix4(m);
      const e = m.elements;
      hx *= Math.hypot(e[0], e[1], e[2]); hy *= Math.hypot(e[4], e[5], e[6]); hz *= Math.hypot(e[8], e[9], e[10]);
    }
    this.piece(_v.x, _v.y, _v.z, hx, hy, hz);
    super.add(key, geo, m, color, o);
  }

  // a roof slope: cut into patches
  quad(key, p0, p1, p2, p3, color, uv = [0, 0, 1, 0, 1, 1, 0, 1], twoSided = false) {
    const lu = Math.max(Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), Math.hypot(p2[0] - p3[0], p2[1] - p3[1], p2[2] - p3[2]));
    const lv = Math.max(Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]), Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]));
    const nu = Math.max(1, Math.round(lu / CELL)), nv = Math.max(1, Math.round(lv / CELL));
    const P = (a, b) => [0, 1, 2].map((i) => (1 - b) * ((1 - a) * p0[i] + a * p1[i]) + b * ((1 - a) * p3[i] + a * p2[i]));
    const U = (a, b) => [0, 1].map((i) => (1 - b) * ((1 - a) * uv[i] + a * uv[2 + i]) + b * ((1 - a) * uv[6 + i] + a * uv[4 + i]));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a0 = i / nu, a1 = (i + 1) / nu, b0 = j / nv, b1 = (j + 1) / nv;
      const q0 = P(a0, b0), q1 = P(a1, b0), q2 = P(a1, b1), q3 = P(a0, b1);
      const cx = (q0[0] + q1[0] + q2[0] + q3[0]) / 4, cy = (q0[1] + q1[1] + q2[1] + q3[1]) / 4, cz = (q0[2] + q1[2] + q2[2] + q3[2]) / 4;
      let hx = 0, hy = 0, hz = 0;
      for (const q of [q0, q1, q2, q3]) { hx = Math.max(hx, Math.abs(q[0] - cx)); hy = Math.max(hy, Math.abs(q[1] - cy)); hz = Math.max(hz, Math.abs(q[2] - cz)); }
      this.piece(cx, cy, cz, hx, hy, hz);
      const u0 = U(a0, b0), u1 = U(a1, b0), u2 = U(a1, b1), u3 = U(a0, b1);
      super.quad(key, q0, q1, q2, q3, color, [...u0, ...u1, ...u2, ...u3], twoSided);
    }
  }
}
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- small maths
const hash = (a, b, c = 0) => { let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, z, s) => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return hash(ix, iz, s) * (1 - ux) * (1 - uz) + hash(ix + 1, iz, s) * ux * (1 - uz) + hash(ix, iz + 1, s) * (1 - ux) * uz + hash(ix + 1, iz + 1, s) * ux * uz;
};
const ss = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// quaternion from an axis and an angle, written into out[o..o+3] (x y z w)
function axisQuat(ax, ay, az, ang, out, o = 0) {
  const l = Math.hypot(ax, ay, az) || 1, s = Math.sin(ang / 2) / l;
  out[o] = ax * s; out[o + 1] = ay * s; out[o + 2] = az * s; out[o + 3] = Math.cos(ang / 2);
}
// a * b into out
function qmul(a, ao, b, bo, out, o) {
  const ax = a[ao], ay = a[ao + 1], az = a[ao + 2], aw = a[ao + 3], bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
// the rotation matrix of a quaternion (row major, 9 numbers)
function quatMat(q, o, m) {
  const x = q[o], y = q[o + 1], z = q[o + 2], w = q[o + 3];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  m[0] = 1 - 2 * (yy + zz); m[1] = 2 * (xy - wz); m[2] = 2 * (xz + wy);
  m[3] = 2 * (xy + wz); m[4] = 1 - 2 * (xx + zz); m[5] = 2 * (yz - wx);
  m[6] = 2 * (xz - wy); m[7] = 2 * (yz + wx); m[8] = 1 - 2 * (xx + yy);
}
// spherical interpolation of two quaternions into out
function slerp(a, ao, b, bo, t, out, o) {
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  let cos = a[ao] * bx + a[ao + 1] * by + a[ao + 2] * bz + a[ao + 3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0 = 1 - t, k1 = t;
  if (cos < 0.9995) { const th = Math.acos(cos), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
  out[o] = a[ao] * k0 + bx * k1; out[o + 1] = a[ao + 1] * k0 + by * k1; out[o + 2] = a[ao + 2] * k0 + bz * k1; out[o + 3] = a[ao + 3] * k0 + bw * k1;
}

// ---------------------------------------------------------------- the plan
// The structures: 0 the keep, 1..4 the corner towers (castle-local coordinates)
function structures(rng) {
  const S = [{ cx: 0, cz: KEEP_Z, hw: keepW / 2 + 0.6, h: keepH, top: keepH + 6.5, cut: 5.6 + rng() * 1.6, amp: 2.0, t0: 0, win: 0.75, lean: 0.11 + rng() * 0.05 }];
  const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    S.push({ cx: sx * 22.7, cz: sz * 22.7, hw: 4.9, h: towerH, top: towerH + 6, cut: 6.2 + rng() * 2.2, amp: 1.6, t0: 0.15 + order[i] * 0.14, win: 0.6, lean: 0.14 + rng() * 0.08, sx, sz });
  });
  S.forEach((s, i) => {
    s.seed = (rng() * 1000) | 0;
    // which way the top leans: the keep toward its door side (the courtyard), a tower outward or inward, never along the wall
    const a = i === 0 ? Math.PI / 2 + (rng() - 0.5) * 1.6 : Math.atan2(s.sz, s.sx) + (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.7;
    s.ldx = Math.cos(a); s.ldz = Math.sin(a);
    s.tooth = rng() * TAU;               // a stub of wall that stays standing higher than the rest, on this side
    s.hinge = [s.cx, s.cut, s.cz];
  });
  return S;
}
// how high the stump stands at (x, z) of structure s
function stumpAt(s, x, z) {
  const n = vnoise(x * 0.33, z * 0.33, s.seed) * 2 - 1;
  let h = s.cut + s.amp * n;
  const ang = Math.atan2(z - s.cz, x - s.cx), d = Math.hypot(z - s.cz, x - s.cx);
  const near = Math.cos(ang - s.tooth);
  if (near > 0.6 && d > s.hw * 0.45) h += 4.2 * ss((near - 0.6) / 0.3);
  return h;
}
const structOf = (cx, cz) => (Math.abs(cx) > 14 && Math.abs(cz) > 14 ? 1 + (cx > 0 ? 1 : 0) + (cz > 0 ? 2 : 0) : 0);

// Rubble and scorch marks: more pieces of the same meshes, folded to a point until the dust hides them (see plan)
function addExtras(K, A, rng, d) {
  const HW = keepW / 2, z0 = KEEP_Z - HW, z1 = KEEP_Z + HW;
  // scorch marks on the floor
  for (const [cx, cz, r] of [[0, z1 + 2.6, 3.4], [-3.4, z1 + 4.6, 2], [3.6, z1 + 3.6, 2.3], [1, z0 - 2, 2.6], [-8, 6, 1.8], [7, -2, 2.2], [0, 9, 2.6]]) {
    const k = 0.18, c = [k, k * 0.9, k * 0.8], n = 9, a = A.a('plain');
    A.piece(cx, 0.09, cz, r, 0.05, r);
    const base = a.pos.length / 3;
    A._vert(a, cx, 0.09, cz, 0, 1, 0, 0, 0, c);
    for (let i = 0; i < n; i++) { const an = (i / n) * TAU, rr = r * (0.7 + rng() * 0.5); A._vert(a, cx + Math.cos(an) * rr, 0.09, cz + Math.sin(an) * rr, 0, 1, 0, 0, 0, c); }
    for (let i = 0; i < n; i++) a.idx.push(base, base + 1 + ((i + 1) % n), base + 1 + i);
  }
  // rubble round the foot of the keep
  for (let i = 0; i < 10 + 6 * d; i++) {
    const side = Math.floor(rng() * 4), t = (rng() - 0.5) * (keepW + 2), off = 0.7 + rng() * 3.2;
    const x = side < 2 ? t : side === 2 ? -HW - off : HW + off, z = side === 0 ? z1 + off : side === 1 ? z0 - off : KEEP_Z + t;
    const size = 0.35 + rng() * 0.8, sy = size * (0.45 + rng() * 0.35);
    K.add('masonry', new THREE.IcosahedronGeometry(1, 0), place(x, sy * 0.4, z, rng() * 6.28, rng() * 0.6, rng() * 0.6, size, sy, size), K.jitter([0.7, 0.68, 0.64], 0.2));
  }
}


// The shapes of a keep and its four towers cut into pieces are the same for every castle (castle-local metres), so they are made once for each level of detail
// and shared: a castle that falls only copies the arrays it moves and works out its own plan. (`warmCollapse` makes them ahead of time.)
const BASES = new Map();
function baseFor(d) {
  let B = BASES.get(d);
  if (B) return B;
  const rng = mulberry32(4711), table = new Table(), seed = 5;
  const K = new ChunkParts(seed + 4, table), A = new ChunkParts(seed + 2, table), R = new ChunkParts(seed + 3, table);
  const fires = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) G.tower(K, A, R, sx, sz, d);
  G.keep(K, A, R, d, fires);
  const extraFrom = table.n;
  addExtras(K, A, rng, d);
  const n = table.n;
  // the three meshes: stone (with the metal and the dark glass), tiles, timber
  const defs = [
    { mat: 'masonry', accs: [K.acc.masonry, A.acc.metal, A.acc.plain] },
    { mat: 'roof', accs: [R.acc.roof] },
    { mat: 'timber', accs: [A.acc.timber] },
  ];
  const v0 = new Int32Array(n).fill(-1), vn = new Int32Array(n), mesh = new Int8Array(n).fill(-1);
  const groups = defs.map((def, gi) => {
    const accs = def.accs.filter((a) => a && a.idx.length);
    let nv = 0;
    for (const a of accs) nv += a.pos.length / 3;
    if (!nv) return null;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx = [];
    let o = 0;
    for (const a of accs) {
      const m = a.pos.length / 3;
      pos.set(a.pos, o * 3); nor.set(a.nor, o * 3); uv.set(a.uv, o * 2); col.set(a.col, o * 3);
      for (let i = 0; i < a.idx.length; i++) idx.push(a.idx[i] + o);
      // which vertices belong to which piece (every piece's vertices are one run)
      let last = -1;
      for (let i = 0; i < m; i++) {
        const p = a.pid[i];
        if (p !== last) { v0[p] = o + i; mesh[p] = gi; last = p; }
        vn[p]++;
      }
      o += m;
    }
    return { mat: def.mat, pos, nor, uv, col, idx: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
  });
  B = { n, extraFrom, table, v0, vn, mesh, groups };
  BASES.set(d, B);
  return B;
}
// make the shared shapes now (the game does it while a match is being set up, so that no keep ever falls with a hitch)
export function warmCollapse(d) {
  const B = baseFor(d);
  if (B.warm) return;
  B.warm = true;
  const o = Object.create(Collapse.prototype);   // (a plan worked out and thrown away, so that the first real one is not the first run of its code)
  o.n = B.n; o.table = B.table; o.extraFrom = B.extraFrom;
  o.plan(mulberry32(1));
}

export class Collapse {
  constructor(castle, instant = false) {
    this.castle = castle;
    this.t = 0;
    this.rate = 1;
    this.done = false;
    this.meshes = [];
    this.ev = 0;
    const t0 = performance.now();
    this.build();
    for (let p = this.extraFrom; p < this.n; p++) this.write(p, 0);   // (the rubble and scorch marks are folded away until the dust hides them; the rest starts where it stands)
    this.touch();
    this.buildMs = performance.now() - t0;   // (for the tests: the one-off cost of the fall)
    if (instant) this.settle();
  }

  build() {
    const c = this.castle, B = baseFor(c.detail), rng = mulberry32((c.team * 101 + 5) * 7 + 13);
    this.n = B.n; this.table = B.table; this.extraFrom = B.extraFrom; this.v0 = B.v0; this.vn = B.vn; this.mesh = B.mesh;
    // the live arrays are this castle's own copies of the shared shapes; the unmoved shapes stay in `base` (shared, never written)
    this.groups = B.groups.map((g) => {
      if (!g) { this.meshes.push(null); return null; }
      const pos = g.pos.slice(), nor = g.nor.slice(), col = g.col.slice();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 70);   // (pieces fly: never culled while the castle is on screen)
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(-70, -2, -70), new THREE.Vector3(70, 40, 70));
      const mesh = new THREE.Mesh(geo, c.partsMaterial(g.mat));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
      this.meshes.push(mesh);
      c.group.add(mesh);
      c.vis.push(mesh);
      return { pos, nor, col, base: g.pos, baseN: g.nor, baseC: g.col };
    });
    this.plan(rng);
  }

  // what each piece does (see the header)
  plan(rng) {
    const n = this.n, T = this.table, S = structures(rng);
    this.S = S;
    const f = (k) => new Float32Array(n * k);
    this.tRel = f(1); this.tLand = f(1); this.Tf = f(1);
    this.Pr = f(3); this.Qr = f(4); this.Qt = f(4); this.vh = f(2); this.vy0 = f(1); this.ax = f(3); this.spin = f(1); this.hop = f(1); this.sh = f(1);
    this.st = new Uint8Array(n); this.falls = new Uint8Array(n); this.rest = f(3);
    this.state = new Uint8Array(n);   // 0 not started, 1 moving, 2 settled
    const q = new Float32Array(4), q2 = new Float32Array(4), q3 = new Float32Array(4), mtx = new Float32Array(9);
    this.events = [];
    let last = 0;
    this.ghost = new Uint8Array(n);
    this.tChar = f(1); this.kNow = new Float32Array(n).fill(1);
    for (let p = 0; p < n; p++) {
      const cx = T.c[p * 3], cy = T.c[p * 3 + 1], cz = T.c[p * 3 + 2], hx = T.h[p * 3], hy = T.h[p * 3 + 1], hz = T.h[p * 3 + 2];
      if (p >= this.extraFrom) {                    // rubble and scorch marks: there from the moment the dust hides them
        this.ghost[p] = 1; this.falls[p] = 1;
        this.tRel[p] = 0.4 + rng() * 0.25; this.Tf[p] = 0.05; this.tLand[p] = this.tRel[p] + 0.05;
        this.Pr[p * 3] = cx; this.Pr[p * 3 + 1] = cy; this.Pr[p * 3 + 2] = cz;
        this.rest[p * 3] = cx; this.rest[p * 3 + 1] = cy; this.rest[p * 3 + 2] = cz;
        this.Qr.set([0, 0, 0, 1], p * 4); this.Qt.set([0, 0, 0, 1], p * 4);
        this.tChar[p] = -1;
        continue;
      }
      const si = structOf(cx, cz), s = S[si];
      this.st[p] = si;
      const cut = stumpAt(s, cx, cz);
      const falls = cy - hy * 0.4 > cut + (rng() - 0.35) * 0.9;
      this.falls[p] = falls ? 1 : 0;
      this.tChar[p] = 0.1 + rng() * 0.7;          // the stone scorches in a wave, and anything that comes loose is already scorched
      if (!falls) continue;
      const u = clamp01((cy - s.cut) / (s.top - s.cut));                         // 1 at the very top
      const tRel = s.t0 + (1 - u) * s.win * 0.9 + rng() * 0.12;
      this.tRel[p] = tRel;
      this.tChar[p] = Math.min(this.tChar[p], tRel * 0.6);
      // the pose at the moment of release (the top of the structure has been leaning)
      this.leanAt(s, tRel, cx, cy, cz, q, this.Pr, p);
      this.Qr.set(q, p * 4);
      // where it ends up
      // (most of it lands outside the stump, in a ring of rubble round the foot; some falls in)
      const inward = rng() < 0.28;
      let dx = (cx - s.cx) * (inward ? -0.3 : 1.0) + s.ldx * 2.2 * (0.4 + rng()) + (rng() - 0.5) * 3;
      let dz = (cz - s.cz) * (inward ? -0.3 : 1.0) + s.ldz * 2.2 * (0.4 + rng()) + (rng() - 0.5) * 3;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const px = this.Pr[p * 3] - s.cx, pz = this.Pr[p * 3 + 2] - s.cz;
      // how far to the edge of the footprint along that line, then a few metres beyond it (or a short way in for the ones that fall in)
      const tx = dx > 1e-3 ? (s.hw - px) / dx : dx < -1e-3 ? (-s.hw - px) / dx : 1e9, tz = dz > 1e-3 ? (s.hw - pz) / dz : dz < -1e-3 ? (-s.hw - pz) / dz : 1e9;
      const exit = Math.max(0, Math.min(tx, tz));
      const r = inward ? Math.min(exit, 1 + rng() * 3) : Math.min(exit + 1.0 + rng() * (si === 0 ? 5.5 : 4.5), si === 0 ? 14 : 12);
      const rx = this.Pr[p * 3] + dx * r, rz = this.Pr[p * 3 + 2] + dz * r;
      const inside = Math.abs(rx - s.cx) < s.hw && Math.abs(rz - s.cz) < s.hw;
      const floor = inside ? s.cut * 0.8 : 0;
      // how it lies: flat with a small tilt, or on its side when it is tall
      const tall = hy > 1.6 * Math.max(hx, hz) && hy > 1.2;
      const yaw = rng() * TAU;
      axisQuat(0, 1, 0, yaw, q, 0);
      const ta = rng() * TAU;
      axisQuat(Math.cos(ta), 0, Math.sin(ta), tall ? Math.PI / 2 + (rng() - 0.5) * 0.3 : (rng() - 0.5) * 0.7, q2, 0);
      qmul(q, 0, q2, 0, q3, 0);
      this.Qt.set(q3, p * 4);
      quatMat(q3, 0, mtx);
      const ext = Math.abs(mtx[3]) * hx + Math.abs(mtx[4]) * hy + Math.abs(mtx[5]) * hz;
      const ry = floor + ext * 0.92 + rng() * 0.25;
      this.rest[p * 3] = rx; this.rest[p * 3 + 1] = ry; this.rest[p * 3 + 2] = rz;
      // the flight
      const yr = this.Pr[p * 3 + 1], drop = Math.max(0.2, yr - ry);
      const vy0 = rng() * (u > 0.55 ? 5 : 2) * u;
      const Tf = Math.max(0.2, (vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAV * drop)) / GRAV);
      this.vy0[p] = vy0; this.Tf[p] = Tf;
      this.vh[p * 2] = (rx - this.Pr[p * 3]) / Tf; this.vh[p * 2 + 1] = (rz - this.Pr[p * 3 + 2]) / Tf;
      this.tLand[p] = tRel + Tf;
      const size = Math.max(hx, hy, hz);
      const a = rng() * TAU, el = (rng() - 0.5) * 1.2;
      this.ax[p * 3] = Math.cos(a) * Math.cos(el); this.ax[p * 3 + 1] = Math.sin(el); this.ax[p * 3 + 2] = Math.sin(a) * Math.cos(el);
      this.spin[p] = size > 1.6 ? 0 : TAU * Math.floor(rng() * 2.4) * (rng() < 0.5 ? 1 : -1);
      this.hop[p] = Math.min(0.7, 0.05 * drop) * (size > 1.2 ? 1 : 0.6);
      this.sh[p] = rng() * 100;
      if (this.tLand[p] > last) last = this.tLand[p];
      // the big ones raise a cloud where they land
      if (size >= 1.4 && (size >= 2.2 || rng() < 0.5)) this.events.push({ t: this.tLand[p], k: 'dust', x: rx, y: ry, z: rz, s: Math.min(4.5, 1.2 + size * 1.3), n: 8 + size * 5 });
    }
    // the shape of the whole: shocks, clouds and sounds
    this.events.push({ t: 0, k: 'blast', x: 0, y: keepH * 0.5, z: KEEP_Z, s: 7 });
    this.events.push({ t: 0.08, k: 'burst', x: 0, y: keepH + 2, z: KEEP_Z, s: 3.4 }, { t: 0.32, k: 'burst', x: (rng() - 0.5) * 5, y: keepH * 0.7, z: KEEP_Z + (rng() - 0.5) * 5, s: 3 });
    for (let i = 1; i <= 4; i++) this.events.push({ t: S[i].t0 + 0.05, k: 'tower', x: S[i].cx, y: towerH * 0.6, z: S[i].cz, s: 4.6 }, { t: S[i].t0 + 0.12, k: 'burst', x: S[i].cx, y: towerH + 1, z: S[i].cz, s: 2.4 });
    for (let t = 0.15; t < 1.4; t += 0.09) this.events.push({ t, k: 'column', x: (rng() - 0.5) * 8, y: keepH * (0.4 + rng() * 0.5), z: KEEP_Z + (rng() - 0.5) * 8, s: 2.2 + rng() * 1.6, n: 6 });
    this.events.push({ t: 0.95, k: 'ignite' });
    this.events.sort((a, b) => a.t - b.t);
    this.end = Math.max(last + 0.5, 1.0);
  }

  // the lean of structure s at time t: a rigid turn about its stump line, and a sag. Writes the moved point (of the piece at cx, cy, cz) into P at piece p
  // and the turn into q.
  leanAt(s, t, cx, cy, cz, q, P, p) {
    const x = clamp01((t - s.t0) / (s.win + 0.35)), th = s.lean * x * x, sag = 0.9 * x * x;
    axisQuat(s.ldz, 0, -s.ldx, th, q, 0);
    // rotate (c - hinge) about the horizontal axis (ldz, 0, -ldx) by th (Rodrigues): the top moves toward (ldx, ldz)
    const hx = s.hinge[0], hy = s.hinge[1], hz = s.hinge[2];
    const vx = cx - hx, vy = cy - hy, vz = cz - hz;
    const ux = s.ldz, uz = -s.ldx, cs = Math.cos(th), sn = Math.sin(th);
    const dot = ux * vx + uz * vz;
    P[p * 3] = hx + vx * cs + (-uz * vy) * sn + ux * dot * (1 - cs);               // (u x v = (-uz vy, uz vx - ux vz, ux vy))
    P[p * 3 + 1] = hy + vy * cs + (uz * vx - ux * vz) * sn - sag;
    P[p * 3 + 2] = hz + vz * cs + (ux * vy) * sn + uz * dot * (1 - cs);
  }

  // flames and smoke on the tops of the stumps, in castle-local metres: { fires: [[kind, x, y, z, size, phase]], spots: [[x, y, z]] } (see FireSet)
  fires() {
    const rng = mulberry32(this.castle.team * 53 + 11), S = this.S, fires = [], spots = [];
    const burn = (s, n) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * s.hw * 0.7;
        const x = s.cx + Math.cos(a) * r, z = s.cz + Math.sin(a) * r, y = stumpAt(s, x, z);
        const big = 1.6 + rng() * 1.4;
        fires.push([0, x, y + big * 0.45, z, big], [1, x, y + big * 0.5, z, big * 2.0]);
        if (i % 2 === 0) fires.push([2, x, y + 1, z, 3 + rng(), i * 0.25]);
        spots.push([x, y + 1, z]);
      }
    };
    burn(S[0], 7);
    for (let i = 1; i < 5; i++) burn(S[i], 2);
    for (const [x, z] of [[-4.6, KEEP_Z + 7.4], [5.2, KEEP_Z + 7.4], [0.4, KEEP_Z + 9.2]]) fires.push([0, x, 0.7, z, 1.3], [1, x, 0.8, z, 3.4], [2, x, 1, z, 1.6, rng()]);   // burning heaps on the ground round the foot
    return { fires, spots };
  }

  // ---------------------------------------------------------------- the pose of a piece at time t
  // writes the piece's centre into out[0..2] and its rotation matrix into this.m
  pose(p, t, out, qo) {
    const T = this.table, i3 = p * 3, i4 = p * 4;
    const s = this.S[this.st[p]];
    const q = _q, q2 = _q2;
    if (this.ghost[p] && t < this.tRel[p]) { out[0] = T.c[i3]; out[1] = T.c[i3 + 1]; out[2] = T.c[i3 + 2]; qo[0] = qo[1] = qo[2] = 0; qo[3] = 1; return; }
    if (t < this.tRel[p]) {                     // still part of the leaning structure, and shaking
      this.leanAt(s, t, T.c[i3], T.c[i3 + 1], T.c[i3 + 2], qo, out, 0);
      const k = 0.1 * ss(t / Math.max(0.2, this.tRel[p])), ph = this.sh[p];
      out[0] += k * Math.sin(t * 41 + ph); out[1] += k * 0.5 * Math.sin(t * 53 + ph * 1.7); out[2] += k * Math.sin(t * 37 + ph * 2.3);
      return;
    }
    const tau = t - this.tRel[p], Tf = this.Tf[p];
    if (tau < Tf) {                             // in the air
      out[0] = this.Pr[i3] + this.vh[p * 2] * tau;
      out[1] = this.Pr[i3 + 1] + this.vy0[p] * tau - 0.5 * GRAV * tau * tau;
      out[2] = this.Pr[i3 + 2] + this.vh[p * 2 + 1] * tau;
      const u = tau / Tf;
      slerp(this.Qr, i4, this.Qt, i4, ss(u), q, 0);
      if (this.spin[p] !== 0) { axisQuat(this.ax[i3], this.ax[i3 + 1], this.ax[i3 + 2], this.spin[p] * (1 - ss(u)), q2, 0); qmul(q2, 0, q, 0, qo, 0); } else { qo[0] = q[0]; qo[1] = q[1]; qo[2] = q[2]; qo[3] = q[3]; }
      return;
    }
    // on the ground: one small hop, then still
    const w = (tau - Tf) / 0.34;
    out[0] = this.rest[i3]; out[2] = this.rest[i3 + 2];
    out[1] = this.rest[i3 + 1] + (w < 1 ? this.hop[p] * 4 * w * (1 - w) : 0);
    qo[0] = this.Qt[i4]; qo[1] = this.Qt[i4 + 1]; qo[2] = this.Qt[i4 + 2]; qo[3] = this.Qt[i4 + 3];
  }

  // write piece p at time t into the mesh arrays
  write(p, t) {
    const c = _c, qo = _qo, m = _m, T = this.table;
    this.pose(p, t, c, qo);
    quatMat(qo, 0, m);
    if (this.ghost[p] && t < this.tRel[p]) m.fill(0);   // (not there yet: folded to a point)
    const g = this.groups[this.mesh[p]];
    if (!g || !g.pos) return;
    const pos = g.pos, nor = g.nor, bp = g.base, bn = g.baseN;
    const ox = T.c[p * 3], oy = T.c[p * 3 + 1], oz = T.c[p * 3 + 2];
    const v0 = this.v0[p], v1 = v0 + this.vn[p];
    this.char(p, t, g, v0, v1);
    for (let v = v0; v < v1; v++) {
      const i = v * 3, dx = bp[i] - ox, dy = bp[i + 1] - oy, dz = bp[i + 2] - oz, nx = bn[i], ny = bn[i + 1], nz = bn[i + 2];
      pos[i] = c[0] + m[0] * dx + m[1] * dy + m[2] * dz;
      pos[i + 1] = c[1] + m[3] * dx + m[4] * dy + m[5] * dz;
      pos[i + 2] = c[2] + m[6] * dx + m[7] * dy + m[8] * dz;
      nor[i] = m[0] * nx + m[1] * ny + m[2] * nz;
      nor[i + 1] = m[3] * nx + m[4] * ny + m[5] * nz;
      nor[i + 2] = m[6] * nx + m[7] * ny + m[8] * nz;
    }
  }

  // the colour of piece p at time t: scorched from tChar on, over half a second (colours are only written when they change)
  char(p, t, g, v0, v1) {
    const k = this.tChar[p] < 0 ? CHAR : 1 - (1 - CHAR) * ss((t - this.tChar[p]) / 0.5);
    if (k === this.kNow[p]) return;
    this.kNow[p] = k;
    const col = g.col, bc = g.baseC;
    for (let i = v0 * 3, e = v1 * 3; i < e; i++) col[i] = bc[i] * k;
    this.colors = true;
  }

  writeAll(t) {
    for (let p = 0; p < this.n; p++) {
      if (this.falls[p]) this.write(p, t);
      else { const g = this.groups[this.mesh[p]]; if (g && g.col) this.char(p, t, g, this.v0[p], this.v0[p] + this.vn[p]); }
    }
    this.touch();
  }

  touch() {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (!m) continue;
      m.geometry.attributes.position.needsUpdate = true;
      m.geometry.attributes.normal.needsUpdate = true;
      if (this.colors) m.geometry.attributes.color.needsUpdate = true;
    }
    this.colors = false;
  }

  // the end state at once
  settle() {
    this.t = this.end + 10;
    this.writeAll(this.t);
    this.finish();
  }

  finish() {
    this.done = true;
    this.groups = null;     // (the base shapes are not needed any more)
    // everything lies still: the meshes are culled like any other from now on
    for (const m of this.meshes) {
      if (!m) continue;
      m.geometry.computeBoundingSphere();
      m.geometry.computeBoundingBox();
      m.frustumCulled = true;
    }
  }

  // advance by dt (already scaled by the world's time scale); `fx`, `audio` for the dust and the rumble. Returns nothing; allocation-free.
  update(dt, castle) {
    if (this.done) return;
    this.t += dt * this.rate;
    const t = this.t;
    let moving = false;
    for (let p = 0; p < this.n; p++) {
      if (!this.falls[p] || this.state[p] === 2) continue;
      this.write(p, t);
      if (t > this.tLand[p] + 0.4) this.state[p] = 2; else moving = true;
    }
    if (t < 1.4) for (let p = 0; p < this.n; p++) if (!this.falls[p]) { const g = this.groups[this.mesh[p]]; if (g && g.col) this.char(p, t, g, this.v0[p], this.v0[p] + this.vn[p]); }
    this.touch();
    const evs = this.events;
    while (this.ev < evs.length && evs[this.ev].t <= t) castle.collapseEvent(evs[this.ev++], this);
    if (!moving && this.ev >= evs.length && t > this.end) { castle.collapseEnded(this); this.finish(); }
  }
}
const _c = new Float32Array(3), _qo = new Float32Array(4), _m = new Float32Array(9), _q = new Float32Array(4), _q2 = new Float32Array(4);
