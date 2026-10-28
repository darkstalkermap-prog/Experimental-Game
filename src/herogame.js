// Hero Game Mode: a 3 against 3 fought out of one castle each. Nobody commands an army or buys anything: a player controls
// only their hero (and the hero's talents). The armies march out of both castles by themselves, round after round tougher,
// until one side wins. Three ways to win, chosen before the match:
//   kills   the first side to 25 hero kills (a castle that falls still ends the match)
//   castle  destroy the enemy keep (hero kills only decide who is ahead)
//   timed   twenty minutes of battle: the side with more hero kills wins (a castle that falls still ends the match early)
// Blue (team 0, the local player's castle) fights Red (team 1). The other two castles of the map stand empty.
//
// This file is the contract between the parts that build the mode:
//   herogame.js  (the rules: who is on which side, respawns, the kill count, the waves, the win)  fills in HeroMode
//   herobot.js   (the AI that plays the heroes nobody is playing)                                 fills in HeroBot
//   the HUD, the menu and the controls (index.html, ui.js, main.js) read HeroMode through the fields listed below.
// A hero is a Player. A bot hero is a Player with `isBot = true` and `bot = HeroBot` (it is simulated where the battle is
// run, like every hero but the one on this screen).
import { HeroBot } from './herobot.js';

export const HERO = {
  perSide: 3,
  killTarget: 25,
  timeLimit: 20 * 60,              // seconds of battle in the timed mode
  prep: 30,                        // seconds before the first army marches
  respawnBase: 8, respawnPerDeath: 3, respawnMax: 24,   // a fallen hero rises at their keep after this many seconds
  fountain: { radius: 16, heal: 0.08 },                 // within this many metres of your own keep you mend this share of your health a second
  xpMult: 1.5,                     // experience comes quicker than in the war modes (the match is short)
  waveGrowth: 0.06,                // soldiers get this much tougher with every round (WAVES.growth in the war modes)
  modes: {
    kills: { name: 'Hero kills', short: 'First to 25', desc: 'The first side to 25 hero kills wins. A keep that falls ends the match too.' },
    castle: { name: 'Castle', short: 'Destroy the keep', desc: 'Destroy the enemy keep. Hero kills only count for the scoreboard.' },
    timed: { name: 'Timed', short: '20 minutes', desc: 'Twenty minutes of battle: the side with more hero kills wins, then the stronger keep. A keep that falls ends it early.' },
  },
};
export const HERO_MODE_IDS = Object.keys(HERO.modes);

export class HeroMode {
  // opts: { win: 'kills' | 'castle' | 'timed' }
  constructor(game, opts = {}) {
    this.g = game;
    this.win = HERO.modes[opts.win] ? opts.win : 'kills';
    // the two sides: team ids are the castle numbers (0 = Blue, the local player's; 1 = Red)
    this.sides = [0, 1].map((team) => ({ team, name: team === 0 ? 'Blue' : 'Red', kills: 0, deaths: 0 }));
    this.heroes = [];          // every hero in the match (Player objects, human and bot), Blue first
    this.clock = 0;            // seconds of battle so far (it starts when the first army marches)
    this.prepLeft = HERO.prep; // seconds until the first army marches (0 once it has)
    this.result = null;        // null while the match goes on; { winner: team | -1, reason: string } once it is decided
  }

  get killTarget() { return this.win === 'kills' ? HERO.killTarget : 0; }
  get timeLimit() { return this.win === 'timed' ? HERO.timeLimit : 0; }
  // seconds left in the timed mode (null in the others)
  get remaining() { return this.timeLimit ? Math.max(0, this.timeLimit - this.clock) : null; }

  // ---------------- called by Game ----------------
  // Once Game.start has built the factions: choose the two sides, make the heroes (the local player and the bots), put each
  // at their keep, switch the other two houses off.
  setup(setup) {}
  // Every frame the battle is simulated (single player or the host): respawns, the fountain, the clock, the win.
  update(dt) {}
  // A hero has fallen (Game.onPlayerKilled): count it, set the respawn timer.
  heroDown(victim, attacker) {}

  // ---------------- read by the HUD and the menus ----------------
  // One row per hero: { player, name, team, cls (class id), level, kills, deaths, alive, respawnIn (seconds, 0 when alive),
  // isBot, mine (the hero on this screen) }, Blue first.
  roster() { return []; }
}

export { HeroBot };
