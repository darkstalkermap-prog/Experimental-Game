// Procedural plants and rocks, built once as plain geometry (no image assets): spruce with drooping tiers, pine, oak and birch crowns of
// lumpy leaf clusters, rocks cut from noise-pushed spheres. Every vertex carries
//   color   the finished colour (bark, leaves, moss) with the shade between the branches painted in, so no light is needed to see depth
//   aWind   x: how much it sways (0 at the root, 1 at the tip), y: how much it flutters (leaves)
// and a normal that is a blend of the surface and the direction away from the crown's middle, so a crown shades like one soft shape
// instead of a heap of facets. Heights are for a 10 m tree; the instances scale them.
// The biomes (biomes.js) use the same builders with a `theme` (other leaf colours, snow on the boughs, moss on the rocks) and add bare trees, palms,
// cacti and shrubs. Without a theme every builder gives what it always gave.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// cheap smooth 3D bumpiness from sines (deterministic, no tables): -1..1
const bump = (x, y, z, s) => 0.5 * (Math.sin(x * 2.9 + s) * Math.sin(y * 2.3 + s * 1.7) + Math.sin(z * 3.3 - s * 0.6) * Math.sin(x * 1.9 + z * 1.4 + s * 2.3)) + 0.25 * Math.sin((x + y + z) * 5.3 + s * 3.1);

