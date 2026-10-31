// Procedural ground textures for the splat shader, painted once into typed arrays (no image files). All of them tile.
//   detail (512x512 RGBA)  R grass: tufts of blades seen from above, G soil: grain and clods, B rock: cracks and plates, A tree crowns: round humps with dark gaps
//   noise  (128x128 RGBA)  R, G, B smooth noise at three seeds (macro colour and edge wobble), A pebbles
// The detail tile covers 2.3 m of ground at its finest use (terrainmat.js), so 512 texels give about 220 per metre: a little more than a
// 1366 to 1920 px wide screen shows of the ground a few metres in front of the feet (at 256 the near ground was magnified and read soft).
// About 1.4 MB with its mips. Every quality reads it (Low and Medium through the light ground shader).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { aniso } from './aniso.js';

const smooth = (t) => t * t * (3 - 2 * t);

// tiling value noise, 0..1, `period` lattice cells across the texture
function valueNoise(size, period, rng) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = (y / size) * period, j0 = Math.floor(v) % period, j1 = (j0 + 1) % period, ty = smooth(v - Math.floor(v));
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period, i0 = Math.floor(u) % period, i1 = (i0 + 1) % period, tx = smooth(u - Math.floor(u));
      const a = lat[j0 * period + i0], b = lat[j0 * period + i1], c = lat[j1 * period + i0], d = lat[j1 * period + i1];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}
function fbm(size, period, oct, rng) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoise(size, period << o, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// tiling cellular noise: for every pixel the distance to the nearest of one jittered point per cell (in cells) and that cell's random number
function worley(size, cells, rng) {
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells), rv = new Float32Array(cells * cells);
  for (let i = 0; i < px.length; i++) { px[i] = rng() * 0.8 + 0.1; py[i] = rng() * 0.8 + 0.1; rv[i] = rng(); }
  const f1 = new Float32Array(size * size), id = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * cells, v = (y / size) * cells, cx = Math.floor(u), cy = Math.floor(v);
    let best = 9, bi = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, k = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells);
      const ex = gx + px[k] - u, ey = gy + py[k] - v, d = ex * ex + ey * ey;
      if (d < best) { best = d; bi = k; }
    }
    f1[y * size + x] = Math.sqrt(best); id[y * size + x] = rv[bi];
  }
  return { f1, id };
}

function texture(data, size, maxAniso) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  aniso(t, maxAniso);
  t.needsUpdate = true;
  return t;
}

let detail = null, noise = null;

// Grass from above: tufts of tapering blades that fan out in every direction from a root, dark at the root and in the gaps, bright at the
// tips. (The first version painted short strokes that all ran down the texture: on the ground they read as a smear, as if the meadow was
// in motion.) Each blade is drawn with smooth edges (its coverage of a texel from the distance to its centre line), so the near ground,
// where a texel is spread over a pixel or two, shows blades and not stair steps; a blade only lightens what is under it, so crossing
// blades stay crisp instead of averaging to grey.
function grassField(S, rng) {
  const g = fbm(S, 8, 3, rng);
  for (let i = 0; i < g.length; i++) g[i] = 0.32 + g[i] * 0.16;   // the dark ground between the blades
  const tufts = Math.round(S * S / 90);
  for (let t = 0; t < tufts; t++) {
    const cx = rng() * S, cy = rng() * S, n = 4 + Math.floor(rng() * 6), lean = rng() * Math.PI * 2, spread = 0.9 + rng() * 2.2, tone = 0.72 + rng() * 0.28;
    for (let b = 0; b < n; b++) {
      const a = lean + (rng() - 0.5) * spread, len = 5 + rng() * 13, w = 0.8 + rng() * 0.7, ca = Math.cos(a), sa = Math.sin(a);
      const x0 = Math.floor(Math.min(cx, cx + ca * len) - 2), x1 = Math.ceil(Math.max(cx, cx + ca * len) + 2);
      const y0 = Math.floor(Math.min(cy, cy + sa * len) - 2), y1 = Math.ceil(Math.max(cy, cy + sa * len) + 2);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy, along = px * ca + py * sa;
        if (along < -0.5 || along > len + 0.5) continue;
        const f = Math.max(0, Math.min(1, along / len)), half = w * (1 - f * 0.8);   // (tapers to a point)
        const cover = Math.max(0, Math.min(1, half + 0.5 - Math.abs(-px * sa + py * ca))) * Math.min(1, len + 0.5 - along);
        if (cover <= 0) continue;
        const v = tone * (0.5 + 0.5 * f), i = (((y % S) + S) % S) * S + (((x % S) + S) % S);   // (the root in the blade's own shade, the tip in the light)
        if (v > g[i]) g[i] += (v - g[i]) * cover;
      }
    }
  }
  return g;
}

export function detailTexture() {
  if (detail) return detail;
  const S = 512, rng = mulberry32(1701), d = new Uint8Array(S * S * 4);
  const g = grassField(S, rng);
  // soil: clods and grain; rock: ridged plates and cracks
  const soil = fbm(S, 6, 5, rng), grain = valueNoise(S, 128, rng);
  const rk = fbm(S, 5, 6, rng);
  // crowns: round humps (a hemisphere inside each cell, dark where the cells meet), each one a little different
  const w = worley(S, 6, rng);
  for (let i = 0; i < S * S; i++) {
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const cr = 1 - Math.abs(rk[i] * 2 - 1);                     // ridges of the rock noise
    const dome = Math.sqrt(clamp01(1 - (w.f1[i] / 0.62) * (w.f1[i] / 0.62)));
    d[i * 4] = clamp01(g[i]) * 255;
    d[i * 4 + 1] = clamp01(soil[i] * 0.72 + grain[i] * 0.28) * 255;
    d[i * 4 + 2] = clamp01(Math.pow(cr, 3) * 0.7 + rk[i] * 0.5) * 255;
    d[i * 4 + 3] = clamp01(dome * (0.6 + 0.4 * w.id[i])) * 255;
  }
  detail = texture(d, S, 8);
  return detail;
}

export function noiseTexture() {
  if (noise) return noise;
  const S = 128, rng = mulberry32(99), d = new Uint8Array(S * S * 4);
  const a = fbm(S, 4, 4, rng), b = fbm(S, 5, 4, rng), c = fbm(S, 8, 3, rng);
  const w = worley(S, 10, rng);
  for (let i = 0; i < S * S; i++) {
    const peb = Math.max(0, 1 - w.f1[i] / 0.38);
    d[i * 4] = a[i] * 255; d[i * 4 + 1] = b[i] * 255; d[i * 4 + 2] = c[i] * 255;
    d[i * 4 + 3] = Math.sqrt(peb) * (0.5 + 0.5 * w.id[i]) * 255;
  }
  noise = texture(d, S, 1);   // (smooth noise: filtering it along the view only blurs it)
  return noise;
}
