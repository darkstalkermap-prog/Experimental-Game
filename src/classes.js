// Hero classes. Every hero picks one of six classes before the battle; each has its own strengths and two abilities:
// Q is an attack, R is a defence. The abilities are simulated where the world is (single player or host);
// their look and sound is replayed on every screen.
import * as THREE from 'three';
import { SPELLS } from './config.js';
import { allied } from './teams.js';

export const CLASS_IDS = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];

// mods: hp and speed multiply, armor adds, melee / bow / spell multiply damage.
export const CLASSES = {
  knight: {
    name: 'Knight', icon: '🛡', color: '#a9bfe3', role: 'Vanguard',
    blurb: 'Plate armour and a tower shield: the hardest hero to bring down.',
    mods: { hp: 1.3, armor: 5, speed: 0.94, melee: 1, bow: 0.8, spell: 1, block: 0.1 },
    passive: 'Your shield blocks 10% more of the damage from the front.',
    q: { id: 'bash', icon: '💥', name: 'Shield Bash', cd: 9, desc: 'Lunge forward and slam your shield into everything ahead: heavy damage, knocked back and stunned.' },
    r: { id: 'bulwark', icon: '🛡', name: 'Bulwark', cd: 18, desc: 'Plant your shield. For 5 s you take 70% less damage and cannot be staggered; allies beside you take 40% less.' },
  },
  berserker: {
    name: 'Berserker', icon: '🪓', color: '#e0705a', role: 'Duelist',
    blurb: 'Light armour and a terrible temper. Hits harder than anyone, but is easier to hurt.',
    mods: { hp: 1.1, armor: -1, speed: 1.07, melee: 1.3, bow: 0.6, spell: 1, bloodied: 0.15 },
    passive: 'Below half health you hit 15% harder.',
    q: { id: 'whirl', icon: '🌀', name: 'Whirlwind', cd: 9, desc: 'Spin with your blade for a second, cutting everyone around you three times.' },
    r: { id: 'bloodrage', icon: '🩸', name: 'Blood Rage', cd: 18, desc: 'For 7 s you heal for half the damage you deal, cannot be staggered and hit 25% harder.' },
  },
  ranger: {
    name: 'Ranger', icon: '🏹', color: '#7fc47a', role: 'Marksman',
    blurb: 'Quick and deadly at range, but fragile when caught in melee.',
    mods: { hp: 0.85, armor: 0, speed: 1.1, melee: 0.8, bow: 1.4, spell: 1, draw: 0.8 },
    passive: 'Draws the bow 20% faster.',
    q: { id: 'volley', icon: '🏹', name: 'Arrow Volley', cd: 10, desc: 'Loose nine arrows in a fan, for free. Good against packed ranks.' },
    r: { id: 'evade', icon: '💨', name: 'Evasive Roll', cd: 7, desc: 'Throw yourself nine metres the way you are moving (back if standing still). Nothing can hurt you for under a second.' },
  },
  mage: {
    name: 'Mage', icon: '🔥', color: '#ff9a4a', role: 'Battle mage',
    blurb: 'Frail, but a walking siege engine. Spells fly where you aim and burn walls and men alike.',
    mods: { hp: 0.75, armor: -1, speed: 1, melee: 0.7, bow: 0.9, spell: 1.25, cd: 0.85 },
    passive: 'Both abilities recharge 15% faster.',
    q: { id: 'fireball', icon: '🔥', name: 'Fireball', cd: 7, desc: 'Hurl a fireball that explodes on impact, scorching everything around it and burning gates and engines.' },
    r: { id: 'ward', icon: '❄', name: 'Frost Ward', cd: 16, desc: 'A shell of ice soaks up the next 170 damage for 8 s, and chills and staggers enemies close to you.' },
  },
  cleric: {
    name: 'Cleric', icon: '✚', color: '#f2e08c', role: 'Support',
    blurb: 'Holy light for friend and foe. Keeps the army on its feet.',
    mods: { hp: 1, armor: 2, speed: 1, melee: 0.9, bow: 0.8, spell: 1.1, regen: 2.5 },
    passive: 'Health regenerates two and a half times faster out of combat.',
    q: { id: 'smite', icon: '⚡', name: 'Smite', cd: 8, desc: 'Call a bolt of holy light down on the spot you are aiming at, blasting everyone near it.' },
    r: { id: 'heal', icon: '✚', name: 'Healing Light', cd: 14, desc: 'Heal yourself for 45% of your health and every ally within 14 m for 40% of theirs.' },
  },
  cavalier: {
    name: 'Cavalier', icon: '🐎', color: '#e8b84a', role: 'Shock cavalry',
    blurb: 'Starts with a warhorse. Rides down the enemy and keeps the whole army moving.',
    mods: { hp: 1.1, armor: 3, speed: 1, melee: 1, bow: 0.8, spell: 1, horse: true, rider: 0.7, trample: 1.25 },
    passive: 'Mounted, the horse shields you (30% less damage) and tramples 25% harder.',
    q: { id: 'lancecharge', icon: '🐎', name: 'Lance Charge', cd: 10, desc: 'Charge straight ahead for a second at full gallop (on foot, a rush), flattening everyone in your path.' },
    r: { id: 'rally', icon: '📯', name: 'Rally Cry', cd: 20, desc: 'A war cry for every ally within 28 m: 30% less damage taken and 25% faster for 8 s (you take 40% less).' },
  },
};

