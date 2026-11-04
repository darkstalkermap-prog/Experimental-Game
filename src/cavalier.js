// The Cavalier: the horse is the star. Everything of his own that is not in the class card (classes.js) is here.
//
//   Momentum (passive)  the faster he rides, the harder his blows, his trampling, Sweeping Strike and Lance Charge land: up to
//                       +CAV.momentum.top (60%) at full gallop. It builds while he gallops, falls when he slows, and a hard turn at
//                       speed bleeds it, so long straight runs and wide curves keep it high: riding well is a skill. A horseshoe gauge
//                       on the HUD shows it (and the speed) while he is in the saddle.
//   Sweeping Strike (Q) for CAV.sweep.time s the blade sweeps out to one side as he rides: every foe he passes within reach on that side
//                       is cut once. The side is where he looks (a glance left or right of where the horse runs); looking straight ahead
//                       it goes to the side with more foes on it, and to the sword side (right) when that is even. On foot it is one
//                       wide cut in front of him.
//   Lance Charge (R)    in classes.js (the long charges), with Momentum on its blows.
//   Call the Charge (Z) the Ultimate: the horn sounds, Rally Cry's cry goes out to every ally near (less damage taken, faster), and
//                       CAV.call.knights armoured lancers of his house ride out behind him in a wedge and charge the spot he points at,
//                       riding down everyone in their way; then they fight where they are until they ride off (CAV.call.life s). They
//                       are no part of the army: they count to no limit and take no orders. On foot the horn calls them all the same.
//
// Where it runs: the methods (sweep, callcharge) are mixed into Abilities (classes.js) and run where the battle is simulated; the looks
// (ULT_SHOW entries: Abilities.show sends anything it does not know there) run on every screen; Momentum is worked out on every screen
// for its own riders (Player.trample calls stepMomentum every frame he is mounted), and where the battle is run for everyone.
import * as THREE from 'three';
import { ULT_SHOW, ULT_AI } from './ultimate.js';
import { talentFx } from './talents.js';
import { SOUNDS } from './audio.js';
import { allied } from './teams.js';
import { Unit } from './units.js';
import { UNIT_TYPES, WORLD } from './config.js';

export const CAV = {
  // Momentum: counts from `from` m/s and is full at a full gallop (`gallop`: HORSE.gallop in player.js); it rises `rise` a second
  // toward what the speed gives and falls `fall` a second; turning faster than `turn` rad/s above a walk (`walk`) bleeds `bleed` a second.
  // `top` (the class mod 'momentum', which talents can raise) is the bonus at full.
  momentum: { top: 0.6, from: 6, gallop: 13.5, walk: 7, rise: 0.55, fall: 1.4, turn: 1.3, bleed: 0.6 },
  // Sweeping Strike: `time` s, every foe `reach` m out to the side (from `back` m behind to `front` m ahead of the rider) cut once for
  // `dmg` of his melee damage (times Momentum); soldiers staggered `stagger` s and thrown out `knock` m/s, heroes staggered `hero` s.
  // On foot: one cut, `foot.reach` m, `foot.arc` rad either side of where he looks, `foot.dmg`.
  sweep: { time: 1.2, reach: 3.6, back: 1.8, front: 2.4, dmg: 1.0, stagger: 0.5, hero: 0.25, knock: 5, swings: 3, foot: { reach: 3.2, arc: 1.75, dmg: 1.1 } },
  // Call the Charge: aimed up to `range` m; `knights` lancers (hp `hp`, a lance blow `dmg` times the Cavalier's sword over an arming sword's)
  // ride at `speed` m/s for at most `ride` s through the spot (their wedge, drawn in, ends `through` m beyond it), each riding down every foe within `reach` m of it once (`hit` of his melee
  // damage, a hero `heroHit` of that; staggered `stagger` s, a hero `heroStagger`, thrown on `knock` m/s), then fight until `life` s.
  // The cry: every ally within `rally.radius` m takes `rally.ally` of the damage and is `rally.haste` faster for `rally.time` s (he takes `rally.self`).
  call: { range: 60, radius: 5, knights: 6, hp: 300, dmg: 1, speed: 15, ride: 6, through: 9, life: 15, reach: 2.3, hit: 1.4, heroHit: 0.6, stagger: 1.1, heroStagger: 0.5, knock: 11,
    rally: { radius: 28, time: 8, ally: 0.7, self: 0.6, haste: 1.25 } },
};
const SW = CAV.sweep, CALL = CAV.call, MOM = CAV.momentum;

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const HIT_AT = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------------------------ Momentum
// Every frame a rider is in the saddle (Player.trample). The first step after a while out of the saddle starts from nothing.
export function stepMomentum(p, dt) {
  const g = p.game;
  if (!(p.momT > g.time - 0.5)) { p.momentum = 0; p.momHead = p.heading; }
  p.momT = g.time;
  if (!p.mods.momentum) return;
  const sp = Math.abs(p.rideSpeed);
  const want = clamp01((sp - MOM.from) / (MOM.gallop - MOM.from));
  const turn = Math.abs(angDiff(p.momHead, p.heading)) / Math.max(dt, 1e-3);
  p.momHead = p.heading;
  let m = p.momentum;
  if (turn > MOM.turn && sp > MOM.walk) m = Math.max(0, Math.min(m, want) - MOM.bleed * dt);   // (a hard turn at speed: the horse checks its stride, and gains none)
  else if (m < want) m = Math.min(want, m + MOM.rise * talentFx(p, 'momRise', 1) * dt);
  else m = Math.max(want, m - MOM.fall * dt);
  p.momentum = m;
}

