// The AI that plays a hero nobody is playing (Hero Game Mode). One HeroBot drives one hero: a Player of some class with a
// level, talents, Q / R abilities, guard, bow and (for the Cavalier) a horse, simulated where the battle is run.
//
// A bot is a person without a network: where a remote human's client moves its own hero and sends the pose, the bot moves
// its hero here (Player.move with a stand-in for the keys), swings through Player.swordInput (a stand-in for the mouse),
// looses arrows through Player.shoot and casts through Player.useAbility, so a bot obeys every rule a person does:
// stamina, wind-up, parry window, cooldowns, stagger. It decides a few times a second (see think in SKILL) and moves,
// turns and strikes every frame.
import * as THREE from 'three';
import { CASTLE, WORLD } from './config.js';
import { navigate } from './nav.js';
import { SWING } from './combat.js';
import { allied } from './teams.js';
import { talentBlock, talentsOf } from './talents.js';
import { abilityOf, RANGER, LEAP } from './classes.js';

// What a bot learns, in this order, as its levels bring points (a mix of damage and survival). A talent whose level or
// parent is missing is skipped for now and taken when it can be; four points never buy a whole tree.
export const TALENT_PREFS = {
  knight: ['kn_plate', 'kn_boss', 'kn_hold', 'kn_rattle', 'kn_ram', 'kn_phalanx', 'kn_avenge'],
  berserker: ['bz_quake', 'bz_cyclone', 'bz_scars', 'bz_storm', 'bz_meteor', 'bz_dervish', 'bz_reaper'],
  ranger: ['rg_eagle', 'rg_light', 'rg_bodkin', 'rg_hawk', 'rg_heavy', 'rg_deadeye', 'rg_volley'],
  mage: ['mg_robes', 'mg_blast', 'mg_rime', 'mg_sear', 'mg_fork', 'mg_glacier', 'mg_shatter'],
  cleric: ['cl_grace', 'cl_wrath', 'cl_radiance', 'cl_chain', 'cl_aegis', 'cl_judge', 'cl_bloom'],
  cavalier: ['cv_barding', 'cv_lance', 'cv_horn', 'cv_sweep', 'cv_banner', 'cv_thunder', 'cv_vanguard'],
};

// How each class likes to fight: melee classes close in; the Ranger and the casters keep a band of distance (lo..hi
// metres from the target) and loose arrows or spells; a caster backed into a corner draws the sword.
const STYLE = {
  knight: { kind: 'melee' },
  berserker: { kind: 'melee' },
  cavalier: { kind: 'melee' },
  ranger: { kind: 'ranged', lo: 11, hi: 30, bow: true },
  mage: { kind: 'caster', lo: 9, hi: 22, bow: true },
  cleric: { kind: 'caster', lo: 6, hi: 15, bow: true },
};

// How well a bot plays: [easy, hard]; normal is in between (the difficulty is DIFFICULTY.aiAggro, 0.7 / 1 / 1.3).
const SKILL = {
  think: [0.2, 0.1],     // seconds between decisions (5 to 10 a second)
  react: [0.3, 0.1],     // seconds from seeing a blow coming to the guard going up
  aim: [0.07, 0.02],     // radians of aim error
  gap: [0.55, 0.14],     // pause between two swings
  nock: [0.5, 0.15],     // pause between two arrows
  turn: [7, 14],         // radians a second the bot can turn
  block: [0.35, 0.85],   // chance it guards against a blow it saw in time
  dirs: [0.4, 0.9],      // how readily a guard goes up at all (scales the block chance)
};

const SCAN = 50;         // how far a bot looks around it (metres)
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

// The keys and mouse a bot "presses" for Player.move, useAbility and swordInput.
class BotKeys {
  constructor() { this.held = new Set(); this.tapped = new Set(); this.wish = null; }
  down(code) { return this.held.has(code); }
  hit(code) { return this.tapped.has(code); }
  release() { return false; }
}

// How much a foe is worth in a fight (to weigh up who is outnumbered).
function weight(o) {
  if (o.isPlayer) return 2.5 + 0.25 * (o.level || 1);
  if (o.isSiege) return 2.5;
  if (o.isGiant) return 6;
  const t = o.type;
  if (t === 'knight' || t === 'lancer') return 1.8;
  if (t === 'horseman') return 1.5;
  if (t === 'archer' || t === 'longbowman') return 0.8;
  return 1;
}

// The angle to loft an arrow of this speed to land dy higher and dx, dz away, and how long it flies (null: too far).
function lob(dx, dy, dz, v) {
  const D = Math.hypot(dx, dz) || 1e-6, g = 9.8, v2 = v * v;
  const disc = v2 * v2 - g * (g * D * D + 2 * dy * v2);
  if (disc < 0) return null;
  const pitch = Math.atan((v2 - Math.sqrt(disc)) / (g * D));
  return { pitch, t: D / (v * Math.cos(pitch)) };
}

export class HeroBot {
  constructor(game, player, opts = {}) {
    this.g = game;
    this.p = player;
    this.enemyTeam = opts.enemyTeam ?? (player.team === 0 ? 1 : 0);
    this.keys = new BotKeys();
    this.mouse = { left: false, leftPressed: false, right: false, rightPressed: false };
    this.agent = { pos: player.pos, team: player.team, nav: null, avoid: {}, blockedBy: null };   // what nav.js steers
    this.foes = []; this.dist = []; this.friends = [];
    this.n = { c3: 0, c5: 0, c8: 0, c12: 0, heroes8: 0, power10: 0, ally10: 0, shooters: 0 };
    this.wish = { x: 0, z: 0 };
    this.way = new THREE.Vector3();
    this.hasWay = false;
    this.seen = new Map();   // foe -> when its swing was first seen (a swing is answered once)
    this.stats = { swings: 0, q: 0, r: 0, shots: 0, potions: 0, unstuck: 0, retreats: 0, blocks: 0 };
    this.t = 0;
    this.lastHp = player.hp;
    this.setup();
    this.reset();
  }

