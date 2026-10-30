// Biomes: the same battlefield (castle sites, roads, the hill in the middle, the valley, the heights) dressed as a meadow, a snowfield, a marsh or
// a desert, with one small rule twist each, and seeds that vary the land inside a biome (where the trees and rocks stand, the colour patches, the
// ponds). This file is pure data and a few helpers; the modules that draw read it:
//   terrain.js / terrainmat.js   `ground` (the colours of the baked ground), `pal` (the splat shader's palette), `patch` (ponds, ice, pale hardpan)
//   atmosphere.js / world.js     `air` (haze tint, mist, overcast, sun and sky light)
//   world.js / scatter.js / foliage.js / scenery.js / grass.js   `flora`, `grass`      weather.js   `weather`      biomedust.js   `dust` (snow on the castles)
//   biometwist.js   `twist` and `mods`      fx.js   `dry` (footstep dust)      ui.js   `map` (the minimap)      landui.js   `thumb` (the picture of the next land)
// The land is chosen before the world is built (`setWorldLand`, see main.js) and everything built afterwards is dressed for it. The classic
// land is meadow with seed 0: every number of it is the value the game had before biomes existed. Nothing in a build may use Math.random: the
// same biome and seed give the same world on every machine (the host and its guests build their own copy).
import { mulberry32 } from './noise.js';

export const BIOME_IDS = ['meadow', 'snow', 'marsh', 'desert'];
export const SEED_MAX = 999999;

// sRGB hex to linear floats (the splat shader works in linear light)
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = (hex) => [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];

// Palette slots of the splat shader (terrainmat.js), in this order:
//   0 1 crown gaps and crown tops    2 3 4 trampled earth round castles: dark, light, pebbles    5 6 the worn top of the hill
//   7 8 the biome's ground patches   9 10 11 roads: dark, light, pebbles    12 13 14 rock: dark, light, cracks    15 scree    16 snow cap

