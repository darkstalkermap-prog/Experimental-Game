// =====================================================================================================================================
// THE ULTIMATE: every hero's third ability (key Z: ULT.key in config.js). It does not come round on a timer: it charges from fighting
// (damage dealt, damage taken, health restored), 0 to 1, and when it is full the icon in the dock glows and one press lets it go.
// The charge is kept through a fall and lost with a change of class. Its numbers are in config.js (ULT).
//
// The six: the Mage's Meteor, the Cleric's Sanctuary and the Ranger's Rain of Fire are here; the Knight's Banner of the Realm (knight.js),
// the Berserker's Unstoppable (berserker.js) and the Cavalier's Call the Charge (cavalier.js) live with the rest of their classes.
// HOW A CLASS ADDS (OR REPLACES) ITS ULTIMATE:
//
// 1. The definition: classes.js, CLASSES.<class>.u, next to q and r:
//      u: { id, icon, name, desc, kind: 'Ultimate', aimed?, range?, radius?, cast?, ...your numbers }
//    id      the name of the method that runs it (2.), of its look (3.) and of its bot rule (4.); unique across the classes
//    aimed   true: holding Z puts a circle on the ground that follows the crosshair (the volley's aiming path, Player.updateAim) out to
//            `range` m with a ring of `radius` m; letting go casts it there (the method gets the spot as `at`). Not aimed: it goes off
//            the moment Z is pressed.
//    cast    the colour of the raised spell hand in the first-person view as it is cast (Player.useAbility: castFlash); omit for none.
//    lasts   seconds the Ultimate goes on working after the cast (the Meteor's fall and burning ground); the charge does not fill again
//            until then, so an Ultimate never pays for the next one with its own damage (default ULT.lasts).
//    The definition is passed to the method as its fifth argument, so its numbers can live on it.
// 2. The method: `name(p, cam, dir, at, def)` in your class's section of ULT_METHODS below. It runs only where the battle is
//    simulated (single player, or the host), mixed into Abilities (classes.js), so `this` is Abilities: this.g (the game),
//    this.eachFoe / this.eachFriend, this.aimPoint, this.emit, this.gfx, this.active. Abilities.use has already checked and spent the
//    charge (return false to refuse: the charge comes back). The caster p is a Player (a person, a guest's hero on the host, a hero
//    bot) or a lord the computer plays as a hero (lordkit.js: a Unit with a kit): use only what both have (pos, yaw, team, alive,
//    meleeDmg, bowDmg, mods, buffs, heal, chest, eyePos, stagger, game). Damage goes through this.g.damage(o, n, p, { ..., ability: name })
//    (it fills nobody's Ultimate twice: the charge is worked out there). Something that plays out over time: push
//    { kind: 'ult', p, t: 0, tick(A, e, dt) } onto this.active; Abilities.update calls tick every frame (also after the caster
//    falls) until it returns false.
// 3. The look: ULT_SHOW[id](ctx) runs on EVERY screen when the method calls this.emit(id, pos, dir, targets, sz); the host sends that
//    to the guests as one small 'abil' event. ctx: { A (Abilities), g, at (Vector3), dir (flat Vector3), targets, sz, who (the caster,
//    if found near pos), house (his colour), silent, snd(name) }. Use the local effects (fx._dust, fx._sparks, fx.explosion; not
//    fx.dust / fx.sparks, which the host also sends), ctx.snd for sounds (the host's sound reaches the guests by itself), and
//    A.ultFx.push({ step(A, e, dt) }) for a look that plays out over time: Abilities.updateFx steps it (with the look's own dice:
//    modelkit.js quietly) until it returns false. Never damage in a look.
// 4. The bots: ULT_AI[id](brain, p, def) is asked a few times a second while the charge is full, by the hero bots (herobot.js) and by
//    the lords the computer plays as heroes (lordkit.js: rival lords, War Mode's generals). brain: foes (with dist: the gap to each),
//    friends, n ({ c3, c5, c8, c12, heroes8 }: foes within 3, 5, 8, 12 m, rival heroes within 8), hpf (the caster's share of health),
//    countAt(x, z, r). Return null (not now), {} to cast an instant one, or { at } (a point on the ground) for an aimed one. Use it
//    when it counts: a knot of foes, a rival hero close, allies in danger; never on a lone soldier.
// 5. Online: nothing to add. A guest's Z goes to the host as an 'abil' message with s: 'u' (netsync.js); the host checks that it is
//    that guest's own hero, alive, not staggered, not steering an engine, and fully charged (Abilities.use) before running the
//    method; the charge reaches the guest in its snapshot (me.ult, 0..100, rounded down so a guest never sees "full" early).
// 6. The charge: nothing to add (ultGain below, called from Game.damage and from the healing abilities).
// =====================================================================================================================================
import * as THREE from 'three';
import { ULT } from './config.js';
import { allied } from './teams.js';
import { SOUNDS } from './audio.js';
import { FOG_ADD } from './particles.js';

