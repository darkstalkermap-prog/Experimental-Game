// The War Mode map: a bowl. A wide, nearly flat floor where the armies fight, a slope that steepens into high rims all round, and behind the rims
// the plateau and the mountains of the usual land (its biome colours, its trees on the heights). No castles, roads or hill. Everything here is a pure
// function of the position and the map size, so the host and every guest build the same ground.
//   floor   r < BOWL.floor     a shallow dish (a metre or two of rolling ground)
//   slope   floor .. rim       gentle at first, then steep (about 55 degrees just under the crest)
//   rim     r > BOWL.rim       the crest, then a plateau that runs into the mountains at the edge of the map
import { WORLD, WAR_WORLD } from './config.js';
import { Physics, CASTLE_SITES } from './physics.js';
import { wallHeight } from './landscape.js';
import { smoothstep } from './noise.js';

// the bowl's sizes for the current map (metres): set by layoutBowl, which WarPhysics calls before any height is asked for
export const BOWL = { floor: 80, rim: 140, height: 34, start: 52 };
export function layoutBowl() {
  const P = WORLD.playHalf;
  BOWL.floor = Math.round(P * 0.4);
  BOWL.rim = Math.round(P * 0.7);
  BOWL.height = 30 + Math.round(P * 0.025);
  BOWL.start = Math.round(BOWL.floor * 0.64);   // where each army's front stands, from the middle
}

// the bowl's own height at a distance r from the middle (no noise)
export function bowlProfile(r) {
  if (r <= BOWL.floor) return 1.6 * (r / BOWL.floor) ** 2;
  const t = Math.min(1, (r - BOWL.floor) / (BOWL.rim - BOWL.floor));
  const wall = BOWL.height * (0.22 * t + 0.78 * t * t * t);
  return 1.6 + wall + (r > BOWL.rim ? Math.min(18, (r - BOWL.rim) * 0.12) : 0);
}

// The world of a War Mode match: the ground is the bowl, and the four castles (the houses still have one each, as every house does) stand far
// outside the map, hidden: nothing reaches them, no road runs to them and they shape no ground (see WarMode.setup).
export class WarPhysics extends Physics {
  constructor(seed) {
    layoutBowl();
    super(seed);
    const far = 50000;
    CASTLE_SITES.length = 0;
    CASTLE_SITES.push({ x: 0, z: far, rot: Math.PI }, { x: 0, z: -far, rot: 0 }, { x: far, z: 0, rot: -Math.PI / 2 }, { x: -far, z: 0, rot: Math.PI / 2 });
    this.war = true;
  }

  rawHeight(x, z) {
    const { fbm } = this.noise;
    const r = Math.hypot(x, z);
    const floorK = smoothstep(BOWL.floor * 0.7, BOWL.rim, r);   // the floor is calm, the slopes and the heights are rough
    let h = (1.4 + 3.4 * floorK) * fbm(x * 0.012 + 3.1, z * 0.012 - 1.7, 3) + (0.4 + 1.6 * floorK) * fbm(x * 0.05, z * 0.05, 2);
    h += bowlProfile(r);
    // gullies down the slope: the rim is not a perfect circle
    h += floorK * (1 - smoothstep(BOWL.rim, BOWL.rim + 30, r)) * 5 * fbm(Math.atan2(z, x) * 3.2 + 7, r * 0.02, 2);
    h += wallHeight(Math.max(Math.abs(x), Math.abs(z)), x, z, this.noise);   // (the land's mountains round the edge, as on every map)
    return h;
  }
}

// may a tree or a rock stand here (scatter.js)? Not on the floor or the lower slope: the armies need the room, and the rims carry the forest.
export const bowlPropOk = (x, z) => !WAR_WORLD.on || Math.hypot(x, z) > BOWL.floor + (BOWL.rim - BOWL.floor) * 0.55;

// The point and the facing of each side's army: sides spread evenly round the floor, facing the middle. `slot` of `of` houses on one side
// stand next to each other along the front. -> { x, z, yaw, fx, fz } (fx, fz: the way the army faces)
export function sideSpot(side, sides, slot = 0, of = 1) {
  const a = (side / sides) * Math.PI * 2 + (sides === 2 ? 0 : Math.PI / 4);
  const fx = -Math.sin(a), fz = -Math.cos(a);   // facing the middle
  const rx = fz, rz = -fx;                       // to the right of the facing
  const lateral = (slot - (of - 1) / 2) * Math.min(48, BOWL.floor * 0.6);
  const d = BOWL.start + (sides > 2 ? 4 : 0);
  return { x: Math.sin(a) * d + rx * lateral, z: Math.cos(a) * d + rz * lateral, yaw: Math.atan2(fx, fz), fx, fz };
}
