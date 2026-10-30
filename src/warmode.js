// War Mode: one great battle, each army starting on a hill of its own (warmap.js), no castles. Two phases:
//   build   WAR.buildTime seconds (the "2-minute timer"; Ready ends it early when every lord is ready, as in the war modes): each lord spends WAR.gold on
//           an army in the War Mode shop (each type has its cost and its own cap, see WAR.units in config.js), picks a formation and a battle plan per group
//           (infantry, archers, cavalry). The soldiers appear in their places at once and nobody can be hurt.
//   fight   the plans are carried out and the armies fight to the end: the last side with anyone standing wins. The heroes fight too and do not rise
//           again; a lord's army fights on without them. The command bar (warui.js) gives orders in the fight: 1 / 2 / 3 / 4 pick infantry, archers,
//           cavalry or everyone, then Charge, Hold, Move forward or Follow me (command). A living hero earns XP.wave every WAR.xpEvery seconds of
//           battle, besides the experience of every kill, so talents (N) grow in the fight as in the war modes. A fight still going after
//           WAR.fightLimit seconds is decided on the worth of what each side has left.
// Online the host decides everything: a guest's purchases, formation and plans go to it as { a: 'war', ... } (netsync.js) and come back in the snapshots;
// AI generals command the houses nobody plays. With hundreds of soldiers the snapshot's unit list is packed into a short string (warnet.js).
// The HUD, the shop panel, the menu rows and the end screen section live in warui.js.
import * as THREE from 'three';
import { WAR, UNIT_TYPES, DIFFICULTY, FORMATIONS, clock } from './config.js';
import { XP } from './heroes.js';
import { Unit } from './units.js';
import { setSides, allied } from './teams.js';
import { FIELD, sideSpot, sanitizeWar, warSides } from './warmap.js';
export { sanitizeWar, warSides, warHills } from './warmap.js';   // (main.js and the lobby take them from here)
import { matchlog } from './matchlog.js';
import { highlights } from './highlights.js';
import { WarUI } from './warui.js';

export const WAR_TYPES = Object.keys(WAR.units);
export const isWarType = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(WAR.units, t);
export const WAR_GROUPS = ['inf', 'arch', 'cav'];
export const GROUP_LABEL = { inf: 'Infantry', arch: 'Archers', cav: 'Cavalry', all: 'Everyone' };
export const groupOf = (type) => { const k = UNIT_TYPES[type].kind; return k === 'archer' ? 'arch' : k === 'cavalry' ? 'cav' : 'inf'; };
const PRESETS = Object.keys(WAR.presets);
export const ORDERS = Object.keys(WAR.orders);
const DEFAULT_PLAN = { inf: 'charge', arch: 'hold', cav: 'charge' };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

// AI generals: how each likes to spend its gold (shares of the purse by type)
const STYLES = [
  { swordsman: 0.34, spearman: 0.18, archer: 0.2, longbowman: 0.05, knight: 0.09, horseman: 0.1, lancer: 0.04 },
  { swordsman: 0.42, spearman: 0.3, archer: 0.14, knight: 0.14 },
  { swordsman: 0.3, spearman: 0.1, archer: 0.32, longbowman: 0.16, knight: 0.12 },
  { swordsman: 0.3, spearman: 0.08, archer: 0.14, knight: 0.06, horseman: 0.3, lancer: 0.12 },
];

const tmpV = new THREE.Vector3();

export class WarMode {
  constructor(game, opts) {
    this.g = game;
    this.opts = sanitizeWar(opts);
    this.format = this.opts.format;
    this.fighting = false;
    this.clock = 0;           // seconds of fight
    this.result = null;       // { winner, reason, draw } once decided
    this.houses = [];         // the teams that take the field
    this.sideList = [];       // [[teams]] one entry per side
    this.cap = WAR.armyCap;   // soldiers a house may field
    this.countT = 0;
    this.aiT = 0;
    this.panelOpen = false;
    this.xpT = WAR.xpEvery;
    this.ui = new WarUI(this);
  }

