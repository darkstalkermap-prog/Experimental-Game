// The ground of Stonecleft Hold (stonecleft.js has the shape: the range, its cliffs, the gorge, the shelf). A Physics whose height is that map's, with the
// four castles where that map puts them: the hold in the gorge and the three lords out on the field.
import { CASTLE_SITES, Physics } from './physics.js';
import { CASTLE } from './config.js';
import { wallHeight } from './landscape.js';
import { smoothstep } from './noise.js';
import { HOLD, holdGround, holdSites, inGorge, holdDirt, holdCanopy, holdCliff } from './stonecleft.js';

// The steepest ground a hero, a horse or an engine may go up in this world (rise over run: the soldiers' limit, units.js SLOPE_MAX). On the other maps they
// have none (the hills there are all walkable); here the cliffs must hold everybody, or the wall could be walked round.
export const HOLD_SLOPE = 1.0;

export class HoldPhysics extends Physics {
  constructor(seed) {
    super(seed);   // (the heights are made in there, from rawHeight below, which places the castles from HOLD itself)
    CASTLE_SITES.length = 0;
    CASTLE_SITES.push(...holdSites());
    this.hold = true;
    this.slopeMax = HOLD_SLOPE;
  }

  rawHeight(x, z) {
    const { fbm } = this.noise;
    // the open field: the rolling ground of every map, gentler where the lords' armies gather before the mouth
    const calm = 1 - 0.45 * smoothstep(120, 40, Math.hypot(x / 1.6, z - 55));
    let h = (7 * fbm(x * 0.0075 + 3.1, z * 0.0075 - 1.7, 4) + 2.2 * fbm(x * 0.03, z * 0.03, 3)) * 0.8 * calm + 3;
    const ring = wallHeight(Math.max(Math.abs(x), Math.abs(z)), x, z, this.noise);   // (the hills round the edge, as on every map)
    h += ring;
    // the lords' castles stand on flattened plateaus, as on every map
    for (const s of HOLD.foes) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      const w = 1 - smoothstep(CASTLE.H + 10, CASTLE.H + 34, d);
      h = h * (1 - w) + CASTLE.baseY * w;
    }
    return holdGround(this.noise, x, z, h, ring);
  }

  // the trodden earth of the hold for the ground's colour, and how much forest canopy may be painted (none on the cliffs: terrain.js)
  dirt(x, z) { return holdDirt(this.noise, x, z); }
  canopy(x, z) { return holdCanopy(this.noise, x, z); }
  cliff(x, z) { return holdCliff(this.noise, x, z); }
  // inside the gorge (the yard, the ground before the wall, the mouth), `pad` metres from its cliffs
  inGorge(x, z, pad = 0, lzMax) { return inGorge(this.noise, x, z, pad, lzMax); }
}
