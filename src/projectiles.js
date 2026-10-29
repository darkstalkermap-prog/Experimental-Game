// Arrows and catapult boulders with ballistic flight, hit detection and sticking, and the fireballs of the Mage.
// Looks: every arrow in flight is one instance of one mesh (shaft, head, nock and three vanes) with a faint streak that the particle
// shader moves along its flight; arrows that land stay in a second instanced mesh for a while and then shrink away; a boulder
// leaves a trail of smoke and a crater; a fireball is a few glow sprites on a straight track plus a trail of flame and embers.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { allied } from './teams.js';
import { TEAM_COLORS } from './config.js';
import { F, R } from './fxtex.js';

export const ARROW_SPEED = 52;
export const G_ARROW = 9.8;
const G_ROCK = 9.8;
const MAX_STUCK = 240;
const MAX_FLY = 320;
const STUCK_LIFE = 34;     // seconds an arrow stays where it landed
const STUCK_FADE = 2;      // ...and the last of them it shrinks away

const WOOD_KINDS = new Set(['gate', 'tree', 'post']);
const _c = new THREE.Color();

function coloured(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  if (g.attributes.normal === undefined) g.computeVertexNormals();
  return g;
}

// an arrow along +z, 0.85 m long, centred on its middle: shaft, steel head, nock and three vanes (one of them red)
function buildArrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.0105, 0.0125, 0.72, 6);
  shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.04);
  const head = new THREE.ConeGeometry(0.024, 0.13, 6);
  head.rotateX(Math.PI / 2); head.translate(0, 0, 0.385);
  const nock = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6);
  nock.rotateX(Math.PI / 2); nock.translate(0, 0, -0.41);
  const parts = [coloured(shaft, 0x9a7648), coloured(head, 0xb9bdc4), coloured(nock, 0xd8cfb8)];
  for (let k = 0; k < 3; k++) {
    // a vane: a quad in a plane through the axis, taller at the back, drawn from both sides
    const a = (k / 3) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const v = (r, z) => [ca * r, sa * r, z];
    const pts = [v(0.008, -0.4), v(0.05, -0.4), v(0.03, -0.27), v(0.008, -0.27)];
    const pos = [];
    const tri = (i, j, l) => { pos.push(...pts[i], ...pts[j], ...pts[l]); };
    tri(0, 1, 2); tri(0, 2, 3); tri(0, 2, 1); tri(0, 3, 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(coloured(g, k === 0 ? 0xb83a2a : 0xefe8d8));
  }
  return mergeGeometries(parts);
}