  // ---------------- set-up (every screen: sides and places; the battle's own simulation also spawns the lords and the AI armies) ----------------
  setup(setup) {
    const g = this.g;
    const humans = setup.players.map((p) => p.team);
    // (a castle the lobby or the menu left empty sends no army: seats.js)
    const { houses, sides } = warSides(this.format, humans, [0, 1, 2, 3].filter((t) => !g.factions[t].empty), g.coop);
    this.houses = houses;
    this.sideList = sides;
    g.sides = sides.filter((s) => s.length > 1);
    setSides(g.sides);
    this.cap = Math.min(WAR.armyCap, Math.floor(WAR.totalCap / houses.length));
    for (const f of g.factions) {
      f.war = null;
      if (!houses.includes(f.team)) { f.eliminated = true; f.gold = 0; f.hero = null; continue; }
      const si = sides.findIndex((s) => s.includes(f.team)), side = sides[si];
      const spot = sideSpot(si, sides.length, side.indexOf(f.team), side.length);
      f.war = { side: si, spot, preset: 'line', plan: { ...DEFAULT_PLAN }, start: 0, worth: 0, pickUntil: 0 };
      // (an AI side with fewer houses than the biggest side, e.g. one general against three lords in co-op, gets more gold: it buys better soldiers)
      const outnumbered = Math.max(...sides.map((x) => x.length)) / side.length;
      f.gold = f.isPlayer ? WAR.gold : Math.round(WAR.gold * (DIFFICULTY[g.difficultyName] || DIFFICULTY.normal).aiGold * outnumbered);
      f.formation = 'line';
      f.troopCap = this.cap;
    }
    // the heroes stand in front of their army
    for (const h of g.humans) if (g.factions[h.team].war) this.respawn(h);
    g.round = 0;
    g.phase = 'prep';
    g.phaseT = WAR.buildTime;
    if (!g.simulating) return;
    for (const f of g.factions) {
      if (!f.war || f.isPlayer) continue;
      this.spawnLord(f);
      this.aiBuy(f);
    }
  }

  // put a hero at the front of their army (the start, and a guest whose host says it is alive again)
  respawn(p) {
    const f = this.g.factions[p.team];
    const s = f && f.war && f.war.spot;
    if (!s) return;
    const x = s.x + s.fx * 5, z = s.z + s.fz * 5;
    p.spawn(tmpV.set(x, this.g.physics.terrainHeight(x, z), z), s.yaw);
  }

  spawnLord(f) {
    const g = this.g, s = f.war.spot, t = UNIT_TYPES.lord, k = g.diff.enemyStat;
    const u = new Unit(g, 'lord', f.team, tmpV.set(s.x + s.fx * 4, 0, s.z + s.fz * 4), { name: f.lord, hp: Math.round(t.hp * k), dmg: t.dmg * k, armor: t.armor });
    u.yaw = s.yaw;
    u.army = true;
    this.holdAt(f, u, s.x + s.fx * 4, s.z + s.fz * 4, 0);
    g.units.push(u);
    f.hero = u;
    return u;
  }

  begin() { this.ui.begin(); }

  // ---------------- the army (the battle's own simulation decides; a guest asks it) ----------------
  armyOf(team) {
    const list = [];
    for (const u of this.g.units) if (u.alive && u.team === team && !u.isHero && !u.isCrew) list.push(u);
    return list;
  }
  counts(team) {
    const c = { total: 0 };
    for (const t of WAR_TYPES) c[t] = 0;
    for (const u of this.g.units) if (u.alive && u.team === team && !u.isHero && !u.isCrew && own(c, u.type)) { c[u.type]++; c.total++; }
    return c;
  }

  // why house f cannot have one more of `type` now, or null
  buyBlock(f, type, c = this.counts(f.team)) {
    if (this.fighting || !f.war) return 'The armies are set';
    const d = WAR.units[type];
    if (c[type] >= d.cap) return `${d.name}: ${d.cap} at most`;
    if (c.total >= this.cap) return `Your army is full (${this.cap})`;
    if (f.gold < d.cost) return 'Not enough gold';
    return null;
  }

  buy(team, type, n = 1) {
    const g = this.g, f = g.factions[team];
    if (!f || !isWarType(type)) return 0;
    n = Math.max(1, Math.min(50, Math.floor(Number(n) || 1)));
    const c = this.counts(team), d = WAR.units[type], T = UNIT_TYPES[type];
    const k = f.isPlayer ? 1 : g.diff.enemyStat;
    let made = 0;
    while (made < n && !this.buyBlock(f, type, c)) {
      const s = f.war.spot;
      const u = new Unit(g, type, team, tmpV.set(s.x - s.fx * 6, 0, s.z - s.fz * 6), { hp: Math.round(T.hp * k), dmg: T.dmg * k });
      u.army = true;
      u.yaw = s.yaw;
      u.bought = g.time + made * 0.001;
      g.units.push(u);
      f.gold -= d.cost; f.spent += d.cost;
      c[type]++; c.total++; made++;
    }
    if (made) this.layout(f, true);
    return made;
  }

