// =====================================================================================================================================
// THE BERSERKER: a fighter built on momentum. Everything that is his alone lives here; classes.js holds his card (CLASSES.berserker)
// and his Leap (R), which is unchanged.
//
//   Rage        0..100 (RAGE). Every blow he lands fills it, and so does every blow he takes; once he has not fought for RAGE.hold s it
//               ebbs away. Where the battle is run it is decided (rageTick, rageHit); a guest's own bar comes in its snapshot (me.rg).
//   Whirlwind   held on the right mouse button (his guard is the axe's haft: with Rage to spend, the button spins instead of blocking;
//               with too little it still raises the guard). He spins as long as it is held and Rage lasts (RAGE.spin.start to begin),
//               walking a little slower, and every RAGE.spin.every s the axe cuts everyone round him (spinTick). The
//               spin shows as the buff 'whirl' (the first-person arms, the pace, the bots) and, to the others, as the whole body
//               turning (bodiesStep). A bot or a lord holds it through p.spinHeld; a guest's wish goes to the host in its pose (ww).
//   Execute (Q) a heavy overhead chop at whoever is in front (EXEC): a foe it leaves below EXEC.below of his health (heroes too: that is
//               the payoff) dies outright, and a kill gives the cooldown back at once, so it chains through a wounded crowd. On a
//               practice dummy, which never loses health, "below a quarter" means it has taken three quarters of a knight's health in
//               the last few seconds (dummyLow).
//   Unstoppable (Z, the Ultimate) for UNSTOP.time s he is twice his size (everyone sees it; his eyes rise a little, his body is wider and
//               taller to hit and to collide with, still under a gate's arch), cannot be slowed, staggered or thrown back, and every
//               blow he lands sends the soldiers it strikes flying in an arc (fling; heroes, riders, giants and engines stand).
// The looks (ULT_SHOW, every screen) and the bots' rule for the Ultimate (ULT_AI) are added to the Ultimate framework's tables below;
// the methods are mixed into Abilities (classes.js), as the Ultimates' are.
// =====================================================================================================================================
import * as THREE from 'three';
import { UNIT_TYPES, WORLD, PRACTICE } from './config.js';
import { allied } from './teams.js';
import { talentFx } from './talents.js';
import { SOUNDS } from './audio.js';
import { ULT_SHOW, ULT_AI } from './ultimate.js';

// Rage. hit: a blow of his on a soldier (hero: on a hero), ability: each foe a Leap slam or an Execute hits, ranged: an arrow of his;
// taken: what a blow that takes his whole health would give (less in proportion). It holds `hold` s after the last blow either way,
// then ebbs `ebb` a second. The Whirlwind needs `start` to begin and drains `drain` a second; it cuts every `every` s for `dmg` of his
// melee damage within `radius` m (soldiers staggered `stagger` s, a hero only by the first cut), and each foe a cut reaches gives back
// `gain` Rage (at most `cap` a cut: a crowd keeps him spinning longer, never for ever). He walks at 70% of his pace while spinning
// (Player.speedMult; the Dervish talent takes that away).
export const RAGE = {
  max: 100, hit: 9, hero: 13, ability: 5, ranged: 2, taken: 55, hold: 3, ebb: 12,
  spin: { start: 20, drain: 22, every: 0.3, dmg: 0.5, radius: 4.2, stagger: 0.35, gain: 1, cap: 2 },
};
// Execute: the chop lands `delay` s after the key (the axe goes up first) on the foes within `reach` m in front (the cone's cosine:
// `cone`), at most `targets` of them: the first for `dmg` of his melee damage, the others half. A foe left below `below` of his health
// dies; a kill gives the cooldown back but for `reset` s (the axe must come up again).
export const EXEC = { cd: 8, delay: 0.26, reach: 3.4, cone: 0.55, targets: 3, dmg: 1.7, below: 0.25, reset: 0.35, stagger: 0.5 };
// Unstoppable: `time` s at `scale` times his size, grown in `grow` s. His body for blows and walls: `radius` m wider and `tall` times
// taller (3 m: a gate's arch is 6 m); his eyes `eye` times higher; his reach `reach` times longer. Soldiers struck are flung `out` m/s
// away and `up` m/s up. The roar as it begins hurts (`roar` of his melee damage) and flings the soldiers within `roarR` m.
export const UNSTOP = { time: 8, scale: 2, grow: 0.35, radius: 0.25, tall: 1.65, eye: 1.3, reach: 1.45, out: 8, up: 8.5, roar: 1, roarR: 4.5, heroStagger: 0.6 };

