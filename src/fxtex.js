// Procedural textures for the effects, built once on first use from small formulas (the game has no image files):
//   atlasTexture()  an array texture of soft sprite shapes, one 128 px layer each (see F). Red is the coverage, green carries a
//                   second signal the shader uses (lobe shading on puffs, heat on flames, a bright core on streaks).
//   rampTexture()   colour and opacity over a particle's life, one row per ramp (see R). Colours are linear, like the rest of the scene.
//   decalTexture()  the shapes laid on the ground: blood splats, a scorch mark, a crater.
import * as THREE from 'three';

const SIZE = 128;

// layer numbers of the atlas
export const F = {
  SOFT: 0, DISC: 1, PUFF1: 2, PUFF2: 3, PUFF3: 4, WISP: 5, STREAK: 6, STAR: 7, FLAME: 8, RING: 9, SHARD: 10, CHIP: 11,
  SPLINTER: 12, DROP: 13, FLAT: 14, EMBER: 15, MIST: 16, SPARKLE: 17, BEAM: 18,
};
const FRAMES = 19;

// row numbers of the colour ramps
export const R = {
  POP: 0, FADE: 1, FIRE: 2, HOT: 3, SMOKE: 4, SMOKE_L: 5, DUST: 6, BLOOD: 7, MAGIC: 8, FROST: 9, EMBER: 10, SOLID: 11, HOLY: 12,
  STEAM: 13, FLASH: 14, GLINT: 15, FIRE_SOFT: 16, SOOT: 17,
};
const ROWS = 18;
const RAMP_W = 64;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// value noise on an integer lattice (a hash of the cell, smooth interpolation) and fractal sums of it
function hash(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, s, oct = 4) {
  let v = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); norm += a; f *= 2.03; a *= 0.5; }
  return v / norm;
}

// ---------- the sprite shapes: (u, v) in -1..1 (v up) -> [coverage, second signal] ----------
const puff = (seed, tight) => (u, v) => {
  const r = Math.hypot(u, v);
  const n = fbm(u * 1.9 + 3.1 * seed, v * 1.9 - 1.7 * seed, seed, 4);
  const d = r + (n - 0.5) * 1.15;
  const a = Math.pow(ss(0.95, 0.1 + tight * 0.15, d), 1.3) * ss(1.0, 0.65, r);
  // light from the upper left: the lobes facing it are brighter, the creases darker
  const n2 = fbm((u + 0.14) * 1.9 + 3.1 * seed, (v - 0.14) * 1.9 - 1.7 * seed, seed, 4);
  return [a, clamp(0.6 + (n - n2) * 2.6 + v * 0.14, 0.12, 1)];
};

