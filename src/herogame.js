// Hero Game Mode: two sides of heroes (2, 3 or 4 a side: 2v2, 3v3, 4v4) fought out of one castle each. Nobody commands an army or buys anything: a player controls
// only their hero (and the hero's talents). The armies march out of both castles by themselves, round after round tougher,
// until one side wins. Three ways to win, chosen before the match:
//   kills   the first side to 25 hero kills (a castle that falls still ends the match)
//   castle  destroy the enemy keep (hero kills only decide who is ahead)
//   timed   twenty minutes of battle: the side with more hero kills wins (a castle that falls still ends the match early)
// The side of castle 1 (team 0) fights the side of castle 2 (team 1); each side is named after its colour (teams.js). The other two castles stand empty.
// Online the host runs the rules (this file, and a HeroBot in every seat nobody plays); a guest's HeroMode is a mirror (opts.mirror): it keeps the
// same fields for the HUD, filled from the host's snapshots (netsync.js), and decides nothing.
//
// This file is the contract between the parts that build the mode:
//   herogame.js  (the rules: who is on which side, respawns, the kill count, the waves, the win)  fills in HeroMode
//   herobot.js   (the AI that plays the heroes nobody is playing)                                 fills in HeroBot
//   the HUD, the menu and the controls (index.html, ui.js, main.js) read HeroMode through the fields listed below.
// A hero is a Player. A bot hero is a Player with `isBot = true` and `bot = HeroBot` (it is simulated where the battle is
// run, like every hero but the one on this screen).
import { HeroBot } from './herobot.js';
import { Player, HORSE } from './player.js';
import { PLAYER, TROOP_CAP } from './config.js';
import { CLASS_IDS } from './classes.js';
import { killXp } from './heroes.js';
import { colorName } from './teams.js';
import { heroSize, sideOfSeat, placeOfSeat, seatInUse } from './seats.js';

export const HERO = {
  perSide: 3,                      // heroes a side when nothing else is said (the menu and the lobby choose 2, 3 or 4: seats.js)
  killTarget: 25,
  timeLimit: 20 * 60,              // seconds of battle in the timed mode
  prep: 30,                        // seconds before the first army marches
  hardCap: 30 * 60,                // no match runs longer than this many seconds of battle (kills and castle modes): it is then decided as the timed mode is (0 = no limit)
  respawnBase: 8, respawnPerDeath: 3, respawnMax: 24,   // a fallen hero rises at their keep after this many seconds
  protect: 2,                      // seconds a hero who has just risen cannot be hurt
  fountain: { radius: 16, heal: 0.08 },                 // within this many metres of your own keep you mend this share of your health a second
  xpMult: 1.5,                     // experience comes quicker than in the war modes (the match is short)
  waveGrowth: 0.06,                // soldiers get this much tougher with every round (WAVES.growth in the war modes)
  siegeGrowth: 0.06,               // and hit gates, walls and keeps this much harder (WAVES.siegeGrowth in the war modes)
  // What the war modes sell in the shop, handed to both houses alike as the rounds go by: from round `from`, one more step
  // every `every` rounds, up to `max` steps. training: +15% soldier health and damage a step (the shop stops at 5);
  // levies: an elite in every wave (a knight, then a rider, then a lancer); barracks: +6 on the troop cap and one more
  // soldier in every wave. Rams and catapults come as they do in the war modes. By round 20 (ten minutes) a soldier has
  // about 3.4 times the health and damage of a round-one soldier, and a wave is five times as big (4 soldiers, then 20).
  escalate: {
    training: { from: 5, every: 5, max: 8 },
    levies: { from: 8, every: 6, max: 3 },
    barracks: { from: 6, every: 6, max: 4 },
  },
  slots: [-3.2, 0, 3.2], slotZ: 3.4,   // where the three heroes of a side stand and rise in the courtyard (castle-local x, z); the local hero takes the middle
  slotsBySize: { 2: [-1.8, 1.8], 3: [-3.2, 0, 3.2], 4: [-4.8, -1.6, 1.6, 4.8] },   // the same for two, three and four a side
  milestone: 5,                    // a toast at every 5th hero kill of a side
  keepTie: 0.005,                  // timed mode: keeps within this share of their health count as equal
  modes: {
    kills: { name: 'Hero kills', short: 'First to 25', desc: 'The first side to 25 hero kills wins. A keep that falls ends the match too.' },
    castle: { name: 'Castle', short: 'Destroy the keep', desc: 'Destroy the enemy keep. Hero kills only count for the scoreboard.' },
    timed: { name: 'Timed', short: '20 minutes', desc: 'Twenty minutes of battle: the side with more hero kills wins, then the stronger keep. A keep that falls ends it early.' },
  },
};
export const HERO_MODE_IDS = Object.keys(HERO.modes);

