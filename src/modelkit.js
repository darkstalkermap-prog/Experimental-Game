// Geometry kit for the character models. A shape (a helmet, a torso, a sword...) is assembled out of primitives into ONE indexed
// geometry that carries, per vertex:
//   position, normal
//   color   the colour itself, or a grey shade when the part takes a per-soldier colour (house cloth, skin, hair)
//   aSurf   roughness, metalness, colour slot (SLOT), feature gate (0 always shown; n shown while bit n of the soldier's flags is set;
//           -n shown while it is clear)
//   aFx     cloth sway weight (0..0.99 hanging cloth, 1..2 capes), pattern (PAT), u, v (for the face and emblem atlases)
// unitmat.js reads them in the shader. Ambient occlusion is baked into `color` (darker under things, lighter on top).
import * as THREE from 'three';

// colour slots: which per-instance colour a part takes (see unitmat.js)
export const SLOT = { fixed: 0, cloth: 1, skin: 2, hair: 3, clothDark: 4, clothLight: 5, skinDark: 6, glow: 7 };
// surface patterns drawn in the fragment shader
export const PAT = { none: 0, weave: 1, quilt: 2, mail: 3, leather: 4, grain: 5, fur: 6, face: 7, emblem: 8, scale: 9, glow: 10 };
// [roughness, metalness]
export const MAT = {
  cloth: [0.92, 0], wool: [0.97, 0], silk: [0.55, 0], leather: [0.6, 0.02], skin: [0.58, 0], hair: [0.78, 0], fur: [1, 0], wood: [0.74, 0], bone: [0.5, 0],
  steel: [0.3, 0.9], plate: [0.34, 0.88], iron: [0.5, 0.8], mail: [0.46, 0.75], gold: [0.3, 0.95], brass: [0.4, 0.85], gem: [0.12, 0.1], rubber: [0.9, 0],
};

