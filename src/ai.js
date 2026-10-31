// Rival lord AI: spends gold, keeps the castle repaired, and now and then sends its army on a push. A push (an assault) marches as a body: it musters
// before its own gate, halts on the way at a point or two (and once more out of the target's arrows) until the stragglers have caught up, then goes in
// together (lead below); the infantry in front, the archers behind them, the riders at the back, the lord with them when he goes.
// How the lord plays comes from his personality (src/rivals.js: a table of parameters, the key list is in its header); a house without one is the classic lord,
// whose numbers are the ones this file always had, drawn in the same order, so a classic match plays out as it did before the personalities.
// (The waves that march out of every castle are automatic; see Game.startWave. A personality also tunes the soldiers in them: Game.waveList.)
import * as THREE from 'three';
import { buy, SHOP_BY_ID } from './economy.js';
import { TROOP_CAP } from './config.js';
import { allied } from './teams.js';
import { CLASSIC, rivalInfo, pushLine } from './rivals.js';
import { matchlog } from './matchlog.js';

// metres from the target castle's middle where a push halts the last time before it goes in (out of reach of its walls' archers)
const MARCH_OFF = 78;

// how far each upgrade of the shop has come (the goals of a personality are "the walls up to level 2", "three levies", ...)
const LEVEL = {
  fortify_walls: (f) => f.castle.wallLevel,
  reinforce_gate: (f) => f.castle.gateLevel,
  towers: (f) => f.castle.towerLevel,
  levies: (f) => f.levies,
  training: (f) => f.training,
  barracks: (f) => (f.troopCap - TROOP_CAP.start) / TROOP_CAP.step,
};

export class LordAI {
  // rival: the personality (rivals.js rivalInfo) or null for the classic lord; left out, it is read from the match options for this house
  constructor(game, faction, rival) {
    this.g = game;
    this.f = faction;
    this.rival = (rival === undefined ? rivalInfo(game.options && game.options.rivals && game.options.rivals[faction.team]) : rival) || null;
    const P = this.P = this.rival ? this.rival.params : CLASSIC;
    this.timer = 1 + Math.random() * 2;
    this.assault = null;    // { castle, since }
    this.cooldown = P.cooldown[0] + Math.random() * P.cooldown[1];
    this.personality = P.jitter[0] + Math.random() * P.jitter[1]; // aggression
    this.taxed = 0;
    this.saidAt = game.time + 20;   // (nothing to announce in the first seconds: the match opens with its own banner and card)
    this.pushes = 0;
    this.goalAt = -999;           // when he last bought a piece of his plan
    this.engineNext = 'ram';      // the engine his plan buys next (they alternate)
  }