const ZERO = new THREE.Vector3();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const flat = (d) => { const l = Math.hypot(d.x, d.z) || 1; return new THREE.Vector3(d.x / l, 0, d.z / l); };

// ------------------------------------------------------------------------------------------------------------------ the charge
export function ultReady(p) { return !!p && p.ult >= 1 - 1e-6; }

// What a point of damage dealt to `target` is worth to the attacker's charge (heroes count most, castle stone least: it has thousands).
export function dealtWeight(target) {
  const D = ULT.dealt;
  if (target.isStructure) return D.structure;
  if (target.isSiege) return D.siege;
  if (target.isPlayer || target.kit) return D.hero;
  return D.soldier;
}

// Charge hero o's Ultimate by `amount` points of health that changed hands, at `w` a point. Only where the battle is run (a guest's bar
// comes in the snapshot), and only for those that have one (heroes and the lords that fight as heroes).
export function ultGain(o, amount, w) {
  if (!o || o.ult === undefined || !o.alive || !(amount > 0) || !(w > 0)) return;
  const g = o.game;
  if (!g || !g.simulating || o.ultHold > g.time) return;   // (an Ultimate still at work charges nothing: Abilities.use sets ultHold)
  o.ult = Math.min(1, o.ult + amount * w * (ULT.rate[o.classId] || 1));   // (each class at its own pace: ULT.rate)
}

// The Cleric's Sanctuary: a blow that would bring someone inside the light below 1 health leaves him on 1 (Player.takeDamage and
// Unit.takeDamage call this just before the health comes off). Returns what is left of the blow.
export function spared(o, amount) {
  const g = o.game;
  if (!(o.sanctUntil > g.time) || o.hp - amount >= 1) return amount;
  if (!(g.time - (o.sparedAt || -9) < 0.5)) { o.sparedAt = g.time; g.fx.gold(o.chest(V1)); }   // (a glint: the light held him)
  return Math.max(0, o.hp - 1);
}

// ------------------------------------------------------------------------------------------------------------------ the methods
// (mixed into Abilities.prototype by classes.js; `this` is Abilities)
const M = ULT.meteor, SANCT = ULT.sanctuary;

// The Ranger's Rain of Fire (its card's text reads these too): aimed as far as `range` m, a circle of `radius` m. `arrows` burning arrows,
// each `dmg` of her bow's damage, come down from `delay` s after the cast over `span` s, `aimed` of them each on a foe in the circle (at
// most `cap` on any one), the rest at random. From `burnAt` s the ground burns for `burn` s in `burnR` m: `burnDps` of her bow's damage a
// second to every foe in it, `siege` of that to engines; with more than `crowd` soldiers in the fire each burns for his share of it (as
// in the Meteor's crater: a War Mode block is scorched, not burnt down; the fire was most of the 9000 damage a cast did there).
export const RAIN = { range: 85, radius: 12, arrows: 72, dmg: 0.9, delay: 0.7, span: 2.6, aimed: 0.75, cap: 5, burnAt: 1.1, burn: 5, burnR: 11, burnDps: 0.6, siege: 0.5, crowd: 14 };

