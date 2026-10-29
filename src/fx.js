// Particle effects: dust, blood, smoke, sparks, splinters, fire, frost and the rest, drawn as soft textured sprites from two pooled
// GPU layers (normal blending for dust, smoke and debris; additive for fire, sparks and glows) plus pooled ground decals for
// blood, scorch marks and craters (see particles.js and fxtex.js). Every effect here is a recipe that writes a handful of particles;
// counts scale with `Q.particles`. The names other code calls (and the host replicates to guests: blood, sparks, dust, splinters,
// levelUp) keep their argument lists; recipes the host does not replicate, because each screen derives them from replicated state,
// have their own names (impact, crater, smokeTrail, ...), so a call that runs on every screen never reaches a guest twice.
import * as THREE from 'three';
import { Q } from './quality.js';
import { ParticleLayer, DecalLayer } from './particles.js';
import { F, R, D } from './fxtex.js';
import * as WORLD from './world.js';

const MAX_ALPHA = 3200;
const MAX_ADD = 2400;
const MAX_DECALS = 384;
const TAU = Math.PI * 2;
const rr = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const C = {
  wood: [col(0x8a5a30), col(0xb58450), col(0x6e4624), col(0xa8794a)],
  stone: [col(0x8c8a84), col(0x6f6d68), col(0xa09c92), col(0x7c7a74)],
  earth: [col(0x6b5237), col(0x56402a), col(0x7a6444), col(0x8a7350)],
  dust: [1, 0.97, 0.92],
  dustStone: [0.82, 0.84, 0.86],
  dustEarth: [0.9, 0.78, 0.62],
  gold: col(0xffc23a),
  frost: col(0x9adcff),
  bolt: col(0xb8dcff),
  fire: col(0xff9a30),
  level: col(0xffd85a),
};

// a random unit vector within `spread` of the unit vector d, left in _d (no allocation)
const _d = { x: 0, y: 0, z: 0 };
function cone(dx, dy, dz, spread) {
  const ax = Math.abs(dy) < 0.9 ? 0 : 1, ay = ax ? 0 : 1;
  let t1x = -dz * ay, t1y = dz * ax, t1z = dx * ay - dy * ax;
  const l1 = Math.hypot(t1x, t1y, t1z) || 1;
  t1x /= l1; t1y /= l1; t1z /= l1;
  const t2x = dy * t1z - dz * t1y, t2y = dz * t1x - dx * t1z, t2z = dx * t1y - dy * t1x;
  const a = (Math.random() - 0.5) * 2 * spread, b = (Math.random() - 0.5) * 2 * spread;
  const x = dx + t1x * a + t2x * b, y = dy + t1y * a + t2y * b, z = dz + t1z * a + t2z * b;
  const l = Math.hypot(x, y, z) || 1;
  _d.x = x / l; _d.y = y / l; _d.z = z / l;
}

export class FX {
  constructor(scene, game = null) {
    this.game = game;
    this.clock = { t: 0 };
    this.alpha = new ParticleLayer(scene, this.clock, { max: MAX_ALPHA, additive: false, order: 3, name: 'smoke' });
    this.add = new ParticleLayer(scene, this.clock, { max: MAX_ADD, additive: true, order: 4, name: 'glow' });
    this.decals = new DecalLayer(scene, this.clock, MAX_DECALS);
    // what the scene's lights say, relative to the first reading, so smoke and dust are dimmer at dusk and warmer at sunset
    this.light = new THREE.Vector3(1, 1, 1);
    this.lightBase = null;
    this.lightT = 0;
    this.scene = scene;
    // drops of blood in the air that will leave a mark where they land: [when, x, y, z, size] in a ring
    this.pend = new Float32Array(5 * 48);
    this.pendN = 0;
    this.tokens = 24;       // how many decals may still be laid this second (a crowd must not wipe out the older ones at once)
    this._lx = 0; this._ly = 0; this._lz = 0;
    // the old two-layer interface (fx.glow.emit(...)) still works: glow is the additive layer
    this.glow = {
      emit: (p, v, color, size, life, o) => this.legacy(this.add, p, v, color, size, life, o),
      burst: (p, n, color, speed, size, life, o) => this.legacyBurst(this.add, p, n, color, speed, size, life, o),
    };
  }

  setScale() { /* sprites are sized in metres: nothing depends on the drawing buffer any more */ }

  // how many particles an effect of nominal size n may spawn at this quality
  q(n) {
    const x = n * Q.particles, f = Math.floor(x);
    return f + (Math.random() < x - f ? 1 : 0);
  }

  ground(x, z, y) {
    const ph = this.game && this.game.physics;
    return ph ? ph.groundHeight(x, z, y + 0.3) : y;
  }

