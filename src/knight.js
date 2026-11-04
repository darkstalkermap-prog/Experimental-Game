// =====================================================================================================================================
// THE KNIGHT: blocking is how he builds his big hit.
//   Retribution (passive): every blow his raised shield takes fills a Wrath bar (a parry more, an arrow or a spell on the shield less).
//     Full, his next swing sends out a shockwave: a cone in front of him that hurts, staggers and throws back everyone in it.
//   Q Shield Throw: the shield flies along his aim (as far as a Fireball), bounces from foe to foe (up to three), stunning each, and
//     comes back to his hand. While it is away he cannot block.
//   R Challenge: every foe within 12 m must fight him for 3 s (soldiers, lords and hero bots turn on him; a person sees a red tether
//     and "Challenged!"), while he takes 50% less damage: the blows it draws onto his shield fill the Wrath bar.
//   Z Banner of the Realm (Ultimate): he plants his house's banner. For 12 s allies near it heal and foes near it are slowed.
// Simulated where the battle is run (single player, the host) as Abilities' own methods (KNIGHT_METHODS, mixed in by classes.js); every
// screen draws the looks (KNIGHT_SHOW, run by Abilities.show from the 'abil' events), and the hero bots and the lords who fight as Knights
// use them (knightTossPick, knightGuard, and the Banner's ULT_AI rule). The HUD's Wrath bar and the "Challenged!" warning: knighthud.js.
// =====================================================================================================================================
import * as THREE from 'three';
import { FIREBALL_RANGE, TEAM_COLORS } from './config.js';
import { allied } from './teams.js';
import { talentFx } from './talents.js';
import { SOUNDS } from './audio.js';
import { ULT_SHOW, ULT_AI } from './ultimate.js';
import { materials } from './materials.js';
import { customBanner } from './textures.js';
import { isCustom } from './heraldry.js';

// Every number of the Knight's kit (the talents that change them: talents.js TUNE.knight).
export const KNIGHT = {
  // Wrath, 0..1: what a blow on the shield adds (a full block, a parry, a blow the shield only softened: an arrow, a spell, a blow with too
  // little stamina left; `lord`: a lord's shield turning a blow aside), and how it fades: after `idle` s without a blocked blow, `fade` a second
  wrath: { block: 0.2, parry: 0.34, soft: 0.08, lord: 0.2, idle: 12, fade: 0.04 },
  // the shockwave: a cone `reach` m long and as wide as cos `cos` either side of his facing; `dmg` of his melee damage (`edge` of it at the
  // far end), soldiers thrown back `knock` m/s and staggered `stagger` s, heroes `hero` s
  wave: { reach: 9, cos: 0.5, dmg: 2.2, edge: 0.55, knock: 12, stagger: 1, hero: 0.5 },
  // Shield Throw: out at `speed` m/s up to `range` m, a bounce to the nearest foe within `bounce` m of the last, `hits` foes in all, each
  // taking `dmg` of his melee damage and stunned `stun` s (a hero `hero` s, nothing if his own shield is up facing it); back at `back` m/s.
  // A foe within `hitR` m of its path is struck; after `maxT` s it is back in his hand whatever happened
  toss: { range: FIREBALL_RANGE, speed: 55, back: 60, bounce: 10, hits: 3, dmg: 1.3, stun: 1.1, hero: 0.8, hitR: 0.8, maxT: 8 },
  // Challenge: every foe within `radius` m for `time` s; he takes `cut` of the damage
  dare: { radius: 12, time: 3, cut: 0.5 },
  // the Banner: `radius` m for `time` s; every `every` s heroes of his side near it heal `heal` of their health a second, soldiers
  // `healMen`; foes near it move at `slow` of their speed
  banner: { radius: 10, time: 12, heal: 0.025, healMen: 0.04, slow: 0.6, every: 0.5 },
};
const T = KNIGHT.toss, W = KNIGHT.wave, D = KNIGHT.dare, B = KNIGHT.banner;

// the effects a hero can carry from the kit (Buffs: the HUD's list of what is on you; classes.js adds them to BUFF_NAMES)
export const KNIGHT_BUFFS = { challenged: 'Challenged', slow: 'Slowed' };

const ZERO = new THREE.Vector3();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const isHero = (o) => !!(o.isPlayer || o.kit);
const v3 = () => new THREE.Vector3();

// ------------------------------------------------------------------------------------------------------------------ Wrath
// A blow met knight o's shield (Game.damage): kind 'block', 'parry', 'soft' or 'lord'. Where the battle is run only (a guest's bar comes
// in its snapshot). Full, his shield glints for everyone (the 'wrathfull' look).
export function wrathGain(o, kind) {
  if (!o || o.classId !== 'knight' || !o.alive || o.drive) return;
  const g = o.game;
  if (!g || !g.simulating) return;
  let k = KNIGHT.wrath[kind] || 0;
  if (o.chalUntil > g.time) k *= talentFx(o, 'dareWrath', 1);   // (Hold the Line: blows blocked while he Challenges count for more)
  const was = o.wrath || 0;
  o.wrath = Math.min(1, was + k);
  o.wrathAt = g.time;
  if (was < 1 && o.wrath >= 1) g.abilities.emit('wrathfull', o.pos, ZERO);
}