const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const DUMMY_HP = UNIT_TYPES.knight.hp;   // (what "a quarter of his health" means for a practice dummy: a knight's)
const isBz = (o) => !!o && o.classId === 'berserker';

// ------------------------------------------------------------------------------------------------------------------ Rage
// Every frame, for every Berserker: a hero (Player.tickAbilities: the local one, and on the host every other) and a lord (LordKit.update).
// Where the battle is run it keeps the Whirlwind going and lets Rage ebb; a guest's own screen only shows its spin at once.
export function rageTick(p, dt) {
  if (!isBz(p)) { if (p.rage) p.rage = 0; if (p.bigK) p.bigK = 0; return; }
  const g = p.game;
  if (p.rage === undefined) { p.rage = 0; p.rageAt = -99; p.spinT = 0; }
  grow(p, dt);
  if (!p.alive) { p.rage = 0; return; }
  const kit = !p.isPlayer;
  // his size: wider and taller for blows and walls (the hero's height and eyes follow bigK in Player.setDuck)
  if (kit) {
    if (p.baseR === undefined) { p.baseR = p.radius; p.baseH = p.height; }
    p.radius = p.baseR + UNSTOP.radius * p.bigK;
    p.height = p.baseH * (1 + (UNSTOP.tall - 1) * p.bigK);
    if (p.bigK > 0 && p.slowT > 0) p.slowT = 0;   // (a Frost Ward's chill does not take on him)
  } else if (!p.mounted) p.radius = 0.4 + UNSTOP.radius * p.bigK;
  const held = p.isPlayer && p.remote && !p.isBot ? !!(p.netPose && p.netPose.ww) : !!p.spinHeld;
  const spinning = p.buffs.has('whirl');
  const steady = p.buffs.has('steady');
  const free = !p.drive && !p.climb && !p.leap && !p.dash && !p.mounted && (steady || !(p.staggerT > 0)) && (!p.isPlayer || p.weapon === 'sword');
  const S = RAGE.spin;
  if (g.simulating) {
    if (held && free && p.rage > (spinning ? 0 : S.start - 1e-6) && !(p.spinBlock > g.time)) {
      if (!spinning) { p.spinT = 0.05; p.spinN = 0; }   // (the first cut comes almost at once)
      p.buffs.add('whirl', 0.25);
      p.rage = Math.max(0, p.rage - S.drain * talentFx(p, 'spinCost', 1) * dt);
      if ((p.spinT -= dt) <= 0) { p.spinT += S.every; g.abilities.spinTick(p); }
    } else if (spinning) p.buffs.del('whirl');
    if (!p.buffs.has('whirl') && g.time - p.rageAt > RAGE.hold && !p.buffs.has('unstop')) p.rage = Math.max(0, p.rage - RAGE.ebb * talentFx(p, 'rageEbb', 1) * dt);
    if (spinning || p.bigK > 0) noteBody(g, p);
  } else if (p.isLocal) {   // a guest: its spin shows (and slows it) at once; the host's word comes in the snapshot
    if (held && free && p.rage > (spinning ? 0.5 : S.start - 1e-6)) p.buffs.add('whirl', 0.25);
    else if (!held) p.buffs.del('whirl');
  }
}

// Rage from a blow that took `lost` health (Game.damage, where the battle is run), and the blows of an Unstoppable Berserker.
export function rageHit(g, attacker, target, lost, info) {
  if (isBz(attacker) && attacker !== target && attacker.alive && attacker.rage !== undefined && info.ability !== 'Whirlwind' && (lost > 0 || target.isDummy)) {   // (a practice dummy loses nothing)
    const hero = target.isPlayer || !!target.kit;
    const n = info.ability ? RAGE.ability : info.ranged ? RAGE.ranged : hero ? RAGE.hero : RAGE.hit;
    gainRage(attacker, n);
    if (attacker.bigK > 0.5 && attacker.buffs.has('unstop') && !info.ranged) fling(target, attacker);
  }
  if (isBz(target) && target.rage !== undefined && target.alive && lost > 0) gainRage(target, (lost / target.maxHp) * RAGE.taken);
}

