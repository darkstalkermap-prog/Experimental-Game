// Procedural ground textures for the splat shader, painted once into typed arrays (no image files). All of them tile.
//   detail (256x256 RGBA)  R grass: blade strokes, G soil: grain and clods, B rock: cracks and plates, A tree crowns: round humps with dark gaps
//   noise  (128x128 RGBA)  R, G, B smooth noise at three seeds (macro colour and edge wobble), A pebbles
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

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

function texture(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

let detail = null, noise = null;

export function detailTexture() {
  if (detail) return detail;
  const S = 256, rng = mulberry32(1701), d = new Uint8Array(S * S * 4);
  // grass: strokes of blades over a soft base
  const g = fbm(S, 8, 3, rng);
  for (let s = 0; s < 7000; s++) {
    const x0 = rng() * S, y0 = rng() * S, len = 5 + rng() * 9, lean = (rng() - 0.5) * 0.5, val = (rng() - 0.5) * 0.7;
    for (let k = 0; k < len; k++) {
      const x = Math.floor(x0 + lean * k + S) % S, y = Math.floor(y0 + k + S) % S;
      g[y * S + x] += val * (1 - k / len) * 0.5;
    }
  }
  // soil: clods and grain; rock: ridged plates and cracks
  const soil = fbm(S, 6, 4, rng), grain = valueNoise(S, 64, rng);
  const rk = fbm(S, 5, 5, rng);
  // crowns: round humps (a hemisphere inside each cell, dark where the cells meet), each one a little different
  const w = worley(S, 6, rng);
  for (let i = 0; i < S * S; i++) {
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const cr = 1 - Math.abs(rk[i] * 2 - 1);                     // ridges of the rock noise
    const dome = Math.sqrt(clamp01(1 - (w.f1[i] / 0.62) * (w.f1[i] / 0.62)));
    d[i * 4] = clamp01(0.5 + (g[i] - 0.5) * 1.3) * 255;
    d[i * 4 + 1] = clamp01(soil[i] * 0.75 + grain[i] * 0.25) * 255;
    d[i * 4 + 2] = clamp01(Math.pow(cr, 3) * 0.7 + rk[i] * 0.5) * 255;
    d[i * 4 + 3] = clamp01(dome * (0.6 + 0.4 * w.id[i])) * 255;
  }
  detail = texture(d, S);
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
  noise = texture(d, S);
  return noise;
}