// ------------------------------------------------------------------------------------------------------------------ the methods
// (mixed into Abilities.prototype by classes.js: `this` is Abilities)
export const KNIGHT_METHODS = {
  // the pooled looks: the flying shields, the banners and the Challenge's tethers (their materials are the world's own, compiled with it)
  knightInit() {
    this.tosses = [];     // the shields in flight on this screen, one per knight
    this.banners = [];    // the banners planted
    this.dares = [];      // the Challenges being drawn (their tethers)
    const g = this.g;
    if (!g.scene || !g.magic) return;
    const M = materials();
    this.shieldGeo = kiteGeometry();
    this.bossGeo = new THREE.SphereGeometry(0.07, 8, 6);
    this.tossPool = [];
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.shieldGeo, M.team[0]);
      const boss = new THREE.Mesh(this.bossGeo, M.steel);
      boss.position.z = 0.03;
      mesh.add(boss);
      mesh.visible = false;
      g.scene.add(mesh);
      this.tossPool.push({ mesh, on: false });
    }
    this.bannerPool = [];
    for (let i = 0; i < 2; i++) this.bannerPool.push(makeBanner(g, M));
    // the tethers: a ribbon turned to the camera for each foe a Challenge binds, all of them one mesh (one draw while any is on screen)
    const n = 32, geo = new THREE.BufferGeometry(), idx = [];
    for (let i = 0; i < n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.tether = new THREE.Mesh(geo, mat);
    this.tether.frustumCulled = false;
    this.tether.visible = false;
    this.tether.renderOrder = 6;
    this.tetherMax = n;
    g.scene.add(this.tether);
  },

  // Every frame where the battle is run: each knight's Wrath fades when he has blocked nothing for a while (and is gone with the class).
  knightTick(dt) {
    const g = this.g;
    for (const h of g.humans) wrathFade(g, h, dt);
    for (const f of g.factions) if (f && f.hero && f.hero.kit) wrathFade(g, f.hero, dt);
  },

  // Retribution: a knight with a full Wrath bar swings (Player.meleeStrike, a lord's blow in Unit.updateAttack): the shockwave.
  retribution(p) {
    const g = this.g;
    p.wrath = 0;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const reach = W.reach, dmg = p.meleeDmg * W.dmg;
    this.eachFoe(p.team, p.pos.x, p.pos.z, reach, (o, d) => {
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
      if (d > 1.2 && (dx * fx + dz * fz) / d < W.cos) return;   // (in the cone; a foe pressed against him is in it whatever his angle)
      g.damage(o, dmg * (1 - (1 - W.edge) * Math.min(1, d / reach)), p, { melee: true, splash: true, charge: 1, ability: 'Retribution' });
      if (!o.alive) return;
      if (o.stagger) o.stagger(isHero(o) ? W.hero : W.stagger, p);
      if (o.vel && !o.isPlayer && !o.isGiant && !o.isSiege) { const l = d || 1; o.vel.x += (dx / l) * W.knock; o.vel.z += (dz / l) * W.knock; }
    }, p.pos.y, 3);
    this.emit('wrathwave', p.pos, V1.set(fx, 0, fz), null, reach / W.reach);
  },

  // Q: Shield Throw. Refused while the shield is still away (the cooldown comes back).
  shieldthrow(p, cam, dir) {
    if (p.shieldOut) return false;
    const g = this.g;
    const from = cam.clone().addScaledVector(dir, 0.7);
    from.y -= 0.25;
    const e = {
      kind: 'ult', p, t: 0, tick: tossTick, leg: 'out', pos: from.clone(), dir: dir.clone(), went: 0, hits: 0, hit: new Set(), tgt: null,
      max: T.hits + talentFx(p, 'tossHits', 0), reach: T.bounce + talentFx(p, 'tossReach', 0), speed: T.speed, back: T.back,
      dmg: p.meleeDmg * T.dmg * talentFx(p, 'tossDmg', 1), stun: talentFx(p, 'tossStun', 0),
    };
    p.shieldOut = true; p.shieldAt = g.time; p.blocking = false;
    this.active.push(e);
    const end = this.rayHit(from, dir, T.range, p.team).pos;   // (where it would fly if nothing stepped into its way: the look's first leg)
    this.emit('shthrow', p.pos, dir, [from, end]);
  },

  // R: Challenge.
  challenge(p, cam, dir) {
    const g = this.g, t = D.time + talentFx(p, 'dareTime', 0), r = D.radius + talentFx(p, 'dareRadius', 0);
    p.buffs.add('guard', t, D.cut);
    p.chalUntil = g.time + t;
    const reflect = talentFx(p, 'reflect', 0);   // Avenging Wall (capstone): a melee attacker takes part of his blow back (Player.takeDamage)
    if (reflect) p.buffs.add('reflect', t, reflect);
    const wave = talentFx(p, 'bulwarkWave', null);   // Bastion Strike (its alternative): what he takes is stored, and comes out as a slam at the end
    if (wave) this.active.push(p.bwave = { kind: 'bwave', p, t: 0, dur: t + 1, delay: t, wave, sum: 0 });
    const ally = talentFx(p, 'dareAlly', 0);   // Phalanx: the allies beside him are shielded too
    if (ally) this.eachFriend(p.team, p.pos.x, p.pos.z, ally.radius, (o) => { if (o !== p) this.guard(o, t, 1 - ally.cut); });
    const heroes = [], men = [];
    this.eachFoe(p.team, p.pos.x, p.pos.z, r, (o) => {
      if (o.isSiege || o.isTowerArcher || o.isStructure) return;
      if (o.isPlayer) { o.chalBy = p; o.chalUntil = g.time + t; o.buffs.add('challenged', t); }
      else { o.taunt = p; o.tauntUntil = g.time + t; o.target = p; }   // (Unit.think holds him to it)
      (isHero(o) ? heroes : men).push(o);
    }, p.pos.y, 4);
    // the tethers on every screen: the heroes first, then the nearest soldiers (12 at most: the message stays small)
    if (men.length > 12 - heroes.length) men.sort((a, b) => dist2(a, p) - dist2(b, p));
    const pts = heroes.concat(men).slice(0, 12).map((o) => o.chest(v3()));
    p.swingT = 0.2; p.attackDir = 'over';
    this.emit('challenge', p.pos, dir, pts, t / D.time);
  },

  // Z: Banner of the Realm, planted where he stands.
  realmbanner(p, cam, dir) {
    const g = this.g, c = p.pos.clone();
    c.y = g.physics.groundHeight(c.x, c.z, c.y + 1);
    this.active.push({ kind: 'ult', p, team: p.team, t: 0, c, end: g.time + B.time, every: 0, tick: bannerTick });
    p.swingT = 0.3; p.attackDir = 'over';
    this.emit('realmbanner', c, dir);
  },
};