function gainRage(p, n) {
  p.rage = Math.min(RAGE.max, p.rage + n * talentFx(p, 'rageGain', 1));
  p.rageAt = p.game.time;
}

// ------------------------------------------------------------------------------------------------------------------ flung soldiers
// A soldier an Unstoppable Berserker strikes flies off in an arc, alive or dead (the host moves him: the guests see it in his height
// and place). Not a hero, a rider, a giant, an engine's crew, a man at his post or a practice dummy: those stand.
export function fling(o, from) {
  if (!o || o.isPlayer || o.kit || o.isHero || o.mounted || o.isGiant || o.isSiege || o.crewOf || o.post || o.isDummy || o.isStructure || o.isTowerArcher || !o.vel || o.fling) return;
  const dx = o.pos.x - from.pos.x, dz = o.pos.z - from.pos.z, d = Math.hypot(dx, dz) || 1;
  const k = 0.85 + Math.random() * 0.3;
  o.vel.x = (dx / d) * UNSTOP.out * k; o.vel.z = (dz / d) * UNSTOP.out * k;
  o.fling = { vy: UNSTOP.up * k, t: 0, spin: (Math.random() - 0.5) * 6 };
  if (o.alive) { o.staggerT = Math.max(o.staggerT, 1.2); o.staggerMax = o.staggerT; o.swingT = -1; o.attackTimer = Math.max(o.attackTimer, 1.4); }
}

// His flight (Unit.update, before anything else: true while it carries him). Walls stop him as they stop a walking man.
export function flingTick(u, dt) {
  const F = u.fling, g = u.game, P = g.physics;
  F.t += dt;
  u.pos.x += u.vel.x * dt; u.pos.z += u.vel.z * dt;
  const L = WORLD.playHalf;
  u.pos.x = Math.max(-L, Math.min(L, u.pos.x)); u.pos.z = Math.max(-L, Math.min(L, u.pos.z));
  P.resolve(u.pos, u.radius, u.pos.y, u.height, u.team);
  u.pos.y += F.vy * dt - 0.5 * WORLD.gravity * dt * dt;
  F.vy -= WORLD.gravity * dt;
  const ground = P.groundHeight(u.pos.x, u.pos.z, u.pos.y + 0.5);
  const down = F.vy < 0 && u.pos.y <= ground;
  if (down || F.t > 3) {
    u.pos.y = ground;
    u.vel.multiplyScalar(0.2);
    u.fling = null;
    g.fx.dust(V1.set(u.pos.x, ground + 0.2, u.pos.z), 6, 0.9);
    if (u.alive) u.staggerT = Math.max(u.staggerT, 0.5);
  }
  if (!u.alive) {   // (a body: it falls as it flies, and lies where it lands)
    u.animateDeath(dt);
    u.mesh.position.copy(u.pos);
    return true;
  }
  u.staggerT = Math.max(u.staggerT, 0.1);
  u.animate(dt, false);
  u.mesh.position.copy(u.pos);
  u.mesh.rotation.y = u.yaw;
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the methods
// (mixed into Abilities.prototype by classes.js; `this` is Abilities. Only where the battle is run.)
export const BERSERKER_METHODS = {
  // One cut of the Whirlwind (rageTick, while he spins): everyone round him, the crowd paying a little Rage back.
  spinTick(p) {
    const g = this.g, S = RAGE.spin;
    const reach = talentFx(p, 'whirlRadius', 1), dmg = p.meleeDmg * S.dmg, first = !(p.spinN > 0);
    let foes = 0;
    this.eachFoe(p.team, p.pos.x, p.pos.z, S.radius * reach * (1 + 0.5 * (p.bigK || 0)), (o) => {
      g.damage(o, dmg, p, { melee: true, splash: true, charge: 0.5, ability: 'Whirlwind' });
      if (o.alive && o.stagger && (first || !(o.isPlayer || o.kit))) o.stagger(S.stagger, p);
      if (!o.isSiege) foes++;
    }, p.pos.y, 2.8 + (p.bigK || 0));
    p.spinN = (p.spinN || 0) + 1;
    if (foes) gainRage(p, Math.min(S.cap, foes * S.gain));
    const reaper = talentFx(p, 'reaper', null);   // Reaper (Berserker talent): the blade drinks
    if (reaper && foes) p.heal(p.maxHp * reaper.heal * Math.min(foes, reaper.foes));
    p.swingT = 0.2; p.attackDir = p.spinN % 2 ? 'left' : 'right';
    this.emit('whirl', p.pos, ZERO, null, reach * (1 + 0.5 * (p.bigK || 0)));
  },

  // Execute (Q): the axe goes up now and comes down EXEC.delay s later (execTick).
  execute(p, cam, dir) {
    const f = new THREE.Vector3(dir.x, 0, dir.z);
    if (f.lengthSq() < 1e-6) f.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    f.normalize();
    if (p.buffs.has('whirl')) p.buffs.del('whirl');   // (the chop ends a spin: it starts again, if still held, once the axe is down)
    p.spinBlock = this.g.time + EXEC.delay + 0.25;
    p.swingT = 0; p.attackDir = 'over';   // (the others see the axe raised and brought down: models.js)
    this.active.push({ kind: 'ult', p, t: 0, f, tick: execTick });   // (a blow that lands later: Abilities.update steps it as it does an Ultimate's)
  },

  // Unstoppable (Z): twice his size, unshakable, every blow flinging soldiers; a roar to begin it that throws back the nearest.
  unstoppable(p) {
    const g = this.g, T = UNSTOP.time;
    p.buffs.add('unstop', T);
    p.buffs.add('steady', T);
    p.staggerT = 0;
    if (p.slowT > 0) p.slowT = 0;
    const dmg = p.meleeDmg * UNSTOP.roar;
    this.eachFoe(p.team, p.pos.x, p.pos.z, UNSTOP.roarR, (o) => {
      if (o.isSiege) return;
      g.damage(o, dmg, p, { melee: true, splash: true, ability: 'Unstoppable' });
      if (o.isPlayer || o.kit) { if (o.alive && o.stagger) o.stagger(UNSTOP.heroStagger, p); } else fling(o, p);
    }, p.pos.y, 3);
    p.swingT = 0.3; p.attackDir = 'over';
    noteBody(g, p);
    this.emit('unstop', p.pos, new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)));
  },
};