// how many steps of an escalation a round has reached
export const escalationTier = (spec, round) => (round < spec.from ? 0 : Math.min(spec.max, 1 + Math.floor((round - spec.from) / spec.every)));

// what each class does for its side, so a trio of bots always has a front line and a ranged hero
const ROLE = { knight: 'front', berserker: 'front', cavalier: 'front', ranger: 'ranged', mage: 'ranged', cleric: 'support' };
const BOT_NAMES = [
  ['Aldric', 'Mira', 'Corin', 'Elsbeth', 'Tobias'],         // the first side's
  ['Garrick', 'Isolde', 'Brannoch', 'Sable', 'Varric'],     // the second side's
];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);

export class HeroMode {
  // opts: { win: 'kills' | 'castle' | 'timed', size?: 2 | 3 | 4 (heroes a side), seats?: per seat 'open' | 'ai' | 'empty' (seats.js; who sits where
  // comes with the players, each with its seat `hs`), mirror?: true on a guest, classes?: { 0: [classes], 1: [classes] } (the bots' classes, for tests) }
  constructor(game, opts = {}) {
    this.g = game;
    this.opts = opts;
    this.mirror = !!opts.mirror;
    this.win = HERO.modes[opts.win] ? opts.win : 'kills';
    this.size = heroSize(opts.size);
    // the two sides: team ids are the castle numbers (0 = the first castle, 1 = the second), named after their colours
    this.sides = [0, 1].map((team) => ({ team, name: colorName(team), kills: 0, deaths: 0 }));
    this.heroes = [];          // every hero in the match (Player objects, human and bot): the one on this screen first, then its side, then the other (order)
    this.clock = 0;            // seconds of battle so far (it starts when the first army marches)
    this.prepLeft = HERO.prep; // seconds until the first army marches (0 once it has)
    this.result = null;        // null while the match goes on; { winner: team | -1, reason: string, draw: boolean } once it is decided
    this.tiers = { training: 0, levies: 0, barracks: 0 };   // how far the escalation has gone
    this.warned = false;       // has the hard cap been announced
  }

  get killTarget() { return this.win === 'kills' ? HERO.killTarget : 0; }
  get timeLimit() { return this.win === 'timed' ? HERO.timeLimit : 0; }
  // seconds left in the timed mode (null in the others)
  get remaining() { return this.timeLimit ? Math.max(0, this.timeLimit - this.clock) : null; }
  get xpMult() { return HERO.xpMult; }          // (Player.gainXp)

  // ---------------- called by Game ----------------
  // Once Game.start has built the factions: seat the heroes (the people at their seats, a bot in every other seat that is not left empty), put each
  // at their keep, switch the other two houses off.
  setup(setup) {
    const g = this.g, local = g.player, size = this.size;
    // each person's seat (`hs` of the setup's players: seats.js). A seat that is missing or taken twice becomes the first free one, the middle of
    // the player's own side first (a single player without a seat stands in the middle of side 0, as before seats).
    const people = [];
    for (const sp of setup.players || []) {
      const h = sp.me || setup.players.length === 1 ? local : g.humans.find((x) => x !== local && x.netId != null && x.netId === sp.netId);
      if (h && !people.some((e) => e.h === h)) people.push({ h, seat: seatInUse(sp.hs, size) ? sp.hs : -1 });
    }
    if (!people.some((e) => e.h === local)) people.unshift({ h: local, seat: -1 });
    const places = (side) => [...Array(size).keys()].map((i) => side * 4 + i);
    for (const e of people) {
      if (e.seat >= 0 && people.filter((o) => o.seat === e.seat).length === 1) continue;
      const side = e.h.team === 1 ? 1 : 0;
      e.seat = -1;
      e.seat = [side * 4 + Math.floor((size - 1) / 2), ...places(side), ...places(1 - side)].find((s) => !people.some((o) => o !== e && o.seat === s));
    }
    for (const e of people) { e.h.team = sideOfSeat(e.seat); e.h.heroSlot = placeOfSeat(e.seat); e.h.hid = e.seat; }
    this.heroes = people.map((e) => e.h);
    if (this.mirror) { this.seatSides(); return; }   // (a guest: the host's snapshots bring the other heroes)
    const states = Array.isArray(this.opts.seats) ? this.opts.seats : [];
    const want = this.opts.classes || {};
    for (const team of [0, 1]) {
      const free = places(team).filter((s) => !people.some((e) => e.seat === s) && states[s] !== 'empty');
      const have = people.filter((e) => e.h.team === team).map((e) => e.h.classId);
      const classes = (want[team] || this.mix(have, free.length)).slice(0, free.length).map((c) => (CLASS_IDS.includes(c) ? c : 'knight'));
      while (classes.length < free.length) classes.push(this.mix(have.concat(classes), 1)[0]);
      const names = shuffled(BOT_NAMES[team]);
      free.forEach((seat, i) => {
        const p = new Player(g, null, { remote: true, team, name: names[i], cls: classes[i] });
        p.isBot = true;
        p.bot = new HeroBot(g, p, { enemyTeam: 1 - team });
        p.heroSlot = placeOfSeat(seat);
        p.hid = seat;
        g.humans.push(p);
        this.heroes.push(p);
      });
    }
    this.order();
    this.seatSides();
    for (const p of this.heroes) {
      p.spawn(this.slotPos(p), g.castles[p.team].rot);
      if (p.bot) this.guard(p, (b) => b.reset());
    }
    g.phase = 'prep';
    g.phaseT = HERO.prep;
    this.prepLeft = HERO.prep;
  }

