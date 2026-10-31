// A lord the computer plays fights as a hero of a class: a rival lord (Conquest, King of the Hill, and the house of a player who left) and
// War Mode's AI generals. Such a lord is a soldier (units.js: a Unit of type 'lord'), not a Player, so this kit gives him what a hero's
// abilities ask of their caster (a class and its numbers, cooldowns, timed effects, a level and talents) and the runs, leaps and bow draws
// that carry his body, and it decides when to use Q and R. The abilities themselves are the heroes' own (Abilities in classes.js): the same
// plans for a run or a leap (short of walls, never onto enemy battlements), the same damage and the same effects on every screen.
//
// The class: the lord's style (rivals.js: the Reckless is a Berserker, the Patient a Knight, ...), else his house's; War Mode's generals draw
// one. He wears its look (models.js HERO_DESC) with a lord's long cape. No Cavalier: a lord has no horse.
// The difficulty: on Easy a lord looks for an opening less often, waits longer once an ability is ready, aims worse and wants a bigger knot of
// foes before a run, a leap or a Power Shot; on Hard he is quick to use them. (The lord's own health and damage are the AI's as before.)
// The level: a rival lord rises a level every five waves (5 at most) and learns what a hero bot would (herobot.js TALENT_PREFS); a War Mode
// general starts at a level by the difficulty.
// Online: the host runs the kit; a guest's copy only shows it (the class, the bow out and drawn: `net` in the lord's snapshot entry, netsync.js).
import * as THREE from 'three';
import { PLAYER, UNIT_TYPES, WORLD } from './config.js';
import { Buffs, CLASS_IDS, RANGER, RUSH, LEAP, VOLLEY_Q, abilityOf, classOf, isClassId } from './classes.js';
import { talentFx, talentBlock, talentsOf, treeMods } from './talents.js';
import { talentPointsFor, MAX_LEVEL } from './heroes.js';
import { TALENT_PREFS } from './herobot.js';
import { allied } from './teams.js';
import { rigSetBow } from './models.js';

// the class each style of lord fights as (rivals.js PERSONAS), and the plain lords' by house (Aldmoor, Varr, Elden, Sol)
export const PERSONA_CLASS = { rusher: 'berserker', turtler: 'knight', breaker: 'mage', raider: 'ranger', merchant: 'cleric', zealot: 'cleric', warlord: 'knight', titan: 'berserker', opportunist: 'ranger' };
const HOUSE_CLASS = ['knight', 'berserker', 'cleric', 'mage'];
export const LORD_CLASSES = ['knight', 'berserker', 'ranger', 'mage', 'cleric'];

// How well a lord uses his abilities: [easy, hard]; normal is in between (DIFFICULTY.aiAggro 0.7 / 1 / 1.3, as for the hero bots).
const SKILL = {
  think: [0.9, 0.3],    // seconds between two looks for an opening
  see: [0.5, 0.95],     // the chance a look sees an opening that is there
  slack: [3, 0.3],      // seconds (at most, at random) an ability waits once it is ready
  aim: [0.08, 0.02],    // radians of aim error
};
const SCAN = 50;        // how far he looks around him (metres)
const RANGER_LORD = { range: 34, cd: 1.5 };   // a Ranger lord's ordinary shots: reach and seconds between two (a lord's damage each)
const LIFT_MAX = 12;    // (metres above the ground the snapshot can tell: a leap's arc)
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const lerp = (a, b, t) => a + (b - a) * t;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;

// The class of house f's lord.
export function lordClass(g, f) {
  const id = f && f.rival && f.rival.persona && f.rival.persona.id;
  if (id && PERSONA_CLASS[id]) return PERSONA_CLASS[id];
  if (g.war) return LORD_CLASSES[Math.floor(Math.random() * LORD_CLASSES.length)];
  return HOUSE_CLASS[f ? f.team & 3 : 0];
}

// The class a lord's snapshot entry names (a guest builds his look from it), or null.
export function netClass(v) {
  const id = CLASS_IDS[(v | 0) & 7];
  return isClassId(id) ? id : null;
}