// The chop comes down: the foes in front, the first full and the rest half; the low ones die, and a kill gives Q back.
function execTick(A, e) {
  const p = e.p, g = A.g;
  if (e.t < EXEC.delay) return true;
  if (!p.alive) return false;
  const f = p.isPlayer ? e.f.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)) : e.f;   // (a hero: where he faces now, he may have turned while the axe went up)
  const big = 1 + (UNSTOP.reach - 1) * (p.bigK || 0), reach = EXEC.reach * big;
  const hits = [];
  A.eachFoe(p.team, p.pos.x + f.x * reach * 0.45, p.pos.z + f.z * reach * 0.45, reach * 0.75, (o, d) => {
    const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    if (l - (o.radius || 0.4) > reach || (dx * f.x + dz * f.z) / l < EXEC.cone || o.isSiege) return;
    hits.push({ o, l });
  }, p.pos.y, 2.8 + (p.bigK || 0));
  hits.sort((a, b) => a.l - b.l);
  const below = EXEC.below + talentFx(p, 'execBelow', 0), dmg = p.meleeDmg * EXEC.dmg;
  let kills = 0;
  const struck = [];
  for (let i = 0; i < hits.length && i < EXEC.targets; i++) {
    const o = hits[i].o;
    g.damage(o, i ? dmg * 0.5 : dmg, p, { melee: true, splash: true, charge: 1, ability: 'Execute' });
    struck.push(o.chest ? o.chest(new THREE.Vector3()) : o.pos.clone());
    if (o.isDummy ? dummyLow(o) : o.alive && o.hp < o.maxHp * below) {
      if (o.isDummy) { o.log.length = 0; kills++; continue; }   // (a dummy "falls": its count starts again, as for a fresh man)
      finish(g, o, p);
      if (!o.alive) kills++;
    } else if (o.alive && o.stagger) o.stagger(EXEC.stagger, p);
  }
  A.emit('execute', p.pos.clone().addScaledVector(f, Math.min(reach, 2.2)), f, struck.length ? struck : null, big);
  if (kills) {
    p.abilCd.q = Math.min(p.abilCd.q, EXEC.reset);
    if (p.isPlayer) g.deliver(p, { k: 'cd', s: 'q', t: EXEC.reset });   // (a guest's cooldown is its own: the host tells it)
    if (p.isPlayer) g.deliver(p, { k: 'fb', text: kills > 1 ? `Executed ×${kills}!` : 'Executed!', good: true });
    const tithe = talentFx(p, 'tithe', 0);   // Blood Tithe (alternative to Reaper)
    if (tithe) p.heal(p.maxHp * tithe * kills);
    A.emit('execkill', p.pos.clone().addScaledVector(f, Math.min(reach, 2.2)), f, null, Math.min(3, kills));
  }
  return false;
}

