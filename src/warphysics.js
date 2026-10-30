// The ground of a War Mode match (warmap.js has the shape: the hills, the field, the places of the armies). A Physics whose height is the field's.
import { CASTLE_SITES, Physics } from './physics.js';
import { wallHeight } from './landscape.js';
import { smoothstep } from './noise.js';
import { FIELD, layoutField, fieldProfile } from './warmap.js';

// The world of a War Mode match: the ground is the field and its hills, and the four castles (the houses still have one each, as every house does) stand
// far outside the map, hidden: nothing reaches them, no road runs to them and they shape no ground (see WarMode.setup).
export class WarPhysics extends Physics {
  constructor(seed) {
    layoutField();
    super(seed);
    const far = 50000;
    CASTLE_SITES.length = 0;
    CASTLE_SITES.push({ x: 0, z: far, rot: Math.PI }, { x: 0, z: -far, rot: 0 }, { x: far, z: 0, rot: -Math.PI / 2 }, { x: -far, z: 0, rot: Math.PI / 2 });
    this.war = true;
  }

  rawHeight(x, z) {
    const { fbm } = this.noise;
    const base = fieldProfile(x, z);
    const top = smoothstep(FIELD.height - 2, FIELD.height - 0.2, base);   // (1 on the hilltops: kept nearly flat for the formations)
    const r = Math.hypot(x, z);
    const outer = smoothstep(FIELD.rim - 20, FIELD.rim + 40, r);          // the heights round the edge are rough
    const slopeK = (1 - top) * (1 - outer);                                // the slopes and the field roll a little
    let h = base + 1.2;
    h += (0.5 + 1.3 * slopeK + 3.2 * outer) * fbm(x * 0.012 + 3.1, z * 0.012 - 1.7, 3);
    h += (0.25 + 0.55 * slopeK + 1.4 * outer) * fbm(x * 0.05, z * 0.05, 2);
    h += wallHeight(Math.max(Math.abs(x), Math.abs(z)), x, z, this.noise);   // (the land's mountains round the edge, as on every map)
    return h;
  }

  // the height the ground's dressing reads (terrain.js, grass.js: forest floor, the canopy under the trees, the treeline, snow): measured from the field's
  // own hills, so a hilltop is meadow as the low ground of any map is, not the dark, blotched forest floor of a mountainside with no trees on it
  dressHeight(x, z, h) { return h - fieldProfile(x, z); }
}
