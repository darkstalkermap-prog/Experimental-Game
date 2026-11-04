// Specialty Battles: set pieces with a map and rules of their own, listed under their own heading on the main menu (specialui.js), apart from the
// modes of the Battle setup. Each one is played with the hero class and the difficulty chosen on the menu, and Quick Play and Play Again repeat it like any
// other mode (flow.js keeps its id as the last match's mode). To add one: an entry here (what the menu says about it), its map (a Physics of its own, as
// stonecleft.js / holdphysics.js are for Stonecleft Hold) and its rules (as holdgame.js), and the switch in Game that builds it.
// This file is plain data (no page, no game), so that the menu, the flow and the tests can read it without building anything.

export const SPECIALTY = {
  stonecleft: {
    id: 'stonecleft',
    name: 'Stonecleft Hold',
    format: '1 vs 3',
    icon: '🏰',
    blurb: 'Your fortress seals a mountain gorge. Three lords march on it together. Hold the wall.',
    // the longer line under the blurb (the menu's tooltip and the opening banner say the same)
    how: 'You alone against three allied lords. Win by breaking all three enemy keeps, or by holding your keep until the clock runs out. Lose when your keep falls.',
    map: 'medium',       // the map size it is built on (the menu's Map row does not apply)
    single: true,        // single player only (the lobby does not offer it)
    // the races of the armies (races.js: only their look): the hold is held by Humans or Elves, as the player picks on the card; the three lords are Orcs
    races: ['human', 'elf'],
    foes: 'orc',
  },
};

// the race the player's army takes in battle `id`: their own (the menu's Your army) when the battle offers it, otherwise the battle's first
export function specialRace(id, mine) {
  const s = SPECIALTY[id];
  if (!s || !s.races) return mine;
  return s.races.includes(mine) ? mine : s.races[0];
}
// the four houses' races for battle `id` (index = team; the player holds house 0), or null when the battle sets none (the menu's rules then apply)
export function specialRaces(id, mine) {
  const s = SPECIALTY[id];
  if (!s || !s.races || !s.foes) return null;
  const r = specialRace(id, mine);
  return [0, 1, 2, 3].map((t) => (t === 0 ? r : s.foes));
}

export const SPECIALTY_IDS = Object.keys(SPECIALTY);
export const isSpecialty = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(SPECIALTY, id);

// The specialty battle the next world is built for ('' for none), set before a Game is built like the map size or War Mode's hills (the world itself is
// different: its ground, its castles, its roads). main.js keys its worlds by it.
export const SPECIAL_WORLD = { id: '' };
export function setSpecialWorld(id) { SPECIAL_WORLD.id = isSpecialty(id) ? id : ''; }