function wrathFade(g, o, dt) {
  if (!o) return;
  if (o.classId !== 'knight') { o.wrath = 0; if (o.shieldOut) o.shieldOut = false; return; }   // (another class: no Wrath, and the shield is his again)
  if (o.wrath > 0 && g.time - (o.wrathAt || 0) > KNIGHT.wrath.idle) o.wrath = Math.max(0, o.wrath - KNIGHT.wrath.fade * dt);
}

const dist2 = (a, b) => (a.pos.x - b.pos.x) ** 2 + (a.pos.z - b.pos.z) ** 2;

// The shield in flight, where the battle is run: out along the aim (a foe in its way is struck; a wall, the ground or the end of its
// reach sends it back), then on to the next foe, then home to his hand.
function tossTick(A, e, dt) {
  const g = A.g, p = e.p, ph = g.physics;
  if ((e.t += dt) > T.maxT) return caught(A, e);
  if (e.leg === 'out') {
    let left = e.speed * dt;
    while (left > 1e-6) {
      const s = Math.min(0.4, left);
      left -= s;
      e.pos.addScaledVector(e.dir, s);
      e.went += s;
      const q = e.pos;
      if (q.y < ph.terrainHeight(q.x, q.z) + 0.1 || ph.pointHit(q.x, q.y, q.z, p.team)) {
        e.pos.addScaledVector(e.dir, -0.4);
        goBack(A, e, 1);
        return true;
      }
      const s0 = g.siegeAt(q, p.team, 0.2);
      if (s0) { strike(A, e, s0); return true; }
      const o = g.projectiles.hitCharacter(q, p.team, T.hitR, e.hit);
      if (o && !o.drive) { strike(A, e, o); return true; }
      if (e.went >= T.range) { goBack(A, e, 0.5); return true; }
    }
    return true;
  }
  if (e.leg === 'bounce') {
    const o = e.tgt;
    if (!o || !o.alive) { goBack(A, e, 0.5); return true; }
    const c = o.chest(V1), dx = c.x - e.pos.x, dy = c.y - e.pos.y, dz = c.z - e.pos.z, d = Math.hypot(dx, dy, dz), s = e.speed * dt;
    if (d <= s + (o.radius || 0.4)) { e.pos.copy(c); strike(A, e, o); return true; }
    e.pos.x += (dx / d) * s; e.pos.y += (dy / d) * s; e.pos.z += (dz / d) * s;
    return true;
  }
  // home: to his hand (where he lies, if he has fallen)
  const c = p.alive ? p.chest(V1) : V1.copy(p.pos), dx = c.x - e.pos.x, dy = c.y - e.pos.y, dz = c.z - e.pos.z, d = Math.hypot(dx, dy, dz), s = e.back * dt;
  if (d <= s + 0.6) return caught(A, e);
  e.pos.x += (dx / d) * s; e.pos.y += (dy / d) * s; e.pos.z += (dz / d) * s;
  return true;
}

// the shield strikes o: damage and a stun (not through a hero's own raised shield), then on to the next foe or home
function strike(A, e, o) {
  const g = A.g, p = e.p;
  e.hits++;
  e.hit.add(o);
  const at = e.pos.clone();
  let guarded = false;
  if (o.isPlayer && o.blocking) {   // (a hero who meets it with his own shield takes it on the shield: Game.damage softens it, and he keeps his feet)
    const dx = at.x - o.pos.x, dz = at.z - o.pos.z, l = Math.hypot(dx, dz) || 1;
    guarded = (dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw)) / l > 0.35;
  }
  g.damage(o, e.dmg, p, { ranged: true, ability: 'Shield Throw', dir: { x: e.dir.x, z: e.dir.z } });
  if (o.alive && o.stagger && !o.isSiege && !guarded) o.stagger((isHero(o) ? T.hero : T.stun) + e.stun, p);
  if (!o.isSiege && e.hits < e.max) {
    // the next: the nearest foe within reach of this one that it has not struck yet, with nothing in the way
    let best = null, bd = e.reach * e.reach;
    g.grid.query(at.x, at.z, e.reach + 1, (u) => {
      if (!u.alive || u.drive || allied(u.team, p.team) || e.hit.has(u)) return;
      const d = (u.pos.x - at.x) ** 2 + (u.pos.z - at.z) ** 2;
      if (d >= bd || Math.abs(u.pos.y - o.pos.y) > 4) return;
      const c = u.chest(V2);
      if (!g.physics.lineClear(at.x, at.y, at.z, c.x, c.y, c.z, p.team)) return;
      bd = d; best = u;
    });
    if (best) {
      e.leg = 'bounce'; e.tgt = best;
      e.dir.set(best.pos.x - at.x, 0, best.pos.z - at.z).normalize();
      A.emit('shbounce', p.pos, e.dir, [at, best.chest(v3())], 1);
      return;
    }
  }
  goBack(A, e, 1, at);
}

function goBack(A, e, clang, at = e.pos) {
  e.leg = 'back'; e.tgt = null;
  A.emit('shreturn', e.p.pos, ZERO, [at], clang);
}

function caught(A, e) {
  const p = e.p;
  p.shieldOut = false;
  p.shieldBack = A.g.time;
  return false;
}