// What Momentum does to a blow just now (1 out of the saddle, and for anyone who is not a Cavalier)
export function momentumMul(p) {
  return p && p.mounted && p.momentum > 0 && p.mods && p.mods.momentum ? 1 + p.mods.momentum * p.momentum : 1;
}

// ------------------------------------------------------------------------------------------------------------------ the methods
// (mixed into Abilities.prototype by classes.js; `this` is Abilities)
export const CAV_METHODS = {
  // the pooled blades of light the Sweeping Strike draws (made with the world, so their shader is compiled up front)
  cavInit() {
    this.sweepPool = [];
    const g = this.g;
    if (!g.scene) return;
    for (let i = 0; i < 3; i++) this.sweepPool.push(makeSweepLook(g));
  },

  // ---------------------------------------------------------------- Sweeping Strike (Q)
  sweep(p, cam, dir) {
    const g = this.g;
    if (!p.mounted) {   // on foot: one wide cut in front of him
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), F = SW.foot;
      const reach = F.reach + talentFx(p, 'sweepReach', 0), dmg = p.meleeDmg * F.dmg * talentFx(p, 'sweepDmg', 1);
      let n = 0;
      this.eachFoe(p.team, p.pos.x, p.pos.z, reach, (o, d) => {
        const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
        if (d > 0.3 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) > F.arc) return;
        cut(g, p, o, dmg, d > 0.01 ? dx / d : fx, d > 0.01 ? dz / d : fz);
        n++;
      }, p.pos.y, 2.5);
      rhythm(g, p, n);
      p.swingT = 0; p.attackDir = 'right';
      this.emit('sweepfoot', p.pos, V1.set(fx, 0, fz), null, reach / F.reach);
      return true;
    }
    // in the saddle: the side he looks to, else the side with more foes, else the sword side
    const h = p.heading, fx = Math.sin(h), fz = Math.cos(h);
    const look = angDiff(h, p.yaw);   // (more than zero: he looks to the left of where the horse runs)
    let side;
    if (look > 0.2) side = -1;
    else if (look < -0.2) side = 1;
    else {
      let l = 0, r = 0;
      const reach = SW.reach + 1;
      this.eachFoe(p.team, p.pos.x + fx * 3, p.pos.z + fz * 3, reach + 3, (o) => {
        const s = (o.pos.x - p.pos.x) * -fz + (o.pos.z - p.pos.z) * fx;
        if (s > 0.3) r++; else if (s < -0.3) l++;
      }, p.pos.y, 3);
      side = l > r ? -1 : 1;
    }
    const time = SW.time + talentFx(p, 'sweepTime', 0), reach = SW.reach + talentFx(p, 'sweepReach', 0);
    const e = { kind: 'ult', p, t: 0, dur: time, side, reach, hit: new Set(), prev: p.pos.clone(), n: 0, swing: 0, tick: sweepTick };   // (an Ultimate's kind of entry: it runs its own tick)
    this.active.push(e);
    sweepTick(this, e, 0);
    // the side (a flat vector out to it) and the reach, for the look on every screen
    this.emit('sweep', p.pos, V1.set(-fz * side, 0, fx * side), null, reach / SW.reach);
    return true;
  },

  // ---------------------------------------------------------------- Call the Charge (the Ultimate)
  callcharge(p, cam, dir, at, def) {
    const g = this.g;
    const c = at ? at.clone() : this.aimPoint(cam, dir, CALL.range, p.team).pos;
    let dx = c.x - p.pos.x, dz = c.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > CALL.range + 6) { const k = (CALL.range + 6) / dist; c.x = p.pos.x + dx * k; c.z = p.pos.z + dz * k; dx *= k; dz *= k; dist = CALL.range + 6; }
    if (dist < 4) {   // (pointed at his own feet: the charge goes where he faces)
      const y = p.mounted ? p.heading : p.yaw;
      dx = Math.sin(y); dz = Math.cos(y); dist = 1;
      c.x = p.pos.x + dx * 20; c.z = p.pos.z + dz * 20;
    }
    c.y = g.physics.groundHeight(c.x, c.z, c.y + 2);
    const f = new THREE.Vector3(dx / dist, 0, dz / dist);
    rallyCry(this, p, def);
    // the knights: the wedge behind him, each to his own place round the spot (the wedge drawn in to half its width)
    const k = (p.meleeDmg || 34) / 34;
    const T = UNIT_TYPES.lancer, knights = [];
    for (let i = 0; i < CALL.knights; i++) {
      const o = wedgeOffset(i), from = clearSpot(g, p, p.pos, wedgePoint(p.pos, f, o, 1, V2));
      const u = new Unit(g, 'lancer', p.team, from, { hp: CALL.hp, dmg: T.dmg * CALL.dmg * k });
      // (through the spot and on: the leading pair rides on CALL.through m past it)
      const to = wedgePoint(V1.copy(c).addScaledVector(f, CALL.through), f, o, 0.5, new THREE.Vector3());
      u.summon = { e: null, phase: 'charge', t: 0, stall: 0, to, prev: u.pos.clone(), hit: new Set(), ride: rideKnight };
      u.homeCastle = (g.castles && g.castles[p.team]) || null;
      u.noXp = true; u.fixedTier = true;
      u.yaw = Math.atan2(f.x, f.z);
      u.setOrder('charge');
      u.foeNear = 0;
      g.units.push(u);
      knights.push(u);
    }
    const e = { kind: 'ult', p, team: p.team, t: 0, c, f, knights, dmg: (p.meleeDmg || 34) * CALL.hit, tick: callTick };
    for (const u of knights) u.summon.e = e;
    this.active.push(e);
    p.swingT = 0.2; p.attackDir = 'over';
    this.emit('callcharge', p.pos, f, [c]);
    return true;
  },
};