export const ULT_METHODS = {
  // the pooled looks the Ultimates need, made once with the world (so their shaders are compiled before the battle: Game.warmup)
  ultInit() {
    this.ultFx = [];
    this.meteorPool = [];
    const g = this.g;
    if (!g.scene || !g.projectiles) return;
    // (the rock's material: the catapult stone's, darker and glowing from within; its colours are uniforms, so it is the same shader)
    if (!this.meteorMat) this.meteorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1, flatShading: true, emissive: 0xff5a18, emissiveIntensity: 0.14 });
    for (let i = 0; i < 2; i++) this.meteorPool.push(makeMeteorLook(this));
  },

  // ---------------------------------------------------------------- Mage: Meteor
  // A circle on the ground (aimed); after ULT.meteor.fall s a burning rock comes down on it out of the sky: heavy damage in a wide
  // ring (less toward the rim), soldiers knocked down and thrown out, heroes staggered, castle stone, gates and engines broken as by a
  // heavy siege stone. Then the ground burns for a while and hurts every foe who stands in it.
  meteor(p, cam, dir, at) {
    const g = this.g;
    const c = at ? at.clone() : this.aimPoint(cam, dir, M.range, p.team).pos;
    const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > M.range + 6) {   // (a guest's spot is held to the Mage's reach)
      const k = (M.range + 6) / dist;
      c.x = p.pos.x + dx * k; c.z = p.pos.z + dz * k;
    }
    c.y = g.physics.groundHeight(c.x, c.z, c.y + 2);
    const f = flat(new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z));
    this.active.push({ kind: 'ult', p, team: p.team, t: 0, c, dmg: M.dmg * (p.mods.spell || 1), tick: meteorTick });
    p.swingT = 0.25; p.attackDir = 'over';
    this.emit('meteor', c, f);
  },

  // ---------------------------------------------------------------- Cleric: Sanctuary
  // A circle of golden light round where the Cleric stands, for ULT.sanctuary.time s: nobody of her side inside it (heroes, soldiers,
  // co-op allies) can be brought below 1 health (spared, above).
  sanctuary(p) {
    const c = p.pos.clone();
    const e = { kind: 'ult', p, team: p.team, t: 0, c, end: this.g.time + SANCT.time, every: 0, tick: sanctuaryTick };
    this.active.push(e);
    sanctuaryTick(this, e, 0);   // (at once: a blow in this very frame is held too)
    this.emit('sanctuary', c, ZERO);
  },

  // ---------------------------------------------------------------- Ranger: Rain of Fire
  // A wide circle on the ground (aimed, as far as RAIN.range): a flight of burning arrows goes up from the bow, and from RAIN.delay s
  // they come down on the circle for RAIN.span s, most of them each on a foe inside it (the one picked least so far, and no more than
  // RAIN.cap on any one: a lone hero is scorched, not shot to pieces); where they land the ground catches and burns (burnGround), wooden
  // engines too. The arrows fall through Abilities.rain (classes.js), the machinery of arrows coming down on a circle.
  rainfire(p, cam, dir, at) {
    const g = this.g, R = RAIN;
    const c = at ? at.clone() : this.aimPoint(cam, dir, R.range, p.team).pos;
    const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > R.range + 6) {   // (a guest's spot is held to the Ranger's reach)
      const k = (R.range + 6) / dist;
      c.x = p.pos.x + dx * k; c.z = p.pos.z + dz * k;
    }
    c.y = g.physics.groundHeight(c.x, c.z, c.y + 2);
    const f = flat(new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z));
    const shots = [];
    for (let i = 0; i < R.arrows; i++) shots.push(R.delay + (i + Math.random()) * R.span / R.arrows);
    this.active.push({ kind: 'rain', p, t: 0, c, f, shots, n: 0, picked: new Map(), dmg: p.bowDmg * R.dmg, radius: R.radius, aimed: R.aimed, cap: R.cap, fire: true, ability: 'Rain of Fire' });
    burnGround(this, { c, team: p.team, p, r: R.burnR, dps: p.bowDmg * R.burnDps, time: R.burn, delay: R.burnAt, ability: 'Rain of Fire', siege: R.siege, crowd: R.crowd });
    p.swingT = 0.6; p.attackDir = 'over';
    this.emit('rainfire', cam, f, [c]);
  },
};

// The Meteor's course where the battle is run: the impact when the rock comes down, then the burning ground.
function meteorTick(A, e) {
  if (e.t < M.fall) return true;
  meteorImpact(A, e);
  burnGround(A, { c: e.c, team: e.team, p: e.p, r: M.burnR, dps: M.burnDps * (e.dmg / M.dmg), time: M.burn, ability: 'Meteor', crowd: M.burnCrowd });
  return false;
}

// ------------------------------------------------------------------------------------------------------------------ burning ground
// Ground set on fire (the Meteor's crater; the Ranger's Explosive Arrow and Rain of Fire: ranger.js and below): for `time` s from
// `delay`, every foe standing within `r` m of c takes `dps` a second (in ticks of ULT.meteor.tick s); engines `siege` of it (0: none,
// they are too big to catch from a patch of flames). Where the battle is run; the look is burnLook below.
export function burnGround(A, { c, team, p, r, dps, time, delay = 0, ability, siege = 0, crowd = 0 }) {
  A.active.push({ kind: 'ult', p, team, t: 0, c, r, dps, time, delay, ability, siege, crowd, every: 0, tick: burnTick });
}

function burnTick(A, e, dt) {
  if (e.t < e.delay) return true;
  if (e.t > e.delay + e.time) return false;
  if ((e.every -= dt) > 0) return true;
  e.every += M.tick;
  const g = A.g, c = e.c, n = e.dps * M.tick;
  // (the Meteor's crater: with more soldiers in the fire than its `crowd`, each burns for his share of it)
  let share = 1;
  if (e.crowd) {
    let men = 0;
    A.eachFoe(e.team, c.x, c.z, e.r, (o) => { if (!o.isSiege && !isHero(o)) men++; }, c.y, 2.5);
    if (men > e.crowd) share = e.crowd / men;
  }
  A.eachFoe(e.team, c.x, c.z, e.r, (o) => {
    if (!o.isSiege) g.damage(o, isHero(o) ? n : n * share, e.p, { magic: true, splash: true, ability: e.ability });
    else if (e.siege) g.damage(o, n * e.siege, e.p, { magic: true, ability: e.ability });
  }, c.y, 2.5);
  return true;
}

