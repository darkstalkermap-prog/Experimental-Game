// The War Mode map: a hill for every army and the low field between them. Each side's army musters on the flat top of its own broad hill (a long ridge
// across its front, so a whole battle line fits on it), marches down the open slope into the field and meets the enemy there (and may push up the far
// slope). Two sides get two hills face to face; three or four armies (a free-for-all) get one hill each, round the field. Behind the hills and round the
// edge the ground climbs into the plateau and the mountains of the usual land (its biome colours, its trees on the heights). No castles, roads or middle
// hill. Everything here is a pure function of the position, the map size and the number of hills (WAR_WORLD.hills, part of the world's key in main.js),
// so the host and every guest build the same ground.
//   field   the low ground between the hills: gently rolling, a metre or two of relief
//   hill    a flat top (FIELD.hw across, FIELD.hd deep from the middle of the hill) FIELD.height above the field, its slopes FIELD.slope long all round,
//           no steeper than about 25 degrees (every unit walks up and down: nothing in physics.js stops a climb, and nothing should look like a cliff)
//   rim     past FIELD.rim from the middle the ground rises towards the edge of the map and the mountains
import { WORLD, WAR_WORLD } from './config.js';
import { Physics, CASTLE_SITES } from './physics.js';
import { wallHeight } from './landscape.js';
import { smoothstep } from './noise.js';

// the field's sizes for the current map (metres): set by layoutField, which WarPhysics calls before any height is asked for
//   hills    how many (2 face to face, 3 or 4 round the field)
//   front    the forward edge of each hilltop, from the middle of the map (the army's front rank stands just behind it)
//   hd, hw   the hilltop's half-depth (towards the middle) and half-width (across)
//   slope    the length of the slope from the edge of the top to the field
//   height   the hilltop above the field
//   rim      where the ground starts to rise towards the edge of the map
export const FIELD = { hills: 2, front: 86, hd: 28, hw: 80, slope: 60, height: 20, rim: 175, floor: 26 };
export function layoutField() {
  const P = WORLD.playHalf, n = Math.max(2, Math.min(4, WAR_WORLD.hills | 0 || 2));
  FIELD.hills = n;
  FIELD.front = Math.round(P * (n > 2 ? 0.48 : 0.45));
  FIELD.hd = Math.round(P * 0.14);
  FIELD.hw = Math.round(P * (n > 2 ? 0.27 : 0.42));   // (two sides: a long ridge, room for two allied armies side by side)
  FIELD.slope = Math.round(P * 0.34);
  FIELD.height = Math.min(30, Math.round(FIELD.slope * 0.38));   // (steepest about 26 degrees: see slopeDrop)
  FIELD.rim = Math.round(P * 0.86);
  FIELD.floor = Math.max(18, FIELD.front - FIELD.slope);   // the open field round the middle, where no hill reaches
}

// The middle of hill i of n and the way it faces (towards the middle of the map): the same angles as sideSpot, so side i stands on hill i
export function hillAt(i, n = FIELD.hills) {
  const a = (i / n) * Math.PI * 2 + (n === 2 ? 0 : Math.PI / 4);
  const d = FIELD.front + FIELD.hd;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, fx: -Math.sin(a), fz: -Math.cos(a) };
}

// how far (x, z) lies outside the top of the nearest hill (0 on the top), and that hill's index; o is reused by the caller
const HILLS = [];
function hillList() {
  if (HILLS.length !== FIELD.hills || HILLS.key !== FIELD.front + FIELD.hd) {
    HILLS.length = 0;
    for (let i = 0; i < FIELD.hills; i++) HILLS.push(hillAt(i));
    HILLS.key = FIELD.front + FIELD.hd;
  }
  return HILLS;
}
export function hillDistance(x, z) {
  let best = Infinity;
  for (const h of hillList()) {
    const dx = x - h.x, dz = z - h.z;
    const u = Math.abs(dx * h.fx + dz * h.fz), v = Math.abs(dx * h.fz - dz * h.fx);   // along the hill's facing, and across it
    const e = Math.hypot(Math.max(0, u - FIELD.hd), Math.max(0, v - FIELD.hw));     // (a rounded rectangle: the top is flat out to its edges)
    if (e < best) best = e;
  }
  return best;
}

// How far down the slope a point t (0 at the edge of the top, 1 at the foot) is, 0..1: a short rounded shoulder, so that from the edge of the top you see
// down the slope to the field (a long round shoulder would hide it), an even slope, and a long soft foot. Its steepest is SLOPE_M times height / slope (about 26
// degrees at the sizes of layoutField).
const SH = 0.12, FT = 0.3, SLOPE_M = 1 / (1 - SH / 2 - FT / 2);
export function slopeDrop(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < SH) return (SLOPE_M * t * t) / (2 * SH);
  if (t <= 1 - FT) return SLOPE_M * (t - SH / 2);
  return 1 - (SLOPE_M * (1 - t) * (1 - t)) / (2 * FT);
}

// the field's own height at (x, z) with no noise: the hills and the rise towards the edge
export function fieldProfile(x, z) {
  const hill = FIELD.height * (1 - slopeDrop(hillDistance(x, z) / FIELD.slope));
  const r = Math.hypot(x, z);
  const rise = r > FIELD.rim ? Math.min(FIELD.height + 6, (r - FIELD.rim) * 0.35) : 0;
  return Math.max(hill, rise);
}

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

// may a tree or a rock stand here (scatter.js)? Not on the field, the hills or their slopes: the armies need the room. The rise towards the edge and the
// low ground between neighbouring hills far from the middle carry the forest.
export function fieldPropOk(x, z) {
  if (!WAR_WORLD.on) return true;
  const r = Math.hypot(x, z);
  return r > FIELD.rim - 10 || (r > FIELD.front + FIELD.hd && hillDistance(x, z) > FIELD.slope * 0.9);
}

// The point and the facing of each side's army: side i on hill i, its front rank a few metres behind the forward edge of the top, facing the middle.
// `slot` of `of` houses on one side stand next to each other along the front. -> { x, z, yaw, fx, fz } (fx, fz: the way the army faces)
// (fewer sides than hills, e.g. a world built for four with only two armies in it: they take hills across the field from each other)
export function sideSpot(side, sides, slot = 0, of = 1) {
  const h = hillAt(Math.round((side * FIELD.hills) / Math.max(1, sides)) % FIELD.hills, FIELD.hills);
  const fx = h.fx, fz = h.fz;
  const rx = fz, rz = -fx;                       // to the right of the facing
  const lateral = (slot - (of - 1) / 2) * Math.min(56, FIELD.hw * 0.62);
  const d = FIELD.front + 4;   // (the hero stands 5 m in front of this: on the very edge of the top, looking down the slope)
  return { x: -fx * d + rx * lateral, z: -fz * d + rz * lateral, yaw: Math.atan2(fx, fz), fx, fz };
}
