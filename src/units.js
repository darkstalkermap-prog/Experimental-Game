// Soldiers: troops, rival lords and raiders. Movement, orders, combat and animation.
import * as THREE from 'three';
import { UNIT_TYPES, WORLD, RAIDER_TEAM } from './config.js';
import { buildSoldier, WEAPON_TILT } from './models.js';
import { navigate, avoidCastles } from './nav.js';
import { clamp } from './noise.js';

const tmp = new THREE.Vector3();
let NEXT_ID = 1;

export class Unit {
  constructor(game, type, team, pos, stats = {}) {
    this.game = game;
    this.id = NEXT_ID++;
    this.type = type;
    this.team = team;
    const t = UNIT_TYPES[type];
    this.def = t;
    this.name = stats.name || t.name;
    this.kind = t.kind;
    this.isHero = t.kind === 'hero';
    this.ranged = !!t.ranged;
    this.maxHp = stats.hp ?? t.hp;
    this.hp = this.maxHp;
    this.dmg = stats.dmg ?? t.dmg;
    this.armor = stats.armor ?? t.armor;
    this.speed = t.speed * (0.94 + Math.random() * 0.12);
    this.range = t.range;
    this.cd = t.cd;
    this.radius = 0.42 * (t.scale || 1);
    this.height = 1.85 * (t.scale || 1);
    this.siegeBonus = t.siegeBonus || 1;   // vs siege engines
    this.structMult = t.structMult || 0.6; // vs gates and keeps (hand weapons are poor at this)
    this.pos = pos.clone();
    this.pos.y = game.physics.groundHeight(pos.x, pos.z, pos.y + 5);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.alive = true;
    this.order = 'defend';
    this.orderData = null;
    this.target = null;
    this.goal = null;
    this.waypoint = null;
    this.nav = null;
    this.blockedBy = null;
    this.attackTimer = Math.random() * this.cd;
    this.swingT = -1;
    this.struck = false;
    this.thinkTimer = Math.random() * 0.3;
    this.walkPhase = Math.random() * 6;
    this.deathT = 0;
    this.post = null;
    this.slot = 0;
    this.los = true;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.homeCastle = null;
    this.kills = 0;

    const m = buildSoldier(type, team);
    this.model = m;
    this.mesh = m.root;
    this.mesh.position.copy(this.pos);
    this.mesh.userData.unit = this;
    game.scene.add(this.mesh);
  }