export class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.w = []; this.i = []; }
  v(x, y, z, n, col, sway, flut = 0) {
    const k = this.p.length / 3;
    this.p.push(x, y, z);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.n.push(n[0] / l, n[1] / l, n[2] / l);
    this.c.push(col[0], col[1], col[2]);
    this.w.push(sway, flut);
    return k;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  get count() { return this.i.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 2));
    g.setIndex(this.i.length > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---- icosphere ----
const ICO = [];
function ico(detail) {
  if (ICO[detail]) return ICO[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((a) => norm3(a[0], a[1], a[2]));
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a * 4096 + b : b * 4096 + a;
      let i = cache.get(k);
      if (i === undefined) { const A = v[a], B = v[b]; v.push(norm3(A[0] + B[0], A[1] + B[1], A[2] + B[2])); i = v.length - 1; cache.set(k, i); }
      return i;
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  ICO[detail] = { v, f };
  return ICO[detail];
}

// A lumpy ellipsoid of leaves. `o.crown` ([x,y,z,radius]) is the crown it belongs to: normals lean away from its middle and the colour
// darkens towards it. dark/lite are the colours of the underside and the sunlit top.
function blob(m, cx, cy, cz, rx, ry, rz, detail, seed, o) {
  const { v, f } = ico(detail);
  const [kx, ky, kz, kr] = o.crown;
  const amp = o.lump === undefined ? 0.2 : o.lump, rn = o.radial === undefined ? 0.6 : o.radial;
  const base = m.p.length / 3;
  for (const d of v) {
    const b = 1 + amp * bump(d[0] * 1.6, d[1] * 1.6, d[2] * 1.6, seed);
    const x = cx + d[0] * rx * b, y = cy + d[1] * ry * b, z = cz + d[2] * rz * b;
    const ne = norm3(d[0] / rx, d[1] / ry, d[2] / rz);
    const nc = norm3(x - kx, (y - ky) * 0.8, z - kz);
    const n = [ne[0] * (1 - rn) + nc[0] * rn, ne[1] * (1 - rn) + nc[1] * rn, ne[2] * (1 - rn) + nc[2] * rn];
    const depth = clamp(Math.hypot(x - kx, y - ky, z - kz) / kr, 0, 1);
    const up = clamp(0.5 + 0.55 * n[1] + 0.12 * bump(x, y, z, seed + 5), 0, 1);
    let col = mul(mix(o.dark, o.lite, up * up * (3 - 2 * up)), 0.62 + 0.38 * depth);
    if (o.snow) col = mix(col, mul(SNOW, 0.7 + 0.3 * depth), o.snow * clamp((up - 0.5) * 3.4, 0, 1));
    m.v(x, y, z, n, col, clamp(y / (o.h || 10), 0, 1), o.flutter === undefined ? 1 : o.flutter);
  }
  for (const [a, b, c] of f) m.tri(base + a, base + b, base + c);
}

// A tapered tube through rings [x, y, z, radius]; colour from colorAt(t along, k around)
function tube(m, rings, sides, colorAt, h = 10, sway = true) {
  const base = m.p.length / 3;
  for (let i = 0; i < rings.length; i++) {
    const [x, y, z, r] = rings[i];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      m.v(x + ca * r, y, z + sa * r, [ca, 0.12, sa], colorAt(i / (rings.length - 1), k / sides), sway ? clamp(y / h, 0, 1) : 0, 0);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    m.tri(a, c, b); m.tri(b, c, d);
  }
}

// one drooping skirt of a spruce: an apex, a shoulder and a ragged rim, plus the underside so it is closed from below
function skirt(m, y0, r, rise, sides, phase, seed, o) {
  const apexY = y0 + rise, ring = (rr, yy, jag, tint, kk) => {
    const out = [];
    for (let k = 0; k < sides; k++) {
      const a = phase + (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const odd = k % 2 ? 1 : 0;
      const jr = rr * (1 - jag * (odd * 0.2 + 0.09 * bump(ca * 2, yy, sa * 2, seed + kk)));
      const jy = yy - jag * (odd ? 0.0 : 0.3) - jag * 0.12 * bump(ca, yy * 3, sa, seed);
      const x = ca * jr, z = sa * jr;
      const n = norm3(x, 0.55 + 0.1 * (yy - o.cy) / 5, z);
      const depth = clamp(0.35 + rr / o.r0, 0, 1);
      let col = mul(mix(o.dark, o.lite, tint), (0.7 + 0.3 * clamp((yy - 1) / 8, 0, 1)) * (0.75 + 0.25 * depth));
      if (o.snow) col = mix(col, mul(SNOW, 0.8 + 0.2 * depth), o.snow * (1 - 0.62 * tint));
      out.push(m.v(x, jy, z, n, col, clamp(jy / 10, 0, 1), 0.5 + 0.5 * tint));
    }
    return out;
  };
  const top = m.v(0, apexY, 0, [0, 1, 0], o.snow ? mix(mul(mix(o.dark, o.lite, 0.2), 0.8), SNOW, o.snow * 0.9) : mul(mix(o.dark, o.lite, 0.2), 0.8), clamp(apexY / 10, 0, 1), 0.3);
  const sh = ring(r * 0.5, y0 + rise * 0.28, 0.0, 0.5, 1);
  const rim = ring(r, y0 - 0.1 * r, 1.0, 1.0, 2);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    m.tri(top, sh[k1], sh[k]);
    m.tri(sh[k], sh[k1], rim[k]); m.tri(sh[k1], rim[k1], rim[k]);
  }
  if (o.under) {
    // the underside: dark, facing down, closes the skirt for anyone looking up into the tree
    const cen = m.v(0, y0 - 0.1 * r + 0.15, 0, [0, -1, 0], mul(o.dark, 0.38), clamp(y0 / 10, 0, 1), 0);
    const ru = [];
    for (let k = 0; k < sides; k++) {
      const x = m.p[rim[k] * 3], y = m.p[rim[k] * 3 + 1], z = m.p[rim[k] * 3 + 2];
      ru.push(m.v(x, y, z, norm3(x * 0.35, -1, z * 0.35), mul(o.dark, 0.5), clamp(y / 10, 0, 1), 0.3));
    }
    for (let k = 0; k < sides; k++) m.tri(cen, ru[k], ru[(k + 1) % sides]);
  }
}

const BARK = [0.16, 0.1, 0.065], BARK_LITE = [0.26, 0.17, 0.11];
const SNOW = [0.58, 0.66, 0.74];   // snow lying on boughs and rocks (linear colour, a little blue: it sits in the sky's light)

// ---- species. lod 0: the full tree, 1: a simplified one for the middle distance ----
export function buildSpruce(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, n = near ? 8 : 5, sides = near ? 10 : 6;
  const o = { dark: th.dark || [0.022, 0.085, 0.05], lite: th.lite || [0.075, 0.2, 0.085], under: near, cy: 5.3, r0: 2.6, snow: th.snow || 0 };
  tube(m, [[0, -0.45, 0, 0.62], [0, 0.4, 0, 0.42], [0, 3, 0, 0.3], [0, 7.5, 0, 0.17], [0, 9.2, 0, 0.07]], near ? 7 : 5, (t) => mix(BARK, BARK_LITE, t * 0.4));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 2.7 - 2.05 * Math.pow(t, 0.85);
    const y0 = 1.55 + t * (near ? 6.7 : 6.9);
    skirt(m, y0, r, (near ? 1.5 : 1.8) + (1 - t) * 0.6, sides, i * 0.9, 3 + i * 1.7, o);
  }
  skirt(m, 8.85, 0.5, 1.4, near ? 6 : 4, 0.3, 40, { ...o, under: false });
  return m.geometry();
}

export function buildPine(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, det = near ? 1 : 0;
  tube(m, [[0, -0.45, 0, 0.6], [0.05, 0.5, 0, 0.4], [0.18, 3.5, 0.05, 0.3], [0.1, 7, -0.1, 0.2], [0, 9.6, 0.1, 0.1]], near ? 7 : 5, (t) => mix([0.2, 0.14, 0.1], [0.34, 0.17, 0.08], t * t));
  const crown = [0.2, 7.9, 0, 3.2];
  const o = { crown, dark: th.dark || [0.028, 0.1, 0.06], lite: th.lite || [0.1, 0.24, 0.1], lump: 0.26, radial: 0.55, snow: th.snow || 0 };
  const clumps = near ? [[0, 8.9, 0, 1.6, 0.75, 1.5], [1.6, 7.8, 0.6, 1.9, 0.8, 1.6], [-1.5, 7.3, -0.8, 1.8, 0.75, 1.6], [0.2, 6.6, 1.5, 1.7, 0.7, 1.4], [-0.5, 6.1, -1.6, 1.4, 0.65, 1.3]]
    : [[0, 8.8, 0, 2.0, 0.9, 1.9], [1.3, 7.2, 0.5, 2.2, 0.9, 1.9], [-1.2, 6.5, -0.9, 1.9, 0.8, 1.7]];
  clumps.forEach((c, i) => blob(m, c[0], c[1], c[2], c[3], c[4], c[5], det, 7 + i * 2.3, o));
  if (near) {
    // two bare branches reaching up to the clumps
    tube(m, [[0.1, 5.6, 0, 0.1], [0.9, 6.6, 0.3, 0.07], [1.5, 7.3, 0.5, 0.04]], 4, () => BARK, 10);
    tube(m, [[0, 5.2, 0, 0.1], [-0.8, 6.0, -0.5, 0.07], [-1.3, 6.9, -0.8, 0.04]], 4, () => BARK, 10);
  }
  return m.geometry();
}

export function buildOak(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, det = near ? 1 : 0;
  tube(m, [[0, -0.45, 0, 0.72], [0, 0.5, 0, 0.5], [0.05, 2.0, 0, 0.4], [0.1, 3.4, 0, 0.33]], near ? 7 : 5, (t, k) => mix(BARK, BARK_LITE, 0.2 + 0.5 * Math.abs(Math.sin(k * 18 + t * 4)) * 0.4));
  const crown = [0.2, 6.2, 0, 3.2];
  const o = { crown, dark: th.dark || [0.03, 0.12, 0.022], lite: th.lite || [0.14, 0.34, 0.05], lump: 0.22, radial: 0.6, snow: th.snow || 0 };
  if (near) {
    tube(m, [[0.1, 3.0, 0, 0.3], [0.9, 4.4, 0.4, 0.2], [1.7, 5.5, 0.7, 0.1]], 5, () => BARK, 10);
    tube(m, [[0.1, 3.2, 0, 0.28], [-0.8, 4.5, -0.6, 0.18], [-1.5, 5.6, -0.9, 0.09]], 5, () => BARK, 10);
    tube(m, [[0.1, 3.4, 0, 0.25], [0.2, 4.9, 0.1, 0.16], [0.2, 6.0, 0, 0.08]], 5, () => BARK, 10);
    [[0.2, 6.4, 0.1, 2.1, 1.8, 2.1], [2.0, 5.5, 0.8, 1.6, 1.4, 1.6], [-1.8, 5.6, -0.9, 1.7, 1.4, 1.6], [0.9, 7.4, -1.1, 1.5, 1.3, 1.5], [-1.1, 7.2, 1.2, 1.5, 1.3, 1.5], [0.4, 4.6, 1.8, 1.4, 1.1, 1.4], [-0.6, 4.7, -1.9, 1.3, 1.0, 1.3]]
      .forEach((c, i) => blob(m, c[0], c[1], c[2], c[3], c[4], c[5], i === 0 ? 2 : 1, 11 + i * 3.1, o));
  } else {
    [[0.2, 4.8, 0, 2.7, 2.6, 2.6], [2.0, 4.0, 0.8, 1.7, 1.5, 1.7], [-1.7, 4.2, -1.0, 1.8, 1.5, 1.7]].forEach((c, i) => blob(m, c[0], c[1], c[2], c[3], c[4], c[5], 0, 11 + i * 3.1, o));
  }
  return m.geometry();
}

export function buildBirch(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, det = near ? 1 : 0;
  const rings = [[0, -0.4, 0, 0.26], [0.02, 0.6, 0, 0.18], [0.1, 2.4, 0.03, 0.14], [0.22, 4.6, 0.1, 0.1], [0.18, 6.6, 0.05, 0.07], [0.05, 8.4, 0, 0.04]];
  tube(m, rings, near ? 6 : 4, (t, k) => {
    // white bark with dark dashes: bands along the trunk, a few of them darker
    const band = Math.floor(t * 14 + k * 3.7);
    const dark = (Math.sin(band * 12.9898 + k * 78.233) * 43758.5453) % 1;
    return Math.abs(dark) > 0.72 ? [0.05, 0.045, 0.04] : t < 0.06 ? [0.2, 0.17, 0.13] : [0.62, 0.6, 0.55];
  });
  const crown = [0.2, 6.6, 0, 2.4];
  const o = { crown, dark: th.dark || [0.05, 0.16, 0.03], lite: th.lite || [0.22, 0.42, 0.07], lump: 0.24, radial: 0.55, snow: th.snow || 0 };
  const bl = near ? [[0.2, 7.0, 0, 1.15, 1.5, 1.15], [0.9, 5.9, 0.4, 0.9, 1.1, 0.9], [-0.7, 6.1, -0.5, 0.95, 1.2, 0.95], [0.1, 8.3, 0.1, 0.7, 0.9, 0.7], [-0.2, 5.0, 0.7, 0.7, 0.8, 0.7]]
    : [[0.2, 6.2, 0, 1.5, 2.8, 1.5], [0.2, 4.0, 0.3, 1.2, 1.5, 1.2]];
  bl.forEach((c, i) => blob(m, c[0], c[1], c[2], c[3], c[4], c[5], det, 23 + i * 2.7, o));
  return m.geometry();
}

// ---- rocks: spheres pushed out by noise and cut flat by a few planes, flat shaded, moss on the top ----
function planes(rng, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const n = norm3(rng() * 2 - 1, (rng() * 2 - 1) * 0.8 + 0.1, rng() * 2 - 1);
    out.push([n[0], n[1], n[2], 0.62 + rng() * 0.3]);
  }
  return out;
}

