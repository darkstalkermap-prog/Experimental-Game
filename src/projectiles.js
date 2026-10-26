// Arrows and catapult boulders with ballistic flight, hit detection and sticking.
import * as THREE from 'three';

const ARROW_SPEED = 52;
const G_ARROW = 9.8;
const G_ROCK = 9.8;
const MAX_STUCK = 140;

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.stuck = [];
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.85, 4);
    shaft.rotateX(Math.PI / 2);
    this.arrowGeo = shaft;
    this.arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.8 });
    const fl = new THREE.BoxGeometry(0.08, 0.002, 0.14);
    fl.translate(0, 0, -0.36);
    this.fletchGeo = fl;
    this.fletchMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1, side: THREE.DoubleSide });
    this.rockGeo = new THREE.DodecahedronGeometry(0.65, 1);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1, flatShading: true });
  }

  makeArrowMesh() {
    const m = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    const f = new THREE.Mesh(this.fletchGeo, this.fletchMat);
    m.add(f);
    this.game.scene.add(m);
    return m;
  }

  // Aim at a moving target with lead and gravity compensation.
  shootArrow(from, target, team, dmg, owner, spread = 0.03) {
    const aim = target.isStructure ? target.pos.clone() : target.chest(new THREE.Vector3());
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

  fireArrow(from, vel, team, dmg, owner) {
    const mesh = this.makeArrowMesh();
    mesh.position.copy(from);
    this.list.push({ kind: 'arrow', pos: from.clone(), vel: vel.clone(), team, dmg, owner, mesh, life: 6 });
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
      const grav = p.kind === 'arrow' ? G_ARROW : G_ROCK;
      const steps = p.kind === 'arrow' ? 3 : 2;
      const h = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= grav * h;
        next.copy(p.pos).addScaledVector(p.vel, h);
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
    }
  }

  hitCharacter(pt, team, pad) {
    let found = null;
    this.game.grid.query(pt.x, pt.z, 1.2, (u) => {
      if (found || !u.alive || u.team === team) return;
      const dx = pt.x - u.pos.x, dz = pt.z - u.pos.z;
      const r = u.radius + pad;
      if (dx * dx + dz * dz > r * r) return;
      if (pt.y < u.pos.y || pt.y > u.pos.y + u.height) return;
      found = u;
    });
    return found;
  }

  stick(i, p, at) {
    p.mesh.position.copy(at);
    p.mesh.lookAt(at.clone().add(p.vel));
    this.list.splice(i, 1);
    this.stuck.push(p.mesh);
    if (this.stuck.length > MAX_STUCK) this.game.scene.remove(this.stuck.shift());
    this.game.audio.play('arrowHit', at);
  }

  kill(i, p) {
    this.game.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  rockImpact(p, at, col) {
    const g = this.game;
    if (!g.simulating) return; // the host sends the impact effects
    g.fx.dust(at, 18, 2.2);
    g.audio.play('thud', at);
    if (col && col.ref && col.ref.takeDamage && col.ref.team !== p.team) {
      col.ref.takeDamage(p.dmg, p.owner);
    }
    // splash damage to characters
    g.grid.query(at.x, at.z, 4, (u) => {
      if (!u.alive || u.team === p.team) return;
      const d = Math.hypot(u.pos.x - at.x, u.pos.z - at.z);
      if (d < 3.5 && Math.abs(u.pos.y - at.y) < 4) g.damage(u, 70 * (1 - d / 4), p.owner, { splash: true });
    });
  }
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
}
