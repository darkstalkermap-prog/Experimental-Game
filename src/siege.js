// Siege engines: battering rams (break gates / keeps) and catapults (break walls).
// Every engine is worked by two crewmen, who are real soldiers: they can be killed one by one, and an engine whose
// crew has all fallen is left abandoned. Anyone may then take it over: marching soldiers of any house walk over and
// take the empty seats, and a hero can climb aboard and steer it.
import * as THREE from 'three';
import { SIEGE_TYPES, UNIT_TYPES, WORLD, ENGINE_TURN } from './config.js';
import { buildEngine, flagGeometry } from './siegegeo.js';
import { Unit } from './units.js';
import { navigate, avoidCastles } from './nav.js';
import { clamp } from './noise.js';
import { allied } from './teams.js';

let NEXT_ID = 1;

export class SiegeEngine {
  constructor(game, type, team, pos, targetCastle, stats = {}) {
    this.game = game;
    this.id = NEXT_ID++;
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
    this.avoid = {};          // the corner it is going round a castle by (see nav.avoidCastles)
    this.thinkT = 0;
    this.waypoint = null;
    this.lastPos = pos.clone();   // for noticing an engine that has stopped dead
    this.stuckT = 0;
    this.detourT = 0;
    this.detourSide = 1;
    this.mesh = type === 'ram' ? this.buildRam() : this.buildCatapult();
    this.seats = type === 'ram' ? [[-1.4, -1.5], [1.4, -1.5]] : [[-1.6, -2.6], [1.6, -2.6]];   // where the crew stand (x, z)
    this.crew = [null, null];      // soldiers seated here (host); clients see them through the units
    this.crewMax = 2;
    this.crewN = 0;                // (network clients) how many are aboard
    this.abandoned = false;
    this.abandonedT = 0;
    this.driver = null;            // a hero steering it
    this.input = null;             // the driver's controls: { f, t, fire, cam, dir }
    this.moving = false;
    this.speedNow = 0;
    this.manT = 0;
    game.scene.add(this.mesh);
  }

  // The engine's own crew of engineers (host and single player only).
  spawnCrew() {
    const g = this.game;
    const f = g.factions[this.team];
    const t = UNIT_TYPES.engineer;
    for (let i = 0; i < this.crewMax; i++) {
      const u = new Unit(g, 'engineer', this.team, this.pos, { hp: Math.round(t.hp * g.trainMult(f)) });
      u.homeCastle = g.castles[this.team];
      g.units.push(u);
      this.man(u, i, true);
    }
  }

  crewAlive() {
    let n = 0;
    for (const c of this.crew) if (c && c.alive) n++;
    return n;
  }
  freeSeat() { return this.crew.findIndex((c) => !c); }
  // how well the engine runs with the crew it has (a lone man is slow)
  crewFactor() { const n = this.crewAlive(); return n >= 2 ? 1 : n === 1 ? 0.6 : 0; }

  // world position of a seat
  seatPos(slot, out) {
    const [x, z] = this.seats[slot] || [0, -2];
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    out.x = this.pos.x + x * c + z * sn;
    out.z = this.pos.z - x * sn + z * c;
    out.y = this.pos.y;
    return out;
  }

  // May this soldier take a seat? Empty engines are free for all; a manned engine takes friends only.
  canBeManned(u) {
    return this.alive && !this.driver && this.freeSeat() >= 0 && (this.abandoned || allied(this.team, u.team));
  }

  // Seat a soldier. Taking an engine nobody works for makes it theirs.
  man(u, seat = this.freeSeat(), silent = false) {
    if (seat < 0 || this.crew[seat]) return false;
    if (!silent && this.crewAlive() === 0 && u.team !== this.team) this.changeOwner(u.team);
    this.crew[seat] = u;
    u.crewOf = this;
    u.crewSlot = seat;
    u.leavePost();
    u.target = null; u.goal = null; u.waypoint = null; u.nav = null;
    u.vel.set(0, 0, 0);
    this.abandoned = false;
    this.abandonedT = 0;
    return true;
  }