// th: { stone: three colours (one per shape), warm, moss, mossAmt (how much of the top is mossy), snow (how much is snow-capped) }
export function buildRock(shape, lod, th = {}) {
  const m = new Mesher();
  const { v, f } = ico(lod === 0 ? 2 : 1);
  let seed = 3 + shape * 11;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 3; i++) rng();
  const cuts = planes(rng, shape === 1 ? 6 : shape === 2 ? 7 : 5);
  const sx = [1.0, 1.25, 0.8][shape], sy = [0.85, 0.55, 1.25][shape], sz = [1.0, 1.0, 0.85][shape];
  const pts = v.map((d) => {
    const b = 1 + 0.12 * bump(d[0] * 2, d[1] * 2, d[2] * 2, shape * 5.1);
    let x = d[0] * b, y = d[1] * b, z = d[2] * b;
    for (const [nx, ny, nz, off] of cuts) { const s = x * nx + y * ny + z * nz; if (s > off) { x -= nx * (s - off); y -= ny * (s - off); z -= nz * (s - off); } }
    return [x * sx, y * sy - 0.1 + (y < 0 ? y * -0.15 : 0), z * sz];
  });
  const stone = (th.stone || [[0.2, 0.19, 0.17], [0.27, 0.25, 0.22], [0.16, 0.15, 0.14]])[shape];
  const warm = th.warm || [0.3, 0.26, 0.2], moss = th.moss || [0.07, 0.15, 0.04], mossAmt = th.mossAmt === undefined ? 0.85 : th.mossAmt, snowAmt = th.snow || 0;
  for (const [a, b, c] of f) {
    const A = pts[a], B = pts[b], C = pts[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const n = norm3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const cy = (A[1] + B[1] + C[1]) / 3, cxm = (A[0] + B[0] + C[0]) / 3, czm = (A[2] + B[2] + C[2]) / 3;
    const strata = 0.5 + 0.5 * Math.sin(cy * 7 + bump(cxm, cy, czm, 2) * 2);
    let col = mix(stone, warm, strata * 0.45 + 0.1 * bump(cxm * 3, cy * 3, czm * 3, 9));
    // moss on the upward faces, dark near the ground
    const mossW = clamp((n[1] - 0.55) * 2.2 + 0.4 * bump(cxm * 2, cy, czm * 2, 4), 0, 1);
    col = mix(col, moss, mossW * mossAmt);
    if (snowAmt) col = mix(col, SNOW, snowAmt * clamp((n[1] - 0.3) * 2.6 + 0.25 * bump(cxm * 2, cy, czm * 2, 6), 0, 1));
    col = mul(col, 0.6 + 0.4 * clamp((cy + 0.5) / 1.2, 0, 1));
    const i0 = m.v(A[0], A[1], A[2], n, col, 0, 0), i1 = m.v(B[0], B[1], B[2], n, col, 0, 0), i2 = m.v(C[0], C[1], C[2], n, col, 0, 0);
    m.tri(i0, i1, i2);
  }
  return m.geometry();
}