  get footY() { return this.pos.y; }
  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }

  takeDamage(amount, attacker) {
    if (!this.alive) return;
    this.hp -= amount;
    this.lastAttacker = attacker;
    if (attacker && attacker.alive && attacker.pos && !attacker.isStructure && attacker.team !== this.team) {
      const reachable = this.ranged || attacker.pos.y - this.pos.y < 2.4;
      const closer = !this.target || this.target.isStructure || this.distTo(attacker) < this.distTo(this.target) - 1;
      if (reachable && closer) this.target = attacker;
    }
    if (this.hp <= 0) this.die(attacker);
  }

  die(attacker) {
    this.hp = 0;
    this.alive = false;
    this.deathT = 0;
    this.leavePost();
    this.game.audio.play('death', this.pos);
    this.game.onUnitKilled(this, attacker);
  }

  remove() {
    this.game.scene.remove(this.mesh);
  }

  setOrder(order, data = null) {
    if (this.order === order && this.orderData === data && order !== 'hold') return;
    this.order = order;
    this.orderData = data;
    this.nav = null;
    if (order !== 'defend') this.leavePost();
    if (this.target && this.target.isStructure) this.target = null;
    this.thinkTimer = 0;
  }

  // --- wall posts (archers man the walls when defending) ---
  takePost(post) {
    this.post = post;
    post.occupant = this;
    this.pos.copy(post.pos);
    this.nav = null;
  }
  leavePost() {
    if (!this.post) return;
    const base = this.post.base;
    this.post.occupant = null;
    this.post = null;
    if (this.alive) {
      this.pos.set(base.x, this.game.physics.terrainHeight(base.x, base.z), base.z);
    }
  }
  fallFromWall() {
    if (!this.post) return;
    this.post.occupant = null;
    const p = this.post.pos;
    this.post = null;
    this.pos.set(p.x, this.game.physics.terrainHeight(p.x, p.z), p.z);
    this.takeDamage(25, null);
  }

  // --- decision making (runs a few times per second) ---
  think() {
    const g = this.game;
    const fac = g.factions[this.team];
    if (this.target && (!this.target.alive || (this.target.castle && this.target.castle.fallen && this.target.kind !== 'keep'))) this.target = null;

    let order = this.order;
    if (order === 'follow' && !(fac && fac.hero && fac.hero.alive)) order = 'defend';
    if (order === 'defend' && (!this.homeCastle || this.homeCastle.fallen)) order = 'charge';

    const home = this.homeCastle;
    let anchor = null, engage = 0, leash = Infinity;
    const rng = this.ranged ? this.range : 0;

    switch (order) {
      case 'defend': {
        engage = this.ranged ? this.range : 16;
        leash = this.ranged ? 60 : 34;
        anchor = home.center;
        break;
      }
      case 'follow': {
        const hero = fac.hero;
        const slot = this.slot;
        const row = Math.floor(slot / 6), col = (slot % 6) - 2.5;
        const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
        tmp.set(hero.pos.x - fx * (3 + row * 1.8) + fz * col * 1.7, 0, hero.pos.z - fz * (3 + row * 1.8) - fx * col * 1.7);
        this.goal = tmp.clone();
        engage = this.ranged ? Math.min(this.range, 32) : 10;
        anchor = hero.pos; leash = 18;
        break;
      }
      case 'hold': {
        const d = this.orderData;
        const slot = this.slot;
        const row = Math.floor(slot / 8), col = (slot % 8) - 3.5;
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
        this.goal = new THREE.Vector3(d.pos.x + fz * col * 1.6 - fx * row * 1.8, 0, d.pos.z - fx * col * 1.6 - fz * row * 1.8);
        engage = this.ranged ? this.range : 5;
        anchor = this.goal; leash = this.ranged ? 0 : 8;
        break;
      }
      case 'charge':
        engage = 160; anchor = null;
        break;
      case 'assault':
        engage = this.ranged ? this.range * 0.9 : 13;
        break;
    }

    // keep current target if still reasonable
    if (this.target && !this.target.isStructure) {
      const d = this.distTo(this.target);
      const tooFar = d > Math.max(engage, rng) * 1.5 + 4 || (anchor && leash < Infinity && Math.hypot(this.target.pos.x - anchor.x, this.target.pos.z - anchor.z) > leash + 8);
      const unreachable = !this.ranged && this.target.pos.y - this.pos.y > 2.4;
      if (tooFar || unreachable) this.target = null;
    }
    if (!this.target || this.target.isStructure) {
      const t = g.findEnemy(this, engage, anchor, leash);
      if (t) this.target = t;
    }

    if (!this.target || this.target.isStructure) {
      this.target = null;
      if (order === 'defend') {
        if (this.ranged && !this.post) {
          const post = g.freePost(home, this);
          if (post) {
            this.goal = post.base;
            if (Math.hypot(this.pos.x - post.base.x, this.pos.z - post.base.z) < 2.2) this.takePost(post);
            else this.reservedPost = post;
          } else this.goal = home.defendPts[this.slot % home.defendPts.length];
        } else if (!this.post) {
          this.goal = home.defendPts[this.slot % home.defendPts.length];
        }
      } else if (order === 'charge') {
        // nothing to fight anywhere: regroup with the hero or go home
        if (fac && fac.hero && fac.hero.alive) this.goal = fac.hero.pos.clone();
        else if (home && !home.fallen) this.goal = home.defendPts[this.slot % home.defendPts.length];
        else this.goal = null;
      } else if (order === 'assault') {
        this.assaultThink();
      }
    }

    // pick the walking waypoint
    const dest = this.target ? this.target.pos : this.goal;
    if (dest && !this.post) {
      this.waypoint = navigate(g, this, dest);
      if (this.blockedBy && this.blockedBy.alive && this.blockedBy.team !== this.team) {
        // sealed castle in the way: bash the gate
        if (!this.target || (!this.target.isStructure && !this.ranged)) this.target = this.blockedBy;
        if (this.target === this.blockedBy) this.waypoint = avoidCastles(g, this.pos, this.blockedBy.castle.gateOut.clone().lerp(this.blockedBy.pos, 0.55));
      }
    } else this.waypoint = null;

    // ranged line-of-sight check
    if (this.ranged && this.target) {
      const c = this.chest(new THREE.Vector3());
      const tc = this.target.isStructure ? this.target.pos : this.target.chest(new THREE.Vector3());
      this.los = g.physics.lineClear(c.x, c.y + 0.2, c.z, tc.x, tc.y, tc.z, this.team) || this.target.isStructure;
    }
  }

  assaultThink() {
    const g = this.game;
    const tc = this.orderData;
    if (!tc || tc.fallen) { this.setOrder('charge'); return; }
    if (tc.isInside(this.pos, 0.5) || (!tc.gate.alive && tc.inFootprint(this.pos, 4))) {
      this.target = tc.keep;
      this.goal = tc.keepDoor;
      return;
    }
    // walk toward the keep; navigation routes through gate or breach, or flags the gate
    this.goal = tc.keepDoor;
  }

  distTo(t) {
    return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - (t.radius || 0.4);
  }

  update(dt) {
    if (!this.alive) { this.animateDeath(dt); return; }
    const g = this.game;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.thinkTimer = 0.28 + Math.random() * 0.12; this.think(); }
    this.attackTimer -= dt;

    let moving = false;
    const tgt = this.target;
    let face = null;

    if (tgt && tgt.alive) {
      const d = this.distTo(tgt);
      // archers with nothing to shoot help batter the gate by hand
      const reach = tgt.isStructure ? (this.ranged ? 2.2 : this.range) + 0.6 : this.range;
      if (d <= reach && (!this.ranged || tgt.isStructure || this.los)) {
        face = tgt.pos;
        if (this.attackTimer <= 0 && this.swingT < 0) this.startAttack();
      } else if (!this.post) {
        moving = this.moveToward(this.waypoint || tgt.pos, dt, this.ranged ? 0 : 0.2);
      }
    } else if (this.goal && !this.post) {
      const dg = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      if (dg > 0.6) moving = this.moveToward(this.waypoint || this.goal, dt, 0.5);
    }

    if (this.swingT >= 0) this.updateAttack(dt);

    if (!moving && !this.post) {
      // idle: gentle separation and gravity
      this.vel.multiplyScalar(0.8);
      this.applyMovement(dt, true);
    }
    if (this.post) this.pos.copy(this.post.pos);

    if (face) this.faceTo(face, dt);
    else if (moving) {
      if (this.vel.lengthSq() > 0.1) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt);
    } else if (this.post) {
      this.turnTo(Math.atan2(this.post.pos.x - this.homeCastle.center.x, this.post.pos.z - this.homeCastle.center.z), dt);
    }

    // stuck detection: nudge sideways
    if (moving) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        if (this.pos.distanceTo(this.lastPos) < 0.6) {
          this.vel.x += (Math.random() - 0.5) * 8; this.vel.z += (Math.random() - 0.5) * 8;
          this.nav = null;
        }
        this.lastPos.copy(this.pos);
        this.stuckT = 0;
      }
    }

    this.animate(dt, moving);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  moveToward(p, dt, stopDist) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < stopDist) return false;
    const sp = this.speed * (this.order === 'hold' && d < 3 ? 0.6 : 1);
    const k = Math.min(1, dt * 8);
    this.vel.x += ((dx / d) * sp - this.vel.x) * k;
    this.vel.z += ((dz / d) * sp - this.vel.z) * k;
    this.applyMovement(dt, false);
    return true;
  }

  applyMovement(dt, idle) {
    const g = this.game;
    // separation from neighbours
    let px = 0, pz = 0;
    g.grid.query(this.pos.x, this.pos.z, 1.4, (o) => {
      if (o === this || !o.alive || o.post) return;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const r = this.radius + o.radius + 0.15;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (r - d) / r;
        px += (dx / d) * push; pz += (dz / d) * push;
      }
    });
    const sep = idle ? 2.5 : 4;
    this.pos.x += (this.vel.x + px * sep) * dt;
    this.pos.z += (this.vel.z + pz * sep) * dt;
    const L = WORLD.playHalf;
    this.pos.x = clamp(this.pos.x, -L, L);
    this.pos.z = clamp(this.pos.z, -L, L);
    g.physics.resolve(this.pos, this.radius, this.pos.y, this.height, this.team);
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (ground < this.pos.y - 0.05) this.pos.y = Math.max(ground, this.pos.y - 12 * dt);
    else this.pos.y = ground;
  }

  faceTo(p, dt) { this.turnTo(Math.atan2(p.x - this.pos.x, p.z - this.pos.z), dt); }
  turnTo(target, dt) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 10);
  }

  startAttack() {
    this.swingT = 0;
    this.struck = false;
    this.attackTimer = this.cd * (0.9 + Math.random() * 0.2);
    if (!this.ranged) this.game.audio.play('swing', this.pos);
  }

  updateAttack(dt) {
    this.swingT += dt;
    const strikeAt = this.ranged ? 0.55 : 0.32;
    if (!this.struck && this.swingT >= strikeAt) {
      this.struck = true;
      const t = this.target;
      if (t && t.alive) {
        if (this.ranged && !t.isStructure) {
          const from = this.chest(new THREE.Vector3());
          from.y += 0.25;
          this.game.projectiles.shootArrow(from, t, this.team, this.dmg, this, 0.035);
          this.game.audio.play('bow', this.pos);
        } else if (this.distTo(t) <= (this.ranged ? 2.2 : this.range) + 1.0) {
          const mult = (t.isStructure ? this.structMult : t.isSiege ? this.siegeBonus : 1) * (this.ranged ? 0.5 : 1);
          this.game.damage(t, this.dmg * mult * (0.85 + Math.random() * 0.3), this, { melee: true });
        }
      }
    }
    if (this.swingT > (this.ranged ? 0.9 : 0.62)) this.swingT = -1;
  }

  animate(dt, moving) {
    const m = this.model;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (moving) this.walkPhase += dt * sp * 2.1;
    const swing = moving ? Math.sin(this.walkPhase) * Math.min(0.75, sp * 0.16) : 0;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.body.position.y = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.05 : 0;
    m.armL.rotation.x = this.ranged ? -0.3 + swing * 0.3 : -0.55 - swing * 0.2;
    let rArm = this.ranged ? -0.2 - swing * 0.4 : -0.35 + swing * 0.4;
    if (this.swingT >= 0) {
      const t = this.swingT;
      if (this.ranged) {
        const a = Math.min(1, t / 0.35);
        m.armL.rotation.x = -1.55 * a;
        rArm = -1.45 * a;
        m.armR.position.z = -0.12 * a;
      } else if (t < 0.25) rArm = -0.35 + (-2.5 + 0.35) * (t / 0.25);
      else if (t < 0.4) rArm = -2.5 + 2.1 * ((t - 0.25) / 0.15);
      else rArm = -0.4 + 0.05 * ((t - 0.4) / 0.22);
    } else if (this.ranged) m.armR.position.z = 0;
    m.armR.rotation.x = rArm;
    m.armR.rotation.z = this.swingT >= 0 && !this.ranged ? -0.25 : 0;
  }

  animateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.55);
    this.mesh.rotation.x = -t * t * Math.PI / 2;
    this.mesh.position.y = this.pos.y + 0.15 * t;
    if (this.deathT > 9) this.mesh.position.y = this.pos.y - (this.deathT - 9) * 0.4;
  }
}

export function makeRaiderStats(type, round, diff) {
  const t = UNIT_TYPES[type];
  const k = diff.enemyStat;
  const hpScale = (1 + 0.11 * (round - 1)) * k;
  const dmgScale = (1 + 0.065 * (round - 1)) * k;
  return {
    hp: Math.round(t.hp * hpScale),
    dmg: t.dmg * dmgScale,
    armor: t.armor + Math.floor(round / 4),
  };
}

export function isEnemy(a, b) {
  return a.team !== b.team;
}

export { RAIDER_TEAM };