const SHAPES = [];
SHAPES[F.SOFT] = (u, v) => { const r = Math.hypot(u, v); return [Math.exp(-4.2 * r * r) * ss(1.0, 0.78, r), 1]; };
SHAPES[F.DISC] = (u, v) => { const r = Math.hypot(u, v); return [ss(0.92, 0.72, r), 1 - r * 0.35]; };
SHAPES[F.PUFF1] = puff(1, 0);
SHAPES[F.PUFF2] = puff(5, 0.3);
SHAPES[F.PUFF3] = puff(9, 0.7);
SHAPES[F.WISP] = (u, v) => {
  const w = v + 0.32 * Math.sin(u * 3.2 + 1.0) + (fbm(u * 2.4, v * 2.4, 31, 3) - 0.5) * 0.5;
  const a = Math.exp(-w * w * 16) * ss(1.0, 0.45, Math.abs(u)) * (0.45 + 0.65 * fbm(u * 3 + 4, v * 3, 33, 3));
  return [clamp(a, 0, 1), clamp(0.5 + v * 0.3, 0.2, 1)];
};
// a streak runs along +x with the bright head at the right and a tail that fades out to the left
SHAPES[F.STREAK] = (u, v) => {
  const tail = ss(-1.0, 0.55, u), head = ss(1.0, 0.82, u);
  const a = Math.exp(-v * v * 38) * tail * head;
  return [a, Math.exp(-v * v * 260) * tail];
};
SHAPES[F.STAR] = (u, v) => {
  const lh = Math.exp(-v * v * 240) * Math.pow(Math.max(0, 1 - Math.abs(u)), 3);
  const lv = Math.exp(-u * u * 240) * Math.pow(Math.max(0, 1 - Math.abs(v)), 3);
  const glow = Math.exp(-(u * u + v * v) * 22);
  return [clamp(lh + lv + glow * 0.7, 0, 1), clamp(glow * 1.3, 0, 1)];
};
// a flame tongue: a bulb at the foot narrowing to a wavering point (v up), hot at the heart
SHAPES[F.FLAME] = (u, v) => {
  const t = clamp((v + 0.88) / 1.78, 0, 1);
  const sway = (fbm(v * 2.2 + 7, u * 1.3, 41, 3) - 0.5) * 0.55 * t;
  const x = u + sway;
  const w = t < 0.3 ? 0.56 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.3) / 0.3, 2))) : 0.56 * Math.pow(1 - (t - 0.3) / 0.7, 0.9);
  const a = ss(w + 0.1, w - 0.18, Math.abs(x)) * ss(1.0, 0.82, t);
  const heat = clamp(1 - t * 1.0 - Math.abs(x) / (w + 0.02) * 0.55, 0, 1);
  return [w > 0.004 ? a : 0, heat];
};
SHAPES[F.RING] = (u, v) => {
  const r = Math.hypot(u, v);
  const d = (r - 0.8) / 0.075;
  return [clamp(Math.exp(-d * d) + 0.07 * ss(0.8, 0.2, r) * ss(1, 0.9, r), 0, 1), 1];
};
// an ice crystal: a tall kite split into a light and a dark facet
SHAPES[F.SHARD] = (u, v) => {
  const e = 0.9 - (Math.abs(u) * 2.1 + Math.abs(v) * 0.82);
  return [ss(0, 0.07, e), u < 0 ? 1 : 0.62 + 0.2 * (v + 1) * 0.5];
};
// a broken piece of stone or clod of earth: an irregular blob with its lit side up and left
SHAPES[F.CHIP] = (u, v) => {
  const th = Math.atan2(v, u), r = Math.hypot(u, v);
  const R0 = 0.58 + 0.17 * Math.sin(3 * th + 1.1) + 0.1 * Math.sin(5 * th + 2.3) + 0.05 * Math.sin(8 * th);
  return [ss(R0 + 0.05, R0 - 0.05, r), clamp(0.55 + (-u * 0.5 + v * 0.55) * 0.7 + (fbm(u * 4, v * 4, 51, 2) - 0.5) * 0.4, 0.2, 1)];
};
// a splinter of wood, pointed at both ends, lying along x
SHAPES[F.SPLINTER] = (u, v) => {
  const w = 0.13 * (1 - Math.abs(u) * 0.92) * (0.85 + 0.3 * fbm(u * 3, v, 61, 2));
  return [ss(w + 0.035, w - 0.02, Math.abs(v)) * ss(1.0, 0.9, Math.abs(u)), 0.75 + 0.25 * fbm(u * 9, v * 2, 62, 2)];
};
// a blood drop: round head at +x, a tail that tapers to the left (it is stretched along its flight)
SHAPES[F.DROP] = (u, v) => {
  const x = (u + 1) * 0.5;
  const w = x < 0.74 ? 0.5 * Math.pow(x / 0.74, 1.4) : 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((x - 0.74) / 0.26, 2)));
  const a = ss(w * 2 * 0.5 + 0.06, w * 2 * 0.5 - 0.04, Math.abs(v));
  return [a * (w > 0.002 ? 1 : 0), 0.7 + 0.3 * (1 - Math.abs(v) / (w + 0.01))];
};
// a wide low band of dust, for clouds that roll along the ground (it is not rotated)
SHAPES[F.FLAT] = (u, v) => {
  const w = v / 0.45;
  const n = fbm(u * 2.2 + 11, w * 1.5, 71, 4);
  const d = Math.hypot(u * 0.92, w) + (n - 0.5) * 1.0;
  return [ss(0.95, 0.3, d) * ss(1.0, 0.8, Math.abs(u)) * ss(1.0, 0.85, Math.abs(v) / 0.45), clamp(0.5 + v * 0.45 + (n - 0.5) * 0.7, 0.15, 1)];
};
SHAPES[F.EMBER] = (u, v) => {
  const r = Math.hypot(u, v);
  return [clamp(ss(0.34, 0.2, r) + 0.5 * Math.exp(-r * r * 9) * ss(1, 0.7, r), 0, 1), ss(0.5, 0.0, r)];
};
SHAPES[F.MIST] = (u, v) => {
  const r = Math.hypot(u, v);
  const n = fbm(u * 1.5 + 21, v * 1.5, 81, 4);
  return [clamp(Math.exp(-3.4 * r * r) * (0.35 + n * 1.1), 0, 1) * ss(1, 0.7, r), 0.8];
};
SHAPES[F.SPARKLE] = (u, v) => {
  const a = Math.abs(u), b = Math.abs(v);
  const cross = Math.exp(-Math.min(a, b) * 26) * Math.pow(Math.max(0, 1 - Math.max(a, b)), 1.6);
  const d = Math.exp(-(u * u + v * v) * 40);
  return [clamp(cross * 0.9 + d, 0, 1), clamp(d * 1.4, 0, 1)];
};
// a soft vertical bar (a shaft of light or a thin beam) standing on its foot; x is across
SHAPES[F.BEAM] = (u, v) => {
  const across = Math.exp(-u * u * 7.5);
  const along = ss(-1.0, -0.55, v) * ss(1.0, 0.45, v);
  return [across * along, across];
};