// The killing stroke: what is left of his health, through his armour, a Bulwark and the like (a Frost Ward soaks it as it would any
// blow, and inside a Sanctuary he is held on 1: those still save a man).
function finish(g, o, p) {
  const guard = o.isPlayer || o.kit ? (o.buffs && o.buffs.get('guard')) || 1 : o.guardT > 0 ? o.guardMul || 1 : 1;
  const n = (o.hp + (o.armor || 0) + 1) / Math.max(0.05, guard);
  g.damage(o, n, p, { splash: true, execute: true, ability: 'Execute' });
}

// A practice dummy never loses health: it counts as below a quarter once it has taken three quarters of a knight's in the last
// few seconds (its readout's window).
function dummyLow(d) {
  const now = d.game.time;
  let s = 0;
  for (const h of d.log) if (now - h.t <= PRACTICE.window) s += h.d;
  return s >= DUMMY_HP * (1 - EXEC.below);
}

// ------------------------------------------------------------------------------------------------------------------ the bodies
// The others see a spinning Berserker turn round and round, and an Unstoppable one twice the size: his body (a hero's on the others'
// screens, a lord's on every screen) is turned and scaled after it has been posed and placed for the frame (Abilities.updateFx steps
// this, every screen). A guest learns it from the snapshot (heroFlags, lordFlags).
function grow(p, dt) {
  const g = p.game;
  if (p.growAt === g.time) return;
  p.growAt = g.time;
  const want = p.alive !== false && ((p.buffs && p.buffs.has && p.buffs.has('unstop')) || p.netBig) ? 1 : 0;
  const k = p.bigK || 0;
  if (k !== want) p.bigK = want > k ? Math.min(1, k + dt / UNSTOP.grow) : Math.max(0, k - dt / UNSTOP.grow);
}

function noteBody(g, o) {
  const A = g.abilities;
  if (!A || !A.ultFx) return;
  if (!A.bzBodies) { A.bzBodies = new Set(); A.ultFx.push({ step: bodiesStep }); }
  else if (!A.ultFx.some((e) => e.step === bodiesStep)) A.ultFx.push({ step: bodiesStep });   // (the list is new with every world)
  A.bzBodies.add(o);
}

function bodiesStep(A, e, dt) {
  for (const o of A.bzBodies) {
    grow(o, dt);
    const root = o.isPlayer ? o.body && o.body.root : o.mesh;
    const spin = o.alive !== false && (o.netSpin || (o.buffs && o.buffs.has && o.buffs.has('whirl')));
    if (spin) o.spinA = ((o.spinA || 0) + dt * 15) % (Math.PI * 2);
    else if (o.spinA > 0) { o.spinA += dt * 15; if (o.spinA >= Math.PI * 2) o.spinA = 0; }   // (the turn runs on to face ahead again)
    const k = o.bigK || 0, s = 1 + (UNSTOP.scale - 1) * k;
    if (root) {
      if (o.spinA) root.rotation.y += o.spinA;
      if (root.scale.x !== s) root.scale.setScalar(s);
    }
    if (o.isPlayer && o.tag && k > 0) o.tag.position.y += 2.1 * k;
    if (!spin && !(o.spinA > 0) && k === 0 && (o.alive === false || !isBz(o))) A.bzBodies.delete(o);
  }
  return true;
}

