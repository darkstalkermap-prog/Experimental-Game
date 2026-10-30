// The War Mode map: a hill for every army and the low field between them. Each side's army musters on the flat top of its own broad hill (a long ridge
// across its front, so a whole battle line fits on it), marches down the open slope into the field and meets the enemy there (and may push up the far
// slope). Two sides get two hills face to face; three or four armies (a free-for-all) get one hill each, round the field. Behind the hills and round the
// edge the ground climbs into the plateau and the mountains of the usual land (its biome colours, its trees on the heights). No castles, roads or middle
// hill. Everything here is a pure function of the position, the map size and the number of hills (WAR_WORLD.hills, part of the world's key in main.js),
// so the host and every guest build the same ground. This file is the plain maths (no page, no three.js: the tests run it as it is); the ground itself
// is WarPhysics (warphysics.js).
//   field   the low ground between the hills: gently rolling, a metre or two of relief
//   hill    a flat top (FIELD.hw across, FIELD.hd deep from the middle of the hill) FIELD.height above the field, its slopes FIELD.slope long all round,
//           no steeper than about 25 degrees (every unit walks up and down: nothing in physics.js stops a climb, and nothing should look like a cliff)
//   rim     past FIELD.rim from the middle the ground rises towards the edge of the map and the mountains
import { WORLD, WAR_WORLD, WAR } from './config.js';

// the field's sizes for the current map (metres): set by layoutField, which WarPhysics calls before any height is asked for
//   hills    how many (2 face to face, 3 or 4 round the field)
//   front    the forward edge of each hilltop, from the middle of the map (the army's front rank stands just behind it)
//   hd, hw   the hilltop's half-depth (towards the middle) and half-width (across)
//   slope    the length of the slope from the edge of the top to the field
//   height   the hilltop above the field
//   rim      where the ground starts to rise towards the edge of the map
export const FIELD = { hills: 2, plan: '11', front: 86, hd: 28, hw: 80, slope: 60, height: 20, rim: 175, floor: 26, angles: [0, Math.PI] };
// the angle between the hills of two allies (radians): neighbours, their tops well apart (a saddle between them), nearer each other than any enemy
const ALLY_GAP = (76 * Math.PI) / 180;
export function layoutField() {
  const P = WORLD.playHalf, n = Math.max(2, Math.min(4, WAR_WORLD.hills | 0 || 2));
  FIELD.hills = n;
  FIELD.plan = typeof WAR_WORLD.plan === 'string' && [...WAR_WORLD.plan].reduce((a, c) => a + +c, 0) === n ? WAR_WORLD.plan : '1'.repeat(n);
  FIELD.front = Math.round(P * (n > 2 ? 0.48 : 0.45));
  FIELD.hd = Math.round(P * 0.14);
  FIELD.hw = Math.round(P * (n > 2 ? 0.27 : 0.42));   // (two hills: a long ridge each, face to face)
  FIELD.slope = Math.round(P * 0.34);
  FIELD.height = Math.min(30, Math.round(FIELD.slope * 0.38));   // (steepest about 26 degrees: see slopeDrop)
  FIELD.rim = Math.round(P * 0.86);
  FIELD.floor = Math.max(18, FIELD.front - FIELD.slope);   // the open field round the middle, where no hill reaches
  // where each hill stands round the field: the sides evenly round it (two face to face; three or four a quarter turn on), and the armies of one side on
  // neighbouring hills of their own, ALLY_GAP apart round the side's own direction
  const sizes = [...FIELD.plan].map(Number), m = sizes.length;
  FIELD.angles = [];
  sizes.forEach((k, s) => {
    const c = (s / m) * Math.PI * 2 + (m === 2 ? 0 : Math.PI / 4);
    for (let j = 0; j < k; j++) FIELD.angles.push(c + (j - (k - 1) / 2) * ALLY_GAP);
  });
}

// The middle of hill i and the way it faces (towards the middle of the map)
export function hillAt(i) {
  const a = FIELD.angles[i] || 0;
  const d = FIELD.front + FIELD.hd;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, fx: -Math.sin(a), fz: -Math.cos(a) };
}

