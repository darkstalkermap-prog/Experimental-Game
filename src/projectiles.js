// Arrows and catapult boulders with ballistic flight, hit detection and sticking.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { allied } from './teams.js';

export const ARROW_SPEED = 52;
export const G_ARROW = 9.8;
const G_ROCK = 9.8;
const MAX_STUCK = 240;

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.stuck = [];
    // one merged, vertex-coloured arrow (shaft + fletching) so each arrow is a single draw
    const colored = (g, hex) => {
      g = g.index ? g.toNonIndexed() : g;
      const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.85, 4);
    shaft.rotateX(Math.PI / 2);
    const fl = new THREE.BoxGeometry(0.08, 0.004, 0.14);
    fl.translate(0, 0, -0.36);
    this.arrowGeo = mergeGeometries([colored(shaft, 0x8a6a40), colored(fl, 0xe8e0d0)]);
    this.arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    // every arrow that has landed lives in one instanced mesh (a ring buffer)
    this.stuckMesh = new THREE.InstancedMesh(this.arrowGeo, this.arrowMat, MAX_STUCK);
    this.stuckMesh.count = 0;
    this.stuckMesh.frustumCulled = false;
    this.stuckNext = 0;
    game.scene.add(this.stuckMesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.one = new THREE.Vector3(1, 1, 1);
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.rockGeo = new THREE.DodecahedronGeometry(0.65, 1);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1, flatShading: true });
    this.fireGeo = new THREE.SphereGeometry(0.32, 12, 8);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffb050, fog: false });
  }

  // Straight-line fireball (no gravity) that bursts on the first thing it meets.
  fireSpell(kind, from, vel, team, dmg, owner, radius = 0) {
    const mesh = new THREE.Mesh(this.fireGeo, this.fireMat);
    mesh.position.copy(from);
    mesh.scale.setScalar(0.8 + radius / 6);
    this.game.scene.add(mesh);
    this.list.push({ kind: 'fireball', spell: true, pos: from.clone(), vel: vel.clone(), team, dmg, owner, mesh, life: 3, radius,
      hitSet: new Set() });
  }

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

  // big: a volley arrow, drawn chunkier so a falling flight of them can be seen, and it kicks up a puff where it lands
  fireArrow(from, vel, team, dmg, owner, big = false) {
    const mesh = this.makeArrowMesh();
    mesh.position.copy(from);
    if (big) mesh.scale.setScalar(2.2);
    this.list.push({ kind: 'arrow', pos: from.clone(), vel: vel.clone(), team, dmg, owner, mesh, life: 6, big });
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
    this.list.push({ kind: 'rock', pos: from.clone(), vel: v, team, dmg, owner, mesh, life: 10 });
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
          if (wall) { this.stick(i, p, next); done = true; break; }
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
          if (siege) { g.damage(siege, p.dmg * 0.3, p.owner, { ranged: true }); this.stick(i, p, next); done = true; break; }
        }
        // structures
        const col = phys.pointHit(next.x, next.y, next.z, p.team);
        if (col) {
          if (p.kind === 'rock') this.rockImpact(p, next, col);
          else this.stick(i, p, next);
          if (p.kind === 'rock') this.kill(i, p);
          done = true;
          break;
        }
        // ground
        if (next.y <= phys.terrainHeight(next.x, next.z)) {
          if (p.kind === 'rock') { this.rockImpact(p, next, null); this.kill(i, p); }
          else this.stick(i, p, next);
          done = true;
          break;
        }
        p.pos.copy(next);
      }
      if (done) continue;
      if (p.life <= 0) { this.kill(i, p); continue; }
      p.mesh.position.copy(p.pos);
      if (p.kind === 'arrow') p.mesh.lookAt(next.copy(p.pos).add(p.vel));
      else p.mesh.rotation.x += dt * 3;
      if (p.kind === 'fireball') { g.fx.fireTrail(p.pos); g.fx.fireTrail(p.pos); }
    }
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

  stick(i, p, at) {
    // move the arrow into the instanced ring buffer and drop its own mesh
    this.q.setFromUnitVectors(this.fwd, p.vel.clone().normalize());
    this.m4.compose(at, this.q, this.one);
    this.stuckMesh.setMatrixAt(this.stuckNext, this.m4);
    this.stuckNext = (this.stuckNext + 1) % MAX_STUCK;
    this.stuckMesh.count = Math.min(MAX_STUCK, this.stuckMesh.count + 1);
    this.stuckMesh.instanceMatrix.needsUpdate = true;
    this.game.scene.remove(p.mesh);
    this.list.splice(i, 1);
    this.game.audio.play('arrowHit', at);
    if (p.big) this.game.fx.thud(at);
  }

  kill(i, p) {
    this.game.scene.remove(p.mesh);
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
    if (!g.simulating) return; // the host sends the impact effects
    g.fx.dust(at, 18, 2.2);
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
