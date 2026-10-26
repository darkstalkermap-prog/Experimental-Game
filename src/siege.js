// Siege engines: battering rams (break gates / keeps) and catapults (break walls).
import * as THREE from 'three';
import { SIEGE_TYPES, WORLD } from './config.js';
import { materials, box, shadowed } from './materials.js';
import { buildSoldier } from './models.js';
import { navigate, avoidCastles } from './nav.js';
import { clamp } from './noise.js';
import { RAIDER_TEAM } from './config.js';

export class SiegeEngine {
  constructor(game, type, team, pos, targetCastle, stats = {}) {
    this.game = game;
    this.type = type;
    this.kind = type;
    this.isSiege = true;
    this.team = team;
    const d = SIEGE_TYPES[type];
    this.name = d.name;
    this.maxHp = stats.hp ?? d.hp;
    this.hp = this.maxHp;
    this.dmg = stats.dmg ?? d.dmg;
    this.cd = d.cd;
    this.speed = d.speed;
    this.range = d.range || 0;
    this.radius = 2.0;
    this.height = 3;
    this.alive = true;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.timer = 2;
    this.anim = 0;
    this.deadT = 0;
    this.targetCastle = targetCastle;
    this.nav = null;
    this.thinkT = 0;
    this.waypoint = null;
    this.mesh = type === 'ram' ? this.buildRam() : this.buildCatapult();
    this.crew = [];
    const crewType = team === RAIDER_TEAM ? 'raider' : 'swordsman';
    for (const [x, z] of type === 'ram' ? [[-1.4, -1.5], [1.4, -1.5]] : [[-1.6, -2.6], [1.6, -2.6]]) {
      const s = buildSoldier(crewType, team);
      s.root.position.set(x, 0, z);
      s.armL.rotation.x = s.armR.rotation.x = -1.3;
      this.mesh.add(s.root);
      this.crew.push(s);
    }
    game.scene.add(this.mesh);
  }

  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }

  buildRam() {
    const M = materials();
    const g = new THREE.Group();
    const frame = new THREE.Mesh(box(2.4, 0.3, 5.5, 2), M.plank);
    frame.position.y = 0.9;
    g.add(frame);
    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(box(1.7, 0.12, 5.8, 2), M.plank);
      roof.position.set(s * 0.65, 2.75, 0);
      roof.rotation.z = s * 0.75;
      g.add(roof);
      for (const z of [-2.4, 0, 2.4]) {
        const post = new THREE.Mesh(box(0.18, 2.2, 0.18, 1), M.plank);
        post.position.set(s * 1.1, 2, z);
        g.add(post);
      }
    }
    const hide = new THREE.Mesh(box(2.5, 0.06, 5.9, 2), new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 1 }));
    hide.position.y = 3.25;
    g.add(hide);
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.25, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels = [];
    for (const x of [-1.25, 1.25]) for (const z of [-1.9, 1.9]) {
      const w = new THREE.Mesh(wheelGeo, M.wood);
      w.position.set(x, 0.55, z);
      g.add(w);
      this.wheels.push(w);
    }
    const log = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.2, 10), M.wood);
    trunk.rotation.x = Math.PI / 2;
    log.add(trunk);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 10), M.iron);
    head.rotation.x = Math.PI / 2;
    head.position.z = 3.3;
    log.add(head);
    log.position.y = 1.7;
    g.add(log);
    this.log = log;
    return shadowed(g);
  }

  buildCatapult() {
    const M = materials();
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(box(0.3, 0.35, 4.6, 2), M.plank);
      rail.position.set(s * 1.0, 0.8, 0);
      g.add(rail);
      const upright = new THREE.Mesh(box(0.3, 2.2, 0.3, 1), M.plank);
      upright.position.set(s * 1.0, 1.9, 0.4);
      upright.rotation.x = -0.2;
      g.add(upright);
    }
    for (const z of [-1.8, 1.8]) {
      const cross = new THREE.Mesh(box(2.3, 0.25, 0.3, 2), M.plank);
      cross.position.set(0, 0.8, z);
      g.add(cross);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.3, 8), M.iron);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 2.8, 0.3);
    g.add(axle);
    const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheels = [];
    for (const x of [-1.25, 1.25]) for (const z of [-1.7, 1.7]) {
      const w = new THREE.Mesh(wheelGeo, M.wood);
      w.position.set(x, 0.6, z);
      g.add(w);
      this.wheels.push(w);
    }
    const arm = new THREE.Group();
    arm.position.set(0, 2.8, 0.3);
    const beam = new THREE.Mesh(box(0.25, 0.25, 4.4, 2), M.wood);
    beam.position.z = -1.6;
    arm.add(beam);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.35, 10), M.plank);
    bucket.position.set(0, 0.2, -3.7);
    arm.add(bucket);
    const weight = new THREE.Mesh(box(0.9, 0.9, 0.9, 1), M.stoneDark);
    weight.position.set(0, -0.3, 0.9);
    arm.add(weight);
    arm.rotation.x = 0.55; // cocked
    g.add(arm);
    this.arm = arm;
    return shadowed(g);
  }

  takeDamage(amt, attacker) {
    if (!this.alive) return;
    this.hp -= amt;
    this.game.fx.splinters(this.chest(new THREE.Vector3()), 4);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.game.fx.splinters(this.pos.clone().setY(this.pos.y + 1.5), 30);
      this.game.fx.dust(this.pos, 12, 2);
      this.game.audio.play('collapse', this.pos);
      for (const c of this.crew) c.root.visible = false;
      this.game.onSiegeDestroyed(this, attacker);
    }
  }

  pickTarget() {
    const g = this.game;
    if (this.targetCastle && !this.targetCastle.fallen && this.targetCastle.team !== this.team) return;
    let best = null, bd = Infinity;
    for (const c of g.castles) {
      if (c.fallen || c.team === this.team) continue;
      const d = Math.hypot(c.center.x - this.pos.x, c.center.z - this.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    this.targetCastle = best;
  }

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.deadT += dt;
      this.mesh.rotation.z = Math.min(0.35, this.deadT * 0.5);
      this.mesh.position.y = this.pos.y - Math.min(1.2, this.deadT * 0.3);
      if (this.deadT < 6 && Math.random() < dt * 6) g.fx.smoke(this.pos.clone().setY(this.pos.y + 2));
      return;
    }
    this.thinkT -= dt;
    this.timer -= dt;
    this.pickTarget();
    const tc = this.targetCastle;
    let goal = null, faceTo = null, firing = false;
    if (tc) {
      if (this.type === 'ram') {
        if (tc.gate.alive) {
          const spot = tc.gateOut.clone().lerp(tc.gatePos, 0.38);
          if (Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) < 1.6) { firing = true; faceTo = tc.gatePos; this.attack(tc.gate); }
          else goal = spot;
        } else {
          const d = Math.hypot(tc.keepDoor.x - this.pos.x, tc.keepDoor.z - this.pos.z);
          if (d < 3) { firing = true; faceTo = tc.keep.pos; this.attack(tc.keep); }
          else goal = tc.keepDoor;
        }
      } else {
        const seg = this.pickWall(tc);
        let aim, fire;
        if (seg) {
          const n = tc.dirToWorld(seg.nx, seg.nz);
          fire = seg.pos.clone().addScaledVector(n, this.range - 10);
          aim = seg.pos.clone();
          aim.y = tc.center.y + 4.5;
        } else {
          const away = this.pos.clone().sub(tc.center).setY(0).normalize();
          fire = tc.center.clone().addScaledVector(away, this.range - 12);
          aim = tc.keep.pos.clone();
          aim.y = tc.center.y + 10;
        }
        if (Math.hypot(fire.x - this.pos.x, fire.z - this.pos.z) < 3.5) {
          firing = true;
          faceTo = aim;
          if (this.timer <= 0) this.fire(aim);
        } else goal = fire;
      }
    }

    if (goal) {
      if (this.thinkT <= 0) {
        this.thinkT = 0.4;
        this.waypoint = this.type === 'ram' ? navigate(g, this, goal) : avoidCastles(g, this.pos, goal);
      }
      const wp = this.waypoint || goal;
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.set((dx / d) * this.speed, 0, (dz / d) * this.speed);
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const L = WORLD.playHalf;
      this.pos.x = clamp(this.pos.x, -L, L);
      this.pos.z = clamp(this.pos.z, -L, L);
      g.physics.resolve(this.pos, 1.6, this.pos.y, 3, this.team);
      this.turn(Math.atan2(dx, dz), dt);
      for (const w of this.wheels) w.rotation.x += dt * this.speed * 1.7;
      this.anim += dt * this.speed * 2;
      for (const c of this.crew) {
        c.legL.rotation.x = Math.sin(this.anim) * 0.6;
        c.legR.rotation.x = -Math.sin(this.anim) * 0.6;
      }
    } else {
      this.vel.set(0, 0, 0);
      if (faceTo) this.turn(Math.atan2(faceTo.x - this.pos.x, faceTo.z - this.pos.z), dt);
    }
    this.pos.y = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;

    // animations
    if (this.log) {
      const t = Math.max(0, this.timer);
      this.log.position.z = t > this.cd - 0.35 ? 1.0 - (this.cd - t) * 2.5 : -0.8 * Math.min(1, (this.cd - t) / this.cd * 1.5);
    }
    if (this.arm) {
      const since = this.cd - this.timer;
      this.arm.rotation.x = since < 0.25 ? 0.55 - (since / 0.25) * 2.0 : Math.min(0.55, -1.45 + (since - 0.25) * 0.6);
    }
  }

  turn(target, dt) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 1.5);
  }

  pickWall(tc) {
    let best = null, bd = Infinity;
    for (const w of tc.walls) {
      if (!w.alive || !w.breakable) continue;
      const d = Math.hypot(w.outPt.x - this.pos.x, w.outPt.z - this.pos.z);
      if (d < bd) { bd = d; best = w; }
    }
    // keep hammering the same breach point
    if (this.wall && this.wall.alive && this.wall.castle === tc) return this.wall;
    this.wall = best;
    return best;
  }

  attack(target) {
    if (this.timer > 0) return;
    this.timer = this.cd;
    target.takeDamage(this.dmg, this);
    this.game.audio.play('thud', this.pos);
    this.game.fx.dust(target.pos.clone().lerp(this.pos, 0.5), 6, 1);
  }

  fire(aim) {
    this.timer = this.cd;
    const from = this.pos.clone();
    from.y += 4.5;
    const target = aim.clone();
    target.x += (Math.random() - 0.5) * 2.5;
    target.z += (Math.random() - 0.5) * 2.5;
    this.game.projectiles.throwBoulder(from, target, this.team, this.dmg, this, 3.0);
    this.game.audio.play('catapult', this.pos);
  }
}