// The Rally Cry, folded into the Ultimate: every ally near takes less damage and moves faster for a while; he takes less too.
function rallyCry(A, p) {
  const R = CALL.rally;
  let rallied = 0;
  A.eachFriend(p.team, p.pos.x, p.pos.z, R.radius, (o) => {
    if (o === p) return;
    rallied++;
    A.guard(o, R.time, R.ally);
    A.haste(o, R.time, R.haste);
  });
  if (p.gainXp && p.isPlayer) p.gainXp(Math.min(24, rallied * 3), 'support');
  A.guard(p, R.time, R.self);
  A.haste(p, R.time, R.haste);
}

// One cut of the Sweeping Strike on foe o, thrown out along (nx, nz)
function cut(g, p, o, dmg, nx, nz) {
  const hero = o.isPlayer || o.kit;
  g.damage(o, hero ? dmg * 0.85 : dmg, p, { melee: true, splash: true, ability: 'Sweeping Strike' });
  if (!o.alive) return;
  if (o.stagger && !o.isSiege) o.stagger(hero ? SW.hero : SW.stagger, p);
  if (o.vel && !o.isPlayer && !o.isGiant && !o.isSiege) { o.vel.x += nx * SW.knock; o.vel.z += nz * SW.knock; }
  g.fx.sparks(o.chest(HIT_AT), 6);
}

// Rider's Rhythm (Cavalier talent): every foe a Sweeping Strike cuts takes a little off Lance Charge's recharge (the guest is told: its
// own screen keeps its own cooldowns)
function rhythm(g, p, n) {
  const R = n > 0 && p.abilCd ? talentFx(p, 'sweepRhythm', null) : null;
  if (!R) return;
  const was = p.abilCd.r;
  p.abilCd.r = Math.max(0, was - Math.min(R.max, n * R.per));
  if (p.abilCd.r !== was && p.remote && g.deliver) g.deliver(p, { k: 'cd', s: 'r', v: Math.round(p.abilCd.r * 10) / 10 });
}

// The sweep's course where the battle is run: along the stretch he has ridden since the last frame, every foe out on its side
function sweepTick(A, e, dt) {
  const p = e.p, g = A.g;
  if (!p.alive || !p.mounted || e.t > e.dur) { rhythm(g, p, e.n); return false; }
  // (the blade goes out again every time / swings: the body's swing for those who watch)
  if (e.t >= e.swing * (e.dur / SW.swings)) { e.swing++; p.swingT = 0; p.attackDir = e.side > 0 ? 'right' : 'left'; }
  const h = p.heading, fx = Math.sin(h), fz = Math.cos(h), sx = -fz * e.side, sz = fx * e.side;
  const prev = e.prev, d = Math.hypot(p.pos.x - prev.x, p.pos.z - prev.z), steps = Math.min(40, Math.max(1, Math.ceil(d / 1.5)));
  const dmg = p.meleeDmg * SW.dmg * talentFx(p, 'sweepDmg', 1) * momentumMul(p), R = e.reach;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = prev.x + (p.pos.x - prev.x) * t, z = prev.z + (p.pos.z - prev.z) * t;
    A.eachFoe(p.team, x + sx * R * 0.5, z + sz * R * 0.5, R * 0.5 + SW.front, (o) => {
      if (e.hit.has(o)) return;
      const ox = o.pos.x - x, oz = o.pos.z - z, out = ox * sx + oz * sz, along = ox * fx + oz * fz, r = o.radius || 0.4;
      if (out < -0.2 || out - r > R || along < -SW.back || along > SW.front) return;
      e.hit.add(o);
      e.n++;
      cut(g, p, o, dmg, sx * 0.8 + fx * 0.6, sz * 0.8 + fz * 0.6);
    }, p.pos.y, 3);
  }
  prev.copy(p.pos);
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the knights
// The wedge: two by two behind him, each row further out and further back (i: 0..5 → rows 1..3, left and right)
function wedgeOffset(i) {
  const row = 1 + (i >> 1), side = i & 1 ? 1 : -1;
  return { back: 1.5 + row * 3.4, side: side * row * 2.5 };
}
function wedgePoint(c, f, o, k, out) {
  return out.set(c.x - f.x * o.back * k - f.z * o.side * k, c.y, c.z - f.z * o.back * k + f.x * o.side * k);
}

