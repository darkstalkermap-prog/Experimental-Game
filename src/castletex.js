// Procedural textures for castles and siege engines: masonry, flagstones, cobbles, timber, roof tiles, a gate and a small noise tile.
// Each one is painted from a height field, so the albedo (mortar, chips, cracks, ambient occlusion in the joints) and the normal map
// agree. Everything wraps seamlessly. They are raw RGBA arrays (no canvas, so nothing is premultiplied or rounded).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- fields
// smooth value noise that repeats every `cx` cells across and `cy` down; result in [0, 1]
function valueNoise(w, h, cx, cy, rng) {
  const lat = new Float32Array(cx * cy);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / h * cy, j0 = Math.floor(fy), ty = fy - j0, sy = ty * ty * (3 - 2 * ty);
    const r0 = (j0 % cy) * cx, r1 = ((j0 + 1) % cy) * cx;
    for (let x = 0; x < w; x++) {
      const fx = x / w * cx, i0 = Math.floor(fx), tx = fx - i0, sx = tx * tx * (3 - 2 * tx);
      const ia = i0 % cx, ib = (i0 + 1) % cx, a = lat[r0 + ia], b = lat[r0 + ib], c = lat[r1 + ia], d = lat[r1 + ib];
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
// fractal sum of value noise: `base` cells at the lowest octave, each octave doubles them
function fbm(w, h, base, octaves, rng, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, norm = 0, cells = base;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(w, h, cells, cells, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= gain; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// a tangent-space normal map from a height field (wraps at the edges); k = how steep the relief reads
function normalFrom(height, w, h, k) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y + h - 1) % h) * w, yd = ((y + 1) % h) * w, yc = y * w;
    for (let x = 0; x < w; x++) {
      const xl = (x + w - 1) % w, xr = (x + 1) % w;
      const dx = (height[yc + xr] - height[yc + xl]) * k, dy = (height[yu + x] - height[yd + x]) * k;   // +v is up the picture
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (yc + x) * 4;
      out[i] = (-dx * l * 0.5 + 0.5) * 255; out[i + 1] = (-dy * l * 0.5 + 0.5) * 255; out[i + 2] = (l * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}

function dataTexture(data, w, h, { srgb = true, repeat = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
const pair = (color, height, n, k, repeat = true) => ({
  map: dataTexture(color, n, n, { repeat }), normalMap: dataTexture(normalFrom(height, n, n, k), n, n, { srgb: false, repeat }),
});

// ---------------------------------------------------------------- blocks (masonry, flagstones)
// Courses of blocks with mortar joints, rounded edges, chips, cracks, mottling, lichen and rain streaks.
function blocks(o) {
  const N = o.size, rng = mulberry32(o.seed);
  const rows = o.rows, rowH = N / rows;
  const color = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
  const coarse = fbm(N, N, 6, 3, rng), fine = fbm(N, N, 48, 2, rng, 0.6), grit = fbm(N, N, 128, 1, rng);
  const lich = fbm(N, N, 5, 4, rng, 0.55), streakX = valueNoise(N, 1, 48, 1, rng), streakY = fbm(N, N, 3, 2, rng);
  const list = [];
  for (let r = 0; r < rows; r++) {
    const k = Math.max(3, Math.round(N / ((o.minW + o.maxW) / 2)));
    const ws = []; let sum = 0;
    for (let i = 0; i < k; i++) { const w = o.minW + rng() * (o.maxW - o.minW); ws.push(w); sum += w; }
    let x = rng() * N;
    for (let i = 0; i < k; i++) {
      const w = ws[i] * N / sum, a = o.palette[Math.floor(rng() * o.palette.length)], b = o.palette[Math.floor(rng() * o.palette.length)], t = rng();
      list.push({ x0: x, w, y0: r * rowH, h: rowH, c: [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)],
        bright: 0.86 + rng() * 0.26, bh: 0.74 + rng() * 0.26, tx: (rng() - 0.5) * 0.16, ty: (rng() - 0.5) * 0.16 });
      x += w;
    }
  }
  const half = o.gap * 0.5, bevel = o.bevel, m = o.mortar;
  for (const b of list) {
    const xs = Math.round(b.x0), xe = Math.round(b.x0 + b.w), ys = Math.round(b.y0), ye = Math.round(b.y0 + b.h);
    for (let py = ys; py < ye; py++) {
      const yy = py % N;
      for (let px = xs; px < xe; px++) {
        const xx = px % N, idx = yy * N + xx;
        const d = Math.min(px - xs, xe - 1 - px, py - ys, ye - 1 - py) - half;
        const nz = (coarse[idx] - 0.5) * o.undulate + (fine[idx] - 0.5) * o.rough + (grit[idx] - 0.5) * o.rough * 0.5;
        let hgt, cr, cg, cb;
        if (d < 0) {                         // mortar: recessed, earthy
          hgt = 0.02 + nz * 0.07;
          const ao = 0.72 + grit[idx] * 0.25;
          cr = m[0] * ao; cg = m[1] * ao; cb = m[2] * ao;
        } else {
          const bv = smooth(0, bevel, d), round = Math.sqrt(1 - (1 - bv) * (1 - bv));
          hgt = (0.12 + 0.88 * round) * b.bh + b.tx * ((px - b.x0) / b.w - 0.5) + b.ty * ((py - b.y0) / b.h - 0.5) + nz * round;
          const ao = 0.66 + 0.34 * smooth(0, bevel * 1.8, d);
          const sh = b.bright * (0.9 + (fine[idx] - 0.5) * 0.42 + (coarse[idx] - 0.5) * 0.3);
          cr = b.c[0] * sh * ao; cg = b.c[1] * sh * ao; cb = b.c[2] * sh * ao;
          const L = lich[idx];
          if (o.lichen && L > 0.64) {          // lichen and moss speckle
            const t = smooth(0.64, 0.82, L) * o.lichen * (0.5 + grit[idx]);
            cr = mix(cr, 120, t); cg = mix(cg, 132, t); cb = mix(cb, 70, t);
          }
        }
        if (o.streaks) {                       // rain streaks run down the face
          const t = smooth(0.55, 0.95, streakX[xx] * (0.4 + 0.9 * streakY[idx])) * o.streaks;
          cr *= 1 - t * 0.35; cg *= 1 - t * 0.33; cb *= 1 - t * 0.3;
        }
        height[idx] = hgt;
        const i4 = idx * 4;
        color[i4] = cr; color[i4 + 1] = cg; color[i4 + 2] = cb; color[i4 + 3] = 255;
      }
    }
  }
  // chipped corners and hairline cracks dent the height and darken or lighten the stone
  const dent = (cx, cy, rad, depth, tone) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const dd = Math.hypot(dx, dy);
      if (dd > rad) continue;
      const idx = (((cy + dy) % N + N) % N) * N + (((cx + dx) % N + N) % N), t = 1 - dd / rad, i4 = idx * 4;
      height[idx] -= t * depth;
      color[i4] *= 1 + tone * t; color[i4 + 1] *= 1 + tone * t; color[i4 + 2] *= 1 + tone * t;
    }
  };
  if (o.chips) for (const b of list) {
    if (rng() > o.chips) continue;
    const right = rng() < 0.5, top = rng() < 0.5;
    dent(Math.round(right ? b.x0 + b.w - 3 : b.x0 + 3), Math.round(top ? b.y0 + 3 : b.y0 + b.h - 3), 3 + Math.floor(rng() * N / 70), 0.3 + rng() * 0.25, rng() < 0.5 ? 0.18 : -0.2);
  }
  for (let c = 0; c < (o.cracks || 0); c++) {
    let x = rng() * N, y = rng() * N, a = rng() * Math.PI * 2;
    for (let s = 0; s < 26 + rng() * 40; s++) { a += (rng() - 0.5) * 0.9; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; dent(Math.round(x), Math.round(y), 1, 0.25, -0.35); }
  }
  return { color, height };
}

const SET = new Map();
const once = (key, fn) => { if (!SET.has(key)) SET.set(key, fn()); return SET.get(key); };
const STONE_PAL = [[200, 192, 174], [184, 179, 166], [206, 194, 170], [170, 167, 158], [192, 181, 158], [180, 174, 156], [214, 205, 186]];

// masonry: 8 courses of 0.5 m per 4 m tile, pale warm limestone with a few darker and greener blocks
export function stoneSet(size = 512) {
  return once('stone' + size, () => {
    const t = blocks({ size, rows: 8, minW: size * 0.15, maxW: size * 0.3, gap: size / 170, bevel: size / 70, seed: 3, rough: 0.16, undulate: 0.22,
      chips: 0.5, cracks: 5, lichen: 0.5, streaks: 0.55, mortar: [186, 176, 156], palette: STONE_PAL });
    return pair(t.color, t.height, size, 1.5);
  });
}
// big paving slabs (4 rows per tile, slightly pitted): the apron in front of the keep and the gate threshold
export function flagSet(size = 512) {
  return once('flag' + size, () => {
    const t = blocks({ size, rows: 4, minW: size * 0.25, maxW: size * 0.45, gap: size / 140, bevel: size / 50, seed: 21, rough: 0.2, undulate: 0.3,
      chips: 0.3, cracks: 3, lichen: 0.25, streaks: 0, mortar: [96, 88, 74], palette: [[150, 146, 138], [138, 136, 130], [158, 150, 136], [128, 128, 126], [146, 138, 124]] });
    return pair(t.color, t.height, size, 1.6);
  });
}

// ---------------------------------------------------------------- cobbles
// rounded cobbles in dirt (jittered cells, nearest and second-nearest feature distance), 4 m per tile
export function cobbleSet(size = 512) {
  return once('cobble' + size, () => {
    const N = size, rng = mulberry32(31), G = 13, cell = N / G;
    const fx = new Float32Array(G * G), fy = new Float32Array(G * G), tone = new Float32Array(G * G), hv = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) { fx[i] = 0.2 + rng() * 0.6; fy[i] = 0.2 + rng() * 0.6; tone[i] = rng(); hv[i] = 0.75 + rng() * 0.25; }
    const fine = fbm(N, N, 40, 2, rng, 0.6), coarse = fbm(N, N, 5, 3, rng), grit = fbm(N, N, 128, 1, rng);
    const color = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
    const pal = [[164, 154, 136], [150, 142, 128], [174, 158, 130], [136, 130, 120], [158, 146, 124]], dirt = [112, 92, 66];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = (gx + i + G) % G, cy = (gy + j + G) % G, k = cy * G + cx;
        const dx = (gx + i + fx[k]) * cell - x, dy = (gy + j + fy[k]) * cell - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
      }
      const e = d2 - d1, idx = y * N + x, bv = smooth(0, cell * 0.22, e), round = Math.sqrt(1 - (1 - bv) * (1 - bv));
      height[idx] = (0.05 + 0.95 * round) * hv[best] + (fine[idx] - 0.5) * 0.12 * round;
      const a = pal[Math.floor(tone[best] * pal.length) % pal.length], sh = 0.82 + (fine[idx] - 0.5) * 0.5 + (coarse[idx] - 0.5) * 0.35;
      const ao = 0.55 + 0.45 * smooth(0, cell * 0.3, e), i4 = idx * 4, t = 1 - bv;
      const dr = dirt[0] * (0.7 + grit[idx] * 0.5), dg = dirt[1] * (0.7 + grit[idx] * 0.5), db = dirt[2] * (0.7 + grit[idx] * 0.5);
      color[i4] = mix(a[0] * sh * ao, dr, t * 0.8); color[i4 + 1] = mix(a[1] * sh * ao, dg, t * 0.8); color[i4 + 2] = mix(a[2] * sh * ao, db, t * 0.8); color[i4 + 3] = 255;
    }
    return pair(color, height, N, 2.4);
  });
}

