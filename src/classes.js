// Hero classes. Every hero picks one of six classes before the battle; each has its own strengths and two abilities:
// Q is an attack, R is a defence. The abilities are simulated where the world is (single player or host);
// their look and sound is replayed on every screen.
import * as THREE from 'three';
import { SPELLS, VOLLEY, TEAM_COLORS } from './config.js';
import { GroundFX } from './groundfx.js';
import { ARROW_SPEED, G_ARROW } from './projectiles.js';
import { allied } from './teams.js';
import { talentFx } from './talents.js';

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
    q: { id: 'volley', icon: '🏹', name: 'Arrow Volley', cd: 10, aimed: true, desc: 'Hold Q to put a circle on the ground, let go and a volley of arrows rains down on it, for free. Good against packed ranks and men behind walls.' },
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

export function classOf(id) { return isClassId(id) ? CLASSES[id] : CLASSES.knight; }
// a class id from outside (a guest's message, storage): an own key, so that 'constructor' and '__proto__' are not classes
export function isClassId(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, id); }

// Experience for the support classes: a Healing Light earns this share of the health it really restores in others (up
// to a cap), and a Rally Cry this much for each ally it reaches (up to a cap).
const SUPPORT_XP = { heal: 0.05, healCap: 40, rally: 3, rallyCap: 24 };

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
  del(id) { delete this.b[id]; }
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
  ward: 'Frost Ward', haste: 'Hastened', charging: 'Charging', reflect: 'Avenging', twin: 'Roll again', focus: 'Focus', snap: 'Cold Snap',
};

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SEE_THROUGH = new Set(['tree']);   // a trunk does not stop you putting a volley on the ground behind it
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
    this.active = [];   // effects that carry on for a moment: whirlwind, lance charge, a volley coming down
    this.rising = [];   // a record of each climbing arrow of a volley while it is in the air (the arrows are drawn by Projectiles.showArrow)
    this.burning = [];  // foes a fireball set alight (Mage talent)
    this.trails = [];   // looks that follow a hero for a moment (the dust of a charge)
    this.gfx = new GroundFX(game);   // the glyphs, shells and columns of light the abilities draw (see groundfx.js)
    this.col = new THREE.Color();
    this.tmpv = new THREE.Vector3();
  }

  // Use an ability. cam: the hero's eye position, dir: where they look, at: a point they chose on the ground (the
  // Ranger's volley). Returns false when it is refused.
  use(p, slot, cam, dir, at = null) {
    const def = p.cls[slot];
    if (!def || !p.alive || p.drive) return false;
    const again = def.id === 'evade' && p.buffs.has('twin');   // Twin Roll: one more roll while the first one's window is open
    if (p.abilCd[slot] > 0.45 && !again) return false;   // a little slack for network delay
    if (!again) p.abilCd[slot] = p.abilityCd(slot);
    this[def.id](p, cam, dir.clone().normalize(), at);
    return true;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const p = e.p;
      e.t += dt;
      if (e.kind === 'rain') {   // already loosed: it comes down even if the Ranger has fallen since
        this.rain(e);
        if (e.n >= e.shots.length) this.active.splice(i, 1);
        continue;
      }
      if (!p.alive || e.t > e.dur) { if (e.kind === 'bwave') p.bwave = null; this.active.splice(i, 1); continue; }
      if (e.kind === 'whirl') {
        while (e.n < e.hits && e.t >= 0.12 + e.n * 0.3) { this.whirlTick(p, e.n, e.n === e.hits - 1); e.n++; }
      } else if (e.kind === 'pulse') {
        if (e.t >= e.delay) { this.healBurst(p, e.scale); this.active.splice(i, 1); }
      } else if (e.kind === 'bwave') {
        if (e.t >= e.delay) { this.bulwarkWave(p, e); this.active.splice(i, 1); }
      } else this.chargeSweep(p, e);
    }
    this.burn(dt);
  }

  // Looks that run on every screen: the glyphs on the ground, shells and columns of light, the dust behind a charging hero.
  updateFx(dt) {
    this.gfx.update(dt);
    for (let i = this.rising.length - 1; i >= 0; i--) { this.rising[i].t += dt; if (this.rising[i].t > 0.9) this.rising.splice(i, 1); }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const e = this.trails[i];
      e.t += dt;
      const w = e.who;
      if (e.t > e.dur || !w || w.alive === false) { this.trails.splice(i, 1); continue; }
      e.acc += dt;
      while (e.acc > 0.04) {   // (a puff of dust and a glint every 40 ms, wherever the hero is now)
        e.acc -= 0.04;
        const fx = this.g.fx, x = w.pos.x, y = w.pos.y, z = w.pos.z;
        this.tmpv.set(x - e.f.x * 0.8, y + 0.3, z - e.f.z * 0.8);
        fx._dust(this.tmpv, 3, 0.55, '');
        if (Math.random() < 0.6) fx._sparks(this.tmpv.set(x + e.f.x * 0.5 + (Math.random() - 0.5) * 1.6, y + 0.9 + Math.random() * 0.8, z + e.f.z * 0.5 + (Math.random() - 0.5) * 1.6), 2);
      }
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
    const dmg = p.meleeDmg * 2 * talentFx(p, 'bashDmg', 1);
    const reach = talentFx(p, 'bashReach', 1), stun = 1.6 + talentFx(p, 'bashStun', 0);
    this.eachFoe(p.team, c.x, c.z, 3.4 * reach, (o) => {
      if ((o.pos.x - p.pos.x) * f.x + (o.pos.z - p.pos.z) * f.z < -0.5) return;   // never behind you
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 1, ability: 'Shield Bash' });
      if (!o.alive) return;
      if (o.stagger) o.stagger(stun, p);
      if (o.vel && !o.isPlayer) { o.vel.x += f.x * 10; o.vel.z += f.z * 10; }
    }, p.pos.y, 3);
    this.emit('bash', c, f, null, reach);
  }

  bulwark(p) {
    const t = 5 + talentFx(p, 'bulwarkTime', 0), reach = 8 + talentFx(p, 'bulwarkRadius', 0);
    p.buffs.add('guard', t, 0.3);
    p.buffs.add('steady', t);
    const reflect = talentFx(p, 'reflect', 0);
    if (reflect) p.buffs.add('reflect', t, reflect);   // Avenging Wall (Knight talent): see Player.takeDamage
    const wave = talentFx(p, 'bulwarkWave', null);   // Bastion Strike (alternative to Avenging Wall): the shield slams down when Bulwark ends
    if (wave) this.active.push(p.bwave = { kind: 'bwave', p, t: 0, dur: t + 1, delay: t, wave, sum: 0 });   // (Player.takeDamage fills the store)
    this.eachFriend(p.team, p.pos.x, p.pos.z, reach, (o) => { if (o !== p) this.guard(o, t, 0.6 - talentFx(p, 'bulwarkAlly', 0)); });
    this.emit('bulwark', p.pos, ZERO, null, reach / 8);
  }

  // Knight talent (Bastion Strike): the end of the Bulwark, a slam of the planted shield all around
  bulwarkWave(p, e) {
    const g = this.g, w = e.wave, foes = [];
    p.bwave = null;
    this.eachFoe(p.team, p.pos.x, p.pos.z, w.radius, (o) => { foes.push(o); }, p.pos.y, 3);
    const each = foes.length ? e.sum / foes.length : 0;   // (what the shield took in is shared out among the foes around it)
    for (const o of foes) {
      if (each > 0) g.damage(o, each, p, { magic: true, splash: true, ability: 'Bastion Strike' });   // (the name the highlight line of the end screen tells)
      if (o.alive && o.stagger) o.stagger(w.stun, p);
    }
    this.emit('bwave', p.pos, ZERO, null, w.radius / 5);
  }

  // ---------- Berserker ----------
  whirl(p) {
    p.buffs.add('whirl', 1.25);
    this.active.push({ kind: 'whirl', p, t: 0, n: 0, dur: 1.3, hits: 3 + talentFx(p, 'whirlHits', 0) });
  }

  whirlTick(p, n, last = false) {
    const g = this.g;
    const dmg = p.meleeDmg * 0.85, reach = talentFx(p, 'whirlRadius', 1);
    let foes = 0;
    this.eachFoe(p.team, p.pos.x, p.pos.z, 4.2 * reach, (o) => {
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 0.5, ability: 'Whirlwind' });
      if (o.alive && o.stagger) o.stagger(0.45, p);
      if (!o.isSiege) foes++;
    }, p.pos.y, 2.8);
    const reaper = talentFx(p, 'reaper', null);   // Reaper (Berserker talent): the blade drinks
    if (reaper && foes) p.heal(p.maxHp * reaper.heal * Math.min(foes, reaper.foes));
    const tithe = talentFx(p, 'tithe', 0);   // Blood Tithe (alternative to Reaper): the last strike pays a flat share back
    if (tithe && last && foes) p.heal(p.maxHp * tithe);
    p.swingT = 0.25;
    p.attackDir = n % 2 ? 'left' : 'right';
    this.emit('whirl', p.pos, ZERO, null, reach);
  }

  bloodrage(p) {
    const t = 7 + talentFx(p, 'rageTime', 0);
    p.buffs.add('lifesteal', t, 0.5 * talentFx(p, 'rageSteal', 1));
    p.buffs.add('steady', t);
    p.buffs.add('rage', t, 1.25 + talentFx(p, 'rageDmg', 0));
    p.heal(p.maxHp * 0.1);
    this.emit('rage', p.pos, ZERO);
  }

  // ---------- Ranger ----------
  // The volley falls on the circle the Ranger placed: arrows go up from the bow, and a moment later they come down
  // out of the sky over about a second, most of them picking a foe standing inside the circle.
  volley(p, cam, dir, at) {
    const g = this.g, V = VOLLEY;
    const c = at ? at.clone() : this.aimPoint(cam, dir, V.range, p.team).pos;
    const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > V.range + 6) {   // a guest's request is held to the Ranger's reach
      const k = (V.range + 6) / dist;
      c.x = p.pos.x + dx * k; c.z = p.pos.z + dz * k;
      c.y = g.physics.groundHeight(c.x, c.z, c.y + 2);
    }
    const f = flat(new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z));
    const k = talentFx(p, 'volleyRadius', 1), slow = talentFx(p, 'volleySlow', 0), wave = talentFx(p, 'volleyWave', null);
    const flight = (arrows, t) => {
      const shots = [];
      for (let i = 0; i < arrows; i++) shots.push(V.delay + (i + Math.random()) * V.span / arrows);
      this.active.push({ kind: 'rain', p, t, dur: V.delay + V.span + 0.2, c, f, shots, n: 0, picked: new Map(), dmg: p.bowDmg * V.dmg, radius: V.radius * k, slow, aimed: talentFx(p, 'volleyAimed', V.aimed) });
    };
    flight(V.arrows + talentFx(p, 'volleyArrows', 0), 0);
    if (wave) flight(wave.arrows, -wave.gap);   // Second Wave (Ranger talent): another flight, a moment later
    this.emit('volley', cam, f, [c], k);
  }

  // The arrows that are due: each one falls steeply from above and behind the target onto a foe in the circle (a
  // little ahead of where it is walking), or onto a random spot in the circle.
  rain(e) {
    const g = this.g, V = VOLLEY;
    while (e.n < e.shots.length && e.t >= e.shots[e.n]) {
      e.n++;
      const from = new THREE.Vector3(0, 0, 0);
      const T = Math.hypot(V.fallBack, V.fallH) / ARROW_SPEED;   // every arrow takes about the same time to come down
      let L = null;
      if (Math.random() < e.aimed) {
        // the foe the volley has picked least so far, so the arrows spread over everyone in the circle
        let o = null, least = Infinity;
        this.eachFoe(e.p.team, e.c.x, e.c.z, e.radius, (f) => {
          if (e.slow && f.slowT !== undefined) f.slowT = Math.max(f.slowT, e.slow);   // Pinning Fire (Ranger talent)
          const k = (e.picked.get(f) || 0) + Math.random() * 0.5;
          if (k < least) { least = k; o = f; }
        }, e.c.y, 12);
        if (o) {
          e.picked.set(o, (e.picked.get(o) || 0) + 1);
          L = o.chest ? o.chest(new THREE.Vector3()) : new THREE.Vector3(o.pos.x, o.pos.y + 1.5, o.pos.z);   // (engines have no chest)
          if (o.vel) { L.x += o.vel.x * T; L.z += o.vel.z * T; }
          L.x += (Math.random() - 0.5) * 0.7; L.z += (Math.random() - 0.5) * 0.7;
        }
      }
      if (!L) {
        const a = Math.random() * Math.PI * 2, r = e.radius * Math.sqrt(Math.random());
        L = new THREE.Vector3(e.c.x + Math.cos(a) * r, 0, e.c.z + Math.sin(a) * r);
        L.y = g.physics.groundHeight(L.x, L.z, e.c.y + 3);
      }
      from.set(L.x - e.f.x * V.fallBack, L.y + V.fallH, L.z - e.f.z * V.fallBack);
      const v = new THREE.Vector3((L.x - from.x) / T, (L.y - from.y) / T + 0.5 * G_ARROW * T, (L.z - from.z) / T);
      g.projectiles.fireArrow(from, v, e.p.team, e.dmg, e.p, true, 'Arrow Volley');
    }
  }

  // Where the crosshair meets the world, for abilities that are placed on the ground: the first soldier, engine, wall
  // or hill along the line of sight within range (the spot on the ground there). If the sight line reaches nothing (the
  // sky), the ground at full range straight ahead, and far is true.
  aimPoint(from, dir, range, team) {
    const g = this.g, phys = g.physics;
    const q = new THREE.Vector3(), last = from.clone();
    for (let d = 1; d <= range; d += 0.5) {
      q.copy(from).addScaledVector(dir, d);
      const unit = g.projectiles.hitCharacter(q, team, 0.35) || g.siegeAt(q, team);
      if (unit) {
        const x = unit.pos.x, z = unit.pos.z;
        return { pos: new THREE.Vector3(x, phys.groundHeight(x, z, unit.pos.y + 0.5), z), far: false };
      }
      if (phys.pointHit(q.x, q.y, q.z, team, SEE_THROUGH) || q.y < phys.terrainHeight(q.x, q.z)) {
        return { pos: new THREE.Vector3(last.x, phys.groundHeight(last.x, last.z, last.y), last.z), far: false };
      }
      last.copy(q);
    }
    const f = flat(dir);
    const x = from.x + f.x * range, z = from.z + f.z * range;
    return { pos: new THREE.Vector3(x, phys.groundHeight(x, z, from.y), z), far: true };
  }

  evade(p) {
    p.buffs.add('ghost', 0.85);
    const again = talentFx(p, 'rollAgain', 0);   // Twin Roll (Ranger talent): the first roll opens a window for a second
    if (again) { if (p.buffs.has('twin')) p.buffs.del('twin'); else p.buffs.add('twin', again); }
    const focus = talentFx(p, 'focus', null);   // Hunter's Focus: the next arrow is drawn at once and hits harder
    if (focus) p.buffs.add('focus', focus.time, focus.dmg);
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
    let dmg = s.dmg * p.mods.spell;
    const radius = s.radius * talentFx(p, 'fireRadius', 1);
    const snap = p.buffs.get('snap');   // Cold Snap (alternative to Shatter): the ward broke a moment ago, and this ball hits harder
    if (snap) { dmg *= snap; p.buffs.del('snap'); }
    this.g.magic.fireball(p, from, d, dmg, radius);
    const fork = talentFx(p, 'fireFork', 0);   // Forked Flame (Mage talent): a second, weaker ball a little to the side
    if (fork) this.g.magic.fireball(p, from, d.clone().applyAxisAngle(UP, 0.12), dmg * fork, radius);
    p.swingT = 0.25; p.attackDir = 'thrust';
  }

  // Mage talent: the foes a fireball caught go on burning for a few seconds
  scorch(o, ball) {
    const burn = talentFx(ball.owner, 'burn', null);
    if (!burn || !o.alive) return;
    let b = this.burning.find((x) => x.o === o && x.p === ball.owner);
    if (!b) this.burning.push(b = { o, p: ball.owner });
    b.left = burn.time; b.every = b.tick = burn.tick;
    b.dmg = ball.dmg * burn.share * burn.tick / burn.time;   // the share of the blast that burns on, a little at a time
  }

  burn(dt) {
    const g = this.g;
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i];
      b.left -= dt; b.tick -= dt;
      if (!b.o.alive || b.left <= 0) { this.burning.splice(i, 1); continue; }
      if (b.tick > 0) continue;
      b.tick += b.every;
      const at = b.o.chest(new THREE.Vector3());
      g.fx.fireTrail(at);
      g.fx.sparks(at, 3);
      g.damage(b.o, b.dmg, b.p, { magic: true, splash: true, ability: 'Fireball' });
    }
  }

  ward(p) {
    const reach = talentFx(p, 'wardRadius', 1), chill = 3 + talentFx(p, 'wardChill', 0), stun = 0.5 + talentFx(p, 'wardStun', 0);
    p.buffs.add('ward', 8 + talentFx(p, 'wardTime', 0), 170 * talentFx(p, 'wardAbsorb', 1));
    this.eachFoe(p.team, p.pos.x, p.pos.z, 6.5 * reach, (o) => {
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, chill);
      if (o.stagger) o.stagger(stun, p);
    }, p.pos.y, 3);
    this.emit('ward', p.pos, ZERO, null, reach);
  }

  // Mage talent: a ward that is broken bursts, hurting, staggering and chilling the foes around the Mage
  shatter(p) {
    const snap = talentFx(p, 'snap', null);   // Cold Snap (alternative to Shatter): no burst, but the next Fireball is stronger
    if (snap) p.buffs.add('snap', snap.time, snap.dmg);
    const s = talentFx(p, 'shatter', null);
    if (!s) return;
    const g = this.g, dmg = s.dmg * p.mods.spell;
    this.eachFoe(p.team, p.pos.x, p.pos.z, s.radius, (o) => {
      g.damage(o, dmg, p, { magic: true, splash: true, ability: 'Frost Ward' });
      if (!o.alive) return;
      if (o.slowT !== undefined) o.slowT = Math.max(o.slowT, s.chill);
      if (o.stagger) o.stagger(s.stun, p);
    }, p.pos.y, 3);
    this.emit('shatter', p.pos, ZERO, null, s.radius / 6);
  }

  // ---------- Cleric ----------
  smite(p, cam, dir) {
    const g = this.g, s = SPELLS.smite;
    const { pos: at, col } = this.rayHit(cam, dir, s.range, p.team);
    const dmg = s.dmg * p.mods.spell;
    const reach = talentFx(p, 'smiteRadius', 1), radius = s.radius * reach, stun = 0.8 + talentFx(p, 'smiteStun', 0);
    const hit = new Set();
    this.eachFoe(p.team, at.x, at.z, radius, (o, d) => {
      g.damage(o, dmg * (1 - 0.4 * Math.min(1, d / radius)), p, { magic: true, splash: true, ability: 'Smite' });
      if (o.alive && o.stagger) o.stagger(stun, { pos: at });
      hit.add(o);
    }, at.y, 4);
    const chain = talentFx(p, 'smiteChain', null);
    if (chain) this.chainSmite(p, at, hit, dmg, chain);
    if (col && col.ref && col.ref.takeDamage && !allied(col.ref.team, p.team) && col.ref.kind !== 'wall') col.ref.takeDamage(dmg * 0.5, p, 'Smite');
    const sky = at.clone();
    sky.x += (Math.random() - 0.5) * 3; sky.z += (Math.random() - 0.5) * 3; sky.y += 42;
    g.magic.showBolt([sky, at], s.color);
    g.audio.play('zap', at);
    p.swingT = 0.25; p.attackDir = 'over';
    this.emit('smite', at, ZERO, null, reach);
  }

  // Cleric talent: the bolt arcs on from the blast to the nearest foes beyond it
  chainSmite(p, at, hit, dmg, chain) {
    const g = this.g, foes = [];
    this.eachFoe(p.team, at.x, at.z, chain.range, (o, d) => { if (!hit.has(o) && !o.isSiege) foes.push({ o, d }); }, at.y, 4);
    foes.sort((a, b) => a.d - b.d);
    const pts = [at.clone().setY(at.y + 1)];
    for (const { o } of foes.slice(0, chain.foes)) {
      pts.push(o.chest(new THREE.Vector3()));
      g.damage(o, dmg * chain.dmg, p, { magic: true, splash: true, ability: 'Smite' });
      if (o.alive && o.stagger) o.stagger(0.5, { pos: at });
    }
    if (pts.length > 1) g.magic.showBolt(pts, SPELLS.smite.color);   // (every screen sees it: Magic.onBolt)
  }

  heal(p) {
    this.healBurst(p, 1);
    const pulse = talentFx(p, 'healPulse', null);   // Second Dawn (Cleric talent): the light comes again
    if (pulse) this.active.push({ kind: 'pulse', p, t: 0, dur: 99, delay: pulse.delay, scale: pulse.scale });
  }

  healBurst(p, scale) {
    const mul = talentFx(p, 'healMul', 1) * scale, reach = 14 + talentFx(p, 'healRadius', 0);
    const aegis = talentFx(p, 'aegis', null);   // Divine Aegis (Cleric talent): the healed take less damage for a while
    const mercy = talentFx(p, 'mercy', null);   // Mercy (alternative to Second Dawn): the ones in most need are healed more
    const lift = (o) => (mercy && o.hp < o.maxHp * mercy.below ? 1 + mercy.more : 1);
    p.heal(p.maxHp * 0.45 * mul * lift(p));
    if (aegis) p.buffs.add('guard', aegis.time, 1 - aegis.cut);
    const healed = [];
    let mended = 0;   // what the light really restored in others: it earns the Cleric experience
    this.eachFriend(p.team, p.pos.x, p.pos.z, reach, (o) => {
      if (o === p) return;
      const n = o.maxHp * 0.4 * mul * lift(o);
      mended += Math.min(n, o.maxHp - o.hp);
      if (o.isPlayer) o.heal(n); else o.hp = Math.min(o.maxHp, o.hp + n);
      if (aegis) this.guard(o, aegis.time, 1 - aegis.cut);
      if (healed.length < 14) healed.push(o.chest(new THREE.Vector3()));
    });
    this.emit('heal', p.pos, ZERO, healed, reach / 14);
    p.gainXp(Math.min(SUPPORT_XP.healCap, mended * SUPPORT_XP.heal), 'support');
  }

  // ---------- Cavalier ----------
  lancecharge(p, cam, dir) {
    const f = flat(dir);
    const dur = 1.15 * talentFx(p, 'chargeTime', 1);
    p.buffs.add('charging', dur);
    this.active.push({ kind: 'charge', p, t: 0, dur, f, hit: new Set() });
    const rush = talentFx(p, 'chargeRush', null);   // Vanguard! (Cavalier talent): the army rides with the charge
    if (rush) this.eachFriend(p.team, p.pos.x, p.pos.z, rush.radius, (o) => { if (o !== p) this.haste(o, rush.time, rush.speed); });
    const wall = talentFx(p, 'chargeGuard', null);   // Shieldwall Charge (alternative to Vanguard!): the army is shielded instead of sped up
    if (wall) {
      this.eachFriend(p.team, p.pos.x, p.pos.z, wall.radius, (o) => { if (o !== p) this.guard(o, wall.time, 1 - wall.cut); });
      p.buffs.add('guard', wall.time, 1 - wall.cut);
    }
    this.emit('charge', p.pos, f);
  }

  chargeSweep(p, e) {
    const g = this.g;
    const c = p.pos.clone().addScaledVector(e.f, 1.2);
    this.eachFoe(p.team, c.x, c.z, (p.mounted ? 2.6 : 2) * talentFx(p, 'chargeReach', 1), (o) => {
      if (e.hit.has(o)) return;
      e.hit.add(o);
      g.damage(o, (p.meleeDmg * 2 + (p.mounted ? 25 : 0)) * talentFx(p, 'chargeDmg', 1), p, { melee: true, splash: true, charge: 1, ability: 'Lance Charge' });
      if (!o.alive) return;
      if (o.stagger) o.stagger(1.3, p);
      if (o.vel && !o.isPlayer) { o.vel.x += e.f.x * 12; o.vel.z += e.f.z * 12; }
      g.fx.sparks(o.chest(new THREE.Vector3()), 10);
      g.audio.play('thud', o.pos);
    }, p.pos.y, 3);
  }

  rally(p) {
    const t = 8 + talentFx(p, 'rallyTime', 0), reach = talentFx(p, 'rallyReach', 1);
    let rallied = 0;
    this.eachFriend(p.team, p.pos.x, p.pos.z, 28 * reach, (o) => {
      if (o === p) return;
      rallied++;
      this.guard(o, t, 0.7 - talentFx(p, 'rallyAlly', 0));
      this.haste(o, t, 1.25);
    });
    p.gainXp(Math.min(SUPPORT_XP.rallyCap, rallied * SUPPORT_XP.rally), 'support');
    p.buffs.add('guard', t, 0.6 - talentFx(p, 'rallySelf', 0));
    p.buffs.add('haste', t, 1.25);
    this.emit('rally', p.pos, ZERO, null, reach);
  }

  // ---------- looks ----------
  // Show the effect here and, in a hosted game, on everyone else's screen too. sz: how much wider than usual its rings
  // are (a talent that widens an ability).
  emit(id, pos, dir, targets = null, sz = 1) {
    this.show(id, pos, dir, false, targets, sz);
    const g = this.g;
    if (g.mode === 'host' && g.sync) {
      g.sync.shared.push({ k: 'abil', id, p: v3(pos), d: [Math.round(dir.x * 100) / 100, Math.round(dir.z * 100) / 100], t: targets ? targets.map(v3) : undefined, sz: sz !== 1 ? Math.round(sz * 100) / 100 : undefined });
    }
  }

  // the hero who cast it, found by where it happened (the other screens only get the place), and their house colour
  casterNear(pos, within = 3.8) {
    let best = null, bd = within * within;
    for (const h of this.g.humans) {
      if (!h.alive) continue;
      const dx = h.pos.x - pos.x, dz = h.pos.z - pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  houseColor(who) {
    if (!who || TEAM_COLORS[who.team] === undefined) return null;
    this.house = this.house || {};
    return this.house[who.team] || (this.house[who.team] = new THREE.Color(TEAM_COLORS[who.team]));
  }

  // silent: the sound already arrived as its own event. (The dust, sparks and blood here are the local versions of those
  // effects: the host's copies of fx.dust and the like are sent to the guests, who draw this ability themselves.)
  show(id, pos, dir, silent = false, targets = null, sz = 1) {
    const g = this.g, fx = g.fx, gf = this.gfx;
    const snd = (n) => { if (!silent) g.audio.play(n, pos); };
    const at = pos.clone();
    const chest = at.clone().setY(at.y + 1.2);
    const who = this.casterNear(pos);
    const house = this.houseColor(who);
    const heading = Math.atan2(dir.z, dir.x);
    switch (id) {
      case 'bash': {
        // the cone the shield sweeps (from the hero), and the slam where it lands
        const f = flat(dir), from = at.clone().addScaledVector(f, -2.8);
        gf.glyph('cone', from.x, from.y, from.z, 6.6 * sz, 0xbfd6ff, 0.55, { dir: heading, arc: 0.95, team: house, strength: 1.7 });
        gf.glyph('shock', at.x, at.y, at.z, 3.5 * sz, 0xdfeaff, 0.5, { team: house });
        fx._dust(at.clone().setY(at.y + 0.2), 14, 2.4, '');
        fx._sparks(chest.clone().addScaledVector(f, 0.4), 20);
        fx.flash(chest, this.col.set(0xbfd6ff), 3.2, 0.2, 0.7);
        snd('clang'); snd('thud');
        break;
      }
      case 'bulwark': {
        const r = 8 * sz;
        gf.dome(0x7db4ff, 5, 2.0, who, { strength: 1.5, x: at.x, y: at.y, z: at.z });
        gf.glyph('rune', at.x, at.y, at.z, r, 0x7db4ff, 2.6, { arms: 6, team: house, strength: 1.5 });
        gf.glyph('shock', at.x, at.y, at.z, r, 0xcfe2ff, 0.9, { team: house });
        fx.ring(at, 1.3, this.col.set(0x9cc4ff), 22, { up: 1.8, size: 0.3 });
        fx._sparks(chest, 14);
        snd('block');
        break;
      }
      case 'bwave': {   // Bastion Strike (Knight talent): the planted shield comes down and a ring runs out
        const r = 5 * sz;
        gf.glyph('shock', at.x, at.y, at.z, r * 1.2, 0xdfeaff, 0.6, { team: house, strength: 1.8 });
        fx.ring(at, r * 0.5, this.col.set(0x9cc4ff), 26, { up: 1.2, size: 0.4 });
        fx._dust(at.clone().setY(at.y + 0.2), 16, 3, '');
        fx._sparks(chest, 14);
        snd('clang'); snd('thud');
        break;
      }
      case 'whirl': {
        const r = 4.3 * sz;
        gf.glyph('slash', at.x, at.y, at.z, r, 0xffb070, 0.42, { team: house, strength: 1.8 });
        gf.glyph('shock', at.x, at.y, at.z, r, 0xffd8b0, 0.45, { team: house });
        fx._sparks(chest, 12);
        fx._dust(at.clone().setY(at.y + 0.2), 6, 1.8, '');
        snd('swing');
        break;
      }
      case 'rage': {
        gf.glyph('pulse', at.x, at.y, at.z, 3.4, 0xff3a22, 1.2, { strength: 1.8 });
        gf.glyph('rune', at.x, at.y, at.z, 2.4, 0xff4a2a, 1.6, { arms: 4, team: house, strength: 1.5 });
        gf.glyph('shock', at.x, at.y, at.z, 5.5, 0xff6a40, 0.7, { team: house });
        for (let i = 0; i < 6; i++) fx.fireTrail(this.tmpv.set(at.x + (Math.random() - 0.5) * 1.2, at.y + 0.3 + Math.random() * 1.4, at.z + (Math.random() - 0.5) * 1.2));
        fx._blood(chest, 10, 0, 0);
        fx.ring(at, 1.5, this.col.set(0xff3a22), 24, { up: 2.2, size: 0.3 });
        snd('roar');
        break;
      }
      case 'evade': {
        gf.glyph('shock', at.x, at.y, at.z, 2.6, 0xb8f0a8, 0.4, { team: house });
        fx._dust(at.clone().setY(at.y + 0.2), 10, 1.3, '');
        fx.ring(at, 0.8, this.col.set(0x9ae88a), 12, { up: 1.2, size: 0.22 });
        snd('swing');
        break;
      }
      case 'volley': {
        // a flight of arrows leaves the bow and climbs out of sight; the circle stays marked on the ground until they land
        snd('bow');
        const c = targets && targets[0];
        if (c) {
          g.aimRing.flash(c, VOLLEY.radius * sz, 1.9);
          gf.glyph('rune', c.x, c.y, c.z, VOLLEY.radius * sz * 1.02, 0x9af08a, 1.9, { arms: 5, team: house, strength: 1.3 });
        }
        fx.flash(at.clone().addScaledVector(dir, 0.6), this.col.set(0xcfe8b0), 1.1, 0.15, 0.5);
        for (let i = 0; i < 9; i++) {
          const from = at.clone().addScaledVector(dir, 0.6);
          const vel = new THREE.Vector3(dir.x * 9 + (Math.random() - 0.5) * 5, 44 + Math.random() * 8, dir.z * 9 + (Math.random() - 0.5) * 5);
          g.projectiles.showArrow(from, vel, 0.9, who ? who.team : -1);
          this.rising.push({ t: 0 });   // (a record of each climbing arrow for as long as it is in the air)
        }
        break;
      }
      case 'ward': {
        gf.dome(0x8fe0ff, 8, 1.95, who, { strength: 1.5, x: at.x, y: at.y, z: at.z });
        gf.glyph('rune', at.x, at.y, at.z, 2.9, 0x8fe0ff, 2.4, { arms: 6, team: house, strength: 1.5 });
        gf.glyph('shock', at.x, at.y, at.z, 6.5 * sz, 0xb8ecff, 0.9, { team: house });
        fx.frost(chest, 26);
        fx.ring(at, 1.2, this.col.set(0x8fe0ff), 20, { up: 1.8, size: 0.28 });
        snd('ice');
        break;
      }
      case 'shatter': {
        gf.glyph('shock', at.x, at.y, at.z, 6 * sz, 0x9fe6ff, 0.8, { team: house, strength: 1.8 });
        gf.glyph('pulse', at.x, at.y, at.z, 6 * sz, 0x8fe0ff, 0.7);
        fx.frost(chest, 40);
        fx.flash(chest, this.col.set(0xbfeaff), 4.5, 0.25, 0.8);
        if (g.camfx) g.camfx.boom(at, 0.5);
        snd('ice');
        break;
      }
      case 'smite': {
        const r = SPELLS.smite.radius * sz;
        gf.pillar(at.x, at.y, at.z, 0xffe9a0, 0.55, 1.5 * sz, 46, 1.8);
        gf.glyph('rune', at.x, at.y, at.z, r, 0xffe08a, 1.2, { arms: 8, strength: 1.5 });
        gf.glyph('shock', at.x, at.y, at.z, r * 1.15, 0xfff0c0, 0.55);
        gf.glyph('pulse', at.x, at.y, at.z, r, 0xffd870, 0.5, { strength: 1.8 });
        fx.zap(at, 16);
        fx._dust(at.clone().setY(at.y + 0.2), 10, 2.2, '');
        g.magic.flash(at, 0xffe9a0, 8);
        if (g.camfx) g.camfx.boom(at, 0.5);
        break;
      }
      case 'heal': {
        const r = 14 * sz;
        gf.glyph('rune', at.x, at.y, at.z, 3.2, 0x9affb0, 1.7, { arms: 6, team: house, strength: 1.4 });
        gf.glyph('shock', at.x, at.y, at.z, r, 0xffe9a0, 1.1, { team: house, strength: 1.3 });
        gf.glyph('pulse', at.x, at.y, at.z, 4, 0x9affb0, 0.8);
        gf.pillar(at.x, at.y, at.z, 0xaaffc0, 1.2, 1.0, 8, 1.2);
        fx.ring(at, 2, this.col.set(0x9affb0), 28, { up: 1.8, size: 0.3 });
        for (const t of targets || []) { fx.gold(t); fx.flash(t, this.col.set(0x9affb0), 1.6, 0.3, 0.6); }
        snd('buy');
        break;
      }
      case 'charge': {
        const f = flat(dir);
        gf.glyph('cone', at.x, at.y, at.z, 7.5, 0xffd870, 0.6, { dir: Math.atan2(f.z, f.x), arc: 0.6, team: house, strength: 1.5 });
        gf.glyph('shock', at.x, at.y, at.z, 3.2, 0xffe7a8, 0.5, { team: house });
        fx._dust(at.clone().setY(at.y + 0.2), 16, 2.4, '');
        if (who) this.trails.push({ who, f, t: 0, dur: 1.2, acc: 0 });
        snd('swing');
        break;
      }
      case 'rally': {
        const r = 28 * sz;
        gf.glyph('shock', at.x, at.y, at.z, r, 0xffcc4a, 1.2, { team: house, strength: 1.4 });
        gf.glyph('rune', at.x, at.y, at.z, 5, 0xffd060, 2.4, { arms: 4, team: house, strength: 1.5 });
        gf.pillar(at.x, at.y, at.z, 0xffd878, 1.0, 0.9, 12, 1.3);
        fx.ring(at, 3, this.col.set(0xffcc4a), 30, { speed: 7, up: 1.4, size: 0.34 });
        fx.gold(chest);
        fx.flash(chest, this.col.set(0xffd878), 4, 0.3, 0.7);
        snd('horn');
        break;
      }
      default: break;
    }
  }
}