  // skill from the difficulty, and a personality of its own
  setup() {
    const g = this.g, aggro = g.diff && g.diff.aiAggro !== undefined ? g.diff.aiAggro : 1;
    const s = clamp((aggro - 0.7) / 0.6, 0, 1);
    this.skill = s;
    this.sk = {};
    for (const k in SKILL) this.sk[k] = lerp(SKILL[k][0], SKILL[k][1], s);
    this.bold = Math.random();
    this.retreatAt = lerp(0.36, 0.22, this.bold);
    this.returnAt = lerp(0.85, 0.7, this.bold);
    this.laneOff = (Math.random() - 0.5) * 12;
    this.lead = lerp(-3, 5, this.bold);
    this.aggro = lerp(18, 28, this.bold);
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.castle = this.g.castles[this.p.team];
    const my = this.castle, en = this.g.castles[this.enemyTeam];
    const ax = en.center.x - my.center.x, az = en.center.z - my.center.z, total = Math.hypot(ax, az) || 1;
    this.lane = { ox: my.center.x, oz: my.center.z, ux: ax / total, uz: az / total, total };   // the road between the two keeps
  }

  get style() { return STYLE[this.p.classId] || STYLE.knight; }

  // the hero has just risen at their keep
  reset() {
    const p = this.p, now = this.t;
    this.setup();
    this.castle = this.g.castles[p.team];
    this.retreat = false; this.retreatT = 0;
    this.mode = 'march'; this.target = null; this.gap = Infinity;
    this.front = null; this.frontAt = 0; this.homeAt = 0; this.home = { power: 0, x: 0, z: 0 };
    this.next = 0;
    this.hold = false; this.sprint = false; this.tired = false; this.go = 0;
    this.hasWay = false; this.navAt = 0; this.face = 'way'; this.faceYaw = p.yaw;
    this.agent.nav = null; this.agent.avoid = {}; this.agent.blockedBy = null;
    this.guardAt = 0; this.guardUntil = 0;
    this.gapUntil = now + 0.6; this.hadAtk = false;
    this.wantHit = false; this.wantShoot = false; this.nockAt = 0; this.drawGoal = 0.7;
    this.castOk = now + 0.5; this.drinkOk = 0; this.weaponOk = 0; this.mountOk = 0; this.noMount = 0; this.passAt = -9; this.meleeUntil = 0; this.backT = 0;
    this.sideT = 0; this.planted = false; this.sideUntil = 0; this.sideSign = 1; this.ghostUntil = 0; this.jumpAt = 0;
    this.stuckT = 0; this.stuckN = 0; this.px = p.pos.x; this.pz = p.pos.z; this.unstickLvl = 0; this.lastStuck = -99;
    this.recent = 0; this.lastHp = p.hp; this.hpf = 1;
    this.seen.clear();
    p.atk = null; p.blocking = false; p.drawT = 0; p.staggerT = 0; p.ghostT = 0; p.weapon = 'sword';
  }

  // spend any free talent points (called when the hero has reached a new level)
  spendTalents() {
    const p = this.p, g = this.g, prefs = TALENT_PREFS[p.classId] || [];
    for (let guard = 0; p.talentPoints > 0 && guard < 8; guard++) {
      const id = prefs.find((t) => !talentBlock(p, t)) || (talentsOf(p.classId).find((t) => !talentBlock(p, t.id)) || {}).id;
      if (!id) break;
      g.learnTalent(p, id);
    }
  }

  // every frame the hero is alive
  update(dt) {
    const p = this.p;
    if (!p.alive || p.drive) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.next -= dt;
    if (this.next <= 0) { this.next = this.sk.think * (0.85 + 0.3 * Math.random()); this.decide(); }
    this.act(dt);
  }

  // ======================================================================================================== seeing
  gapTo(o) { return Math.hypot(o.pos.x - this.p.pos.x, o.pos.z - this.p.pos.z) - (o.radius || 0.4); }

  scan() {
    const p = this.p, g = this.g, me = p.pos, team = p.team, foes = this.foes, friends = this.friends, dist = this.dist, n = this.n;
    foes.length = 0; friends.length = 0; dist.length = 0;
    g.grid.query(me.x, me.z, SCAN, (u) => {
      if (u === p || !u.alive || u.drive) return;
      const dx = u.pos.x - me.x, dz = u.pos.z - me.z;
      if (dx * dx + dz * dz > SCAN * SCAN) return;
      (allied(u.team, team) ? friends : foes).push(u);
    });
    for (const s of g.siege) {
      if (!s.alive || allied(s.team, team) || (s.abandoned && !s.driver)) continue;
      if (Math.hypot(s.pos.x - me.x, s.pos.z - me.z) < SCAN) foes.push(s);
    }
    n.c3 = n.c5 = n.c8 = n.c12 = n.heroes8 = n.shooters = 0; n.power10 = n.ally10 = 0;
    let nd = 1e9, hd = 1e9;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (let i = 0; i < foes.length; i++) {
      const o = foes[i], d = this.gapTo(o);
      dist[i] = d;
      if (o.isSiege) continue;
      if (d < 3) n.c3++;
      if (d < 5) n.c5++;
      if (d < 8) n.c8++;
      if (d < 12) n.c12++;
      if (d < 10) n.power10 += weight(o);
      if (o.isPlayer && d < 8) n.heroes8++;
      if (d < nd) nd = d;
      if (o.isPlayer && d < hd) hd = d;
      // something that can shoot at us from the front
      if ((o.ranged || (o.isPlayer && (o.weapon === 'bow' || o.classId === 'mage' || o.classId === 'cleric'))) && d > 6 && d < 46) {
        const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
        if ((dx * fx + dz * fz) / l > 0.4) n.shooters++;
      }
    }
    this.nearGap = nd; this.heroGap = hd;
    for (const f of friends) if (Math.hypot(f.pos.x - me.x, f.pos.z - me.z) < 10) n.ally10 += weight(f);
  }

  // progress of a point along the road from our keep to theirs
  prog(x, z) { const l = this.lane; return (x - l.ox) * l.ux + (z - l.oz) * l.uz; }

  // how far down the road our leading soldiers have got (the third one: a lone rider does not count)
  updateFront() {
    const p = this.p;
    let a = -1e9, b = -1e9, c = -1e9, count = 0;
    for (const u of this.g.units) {
      if (!u.alive || u.team !== p.team || u.isHero || u.isCrew || u.crewOf || u.order === 'defend') continue;
      const pr = this.prog(u.pos.x, u.pos.z);
      count++;
      if (pr > a) { c = b; b = a; a = pr; } else if (pr > b) { c = b; b = pr; } else if (pr > c) c = pr;
    }
    this.front = count === 0 ? null : count >= 3 ? c : a;
  }