  crewDied(u) {
    if (this.crew[u.crewSlot] === u) this.crew[u.crewSlot] = null;
    u.crewOf = null;
    if (this.alive && this.crewAlive() === 0 && !this.driver) this.becomeAbandoned();
  }

  becomeAbandoned() {
    if (this.abandoned) return;
    this.abandoned = true;
    this.abandonedT = 0;
    const g = this.game;
    this.vel.set(0, 0, 0);
    this.moving = false;
    g.announce((t) => (t === this.team ? `The crew of your ${this.name.toLowerCase()} has fallen. It stands abandoned: anyone can take it.` : null), this.team);
  }

  changeOwner(team) {
    if (team === this.team) return;
    const g = this.game, old = this.team;
    this.team = team;
    this.targetCastle = g.siegeTarget(g.factions[team]);
    this.wall = null;
    this.waypoint = null;
    const nm = this.name.toLowerCase();
    g.announce((t) => (t === old ? `Your ${nm} has been seized by ${g.factions[team].name}!` : t === team ? `You have taken over an enemy ${nm}!` : null), team, old);
  }

  // a hero climbs aboard (see Game.boardEngine) or leaves
  setDriver(p) {
    this.driver = p;
    this.input = null;
    this.abandoned = false;
    this.abandonedT = 0;
    if (p.team !== this.team) this.changeOwner(p.team);
  }
  clearDriver() {
    this.driver = null;
    this.input = null;
    if (this.alive && this.crewAlive() === 0) this.becomeAbandoned();
  }

  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }

  // the models live in siegegeo.js: a few meshes each, shared geometry
  buildRam() {
    const e = buildEngine('ram', this.team);
    this.wheels = e.wheels; this.log = e.log; this.flag = e.flag; this.flagTeam = e.flagTeam;
    return e.group;
  }

  buildCatapult() {
    const e = buildEngine('catapult', this.team);
    this.wheels = e.wheels; this.arm = e.arm; this.flag = e.flag; this.flagTeam = e.flagTeam;
    return e.group;
  }

  // an engine that has changed hands flies the new house's colours
  recolour() {
    if (this.flagTeam === this.team || !this.flag) return;
    this.flagTeam = this.team;
    this.flag.geometry = flagGeometry(this.type === 'ram' ? 'ram' : 'cat', this.team);
  }

  takeDamage(amt, attacker) {
    if (!this.alive) return;
    this.hp -= amt;
    this.game.fx.splinters(this.chest(new THREE.Vector3()), 4);
    if (this.hp <= 0) this.destroy(attacker);
  }

  destroy(attacker = null, collapsed = false) {
    const g = this.game;
    this.hp = 0;
    this.alive = false;
    g.fx.splinters(this.pos.clone().setY(this.pos.y + 1.5), 30);
    g.fx.dust(this.pos, 12, 2);
    g.audio.play('collapse', this.pos);
    if (this.driver) g.leaveEngine(this.driver, true);
    // the crew scramble clear: soldiers go back to the fight, engineers are lost under the wreckage
    for (let i = 0; i < this.crew.length; i++) {
      const u = this.crew[i];
      this.crew[i] = null;
      if (!u || !u.alive) continue;
      u.crewOf = null;
      if (u.isCrew) { u.alive = false; u.hp = 0; u.deathT = 0; continue; }
      u.setOrder(u.lane ? 'assault' : 'charge', u.lane ? g.siegeTarget(g.factions[u.team]) : null);
    }
    if (!collapsed) g.onSiegeDestroyed(this, attacker);
  }

  pickTarget() {
    const g = this.game;
    if (this.targetCastle && !this.targetCastle.fallen && !allied(this.targetCastle.team, this.team)) return;
    // its castle is finished: roll on to the next front the house's armies are marching on
    const next = g.siegeTarget(g.factions[this.team]);
    if (next) { this.targetCastle = next; return; }
    let best = null, bd = Infinity;
    for (const c of g.castles) {
      if (c.fallen || allied(c.team, this.team)) continue;
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
    const driven = !!(this.driver && this.driver.alive);
    // a short-handed crew works the engine more slowly
    this.timer -= dt * (driven ? 1 : Math.max(0.5, this.crewFactor()));
    // nobody wants it: an abandoned engine eventually falls apart
    if (this.abandoned && !this.driver) {
      this.abandonedT += dt;
      if (this.abandonedT > 90) { this.destroy(null, true); return; }
    }
    let moving = false;
    if (driven) moving = this.drive(dt);
    else if (this.crewAlive() > 0) moving = this.autopilot(dt);
    else { this.vel.set(0, 0, 0); this.stuckT = 0; this.lastPos.copy(this.pos); }
    this.moving = moving;
    this.speedNow = moving ? Math.hypot(this.vel.x, this.vel.z) : 0;
    if (moving) {
      for (const w of this.wheels) w.rotation.x += dt * this.speedNow * 1.7;
      this.anim += dt * this.speedNow * 2;
    }
    this.glint(dt);
    this.recolour();
    this.pos.y = g.physics.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.animateWeapon();
  }

  // The crew's own plan: roll to the target castle and batter it. Returns whether the engine moved.
  autopilot(dt) {
    const g = this.game;
    this.thinkT -= dt;
    this.pickTarget();
    const tc = this.targetCastle;
    let goal = null, faceTo = null;
    if (tc) {
      if (this.type === 'ram') {
        if (tc.gate.alive) {
          const spot = tc.gateOut.clone().lerp(tc.gatePos, 0.38);
          if (Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) < 1.6) { faceTo = tc.gatePos; this.attack(tc.gate); }
          else goal = spot;
        } else {
          const d = Math.hypot(tc.keepDoor.x - this.pos.x, tc.keepDoor.z - this.pos.z);
          if (d < 3) { faceTo = tc.keep.pos; this.attack(tc.keep); }
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
          faceTo = aim;
          if (this.timer <= 0) this.fire(aim);
        } else goal = fire;
      }
    }

    if (!goal) {
      this.vel.set(0, 0, 0);
      this.stuckT = 0;
      this.lastPos.copy(this.pos);
      if (faceTo) this.turn(Math.atan2(faceTo.x - this.pos.x, faceTo.z - this.pos.z), dt);
      return false;
    }
    if (this.thinkT <= 0) {
      this.thinkT = 0.4;
      this.waypoint = this.type === 'ram' ? navigate(g, this, goal) : avoidCastles(g, this.pos, goal, this.avoid);
    }
    const wp = this.waypoint || goal;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let ux = dx / d, uz = dz / d;
    // engines roll through tree trunks but go round the standing stones
    const around = g.physics.steerAroundTrees(this.pos.x, this.pos.z, ux, uz, 1.9, this.id % 2 ? 1 : -1, 'stone');
    if (around) { ux = around.x; uz = around.z; }
    // an engine that has stopped dead for a few seconds swings out sideways for a moment
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      if (Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) < 0.6) { this.detourT = 2.5; this.detourSide = Math.random() < 0.5 ? 1 : -1; }
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
    }
    if (this.detourT > 0) {
      this.detourT -= dt;
      const sx = -uz * this.detourSide, sz = ux * this.detourSide;
      const l = Math.hypot(sx + ux * 0.4, sz + uz * 0.4) || 1;
      ux = (sx + ux * 0.4) / l; uz = (sz + uz * 0.4) / l;
    }
    const sp = this.speed * this.crewFactor();
    this.vel.set(ux * sp, 0, uz * sp);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const L = WORLD.playHalf;
    this.pos.x = clamp(this.pos.x, -L, L);
    this.pos.z = clamp(this.pos.z, -L, L);
    g.physics.resolve(this.pos, 1.6, this.pos.y, 3, this.team, true); // engines roll past trunks
    this.turn(Math.atan2(ux, uz), dt);
    return true;
  }

  // A hero at the controls: W/S roll it, A/D turn it, and the left button strikes (ram) or looses a boulder
  // (catapult) at whatever the hero is looking at. Returns whether the engine moved.
  drive(dt) {
    const g = this.game;
    const inp = this.input || { f: 0, t: 0, fire: false };
    this.yaw += inp.t * ENGINE_TURN * dt;
    const sp = inp.f * this.speed * (inp.f < 0 ? 0.55 : 1);
    this.vel.set(Math.sin(this.yaw) * sp, 0, Math.cos(this.yaw) * sp);
    if (inp.f) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const L = WORLD.playHalf;
      this.pos.x = clamp(this.pos.x, -L, L);
      this.pos.z = clamp(this.pos.z, -L, L);
      g.physics.resolve(this.pos, 1.6, this.pos.y, 3, this.team, true);
    }
    if (inp.fire && this.timer <= 0) {
      if (this.type === 'ram') this.ramSwing();
      else this.catapultShot(inp);
    }
    // the hero rides inside
    const d = this.driver;
    d.pos.set(this.pos.x, this.pos.y + 1, this.pos.z);
    return Math.abs(sp) > 0.05 || Math.abs(inp.t) > 0.05;
  }

  // The ram's head is swung at whatever stands in front of it.
  ramSwing() {
    const g = this.game;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const tip = new THREE.Vector3(this.pos.x + fx * 3.4, this.pos.y + 1.5, this.pos.z + fz * 3.4);
    let hit = null;
    for (const c of g.castles) {
      if (c.fallen || allied(c.team, this.team)) continue;
      for (const st of [c.gate, c.keep]) {
        if (!st.alive) continue;
        if (Math.hypot(tip.x - st.pos.x, tip.z - st.pos.z) < st.radius + 1.2) { hit = st; break; }
      }
      if (hit) break;
    }
    if (!hit) hit = g.siegeAt(tip, this.team, 1.6);
    if (hit) {
      hit.takeDamage(this.dmg, this);
      g.audio.play('thud', this.pos);
      g.fx.dust(tip.clone().setY(this.pos.y + 0.5), 6, 1);
    }
    // anyone in the way is crushed
    g.grid.query(tip.x, tip.z, 3, (u) => {
      if (!u.alive || allied(u.team, this.team) || u.drive) return;
      if (Math.hypot(u.pos.x - tip.x, u.pos.z - tip.z) > 2.4 + u.radius) return;
      g.damage(u, this.dmg * 0.45, this, { melee: true, splash: true, charge: 1 });
      if (u.alive && u.stagger) u.stagger(0.9, this);
      hit = hit || u;
    });
    // a swing that finds nothing is quickly drawn back for another
    this.timer = hit ? this.cd : 0.5;
    if (!hit) g.audio.play('swing', this.pos);
  }

  // Loose a boulder at the spot the hero is looking at (kept within the catapult's reach).
  catapultShot(inp) {
    const g = this.game;
    let at;
    if (inp.cam && inp.dir) at = g.abilities.rayHit(inp.cam, inp.dir, 120, this.team).pos;
    else at = this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 40, 0, Math.cos(this.yaw) * 40));
    const dx = at.x - this.pos.x, dz = at.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = Math.min(this.range, Math.max(14, d)) / d;
    at.x = this.pos.x + dx * k; at.z = this.pos.z + dz * k;
    if (k !== 1) at.y = g.physics.terrainHeight(at.x, at.z);
    this.fire(at);
  }

  // network client: follow the host's position and animate
  netUpdate(dt) {
    const t = {};
    const has = this.interp && this.interp.sample(t);
    if (has) { this.pos.set(t.x, t.y, t.z); this.yaw = t.yaw; t.moving = t.extra; }
    if (!this.alive) {
      this.deadT += dt;
      this.mesh.rotation.z = Math.min(0.35, this.deadT * 0.5);
      this.mesh.position.set(this.pos.x, this.pos.y - Math.min(1.2, this.deadT * 0.3), this.pos.z);
      return;
    }
    this.moving = !!(has && t.moving);
    this.speedNow = this.moving ? this.speed : 0;
    if (this.moving) {
      for (const w of this.wheels) w.rotation.x += dt * this.speed * 1.7;
      this.anim += dt * this.speed * 2;
    }
    this.timer -= dt;
    this.glint(dt);
    this.recolour();
    this.animateWeapon();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  // Gold motes drift off an engine that nobody is working: it is there for the taking.
  glint(dt) {
    if (this.abandoned && !this.driver && !this.driven && Math.random() < dt * 3) this.game.fx.gold(new THREE.Vector3(this.pos.x, this.pos.y + 3.4, this.pos.z));
  }

  animateWeapon() {
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