// Make lord u a hero of class `cls`. opts.view: a guest's copy (it only shows what the host's does).
export function attachKit(u, cls, opts = {}) {
  if (!isClassId(cls)) cls = 'knight';
  u.kit = new LordKit(u, cls, opts);
  return u.kit;
}

export class LordKit {
  constructor(u, cls, opts = {}) {
    this.u = u;
    this.g = u.game;
    this.view = !!opts.view;
    this.bowOn = false;
    this.draw = null;       // a Power Shot or a Sniper Shot being drawn: { slot, t, full, o }
    this.bowT = 0;          // the bow goes back on the shoulder when this runs out
    this.stats = { q: 0, r: 0, looks: 0 };
    u.classId = cls;
    // the Ranger fights with the bow: she shoots from a distance as an archer does (never from a wall post: units.js), her bow always out
    if (cls === 'ranger') { u.ranged = true; u.range = RANGER_LORD.range; u.cd = RANGER_LORD.cd; this.bow(true); }
    if (this.view) return;
    const g = this.g;
    // what the abilities ask of a hero (classes.js Abilities): cooldowns, timed effects, talents and the class numbers
    u.abilCd = { q: 3 + Math.random() * 4, r: 3 + Math.random() * 4 };   // (not the moment he rises)
    u.buffs = new Buffs();
    u.talents = {};
    u.talentRev = 0;
    u.level = 1;
    u.dash = null; u.leap = null; u.rushEnd = false; u.bwave = null;
    const kit = this;
    Object.defineProperties(u, {
      mods: { configurable: true, get() { return kit.mods(); } },
      meleeDmg: { configurable: true, get() { return u.dmg * kit.mods().melee * (u.hp < u.maxHp * 0.5 ? 1 + (kit.mods().bloodied || 0) : 1); } },
      bowDmg: { configurable: true, get() { return PLAYER.bowDmg * kit.k * kit.mods().bow; } },
      talentPoints: { configurable: true, get() { return talentPointsFor(u.level) - Object.keys(u.talents).length; } },
    });
    u.abilityCd = (slot) => { const d = abilityOf(u, slot); return d.cd * (kit.mods().cd || 1) * talentFx(u, 'cd_' + d.id, 1); };
    u.heal = (n) => { u.hp = Math.min(u.maxHp, u.hp + n); };
    u.eyePos = (out = new THREE.Vector3()) => out.set(u.pos.x, u.pos.y + u.height * 0.86, u.pos.z);
    this.k = u.dmg / UNIT_TYPES.lord.dmg;   // (how much stronger than a plain lord: the war's length and the difficulty; his spells and bow grow with it)
    const aggro = g.diff && g.diff.aiAggro !== undefined ? g.diff.aiAggro : 1;
    this.skill = Math.max(0, Math.min(1, (aggro - 0.7) / 0.6));
    this.sk = {};
    for (const key in SKILL) this.sk[key] = lerp(SKILL[key][0], SKILL[key][1], this.skill);
    this.need = this.skill < 0.34 ? 1 : 0;   // (Easy wants one more foe in a knot)
    this.next = 1 + Math.random();
    this.round = g.round;
    this.readyAt = { q: -1, r: -1 };
    this.lastHp = u.hp; this.recent = 0;
    this.foes = []; this.dist = []; this.friends = [];
    this.n = { c3: 0, c5: 0, c8: 0, c12: 0, heroes8: 0, near: 1e9, heroNear: 1e9 };
    this.levelUp(true);
  }

  // the class numbers with the talents learnt (not the hero levels: a lord grows with the war instead), spells by the lord's strength
  mods() {
    const u = this.u;
    if (this._mr !== u.talentRev || !this._m) {
      this._mr = u.talentRev;
      const m = { ...classOf(u.classId).mods }, t = treeMods(u);
      for (const k in t.mul) m[k] = (m[k] ?? 1) * t.mul[k];
      for (const k in t.add) m[k] = (m[k] ?? 0) + t.add[k];
      m.spell = (m.spell || 1) * this.k;
      this._m = m;
    }
    return this._m;
  }