// ---------------------------------------------------------------- timber
// weathered boards with grain, knots, butt joints and nails: 1.6 m per tile, six boards across
function boards(N, rowsOfNails, seed, o = {}) {
  const rng = mulberry32(seed), n = o.boards || 6;
  const color = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
  const warp = fbm(N, N, 2, 3, rng), fine = fbm(N, N, N / 4, 2, rng, 0.6), wear = fbm(N, N, 4, 3, rng);
  const ws = []; let sum = 0;
  for (let i = 0; i < n; i++) { const w = 0.8 + rng() * 0.45; ws.push(w); sum += w; }
  let x0 = 0;
  for (let b = 0; b < n; b++) {
    const bw = ws[b] * N / sum, xs = Math.round(x0), xe = Math.round(x0 + bw), tone = 0.8 + rng() * 0.4, joint = Math.floor(rng() * N);
    const kx = bw * (0.3 + rng() * 0.4), ky = rng() * N, hasKnot = rng() < 0.55, freq = 0.5 + rng() * 0.35;
    const base = o.base || [122, 94, 70];
    for (let y = 0; y < N; y++) for (let px = xs; px < xe; px++) {
      const x = px % N, idx = y * N + x, lx = px - xs, edge = Math.min(lx, xe - 1 - px);
      let gx = lx + (warp[idx] - 0.5) * 34;
      let ring = 0;
      if (hasKnot) {          // grain bends round a knot
        const dx = lx - kx, dy = (y - ky) * 0.45, d = Math.hypot(dx, dy);
        if (d < 14) { gx += (14 - d) * 0.9 * Math.sign(dx || 1); ring = smooth(14, 2, d) * (0.5 + 0.5 * Math.sin(d * 1.7)); }
      }
      const gr = 0.5 + 0.5 * Math.sin(gx * freq * 2.4 + fine[idx] * 3), line = smooth(0.7, 1, gr);
      let sh = tone * (0.9 + (fine[idx] - 0.5) * 0.3 - line * 0.14 - ring * 0.32);
      let h = 0.7 + (fine[idx] - 0.5) * 0.06 - line * 0.05 - ring * 0.04;
      const gap = edge < 1.5 ? 1 - edge / 1.5 : 0, jn = Math.abs(((y - joint + N) % N)) < 2 ? 1 : 0;
      sh *= 1 - gap * 0.7 - jn * 0.55; h -= gap * 0.5 + jn * 0.35;
      sh *= 1 - smooth(4, 0, edge) * 0.12;
      let r = base[0] * sh, g = base[1] * sh, bl = base[2] * sh;
      const gr2 = smooth(0.6, 0.9, wear[idx]) * 0.4;            // bleached, weathered patches
      r = mix(r, 138, gr2); g = mix(g, 124, gr2); bl = mix(bl, 106, gr2);
      color[idx * 4] = r; color[idx * 4 + 1] = g; color[idx * 4 + 2] = bl; color[idx * 4 + 3] = 255; height[idx] = h;
    }
    // nails: dark heads with a bright rim near each board edge
    for (let r = 0; r < rowsOfNails; r++) {
      const ny = Math.round(((r + (joint / N)) % 1) * N);
      for (const nx of [xs + 6, xe - 7]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const d = Math.hypot(dx, dy); if (d > 2.2) continue;
        const idx = (((ny + dy) % N + N) % N) * N + ((nx + dx) % N + N) % N, i4 = idx * 4, t = d < 1.3 ? 0.25 : 0.55;
        color[i4] *= t; color[i4 + 1] *= t; color[i4 + 2] *= t * 1.1; height[idx] += d < 1.6 ? 0.16 : 0.06;
      }
    }
    x0 += bw;
  }
  return { color, height };
}
export function timberSet(size = 256) {
  return once('timber' + size, () => { const t = boards(size, 4, 7); return pair(t.color, t.height, size, 2.2); });
}

