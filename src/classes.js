// Hero classes. Every hero picks one of six classes before the battle; each has its own strengths and two abilities:
// Q is an attack, R a second ability (mostly a defence; the Berserker's Leap and the Ranger's Hunting Hawk are not), and u the Ultimate (Z),
// which charges from fighting instead of a timer (how a class adds one: the comment at the top of ultimate.js). The abilities are simulated where the world is (single player or host);
// their look and sound is replayed on every screen.
import * as THREE from 'three';
import { SPELLS, VOLLEY, TEAM_COLORS, FIREBALL_RANGE, WORLD, ULT } from './config.js';
import { GroundFX } from './groundfx.js';
import { ARROW_SPEED, G_ARROW } from './projectiles.js';
import { allied } from './teams.js';
import { talentFx, TUNE } from './talents.js';
import { SOUNDS } from './audio.js';
import { eachArcher } from './towerarchers.js';
import { ULT_METHODS, ULT_SHOW, ultReady, ultGain, RAIN } from './ultimate.js';
import { RANGER_METHODS, RANGER_SHOW, rangerFx, XARROW, HAWK } from './ranger.js';
import { quietly } from './modelkit.js';
import { KNIGHT, KNIGHT_METHODS, KNIGHT_BUFFS } from './knight.js';
import { BERSERKER_METHODS, RAGE, EXEC, UNSTOP } from './berserker.js';
import { CAV, CAV_METHODS, momentumMul } from './cavalier.js';

const RANGER_SNIPE_DMG = TUNE.ranger.sniper.dmg;   // (Sniper Shot's damage in full arrows: a talent's, talents.js)

export const CLASS_IDS = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];