// The Banner at work where the battle is run: heals the allies near it, slows the foes (every B.every s, for a little longer than that).
function bannerTick(A, e, dt) {
  const g = A.g;
  if (g.time >= e.end) return false;
  if ((e.every -= dt) > 0) return true;
  e.every = B.every;
  const c = e.c, R = B.radius, p = e.p, lasts = B.every + 0.25;
  A.eachFriend(e.team, c.x, c.z, R, (o) => {
    if (o.isSiege || o.isStructure || o.hp >= o.maxHp) return;
    const n = o.maxHp * (isHero(o) ? B.heal : B.healMen) * B.every;
    if (o.isPlayer || (o === p && o.heal)) o.heal(n);   // (a lord's own kit heals him less: lordkit.js mend)
    else o.hp = Math.min(o.maxHp, o.hp + n);
  });
  A.eachFoe(e.team, c.x, c.z, R, (o) => {
    if (o.isSiege || o.isTowerArcher || o.isGiant) return;
    if (o.isPlayer) o.buffs.add('slow', lasts, 1 - B.slow);   // (Player.speedMult)
    else if (o.addHaste) o.addHaste(lasts, B.slow);
  }, c.y, 4);
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the looks
// (every screen, from Abilities.show; ctx as for the Ultimates: { A, g, at, dir, targets, sz, who, house, silent, snd })
const COL = new THREE.Color();
const KNIGHT_SHOW = {
  // a knight's Wrath bar has filled: his shield glints
  wrathfull(ctx) {
    const { g, who } = ctx;
    if (!who) return;
    if (who === g.player && g.camera) {   // (his own: on the shield in his hand, low on the left of the view)
      const fx = Math.sin(who.yaw), fz = Math.cos(who.yaw), c = g.camera.position;
      V1.set(c.x + fx * 0.8 + fz * 0.42, c.y - 0.32, c.z + fz * 0.8 - fx * 0.42);
    } else shieldSpot(who, V1);
    g.fx.flash(V1, COL.set(0xfff0c8), 2.2, 0.35, 1.2);
    g.fx.gold(V1);
    g.fx._sparks(V1, 8);
    ctx.snd('wrathfull');
  },

  // Retribution: the shockwave runs out in a cone from his feet
  wrathwave(ctx) {
    const { A, g, at, dir, house, sz } = ctx, gf = A.gfx, fx = g.fx, reach = W.reach * sz;
    const heading = Math.atan2(dir.z, dir.x), half = Math.acos(W.cos);
    gf.glyph('cone', at.x, at.y, at.z, reach, 0xffd890, 0.7, { dir: heading, arc: half, team: house, strength: 2 });
    gf.glyph('shock', at.x, at.y, at.z, 3, 0xfff0d0, 0.45, { team: house, strength: 1.6 });
    fx.flash(V1.copy(at).setY(at.y + 1.2).addScaledVector(dir, 0.8), COL.set(0xffe8b0), 4, 0.25, 1);
    fx._sparks(V1, 22);
    if (g.camfx) g.camfx.boom(at, 0.6);
    ctx.snd('wrathwave');
    A.ultFx.push({ t: 0, at: at.clone(), dir: dir.clone(), reach, half, done: 0, step: waveStep });
  },

  // Shield Throw: it leaves his hand (targets: where it leaves, where it would end)
  shthrow(ctx) {
    const { A, g, targets, who } = ctx;
    if (!targets || targets.length < 2) return;
    const L = tossLook(A, who, targets[0]);
    if (!L) return;
    L.to.copy(targets[1]); L.home = false; L.wait = 0;
    if (who) { if (!g.simulating) who.shieldOut = true; who.shieldAt = g.time; rigShield(who, false); }
    ctx.snd('shieldthrow');
  },
  // it struck a foe and flies on to the next (targets: the blow, the next foe)
  shbounce(ctx) {
    const { A, g, targets, who } = ctx;
    if (!targets || targets.length < 2) return;
    clangAt(g, targets[0], ctx);
    const L = tossLook(A, who, targets[0]);
    if (L) { L.to.copy(targets[1]); L.home = false; L.wait = 0; }
  },
  // it comes back (targets: where it turned; sz 1: off a foe or a wall, with a clang)
  shreturn(ctx) {
    const { A, g, targets, who, sz } = ctx;
    if (!targets || !targets.length) return;
    if (sz >= 1) clangAt(g, targets[0], ctx);
    const L = tossLook(A, who, targets[0]);
    if (L) { L.home = true; L.wait = 0; }
  },

  // Challenge: a war cry and the shield struck with the sword; red tethers to every foe it binds (targets: their chests)
  challenge(ctx) {
    const { A, g, at, who, house, targets, sz } = ctx, gf = A.gfx, fx = g.fx, t = D.time * (sz || 1);
    gf.glyph('shock', at.x, at.y, at.z, D.radius * 1.1, 0xff4a30, 0.8, { team: house, strength: 2 });
    gf.glyph('rune', at.x, at.y, at.z, 2.6, 0xff3a20, t, { arms: 4, team: house, strength: 1.6 });
    fx.ring(at, 1.4, COL.set(0xff5038), 26, { up: 1.6, size: 0.32, speed: 6 });
    fx.flash(V1.copy(at).setY(at.y + 1.4), COL.set(0xff6040), 5, 0.3, 1);
    ctx.snd('challenge');
    if (!who) return;
    // the foes bound to him, found again on this screen by where they stood
    const foes = [];
    for (const q of targets || []) {
      let best = null, bd = 2.2 * 2.2;
      g.grid.query(q.x, q.z, 2.5, (u) => {
        if (!u.alive || allied(u.team, who.team) || foes.includes(u)) return;
        const d = (u.pos.x - q.x) ** 2 + (u.pos.z - q.z) ** 2;
        if (d < bd) { bd = d; best = u; }
      });
      const me = g.player;   // (one's own hero is matched directly: the grid may not have him where he is now)
      if (me && me.alive && !allied(me.team, who.team) && !foes.includes(me) && me.chest(V1).distanceToSquared(q) < 4 * 4) best = me;   // (his own place on the host may lag his screen a little)
      if (best) foes.push(best);
    }
    const end = g.time + t;
    if (foes.includes(g.player)) A.chalOnMe = { who, until: end };   // (the HUD's warning, and a marker over him: knighthud.js)
    A.dares.push({ who, foes, end, acc: 0 });
    A.tether.visible = true;
    if (!A.daring) { A.daring = true; A.ultFx.push({ step: stepDares }); }   // (one stepper draws every Challenge's tethers)
  },

  // Banner of the Realm: the banner comes down and is planted; a ring in the house's colour round it
  realmbanner(ctx) {
    const { A, g, at, who, house } = ctx, gf = A.gfx, fx = g.fx;
    const team = who ? who.team : nearestTeam(g, at);
    const b = A.bannerPool && (A.bannerPool.find((x) => !x.on) || A.bannerPool.reduce((a, x) => (x.t > a.t ? x : a)));
    if (b) plantBanner(g, b, at, team, who);
    const tint = house || COL.set(TEAM_COLORS[team] ?? 0xffffff).clone();
    gf.glyph('rune', at.x, at.y, at.z, B.radius, 0xffe6a0, B.time, { arms: 8, team: tint, strength: 1.5 });
    gf.glyph('shock', at.x, at.y, at.z, B.radius * 1.15, 0xfff0c8, 0.9, { team: tint, strength: 1.8 });
    gf.pillar(at.x, at.y, at.z, 0xffe8b0, 0.9, 1.2, 9, 1.4);
    fx.ring(at, B.radius * 0.95, COL.set(0xffe090), 44, { up: 1.2, size: 0.36, life: 1.1 });
    fx._dust(V1.copy(at).setY(at.y + 0.2), 18, 1.6, '');
    if (g.camfx) g.camfx.boom(at, 0.4);
    ctx.snd('realmbanner');
    A.ultFx.push({ t: 0, at: at.clone(), team, acc: 0, pulse: 0, step: bannerLookStep });
  },
};
Object.assign(ULT_SHOW, KNIGHT_SHOW);

// where a knight's shield is (his left side, in front), for a glint
function shieldSpot(who, out) {
  const fx = Math.sin(who.yaw || 0), fz = Math.cos(who.yaw || 0);
  return out.set(who.pos.x + fx * 0.45 + fz * 0.3, who.pos.y + 1.2, who.pos.z + fz * 0.45 - fx * 0.3);
}

function clangAt(g, p, ctx) {
  g.fx._sparks(p, 14);
  g.fx.flash(p, COL.set(0xdfe8ff), 1.6, 0.18, 1);
  ctx.snd('shieldhit');
}

function nearestTeam(g, at) {
  let best = 0, bd = Infinity;
  for (const h of g.humans) { const d = (h.pos.x - at.x) ** 2 + (h.pos.z - at.z) ** 2; if (d < bd) { bd = d; best = h.team; } }
  return best;
}

// the shockwave's front: dust and sparks thrown up along a widening arc for a third of a second
function waveStep(A, e, dt) {
  const g = A.g, fx = g.fx, ph = g.physics;
  e.t += dt;
  const k = Math.min(1, e.t / 0.32), r = 1 + (e.reach - 1) * k;
  const base = Math.atan2(e.dir.z, e.dir.x), n = 5;
  for (let i = 0; i < n; i++) {
    const a = base + (Math.random() * 2 - 1) * e.half, x = e.at.x + Math.cos(a) * r, z = e.at.z + Math.sin(a) * r;
    V1.set(x, ph.groundHeight(x, z, e.at.y + 2) + 0.2, z);
    fx._dust(V1, 2, 0.5, '');
    if (Math.random() < 0.4) fx._sparks(V1.setY(V1.y + 0.4), 2);
  }
  return k < 1;
}

// ------------------------------------------------------------------------------------------------------------------ the flying shield's look
// One look per knight: a kite in his house's colour, spinning flat as it flies, with a glint trail. Each event from the host starts a
// new leg from wherever the look is now, so it never jumps; home, it is caught.
function tossLook(A, who, from) {
  if (!A.tossPool) return null;
  let L = A.tosses.find((x) => x.who === who);
  if (!L) {
    const slot = A.tossPool.find((x) => !x.on);
    if (!slot) return null;
    slot.on = true;
    const M = materials();
    slot.mesh.material = M.team[who ? who.team : 0] || M.team[0];
    slot.mesh.visible = true;
    L = { slot, who, pos: from.clone(), to: from.clone(), home: false, speed: T.speed, back: T.back, wait: 0, t: 0, acc: 0, spin: 0, step: tossLookStep };   // (no gameplay dice in a look: it is made outside quietly)
    A.tosses.push(L);
    A.ultFx.push(L);
  }
  return L;
}

function tossLookStep(A, L, dt) {
  const g = A.g, who = L.who, m = L.slot.mesh;
  L.t += dt;
  const end = () => {
    L.slot.on = false; m.visible = false;
    A.tosses.splice(A.tosses.indexOf(L), 1);
    if (who) {
      if (!g.simulating) who.shieldOut = false;
      who.shieldBack = g.time;
      rigShield(who, true);
      g.audio.play('shieldcatch', who === g.player ? null : who.pos);
    }
    return false;
  };
  if (L.t > T.maxT + 1) return end();
  let target;
  if (L.home) {
    if (!who) return end();
    target = who.alive === false ? V1.copy(who.pos) : who.chest ? who.chest(V1) : V1.copy(who.pos).setY(who.pos.y + 1.2);
  } else target = L.to;
  const dx = target.x - L.pos.x, dy = target.y - L.pos.y, dz = target.z - L.pos.z, d = Math.hypot(dx, dy, dz);
  const s = (L.home ? L.back : L.speed) * dt;
  if (d <= s + (L.home ? 0.6 : 0.01)) {
    L.pos.copy(target);
    if (L.home) return end();
    if ((L.wait += dt) > 0.8) L.home = true;   // (no word of the next leg: it comes home by itself)
  } else {
    L.pos.x += (dx / d) * s; L.pos.y += (dy / d) * s; L.pos.z += (dz / d) * s;
  }
  // flat and spinning, its face a little toward where it goes
  L.spin += dt * 22;
  m.position.copy(L.pos);
  m.rotation.set(-Math.PI / 2 + 0.25, 0, L.spin, 'XYZ');
  m.updateMatrix();
  L.acc += dt;
  if (who === g.player && d < 3) L.acc = 0;   // (not in his own eyes as he catches it)
  while (L.acc > 0.035) {   // (a gleam off the steel rim behind it)
    L.acc -= 0.035;
    g.fx.frostTrail(V2.set(L.pos.x + (Math.random() - 0.5) * 0.4, L.pos.y + (Math.random() - 0.5) * 0.2, L.pos.z + (Math.random() - 0.5) * 0.4));
  }
  return true;
}

// The Knight's kite in the world (a flat outline, the face +z): rounded at the top, its sides bellying out and tapering to a point.
function kiteGeometry() {
  const s = new THREE.Shape(), W2 = 0.3, top = 0.42, bot = -0.55;
  s.moveTo(-W2, 0.22);
  s.quadraticCurveTo(-W2, top, 0, top + 0.04);
  s.quadraticCurveTo(W2, top, W2, 0.22);
  s.quadraticCurveTo(W2 * 0.95, -0.15, 0, bot);
  s.quadraticCurveTo(-W2 * 0.95, -0.15, -W2, 0.22);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0.05, -0.02);
  return geo;
}