// the gate leaf: one picture over the whole leaf (clamped, not tiled): planks with two cross battens and a ring
export function gateSet() {
  return once('gate', () => {
    const W = 256, Hh = 512, t = boards(W, 0, 11, { boards: 7, base: [112, 80, 52] });
    const color = new Uint8Array(W * Hh * 4), height = new Float32Array(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const s = ((y % W) * W + x), d = (y * W + x);
      color[d * 4] = t.color[s * 4]; color[d * 4 + 1] = t.color[s * 4 + 1]; color[d * 4 + 2] = t.color[s * 4 + 2]; color[d * 4 + 3] = 255; height[d] = t.height[s];
    }
    for (const fy of [0.2, 0.8]) {         // horizontal battens, darker timber with a raised edge and nails
      const y0 = Math.round(Hh * fy) - 14, y1 = y0 + 28;
      for (let y = y0; y < y1; y++) for (let x = 4; x < W - 4; x++) {
        const d = y * W + x, e = Math.min(y - y0, y1 - 1 - y, x - 4, W - 5 - x), k = 0.62 + 0.2 * Math.sin(x * 0.5 + y * 0.05);
        color[d * 4] = 96 * k; color[d * 4 + 1] = 66 * k; color[d * 4 + 2] = 42 * k; height[d] = 0.95 - smooth(3, 0, e) * 0.2;
      }
      for (let x = 22; x < W - 10; x += 38) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const d = (y0 + 14 + dy) * W + x + dx; if (Math.hypot(dx, dy) > 2.3) continue;
        color[d * 4] = 40; color[d * 4 + 1] = 40; color[d * 4 + 2] = 46; height[d] = 1.1;
      }
    }
    const n = W, nrm = normalFrom(height, W, Hh, 2.2);
    return {
      map: dataTexture(color, n, Hh, { repeat: false }), normalMap: dataTexture(nrm, n, Hh, { srgb: false, repeat: false }),
    };
  });
}