// mods: hp and speed multiply, armor adds, melee / bow / spell multiply damage.
export const CLASSES = {
  knight: {
    name: 'Knight', icon: '🛡', color: '#a9bfe3', role: 'Vanguard',
    blurb: 'Plate armour and a kite shield: the hardest hero to bring down, and every blow he blocks is paid back.',
    mods: { hp: 1.3, armor: 5, speed: 0.94, melee: 1.15, bow: 0.8, spell: 1 },
    passive: `Retribution: every blow your raised shield takes fills your Wrath bar (a parry ${Math.round(KNIGHT.wrath.parry / KNIGHT.wrath.block * 10) / 10}x as much, an arrow or spell on the shield a little). When it is full your next swing releases a shockwave that hits everyone in front of you (${KNIGHT.wave.reach} m), staggering them and throwing soldiers back.`,
    q: { id: 'shieldthrow', icon: '🥏', name: 'Shield Throw', cd: 10, desc: `Throw your shield where you aim (as far as a Mage's Fireball flies, ${FIREBALL_RANGE} m). It bounces between up to ${KNIGHT.toss.hits} enemies, stunning each one, then flies back to your hand. You cannot block until you catch it.` },
    r: { id: 'challenge', icon: '📣', name: 'Challenge', cd: 16, desc: `Every enemy within ${KNIGHT.dare.radius} m, heroes too, has to attack you for ${KNIGHT.dare.time} s (a hero is held, ${Math.round(KNIGHT.dare.hold * 100)}% slower), and you take ${Math.round((1 - KNIGHT.dare.cut) * 100)}% less damage. Keep your shield up: every blow it takes fills your Wrath.` },
    u: { id: 'realmbanner', icon: '🚩', name: 'Banner of the Realm', kind: 'Ultimate', lasts: KNIGHT.banner.time, desc: `Plant your house's banner where you stand for ${KNIGHT.banner.time} s. Allies within ${KNIGHT.banner.radius} m of it heal over time (heroes ${Math.round(KNIGHT.banner.heal * 1000) / 10}% of their health a second), and enemies near it are slowed by ${Math.round((1 - KNIGHT.banner.slow) * 100)}%.` },
  },
  berserker: {
    name: 'Berserker', icon: '🪓', color: '#e0705a', role: 'Duelist',
    blurb: 'Light armour and a terrible temper. Hits harder than anyone, but is easier to hurt.',
    mods: { hp: 1.2, armor: -1, speed: 1.07, melee: 1.3, bow: 0.6, spell: 1, bloodied: 0.15 },
    passive: `Rage: every blow you land or take fills it, and it ebbs away a few seconds after you stop fighting. Below half health you hit 15% harder.`,
    hold: { icon: '🌀', name: 'Whirlwind', key: 'Hold right mouse', desc: `With ${RAGE.spin.start} Rage or more, holding the right mouse button spins you with your axe out instead of raising your guard: you keep walking (a little slower) and cut everyone within ${RAGE.spin.radius} m about three times a second, for as long as you hold it and your Rage lasts. A crowd around you pays a little Rage back. With too little Rage, right mouse still blocks.` },
    q: { id: 'execute', icon: '🪓', name: 'Execute', cd: EXEC.cd, desc: `A heavy overhead chop at whoever is in front of you (up to ${EXEC.targets}). Anyone it leaves below ${Math.round(EXEC.below * 100)}% health dies on the spot, heroes too, and a kill gives Execute back at once, so you can chain it through a wounded crowd.` },
    r: { id: 'leap', icon: '⤴', name: 'Leap', cd: 11, aimed: true, kind: 'Attack', desc: `Hold R to mark where you will land (as far as a Mage's Fireball flies, ${FIREBALL_RANGE} m), let go and leap there in a high arc over the soldiers, landing with a slam that hurts, staggers and throws back everyone around you. Walls stop the leap, and it never lands on enemy battlements.` },
    u: { id: 'unstoppable', icon: '💢', name: 'Unstoppable', kind: 'Ultimate', lasts: UNSTOP.time, desc: `With a roar that throws back everyone near you, you grow to twice your size for ${UNSTOP.time} s: nothing can slow, stagger or knock you back, your blows reach further, and every soldier you hit is sent flying.` },
  },
  ranger: {
    name: 'Ranger', icon: '🏹', color: '#7fc47a', role: 'Marksman',
    blurb: 'A sharpshooter: arrows in the head, through whole ranks, and arrows that burst into flame. Fragile when caught in melee.',
    mods: { hp: 0.85, armor: 0, speed: 1.1, melee: 0.8, bow: 1.5, spell: 1, draw: 0.8, marksman: 1 },
    passive: 'Piercing Shots: a fully drawn arrow goes through the first enemy and on into up to two more (70%, then 50%). Her arrows hit engineers and siege engines 50% harder, and an arrow comes back to the quiver every 4 s.',
    q: { id: 'xarrow', icon: '💥', name: 'Explosive Arrow', cd: 8, desc: `Draw and loose a glowing arrow that bursts where it strikes: ${Math.round(XARROW.dmg * 100)}% of an arrow's damage to everyone within ${XARROW.radius} m (walls shelter), soldiers thrown back and staggered, gates and engines burnt. The ground there burns for ${XARROW.burn} s. It must fly ${XARROW.arm} m before it will burst.` },
    r: { id: 'hawk', icon: '🦅', name: 'Hunting Hawk', cd: 16, aimed: true, range: HAWK.range, radius: HAWK.radius, kind: 'Attack', desc: `Hold R to mark a spot (up to ${HAWK.range} m), let go and your hawk flies there. Every enemy in the circle is marked for ${HAWK.mark} s: your side sees him through walls, and he takes ${Math.round(HAWK.amp * 100)}% more damage from everyone. Then it dives on the nearest enemy hero: talons, and a brief slow.` },
    u: { id: 'rainfire', icon: '🌧', name: 'Rain of Fire', kind: 'Ultimate', aimed: true, range: RAIN.range, radius: RAIN.radius, lasts: RAIN.burnAt + RAIN.burn, desc: `Hold Z to put a great circle on the ground (${RAIN.radius} m round, up to ${RAIN.range} m away), let go and ${RAIN.arrows} burning arrows rain down on it over ${RAIN.span} s. The ground catches and burns for ${RAIN.burn} s, siege engines too.` },
  },
  mage: {
    name: 'Mage', icon: '🔥', color: '#ff9a4a', role: 'Battle mage',
    blurb: 'Frail, but a walking siege engine. Spells fly where you aim and burn walls and men alike.',
    mods: { hp: 0.75, armor: -1, speed: 1, melee: 0.7, bow: 0.9, spell: 1.25, cd: 0.85 },
    passive: 'Both abilities recharge 15% faster.',
    q: { id: 'fireball', icon: '🔥', name: 'Fireball', cd: 7, desc: 'Hurl a fireball that explodes on impact, scorching everything around it and burning gates and engines.' },
    r: { id: 'ward', icon: '❄', name: 'Frost Ward', cd: 16, desc: 'A shell of ice soaks up the next 170 damage for 8 s, and chills and staggers enemies close to you.' },
    u: { id: 'meteor', icon: '☄️', name: 'Meteor', kind: 'Ultimate', aimed: true, range: ULT.meteor.range, radius: ULT.meteor.radius, cast: 0xff7a2a, lasts: ULT.meteor.fall + ULT.meteor.burn, desc: `Hold Z to mark a spot on the ground (up to ${ULT.meteor.range} m, further than a Fireball flies), let go and a huge burning rock falls on it out of the sky a moment later: ${ULT.meteor.dmg} damage in ${ULT.meteor.radius} m (less toward the rim), soldiers knocked flat, walls, gates and engines broken as by a siege stone. The ground burns for ${ULT.meteor.burn} s.` },
  },
  cleric: {
    name: 'Cleric', icon: '✚', color: '#f2e08c', role: 'Support',
    blurb: 'Holy light for friend and foe. Keeps the army on its feet.',
    mods: { hp: 1, armor: 2, speed: 1, melee: 0.9, bow: 0.8, spell: 1.1, regen: 2.5 },
    passive: 'Health regenerates two and a half times faster out of combat.',
    q: { id: 'smite', icon: '⚡', name: 'Smite', cd: 8, desc: `Hurl a bolt of holy lightning from your open hand at whatever you are aiming at, as far as a Mage's Fireball flies (${FIREBALL_RANGE} m), blasting everyone near where it strikes.` },
    r: { id: 'heal', icon: '✚', name: 'Healing Light', cd: 14, desc: 'Heal yourself for 45% of your health and every ally within 14 m for 40% of theirs.' },
    u: { id: 'sanctuary', icon: '🔆', name: 'Sanctuary', kind: 'Ultimate', cast: 0xffe9a0, lasts: ULT.sanctuary.time, desc: `A circle of golden light ${ULT.sanctuary.radius} m round you for ${ULT.sanctuary.time} s: no ally inside it, hero or soldier, can be brought below 1 health.` },
  },
  cavalier: {
    name: 'Cavalier', icon: '🐎', color: '#e8b84a', role: 'Shock cavalry',
    blurb: 'Starts with a warhorse, and the horse is the star: the faster you ride, the harder you hit. Rides down the enemy and calls up knights.',
    mods: { hp: 1.1, armor: 3, speed: 1, melee: 1, bow: 0.8, spell: 1, horse: true, rider: 0.7, trample: 1.25, momentum: CAV.momentum.top },
    passive: `Momentum: the faster you ride, the harder your blows, trampling and abilities land, up to +${Math.round(CAV.momentum.top * 100)}% at a full gallop (the horseshoe gauge on the HUD). It builds as you gallop and drains when you slow down or turn hard. The horse also shields you (30% less damage).`,
    q: { id: 'sweep', icon: '🌙', name: 'Sweeping Strike', cd: 6, desc: `For ${CAV.sweep.time} s your blade sweeps out to one side as you ride, cutting every foe you pass within ${CAV.sweep.reach} m once. Look left or right to choose the side; looking ahead, it goes to the side with more foes. On foot, one wide cut in front of you.` },
    r: { id: 'lancecharge', icon: '🐎', name: 'Lance Charge', cd: 14, aimed: true, rush: true, kind: 'Attack', desc: `Hold R to see where the charge ends (as far as a Mage's Fireball flies, ${FIREBALL_RANGE} m), let go and gallop there with the lance couched (on foot, a rush), flattening everyone in your path. Walls, gates and steep ground stop you; R again reins in.` },
    u: { id: 'callcharge', icon: '📯', name: 'Call the Charge', kind: 'Ultimate', aimed: true, range: CAV.call.range, radius: CAV.call.radius, lasts: CAV.call.life, desc: `Hold Z to point at a spot (up to ${CAV.call.range} m), let go and blow the horn: every ally within ${CAV.call.rally.radius} m takes 30% less damage and moves 25% faster for ${CAV.call.rally.time} s, and ${CAV.call.knights} armoured knights of your house ride out behind you in a wedge and charge the spot, riding down everyone in their way. They fight on for ${CAV.call.life} s, then ride off. On foot the horn calls them all the same.` },
  },
};

