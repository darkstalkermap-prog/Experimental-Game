// The forest and the rocks on the mountains behind the play area: only there to look at (nobody can walk there, so nothing here
// needs a collider). Placed once per world from the same height function the ground is built from. A biome thins the trees or the rocks out (`extra` in its
// `flora`: how many of each, and how many of the trees are conifers) and a seed moves them; the classic land has the numbers it always had.
import { WORLD } from './config.js';
import { smoothstep, clamp } from './noise.js';
import { active, landRng } from './biomes.js';
import { forestDensity } from './landscape.js';
import { treeLineAt, rockCover } from './terrain.js';

const RING = [[9, 0], [-9, 0], [0, 9], [0, -9]].map(([a, b]) => [a * 0.92 + b * 0.38, b * 0.92 - a * 0.38]);   // (turned a little off the grid)

export function placeScenery(physics, terrain) {
  const P = WORLD.playHalf, nz = physics.noise;
  const rng = landRng(2024), ex = active.def.flora.extra, ox = active.ox, oz = active.oz;
  const trees = [], rocks = [];
  const lim = P + 260, sp = 8.4;
  const slopeAt = (x, z) => Math.hypot(physics.rawHeight(x + 2.5, z) - physics.rawHeight(x - 2.5, z), physics.rawHeight(x, z + 2.5) - physics.rawHeight(x, z - 2.5)) / 5;
  const rockAt = (x, z) => rockCover(nz, physics, x, z, physics.rawHeight(x, z), terrain.drawnSlope(x, z));
  // the rock at the spot and on a ring 9 m round it: a tree at the edge of a face thins out with the rock around it (`r`: the tree's own die)
  const onForestFloor = (x, z, r) => {
    if (rockAt(x, z) > 0.3) return false;
    let m = 0;
    for (let k = 0; k < 4; k++) m += rockAt(x + RING[k][0], z + RING[k][1]);
    return r > 1.4 * smoothstep(0.08, 0.4, m / 4);
  };
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
        // no trees on the cliffs (a face steeper than about 45 degrees: a tree reads as hung on the rock, not standing on it), and none where
        // the ground is drawn as bare rock, at the spot or round it (terrain.js rockCover: the same terms the ground's colour and shaders use,
        // on the slope the far mesh is lit with), so the forest stands on forest floor and the grey faces have no lone trees on them
        if (sl < 1.0 && !(sl > 0.7 && rockN > 0.6) && onForestFloor(x, z, r2)) {
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