// ---------------------------------------------------------------- roof tiles
// overlapping slate tiles in staggered rows, 2 m per tile
export function roofSet(size = 256) {
  return once('roof' + size, () => {
    const N = size, rng = mulberry32(5), cols = 8, rows = 9, tw = N / cols, th = N / rows;
    const fine = fbm(N, N, 32, 2, rng, 0.6), coarse = fbm(N, N, 4, 3, rng);
    const tile = [];
    for (let i = 0; i < cols * rows; i++) tile.push({ t: rng(), b: 0.82 + rng() * 0.3, moss: rng() < 0.12 });
    const pal = [[96, 100, 114], [108, 112, 126], [88, 92, 104], [118, 114, 122], [100, 104, 116]];
    const color = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const r = Math.min(rows - 1, Math.floor(y / th)), ly = y - r * th;
      for (let x = 0; x < N; x++) {
        const sx = (x + (r % 2 ? tw / 2 : 0)) % N, c = Math.floor(sx / tw), lx = sx - c * tw, tl = tile[r * cols + c], idx = y * N + x;
        const side = Math.min(lx, tw - 1 - lx), lip = th - 1 - ly;
        // the tile rises from under the row above to a rounded lip at its lower edge
        let h = mix(0.28, 0.95, smooth(0, th * 0.72, ly)) - (lip < 3 ? (3 - lip) * 0.22 : 0);
        const corner = Math.hypot(Math.max(0, 4 - lx), Math.max(0, 4 - lip)) + Math.hypot(Math.max(0, 4 - (tw - 1 - lx)), Math.max(0, 4 - lip));
        h -= smooth(0, 4, corner) * 0.2;
        let sh = tl.b * (0.88 + (fine[idx] - 0.5) * 0.3 + (coarse[idx] - 0.5) * 0.25) * (0.62 + 0.38 * smooth(0, th * 0.55, ly));
        if (side < 1.2) { sh *= 0.45; h -= 0.3; }
        const a = pal[Math.floor(tl.t * pal.length) % pal.length];
        let cr = a[0] * sh, cg = a[1] * sh, cb = a[2] * sh;
        if (tl.moss) { const m = smooth(0.4, 0.8, coarse[idx]) * 0.5; cr = mix(cr, 70, m); cg = mix(cg, 92, m); cb = mix(cb, 60, m); }
        height[idx] = h; color[idx * 4] = cr; color[idx * 4 + 1] = cg; color[idx * 4 + 2] = cb; color[idx * 4 + 3] = 255;
      }
    }
    return pair(color, height, N, 2.4);
  });
}

// ---------------------------------------------------------------- noise
// four channels of tileable noise at different scales: the shaders use it for weathering, moss and soot patches
export function noiseTexture(size = 128) {
  return once('noise' + size, () => {
    const rng = mulberry32(99), N = size, data = new Uint8Array(N * N * 4);
    const a = fbm(N, N, 4, 4, rng), b = fbm(N, N, 8, 3, rng), c = fbm(N, N, 2, 3, rng), d = fbm(N, N, 16, 2, rng);
    for (let i = 0; i < N * N; i++) { data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = d[i] * 255; }
    const t = dataTexture(data, N, N, { srgb: false });
    t.anisotropy = 1;
    return t;
  });
}