// The Ranger's numbers (Explosive Arrow and Hunting Hawk: ranger.js; Rain of Fire: ultimate.js; the talents that change them: talents.js; the
// arrows themselves fly in projectiles.js).
export const RANGER = {
  headshot: 2, headshotHero: 1.5,   // a hero's arrow in the head deals this much (into a hero's, the second): every class's bow, not only the Ranger's
  headZone: 0.17,                   // the top share of a body's height that is its head
  pierce: [0.7, 0.5],               // Piercing Shots: the share of the damage dealt to the second and the third body a fully drawn arrow goes into
  pierceDraw: 0.97,                 // how full a draw that takes
  siege: 1.5,                       // against engineers, siege crews and the engines themselves
  arrowEvery: 4,                    // seconds for one arrow to come back to the quiver
  // Sniper Shot (the Ranger's capstone talent): with it ready, the right mouse button brings the bow up to the eye (the scope) in place of the
  // plain zoom; the view narrows to `fov` degrees over `zoomT` s and the arrow is drawn in `draw` s.
  // The aim sways by `sway` radians at first and settles to `steady` of that over `settle` s; held past `tire` s it grows again (and is
  // loosed at `hold` s at the latest). The arrow flies at `speed` m/s with `grav` of an arrow's gravity, flat out to `range` m (the
  // Fireball's: Projectiles.FIREBALL_RANGE), then falls as any arrow does; it deals `dmg` fully drawn arrows (a headshot multiplies it) and
  // goes on through the first body into the next for `pierce` of it
  snipe: { fov: 8, zoomT: 0.3, draw: 0.6, sway: 0.0045, steady: 0.25, settle: 0.8, tire: 5, hold: 9, speed: 150, grav: 0.1, range: FIREBALL_RANGE, dmg: RANGER_SNIPE_DMG, pierce: [0.7] },
};

// The Berserker's Leap: hold R for a circle where he will land (up to `range` m: as far as a Fireball flies), let go and he leaps there.
// The arc rises `apex` m above the line (from `apexMin`, `apexK` m more for every metre of the leap, up to `apexMax`) and takes as long
// as a body falling under `grav` m/s² would; a leap is at least `min` m, and ends at most `up` m higher than it began (not up a cliff). Walls, towers and hills in the way cut it short, and it never
// ends on an enemy castle's walls or towers or inside anything. The landing slams the ground: `dmg` of his melee damage (less toward the
// edge, `edge` at the rim) to every foe within `radius` m, who is staggered `stagger` s (a hero `hero` s) and thrown back `knock` m/s.
// The long charge, the Cavalier's Lance Charge: hold R for the end of the run (as far as a Fireball flies), let go and he gallops (or
// runs, on foot) along the ground there at `lance.mounted` m/s (`lance.speed` on foot), on through the foes. The run follows the ground
// and stops short of what is in the way: a wall, a gate that is not open to him, a trunk, a rise steeper than `climb` m in half a metre,
// an enemy castle's stone; it is at least `min` m. R again ends it early.
export const RUSH = {
  range: FIREBALL_RANGE, min: 1.5, climb: 0.6,
  lance: { speed: 17, mounted: 27 },
};

export const LEAP = { range: FIREBALL_RANGE, min: 3, up: 6, apexMin: 2, apexK: 0.055, apexMax: 7, grav: 11, dmg: 2.2, edge: 0.5, radius: 5, stagger: 1, hero: 0.7, knock: 10 };

// Sniper Shot: the Ranger's capstone talent (talents.js) gives her a third shot, on the right mouse button rather than a key (slot 's').
export const SNIPE = { id: 'snipe', icon: '🔭', name: 'Sniper Shot', cd: TUNE.ranger.sniper.cd, kind: 'Talent', desc: `With the bow out and the shot ready, hold the right mouse button to raise the bow to your eye: the view zooms in far and steadies after a moment. Click to loose one heavy arrow that flies flat and fast as far as a Mage's Fireball (${FIREBALL_RANGE} m), for ${RANGER_SNIPE_DMG}x a full arrow's damage (a headshot counts), on through the first body into one more. Let go to lower the bow.` };

// The ability a hero has in a slot: the class's ('s': the Ranger's Sniper Shot, for those who learnt it).
export function abilityOf(p, slot) {
  if (slot === 's') return talentFx(p, 'sniper', false) ? SNIPE : null;
  return classOf(p.classId)[slot];
}

export function classOf(id) { return isClassId(id) ? CLASSES[id] : CLASSES.knight; }
// a class id from outside (a guest's message, storage): an own key, so that 'constructor' and '__proto__' are not classes
export function isClassId(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, id); }

