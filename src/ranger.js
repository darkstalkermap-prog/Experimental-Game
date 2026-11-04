// The Ranger's two abilities, and what they look like (the passive, Piercing Shots, is the bow's own: Player.shoot and projectiles.js;
// the Ultimate, Rain of Fire, is in ultimate.js; the Sniper Shot, a talent, is the scope in player.js).
//
//   Q  Explosive Arrow: a short held draw (Player.tickPower) looses a glowing arrow that bursts where it strikes (a body, an engine, a
//      wall or the ground): a blast that hurts, staggers and throws back everyone round it, and the ground there burns for a while
//      (ultimate.js burnGround / burnLook, the Meteor's fire).
//   R  Hunting Hawk: hold R for a circle (as a volley is aimed), let go and a hawk flies there. Every foe in the circle when it arrives is
//      marked for HAWK.mark s: his kin see a marker over him through walls, and everyone's blows hurt him HAWK.amp more (Game.damage:
//      markUntil, markK). Then it swoops on the nearest rival hero there: talons (damage) and a brief slow.
//
// The methods are mixed into Abilities (classes.js), like the Ultimates': they run where the battle is (single player, the host) and
// call this.emit for the looks, which RANGER_SHOW plays on every screen. The hawks and the markers are pooled, made with the world.
import * as THREE from 'three';
import { allied } from './teams.js';
import { talentFx } from './talents.js';
import { SOUNDS } from './audio.js';
import { burnGround, burnLook } from './ultimate.js';
import { quietly } from './modelkit.js';

// Explosive Arrow. Drawn for `draw` s, it flies at `speed` m/s with `grav` of an arrow's fall. A body it strikes takes the arrow
// (`hit` of her bow's damage, headshots and all); then the blast: `dmg` of her bow's damage to every foe within `radius` m (`edge` of
// it at the rim; walls shelter), soldiers staggered up to `stagger` s and thrown back `knock` m/s, heroes staggered `hero` s; engines
// take `siege` of the blast and a gate `gate` of it. The ground burns for `burn` s in `burnR` m, `burnDps` of her bow's damage a second.
// It has to fly `arm` m before it will burst (the fuse catches in the air): loosed into a foe at arm's length it is only an arrow, so a
// Ranger caught in a brawl cannot blast her way out of it.
export const XARROW = { draw: 0.4, speed: 60, grav: 0.55, arm: 7, hit: 1, dmg: 2.1, radius: 3.8, edge: 0.4, stagger: 0.8, hero: 0.35, knock: 7, siege: 1.6, gate: 1.2, burn: 4, burnR: 3.4, burnDps: 0.4 };

// Hunting Hawk. Sent up to `range` m, it flies at `speed` m/s (at least `minT` s) and marks every foe within `radius` m of the spot for
// `mark` s (blows on him deal `amp` more). After circling `circle` s it dives (`dive` s) on the nearest rival hero within `swoopR` m of
// the spot: `dmg` of her bow's damage, slowed to `slowK` of his speed for `slow` s (a soldier or a lord walks at half pace), and marked.
export const HAWK = { range: 75, speed: 32, minT: 0.6, radius: 9, mark: 6, amp: 0.25, circle: 0.55, dive: 0.45, swoopR: 15, dmg: 1.3, slow: 2.5, slowK: 0.6 };

const ZERO = new THREE.Vector3();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();
const flat = (d) => { const l = Math.hypot(d.x, d.z) || 1; return new THREE.Vector3(d.x / l, 0, d.z / l); };
const isHero = (o) => o.isPlayer || !!o.kit;
const MAX_MARKS = 32;   // markers shown at once (the oldest give way)
const MARK_EMIT = 20;   // foes a hawk's mark names to the guests (the rest of a crowd is marked all the same where the battle is run)