  // the lord's level: one every five waves of a war (5 at most); a War Mode general's by the difficulty. A new level brings talents.
  levelUp(first = false) {
    const u = this.u, g = this.g;
    const lv = Math.max(1, Math.min(MAX_LEVEL, g.war ? 1 + Math.round(this.skill * 2) : 1 + Math.floor((g.round || 0) / 5)));
    if (lv <= u.level && !first) return;
    u.level = Math.max(u.level, lv);
    const prefs = TALENT_PREFS[u.classId] || [];
    for (let guard = 0; u.talentPoints > 0 && guard < 8; guard++) {
      const id = prefs.find((t) => !talentBlock(u, t)) || (talentsOf(u.classId).find((t) => !talentBlock(u, t.id)) || {}).id;
      if (!id) break;
      u.talents[id] = true;
      u.talentRev++;
    }
    if (!first) g.fx.gold(u.chest(V1).setY(u.pos.y + u.height + 0.3));   // (a lord who rises a level glints, as a veteran does)
  }

  // ------------------------------------------------------------------------------------------------ every frame
  // The host's (single player's) frame of the lord, from Unit.update. Returns true while the kit carries his body this frame (a run, a leap,
  // a bow being drawn): the soldier's own thinking, walking and swinging wait.
  update(dt) {
    const u = this.u, g = this.g;
    for (const s of ['q', 'r']) {
      if (u.abilCd[s] > 0) { u.abilCd[s] = Math.max(0, u.abilCd[s] - dt); this.readyAt[s] = -1; }
      else if (this.readyAt[s] < 0) this.readyAt[s] = g.time + this.sk.slack * Math.random();
    }
    u.buffs.update(dt);
    const haste = u.buffs.get('haste');   // (his own Rally Cry: the soldier's own haste is what speeds his feet)
    if (haste) { u.hasteT = Math.max(u.hasteT, u.buffs.time('haste')); u.hasteMul = haste; }
    if (u.hp < this.lastHp) this.recent += this.lastHp - u.hp;
    this.lastHp = u.hp;
    this.recent *= Math.pow(0.5, dt);   // (what he has taken lately: halves every second)
    if (u.leap) { this.fly(dt); return true; }
    if (u.dash) { this.run(dt); return true; }
    if (this.draw) { this.drawing(dt); return true; }
    if (u.buffs.has('whirl')) { u.struck = true; u.attackTimer = Math.max(u.attackTimer, 0.15); }   // (spinning: no sword blows of his own)
    if (this.bowOn && !u.ranged && (this.bowT -= dt) <= 0) this.bow(false);
    if (u.staggerT > 0 || !this.armed()) return false;
    if ((this.next -= dt) <= 0) {
      this.next = this.sk.think * (0.8 + 0.4 * Math.random());
      if (g.round !== this.round) { this.round = g.round; this.levelUp(); }
      this.think();
    }
    return !!(u.leap || u.dash || this.draw);
  }

  armed() {
    const u = this.u, g = this.g;
    return u.alive && !u.crewOf && g.simulating && g.state === 'playing' && !(g.war && !g.war.fighting);
  }

  // the pose and place of the body for a frame the kit has carried
  body(dt, moving) {
    const u = this.u;
    u.animate(dt, moving);
    u.mesh.position.copy(u.pos);
    u.mesh.rotation.y = u.yaw;
  }

  // The Leap: along the planned arc, as a hero flies it (Player.flyLeap); the slam comes from Abilities when the arc's time is up.
  fly(dt) {
    const u = this.u, L = u.leap;
    L.t += dt;
    const s = Math.min(1, L.t / L.dur);
    u.pos.set(L.from.x + (L.to.x - L.from.x) * s, L.from.y + (L.to.y - L.from.y) * s + 4 * L.apex * s * (1 - s), L.from.z + (L.to.z - L.from.z) * s);
    u.vel.set((L.to.x - L.from.x) / L.dur, 0, (L.to.z - L.from.z) / L.dur);
    u.yaw = Math.atan2(L.to.x - L.from.x, L.to.z - L.from.z);
    if (s >= 1) { u.leap = null; u.pos.copy(L.to); u.vel.set(0, 0, 0); }
    this.body(dt, s < 1);
  }