  // The two houses are the two sides (led, for the HUD's sake, by the hero on this screen or the side's first); the other two are switched off: no waves, no lords, no income
  // (their castles stand empty).
  seatSides() {
    const g = this.g;
    for (const team of [0, 1]) {
      const f = g.factions[team], lead = (g.player.team === team ? g.player : this.heroes.find((h) => h.team === team)) || null;   // (this screen's hero leads its own side)
      f.isPlayer = true; f.player = lead; f.hero = lead; f.lord = lead ? lead.name : this.sides[team].name; f.name = this.sides[team].name;
      f.gold = 0; f.respawnT = 0; f.heroDeaths = 0;
    }
    for (const f of g.factions.slice(2)) { f.eliminated = true; f.gold = 0; f.hero = null; f.player = null; f.isPlayer = false; }
  }

  // the hero on this screen first, then its side by seat, then the other side
  order() {
    const me = this.g.player, mine = (p) => (p.team === me.team ? 0 : 1);
    this.heroes.sort((a, b) => (b === me) - (a === me) || mine(a) - mine(b) || a.hid - b.hid);
  }

  // A guest's mirror: a hero the host's snapshots have brought (netsync.js) joins the roster.
  adopt(p) {
    if (this.heroes.includes(p)) return;
    this.heroes.push(p);
    this.order();
    const f = this.g.factions[p.team];
    if (f && !f.player) { f.player = f.hero = p; f.lord = p.name; }
  }

  // Online: a person left the match (Game.dropHuman). A hero bot takes their hero over where it stands, so the sides stay as they were.
  toBot(p) {
    const g = this.g;
    if (!this.heroes.includes(p) || p.isBot) return;
    if (p.drive) g.leaveEngine(p);
    const name = p.name;
    p.netId = null;
    p.isBot = true;
    p.bot = new HeroBot(g, p, { enemyTeam: 1 - p.team });
    if (p.alive) this.guard(p, (b) => b.reset());
    g.announce(`${name} left. A hero bot fights on in their place.`, p.team);
  }

  // Every frame the battle is simulated (single player or the host): respawns, the fountain, the clock, the win.
  update(dt) {
    const g = this.g;
    if (this.result) return;
    if (g.round === 0) this.prepLeft = Math.max(0, g.phaseT);
    else { this.prepLeft = 0; this.clock += dt; }
    for (const p of this.heroes) {
      if (this.result) break;   // (a bot's blow can end the match in the middle of the round)
      if (p.alive) {
        this.fountain(p, dt);
        if (p.bot) this.guard(p, (b) => b.update(dt));
      } else {
        p.respawnT = (p.respawnT || 0) - dt;
        if (p.respawnT <= 0) this.rise(p);
      }
    }
    // the "Respawning in N s" overlay reads the house's timer
    g.factions[g.player.team].respawnT = g.player.alive ? 0 : Math.max(0, g.player.respawnT || 0);
    const limit = this.timeLimit || HERO.hardCap;
    if (limit && this.clock >= limit) this.timeUp();
    else if (limit && !this.timeLimit && !this.warned && this.clock >= limit - 300) {
      this.warned = true;
      g.announce('The battle has run long: in five minutes it is decided on hero kills, then the stronger keep.', -1, 'all');
    }
  }