// ---- the plants of the other biomes ----
const birchBark = (t, k) => {
  const band = Math.floor(t * 14 + k * 3.7);
  const dark = (Math.sin(band * 12.9898 + k * 78.233) * 43758.5453) % 1;
  return Math.abs(dark) > 0.72 ? [0.05, 0.045, 0.04] : t < 0.06 ? [0.2, 0.17, 0.13] : [0.62, 0.6, 0.55];
};
const trunkAt = (t, H, lean, birch) => [lean * t * t * 1.4, -0.4 + t * (H + 0.4), 0.15 * Math.sin(t * 5), birch ? 0.26 * (1 - 0.7 * t) + 0.03 : 0.66 * (1 - 0.82 * Math.pow(t, 0.8)) + 0.03];

// A leafless tree: a trunk and a spray of forking branches (th: bark, barkLite colours, lean, height, count branches, birch: white bark, snow: clumps of
// snow on the forks, spread: how far the branches reach)
export function buildBare(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, birch = !!th.birch, H = th.height || (birch ? 8.8 : 8.6), lean = th.lean || 0, spread = th.spread || 1;
  const bark = th.bark || [0.13, 0.095, 0.07], lite = th.barkLite || [0.2, 0.15, 0.11];
  const rings = [];
  for (let i = 0; i <= 6; i++) rings.push(trunkAt(i / 6, H, lean, birch));
  const wood = (t, k) => mix(bark, lite, 0.3 + 0.35 * Math.abs(Math.sin(k * 18 + t * 4)));
  tube(m, rings, near ? 7 : 4, birch ? birchBark : wood, H + 2);
  const count = near ? th.count || (birch ? 8 : 10) : Math.min(th.count || 6, 4);   // (the simple model for the middle distance has fewer branches: bare trees are mostly twigs)
  const clump = { dark: mul(SNOW, 0.74), lite: SNOW, lump: 0.3, radial: 0.2, snow: 0, flutter: 0, h: H + 2 };
  for (let b = 0; b < count; b++) {
    const t0 = 0.3 + 0.62 * (b / count), a = b * 2.399963 + (th.phase || 0), ca = Math.cos(a), sa = Math.sin(a);
    const [bx, by, bz] = trunkAt(t0, H, lean, birch);
    const len = (birch ? 1.9 : 2.8) * (1.15 - 0.75 * t0) * spread, up = birch ? 0.85 : 0.5 + 0.35 * t0;
    const r0 = (birch ? 0.07 : 0.17) * (1.25 - t0);
    const mid = [bx + ca * len * 0.5, by + up * len * 0.5, bz + sa * len * 0.5], tip = [bx + ca * len, by + up * len, bz + sa * len];
    const col = () => (birch ? [0.09, 0.075, 0.065] : bark);
    tube(m, [[bx, by, bz, r0], [...mid, r0 * 0.6], [...tip, r0 * 0.22]], near ? 5 : 3, col, H + 2);
    if (near) {
      // two twigs fork from the middle of the branch
      for (const s of [-1, 1]) {
        const a2 = a + s * 0.7, c2 = Math.cos(a2), s2 = Math.sin(a2), l2 = len * 0.5;
        tube(m, [[...mid, r0 * 0.4], [mid[0] + c2 * l2 * 0.5, mid[1] + up * l2 * 0.55, mid[2] + s2 * l2 * 0.5, r0 * 0.25], [mid[0] + c2 * l2, mid[1] + up * l2 * 1.0, mid[2] + s2 * l2, r0 * 0.1]], 4, col, H + 2);
      }
    }
    if (th.snow && near) blob(m, mid[0], mid[1] + r0 * 0.9, mid[2], 0.5 + len * 0.1, 0.2, 0.5 + len * 0.1, 0, 40 + b * 1.7, { ...clump, crown: [mid[0], mid[1], mid[2], 0.8] });
  }
  if (th.snow) blob(m, rings[6][0], rings[6][1] + 0.05, rings[6][2], 0.3, 0.2, 0.3, 0, 77, { ...clump, crown: [rings[6][0], rings[6][1], rings[6][2], 0.5] });
  return m.geometry();
}