  // Shield Bash's run and the Lance Charge: along the ground at the run's speed (Player.move with a dash), the shield up for the bash; the
  // run is over when its time is up or a foe stands at the shield (Abilities then bashes, or ends the charge where it stopped).
  run(dt) {
    const u = this.u, g = this.g, d = u.dash, phys = g.physics;
    u.yaw = Math.atan2(d.x, d.z);
    if (d.rush === 'bash') u.blockFlash = 0.2;
    if (d.rush === 'bash' && this.foeAhead(d)) u.dash = null;
    else if ((d.t -= dt) <= 0) u.dash = null;
    else {
      u.vel.set(d.x * d.v, 0, d.z * d.v);
      const L = WORLD.playHalf;
      u.pos.x = Math.max(-L, Math.min(L, u.pos.x + u.vel.x * dt));
      u.pos.z = Math.max(-L, Math.min(L, u.pos.z + u.vel.z * dt));
      phys.resolve(u.pos, u.radius, u.pos.y, u.height, u.team);
      const ground = phys.groundHeight(u.pos.x, u.pos.z, u.pos.y + RUSH.climb, u.team);
      u.pos.y = ground < u.pos.y - 0.05 ? Math.max(ground, u.pos.y - 12 * dt) : ground;
    }
    if (!u.dash) u.vel.multiplyScalar(0.3);
    this.body(dt, !!u.dash);
  }

  // a foe right in front of the shield (Player.foeAhead)
  foeAhead(f) {
    const u = this.u, x = u.pos.x + f.x * 1.2, z = u.pos.z + f.z * 1.2, y = u.pos.y;
    let hit = false;
    this.g.grid.query(x, z, RUSH.reach + 2, (o) => {
      if (hit || !o.alive || o === u || allied(o.team, u.team) || o.drive || Math.abs(o.pos.y - y) > 2.5) return;
      if (Math.hypot(o.pos.x - x, o.pos.z - z) - (o.radius || 0.4) <= RUSH.reach) hit = true;
    });
    return hit;
  }

  // The Ranger's draw: the bow comes up and the string back, held on the mark, then loosed (Power Shot by itself when drawn, the Sniper Shot
  // once the aim has settled).
  drawing(dt) {
    const u = this.u, D = this.draw, o = D.o;
    if (!o || !o.alive || u.staggerT > 0 || !this.armed()) { this.draw = null; this.bowT = 0.4; u.swingT = -1; u.attackTimer = Math.max(u.attackTimer, 0.3); this.body(dt, false); return; }
    D.t += dt;
    const want = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    let dy = want - u.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    u.yaw += dy * Math.min(1, dt * 8);
    u.swingT = 0.42 * Math.min(1, D.t / (D.full * 0.75));
    u.struck = true;
    u.vel.multiplyScalar(0.5);
    if (D.t >= D.full) {
      this.draw = null;
      const speed = D.slot === 'r' ? RANGER.snipe.speed : RANGER.power.speed;
      this.aimAt(o, speed, D.slot === 'r' ? 0.4 : 1, V2);
      if (this.use(D.slot, V2, null)) this.stats[D.slot]++;
      this.bowT = 1.1;
      u.attackTimer = Math.max(u.attackTimer, 0.8);
    }
    this.body(dt, false);
  }

  bow(on) {
    const u = this.u;
    this.bowOn = on;
    if (on) this.bowT = 1.5;
    rigSetBow(u.model, on);
  }

  // what the snapshot entry of this lord carries for the guests: his class, the bow out and drawn (and, for War Mode, which leaves out the
  // height, how far above the ground a leap has carried him: liftOf)
  net() { return (CLASS_IDS.indexOf(this.u.classId) & 7) | (this.bowOn ? 8 : 0) | (this.draw ? 16 : 0); }
  liftOf() {
    const u = this.u;
    if (!u.leap) return 0;
    return Math.max(0, Math.min(LIFT_MAX, Math.round((u.pos.y - this.g.physics.terrainHeight(u.pos.x, u.pos.z)) * 10) / 10));
  }