// The nearest clear ground on the way from `from` to `want` (a wall, a tower, a cliff stop it): where a knight rides out
function clearSpot(g, p, from, want) {
  const ph = g.physics, L = WORLD.playHalf - 2;
  const dx = want.x - from.x, dz = want.z - from.z, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.75);
  let x = from.x, z = from.z, y = from.y;
  for (let i = 1; i <= n; i++) {
    const nx = from.x + (dx * i) / n, nz = from.z + (dz * i) / n;
    if (Math.abs(nx) > L || Math.abs(nz) > L) break;
    const gy = ph.groundHeight(nx, nz, y + 0.6, p.team);
    if (Math.abs(gy - y) > 1.2 || ph.pointHit(nx, gy + 0.8, nz, p.team) || ph.pointHit(nx, gy + 1.8, nz, p.team)) break;
    x = nx; z = nz; y = gy;
  }
  return new THREE.Vector3(x, y, z);
}

// A knight on the charge (Unit.update asks this first, where the battle is run): straight for his place round the spot at a gallop. True
// while he rides; when he gets there, is held up or the ride is over, he fights as any rider does (his order is 'charge').
function rideKnight(u, dt) {
  const s = u.summon;
  if (s.phase !== 'charge' || u.staggerT > 0) return false;
  s.t += dt;
  const dx = s.to.x - u.pos.x, dz = s.to.z - u.pos.z, d = Math.hypot(dx, dz);
  if (d < 2 || s.t > CALL.ride || s.stall > 0.8) { s.phase = 'fight'; u.thinkTimer = 0; return false; }
  const sp = CALL.speed * Math.min(1, 0.45 + s.t * 0.9) * (u.hasteT > 0 ? u.hasteMul : 1);
  let ux = dx / d, uz = dz / d;
  const steer = u.game.physics.steerAroundTrees(u.pos.x, u.pos.z, ux, uz, u.radius, u.id % 2 ? 1 : -1);
  if (steer) { ux = steer.x; uz = steer.z; }
  const k = Math.min(1, dt * 3);
  u.vel.x += (ux * sp - u.vel.x) * k;
  u.vel.z += (uz * sp - u.vel.z) * k;
  const ox = u.pos.x, oz = u.pos.z;
  u.applyMovement(dt, false);
  if (s.t > 0.5 && Math.hypot(u.pos.x - ox, u.pos.z - oz) < sp * dt * 0.3) s.stall += dt; else s.stall = 0;
  u.turnTo(Math.atan2(u.vel.x, u.vel.z), dt);
  u.animate(dt, true);
  u.mesh.position.copy(u.pos);
  u.mesh.rotation.y = u.yaw;
  return true;
}

// The charge's course where the battle is run: every knight still riding rides down whoever he passes; at the end they ride off.
function callTick(A, e) {
  const g = A.g, team = e.team;
  if (e.t >= CALL.life) { dismiss(A, e); return false; }
  for (const u of e.knights) {
    const s = u.summon;
    if (!u.alive) continue;
    if (s.phase === 'charge') {
      const prev = s.prev, d = Math.hypot(u.pos.x - prev.x, u.pos.z - prev.z), steps = Math.min(20, Math.max(1, Math.ceil(d / 1.2)));
      const vx = u.vel.x, vz = u.vel.z, v = Math.hypot(vx, vz) || 1;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, x = prev.x + (u.pos.x - prev.x) * t + (vx / v) * 0.9, z = prev.z + (u.pos.z - prev.z) * t + (vz / v) * 0.9;
        A.eachFoe(team, x, z, CALL.reach, (o) => {
          if (s.hit.has(o)) return;
          s.hit.add(o);
          const hero = o.isPlayer || o.kit;
          g.damage(o, hero ? e.dmg * CALL.heroHit : o.isSiege ? e.dmg * 0.5 : e.dmg, e.p, { melee: true, splash: true, charge: 1, ability: 'Call the Charge' });
          if (!o.alive) return;
          if (o.stagger && !o.isSiege) o.stagger(hero ? CALL.heroStagger : CALL.stagger, u);
          if (o.vel && !o.isPlayer && !o.isGiant && !o.isSiege) { o.vel.x += (vx / v) * CALL.knock; o.vel.z += (vz / v) * CALL.knock; }
          g.fx.sparks(o.chest(HIT_AT), 8);
          g.audio.play('thud', o.pos);
        }, u.pos.y, 3);
      }
    }
    s.prev.copy(u.pos);
  }
  return true;
}