// how far (x, z) lies outside the top of the nearest hill (0 on the top), and that hill's index; o is reused by the caller
const HILLS = [];
function hillList() {
  const key = FIELD.plan + ':' + (FIELD.front + FIELD.hd);
  if (HILLS.key !== key) {
    HILLS.length = 0;
    for (let i = 0; i < FIELD.hills; i++) HILLS.push(hillAt(i));
    HILLS.key = key;
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

// may a tree or a rock stand here (scatter.js)? Not on the field, the hills or their slopes: the armies need the room. The rise towards the edge and the
// low ground between neighbouring hills far from the middle carry the forest.
export function fieldPropOk(x, z) {
  if (!WAR_WORLD.on) return true;
  const r = Math.hypot(x, z);
  return r > FIELD.rim - 10 || (r > FIELD.front + FIELD.hd && hillDistance(x, z) > FIELD.slope * 0.9);
}

// The point and the facing of an army: every army on a hill of its own (allies on neighbouring hills), its front rank a few metres behind the forward
// edge of the top, facing the middle. `slot` of `of` houses on side `side` of `sides`. -> { x, z, yaw, fx, fz, hill } (fx, fz: the way the army faces)
// (a world whose hills were laid out for other sides, which a match never has, still gives every army a hill of its own while there are enough)
export function sideSpot(side, sides, slot = 0, of = 1) {
  const sizes = [...FIELD.plan].map(Number);
  let i;
  if (sizes.length === sides && sizes[side] === of) i = sizes.slice(0, side).reduce((a, k) => a + k, 0) + slot;
  else i = Math.round(((side + slot / Math.max(1, of)) * FIELD.hills) / Math.max(1, sides)) % FIELD.hills;
  const h = hillAt(i);
  const d = FIELD.hd - 4;   // (the hero stands 5 m in front of this: on the very edge of the top, looking down the slope)
  return { x: h.x + h.fx * d, z: h.z + h.fz * d, yaw: Math.atan2(h.fx, h.fz), fx: h.fx, fz: h.fz, hill: i };
}

// ---------------- the sides of a match ----------------
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

// what a War Mode match is set up with ({ format }), cleaned (the menu, the lobby's start message and a guest's copy all go through this)
export function sanitizeWar(w) {
  const f = w && typeof w === 'object' && own(WAR.formats, w.format) ? w.format : 'ffa';
  return { format: f };
}

// How the houses of a match are set against each other: [[teams]] one entry per side. humans: the players' teams; houses: the teams that take the field
// (a castle the lobby or the menu left empty sends no army: seats.js); coop: the lobby's Co-op (the players on one side against the AI).
export function warSides(format, humans, houses, coop) {
  if (format === 'duel' && humans.length <= 2 && !(coop && humans.length > 1)) {
    const foe = houses.find((t) => !humans.includes(t));
    houses = !humans.length ? houses.slice(0, 2) : humans.length === 2 || foe === undefined ? humans.slice().sort() : [humans[0], foe].sort();   // (nobody plays a battle that is watched: the first two armies)
  }
  let sides;
  if (coop && humans.length > 1) sides = humans.length >= 4 ? [[0, 1], [2, 3]] : [humans.slice(), houses.filter((t) => !humans.includes(t))];
  else if (format === 'teams') sides = [[0, 2], [1, 3]];
  else sides = houses.map((t) => [t]);
  return { houses, sides: sides.map((s) => s.filter((t) => houses.includes(t))).filter((s) => s.length) };
}
// the hills a match's world needs, from its setup, before the world is built (main.js; the same on every screen): one per army, grouped by side, as
// WAR_WORLD.plan ('22': two sides of two armies; config.js)
export const planOf = (sides) => (sides.length >= 2 ? sides.map((s) => s.length).join('') : '11');
export function warHills(setup) {
  const humans = (setup.players || []).map((p) => p.team);
  const houses = [0, 1, 2, 3].filter((t) => humans.includes(t) || !(Array.isArray(setup.empty) && setup.empty.includes(t)));
  return planOf(warSides(sanitizeWar(setup.war).format, humans, houses, !!setup.coop).sides);
}
// the world the menu shows behind it for a format (one player, every house in it)
export const menuPlan = (format) => warHills({ players: [{ team: 0 }], war: { format } });
