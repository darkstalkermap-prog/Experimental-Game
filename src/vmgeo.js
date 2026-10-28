// Geometry for the first-person kit (arms, hands, weapons, shields). Everything is built once per class change from a few primitives
// (sweeps, lathes, patches, boxes) into ONE vertex-coloured BufferGeometry per moving part, so the whole kit costs a handful of draw
// calls. Every vertex carries what the kit shader (vmmat.js) needs: a colour, metalness / roughness / glow, and a surface-grain id with
// coordinates in metres (brushed steel, leather, cloth, wood), so a blade and a sleeve can share one mesh and one material.
import * as THREE from 'three';

const TAU = Math.PI * 2;

// grain ids the kit shader knows
export const PAT = { none: 0, steel: 1, leather: 2, cloth: 3, wood: 4, skin: 5, fur: 6 };

// A paint: colour (hex, as written in sRGB), metalness, roughness, grain, glow (0..1: how much of its own colour it gives off).
export function paint(hex, metal = 0, rough = 0.8, pat = 0, glow = 0) {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b, m: metal, ro: rough, pat, glow };
}
// the same paint, darker or lighter (k multiplies the colour)
export function tone(p, k) { return { ...p, r: Math.min(1, p.r * k), g: Math.min(1, p.g * k), b: Math.min(1, p.b * k) }; }
// halfway (t) between two paints
export function blend(a, b, t) {
  const l = (x, y) => x + (y - x) * t;
  return { r: l(a.r, b.r), g: l(a.g, b.g), b: l(a.b, b.b), m: l(a.m, b.m), ro: l(a.ro, b.ro), pat: t < 0.5 ? a.pat : b.pat, glow: l(a.glow, b.glow) };
}

const V3 = (a) => (a.isVector3 ? a : new THREE.Vector3(a[0], a[1], a[2]));

// The ring of a round section: n points counter-clockwise, radii ru and rv along the frame's u and v.
export function circle(n, ru = 1, rv = ru, phase = 0) {
  const r = [];
  for (let i = 0; i < n; i++) { const a = phase + (i / n) * TAU; r.push([Math.cos(a) * ru, Math.sin(a) * rv]); }
  return r;
}

// Frames along a polyline by parallel transport ({ p, u, v } with u × v the direction of travel).
export function framesAlong(points, up = null) {
  const pts = points.map(V3), n = pts.length, T = [], fr = [];
  for (let i = 0; i < n; i++) T.push(new THREE.Vector3().subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize());
  let u = up ? V3(up).clone() : new THREE.Vector3(0, 1, 0);
  if (Math.abs(u.dot(T[0])) > 0.95) u = Math.abs(T[0].x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  u.addScaledVector(T[0], -u.dot(T[0])).normalize();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    if (i > 0) { q.setFromUnitVectors(T[i - 1], T[i]); u.applyQuaternion(q); u.addScaledVector(T[i], -u.dot(T[i])).normalize(); }
    fr.push({ p: pts[i].clone(), u: u.clone(), v: new THREE.Vector3().crossVectors(T[i], u) });
  }
  return fr;
}

