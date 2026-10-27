// Rival lord AI: spends gold, keeps the castle repaired, and now and then sends its whole garrison on a push.
// (The waves that march out of every castle are automatic; see Game.startWave.)
import { buy } from './economy.js';
import { TROOP_CAP } from './config.js';
import { allied } from './teams.js';

export class LordAI {
  constructor(game, faction) {
    this.g = game;
    this.f = faction;
    this.timer = 1 + Math.random() * 2;
    this.assault = null;    // { castle, since }
    this.cooldown = 60 + Math.random() * 60;
    this.personality = 0.7 + Math.random() * 0.6; // aggression
  }

  update(dt) {
    if (this.f.eliminated) return;
    this.cooldown -= dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    this.spend();
    this.war();
  }

  try(id) { return buy(this.g, this.f, id) === true; }

  // roughly "how many minutes into the war": waves come every half minute
  get stage() { return Math.floor(this.g.round / 2); }

  spend() {
    const g = this.g, f = this.f, c = f.castle;
    if (c.fallen) return;
    const stage = this.stage;
    if (!c.gate.alive || c.gate.hp < c.gate.maxHp * 0.45) this.try('repair_gate');
    if (c.keep.hp < c.keep.maxHp * 0.55) this.try('repair_keep');
    const breached = c.walls.some((w) => !w.alive);
    const weak = c.walls.some((w) => w.breakable && w.hp < w.maxHp * 0.4);
    if (breached || weak) this.try('repair_walls');

    // keep a reserve once the war starts so repairs stay affordable
    const reserve = stage >= 4 ? 150 : stage >= 2 ? 100 : 0;
    let guard = 0;
    while (g.garrisonCount(f.team) < f.troopCap && f.gold - reserve > 60 && guard++ < 6) {
      const r = Math.random();
      let type = r < 0.38 ? 'swordsman' : r < 0.62 ? 'spearman' : 'archer';
      if (f.gold > 450 && stage >= 4 && Math.random() < 0.3) type = 'knight';
      else if (f.gold > 300 && stage >= 3 && Math.random() < 0.22) type = 'horseman';
      else if (f.gold > 600 && stage >= 6 && Math.random() < 0.15) type = 'lancer';
      if (!this.try('recruit_' + type)) break;
    }
    if (g.garrisonCount(f.team) >= f.troopCap && f.troopCap < TROOP_CAP.max && f.gold > 400) this.try('barracks');
    // spare gold goes on engines to break the enemy gates, and on a giant when rich
    if (stage >= 1 && f.gold > 600 && g.siegeCount(f.team) < 2 && g.siegeTarget(f) && Math.random() < 0.5) this.try(Math.random() < 0.65 ? 'ram' : 'catapult');
    if (stage >= 3 && f.gold > 2200 && !g.hasGiant(f.team) && g.siegeTarget(f)) this.try('giant');
    if (f.gold > 220 && g.promotable(f.team).length) this.try('promote');
    if (f.gold > 400) {
      const opts = ['training', 'levies', 'training', 'levies', 'fortify_walls', 'reinforce_gate', 'towers'];
      this.try(opts[Math.floor(Math.random() * opts.length)]);
    }
  }

  // the bought troops that stay at home (wave soldiers march by themselves)
  troops() {
    return this.g.units.filter((u) => u.alive && u.team === this.f.team && !u.isHero && !u.isGiant && !u.isCrew && !u.crewOf && !u.lane);
  }

  war() {
    const g = this.g, f = this.f;
    const aggro = g.diff.aiAggro * this.personality;
    const stage = this.stage;
    if (stage < 4 - (aggro > 1.2 ? 1 : 0)) return;
    const troops = this.troops();

    // castle in danger: call everybody home
    if (this.assault && !f.castle.fallen && (f.castle.keep.hp < f.castle.keep.maxHp * 0.5 || !f.castle.gate.alive)) {
      this.recall(troops);
      return;
    }
    if (this.assault) {
      const a = this.assault;
      const attackers = troops.filter((u) => u.order === 'assault');
      if (a.castle.fallen) {
        // the push worked: with enough men left the army marches on to the next castle, otherwise it goes home
        const next = attackers.length >= 3 ? this.weakest() : null;
        if (next) { this.march(next, attackers); return; }
        this.recall(troops);
        this.cooldown = 20;
        return;
      }
      if (attackers.length < 3 || g.time - a.since > 240) {
        this.recall(troops);
        this.cooldown = 60 / aggro;
      }
      return;
    }
    if (this.cooldown > 0) return;
    if (troops.length < 8 + Math.floor(stage / 3)) return;

    const best = this.weakest();
    if (!best) return;
    const send = troops.filter((u) => u.kind === 'infantry' || u.kind === 'cavalry' || Math.random() < 0.5);
    this.march(best, send);
    if (f.hero && f.hero.alive && f.hero.setOrder && Math.random() < 0.6) f.hero.setOrder('assault', best);
    if (best.gate.alive && f.gold >= 450) this.try('ram');
    if (stage >= 3 && f.gold >= 800) this.try('catapult');
    if (stage >= 4 && f.gold >= 2000) this.try('giant');
    g.announce(`${f.name} marches on ${g.factions[best.team].name}!`, f.team, best.team);
  }

  // the weakest reachable castle, or null when every other house has fallen or is an ally
  weakest() {
    const g = this.g, f = this.f;
    let best = null, bestScore = Infinity;
    for (const c of g.castles) {
      if (c.fallen || allied(c.team, f.team)) continue;
      const enemyTroops = g.garrisonCount(c.team);
      const dist = Math.hypot(c.center.x - f.castle.center.x, c.center.z - f.castle.center.z);
      const score = enemyTroops * 25 + c.gate.hp / 20 + c.keep.hp / 40 + dist * 0.5 + Math.random() * 60;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // send these troops at a castle; the waves and the engines follow the push
  march(castle, units) {
    this.f.siegeTarget = castle;
    this.assault = { castle, since: this.g.time };
    for (const u of units) u.setOrder('assault', castle);
  }

  recall(troops) {
    for (const u of troops) if (u.order === 'assault') u.setOrder('defend');
    if (this.f.hero && this.f.hero.alive && this.f.hero.setOrder) this.f.hero.setOrder('defend');
    this.f.siegeTarget = null;   // back to the lane
    this.assault = null;
  }
}