// ------------------------------------------------------------------------------------------------------------------ the methods
export const RANGER_METHODS = {
  // the pooled looks: three hawks and the markers (made once with the world)
  rangerInit() {
    this.hawks = [];
    this.marks = [];
    const g = this.g;
    if (!g.scene) return;
    quietly(() => {
      for (let i = 0; i < 3; i++) this.hawks.push(makeHawk(g.scene));
      this.markView = makeMarkers(g.scene);
    });
  },

  // ---------------------------------------------------------------- Explosive Arrow
  // The draw has been held (Player.tickPower, a bot's or a lord's own); this looses the arrow. It bursts where it strikes (xboom).
  xarrow(p, cam, dir) {
    const X = XARROW;
    const from = cam.clone().addScaledVector(dir, 0.6);
    from.y -= 0.08;
    const boom = p.bowDmg * X.dmg;
    this.g.projectiles.fireArrow(from, dir.clone().multiplyScalar(X.speed), p.team, p.bowDmg * X.hit, p, false, 'Explosive Arrow', { boom, grav: X.grav });
    p.swingT = 0.6; p.attackDir = 'over';   // (the loose on the body the others see)
    this.emit('xarrow', from, dir);
  },

  // the arrow e (projectiles.js) has struck at `at`: the blast, and the fire on the ground under it (if it has flown far enough to burst)
  xboom(e, at) {
    const g = this.g, X = XARROW, o = e.owner, team = e.team;
    if (e.from && e.from.distanceToSquared(at) < X.arm * X.arm) { this.emit('xdud', at, ZERO); return; }
    const R = X.radius * talentFx(o, 'xRadius', 1), c = at.clone();
    this.eachFoe(team, c.x, c.z, R, (u, d) => {
      if (u.isSiege) { g.damage(u, e.boom * X.siege, o, { ability: 'Explosive Arrow' }); return; }
      const ch = u.chest ? u.chest(V1) : V1.copy(u.pos);
      if (!g.physics.lineClear(c.x, c.y + 0.3, c.z, ch.x, ch.y, ch.z, team)) return;   // (a wall between: sheltered)
      const k = 1 - (1 - X.edge) * Math.min(1, d / R);
      g.damage(u, e.boom * k, o, { splash: true, ability: 'Explosive Arrow' });
      if (!u.alive) return;
      if (u.stagger) u.stagger(isHero(u) ? X.hero : X.stagger * k, { pos: c });
      if (u.vel && !u.isPlayer && !u.isGiant) {
        const l = d || 1;
        u.vel.x += ((u.pos.x - c.x) / l) * X.knock * k; u.vel.z += ((u.pos.z - c.z) / l) * X.knock * k;
      }
    }, c.y, 3);
    for (const castle of g.castles || []) {   // (a gate takes the blast as it would a fireball's; stone shrugs it off)
      const gate = castle && castle.gate;
      if (!gate || !gate.alive || allied(castle.team, team) || !gate.takeDamage) continue;
      const b = gate.collider;
      const d = b ? Math.hypot(Math.max(b.minX - c.x, 0, c.x - b.maxX), Math.max(b.minZ - c.z, 0, c.z - b.maxZ)) : Infinity;
      if (d < R * 0.6 && Math.abs(c.y - gate.pos.y) < 8) g.damage(gate, e.boom * X.gate, o, { ability: 'Explosive Arrow' });
    }
    // the fire on the ground under the blast (not on a wall top or a tower: only where it struck within a man's height of the ground)
    const gy = g.physics.groundHeight(c.x, c.z, c.y + 0.5);
    const burns = c.y - gy < 2.2;
    if (burns) {
      c.y = gy;
      burnGround(this, { c, team, p: o, r: X.burnR * talentFx(o, 'xRadius', 1), dps: (o ? o.bowDmg : 40) * X.burnDps * talentFx(o, 'xBurnDps', 1), time: X.burn + talentFx(o, 'xBurn', 0), ability: 'Explosive Arrow', siege: 1 });
    }
    this.emit('xboom', c, ZERO, null, (burns ? 1 : -1) * R / X.radius);   // (sz < 0: the blast only, no fire)
  },

  // ---------------------------------------------------------------- Hunting Hawk
  hawk(p, cam, dir, at) {
    const g = this.g, H = HAWK;
    const c = at ? at.clone() : this.aimPoint(cam, dir, H.range, p.team).pos;
    const dx = c.x - p.pos.x, dz = c.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > H.range + 6) {   // (a guest's spot is held to the reach)
      const k = (H.range + 6) / dist;
      c.x = p.pos.x + dx * k; c.z = p.pos.z + dz * k;
    }
    c.y = g.physics.groundHeight(c.x, c.z, c.y + 2);
    const radius = H.radius * talentFx(p, 'hawkRadius', 1);
    const T = hawkTime(p.pos, c);
    this.active.push({ kind: 'ult', p, team: p.team, t: 0, c, T, phase: 0, radius, victim: null, tick: hawkTick,
      mark: H.mark + talentFx(p, 'hawkMark', 0), dmg: p.bowDmg * H.dmg * talentFx(p, 'hawkDmg', 1), slow: H.slow + talentFx(p, 'hawkSlow', 0) });
    p.swingT = 0.3; p.attackDir = 'over';
    this.emit('hawk', p.pos, flat(V1.set(dx, 0, dz)), [c], radius / H.radius);
  },

  // mark foe o for `t` s (where the battle is run): the blows on him deal HAWK.amp more (Game.damage), and a hero sees it in his buffs
  markFoe(o, t) {
    const until = this.g.time + t;
    if (!(o.markUntil > until)) o.markUntil = until;
    o.markK = 1 + HAWK.amp;
    if (o.isPlayer && o.buffs) o.buffs.add('marked', t);
  },
};