function meteorImpact(A, e) {
  const g = A.g, c = e.c, R = M.radius;
  // (in a packed host the blow is shared out: with more soldiers under it than M.crowd, each takes his share; heroes take it in full)
  let men = 0;
  A.eachFoe(e.team, c.x, c.z, R, (o) => { if (!o.isSiege && !isHero(o)) men++; }, c.y, 6);
  const share = men > M.crowd ? M.crowd / men : 1;
  A.eachFoe(e.team, c.x, c.z, R, (o, d) => {
    const k = 1 - (1 - M.edge) * Math.min(1, d / R);
    if (o.isSiege) { g.damage(o, M.structure * k, e.p, { magic: true, ability: 'Meteor' }); return; }
    const hero = isHero(o);
    g.damage(o, e.dmg * k * (hero ? 1 : share), e.p, { magic: true, splash: true, ability: 'Meteor' });
    if (!o.alive) return;
    if (o.stagger) o.stagger(hero ? M.hero : M.stagger * (0.6 + 0.4 * k), { pos: c });
    if (o.vel && !o.isPlayer && !o.isGiant) {
      const l = d || 1;
      o.vel.x += ((o.pos.x - c.x) / l) * M.knock * k; o.vel.z += ((o.pos.z - c.z) / l) * M.knock * k;
    }
  }, c.y, 6);
  // castle stone, gates and keeps (a heavy siege stone's worth, less toward the rim)
  for (const castle of g.castles || []) {
    if (!castle || allied(castle.team, e.team) || !castle.walls) continue;
    for (const part of [castle.gate, castle.keep, ...castle.walls]) {
      if (!part || !part.alive || !part.takeDamage) continue;
      const b = part.collider;
      const d = b ? Math.hypot(Math.max(b.minX - c.x, 0, c.x - b.maxX), Math.max(b.minZ - c.z, 0, c.z - b.maxZ)) : Math.max(0, Math.hypot(part.pos.x - c.x, part.pos.z - c.z) - (part.radius || 0));
      if (d > R) continue;
      g.damage(part, M.structure * (1 - (1 - M.edge) * d / R), e.p, { ability: 'Meteor' });
    }
  }
}