  // enemies at our own castle: where, and how many
  checkHome() {
    const g = this.g, c = this.castle, team = this.p.team;
    let pow = 0, sx = 0, sz = 0;
    g.grid.query(c.center.x, c.center.z, 40, (u) => {
      if (!u.alive || allied(u.team, team) || Math.hypot(u.pos.x - c.center.x, u.pos.z - c.center.z) > 38) return;
      const w = weight(u); pow += w; sx += u.pos.x * w; sz += u.pos.z * w;
    });
    for (const s of g.siege) {
      if (!s.alive || allied(s.team, team) || Math.hypot(s.pos.x - c.center.x, s.pos.z - c.center.z) > 45) continue;
      pow += 3; sx += s.pos.x * 3; sz += s.pos.z * 3;
    }
    this.home = pow > 0 ? { power: pow, x: sx / pow, z: sz / pow } : { power: 0, x: c.center.x, z: c.center.z };
  }

  // A Cavalier rides: mount up, or whistle for the horse.
  mountUp() {
    const p = this.p;
    if (!p.hasHorse || p.mounted || p.drive || this.t < this.mountOk || this.t < this.noMount) return;
    this.mountOk = this.t + 0.8;
    const d = Math.hypot(p.horsePos.x - p.pos.x, p.horsePos.z - p.pos.z);
    if (d < 3.2 || !p.horseComing) p.toggleMount();
  }

  // ====================================================================================================== deciding
  decide() {
    const p = this.p, now = this.t;
    const hpf = this.hpf = p.hp / p.maxHp;
    this.scan();
    this.recent = this.recent * 0.6 + Math.max(0, this.lastHp - p.hp);
    this.lastHp = p.hp;
    if (now >= this.frontAt) { this.frontAt = now + 0.5; this.updateFront(); }
    if (now >= this.homeAt) { this.homeAt = now + 1; this.checkHome(); }
    this.mountUp();
    const hp0 = this.castle.spawnPoint;
    this.homeD = Math.hypot(p.pos.x - hp0.x, p.pos.z - hp0.z);

    // hurt: back to the keep (it mends heroes quickly), and out again when well
    const swamped = hpf < 0.55 && this.homeD > 20 && this.n.power10 > 4.5 + this.n.ally10 * 0.6 + 4 * hpf;
    if (this.retreat) { if (hpf >= this.returnAt || now - this.retreatT > 40) this.retreat = false; }
    else if (hpf < this.retreatAt || swamped) {
      // a bold hero finishes a rival who is nearly down
      const t = this.target;
      if (!(this.bold > 0.6 && t && t.isPlayer && t.hp < t.maxHp * 0.2 && this.gapTo(t) < 4 && hpf > 0.15)) { this.retreat = true; this.retreatT = now; this.stats.retreats++; }
    }

    // who to fight
    this.target = this.pickTarget();
    this.gap = this.target ? this.gapTo(this.target) : Infinity;
    this.chooseWeapon();
    let mode;
    if (this.retreat && !this.target) mode = 'retreat';
    else if (this.target) mode = this.retreat ? 'retreat' : 'fight';
    else mode = 'march';
    if (mode === 'march') {
      const st = this.structureTarget();
      if (st) { this.target = st; this.gap = this.gapTo(st); mode = 'siege'; }
    }
    if (mode !== this.mode) { this.mode = mode; this.modeT = now; }

    this.planGuard();
    this.planAbilities();
    this.drink();
    switch (mode) {
      case 'fight': this.planFight(); break;
      case 'siege': this.planSiege(); break;
      case 'retreat': this.planRetreat(); break;
      default: this.planMarch(); break;
    }
    this.planStrike();
  }

