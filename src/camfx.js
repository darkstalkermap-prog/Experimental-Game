// Camera effects: what the view does when something happens to the hero or near them. All of it is small on purpose and none of it touches
// the simulation: after the hero has placed the camera for the frame, this nudges it (a few tenths of a degree of shake, a kick when a
// blow lands, a punch of field of view when a charge starts) and drives the colour hooks of the post pass (gfx.post.cam: drain the colour
// when health is low, fade to black on death and back in on the respawn, a golden flash on a level up). The HUD's own red vignette is left
// alone: this only takes colour out, it never paints over the picture. People who ask their system for reduced motion get a third of it.
import * as THREE from 'three';
import { gfx } from './gfx.js';
import { allied } from './teams.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAN = Math.tan, DEG = Math.PI / 180;

// a spring that settles without ringing much: x follows 0, v is its speed
function spring(s, dt, k, c) {
  s.v += (-k * s.x - c * s.v) * dt;
  s.x += s.v * dt;
}

export class CamFx {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.trauma = 0;                       // 0..1: the shake (its strength is trauma squared)
    this.pitch = { x: 0, v: 0 }; this.yaw = { x: 0, v: 0 }; this.roll = { x: 0, v: 0 };   // the kicks, in degrees
    this.punch = { x: 0, v: 0 };           // widening of the field of view, in degrees
    this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1); this.flashDecay = 2;
    this.deadT = 0;
    this.last = { hurt: 0, alive: true, level: 1, charging: false, hp: 1 };
    this.pulse = 0;
    this.zoom = 1;
    this.mute = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  amp() { return this.mute ? 0.33 : 1; }

  // something went off at world position p (a collapse, a boulder landing, lightning, a smite): the nearer, the harder
  boom(p, strength = 0.5) {
    const c = this.g.camera.position;
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    const a = strength * Math.pow(clamp(1 - d / 48, 0, 1), 2);
    if (a < 0.02) return;
    this.trauma = Math.min(1, this.trauma + a * 0.9);
    this.pitch.v -= a * 26 * this.amp();   // (a short jolt, then the shake)
  }

  // the hero was struck: the view is pushed away from whoever did it (the nearest enemy stands in for the direction)
  hurt(amount) {
    const g = this.g, p = g.player, a = this.amp();
    let side = (Math.sin(this.t * 91.7) > 0 ? 1 : -1) * 0.6, front = 0.4;
    let best = null, bd = 81;
    for (const u of g.units) {
      if (!u.alive || allied(u.team, p.team)) continue;
      const d2 = (u.pos.x - p.pos.x) ** 2 + (u.pos.z - p.pos.z) ** 2;
      if (d2 < bd) { bd = d2; best = u; }
    }
    if (best) {
      // the enemy's direction on the screen: right and ahead of where the hero looks
      const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      front = (dx * fx + dz * fz) / l;
      side = (dx * fz - dz * fx) / l;       // > 0: to the hero's left (the camera looks along +yaw, so +x of the screen is -side)
    }
    const k = clamp(0.35 + amount * 1.4, 0.35, 1.2) * a;
    this.yaw.v -= side * k * 22;           // the view turns away from the blow (a camera turns left with a positive yaw)
    this.roll.v -= side * k * 26;
    this.pitch.v += (0.5 + 0.5 * Math.abs(front)) * k * 20;    // and nods
    this.trauma = Math.min(1, this.trauma + 0.18 * k);
  }

  // called once a frame after the hero has placed the camera (Game.update)
  update(dt) {
    const g = this.g, p = g.player, cam = g.camera, a = this.amp();
    if (g.state !== 'playing' && g.state !== 'over') { this.reset(); return; }
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const L = this.last;
    // ---- events, read off the hero's state (the same on the host, in single player and on a guest)
    if (p.alive) {
      if (p.hurtFlash > L.hurt + 0.2) this.hurt(p.hurtFlash - L.hurt);
      const charging = p.buffs.has('charging');
      if (charging && !L.charging) { this.punch.v += 60 * a; this.trauma = Math.min(1, this.trauma + 0.25 * a); }
      if (charging) this.trauma = Math.max(this.trauma, 0.2 * a);   // (a rumble for as long as the horse gallops flat out)
      L.charging = charging;
      if (p.level > L.level && L.alive) { this.flashFrom(1.0, 0.8, 0.35, 0.3, 1.6); this.punch.v += 30 * a; }
      L.level = p.level;
    } else L.charging = false;
    L.hurt = p.hurtFlash;
    if (p.alive && !L.alive) this.flashFrom(0, 0, 0, 1, 1.1);        // back from the dead: the screen opens from black
    if (!p.alive && L.alive) { this.trauma = Math.min(1, this.trauma + 0.5 * a); this.pitch.v += 24 * a; }
    L.alive = p.alive;
    this.deadT = p.alive ? 0 : this.deadT + dt;

    // ---- the shake and the kicks
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    spring(this.pitch, dt, 90, 12); spring(this.yaw, dt, 90, 12); spring(this.roll, dt, 80, 11);
    spring(this.punch, dt, 160, 9);
    const s = this.trauma * this.trauma * a, t = this.t;
    const n = (f, seed) => Math.sin(t * f + seed) * 0.6 + Math.sin(t * f * 2.31 + seed * 1.7) * 0.4;
    cam.rotation.x += this.pitch.x * DEG + s * 0.016 * n(31, 1.3);
    cam.rotation.y += this.yaw.x * DEG + s * 0.016 * n(27, 4.1);
    cam.rotation.z += this.roll.x * DEG + s * 0.03 * n(23, 2.2);
    // the field of view: a zoom factor on the projection (the hero's own easing of cam.fov is not disturbed)
    const f0 = cam.fov, wide = clamp(this.punch.x, -10, 14);
    const zoom = Math.abs(wide) < 0.02 ? 1 : TAN(f0 * Math.PI / 360) / TAN((f0 + wide) * Math.PI / 360);
    if (Math.abs(zoom - this.zoom) > 1e-4 || (zoom === 1 && cam.zoom !== 1)) { this.zoom = zoom; cam.zoom = zoom; cam.updateProjectionMatrix(); }

    // ---- colour: drained when health is low (to the beat of a heart), black on death, a flash that fades
    const cc = gfx.post && gfx.post.cam;
    if (cc) {
      const low = p.alive ? clamp((0.34 - p.hp / p.maxHp) / 0.34, 0, 1) : 0;
      this.pulse = low > 0 ? 0.5 + 0.5 * Math.sin(t * (5.2 + 3 * low)) : 0;
      let des = low * (0.26 + 0.16 * this.pulse);
      if (!p.alive) des = Math.max(des, clamp(this.deadT * 0.8, 0, 0.8));
      cc.desaturate = des;
      let fl = this.flash, col = this.flashColor;
      if (!p.alive) {                                                    // fading to black while dead
        const dark = clamp((this.deadT - 0.4) * 0.5, 0, 0.7);
        if (dark > fl) { fl = dark; col = BLACK; }
      }
      cc.flash = fl;
      cc.flashColor.copy(col);
    }
    this.flash = Math.max(0, this.flash - dt * this.flashDecay);
  }

  flashFrom(r, g, b, amount, decay) {
    this.flashColor.setRGB(r, g, b);
    this.flash = amount; this.flashDecay = decay;
  }

  reset() {
    this.trauma = 0; this.flash = 0; this.deadT = 0;
    for (const s of [this.pitch, this.yaw, this.roll, this.punch]) { s.x = 0; s.v = 0; }
    const cam = this.g.camera;
    if (cam.zoom !== 1) { cam.zoom = 1; this.zoom = 1; cam.updateProjectionMatrix(); }
    const cc = gfx.post && gfx.post.cam;
    if (cc) { cc.desaturate = 0; cc.flash = 0; }
    this.last.alive = true;
  }

  dispose() { this.reset(); }
}

const BLACK = new THREE.Color(0, 0, 0);