// how long the hawk takes from where the Ranger stands to the spot (the same on every screen: the look flies it in that time)
function hawkTime(from, c) { return Math.max(HAWK.minT, Math.hypot(c.x - from.x, c.z - from.z) / HAWK.speed); }

// The hawk's course where the battle is run: it arrives and marks, circles a moment, then dives on the nearest rival hero.
function hawkTick(A, e) {
  const g = A.g, c = e.c, H = HAWK;
  if (e.phase === 0) {
    if (e.t < e.T) return true;
    e.phase = 1;
    const list = [];
    A.eachFoe(e.team, c.x, c.z, e.radius, (o) => {
      if (o.isSiege || o.isStructure) return;
      A.markFoe(o, e.mark);
      list.push(o);
    }, c.y, 8);
    A.hawkMarked = list;   // (the look on this screen takes the foes themselves; the guests find them by where they stand)
    A.emit('hawkmark', c, ZERO, list.slice(0, MARK_EMIT).map((o) => o.pos.clone()), e.mark / H.mark);
    A.hawkMarked = null;
    return true;
  }
  if (e.phase === 1) {
    if (e.t < e.T + H.circle) return true;
    let best = null, bd = H.swoopR;
    const near = (o) => {
      if (!o || !o.alive || !isHero(o) || allied(o.team, e.team) || o.drive || (o.buffs && o.buffs.has('ghost')) || Math.abs(o.pos.y - c.y) > 10) return;
      const d = Math.hypot(o.pos.x - c.x, o.pos.z - c.z);
      if (d < bd) { bd = d; best = o; }
    };
    for (const h of g.humans) near(h);
    for (const f of g.factions) if (f && f.hero && f.hero.kit) near(f.hero);
    if (!best) return false;   // (no hero to dive on: it wheels away)
    e.victim = best; e.phase = 2;
    A.hawkVictim = best;
    A.emit('hawkswoop', c, ZERO, [best.pos.clone()]);
    A.hawkVictim = null;
    return true;
  }
  if (e.t < e.T + H.circle + H.dive) return true;
  const v = e.victim;
  if (v.alive && Math.hypot(v.pos.x - c.x, v.pos.z - c.z) < H.swoopR + 10) {
    g.damage(v, e.dmg, e.p, { ability: 'Hunting Hawk', dir: V1.set(v.pos.x - c.x, 0, v.pos.z - c.z) });
    if (v.alive) {
      A.markFoe(v, e.mark);
      if (v.isPlayer) v.buffs.add('slowed', e.slow, H.slowK);
      else if (v.slowT !== undefined) v.slowT = Math.max(v.slowT, e.slow);
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------------------------------ the looks
// (every screen; ctx as for the Ultimates' looks: { A, g, at, dir, targets, sz, who, house, silent, snd })
export const RANGER_SHOW = {
  // the glowing arrow leaves the bow with a hiss; its flight (and the flame it trails) is drawn by Projectiles on every screen
  xarrow(ctx) {
    const { A, g, at, dir } = ctx;
    g.fx.flash(V1.copy(at).addScaledVector(dir, 0.5), A.col.set(0xffa040), 2.2, 0.16, 0.9);
    g.fx.fireTrail(V1);
    ctx.snd('xarrow');
  },

  // too close to burst: a puff of smoke and a spit of sparks
  xdud(ctx) {
    const { g, at } = ctx;
    g.fx.smoke(at);
    g.fx._sparks(at, 6);
    ctx.snd('xdud');
  },

  // the blast, and (sz > 0) the ground catching fire under it
  xboom(ctx) {
    const { A, g, at, sz } = ctx, fx = g.fx, k = Math.abs(sz), R = XARROW.radius * k;
    fx.explosion(V1.copy(at).setY(at.y + 0.5), R * 1.05);
    for (let i = 0; i < 7; i++) fx.blaze(V1.set(at.x + (Math.random() - 0.5) * 1.6, at.y + Math.random() * 2.2, at.z + (Math.random() - 0.5) * 1.6), 1.8);   // (a column of fire where it burst)
    A.gfx.glyph('shock', at.x, at.y, at.z, R * 1.3, 0xffb060, 0.5, { strength: 1.8 });
    fx._sparks(V1.copy(at).setY(at.y + 0.8), 16);
    if (g.magic) g.magic.flash(V1.copy(at).setY(at.y + 1.5), 0xff8a30, 11);
    ctx.snd('xboom');
    if (sz > 0) burnLook(A, at, XARROW.burnR * k, XARROW.burn, ctx.silent);
  },

  // the hawk leaves the Ranger's arm and flies to the spot; the circle shows where it is going
  hawk(ctx) {
    const { A, at, targets, sz } = ctx, c = targets && targets[0];
    if (!c) return;
    const R = HAWK.radius * sz, T = hawkTime(at, c);
    A.gfx.glyph('rune', c.x, c.y, c.z, R, 0xffc860, T + 0.4, { arms: 4, team: ctx.house, strength: 1.2 });
    ctx.snd('hawk');
    if (!A.hawks.length) return;   // (a world without a scene has no hawks to show)
    const h = A.hawks.find((x) => !x.on) || A.hawks.reduce((a, b) => (a.t > b.t ? a : b));   // (all three out: the oldest is called back)
    h.on = true; h.t = 0; h.T = T; h.state = 'fly'; h.victim = null; h.silent = ctx.silent; h.team = ctx.who ? ctx.who.team : -1;
    h.from.set(at.x, at.y + 1.6, at.z);
    h.c.copy(c);
    h.ang = Math.atan2(at.z - c.z, at.x - c.x);   // (it comes into its circle from the Ranger's side)
    h.to.set(c.x + Math.cos(h.ang) * HAWK_RING, c.y + HAWK_UP, c.z + Math.sin(h.ang) * HAWK_RING);
    h.mid.set((h.from.x + h.to.x) / 2, Math.max(h.from.y, h.to.y) + 4 + Math.hypot(c.x - at.x, c.z - at.z) * 0.12, (h.from.z + h.to.z) / 2);
    h.g.visible = true;
    h.g.scale.setScalar(1);
    placeHawk(h, h.from, h.mid, 0);
    if (!A.hawkStep) { A.hawkStep = true; A.ultFx.push({ step: stepHawks }); }   // (one look steps every hawk and every marker)
  },

  // the foes the hawk marked: a marker over each, for the Ranger's side (through walls), and a ring and a cry over the spot
  hawkmark(ctx) {
    const { A, g, at, targets, sz } = ctx;
    A.gfx.glyph('shock', at.x, at.y, at.z, HAWK.radius * 1.15, 0xffd070, 0.7, { strength: 1.4 });
    ctx.snd('hawkmark');
    const team = nearestHawkTeam(A, at);   // (the side that sent it: the hawk over the spot knows; ctx.who is whoever stands there)
    const until = g.time + HAWK.mark * sz;
    const list = A.hawkMarked || (targets || []).map((t) => findBody(g, t)).filter(Boolean);
    for (const o of list) addMark(A, o, team, until);
    if (!A.hawkStep) { A.hawkStep = true; A.ultFx.push({ step: stepHawks }); }
  },

  // the hawk folds its wings and drops on the hero
  hawkswoop(ctx) {
    const { A, g, at, targets } = ctx;
    const v = A.hawkVictim || (targets && targets[0] ? findBody(g, targets[0]) : null);
    let h = null, bd = 40;
    for (const x of A.hawks) if (x.on && (x.state === 'fly' || x.state === 'circle') && x.c.distanceTo(at) < bd) { bd = x.c.distanceTo(at); h = x; }
    if (!h || !v) return;
    h.state = 'dive'; h.t = 0; h.victim = v;
    h.from.copy(h.g.position);
    ctx.snd('hawkswoop');
  },
};

// the side of the hawk nearest to a spot
function nearestHawkTeam(A, at) {
  let best = null, bd = 1e9;
  for (const h of A.hawks) if (h.on && h.c.distanceTo(at) < bd) { bd = h.c.distanceTo(at); best = h; }
  return best ? best.team : -1;
}

// the body standing where p says (a guest's copy of a marked foe or of the hero the hawk dives on)
function findBody(g, p) {
  let best = null, bd = 2.25;
  const near = (o) => {
    if (!o || !o.alive) return;
    const dx = o.pos.x - p.x, dz = o.pos.z - p.z, d = dx * dx + dz * dz;
    if (d < bd && Math.abs(o.pos.y - p.y) < 3) { bd = d; best = o; }
  };
  for (const h of g.humans) near(h);
  for (const u of g.units) near(u);
  return best;
}

function addMark(A, o, team, until) {
  const m = A.marks.find((x) => x.o === o);
  if (m) { m.until = Math.max(m.until, until); return; }
  if (A.marks.length >= MAX_MARKS) A.marks.shift();
  A.marks.push({ o, team, until });
}

// ------------------------------------------------------------------------------------------------------------------ the hawk
// An original bird of prey, made of a few flat-shaded pieces in the catapult stone's material kind (the same shader: no new program): a
// tapered body, a pale head with a hooked beak, broad wings that end in spread fingers of feathers, a fanned rust-red tail. 2.2 m across
// the wings: a little bigger than life, so it can be followed across a battlefield.
const HAWK_RING = 5, HAWK_UP = 8;   // (the circle it wheels on over the spot: radius and height)

function twoSided(geo) {   // (both faces, so a plain front-sided material shows the wing from below too: no double-sided shader)
  const idx = geo.index ? Array.from(geo.index.array) : [...Array(geo.attributes.position.count).keys()];
  const back = [];
  for (let i = 0; i < idx.length; i += 3) back.push(idx[i], idx[i + 2], idx[i + 1]);
  geo.setIndex(idx.concat(back));
  return geo;
}

function wingGeometry() {
  // the right wing, root at x = 0, in the plane y = 0, the leading edge toward +z (forward): broad at the arm, five fingers at the tip
  const s = new THREE.Shape();
  s.moveTo(0, 0.16);
  s.lineTo(0.45, 0.2);
  s.lineTo(0.8, 0.12);
  s.lineTo(1.08, 0.02);
  const fingers = [[1.12, -0.06], [0.98, -0.1], [1.04, -0.16], [0.9, -0.16], [0.95, -0.24], [0.8, -0.2], [0.82, -0.3], [0.68, -0.24]];
  for (const [x, y] of fingers) s.lineTo(x, y);
  s.lineTo(0.45, -0.24);
  s.lineTo(0.2, -0.2);
  s.lineTo(0, -0.16);
  s.lineTo(0, 0.16);
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(Math.PI / 2);   // (the shape's y becomes -z: flip it so the leading edge points forward)
  geo.scale(1, 1, -1);
  // a gentle droop toward the tip, and the arm thicker than the hand (a little height to catch the light)
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setY(i, -0.08 * x * x); }
  geo.computeVertexNormals();
  return twoSided(geo);
}

function tailGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.05, 0);
  s.lineTo(0.05, 0);
  s.lineTo(0.17, -0.3);
  s.quadraticCurveTo(0, -0.38, -0.17, -0.3);
  s.lineTo(-0.05, 0);
  const geo = new THREE.ShapeGeometry(s);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 1, -1);
  return twoSided(geo);
}