// a boulder: a rough lump of rock, not a regular solid
function buildRockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.66, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 8.3 - y * 5.1) * 0.5 + Math.sin(z * 15 + x * 6) * 0.25;
    const k = 1 + n * 0.22;
    p.setXYZ(i, x * k, y * k * 0.92, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.vis = [];       // arrows that are only for show (the climbing half of a volley)
    this.stuck = [];
    this.arrowGeo = buildArrowGeometry();
    this.arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    // every arrow in flight is drawn as an instance of this one mesh
    this.flyMesh = new THREE.InstancedMesh(this.arrowGeo, this.arrowMat, MAX_FLY);
    this.flyMesh.count = 0;
    this.flyMesh.frustumCulled = false;
    this.flyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flyMesh.name = 'arrows-flying';
    game.scene.add(this.flyMesh);
    // every arrow that has landed lives in one instanced mesh (a ring buffer)
    this.stuckMesh = new THREE.InstancedMesh(this.arrowGeo, this.arrowMat, MAX_STUCK);
    this.stuckMesh.count = 0;
    this.stuckMesh.frustumCulled = false;
    this.stuckMesh.name = 'arrows-stuck';
    this.stuckNext = 0;
    this.stuckData = new Float32Array(MAX_STUCK * 9);   // x y z, quaternion xyzw, scale, born
    this.stuckSweep = 0;
    game.scene.add(this.stuckMesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.one = new THREE.Vector3(1, 1, 1);
    this.sc = new THREE.Vector3(1, 1, 1);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
    this.rockGeo = buildRockGeometry();
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1, flatShading: true });
    // (the fireball has no mesh any more: kept so the warm-up that compiles these materials still finds them)
    this.fireGeo = new THREE.SphereGeometry(0.1, 6, 4);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffb050, fog: false });
  }

  // Straight-line fireball (no gravity) that bursts on the first thing it meets.
  fireSpell(kind, from, vel, team, dmg, owner, radius = 0) {
    const fx = this.game.fx, s = 0.8 + radius / 6;
    const e = { kind: 'fireball', spell: true, pos: from.clone(), vel: vel.clone(), team, dmg, owner, mesh: null, life: 3, radius,
      hitSet: new Set(), glow: null };
    // the glow, the white-hot heart and the flame streaming behind: all fly the straight track on their own
    const G = fx.add, t = 3.2;
    const o1 = G.spawn(F.SOFT, R.FLASH, from.x, from.y, from.z, vel.x, vel.y, vel.z, t, 1.5 * s, 1.5 * s);
    G.tint(o1, 1.6, 0.8, 0.3, 0.55);
    const o2 = G.spawn(F.DISC, R.FLASH, from.x, from.y, from.z, vel.x, vel.y, vel.z, t, 0.55 * s, 0.55 * s);
    G.tint(o2, 2.4, 1.9, 1.2, 1);
    const o3 = G.spawn(F.STREAK, R.FIRE, from.x, from.y, from.z, vel.x, vel.y, vel.z, t, 0.8 * s, 0.8 * s);
    G.streak(o3, 0.06);
    G.tint(o3, 1.8, 1.4, 1.0, 0.9);
    e.glow = [o1, G.born(o1), o2, G.born(o2), o3, G.born(o3)];
    this.list.push(e);
  }

  // kept for callers that want a plain arrow mesh of their own
  makeArrowMesh() {
    const m = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    this.game.scene.add(m);
    return m;
  }

  // Aim at a moving target with lead and gravity compensation.
  shootArrow(from, target, team, dmg, owner, spread = 0.03) {
    const aim = target.isStructure ? target.pos.clone() : target.aimPoint ? target.aimPoint(new THREE.Vector3()) : target.chest(new THREE.Vector3());
    const tv = target.vel || new THREE.Vector3();
    let t = from.distanceTo(aim) / ARROW_SPEED;
    for (let i = 0; i < 2; i++) {
      const px = aim.x + tv.x * t, pz = aim.z + tv.z * t;
      t = Math.hypot(px - from.x, pz - from.z) / ARROW_SPEED;
    }
    t = Math.max(0.05, t);
    const px = aim.x + tv.x * t, pz = aim.z + tv.z * t;
    const v = new THREE.Vector3((px - from.x) / t, (aim.y - from.y) / t + 0.5 * G_ARROW * t, (pz - from.z) / t);
    const sp = v.length();
    v.x += gauss() * spread * sp; v.y += gauss() * spread * sp; v.z += gauss() * spread * sp;
    this.fireArrow(from, v, team, dmg, owner);
  }

  // streak colour of a team's arrows: its colour, mostly white
  tracerColor(team) {
    const hex = TEAM_COLORS[team];
    if (hex === undefined) return _c.set(0xffffff);
    return _c.set(hex).lerp(this.white || (this.white = new THREE.Color(1, 1, 1)), 0.6);
  }

  // big: a volley arrow, drawn chunkier so a falling flight of them can be seen, and it kicks up a puff where it lands
  fireArrow(from, vel, team, dmg, owner, big = false) {
    const e = { kind: 'arrow', pos: from.clone(), vel: vel.clone(), team, dmg, owner, mesh: null, life: 6, big, tr: -1, trb: 0 };
    const fx = this.game.fx;
    fx.tracer(from, vel, 6, this.tracerColor(team), big ? 0.4 : 0.36, big ? 0.12 : 0.07, big ? 0.1 : 0.075);
    e.tr = fx._to; e.trb = fx._tb;
    this.list.push(e);
  }

  // a climbing arrow that is only for show (the volley's first half): flies on its own and is gone after `life` seconds
  showArrow(from, vel, life, team = -1) {
    if (this.vis.length >= 120) return;
    const fx = this.game.fx;
    fx.tracer(from, vel, life, this.tracerColor(team), 0.3, 0.08, 0.1);
    this.vis.push({ pos: from.clone(), vel: vel.clone(), t: life });
  }

  // Boulder that lands on `to` after `time` seconds.
  throwBoulder(from, to, team, dmg, owner, time = 3.2) {
    const v = new THREE.Vector3(
      (to.x - from.x) / time,
      (to.y - from.y + 0.5 * G_ROCK * time * time) / time,
      (to.z - from.z) / time,
    );
    const mesh = new THREE.Mesh(this.rockGeo, this.rockMat);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    this.list.push({ kind: 'rock', pos: from.clone(), vel: v, team, dmg, owner, mesh, life: 10, trail: 0 });
  }

  update(dt) {
    const g = this.game;
    const phys = g.physics;
    const next = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      const grav = p.spell ? 0 : p.kind === 'arrow' ? G_ARROW : G_ROCK;
      // short enough steps that a fast arrow can never jump over a 0.5 m merlon, even on a slow frame
      const steps = Math.min(12, Math.max(p.kind === 'arrow' || p.spell ? 3 : 2, Math.ceil(p.vel.length() * dt / 0.25)));
      const h = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= grav * h;
        next.copy(p.pos).addScaledVector(p.vel, h);
        // magic flies straight and stops at whatever it meets first
        if (p.spell) {
          const col = phys.pointHit(next.x, next.y, next.z, p.team);
          const hit = !col && (this.hitCharacter(next, p.team, 0.35, p.hitSet) || g.siegeAt(next, p.team));
          const ground = !hit && !col && next.y <= phys.terrainHeight(next.x, next.z);
          if (hit || col || ground) {
            this.explode(p, hit ? next : p.pos.clone(), col); // burst on the near side of walls
            this.kill(i, p);
            done = true;
            break;
          }
          p.pos.copy(next);
          continue;
        }
        // stone first: nobody can be hit through a wall or battlement
        if (p.kind === 'arrow') {
          const wall = phys.pointHit(next.x, next.y, next.z, p.team);
          if (wall) { this.stick(i, p, next, wall.kind); done = true; break; }
        }
        // characters
        if (p.kind === 'arrow') {
          const hit = this.hitCharacter(next, p.team, 0.15);
          if (hit) {
            g.damage(hit, p.dmg, p.owner, { ranged: true, dir: p.vel });
            g.audio.play('arrowHit', next);
            this.kill(i, p);
            done = true;
            break;
          }
          const siege = g.siegeAt(next, p.team);
          if (siege) { g.damage(siege, p.dmg * 0.3, p.owner, { ranged: true }); this.stick(i, p, next, 'wood'); done = true; break; }
        }
        // structures
        const col = phys.pointHit(next.x, next.y, next.z, p.team);
        if (col) {
          if (p.kind === 'rock') this.rockImpact(p, next, col);
          else this.stick(i, p, next, col.kind);
          if (p.kind === 'rock') this.kill(i, p);
          done = true;
          break;
        }
        // ground
        if (next.y <= phys.terrainHeight(next.x, next.z)) {
          if (p.kind === 'rock') { this.rockImpact(p, next, null); this.kill(i, p); }
          else this.stick(i, p, next, 'earth');
          done = true;
          break;
        }
        p.pos.copy(next);
      }
      if (done) continue;
      if (p.life <= 0) { this.kill(i, p); continue; }
      if (p.kind === 'rock') {
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.x += dt * 3;
        p.mesh.rotation.z += dt * 1.7;
        // a trail of dark smoke, a puff every metre or so
        p.trail += p.vel.length() * dt;
        for (let k = 0; p.trail > 1.0 && k < 3; k++) { p.trail -= 1.0; g.fx.smokeTrail(p.pos, p.vel); }
        if (p.trail > 1.0) p.trail = 0;
      }
      if (p.kind === 'fireball') { g.fx.fireTrail(p.pos); g.fx.fireTrail(p.pos); }
    }
    this.draw(dt);
  }

  // the arrows in flight into the one instanced mesh
  draw(dt) {
    const arr = this.flyMesh.instanceMatrix.array, m4 = this.m4, q = this.q, tmp = this.tmp;
    let n = 0;
    for (const p of this.list) {
      if (p.kind !== 'arrow' || n >= MAX_FLY) continue;
      tmp.copy(p.vel).normalize();
      q.setFromUnitVectors(this.fwd, tmp);
      const s = p.big ? 2.2 : 1;
      this.sc.set(s, s, s);
      m4.compose(p.pos, q, this.sc);
      m4.toArray(arr, n * 16);
      n++;
    }
    for (let i = this.vis.length - 1; i >= 0; i--) {
      const v = this.vis[i];
      v.t -= dt;
      if (v.t <= 0) { this.vis.splice(i, 1); continue; }
      v.vel.y -= G_ARROW * dt;
      v.pos.addScaledVector(v.vel, dt);
      if (n >= MAX_FLY) continue;
      tmp.copy(v.vel).normalize();
      q.setFromUnitVectors(this.fwd, tmp);
      this.sc.set(2.2, 2.2, 2.2);
      m4.compose(v.pos, q, this.sc);
      m4.toArray(arr, n * 16);
      n++;
    }
    this.flyMesh.count = n;
    this.flyMesh.instanceMatrix.needsUpdate = n > 0;
    this.expireStuck(dt);
  }

  // landed arrows go on standing for a while, then shrink away
  expireStuck(dt) {
    this.stuckSweep -= dt;
    if (this.stuckSweep > 0 || !this.stuckMesh.count) return;
    this.stuckSweep = 0.25;
    const t = this.game.time, d = this.stuckData, m4 = this.m4, q = this.q;
    let changed = false;
    for (let i = 0; i < this.stuckMesh.count; i++) {
      const o = i * 9, s0 = d[o + 7];
      if (s0 <= 0) continue;
      const age = t - d[o + 8];
      if (age < STUCK_LIFE - STUCK_FADE) continue;
      const k = Math.max(0, (STUCK_LIFE - age) / STUCK_FADE);
      q.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]);
      this.sc.setScalar(s0 * k);
      this.tmp.set(d[o], d[o + 1], d[o + 2]);
      m4.compose(this.tmp, q, this.sc);
      this.stuckMesh.setMatrixAt(i, m4);
      if (k <= 0) d[o + 7] = 0;
      changed = true;
    }
    if (changed) this.stuckMesh.instanceMatrix.needsUpdate = true;
  }

  hitCharacter(pt, team, pad, skip = null) {
    let found = null;
    this.game.grid.query(pt.x, pt.z, 1.2 + pad, (u) => {
      if (found || !u.alive || allied(u.team, team) || (skip && skip.has(u))) return;
      const dx = pt.x - u.pos.x, dz = pt.z - u.pos.z;
      const r = u.radius + pad;
      if (dx * dx + dz * dz > r * r) return;
      if (pt.y < u.pos.y || pt.y > u.pos.y + u.height) return;
      found = u;
    });
    return found;
  }

  // an arrow lands: it joins the instanced mesh of landed arrows; kind is what it hit ('earth', 'wood', or the kind of a collider)
  stick(i, p, at, kind = 'earth') {
    const g = this.game, fx = g.fx;
    const dir = this.tmp.copy(p.vel).normalize();
    this.q.setFromUnitVectors(this.fwd, dir);
    const s = p.big ? 2.2 : 1;
    this.sc.set(s, s, s);
    this.m4.compose(at, this.q, this.sc);
    const k = this.stuckNext;
    this.stuckMesh.setMatrixAt(k, this.m4);
    const d = this.stuckData, o = k * 9;
    d[o] = at.x; d[o + 1] = at.y; d[o + 2] = at.z;
    d[o + 3] = this.q.x; d[o + 4] = this.q.y; d[o + 5] = this.q.z; d[o + 6] = this.q.w;
    d[o + 7] = s; d[o + 8] = g.time;
    this.stuckNext = (this.stuckNext + 1) % MAX_STUCK;
    this.stuckMesh.count = Math.min(MAX_STUCK, this.stuckMesh.count + 1);
    this.stuckMesh.instanceMatrix.needsUpdate = true;
    if (p.tr >= 0) fx.endTracer(p.tr, p.trb);
    this.list.splice(i, 1);
    g.audio.play('arrowHit', at);
    // what it struck decides the puff: dirt from the ground, grey dust and chips from stone, splinters from wood
    const kd = kind === 'earth' ? 'earth' : WOOD_KINDS.has(kind) || kind === 'wood' ? 'wood' : 'stone';
    const l = p.vel.length() || 1;
    fx.impact(kd, at, -p.vel.x / l, kd === 'earth' ? 1.5 : 0.2, -p.vel.z / l, p.big ? 2 : 1);
    if (p.big) fx.thud(at);
  }

  kill(i, p) {
    if (p.mesh) this.game.scene.remove(p.mesh);
    const fx = this.game.fx;
    if (p.tr >= 0 && p.tr !== undefined) fx.endTracer(p.tr, p.trb);
    if (p.glow) { const G = fx.add, a = p.glow; G.kill(a[0], a[1]); G.kill(a[2], a[3]); G.kill(a[4], a[5]); }
    this.list.splice(i, 1);
  }

  explode(p, at, col) {
    const g = this.game;
    g.fx.explosion(at, p.radius);
    g.audio.play('boom', at);
    g.magic.flash(at, 0xff8a30, 9);
    if (!g.simulating) return;
    // gates, keeps and siege engines burn; stone walls shrug it off
    if (col && col.ref && col.ref.takeDamage && !allied(col.ref.team, p.team) && col.ref.kind !== 'wall') col.ref.takeDamage(p.dmg * 0.6, p.owner);
    const s = g.siegeAt(at, p.team, p.radius);
    if (s) g.damage(s, p.dmg * 0.8, p.owner, { magic: true });
    g.grid.query(at.x, at.z, p.radius + 1, (u) => {
      if (!u.alive || allied(u.team, p.team)) return;
      const d = Math.hypot(u.pos.x - at.x, u.pos.z - at.z);
      if (d > p.radius + u.radius || Math.abs(u.pos.y + 1 - at.y) > p.radius + 1) return;
      const c = u.chest(new THREE.Vector3());
      if (!g.physics.lineClear(at.x, at.y, at.z, c.x, c.y, c.z, p.team)) return; // walls shelter from the blast
      const k = 1 - 0.5 * Math.min(1, d / p.radius);
      g.damage(u, p.dmg * k, p.owner, { magic: true, splash: true });
      if (u.alive && p.owner && p.owner.isPlayer) g.abilities.scorch(u, p);   // (a Mage talent sets the foes alight)
      if (u.stagger && d < p.radius * 0.6) u.stagger(0.5, { pos: at });
    });
  }

  rockImpact(p, at, col) {
    const g = this.game;
    g.fx.crater(at, 2.3);   // (every screen sees its own boulder land; the host also sends the dust and the sound)
    if (!g.simulating) return; // the host sends the impact effects
    g.fx.dust(at, 18, 2.2, 'earth');
    g.audio.play('thud', at);
    if (col && col.ref && col.ref.takeDamage && !allied(col.ref.team, p.team)) {
      col.ref.takeDamage(p.dmg, p.owner);
    }
    // splash damage to characters
    g.grid.query(at.x, at.z, 4, (u) => {
      if (!u.alive || allied(u.team, p.team)) return;
      const d = Math.hypot(u.pos.x - at.x, u.pos.z - at.z);
      if (d < 3.5 && Math.abs(u.pos.y - at.y) < 4) g.damage(u, 70 * (1 - d / 4), p.owner, { splash: true });
    });
  }
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
}
