// Rival lord AI: spends gold, keeps the castle repaired, and now and then sends its army on a push.
// How the lord plays comes from his personality (src/rivals.js: a table of parameters, the key list is in its header); a house without one is the classic lord,
// whose numbers are the ones this file always had, drawn in the same order, so a classic match plays out as it did before the personalities.
// (The waves that march out of every castle are automatic; see Game.startWave. A personality also tunes the soldiers in them: Game.waveList.)
import { buy, SHOP_BY_ID } from './economy.js';
import { TROOP_CAP } from './config.js';
import { allied } from './teams.js';
import { CLASSIC, rivalInfo, pushLine } from './rivals.js';
import { matchlog } from './matchlog.js';

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
    this.saidAt = -99;
    this.pushes = 0;
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
    const goal = P.goals ? this.goal() : null;
    let floor = 0;
    if (goal) {
      if (f.gold >= goal.cost) this.try(goal.id);
      else floor = goal.cost;
    }
    const need = P.garrison ? Math.ceil(P.garrison[0] + stage * P.garrison[1]) : 0;

    // keep a reserve once the war starts so repairs stay affordable
    const reserve = stage >= 4 ? P.reserve[1] : stage >= 2 ? P.reserve[0] : 0;
    let guard = 0;
    while (g.garrisonCount(f.team) < f.troopCap && guard++ < P.recruitGuard) {
      const thin = need > 0 && g.garrisonCount(f.team) < need;   // (a thin guard is filled before anything is saved)
      if (!(f.gold - (thin ? reserve : Math.max(reserve, floor)) > P.recruitMin)) break;
      const r = Math.random();
      let type = r < P.mix[0] ? 'swordsman' : r < P.mix[1] ? 'spearman' : 'archer';
      for (const e of P.elites) {
        if (f.gold > e.gold && stage >= e.stage && Math.random() < e.p) { type = e.type; break; }
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
  // (`lv`), engines while he has fewer than `n` of that kind, the giant while none lives; a maxed upgrade or a closed shop item is skipped.
  goal() {
    const g = this.g, f = this.f;
    for (const e of this.P.goals) {
      const item = SHOP_BY_ID[e.id];
      if (!item) continue;
      if (e.lv !== undefined && !(LEVEL[e.id] && LEVEL[e.id](f) < e.lv)) continue;
      if (e.n !== undefined && this.engines(e.id) >= e.n) continue;
      if (item.can(g, f) !== true) continue;
      return { id: e.id, cost: Math.round(item.cost(g, f)) };
    }
    return null;
  }

  engines(type) {
    let n = 0;
    for (const s of this.g.siege) if (s.alive && !s.abandoned && s.team === this.f.team && s.type === type) n++;
    return n;
  }

  // a purchase the other houses should hear about (an engine or a giant bought by a lord who likes to say so), at most one every 25 seconds
  bought(id) {
    const v = this.P.verbs && this.P.verbs[id];
    const g = this.g, t = v && g.siegeTarget(this.f);
    if (!t || g.time - this.saidAt < 25) return;
    this.saidAt = g.time;
    g.announce(`${this.rival.name} ${v} ${g.factions[t.team].name}!`, this.f.team, t.team);
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
      const attackers = troops.filter((u) => u.order === P.order);
      if (a.castle.fallen) {
        // the push worked: with enough men left the army marches on to the next castle, otherwise it goes home
        const next = attackers.length >= 3 ? this.weakest() : null;
        if (next) { this.march(next, attackers); return; }
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
    if (troops.length < P.minTroops + Math.floor(stage / P.troopStep)) return;
    if (P.needEngines && stage < 8 && g.siegeCount(f.team) < P.needEngines) return;   // (the siege train goes first)

    const best = this.weakest();
    if (!best) return;
    if (P.pounce && stage < P.pounce.by && this.damage(best) < P.pounce.min) return;   // (nobody is broken yet: wait)
    const send = troops.filter((u) => P.sendKinds.includes(u.kind) || Math.random() < P.sendShare);
    if (this.rival && send.length < P.minAttackers) return;   // (a lord with a style does not march a handful)
    this.march(best, send);
    if (f.hero && f.hero.alive && f.hero.setOrder && Math.random() < P.hero) f.hero.setOrder('assault', best);
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
      if (c.fallen || allied(c.team, f.team)) continue;
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

  // send these troops at a castle; the waves and the engines follow the push (a raider leaves the waves on their lanes)
  march(castle, units) {
    if (this.P.redirect) this.f.siegeTarget = castle;
    this.assault = { castle, since: this.g.time };
    for (const u of units) u.setOrder(this.P.order, castle);
    this.pushes++;
    if (this.rival) matchlog.record('push', { team: this.f.team, target: castle.team, men: units.length });
  }

  recall(troops) {
    for (const u of troops) if (u.order === this.P.order) u.setOrder('defend');
    if (this.f.hero && this.f.hero.alive && this.f.hero.setOrder) this.f.hero.setOrder('defend');
    if (this.P.redirect) this.f.siegeTarget = null;   // back to the lane
    this.assault = null;
  }
}