function bodyGeometry() {
  // a lathe along the length (made about y, laid along z): the tail end, the full breast, the neck
  const pts = [[0, -0.42], [0.05, -0.36], [0.1, -0.2], [0.125, -0.02], [0.11, 0.14], [0.07, 0.24], [0, 0.28]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 7);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 0.8, -1);   // (a little flatter than round; the neck toward +z)
  return geo;
}

let hawkParts = null;
function makeHawk(scene) {
  if (!hawkParts) {
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true });
    hawkParts = {
      body: bodyGeometry(), wing: wingGeometry(), tail: tailGeometry(),
      head: new THREE.IcosahedronGeometry(0.085, 0), beak: new THREE.ConeGeometry(0.028, 0.09, 4).rotateX(Math.PI / 2 + 0.5),
      brown: mat(0x6e4a2c), dark: mat(0x4a3220), cream: mat(0xd8c49c), rust: mat(0xa4532c), horn: mat(0xd6b048),
    };
  }
  const P = hawkParts, g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; g.add(o); return o; };
  add(P.body, P.brown, 0, 0, 0);
  add(P.head, P.cream, 0, 0.05, 0.3);
  add(P.beak, P.horn, 0, 0.03, 0.39);
  add(P.tail, P.rust, 0, 0.01, -0.36);
  const wr = add(P.wing, P.dark, 0.06, 0.04, 0.04);
  const wl = add(P.wing, P.dark, -0.06, 0.04, 0.04);
  wl.scale.x = -1;
  g.scale.setScalar(1);
  g.visible = false;   // (hidden while idle: no draw call)
  scene.add(g);
  return { g, wl, wr, on: false, t: 0, T: 1, state: 'off', from: new THREE.Vector3(), mid: new THREE.Vector3(), to: new THREE.Vector3(), c: new THREE.Vector3(), ang: 0, victim: null, team: -1, flap: 0, silent: false };
}