  // ---------- the old interface ----------
  legacy(layer, p, v, color, size, life, { grow = 0, grav = 0, alpha = 1 } = {}) {
    const o = layer.spawn(F.SOFT, R.POP, p.x, p.y, p.z, v.x, v.y, v.z, life, size, Math.max(0.01, size + grow * life));
    layer.tint(o, color.r, color.g, color.b, alpha);
    if (grav) layer.motion(o, 0, grav, 0, 0);
  }
  legacyBurst(layer, p, n, color, speed, size, life, opts) {
    const v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < this.q(n); i++) {
      v.x = (Math.random() - 0.5) * 2 * speed; v.y = Math.random() * 1.2 * speed; v.z = (Math.random() - 0.5) * 2 * speed;
      this.legacy(layer, p, v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), opts);
    }
  }
  emit(p, v, color, size, life, opts) { this.legacy(this.alpha, p, v, color, size, life, opts); }
  burst(p, n, color, speed, size, life, opts) { this.legacyBurst(this.alpha, p, n, color, speed, size, life, opts); }

  // ---------- flesh ----------
  // dx, dz: the way the blow went (optional; the host sends them along with the call)
  blood(p, n = 8, dx = 0, dz = 0) { this._blood(p, n, dx, dz); }
  _blood(p, n, dx, dz) {
    const A = this.alpha, k = this.q(n);
    if (k <= 0) return;
    let ux = +dx || 0, uz = +dz || 0;
    const has = ux * ux + uz * uz > 0.04;
    if (has) { const l = Math.hypot(ux, uz); ux /= l; uz /= l; }
    // a fine red mist at the wound
    const mist = 1 + Math.round(k * 0.28);
    for (let i = 0; i < mist; i++) {
      const s = rr(0.8, 2.2);
      const o = A.spawn(F.MIST, R.BLOOD, p.x + rr(-0.1, 0.1), p.y + rr(-0.15, 0.15), p.z + rr(-0.1, 0.1),
        has ? ux * s + rr(-0.5, 0.5) : rr(-1, 1) * s, rr(0.1, 0.9), has ? uz * s + rr(-0.5, 0.5) : rr(-1, 1) * s, rr(0.3, 0.5), rr(0.14, 0.22), rr(0.5, 0.85));
      A.tint(o, 1, 0.5, 0.5, 0.6);
      A.motion(o, 3.2, 0, 0, -1.2);
      A.spin(o, rr(0, TAU), rr(-1.5, 1.5));
    }
    // drops that fly, stretched along their flight, and fall; some of them stain the ground where they land
    const drops = Math.max(2, Math.round(k * 0.9));
    const l = Math.hypot(1, 0.3);
    for (let i = 0; i < drops; i++) {
      const sp = rr(2.2, 6.4);
      if (has) cone(ux / l, 0.3 / l, uz / l, 0.55);
      else { const th = rr(0, TAU), y = rr(0.1, 0.9), c = Math.sqrt(1 - y * y); _d.x = Math.cos(th) * c; _d.y = y; _d.z = Math.sin(th) * c; }
      const vx = _d.x * sp, vy = _d.y * sp, vz = _d.z * sp;
      const t = Math.max(0.12, this.land(p.x, p.y, p.z, vx, vy, vz, 9.8, 1.0));
      const w = rr(0.028, 0.05);
      const o = A.spawn(F.DROP, R.BLOOD, p.x, p.y, p.z, vx, vy, vz, t, w, w);
      A.streak(o, 0.05);
      A.motion(o, 0, 9.8, 0, 0);
      if (Math.random() < 0.4) this.queueSplat(this.clock.t + t, this._lx, this._ly, this._lz, rr(0.22, 0.5));
    }
  }

  // time until a thing thrown from (x,y,z) with that velocity meets the ground; the place is left in _lx/_ly/_lz
  land(x, y, z, vx, vy, vz, g, maxT) {
    let t = 0.1, gy = this.ground(x, z, y);
    for (let it = 0; it < 2; it++) {
      const disc = vy * vy + 2 * g * (y - gy);
      t = disc > 0 ? (vy + Math.sqrt(disc)) / g : 0.05;
      if (t > maxT) t = maxT;
      gy = this.ground(x + vx * t, z + vz * t, y);
    }
    this._lx = x + vx * t; this._lz = z + vz * t; this._ly = gy;
    return t;
  }

  queueSplat(when, x, y, z, size) {
    if (Q.particles < 0.8 || !Q.decals || this.pendN >= 48) return;
    const o = this.pendN++ * 5, a = this.pend;
    a[o] = when; a[o + 1] = x; a[o + 2] = y; a[o + 3] = z; a[o + 4] = size;
  }

  // ---------- ground marks ----------
  // a decal of the given kind (D.*) lying on the ground at (x, z), following its slope
  mark(kind, x, y, z, size, life, r, g, b, a) {
    if (!this.game || Q.particles < 0.8 || !Q.decals) return;
    if (this.tokens < 1) return;
    this.tokens -= 1;
    const cap = Math.max(48, Math.min(MAX_DECALS, Q.decals, Math.round(MAX_DECALS * Q.particles / 1.3)));
    this.decals.cap = cap;
    const ang = rr(0, TAU), cs = Math.cos(ang), sn = Math.sin(ang);
    const gy = (cx, cy) => this.ground(x + (cs * cx - sn * cy) * size, z + (sn * cx + cs * cy) * size, y);
    this.decals.add(x, z, ang, size, gy(-0.5, -0.5), gy(0.5, -0.5), gy(0.5, 0.5), gy(-0.5, 0.5), life, kind, r, g, b, a);
  }
  splat(x, y, z, size) {
    this.mark(Math.random() < 0.5 ? D.BLOOD1 : D.BLOOD2, x, y, z, size, rr(26, 38), 0.2, 0.006, 0.006, 0.92);
  }

  // ---------- sparks and metal ----------
  sparks(p, n = 10) { this._sparks(p, n); }
  _sparks(p, n) {
    const G = this.add, k = this.q(n);
    if (k <= 0) return;
    const big = n >= 18;
    let o = G.spawn(F.SOFT, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.1, 0.4 + n * 0.012, 0.9 + n * 0.03);
    G.tint(o, 2.2, 1.3, 0.5, 0.8);
    o = G.spawn(F.STAR, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.1, 0.3 + n * 0.012, 0.55 + n * 0.025);
    G.tint(o, 2.0, 1.7, 1.0, 1);
    G.spin(o, rr(0, TAU), 0);
    if (big) {   // a parry or a shield bash: a ring of light as well
      o = G.spawn(F.RING, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.2, 0.2, 1.7);
      G.tint(o, 1.6, 1.2, 0.7, 0.8);
      G.motion(o, 0, 0, 0, -1.5);
    }
    for (let i = 0; i < k; i++) {
      const sp = rr(2.5, 9);
      const th = rr(0, TAU), y = rr(-0.25, 1), c = Math.sqrt(Math.max(0, 1 - y * y));
      o = G.spawn(F.STREAK, R.HOT, p.x, p.y, p.z, Math.cos(th) * c * sp, y * sp, Math.sin(th) * c * sp, rr(0.22, 0.52), rr(0.035, 0.065), 0.02);
      G.streak(o, 0.05);
      G.motion(o, 0.9, 9, 0, 0);
      G.tint(o, 1.6, 1.6, 1.6, 1);
    }
    for (let i = 0, m = Math.round(k * 0.3); i < m; i++) {   // a few embers that fall slowly
      o = G.spawn(F.EMBER, R.EMBER, p.x, p.y, p.z, rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), rr(0.5, 1.0), 0.06, 0.02);
      G.motion(o, 1.2, 4, 0.1, 0);
      G.tint(o, 1.8, 1.8, 1.8, 1);
    }
  }

  // ---------- dust, rubble and earth ----------
  // kind: 'stone', 'earth' or nothing (plain dust); the host sends it along with the call
  dust(p, n = 10, spread = 2, kind = '') { this._dust(p, n, spread, kind); }
  _dust(p, n, S, kind) {
    const A = this.alpha, k = this.q(n);
    if (k <= 0) return;
    const tone = kind === 'stone' ? C.dustStone : kind === 'earth' ? C.dustEarth : C.dust;
    const big = n >= 22 || S >= 3.5;
    if (S <= 0.7) {   // a scuff: a few small puffs
      for (let i = 0, m = Math.max(1, Math.round(k * 0.5)); i < m; i++) {
        const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, p.x + rr(-S, S), p.y + rr(0, S), p.z + rr(-S, S), rr(-0.6, 0.6), rr(0.2, 0.9), rr(-0.6, 0.6), rr(0.6, 1.1), rr(0.1, 0.2), rr(0.4, 0.7));
        A.tint(o, tone[0], tone[1], tone[2], 0.75);
        A.motion(o, 1.5, 0, 0, -1);
        A.spin(o, rr(0, TAU), rr(-1, 1));
      }
      return;
    }
    const gy = this.ground(p.x, p.z, p.y) + 0.25;
    const puffs = Math.min(k, big ? 16 : 10);
    for (let i = 0; i < puffs; i++) {
      const th = rr(0, TAU), r = Math.sqrt(Math.random()) * S;
      const sp = rr(0.4, 1.4) * (0.5 + S * 0.22), up = rr(0.3, 1.5);
      const s0 = rr(0.3, 0.6) * Math.pow(S, 0.75);
      const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, p.x + Math.cos(th) * r * 0.8, Math.max(p.y + rr(0, 0.4 * S), gy), p.z + Math.sin(th) * r * 0.8,
        Math.cos(th) * sp, up, Math.sin(th) * sp, rr(1.3, 2.6), s0, s0 * rr(2.0, 3.0));
      const sh = rr(0.88, 1.08);
      A.tint(o, tone[0] * sh, tone[1] * sh, tone[2] * sh, rr(0.6, 0.85));
      A.motion(o, 1.6, 0, 0.25, -1.2);
      A.spin(o, rr(0, TAU), rr(-0.6, 0.6));
    }
    // flying pieces: stone for walls, clods for earth
    const pal = kind === 'earth' ? C.earth : kind === 'stone' ? C.stone : (Math.random() < 0.5 ? C.stone : C.earth);
    const chips = Math.min(26, Math.round(k * (big ? 0.7 : 0.35)));
    for (let i = 0; i < chips; i++) {
      const th = rr(0, TAU), sp = rr(2, 6.5) * (0.6 + S * 0.12);
      const w = (big ? rr(0.1, 0.3) : rr(0.05, 0.14));
      const o = A.spawn(F.CHIP, R.SOLID, p.x, p.y + rr(0, 0.3 * S), p.z, Math.cos(th) * sp, rr(2.5, 6.5), Math.sin(th) * sp, rr(0.5, 1.1), w, w * 0.9);
      const c = pick(pal);
      A.tint(o, c[0], c[1], c[2], 1);
      A.motion(o, 0.3, 13, 0, 0);
      A.spin(o, rr(0, TAU), rr(-11, 11));
    }
    if (!big) return;
    // a collapse: a rolling cloud along the ground, a billowing column, fine dust that hangs
    for (let i = 0, m = 12; i < m; i++) {
      const th = (i / m) * TAU + rr(-0.2, 0.2), sp = rr(4.5, 8);
      const o = A.spawn(F.FLAT, R.DUST, p.x, gy, p.z, Math.cos(th) * sp, 0.15, Math.sin(th) * sp, rr(1.1, 1.8), S * 0.32, S * rr(0.9, 1.3));
      A.tint(o, tone[0], tone[1], tone[2], 0.7);
      A.motion(o, 2.2, 0, 0, -1.5);
    }
    for (let i = 0, m = Math.min(9, Math.round(k * 0.22)); i < m; i++) {
      const th = rr(0, TAU), r = rr(0, 0.6 * S), s0 = S * rr(0.3, 0.55);
      const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.SMOKE_L, p.x + Math.cos(th) * r, gy + rr(0, 1), p.z + Math.sin(th) * r, Math.cos(th) * 0.7, rr(1.6, 3.8), Math.sin(th) * 0.7, rr(2.4, 4.0), s0, S * rr(1.5, 2.5));
      A.tint(o, tone[0] * 0.95, tone[1] * 0.9, tone[2] * 0.85, 0.75);
      A.motion(o, 0.9, -0.2, 0.5, -2);
      A.spin(o, rr(0, TAU), rr(-0.4, 0.4));
    }
    const cam = this.game && this.game.camfx;
    if (cam) cam.boom(p, Math.min(1, S / 7));
  }

  // ---------- wood ----------
  splinters(p, n = 8) { this._splinters(p, n); }
  _splinters(p, n) {
    const A = this.alpha, k = this.q(n);
    if (k <= 0) return;
    const big = n >= 30;
    for (let i = 0; i < k; i++) {
      const th = rr(0, TAU), sp = rr(3, 9), len = big ? rr(0.25, 0.7) : rr(0.15, 0.4);
      const o = A.spawn(F.SPLINTER, R.SOLID, p.x + rr(-0.2, 0.2), p.y + rr(-0.2, 0.2), p.z + rr(-0.2, 0.2), Math.cos(th) * sp, rr(1, 6.5), Math.sin(th) * sp, rr(0.7, 1.3), len, len);
      const c = pick(C.wood);
      A.tint(o, c[0], c[1], c[2], 1);
      A.motion(o, 0.2, 12, 0, 0);
      A.spin(o, rr(0, TAU), rr(-14, 14));
    }
    for (let i = 0, m = Math.min(5, 1 + Math.round(k * 0.15)); i < m; i++) {   // the dust the blow shakes loose
      const o = A.spawn(F.PUFF2, R.DUST, p.x + rr(-0.3, 0.3), p.y + rr(-0.2, 0.2), p.z + rr(-0.3, 0.3), rr(-0.8, 0.8), rr(0.2, 1.0), rr(-0.8, 0.8), rr(0.7, 1.3), rr(0.2, 0.4), rr(0.8, 1.4));
      A.tint(o, 0.95, 0.88, 0.75, 0.6);
      A.motion(o, 1.4, 0, 0, -1);
    }
  }

  // ---------- smoke, fire ----------
  // one puff of the smoke of a burning keep or a wrecked engine (called a few times a second by the source)
  smoke(p) {
    const A = this.alpha, G = this.add;
    if (this.q(1) < 1 && Math.random() < 0.5) return;
    const s0 = rr(1.0, 1.7);
    let o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), Math.random() < 0.6 ? R.SOOT : R.SMOKE, p.x + rr(-0.3, 0.3), p.y, p.z + rr(-0.3, 0.3), rr(-0.3, 0.3), rr(1.8, 3.0), rr(-0.3, 0.3), rr(3.8, 5.8), s0, s0 * rr(3.2, 4.5));
    A.tint(o, 1, 1, 1, 0.9);
    A.motion(o, 0.35, -0.3, 0.6, -1.6);
    A.spin(o, rr(0, TAU), rr(-0.25, 0.25));
    if (Math.random() < 0.55) {   // a tongue of flame at the foot
      o = G.spawn(F.FLAME, R.FIRE, p.x + rr(-0.3, 0.3), p.y, p.z + rr(-0.3, 0.3), rr(-0.2, 0.2), rr(1.2, 2.4), rr(-0.2, 0.2), rr(0.45, 0.8), rr(1.0, 1.6), rr(0.3, 0.6));
      G.tint(o, 1.4, 1.2, 1, 0.9);
      G.motion(o, 0.5, -1, 0.15, 0.5);
    }
  }

  // a flame, some embers and a thread of smoke at a point that is moving or burning (fireballs, braziers, burning foes)
  fireTrail(p) {
    const G = this.add, A = this.alpha;
    let o = G.spawn(F.FLAME, R.FIRE, p.x + rr(-0.1, 0.1), p.y + rr(-0.1, 0.1), p.z + rr(-0.1, 0.1), rr(-0.3, 0.3), rr(0.8, 1.6), rr(-0.3, 0.3), rr(0.3, 0.46), rr(0.55, 0.85), rr(0.15, 0.3));
    G.tint(o, 1.5, 1.25, 1.0, 1);
    G.motion(o, 0.4, -2, 0.08, 0);
    G.spin(o, rr(-0.3, 0.3), 0);
    if (Math.random() < 0.35) {
      o = G.spawn(F.EMBER, R.EMBER, p.x, p.y, p.z, rr(-1, 1), rr(0.6, 2), rr(-1, 1), rr(0.5, 1.0), 0.07, 0.02);
      G.motion(o, 0.8, -0.5, 0.2, 0);
      G.tint(o, 1.8, 1.8, 1.8, 1);
    }
    if (Math.random() < 0.3) {
      o = A.spawn(F.PUFF2, R.SMOKE, p.x, p.y + 0.1, p.z, rr(-0.2, 0.2), rr(0.7, 1.3), rr(-0.2, 0.2), rr(0.9, 1.5), 0.25, rr(0.8, 1.2));
      A.tint(o, 1, 1, 1, 0.6);
      A.motion(o, 0.5, -0.3, 0.3, -1);
    }
  }

  // the burst of a fireball
  explosion(p, r = 3.5) {
    const G = this.add, A = this.alpha;
    let o = G.spawn(F.SOFT, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.22, r * 1.4, r * 3.4);
    G.tint(o, 2.4, 1.5, 0.6, 0.9);
    G.motion(o, 0, 0, 0, -1.5);
    o = G.spawn(F.RING, R.FLASH, p.x, p.y + 0.2, p.z, 0, 0, 0, 0.4, r * 0.4, r * 2.6);
    G.tint(o, 1.8, 1.0, 0.45, 0.45);
    G.motion(o, 0, 0, 0, -1.8);
    const fire = this.q(16);
    for (let i = 0; i < fire; i++) {   // the ball of flame: tongues thrown outward
      const th = rr(0, TAU), y = rr(-0.2, 1), c = Math.sqrt(1 - y * y), sp = rr(0.5, 1.15) * r * 1.6;
      o = G.spawn(F.FLAME, R.FIRE, p.x, p.y, p.z, Math.cos(th) * c * sp, y * sp * 0.9, Math.sin(th) * c * sp, rr(0.5, 0.85), r * rr(0.35, 0.55), r * rr(0.7, 1.1));
      G.tint(o, 1.6, 1.3, 1.0, 1);
      G.motion(o, 2.6, -2.5, 0.3, -1);
      G.spin(o, rr(-0.5, 0.5), 0);
    }
    const smoke = this.q(9);
    for (let i = 0; i < smoke; i++) {   // the black plume
      const th = rr(0, TAU), sp = rr(0.5, 2.6);
      o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.SOOT, p.x, p.y + rr(0, 0.5), p.z, Math.cos(th) * sp, rr(1.5, 4.5), Math.sin(th) * sp, rr(1.8, 3.0), r * rr(0.3, 0.5), r * rr(0.9, 1.5));
      A.tint(o, 1, 1, 1, 0.85);
      A.motion(o, 1.3, -0.4, 0.5, -1.8);
      A.spin(o, rr(0, TAU), rr(-0.5, 0.5));
    }
    const chips = this.q(10);
    for (let i = 0; i < chips; i++) {   // earth thrown up
      const th = rr(0, TAU), sp = rr(2, 7) * (r / 3.5 + 0.4);
      o = A.spawn(F.CHIP, R.SOLID, p.x, p.y, p.z, Math.cos(th) * sp, rr(3, 8), Math.sin(th) * sp, rr(0.6, 1.2), rr(0.07, 0.16), rr(0.05, 0.12));
      const c = pick(C.earth);
      A.tint(o, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 1);
      A.motion(o, 0.2, 13, 0, 0);
      A.spin(o, rr(0, TAU), rr(-9, 9));
    }
    this._sparks(p, 18);
    this.scorch(p, r * 1.5);
    const cam = this.game && this.game.camfx;
    if (cam) cam.boom(p, Math.min(1, r / 5));
  }

  scorch(p, size) {
    const y = this.ground(p.x, p.z, p.y);
    this.mark(D.SCORCH, p.x, y, p.z, size * 2, rr(16, 24), 0.05, 0.045, 0.04, 0.85);
  }

  // ---------- ice and lightning ----------
  frostTrail(p) {
    const G = this.add;
    const o = G.spawn(F.SPARKLE, R.GLINT, p.x, p.y, p.z, rr(-0.2, 0.2), rr(-0.2, 0.2), rr(-0.2, 0.2), 0.45, rr(0.2, 0.34), 0.05);
    G.tint(o, 0.9, 1.6, 2.0, 1);
    G.spin(o, rr(0, TAU), rr(-2, 2));
  }
  frost(p, n = 14) {
    const A = this.alpha, G = this.add, k = this.q(n);
    for (let i = 0; i < k; i++) {
      const th = rr(0, TAU), sp = rr(0.8, 3.4), y = rr(-0.2, 1);
      const o = A.spawn(F.SHARD, R.FROST, p.x, p.y + rr(-0.3, 0.3), p.z, Math.cos(th) * sp, y * sp + 0.6, Math.sin(th) * sp, rr(0.5, 0.95), rr(0.1, 0.2), rr(0.08, 0.14));
      A.tint(o, 0.85, 1.1, 1.3, 1);
      A.motion(o, 0.6, 5, 0, 0);
      A.spin(o, rr(0, TAU), rr(-7, 7));
      if (i % 3 === 0) {
        const g = G.spawn(F.SPARKLE, R.GLINT, p.x + rr(-0.4, 0.4), p.y + rr(-0.4, 0.4), p.z + rr(-0.4, 0.4), rr(-0.4, 0.4), rr(0, 0.8), rr(-0.4, 0.4), rr(0.5, 0.9), rr(0.15, 0.3), 0.06);
        G.tint(g, 0.9, 1.5, 2.0, 1);
        G.spin(g, rr(0, TAU), rr(-1, 1));
      }
    }
    for (let i = 0, m = Math.max(1, Math.round(k * 0.25)); i < m; i++) {   // the mist that rolls off cold things
      const o = A.spawn(F.MIST, R.STEAM, p.x + rr(-0.4, 0.4), p.y + rr(-0.5, 0.2), p.z + rr(-0.4, 0.4), rr(-0.5, 0.5), rr(-0.1, 0.4), rr(-0.5, 0.5), rr(0.9, 1.5), rr(0.3, 0.5), rr(0.8, 1.3));
      A.tint(o, 0.85, 0.95, 1.05, 0.5);
      A.motion(o, 1.2, 0, 0.1, -1);
    }
  }
  zap(p, n = 10) {
    const G = this.add, k = this.q(n);
    let o = G.spawn(F.STAR, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.14, 0.5, 1.1);
    G.tint(o, 1.2, 1.7, 2.4, 1);
    G.spin(o, rr(0, TAU), rr(-3, 3));
    for (let i = 0; i < k; i++) {
      const th = rr(0, TAU), y = rr(-0.5, 1), c = Math.sqrt(1 - y * y), sp = rr(3, 9);
      o = G.spawn(F.STREAK, R.FLASH, p.x, p.y, p.z, Math.cos(th) * c * sp, y * sp, Math.sin(th) * c * sp, rr(0.12, 0.3), rr(0.03, 0.05), 0.015);
      G.streak(o, 0.05);
      G.motion(o, 0.5, 2, 0, 0);
      G.tint(o, 1.2, 1.7, 2.4, 1);
    }
  }
  orb(p, color, size) {
    const o = this.add.spawn(F.SOFT, R.FLASH, p.x, p.y, p.z, 0, 0.3, 0, 0.12, size * 3.2, size * 0.8);
    this.add.tint(o, color.r * 1.6, color.g * 1.6, color.b * 1.6, 0.8);
  }

  // ---------- gold and rings ----------
  gold(p) {
    const G = this.add, k = this.q(8);
    let o = G.spawn(F.SOFT, R.FLASH, p.x, p.y, p.z, 0, 0, 0, 0.3, 0.3, 1.1);
    G.tint(o, 1.6, 1.1, 0.35, 0.55);
    for (let i = 0; i < k; i++) {
      o = G.spawn(F.SPARKLE, R.GLINT, p.x + rr(-0.15, 0.15), p.y + rr(-0.15, 0.15), p.z + rr(-0.15, 0.15), rr(-0.7, 0.7), rr(0.7, 2.0), rr(-0.7, 0.7), rr(0.7, 1.2), rr(0.14, 0.26), 0.05);
      G.tint(o, 2.0, 1.45, 0.4, 1);
      G.motion(o, 0.7, 1.5, 0.12, 0);
      G.spin(o, rr(0, TAU), rr(-3, 3));
    }
  }
  // a ring of glowing motes on the ground around p; speed pushes them outward, up lifts them
  ring(p, r, color, n = 28, { up = 0.8, speed = 0, size = 0.35, life = 0.6 } = {}) {
    const G = this.add, k = this.q(n);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU + rr(-0.05, 0.05);
      const sz = size * rr(0.6, 1.1);
      const o = G.spawn(F.SPARKLE, R.GLINT, p.x + Math.cos(a) * r, p.y + 0.15, p.z + Math.sin(a) * r, Math.cos(a) * speed, up + rr(0, 0.6), Math.sin(a) * speed, life * rr(0.8, 1.3), sz, sz * 0.3);
      G.tint(o, color.r * 1.7, color.g * 1.7, color.b * 1.7, 1);
      G.motion(o, 0.8, -0.5, 0.1, 0);
      G.spin(o, rr(0, TAU), rr(-2, 2));
    }
  }
  // a camera-facing ring of light that spreads out from p
  shock(p, r0, r1, color, life = 0.35, strength = 1) {
    const o = this.add.spawn(F.RING, R.FLASH, p.x, p.y, p.z, 0, 0, 0, life, r0 * 2, r1 * 2);
    this.add.tint(o, color.r * 1.7 * strength, color.g * 1.7 * strength, color.b * 1.7 * strength, 0.85);
    this.add.motion(o, 0, 0, 0, -1.6);
  }
  // a glow that flashes and fades
  flash(p, color, size, life = 0.22, strength = 1) {
    const o = this.add.spawn(F.SOFT, R.FLASH, p.x, p.y, p.z, 0, 0, 0, life, size * 0.5, size);
    this.add.tint(o, color.r * 2.0 * strength, color.g * 2.0 * strength, color.b * 2.0 * strength, 0.7);
    this.add.motion(o, 0, 0, 0, -1.2);
  }

  // a hero reaches a new level: golden light rises round them in rings and sparks
  levelUp(p) {
    const c = C.level, G = this.add;
    this.flash(p, { r: c[0], g: c[1], b: c[2] }, 3.2, 0.5, 0.8);
    for (let i = 0; i < 4; i++) {
      const q = { x: p.x, y: p.y + 0.1 + i * 0.55, z: p.z };
      this.ring(q, 0.9 + i * 0.12, { r: c[0], g: c[1], b: c[2] }, 24, { up: 2.2, speed: 0.6, size: 0.4, life: 0.9 });
    }
    for (let i = 0, k = this.q(22); i < k; i++) {
      const a = rr(0, TAU), sp = rr(0.5, 2.2);
      const o = G.spawn(F.SPARKLE, R.GLINT, p.x, p.y + rr(0.2, 1.4), p.z, Math.cos(a) * sp, rr(1.5, 4.0), Math.sin(a) * sp, rr(0.8, 1.4), rr(0.18, 0.34), 0.06);
      G.tint(o, c[0] * 2.2, c[1] * 2.2, c[2] * 2.2, 1);
      G.motion(o, 1.0, -1, 0.2, 0);
      G.spin(o, rr(0, TAU), rr(-3, 3));
    }
  }

  // ---------- the rest of the ground: feet, hooves, giants ----------
  stomp(p) {
    const A = this.alpha, gy = this.ground(p.x, p.z, p.y) + 0.2;
    for (let i = 0, m = this.q(14); i < m; i++) {
      const th = (i / 14) * TAU + rr(-0.2, 0.2), sp = rr(3.5, 6.5);
      const o = A.spawn(F.FLAT, R.DUST, p.x, gy, p.z, Math.cos(th) * sp, 0.2, Math.sin(th) * sp, rr(0.9, 1.5), 0.7, rr(1.7, 2.6));
      A.tint(o, 1, 0.97, 0.92, 0.65);
      A.motion(o, 2.4, 0, 0, -1.5);
    }
    for (let i = 0, m = this.q(5); i < m; i++) {
      const th = rr(0, TAU), sp = rr(2, 4.5), w = rr(0.08, 0.18);
      const o = A.spawn(F.CHIP, R.SOLID, p.x, gy, p.z, Math.cos(th) * sp, rr(2.5, 5), Math.sin(th) * sp, rr(0.5, 0.9), w, w);
      const c = pick(C.earth);
      A.tint(o, c[0], c[1], c[2], 1);
      A.motion(o, 0.3, 13, 0, 0);
      A.spin(o, rr(0, TAU), rr(-9, 9));
    }
  }
  thud(p) {   // an arrow driving into the ground
    const A = this.alpha;
    for (let i = 0, m = this.q(3); i < m; i++) {
      const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, p.x + rr(-0.2, 0.2), p.y + 0.1, p.z + rr(-0.2, 0.2), rr(-0.6, 0.6), rr(0.4, 1.2), rr(-0.6, 0.6), rr(0.7, 1.2), rr(0.15, 0.25), rr(0.5, 0.8));
      A.tint(o, 0.95, 0.85, 0.7, 0.6);
      A.motion(o, 1.6, 0, 0, -1);
      A.spin(o, rr(0, TAU), rr(-1, 1));
    }
    this.chips(p, this.q(3), C.earth, 0.05, 0.1);
  }
  // flying pieces (clods, stone, wood): n of them from p
  chips(p, n, pal, w0, w1, speed = 4) {
    const A = this.alpha;
    for (let i = 0; i < n; i++) {
      const th = rr(0, TAU), sp = rr(0.5, 1) * speed, w = rr(w0, w1);
      const o = A.spawn(F.CHIP, R.SOLID, p.x, p.y, p.z, Math.cos(th) * sp, rr(0.5, 1.2) * speed, Math.sin(th) * sp, rr(0.4, 0.8), w, w * 0.9);
      const c = pick(pal);
      A.tint(o, c[0], c[1], c[2], 1);
      A.motion(o, 0.2, 13, 0, 0);
      A.spin(o, rr(0, TAU), rr(-10, 10));
    }
  }

  // Something struck a surface: a small, local effect (arrows and bolts that arrive on every screen make their own).
  // kind: 'stone', 'wood', 'earth', 'metal'; (nx, ny, nz) the way the surface faces (up for the ground)
  impact(kind, p, nx = 0, ny = 1, nz = 0, n = 1) {
    const A = this.alpha, nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const k = Math.max(1, this.q(2 * n));
    if (kind === 'wood') {
      for (let i = 0; i < k + 1; i++) {
        cone(nx, ny, nz, 0.9);
        const sp = rr(1.5, 4.5), len = rr(0.08, 0.2);
        const o = A.spawn(F.SPLINTER, R.SOLID, p.x, p.y, p.z, _d.x * sp, _d.y * sp + 0.8, _d.z * sp, rr(0.4, 0.8), len, len);
        const c = pick(C.wood);
        A.tint(o, c[0], c[1], c[2], 1);
        A.motion(o, 0.2, 11, 0, 0);
        A.spin(o, rr(0, TAU), rr(-12, 12));
      }
      return;
    }
    if (kind === 'metal') { this._sparks(p, 5 + 3 * n); return; }
    const pal = kind === 'stone' ? C.stone : C.earth, tone = kind === 'stone' ? C.dustStone : C.dustEarth;
    for (let i = 0; i < k; i++) {
      cone(nx, ny, nz, 0.7);
      const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, p.x + nx * 0.1, p.y + ny * 0.1, p.z + nz * 0.1, _d.x * rr(0.4, 1.4), _d.y * rr(0.4, 1.4) + 0.2, _d.z * rr(0.4, 1.4), rr(0.7, 1.3), rr(0.12, 0.22), rr(0.5, 0.9));
      A.tint(o, tone[0], tone[1], tone[2], 0.6);
      A.motion(o, 1.6, 0, 0, -1);
      A.spin(o, rr(0, TAU), rr(-1, 1));
    }
    this.chips(p, k, pal, 0.03, 0.08, 3.5);
  }

  // a boulder lands: earth and dust fly, a crater is left (the host also sends its dust call, which the guests replay)
  crater(p, r = 2.4) {
    const y = this.ground(p.x, p.z, p.y);
    this.mark(D.CRATER, p.x, y, p.z, r * 1.7, rr(30, 42), 0.2, 0.15, 0.1, 0.9);
    this.chips(p, this.q(16), C.earth, 0.08, 0.2, 8);
    const A = this.alpha;
    for (let i = 0, m = 12; i < m; i++) {
      const th = (i / m) * TAU + rr(-0.2, 0.2), sp = rr(4, 8);
      const o = A.spawn(F.FLAT, R.DUST, p.x, y + 0.25, p.z, Math.cos(th) * sp, 0.2, Math.sin(th) * sp, rr(1.0, 1.7), 0.7, r * rr(0.8, 1.3));
      A.tint(o, 0.9, 0.78, 0.62, 0.7);
      A.motion(o, 2.2, 0, 0, -1.5);
    }
    const cam = this.game && this.game.camfx;
    if (cam) cam.boom(p, 0.55);
  }

  // dark smoke left behind a moving boulder (v: its velocity, for the drift)
  smokeTrail(p, v) {
    const A = this.alpha;
    const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.SMOKE, p.x + rr(-0.1, 0.1), p.y + rr(-0.1, 0.1), p.z + rr(-0.1, 0.1), v.x * 0.03 + rr(-0.3, 0.3), rr(0.2, 0.7), v.z * 0.03 + rr(-0.3, 0.3), rr(1.0, 1.7), rr(0.3, 0.5), rr(1.0, 1.7));
    A.tint(o, 1, 1, 1, 0.55);
    A.motion(o, 0.6, -0.2, 0.2, -1);
    A.spin(o, rr(0, TAU), rr(-0.5, 0.5));
  }

  // A thin streak that follows a ballistic flight (an arrow): the shader moves it, so it costs nothing per frame. Returns
  // where the particle lives and when it was born, to end it early with `endTracer`.
  tracer(p, v, life, color, alpha = 0.3, width = 0.05, stretch = 0.09) {   // (width in metres, stretch in seconds of flight)
    const A = this.alpha;
    const o = A.spawn(F.STREAK, R.FADE, p.x, p.y, p.z, v.x, v.y, v.z, life, width, width);
    A.streak(o, stretch);
    A.motion(o, 0, 9.8, 0, 0);
    A.tint(o, color.r, color.g, color.b, alpha);
    this._to = o; this._tb = A.born(o);
    return o;
  }
  endTracer(o, born) { this.alpha.kill(o, born); }

  // ---------- feet and hooves (derived on every screen from where the soldiers are) ----------
  dry(x, z) {
    const rd = WORLD.roadDist ? WORLD.roadDist(x, z) : 99;
    return 1 - ss(2.2, 4.8, rd);
  }
  walk(dt) {
    const g = this.game;
    if (!g || Q.particles < 0.8 || dt < 0.002 || !g.units) return;
    const cam = g.camera.position;
    const A = this.alpha;
    const step = (u, mounted) => {
      const dx = u.pos.x - cam.x, dz = u.pos.z - cam.z;
      if (dx * dx + dz * dz > 1500) { u._fxx = undefined; return; }
      if (u._fxx === undefined) { u._fxx = u.pos.x; u._fxz = u.pos.z; u._fxs = 0; return; }
      const mx = u.pos.x - u._fxx, mz = u.pos.z - u._fxz;
      u._fxx = u.pos.x; u._fxz = u.pos.z;
      const d = Math.hypot(mx, mz);
      if (d > 3 || d / dt < 2.4) return;
      u._fxs += d;
      const stride = mounted ? 2.7 : 1.9;
      if (u._fxs < stride) return;
      u._fxs -= stride;
      const dry = this.dry(u.pos.x, u.pos.z);
      const amount = mounted ? 0.35 + 0.65 * dry : dry;
      if (amount < 0.2 || Math.random() > amount + 0.15) return;
      const bx = -mx / d, bz = -mz / d;   // back along the way it came
      const y = u.pos.y + 0.12;
      const n = mounted ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const s0 = (mounted ? rr(0.3, 0.45) : rr(0.16, 0.26));
        const o = A.spawn(F.PUFF1 + ((Math.random() * 3) | 0), R.DUST, u.pos.x + bx * 0.3 + rr(-0.2, 0.2), y, u.pos.z + bz * 0.3 + rr(-0.2, 0.2), bx * rr(0.5, 1.3) + rr(-0.3, 0.3), rr(0.4, 1.0), bz * rr(0.5, 1.3) + rr(-0.3, 0.3), rr(0.8, 1.4), s0, s0 * rr(2.2, 3.2));
        A.tint(o, 0.95, 0.86, 0.72, (mounted ? 0.5 : 0.4) * Math.max(0.5, dry));
        A.motion(o, 1.8, 0, 0.1, -1.2);
        A.spin(o, rr(0, TAU), rr(-1, 1));
      }
      if (mounted) {
        const c = this.q(2);
        for (let i = 0; i < c; i++) {
          const w = rr(0.05, 0.1);
          const o = A.spawn(F.CHIP, R.SOLID, u.pos.x + bx * 0.2, y, u.pos.z + bz * 0.2, bx * rr(1.5, 3.5) + rr(-0.6, 0.6), rr(1.8, 3.4), bz * rr(1.5, 3.5) + rr(-0.6, 0.6), rr(0.4, 0.7), w, w);
          const col = pick(C.earth);
          A.tint(o, col[0], col[1], col[2], 1);
          A.motion(o, 0.1, 13, 0, 0);
          A.spin(o, rr(0, TAU), rr(-9, 9));
        }
      }
    };
    for (const u of g.units) if (u.alive && u.lod < 2) step(u, !!(u.def && u.def.mounted));
    for (const h of g.humans) if (h.alive && h !== g.player && !h.drive) step(h, !!h.mounted);
  }

  // ---------- once a frame ----------
  probe() {
    const sc = this.scene;
    let r = 0, g = 0, b = 0;
    for (const o of sc.children) {
      if (o.isHemisphereLight) { r += o.color.r * o.intensity * 0.45; g += o.color.g * o.intensity * 0.45; b += o.color.b * o.intensity * 0.45; }
      else if (o.isAmbientLight) { r += o.color.r * o.intensity * 0.45; g += o.color.g * o.intensity * 0.45; b += o.color.b * o.intensity * 0.45; }
      else if (o.isDirectionalLight) { r += o.color.r * o.intensity * 0.22; g += o.color.g * o.intensity * 0.22; b += o.color.b * o.intensity * 0.22; }
    }
    if (r + g + b <= 0) return;
    if (!this.lightBase) this.lightBase = [r, g, b];
    const B = this.lightBase, cl = (v) => Math.min(1.4, Math.max(0.35, v));
    this.light.set(cl(r / B[0]), cl(g / B[1]), cl(b / B[2]));
  }

  update(dt) {
    this.clock.t += dt;
    if (this.clock.t > 3000) {   // keep the shader's float precision for very long sessions
      const by = this.clock.t - 1;
      this.clock.t -= by;
      this.alpha.rebase(by); this.add.rebase(by); this.decals.rebase(by);
      for (let i = 0; i < this.pendN; i++) this.pend[i * 5] -= by;
    }
    const t = this.clock.t;
    this.lightT -= dt;
    if (this.lightT <= 0) { this.lightT = 0.5; this.probe(); }
    this.tokens = Math.min(24, this.tokens + dt * 45);
    // blood that has fallen leaves its mark
    for (let i = this.pendN - 1; i >= 0; i--) {
      const o = i * 5, a = this.pend;
      if (a[o] > t) continue;
      this.splat(a[o + 1], a[o + 2], a[o + 3], a[o + 4]);
      this.pendN--;
      const e = this.pendN * 5;
      for (let j = 0; j < 5; j++) a[o + j] = a[e + j];
    }
    this.walk(dt);
    this.alpha.update(t, this.light);
    this.add.update(t, null);
    this.decals.update(t, this.light);
  }

  // for tests: how many particles are alive in each layer
  count() {
    const t = this.clock.t, live = (L) => { let n = 0; for (let o = 3; o < L.data.length; o += 24) { const age = t - L.data[o]; if (age >= 0 && age < L.data[o + 4]) n++; } return n; };
    return { smoke: live(this.alpha), glow: live(this.add) };
  }

  dispose() { this.alpha.dispose(); this.add.dispose(); this.decals.dispose(); }
}