// a guest: another hero's spin and size, from his snapshot entry (movementFlags 4 and 8)
export function heroFlags(g, h, flags) {
  h.netSpin = !!(flags & 4); h.netBig = !!(flags & 8);
  if (h.netSpin || h.netBig || h.bigK > 0 || h.spinA > 0) noteBody(g, h);
}
export const heroBits = (h) => (h.buffs.has('whirl') ? 4 : 0) | (h.buffs.has('unstop') ? 8 : 0);
// a lord's, in his kit's number (lordkit.js net: 32 and 64)
export const lordBits = (u) => (u.buffs && u.buffs.has('whirl') ? 32 : 0) | (u.buffs && u.buffs.has('unstop') ? 64 : 0);
export function lordFlags(u, v) {
  u.netSpin = !!(v & 32); u.netBig = !!(v & 64);
  if (u.netSpin || u.netBig || u.bigK > 0 || u.spinA > 0) noteBody(u.game, u);
}

// ------------------------------------------------------------------------------------------------------------------ the bots
// (herobot.js and lordkit.js: `brain` has foes, dist, n { c3, c5, ... }, need, hpf)
// Hold the Whirlwind? Into a knot of foes or at a rival hero with Rage to spend; held while foes are near and Rage lasts.
export function botSpin(brain, p) {
  if (!isBz(p) || !p.alive) return false;
  const n = brain.n, need = brain.need || 0;
  if (p.buffs.has('whirl')) return p.rage > 0 && n.c5 >= 1;
  const heroNear = (brain.heroGap !== undefined ? brain.heroGap : n.heroNear) < 3.2;
  return p.rage >= 30 + need * 15 && (n.c3 >= 2 + need || (heroNear && p.rage >= 45));
}

// Whom to Execute: a foe within the chop's reach who is low enough to die of it (a rival hero first, then the lowest); else a rival
// hero at hand for the heavy blow itself. Null: not now.
export function execTarget(brain, p) {
  const below = EXEC.below + talentFx(p, 'execBelow', 0), reach = EXEC.reach * (1 + (UNSTOP.reach - 1) * (p.bigK || 0)) - 0.4;
  let best = null, bs = -1, hero = null;
  for (let i = 0; i < brain.foes.length; i++) {
    const o = brain.foes[i], d = brain.dist[i];
    if (o.isSiege || o.isStructure || d > reach || Math.abs(o.pos.y - p.pos.y) > 2.2) continue;
    const h = o.isPlayer || !!o.kit;
    const low = o.isDummy ? dummyLow(o) : o.hp < o.maxHp * below + p.meleeDmg * EXEC.dmg * 0.4;   // (low already, or the chop will make him so)
    if (low) { const s = (h ? 2 : 0) + 1 - o.hp / o.maxHp; if (s > bs) { bs = s; best = o; } }
    else if (h && d < 2.4 && !hero) hero = o;
  }
  return best || hero;
}

// The Ultimate: into a knot of foes, or a rival hero close while he still has health to make use of it.
ULT_AI.unstoppable = (brain, p) => {
  const n = brain.n, need = brain.need || 0;
  if (n.c5 >= 4 + need || n.c8 >= 6 + need || (n.heroes8 >= 1 && brain.hpf > 0.35 && n.c8 >= 2)) return {};
  return null;
};

// ------------------------------------------------------------------------------------------------------------------ the looks
// (every screen: ULT_SHOW is what Abilities.show plays for an id it has no case of)
ULT_SHOW.execute = (ctx) => {
  const { A, g, at, dir, house, sz, targets } = ctx, gf = A.gfx, fx = g.fx;
  gf.glyph('slash', at.x, at.y, at.z, 2.4 * sz, 0xff7040, 0.45, { dir: Math.atan2(dir.z, dir.x), team: house, strength: 2 });
  gf.glyph('shock', at.x, at.y, at.z, 1.8 * sz, 0xffc090, 0.35, { team: house, strength: 1.4 });
  fx._dust(V1.copy(at).setY(at.y + 0.15), 10, 1.2, '');
  fx._sparks(V1.copy(at).setY(at.y + 0.6), 12);
  for (const t of targets || []) fx._sparks(t, 8);
  ctx.snd('chop');
};