// along the quadratic curve a -> m -> b at s (0..1), facing the way it goes
function placeHawk(h, a, m, s, b = h.to) {
  const u = 1 - s;
  const x = u * u * a.x + 2 * u * s * m.x + s * s * b.x, y = u * u * a.y + 2 * u * s * m.y + s * s * b.y, z = u * u * a.z + 2 * u * s * m.z + s * s * b.z;
  // (the way it is heading: the curve's tangent)
  const tx = 2 * u * (m.x - a.x) + 2 * s * (b.x - m.x), ty = 2 * u * (m.y - a.y) + 2 * s * (b.y - m.y), tz = 2 * u * (m.z - a.z) + 2 * s * (b.z - m.z);
  h.g.position.set(x, y, z);
  h.g.lookAt(x + tx, y + ty, z + tz);
}

// every hawk out and every marker, each frame (with the looks' own dice: Abilities.updateFx steps this under quietly)
function stepHawks(A, e, dt) {
  const g = A.g;
  let busy = false;
  for (const h of A.hawks) if (h.on) { busy = true; stepHawk(A, h, dt); }
  stepMarkers(A);
  if (!busy && !A.marks.length) { A.hawkStep = false; return false; }
  return true;
}

function stepHawk(A, h, dt) {
  const g = A.g, fx = g.fx;
  h.t += dt;
  let beat = 1;   // (how hard the wings work: 1 flying, low when it glides or dives)
  if (h.state === 'fly') {
    const s = Math.min(1, h.t / h.T);
    placeHawk(h, h.from, h.mid, s * (1.4 - 0.4 * s));   // (it sets off fast and slows into the circle)
    if (s >= 1) { h.state = 'circle'; h.t = 0; }
  } else if (h.state === 'circle') {
    beat = 0.25;
    h.ang += dt * 1.5;
    const x = h.c.x + Math.cos(h.ang) * HAWK_RING, z = h.c.z + Math.sin(h.ang) * HAWK_RING, y = h.c.y + HAWK_UP + Math.sin(h.t * 2) * 0.4;
    h.g.position.set(x, y, z);
    h.g.lookAt(x - Math.sin(h.ang), y, z + Math.cos(h.ang));
    h.g.rotateZ(-0.45);   // (banked into the turn)
    if (h.t > HAWK.circle + 2.4) { h.state = 'leave'; h.t = 0; h.from.copy(h.g.position); }   // (nothing to dive on: it wheels away)
  } else if (h.state === 'dive') {
    beat = 0.05;
    const v = h.victim, s = Math.min(1, h.t / HAWK.dive);
    if (v && v.alive !== false) V3.set(v.pos.x, v.pos.y + (v.height || 1.8) * 0.75, v.pos.z); else V3.copy(h.c);
    V2.set((h.from.x + V3.x) / 2, Math.max(h.from.y, V3.y) + 1.5, (h.from.z + V3.z) / 2);
    placeHawk(h, h.from, V2, s * s, V3);
    if (s >= 1) {   // talons: a puff of feathers and a spray, and away
      fx.ring(V3, 0.5, A.col.set(0xe8d8b8), 12, { up: 1.2, size: 0.22, speed: 3, life: 0.7 });
      fx._sparks(V3, 6);
      if (!h.silent) g.audio.play('hawkstrike', V3);
      h.state = 'leave'; h.t = 0; h.from.copy(h.g.position);
    }
  } else if (h.state === 'leave') {
    // up and off along the way it was going, growing small as it goes, gone after two seconds
    const s = Math.min(1, h.t / 2);
    const d = h.g.getWorldDirection(V1);
    V2.set(h.from.x + d.x * 30 * s, h.from.y + 18 * s * s + 2 * s, h.from.z + d.z * 30 * s);
    h.g.position.copy(V2);
    h.g.lookAt(V2.x + d.x, V2.y + 0.4, V2.z + d.z);
    h.g.scale.setScalar(1 - 0.6 * s);
    if (s >= 1) { h.on = false; h.state = 'off'; h.g.visible = false; return; }
  }
  // the wings: a beat (fast when it flies, slow and shallow when it glides), never quite in time with another hawk
  h.flap += dt * (5 + 6 * beat);
  const a = 0.15 + beat * 0.55 * Math.sin(h.flap) + (h.state === 'dive' ? -0.6 : 0);
  h.wr.rotation.z = -a; h.wl.rotation.z = a;
}

