// Who sits where before a battle: the four castles of the war modes, and the hero seats of the Hero Game Mode. Pure rules (no DOM, no game), shared by
// the menu (one player), the host's lobby (it decides) and the tests. The host is the only one that changes a room's seating: a guest asks, and what it
// asks for is checked here.
//
// War modes: slots[t] is castle t's state: 'open' (a human may take it; an AI lord holds it when nobody does), 'ai' (closed: always an AI lord) or
//   'empty' (closed: nobody, the castle stands empty and out of the war). A lobby player's `team` is the castle they hold.
// Hero Game Mode: two sides (castle 0 and castle 1) of `size` seats each. Seat s is side s >> 2, place s & 3 (so the seats are 0..3 and 4..7, of which
//   the first `size` of each side are in use). seats[s] is 'open' (a human, or a hero bot when nobody takes it), 'ai' (closed: a hero bot) or 'empty'.
//   A lobby player's `hs` is their seat.
export const SLOT_STATES = ['open', 'ai', 'empty'];
export const HERO_SIZES = [2, 3, 4];
export const isSlotState = (s) => SLOT_STATES.includes(s);
export const sideOfSeat = (s) => s >> 2;
export const placeOfSeat = (s) => s & 3;
export const seatInUse = (s, size) => Number.isInteger(s) && s >= 0 && s < 8 && placeOfSeat(s) < size;
export const heroSize = (n) => (HERO_SIZES.includes(n) ? n : 3);

export const freshSlots = () => ['open', 'open', 'open', 'open'];
export const freshSeats = () => ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open'];
export const cleanSlots = (a) => [0, 1, 2, 3].map((t) => (Array.isArray(a) && isSlotState(a[t]) ? a[t] : 'open'));
export const cleanSeats = (a) => [0, 1, 2, 3, 4, 5, 6, 7].map((s) => (Array.isArray(a) && isSlotState(a[s]) ? a[s] : 'open'));

// the next state of a free slot or seat when the host clicks it: open -> AI -> empty -> open
export const nextState = (s) => SLOT_STATES[(SLOT_STATES.indexOf(s) + 1) % SLOT_STATES.length];

// ---------------- the war modes ----------------
const takenTeams = (players, except) => new Set(players.filter((p) => p !== except).map((p) => p.team));
// may `who` move to castle t? (it must be open and nobody else's)
export const canTakeSlot = (slots, players, who, t) => Number.isInteger(t) && t >= 0 && t < 4 && slots[t] === 'open' && !takenTeams(players, who).has(t);
export const firstFreeSlot = (slots, players) => [0, 1, 2, 3].find((t) => slots[t] === 'open' && !takenTeams(players, null).has(t)) ?? -1;

// Why a war cannot start with this seating (null when it can): it needs two sides, and in co-op somebody to fight.
export function warProblem(slots, players, coop) {
  const humans = new Set(players.map((p) => p.team));
  const houses = [0, 1, 2, 3].filter((t) => humans.has(t) || slots[t] !== 'empty');
  if (houses.length < 2) return 'A war needs two houses: open a castle or give it to an AI lord.';
  if (coop && humans.size > 1 && humans.size < 4 && houses.every((t) => humans.has(t))) return 'Co-op needs an enemy: give a castle to an AI lord.';
  return null;
}
// the castles that stand empty in a war with this seating
export const emptyTeams = (slots, players) => [0, 1, 2, 3].filter((t) => slots[t] === 'empty' && !players.some((p) => p.team === t));

// ---------------- the Hero Game Mode ----------------
const takenSeats = (players, except) => new Set(players.filter((p) => p !== except).map((p) => p.hs));
export const canTakeSeat = (seats, size, players, who, s) => seatInUse(s, size) && seats[s] === 'open' && !takenSeats(players, who).has(s);
// a free open seat, on the side with fewer people (side 0 first), or -1
export function firstFreeSeat(seats, size, players, prefer = -1) {
  const taken = takenSeats(players, null);
  const count = (side) => players.filter((p) => seatInUse(p.hs, size) && sideOfSeat(p.hs) === side).length;
  const order = prefer >= 0 ? [prefer, 1 - prefer] : count(1) < count(0) ? [1, 0] : [0, 1];
  for (const side of order) {
    for (let i = 0; i < size; i++) { const s = side * 4 + i; if (seats[s] === 'open' && !taken.has(s)) return s; }
  }
  return -1;
}
export function heroProblem(seats, size, players) {
  for (const side of [0, 1]) {
    let n = 0;
    for (let i = 0; i < size; i++) { const s = side * 4 + i; if (seats[s] !== 'empty' || players.some((p) => p.hs === s)) n++; }
    if (!n) return `Each side needs a hero: open a seat of the ${side ? 'second' : 'first'} side or give it to a bot.`;
  }
  return null;
}
// who holds each seat of a hero match: per seat 'h' (a human), 'b' (a bot) or '' (nobody)
export const heroCast = (seats, size, players) => [0, 1, 2, 3, 4, 5, 6, 7].map((s) => (!seatInUse(s, size) ? ''
  : players.some((p) => p.hs === s) ? 'h' : seats[s] === 'empty' ? '' : 'b'));

// ---------------- everybody has a place ----------------
// After a change of mode or team size (or a join): every player keeps their castle and seat if they still may, otherwise takes a free open one, otherwise
// a free closed one, which is opened for them (the host never leaves somebody in the room without a place). Changes the players and states in place.
export function reseat(players, slots, seats, size) {
  const holds = (p) => players.filter((q) => q !== p);
  for (const p of players) {
    if (!(Number.isInteger(p.team) && p.team >= 0 && p.team < 4 && !holds(p).some((q) => q.team === p.team))) {
      let t = [0, 1, 2, 3].find((x) => slots[x] === 'open' && !holds(p).some((q) => q.team === x));
      if (t === undefined) t = [0, 1, 2, 3].find((x) => !holds(p).some((q) => q.team === x));
      p.team = t;
    }
    if (slots[p.team] !== 'open') slots[p.team] = 'open';
  }
  for (const p of players) {
    if (seatInUse(p.hs, size) && !holds(p).some((q) => q.hs === p.hs)) { seats[p.hs] = 'open'; continue; }
    p.hs = -1;
    let s = firstFreeSeat(seats, size, players);
    if (s < 0) {
      for (let x = 0; x < 8 && s < 0; x++) if (seatInUse(x, size) && !players.some((q) => q.hs === x)) s = x;
      seats[s] = 'open';
    }
    p.hs = s;
  }
}

// The colours of a match's houses as each castle's lord asked for them (the input of teams.js assignColors): in a war each human's castle, in a hero
// match each side takes the colour of its first human (by seat).
export function colorWants(players, hero) {
  const w = [null, null, null, null];
  if (!hero) { for (const p of players) if (p.team >= 0 && p.team < 4) w[p.team] = p.col || null; return w; }
  for (const side of [0, 1]) {
    const first = players.filter((p) => p.hs >= 0 && sideOfSeat(p.hs) === side).sort((a, b) => a.hs - b.hs)[0];
    if (first) w[side] = first.col || null;
  }
  return w;
}