function sanctuaryTick(A, e, dt) {
  const g = A.g;
  if (g.time >= e.end) return false;
  if ((e.every -= dt) > 0) return true;
  e.every = 0.1;
  const until = Math.min(e.end, g.time + 0.25), c = e.c;
  A.eachFriend(e.team, c.x, c.z, SANCT.radius, (o) => { if (Math.abs(o.pos.y - c.y) < 6) o.sanctUntil = until; });
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the looks
// (every screen; `this` is not used: ctx.A is Abilities)
export const ULT_SHOW = {
  meteor(ctx) {
    const { A, at, dir, house } = ctx;
    // the spot is marked at once, a red circle that turns until the rock lands
    A.gfx.glyph('rune', at.x, at.y, at.z, M.radius, 0xff5a20, M.fall + 0.15, { arms: 7, team: house, strength: 1.7 });
    A.gfx.glyph('pulse', at.x, at.y, at.z, M.radius * 0.6, 0xff7a30, M.fall, { strength: 1.2 });
    ctx.snd('meteorfall');
    const look = A.meteorPool.find((m) => !m.on) || null;
    // it comes in from high up beyond the spot and a little aside, steep and fast, so the caster sees it fall ahead of him
    const from = new THREE.Vector3(at.x + dir.x * 34 - dir.z * 22, at.y + 95, at.z + dir.z * 34 + dir.x * 22);
    if (look) startMeteorLook(A, look, at);
    A.ultFx.push({ t: 0, at: at.clone(), from, u: from.clone().sub(at).normalize(), look, acc: 0, silent: ctx.silent, house, step: meteorLookStep });
  },

  sanctuary(ctx) {
    const { A, g, at, house } = ctx, gf = A.gfx, fx = g.fx, R = SANCT.radius, T = SANCT.time;
    gf.dome(0xffe2a0, T, R, null, { strength: 1.0, x: at.x, y: at.y, z: at.z });
    gf.glyph('rune', at.x, at.y, at.z, R, 0xffd870, T, { arms: 8, team: house, strength: 1.6 });
    gf.glyph('shock', at.x, at.y, at.z, R * 1.15, 0xfff0c0, 0.9, { team: house, strength: 1.6 });
    gf.pillar(at.x, at.y, at.z, 0xffe9a0, T, 1.4, 18, 1.4);
    fx.ring(at, R * 0.9, A.col.set(0xffe08a), 40, { up: 1.6, size: 0.36, life: 1.2 });
    fx.flash(V1.copy(at).setY(at.y + 1.4), A.col.set(0xfff0c0), 6, 0.4, 0.8);
    ctx.snd('sanctuary');
    A.ultFx.push({ t: 0, at: at.clone(), acc: 0, silent: ctx.silent, step: sanctuaryLookStep });
  },

  // Rain of Fire: a flight of burning arrows climbs from the bow, the circle glows red until they have all come down (each one is an arrow
  // every screen gets, burning: projectiles.js), and the ground catches as they land (burnLook)
  rainfire(ctx) {
    const { A, g, at, dir, targets, house } = ctx, fx = g.fx, c = targets && targets[0], R = RAIN;
    ctx.snd('rainfire');
    fx.flash(V1.copy(at).addScaledVector(dir, 0.6), A.col.set(0xffa050), 2.4, 0.2, 0.9);
    for (let i = 0; i < 14; i++) {
      V1.copy(at).addScaledVector(dir, 0.6);
      g.projectiles.showArrow(V1, V2.set(dir.x * 9 + (Math.random() - 0.5) * 6, 46 + Math.random() * 8, dir.z * 9 + (Math.random() - 0.5) * 6), 0.9, who(ctx), true);
    }
    if (!c) return;
    const T = R.delay + R.span;
    if (g.aimRing) g.aimRing.flash(c, R.radius, T);
    A.gfx.glyph('rune', c.x, c.y, c.z, R.radius, 0xff6a28, T, { arms: 8, team: house, strength: 1.5 });
    A.gfx.glyph('pulse', c.x, c.y, c.z, R.radius * 0.7, 0xff8a40, R.delay + 0.3, { strength: 1.2 });
    A.ultFx.push({ t: 0, c: c.clone(), silent: ctx.silent, step: rainLookStep });
  },
};

// the rock's course on screen: the fall (the streak of fire and smoke, its shadow growing on the ground), the impact
function meteorLookStep(A, e, dt) {
  const g = A.g, fx = g.fx, at = e.at;
  e.t += dt;
  if (e.t < M.fall) {
    const s = e.t / M.fall, k = s * (0.35 + 0.65 * s);   // (it gathers speed as it falls)
    const x = e.from.x + (at.x - e.from.x) * k, y = e.from.y + (at.y + 1.2 - e.from.y) * k, z = e.from.z + (at.z - e.from.z) * k;
    if (e.look) placeMeteorLook(e.look, x, y, z, s, e.t);
    e.acc += dt;
    while (e.acc > 0.016) {   // (flames wrapped round it and a long trail of fire and smoke behind it: a puff every 16 ms)
      e.acc -= 0.016;
      const u = e.u;
      fx.blaze(V1.set(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2), 2.4);
      const b = 1 + Math.random() * 14;   // (1 to 15 m behind the rock, along the way it came)
      V1.set(x + u.x * b + (Math.random() - 0.5) * 1.6, y + u.y * b + (Math.random() - 0.5) * 1.6, z + u.z * b + (Math.random() - 0.5) * 1.6);
      fx.blaze(V1, 1.6 - b * 0.06);
      if (Math.random() < 0.35) fx.smoke(V1);   // (a dark plume left hanging in the sky: the fire alone is lost against a bright sky)
    }
    if (Math.random() < 0.35) fx.flash(V1.set(x, y, z), A.col.set(0xffa040), 7, 0.12, 0.9);
    return true;
  }
  // it lands: the blast, then the burning ground (burnLook) carries on as a look of its own
  if (e.look) hideMeteorLook(e.look);
  const R = M.radius;
  fx.explosion(V1.copy(at).setY(at.y + 0.6), 7);
  fx.explosion(V1.copy(at).setY(at.y + 4.5), 5);   // (a second ball of flame, higher: the blast stands tall)
  for (let i = 0; i < 18; i++) {   // a column of fire where it struck, and flames thrown round it
    const a = Math.random() * Math.PI * 2, r = i < 8 ? Math.random() * 1.5 : 2 + Math.random() * (R - 2);
    V1.set(at.x + Math.cos(a) * r, at.y + (i < 8 ? Math.random() * 5 : 0.2), at.z + Math.sin(a) * r);
    fx.blaze(V1, i < 8 ? 3.6 : 2.2);
  }
  A.gfx.pillar(at.x, at.y, at.z, 0xff9a40, 0.9, 3.2, 26, 1.8);
  for (let i = 0; i < 9; i++) {   // the plume of black smoke that rises after it, and hangs
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
    fx.smoke(V1.set(at.x + Math.cos(a) * r, at.y + 0.5 + Math.random() * 3, at.z + Math.sin(a) * r));
  }
  fx.crater(at, 4.6);
  fx.scorch(at, R * 0.9);
  fx._dust(V1.copy(at).setY(at.y + 0.3), 40, R * 0.8, '');
  fx._sparks(V1.copy(at).setY(at.y + 1.2), 40);
  fx.ring(at, R * 0.5, A.col.set(0xffa060), 40, { up: 1.2, size: 0.5, speed: 12 });
  A.gfx.glyph('shock', at.x, at.y, at.z, R * 1.5, 0xffc080, 0.8, { team: e.house, strength: 2 });
  A.gfx.glyph('pulse', at.x, at.y, at.z, R, 0xff4a1a, 1.0, { strength: 2 });
  if (g.magic) g.magic.flash(V1.copy(at).setY(at.y + 2), 0xff8a30, 22);
  if (g.camfx) g.camfx.boom(at, 1);
  if (!e.silent) g.audio.play('meteor', at);
  burnLook(A, at, M.burnR, M.burn, e.silent);   // (then the ground burns, glowing until it goes out)
  return false;
}

// The look of burning ground (burnGround above), on every screen: a glowing circle, tongues of flame here and there in it (thinner as it
// dies down: about 0.6 a square metre each second, as the Meteor's crater; a small patch more thickly, so it still reads as a fire from
// afar), their glow on everything near, and a crackle.
export function burnLook(A, at, r, time, silent = false) {
  A.gfx.glyph('rune', at.x, at.y, at.z, r, 0xff3a10, time, { arms: r > 5 ? 9 : 6, strength: 1.6 });
  A.ultFx.push({ t: 0, at: at.clone(), r, time, acc: 0, crackle: 0, silent, every: Math.max(0.004, Math.min(0.016, 1 / (0.6 * Math.PI * r * r))), step: burnLookStep });
}

function burnLookStep(A, e, dt) {
  const g = A.g, fx = g.fx, at = e.at;
  e.t += dt;
  if (e.t > e.time) return false;
  const left = 1 - e.t / e.time;
  e.acc += dt;
  const every = e.every / Math.max(0.25, left);   // (fewer and lower flames as it dies down)
  while (e.acc > every) {
    e.acc -= every;
    const a = Math.random() * Math.PI * 2, r = e.r * Math.sqrt(Math.random()) * 0.95;
    const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
    V1.set(x, g.physics.groundHeight(x, z, at.y + 2) + 0.1, z);
    fx.blaze(V1, (1.1 + Math.random() * 1.1) * (0.45 + 0.55 * left));
    if (Math.random() < 0.04) fx.smoke(V1);
  }
  if (Math.random() < 0.25) fx.flash(V1.set(at.x, at.y + 1.2, at.z), A.col.set(0xff7a30), e.r * 1.6 * (0.4 + 0.6 * left), 0.3, 0.5);   // (the glow of it on everything near)
  e.crackle -= dt;
  if (e.crackle <= 0) { e.crackle = 1.1; if (!e.silent) g.audio.play('burning', at); }
  return true;
}

const who = (ctx) => (ctx.who ? ctx.who.team : -1);

// Rain of Fire's circle once the arrows begin to land: the ground catches (and burns on: burnLook)
function rainLookStep(A, e, dt) {
  e.t += dt;
  if (e.t < RAIN.burnAt) return true;
  burnLook(A, e.c, RAIN.burnR, RAIN.burn, e.silent);
  return false;
}

// the light's course on screen: motes rising inside the circle, and the end
function sanctuaryLookStep(A, e, dt) {
  const g = A.g, fx = g.fx, at = e.at, R = SANCT.radius;
  e.t += dt;
  if (e.t >= SANCT.time) {
    fx.ring(at, R * 0.95, A.col.set(0xfff0c0), 36, { up: 2.2, size: 0.3, life: 0.9 });
    A.gfx.glyph('shock', at.x, at.y, at.z, R, 0xfff0c0, 0.7, { strength: 1.3 });
    if (!e.silent) g.audio.play('sanctend', at);
    return false;
  }
  e.acc += dt;
  while (e.acc > 0.12) {
    e.acc -= 0.12;
    const a = Math.random() * Math.PI * 2, r = R * Math.sqrt(Math.random()) * 0.95;
    const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
    fx.gold(V1.set(x, g.physics.groundHeight(x, z, at.y + 2) + 0.4 + Math.random() * 1.5, z));
  }
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the rock and its shadow
// The rock is the catapult stone's mesh and material, scaled up (no new shader); the shadow is a dark disc that lies on the land (a polar
// grid laid on the ground where the rock will land) and grows as it comes down. Two of each are made with the world.
const SH_RINGS = 10, SH_SEGS = 40;
const SHADOW_V = `
attribute vec2 aPolar;
varying vec2 vPolar;
#include <fog_pars_vertex>
void main() {
  vPolar = aPolar;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
// (the darkness fades with the fog as the land behind it does: the fog's own reckoning, as FOG_ADD finds it for the additive looks)
const SHADOW_F = `
uniform float uR;
uniform float uA;
varying vec2 vPolar;
#include <fog_pars_fragment>
void main() {
  float r = vPolar.x / max(uR, 0.01);
  float a = uA * (1.0 - smoothstep(0.35, 1.0, r));
  gl_FragColor = vec4(1.0);
  ${FOG_ADD}
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * clamp(gl_FragColor.r, 0.0, 1.0));
}`;

function makeMeteorLook(A) {
  const g = A.g, P = g.projectiles;
  const rock = new THREE.Mesh(P.rockGeo, A.meteorMat || P.rockMat);
  rock.frustumCulled = false;
  rock.visible = false;   // (hidden while idle: no draw call; its shader is the catapult stone's, compiled with the world)
  g.scene.add(rock);
  const nv = (SH_RINGS + 1) * (SH_SEGS + 1);
  const polar = new Float32Array(nv * 2), idx = [];
  for (let j = 0; j <= SH_RINGS; j++) for (let i = 0; i <= SH_SEGS; i++) { const v = j * (SH_SEGS + 1) + i; polar[v * 2] = j / SH_RINGS; polar[v * 2 + 1] = (i / SH_SEGS) * Math.PI * 2; }
  for (let j = 0; j < SH_RINGS; j++) for (let i = 0; i < SH_SEGS; i++) { const a = j * (SH_SEGS + 1) + i, b = a + 1, c = a + SH_SEGS + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aPolar', new THREE.BufferAttribute(polar, 2));
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uR: { value: 1 }, uA: { value: 0 }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    vertexShader: SHADOW_V, fragmentShader: SHADOW_F,
  });
  mat.name = 'meteorShadow';
  const shadow = new THREE.Mesh(geo, mat);
  shadow.frustumCulled = false; shadow.matrixAutoUpdate = false; shadow.renderOrder = 4;
  g.scene.add(shadow);
  return { on: false, rock, shadow, geo, mat, nv, polar, spin: new THREE.Vector3() };
}

function startMeteorLook(A, m, at) {
  const phys = A.g.physics, pos = m.geo.attributes.position, R = M.radius * 1.05;
  for (let v = 0; v < m.nv; v++) {
    const rad = m.polar[v * 2] * R, th = m.polar[v * 2 + 1];
    const x = at.x + Math.cos(th) * rad, z = at.z + Math.sin(th) * rad;
    pos.setXYZ(v, x, phys.groundHeight(x, z, at.y + 1.5) + 0.08, z);
  }
  pos.needsUpdate = true;
  m.geo.setDrawRange(0, SH_RINGS * SH_SEGS * 6);
  m.on = true;
  m.rock.visible = true;
  m.spin.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  m.rock.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
}

function placeMeteorLook(m, x, y, z, s, t) {
  m.rock.position.set(x, y, z);
  m.rock.scale.setScalar(4.4);   // (about 6 m across: the catapult stone's mesh is 1.3 m)
  m.rock.rotation.set(m.spin.x * t, m.spin.y * t, m.spin.z * t);
  m.mat.uniforms.uR.value = 0.3 + 0.7 * s;      // (the shadow spreads and darkens as the rock nears)
  m.mat.uniforms.uA.value = 0.12 + 0.5 * s * s;
}

function hideMeteorLook(m) {
  m.on = false;
  m.rock.visible = false;
  m.geo.setDrawRange(0, 0);
}

// ------------------------------------------------------------------------------------------------------------------ the bots
// (see 4. at the top). b: the bot's brain (HeroBot or LordKit), p: the hero, def: the class's `u`.
const isHero = (o) => o.isPlayer || !!o.kit;

export const ULT_AI = {
  // a Meteor on the densest knot of foes 8 m and more away (rival heroes and engines count for more), at least six, or a hero and three
  meteor(b, p) {
    const foes = b.foes, step = Math.max(1, Math.ceil(foes.length / 40)), r = M.radius * 0.8;
    let best = null, bs = 0;
    for (let i = 0; i < foes.length; i += step) {
      const o = foes[i], d = b.dist[i];
      if (d < 8 || d > M.range - 10) continue;
      let s = 0;
      for (const f of foes) if (Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < r) s += isHero(f) ? 3 : f.isSiege ? 2 : 1;
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < 6) return null;
    const v = best.vel, x = best.pos.x + (v ? v.x * M.fall * 0.6 : 0), z = best.pos.z + (v ? v.z * M.fall * 0.6 : 0);
    return { at: new THREE.Vector3(x, p.game.physics.groundHeight(x, z, best.pos.y + 3), z) };
  },

  // Sanctuary when lives are at stake: allies inside the circle low on health (a hero counts three), or the Cleric herself hard
  // pressed with foes on her, and a fight going on round her; or her heroes in a thick fight beside her. (It waited for near-deaths
  // before: in 5-minute bot battles she let it go less than once while her bar stood full for minutes.)
  sanctuary(b, p) {
    if (b.n.c12 < 2) return null;
    let need = b.hpf < 0.5 && b.n.c8 >= 1 ? 4 : 0, heroes = 0;
    for (const f of b.friends) {
      if (f === p || !f.alive || Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) > SANCT.radius - 1.5) continue;
      if (isHero(f)) heroes++;
      if (f.hp < f.maxHp * 0.55) need += isHero(f) ? 3 : 1;
    }
    if (heroes >= 2 && b.n.c8 >= 4) need += 2;
    return need >= 4 ? {} : null;
  },

  // Rain of Fire on the densest knot of foes 10 m and more away (rival heroes count three, engines two; a little lead on where they are
  // walking, as the arrows take a while): six at least (a rival hero and three more will do)
  rainfire(b, p) {
    const R = RAIN, foes = b.foes, step = Math.max(1, Math.ceil(foes.length / 40)), r = R.radius * 0.8;
    let best = null, bs = 0;
    for (let i = 0; i < foes.length; i += step) {
      const o = foes[i], d = b.dist[i];
      if (d < 10 || d > R.range - 6) continue;
      let s = 0;
      for (const f of foes) if (Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < r) s += isHero(f) ? 3 : f.isSiege ? 2 : 1;
      if (s > bs) { bs = s; best = o; }
    }
    if (!best || bs < 6) return null;
    const v = best.vel, lead = (R.delay + R.span * 0.3) * 0.5, x = best.pos.x + (v ? v.x * lead : 0), z = best.pos.z + (v ? v.z * lead : 0);
    return { at: new THREE.Vector3(x, p.game.physics.groundHeight(x, z, best.pos.y + 3), z) };
  },
};

// ------------------------------------------------------------------------------------------------------------------ sounds
// The Ultimate is ready: a rising bright chord.
SOUNDS.ultready = (a, k) => {
  a.tone(660, 0.5, 0.12 * k, 'triangle', 1, 0);
  a.tone(880, 0.5, 0.11 * k, 'triangle', 1, 0.08);
  a.tone(1320, 0.7, 0.1 * k, 'sine', 1, 0.16);
  a.noise(0.4, 6000, 1, 0.05 * k, 'highpass', 0.16);
};
// Meteor: a roar that falls in pitch as it comes down, then the impact, deep and long
SOUNDS.meteorfall = (a, k) => {
  a.noise(1.3, 900, 0.6, 0.32 * k, 'bandpass');
  a.tone(520, 1.25, 0.08 * k, 'sawtooth', 0.25);
  a.noise(0.9, 2400, 0.8, 0.12 * k, 'bandpass', 0.35);
};
SOUNDS.meteor = (a, k) => {
  a.tone(42, 1.6, 0.9 * k, 'sine', 0.5);
  a.tone(75, 0.9, 0.5 * k, 'triangle', 0.4, 0.01);
  a.noise(1.8, 260, 0.6, 1.0 * k, 'lowpass');
  a.noise(0.5, 1800, 0.9, 0.4 * k, 'bandpass', 0.02);
  a.noise(0.25, 5000, 1, 0.2 * k, 'highpass', 0.04);
};
// Rain of Fire: a deep twang of many strings and the rush of a flight going up, with fire in it
SOUNDS.rainfire = (a, k) => {
  a.tone(120, 0.4, 0.3 * k, 'triangle', 0.5);
  a.noise(0.9, 1400, 0.6, 0.3 * k, 'bandpass');
  a.noise(1.2, 420, 0.5, 0.18 * k, 'lowpass', 0.15);
  a.noise(0.4, 4200, 1, 0.1 * k, 'highpass', 0.05);
};
SOUNDS.burning = (a, k) => {   // the ground on fire: a low rush and a crackle
  a.noise(1.2, 420, 0.5, 0.16 * k, 'lowpass');
  a.noise(0.08, 3800, 2, 0.08 * k, 'highpass', 0.2);
  a.noise(0.06, 3200, 2, 0.07 * k, 'highpass', 0.65);
};
// Sanctuary: a soft hum of two voices that lasts as the light does, and a falling chime when it ends
SOUNDS.sanctuary = (a, k) => {
  a.tone(220, SANCT.time, 0.13 * k, 'sine', 1);
  a.tone(330, SANCT.time, 0.08 * k, 'sine', 1, 0.05);
  a.tone(440, SANCT.time * 0.8, 0.05 * k, 'triangle', 1, 0.1);
  a.tone(1320, 1.2, 0.08 * k, 'sine', 1);
  a.noise(0.8, 5200, 1, 0.06 * k, 'highpass');
};
SOUNDS.sanctend = (a, k) => {
  a.tone(1175, 0.9, 0.1 * k, 'sine', 0.75);
  a.tone(880, 1.1, 0.08 * k, 'triangle', 0.75, 0.08);
  a.noise(0.5, 6000, 1, 0.04 * k, 'highpass');
};