  sell(team, type, n = 1) {
    const g = this.g, f = g.factions[team];
    if (!f || !f.war || this.fighting || !isWarType(type)) return 0;
    n = Math.max(1, Math.min(50, Math.floor(Number(n) || 1)));
    const list = this.armyOf(team).filter((u) => u.type === type).sort((a, b) => (b.bought || 0) - (a.bought || 0)).slice(0, n);
    for (const u of list) {
      u.remove();
      g.units.splice(g.units.indexOf(u), 1);
      f.gold += WAR.units[type].cost; f.spent -= WAR.units[type].cost;
    }
    if (list.length) this.layout(f);
    return list.length;
  }

  setPreset(team, id) {
    const f = this.g.factions[team];
    if (!f || !f.war || this.fighting || !own(WAR.presets, id)) return;
    f.war.preset = id;
    if (this.g.simulating) this.layout(f);
  }

  setPlan(team, group, order) {
    const f = this.g.factions[team];
    if (!f || !f.war || !WAR_GROUPS.includes(group) || !own(WAR.orders, order)) return;
    if (order === 'follow' && !f.isPlayer) return;
    f.war.plan[group] = order;
  }

  // the local lord's clicks in the shop and the command bar: done at once in the battle's own simulation, asked of the host by a guest (shown at once,
  // confirmed by the snapshots). quiet: no sound or toast (the Repeat button's many buys say it once)
  local(op, a, b, quiet = false) {
    const g = this.g, f = g.localFaction;
    if (!f || !f.war) return;
    if (op === 'cmd') { this.localCommand(a, b); return; }
    if (g.mode === 'client') {
      if (op === 'buy') {
        const d = WAR.units[a], c = this.counts(f.team), why = this.buyBlock(f, a, c);
        if (why) { if (!quiet) { g.audio.play('deny'); g.ui.toast(why); } return; }
        const n = Math.min(b, d.cap - c[a], this.cap - c.total, Math.floor(f.gold / d.cost));
        f.gold -= n * d.cost;
        f.war.goldUntil = g.time + 0.6;
      }
      if (op === 'preset') { f.war.preset = a; f.war.pickUntil = g.time + 1.5; }
      if (op === 'plan') { f.war.plan[a] = b; f.war.pickUntil = g.time + 1.5; }
      g.net.toHost({ a: 'war', op, t: a, n: b });
      if (!quiet) g.audio.play(op === 'buy' ? 'buy' : 'order');
      return;
    }
    if (op === 'buy') {
      const why = this.buyBlock(f, a);
      if (why) { if (!quiet) { g.audio.play('deny'); g.ui.toast(why); } return; }
      this.buy(f.team, a, b);
      if (!quiet) g.audio.play('buy');
    } else if (op === 'sell') { if (this.sell(f.team, a, b)) g.audio.play('order'); }
    else if (op === 'preset') { this.setPreset(f.team, a); g.audio.play('order'); }
    else if (op === 'plan') { this.setPlan(f.team, a, b); g.audio.play('order'); }
  }

  // a guest's request (netsync.js): nothing in it is trusted
  fromClient(p, d) {
    const f = this.g.factions[p.team];
    if (!f || !f.war || !d) return;
    if (d.op === 'buy' && isWarType(d.t)) { const why = this.buyBlock(f, d.t); if (why) p.notify(why); else this.buy(p.team, d.t, d.n); }
    else if (d.op === 'sell' && isWarType(d.t)) this.sell(p.team, d.t, d.n);
    else if (d.op === 'preset') this.setPreset(p.team, d.t);
    else if (d.op === 'plan' && WAR_GROUPS.includes(d.t)) this.setPlan(p.team, d.t, d.n);
    else if (d.op === 'cmd' && (d.t === 'all' || WAR_GROUPS.includes(d.t)) && own(WAR.orders, d.n)) this.command(p.team, d.t, d.n);
  }