  // The nearest worthwhile foe in reach of the bot's temper, a rival hero first and a wounded one before all.
  pickTarget() {
    const p = this.p, st = this.style, me = p.pos, foes = this.foes, dist = this.dist;
    const atHome = this.retreat && this.homeD <= 16;
    if (this.retreat && !atHome) return null;
    let best = null, bs = 1e9;
    const friendHero = this.friends.some((f) => f.isPlayer);
    for (let i = 0; i < foes.length; i++) {
      const o = foes[i], d = dist[i];
      if (st.kind === 'melee' && !o.isSiege && o.pos.y - me.y > 2.4) continue;   // up on a wall: out of reach of a sword
      // (an archer shooting at us is worth the walk, whatever the temper)
      const range = atHome ? 12 : o.isPlayer ? this.aggro + 12 : o.ranged && d < o.range + 4 ? SCAN : st.kind === 'melee' ? this.aggro : Math.max(this.aggro, st.hi + 4);
      if (d > range) continue;
      // do not run ahead of the soldiers after a straggler (or a rival hero), unless he is shooting at us
      if (this.front !== null && d > 9 && !friendHero && !(o.ranged && d < o.range + 4) && this.prog(o.pos.x, o.pos.z) > this.front + (o.isPlayer ? 25 : 18)) continue;
      let s = d;
      if (o.isPlayer) { const f = o.hp / o.maxHp; s -= 6 + (f < 0.5 ? 8 : 0) + (f < 0.25 ? 8 : 0); if (o.mounted && !p.mounted && st.kind === 'melee') s += 12; }
      else if (o.isSiege) s -= 3;
      else if (o.crewOf) s -= 2;
      else if (o.ranged && st.kind === 'melee') s -= 2;
      if (o === this.target) s -= 3;
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  // The enemy gate (or, once it is down, the keep) when there is nobody to fight and we are at their castle.
  structureTarget() {
    const en = this.g.castles[this.enemyTeam];
    if (!en || en.fallen || this.retreat) return null;
    const pr = this.prog(this.p.pos.x, this.p.pos.z);
    if (pr < this.lane.total - CASTLE.H - 16) return null;   // not there yet
    return en.gate.alive ? en.gate : en.keep.alive ? en.keep : null;
  }

  chooseWeapon() {
    const p = this.p, st = this.style, t = this.target;
    if (!t || this.t < this.weaponOk || p.mounted || p.power) return;   // (not in the middle of a Power Shot's draw)
    let want = 'sword';
    const reserve = st.kind === 'ranged' ? 2 : 8;
    if (st.bow && !t.isStructure && p.arrows > reserve && this.t >= this.meleeUntil) {
      if (st.kind === 'ranged') want = this.n.c3 >= 2 && this.gap < 3 ? 'sword' : 'bow';
      else want = this.gap > 5.5 && this.n.c3 === 0 ? 'bow' : 'sword';
    }
    if (want !== p.weapon) { p.setWeapon(want); this.weaponOk = this.t + 1; }
  }

  // ------------------------------------------------------------------------------------------------ the guard
  // Answer the blows we can see coming: the guard goes up after the bot's reaction time, on the side the blow arrives from.
  planGuard() {
    const p = this.p, now = this.t, foes = this.foes, dist = this.dist, sk = this.sk;
    for (const [o, at] of this.seen) if (now - at > 1.5 || !o.alive) this.seen.delete(o);
    for (let i = 0; i < foes.length; i++) {
      const o = foes[i];
      if (o.isSiege || dist[i] > 4.5) continue;
      let tti;
      if (o.isPlayer) tti = o.atk ? (o.atk.phase === 'wind' ? 0.25 : o.atk.phase === 'strike' && !o.struck ? 0.08 : -1) : o.swingT >= 0 && o.swingT < 0.3 ? 0.2 : -1;
      else tti = o.swingT >= 0 && !o.struck && !o.ranged && !o.isGiant ? 0.32 - o.swingT : -1;
      if (tti < 0 || this.seen.has(o)) continue;
      const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
      if ((Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dz) / (Math.hypot(dx, dz) || 1) < 0.4) continue;   // not swinging at us
      this.seen.set(o, now);
      const r = sk.react * (0.75 + 0.5 * Math.random());
      // (a raised shield stops any blow from in front, so a weaker bot is slower to think of raising it at all)
      if (r < tti - 0.02 && Math.random() < (sk.block + (o.isPlayer ? 0.1 : 0) - 0.15 * this.bold) * (0.55 + 0.45 * sk.dirs)) {
        this.guardAt = now + r;
        this.guardUntil = now + r + tti + 0.3;
        this.stats.blocks++;
      }
    }
    // a soldier in arm's reach whose next blow is due: shield up before it comes
    if (!p.atk && p.weapon === 'sword' && !this.retreat) {
      for (let i = 0; i < foes.length; i++) {
        const o = foes[i];
        if (o.isPlayer || o.isSiege || o.ranged || o.isGiant || dist[i] > 3 || o.swingT >= 0 || !(o.attackTimer < 0.3) || now < this.guardUntil) continue;
        if (Math.random() < 0.25 + 0.5 * this.skill - 0.2 * this.bold) {
          this.guardAt = now; this.guardUntil = now + 0.45;
          break;
        }
      }
    }
    // a shield up while walking into arrow fire from the front: it stops most of the damage
    if (this.n.shooters >= 2 && !this.retreat && p.weapon === 'sword' && !p.atk && (this.style.kind === 'melee' || this.n.c3 > 0) && Math.random() < 0.6 + 0.3 * this.skill) {
      const hold = this.wantHit ? this.gapUntil - now : 0.5;   // in contact only between two swings
      if (hold > 0.05) {
        if (this.guardUntil <= now) this.guardAt = now;
        this.guardUntil = Math.max(this.guardUntil, now + hold);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- potions
  drink() {
    const p = this.p, now = this.t;
    if (p.potions <= 0 || now < this.drinkOk || p.hp >= p.maxHp) return;
    const hurt = this.hpf < 0.4 && (this.n.c8 > 0 || (this.retreat && this.homeD > 30) || this.recent > p.maxHp * 0.1);
    if (hurt || (this.hpf < 0.25 && this.homeD > 16)) { p.drinkPotion(); this.stats.potions++; this.drinkOk = now + 2; }
  }

  // ------------------------------------------------------------------------------------------------ abilities
  // Press Q or R, now, aimed where it matters (at is the Ranger's circle). Returns whether it went off.
  cast(slot, at = null) {
    const p = this.p;
    if (p.abilCd[slot] > 0 || p.staggerT > 0 || p.drive || this.t < this.castOk) return false;
    p.useAbility(slot, this.keys, at);
    if (!(p.abilCd[slot] > 0)) return false;   // refused
    this.stats[slot]++;
    this.castOk = this.t + 0.5;
    return true;
  }

  // flick the view to a point, a little off by the bot's skill (as a person aims with the mouse)
  aim(x, y, z, noise = 1) {
    const p = this.p, e = p.eyePos(V1);
    const dx = x - e.x, dy = y - e.y, dz = z - e.z, h = Math.hypot(dx, dz) || 1e-6, err = this.sk.aim * noise;
    p.yaw = Math.atan2(dx, dz) + gauss() * err;
    p.pitch = clamp(Math.atan2(dy, h) + gauss() * err * 0.6, -1.2, 1.2);
    this.faceYaw = p.yaw;
  }

  // aim at a foe where it will be when a bolt of this speed gets there
  aimAtFoe(o, speed = 40, noise = 1) {
    const c = o.isStructure ? V3.copy(o.pos) : o.aimPoint ? o.aimPoint(V3) : o.chest(V3);
    const e = this.p.eyePos(V2);
    const t = Math.hypot(c.x - e.x, c.z - e.z) / speed;
    const v = o.vel;
    this.aim(c.x + (v ? v.x * t : 0), c.y, c.z + (v ? v.z * t : 0), noise);
  }

  // a clear line for an arrow or bolt (sampled: a wall or merlon in the way)
  clearShot(o) {
    const p = this.p, ph = this.g.physics, e = p.eyePos(V1), c = o.isStructure ? o.pos : o.chest(V2);
    const d = Math.hypot(c.x - e.x, c.z - e.z), n = Math.max(2, Math.ceil(d / 1.2));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (ph.pointHit(e.x + (c.x - e.x) * k, e.y + (c.y - e.y) * k, e.z + (c.z - e.z) * k, p.team)) return false;
    }
    return true;
  }

  // foes (not engines) within r metres of a point
  countAt(x, z, r) {
    let c = 0;
    for (const o of this.foes) if (!o.isSiege && Math.hypot(o.pos.x - x, o.pos.z - z) < r + (o.radius || 0.4)) c++;
    return c;
  }

  // Q and R, class by class: on groups and rival heroes, and the defence when it is needed.
  planAbilities() {
    const p = this.p, n = this.n, now = this.t, hpf = this.hpf, t = this.target;
    if (now < this.castOk || p.staggerT > 0 || (p.abilCd.q > 0 && p.abilCd.r > 0)) return;
    const q = p.abilCd.q <= 0, r = p.abilCd.r <= 0;
    const foe = t && !t.isStructure ? t : null;
    const gap = foe ? this.gap : Infinity;
    const heavy = this.recent > p.maxHp * 0.12;   // taking a beating
    switch (p.classId) {
      case 'knight':
        if (r && (n.c8 >= 3 || (hpf < 0.6 && n.c8 >= 1) || (n.heroes8 && hpf < 0.8) || (heavy && n.c8))) { this.cast('r'); break; }
        if (q && foe && gap < 5 && ((foe.isPlayer && gap < 4) || this.countAt(p.pos.x + Math.sin(p.yaw) * 3, p.pos.z + Math.cos(p.yaw) * 3, 3.4) >= 2)) {
          this.aimAtFoe(foe, 1e3); this.cast('q');
        }
        break;
      case 'berserker':
        if (r && hpf > 0.4 && this.leapIn()) break;
        if (q && hpf > 0.2 && (n.c3 >= 2 || (n.heroes8 && this.heroGap < 3.5) || (foe && gap < 3 && foe.maxHp > 200))) this.cast('q');
        break;
      case 'ranger': {
        // the Sniper Shot at a far rival hero, giant or siege crew; Power Shot (or the Volley) at the ranks
        if (r && !heavy && n.c8 === 0 && this.sniperShot()) break;
        if (q) { if (abilityOf(p, 'q').id === 'volley') this.volley(); else this.powerShot(); }
        break;
      }
      case 'mage':
        if (r && ((n.c8 >= 1 && (hpf < 0.85 || n.c8 >= 2)) || (heavy && hpf < 0.7))) { this.cast('r'); break; }
        if (q) this.bolt('q', 1.5, 38);
        break;
      case 'cleric': {
        let hurt = 0;
        for (const f of this.friends) if (Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) < 14 && f.hp < f.maxHp * 0.65) hurt += f.isPlayer ? 2 : 1;
        if (r && (hpf < 0.5 || hurt >= 4 || (hpf < 0.7 && hurt >= 2))) { this.cast('r'); break; }
        if (q) this.bolt('q', 2, 50);
        break;
      }
      case 'cavalier':   // (the charge first: its window, a gallop away from the foe, is short)
        if (q && foe && hpf > 0.35 && gap > 4 && gap < 17 && (foe.isPlayer || this.countAt(foe.pos.x, foe.pos.z, 4) >= 2)) {
          this.aimAtFoe(foe, 1e3); p.pitch = 0;
          if (this.cast('q')) break;
        }
        if (r && ((this.friends.length >= 3 && n.c12 >= 2) || (hpf < 0.55 && n.c8 >= 1) || (n.heroes8 && this.friends.length >= 1))) this.cast('r');
        break;
      default: break;
    }
  }

  // Fireball or Smite: at a rival hero, a group, anything in range, else the enemy gate or keep.
  bolt(slot, lo, hi) {
    const p = this.p;
    let best = null, bs = -1;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < lo || d > hi) continue;
      let s = this.countAt(o.pos.x, o.pos.z, 3.8) + (o.isPlayer ? 3 : 0) - d * 0.02;
      if (o === this.target) s += 0.5;
      if (s > bs && this.clearShot(o)) { bs = s; best = o; }
    }
    if (!best && this.mode === 'siege' && this.target && this.target.isStructure && this.gap < hi && this.gap > lo - 1.5) best = this.target;
    if (!best) return;
    this.aimAtFoe(best, slot === 'q' && p.classId === 'mage' ? 40 : 1e3);
    this.cast(slot);
  }

  // The densest knot of foes in the Ranger's reach, with a little lead on where they are going.
  volley() {
    const p = this.p;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 9 || d > 55) continue;
      let s = 0;
      for (const f of this.foes) if (!f.isSiege && Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < 6) s += f.isPlayer ? 2 : 1;
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < 3) return;
    let cx = 0, cz = 0, c = 0;
    for (const f of this.foes) {
      if (f.isSiege || Math.hypot(f.pos.x - best.pos.x, f.pos.z - best.pos.z) >= 6) continue;
      cx += f.pos.x + (f.vel ? f.vel.x * 0.9 : 0); cz += f.pos.z + (f.vel ? f.vel.z * 0.9 : 0); c++;
    }
    cx /= c; cz /= c;
    const at = new THREE.Vector3(cx, this.g.physics.groundHeight(cx, cz, best.pos.y + 3), cz);
    this.faceYaw = Math.atan2(cx - p.pos.x, cz - p.pos.z);
    p.yaw = this.faceYaw;
    this.cast('q', at);
  }

  // Leap: into a rival hero or a knot of foes a fair way off (where they will be when he comes down), to open a fight or join one;
  // never at a lone soldier, and not when the foes are already at hand (Whirlwind is for that).
  leapIn() {
    const p = this.p, n = this.n;
    if (p.mounted || p.climb || p.leap || n.c5 >= 2) return false;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 9 || d > 45 || Math.abs(o.pos.y - p.pos.y) > 4) continue;
      let s = o.isPlayer ? 4 : 0;
      for (const f of this.foes) if (!f.isSiege && Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < LEAP.radius) s += f.isPlayer ? 2 : 1;
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < 4) return false;
    const T = this.g.abilities.leapArc(this.gapTo(best)).dur;
    const x = best.pos.x + (best.vel ? best.vel.x * T * 0.6 : 0), z = best.pos.z + (best.vel ? best.vel.z * T * 0.6 : 0);
    const plan = this.g.abilities.leapPlan(p, p.pos, V3.set(x, best.pos.y, z));
    if (!plan || Math.hypot(plan.to.x - x, plan.to.z - z) > LEAP.radius * 0.8) return false;   // (a wall in the way: walk round instead)
    this.faceYaw = p.yaw = Math.atan2(x - p.pos.x, z - p.pos.z);
    return this.cast('r', plan.to.clone());
  }

  // Sniper Shot: a far target worth an arrow that hits like three: a rival hero above all, else a giant, a boss or a siege engine's
  // crew; with a clear line, beyond the reach of her ordinary shots (22 m) and within the arrow's flat flight
  sniperShot() {
    const p = this.p, g = this.g, S = RANGER.snipe, me = p.pos;
    if (p.weapon !== 'bow' && this.nearGap < 12) return false;
    if (p.scope || p.power || p.mounted || p.climb) return false;
    let best = null, bs = 0;
    const consider = (o) => {
      if (!o.alive || allied(o.team, p.team) || o.drive) return;
      const d = Math.hypot(o.pos.x - me.x, o.pos.z - me.z);
      if (d < 22 || d > S.range - 4) return;
      const s = (o.isPlayer ? 6 : o.isGiant || (o.def && o.def.boss) ? 4 : o.isCrew || o.crewOf ? 3 : 1) + d * 0.01;
      if (s > bs && this.clearShot(o)) { bs = s; best = o; }
    };
    for (const h of g.humans) consider(h);
    if (!best) g.grid.query(me.x, me.z, S.range, (u) => { if ((u.isGiant || u.isCrew || u.crewOf || (u.def && u.def.boss)) && !u.isPlayer) consider(u); });
    if (!best) return false;
    this.snipeAt = best;
    this.aimAtFoe(best, S.speed);
    p.beginScope();
    if (!p.scope) return false;
    this.stats.r++;
    this.castOk = this.t + 0.5;
    return true;
  }

  // Power Shot: along the line with the most foes in it (a rival hero is worth three), from the bow
  powerShot() {
    const p = this.p;
    if (p.weapon !== 'bow' || p.power || p.mounted) return;
    const e = p.eyePos(V1);
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 4 || d > 60 || !this.clearShot(o)) continue;
      const dx = o.pos.x - e.x, dz = o.pos.z - e.z, l = Math.hypot(dx, dz) || 1;
      let s = 0;
      for (const f of this.foes) {   // who else stands within a metre of that line, beyond us
        if (f.isSiege) continue;
        const fx = f.pos.x - e.x, fz = f.pos.z - e.z, along = (fx * dx + fz * dz) / l;
        if (along < 2 || along > 70 || Math.abs((fx * dz - fz * dx) / l) > 1) continue;
        s += f.isPlayer ? 3 : 1;
      }
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < 3) return;
    this.powerAt = best;
    this.aimAtFoe(best, 95);
    p.useAbility('q', this.keys);
    if (p.power) { this.stats.q++; this.castOk = this.t + 0.5; }
  }

  // ===================================================================================================== planning
  // where to walk: the next point on the way to (x, z), through gates and round castles (nav.js)
  goTo(x, z, direct = false) {
    if (direct) { this.way.set(x, 0, z); this.hasWay = true; return; }
    if (this.t < this.navAt && this.hasWay) return;
    this.navAt = this.t + 0.3;
    this.way.copy(navigate(this.g, this.agent, V3.set(x, 0, z)));
    this.hasWay = true;
  }

  // a point to the side of (or away from) a foe, to circle or back off
  stepAround(o, away, side) {
    const p = this.p, dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l, lim = WORLD.playHalf - 5;
    let wx = p.pos.x - uz * side * 3 - ux * away * 4, wz = p.pos.z + ux * side * 3 - uz * away * 4;
    if (Math.abs(wx) > lim || Math.abs(wz) > lim) {   // the edge of the map
      wx = clamp(wx, -lim, lim); wz = clamp(wz, -lim, lim);
      if (away > 0 && Math.hypot(wx - p.pos.x, wz - p.pos.z) < 2) this.meleeUntil = this.t + 3;   // nowhere left to back into: fight
    }
    this.way.set(wx, 0, wz);
    this.hasWay = true;
  }

  planFight() {
    const p = this.p, t = this.target, st = this.style, gap = this.gap, now = this.t;
    this.hold = false; this.face = 'target';
    if (now >= this.sideT) {   // circle for a while, then stand ground for a while
      this.sideT = now + 1.2 + Math.random() * 1.4;
      if (Math.random() < 0.6) this.side = -this.side;
      this.planted = Math.random() < 0.4;
    }
    const melee = st.kind === 'melee' || now < this.meleeUntil || p.weapon === 'sword' && gap < 3;
    this.sprint = false;
    if (melee) {
      if (p.mounted) { this.rideAt(t); return; }
      if (t.isPlayer && t.mounted && gap > 3.2) this.stepAround(t, 0, this.side);   // a rider is too quick to chase: let it come
      else if (gap > 2.1) {
        const close = gap < 8 && this.g.castleAt(t.pos) === this.g.castleAt(p.pos);
        this.goTo(t.pos.x, t.pos.z, close);
        this.sprint = gap > 9;
      } else if (this.planted && gap > 1.2) this.hold = true;
      else this.stepAround(t, gap < 1.2 ? 0.5 : 0, this.side);
    } else {
      if (gap < st.lo - 1) {
        this.backT += this.sk.think;
        if (this.backT > 2.5 && this.n.c3 >= 1) { this.meleeUntil = now + 3; this.backT = 0; }   // cornered: fight it out
        this.stepAround(t, 1, this.side * 0.4);
        this.sprint = gap < 4;
      } else if (gap > st.hi) {
        this.backT = 0;
        this.goTo(t.pos.x, t.pos.z, gap < 10);
        this.sprint = gap > st.hi + 8;
      } else { this.backT = 0; this.stepAround(t, 0, this.side); }
    }
  }

  // A Cavalier rides at its target and through it, keeps going a moment and turns for another pass (a horse turns slowly);
  // with the target at its side (or on its tail) it stops and fights it where it is.
  rideAt(t) {
    const p = this.p, now = this.t, dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
    const ahead = (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / d;
    // straight at it in the open; round the castle walls and through the gate when it is somewhere else
    const close = d < 10 && this.g.castleAt(t.pos) === this.g.castleAt(p.pos);
    this.goTo(t.pos.x, t.pos.z, close);
    this.go = p.stamina > 8 && d > 4 ? 2 : 1;
    this.face = close ? 'target' : 'way';
    if (!close) return;
    if (d < 3.2 && ahead < 0.2) this.go = 0;   // beside it: stand and strike
    else if (ahead < -0.3 && d < 9) {          // just rode past it
      if (now - this.passAt > 4) this.passAt = now;
      if (now - this.passAt < 0.9) { this.face = 'fixed'; this.faceYaw = p.heading; this.go = 2; }
    }
  }

  planSiege() {
    const p = this.p, t = this.target, en = this.g.castles[this.enemyTeam];
    this.sprint = false; this.face = 'target'; this.go = 1;
    // the spot to stand at: against the gate, or in front of the keep door
    const sx = t.kind === 'keep' ? en.keepDoor.x : t.pos.x + ((p.pos.x - t.pos.x) / (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) || 1)) * (t.radius + 0.9);
    const sz = t.kind === 'keep' ? en.keepDoor.z : t.pos.z + ((p.pos.z - t.pos.z) / (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) || 1)) * (t.radius + 0.9);
    const there = Math.hypot(sx - p.pos.x, sz - p.pos.z) < 1.3 || this.gap < 1.6;
    if (there) { this.hold = true; this.go = 0; } else { this.hold = false; this.goTo(sx, sz, t.kind === 'gate'); this.sprint = this.gap > 14; }
  }

  planRetreat() {
    const p = this.p, h = this.castle.spawnPoint;
    this.face = this.target && this.homeD <= 16 ? 'target' : 'way';
    this.sprint = this.homeD > 10;
    this.go = this.homeD > 5 ? 2 : 0;
    if (this.homeD < 4) { this.hold = true; this.go = 0; } else { this.hold = false; this.goTo(h.x, h.z); }
    if (this.homeD <= 16 && this.target) {   // at the fountain: fight what comes, but stay on it
      const t = this.target;
      if (this.gap > 2.2) this.hold = true;
      else this.stepAround(t, 0, this.side);
    }
  }

  // Walk down the road with the soldiers, a little behind or ahead by temper, and never alone out in front of them.
  planMarch() {
    const p = this.p, L = this.lane, st = this.style;
    this.face = 'way'; this.hold = false; this.sprint = false; this.go = 1;
    const stage = CASTLE.H + 14, gateEdge = L.total - CASTLE.H - 7;
    // enemies at our own castle with nobody else out there to meet them
    const hm = this.home;
    if (hm.power >= 3 && this.homeD < 110 && (this.front === null || hm.power >= 5 || this.castle.keep.hp < this.castle.keep.maxHp * 0.7)) {
      this.mode = 'defend';
      this.goTo(hm.x, hm.z);
      this.sprint = this.homeD > 15;
      this.go = 2;
      return;
    }
    let want = this.front === null ? stage : clamp(this.front + this.lead - (st.kind === 'melee' ? 0 : 5), stage, gateEdge);
    const me = this.prog(p.pos.x, p.pos.z);
    // never alone out in front: wait for the soldiers (or, a long way ahead of them, drop back to them)
    const far = me > want + 20;
    if (me > want + 3 && !far) { this.hold = true; this.go = 0; return; }
    if (far) want += 8;
    const gx = L.ox + L.ux * want - L.uz * this.laneOff, gz = L.oz + L.uz * want + L.ux * this.laneOff;
    this.goTo(gx, gz);
    this.sprint = me < want - 14;
    this.go = this.sprint ? 2 : 1;
  }

  // Decide whether to swing (or loose an arrow) at the target when it is close enough and right in front.
  planStrike() {
    const t = this.target, p = this.p;
    this.wantHit = false; this.wantShoot = false;
    if (!t || !t.alive || p.staggerT > 0) return;
    if (p.weapon === 'sword') {
      this.wantHit = this.gap < 5 || (p.mounted && this.gap < 12);
    } else if (!t.isStructure && p.arrows > 0 && this.gap > 2.5 && this.gap < 56 && this.clearShot(t)) {
      this.wantShoot = true;
      this.drawGoal = p.drawTime * (0.95 + Math.random() * 0.1);
    }
  }

  // ====================================================================================================== acting
  canStrike() {
    const p = this.p, t = this.target, now = this.t;
    if (!this.wantHit || !t || !t.alive || now < this.gapUntil || p.stamina < 10) return false;
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    const reach = p.sword.len + (p.mounted ? 2.2 : 1.6) + SWING.reach;
    const lead = p.mounted ? Math.max(0, Math.abs(p.rideSpeed) - 2) * 0.16 : 0;
    if (d - (t.radius || 0.4) > reach - 0.25 + lead) return false;
    return Math.abs(angDiff(p.yaw, Math.atan2(dx, dz))) < 0.5;
  }

  // the direction the bot wants to walk this frame (null: stand still)
  wishDir() {
    const p = this.p, now = this.t;
    if (this.hold || !this.hasWay) return null;
    let dx = this.way.x - p.pos.x, dz = this.way.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return null;
    dx /= d; dz /= d;
    if (!p.mounted) {
      const s = this.g.physics.steerAroundTrees(p.pos.x, p.pos.z, dx, dz, p.radius, this.side);
      if (s) { dx = s.x; dz = s.z; }
    }
    if (this.sideUntil > now) {   // wedged: go round
      const c = 0.5, s = 0.87 * this.sideSign;
      const nx = dx * c - dz * s, nz = dx * s + dz * c;
      dx = nx; dz = nz;
    }
    this.wish.x = dx; this.wish.z = dz;
    return this.wish;
  }

  unstick() {
    const p = this.p, now = this.t;
    this.stats.unstuck++;
    this.stats.stuckAt = [Math.round(p.pos.x), Math.round(p.pos.z), this.mode, p.mounted ? 'mounted' : ''];   // (the last place, for a look at it)
    this.unstickLvl = now - this.lastStuck < 8 ? this.unstickLvl + 1 : 1;
    this.lastStuck = now;
    this.agent.nav = null; this.agent.avoid = {}; this.navAt = 0;
    this.sideUntil = now + 0.7 + 0.2 * this.unstickLvl;
    this.sideSign = Math.random() < 0.5 ? 1 : -1;
    if (this.unstickLvl >= 2) this.ghostUntil = now + 1.6;
    if (p.mounted && this.unstickLvl >= 2) { p.toggleMount(); this.noMount = now + 20; }   // a horse pinned in a tight corner: get down and walk it
    if (!p.mounted && p.onGround) this.jumpAt = now + 0.15;
  }

  act(dt) {
    const p = this.p, k = this.keys, m = this.mouse, now = this.t;
    k.held.clear(); k.tapped.clear(); k.wish = null;
    p.ghostT = this.ghostUntil > now ? 1 : 0;

    // look where the bot means to go, or at its target
    let fy = this.faceYaw;
    const t = this.target;
    if (this.face === 'target' && t && t.alive) fy = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    else if (this.face === 'way' && this.hasWay && !this.hold) fy = Math.atan2(this.way.x - p.pos.x, this.way.z - p.pos.z);
    // a horse goes where its rider looks: bend that round trunks and standing stones ahead of it, and slow down for them
    let slow = false;
    if (p.mounted && this.go > 0 && !this.hold && !p.dash) {
      const hx = Math.sin(p.heading), hz = Math.cos(p.heading), ah = clamp(Math.abs(p.rideSpeed) * 0.4, 0, 6);
      const st = this.g.physics.steerAroundTrees(p.pos.x + hx * ah, p.pos.z + hz * ah, hx, hz, p.radius, this.side);
      if (st) { fy = Math.atan2(st.x, st.z); slow = true; }
    }
    this.faceYaw = fy;
    const dy = angDiff(p.yaw, fy), rate = this.sk.turn * (p.mounted ? 1.6 : 1) * dt;
    p.yaw += clamp(dy, -rate, rate);

    // walk, ride, jump
    let w = this.wishDir();
    if (p.mounted) {
      if (this.go > 0 && !this.hold) {
        k.held.add('KeyW');
        if (this.go > 1 && !this.tired && !slow) k.held.add('ShiftLeft');
      }
      if (this.sideUntil > now) { k.held.delete('KeyW'); k.held.delete('ShiftLeft'); k.held.add('KeyS'); k.held.add(this.sideSign > 0 ? 'KeyA' : 'KeyD'); }   // back out, swinging the tail round
    } else if (w) {
      k.wish = w;
      if (this.sprint && !this.tired) k.held.add('ShiftLeft');
    }
    if (p.stamina < 8) this.tired = true; else if (p.stamina > 40) this.tired = false;
    if (this.jumpAt && now >= this.jumpAt) { this.jumpAt = 0; k.tapped.add('Space'); }
    p.move(dt, k);

    // no progress for a second: side-step, hop, slip past the trunk
    this.stuckT += dt;
    if (this.stuckT >= 0.5) {
      const mv = Math.hypot(p.pos.x - this.px, p.pos.z - this.pz);
      this.px = p.pos.x; this.pz = p.pos.z; this.stuckT = 0;
      const gate = this.castle.gate;
      const waiting = gate.alive && gate.openAmt < 0.7 && Math.hypot(p.pos.x - gate.pos.x, p.pos.z - gate.pos.z) < 10;
      if ((w || (p.mounted && this.go > 0 && !this.hold)) && !p.dash && p.staggerT <= 0 && !p.blocking && !p.buffs.has('whirl') && !waiting && mv < 0.5) {
        if (++this.stuckN >= 2) { this.unstick(); this.stuckN = 0; }
      } else this.stuckN = 0;
    }

    // fight
    if (p.staggerT > 0) { p.atk = null; p.blocking = false; p.drawT = 0; }
    else if (p.weapon === 'sword') {
      m.left = m.right = m.rightPressed = false;
      if (p.buffs.has('whirl')) { p.atk = null; p.blocking = false; }
      else {
        const atk = p.atk;
        if (now >= this.guardAt && now < this.guardUntil && (!atk || atk.phase === 'recover')) m.right = true;
        else if (!atk && this.canStrike()) m.left = true;
        p.swordInput(dt, m);
      }
      const has = !!p.atk;
      if (this.hadAtk && !has) {
        this.gapUntil = now + this.sk.gap * (0.7 + 0.6 * Math.random());
        this.stats.swings++;
      }
      this.hadAtk = has;
    } else {
      p.blocking = false;
      const tg = this.target;
      if (p.power) {   // a Power Shot being drawn: keep it on the line, and it looses itself
        const pt = this.powerAt && this.powerAt.alive ? this.powerAt : tg;
        if (pt && pt.alive) this.aimAtFoe(pt, 95);
        p.tickPower(dt);
      } else if (p.scope) {   // the scope at the eye: keep it on the mark, wait for the sway to settle, then loose
        const st = this.snipeAt;
        if (!st || !st.alive) p.endScope();
        else {
          this.aimAtFoe(st, RANGER.snipe.speed, 0.15);   // (steadied through the scope)
          p.tickScope(dt, true, p.scope.t >= RANGER.snipe.settle * 1.1);
        }
      } else if (this.wantShoot && tg && tg.alive && p.arrows > 0 && now >= this.nockAt) {
        this.aimShot(tg);
        p.drawT += dt;
        if (p.drawT >= this.drawGoal) {
          this.aimShot(tg);
          p.shoot();
          p.drawT = 0;
          this.nockAt = now + this.sk.nock * (0.7 + 0.6 * Math.random());
          this.stats.shots++;
        }
      } else p.drawT = 0;
    }
  }

  // Aim the bow: lead the target and loft the arrow to land on it.
  aimShot(t) {
    const p = this.p, e = p.eyePos(V1), a = t.aimPoint ? t.aimPoint(V2) : t.chest(V2);
    const v = t.vel, speed = 62;
    let tx = a.x, tz = a.z, f = null;
    for (let i = 0; i < 3; i++) {
      f = lob(tx - e.x, a.y - e.y, tz - e.z, speed);
      if (!f) break;
      tx = a.x + (v ? v.x * f.t : 0); tz = a.z + (v ? v.z * f.t : 0);
    }
    const err = this.sk.aim;
    p.yaw = Math.atan2(tx - e.x, tz - e.z) + gauss() * err;
    p.pitch = (f ? f.pitch : 0.6) + gauss() * err * 0.5;
    this.faceYaw = p.yaw;
  }
}