  // A guest's frame: the bow, and the draw held as the host's is.
  netUpdate() {
    const u = this.u, v = u.kitNet | 0;
    if (!!(v & 8) !== this.bowOn) { this.bowOn = !!(v & 8); rigSetBow(u.model, this.bowOn); }
    if (v & 16) { u.swingT = Math.max(u.swingT, 0.3); if (u.swingT > 0.42) u.swingT = 0.42; }
  }

  // What reaches the lord of a blow (Unit.takeDamage): his Bulwark, Frost Ward and the talents that answer blows, as a hero's (Player.takeDamage).
  soak(amount, attacker, info) {
    const u = this.u, g = this.g, b = u.buffs;
    const reflect = b.get('reflect');
    if (reflect && info.melee && attacker && attacker !== u && attacker.alive) g.damage(attacker, amount * reflect, u, { magic: true, splash: true });
    const store = u.bwave;
    if (store && info.melee && attacker && attacker !== u && attacker.alive && store.t < store.delay) store.sum += amount * store.wave.share;
    const guard = b.get('guard');
    if (guard) amount *= guard;
    if (b.has('ward')) {
      amount = b.absorb(amount);
      g.fx.frost(u.chest(V1), 6);
      if (!b.has('ward')) g.abilities.shatter(u);
    }
    return amount;
  }
  steady() { return !this.view && this.u.buffs.has('steady'); }

  // ------------------------------------------------------------------------------------------------ deciding
  ready(s) { const u = this.u; return u.abilCd[s] <= 0 && this.readyAt[s] >= 0 && this.g.time >= this.readyAt[s]; }

  scan() {
    const u = this.u, g = this.g, me = u.pos, foes = this.foes, dist = this.dist, friends = this.friends, n = this.n;
    foes.length = 0; dist.length = 0; friends.length = 0;
    n.c3 = n.c5 = n.c8 = n.c12 = n.heroes8 = 0; n.near = n.heroNear = 1e9;
    g.grid.query(me.x, me.z, SCAN, (o) => {
      if (o === u || !o.alive || o.drive) return;
      const d = Math.hypot(o.pos.x - me.x, o.pos.z - me.z);
      if (d > SCAN) return;
      if (allied(o.team, u.team)) { if (d < 28) friends.push(o); return; }
      const gap = d - (o.radius || 0.4);
      foes.push(o); dist.push(gap);
      if (gap < 3) n.c3++;
      if (gap < 5) n.c5++;
      if (gap < 8) n.c8++;
      if (gap < 12) n.c12++;
      const hero = o.isPlayer || (o.isHero && o.kit);
      if (hero && gap < 8) n.heroes8++;
      if (gap < n.near) n.near = gap;
      if (hero && gap < n.heroNear) n.heroNear = gap;
    });
  }

  // foes within r metres of a point
  countAt(x, z, r) {
    let c = 0;
    for (const o of this.foes) if (Math.hypot(o.pos.x - x, o.pos.z - z) < r + (o.radius || 0.4)) c++;
    return c;
  }

  // may his feet take him there (a run or a leap)? A lord who holds his castle or a place in the line only goes for foes near it
  inReach(o) {
    const u = this.u;
    if (Math.abs(o.pos.y - u.pos.y) > 3) return false;
    let a = null, r = 0;
    if (u.order === 'defend' && u.homeCastle && !u.homeCastle.fallen) { a = u.homeCastle.center; r = 45; }
    else if (u.order === 'hold' && u.orderData && u.orderData.pos) { a = u.orderData.pos; r = 30; }
    return !a || Math.hypot(o.pos.x - a.x, o.pos.z - a.z) < r;
  }