// The shield on a knight's body (and its gold trim, from the 4th tier of kit) shown or hidden while it flies (models.js: the parts on the
// shield forearm are its sleeve, then the shield).
export function rigShield(who, on) {
  const m = who && (who.body || who.model);
  if (!m || !m.parts || !m.desc || !m.desc.shield) return;
  if (!!m.shieldGone === !on) return;
  m.shieldGone = !on;
  const sh = m.parts.filter((q) => q.node === m.elL)[1];
  if (sh && sh !== m.kitShield && sh !== m.bowPart) sh.on = on;
  if (m.kitShield) { if (!on) { m.kitShOn = m.kitShield.on; m.kitShield.on = false; } else m.kitShield.on = !!m.kitShOn; }
}

// The first-person shield arm (viewmodel.js, after it has placed the shield): thrown, the arm follows through out across the front and the
// empty hand (open) drops back low while the shield is away; caught, the shield comes back into the hand with a jolt. Returns whether it
// moved the arm (the caller updates its matrix).
export function knightArm(vm, p, t, L) {
  const away = !!p.shieldOut;
  if (L.shield.visible === away) { L.shield.visible = !away; L.hand.morphTargetInfluences[0] = away ? 0.25 : 1; }
  const since = t - (p.shieldAt ?? -99), back = t - (p.shieldBack ?? -99);
  if (vm.knCaught !== p.shieldBack && back >= 0 && back < 0.5) { vm.knCaught = p.shieldBack; vm.blocked(false); }   // (the catch: a kick through the arm)
  let dx = 0, dy = 0, dz = 0, rz = 0;
  if (away) {
    const k = Math.min(1, since / 0.1), r = Math.min(1, Math.max(0, (since - 0.12) / 0.4));
    dx = 0.2 * k * (1 - r); dz = -0.24 * k * (1 - r); dy = 0.04 * k * (1 - r) - 0.06 * r; rz = -0.5 * k * (1 - r);
  } else if (back >= 0 && back < 0.3) {
    const k = 1 - back / 0.3;
    dz = -0.1 * k * k; dx = 0.05 * k * k;
  } else return false;
  L.grp.position.x += dx; L.grp.position.y += dy; L.grp.position.z += dz; L.grp.rotation.z += rz;
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ the banner
// Pole, crossbar, gold finial and the hanging cloth of his house (his own arms if he bears them: heraldry.js), the cloth stirring in
// the wind. Made once with the world; two can stand at once.
function makeBanner(g, M) {
  const grp = new THREE.Group();
  const H = 3.6;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, H, 7), M.wood);
  pole.position.y = H / 2;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), M.wood);
  bar.rotation.z = Math.PI / 2; bar.position.y = H - 0.25;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 7), M.gold);
  tip.position.y = H + 0.16;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.gold);
  knob.position.y = H;
  const clothGeo = new THREE.PlaneGeometry(1.1, 2.2, 5, 10);
  clothGeo.translate(0, -1.1, 0);   // (it hangs from its top edge)
  const base = Float32Array.from(clothGeo.attributes.position.array);
  clothGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const mat = M.banners[0].clone();   // (the castles' banner material: the same shader, its own cloth)
  const cloth = new THREE.Mesh(clothGeo, mat);
  cloth.position.set(0, H - 0.27, 0.06);
  grp.add(pole, bar, tip, knob, cloth);
  for (const o of [pole, bar, tip, knob, cloth]) o.castShadow = true;
  grp.visible = false;
  g.scene.add(grp);
  return { grp, cloth, mat, base, on: false, t: 0, at: new THREE.Vector3(), H };
}