let atlas = null;
export function atlasTexture() {
  if (atlas) return atlas;
  const data = new Uint8Array(SIZE * SIZE * 4 * FRAMES);
  for (let f = 0; f < FRAMES; f++) {
    const shape = SHAPES[f];
    const base = f * SIZE * SIZE * 4;
    for (let j = 0; j < SIZE; j++) {
      const v = ((j + 0.5) / SIZE) * 2 - 1;
      for (let i = 0; i < SIZE; i++) {
        const u = ((i + 0.5) / SIZE) * 2 - 1;
        // a border of empty pixels keeps the shape from being cut off or bleeding into itself at small mip levels
        const edge = ss(1.0, 0.94, Math.max(Math.abs(u), Math.abs(v)));
        const [a, g] = shape(u, v);
        const k = base + (j * SIZE + i) * 4;
        data[k] = Math.round(clamp(a * edge, 0, 1) * 255);
        data[k + 1] = Math.round(clamp(g, 0, 1) * 255);
        data[k + 2] = 0;
        data[k + 3] = 255;
      }
    }
  }
  atlas = new THREE.DataArrayTexture(data, SIZE, SIZE, FRAMES);
  atlas.format = THREE.RGBAFormat;
  atlas.type = THREE.UnsignedByteType;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  return atlas;
}

// ---------- colour over life ----------
// keys: [t, colour (hex, sRGB as an artist picks it), opacity]; the row is filled by interpolating them
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const RAMPS = [];
RAMPS[R.POP] = [[0, 0xffffff, 0], [0.06, 0xffffff, 1], [0.35, 0xffffff, 0.8], [1, 0xffffff, 0]];
RAMPS[R.FADE] = [[0, 0xffffff, 1], [0.4, 0xffffff, 0.85], [1, 0xffffff, 0]];
RAMPS[R.FIRE] = [[0, 0xfff2c8, 1], [0.22, 0xffb040, 0.95], [0.55, 0xe5501a, 0.6], [1, 0x3a0c06, 0]];
RAMPS[R.FIRE_SOFT] = [[0, 0xffd890, 0], [0.12, 0xffb050, 0.9], [0.5, 0xd8481a, 0.5], [1, 0x400c06, 0]];
RAMPS[R.HOT] = [[0, 0xfffae0, 1], [0.3, 0xffc860, 1], [0.7, 0xff7a24, 0.8], [1, 0x7a1c08, 0]];
RAMPS[R.SMOKE] = [[0, 0x343230, 0], [0.1, 0x3c3a37, 0.7], [0.5, 0x4c4a47, 0.5], [1, 0x5e5c59, 0]];
RAMPS[R.SOOT] = [[0, 0x1e1c1a, 0], [0.08, 0x23211f, 0.78], [0.5, 0x2e2c2a, 0.5], [1, 0x403e3c, 0]];
RAMPS[R.SMOKE_L] = [[0, 0xa8a49c, 0], [0.12, 0xb4b0a8, 0.75], [0.55, 0xc2beb6, 0.45], [1, 0xd0ccc4, 0]];
RAMPS[R.DUST] = [[0, 0xb8a98c, 0], [0.1, 0xbcae92, 0.8], [0.5, 0xc6b9a0, 0.5], [1, 0xd2c8b2, 0]];
RAMPS[R.BLOOD] = [[0, 0x7a0808, 0.95], [0.55, 0x5e0505, 0.9], [1, 0x3a0303, 0]];
RAMPS[R.MAGIC] = [[0, 0xffffff, 0], [0.1, 0xffffff, 1], [0.5, 0xffffff, 0.55], [1, 0xffffff, 0]];
RAMPS[R.FROST] = [[0, 0xe6f8ff, 1], [0.5, 0xa8dcff, 0.8], [1, 0x70b8ff, 0]];
RAMPS[R.EMBER] = [[0, 0xffe9a0, 1], [0.3, 0xffa030, 1], [0.7, 0xd84a14, 0.7], [1, 0x500c04, 0]];
RAMPS[R.SOLID] = [[0, 0xffffff, 1], [0.85, 0xffffff, 1], [1, 0xffffff, 0]];
RAMPS[R.HOLY] = [[0, 0xfff6d0, 0], [0.15, 0xfff0b0, 1], [0.6, 0xffe080, 0.7], [1, 0xffd060, 0]];
RAMPS[R.STEAM] = [[0, 0xe8eef6, 0], [0.2, 0xeef2fa, 0.5], [1, 0xf4f6fc, 0]];
RAMPS[R.FLASH] = [[0, 0xffffff, 1], [0.25, 0xffffff, 0.55], [1, 0xffffff, 0]];
RAMPS[R.GLINT] = [[0, 0xffffff, 0], [0.18, 0xffffff, 1], [0.55, 0xffffff, 0.5], [1, 0xffffff, 0]];

