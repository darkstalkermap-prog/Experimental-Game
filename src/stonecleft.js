// Stonecleft Hold (a Specialty Battle, specialty.js): the map. A mountain range runs across the north of the field, its face a cliff from end to end.
// One gorge is cut into it, and the player's fortress seals the gorge: a long curtain wall across it from cliff to cliff, with towers and one gate, and
// behind the wall the yard on the gorge floor and, at the back, a rock shelf with the keep on it and a ramp up to it. The three lords' castles stand out on
// the open field in front of the range. Nobody walks round the wall: the cliffs are far steeper than anyone can climb (units.js SLOPE_MAX, and in this
// world the heroes and the engines too: holdSlope below).
// Everything here is a pure function of the position (no page, no three.js: the tests run it as it is), so the ground, the trees, the roads and the
// rules agree. The ground itself is HoldPhysics (holdphysics.js); the fortress is HoldCastle (holdcastle.js); the rules are holdgame.js.
//   castle-local  x across the gorge, z toward the gate (the wall's outer face is at z = CASTLE.H, as on every castle), y up from the gorge floor
//   world         the hold stands at HOLD.site, turned (rot = pi) so that its gate faces south, down the gorge toward the field
import { CASTLE, WORLD } from './config.js';
import { smoothstep, clamp } from './noise.js';
import { SPECIAL_WORLD } from './specialty.js';

// is the world being built (or on screen) Stonecleft Hold's?
export const holdWorld = () => SPECIAL_WORLD.id === 'stonecleft';

export const HOLD = {
  site: { x: 0, z: 150, rot: Math.PI, hold: true, reach: 58 },   // the hold (house 0); `reach`: half the size of its collider bucket (castle.js)
  // the three lords' castles (houses 1, 2 and 3: centre, west, east), out on the field, their gates toward the gorge
  foes: [{ x: 0, z: -135, rot: 0 }, { x: -130, z: -95, rot: 0 }, { x: 130, z: -95, rot: 0 }],
  wing: 48,                       // half the length of the curtain wall: from the middle of the gate to the cliff (castle-local x)
  endTower: 44,                   // the middle of each end tower; its outer face is set into the cliff
  wingSegs: [27, 33.25, 39.5],    // the breakable stretches of each wing: from the gate tower's outer face to the end tower's inner face
  stairs: [14, 33.25],            // the stairs up to the wall walk (the middle of each, either side of the gate)
  shelf: { front: -16, back: -47, rise: 5 },   // the rock shelf at the back of the gorge (castle-local z) and how high it stands over the yard
  ramp: { hw: 4.5, foot: -2 },    // the ramp up to it: half its width, and where it starts in the yard (it ends at the shelf's front)
  keepZ: -30,                     // the keep, on the shelf
  mouth: 34,                      // where the gorge starts to open out toward the field (castle-local z) ...
  flare: 1.8,                     // ... and how fast it opens (metres of half-width per metre)
  front: 92,                      // world z of the foot of the range's face (on average)
  cliff: 33,                      // how high the faces rise (on average) before they round off
  run: 7,                         // ... over this many metres
  toe: 2,                         // after a toe of scree this deep (cliffRise)
  floor: CASTLE.baseY,            // the gorge floor (and the yard): the height every castle is built at
};

// world -> castle-local (the hold is turned half round: its x and z run the other way)
export const holdLocalX = (x) => HOLD.site.x - x;
export const holdLocalZ = (z) => HOLD.site.z - z;

// Half the width of the gorge at castle-local z: straight between the cliffs along the wall (the wall meets them there), narrowing behind the stairs to the
// shelf, and opening out in front of the wall into the mouth.
export function gorgeHalf(lz) {
  if (lz >= HOLD.mouth) return HOLD.wing + (lz - HOLD.mouth) * HOLD.flare;
  if (lz >= 6) return HOLD.wing;
  if (lz >= -18) return 27 + (HOLD.wing - 27) * smoothstep(-18, 6, lz);
  return 24 + 3 * smoothstep(HOLD.shelf.back, -18, lz);
}

// the foot of the range's face (world z) at world x: a little ragged, and bending toward the field at the ends
export const frontZ = (nz, x) => HOLD.front + 4 * nz.noise(x * 0.018 + 1.7, 3.3) - 0.00035 * x * x;