export function classOf(id) { return CLASSES[id] || CLASSES.knight; }

// Changing class in the field (shop → Class). Free during the preparation and while waiting to respawn.
export const SWITCH = {
  cooldown: 15,   // seconds before a hero may change class again
  combat: 4,      // not within this long of being hit
  ready: 6,       // the new abilities need this long to ready
};

// Timed effects on a hero. Each has a remaining time and a value (the damage multiplier for 'guard', the
// damage still to absorb for 'ward', ...). Weaker effects never replace stronger ones.
const LOWER_IS_STRONGER = new Set(['guard']);
export class Buffs {
  constructor() { this.b = {}; }
  add(id, t, v = 1) {
    const o = this.b[id];
    if (o && o.t > 0 && (LOWER_IS_STRONGER.has(id) ? o.v < v : o.v > v)) return;
    this.b[id] = { t, v };
  }
  has(id) { const o = this.b[id]; return !!o && o.t > 0; }
  get(id) { const o = this.b[id]; return o && o.t > 0 ? o.v : 0; }
  time(id) { const o = this.b[id]; return o && o.t > 0 ? o.t : 0; }
  clear() { this.b = {}; }
  update(dt) {
    for (const k in this.b) if ((this.b[k].t -= dt) <= 0) delete this.b[k];
  }
  // damage left over after the ward has soaked what it can
  absorb(amount) {
    const w = this.b.ward;
    if (!w || w.t <= 0) return amount;
    const take = Math.min(w.v, amount);
    w.v -= take;
    if (w.v < 0.5) delete this.b.ward;
    return amount - take;
  }
  list() { return Object.entries(this.b).map(([k, o]) => [k, Math.round(o.t * 10) / 10, Math.round(o.v * 100) / 100]); }
  setList(list) {
    this.b = {};
    for (const [k, t, v] of list || []) this.b[k] = { t, v };
  }
}

export const BUFF_NAMES = {
  guard: 'Guarded', steady: 'Unshakable', whirl: 'Whirlwind', lifesteal: 'Bloodthirst', rage: 'Blood Rage', ghost: 'Evading',
  ward: 'Frost Ward', haste: 'Hastened', charging: 'Charging',
};

const ZERO = new THREE.Vector3();
const v3 = (p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100];
const flat = (d) => { const l = Math.hypot(d.x, d.z) || 1; return new THREE.Vector3(d.x / l, 0, d.z / l); };
const C = {
  guard: new THREE.Color(0.55, 0.75, 1.0),
  rage: new THREE.Color(1.0, 0.25, 0.15),
  frost: new THREE.Color(0.6, 0.9, 1.0),
  holy: new THREE.Color(1.0, 0.92, 0.55),
  heal: new THREE.Color(0.6, 1.0, 0.65),
  rally: new THREE.Color(1.0, 0.8, 0.3),
  spark: new THREE.Color(1.0, 0.85, 0.5),
};

export class Abilities {
  constructor(game) {
    this.g = game;
    this.active = [];   // effects that carry on for a moment: whirlwind, lance charge
  }