function plantBanner(g, b, at, team, who) {
  const M = materials(), col = TEAM_COLORS[team] ?? TEAM_COLORS[0];
  const arms = who && who.arms;
  b.mat.map = arms && isCustom(arms) ? customBanner(col, team, arms) : (M.banners[team] || M.banners[0]).map;
  b.mat.needsUpdate = false;
  b.on = true; b.t = 0;
  b.at.copy(at);
  b.yaw = who ? who.yaw || 0 : 0;
  b.grp.visible = true;
  b.grp.position.set(at.x, at.y + 3, at.z);
  b.grp.rotation.set(0, b.yaw, 0);
  b.grp.scale.setScalar(1);
}

// the banner's life on screen: it drops and drives into the ground, the cloth stirs; around it motes rise, the allies inside glint
// green as they mend and the foes are dragged at (a cold mist at their feet); at the end it sinks away
function bannerLookStep(A, e, dt) {
  const g = A.g, fx = g.fx;
  e.t += dt;
  const b = A.bannerPool && A.bannerPool.find((x) => x.on && x.at.distanceToSquared(e.at) < 0.01);
  if (b) {
    b.t = e.t;
    const drop = Math.min(1, e.t / 0.22);
    let y = e.at.y + 3 * (1 - drop * drop);
    if (e.t > B.time - 0.6) y -= (e.t - (B.time - 0.6)) * 6;   // (sinking away)
    b.grp.position.y = y;
    if (!e.landed && drop >= 1) {
      e.landed = true;
      fx._dust(V1.copy(e.at).setY(e.at.y + 0.2), 22, 1.4, '');
      g.audio.play('thud', e.at);
    }
    waveCloth(b, e.t);
    if (e.t >= B.time) { b.on = false; b.grp.visible = false; }
  }
  if (e.t >= B.time) {
    A.gfx.glyph('shock', e.at.x, e.at.y, e.at.z, B.radius, 0xfff0c8, 0.6, { strength: 1.2 });
    return false;
  }
  e.acc += dt;
  while (e.acc > 0.14) {   // (motes of gold rising inside the ring)
    e.acc -= 0.14;
    const a = Math.random() * Math.PI * 2, r = B.radius * Math.sqrt(Math.random()) * 0.95;
    const x = e.at.x + Math.cos(a) * r, z = e.at.z + Math.sin(a) * r;
    fx.gold(V1.set(x, g.physics.groundHeight(x, z, e.at.y + 2) + 0.3 + Math.random(), z));
  }
  if ((e.pulse -= dt) <= 0) {
    e.pulse = 0.5;
    let n = 0;
    g.grid.query(e.at.x, e.at.z, B.radius + 1, (u) => {
      if (!u.alive || n > 14 || Math.hypot(u.pos.x - e.at.x, u.pos.z - e.at.z) > B.radius) return;
      n++;
      if (allied(u.team, e.team)) { if (u.hp < u.maxHp) fx.orb(u.chest(V1), COL.set(0x7dff8a), 0.45); }
      else fx.frost(V1.set(u.pos.x, u.pos.y + 0.3, u.pos.z), 2);
    });
  }
  return true;
}