export const BIOMES = {
  meadow: {
    id: 'meadow', name: 'Meadow', short: 'Green hills and old forest.',
    twist: null, mods: null,
    ground: {
      grassA: 0x5d7a32, grassB: 0x7d8e3e, grassDry: 0x9a9050, dirt: 0x7b6646, rock: 0x77736a, rockWarm: 0x8a8070, trodden: 0xa09572,
      sand: 0xb39a68, forestDark: 0x1d361a, forestFloor: 0x2c4420, scrub: 0x5a6034, snow: 0xe6edf2,
    },
    treeLine: 126, snowLine: 186, canopy: 1, patch: null,
    pal: [[0.005, 0.018, 0.010], [0.05, 0.12, 0.034], [0.13, 0.09, 0.055], [0.30, 0.22, 0.14], [0.34, 0.31, 0.27], [0.26, 0.23, 0.13], [0.42, 0.37, 0.22],
      [0.34, 0.26, 0.15], [0.50, 0.39, 0.23], [0.12, 0.085, 0.052], [0.28, 0.20, 0.12], [0.36, 0.33, 0.29], [0.17, 0.155, 0.13], [0.30, 0.25, 0.19],
      [0.11, 0.105, 0.10], [0.22, 0.20, 0.17], [0.62, 0.68, 0.74]],
    stroke: 1, wet: 0,
    air: { tint: [1, 1, 1], murk: 0, fog: 1, cover: 0.5, sun: 0xffd9a8, sunI: 3.1, hemiSky: 0xb4ccee, hemiGround: 0x6a6030, hemiI: 0.62 },
    flora: { slots: ['spruce', 'pine', 'oak', 'birch'], rock: 'stone', mixA: 0.66, mixB: 0.62, conifer: 0.6, trees: 1, rocks: 1, solid: [1, 1, 1, 1], top: 8,
      extra: { trees: 1, rocks: 1, conifer: 0 } },
    grass: { density: 1, height: 1, width: 1, lean: 1, root: [0.46, 0.52, 0.4], tip: [1.22, 1.2, 0.9], flowers: 'meadow' },
    weather: null,
    dust: null,
    thumb: { sky: ['#4f86d6', '#cfe3f3'], far: '#8aa6c0', near: '#5f8056', ground: ['#5d7a32', '#7d8e3e'], road: '#9a8560', tree: '#264a26', kind: 'pine' },
    dry: 1,
    map: { lo: [70, 92, 50], hi: [140, 142, 100], dlo: [66, 90, 52], dhi: [116, 124, 82], road: [158, 132, 92] },
  },

  snow: {
    id: 'snow', name: 'Snow', short: 'Pale light, drifts and frozen ponds.',
    twist: { name: 'Deep snow', text: 'Soldiers off the roads march 12% slower. The roads are the fast lanes.' },
    mods: { offroadSpeed: 0.88 },
    ground: {
      grassA: 0xc2cad4, grassB: 0xd9dfe7, grassDry: 0xaeb8c4, dirt: 0x7f786e, rock: 0x5f646b, rockWarm: 0x6e7076, trodden: 0xaeb2b8,
      sand: 0xb39a68, forestDark: 0x1f2d2a, forestFloor: 0x93a1ae, scrub: 0xb3bcc6, snow: 0xeef2f6, patch: 0xaec4d4,
    },
    treeLine: 112, snowLine: 70, canopy: 1, bands: 0.035,
    patch: { scale: 0.026, thr: 0.60, soft: 0.10, max: 0.95, ox: 31, oz: -7 },
    pal: [L(0x0b1411), L(0x86998f), L(0x65584a), L(0x9d9080), L(0xb2aca2), L(0x9aa2aa), L(0xc4cad0), L(0xa6bccb), L(0xd0e0ea),
      L(0x5f4e3b), L(0x9a8670), L(0xb3a899), L(0x2b3036), L(0x565d65), L(0x181b1f), L(0x646a72), L(0xeaf0f5)],
    stroke: 0.3, wet: 1,
    air: { tint: [1.35, 1.25, 1.18], murk: 0.55, fog: 1.1, cover: 2.6, sun: 0xfff4e6, sunI: 1.9, hemiSky: 0xe0e6ee, hemiGround: 0xcfd3d9, hemiI: 0.72 },
    flora: { slots: ['spruceSnow', 'pineSnow', 'oakBare', 'birchBare'], rock: 'snow', mixA: 0.66, mixB: 0.55, conifer: 0.72, trees: 1, rocks: 1, solid: [1, 1, 1, 1], top: 8,
      extra: { trees: 1, rocks: 1.2, conifer: 0.18 } },
    grass: { density: 0.4, height: 0.75, width: 1, lean: 1, root: [0.55, 0.6, 0.62], tip: [1.3, 1.34, 1.4], flowers: 'none' },
    weather: 'snow',
    dust: { amount: 0.92, color: [0.72, 0.76, 0.82] },
    thumb: { sky: ['#b7c6d8', '#eaf0f6'], far: '#c9d4df', near: '#a7b8ca', ground: ['#d3dfea', '#eef3f8'], road: '#8a7f72', tree: '#2c4a40', kind: 'pine', snow: true, pond: '#93b4cc' },
    dry: 0.3,
    map: { lo: [150, 164, 176], hi: [210, 220, 230], dlo: [160, 172, 184], dhi: [214, 224, 234], road: [120, 112, 102] },
  },

  marsh: {
    id: 'marsh', name: 'Marsh', short: 'Mist, mud and standing water.',
    twist: { name: 'Fens', text: 'The mist cuts archers’ range by 20%, and soldiers wading through a pond march 22% slower.' },
    mods: { archerRange: 0.8, mudSpeed: 0.78 },
    ground: {
      grassA: 0x46562a, grassB: 0x5c6c30, grassDry: 0x6b6034, dirt: 0x3d3324, rock: 0x4f5649, rockWarm: 0x5a604c, trodden: 0x65593a,
      sand: 0x30403a, forestDark: 0x11221a, forestFloor: 0x25331f, scrub: 0x44543a, snow: 0x8fa39b, patch: 0x1d332f,
    },
    treeLine: 118, snowLine: 400, canopy: 1,
    patch: { scale: 0.034, thr: 0.56, soft: 0.10, max: 0.97, ox: 70, oz: -40 },
    pal: [L(0x08130e), L(0x37543a), L(0x1d170f), L(0x45382a), L(0x575341), L(0x38351f), L(0x625a30), L(0x0e1d1b), L(0x2d4a45),
      L(0x241b10), L(0x4b3a24), L(0x5a5440), L(0x262a25), L(0x464d42), L(0x131614), L(0x383c33), L(0x93a69f)],
    stroke: 0.85, wet: 1,
    air: { tint: [0.52, 0.57, 0.38], murk: 0.8, fog: 1.15, cover: 2.6, sun: 0xe6dcaa, sunI: 1.75, hemiSky: 0x98ab94, hemiGround: 0x3f4d30, hemiI: 0.7 },
    flora: { slots: ['deadTree', 'spruceDrab', 'mossOak', 'birchDrab'], rock: 'marsh', mixA: 0.8, mixB: 0.68, conifer: 0.42, trees: 0.8, rocks: 0.8, solid: [1, 1, 1, 1], top: 8,
      extra: { trees: 0.9, rocks: 0.8, conifer: -0.1 } },
    grass: { density: 1.15, height: 2.3, width: 0.75, lean: 0.55, root: [0.34, 0.38, 0.22], tip: [1.05, 1.0, 0.55], flowers: 'cattail' },
    weather: 'mist',
    dust: { amount: 0.22, color: L(0x3a5532) },
    thumb: { sky: ['#90a89c', '#c6d3c4'], far: '#8ba597', near: '#5b7466', ground: ['#46562a', '#5c6c30'], road: '#3d3324', tree: '#2e3a28', kind: 'dead', pond: '#1d332f' },
    dry: 0,
    map: { lo: [50, 68, 44], hi: [96, 110, 76], dlo: [48, 66, 44], dhi: [86, 100, 70], road: [92, 76, 52] },
  },

  desert: {
    id: 'desert', name: 'Desert', short: 'Hot sun, dunes and red rock.',
    twist: { name: 'Scorching sun', text: 'A hero’s sprint drains stamina 50% faster and it comes back 35% slower.' },
    mods: { staminaDrain: 1.5, staminaRegen: 0.65 },
    ground: {
      grassA: 0xc19a58, grassB: 0xd6b574, grassDry: 0xa87a45, dirt: 0x8d6540, rock: 0x93583a, rockWarm: 0xa66d44, trodden: 0xb99660,
      sand: 0xd9b56f, forestDark: 0x6e4f2c, forestFloor: 0x9a7040, scrub: 0x9d7447, snow: 0xe2cfa6, patch: 0xe0c283,
    },
    treeLine: 140, snowLine: 600, canopy: 0, bands: 0.07,
    patch: { scale: 0.022, thr: 0.58, soft: 0.14, max: 0.9, ox: 12, oz: 55 },
    pal: [L(0x3a2610), L(0x7c5a30), L(0x74482a), L(0xb08049), L(0xd0b384), L(0xa88349), L(0xd3b36f), L(0xe3c688), L(0xf1dca6),
      L(0x7a4524), L(0xb27a42), L(0xd6bd90), L(0x6b3a24), L(0xbd7845), L(0x3a2113), L(0x9a6a42), L(0xe4d2ae)],
    stroke: 0.5, wet: 0,
    air: { tint: [1.2, 0.98, 0.74], murk: 0, fog: 0.72, cover: 0.12, sun: 0xfff0cb, sunI: 3.5, hemiSky: 0xc4d4ee, hemiGround: 0x9a7a4a, hemiI: 0.55 },
    flora: { slots: ['palm', 'cactus', 'bleachedTree', 'shrub'], rock: 'desert', mixA: 0.3, mixB: 0.45, conifer: 0.55, trees: 0.3, rocks: 1.7, solid: [1, 1, 1, 0], top: 7,
      extra: { trees: 0.03, rocks: 1.6, conifer: -0.5 } },
    grass: { density: 0.3, height: 0.9, width: 0.9, lean: 1.2, root: [0.62, 0.52, 0.36], tip: [1.3, 1.12, 0.72], flowers: 'none' },
    weather: 'dust',
    dust: { amount: 0.3, color: L(0xd2ac72) },
    thumb: { sky: ['#3f7fd2', '#f0cf9c'], far: '#c08a5a', near: '#9b5f3c', ground: ['#c19a58', '#d9b878'], road: '#8d6540', tree: '#2f6a38', kind: 'cactus', pond: '#e6cb8c' },
    dry: 1,
    map: { lo: [150, 118, 70], hi: [196, 150, 96], dlo: [160, 128, 78], dhi: [200, 160, 100], road: [128, 96, 62] },
  },
};