  // ---------------- orders in the fight (the command bar: warui.js) ----------------
  // the local lord orders `group` ('inf', 'arch', 'cav' or 'all') to `order` (a key of WAR.orders)
  localCommand(group, order) {
    const g = this.g, f = g.localFaction;
    if (!this.fighting || !(group === 'all' || WAR_GROUPS.includes(group)) || !own(WAR.orders, order)) return;
    if (order === 'follow' && !(g.player && g.player.alive)) { g.audio.play('deny'); g.ui.toast('Your hero has fallen: nobody to follow'); return; }
    for (const k of group === 'all' ? WAR_GROUPS : [group]) f.war.plan[k] = order;   // (the bar shows it at once; a guest's host confirms it)
    f.war.pickUntil = g.time + 1.5;
    g.audio.play('order');
    if (g.mode === 'client') { g.net.toHost({ a: 'war', op: 'cmd', t: group, n: order }); return; }
    this.command(f.team, group, order);
  }

  // the battle's own simulation: carry an order out. Hold: stop and hold where they stand; Move forward: every soldier of the group steps WAR.forward
  // metres towards the nearest enemy army (the group keeps its shape) and holds there, facing it.
  command(team, group, order) {
    const g = this.g, f = g.factions[team];
    if (!f || !f.war || !this.fighting || !own(WAR.orders, order)) return;
    if (order === 'follow' && !(f.isPlayer && f.player && f.player.alive)) return;
    const groups = group === 'all' ? WAR_GROUPS : WAR_GROUPS.includes(group) ? [group] : null;
    if (!groups) return;
    const list = this.armyOf(team).filter((u) => groups.includes(u.isGiant ? 'inf' : groupOf(u.type)));
    for (const k of groups) f.war.plan[k] = order;
    if (!list.length) return;
    let dir = null;
    if (order === 'hold' || order === 'forward') {
      let x = 0, z = 0;
      for (const u of list) { x += u.pos.x; z += u.pos.z; }
      x /= list.length; z /= list.length;
      dir = this.towardsEnemy(team, x, z);
    }
    const yaw = dir ? Math.atan2(dir[0], dir[1]) : f.war.spot.yaw;
    const step = order === 'forward' ? WAR.forward : 0;
    list.forEach((u, i) => {
      if (order === 'charge') u.setOrder('charge');
      else if (order === 'follow') u.setOrder('follow');
      else this.holdAt(f, u, u.pos.x + dir[0] * step, u.pos.z + dir[1] * step, i, yaw);
    });
  }

  // the way from (x, z) to the middle of the nearest enemy army (its own facing if there is none) -> [dx, dz], unit length
  towardsEnemy(team, x, z) {
    let best = Infinity, bx = 0, bz = 0;
    for (const f of this.g.factions) {
      if (!f.war || f.eliminated || allied(f.team, team)) continue;
      let sx = 0, sz = 0, n = 0;
      for (const u of this.g.units) if (u.alive && u.team === f.team && !u.isCrew) { sx += u.pos.x; sz += u.pos.z; n++; }
      if (!n) continue;
      sx /= n; sz /= n;
      const d = Math.hypot(sx - x, sz - z);
      if (d < best) { best = d; bx = sx - x; bz = sz - z; }
    }
    const l = Math.hypot(bx, bz);
    if (l > 1e-3) return [bx / l, bz / l];
    const s = this.g.factions[team].war.spot;
    return [s.fx, s.fz];
  }