ULT_SHOW.execkill = (ctx) => {
  const { A, g, at, dir, sz } = ctx, fx = g.fx;
  const c = V1.copy(at).setY(at.y + 1.1);
  fx._blood(c, 14 + 6 * sz, dir.x, dir.z);
  fx.flash(c, A.col.set(0xff3020), 1.8 + 0.4 * sz, 0.2, 0.45);
  fx.ring(at, 0.6, A.col.set(0xff4a30), 14, { up: 1.4, size: 0.24, speed: 3 });
  A.gfx.glyph('pulse', at.x, at.y, at.z, 1.5, 0xb01a10, 0.5, { strength: 1.1 });
  if (g.camfx) g.camfx.boom(at, 0.35);
  ctx.snd('execute');
};

ULT_SHOW.unstop = (ctx) => {
  const { A, g, at, house, who } = ctx, gf = A.gfx, fx = g.fx, R = UNSTOP.roarR;
  gf.glyph('shock', at.x, at.y, at.z, R * 1.5, 0xff6a3a, 0.8, { team: house, strength: 2.2 });
  gf.glyph('pulse', at.x, at.y, at.z, R, 0xff2a10, 0.9, { strength: 2 });
  gf.glyph('rune', at.x, at.y, at.z, R * 0.7, 0xff4a20, 1.4, { arms: 5, team: house, strength: 1.6 });
  const own = who && who === g.player;   // (seen from inside, a column of light round the camera would hide everything)
  if (!own) gf.pillar(at.x, at.y, at.z, 0xff5a30, 0.6, 1.3, 6, 1.1);
  fx._dust(V1.copy(at).setY(at.y + 0.2), 30, R * 0.7, '');
  fx.ring(at, R * 0.4, A.col.set(0xff7a40), 34, { up: 1.2, size: 0.45, speed: 10 });
  fx.flash(V1.copy(at).setY(at.y + (own ? 0.4 : 2)), A.col.set(0xff4020), own ? 3 : 5, 0.3, own ? 0.35 : 0.6);
  fx.crater(at, 2.4);
  if (g.camfx) g.camfx.boom(at, 0.85);
  ctx.snd('roar');
  // a heat that hangs on him while it lasts: embers rising off his body and a red glow about him
  if (who) A.ultFx.push({ who, t: 0, acc: 0, step: unstopLookStep });
};