  // Use an ability. cam: the hero's eye position, dir: where they look. Returns false when it is refused.
  use(p, slot, cam, dir) {
    const def = p.cls[slot];
    if (!def || !p.alive || p.drive) return false;
    if (p.abilCd[slot] > 0.45) return false;   // a little slack for network delay
    p.abilCd[slot] = def.cd * (p.cls.mods.cd || 1);
    this[def.id](p, cam, dir.clone().normalize());
    return true;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const p = e.p;
      e.t += dt;
      if (!p.alive || e.t > e.dur) { this.active.splice(i, 1); continue; }
      if (e.kind === 'whirl') {
        while (e.n < 3 && e.t >= 0.12 + e.n * 0.3) { this.whirlTick(p, e.n); e.n++; }
      } else this.chargeSweep(p, e);
    }
  }

  // ---------- helpers ----------
  eachFoe(team, x, z, r, fn, y = null, dy = 3) {
    const g = this.g;
    g.grid.query(x, z, r + 2.5, (o) => {
      if (!o.alive || allied(o.team, team) || o.drive) return;
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (d - (o.radius || 0.4) > r) return;
      if (y !== null && Math.abs(o.pos.y - y) > dy) return;
      fn(o, d);
    });
    for (const s of g.siege) {
      if (!s.alive || allied(s.team, team)) continue;
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (d - s.radius <= r && (y === null || Math.abs(s.pos.y - y) < dy + 2)) fn(s, d);
    }
  }

  eachFriend(team, x, z, r, fn) {
    this.g.grid.query(x, z, r + 2.5, (o) => {
      if (!o.alive || !allied(o.team, team) || o.drive) return;
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (d <= r) fn(o, d);
    });
  }

  guard(o, t, mul) { if (o.isPlayer) o.buffs.add('guard', t, mul); else if (o.addGuard) o.addGuard(t, mul); }
  haste(o, t, mul) { if (o.isPlayer) o.buffs.add('haste', t, mul); else if (o.addHaste) o.addHaste(t, mul); }

  // where a bolt along (from, dir) lands: the first wall, hill, soldier or engine, else the ground at full range
  rayHit(from, dir, range, team) {
    const g = this.g, phys = g.physics;
    const q = new THREE.Vector3();
    for (let d = 1.5; d <= range; d += 0.6) {
      q.copy(from).addScaledVector(dir, d);
      const col = phys.pointHit(q.x, q.y, q.z, team);
      if (col || q.y < phys.terrainHeight(q.x, q.z)) return { pos: q.clone().addScaledVector(dir, -0.4), col };
      if (g.projectiles.hitCharacter(q, team, 0.35) || g.siegeAt(q, team)) return { pos: q.clone(), col: null };
    }
    const e = from.clone().addScaledVector(dir, range);
    e.y = phys.terrainHeight(e.x, e.z);
    return { pos: e, col: null };
  }

  // ---------- Knight ----------
  bash(p, cam, dir) {
    const g = this.g;
    const f = flat(dir);
    const c = p.pos.clone().addScaledVector(f, 2.8);
    const dmg = p.meleeDmg * 2;
    this.eachFoe(p.team, c.x, c.z, 3.4, (o) => {
      if ((o.pos.x - p.pos.x) * f.x + (o.pos.z - p.pos.z) * f.z < -0.5) return;   // never behind you
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 1 });
      if (!o.alive) return;
      if (o.stagger) o.stagger(1.6, p);
      if (o.vel && !o.isPlayer) { o.vel.x += f.x * 10; o.vel.z += f.z * 10; }
    }, p.pos.y, 3);
    this.emit('bash', c, f);
  }

  bulwark(p) {
    p.buffs.add('guard', 5, 0.3);
    p.buffs.add('steady', 5);
    this.eachFriend(p.team, p.pos.x, p.pos.z, 8, (o) => { if (o !== p) this.guard(o, 5, 0.6); });
    this.emit('bulwark', p.pos, ZERO);
  }

  // ---------- Berserker ----------
  whirl(p) {
    p.buffs.add('whirl', 1.25);
    this.active.push({ kind: 'whirl', p, t: 0, n: 0, dur: 1.3 });
  }

  whirlTick(p, n) {
    const g = this.g;
    const dmg = p.meleeDmg * 0.85;
    this.eachFoe(p.team, p.pos.x, p.pos.z, 4.2, (o) => {
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 0.5 });
      if (o.alive && o.stagger) o.stagger(0.45, p);
    }, p.pos.y, 2.8);
    p.swingT = 0.25;
    p.attackDir = n % 2 ? 'left' : 'right';
    this.emit('whirl', p.pos, ZERO);
  }

  bloodrage(p) {
    p.buffs.add('lifesteal', 7, 0.5);
    p.buffs.add('steady', 7);
    p.buffs.add('rage', 7, 1.25);
    p.heal(p.maxHp * 0.1);
    this.emit('rage', p.pos, ZERO);
  }

  // ---------- Ranger ----------
  volley(p, cam, dir) {
    const g = this.g;
    const base = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const cp = Math.cos(pitch), n = 9, dmg = p.bowDmg * 0.7;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.085;
      const v = new THREE.Vector3(Math.sin(a) * cp, Math.sin(pitch) + (Math.random() - 0.5) * 0.02, Math.cos(a) * cp).normalize();
      const from = cam.clone().addScaledVector(v, 0.7);
      from.y -= 0.08;
      g.projectiles.fireArrow(from, v.multiplyScalar(58), p.team, dmg, p);
    }
    g.audio.play('bow', p.pos);
  }

  evade(p) {
    p.buffs.add('ghost', 0.85);
    this.emit('evade', p.pos, ZERO);
  }

  // ---------- Mage ----------
  fireball(p, cam, dir) {
    const s = SPELLS.fireball;
    const yaw = Math.atan2(dir.x, dir.z);
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const from = cam.clone().addScaledVector(dir, 0.8).addScaledVector(right, 0.2);
    from.y -= 0.15;
    // aim from the hand at the point under the crosshair so the ball lands where you look
    const d = cam.clone().addScaledVector(dir, 40).sub(from).normalize();
    this.g.magic.fireball(p, from, d, s.dmg * p.cls.mods.spell, s.radius);
    p.swingT = 0.25; p.attackDir = 'thrust';
  }

  ward(p) {
    p.buffs.add('ward', 8, 170);
    this.eachFoe(p.team, p.pos.x, p.pos.z, 6.5, (o) => {
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, 3);
      if (o.stagger) o.stagger(0.5, p);
    }, p.pos.y, 3);
    this.emit('ward', p.pos, ZERO);
  }

  // ---------- Cleric ----------
  smite(p, cam, dir) {
    const g = this.g, s = SPELLS.smite;
    const { pos: at, col } = this.rayHit(cam, dir, s.range, p.team);
    const dmg = s.dmg * p.cls.mods.spell;
    this.eachFoe(p.team, at.x, at.z, s.radius, (o, d) => {
      g.damage(o, dmg * (1 - 0.4 * Math.min(1, d / s.radius)), p, { magic: true, splash: true });
      if (o.alive && o.stagger) o.stagger(0.8, { pos: at });
    }, at.y, 4);
    if (col && col.ref && col.ref.takeDamage && !allied(col.ref.team, p.team) && col.ref.kind !== 'wall') col.ref.takeDamage(dmg * 0.5, p);
    const sky = at.clone();
    sky.x += (Math.random() - 0.5) * 3; sky.z += (Math.random() - 0.5) * 3; sky.y += 42;
    g.magic.showBolt([sky, at], s.color);
    g.audio.play('zap', at);
    p.swingT = 0.25; p.attackDir = 'over';
    this.emit('smite', at, ZERO);
  }

  heal(p) {
    p.heal(p.maxHp * 0.45);
    const healed = [];
    this.eachFriend(p.team, p.pos.x, p.pos.z, 14, (o) => {
      if (o === p) return;
      const n = o.maxHp * 0.4;
      if (o.isPlayer) o.heal(n); else o.hp = Math.min(o.maxHp, o.hp + n);
      if (healed.length < 14) healed.push(o.chest(new THREE.Vector3()));
    });
    this.emit('heal', p.pos, ZERO, healed);
  }

  // ---------- Cavalier ----------
  lancecharge(p, cam, dir) {
    const f = flat(dir);
    p.buffs.add('charging', 1.15);
    this.active.push({ kind: 'charge', p, t: 0, dur: 1.15, f, hit: new Set() });
    this.emit('charge', p.pos, f);
  }

  chargeSweep(p, e) {
    const g = this.g;
    const c = p.pos.clone().addScaledVector(e.f, 1.2);
    this.eachFoe(p.team, c.x, c.z, p.mounted ? 2.6 : 2, (o) => {
      if (e.hit.has(o)) return;
      e.hit.add(o);
      g.damage(o, p.meleeDmg * 2 + (p.mounted ? 25 : 0), p, { melee: true, splash: true, charge: 1 });
      if (!o.alive) return;
      if (o.stagger) o.stagger(1.3, p);
      if (o.vel && !o.isPlayer) { o.vel.x += e.f.x * 12; o.vel.z += e.f.z * 12; }
      g.fx.sparks(o.chest(new THREE.Vector3()), 10);
      g.audio.play('thud', o.pos);
    }, p.pos.y, 3);
  }

  rally(p) {
    this.eachFriend(p.team, p.pos.x, p.pos.z, 28, (o) => {
      if (o === p) return;
      this.guard(o, 8, 0.7);
      this.haste(o, 8, 1.25);
    });
    p.buffs.add('guard', 8, 0.6);
    p.buffs.add('haste', 8, 1.25);
    this.emit('rally', p.pos, ZERO);
  }

  // ---------- looks ----------
  // Show the effect here and, in a hosted game, on everyone else's screen too.
  emit(id, pos, dir, targets = null) {
    this.show(id, pos, dir, false, targets);
    const g = this.g;
    if (g.mode === 'host' && g.sync) {
      g.sync.shared.push({ k: 'abil', id, p: v3(pos), d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100], t: targets ? targets.map(v3) : undefined });
    }
  }

  // silent: the sound already arrived as its own event
  show(id, pos, dir, silent = false, targets = null) {
    const g = this.g, fx = g.fx;
    const snd = (n) => { if (!silent) g.audio.play(n, pos); };
    const at = pos.clone();
    const chest = at.clone().setY(at.y + 1.2);
    switch (id) {
      case 'bash':
        fx.dust(at.clone().setY(at.y + 0.2), 10, 2.2);
        fx.sparks(chest, 20);
        fx.ring(at, 2.8, C.guard, 22, { speed: 3 });
        snd('clang'); snd('thud');
        break;
      case 'bulwark':
        fx.ring(at, 1.1, C.guard, 20, { up: 1.5 });
        fx.ring(at, 2.4, C.guard, 28, { up: 1.0 });
        fx.sparks(chest, 14);
        snd('block');
        break;
      case 'whirl':
        fx.ring(at, 3.6, C.spark, 26, { speed: 3, up: 0.6 });
        fx.sparks(chest, 14);
        snd('swing');
        break;
      case 'rage':
        fx.blood(chest, 18);
        fx.ring(at, 1.6, C.rage, 24, { up: 1.8 });
        snd('roar');
        break;
      case 'evade':
        fx.dust(at.clone().setY(at.y + 0.2), 8, 1.2);
        snd('swing');
        break;
      case 'ward':
        fx.frost(chest, 26);
        fx.ring(at, 5.5, C.frost, 38, { speed: 4, up: 0.8 });
        fx.ring(at, 1.2, C.frost, 20, { up: 1.8 });
        snd('ice');
        break;
      case 'smite':
        fx.zap(at, 16);
        fx.ring(at, 3.2, C.holy, 30, { speed: 4, up: 0.9 });
        g.magic.flash(at, 0xffe9a0, 8);
        break;
      case 'heal':
        fx.ring(at, 2, C.heal, 28, { up: 1.8 });
        fx.ring(at, 6, C.holy, 36, { speed: 2.5, up: 1.2 });
        for (const t of targets || []) fx.gold(t);
        snd('buy');
        break;
      case 'charge':
        fx.dust(at.clone().setY(at.y + 0.2), 12, 2);
        snd('swing');
        break;
      case 'rally':
        fx.ring(at, 3, C.rally, 30, { speed: 7, up: 1.2 });
        fx.ring(at, 9, C.rally, 44, { speed: 5, up: 0.8 });
        fx.gold(chest);
        snd('horn');
        break;
      default: break;
    }
  }
}
