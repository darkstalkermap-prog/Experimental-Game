// Every graphics tunable that depends on the player's quality choice, in one place. The renderer, the world, the characters, the
// castles and the effects read `Q` (a live object that is updated in place when the quality changes) instead of testing the level
// name themselves, so a new effect only has to pick the field that fits it. `Game.setQuality(name)` calls `applyQuality(name)`.
//
//   level          0 low · 1 medium · 2 high · 3 ultra (the level in use; with the Auto choice it is the level Auto picked)
//   choice         what the player picked: 'auto' or one of LEVELS (Q.name is always one of LEVELS)
//   pixelRatio     the most device pixels per CSS pixel the canvas may use (the adaptive resolution may go lower, never higher). Medium covers
//                  the common 125 % and 150 % laptop screens and High a 2x one at their own resolution: a frame stretched by a fraction looks soft
//   dynRes         the renderer may lower its resolution by itself to hold the frame rate (never below dynMin of the full size)
//   shadows        the sun casts shadows at all
//   shadowMap      shadow map size in pixels (per cascade: the far one; shadowNearMap is the near one)
//   shadowDist     metres around the camera that get shadows (the far cascade; the near cascade covers the closest third)
//   shadowTaps     samples of the soft shadow filter (5 to 16): a pixel well inside light or shadow reads only five of them
//   crowdShadowDist  soldiers closer than this many metres cast shadows (0 = none do); about the reach of the near shadow map
//   crowdNear      soldiers closer than this many metres wear the rich shapes (see crowdRich); farther ones are plainer but still animated
//   crowdRich      the most soldiers that wear the rich shapes at once (the nearest: the distance above shrinks when more would)
//   kitShadows     the first-person arms and weapon cast a shadow on the ground
//   props          castle props: 0 none, 1 the yard, 2 the yard and the camps outside the walls
//   decals         the most ground marks (blood, scorch) alive at once (0 = none)
//   lodScale       multiplies every distance at which a model drops to a simpler version
//   detail         0 plain · 1 rich · 2 richest: how much geometry and how many small parts models and props carry
//   grass          grass density multiplier (0 = no grass)    grassDist  metres of grass around the camera
//   trees          tree and rock density multiplier           viewDist   metres of trees and far plane (never under HAZE_FAR: the haze is the same at every level)
//   terrain        0 light ground shader (one detail read) · 1 the same, more reads and bump · 2 splat shader (triplanar on slopes, normals, tile-breaking)
//   aniso          the most anisotropic filtering a texture may use (1 = trilinear only; see aniso.js)
//   wind           foliage, grass and cloth move in the wind
//   particles      multiplier on how many particles an effect may spawn
//   clouds         sky: 0 plain gradient · 1 one cloud layer · 2 two layers with sun lighting
//   msaa           samples of the multisampled scene target when a post pass is on (0 = none)
//   post           full-screen passes: { bloom, aa (FXAA), vignette, grade, ao } (all false = the scene goes straight to the canvas)
//                  edges are smoothed by msaa alone (High, Ultra: FXAA on top only blurred textures; it comes back by itself where the GPU cannot
//                  multisample the target), by FXAA alone (Medium) or by the canvas's own samples (Low: see canvasNeedsAA in gfx.js)
//   sharpen        0..1: the light, halo-free sharpening of the finished frame (post.js); 0 = none (Low has no post pass to run it in)
//   exposure       tone-mapping exposure
export const LEVELS = ['low', 'medium', 'high', 'ultra'];

const PRESETS = {
  low: {
    level: 0, pixelRatio: 1, dynRes: true, dynMin: 0.6, shadows: false, shadowMap: 1024, shadowNearMap: 1024, shadowDist: 0, shadowTaps: 4,
    crowdShadowDist: 0, crowdNear: 12, crowdRich: 40, kitShadows: false, props: 0, decals: 0, lodScale: 0.7, detail: 0,
    grass: 0, grassDist: 0, trees: 0.6, viewDist: 700, terrain: 0, aniso: 4, wind: false, particles: 0.5, clouds: 1, msaa: 0,
    post: { bloom: false, aa: false, vignette: false, grade: false, ao: false }, sharpen: 0, exposure: 1.25,
  },
  medium: {
    level: 1, pixelRatio: 1.5, dynRes: true, dynMin: 0.55, shadows: true, shadowMap: 1024, shadowNearMap: 1024, shadowDist: 70, shadowTaps: 8,
    crowdShadowDist: 20, crowdNear: 12, crowdRich: 32, kitShadows: false, props: 1, decals: 160, lodScale: 1, detail: 1,
    grass: 0.6, grassDist: 34, trees: 0.85, viewDist: 1000, terrain: 1, aniso: 8, wind: true, particles: 0.8, clouds: 1, msaa: 0,
    post: { bloom: false, aa: true, vignette: true, grade: true, ao: false }, sharpen: 0.45, exposure: 1.25,
  },
  high: {
    level: 2, pixelRatio: 2, dynRes: true, dynMin: 0.5, shadows: true, shadowMap: 2048, shadowNearMap: 2048, shadowDist: 90, shadowTaps: 12,
    crowdShadowDist: 23, crowdNear: 15, crowdRich: 20, kitShadows: true, props: 1, decals: 384, lodScale: 1.25, detail: 2,
    grass: 1, grassDist: 44, trees: 1, viewDist: 1400, terrain: 2, aniso: 16, wind: true, particles: 1, clouds: 2, msaa: 4,
    post: { bloom: true, aa: false, vignette: true, grade: true, ao: false }, sharpen: 0.4, exposure: 1.25,
  },
  ultra: {
    level: 3, pixelRatio: 2, dynRes: true, dynMin: 0.5, shadows: true, shadowMap: 3072, shadowNearMap: 2048, shadowDist: 120, shadowTaps: 16,
    crowdShadowDist: 34, crowdNear: 22, crowdRich: 48, kitShadows: true, props: 2, decals: 384, lodScale: 1.6, detail: 2,
    grass: 1.4, grassDist: 58, trees: 1.2, viewDist: 1600, terrain: 2, aniso: 16, wind: true, particles: 1.3, clouds: 2, msaa: 4,
    post: { bloom: true, aa: false, vignette: true, grade: true, ao: true }, sharpen: 0.35, exposure: 1.25,
  },
};

// the live settings: medium until the page has read the saved choice
export const Q = { name: 'medium', choice: 'medium', ...PRESETS.medium, post: { ...PRESETS.medium.post } };

const listeners = new Set();
// call fn(Q, name) whenever the quality changes (and once now); returns a function that stops it
export function onQuality(fn) {
  listeners.add(fn);
  fn(Q, Q.name);
  return () => listeners.delete(fn);
}

// `name` is one of LEVELS ('auto' is turned into a level by gfx.js before it gets here; if it arrives anyway it counts as medium)
export function applyQuality(name, choice = name) {
  const p = PRESETS[name] || PRESETS.medium;
  Q.name = PRESETS[name] ? name : 'medium';
  Q.choice = choice === 'auto' ? 'auto' : Q.name;
  Object.assign(Q, p, { post: { ...p.post } });
  for (const fn of listeners) fn(Q, Q.name);
  return Q;
}

// true when any full-screen pass is on (the scene is then drawn into an HDR target instead of the canvas)
export const usesPost = () => { const p = Q.post; return !!(p.bloom || p.aa || p.vignette || p.grade || p.ao); };
