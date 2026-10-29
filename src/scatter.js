// Where the solid trees and rocks of the battlefield stand. A pure function of the land (biome and seed, see biomes.js) and the heights: the host and
// every guest get the same list, and a test can check it without a browser. The classic land (meadow, seed 0) is the arrangement the game always had;
// any other seed draws from its own stream (landRng) and reads the forest density somewhere else, so it moves the trees and rocks; never the castles,
// the roads or the hill, which `okForProp` keeps clear whatever the seed.
import { WORLD, CASTLE, PRACTICE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { roadDist } from './roads.js';
import { forestDensity } from './landscape.js';
import { active, landRng } from './biomes.js';

export function okForProp(x, z, physics) {
  for (const s of CASTLE_SITES) {
    if (Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) < CASTLE.H + 30) return false;
  }
  if (roadDist(x, z) < 7) return false;
  if (Math.hypot(x, z) < 44) return false;
  if (physics.practice && Math.abs(x - physics.practice.x) < PRACTICE.hw + 16 && Math.abs(z - physics.practice.z) < PRACTICE.hd + 16) return false;   // the practice yard
  return true;
}

// -> { pines, oaks, rocks }: [{ x, y, z, s, r, c }] (the biome decides what a "pine" or an "oak" is: see `flora` in biomes.js)
export function scatterSolid(physics) {
  const F = active.def.flora;
  const rng = landRng(42);
  const pines = [], oaks = [], rocks = [];
  let tries = 0;
  const area = (WORLD.half / 220) ** 2;
  while ((pines.length + oaks.length) < 900 * area * F.trees && tries++ < 20000 * area) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    const density = forestDensity(physics.noise, x + active.ox, z + active.oz);
    const edge = Math.max(Math.abs(x), Math.abs(z)) > WORLD.half - 35 ? 0.35 : 0;
    if (rng() > density * 1.25 - 0.25 + edge) continue;
    const y = physics.terrainHeight(x, z);
    (rng() < F.conifer ? pines : oaks).push({ x, y, z, s: 0.8 + rng() * 0.6, r: rng() * Math.PI * 2, c: rng() });
  }
  tries = 0;
  while (rocks.length < 160 * area * F.rocks && tries++ < 5000 * area) {
    const x = (rng() * 2 - 1) * (WORLD.half - 4);
    const z = (rng() * 2 - 1) * (WORLD.half - 4);
    if (!okForProp(x, z, physics)) continue;
    rocks.push({ x, y: physics.terrainHeight(x, z), z, s: 0.4 + rng() * 1.6, r: rng() * 6, c: rng() });
  }
  return { pines, oaks, rocks };
}
