// A small geometry kit for static scenery: pieces are collected per material key and merged into one geometry per key, so a whole
// castle, a siege engine or a prop camp costs a handful of draw calls instead of hundreds. Every piece carries a vertex colour (a tint
// the material multiplies) and UVs that are projected from the piece's position, not stretched over each face, so the masonry courses
// of neighbouring boxes, corners and towers line up and textures keep one density everywhere.
//
//   const p = new Parts(seed);
//   p.box('masonry', x0, x1, y0, y1, z0, z1, STONE);          // axis-aligned, coordinates in the space the mesh will be placed in
//   p.obox('timber', matrix, hx, hy, hz, tint);                // oriented box centred on matrix
//   p.cyl('masonry', rTop, rBottom, h, segs, matrix, tint);    // cylinder / cone about the matrix's y axis (base at y = 0)
//   p.add('roof', someThreeGeometry, matrix, tint);            // any indexed or plain THREE geometry
//   const geo = p.geometry('masonry');                         // -> THREE.BufferGeometry (or null when empty)
//   p.cull([other, ...]);                                      // drop the faces of axis-aligned boxes that lie inside other solids (see below)
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const WHITE = [1, 1, 1];
const tmpColor = new THREE.Color();
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'number') { tmpColor.setHex(c); return [tmpColor.r, tmpColor.g, tmpColor.b]; }   // (hex colours are sRGB: stored linear)
  if (c && c.isColor) return [c.r, c.g, c.b];
  return WHITE;
}
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// how each material key maps its texture: 'world' projects the position of the piece (masonry courses line up everywhere),
// 'grain' runs the texture's v along the piece's longest side (planks and beams), 'local' projects in the piece's own frame
export const UV_CFG = {
  masonry: { scale: 4, mode: 'world' },
  ground: { scale: 4, mode: 'world' },
  timber: { scale: 1.6, mode: 'grain' },
  roof: { scale: 2, mode: 'local' },
  metal: { scale: 1, mode: 'none' },
  plain: { scale: 1, mode: 'none' },
};

const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const IDENT = new THREE.Matrix4();