// how far a point lies inside the rock (metres; <= 0 is open ground: the field, the mouth, the gorge), and how much of that is the gorge's side (wG: 1 at
// the gorge's walls, 0 at the range's face). o: { d, dG, wG } (reused)
export function rockDepth(nz, x, z, o) {
  const lx = holdLocalX(x), lz = holdLocalZ(z);
  // the sides wander a little, but not along the wall (it meets them squarely) or in front of it as far as the mouth
  const keep = smoothstep(-4, 6, lz) * (1 - smoothstep(HOLD.mouth, HOLD.mouth + 8, lz));
  const half = gorgeHalf(lz) + (1 - keep) * 2.2 * nz.noise(lz * 0.09 + (lx > 0 ? 13.1 : 0), 4.2);
  const side = Math.abs(lx) - half, back = HOLD.shelf.back - lz;
  const dG = side > 0 && back > 0 ? Math.hypot(side, back) : Math.max(side, back);
  const dF = z - frontZ(nz, x);
  o.dG = dG;
  o.d = Math.min(dF, dG);
  o.wG = smoothstep(-4, 4, dF - dG);
  return o;
}

// The rock shelf and its ramp: how high the ground stands over the gorge floor at castle-local (lx, lz). The shelf's face drops 5 m in under 2 m (nobody
// climbs it: the ramp is the way up), the ramp rises evenly from its foot in the yard to the shelf.
export function shelfRise(lx, lz) {
  const S = HOLD.shelf, R = HOLD.ramp;
  let r = S.rise * smoothstep(S.front + 0.2, S.front - 1.6, lz);
  const ax = Math.abs(lx);
  if (ax < R.hw + 1.2 && lz < R.foot && lz > S.front - 2) {
    const up = S.rise * clamp((R.foot - lz) / (R.foot - S.front), 0, 1);
    r = Math.max(r, up * (1 - smoothstep(R.hw, R.hw + 1.2, ax)));
  }
  return r;
}