const _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color(), _tp = new THREE.Vector3(), _tn = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Builder {
  // level 0 richest .. 2 plainest: how many segments and small parts the shape carries
  constructor(level = 0) {
    this.level = level;
    this.P = []; this.N = []; this.C = []; this.S = []; this.F = []; this.I = [];
    this.count = 0;
  }

  // level 3 is the baked far-away model: plain like level 2 with fewer segments still
  pick(a, b, c) { return this.level === 0 ? a : this.level === 1 ? b : this.level === 2 ? c : Math.max(3, Math.round(c * 0.6)); }

  // Place a three.js geometry through matrix M. Options:
  //   m material (MAT key)  c fixed colour (hex)  s slot (SLOT key)  a [shade at the bottom, at the top] of the primitive's y extent
  //   g feature gate  w cloth sway weight, or [bottom, top]  p pattern  uv [cx, cy, sx, sy] planar (x, y) or a function  flat faceted normals
  add(geo, M, o = {}) {
    const pa = geo.attributes.position, na = geo.attributes.normal, ia = geo.index ? geo.index.array : null;
    const nv = pa.count;
    _n3.getNormalMatrix(M);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const y0 = geo.boundingBox.min.y, yr = (geo.boundingBox.max.y - y0) || 1;
    const mat = MAT[o.m || 'cloth'];
    const slot = o.s ? SLOT[o.s] : 0;
    const col = _c.set(o.c === undefined ? 0xffffff : o.c);
    const [ao0, ao1] = o.a || [0.82, 1];
    const [w0, w1] = Array.isArray(o.w) ? o.w : [o.w || 0, o.w || 0];
    const uv = o.uv;
    const base = this.count;
    const flat = !!o.flat;
    const mirrored = M.determinant() < 0;   // (a mirrored placement turns the triangles inside out)
    // (faceted shapes get their own copy of each vertex per triangle, with the face normal)
    const place = (i, forceN) => {
      _tp.fromBufferAttribute(pa, i).applyMatrix4(M);
      if (forceN) _tn.copy(forceN); else _tn.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize();
      const t = (pa.getY(i) - y0) / yr;
      let shade = ao0 + (ao1 - ao0) * t;
      const ny = _tn.y;
      shade *= ny >= 0 ? 0.88 + 0.12 * ny : 0.88 + 0.26 * ny;
      this.P.push(_tp.x, _tp.y, _tp.z);
      this.N.push(_tn.x, _tn.y, _tn.z);
      if (slot) this.C.push(shade, shade, shade); else this.C.push(col.r * shade, col.g * shade, col.b * shade);
      this.S.push(mat[0], mat[1], slot, o.g || 0);
      let u = 0, v = 0;
      if (uv) {
        if (typeof uv === 'function') { const r = uv(_tp.x, _tp.y, _tp.z); u = r[0]; v = r[1]; }
        else { u = (_tp.x - uv[0]) / uv[2] + 0.5; v = (_tp.y - uv[1]) / uv[3] + 0.5; }
      }
      this.F.push(w0 + (w1 - w0) * t, o.p || 0, u, v);
    };
    if (flat) {
      const tris = ia ? ia.length / 3 : nv / 3;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c2 = new THREE.Vector3();
      for (let f = 0; f < tris; f++) {
        const i0 = ia ? ia[f * 3] : f * 3, i1 = ia ? ia[f * 3 + 1] : f * 3 + 1, i2 = ia ? ia[f * 3 + 2] : f * 3 + 2;
        a.fromBufferAttribute(pa, i0).applyMatrix4(M); b.fromBufferAttribute(pa, i1).applyMatrix4(M); c2.fromBufferAttribute(pa, i2).applyMatrix4(M);
        const fn = b.sub(a).cross(c2.sub(a)).normalize();
        place(i0, fn); place(i1, fn); place(i2, fn);
        if (mirrored) this.I.push(this.count, this.count + 2, this.count + 1); else this.I.push(this.count, this.count + 1, this.count + 2);
        this.count += 3;
      }
      return this;
    }
    for (let i = 0; i < nv; i++) place(i);
    const n = ia ? ia.length : nv;
    for (let i = 0; i < n; i += 3) {
      const a = base + (ia ? ia[i] : i), b = base + (ia ? ia[i + 1] : i + 1), c3 = base + (ia ? ia[i + 2] : i + 2);
      if (mirrored) this.I.push(a, c3, b); else this.I.push(a, b, c3);
    }
    this.count += nv;
    return this;
  }

  place(geo, c, rot, scale, o) {
    _m.compose(_p.fromArray(c), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), typeof scale === 'number' ? _s.set(scale, scale, scale) : _s.fromArray(scale));
    this.add(geo, _m, o);
    geo.dispose();
    return this;
  }

  // how finely a sphere of this radius is cut at this level of detail: [around, down]
  ellSeg(rm, seg) {
    if (seg) return typeof seg === 'number' ? [seg, Math.max(3, Math.round(seg * 0.7))] : seg;
    const t = rm >= 0.2 ? [[14, 10], [9, 6], [7, 5], [5, 4]] : rm >= 0.1 ? [[10, 7], [7, 5], [6, 4], [4, 3]] : rm >= 0.05 ? [[8, 6], [6, 4], [5, 3], [4, 3]] : [[6, 4], [5, 3], [4, 3], [4, 3]];
    return t[Math.min(3, this.level)];
  }

  // ellipsoid: centre c, radii r (a number or [rx, ry, rz])
  ell(c, r, o = {}) {
    const sg = this.ellSeg(typeof r === 'number' ? r : Math.max(r[0], r[1], r[2]), o.seg);
    return this.place(new THREE.SphereGeometry(1, sg[0], sg[1]), c, o.rot || [0, 0, 0], r, o);
  }

  // part of an ellipsoid: phi0..phi0+phiLen around y (0 is -x, a quarter turn is +z), theta0..theta0+thLen down from the top
  shell(c, r, phi0, phiLen, th0, thLen, o = {}) {
    const sg = this.ellSeg(typeof r === 'number' ? r : Math.max(r[0], r[1], r[2]), o.seg);
    return this.place(new THREE.SphereGeometry(1, sg[0], sg[1], phi0, phiLen, th0, thLen), c, o.rot || [0, 0, 0], r, o);
  }

  torus(c, R, r, o = {}) {
    return this.place(new THREE.TorusGeometry(R, r, o.sides || this.pick(5, 4, 3), o.seg || this.pick(20, 14, 9)), c, o.rot || [0, 0, 0], o.sc || 1, o);
  }

  // tapered rod from a to b, radius ra at a and rb at b
  rod(a, b, ra, rb, o = {}) {
    _v.fromArray(b).sub(_p2.fromArray(a));
    const len = _v.length();
    if (len < 1e-6) return this;
    const g = new THREE.CylinderGeometry(rb, ra, len, o.seg || this.pick(10, 8, 6), 1, !!o.open);
    _q.setFromUnitVectors(UP, _v.divideScalar(len));
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    _m.compose(_p, _q, _one);
    this.add(g, _m, o);
    g.dispose();
    return this;
  }

  // a cone (point at b)
  cone(a, b, ra, o = {}) { return this.rod(a, b, ra, 0.0005, o); }

  // box with rounded edges (roundness e: 1 is an ellipsoid, 0.25 a firm plate); centre c, full size s
  rbox(c, s, o = {}) {
    const e = o.e || 0.3;
    if (o.sharp) return this.place(new THREE.BoxGeometry(1, 1, 1), c, o.rot || [0, 0, 0], s, o);
    const sg = o.seg || (Math.max(s[0], s[1], s[2]) >= 0.2 ? [[10, 8], [8, 6], [6, 4], [4, 3]] : [[6, 4], [5, 3], [4, 3], [4, 3]])[Math.min(3, this.level)];
    return this.place(superGeo(e, o.e2 || e, sg[0], sg[1]), c, o.rot || [0, 0, 0], s, o);
  }

  // surface of revolution about y: pts [[radius, y], ...]; sc scales the result (elliptical sections); arc [start, length] radians (0 = +z)
  lathe(pts, c, o = {}) {
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || this.pick(18, 12, 8), o.arc ? o.arc[0] : 0, o.arc ? o.arc[1] : Math.PI * 2);
    return this.place(g, c, o.rot || [0, 0, 0], o.sc || 1, o);
  }

  // a hanging sheet w wide, h tall (centre c); dz(x, y) bends it out of its plane
  sheet(c, w, h, nx, ny, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, nx, ny);
    if (o.dz) {
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setZ(i, o.dz(pa.getX(i), pa.getY(i)));
      g.computeVertexNormals();
    }
    return this.place(g, c, o.rot || [0, 0, 0], 1, o);
  }

  // a tube along a smooth path with its radius changing from r0 to r1
  sweep(pts, r0, r1, o = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const segs = o.segs || this.pick(12, 8, 5), rs = o.seg || this.pick(8, 6, 4);
    const g = new THREE.TubeGeometry(curve, segs, 1, rs, false);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const ring = Math.floor(i / (rs + 1)), r = r0 + (r1 - r0) * (ring / segs);
      curve.getPointAt(ring / segs, _p);
      pa.setXYZ(i, _p.x + (pa.getX(i) - _p.x) * r, _p.y + (pa.getY(i) - _p.y) * r, _p.z + (pa.getZ(i) - _p.z) * r);
    }
    g.computeBoundingBox();
    _m.identity();
    this.add(g, _m, o);
    g.dispose();
    return this;
  }

  // an outline (array of [x, y]) extruded along z (thickness d, bevel b), centred on z = 0
  extrude(outline, d, bevel, c, o = {}) {
    const sh = new THREE.Shape();
    outline.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: this.pick(2, 1, 1), curveSegments: 6 });
    g.translate(0, 0, -d / 2);
    return this.place(g, c, o.rot || [0, 0, 0], o.sc || 1, o);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.S, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.F, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.userData.tris = this.I.length / 3;
    return g;
  }
}

// superellipsoid of unit diameter: e1 rounds the profile, e2 the section (1 is a sphere, small is a box with softened edges)
function superGeo(e1, e2, ws, hs) {
  const pos = [], nor = [], idx = [];
  const sp = (a, e) => Math.sign(a) * Math.pow(Math.abs(a), e);
  for (let j = 0; j <= hs; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / hs, cp = Math.cos(phi), sn = Math.sin(phi);
    for (let i = 0; i <= ws; i++) {
      const th = (Math.PI * 2 * i) / ws, ct = Math.cos(th), st = Math.sin(th);
      pos.push(0.5 * sp(cp, e1) * sp(ct, e2), 0.5 * sp(sn, e1), 0.5 * sp(cp, e1) * sp(st, e2));
      const nx = sp(cp, 2 - e1) * sp(ct, 2 - e2), ny = sp(sn, 2 - e1), nz = sp(cp, 2 - e1) * sp(st, 2 - e2);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
    }
  }
  for (let j = 0; j < hs; j++) {
    for (let i = 0; i < ws; i++) {
      const a = j * (ws + 1) + i, b = a + ws + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