// The knights ride off (gone in a cloud of dust on every screen); the fallen are left where they lie
function dismiss(A, e) {
  const g = A.g, left = [];
  for (const u of e.knights) {
    if (!u.alive) continue;
    left.push(u.pos.clone());
    u.alive = false;
    u.remove();
    const i = g.units.indexOf(u);
    if (i >= 0) g.units.splice(i, 1);
  }
  if (left.length) A.emit('cavfade', left[0], e.f, left);
}

// ------------------------------------------------------------------------------------------------------------------ the looks
// (every screen: ULT_SHOW is where Abilities.show looks for an id it does not know)
const GOLD = 0xffd56a;

ULT_SHOW.sweep = (ctx) => {
  const { A, g, at, dir, who, house, sz } = ctx;
  const R = SW.reach * sz;
  // a band of light on the ground out on that side, and the blade's arc riding with him
  A.gfx.glyph('cone', at.x + dir.x * 0.6, at.y, at.z + dir.z * 0.6, R + 0.6, GOLD, 0.5, { dir: Math.atan2(dir.z, dir.x), arc: 0.75, team: house, strength: 0.9 });
  const look = A.sweepPool && A.sweepPool.find((m) => !m.on);
  if (look && who) startSweepLook(A, look, who, dir, R, SW.time, SW.swings, house);
  g.fx._dust(V1.copy(at).setY(at.y + 0.3).addScaledVector(dir, 1.5), 6, 1, '');
  ctx.snd('sweep');
};

ULT_SHOW.sweepfoot = (ctx) => {
  const { A, g, at, dir, who, house, sz } = ctx;
  const R = SW.foot.reach * sz;
  A.gfx.glyph('cone', at.x, at.y, at.z, R + 0.4, GOLD, 0.45, { dir: Math.atan2(dir.z, dir.x), arc: SW.foot.arc * 0.95, team: house, strength: 1.4 });
  const look = A.sweepPool && A.sweepPool.find((m) => !m.on);
  if (look && who) startSweepLook(A, look, who, dir, R, 0.32, 1, house, true);
  g.fx._dust(V1.copy(at).setY(at.y + 0.2).addScaledVector(dir, 1.2), 5, 1.2, '');
  ctx.snd('sweep');
};

// The horn, the cry and the knights riding out: the cry's golden ring, the spot marked, a puff of dust where each knight appears, and then
// the dust they throw up as they ride (the knights themselves are soldiers: every screen has them from the snapshots)
ULT_SHOW.callcharge = (ctx) => {
  const { A, g, at, dir, targets, house, who } = ctx, gf = A.gfx, fx = g.fx;
  const c = targets && targets[0];
  const r = CALL.rally.radius;
  gf.glyph('shock', at.x, at.y, at.z, r, 0xffcc4a, 1.3, { team: house, strength: 1.5 });
  gf.pillar(at.x, at.y, at.z, 0xffd878, 1.1, 1.0, 14, 1.4);
  fx.ring(at, 3, A.col.set(0xffcc4a), 34, { speed: 8, up: 1.4, size: 0.34 });
  fx.flash(V1.copy(at).setY(at.y + 2), A.col.set(0xffd878), 6, 0.35, 0.8);
  if (c) {
    const d = Math.hypot(c.x - at.x, c.z - at.z);
    gf.glyph('rune', c.x, c.y, c.z, CALL.radius, 0xffd060, 4.5, { arms: 6, team: house, strength: 1.6 });
    gf.glyph('cone', at.x, at.y, at.z, Math.min(60, d + 2), 0xffe7a8, 1.1, { dir: Math.atan2(dir.z, dir.x), arc: 0.16, team: house, strength: 1.2 });
  }
  const spots = [];
  for (let i = 0; i < CALL.knights; i++) {
    const p = wedgePoint(at, dir, wedgeOffset(i), 1, new THREE.Vector3());
    p.y = g.physics.groundHeight(p.x, p.z, at.y + 2);
    spots.push(p);
    fx._dust(V1.copy(p).setY(p.y + 0.4), 14, 1.6, '');
    fx.flash(V1.copy(p).setY(p.y + 1.6), A.col.set(0xfff0c0), 3, 0.3, 0.7);
  }
  if (g.camfx) g.camfx.boom(at, 0.5);
  ctx.snd('chargehorn');
  A.ultFx.push({ t: 0, team: who ? who.team : -1, spots, knights: [], last: [], acc: 0, silent: ctx.silent, at: at.clone(), step: callLookStep });
};

