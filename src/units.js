// Soldiers: troops, rival lords and raiders. Movement, orders, combat and animation.
import * as THREE from 'three';
import { UNIT_TYPES, WORLD, RAIDER_TEAM, FORMATIONS, RANKS, TEAM_COLORS } from './config.js';
import { buildSoldier, poseSoldier, buildHorse, poseHorse, SADDLE_Y, bakedMesh } from './models.js';
import { navigate, avoidCastles } from './nav.js';
import { clamp } from './noise.js';
import { attackDirsFor } from './combat.js';

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
    this.mounted = !!t.mounted;
    this.radius = this.mounted ? 0.85 : 0.42 * (t.scale || 1);
    this.height = this.mounted ? 2.75 : 1.85 * (t.scale || 1);
    this.variant = stats.variant ?? Math.floor(Math.random() * 6);
    this.idleT = Math.random() * 10;
    this.attackDir = 'over';
    this.staggerT = 0;
    this.feint = false;
    this.strafeSide = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.hasShield = !!t.shield;
    this.isGiant = !!t.giant;
    this.stuckCount = 0;
    this.ghostT = 0;
    this.xp = 0;
    this.rank = 1;
    this.slowT = 0;
    this.braced = false;
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

    const m = buildSoldier(type, team, this.variant);
    this.model = m;
    if (this.mounted) {
      this.horse = buildHorse(team, this.variant, team !== RAIDER_TEAM);
      this.mesh = new THREE.Group();
      this.mesh.add(this.horse.root);
      m.root.position.set(0, SADDLE_Y, -0.05);
      this.mesh.add(m.root);
    } else {
      this.mesh = m.root;
    }
    // resting pose, then bake the distant version
    poseSoldier(m, { phase: 0, speed: 0, moving: false, swingT: -1, mounted: this.mounted });
    if (this.horse) poseHorse(this.horse, 0, 0);
    this.far = bakedMesh(`${type}:${team}:${this.variant}:${this.mounted ? 1 : 0}`, this.mesh);
    this.mesh.add(this.far);
    this.lod = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.userData.unit = this;
    game.scene.add(this.mesh);
  }

  get footY() { return this.pos.y; }
  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }

  takeDamage(amount, attacker, info = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    // heavy blows interrupt and knock the soldier back; heroes and riders are harder to shake
    const sturdy = this.isHero || this.mounted || (this.def && this.def.boss);
    if (this.hp > 0 && !this.isGiant && info.melee && (info.parry || amount >= this.maxHp * (sturdy ? 0.2 : 0.12) || info.charge >= 0.9)) {
      this.stagger(info.parry ? 0.9 : sturdy ? 0.3 : 0.5, attacker);
    }
    this.lastAttacker = attacker;
    if (attacker && attacker.alive && attacker.chest && !attacker.isStructure && attacker.team !== this.team) {
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

  // A giant's club hits the ground in front of it: everything nearby is hurt and thrown off balance.
  giantSmash(t) {
    const g = this.game;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const c = new THREE.Vector3(this.pos.x + fx * 2.6, this.pos.y + 0.3, this.pos.z + fz * 2.6);
    g.fx.dust(c, 24, 3);
    g.audio.play('boom', c);
    g.grid.query(c.x, c.z, 5, (u) => {
      if (!u.alive || u.team === this.team || u === t) return;
      const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
      if (d > 3.8 + u.radius || Math.abs(u.pos.y - c.y) > 3) return;
      g.damage(u, this.dmg * (1 - 0.4 * Math.min(1, d / 3.8)), this, { melee: true, splash: true });
      if (u.alive && u.stagger) u.stagger(0.9, this);
    });
    if (t && t.alive) {
      const mult = t.isStructure ? this.structMult : t.isSiege ? this.siegeBonus : 1;
      if (this.distTo(t) <= this.range + 1.5) g.damage(t, this.dmg * mult, this, { melee: true, splash: !t.isStructure && !t.isSiege });
      if (t.alive && t.stagger && !t.isStructure) t.stagger(0.9, this);
    }
    const s = g.siegeAt(c, this.team, 3);
    if (s && s !== t) g.damage(s, this.dmg * this.siegeBonus, this, { melee: true });
    for (const h of g.humans) {
      const d = Math.hypot(h.pos.x - c.x, h.pos.z - c.z);
      if (d < 35) g.deliver(h, { k: 'shake', a: 0.5 * (1 - d / 35) });
    }
  }

  // --- experience ---
  gainXp(n) {
    if (this.team === RAIDER_TEAM || this.isHero || this.isGiant || !this.alive) return;
    this.xp += n;
    while (this.rank < 5 && this.xp >= RANKS.xp[this.rank]) {
      this.rank++;
      this.applyRankBonus(this.rank);
      this.game.fx.gold(this.chest(new THREE.Vector3()).setY(this.pos.y + this.height + 0.3));
      this.game.onUnitRankUp(this);
    }
  }

  applyRankBonus() {
    const gainHp = this.maxHp * RANKS.hp;
    this.maxHp += gainHp;
    this.hp += gainHp;
    this.dmg *= 1 + RANKS.dmg;
    this.armor += RANKS.armor;
    this.setRankVisual(this.rank);
  }

  // veterans wear a plume: team colour from rank 3, gold at rank 5
  setRankVisual(rank) {
    this.rank = rank;
    if (this.plume) { this.plume.parent.remove(this.plume); this.plume = null; }
    if (rank < 3 || this.mounted && !this.model) return;
    const color = rank >= 5 ? 0xe8b830 : TEAM_COLORS[this.team] ?? 0xffffff;
    if (!PLUME_MATS.has(color)) PLUME_MATS.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    const m = new THREE.Mesh(PLUME_GEO, PLUME_MATS.get(color));
    m.position.set(0, 1.93 + (rank >= 4 ? 0.03 : 0), -0.03);
    m.scale.setScalar(rank >= 4 ? 1.25 : 1);
    m.rotation.x = -0.35;
    m.castShadow = true;
    this.model.torso.add(m);
    this.plume = m;
  }

  stagger(sec, from) {
    if (this.isGiant) return;
    this.staggerT = Math.max(this.staggerT, sec);
    this.staggerMax = this.staggerT;
    this.swingT = -1;
    this.feint = false;
    this.attackTimer = Math.max(this.attackTimer, sec + 0.25);
    if (from && from.pos) {
      const dx = this.pos.x - from.pos.x, dz = this.pos.z - from.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const push = this.mounted ? 1 : 3.5;
      this.vel.x = (dx / d) * push; this.vel.z = (dz / d) * push;
    }
  }

  // Try to block an incoming hit. Returns true when the blow is stopped.
  tryBlock(attacker, info) {
    if (!attacker || !attacker.pos || this.staggerT > 0 || this.post || this.isGiant) return false;
    if (this.swingT >= 0 && this.swingT < 0.45) return false; // busy attacking
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = attacker.pos.x - this.pos.x, dz = attacker.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d < 0.4) return false; // hit from the side or behind
    let chance;
    if (info.ranged) chance = this.hasShield ? 0.35 : 0;
    else chance = this.def.boss ? 0.45 : this.isHero ? 0.55 : this.hasShield ? 0.22 : 0.06;
    if (this.braced) chance = Math.max(chance, info.ranged ? 0.7 : 0.6); // locked shields
    if (this.mounted) chance *= 0.5;
    if (info.charge >= 0.8) chance *= 0.6;                                   // heavy blows break through
    if (attacker.feintedAt !== undefined && this.game.time - attacker.feintedAt < 1.2) chance *= 0.35; // fell for a feint
    if (Math.random() >= chance) return false;
    this.blockFlash = 0.35;
    if (!info.ranged) this.attackTimer = Math.min(this.attackTimer, 0.35); // quick riposte
    return true;
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
        const F = FORMATIONS[fac.formation] || FORMATIONS.line;
        const cols = Math.min(F.cols, 6);
        const row = Math.floor(this.slot / cols), col = (this.slot % cols) - (cols - 1) / 2;
        const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
        tmp.set(hero.pos.x - fx * (3 + row * F.sz) + fz * col * F.sx, 0, hero.pos.z - fz * (3 + row * F.sz) - fx * col * F.sx);
        this.goal = tmp.clone();
        engage = this.ranged ? Math.min(this.range, 32) : 10;
        anchor = hero.pos; leash = 18;
        break;
      }
      case 'hold': {
        const d = this.orderData;
        const F = FORMATIONS[fac.formation] || FORMATIONS.line;
        const row = Math.floor(this.slot / F.cols), col = (this.slot % F.cols) - (F.cols - 1) / 2;
        const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
        this.goal = new THREE.Vector3(d.pos.x + fz * col * F.sx - fx * row * F.sz, 0, d.pos.z - fx * col * F.sx - fz * row * F.sz);
        // a shield wall holds its line: it only fights what comes within arm's reach
        const wall = fac.formation === 'shieldwall' && !this.ranged;
        engage = this.ranged ? this.range : wall ? 2.8 : 5;
        anchor = this.goal; leash = this.ranged ? this.range + 5 : wall ? 3 : 8;
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
      const c = this.shotOrigin(new THREE.Vector3());
      const tc = this.target.isStructure ? this.target.pos : this.target.aimPoint ? this.target.aimPoint(new THREE.Vector3()) : this.target.chest(new THREE.Vector3());
      this.los = g.physics.lineClear(c.x, c.y, c.z, tc.x, tc.y, tc.z, this.team) || this.target.isStructure;
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

  // Where an enemy should aim: the head for someone sheltering behind battlements, else the chest.
  aimPoint(out) {
    if (!this.post) return this.chest(out);
    return out.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
  }

  // Where arrows leave from: chest height, or head height when leaning over the battlements.
  shotOrigin(out) {
    this.chest(out);
    out.y += this.post ? this.height * 0.27 : 0.25;
    return out;
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
    if (this.blockFlash > 0) this.blockFlash -= dt;
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (Math.random() < dt * 6) g.fx.frost(this.chest(new THREE.Vector3()), 1); }

    let moving = false;
    const tgt = this.target;
    let face = null;

    if (this.staggerT > 0) {
      // reeling from a heavy blow: no attacks, sliding back
      this.staggerT -= dt;
      this.vel.multiplyScalar(Math.pow(0.02, dt));
      this.applyMovement(dt, true);
      this.animate(dt, false);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
      return;
    }

    if (tgt && tgt.alive) {
      const d = this.distTo(tgt);
      // archers with nothing to shoot help batter the gate by hand
      const reach = tgt.isStructure ? (this.ranged ? 2.2 : this.range) + 0.6 : this.range;
      if (d <= reach && (!this.ranged || tgt.isStructure || this.los)) {
        face = tgt.pos;
        if (this.attackTimer <= 0 && this.swingT < 0) this.startAttack();
        else if (this.isHero && !this.mounted && !tgt.isStructure && this.swingT < 0) moving = this.circle(tgt, d, dt);
        if (this.mounted && !tgt.isStructure) {
          // cavalry rides through its target instead of stopping
          face = null;
          moving = this.moveToward(tgt.pos, dt, 0);
        }
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

    const fac = g.factions[this.team];
    this.braced = this.order === 'hold' && !this.ranged && this.hasShield && fac && fac.formation === 'shieldwall' && this.swingT < 0;
    if (face) this.faceTo(face, dt);
    else if (!moving && this.order === 'hold' && this.orderData) this.turnTo(this.orderData.yaw, dt);
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
          // still wedged against something after a nudge: let it slip past tree trunks for a moment
          if (++this.stuckCount >= 2) this.ghostT = 1.5;
        } else this.stuckCount = 0;
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
    const fac = this.game.factions[this.team];
    let sp = this.speed * (this.order === 'hold' && d < 3 ? 0.6 : 1);
    if (this.slowT > 0) sp *= 0.5;
    if (fac && fac.formation === 'shieldwall' && this.order === 'follow' && !this.mounted) sp *= 0.7;
    const k = Math.min(1, dt * (this.mounted ? 2.2 : 8));
    let ux = dx / d, uz = dz / d;
    const steer = this.game.physics.steerAroundTrees(this.pos.x, this.pos.z, ux, uz, this.radius, this.id % 2 ? 1 : -1);
    if (steer) { ux = steer.x; uz = steer.z; }
    this.vel.x += (ux * sp - this.vel.x) * k;
    this.vel.z += (uz * sp - this.vel.z) * k;
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
    g.physics.resolve(this.pos, this.radius, this.pos.y, this.height, this.team, this.ghostT > 0);
    const ground = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    if (ground < this.pos.y - 0.05) this.pos.y = Math.max(ground, this.pos.y - 12 * dt);
    else this.pos.y = ground;
  }

  faceTo(p, dt) { this.turnTo(Math.atan2(p.x - this.pos.x, p.z - this.pos.z), dt); }
  turnTo(target, dt) {
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * (this.mounted ? 3.5 : 10));
  }

  // heroes circle their opponent between attacks instead of standing still
  circle(tgt, d, dt) {
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 1.2; if (Math.random() < 0.6) this.strafeSide *= -1; }
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const back = d < this.range * 0.5 ? -0.8 : 0;  // keep a little distance
    const sx = (-dz / l) * this.strafeSide + (dx / l) * back, sz = (dx / l) * this.strafeSide + (dz / l) * back;
    const sp = 1.7;
    this.vel.x += (sx * sp - this.vel.x) * Math.min(1, dt * 6);
    this.vel.z += (sz * sp - this.vel.z) * Math.min(1, dt * 6);
    this.applyMovement(dt, false);
    return true;
  }

  chooseAttackDir() {
    const dirs = attackDirsFor(this.def.weapon);
    const t = this.target;
    // a hero aims where its opponent isn't guarding
    if (this.isGiant) return Math.random() < 0.5 ? 'over' : 'right';
    if (this.isHero && t && t.isPlayer && t.blocking && dirs.length > 1 && Math.random() < 0.75) {
      const open = dirs.filter((d) => d !== t.blockDir);
      return open[Math.floor(Math.random() * open.length)];
    }
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  startAttack() {
    this.swingT = 0;
    this.struck = false;
    this.attackDir = this.def.spell ? 'thrust' : this.chooseAttackDir();
    this.feint = this.isHero && !this.ranged && Math.random() < 0.22;
    this.attackTimer = this.cd * (0.9 + Math.random() * 0.2);
    if (!this.ranged) this.game.audio.play('swing', this.pos);
  }

  updateAttack(dt) {
    this.swingT += dt * (this.isGiant ? 0.45 : 1); // giants wind up slowly
    if (this.feint && this.swingT >= 0.18) {
      // feint: abandon the wind-up and come in from another side
      this.feint = false;
      this.swingT = -1;
      this.attackTimer = 0.12;
      this.feintedAt = this.game.time;
      return;
    }
    const strikeAt = this.ranged ? 0.55 : 0.32;
    if (!this.struck && this.swingT >= strikeAt) {
      this.struck = true;
      const t = this.target;
      if (t && t.alive) {
        if (this.isGiant) {
          this.giantSmash(t);
        } else if (this.def.spell && !t.isStructure) {
          // casters hurl their spell straight at where the target will be
          const from = this.chest(new THREE.Vector3());
          from.y += 0.3;
          const aim = t.chest ? t.chest(new THREE.Vector3()) : t.pos.clone();
          const lead = from.distanceTo(aim) / 38;
          if (t.vel) aim.addScaledVector(t.vel, lead * 0.8);
          this.game.magic.cast(this, this.def.spell, from, aim.sub(from).normalize(), 0, this.dmg / 55);
        } else if (this.ranged && !t.isStructure) {
          const from = this.shotOrigin(new THREE.Vector3());
          // a head peeking over battlements is a small target: harder to hit
          this.game.projectiles.shootArrow(from, t, this.team, this.dmg, this, t.post ? 0.07 : 0.035);
          this.game.audio.play('bow', this.pos);
        } else if (this.distTo(t) <= (this.ranged ? 2.2 : this.range) + 1.0) {
          const mult = (t.isStructure ? this.structMult : t.isSiege ? this.siegeBonus : 1) * (this.ranged ? 0.5 : 1);
          const charge = this.mounted ? 1 + Math.max(0, Math.hypot(this.vel.x, this.vel.z) - 3) / 8 : 1;
          this.game.damage(t, this.dmg * mult * charge * (0.85 + Math.random() * 0.3), this, { melee: true, attackDir: this.attackDir });
        }
      }
    }
    if (this.swingT > (this.ranged ? 0.9 : 0.62)) this.swingT = -1;
  }

  // 0 near (animated, shadows) · 1 mid (animated) · 2 far (static mesh) · 3 hidden
  setLod(level) {
    if (level === this.lod) return;
    const m = this.model;
    const rig = this.horse ? [this.horse.root, m.root] : [m.body];
    for (const r of rig) r.visible = level <= 1;
    this.far.visible = level === 2;
    this.mesh.visible = level <= 2;
    if ((level === 0) !== (this.lod === 0)) {
      const cast = level === 0;
      for (const r of rig) r.traverse((o) => { if (o.isMesh) o.castShadow = cast; });
    }
    this.lod = level;
  }

  animate(dt, moving) {
    if (this.lod >= 2) return; // nobody can see the limbs from here
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (moving) this.walkPhase += dt * sp * (this.mounted ? 0.0 : 2.1);
    this.idleT += dt;
    if (this.horse) {
      poseHorse(this.horse, moving ? sp : 0, dt);
      this.walkPhase = this.horse.phase;
    }
    const stag = this.staggerT > 0 ? Math.min(1, this.staggerT / Math.max(0.2, (this.staggerMax || 0.5) * 0.5)) : 0;
    if (this.isGiant && moving) {
      // the ground shakes under each step
      const step = Math.floor(this.walkPhase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.game.fx.stomp(this.pos.clone().setY(this.pos.y + 0.2));
        this.game.audio.play('stomp', this.pos);
        const p = this.game.player;
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (d < 30) p.shake = Math.max(p.shake, 0.2 * (1 - d / 30));
      }
    }
    poseSoldier(this.model, {
      phase: this.walkPhase, speed: sp, moving, swingT: this.swingT, attackDir: this.attackDir,
      stagger: stag, blocking: this.blockFlash > 0 || this.braced, mounted: this.mounted, idle: this.idleT,
    });
  }

  // network client: glide toward the host's latest position and animate
  netUpdate(dt) {
    const t = NET_SAMPLE;
    const has = this.interp && this.interp.sample(t);
    if (has) {
      this.pos.set(t.x, t.y, t.z);
      this.yaw = t.yaw;
      this.vel.set(Math.sin(this.yaw) * t.extra, 0, Math.cos(this.yaw) * t.extra);
    }
    if (!this.alive) { this.animateDeath(dt); return; }
    if (this.swingT >= 0) { this.swingT += dt; if (this.swingT > (this.ranged ? 0.9 : 0.62)) this.swingT = -1; }
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.blockFlash > 0) this.blockFlash -= dt;
    this.animate(dt, has ? t.extra > 0.3 : false);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  animateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.55);
    if (this.mounted) this.mesh.rotation.z = t * t * Math.PI / 2 * 0.95;
    else this.mesh.rotation.x = -t * t * Math.PI / 2;
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

const NET_SAMPLE = { x: 0, y: 0, z: 0, yaw: 0, extra: 0 };
const PLUME_GEO = new THREE.ConeGeometry(0.07, 0.34, 6);
const PLUME_MATS = new Map();