// broken rock for the tops: 1 along creases, 0 in the hollows
function crag(nz, x, z) {
  let sum = 0, amp = 0.55, f = 0.012, norm = 0;
  for (let i = 0; i < 3; i++) {
    const r = 1 - Math.abs(nz.noise(x * f + i * 17.3, z * f - i * 9.1));
    sum += amp * r * r; norm += amp; amp *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

// The rock above the foot of a face, `d` metres in: a cliff that rises far steeper than anyone can climb (over 80 degrees at the foot), rounds off at its top
// and climbs on, broken, into the range. Never a ledge on the face: the ripple that roughens it is small next to its slope.
// The face rises from a toe of scree (as steep as anyone may not climb, but no wall): the ground's grid is 2 m, and a face that rose straight from the floor
// made its lowest triangle run from the floor to well up the face, which no shading of the ground can draw as rock.
export function cliffRise(nz, x, z, d) {
  const top = HOLD.cliff + 9 * nz.noise(x * 0.021 + 5.3, z * 0.021 - 2.2), R = HOLD.run, D = HOLD.toe;
  const t = Math.min(1, Math.max(0, d - D) / R);
  let c = Math.min(d, D) * 1.6 + top * (1 - (1 - t) * (1 - t));
  if (d > D + R) c += Math.min(26, (d - D - R) * 0.32);
  c += smoothstep(D + R, D + R + 30, d) * (crag(nz, x, z) - 0.45) * 34;
  c += smoothstep(D, D + 2, d) * (1 - smoothstep(D + 3, D + 6, d)) * nz.fbm(x * 0.16 + 9, z * 0.16 - 4, 2) * 1.2;
  return c;
}

const RD = { d: 0, dG: 0, wG: 0 };
// The ground of Stonecleft at (x, z): `field` is the open ground there (the rolling field and the ring of hills round the map, as on every map) and `ring`
// the ring's share of it. Inside the gorge it is the gorge floor (and the shelf); in the rock, the cliff over whichever foot is nearer.
export function holdGround(nz, x, z, field, ring) {
  const lx = holdLocalX(x), lz = holdLocalZ(z);
  const r = rockDepth(nz, x, z, RD);
  // the gorge floor: flat through the fortress, rising (or falling) evenly to the field's level through the mouth
  const floor = HOLD.floor + (field - ring - HOLD.floor) * smoothstep(30, 66, lz);
  const inGorge = r.dG <= 0 && lz < 66;
  if (r.d <= 0) return inGorge ? floor + shelfRise(lx, lz) : field;
  const base = field + (floor + shelfRise(30, lz) - field) * r.wG;   // (the shelf's height is the base of the cliffs round it: not the ramp's)
  return base + cliffRise(nz, x, z, r.d) + r.wG * ring * smoothstep(6, 30, r.d);
}

// is (x, z) inside the hold's gorge, in front of the wall's line or behind it (castle-local z below `lzMax`), and `pad` metres clear of the cliffs?
export function inGorge(nz, x, z, pad = 0, lzMax = 66) {
  const lz = holdLocalZ(z);
  if (lz > lzMax || lz < HOLD.shelf.back) return false;
  return rockDepth(nz, x, z, RD).dG < -pad;
}

// The roads: from each lord's gate to a meeting place on the field before the mouth, and from there up the gorge to the hold's gate.
export const HOLD_JUNCTION = { x: 0, z: 62 };
export function holdRoads() {
  const out = [];
  for (const s of HOLD.foes) {
    const gz = s.z + (CASTLE.H + 4) * Math.cos(s.rot), gx = s.x + (CASTLE.H + 4) * Math.sin(s.rot);
    out.push({ ax: gx, az: gz, bx: HOLD_JUNCTION.x, bz: HOLD_JUNCTION.z });
  }
  out.push({ ax: HOLD_JUNCTION.x, az: HOLD_JUNCTION.z, bx: HOLD.site.x, bz: HOLD.site.z - CASTLE.H - 3 });
  return out;
}

// May a tree or a rock of the field stand here (scatter.js)? Not in the gorge or its mouth, not on the faces of the range (a tree on a cliff hangs there) or
// at their foot, and not on the open ground before the mouth where the lords' armies halt and form up.
export function holdPropOk(nz, x, z) {
  const r = rockDepth(nz, x, z, RD);
  if (r.dG < 14 && holdLocalZ(z) < 76) return false;          // the gorge, its mouth and the rock right round them
  if (r.d > -10 && r.d < 26) return false;                     // the faces of the range and their foot
  if (Math.abs(x) < 105 && z > 20 && z < HOLD.front + 6) return false;   // the gathering ground before the mouth
  return true;
}

// how much of the ground at (x, z) is the trodden earth of the hold (0..1): the yard, the ground before the wall and the road up the gorge (terrain.js's
// castle mask, as round every castle)
export function holdDirt(nz, x, z) {
  const lz = holdLocalZ(z);
  if (lz < HOLD.shelf.back - 2 || lz > 72) return 0;
  const r = rockDepth(nz, x, z, RD);
  if (r.dG > -0.5) return 0;   // (not at the foot of the cliffs either: a mask on the last vertex of the floor is spread up the whole face above it, holdCliff)
  const yard = (1 - smoothstep(28, 46, lz)) * smoothstep(-0.5, -3, r.dG);
  return clamp(yard * (0.62 + 0.25 * nz.noise(x * 0.11, z * 0.11)), 0, 1);
}

// How much of the forest canopy the ground may be painted with at (x, z) (terrain.js: 0..1): none on the cliffs or right at their edge. The canopy is a
// per-vertex mask, and a face whose top edge is canopy and whose foot is bare rock was painted with crowns stretched down the whole cliff.
export function holdCanopy(nz, x, z) {
  const r = rockDepth(nz, x, z, RD);
  return r.d <= 0 ? 1 : smoothstep(HOLD.toe + HOLD.run + 3, HOLD.toe + HOLD.run + 10, r.d);
}

// How much of the ground at (x, z) is the bare rock of a cliff (terrain.js: 0..1): the faces, and a band of scree along their foot. The ground's shaders
// tell rock by the slope of the normals they are given, and those are smoothed from vertex to vertex: on a 2 m grid a 30 m face's lowest triangle runs from
// the flat floor to well up the face, and the grass of the floor reached up it in long green spikes.
export function holdCliff(nz, x, z) {
  const r = rockDepth(nz, x, z, RD);
  return smoothstep(-2.6, -0.6, r.d) * (1 - smoothstep(HOLD.toe + HOLD.run - 1, HOLD.toe + HOLD.run + 2, r.d));
}

// where the hold's castle sites lie (CASTLE_SITES, house by house)
export const holdSites = () => [{ ...HOLD.site }, ...HOLD.foes.map((s) => ({ ...s }))];

// the map size Stonecleft is built on (the menu's Map row does not apply)
export const HOLD_MAP = 'medium';
export const holdFits = () => WORLD.size === HOLD_MAP;