  update(dt) {
    if (this.f.eliminated) return;
    this.cooldown -= dt;
    if (this.P.tax) this.collect(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    if (this.f.castle.fallen) {
      if (!this.fell) { this.fell = true; matchlog.record('rivalFell', { team: this.f.team }); }
    } else if (this.P.lock) this.lock();
    this.spend();
    this.war();
  }

  try(id) {
    const ok = buy(this.g, this.f, id) === true;
    if (ok && this.rival) this.bought(id);
    return ok;
  }

  // roughly "how many minutes into the war": waves come every half minute
  get stage() { return Math.floor(this.g.round / 2); }

  // the lord's own tax: gold a second on top of the wage of the waves (scaled by the difficulty like every other income of the rival houses)
  collect(dt) {
    this.taxed += dt * this.P.tax * this.g.diff.aiGold;
    if (this.taxed < 1 || this.f.castle.fallen) return;
    const n = Math.floor(this.taxed);
    this.taxed -= n;
    this.f.gold += n;
    this.f.earned += n;
  }

  spend() {
    const g = this.g, f = this.f, c = f.castle, P = this.P;
    if (c.fallen) return;
    const stage = this.stage;
    if (!c.gate.alive || c.gate.hp < c.gate.maxHp * P.repair.gate) this.try('repair_gate');
    if (c.keep.hp < c.keep.maxHp * P.repair.keep) this.try('repair_keep');
    const breached = c.walls.some((w) => !w.alive);
    const weak = c.walls.some((w) => w.breakable && w.hp < w.maxHp * P.repair.walls);
    if (breached || weak) this.try('repair_walls');

    // a lord with a plan buys the next piece of it as soon as he can pay, keeps the guard the plan allows, and puts the rest of the gold aside for it
    const goal = P.goals && !(P.goalGap && g.time - this.goalAt < P.goalGap) ? this.goal() : null;
    let floor = 0;
    if (goal) {
      const gift = P.gifts && P.gifts[goal.id] ? Math.round(goal.cost * P.gifts[goal.id]) : 0;   // (his retinue, his masons, ... pay part of the price)
      if (f.gold + gift >= goal.cost) {
        f.gold += gift; f.earned += gift;
        if (this.try(goal.id)) {
          this.goalAt = g.time;
          if (goal.id === 'ram' || goal.id === 'catapult') this.engineNext = goal.id === 'ram' ? 'catapult' : 'ram';
        } else { f.gold -= gift; f.earned -= gift; floor = f.gold + 1; }   // (the shop wanted more than he thought, or said no: he keeps what he has)
      } else floor = goal.cost - gift;
    }
    const need = P.garrison ? Math.ceil(P.garrison * f.troopCap) : 0;

    // keep a reserve once the war starts so repairs stay affordable
    const reserve = stage >= 4 ? P.reserve[1] : stage >= 2 ? P.reserve[0] : 0;
    let guard = 0;
    while (g.garrisonCount(f.team) < f.troopCap && guard++ < P.recruitGuard) {
      const thin = need > 0 && g.garrisonCount(f.team) < need;   // (a thin guard is filled before anything is saved)
      if (!(f.gold - (thin ? reserve : Math.max(reserve, floor)) > P.recruitMin)) break;
      const r = Math.random();
      let type = r < P.mix[0] ? 'swordsman' : r < P.mix[1] ? 'spearman' : 'archer';
      if (!thin) {   // (filling a thin guard is done with the cheap soldiers: the elites wait for gold that is not saved for something)
        for (const e of P.elites) {
          if (f.gold > e.gold && stage >= e.stage && Math.random() < e.p) { type = e.type; break; }
        }
      }
      if (!this.try('recruit_' + type)) break;
    }
    if (g.garrisonCount(f.team) >= f.troopCap && f.troopCap < TROOP_CAP.max && f.gold - floor > P.barracks) this.try('barracks');
    // spare gold goes on engines to break the enemy gates, and on a giant when rich
    const S = P.siege;
    if (S && stage >= S.stage && f.gold - floor > S.gold && g.siegeCount(f.team) < S.max && g.siegeTarget(f) && Math.random() < S.p) this.try(Math.random() < S.ram ? 'ram' : 'catapult');
    const G = P.giant;
    if (G && stage >= G.stage && f.gold - floor > G.gold && !g.hasGiant(f.team) && g.siegeTarget(f)) this.try('giant');
    if (f.gold - floor > P.promote && g.promotable(f.team).length) this.try('promote');
    if (f.gold - floor > P.upgradeGold) {
      const opts = P.upgrades;
      this.try(opts[Math.floor(Math.random() * opts.length)]);
    }
  }

  // The next big thing this lord is saving for (personalities only): the first entry of his plan that is still open. Upgrades are open below their level
  // (`lv`), engines while he has fewer than `n` of that kind, the giant while none lives, and nothing before stage `from`; a maxed upgrade or a closed shop
  // item is skipped.
  goal() {
    const g = this.g, f = this.f, stage = this.stage;
    for (const e of this.P.goals) {
      if (e.from !== undefined && stage < e.from) continue;
      const id = e.id === 'engine' ? this.engineNext : e.id;   // ('engine': a ram, then a catapult, then a ram, ...)
      const item = SHOP_BY_ID[id];
      if (!item) continue;
      if (e.lv !== undefined && !(LEVEL[id] && LEVEL[id](f) < e.lv)) continue;
      if (e.n !== undefined && this.engines(e.id === 'engine' ? '' : id) >= e.n) continue;
      if (item.can(g, f) !== true) continue;
      return { id, cost: Math.round(item.cost(g, f)) };
    }
    return null;
  }

  // his engines on the road (of one kind, or all)
  engines(type) {
    let n = 0;
    for (const s of this.g.siege) if (s.alive && !s.abandoned && s.team === this.f.team && (!type || s.type === type)) n++;
    return n;
  }

  // a purchase the other houses should hear about (an engine he sends, a wall he raises, ... for a lord who likes to say so), at most one every 25 seconds
  bought(id) {
    const v = this.P.verbs && this.P.verbs[id];
    const g = this.g;
    if (!v || g.time - this.saidAt < 25) return;
    const engine = id === 'ram' || id === 'catapult';
    const t = engine ? g.siegeTarget(this.f) : null;   // (an engine is sent against somebody)
    if (engine && !t) return;
    this.saidAt = g.time;
    g.announce(`${this.rival.name} ${engine ? `${v} ${g.factions[t.team].name}` : v.replace('{house}', this.f.name)}!`, this.f.team, engine ? t.team : -99);
  }

  // the bought troops that stay at home (wave soldiers march by themselves)
  troops() {
    return this.g.units.filter((u) => u.alive && u.team === this.f.team && !u.isHero && !u.isGiant && !u.isCrew && !u.crewOf && !u.lane && !u.hillDuty);   // (the men on the hill stay there)
  }

  war() {
    const g = this.g, f = this.f, P = this.P;
    const aggro = g.diff.aiAggro * this.personality;
    const stage = this.stage;
    if (stage < P.warStage - (aggro > 1.2 ? P.rush : 0)) return;
    const troops = this.troops();

    // castle in danger: call everybody home
    if (this.assault && !f.castle.fallen && (f.castle.keep.hp < f.castle.keep.maxHp * P.recallKeep || (P.recallGate && !f.castle.gate.alive))) {
      this.recall(troops);
      // (and waits before he marches again: the plain lord used to march out at once and be called back again, a toast every three seconds while his
      // gate lay broken)
      this.cooldown = Math.max(this.cooldown, P.failWait / aggro);
      return;
    }
    // some lords come home as soon as a host stands before their walls, whatever the keep says
    if (P.defend && this.assault && this.threat() >= P.defend.at) {
      this.recall(troops);
      this.cooldown = Math.max(this.cooldown, P.defend.hold);
      return;
    }
    if (this.assault) {
      const a = this.assault;
      if (a.way && a.stage < a.way.length) { this.lead(); return; }   // (still on its way, formed up: lead)
      const attackers = troops.filter((u) => u.order === P.order);
      if (a.castle.fallen) {
        // the push worked: with enough men left the army marches on to the next castle, otherwise it goes home
        const next = attackers.length >= 3 ? this.weakest() : null;
        if (next) { this.march(next, attackers, a.lord && a.lord.alive && a.lord.order === 'assault' ? a.lord : null, true); return; }
        this.recall(troops);
        this.cooldown = P.winWait;
        return;
      }
      if (attackers.length < P.minAttackers || g.time - a.since > P.maxPush) {
        this.recall(troops);
        this.cooldown = P.failWait / aggro;
      }
      return;
    }
    if (this.cooldown > 0) return;
    if (!f.castle.fallen && (f.castle.keep.hp < f.castle.keep.maxHp * P.recallKeep || (P.recallGate && !f.castle.gate.alive))) return;   // (his own castle in danger: he would only be called back)
    if (troops.length < P.minTroops + Math.floor(stage / P.troopStep)) return;
    if (P.needEngines && stage < 8 && g.siegeCount(f.team) < P.needEngines) return;   // (the siege train goes first)

    const best = this.weakest();
    if (!best) return;
    if (P.pounce && stage < P.pounce.by && this.damage(best) < P.pounce.min) return;   // (nobody is broken yet: wait)
    const send = troops.filter((u) => P.sendKinds.includes(u.kind) || Math.random() < P.sendShare);
    if (this.rival && send.length < P.minAttackers) return;   // (a lord with a style does not march a handful)
    // (the lord goes with it, now and then: he marches in its front rank)
    this.march(best, send, f.hero && f.hero.alive && f.hero.setOrder && Math.random() < P.hero ? f.hero : null);
    const B = P.pushBuy;
    if (B.ram !== null && best.gate.alive && f.gold >= B.ram) this.try('ram');
    if (B.catapult && stage >= B.catapult[0] && f.gold >= B.catapult[1]) this.try('catapult');
    if (B.giant && stage >= B.giant[0] && f.gold >= B.giant[1]) this.try('giant');
    if (this.rival) g.announce(pushLine(this.rival, g.factions[best.team].name), f.team, best.team);
    else g.announce(`${f.name} marches on ${g.factions[best.team].name}!`, f.team, best.team);
  }

  // the weakest reachable castle, or null when every other house has fallen or is an ally
  weakest() {
    const g = this.g, f = this.f, A = this.P.aim;
    let best = null, bestScore = Infinity;
    for (const c of g.castles) {
      if (c.fallen || allied(c.team, f.team) || g.factions[c.team].eliminated) continue;   // (an empty castle is nobody's war)
      const enemyTroops = g.garrisonCount(c.team);
      const dist = Math.hypot(c.center.x - f.castle.center.x, c.center.z - f.castle.center.z);
      let score = enemyTroops * A.troops + c.gate.hp / A.gate + c.keep.hp / A.keep + dist * A.dist + Math.random() * A.noise;
      if (A.human && g.factions[c.team].isPlayer) score -= A.human;
      if (A.damaged) score -= A.damaged * this.damage(c);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // how battered a castle is: the keep's lost health, a gate that is down or hurt, and a quarter for every breach
  damage(c) {
    let d = 1 - c.keep.hp / c.keep.maxHp;
    d += c.gate.alive ? 1 - c.gate.hp / c.gate.maxHp : 1;
    for (const w of c.walls) if (!w.alive) d += 0.25;
    return d;
  }

  // foes standing before the walls of this lord's castle (soldiers count one, engines three)
  threat() {
    const g = this.g, c = this.f.castle.center;
    let n = 0;
    for (const u of g.units) {
      if (!u.alive || u.isCrew || allied(u.team, this.f.team)) continue;
      const dx = u.pos.x - c.x, dz = u.pos.z - c.z;
      if (dx * dx + dz * dz < 2500) n++;
    }
    for (const s of g.siege) {
      if (!s.alive || allied(s.team, this.f.team)) continue;
      const dx = s.pos.x - c.x, dz = s.pos.z - c.z;
      if (dx * dx + dz * dz < 3600) n += 3;
    }
    return n;
  }

  // A lord who has sworn vengeance points every army, engine and giant at the nearest human house (the waves follow `siegeTarget`).
  lock() {
    const g = this.g, f = this.f;
    let best = null, bd = Infinity;
    for (const c of g.castles) {
      if (c.fallen || !g.factions[c.team].isPlayer || allied(c.team, f.team)) continue;
      const d = Math.hypot(c.center.x - f.castle.center.x, c.center.z - f.castle.center.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && f.siegeTarget !== best) f.siegeTarget = best;
  }

  // send these troops at a castle; the waves and the engines follow the push (a raider leaves the waves on their lanes). An assault marches as a body
  // (its halts are `way`: lead); a raid (a charge) rides at once, and so does a push that has won and rolls on to the next castle (rolling: it is out in
  // the field already, a body that has just fought together, and does not walk home to muster).
  march(castle, units, lord = null, rolling = false) {
    if (this.P.redirect) this.f.siegeTarget = castle;
    this.assault = { castle, since: this.g.time, men: units.slice(), lord, way: null, stage: 0, stageT: this.g.time };
    const M = this.P.march;
    if (M && this.P.order === 'assault' && units.length >= 3 && !rolling) {
      this.assault.way = this.halts(castle);
      this.halt(0);
    } else {
      for (const u of units) u.setOrder(this.P.order, castle);
      if (lord) lord.setOrder('assault', castle);
    }
    this.pushes++;
    if (this.rival) matchlog.record('push', { team: this.f.team, target: castle.team, men: units.length });
  }

  // where a push halts on its way to `castle`: before its own gate, half way when the way is long, and out of reach of the target's walls (MARCH_OFF
  // metres from its middle, on the line from home), each { x, z, yaw } facing the target
  halts(castle) {
    const own = this.f.castle, go = own.gateOut, tc = castle.center;
    let dx = tc.x - go.x, dz = tc.z - go.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const yaw = Math.atan2(dx, dz);
    const muster = { x: go.x + dx * 14, z: go.z + dz * 14, yaw };
    const near = { x: tc.x - dx * MARCH_OFF, z: tc.z - dz * MARCH_OFF, yaw };
    const run = Math.hypot(near.x - muster.x, near.z - muster.z);
    if (run < 30) return [muster];
    const way = [muster];
    if (run > 110) way.push({ x: (muster.x + near.x) / 2, z: (muster.z + near.z) / 2, yaw });
    way.push(near);
    return way;
  }

  // the push forms up at halt i: a block facing the target, the infantry in front, the archers behind them, the riders at the back; the lord in the
  // middle of the front rank
  halt(i) {
    const a = this.assault, h = a.way[i], g = this.g;
    const rank = { infantry: 0, giant: 0, archer: 1, cavalry: 2 };
    const men = a.men.filter((u) => u.alive).sort((p, q) => (rank[p.kind] ?? 0) - (rank[q.kind] ?? 0));
    const cols = Math.max(4, Math.min(12, Math.ceil(Math.sqrt(men.length * 1.6))));
    const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), rx = fz, rz = -fx;
    men.forEach((u, j) => {
      const row = Math.floor(j / cols), col = (j % cols) - (Math.min(cols, men.length - row * cols) - 1) / 2;
      const sx = u.mounted ? 2.6 : 1.9, back = row * (u.mounted ? 2.8 : 2.0);
      const data = { pos: new THREE.Vector3(h.x + rx * col * sx - fx * back, 0, h.z + rz * col * sx - fz * back), yaw: h.yaw, exact: true };
      u.setOrder('hold', data); u.orderData = data;
    });
    if (a.lord && a.lord.alive) { const data = { pos: new THREE.Vector3(h.x + fx * 2, 0, h.z + fz * 2), yaw: h.yaw, exact: true }; a.lord.setOrder('hold', data); a.lord.orderData = data; }
    a.stage = i; a.stageT = g.time;
  }

  // a push on its way: at each halt it waits until most of it stands in its place (P.march.share), or P.march.wait seconds, and not while it is in a
  // fight there (an enemy band met on the way is fought where the push stands: the archers shoot, the infantry holds); then on to the next, and from
  // the last one the assault goes in, all together
  lead() {
    const a = this.assault, M = this.P.march, g = this.g;
    const men = a.men.filter((u) => u.alive && u.order === 'hold');
    if (men.length < this.P.minAttackers) { this.recall(this.troops()); this.cooldown = this.P.failWait / Math.max(0.5, g.diff.aiAggro * this.personality); return; }
    let ready = 0, fight = 0;
    for (const u of men) {
      const d = u.orderData && u.orderData.pos;
      if (d && Math.hypot(d.x - u.pos.x, d.z - u.pos.z) < 6) ready++;
      if (u.target && u.target.alive && !u.target.isStructure && u.distTo(u.target) < (u.ranged ? u.range : 8)) fight++;
    }
    const waited = g.time - a.stageT;
    if (fight > men.length * 0.15 && waited < M.wait * 3) return;
    if (ready < men.length * M.share && waited < M.wait) return;
    if (a.stage + 1 < a.way.length) { this.halt(a.stage + 1); return; }
    // the last halt: the assault goes in together (the push's time is counted from here)
    a.stage = a.way.length;
    a.since = g.time;
    for (const u of men) u.setOrder(this.P.order, a.castle);
    if (a.lord && a.lord.alive) a.lord.setOrder('assault', a.castle);
  }

  recall(troops) {
    const a = this.assault;
    for (const u of troops) if (u.order === this.P.order || (a && a.men && u.order === 'hold' && a.men.includes(u))) u.setOrder('defend');
    if (this.f.hero && this.f.hero.alive && this.f.hero.setOrder) this.f.hero.setOrder('defend');
    if (this.P.redirect) this.f.siegeTarget = null;   // back to the lane
    this.assault = null;
  }
}
