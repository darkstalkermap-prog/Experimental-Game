// The forest and the rocks on the mountains behind the play area: only there to look at (nobody can walk there, so nothing here
// needs a collider). Placed once per world from the same height function the ground is built from. A biome thins the trees or the rocks out (`extra` in its
// `flora`: how many of each, and how many of the trees are conifers) and a seed moves them; the classic land has the numbers it always had.
import { WORLD } from './config.js';
import { smoothstep, clamp } from './noise.js';
import { active, landRng } from './biomes.js';
import { forestDensity } from './landscape.js';
import { treeLineAt } from './terrain.js';

export function placeScenery(physics, terrain) {
  const P = WORLD.playHalf, nz = physics.noise;
  const rng = landRng(2024), ex = active.def.flora.extra, ox = active.ox, oz = active.oz;
  const trees = [], rocks = [];
  const lim = P + 260, sp = 8.4;
  const slopeAt = (x, z) => Math.hypot(physics.rawHeight(x + 2.5, z) - physics.rawHeight(x - 2.5, z), physics.rawHeight(x, z + 2.5) - physics.rawHeight(x, z - 2.5)) / 5;
  for (let gz = -lim; gz < lim; gz += sp) for (let gx = -lim; gx < lim; gx += sp) {
    const x = gx + (rng() - 0.5) * sp, z = gz + (rng() - 0.5) * sp;
    const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
    if (Math.max(Math.abs(x), Math.abs(z)) <= P + 1) continue;
    const dens = forestDensity(nz, x + ox, z + oz);
    if (r1 > dens * 1.25 + 0.05 && r1 < 0.88 - (ex.rocks - 1) * 0.07) continue;   // (neither a tree nor a rock goes here: skip the costly height)
    const h = physics.rawHeight(x, z), tl = treeLineAt(nz, x, z);
    const rockN = nz.fbm((x + ox) * 0.035 + 20, (z + oz) * 0.035 - 8, 3) * 0.5 + 0.5;
    if (h < tl - 4) {
      const p = clamp(dens * 1.25 + 0.02 - 0.6 * smoothstep(tl - 36, tl - 6, h), 0, 1);
      if (r1 < p * ex.trees) {
        const sl = slopeAt(x, z);
        if (sl < 1.5 && !(sl > 0.85 && rockN > 0.62)) {
          const y = terrain.surfaceHeight(x, z) - Math.min(1.1, sl * 0.5);
          trees.push({ x, y, z, s: (0.8 + r2 * 0.6) * (1 - 0.3 * smoothstep(tl - 34, tl - 4, h)), r: r3 * 6.283, c: r4, conifer: r2 + 0.5 * smoothstep(20, 70, h) > 0.62 - ex.conifer, extra: true });
          continue;
        }
      }
    }
    // outcrops: big rocks on the steep faces and above the trees, in loose groups
    if (r1 > 0.93 - 0.05 * smoothstep(tl - 10, tl + 10, h) - (ex.rocks - 1) * 0.07 && rocks.length < 700 * (WORLD.half / 220) * ex.rocks) {
      const sl = slopeAt(x, z);
      if (sl > 0.7 || h > tl - 10) {
        for (let k = 0; k < 1 + Math.floor(r4 * 3); k++) {
          const rx = x + (rng() - 0.5) * 9, rz = z + (rng() - 0.5) * 9, s = 1.6 + r2 * 4.2 * (0.5 + rng());
          rocks.push({ x: rx, y: terrain.surfaceHeight(rx, rz) - 0.15 * s, z: rz, s, r: rng(), c: rng(), extra: true });
        }
      }
    }
  }
  return { trees, rocks };
}