let ramp = null;
export function rampTexture() {
  if (ramp) return ramp;
  const data = new Uint8Array(RAMP_W * ROWS * 4);
  for (let row = 0; row < ROWS; row++) {
    const keys = RAMPS[row].map(([t, hex, a]) => [t, col(hex), a]);
    for (let i = 0; i < RAMP_W; i++) {
      const t = i / (RAMP_W - 1);
      let k = 0;
      while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const [t0, c0, a0] = keys[k], [t1, c1, a1] = keys[k + 1];
      const f = clamp((t - t0) / (t1 - t0), 0, 1);
      const o = (row * RAMP_W + i) * 4;
      data[o] = Math.round(mix(c0[0], c1[0], f) * 255);
      data[o + 1] = Math.round(mix(c0[1], c1[1], f) * 255);
      data[o + 2] = Math.round(mix(c0[2], c1[2], f) * 255);
      data[o + 3] = Math.round(mix(a0, a1, f) * 255);
    }
  }
  ramp = new THREE.DataTexture(data, RAMP_W, ROWS, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.wrapS = ramp.wrapT = THREE.ClampToEdgeWrapping;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}
export const RAMP_ROWS = ROWS;

// ---------- ground decals ----------
export const D = { BLOOD1: 0, BLOOD2: 1, SCORCH: 2, CRATER: 3, FROST: 4 };
const DECALS = 5;
let decal = null;
// a deterministic pseudo-random sequence so the splats are the same on every machine
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function splatField(seed, streaks, drops, spread) {
  const rand = rng(seed);
  const blobs = [[0, 0, 0.3 + rand() * 0.08, 1]];
  for (let i = 0; i < 3; i++) { const a = rand() * 6.283, d = 0.12 + rand() * 0.2; blobs.push([Math.cos(a) * d, Math.sin(a) * d, 0.16 + rand() * 0.1, 0.9]); }
  const caps = [];
  for (let i = 0; i < streaks; i++) { const a = rand() * 6.283, l = 0.45 + rand() * spread, w = 0.025 + rand() * 0.04; caps.push([a, l, w]); }
  for (let i = 0; i < drops; i++) { const a = rand() * 6.283, d = 0.45 + rand() * spread * 1.1; blobs.push([Math.cos(a) * d, Math.sin(a) * d, 0.025 + rand() * 0.06, 1]); }
  return (u, v) => {
    let f = 0;
    for (const [bx, by, r, w] of blobs) { const dx = u - bx, dy = v - by; f += w * Math.exp(-(dx * dx + dy * dy) / (r * r)); }
    for (const [a, l, w] of caps) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const t = clamp(u * ca + v * sa, 0, l), px = u - ca * t, py = v - sa * t;
      f += Math.exp(-(px * px + py * py) / (w * w * (1 + (1 - t / l) * 2.4)));
    }
    return f;
  };
}