  // A hero has fallen (Game.onPlayerKilled): count it, set the respawn timer.
  heroDown(victim, attacker) {
    const g = this.g;
    if (this.result || g.state !== 'playing') return;   // once the match is decided nothing counts
    const vs = this.sides[victim.team];
    if (!vs) return;
    const by = attacker && attacker.team !== undefined ? attacker.team : -1;
    const foe = by >= 0 && by <= 1 && by !== victim.team;
    // an engine's kill goes to the hero who was steering it
    const killer = foe ? (attacker.isPlayer ? attacker : attacker.driver && attacker.driver.isPlayer ? attacker.driver : null) : null;
    vs.deaths++;
    g.factions[victim.team].heroDeaths = vs.deaths;
    victim.respawnT = this.respawnTime(victim);
    if (victim === g.player) g.factions[victim.team].respawnT = victim.respawnT;
    const ks = foe ? this.sides[by] : null;
    const first = foe && this.sides[0].kills + this.sides[1].kills === 0;
    if (ks) {
      ks.kills++;
      if (killer) { killer.heroKills = (killer.heroKills || 0) + 1; killer.kills = (killer.kills || 0) + 1; }
      g.heroXp(attacker, killXp(victim), victim.pos);
    }
    g.killFeed(attacker, victim);
    g.audio.play('death', victim.pos);
    if (!ks) return;
    if (first) g.announce(`First blood! ${this.byWhom(attacker, killer, ks)} brings down ${victim.name}.`, by, 'all');
    else if (ks.kills % HERO.milestone === 0 && ks.kills !== this.killTarget) g.announce(`${ks.name} has ${ks.kills} hero kills (${vs.name} ${vs.kills}).`, by, 'all');
    if (this.win === 'kills') {
      if (ks.kills >= HERO.killTarget) this.finish(by, `${ks.name} reached ${HERO.killTarget} hero kills first (${ks.kills} to ${vs.kills}).`);
      else if (ks.kills === HERO.killTarget - 1) g.announce(`${ks.name} is one hero kill from victory!`, by, 'all');
    }
  }

  // ---------------- read by the HUD and the menus ----------------
  // One row per hero: { player, name, team, cls (class id), level, kills (heroes brought down), deaths, alive, respawnIn (seconds,
  // 0 when alive), isBot, mine (the hero on this screen) }: the hero on this screen first, then its side, then the other.
  roster() {
    return this.heroes.map((p) => ({
      player: p, name: p.name, team: p.team, cls: p.classId, level: p.level, kills: p.heroKills || 0, deaths: p.deaths,
      alive: p.alive, respawnIn: p.alive ? 0 : Math.max(0, p.respawnT || 0), isBot: !!p.isBot, mine: p === this.g.player,
    }));
  }

  // Is this hero standing in their keep's fountain?
  atFountain(p) {
    const k = this.g.castles[p.team].keep.pos;
    return p.alive && Math.hypot(p.pos.x - k.x, p.pos.z - k.z) < HERO.fountain.radius;
  }

  // ---------------- rules ----------------
  // seconds a fallen hero waits: longer with every death (p.deaths already counts this one)
  respawnTime(p) {
    return Math.min(HERO.respawnMax, HERO.respawnBase + HERO.respawnPerDeath * Math.max(0, p.deaths - 1));
  }

  // where a hero stands when the match begins and when they rise again
  slotPos(p) {
    return this.g.castles[p.team].toWorld((HERO.slotsBySize[this.size] || HERO.slots)[p.heroSlot] ?? 0, HERO.slotZ);
  }

  rise(p) {
    const g = this.g;
    p.respawnT = 0;
    p.spawn(this.slotPos(p), g.castles[p.team].rot);
    p.buffs.add('ghost', HERO.protect);
    if (p.bot) this.guard(p, (b) => b.reset());
    if (p === g.player) p.notify('You rise again at your keep.');
  }