// The Ranger's sounds. A headshot is a sharp knock with a ring over it, unlike any other hit, so the archer knows by ear.
SOUNDS.headshot = (a, k) => {
  a.tone(2100, 0.09, 0.2 * k, 'square', 0.5);
  a.tone(3150, 0.32, 0.09 * k, 'sine', 0.92, 0.02);
  a.noise(0.05, 2600, 3, 0.35 * k, 'bandpass');
};
SOUNDS.snipe = (a, k) => {   // a heavy string, and a thin high whistle as the arrow goes far
  a.tone(130, 0.32, 0.32 * k, 'triangle', 0.45);
  a.noise(0.18, 2400, 1.2, 0.26 * k, 'bandpass');
  a.tone(3600, 0.5, 0.05 * k, 'sine', 0.6, 0.05);
};
// Smite's lightning leaving the hand: a dry crackle (the thunder at the strike is 'zap')
SOUNDS.crackle = (a, k) => {
  a.noise(0.16, 4200, 0.8, 0.32 * k, 'highpass');
  a.noise(0.08, 1800, 2, 0.2 * k, 'bandpass', 0.05);
  a.tone(2600, 0.05, 0.06 * k, 'square', 0.4, 0.02);
};
// The Berserker's Leap: a grunt and a rush of air going up; the slam is a deep thump with stone cracking under it.
SOUNDS.leap = (a, k) => { a.tone(110, 0.22, 0.25 * k, 'sawtooth', 0.6); a.noise(0.4, 900, 0.8, 0.22 * k, 'bandpass'); };
SOUNDS.slam = (a, k) => {
  a.tone(55, 0.6, 0.5 * k, 'sine', 0.4);
  a.tone(90, 0.35, 0.3 * k, 'triangle', 0.5, 0.01);
  a.noise(0.45, 500, 0.6, 0.45 * k, 'lowpass');
  a.noise(0.12, 2600, 2, 0.22 * k, 'highpass', 0.03);
};

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
  guard: 'Guarded', steady: 'Unshakable', whirl: 'Whirlwind', lifesteal: 'Bloodthirst', rage: 'Fury', ghost: 'Evading',
  ward: 'Frost Ward', haste: 'Hastened', charging: 'Charging', reflect: 'Avenging', snap: 'Cold Snap',
  leaping: 'Leaping', unstop: 'Unstoppable', marked: 'Marked',
};