function unstopLookStep(A, e, dt) {
  const w = e.who, fx = A.g.fx;
  e.t += dt;
  if (e.t > UNSTOP.time + 0.2 || !w || w.alive === false || !((w.buffs && w.buffs.has && w.buffs.has('unstop')) || w.netBig) && e.t > 0.5) return false;
  const k = w.bigK || 0;
  e.acc += dt;
  while (e.acc > 0.07) {
    e.acc -= 0.07;
    const a = Math.random() * Math.PI * 2, r = (0.4 + Math.random() * 0.5) * (1 + k);
    fx.fireTrail(V2.set(w.pos.x + Math.cos(a) * r, w.pos.y + (0.4 + Math.random() * 1.6) * (1 + k), w.pos.z + Math.sin(a) * r));
  }
  if (Math.random() < dt * 5) fx.flash(V2.set(w.pos.x, w.pos.y + 1.6 * (1 + k), w.pos.z), A.col.set(0xff4a20), 3 + 2 * k, 0.25, 0.5);
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the sounds
// Execute: a short heavy whoosh and a wet, deep chop; a kill rings over it. Unstoppable: a growl that swells into a roar.
SOUNDS.chop = (a, k) => {
  a.noise(0.18, 700, 0.9, 0.3 * k, 'bandpass');
  a.tone(70, 0.3, 0.42 * k, 'sine', 0.5, 0.02);
  a.noise(0.1, 2200, 1.5, 0.22 * k, 'highpass', 0.03);
};
SOUNDS.execute = (a, k) => {
  a.tone(48, 0.55, 0.5 * k, 'sine', 0.45);
  a.noise(0.3, 400, 0.7, 0.36 * k, 'lowpass');
  a.tone(880, 0.4, 0.07 * k, 'triangle', 0.7, 0.05);
};
SOUNDS.roar = (a, k) => {
  a.tone(85, 0.9, 0.34 * k, 'sawtooth', 0.65);
  a.tone(128, 0.8, 0.2 * k, 'sawtooth', 0.6, 0.06);
  a.noise(0.9, 480, 0.5, 0.32 * k, 'bandpass');
  a.tone(45, 0.6, 0.4 * k, 'sine', 0.5, 0.05);
};

// ------------------------------------------------------------------------------------------------------------------ the HUD
// The Rage bar under the stamina bar (only for a Berserker), and a word under the crosshair when the foe in front would die to an
// Execute that is ready. Written only when they change (ui.js calls this every frame).
export function rageHud(p, dt) {
  if (typeof document === 'undefined') return;
  let H = rageHud.el;
  if (!H) {
    const st = document.getElementById('stbar');
    if (!st || !st.parentNode) return;
    const bar = document.createElement('div');
    bar.className = 'bar'; bar.id = 'ragebar';
    bar.style.cssText = 'height:12px;display:none';
    bar.title = 'Rage: every blow you land or take fills it, and it ebbs once you stop fighting. Hold the right mouse button to spend it on a Whirlwind.';
    bar.innerHTML = '<div class="fill" style="background:linear-gradient(#ff7a3a,#a8261a);width:0%;transition:none"></div><div style="position:absolute;inset:0;font:600 10px/12px Georgia,serif;color:#ffe2c8;text-align:center;text-shadow:0 1px 2px #000;letter-spacing:0.5px">RAGE</div>';
    st.parentNode.insertBefore(bar, st.nextSibling);
    const cue = document.createElement('div');
    cue.style.cssText = 'position:fixed;left:50%;top:calc(50% + 26px);transform:translateX(-50%);font:700 13px Georgia,serif;letter-spacing:2px;color:#ff5a3a;text-shadow:0 0 6px #000,0 1px 2px #000;pointer-events:none;display:none;z-index:6';
    cue.textContent = 'EXECUTE';
    document.body.appendChild(cue);
    H = rageHud.el = { bar, fill: bar.firstChild, on: null, w: -1, full: null, cue, cueOn: false, t: 0 };
  }
  const on = isBz(p) && p.alive;
  if (on !== H.on) { H.on = on; H.bar.style.display = on ? '' : 'none'; }
  if (!on) { if (H.cueOn) { H.cueOn = false; H.cue.style.display = 'none'; } return; }
  const w = Math.round(p.rage || 0);
  if (w !== H.w) {
    H.w = w; H.fill.style.width = w + '%';
    const full = w >= RAGE.spin.start;
    if (full !== H.full) { H.full = full; H.fill.style.filter = full ? '' : 'saturate(0.35) brightness(0.8)'; }   // (dull below what a spin needs)
  }
  // the cue: looked for ten times a second
  const g = p.game;
  if ((H.t -= dt) > 0) return;
  H.t = 0.1;
  const cue = p.abilCd.q <= 0 && !p.drive && execCue(g, p);
  if (cue !== H.cueOn) { H.cueOn = cue; H.cue.style.display = cue ? '' : 'none'; }
}

// the foe in front within the chop's reach would die of it (his health as this screen knows it)
function execCue(g, p) {
  const below = EXEC.below + talentFx(p, 'execBelow', 0), reach = EXEC.reach * (1 + (UNSTOP.reach - 1) * (p.bigK || 0));
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let hit = false;
  g.grid.query(p.pos.x + fx * reach * 0.5, p.pos.z + fz * reach * 0.5, reach, (o) => {
    if (hit || !o.alive || o === p || allied(o.team, p.team) || o.drive || o.isDummy || Math.abs(o.pos.y - p.pos.y) > 2.5) return;
    const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    if (l - (o.radius || 0.4) > reach || (dx * fx + dz * fz) / l < EXEC.cone) return;
    if (o.hp < o.maxHp * below + p.meleeDmg * EXEC.dmg * 0.7) hit = true;
  });
  return hit;
}