// ------------------------------------------------------------------------------------------------------------------ the markers
// One small flat point sprite over each marked foe, for the Ranger's side only: always on top (no depth test), so it shows through walls
// and trees; a fixed size on screen. One draw call for all of them.
function makeMarkers(scene) {
  const pos = new Float32Array(MAX_MARKS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: 22, sizeAttenuation: false, map: markTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false });
  mat.name = 'hawkMark';
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 20;
  scene.add(pts);   // (shown at first, empty, so the world's warm-up compiles its shader; hidden once the battle runs)
  return { pts, geo, pos, n: -1 };
}

// the marker: a downward point in hawk-gold (where he stands) under a pair of talon strokes, dark-edged to read on sky and stone
function markTexture() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.lineJoin = 'round'; c.lineCap = 'round';
  const shape = () => {
    c.beginPath();
    c.moveTo(14, 26); c.lineTo(32, 56); c.lineTo(50, 26); c.lineTo(32, 36); c.closePath();
  };
  const talons = () => {
    c.beginPath();
    c.moveTo(20, 8); c.quadraticCurveTo(26, 14, 26, 22);
    c.moveTo(44, 8); c.quadraticCurveTo(38, 14, 38, 22);
  };
  c.strokeStyle = 'rgba(20,10,0,0.9)'; c.lineWidth = 9; shape(); c.stroke(); talons(); c.stroke();
  c.fillStyle = '#ffc640'; shape(); c.fill();
  c.strokeStyle = '#ffd870'; c.lineWidth = 4; talons(); c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stepMarkers(A) {
  const g = A.g, mv = A.markView;
  if (!mv) return;
  const me = g.player, now = g.time;
  let n = 0;
  for (let i = A.marks.length - 1; i >= 0; i--) {
    const m = A.marks[i], o = m.o;
    if (now > m.until || !o || o.alive === false) { A.marks.splice(i, 1); continue; }
    if (!me || !allied(me.team, m.team) || n >= MAX_MARKS) continue;   // (the Ranger's side sees them)
    mv.pos[n * 3] = o.pos.x; mv.pos[n * 3 + 1] = o.pos.y + (o.height || 1.8) + 0.55; mv.pos[n * 3 + 2] = o.pos.z;
    n++;
  }
  if (n || mv.n) { mv.geo.attributes.position.needsUpdate = true; mv.geo.setDrawRange(0, n); }
  mv.n = n;
  mv.pts.visible = n > 0;
}