const ZERO = new THREE.Vector3();
const FIRE_ARROW = { fire: 1 };   // (a burning arrow of a Rain of Fire: projectiles.js)
const UP = new THREE.Vector3(0, 1, 0);
const SEE_THROUGH = new Set(['tree']);   // a trunk does not stop you putting a volley on the ground behind it
const LAND_H = [0.3, 1, 1.7];   // (the heights a landing Berserker's body is tested at, and the ring round his middle)
const LAND_RING = [1, 0, -1, 0, 0, 1, 0, -1];
const WALL_KINDS = new Set(['wall', 'gate', 'lintel', 'tower', 'keep', 'yard']);   // (the stone a Leap does not go over: Abilities.overWall)
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
    this.active = [];   // effects that carry on for a moment: whirlwind, lance charge, a rain of arrows coming down
    this.burning = [];  // foes a fireball set alight (Mage talent)
    this.trails = [];   // looks that follow a hero for a moment (the dust of a charge, a Berserker in the air)
    this.gfx = new GroundFX(game);   // the glyphs, shells and columns of light the abilities draw (see groundfx.js)
    this.col = new THREE.Color();
    this.tmpv = new THREE.Vector3();
    this.ultInit();   // (the Ultimates' pooled looks and their list: ultimate.js)
    this.rangerInit();   // (the hawks and the markers: ranger.js)
    this.knightInit();   // (the Knight's flying shields, banners and tethers: knight.js)
    this.cavInit();   // (the Cavalier's Sweeping Strike blades: cavalier.js)
  }

  // Use an ability. cam: the hero's eye position, dir: where they look, at: a point they chose on the ground (the
  // Ranger's volley). Returns false when it is refused.
  use(p, slot, cam, dir, at = null) {
    const def = abilityOf(p, slot);
    if (!def || !p.alive || p.drive || typeof this[def.id] !== 'function') return false;
    const ult = slot === 'u';
    if (ult) {   // the Ultimate: no cooldown, the charge must be full (ultimate.js), and it is spent
      if (!ultReady(p)) return false;
      p.ult = 0;
      p.ultHold = this.g.time + (def.lasts ?? ULT.lasts);   // (no charge from its own blows while it is still at work: ultimate.js)
    } else {
      if (p.abilCd[slot] > 0.45) return false;   // a little slack for network delay
      p.abilCd[slot] = p.abilityCd(slot);
    }
    // (a guest says where its eyes are: never more than a step from where the host has its hero)
    const eye = p.eyePos(this.tmpv);
    if (cam.distanceToSquared(eye) > 9) cam = eye.clone();
    if (this[def.id](p, cam, dir.clone().normalize(), at, def) === false) { if (ult) { p.ult = 1; p.ultHold = 0; } else p.abilCd[slot] = 0; return false; }   // (a leap with nowhere to go)
    return true;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const p = e.p;
      e.t += dt;
      if (e.kind === 'ult') {   // an Ultimate that plays out over time runs its own course (ultimate.js), even after its caster falls
        if (e.tick(this, e, dt) === false) this.active.splice(i, 1);
        continue;
      }
      if (e.kind === 'rain') {   // already loosed: it comes down even if the Ranger has fallen since
        this.rain(e);
        if (e.n >= e.shots.length) this.active.splice(i, 1);
        continue;
      }
      if (e.kind === 'leap') {   // the Berserker comes down: the slam (where the leap was planned to end, whatever became of him)
        if (e.t >= e.dur) { this.active.splice(i, 1); if (p.alive) this.slam(p, e.to); }
        continue;
      }
      if (!p.alive || e.t > e.dur) { if (e.kind === 'bwave') p.bwave = null; this.active.splice(i, 1); continue; }
      if (e.kind === 'pulse') {
        if (e.t >= e.delay) { this.healBurst(p, e.scale); this.active.splice(i, 1); }
      } else if (e.kind === 'bwave') {
        if (e.t >= e.delay) { this.bulwarkWave(p, e); this.active.splice(i, 1); }
      } else {
        this.chargeSweep(p, e);
        if (e.kind === 'charge' && this.rushOver(p, e, dt)) { this.active.splice(i, 1); p.buffs.del('charging'); }   // (reined in, or stopped against a wall)
      }
    }
    this.burn(dt);
    this.knightTick(dt);   // (the Knight's Wrath: knight.js)
  }

  // Looks that run on every screen: the glyphs on the ground, shells and columns of light, the dust behind a charging hero.
  updateFx(dt) {
    this.gfx.update(dt);
    if (this.ultFx.length) quietly(stepUltFx, this, dt);   // (the Ultimates' looks that play out over time, with the looks' own dice)
    rangerFx(this);
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const e = this.trails[i];
      e.t += dt;
      const w = e.who;
      if (e.t > e.dur || !w || w.alive === false) { this.trails.splice(i, 1); continue; }
      e.acc += dt;
      if (e.leap) {   // a Berserker in the air: a streak of red embers and dust off him, every 50 ms
        while (e.acc > 0.05) {
          e.acc -= 0.05;
          this.tmpv.set(w.pos.x, w.pos.y + 1.1, w.pos.z);
          this.g.fx.fireTrail(this.tmpv);
          if (Math.random() < 0.4) this.g.fx._dust(this.tmpv, 1, 0.4, '');
        }
        continue;
      }
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
    eachArcher(g, team, x, z, r, y, dy, fn);   // (the archers on the castle towers: towerarchers.js)
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

  // ---------- the long charge (the Lance Charge) ----------
  // The run along the ground from `from` toward `want`, held to the reach and cut short in front of whatever stops a man running: a rise
  // too steep, a wall, a trunk, a gate that is not open to him, an enemy castle's stone. Returns { to, d, f } (to: where he stops) or null
  // when there is no room to run. The hero's own screen runs him along it (Player: a dash); the host plans it again for a guest, from where
  // it has him, and checks where he gets to (rushOver).
  rushPlan(p, from, want) {
    const R = RUSH, phys = this.g.physics;
    let dx = want.x - from.x, dz = want.z - from.z, d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); d = R.range; } else { dx /= d; dz /= d; }
    d = Math.min(R.range, d);
    let y = from.y, last = 0, yBack = from.y;
    for (let s = 0.5; s <= d + 1e-6; s += 0.5) {
      const x = from.x + dx * s, z = from.z + dz * s;
      const gy = phys.groundHeight(x, z, y + 0.3, p.team);
      if (gy > y + R.climb || phys.pointHit(x, gy + 0.6, z, p.team) || phys.pointHit(x, gy + 1.5, z, p.team) || this.overWall(p, x, z, NaN, NaN, NaN)) break;
      yBack = y; y = gy; last = s;
    }
    // (stopped by something: a step short of it, at the height of the ground there: on a slope, or where the wall walk ends at a tower,
    // the ground half a metre back is not where the last step was)
    if (last < d - 0.25) { last = Math.max(0, last - 0.5); y = yBack; }
    if (last < R.min) return null;
    return { to: new THREE.Vector3(from.x + dx * last, y, from.z + dz * last), d: last, f: new THREE.Vector3(dx, 0, dz) };
  }

  // the speed of a run (m/s)
  rushSpeed(p) {
    const R = RUSH.lance;
    return (p.mounted ? R.mounted : R.speed) * talentFx(p, 'chargeSpeed', 1);
  }

  // Is the run over? Its time is up, or he has stopped (reined in, or held against something: no headway for a quarter of a second).
  // A guest's hero (remote) is where its pose messages put him, which come in bursts: there the guest's own word ends the run (it sends
  // 'rushEnd' when its screen stops him: Player.update, NetSync), or the time allowed for it.
  rushOver(p, e, dt) {
    if (p.rushEnd) { p.rushEnd = false; return true; }
    if (e.t >= e.dur + (p.remote ? 0.5 : 0)) return true;
    if (!p.remote && (e.chk -= dt) <= 0) {
      e.chk = 0.25;
      const moved = Math.hypot(p.pos.x - e.last.x, p.pos.z - e.last.z);
      e.last.copy(p.pos);
      if (e.t > 0.35 && moved < 0.6) return true;
    }
    return false;
  }

  // Knight talent (Bastion Strike): the end of a Challenge, a slam of the shield all around (Shield Throw, Challenge, Retribution
  // and the Banner are in knight.js)
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
  // (Rage, the held Whirlwind, Execute and Unstoppable are in berserker.js, mixed in below; the Leap is here)

  // ---------- Berserker: the Leap ----------
  // The arc of a leap of d metres (up by dy): how high it bulges over the straight line, and how long it takes (as long as a body
  // thrown that high takes to fall back under LEAP.grav). Every screen works it out the same way.
  leapArc(d) {
    const L = LEAP;
    const apex = Math.min(L.apexMax, L.apexMin + L.apexK * d);
    return { apex, dur: Math.max(0.45, Math.sqrt((8 * apex) / L.grav)) };
  }

  // Where a Leap from `from` (his feet) toward `want` (the spot he chose) really ends. It is held to the reach; cut short in front of
  // whatever is in the arc's way (a wall, a tower, a merlon of the enemy's, a hill); and stepped back, a metre at a time, from a landing
  // that is not open ground (inside something, or up on an enemy castle's walls and towers). Returns { from, to, apex, dur, d, cut }
  // (to: his feet when he lands), or null when there is no leap to make (a wall right in front of him). The hero's own screen moves him
  // along it (Player.move); where the battle is run the slam comes at `to` when the time is up. A guest's leap is planned again on the
  // host, from where the host has him, so a guest cannot leap further than anyone else, or into a wall.
  leapPlan(p, from, want) {
    const L = LEAP, phys = this.g.physics;
    let dx = want.x - from.x, dz = want.z - from.z, d = Math.hypot(dx, dz);
    if (d < 0.01) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); d = L.min; } else { dx /= d; dz /= d; }
    d = Math.min(L.range, Math.max(L.min, d));
    const footY = Math.max(from.y, Number.isFinite(want.y) ? want.y : from.y) + 1.5;   // (the highest ground under the end of the arc, below this)
    let cut = false, ty = 0, tx = 0, tz = 0;
    for (let tries = 0; tries < 6; tries++) {
      // the landing: stepped back until it is open ground
      for (;;) {
        if (d < L.min - 1e-6) return null;
        tx = from.x + dx * d; tz = from.z + dz * d;
        ty = phys.groundHeight(tx, tz, footY, p.team);
        if (ty - from.y <= L.up && this.leapLandOk(p, tx, ty, tz)) break;
        d -= 1; cut = true;
      }
      // the arc: the first sample that meets something cuts it short a metre before it
      const { apex } = this.leapArc(d);
      const n = Math.max(4, Math.ceil(d / 0.5));
      let block = -1;
      for (let i = 1; i < n; i++) {
        const s = i / n, x = from.x + dx * d * s, z = from.z + dz * d * s;
        const y = from.y + (ty - from.y) * s + 4 * apex * s * (1 - s);
        if (y + 0.5 < phys.terrainHeight(x, z) || phys.pointHit(x, y + 0.5, z, p.team) || phys.pointHit(x, y + 1.6, z, p.team) || this.overWall(p, x, z, tx, ty, tz)) { block = s; break; }
      }
      if (block < 0) {
        const { dur } = this.leapArc(d);
        return { from: from.clone(), to: new THREE.Vector3(tx, ty, tz), apex, dur, d, cut };
      }
      d = d * block - 1; cut = true;
    }
    return null;
  }

  // Walls are not leapt over, however high the arc: one that passes over an enemy castle's wall, gate, tower or keep (or the practice
  // yard's walls) is stopped by it, unless the leap ends up on top of that very stone (the yard's wall top: an enemy's battlements are
  // refused by leapLandOk). Your own castle's stone does not stop you: its walls are too high to clear from the ground anyway, and from
  // the wall walk you may leap down outside.
  overWall(p, x, z, lx, ly, lz) {
    const g = this.g, phys = g.physics;
    for (const c of g.castles) {
      if (!c || allied(c.team, p.team) || !c.inFootprint({ x, z }, 1)) continue;
      if (this.overStone(c.bucket.list, x, z, lx, ly, lz, p.team)) return true;
    }
    const cell = phys.grid.get(phys.gridKey(Math.floor(x / phys.cell), Math.floor(z / phys.cell)));
    return !!cell && this.overStone(cell, x, z, lx, ly, lz, p.team);
  }
  overStone(list, x, z, lx, ly, lz, team) {
    const phys = this.g.physics;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ || !c.active || !WALL_KINDS.has(c.kind)) continue;
      if (c.kind === 'gate' && phys.lets(c, team)) continue;
      const top = c.heightFn ? c.heightFn(x, z) : c.top;
      const onIt = lx >= c.minX && lx <= c.maxX && lz >= c.minZ && lz <= c.maxZ && ly >= top - 0.1;   // (the leap ends up on this stone)
      if (!onIt) return true;
    }
    return false;
  }

  // Is this open ground for a leap to end on? Inside the world, nothing solid where the body would be, and not on top of an enemy
  // castle's walls, towers or keep (his own are fine: he may leap up onto his own wall walk).
  leapLandOk(p, x, y, z) {
    const g = this.g, phys = g.physics, lim = WORLD.playHalf - 1;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    for (const h of LAND_H) {
      if (phys.pointHit(x, y + h, z, p.team)) return false;
      for (let k = 0; k < 4; k++) if (phys.pointHit(x + LAND_RING[k * 2] * p.radius, y + h, z + LAND_RING[k * 2 + 1] * p.radius, p.team)) return false;
    }
    if (y > phys.terrainHeight(x, z) + 0.4) {   // (raised ground: a wall walk, a tower roof, a ramp ...)
      for (const c of g.castles) if (c && !allied(c.team, p.team) && c.inFootprint({ x, z }, 1)) return false;
    }
    return true;
  }

  // Leap (the Berserker's R). The hero's own screen has already set him flying along the plan (Player.useAbility: p.leap); a guest's
  // hero is planned here again. The slam comes when the arc ends (update: kind 'leap').
  leap(p, cam, dir, at) {
    let plan = p.leap && p.leap.t === 0 ? p.leap : null;
    if (!plan) plan = this.leapPlan(p, p.pos, at || this.aimPoint(cam, dir, LEAP.range, p.team).pos);
    if (!plan) return false;
    p.buffs.add('leaping', plan.dur);
    p.buffs.add('steady', plan.dur + 0.2);   // (nothing staggers him out of the air)
    this.active.push({ kind: 'leap', p, t: 0, dur: plan.dur, to: plan.to.clone() });
    this.emit('leap', plan.from, flat(new THREE.Vector3(plan.to.x - plan.from.x, 0, plan.to.z - plan.from.z)), [plan.to]);
    return true;
  }

  // The landing: the ground is slammed. Damage falls off toward the rim; everyone in it is staggered and the soldiers thrown back.
  slam(p, at) {
    const g = this.g, L = LEAP;
    const reach = talentFx(p, 'leapRadius', 1), radius = L.radius * reach;
    const dmg = p.meleeDmg * L.dmg * talentFx(p, 'leapDmg', 1), stun = talentFx(p, 'leapStun', 0);
    this.eachFoe(p.team, at.x, at.z, radius, (o, d) => {
      g.damage(o, dmg * (1 - (1 - L.edge) * Math.min(1, d / radius)), p, { melee: true, splash: true, charge: 1, ability: 'Leap' });
      if (!o.alive) return;
      if (o.stagger) o.stagger((o.isPlayer ? L.hero : L.stagger) + stun, { pos: at });
      if (o.vel && !o.isPlayer && !o.isGiant && !o.isSiege) {
        const l = d || 1;
        o.vel.x += ((o.pos.x - at.x) / l) * L.knock; o.vel.z += ((o.pos.z - at.z) / l) * L.knock;
      }
    }, at.y, 3);
    p.swingT = 0.3; p.attackDir = 'over';
    this.emit('slam', at, ZERO, null, reach);
  }

  // ---------- Ranger ----------
  // (Explosive Arrow and Hunting Hawk: ranger.js, mixed in below; Rain of Fire: ultimate.js)
  // A rain of arrows (Rain of Fire) on the circle e.c: the arrows that are due each fall steeply from above and behind onto a foe in the
  // circle (a little ahead of where it is walking: the one picked least so far, and no more than e.cap on any one), or onto a random spot.
  // e.fire: burning arrows (projectiles.js).
  rain(e) {
    const g = this.g, V = VOLLEY;
    while (e.n < e.shots.length && e.t >= e.shots[e.n]) {
      e.n++;
      const from = new THREE.Vector3(0, 0, 0);
      const T = Math.hypot(V.fallBack, V.fallH) / ARROW_SPEED;   // every arrow takes about the same time to come down
      let L = null;
      if (Math.random() < e.aimed) {
        let o = null, least = Infinity;
        this.eachFoe(e.p.team, e.c.x, e.c.z, e.radius, (f) => {
          const n = e.picked.get(f) || 0;
          if (e.cap && n >= e.cap) return;
          const k = n + Math.random() * 0.5;
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
      g.projectiles.fireArrow(from, v, e.p.team, e.dmg, e.p, true, e.ability, e.fire ? FIRE_ARROW : null);
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

  // Sniper Shot (a talent, slot 's'): the hero has already held the bow to the eye (Player.tickScope); this looses the one heavy arrow,
  // along where the scope was (the sway and all). It flies flat and fast out to the Fireball's reach (Projectiles: opts.snipe), then
  // falls as any arrow, on through the first body into one more.
  snipe(p, cam, dir) {
    const S = RANGER.snipe;
    const from = cam.clone().addScaledVector(dir, 0.6);
    from.y -= 0.05;
    this.g.projectiles.fireArrow(from, dir.clone().multiplyScalar(S.speed), p.team, p.bowDmg * S.dmg, p, false, 'Sniper Shot', { snipe: 1, pierce: S.pierce });
    p.swingT = 0.6; p.attackDir = 'over';
    this.emit('snipe', from, dir);
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
  // Smite: a bolt of holy lightning out of the Cleric's open hand, along the line of sight to the first thing it meets (as far as a
  // Fireball flies), blasting everyone near where it strikes. Every screen sees the bolt (Magic.onBolt), from the hand to the strike.
  smite(p, cam, dir) {
    const g = this.g, s = SPELLS.smite;
    const { pos: at, col } = this.rayHit(cam, dir, FIREBALL_RANGE, p.team);
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
    // the hand: a little ahead of the eyes, to the right and below them (where the first-person hand is, and the right hand of the body
    // the others see)
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const hand = cam.clone().addScaledVector(dir, 0.55).addScaledVector(right, 0.2);
    hand.y -= 0.22;
    g.magic.showBolt([hand, at], s.color);
    g.audio.play('crackle', hand);
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
    const hp0 = p.hp;
    p.heal(p.maxHp * 0.45 * mul * lift(p));
    ultGain(p, p.hp - hp0, ULT.healed);   // (health restored charges the Ultimate: ultimate.js)
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
    ultGain(p, Math.min(mended, ULT.healCap / ULT.healed), ULT.healed);   // (a light over a whole army: at most a quarter of the charge)
    this.emit('heal', p.pos, ZERO, healed, reach / 14);
    p.gainXp(Math.min(SUPPORT_XP.healCap, mended * SUPPORT_XP.heal), 'support');
  }

  // ---------- Cavalier ----------
  // Lance Charge: the gallop (Player.useAbility has set the hero off on it: p.dash) to the end of the planned run, flattening everyone in
  // the way (chargeSweep). A guest's run is planned again here from where the host has him.
  lancecharge(p, cam, dir, at) {
    const own = p.dash && p.dash.rush === 'lancecharge' && p.dash.fresh ? p.dash.plan : null;
    const plan = own || (at ? this.rushPlan(p, p.pos, at) : null);
    if (p.dash) p.dash.fresh = false;
    if (!plan) return false;
    const f = plan.f, dur = plan.d / this.rushSpeed(p) + 0.15;
    p.buffs.add('charging', dur);
    p.rushEnd = false;
    this.active.push({ kind: 'charge', p, t: 0, dur, f, hit: new Set(), chk: 0.25, last: p.pos.clone() });
    const rush = talentFx(p, 'chargeRush', null);   // Vanguard! (Cavalier talent): the army rides with the charge
    if (rush) this.eachFriend(p.team, p.pos.x, p.pos.z, rush.radius, (o) => { if (o !== p) this.haste(o, rush.time, rush.speed); });
    const wall = talentFx(p, 'chargeGuard', null);   // Shieldwall Charge (alternative to Vanguard!): the army is shielded instead of sped up
    if (wall) {
      this.eachFriend(p.team, p.pos.x, p.pos.z, wall.radius, (o) => { if (o !== p) this.guard(o, wall.time, 1 - wall.cut); });
      p.buffs.add('guard', wall.time, 1 - wall.cut);
    }
    this.emit('charge', p.pos, f, [plan.to]);
    return true;
  }

  // Everyone the charge has gone over since the last frame: along the stretch from where he was to where he is now, every 1.5 m (a
  // guest's hero moves in the steps its pose messages bring, several metres at a time at a gallop)
  chargeSweep(p, e) {
    const prev = e.prev || (e.prev = p.pos.clone());
    const d = Math.hypot(p.pos.x - prev.x, p.pos.z - prev.z), n = Math.min(80, Math.max(1, Math.ceil(d / 1.5)));
    const c = this.sweepV || (this.sweepV = new THREE.Vector3());
    for (let i = 1; i <= n; i++) {
      c.copy(prev).lerp(p.pos, i / n).addScaledVector(e.f, 1.2);
      this.chargeHit(p, e, c);
    }
    prev.copy(p.pos);
  }

  chargeHit(p, e, c) {
    const g = this.g;
    this.eachFoe(p.team, c.x, c.z, (p.mounted ? 2.6 : 2) * talentFx(p, 'chargeReach', 1), (o) => {
      if (e.hit.has(o)) return;
      e.hit.add(o);
      const hero = o.isPlayer || o.kit ? CAV.hero.lance : 1;   // (a rival hero is ridden down for less: cavalier.js CAV.hero)
      g.damage(o, (p.meleeDmg * 2 + (p.mounted ? 25 : 0)) * talentFx(p, 'chargeDmg', 1) * momentumMul(p) * hero, p, { melee: true, splash: true, charge: 1, ability: 'Lance Charge' });
      if (!o.alive) return;
      if (o.stagger) o.stagger(1.3, p);
      if (o.vel && !o.isPlayer) { o.vel.x += e.f.x * 12; o.vel.z += e.f.z * 12; }
      g.fx.sparks(o.chest(new THREE.Vector3()), 10);
      g.audio.play('thud', o.pos);
    }, p.pos.y, 3);
  }

  // (Sweeping Strike and Call the Charge, the Cavalier's Q and Ultimate, are in cavalier.js: the Rally Cry is part of the Ultimate now)

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
    const near = (h) => {
      if (!h || !h.alive) return;
      const dx = h.pos.x - pos.x, dz = h.pos.z - pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = h; }
    };
    for (const h of this.g.humans) near(h);
    for (const f of this.g.factions) if (f && f.hero && f.hero.kit) near(f.hero);   // (a lord the computer plays as a hero: lordkit.js)
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
      case 'leap': {
        // the take-off: dust thrown off the ground and a burst of embers; the landing spot is marked until he comes down, and every
        // screen sees a streak of embers follow him through the air
        const to = targets && targets[0];
        fx._dust(at.clone().setY(at.y + 0.2), 12, 2.2, '');
        gf.glyph('shock', at.x, at.y, at.z, 2.6, 0xff8a50, 0.4, { team: house });
        if (to) {
          const dur = this.leapArc(Math.hypot(to.x - at.x, to.z - at.z)).dur;
          gf.glyph('rune', to.x, to.y, to.z, LEAP.radius * 0.8, 0xff5a30, dur + 0.25, { arms: 4, team: house, strength: 1.3 });
          if (who) this.trails.push({ who, f: dir, t: 0, dur, acc: 0, leap: true });
        }
        snd('leap');
        break;
      }
      case 'slam': {
        const r = LEAP.radius * sz;
        gf.glyph('shock', at.x, at.y, at.z, r * 1.25, 0xffb080, 0.6, { team: house, strength: 1.9 });
        gf.glyph('pulse', at.x, at.y, at.z, r, 0xff4a2a, 0.75, { strength: 1.7 });
        gf.glyph('slash', at.x, at.y, at.z, r * 0.8, 0xffd0a0, 0.5, { team: house, strength: 1.5 });
        fx._dust(at.clone().setY(at.y + 0.2), 26, r * 0.7, '');
        fx.ring(at, r * 0.45, this.col.set(0xffa070), 30, { up: 1.0, size: 0.42, speed: 8 });
        fx._sparks(chest, 16);
        fx.crater(at, 1.8 * sz);
        if (g.camfx) g.camfx.boom(at, 0.8);
        snd('slam');
        break;
      }
      case 'snipe': {
        // a sharp crack and a puff of air at the bow; the arrow itself, with its long bright streak, is drawn by Projectiles on every screen
        const f = this.tmpv.copy(dir).normalize();
        fx.flash(at.clone().addScaledVector(f, 0.5), this.col.set(0xe8f6d0), 1.8, 0.12, 0.6);
        fx.ring(at.clone().addScaledVector(f, 0.7), 0.2, this.col.set(0xf0f8e0), 12, { up: 0.2, size: 0.15, speed: 6 });
        snd('snipe');
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
        gf.pillar(at.x, at.y, at.z, 0xffe9a0, 0.5, 0.9 * sz, 3.5, 0.6);   // (a short flare where the bolt strikes: the bolt itself comes from the hand)
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
        const to = targets && targets[0];   // (the end of the run: the dust follows him until he gets there)
        if (who) this.trails.push({ who, f, t: 0, dur: to ? Math.hypot(to.x - at.x, to.z - at.z) / (who.mounted ? RUSH.lance.mounted : RUSH.lance.speed) + 0.2 : 1.2, acc: 0 });
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
      default:
        { const look = ULT_SHOW[id] || RANGER_SHOW[id]; if (look) look({ A: this, g, at, dir: flat(dir), targets, sz, who, house, silent, snd }); }   // (the Ultimates' looks: ultimate.js; the Ranger's: ranger.js)
        break;
    }
  }
}

// the Ultimates' methods (Meteor, Sanctuary, the stand-ins) are Abilities' own: see the top of ultimate.js; and the Cavalier's (cavalier.js)
Object.assign(Abilities.prototype, ULT_METHODS, CAV_METHODS);
Object.assign(Abilities.prototype, BERSERKER_METHODS);   // (the Berserker's Whirlwind, Execute and Unstoppable: berserker.js)
Object.assign(Abilities.prototype, KNIGHT_METHODS);   // (the Knight's Shield Throw, Challenge, Retribution and Banner: knight.js)
Object.assign(BUFF_NAMES, KNIGHT_BUFFS);
Object.assign(Abilities.prototype, RANGER_METHODS);   // (the Ranger's Explosive Arrow and Hunting Hawk: ranger.js)

function stepUltFx(A, dt) {
  for (let i = A.ultFx.length - 1; i >= 0; i--) if (A.ultFx[i].step(A, A.ultFx[i], dt) === false) A.ultFx.splice(i, 1);
}