// a tube whose cross-section has `ridges` flutes (a cactus)
function fluted(m, rings, sides, ridges, amp, colorAt, h) {
  const base = m.p.length / 3;
  for (let i = 0; i < rings.length; i++) {
    const [x, y, z, r] = rings[i];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), f = 1 + amp * Math.cos(a * ridges);
      m.v(x + ca * r * f, y, z + sa * r * f, [ca, 0.15, sa], colorAt(i / (rings.length - 1), 0.5 + 0.5 * Math.cos(a * ridges)), 0, 0);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = base + i * sides + k, b = base + i * sides + (k + 1) % sides, c = a + sides, d = b + sides;
    m.tri(a, c, b); m.tri(b, c, d);
  }
}

// a saguaro: a fluted column with two arms that turn up
export function buildCactus(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, sides = near ? 12 : 8, ridges = near ? 6 : 4, H = 5.4;
  const g = th.green || [0.05, 0.15, 0.065], l = th.lite || [0.12, 0.27, 0.1];
  const col = (t, k) => mix(g, l, 0.25 + 0.6 * k * (0.7 + 0.3 * t));
  fluted(m, [[0, -0.4, 0, 0.45], [0, 0.4, 0, 0.45], [0, 3, 0, 0.4], [0, H - 0.4, 0, 0.36], [0, H, 0, 0.28], [0, H + 0.25, 0, 0.14], [0, H + 0.35, 0, 0.03]], sides, ridges, 0.12, col);
  for (const [h0, turn, scale] of [[2.1, 0.5, 1], [3.1, 3.7, 0.8]]) {
    const c = Math.cos(turn), s = Math.sin(turn), p = (x, y, r) => [c * x * scale, h0 + y * scale, s * x * scale, r * scale];
    fluted(m, [p(0.2, 0, 0.2), p(0.75, 0.05, 0.2), p(1.1, 0.45, 0.2), p(1.2, 1.1, 0.19), p(1.2, 1.8, 0.17), p(1.2, 2.15, 0.12), p(1.2, 2.3, 0.03)], near ? 8 : 6, 4, 0.1, col);
  }
  return m.geometry();
}

