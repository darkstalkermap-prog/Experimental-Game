// Every graphics tunable that depends on the player's quality choice, in one place. The renderer, the world, the characters, the
// castles and the effects read `Q` (a live object that is updated in place when the quality changes) instead of testing the level
// name themselves, so a new effect only has to pick the field that fits it. `Game.setQuality(name)` calls `applyQuality(name)`.
//
//   level          0 low · 1 medium · 2 high · 3 ultra
//   pixelRatio     the most device pixels per CSS pixel the canvas may use (the adaptive resolution may go lower, never higher)
//   dynRes         the renderer may lower its resolution by itself to hold the frame rate
//   shadows        the sun casts shadows at all
//   shadowMap      shadow map size in pixels (per cascade)
//   shadowDist     metres around the camera that get shadows
//   crowdShadowDist  soldiers closer than this many metres cast shadows (0 = none do)
//   lodScale       multiplies every distance at which a model drops to a simpler version
//   detail         0 plain · 1 rich · 2 richest: how much geometry and how many small parts models and props carry
//   grass          grass density multiplier (0 = no grass)    grassDist  metres of grass around the camera
//   trees          tree and rock density multiplier           viewDist   metres to the end of the world (fog and far plane)
//   terrain        0 vertex colours · 1 detail texture · 2 splat shader (detail textures, normals, tile-breaking)
//   wind           foliage, grass and cloth move in the wind
//   particles      multiplier on how many particles an effect may spawn
//   post           full-screen passes: { bloom, aa, vignette, grade, ao }
//   exposure       tone-mapping exposure
export const LEVELS = ['low', 'medium', 'high', 'ultra'];

const PRESETS = {
  low: {
    level: 0, pixelRatio: 1, dynRes: true, shadows: false, shadowMap: 1024, shadowDist: 0, crowdShadowDist: 0, lodScale: 0.7, detail: 0,
    grass: 0, grassDist: 0, trees: 0.6, viewDist: 700, terrain: 0, wind: false, particles: 0.5,
    post: { bloom: false, aa: false, vignette: false, grade: false, ao: false }, exposure: 1,
  },
  medium: {
    level: 1, pixelRatio: 1.25, dynRes: true, shadows: true, shadowMap: 1024, shadowDist: 70, crowdShadowDist: 22, lodScale: 1, detail: 1,
    grass: 0.6, grassDist: 34, trees: 0.85, viewDist: 1000, terrain: 1, wind: true, particles: 0.8,
    post: { bloom: false, aa: false, vignette: true, grade: true, ao: false }, exposure: 1,
  },
  high: {
    level: 2, pixelRatio: 1.75, dynRes: true, shadows: true, shadowMap: 2048, shadowDist: 90, crowdShadowDist: 32, lodScale: 1.25, detail: 2,
    grass: 1, grassDist: 44, trees: 1, viewDist: 1400, terrain: 2, wind: true, particles: 1,
    post: { bloom: true, aa: true, vignette: true, grade: true, ao: false }, exposure: 1,
  },
  ultra: {
    level: 3, pixelRatio: 2, dynRes: true, shadows: true, shadowMap: 4096, shadowDist: 120, crowdShadowDist: 48, lodScale: 1.6, detail: 2,
    grass: 1.4, grassDist: 58, trees: 1.2, viewDist: 1600, terrain: 2, wind: true, particles: 1.3,
    post: { bloom: true, aa: true, vignette: true, grade: true, ao: true }, exposure: 1,
  },
};

// the live settings: medium until the page has read the saved choice
export const Q = { name: 'medium', ...PRESETS.medium, post: { ...PRESETS.medium.post } };

const listeners = new Set();
// call fn(Q, name) whenever the quality changes (and once now); returns a function that stops it
export function onQuality(fn) {
  listeners.add(fn);
  fn(Q, Q.name);
  return () => listeners.delete(fn);
}

export function applyQuality(name) {
  const p = PRESETS[name] || PRESETS.medium;
  Q.name = PRESETS[name] ? name : 'medium';
  Object.assign(Q, p, { post: { ...p.post } });
  for (const fn of listeners) fn(Q, Q.name);
  return Q;
}