function waveCloth(b, t) {
  const pos = b.cloth.geometry.attributes.position, a = pos.array, base = b.base;
  for (let i = 0; i < a.length; i += 3) {
    const x = base[i], y = base[i + 1], hang = -y / 2.2;   // (0 at the crossbar, 1 at the tails)
    a[i + 2] = base[i + 2] + Math.sin(t * 3.1 + x * 2.6 + y * 1.7) * 0.13 * hang + Math.sin(t * 1.7 + y * 0.9) * 0.05 * hang;
    a[i] = x + Math.sin(t * 2.3 + y * 2.1) * 0.03 * hang;
  }
  pos.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------------------------ the tethers
// a strip from c (w0 m wide) to q (w1 m wide), turned to face the eye at `cam` (4 corners into arr at j)
const RA = new THREE.Vector3(), RB = new THREE.Vector3();
function ribbon(arr, j, c, q, cam, w0, w1) {
  RA.subVectors(q, c);
  RB.set((c.x + q.x) / 2 - cam.x, (c.y + q.y) / 2 - cam.y, (c.z + q.z) / 2 - cam.z);
  RA.cross(RB);
  const l = RA.length() || 1, a = w0 / l, b = w1 / l;
  arr[j] = c.x - RA.x * a; arr[j + 1] = c.y - RA.y * a; arr[j + 2] = c.z - RA.z * a;
  arr[j + 3] = c.x + RA.x * a; arr[j + 4] = c.y + RA.y * a; arr[j + 5] = c.z + RA.z * a;
  arr[j + 6] = q.x - RA.x * b; arr[j + 7] = q.y - RA.y * b; arr[j + 8] = q.z - RA.z * b;
  arr[j + 9] = q.x + RA.x * b; arr[j + 10] = q.y + RA.y * b; arr[j + 11] = q.z + RA.z * b;
}

// (a look stepped by Abilities.updateFx while any Challenge is on this screen: a red line from the knight to each foe he holds, and a red
// glow over their heads)
function stepDares(A, e, dt) {
  const g = A.g, L = A.tether, cam = g.camera.position;
  if (!L) { A.daring = false; return false; }
  const arr = L.geometry.attributes.position.array;
  let n = 0;
  for (let i = A.dares.length - 1; i >= 0; i--) {
    const d = A.dares[i], w = d.who;
    if (g.time >= d.end || !w || w.alive === false) { A.dares.splice(i, 1); continue; }
    const c = w.chest ? w.chest(V1) : V1.copy(w.pos).setY(w.pos.y + 1.2);
    const own = w === g.player;   // (from his own eyes: the tethers start a step ahead of him, thin, so they do not fill the view)
    if (own) { c.x += Math.sin(w.yaw) * 1.6; c.z += Math.cos(w.yaw) * 1.6; c.y -= 0.35; }
    d.acc += dt;
    const glow = d.acc > 0.15;
    if (glow) d.acc = 0;
    for (const o of d.foes) {
      if (!o.alive || n >= A.tetherMax) continue;
      const q = o.chest(V2);
      if (o === g.player) q.y -= 0.5;   // (from his own eyes the line comes in at the chest, not through the camera)
      ribbon(arr, n * 12, c, q, cam, own ? 0.006 : 0.03, 0.05);
      n++;
      if (glow) g.fx.orb(V3.set(o.pos.x, o.pos.y + (o.height || 1.8) + 0.4, o.pos.z), COL.set(0xff2a1a), 0.6);
    }
  }
  L.geometry.setDrawRange(0, n * 6);
  L.geometry.attributes.position.needsUpdate = true;
  if (A.dares.length) return true;
  L.visible = false;
  A.daring = false;
  return false;
}

// ------------------------------------------------------------------------------------------------------------------ the bots
// Shield Throw for a hero bot (herobot.js) or a lord (lordkit.js): b.foes / b.dist, b.clearShot. A rival hero within reach with a clear
// line (better, one that is hurt), or a knot of foes it can bounce through; never a lone soldier, and not with foes at his shield (he
// would face them without it). Returns the foe to throw at, or null.
export function knightTossPick(b, p, need, hi = 45) {
  const foes = b.foes, dist = b.dist, step = Math.max(1, Math.ceil(foes.length / 40));
  if (p.shieldOut) return null;
  const close = b.n.c3;
  let best = null, bs = 0;
  for (let i = 0; i < foes.length; i += step) {
    const o = foes[i], d = dist[i];
    if (o.isSiege || o.isStructure || d < 5 || d > hi || Math.abs(o.pos.y - p.pos.y) > 6) continue;
    const hero = isHero(o);
    if (close && !hero) continue;
    let s = 0;
    for (const f of foes) if (!f.isSiege && f !== o && (f.pos.x - o.pos.x) ** 2 + (f.pos.z - o.pos.z) ** 2 < T.bounce * T.bounce) s++;
    s = Math.min(s, T.hits - 1) + 1;
    if (hero) s += 3 + (o.hp < o.maxHp * 0.35 ? 2 : 0);
    else if (s < 2 + need) continue;
    s -= d * 0.01;
    if (s > bs && b.clearShot(o)) { bs = s; best = o; }
  }
  return best;
}

// The Knight bot's guard (HeroBot.planGuard, a few times a second): blocking is how he fills his Wrath, so with foes at hand he keeps the
// shield up between his own swings, nearly all the time while he Challenges (the blows it draws are what he wants); with the bar full he
// lowers it and swings at once (the shockwave).
export function knightGuard(b, now) {
  const p = b.p;
  if (p.classId !== 'knight' || p.shieldOut) return;
  if ((p.wrath || 0) >= 1) {
    if (b.n.c5 >= 1) { b.guardUntil = Math.min(b.guardUntil, now); b.gapUntil = Math.min(b.gapUntil, now); }
    return;
  }
  if (p.atk || b.n.c3 === 0) return;
  const dare = p.chalUntil > p.game.time;
  const chance = dare ? 0.6 + 0.35 * b.skill : b.n.c3 >= 2 ? 0.25 + 0.3 * b.skill : 0;
  if (Math.random() < chance) {
    if (b.guardUntil <= now) b.guardAt = now;
    b.guardUntil = Math.max(b.guardUntil, now + (dare ? 0.6 : 0.4));
  }
}

// the Banner: where the fight is thick and his side is in it (allies near to heal, foes near to slow), or he himself is hard pressed
ULT_AI.realmbanner = (b, p) => {
  const n = b.n, R = B.radius;
  let allies = 0, hurt = 0;
  for (const f of b.friends) {
    if (f === p || f.isSiege || (f.pos.x - p.pos.x) ** 2 + (f.pos.z - p.pos.z) ** 2 > R * R) continue;
    allies += isHero(f) ? 3 : 1;
    if (f.hp < f.maxHp * 0.7) hurt += isHero(f) ? 2 : 1;
  }
  if (b.hpf < 0.45 && n.c8 >= 2) return {};
  if (n.c8 >= 3 && (allies >= 3 || hurt >= 2)) return {};
  if (n.heroes8 >= 1 && allies >= 2) return {};
  if (n.c8 >= 6) return {};
  return null;
};

// ------------------------------------------------------------------------------------------------------------------ sounds
SOUNDS.wrathfull = (a, k) => {   // a bright ring off the steel
  a.tone(1480, 0.6, 0.09 * k, 'sine', 1);
  a.tone(2220, 0.5, 0.06 * k, 'sine', 1, 0.03);
  a.tone(740, 0.4, 0.08 * k, 'triangle', 1);
  a.noise(0.25, 5200, 1.5, 0.06 * k, 'highpass', 0.02);
};
SOUNDS.wrathwave = (a, k) => {   // a deep blow and a rush of air going out
  a.tone(60, 0.7, 0.5 * k, 'sine', 0.45);
  a.tone(130, 0.3, 0.3 * k, 'triangle', 0.5, 0.01);
  a.noise(0.6, 700, 0.6, 0.5 * k, 'lowpass');
  a.noise(0.3, 2400, 1.2, 0.2 * k, 'bandpass', 0.04);
  a.tone(1100, 0.3, 0.07 * k, 'square', 0.6);
};
SOUNDS.shieldthrow = (a, k) => {   // a grunt and a whirr
  a.tone(120, 0.18, 0.2 * k, 'sawtooth', 0.6);
  a.noise(0.45, 1400, 3, 0.22 * k, 'bandpass');
};
SOUNDS.shieldhit = (a, k) => {   // steel on a man: a clang and a thud
  a.tone(900 + Math.random() * 300, 0.3, 0.16 * k, 'square', 0.6);
  a.noise(0.1, 2800, 2, 0.25 * k, 'highpass');
  a.tone(95, 0.2, 0.3 * k, 'triangle', 0.5);
};
SOUNDS.shieldcatch = (a, k) => {   // the strap slapping into the hand
  a.noise(0.08, 1200, 1.2, 0.3 * k, 'bandpass');
  a.tone(300, 0.12, 0.12 * k, 'triangle', 0.6);
};
SOUNDS.challenge = (a, k) => {   // a shout and the sword beaten on the shield, twice
  a.tone(180, 0.5, 0.22 * k, 'sawtooth', 0.8);
  a.tone(240, 0.4, 0.12 * k, 'sawtooth', 0.85, 0.05);
  a.tone(1300, 0.2, 0.14 * k, 'square', 0.6, 0.12);
  a.noise(0.06, 3200, 2, 0.25 * k, 'highpass', 0.12);
  a.tone(1250, 0.22, 0.14 * k, 'square', 0.6, 0.3);
  a.noise(0.06, 3200, 2, 0.25 * k, 'highpass', 0.3);
};
SOUNDS.realmbanner = (a, k) => {   // a horn call over a low drum
  a.tone(196, 1.2, 0.16 * k, 'sawtooth', 1);
  a.tone(294, 1.0, 0.1 * k, 'sawtooth', 1, 0.25);
  a.tone(392, 0.9, 0.08 * k, 'triangle', 1, 0.5);
  a.tone(55, 0.6, 0.4 * k, 'sine', 0.5);
  a.noise(0.4, 300, 0.8, 0.3 * k, 'lowpass');
};