  // Near their own keep a hero mends quickly and is resupplied (arrows, stamina, a healing draught).
  fountain(p, dt) {
    if (!this.atFountain(p)) return;
    const f = HERO.fountain;
    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * f.heal * dt);
    if (p.hasHorse && p.horseHp > 0 && p.horseHp < HORSE.hp) p.horseHp = Math.min(HORSE.hp, p.horseHp + HORSE.hp * f.heal * dt);
    p.stamina = 100;
    p.arrows = Math.max(p.arrows, PLAYER.maxArrows);
    p.potions = Math.max(p.potions, 1);   // (there is no shop: a spent healing draught is replaced at the keep)
  }

  // Game.startWave calls this as a round begins: both houses get the same upgrades, so the soldiers (and with them the
  // match) grow harder without anybody buying anything.
  escalate(round) {
    const g = this.g, e = HERO.escalate;
    const tr = escalationTier(e.training, round), lv = escalationTier(e.levies, round), br = escalationTier(e.barracks, round);
    const said = [];
    for (const f of g.factions.slice(0, 2)) {
      while (f.training < tr) { f.training++; g.applyTraining(f); }   // (the soldiers already marching get tougher too)
      f.levies = lv;
      f.troopCap = TROOP_CAP.start + TROOP_CAP.step * br;
    }
    if (tr > this.tiers.training) said.push('Drill sergeants harden both armies: soldiers hit harder and last longer.');
    if (lv > this.tiers.levies) said.push(`Elite levies join the armies: every wave now carries ${['a knight', 'a cavalry rider', 'a lancer'][lv - 1]}.`);
    if (br > this.tiers.barracks) said.push('Both barracks grow: larger armies march out.');
    this.tiers = { training: tr, levies: lv, barracks: br };
    for (const t of said) g.announce(t);
  }

  // The keep the soldiers of a house march on (Game.siegeTarget): the other side's, nobody else's.
  target(f) {
    const c = this.g.castles[f.team === 0 ? 1 : 0];
    return c && !c.fallen ? c : null;
  }

  // Game.onCastleFallen: a fallen keep ends the match at once, in every mode.
  keepFell(castle) {
    if (this.result || castle.team > 1) return;
    const lost = this.sides[castle.team], won = this.sides[1 - castle.team];
    this.finish(won.team, `${lost.name}'s keep has fallen: ${won.name} wins (hero kills ${won.kills} to ${lost.kills}).`);
  }

  // The timed mode: more hero kills wins, then the stronger keep, otherwise it is a draw.
  timeUp() {
    const [a, b] = this.sides;
    const head = this.timeLimit ? 'Time is up' : `The battle has run its ${Math.round(HERO.hardCap / 60)} minutes`;
    if (a.kills !== b.kills) {
      const w = a.kills > b.kills ? a : b, l = w === a ? b : a;
      return this.finish(w.team, `${head}: ${w.name} wins with more hero kills (${w.kills} to ${l.kills}).`);
    }
    const ka = this.keepShare(0), kb = this.keepShare(1);
    const pct = (x) => `${Math.round(x * 100)}%`;
    if (Math.abs(ka - kb) > HERO.keepTie) {
      const w = ka > kb ? a : b;
      return this.finish(w.team, `${head}: hero kills are level at ${a.kills} each, and ${w.name}'s keep is stronger (${pct(Math.max(ka, kb))} to ${pct(Math.min(ka, kb))}).`);
    }
    this.finish(-1, `${head}: hero kills are level at ${a.kills} each and both keeps hold equally. A draw.`);
  }

  keepShare(team) {
    const k = this.g.castles[team].keep;
    return Math.max(0, k.hp) / k.maxHp;
  }

  finish(winner, reason) {
    if (this.result) return;
    this.result = { winner, reason, draw: winner < 0 };
    this.g.endGame(winner, reason);
  }

  // a bot has reached a new level (Game.onHeroLevel)
  spendTalents(p) { this.guard(p, (b) => b.spendTalents()); }

  // ---------------- helpers ----------------
  // Whoever did it, for the toast: a hero by name, otherwise the side.
  byWhom(attacker, killer, side) {
    if (killer) return killer.name;
    return attacker && attacker.isSiege ? `${side.name}'s siege engine` : `${side.name}'s army`;
  }

  // n more classes for a side that has `have` already: all different, with a front-line and a ranged hero among them
  mix(have, n) {
    const all = [...have], out = [];
    while (out.length < n) {
      const roles = new Set(all.map((c) => ROLE[c]));
      const missing = ['front', 'ranged'].filter((r) => !roles.has(r));
      let pool = CLASS_IDS.filter((c) => !all.includes(c) && (!missing.length || missing.includes(ROLE[c])));
      if (!pool.length) pool = CLASS_IDS.filter((c) => !all.includes(c));
      const c = pickOne(pool.length ? pool : CLASS_IDS);
      out.push(c); all.push(c);
    }
    return out;
  }

  // A fault in one bot must not stop the match: it is reported once and that bot stands idle from then on.
  guard(p, fn) {
    if (!p.bot || p.botBroken) return;
    try { fn(p.bot); } catch (e) { p.botBroken = true; console.error('HeroBot ' + p.name, e); }
  }
}

export { HeroBot };