// (Abilities.updateFx: the markers go out of sight once the world runs, until a hawk marks someone)
export function rangerFx(A) {
  if (A.markView && A.markView.n < 0) { A.markView.n = 0; A.markView.pts.visible = false; }
}

// ------------------------------------------------------------------------------------------------------------------ sounds
// Explosive Arrow: the string, and a hiss of fire as it goes; its burst a sharp crack over a deep thump
SOUNDS.xarrow = (a, k) => {
  a.tone(150, 0.28, 0.28 * k, 'triangle', 0.5);
  a.noise(0.45, 2600, 0.8, 0.2 * k, 'bandpass');
  a.noise(0.3, 6000, 1, 0.08 * k, 'highpass', 0.04);
};
SOUNDS.xdud = (a, k) => { a.noise(0.25, 2400, 1, 0.12 * k, 'bandpass'); a.noise(0.4, 600, 0.6, 0.08 * k, 'lowpass', 0.03); };
SOUNDS.xboom = (a, k) => {
  a.noise(0.08, 3200, 1.5, 0.45 * k, 'bandpass');
  a.tone(62, 0.7, 0.6 * k, 'sine', 0.45, 0.01);
  a.noise(0.9, 380, 0.6, 0.65 * k, 'lowpass', 0.01);
  a.noise(0.25, 1600, 0.9, 0.2 * k, 'bandpass', 0.05);
};
// Hunting Hawk: a thin, falling cry as it goes; a sharper one as it marks; a scream and a rush of air as it dives; the strike
SOUNDS.hawk = (a, k) => {
  a.tone(2900, 0.5, 0.07 * k, 'sawtooth', 0.62);
  a.tone(3300, 0.45, 0.04 * k, 'sine', 0.6, 0.03);
  a.noise(0.3, 900, 0.8, 0.12 * k, 'bandpass');
};
SOUNDS.hawkmark = (a, k) => {
  a.tone(2600, 0.3, 0.08 * k, 'sawtooth', 0.7);
  a.tone(3100, 0.35, 0.06 * k, 'sawtooth', 0.66, 0.12);
};
SOUNDS.hawkswoop = (a, k) => {
  a.tone(3400, 0.55, 0.08 * k, 'sawtooth', 0.5);
  a.noise(0.5, 1300, 0.7, 0.25 * k, 'bandpass', 0.05);
};
SOUNDS.hawkstrike = (a, k) => {
  a.noise(0.12, 2400, 1.4, 0.3 * k, 'bandpass');
  a.tone(300, 0.12, 0.15 * k, 'square', 0.6);
};