// a palm: a leaning ringed trunk and a crown of drooping fronds (each a folded ribbon, drawn from both sides)
export function buildPalm(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0, H = 8.6, bend = 1.7;
  const rings = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; rings.push([bend * t * t, -0.3 + t * (H + 0.3), 0.1 * Math.sin(t * 3), 0.36 * (1 - 0.4 * t) + (i === 0 ? 0.12 : 0)]); }
  tube(m, rings, near ? 8 : 5, (t, k) => mix([0.2, 0.15, 0.1], [0.36, 0.29, 0.2], 0.5 * (0.5 + 0.5 * Math.sin(t * 62)) + 0.3 * Math.abs(Math.sin(k * 9))), H + 2);
  const fronds = near ? 11 : 7, segs = near ? 6 : 3, dark = th.dark || [0.035, 0.12, 0.03], lite = th.lite || [0.18, 0.32, 0.06];
  for (let f = 0; f < fronds; f++) {
    const a = f * 2.399963 + 0.4, ca = Math.cos(a), sa = Math.sin(a), len = 3.0 + 0.5 * Math.sin(f * 3.7), rise = 0.9 + 0.5 * Math.sin(f * 1.9);
    const px = -sa, pz = ca;   // across the frond
    const rows = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs, rr = len * u, y = H + rise * (2.2 * u - 3.6 * u * u), w = 0.6 * Math.sin(Math.min(1, u * 3.2) * 1.4) * (1 - 0.72 * u);
      const cx = bend + ca * rr, cz = 0.1 + sa * rr, col = mul(mix(dark, lite, Math.pow(u, 0.8)), 0.8 + 0.4 * ((f * 0.37) % 1));
      const nrm = norm3(-ca * 0.35 * (u - 0.3) , 1, -sa * 0.35 * (u - 0.3));
      const sway = clamp((y - 4) / (H + 2), 0, 1);
      rows.push([
        m.v(cx + px * w, y - 0.14 * w, cz + pz * w, nrm, col, sway, 1), m.v(cx, y + 0.1 * w, cz, nrm, col, sway, 1), m.v(cx - px * w, y - 0.14 * w, cz - pz * w, nrm, col, sway, 1),
        m.v(cx + px * w, y - 0.14 * w, cz + pz * w, [-nrm[0], -nrm[1], -nrm[2]], mul(col, 0.55), sway, 1), m.v(cx, y + 0.1 * w, cz, [-nrm[0], -nrm[1], -nrm[2]], mul(col, 0.55), sway, 1), m.v(cx - px * w, y - 0.14 * w, cz - pz * w, [-nrm[0], -nrm[1], -nrm[2]], mul(col, 0.55), sway, 1),
      ]);
    }
    for (let s = 0; s < segs; s++) {
      const A = rows[s], B = rows[s + 1];
      m.tri(A[0], B[0], A[1]); m.tri(A[1], B[0], B[1]); m.tri(A[1], B[1], A[2]); m.tri(A[2], B[1], B[2]);
      m.tri(A[3], A[4], B[3]); m.tri(A[4], B[4], B[3]); m.tri(A[4], A[5], B[4]); m.tri(A[5], B[5], B[4]);
    }
  }
  return m.geometry();
}