export const biomeOf = (id) => BIOMES[id] || BIOMES.meadow;

// which of the four tree slots a tree stands in (the biome decides what grows in each: `flora.slots`): the conifers of a biome split two ways, so do the
// others. It picks the model (foliage.js) and tells world.js whether the tree is solid.
const hash01 = (x, z, k) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
export function treeSlot(x, z, conifer) {
  const F = active.def.flora;
  return conifer ? (hash01(x, z, 1) < F.mixA ? 0 : 1) : (hash01(x, z, 2) < F.mixB ? 2 : 3);
}

// ---- the land the world is built for ----
// ox, oz shift the noise that dresses the land (colour patches, where the forest is thick); the heights, the castles and the roads never move.
export const active = { id: 'meadow', seed: 0, def: BIOMES.meadow, ox: 0, oz: 0 };

const hash2 = (a, b) => { let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

export function setWorldLand(id, seed = 0) {
  const def = biomeOf(id);
  seed = Number.isInteger(+seed) && +seed >= 0 && +seed <= SEED_MAX ? +seed : 0;
  active.id = def.id; active.def = def; active.seed = seed;
  // (seed 0 is the classic arrangement: no shift at all, so the meadow of seed 0 is bit for bit the old one)
  active.ox = seed ? Math.round((hash2(seed, 1) - 0.5) * 4000) : 0;
  active.oz = seed ? Math.round((hash2(seed, 2) - 0.5) * 4000) : 0;
}

// '' for the classic land, so the key of an old-style world is what it always was
export const landKey = (id, seed) => (id === 'meadow' && !seed ? '' : `|${id}:${seed | 0}`);

// a random-number stream for a build step: `base` is the step's own constant (42, 2024, ...); seed 0 gives the stream the game always had
export const landRng = (base) => mulberry32(active.seed ? (base + Math.imul(active.seed, 0x9e3779b1)) >>> 0 : base);

// ---- the land the player has picked for the next battle ----
// mode 'fixed': the biome (and seed) chosen on the menu; mode 'random': a new roll after every battle (the default once a first battle is played)
const KEY = 'cw-land';
export const land = { mode: 'fixed', biome: 'meadow', seed: 0, played: false, touched: false };   // played: a battle has been fought; touched: the player picked on the menu

export function loadLand(fallback = null) {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && typeof o === 'object') {
      land.mode = o.mode === 'random' ? 'random' : 'fixed';
      land.biome = BIOMES[o.biome] ? o.biome : 'meadow';
      land.seed = Number.isInteger(o.seed) && o.seed >= 0 && o.seed <= SEED_MAX ? o.seed : 0;
      land.played = !!o.played;
      land.touched = !!o.touched;
      return land;
    }
  } catch (e) { /* storage unavailable or corrupt: the classic land */ }
  if (fallback) { land.biome = BIOMES[fallback.biome] ? fallback.biome : 'meadow'; land.seed = fallback.seed | 0; }
  return land;
}
export function saveLand() {
  try { localStorage.setItem(KEY, JSON.stringify(land)); } catch (e) { /* ignore */ }
}

// roll a land that differs from `avoid` (a biome id): a biome, and a seed 1..SEED_MAX
export function rollLand(keepBiome = false) {
  if (!keepBiome) {
    const others = BIOME_IDS.filter((b) => b !== land.biome);
    land.biome = others[Math.floor(Math.random() * others.length)];
  }
  land.seed = 1 + Math.floor(Math.random() * SEED_MAX);
  saveLand();
  return land;
}

export const landName = (biome, seed) => `${biomeOf(biome).name}${seed ? ` #${seed}` : ''}`;