// the six faces of a box: [normal, four corners (0 = min, 1 = max per axis, counter-clockwise seen from outside)]
const FACES = [
  ['e', 1, 0, 0, [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]],
  ['w', -1, 0, 0, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  ['u', 0, 1, 0, [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  ['d', 0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  ['n', 0, 0, 1, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  ['s', 0, 0, -1, [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
];

// Is the face of an axis-aligned box covered, in the plane just outside it, by the union of the other boxes? (rectangles taken away one by one)
const COVER_EPS = 1e-4, COVER_TOL = 1e-6;
function buried(f, solids) {
  const b = f.rec, ax = f.ax, u = (ax + 1) % 3, v = (ax + 2) % 3, plane = f.up ? b.hi[ax] + COVER_EPS : b.lo[ax] - COVER_EPS;
  let rem = [[b.lo[u], b.lo[v], b.hi[u], b.hi[v]]];
  for (const o of solids) {
    if (o === b || !(o.lo[ax] < plane && plane < o.hi[ax])) continue;
    const r0 = o.lo[u], r1 = o.lo[v], r2 = o.hi[u], r3 = o.hi[v];
    const next = [];
    for (const q of rem) {
      if (r0 >= q[2] - COVER_TOL || r2 <= q[0] + COVER_TOL || r1 >= q[3] - COVER_TOL || r3 <= q[1] + COVER_TOL) { next.push(q); continue; }
      if (q[0] < r0 - COVER_TOL) next.push([q[0], q[1], r0, q[3]]);
      if (q[2] > r2 + COVER_TOL) next.push([r2, q[1], q[2], q[3]]);
      const x0 = Math.max(q[0], r0), x1 = Math.min(q[2], r2);
      if (q[1] < r1 - COVER_TOL) next.push([x0, q[1], x1, r1]);
      if (q[3] > r3 + COVER_TOL) next.push([x0, r3, x1, q[3]]);
    }
    rem = next;
    if (!rem.length) return true;
  }
  return false;
}

export class Parts {
  constructor(seed = 1, cfg = UV_CFG) {
    this.cfg = cfg;
    this.acc = {};
    this.boxes = [];   // the axis-aligned boxes added so far: { lo: [x, y, z], hi: [x, y, z] } (what cull() tests faces against)
    this.rng = mulberry32(seed);
  }

  a(key) { return this.acc[key] || (this.acc[key] = { pos: [], nor: [], uv: [], col: [], idx: [], q: [] }); }
  empty() { for (const k in this.acc) if (this.acc[k].idx.length) return false; return true; }
  keys() { return Object.keys(this.acc).filter((k) => this.acc[k].idx.length); }
  triangles() { let n = 0; for (const k in this.acc) n += this.acc[k].idx.length / 3; return n; }
  // a tint wobbled a little so identical pieces do not look cloned
  jitter(c, amt = 0.08) { const k = 1 + (this.rng() - 0.5) * 2 * amt; return [c[0] * k, c[1] * k, c[2] * k]; }

  // ---- low level: append vertices (already in final space) to a key ----
  _vert(a, x, y, z, nx, ny, nz, u, v, col) {
    a.pos.push(x, y, z); a.nor.push(nx, ny, nz); a.uv.push(u, v); a.col.push(col[0], col[1], col[2]);
  }

  // texture coordinates of a point on a face: `loc` = the point and normal in the projection space
  _uv(cfg, o, ax, x, y, z, grain) {
    const s = o && o.scale || cfg.scale;
    let u, v;
    if (cfg.mode === 'none') return [0, 0];
    if (grain >= 0 && cfg.mode === 'grain') {
      // v follows the longest side of the piece, u runs across it
      const c = [x, y, z];
      if (ax === grain) { u = c[(ax + 1) % 3]; v = c[(ax + 2) % 3]; } else { v = c[grain]; u = c[3 - ax - grain]; }
    } else if (ax === 0) { u = z; v = y; } else if (ax === 1) { u = x; v = z; } else { u = x; v = y; }
    u /= s; v /= s;
    if (o && o.off) { u += o.off[0]; v += o.off[1]; }
    return [u, v];
  }

  // ---- boxes ----
  // Axis-aligned box. `o`: { skip: 'd' (faces to leave out: e w u d n s), scale, off: [du, dv], grain: 0|1|2 }
  box(key, xa, xb, ya, yb, za, zb, color = WHITE, o = null) {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    this._box(key, null, x0, x1, y0, y1, z0, z1, color, o);
  }
  // Oriented box centred on the matrix (its local axes), half sizes hx hy hz.
  obox(key, m, hx, hy, hz, color = WHITE, o = null) { this._box(key, m, -hx, hx, -hy, hy, -hz, hz, color, o); }

  _box(key, m, x0, x1, y0, y1, z0, z1, color, o) {
    const a = this.a(key), cfg = this.cfg[key] || UV_CFG.metal;
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    const skip = o && o.skip || '';
    let grain = -1;
    if (cfg.mode === 'grain') {
      grain = o && o.grain != null ? o.grain : (x1 - x0 >= y1 - y0 && x1 - x0 >= z1 - z0) ? 0 : (y1 - y0 >= z1 - z0 ? 1 : 2);
    }
    const world = cfg.mode === 'world' && m;     // world projection of a rotated box: project the final position
    if (m) _nm.getNormalMatrix(m);
    const rec = m ? null : { lo, hi };           // (an axis-aligned box is remembered, and so is where each of its faces went: see cull)
    if (rec) this.boxes.push(rec);
    for (const [name, nx, ny, nz, corners] of FACES) {
      if (skip.indexOf(name) >= 0) continue;
      const base = a.pos.length / 3;
      const ax = nx ? 0 : ny ? 1 : 2;
      if (rec) a.q.push({ rec, ax, up: nx + ny + nz > 0, at: a.idx.length });
      let wn = null;
      if (m) { _n.set(nx, ny, nz).applyMatrix3(_nm).normalize(); wn = _n; }
      for (const c of corners) {
        let x = c[0] ? hi[0] : lo[0], y = c[1] ? hi[1] : lo[1], z = c[2] ? hi[2] : lo[2];
        let ux = x, uy = y, uz = z, uax = ax;
        if (m) {
          _p.set(x, y, z).applyMatrix4(m); x = _p.x; y = _p.y; z = _p.z;
          if (world) { ux = x; uy = y; uz = z; uax = Math.abs(wn.x) > Math.abs(wn.y) ? (Math.abs(wn.x) > Math.abs(wn.z) ? 0 : 2) : (Math.abs(wn.y) > Math.abs(wn.z) ? 1 : 2); }
        }
        const uv = this._uv(cfg, o, uax, ux, uy, uz, grain);
        this._vert(a, x, y, z, m ? wn.x : nx, m ? wn.y : ny, m ? wn.z : nz, uv[0], uv[1], color);
      }
      a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // ---- any THREE geometry (cylinders, cones, spheres, lathes, extrusions) ----
  // `o.uv`: 'keep' keeps the geometry's own UVs multiplied by o.uvMul = [mu, mv]; otherwise projected like a box face.
  add(key, geo, m = null, color = WHITE, o = null) {
    const a = this.a(key), cfg = this.cfg[key] || UV_CFG.metal;
    const pos = geo.attributes.position, nor = geo.attributes.normal, uvs = geo.attributes.uv;
    const base = a.pos.length / 3;
    if (m) _nm.getNormalMatrix(m);
    const keep = o && o.uv === 'keep' && uvs;
    const mu = o && o.uvMul ? o.uvMul[0] : 1, mv = o && o.uvMul ? o.uvMul[1] : 1;
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i);
      let ux = _p.x, uy = _p.y, uz = _p.z, nax = _n.x, nay = _n.y, naz = _n.z;
      if (m) { _p.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      if (cfg.mode === 'world' && m) { ux = _p.x; uy = _p.y; uz = _p.z; nax = _n.x; nay = _n.y; naz = _n.z; }
      let u = 0, v = 0;
      if (keep) { u = uvs.getX(i) * mu + (o.off ? o.off[0] : 0); v = uvs.getY(i) * mv + (o.off ? o.off[1] : 0); } else if (cfg.mode !== 'none') {
        const ax = Math.abs(nax) > Math.abs(nay) ? (Math.abs(nax) > Math.abs(naz) ? 0 : 2) : (Math.abs(nay) > Math.abs(naz) ? 1 : 2);
        const t = this._uv(cfg.mode === 'grain' ? { ...cfg, mode: 'local' } : cfg, o, ax, ux, uy, uz, -1);
        u = t[0]; v = t[1];
      }
      this._vert(a, _p.x, _p.y, _p.z, _n.x, _n.y, _n.z, u, v, color);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) a.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) a.idx.push(base + i);
    geo.dispose();
  }

  // Cylinder or cone standing on the matrix's origin along its y axis (base at 0, top at h). The texture wraps a whole number of times.
  cyl(key, rTop, rBottom, h, segs = 12, m = null, color = WHITE, o = null) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segs, 1, !!(o && o.open));
    g.translate(0, h / 2, 0);
    const cfg = this.cfg[key] || UV_CFG.metal, s = o && o.scale || cfg.scale;
    const wraps = Math.max(1, Math.round(Math.PI * (rTop + rBottom) / s));
    const uv = g.attributes.uv, nor = g.attributes.normal, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nor.getY(i)) < 0.5) uv.setXY(i, uv.getX(i) * wraps, uv.getY(i) * h / s);     // the side
      else uv.setXY(i, pos.getX(i) / s + 0.5, pos.getZ(i) / s + 0.5);                            // a cap
    }
    this.add(key, g, m, color, { ...o, uv: 'keep' });
  }

  // A flat four-cornered piece (cloth, decals, ground): corners p0..p3 counter-clockwise seen from the front, with its own UVs.
  quad(key, p0, p1, p2, p3, color = WHITE, uv = [0, 0, 1, 0, 1, 1, 0, 1], twoSided = false) {
    const a = this.a(key);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const pts = [p0, p1, p2, p3];
    for (let side = 0; side < (twoSided ? 2 : 1); side++) {
      const base = a.pos.length / 3, s = side ? -1 : 1;
      for (let i = 0; i < 4; i++) this._vert(a, pts[i][0], pts[i][1], pts[i][2], nx * s, ny * s, nz * s, uv[i * 2], uv[i * 2 + 1], color);
      if (side) a.idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // ---- copies: stamp a prebuilt Parts (a barrel, a crate stack) at a matrix, optionally tinted ----
  stamp(src, m = null, tint = null) {
    if (m) _nm.getNormalMatrix(m);
    for (const key in src.acc) {
      const s = src.acc[key];
      if (!s.idx.length) continue;
      const a = this.a(key), base = a.pos.length / 3;
      for (let i = 0; i < s.pos.length; i += 3) {
        if (m) {
          _p.set(s.pos[i], s.pos[i + 1], s.pos[i + 2]).applyMatrix4(m);
          _n.set(s.nor[i], s.nor[i + 1], s.nor[i + 2]).applyMatrix3(_nm).normalize();
          a.pos.push(_p.x, _p.y, _p.z); a.nor.push(_n.x, _n.y, _n.z);
        } else { a.pos.push(s.pos[i], s.pos[i + 1], s.pos[i + 2]); a.nor.push(s.nor[i], s.nor[i + 1], s.nor[i + 2]); }
        if (tint) a.col.push(s.col[i] * tint[0], s.col[i + 1] * tint[1], s.col[i + 2] * tint[2]);
        else a.col.push(s.col[i], s.col[i + 1], s.col[i + 2]);
      }
      for (let i = 0; i < s.uv.length; i++) a.uv.push(s.uv[i]);
      for (let i = 0; i < s.idx.length; i++) a.idx.push(base + s.idx[i]);
    }
  }
  // append everything of another Parts as it is
  merge(src) { this.stamp(src, null, null); }

  // ---- hidden faces ----
  // Drop every face of an axis-aligned box that lies wholly inside other solids (this one's boxes and those of the `others` Parts, which must
  // be there whenever this one is): a face buried in the stone next to it can be seen from nowhere, and a castle is made of boxes that
  // overlap and abut each other all over (corbels on walls, towers on the wall corners, the footing round everything). Exact: a face goes only
  // when the rectangles of the solids that cover the plane just outside it add up to the whole face. Call it once, before merging.
  cull(others = []) {
    const solids = this.boxes.concat(...others.map((o) => o.boxes));
    let dropped = 0;
    for (const key in this.acc) {
      const a = this.acc[key];
      if (!a.q.length) continue;
      const dead = [];
      for (const f of a.q) if (buried(f, solids)) dead.push(f.at);
      a.q = [];
      if (!dead.length) continue;
      const idx = [];
      for (let i = 0, k = 0; i < a.idx.length; i++) {
        if (k < dead.length && i === dead[k]) { i += 5; k++; continue; }   // (a face is six consecutive indices)
        idx.push(a.idx[i]);
      }
      a.idx = idx;
      dropped += dead.length;
    }
    return dropped;
  }

  // ---- result ----
  geometry(key) {
    const a = this.acc[key];
    if (!a || !a.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(a.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(a.col), 3));
    const n = a.pos.length / 3;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(a.idx) : new Uint16Array(a.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// a placement matrix: position, yaw about y, then optional pitch about x and roll about z, uniform or per-axis scale
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
export function place(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
}
// a beam from point a to point b: matrix centred between them with its local z along the beam (hz = half length)
const _up = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mat = new THREE.Matrix4(), _dir = new THREE.Vector3();
export function between(ax, ay, az, bx, by, bz) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  _dir.subVectors(_b, _a);
  const len = _dir.length();
  _dir.normalize();
  const up = Math.abs(_dir.y) > 0.98 ? _t.set(1, 0, 0) : _up;
  _mat.lookAt(_a, _b, up);
  const m = _mat.clone();
  m.setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return { m, half: len / 2 };
}
export { IDENT };