// a dry shrub (something to walk through, not around): a few clumps of dead leaves on grey sticks
export function buildShrub(lod, th = {}) {
  const m = new Mesher();
  const near = lod === 0;
  const dark = th.dark || [0.07, 0.065, 0.02], lite = th.lite || [0.24, 0.19, 0.07];
  const clumps = [[0, 0.55, 0, 0.85, 0.55, 0.85], [0.7, 0.4, 0.3, 0.6, 0.4, 0.6], [-0.6, 0.45, -0.3, 0.65, 0.42, 0.62], [0.1, 0.35, -0.8, 0.5, 0.35, 0.5], [-0.2, 0.4, 0.75, 0.55, 0.36, 0.5]];
  clumps.slice(0, near ? 5 : 3).forEach((c, i) => blob(m, c[0], c[1], c[2], c[3], c[4], c[5], 0, 5 + i * 2.1, { crown: [0, 0.4, 0, 1.2], dark, lite, lump: 0.3, radial: 0.4, h: 2 }));
  if (near) for (let i = 0; i < 4; i++) { const a = i * 1.7, ca = Math.cos(a), sa = Math.sin(a); tube(m, [[0, 0, 0, 0.04], [ca * 0.5, 0.5, sa * 0.5, 0.03], [ca * 0.9, 0.95, sa * 0.9, 0.012]], 3, () => [0.2, 0.17, 0.12], 2); }
  return m.geometry();
}
