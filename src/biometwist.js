// The small rule twist of a biome (biomes.js `twist` and `mods`), one each, none in the meadow:
//   snow    Deep snow       soldiers off the roads march 12% slower (the roads, the castle yards and the hill in the middle are trampled)
//   marsh   Fens            archers' range -20% in the mist, and soldiers wading through a pond march 22% slower (the ponds you see are the mud)
//   desert  Scorching sun   a hero's sprint drains stamina 35% faster and it comes back 30% slower
// They are rule modifiers (mods.js keys offroadSpeed, mudSpeed, archerRange, staminaDrain, staminaRegen), set when a match starts from the land the world
// was built for: the host's simulation reads them (the soldiers); every machine sets the same ones from the options (a hero's stamina is its own).
import { mods } from './mods.js';
import { active } from './biomes.js';
import { patchAt } from './terrain.js';
import { roadDist } from './roads.js';
import { CASTLE } from './config.js';
import { CASTLE_SITES } from './physics.js';

// start of a match (after mods.reset): put the land's modifiers in
export function applyBiomeRules(game) {
  if (game.practice || !active.def.mods) return;
  mods.set('biome:' + active.id, active.def.mods);
}

// one line for the opening banner ('' in the meadow, and in the courtyard)
export function twistLine(game) {
  const t = active.def.twist;
  return !t || game.practice ? '' : ` ${t.name}: ${t.text}`;
}

// The numbers the hot paths read each frame, kept against mods.version so asking costs nothing.
const R = { v: -1, drain: 1, regen: 1, offroad: 1, mud: 1 };
export function rules() {
  if (R.v !== mods.version) {
    R.v = mods.version;
    R.drain = mods.mul('staminaDrain'); R.regen = mods.mul('staminaRegen');
    R.offroad = mods.mul('offroadSpeed'); R.mud = mods.mul('mudSpeed');
  }
  return R;
}

const LANE = 4.5;   // metres from the middle of a road that count as the road (the road is drawn about 7 m wide)
// where the trampled ground is: on a road, in a castle's yard and its surroundings, and on the hill in the middle (inside the ring road)
function trampled(x, z) {
  if (roadDist(x, z) < LANE || x * x + z * z < 36 * 36) return true;
  for (const s of CASTLE_SITES) if (Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) < CASTLE.H + 14) return true;
  return false;
}

// the marsh: how much of a spot is a pond (the same field that paints the ponds)
export const fenAt = (game, x, z) => patchAt(game.physics.noise, roadDist, x, z, 0);

// How fast a soldier may march where it stands, as a multiple of its speed. Worked out a few times a second for each soldier, not every frame.
export function groundMul(game, u, dt) {
  const T = rules();
  if (T.offroad === 1 && T.mud === 1) return 1;   // (the classic land and the other biomes: nothing to work out)
  u.groundT -= dt;
  if (u.groundT <= 0) {
    u.groundT = 0.3 + (u.id % 5) * 0.06;
    let m = 1;
    const x = u.pos.x, z = u.pos.z;
    if (T.offroad !== 1 && !trampled(x, z)) m *= T.offroad;
    if (T.mud !== 1 && fenAt(game, x, z) > 0.5) m *= T.mud;
    u.groundM = m;
  }
  return u.groundM;
}