// the knights' dust as they ride; found among the soldiers by where they appeared (a guest has them a snapshot later than the horn)
function callLookStep(A, e, dt) {
  const g = A.g;
  e.t += dt;
  if (e.t > CALL.ride + 1.5) return false;
  e.acc += dt;
  if (e.acc < 0.06) return true;
  const step = e.acc;
  e.acc = 0;
  if (e.t < 1.5 && e.knights.length < e.spots.length && e.team >= 0) {
    for (const u of g.units) {
      if (!u.alive || u.type !== 'lancer' || u.team !== e.team || e.knights.includes(u)) continue;
      if (e.spots.some((s) => Math.hypot(s.x - u.pos.x, s.z - u.pos.z) < 3.5)) { e.knights.push(u); e.last.push(u.pos.clone()); }
    }
  }
  if (e.t > 0.15 && !e.drum) { e.drum = true; if (!e.silent) g.audio.play('hooves', e.at); }
  for (let i = 0; i < e.knights.length; i++) {
    const u = e.knights[i], l = e.last[i];
    if (!u.alive) continue;
    const v = Math.hypot(u.pos.x - l.x, u.pos.z - l.z) / step;
    if (v > 6) {   // (at a gallop: dust from the hooves, and a glint off the armour now and then)
      const bx = (l.x - u.pos.x), bz = (l.z - u.pos.z), bl = Math.hypot(bx, bz) || 1;
      g.fx._dust(V1.set(u.pos.x + (bx / bl) * 1.2, u.pos.y + 0.3, u.pos.z + (bz / bl) * 1.2), 3, 0.8, '');
      if (Math.random() < 0.25) g.fx._sparks(V1.set(u.pos.x, u.pos.y + 2, u.pos.z), 2);
    }
    l.copy(u.pos);
  }
  return true;
}

ULT_SHOW.cavfade = (ctx) => {
  const { A, g, targets } = ctx;
  for (const p of targets || []) {
    g.fx._dust(V1.copy(p).setY(p.y + 0.5), 18, 1.8, '');
    g.fx.flash(V1.copy(p).setY(p.y + 1.6), A.col.set(0xffe9b0), 3, 0.35, 0.6);
  }
};