  // a clear line for a bolt or an arrow from his eyes (sampled: a wall or a merlon in the way)
  clearShot(o) {
    const u = this.u, ph = this.g.physics, e = u.eyePos(V1), c = o.isStructure ? o.pos : o.chest(V3);
    const d = Math.hypot(c.x - e.x, c.z - e.z), n = Math.max(2, Math.ceil(d / 1.2));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (ph.pointHit(e.x + (c.x - e.x) * k, e.y + (c.y - e.y) * k, e.z + (c.z - e.z) * k, u.team)) return false;
    }
    return true;
  }

  // the direction from his eyes to where foe o will be when something of this speed gets there, off by his skill
  aimAt(o, speed, noise = 1, out = new THREE.Vector3()) {
    const u = this.u, e = u.eyePos(V1), c = o.isStructure ? V3.copy(o.pos) : o.aimPoint ? o.aimPoint(V3) : o.chest(V3);
    const t = Math.hypot(c.x - e.x, c.z - e.z) / speed, v = o.vel;
    const x = c.x + (v ? v.x * t : 0) - e.x, y = c.y - e.y, z = c.z + (v ? v.z * t : 0) - e.z;
    const h = Math.hypot(x, z) || 1e-6, err = this.sk.aim * noise;
    const yaw = Math.atan2(x, z) + gauss() * err, pitch = Math.atan2(y, h) + gauss() * err * 0.6;
    u.yaw = yaw;
    return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  look() {
    const u = this.u;
    return V2.set(Math.sin(u.yaw), 0, Math.cos(u.yaw));
  }

  // Q and R, class by class, as the hero bots use them (herobot.js planAbilities): on groups and rival heroes, the defence when it is needed.
  think() {
    const u = this.u, n = this.n;
    const q = this.ready('q'), r = this.ready('r');
    if (!q && !r) return;
    this.stats.looks++;
    if (Math.random() > this.sk.see) return;
    this.scan();
    const t = u.target && u.target.alive ? u.target : null;
    const foe = t && !t.isStructure && !t.isSiege ? t : null;
    const gap = foe ? Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) - (foe.radius || 0.4) : Infinity;
    const hpf = u.hp / u.maxHp, heavy = this.recent > u.maxHp * 0.12, need = this.need;
    switch (u.classId) {
      case 'knight':
        if (r && (n.c8 >= 3 + need || (hpf < 0.6 && n.c8 >= 1) || (n.heroes8 && hpf < 0.8) || (heavy && n.c8))) { this.cast('r', this.look()); break; }
        // Shield Bash: at hand on a knot or a rival hero, or a run at one up to 40 m off
        if (q && foe && gap < 5 && (((foe.isPlayer || foe.kit) && gap < 4) || this.countAt(u.pos.x + Math.sin(u.yaw) * 3, u.pos.z + Math.cos(u.yaw) * 3, 3.4) >= 2 + need)) {
          this.cast('q', this.aimAt(foe, 1e3, 1, V2), foe.pos.clone());
        } else if (q && hpf > 0.4 && n.c5 === 0) this.runAt('bash', 8, 40, 3 + need);
        break;
      case 'berserker':
        if (r && hpf > 0.35 && this.leapIn(4 + need)) break;
        if (q && hpf > 0.2 && (n.c3 >= 2 + need || n.heroNear < 3.5 || (foe && gap < 3 && foe.maxHp > 200))) this.cast('q', this.look());
        break;
      case 'ranger':
        if (r && !heavy && n.c8 === 0 && this.sniperShot()) break;
        if (q) { if (abilityOf(u, 'q').id === VOLLEY_Q.id) this.volley(3 + need); else this.powerShot(3 + need); }
        break;
      case 'mage':
        if (r && ((n.c8 >= 1 && (hpf < 0.85 || n.c8 >= 2)) || (heavy && hpf < 0.7))) { this.cast('r', this.look()); break; }
        if (q) this.bolt('q', 1.5, 38, 40);
        break;
      case 'cleric': {
        let hurt = 0;
        for (const f of this.friends) if (f.hp < f.maxHp * 0.65 && Math.hypot(f.pos.x - u.pos.x, f.pos.z - u.pos.z) < 14) hurt += f.isPlayer || f.isHero ? 2 : 1;
        if (r && (hpf < 0.5 || hurt >= 4 + need || (hpf < 0.7 && hurt >= 2))) { this.cast('r', this.look()); break; }
        if (q) this.bolt('q', 2, 90, 1e3);
        break;
      }
      case 'cavalier':
        if (q && hpf > 0.35 && this.runAt('lancecharge', 5, 45, 2 + need)) break;
        if (r && ((this.friends.length >= 3 && n.c12 >= 2) || (hpf < 0.55 && n.c8 >= 1))) this.cast('r', this.look());
        break;
      default: break;
    }
  }

  // Fireball or Smite: at a rival hero, a group, anything in reach with a clear line; else the gate or keep he is breaking.
  bolt(slot, lo, hi, speed) {
    const u = this.u;
    let best = null, bs = -1;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < lo || d > hi) continue;
      let s = this.countAt(o.pos.x, o.pos.z, 3.8) + (o.isPlayer || o.kit ? 3 : 0) - d * 0.02;
      if (o === u.target) s += 0.5;
      if (s > bs && this.clearShot(o)) { bs = s; best = o; }
    }
    const t = u.target;
    if (!best && t && t.alive && t.isStructure && (t.kind === 'gate' || t.kind === 'keep') && u.distTo(t) < hi && u.distTo(t) > lo - 1.5) best = t;
    if (!best) return false;
    return this.cast(slot, this.aimAt(best, speed, 1, V2));
  }

  // the long runs (Shield Bash, Lance Charge) at a rival hero or the densest knot of foes lo..hi m off, with nothing in the way
  runAt(id, lo, hi, need) {
    const u = this.u, A = this.g.abilities;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < lo || d > hi || !this.inReach(o)) continue;
      const s = (o.isPlayer || o.kit ? 3 : 0) + this.countAt(o.pos.x, o.pos.z, 3.4);
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < need) return false;
    const dx = best.pos.x - u.pos.x, dz = best.pos.z - u.pos.z, l = Math.hypot(dx, dz) || 1, over = id === 'lancecharge' ? 8 : 0;
    const plan = A.rushPlan(u, u.pos, V3.set(best.pos.x + (dx / l) * over, best.pos.y, best.pos.z + (dz / l) * over));
    if (!plan || plan.d < l - 2) return false;   // (something in the way: he walks round)
    u.yaw = Math.atan2(dx, dz);
    return this.cast('q', V2.set(dx / l, 0, dz / l), plan.to.clone());
  }

  // Leap into a rival hero or a knot of foes 9..45 m off (where they will be when he comes down); not when foes are at hand already
  leapIn(need) {
    const u = this.u, A = this.g.abilities, n = this.n;
    if (n.c5 >= 2) return false;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 9 || d > 45 || Math.abs(o.pos.y - u.pos.y) > 4 || !this.inReach(o)) continue;
      let s = o.isPlayer || o.kit ? 4 : 0;
      for (const f of this.foes) if (!f.isSiege && Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < LEAP.radius) s += f.isPlayer || f.kit ? 2 : 1;
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < need) return false;
    const T = A.leapArc(Math.hypot(best.pos.x - u.pos.x, best.pos.z - u.pos.z)).dur * (0.4 + 0.4 * this.skill);   // (a poorer lord leads them less)
    const x = best.pos.x + (best.vel ? best.vel.x * T : 0), z = best.pos.z + (best.vel ? best.vel.z * T : 0);
    const plan = A.leapPlan(u, u.pos, V3.set(x, best.pos.y, z));
    if (!plan || Math.hypot(plan.to.x - x, plan.to.z - z) > LEAP.radius * 0.8) return false;   // (a wall in the way: he walks round)
    u.yaw = Math.atan2(x - u.pos.x, z - u.pos.z);
    return this.cast('r', this.look(), plan.to.clone());
  }

  // Sniper Shot: a far rival hero above all, else a giant, a boss or an engine's crew, 22 m off and more, with a clear line
  sniperShot() {
    const u = this.u, g = this.g, S = RANGER.snipe, me = u.pos;
    let best = null, bs = 0;
    const consider = (o) => {
      if (!o.alive || allied(o.team, u.team) || o.drive || o === u) return;
      const d = Math.hypot(o.pos.x - me.x, o.pos.z - me.z);
      if (d < 22 || d > S.range - 4) return;
      const s = (o.isPlayer || o.kit ? 6 : o.isGiant || (o.def && o.def.boss) ? 4 : o.isCrew || o.crewOf ? 3 : 0) + d * 0.01;
      if (s >= 3 && s > bs && this.clearShot(o)) { bs = s; best = o; }
    };
    for (const h of g.humans) consider(h);
    for (const f of g.factions) if (f && f.hero && f.hero.kit) consider(f.hero);
    if (!best) g.grid.query(me.x, me.z, S.range, (o) => { if (!o.isPlayer && (o.isGiant || o.isCrew || o.crewOf || (o.def && o.def.boss))) consider(o); });
    if (!best) return false;
    return this.beginDraw('r', best, S.draw + S.settle * (1.1 + (1 - this.skill) * 0.6));
  }

  // Power Shot: along the line with the most foes in it (a rival hero is worth three)
  powerShot(need) {
    const u = this.u, ex = u.pos.x, ez = u.pos.z;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 4 || d > 60) continue;
      const dx = o.pos.x - ex, dz = o.pos.z - ez, l = Math.hypot(dx, dz) || 1;
      let s = 0;
      for (const f of this.foes) {
        if (f.isSiege) continue;
        const fx = f.pos.x - ex, fz = f.pos.z - ez, along = (fx * dx + fz * dz) / l;
        if (along < 2 || along > 70 || Math.abs((fx * dz - fz * dx) / l) > 1) continue;
        s += f.isPlayer || f.kit ? 3 : 1;
      }
      if (s > bs && s >= need && this.clearShot(o)) { bs = s; best = o; }
    }
    if (!best) return false;
    return this.beginDraw('q', best, RANGER.power.draw * talentFx(u, 'powerDraw', 1));
  }

  // Arrow Volley (a Ranger talent puts it in Power Shot's place): on the densest knot of foes in reach
  volley(need) {
    const u = this.u;
    let best = null, bs = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const o = this.foes[i], d = this.dist[i];
      if (o.isSiege || d < 9 || d > 55) continue;
      const s = this.countAt(o.pos.x, o.pos.z, 6);
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < need) return false;
    const at = new THREE.Vector3(best.pos.x, this.g.physics.groundHeight(best.pos.x, best.pos.z, best.pos.y + 3), best.pos.z);
    this.bow(true);
    return this.cast('q', this.aimAt(best, 1e3, 1, V2), at);
  }

  beginDraw(slot, o, full) {
    const u = this.u;
    if (u.abilCd[slot] > 0) return false;
    this.draw = { slot, t: 0, full, o };
    this.bow(true);
    u.swingT = 0; u.struck = true;
    this.g.audio.play('bow', u.pos);
    return true;
  }

  // Use an ability now. The run, the leap and the draw are set off here (as Player.useAbility does for a hero), the rest is Abilities'.
  cast(slot, dir, at = null) {
    const u = this.u, A = this.g.abilities, def = abilityOf(u, slot);
    if (u.abilCd[slot] > 0 || u.staggerT > 0) return false;
    if (def.id === 'bash' || def.id === 'lancecharge') {
      const plan = at ? A.rushPlan(u, u.pos, at) : null;
      if (plan && !(def.id === 'bash' && this.foeAhead(plan.f))) {
        const v = A.rushSpeed(u, def.id);
        u.dash = { x: plan.f.x, z: plan.f.z, v, t: plan.d / v, rush: def.id, plan, fresh: true };
        at = plan.to;
      } else if (def.id === 'lancecharge') return false;
      else at = null;   // (no room to run, or a foe already at the shield: the bash where he stands)
    } else if (def.id === 'leap') {
      const plan = at ? A.leapPlan(u, u.pos, at) : null;
      if (!plan) return false;
      u.dash = null;
      u.leap = { ...plan, t: 0 };
      at = plan.to;
    }
    if (!this.use(slot, dir, at)) { u.dash = null; u.leap = null; return false; }
    this.stats[slot]++;
    return true;
  }

  use(slot, dir, at) {
    const u = this.u;
    const ok = this.g.abilities.use(u, slot, u.eyePos(new THREE.Vector3()), dir, at);
    if (ok) {
      u.struck = true;   // (the swing an ability shows is not a blow of his sword: Unit.updateAttack)
      u.attackTimer = Math.max(u.attackTimer, 0.35);
    }
    return ok;
  }
}
