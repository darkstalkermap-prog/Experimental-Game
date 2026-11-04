// Stonecleft Hold's rules: a Specialty Battle (specialty.js) on its own map (stonecleft.js) with its own fortress (holdcastle.js). Underneath it is a war of
// Conquest as every other: castles, walls, gates and keeps, a wave from every castle every 30 seconds, gold, the shop, siege engines, tower archers, the
// hero classes. On top of that:
//   sides    the three lords are allies (teams.js setSides): they never fight each other, and their waves, their engines and their pushes all go for the hold
//   the hold its walls and gate are built stronger, its towers are manned from the start and its purse is fuller (HOLD_RULES: tuned on whole battles,
//            see the numbers there)
//   winning  break all three of their keeps, or hold your own keep until the clock runs out (it starts with the first wave; the HUD counts it down:
//            "Hold for 18:20")
//   losing   your keep falls
// Single player only (the lobby does not offer it). Game.start makes one of these when the setup says `special: 'stonecleft'` and the world is Stonecleft's.
import { allied, setSides } from './teams.js';
import { clock } from './config.js';
import { matchlog } from './matchlog.js';

export const HOLD_RULES = {
  // seconds of battle (from the first wave) the hold must stand, by difficulty
  hold: { easy: 18 * 60, normal: 22 * 60, hard: 25 * 60 },
  gold: 1200,        // the hold's purse at the start (every other house starts with START_GOLD)
  wall: 2.5,         // its walls, its gate and its keep are this much stronger than a castle's (the upgrades and repairs build on it)
  gate: 3,
  keep: 2.5,
  towers: 2,         // its tower archers start at this level, for nothing
  troopCap: 18,      // its barracks holds this many from the start (one Expand Barracks for nothing)
  garrison: ['archer', 'archer', 'archer', 'archer', 'spearman', 'spearman'],   // the men on its walls from the start, besides every house's first five
  warn: [300, 60],   // the clock's words of encouragement: this many seconds before the end
};

export class HoldBattle {
  constructor(game) {
    this.g = game;
    this.id = 'stonecleft';
    this.hold = HOLD_RULES.hold[game.difficultyName] || HOLD_RULES.hold.normal;
    this.startAt = -1;       // the match clock (matchlog.t) when the first wave marched: the hold's clock runs from there
    this.warned = 0;
    this.result = null;      // how it ended: 'keeps' | 'held' | 'fell'
  }

  // the houses, the alliance and the hold's advantages (Game.start, after the factions are made)
  setup() {
    const g = this.g, hold = g.castles[0];
    g.sides = [[1, 2, 3]];
    setSides(g.sides);
    const f = g.factions[0], R = HOLD_RULES;
    f.gold = R.gold;
    f.troopCap = Math.max(f.troopCap, R.troopCap);
    hold.wallMul = R.wall;
    hold.gateMul = R.gate;
    hold.repairWalls();
    hold.repairGate();
    hold.keep.maxHp = Math.round(hold.keep.maxHp * R.keep);
    hold.repairKeep();
    hold.towerLevel = Math.max(hold.towerLevel, R.towers);
    if (g.simulating) for (const t of R.garrison) g.recruit(f, t);
  }

  // seconds the hold must still stand (the whole time until the first wave has marched)
  get left() { return this.startAt < 0 ? this.hold : Math.max(0, this.hold - (matchlog.t - this.startAt)); }
  // the HUD's words: "Hold for 18:20"
  get line() { return `Hold for ${clock(this.left)}`; }

  // the clock and the ends (single player: the world is run here)
  update() {
    const g = this.g;
    if (g.state !== 'playing') return;
    if (this.startAt < 0 && g.round >= 1) this.startAt = matchlog.t;
    if (this.startAt < 0) return;
    const left = this.left;
    for (let i = this.warned; i < HOLD_RULES.warn.length; i++) {
      if (left > HOLD_RULES.warn[i]) break;
      this.warned = i + 1;
      g.announce(i === 0 ? 'Five minutes more: hold the wall!' : 'One minute more! The lords cannot keep this up.', -1, 'all');
      if (i === 1) g.audio.play('horn', g.camera.position);
    }
    if (left <= 0) this.end('held');
  }

  // a keep has fallen (Game.onCastleFallen): the hold's ends the battle; the last of theirs wins it
  keepFell(castle) {
    const g = this.g;
    if (g.state !== 'playing') return;
    if (castle.team === 0) { this.end('fell'); return; }
    if ([1, 2, 3].every((t) => g.castles[t].fallen)) this.end('keeps');
  }

  end(how) {
    const g = this.g;
    if (this.result) return;
    this.result = how;
    matchlog.record('holdEnd', { how, held: this.startAt < 0 ? 0 : Math.round(matchlog.t - this.startAt) });
    const won = how !== 'fell';
    const reason = how === 'keeps' ? 'All three keeps lie broken. The lords\' alliance is finished, and Stonecleft Hold stands.'
      : how === 'held' ? `You held Stonecleft for ${clock(this.hold)}. The three lords break off the siege and march home.`
      : 'Stonecleft Hold has fallen: the keep is down and the gorge is theirs.';
    if (how === 'held') { g.audio.play('horn', g.camera.position); g.quickEnd = true; }
    g.endGame(won ? 0 : [1, 2, 3].find((t) => !g.castles[t].fallen) ?? 1, reason);
  }

  // the opening banner's words
  banner(prep) {
    return `You alone hold the gorge against three allied lords. Their armies march in ${clock(prep)}: buy and upgrade now. Win by breaking all three of their keeps, or hold your keep for ${clock(this.hold)} once the first armies march. If your keep falls, the hold is lost. B: shop · M: map · Q / R: abilities · Enter: ready.`;
  }

  // Is this house one of the three lords (for the end screen and the map)?
  foe(team) { return team !== 0 && !allied(team, 0); }
}