export class Mesher {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.pbr = []; this.pat = []; this.uv = []; this.idx = [];
    this.xf = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.stack = [];
    this.mirrored = false;
  }

  get verts() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }

  // ---- placement: everything built between push/at and pop is moved by that transform ----
  push(m) { this.stack.push(this.xf.clone()); this.xf.multiply(m); this.nm.getNormalMatrix(this.xf); this.mirrored = this.xf.determinant() < 0; return this; }
  pop() { this.xf.copy(this.stack.pop()); this.nm.getNormalMatrix(this.xf); this.mirrored = this.xf.determinant() < 0; return this; }
  at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
    return this.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, sc));
  }

  vert(p, n, mat, pu = 0, pv = 0, u = 0.02, v = 0.02) {
    const q = p.clone().applyMatrix4(this.xf);
    const m = n.clone().applyMatrix3(this.nm).normalize();
    this.pos.push(q.x, q.y, q.z);
    this.nor.push(m.x, m.y, m.z);
    this.col.push(mat.r, mat.g, mat.b);
    this.pbr.push(mat.m, mat.ro, mat.glow, mat.pat);
    this.pat.push(pu, pv);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(a, b, c) { if (this.mirrored) this.idx.push(a, c, b); else this.idx.push(a, b, c); }   // (a mirrored placement turns the triangles inside out)

  // ---- a solid swept along frames; ring(i, t) is the section [a, b, c?] (c: along the travel direction) counter-clockwise from the front ----
  sweep(frames, ring, o = {}) {
    const nF = frames.length;
    const rings = [];
    for (let i = 0; i < nF; i++) rings.push(ring(i, nF > 1 ? i / (nF - 1) : 0));
    const N = rings[0].length;
    const closed = o.closed !== false, smooth = o.smooth !== false;
    const matAt = (i, j = 0) => (typeof o.mat === 'function' ? o.mat(nF > 1 ? i / (nF - 1) : 0, i, j) : o.mat);   // (a function may colour by frame and by ring point)
    const P = [], W = [], len = [0], perim = [];
    for (let i = 0; i < nF; i++) {
      const f = frames[i], w = new THREE.Vector3().crossVectors(f.u, f.v).normalize();
      W.push(w);
      const row = rings[i].map(([a, b, c = 0]) => new THREE.Vector3().copy(f.p).addScaledVector(f.u, a).addScaledVector(f.v, b).addScaledVector(w, c));
      P.push(row);
      if (i) len.push(len[i - 1] + f.p.distanceTo(frames[i - 1].p));
      let pr = 0;
      for (let j = 0; j < N - 1; j++) pr += row[j].distanceTo(row[j + 1]);
      if (closed) pr += row[N - 1].distanceTo(row[0]);
      perim.push(pr);
    }
    const nj = closed ? N : N - 1;
    const patU = (i, j) => (j / N) * perim[i];
    if (smooth) {
      const V = [];
      for (let i = 0; i < nF; i++) {
        const row = [];
        for (let j = 0; j < N; j++) {
          const mat = matAt(i, j);
          const along = new THREE.Vector3().subVectors(P[Math.min(i + 1, nF - 1)][j], P[Math.max(i - 1, 0)][j]);
          const j0 = closed ? (j + N - 1) % N : Math.max(j - 1, 0), j1 = closed ? (j + 1) % N : Math.min(j + 1, N - 1);
          const around = new THREE.Vector3().subVectors(P[i][j1], P[i][j0]);
          const n = new THREE.Vector3().crossVectors(around, along);
          if (n.lengthSq() < 1e-16) n.copy(W[i]).multiplyScalar(i === 0 ? -1 : 1);
          row.push(this.vert(P[i][j], n.normalize(), mat, len[i], patU(i, j)));
        }
        V.push(row);
      }
      for (let i = 0; i < nF - 1; i++) {
        for (let j = 0; j < nj; j++) {
          const j1 = (j + 1) % N;
          const a = V[i][j], b = V[i][j1], c = V[i + 1][j], d = V[i + 1][j1];
          this.tri(a, b, c); this.tri(b, d, c);
        }
      }
    } else {
      const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      const emit = (pa, pb, pc, ia, ib, ic, i, ja, jb, jc, qj) => {
        e1.subVectors(pb, pa); e2.subVectors(pc, pa); n.crossVectors(e1, e2);
        if (n.lengthSq() < 1e-18) return;
        n.normalize();
        const mat = matAt(i, qj);
        const x = this.vert(pa, n, mat, len[ia], patU(ia, ja)), y = this.vert(pb, n, mat, len[ib], patU(ib, jb)), z = this.vert(pc, n, mat, len[ic], patU(ic, jc));
        this.tri(x, y, z);
      };
      for (let i = 0; i < nF - 1; i++) {
        for (let j = 0; j < nj; j++) {
          const j1 = (j + 1) % N;
          emit(P[i][j], P[i][j1], P[i + 1][j], i, i, i + 1, i, j, j1, j, j);
          emit(P[i][j1], P[i + 1][j1], P[i + 1][j], i, i + 1, i + 1, i, j1, j1, j, j);
        }
      }
    }
    // flat caps
    const cap = (i, sign) => {
      const mat = matAt(i), c = new THREE.Vector3();
      for (const p of P[i]) c.add(p);
      c.multiplyScalar(1 / N);
      const n = W[i].clone().multiplyScalar(sign);
      const ci = this.vert(c, n, mat, len[i], 0);
      const vs = P[i].map((p, j) => this.vert(p, n, mat, len[i], patU(i, j)));
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        if (sign > 0) this.tri(ci, vs[j], vs[j1]); else this.tri(ci, vs[j1], vs[j]);
      }
    };
    if (o.capStart) cap(0, -1);
    if (o.capEnd) cap(nF - 1, 1);
    return this;
  }

  // ---- a round (or elliptical) tube along a polyline with a radius at every point; cap: 'round' | 'flat' | null ----
  tube(points, radii, sides, o = {}) {
    const pts = points.map(V3);
    const n = pts.length;
    const rad = typeof radii === 'number' ? pts.map(() => radii) : Array.isArray(radii) ? radii.slice() : pts.map((_, i) => radii(n > 1 ? i / (n - 1) : 0));
    let fr = framesAlong(pts, o.up);
    const cs = o.capStart ?? o.cap ?? null, ce = o.capEnd ?? o.cap ?? null;
    const K = o.capSteps || 3;
    const scale = o.scale || [1, 1];
    let R = rad;
    if (cs === 'round') {
      const f0 = fr[0], t0 = new THREE.Vector3().crossVectors(f0.u, f0.v), r0 = rad[0], add = [], addR = [];
      for (let k = K; k >= 1; k--) {
        const ph = (k / K) * Math.PI / 2;
        add.push({ p: f0.p.clone().addScaledVector(t0, -r0 * Math.sin(ph) * scale[0]), u: f0.u.clone(), v: f0.v.clone() });
        addR.push(Math.max(r0 * Math.cos(ph), r0 * 0.02));
      }
      fr = add.concat(fr); R = addR.concat(R);
    }
    if (ce === 'round') {
      const f1 = fr[fr.length - 1], t1 = new THREE.Vector3().crossVectors(f1.u, f1.v), r1 = rad[n - 1];
      for (let k = 1; k <= K; k++) {
        const ph = (k / K) * Math.PI / 2;
        fr.push({ p: f1.p.clone().addScaledVector(t1, r1 * Math.sin(ph) * scale[0]), u: f1.u.clone(), v: f1.v.clone() });
        R.push(Math.max(r1 * Math.cos(ph), r1 * 0.02));
      }
    }
    const base = circle(sides, 1, 1, o.phase || 0);
    return this.sweep(fr, (i) => base.map(([a, b]) => [a * R[i] * scale[0], b * R[i] * scale[1]]), { mat: o.mat, smooth: o.smooth, capStart: cs === 'flat', capEnd: ce === 'flat' });
  }

  // ---- a solid of revolution about the local y axis; profile [r, y, 'h'?] runs from the bottom up the outside ('h': a hard edge there) ----
  lathe(profile, sides, o = {}) {
    const K = profile.length - 1;
    const segN = [], s = [0];
    for (let k = 0; k < K; k++) {
      const dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1], l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
      s.push(s[k] + l);
    }
    const crease = o.crease ?? 0.55;
    const matAt = (k) => (typeof o.mat === 'function' ? o.mat(k / K, k) : o.mat);
    const rows = [], cache = new Map();
    const rowFor = (k, seg) => {
      let smoothPt = profile[k][2] !== 'h' && k > 0 && k < K;
      if (smoothPt) smoothPt = segN[k - 1][0] * segN[k][0] + segN[k - 1][1] * segN[k][1] > crease;
      const key = smoothPt ? k : k + ':' + seg;
      if (cache.has(key)) return cache.get(key);
      let nr, ny;
      if (smoothPt) { nr = segN[k - 1][0] + segN[k][0]; ny = segN[k - 1][1] + segN[k][1]; } else { [nr, ny] = segN[seg]; }
      const l = Math.hypot(nr, ny) || 1;
      const row = []; const [r, y] = profile[k], mat = matAt(k);
      for (let j = 0; j <= sides; j++) {
        const th = (j / sides) * TAU, c = Math.cos(th), sn = Math.sin(th);
        row.push(this.vert(new THREE.Vector3(r * c, y, r * sn), new THREE.Vector3((nr / l) * c, ny / l, (nr / l) * sn), mat, s[k], th * Math.max(r, 0.004)));
      }
      rows.push(row); cache.set(key, row);
      return row;
    };
    for (let k = 0; k < K; k++) {
      if (profile[k][0] < 1e-6 && profile[k + 1][0] < 1e-6) continue;
      const A = rowFor(k, k), B = rowFor(k + 1, k);
      for (let j = 0; j < sides; j++) { this.tri(A[j], B[j], A[j + 1]); this.tri(A[j + 1], B[j], B[j + 1]); }
    }
    return this;
  }

  // ---- a sphere / ellipsoid (radius r, scaled by sc on each axis), poles on y ----
  sphere(r, seg, mat, sc = [1, 1, 1]) {
    const prof = [];
    const rings = Math.max(4, seg >> 1);
    for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + (i / rings) * Math.PI; prof.push([Math.max(0, Math.cos(a) * r), Math.sin(a) * r]); }
    this.at(0, 0, 0, 0, 0, 0, sc);
    this.lathe(prof, seg, { mat, crease: -2 });
    return this.pop();
  }

  // ---- a cylinder / cone frustum along y from y0 to y1 with flat caps ----
  cyl(r0, r1, y0, y1, sides, mat, o = {}) {
    const prof = [[0, y0], [r0, y0, 'h'], [r1, y1, 'h'], [0, y1]];
    if (o.open) prof.splice(0, 1), prof.pop();
    return this.lathe(prof, sides, { mat });
  }

  // ---- a parametric surface: fn(u, v) -> [x, y, z]; o: { mat, flip, uv: (u, v) -> [U, V], size: [metres across, metres along] } ----
  patch(nu, nv, fn, o = {}) {
    const P = (u, v) => V3(fn(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))));
    const eps = 1e-3, flip = !!o.flip, ids = [];
    const [su, sv] = o.size || [1, 1];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        const p = P(u, v);
        let n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(P(u + eps, v), P(u - eps, v)), new THREE.Vector3().subVectors(P(u, v + eps), P(u, v - eps)));
        if (n.lengthSq() < 1e-14) {
          const vv = v < 0.5 ? v + 0.02 : v - 0.02, uu = u < 0.5 ? u + 0.02 : u - 0.02;
          n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(P(uu + eps, vv), P(uu - eps, vv)), new THREE.Vector3().subVectors(P(uu, vv + eps), P(uu, vv - eps)));
        }
        n.normalize();
        if (flip) n.negate();
        const [U, Vv] = o.uv ? o.uv(u, v) : [0.02, 0.02];
        ids.push(this.vert(p, n, typeof o.mat === 'function' ? o.mat(u, v) : o.mat, u * su, v * sv, U, Vv));
      }
    }
    const W = nu + 1;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = ids[j * W + i], b = ids[j * W + i + 1], c = ids[(j + 1) * W + i], d = ids[(j + 1) * W + i + 1];
        if (flip) { this.tri(a, c, b); this.tri(b, c, d); } else { this.tri(a, b, c); this.tri(b, d, c); }
      }
    }
    return this;
  }

  // ---- a box centred on the origin, six flat faces ----
  box(w, h, d, mat) {
    const half = [w / 2, h / 2, d / 2];
    const F = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
    for (const [n, u, v] of F) {
      const hn = Math.abs(n[0]) * half[0] + Math.abs(n[1]) * half[1] + Math.abs(n[2]) * half[2];
      const hu = Math.abs(u[0]) * half[0] + Math.abs(u[1]) * half[1] + Math.abs(u[2]) * half[2];
      const hv = Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2];
      const nn = V3(n), ids = [];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = new THREE.Vector3(n[0] * hn + u[0] * su * hu + v[0] * sv * hv, n[1] * hn + u[1] * su * hu + v[1] * sv * hv, n[2] * hn + u[2] * su * hu + v[2] * sv * hv);
        ids.push(this.vert(p, nn, mat, (su + 1) * hu, (sv + 1) * hv));
      }
      this.tri(ids[0], ids[1], ids[2]); this.tri(ids[0], ids[2], ids[3]);
    }
    return this;
  }

  // ---- a box with its edges chamfered by c (flat-shaded, so metal catches a crisp highlight on each edge); long axis y ----
  chamfer(w, h, d, c, mat) {
    const x = w / 2, z = d / 2, y0 = -h / 2, y1 = h / 2;
    c = Math.min(c, x * 0.95, z * 0.95);
    const ring = [[x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c], [-x + c, -z], [x - c, -z]];
    // sweep along y: u = x, v = -z so that u × v = y (the box is symmetric, so reading z as -z changes nothing)
    const fr = [{ p: new THREE.Vector3(0, y0, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) }, { p: new THREE.Vector3(0, y1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) }];
    return this.sweep(fr, () => ring, { mat, smooth: false, capStart: true, capEnd: true });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPbr', new THREE.Float32BufferAttribute(this.pbr, 4));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.pat, 2));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.verts > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  // a second pose of the same shape (built with the very same calls) becomes a morph target of `geo`
  static morph(geo, other, name = 'pose') {
    if (other.verts !== geo.attributes.position.count) throw new Error('vmgeo: morph target has a different vertex count');
    geo.morphAttributes.position = (geo.morphAttributes.position || []).concat(new THREE.Float32BufferAttribute(other.pos, 3));
    geo.morphAttributes.normal = (geo.morphAttributes.normal || []).concat(new THREE.Float32BufferAttribute(other.nor, 3));
    geo.userData.morphNames = (geo.userData.morphNames || []).concat(name);
  }
}

// ---- small curve helpers used by the kit builders ----
// n+1 points on a quadratic Bezier
export function bezier(p0, p1, p2, n) {
  const a = V3(p0), b = V3(p1), c = V3(p2), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(new THREE.Vector3(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z));
  }
  return out;
}
// n+1 points along an arc in the plane spanned by unit vectors ex, ey around centre c, radius r, from angle a0 to a1
export function arc(c, ex, ey, r, a0, a1, n) {
  const C = V3(c), X = V3(ex), Y = V3(ey), out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push(new THREE.Vector3().copy(C).addScaledVector(X, Math.cos(a) * r).addScaledVector(Y, Math.sin(a) * r)); }
  return out;
}
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
