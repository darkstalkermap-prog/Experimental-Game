// Rival lord AI: spends gold, keeps the castle repaired and launches assaults on other castles.
import { buy } from './economy.js';
import { ROUNDS, TROOP_CAP } from './config.js';

export class LordAI {
  constructor(game, faction) {
    this.g = game;
    this.f = faction;
    this.timer = 1 + Math.random() * 2;
    this.assault = null;    // { castle, since }
    this.cooldown = 30 + Math.random() * 30;
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

  spend() {
    const g = this.g, f = this.f, c = f.castle;
    if (c.fallen) return;
    const round = g.round;
    if (!c.gate.alive || c.gate.hp < c.gate.maxHp * 0.45) this.try('repair_gate');
    if (c.keep.hp < c.keep.maxHp * 0.55) this.try('repair_keep');
    const breached = c.walls.some((w) => !w.alive);
    const weak = c.walls.some((w) => w.breakable && w.hp < w.maxHp * 0.4);
    if (breached || weak) this.try('repair_walls');

    // keep a reserve once the war starts so repairs stay affordable
    const reserve = round >= ROUNDS.warRound ? 150 : round >= 2 ? 100 : 0;
    let guard = 0;
    while (g.troopCount(f.team) < f.troopCap && f.gold - reserve > 60 && guard++ < 6) {
      const r = Math.random();
      let type = r < 0.38 ? 'swordsman' : r < 0.62 ? 'spearman' : 'archer';
      if (f.gold > 450 && round >= 4 && Math.random() < 0.3) type = 'knight';
      else if (f.gold > 300 && round >= 3 && Math.random() < 0.22) type = 'horseman';
      else if (f.gold > 600 && round >= 6 && Math.random() < 0.15) type = 'lancer';
      if (!this.try('recruit_' + type)) break;
    }
    if (g.troopCount(f.team) >= f.troopCap && f.troopCap < TROOP_CAP.max && f.gold > 400) this.try('barracks');
    if (f.gold > 650) {
      const opts = ['training', 'fortify_walls', 'reinforce_gate', 'towers', 'vitality', 'strength', 'armor'];
      this.try(opts[Math.floor(Math.random() * opts.length)]);
    }
  }

  troops() {
    return this.g.units.filter((u) => u.alive && u.team === this.f.team && !u.isHero);
  }

  war() {
    const g = this.g, f = this.f;
    const aggro = g.diff.aiAggro * this.personality;
    if (g.round < ROUNDS.warRound - (aggro > 1.2 ? 1 : 0)) return;
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
        this.recall(troops);
        this.cooldown = 10;
        return;
      }
      if (attackers.length < 3 || g.time - a.since > 240) {
        this.recall(troops);
        this.cooldown = 45 / aggro;
      }
      return;
    }
    if (this.cooldown > 0) return;
    if (troops.length < 8 + Math.floor(g.round / 3)) return;
    if (g.phase === 'wave' && g.raidersNear(f.castle, 50) > 4) return;

    // choose the weakest reachable castle
    let best = null, bestScore = Infinity;
    for (const c of g.castles) {
      if (c.fallen || c.team === f.team) continue;
      const enemyTroops = g.troopCount(c.team);
      const dist = Math.hypot(c.center.x - f.castle.center.x, c.center.z - f.castle.center.z);
      const score = enemyTroops * 25 + c.gate.hp / 20 + c.keep.hp / 40 + dist * 0.5 + Math.random() * 60;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best) return;
    f.siegeTarget = best;
    this.assault = { castle: best, since: g.time };
    const send = troops.filter((u) => u.kind === 'infantry' || u.kind === 'cavalry' || Math.random() < 0.5);
    for (const u of send) u.setOrder('assault', best);
    if (f.hero && f.hero.alive && Math.random() < 0.6) f.hero.setOrder('assault', best);
    if (best.gate.alive && f.gold >= 450) this.try('ram');
    if (g.round >= 6 && f.gold >= 800) this.try('catapult');
    g.ui.toast(`${f.name} marches on ${g.factions[best.team].name}!`, f.team, best.team === 0);
  }

  recall(troops) {
    for (const u of troops) if (u.order === 'assault') u.setOrder('defend');
    if (this.f.hero && this.f.hero.alive) this.f.hero.setOrder('defend');
    this.assault = null;
  }
}