// ------------------------------------------------------------------------------------------------------------------ for the bots
// The yaw and pitch that loft an Explosive Arrow from eye e onto point t (a body's chest, or the ground at a knot's feet), leading a
// target moving at tv (or null): its own speed and fall (XARROW). Writes { yaw, pitch } into out; null when it is out of reach.
export function xarrowAim(e, t, tv, out) {
  const X = XARROW, g = 9.8 * X.grav;
  let tx = t.x, tz = t.z, ok = false;
  for (let i = 0; i < 3; i++) {
    const dx = tx - e.x, dz = tz - e.z, dy = t.y - e.y, D = Math.hypot(dx, dz) || 1e-6, v2 = X.speed * X.speed;
    const disc = v2 * v2 - g * (g * D * D + 2 * dy * v2);
    if (disc < 0) { ok = false; break; }
    out.pitch = Math.atan((v2 - Math.sqrt(disc)) / (g * D));
    const T = D / (X.speed * Math.cos(out.pitch));
    ok = true;
    tx = t.x + (tv ? tv.x * T : 0); tz = t.z + (tv ? tv.z * T : 0);
  }
  out.yaw = Math.atan2(tx - e.x, tz - e.z);
  return ok ? out : null;
}

// The best mark for the Explosive Arrow among a bot's foes (foes, dist: as HeroBot and LordKit keep them): a rival hero (worth four, and
// more with men round him), an engine (three), or the soldier with the most others round him, at least `need`; 8.5..60 m off with a clear
// line (clear(o)). Not at hand: it would not burst. Returns { o, ground } (ground: aim at his feet, so the blast takes the knot) or null.
export function xarrowMark(foes, dist, need, clear) {
  const R = XARROW.radius;
  let best = null, bs = 0;
  const step = Math.max(1, Math.ceil(foes.length / 40));
  for (let i = 0; i < foes.length; i += step) {
    const o = foes[i], d = dist[i];
    if (d < XARROW.arm + 1.5 || d > 60) continue;   // (too close and it will not burst)
    let s = isHero(o) ? 4 : o.isSiege ? 3 : 0;
    for (const f of foes) if (f !== o && !f.isSiege && Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < R) s += isHero(f) ? 2 : 1;
    if (!isHero(o) && !o.isSiege) s += 1;
    if (s > bs && s >= need && clear(o)) { bs = s; best = o; }
  }
  return best ? { o: best, ground: !isHero(best) } : null;
}

// The best spot for the hawk: a rival hero above all (6..72 m off: the dive is for him), else the densest knot of at least `need` foes
// 15..72 m off from me (it flies over walls: no clear line needed). A little lead on where they are going. Returns the spot (out) or null.
export function hawkSpot(g, me, foes, dist, need, out) {
  const H = HAWK;
  let best = null, bs = 0;
  const step = Math.max(1, Math.ceil(foes.length / 40));
  for (let i = 0; i < foes.length; i += step) {
    const o = foes[i], d = dist[i];
    if (o.isSiege || d > H.range - 3) continue;
    const hero = isHero(o);
    if (d < (hero ? 6 : 15)) continue;
    let s = hero ? 6 : 0;
    for (const f of foes) if (!f.isSiege && Math.hypot(f.pos.x - o.pos.x, f.pos.z - o.pos.z) < H.radius * 0.85) s += isHero(f) && f !== o ? 3 : 1;
    if (s > bs && (hero || s >= need)) { bs = s; best = o; }
  }
  if (!best) return null;
  const T = hawkTime(me, best.pos) + H.circle, v = best.vel;
  const x = best.pos.x + (v ? v.x * T * 0.5 : 0), z = best.pos.z + (v ? v.z * T * 0.5 : 0);
  return out.set(x, g.physics.groundHeight(x, z, best.pos.y + 3), z);
}
