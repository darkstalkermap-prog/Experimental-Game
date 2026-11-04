// The race of each house's army: only how its soldiers look (Human, Elves, Dwarves, Orcs, Undead). Every number of the battle stays the
// same whatever the race (health, damage, speed, reach, hitboxes, timing): the look is chosen here and drawn by models.js and
// raceshapes.js. Pure rules and state (no DOM, no three.js), shared by the menu, the lobby, the match start and the tests.
//   A match's races: one id per castle (index = team). The raiders and the heroes keep the human look.
export const RACES = [
  { id: 'human', name: 'Human', blurb: 'The men of the realm, in mail and plate.' },
  { id: 'elf', name: 'Elves', blurb: 'Tall and slender, in fine curved plate, with leaf blades and long bows.' },
  { id: 'dwarf', name: 'Dwarves', blurb: 'Short and broad, heavily armoured and bearded, with axes and hammers.' },
  { id: 'orc', name: 'Orcs', blurb: 'Big, hunched and tusked, in crude spiked iron, with cleavers.' },
  { id: 'undead', name: 'Undead', blurb: 'Bones in rotted mail and rusted ancient arms, eyes glowing cold.' },
];
export const RACE_IDS = RACES.map((r) => r.id);
export const isRaceId = (id) => typeof id === 'string' && RACE_IDS.includes(id);
export const raceName = (id) => (RACES.find((r) => r.id === id) || RACES[0]).name;
// what the other houses are on the menu: each a race of its own at random, all of them the player's race, or all human
export const OTHER_RACES = ['random', 'same', 'human'];
export const isOtherRaces = (v) => OTHER_RACES.includes(v);

// The look is never decided by Math.random: the battle's rules draw from it, and a seeded battle must play the same whatever the
// races are (see quietly in modelkit.js). The browser's own randomness, or a counter of its own where there is none (node tests).
let fallback = 0x9e3779b9;
function roll(n) {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  } catch (e) { /* no crypto: the counter */ }
  fallback = (Math.imul(fallback ^ (fallback >>> 16), 0x45d9f3b) + 0x6d2b79f5) >>> 0;
  return fallback % n;
}
export const randomRace = () => RACE_IDS[roll(RACE_IDS.length)];
export const lookRoll = roll;   // (the same dice for other looks: unlocks.js aiSigils)

// A match's four races from what each castle's lord asked for (`wants`: a race id, or null for an AI lord or nobody) and what the
// others are to be (`others`: 'random', 'same' (as the first race asked for) or 'human').
// (`mine`: the race 'same' copies when nobody asked for one, as when the battle is only watched)
export function assignRaces(wants, others = 'random', mine = null) {
  mine = (Array.isArray(wants) ? wants : []).find(isRaceId) || (isRaceId(mine) ? mine : 'human');
  return [0, 1, 2, 3].map((t) => {
    const w = Array.isArray(wants) ? wants[t] : null;
    if (isRaceId(w)) return w;
    return others === 'same' ? mine : others === 'human' ? 'human' : randomRace();
  });
}
// The races the castles' lords ask for (the input of assignRaces): in a war each human's castle (their `rc`), in a hero match each side its
// first human's by seat (as the colours: seats.js colorWants)
export function raceWants(players, hero) {
  const w = [null, null, null, null];
  if (!hero) { for (const p of players) if (p.team >= 0 && p.team < 4 && isRaceId(p.rc)) w[p.team] = p.rc; return w; }
  for (const side of [0, 1]) {
    const first = players.filter((p) => p.hs >= 0 && p.hs >> 2 === side).sort((a, b) => a.hs - b.hs)[0];
    if (first && isRaceId(first.rc)) w[side] = first.rc;
  }
  return w;
}
// what a guest is sent, made safe (anything unknown is human)
export const sanitizeRaces = (ids) => [0, 1, 2, 3].map((t) => (Array.isArray(ids) && isRaceId(ids[t]) ? ids[t] : 'human'));
export const raceKey = (ids) => sanitizeRaces(ids).join(',');

// ---------------- the races of the match being played ----------------
let current = ['human', 'human', 'human', 'human'];
// (called when a match starts, before any soldier is made: game.js)
export function setRaces(ids) { current = sanitizeRaces(ids); }
export const currentRaces = () => current.slice();
// the race id of team `team`'s soldiers (anyone who is not one of the four houses: human)
export const raceOf = (team) => (Number.isInteger(team) && team >= 0 && team < 4 ? current[team] : 'human');
// the races in the field, each once
export const racesInPlay = () => [...new Set(current)];