  // ---------------- formations ----------------
  // Places for house f's soldiers by its preset, in the army's own frame (x to the right, z forwards; the front rank at z = 0, the ranks behind it
  // going back towards the rim), then each soldier is told to hold its place. jump: soldiers just bought are put there at once.
  layout(f, jump = false) {
    const list = this.armyOf(f.team);
    const by = { inf: [], arch: [], cav: [], giant: [] };
    const rank = { knight: 0, spearman: 1, swordsman: 2, longbowman: 0, archer: 1, lancer: 0, horseman: 1 };
    for (const u of list) (u.isGiant ? by.giant : by[groupOf(u.type)]).push(u);
    for (const k of ['inf', 'arch', 'cav']) by[k].sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3) || a.id - b.id);
    const spots = new Map();
    // a block of n soldiers, cols wide, centred on x0 with its front rank at z0
    const block = (units, cols, sx, sz, x0, z0) => {
      const n = units.length;
      cols = Math.max(1, Math.min(cols, n));
      units.forEach((u, i) => {
        const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i % cols;
        spots.set(u, [x0 + (col - (inRow - 1) / 2) * sx, z0 - row * sz]);
      });
      return { w: cols * sx, d: Math.ceil(n / cols) * sz };
    };
    const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.ceil(v)));
    const I = [1.55, 1.8], A = [1.8, 2.0], C = [2.9, 3.6];
    const nI = by.inf.length, nA = by.arch.length, nC = by.cav.length;
    const preset = f.war.preset;
    let back = 0;
    if (preset === 'wedge') {
      // an arrowhead: row r holds 2r + 1 men
      let r = 0, j = 0;
      for (const u of by.inf) {
        spots.set(u, [(j - r) * I[0], -r * I[1] * 0.9]);
        if (++j > 2 * r) { r++; j = 0; }
      }
      const depth = (r + 1) * I[1] * 0.9;
      const a = block(by.arch, clampI(Math.sqrt(nA * 2.5), 6, 22), A[0], A[1], 0, -depth - 3);
      const half = Math.ceil(nC / 2);
      const c1 = block(by.cav.slice(0, half), clampI(half / 2, 2, 8), C[0], C[1], -(a.w / 2 + 8), -depth - 3);
      block(by.cav.slice(half), clampI(half / 2, 2, 8), C[0], C[1], a.w / 2 + 8, -depth - 3);
      back = depth + 3 + Math.max(a.d, c1.d);
    } else if (preset === 'archers') {
      const i = block(by.inf, clampI(Math.sqrt(nI * 2.2), 8, 22), I[0], I[1], 0, 0);
      const a = block(by.arch, clampI(nA / 2, 10, 50), A[0], A[1], 0, -i.d - 12);
      const c = block(by.cav, clampI(nC / 2, 4, 12), C[0], C[1], 0, -i.d - 12 - a.d - 4);
      back = i.d + 16 + a.d + c.d;
    } else {
      const i = block(by.inf, clampI(nI / 5, 12, 36), I[0], I[1], 0, 0);
      const a = block(by.arch, clampI(Math.max(i.w / A[0], nA / 3), 8, 40), A[0], A[1], 0, -i.d - 2.5);
      const half = Math.ceil(nC / 2);
      block(by.cav.slice(0, half), 3, C[0], C[1], -(Math.max(i.w, a.w) / 2 + 3 + C[0]), 0);
      block(by.cav.slice(half), 3, C[0], C[1], Math.max(i.w, a.w) / 2 + 3 + C[0], 0);
      back = i.d + 2.5 + a.d;
    }
    by.giant.forEach((u, i) => spots.set(u, [(i - (by.giant.length - 1) / 2) * 8, -back - 6]));
    const s = f.war.spot, rx = s.fz, rz = -s.fx;
    let slot = 0;
    for (const u of list) {
      const p = spots.get(u);
      if (!p) continue;
      const x = s.x + rx * p[0] + s.fx * p[1], z = s.z + rz * p[0] + s.fz * p[1];
      this.holdAt(f, u, x, z, slot++);
      if (jump && u.bought >= this.g.time - 0.5) { u.pos.set(x, this.g.physics.terrainHeight(x, z), z); u.mesh.position.copy(u.pos); }
    }
  }

  // tell u to hold the spot (x, z) facing the army's way. Units.think puts a holding soldier at an offset from the point it is given that depends
  // on its slot and the house's formation (FORMATIONS), so the point is moved back by that offset.
  // (yaw: the way to face, the army's own by default)
  holdAt(f, u, x, z, slot, yaw = f.war.spot.yaw) {
    const F = FORMATIONS[f.formation] || FORMATIONS.line;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const row = Math.floor(slot / F.cols), col = (slot % F.cols) - (F.cols - 1) / 2;
    const ox = fz * col * F.sx - fx * row * F.sz, oz = -fx * col * F.sx - fz * row * F.sz;
    u.slot = slot;
    const data = { pos: new THREE.Vector3(x - ox, 0, z - oz), yaw };
    u.setOrder('hold', data);
    u.orderData = data;
  }

  // ---------------- the battle's own simulation: every frame while the match is on (single player and the host) ----------------
  update(dt) {
    const g = this.g;
    if (this.result) return;
    if (!this.fighting) {
      g.phaseT -= dt;
      if (g.phaseT <= 0) this.startFight();
      return;
    }
    this.clock += dt;
    // a hero who lives through the battle grows with it, as one does through the waves of the war modes (the kills pay besides)
    this.xpT -= dt;
    if (this.xpT <= 0) { this.xpT = WAR.xpEvery; for (const h of g.humans) if (h.alive) h.gainXp(XP.wave, 'wave'); }
    this.aiT -= dt;
    if (this.aiT <= 0) { this.aiT = 1; this.generals(); }
    this.countT -= dt;
    if (this.countT <= 0) { this.countT = 0.5; this.checkSides(); }
    if (!this.result && this.clock >= WAR.fightLimit) this.timeUp();
  }

  startFight() {
    const g = this.g;
    this.fighting = true;
    this.clock = 0;
    g.round = 1;
    g.phase = 'wave';
    g.phaseT = 0;
    for (const f of g.factions) {
      if (!f.war) continue;
      const army = this.armyOf(f.team);
      f.war.start = army.length;
      f.war.worth = this.worth(f.team);
      matchlog.record('warArmy', { team: f.team, n: army.length });
      for (const u of army) this.applyPlan(f, u, f.war.plan[groupOf(u.type)]);
      for (const k of WAR_GROUPS) if (f.war.plan[k] === 'forward') this.command(f.team, k, 'forward');
      if (f.hero && !f.isPlayer && f.hero.alive) f.hero.setOrder('charge');   // (an AI lord leads from the front)
      if (!army.length && !(f.hero && f.hero.alive)) f.eliminated = true;
    }
    this.ui.fightBegan();
    g.audio.play('horn', g.camera.position);
    g.bannerAll('To battle!', 'The armies march. The last army standing wins: your hero fights too, and does not rise again. 1 / 2 / 3 / 4 choose infantry, archers, cavalry or everyone, then F1 charge · F2 hold · F3 move forward · F4 follow me.', 'The armies march. The last army standing wins.');
  }

  applyPlan(f, u, order) {
    if (order === 'charge') u.setOrder('charge');
    else if (order === 'follow' && f.player && f.player.alive) u.setOrder('follow');
    // hold: they keep the place they were given (move forward: startFight sends the whole group at once, so it keeps its shape)
  }

  // the AI generals: archers hold until the enemy is close or the fight has gone on a while, then everything charges; a house whose lord has left
  // (a guest who went) is led the same way
  generals() {
    const g = this.g;
    for (const f of g.factions) {
      if (!f.war || f.isPlayer || f.eliminated || f.war.allIn) continue;
      if (this.clock < 22 && !this.enemyWithin(f, 50)) continue;
      f.war.allIn = true;
      for (const u of this.armyOf(f.team)) if (u.order === 'hold') u.setOrder('charge');
    }
  }

  enemyWithin(f, r) {
    const s = f.war.spot;
    let near = false;
    for (const u of this.g.units) if (!near && u.alive && !allied(u.team, f.team) && Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < r) near = true;
    return near;
  }

  // soldiers alive, and whether the lord still stands
  standing(team) {
    const g = this.g, f = g.factions[team];
    let n = 0;
    for (const u of g.units) if (u.alive && u.team === team && !u.isHero && !u.isCrew) n++;
    const hero = f.isPlayer && f.player ? f.player.alive : !!(f.hero && f.hero.alive);
    return { n, hero };
  }

  checkSides() {
    const g = this.g;
    for (const f of g.factions) {
      if (!f.war || f.eliminated) continue;
      const s = this.standing(f.team);
      if (s.n || s.hero) continue;
      f.eliminated = true;
      g.announce((t) => (t === f.team ? 'Your army has fallen to the last man.' : `${f.name}'s army has been wiped out!`), f.team, f.team);
    }
    const left = this.sideList.filter((side) => side.some((t) => !g.factions[t].eliminated));
    if (left.length > 1) return;
    if (!left.length) { this.end(-1, 'Nobody is left standing: the battle ends in a draw.'); return; }
    const side = left[0], names = side.map((t) => g.factions[t].name);
    this.end(side[0], `${names.join(' and ')} ${side.length > 1 ? 'hold' : 'holds'} the field: the last army standing.`);
  }

  // what a house has left, in gold: soldiers at their price (by health) and the lord
  worth(team) {
    const g = this.g, f = g.factions[team];
    let w = 0;
    for (const u of g.units) if (u.alive && u.team === team && !u.isHero && !u.isCrew && own(WAR.units, u.type)) w += WAR.units[u.type].cost * Math.max(0.2, u.hp / u.maxHp);
    if (f.isPlayer && f.player ? f.player.alive : f.hero && f.hero.alive) w += 300;
    return Math.round(w);
  }

  timeUp() {
    const g = this.g;
    const score = this.sideList.map((side) => ({ side, w: side.reduce((a, t) => a + this.worth(t), 0) })).sort((a, b) => b.w - a.w);
    if (!score.length || (score[1] && Math.abs(score[0].w - score[1].w) < 30)) { this.end(-1, `Time is up after ${clock(WAR.fightLimit)} of battle, and the armies are even: a draw.`); return; }
    const names = score[0].side.map((t) => g.factions[t].name);
    this.end(score[0].side[0], `Time is up after ${clock(WAR.fightLimit)} of battle. ${names.join(' and ')} ${score[0].side.length > 1 ? 'have' : 'has'} the most left on the field.`);
  }

  end(winner, reason) {
    const g = this.g;
    if (this.result || g.state !== 'playing') return;
    this.result = { winner, reason, draw: winner < 0 };
    matchlog.record('warEnd', { winner });
    g.audio.play('horn', g.camera.position);
    g.quickEnd = true;
    if (g.mode === 'host' && g.sync) g.sync.sendEnd(winner, reason, highlights.candidates(undefined, 12), true);
    g.finish(winner, reason, { quick: true });
  }

  // a guest left: an AI general takes the house over (and finishes its purchases if the battle has not begun)
  dropHuman(f) {
    if (!f.war) return;
    f.war.plan = { ...DEFAULT_PLAN };
    if (!this.fighting && !f.eliminated) { this.spawnLord(f); this.aiBuy(f); }
    if (this.fighting) for (const u of this.armyOf(f.team)) u.setOrder('charge');
  }

  // an AI general's army: a style, a formation, the purse spent down to the last coins
  aiBuy(f) {
    const style = STYLES[Math.floor(Math.random() * STYLES.length)];
    f.war.preset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    if (f.gold > WAR.units.giant.cost * 3 && Math.random() < 0.35) this.buy(f.team, 'giant', 1);
    const purse = f.gold;
    for (const t of WAR_TYPES) if (style[t]) this.buy(f.team, t, Math.floor((purse * style[t]) / WAR.units[t].cost));
    for (const t of ['swordsman', 'spearman', 'archer']) while (!this.buyBlock(f, t)) this.buy(f.team, t, 50);
    f.war.plan = { inf: 'charge', arch: Math.random() < 0.7 ? 'hold' : 'charge', cav: 'charge' };
  }

  // ---------------- every screen ----------------
  handleInput(i) { this.ui.handleInput(i); }
  frame(dt) { this.ui.frame(dt); }
  camera(dt) { this.ui.camera(dt); }

  // ---------------- network ----------------
  // the host's word on the battle, in every snapshot: [fighting, clock, result winner, per house [preset, plan, start, eliminated]]
  netState() {
    const g = this.g;
    return [this.fighting ? 1 : 0, Math.round(this.clock), g.factions.map((f) => (f.war
      ? [PRESETS.indexOf(f.war.preset), WAR_GROUPS.map((k) => ORDERS.indexOf(f.war.plan[k])).join(''), f.war.start]
      : 0))];
  }

  applyNet(a) {
    const g = this.g;
    if (!Array.isArray(a)) return;
    if (a[0] && !this.fighting) { this.fighting = true; this.ui.fightBegan(); }
    this.clock = Number(a[1]) || 0;
    (a[2] || []).forEach((h, t) => {
      const f = g.factions[t];
      if (!f || !f.war || !Array.isArray(h)) return;
      f.war.start = h[2] || 0;
      if (t === g.localTeam && g.time < f.war.pickUntil) return;
      if (PRESETS[h[0]]) f.war.preset = PRESETS[h[0]];
      String(h[1] || '').split('').forEach((c, i) => { if (ORDERS[c]) f.war.plan[WAR_GROUPS[i]] = ORDERS[c]; });
    });
  }

  // the end screen's table: every house that took the field (warui.js draws it)
  table() {
    const g = this.g;
    return g.factions.filter((f) => f.war).map((f) => {
      const s = this.standing(f.team);
      return { team: f.team, name: f.name, lord: f.lord, side: f.war.side, start: f.war.start, left: s.n, hero: s.hero, kills: f.kills, mine: f.team === g.localTeam, won: this.result ? this.result.winner >= 0 && allied(f.team, this.result.winner) : false };
    });
  }

  get field() { return FIELD; }
}