// ------------------------------------------------------------------------------------------------------------------ the blade's arc
// A crescent of light in the air out on the struck side, at the height of the blade, that sweeps from in front of the rider to behind
// him (`swings` times over `time` s) and follows him. Bright at its leading edge and at the tip, fading toward its tail (vertex colours,
// additive). Three are made with the world; one that is idle draws nothing.
const ARC_SEG = 24, ARC_SPAN = 1.9;
let arcGeo = null;
function sweepGeo() {
  if (arcGeo) return arcGeo;
  const pos = [], col = [], idx = [];
  // across the band, as a share of the reach (the rider's own body left clear): a faint wake inside, a bright thin edge where the
  // blade's tip went, nothing beyond it. Tipped a little down toward the tip, as a blade swung low.
  const RAD = [0.42, 0.78, 0.94, 1.0, 1.06], LIT = [0, 0.3, 0.7, 1, 0];
  const NR = RAD.length;
  for (let i = 0; i <= ARC_SEG; i++) {
    const u = i / ARC_SEG, th = -ARC_SPAN * (1 - u);   // u 0: the tail, 1: the head (at angle 0, along +x)
    const c = Math.cos(th), s = Math.sin(th), head = Math.pow(u, 1.8);
    for (let j = 0; j < NR; j++) {
      const r = RAD[j], k = LIT[j] * head;
      pos.push(c * r, 0.14 - 0.26 * r, s * r);
      col.push(k, k * 0.86, k * 0.52);
    }
  }
  for (let i = 0; i < ARC_SEG; i++) {
    for (let j = 0; j < NR - 1; j++) { const a = i * NR + j, b = a + NR; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  arcGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  arcGeo.setIndex(idx);
  return arcGeo;
}

function makeSweepLook(g) {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  mat.name = 'sweepArc';
  const mesh = new THREE.Mesh(sweepGeo(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  const m = { on: false, mesh, mat, who: null, side: 1, R: 1, time: 1, swings: 1, t: 0, foot: false, idle: new THREE.BufferGeometry() };
  m.idle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  m.idle.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  m.idle.setDrawRange(0, 0);
  mesh.geometry = m.idle;   // (idle: an empty draw, but in the scene so its shader is compiled with the world)
  g.scene.add(mesh);
  return m;
}

function startSweepLook(A, m, who, dir, R, time, swings, house, foot = false) {
  const h = foot ? who.yaw : who.mounted ? who.heading : who.yaw;
  // which side: the flat vector `dir` against his right hand (on foot `dir` is in front of him, and the cut runs right to left)
  m.side = foot ? 1 : (dir.x * -Math.cos(h) + dir.z * Math.sin(h) > 0 ? 1 : -1);
  m.on = true; m.who = who; m.R = R; m.time = time; m.swings = swings; m.t = 0; m.foot = foot;
  m.mat.color.setRGB(2.2, 2, 1.6);   // (brighter than white: it is added to what is behind it, and must show on pale sand)
  if (house) m.mat.color.lerp(house, 0.2);
  m.mesh.geometry = sweepGeo();
  m.mesh.scale.set(R, 1, R * m.side);
  // its course with the other Ultimate and ability looks (Abilities.updateFx)
  A.ultFx.push({ m, step: sweepLookStep });
}

function sweepLookStep(A, e, dt) {
  const m = e.m, w = m.who;
  m.t += dt;
  if (m.t >= m.time || !w || w.alive === false) {
    m.on = false; m.who = null; m.mat.opacity = 0; m.mesh.geometry = m.idle;
    return false;
  }
  const per = m.time / m.swings, k = (m.t % per) / per;   // (each swing: 0 to 1)
  const h = m.foot ? w.yaw : w.mounted ? w.heading : w.yaw;
  // the forward and the sideways angle of the rider in the x-z plane (the mesh's +x is turned to the blade)
  const fwd = Math.atan2(Math.cos(h), Math.sin(h));
  const ease = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);   // (slow out of the wind-up, fast through the middle, slow at the end)
  let a;
  if (m.foot) a = fwd + 1.6 - ease * 3.2;   // (on foot: one cut from his right across to his left; his right is the larger angle)
  else a = fwd + m.side * (-0.55 + ease * 2.9);   // (in the saddle: from across his horse's head round to behind him on that side)
  m.mesh.position.set(w.pos.x, w.pos.y + (w.mounted ? 1.75 : 1.05), w.pos.z);
  m.mesh.rotation.set(0, -a, 0);
  // the mirrored arc on the left keeps its tail behind its head
  m.mesh.scale.set(m.R, 1, m.R * (m.foot ? -1 : m.side));
  m.mat.opacity = Math.min(1, k * 6) * (k > 0.75 ? (1 - k) / 0.25 : 1) * (m.t > m.time - 0.1 ? (m.time - m.t) / 0.1 : 1);
  if (Math.random() < 0.8) {   // a few sparks off the blade's tip
    const c = Math.cos(a), s = Math.sin(a);
    A.g.fx._sparks(V1.set(w.pos.x + c * m.R, w.pos.y + (w.mounted ? 1.8 : 1.1), w.pos.z + s * m.R), 1);
  }
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the bots
// Sweeping Strike: in the saddle at a canter or faster with two foes (or a rival hero) about to go past within reach; on foot, two at
// hand (or a hero). b: the HeroBot.
export function sweepNow(b, p) {
  if (p.mounted) {
    if (Math.abs(p.rideSpeed) < 7) return false;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let n = 0, hero = false;
    for (const o of b.foes) {
      if (o.isSiege) continue;
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, along = dx * fx + dz * fz, out = Math.abs(dx * -fz + dz * fx);
      if (along < -0.5 || along > 7 || out > SW.reach + 0.5 || Math.abs(o.pos.y - p.pos.y) > 3) continue;
      n++;
      if (o.isPlayer || o.kit) hero = true;
    }
    return n >= 2 || hero;
  }
  return b.n.c3 >= 2 || (b.n.heroes8 && b.heroGap < 3);
}

// Call the Charge: at the densest knot of foes 12 m and more away along clear ground (rival heroes and engines count for more), seven at
// least, or five when his own men are in the thick of it and want the cry. b: the bot's brain (HeroBot or LordKit).
ULT_AI.callcharge = (b, p) => {
  const foes = b.foes, step = Math.max(1, Math.ceil(foes.length / 40));
  let best = null, bs = 0;
  for (let i = 0; i < foes.length; i += step) {
    const o = foes[i], d = b.dist[i];
    if (d < 12 || d > CALL.range - 4 || Math.abs(o.pos.y - p.pos.y) > 4) continue;
    let s = 0;
    for (const f of foes) if (Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < 7) s += f.isPlayer || f.kit ? 3 : f.isSiege ? 2 : 1;
    if (s > bs) { bs = s; best = o; }
  }
  let need = 7;
  let near = 0;
  for (const f of b.friends) if (f !== p && Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) < CALL.rally.radius) near++;
  if (near >= 5 && b.n.c12 >= 3) need = 5;
  if (!best || bs < need) return null;
  return { at: new THREE.Vector3(best.pos.x, p.game.physics.groundHeight(best.pos.x, best.pos.z, best.pos.y + 3), best.pos.z) };
};

// ------------------------------------------------------------------------------------------------------------------ the gauge
// A horseshoe on the HUD, low in the middle of the screen (just over the horse's head), only while a Cavalier is in the saddle: its gold fills with Momentum, a thin
// inner arc shows the speed at this moment (Momentum follows it, a little behind), and the bonus is written in it. Written to the page
// only when what it shows changes.
const SHOE = { el: null, fill: null, speed: null, txt: null, on: false, m: -1, s: -1, len: 1, len2: 1 };
const SHOE_GAP = 100;   // degrees left open at the bottom, as a horseshoe hangs
// the arc of radius r round (50, 50) in the SVG's own frame (y runs down: 90 degrees is straight down), from the bottom left over the top
function shoeArc(r) {
  const a0 = (90 + SHOE_GAP / 2) * Math.PI / 180, a1 = (90 - SHOE_GAP / 2) * Math.PI / 180;
  const pt = (a) => `${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
  return `M ${pt(a0)} A ${r} ${r} 0 1 1 ${pt(a1)}`;
}
function buildShoe() {
  const hud = document.getElementById('hud');
  if (!hud) return false;
  const el = document.createElement('div');
  el.id = 'momentum';
  el.title = 'Momentum: the faster you ride, the harder you hit';
  el.style.cssText = 'position:absolute;left:50%;bottom:84px;width:100px;height:100px;margin-left:-50px;pointer-events:none;display:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))';
  const span = 360 - SHOE_GAP, nails = [];
  for (let i = 0; i < 8; i++) {   // (the nail holes of a horseshoe, along the middle of the iron)
    const a = (90 + SHOE_GAP / 2 + (i + 0.5) * (span / 8)) * Math.PI / 180;
    nails.push(`<circle cx="${(50 + Math.cos(a) * 39).toFixed(2)}" cy="${(50 + Math.sin(a) * 39).toFixed(2)}" r="1.4" fill="rgba(40,26,8,.75)"/>`);
  }
  el.innerHTML = `<svg viewBox="0 0 100 100" width="100" height="100" style="position:absolute;left:0;top:0">
    <path d="${shoeArc(39)}" fill="none" stroke="rgba(24,18,10,.7)" stroke-width="14" stroke-linecap="round"/>
    <path class="mf" d="${shoeArc(39)}" fill="none" stroke="#e8b84a" stroke-width="9" stroke-linecap="round"/>
    <path class="ms" d="${shoeArc(29)}" fill="none" stroke="rgba(255,244,214,.9)" stroke-width="2.4" stroke-linecap="round"/>
    ${nails.join('')}
  </svg><div class="mt" style="position:absolute;left:0;right:0;top:36px;text-align:center;font:700 19px/1 Georgia,serif;color:#ffe9b0;text-shadow:0 1px 2px #000"></div>
  <div style="position:absolute;left:0;right:0;top:59px;text-align:center;font:700 7.5px/1 sans-serif;letter-spacing:1px;color:rgba(255,236,190,.8);text-shadow:0 1px 2px #000">MOMENTUM</div>`;
  hud.appendChild(el);
  SHOE.el = el;
  SHOE.fill = el.querySelector('.mf');
  SHOE.speed = el.querySelector('.ms');
  SHOE.txt = el.querySelector('.mt');
  SHOE.len = 2 * Math.PI * 39 * span / 360;
  SHOE.len2 = 2 * Math.PI * 29 * span / 360;
  SHOE.fill.style.strokeDasharray = `${SHOE.len} ${SHOE.len + 10}`;
  SHOE.speed.style.strokeDasharray = `${SHOE.len2} ${SHOE.len2 + 10}`;
  return true;
}

// every frame from the HUD (ui.js)
export function updateMomentumHud(p) {
  const show = !!(p && p.alive && p.mounted && p.mods && p.mods.momentum && !p.spectator);
  if (show !== SHOE.on) {
    if (!SHOE.el && !buildShoe()) return;
    SHOE.on = show;
    SHOE.el.style.display = show ? 'block' : 'none';
    SHOE.m = SHOE.s = -1;
  }
  if (!show) return;
  const m = Math.round((p.momentum || 0) * 100), s = Math.round(clamp01(Math.abs(p.rideSpeed) / MOM.gallop) * 50);
  if (m !== SHOE.m) {
    SHOE.m = m;
    SHOE.fill.style.strokeDashoffset = String(SHOE.len * (1 - m / 100));
    SHOE.fill.style.stroke = m >= 98 ? '#ffd24a' : m > 60 ? '#f0c050' : '#c99a40';
    SHOE.txt.textContent = `+${Math.round(p.mods.momentum * m)}%`;
  }
  if (s !== SHOE.s) { SHOE.s = s; SHOE.speed.style.strokeDashoffset = String(SHOE.len2 * (1 - s / 50)); }
}

// ------------------------------------------------------------------------------------------------------------------ sounds
// Sweeping Strike: the blade's rush through the air
SOUNDS.sweep = (a, k) => {
  a.noise(0.32, 1300, 0.9, 0.32 * k, 'bandpass');
  a.noise(0.22, 3400, 1.2, 0.12 * k, 'bandpass', 0.05);
  a.tone(240, 0.25, 0.06 * k, 'triangle', 0.6);
};
// the knights' hooves: a rolling thunder of gallop beats (three beats and a pause, again and again), fading as they ride away
SOUNDS.hooves = (a, k) => {
  for (let i = 0; i < 18; i++) {
    const bar = Math.floor(i / 3), t = bar * 0.34 + (i % 3) * 0.075 + Math.random() * 0.02, f = 1 - i / 22;
    a.noise(0.09, 150 + Math.random() * 60, 1, 0.42 * k * f, 'lowpass', t);
    a.tone(58 + Math.random() * 10, 0.08, 0.16 * k * f, 'sine', 0.7, t);
  }
};