export function decalTexture() {
  if (decal) return decal;
  const data = new Uint8Array(SIZE * SIZE * 4 * DECALS);
  const shapes = [];
  const s1 = splatField(11, 9, 12, 0.3), s2 = splatField(23, 5, 7, 0.22);
  shapes[D.BLOOD1] = (u, v) => { const f = s1(u * 1.05, v * 1.05); const n = fbm(u * 6, v * 6, 91, 2) - 0.5; return [ss(0.42, 0.62, f + n * 0.25), clamp(f * 0.5, 0, 1)]; };
  shapes[D.BLOOD2] = (u, v) => { const f = s2(u * 1.1, v * 1.1); const n = fbm(u * 6, v * 6, 93, 2) - 0.5; return [ss(0.42, 0.62, f + n * 0.25), clamp(f * 0.5, 0, 1)]; };
  shapes[D.SCORCH] = (u, v) => {
    const r = Math.hypot(u, v), n = fbm(u * 2.6 + 5, v * 2.6, 95, 4);
    const th = Math.atan2(v, u), rays = 0.5 + 0.5 * fbm(Math.cos(th) * 3 + 9, Math.sin(th) * 3, 97, 3);
    const a = ss(1.0, 0.1, r + (n - 0.5) * 0.8 + (1 - rays) * r * 0.5);
    return [a * a * 0.95, clamp(1 - r, 0, 1)];
  };
  shapes[D.CRATER] = (u, v) => {
    const r = Math.hypot(u, v), n = fbm(u * 3 + 2, v * 3, 99, 4);
    const rim = Math.exp(-Math.pow((r - 0.55 - (n - 0.5) * 0.25) / 0.16, 2));
    const pit = ss(0.55, 0.05, r + (n - 0.5) * 0.5);
    return [clamp(pit * 0.9 + rim * 0.5, 0, 1) * ss(1.0, 0.82, r), clamp(0.35 + rim * 0.65 - pit * 0.35, 0, 1)];
  };
  shapes[D.FROST] = (u, v) => {
    const r = Math.hypot(u, v), th = Math.atan2(v, u), n = fbm(u * 3 + 8, v * 3, 101, 3);
    const spikes = 0.55 + 0.45 * Math.abs(Math.sin(th * 6 + n * 3));
    return [ss(1.0 * spikes, 0.3 * spikes, r + (n - 0.5) * 0.3) * 0.9, clamp(1 - r * 0.8, 0, 1)];
  };
  for (let f = 0; f < DECALS; f++) {
    const base = f * SIZE * SIZE * 4;
    for (let j = 0; j < SIZE; j++) {
      const v = ((j + 0.5) / SIZE) * 2 - 1;
      for (let i = 0; i < SIZE; i++) {
        const u = ((i + 0.5) / SIZE) * 2 - 1;
        const edge = ss(1.0, 0.92, Math.max(Math.abs(u), Math.abs(v)));
        const [a, g] = shapes[f](u, v);
        const k = base + (j * SIZE + i) * 4;
        data[k] = Math.round(clamp(a * edge, 0, 1) * 255);
        data[k + 1] = Math.round(clamp(g, 0, 1) * 255);
        data[k + 2] = 0;
        data[k + 3] = 255;
      }
    }
  }
  decal = new THREE.DataArrayTexture(data, SIZE, SIZE, DECALS);
  decal.format = THREE.RGBAFormat;
  decal.type = THREE.UnsignedByteType;
  decal.minFilter = THREE.LinearMipmapLinearFilter;
  decal.magFilter = THREE.LinearFilter;
  decal.wrapS = decal.wrapT = THREE.ClampToEdgeWrapping;
  decal.generateMipmaps = true;
  decal.needsUpdate = true;
  return decal;
}

// a contact sheet of the sprite shapes and ramps as a canvas (only used by the lab scripts to look at them)
export function debugSheet() {
  const cv = document.createElement('canvas');
  const cols = 8, rows = Math.ceil(FRAMES / cols);
  cv.width = cols * SIZE; cv.height = rows * SIZE + 20 * ROWS + 8;
  const x = cv.getContext('2d');
  x.fillStyle = '#334'; x.fillRect(0, 0, cv.width, cv.height);
  const img = x.createImageData(SIZE, SIZE);
  const a = atlasTexture().image.data;
  for (let f = 0; f < FRAMES; f++) {
    for (let i = 0; i < SIZE * SIZE; i++) {
      const r = a[f * SIZE * SIZE * 4 + i * 4], g = a[f * SIZE * SIZE * 4 + i * 4 + 1];
      img.data[i * 4] = r; img.data[i * 4 + 1] = Math.min(255, r * (0.4 + g / 255 * 0.7)); img.data[i * 4 + 2] = r * 0.6; img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, (f % cols) * SIZE, Math.floor(f / cols) * SIZE);
  }
  const rd = rampTexture().image.data;
  for (let row = 0; row < ROWS; row++) {
    for (let i = 0; i < RAMP_W * 4; i++) {
      const o = (row * RAMP_W + Math.floor(i / 4)) * 4;
      x.fillStyle = `rgba(${rd[o]},${rd[o + 1]},${rd[o + 2]},${rd[o + 3] / 255})`;
      x.fillRect(Math.floor(i / 4) * 8, rows * SIZE + 4 + row * 20, 8, 16);
    }
  }
  return cv;
}
