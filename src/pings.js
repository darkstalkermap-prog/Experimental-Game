// Pings and markers: call-outs between team mates.
//   - Middle click: a ping on whatever the crosshair is on. A foe (or a castle part of a foe) is Attack, your own castle or
//     an ally is Defend, plain ground is Go here. It lasts a few seconds.
//   - Hold the middle button: a wheel opens round the crosshair. Move the mouse towards one of five kinds (the view stays
//     put) and let go to leave a marker there; let go in the middle for the ordinary ping. Markers last most of a minute.
//   - Wherever the mouse is free (the big map, M): left click on a map puts down a marker of the kind picked in the palette,
//     right click takes away the nearest one of yours.
// Everybody sees their own at once. Online, the host checks each one (shape, range, rate) and passes it on to the allied
// humans only, so in Versus nobody else sees it and in co-op the whole side does. Each call-out shows as a pulse on the maps,
// a beacon with an icon and a distance in the world, an arrow at the edge of the screen when it is out of view, a toast
// for team mates, and a sound.
import * as THREE from 'three';
import { PINGS, WORLD, TEAM_CSS, TEAM_COLORS } from './config.js';
import { allied } from './teams.js';
import { SOUNDS } from './audio.js';
import { fade } from './aimring.js';

const TYPES = PINGS.types;
const GO = 0, ATTACK = 1, DEFEND = 2;          // what a plain ping can turn out to be
const TAU = Math.PI * 2;
const WHEEL = { dead: 14, reach: 64, ring: 88 };   // px: the middle of the wheel, how far the mouse can push, the icons' distance
const CASTLE_PARTS = new Set(['wall', 'parapet', 'gate', 'lintel', 'walk', 'post', 'tower', 'keep', 'ramp']);
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pingsOf = (ui) => ui.game && ui.game.pings;

// ---------------- sounds (registered with the audio registry; each kind has its own, so a call-out can be told by ear) ----------------
SOUNDS.pingGo = (a, k) => { a.tone(880, 0.09, 0.13 * k, 'sine'); a.tone(1175, 0.13, 0.1 * k, 'sine', 1, 0.07); };
SOUNDS.pingAttack = (a, k) => { a.tone(392, 0.12, 0.16 * k, 'triangle'); a.tone(587, 0.22, 0.18 * k, 'triangle', 1, 0.1); a.noise(0.08, 3200, 2, 0.1 * k, 'highpass', 0.1); };
SOUNDS.pingDefend = (a, k) => { a.tone(523, 0.14, 0.14 * k, 'triangle'); a.tone(392, 0.24, 0.16 * k, 'triangle', 1, 0.11); };
SOUNDS.pingDanger = (a, k) => { for (let i = 0; i < 3; i++) a.tone(i === 1 ? 175 : 220, 0.13, 0.2 * k, 'square', 0, i * 0.17); };
SOUNDS.pingHelp = (a, k) => { for (let i = 0; i < 3; i++) a.tone(1040, 0.07, 0.12 * k, 'sine', 0, i * 0.11); };
SOUNDS.ping = SOUNDS.pingGo;
const SOUND_OF = ['pingGo', 'pingAttack', 'pingDefend', 'pingDanger', 'pingHelp'];

// ---------------- icons ----------------
// One icon painter for the maps, the beacons, the wheel and the palette: a disc in the kind's colour with a white glyph,
// ringed in the sender's house colour.
export function drawIcon(ctx, ti, cx, cy, r, rim) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = TYPES[ti].color; ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.2); ctx.strokeStyle = rim; ctx.stroke();
  const u = r * 0.5;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, r * 0.17); ctx.lineCap = ctx.lineJoin = 'round';
  if (ti === GO) {            // a pennant on a pole
    ctx.beginPath(); ctx.moveTo(-u * 0.55, u * 1.05); ctx.lineTo(-u * 0.55, -u * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.55, -u * 1.05); ctx.lineTo(u * 1.0, -u * 0.4); ctx.lineTo(-u * 0.55, u * 0.25); ctx.closePath(); ctx.fill();
  } else if (ti === ATTACK) { // two swords crossed
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * u * 0.95, -u); ctx.lineTo(-s * u * 0.95, u); ctx.stroke();
      const gx = s * u * 0.95 - s * u * 1.9 * 0.62, gy = -u + u * 2 * 0.62;       // the cross guard, near the hilt
      ctx.beginPath(); ctx.moveTo(gx - 0.45 * u, gy - 0.4 * u * s); ctx.lineTo(gx + 0.45 * u, gy + 0.4 * u * s); ctx.stroke();
    }
  } else if (ti === DEFEND) { // a shield
    ctx.beginPath(); ctx.moveTo(-u * 0.85, -u * 0.95); ctx.lineTo(u * 0.85, -u * 0.95); ctx.lineTo(u * 0.85, u * 0.05);
    ctx.quadraticCurveTo(u * 0.85, u * 0.8, 0, u * 1.15); ctx.quadraticCurveTo(-u * 0.85, u * 0.8, -u * 0.85, u * 0.05); ctx.closePath(); ctx.fill();
  } else if (ti === 3) {      // a warning triangle
    ctx.beginPath(); ctx.moveTo(0, -u * 1.15); ctx.lineTo(u * 1.1, u * 0.85); ctx.lineTo(-u * 1.1, u * 0.85); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = TYPES[ti].color;
    ctx.beginPath(); ctx.moveTo(0, -u * 0.4); ctx.lineTo(0, u * 0.2); ctx.stroke();
    ctx.fillStyle = TYPES[ti].color; ctx.beginPath(); ctx.arc(0, u * 0.55, Math.max(0.8, r * 0.075), 0, TAU); ctx.fill();
  } else {                    // a cross: help
    ctx.beginPath(); ctx.moveTo(0, -u * 1.05); ctx.lineTo(0, u * 1.05); ctx.moveTo(-u * 1.05, 0); ctx.lineTo(u * 1.05, 0); ctx.stroke();
  }
  ctx.restore();
}

// ---------------- the beacon's shapes (shared) ----------------
let BEAM = null, RING = null;
function shapes() {
  if (!BEAM) {
    BEAM = new THREE.CylinderGeometry(0.2, 0.55, 1, 12, 1, true).translate(0, 0.5, 0);   // foot at the origin, one metre tall (scaled to the beam's height)
    RING = new THREE.RingGeometry(0.78, 1, 48).rotateX(-Math.PI / 2);                      // lying flat, one metre across
  }
}

// ---------------- the page: palette, wheel and map clicks (wired once; they find the current game through the ui) ----------------
const wired = new WeakSet();
function bindDom(ui) {
  if (wired.has(ui)) return;
  wired.add(ui);
  const pal = $('pingPalette');
  if (pal) {
    TYPES.forEach((t, i) => {
      const b = document.createElement('button');
      b.dataset.t = String(i);
      b.title = t.name;
      const c = document.createElement('canvas');
      c.width = c.height = 28;
      drawIcon(c.getContext('2d'), i, 14, 14, 12, 'rgba(0,0,0,0.5)');
      const s = document.createElement('span');
      s.textContent = t.name;
      b.append(c, s);
      b.addEventListener('click', () => { const p = pingsOf(ui); if (p) { p.sel = i; p.syncPalette(); } });
      pal.appendChild(b);
    });
  }
  const wheel = $('pingWheel');
  if (wheel && !wheel.children.length) {
    TYPES.forEach((t, i) => {
      const a = -Math.PI / 2 + (i * TAU) / TYPES.length;
      const d = document.createElement('div');
      d.className = 'pw';
      d.style.left = `${Math.cos(a) * WHEEL.ring}px`;
      d.style.top = `${Math.sin(a) * WHEEL.ring}px`;
      const c = document.createElement('canvas');
      c.width = c.height = 40;
      drawIcon(c.getContext('2d'), i, 20, 20, 17, 'rgba(0,0,0,0.5)');
      const s = document.createElement('span');
      s.textContent = t.name;
      d.append(c, s);
      wheel.appendChild(d);
    });
    const hub = document.createElement('div');
    hub.className = 'hub';
    hub.innerHTML = '<b></b><small></small>';
    const dot = document.createElement('i');
    dot.className = 'stick';
    wheel.append(hub, dot);
  }
  for (const id of ['minimap', 'bigmapCanvas']) {
    const cv = $(id);
    if (!cv) continue;
    cv.addEventListener('click', (e) => { const p = pingsOf(ui); if (p) p.mapClick(cv, e, false); });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = pingsOf(ui); if (p) p.mapClick(cv, e, true); });
  }
  // a click on the dim backdrop round the big map closes it (and gives the mouse back to the game)
  const big = $('bigmap');
  if (big) big.addEventListener('click', (e) => { if (e.target === big) ui.toggleMap(false); });
  // the wheel is dropped the moment the mouse is freed (Esc, a menu, another window)
  const drop = () => { const p = pingsOf(ui); if (p) p.cancelWheel(); };
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) drop(); });
  addEventListener('blur', drop);
}

export class Pings {
  constructor(game) {
    this.g = game;
    this.items = [];       // live call-outs: { id, team, name, type, marker, x, y, z, t0, ttl, mine, vis }
    this.sel = 0;          // the kind a map click places (the palette)
    this.seq = 0;          // my own call-out numbers; the others know them by (team, id)
    this.rate = new Map(); // team -> { last, puts[], rms[] }: what the host (and each sender) counts
    this.state = 'idle';   // the middle button: 'idle' | 'down' (maybe a click, maybe a hold) | 'wheel'
    this.holdT = 0;
    this.stick = { x: 0, y: 0 };
    this.pick = -1;        // the wheel's choice: -1 = the middle (the ordinary ping)
    shapes();
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.layer = $('pingLayer');
    if (this.layer) this.layer.innerHTML = '';
    bindDom(game.ui);
    this.syncPalette();
  }

  // a fresh match: nothing left over
  reset() {
    for (const it of this.items.slice()) this.drop(it);
    this.rate.clear();
    this.seq = 0;
    this.cancelWheel();
    this.state = 'idle';
  }

  // ---------------- what the crosshair is on ----------------
  // { x, y, z, type, what } for the point the crosshair rests on: a soldier, hero or engine (Attack if foe, Defend if
  // friend), a castle part (the same, by whose castle it is; a castle that has fallen counts as ground), or plain ground
  // (Go here). null when it looks at the sky.
  aim() {
    const g = this.g, P = g.physics, cam = g.camera, me = g.localTeam;
    cam.updateMatrixWorld();
    const o = cam.getWorldPosition(new THREE.Vector3()), d = cam.getWorldDirection(new THREE.Vector3());
    const p = new THREE.Vector3();
    const at = (t) => p.copy(d).multiplyScalar(t).add(o);
    // the land and the solid parts of castles: walk the ray in small steps until it is inside something
    const blocked = (t) => {
      at(t);
      for (const c of P.near(p.x, p.z, 0.3)) {
        if (!c.active || p.x < c.minX || p.x > c.maxX || p.z < c.minZ || p.z > c.maxZ) continue;
        if (c.kind === 'gate' && P.lets(c, me)) continue;               // your own open gate: the ray goes through
        if (p.y < P.topAt(c, p.x, p.z) && p.y > c.bottom) return c;
      }
      return p.y < P.terrainHeight(p.x, p.z) ? 'ground' : null;
    };
    let tw = Infinity, hitW = null;
    for (let t = 0.7, prev = 0.7; t < PINGS.range; prev = t, t += t < 120 ? 0.5 : 1) {
      at(t);
      if (Math.abs(p.x) > WORLD.half + 1 || Math.abs(p.z) > WORLD.half + 1) break;   // beyond the edge of the map
      const h = blocked(t);
      if (!h) continue;
      let lo = prev, hi = t, who = h;
      for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2, b = blocked(mid); if (b) { hi = mid; who = b; } else lo = mid; }
      tw = hi; hitW = who;
      break;
    }
    // soldiers, heroes and engines: a forgiving cylinder round each, wider the further off it stands
    let tu = Infinity, hitU = null;
    const test = (o2, r, h) => {
      if (!o2.alive) return;
      const t = this.rayCylinder(o, d, o2.pos.x, o2.pos.z, o2.pos.y - 0.3, o2.pos.y + h + 0.3, r + 0.35 + 0.012 * Math.hypot(o2.pos.x - o.x, o2.pos.z - o.z));
      if (t >= 0 && t < tu) { tu = t; hitU = o2; }
    };
    for (const u of g.units) test(u, u.radius, u.height);
    for (const h of g.humans) if (h !== g.player) test(h, h.radius, h.mounted ? 2.8 : h.height);
    for (const s of g.siege) test(s, s.radius, 3);
    let res = null;
    if (hitU && tu <= tw) {
      const o2 = hitU;
      res = { x: o2.pos.x, y: o2.pos.y, z: o2.pos.z, type: allied(o2.team, me) ? DEFEND : ATTACK, what: o2.isSiege ? 'engine' : o2.isHero ? 'hero' : 'soldier' };
    } else if (hitW) {
      at(tw);
      if (hitW === 'ground') res = { x: p.x, y: p.y, z: p.z, type: GO, what: 'ground' };
      else if (CASTLE_PARTS.has(hitW.kind)) {
        const castle = this.ownerOf(hitW, p.x, p.z);
        const type = !castle || castle.fallen ? GO : allied(castle.team, me) ? DEFEND : ATTACK;
        res = { x: p.x, y: Math.max(P.terrainHeight(p.x, p.z), P.topAt(hitW, p.x, p.z)), z: p.z, type, what: castle && !castle.fallen ? 'castle' : 'ground' };
      } else res = { x: p.x, y: P.terrainHeight(p.x, p.z), z: p.z, type: GO, what: 'ground' };   // a tree, a rock
    }
    if (!res) return null;
    // the map has an edge: a spot beyond it is moved back onto it
    const cx = clamp(res.x, -WORLD.playHalf, WORLD.playHalf), cz = clamp(res.z, -WORLD.playHalf, WORLD.playHalf);
    if (cx !== res.x || cz !== res.z) { res.x = cx; res.z = cz; res.y = P.terrainHeight(cx, cz); }
    return res;
  }

  // the castle a collider belongs to (walls, gates and keeps say; towers, lintels and stairs are found by where they stand)
  ownerOf(c, x, z) {
    const team = c.ref && c.ref.team !== undefined ? c.ref.team : c.team;
    if (team !== undefined) return this.g.castles[team] || null;
    for (const k of this.g.castles) if (Math.abs(x - k.center.x) < 29 && Math.abs(z - k.center.z) < 29) return k;
    return null;
  }

  // First distance along the ray o + t d (t >= 0) at which it is inside the upright cylinder, or -1.
  rayCylinder(o, d, cx, cz, y0, y1, r) {
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return -1;
    const ox = o.x - cx, oz = o.z - cz;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t0 = (-b - sq) / a, t1 = (-b + sq) / a;
    if (t1 < 0) return -1;
    // inside the height band between y0 and y1
    if (Math.abs(d.y) > 1e-9) {
      const s0 = (y0 - o.y) / d.y, s1 = (y1 - o.y) / d.y;
      t0 = Math.max(t0, Math.min(s0, s1)); t1 = Math.min(t1, Math.max(s0, s1));
    } else if (o.y < y0 || o.y > y1) return -1;
    t0 = Math.max(t0, 0);
    return t0 <= t1 ? t0 : -1;
  }

  // ---------------- input: the middle button ----------------
  update(dt) {
    this.poll(dt);
    const now = this.g.time;
    for (let i = this.items.length - 1; i >= 0; i--) if (now - this.items[i].t0 >= this.items[i].ttl) this.drop(this.items[i]);
    if (this.items.length) this.animate();
  }

  poll(dt) {
    const g = this.g, m = g.input.mouse;
    const live = g.state === 'playing' && !g.paused && !g.ui.shopOpen && !g.ui.mapOpen;
    if (this.state === 'idle') {
      if (!(live && m.middlePressed)) return;
      this.state = 'down';
      this.holdT = 0;
    }
    if (!live) { this.cancelWheel(); this.state = 'idle'; return; }
    if (this.state === 'down') {
      this.holdT += dt;
      if (m.middleReleased) { this.state = 'idle'; this.pingAim(); return; }    // a click: the ping that fits what you look at
      if (!m.middle) { this.state = 'idle'; return; }                            // the button went with the mouse being freed
      if (this.holdT >= PINGS.hold) this.openWheel();
      return;
    }
    // the wheel is open: the mouse moves a stick (the view does not turn); letting go places the choice
    const grab = g.input.grab;
    const dx = (grab ? grab.x : 0) + m.dx, dy = (grab ? grab.y : 0) + m.dy;
    if (grab) grab.x = grab.y = 0;
    m.dx = m.dy = 0;
    this.nudge(dx, dy);
    if (m.middleReleased) {
      const pick = this.pick;
      this.closeWheel();
      if (pick < 0) this.pingAim(); else this.markAim(pick);
    } else if (!m.middle) this.closeWheel();
  }

  openWheel() {
    this.state = 'wheel';
    this.stick.x = this.stick.y = 0;
    this.pick = -1;
    this.g.input.grab = { x: 0, y: 0 };
    const w = $('pingWheel');
    if (w) { w.classList.remove('hidden'); this.paintWheel(); }
  }

  closeWheel() {
    this.state = 'idle';
    this.g.input.grab = null;
    const w = $('pingWheel');
    if (w) w.classList.add('hidden');
  }

  // dropped without placing anything (Esc, a menu coming up, another window)
  cancelWheel() {
    if (this.state === 'wheel') this.closeWheel();
    else if (this.g.input && this.g.input.grab) this.g.input.grab = null;
    this.state = 'idle';
  }

  // Move the stick by (dx, dy) pixels and work out which kind it points at.
  nudge(dx, dy) {
    const s = this.stick;
    s.x += dx; s.y += dy;
    const len = Math.hypot(s.x, s.y);
    if (len > WHEEL.reach) { s.x *= WHEEL.reach / len; s.y *= WHEEL.reach / len; }
    if (len < WHEEL.dead) this.pick = -1;
    else this.pick = Math.round((((Math.atan2(s.y, s.x) + Math.PI / 2) % TAU + TAU) % TAU) / (TAU / TYPES.length)) % TYPES.length;
    this.paintWheel();
  }

  paintWheel() {
    const w = $('pingWheel');
    if (!w || w.classList.contains('hidden')) return;
    w.querySelectorAll('.pw').forEach((e, i) => e.classList.toggle('sel', i === this.pick));
    const hub = w.querySelector('.hub');
    hub.querySelector('b').textContent = this.pick < 0 ? 'Ping' : TYPES[this.pick].name;
    hub.querySelector('small').textContent = this.pick < 0 ? 'what you look at' : 'marker · lasts a minute';
    const dot = w.querySelector('.stick');
    const k = WHEEL.ring / WHEEL.reach;
    dot.style.left = `${this.stick.x * k * 0.8}px`;
    dot.style.top = `${this.stick.y * k * 0.8}px`;
  }

  pingAim() {
    const a = this.aim();
    if (!a) { this.g.ui.feedback('Look at the ground or a target to ping it', false); return null; }
    return this.place(a.type, a.x, a.y, a.z, false);
  }

  markAim(type) {
    const a = this.aim();
    if (!a) { this.g.ui.feedback('Look at the ground or a target to mark it', false); return null; }
    return this.place(type, a.x, a.y, a.z, true);
  }

  // ---------------- maps ----------------
  // A click on the HUD minimap or the big map: left puts a marker of the selected kind there, right takes away your nearest.
  // The spot comes from where the click fell on the canvas, the inverse of the maps' own drawing (x + half) * size / (2 * half).
  mapClick(cv, e, remove) {
    const g = this.g;
    if (g.state !== 'playing') return null;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const x = (u * 2 - 1) * WORLD.half, z = (v * 2 - 1) * WORLD.half;
    if (remove) return this.removeNear(x, z, (16 * WORLD.half * 2) / r.width);
    const cx = clamp(x, -WORLD.playHalf, WORLD.playHalf), cz = clamp(z, -WORLD.playHalf, WORLD.playHalf);
    return this.place(this.sel, cx, g.physics.terrainHeight(cx, cz), cz, true);
  }

  syncPalette() {
    document.querySelectorAll('#pingPalette button').forEach((b) => b.classList.toggle('active', Number(b.dataset.t) === this.sel));
  }

  // ---------------- placing, sending, receiving ----------------
  // Is this team allowed another call-out? 1 per `gap` seconds and `burst` per `window`. The host asks this for everyone
  // (removals have a looser count of their own); a client asks it of itself with a little extra gap.
  allow(team, removal = false, slack = 0) {
    const now = this.g.time;
    let r = this.rate.get(team);
    if (!r) this.rate.set(team, r = { last: -99, puts: [], rms: [] });
    if (removal) {
      r.rms = r.rms.filter((t) => now - t < PINGS.window);
      if (r.rms.length >= PINGS.burst * 3) return false;
      r.rms.push(now);
      return true;
    }
    if (now - r.last < PINGS.gap + slack) return false;
    r.puts = r.puts.filter((t) => now - t < PINGS.window);
    if (r.puts.length >= PINGS.burst) return false;
    r.last = now;
    r.puts.push(now);
    return true;
  }

  // My own call-out: shown at once, and sent on (the host passes it to my allies). Returns the item, or null when it was
  // refused (rate limit, nothing to place on).
  place(type, x, y, z, marker) {
    const g = this.g;
    if (g.state !== 'playing' || !Number.isInteger(type) || type < 0 || type >= TYPES.length || !num(x) || !num(y) || !num(z)) return null;
    if (!this.allow(g.localTeam, false, g.mode === 'client' ? PINGS.slack : 0)) { g.ui.feedback('Slow down: pinging too fast', false); return null; }
    x = r2(clamp(x, -WORLD.playHalf, WORLD.playHalf)); z = r2(clamp(z, -WORLD.playHalf, WORLD.playHalf)); y = r2(y);
    // within a few metres of one of mine of the same sort: that one is renewed (and may change kind) instead of a second
    const near = this.items.find((o) => o.mine && o.marker === !!marker && Math.hypot(o.x - x, o.z - z) < PINGS.merge);
    const id = near ? near.id : ++this.seq;
    const it = this.add({ id, team: g.localTeam, name: g.player.name, type, marker: !!marker, x, y, z, mine: true });
    g.audio.play(SOUND_OF[type]);
    g.alerts.learn(marker ? 'marker' : 'ping');   // (the tips about it can rest)
    const wire = { id, ty: type, mk: marker ? 1 : 0, x, y, z };
    if (g.mode === 'client') g.net.toHost({ a: 'ping', ...wire });
    else if (g.mode === 'host') this.relay({ k: 'ping', ...wire, team: g.localTeam, name: g.player.name }, g.player);
    return it;
  }

  // Take away my nearest marker within `radius` metres of a spot.
  removeNear(x, z, radius) {
    const g = this.g;
    let best = null, bd = radius;
    for (const o of this.items) {
      if (!o.mine || !o.marker) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return null;
    const id = best.id;
    this.drop(best);
    if (g.mode === 'client') g.net.toHost({ a: 'ping', rm: id });
    else if (g.mode === 'host') this.relay({ k: 'ping', rm: id, team: g.localTeam }, g.player);
    return best;
  }

  // Check the shape of a call-out from the network: whole numbers for kind and number, finite numbers inside the map.
  clean(d) {
    if (!d || typeof d !== 'object') return null;
    const lim = WORLD.playHalf + 1;
    if (!Number.isInteger(d.ty) || d.ty < 0 || d.ty >= TYPES.length) return null;
    if (!Number.isInteger(d.id) || d.id < 1 || d.id > 1e9) return null;
    if (!num(d.x) || !num(d.z) || Math.abs(d.x) > lim || Math.abs(d.z) > lim) return null;
    const x = clamp(d.x, -WORLD.playHalf, WORLD.playHalf), z = clamp(d.z, -WORLD.playHalf, WORLD.playHalf);
    const th = this.g.physics.terrainHeight(x, z);
    const y = num(d.y) ? clamp(d.y, th - 1, th + 40) : th;
    return { id: d.id, type: d.ty, marker: !!d.mk, x: r2(x), y: r2(y), z: r2(z) };
  }

  // Host: a client's call-out (or the removal of one of their markers). Checked, counted, and passed to their allies.
  fromClient(p, d) {
    if (!p || !d || typeof d !== 'object' || !Number.isInteger(p.team)) return;
    if (d.rm !== undefined) {
      if (!Number.isInteger(d.rm) || d.rm < 1 || !this.allow(p.team, true)) return;
      this.relay({ k: 'ping', rm: d.rm, team: p.team }, p);
      return;
    }
    const c = this.clean(d);
    if (!c || !this.allow(p.team)) return;
    this.relay({ k: 'ping', id: c.id, ty: c.type, mk: c.marker ? 1 : 0, x: c.x, y: c.y, z: c.z, team: p.team, name: p.name }, p);
  }

  // Host: send an event to every allied human except its author (who has it already).
  relay(ev, from) {
    const g = this.g;
    for (const h of g.humans) if (h !== from && allied(h.team, ev.team)) g.deliver(h, ev);
  }

  // A call-out (or a removal) from an ally, as the 'ping' event the host passes on.
  receive(ev) {
    const g = this.g;
    if (!ev || typeof ev !== 'object' || !Number.isInteger(ev.team) || ev.team < 0 || ev.team > 3) return;
    if (ev.team === g.localTeam || !allied(ev.team, g.localTeam)) return;
    if (ev.rm !== undefined) {
      const it = this.items.find((o) => o.team === ev.team && o.id === ev.rm && o.marker);
      if (it) this.drop(it);
      return;
    }
    const c = this.clean(ev);
    if (!c) return;
    const name = typeof ev.name === 'string' ? ev.name.replace(/[\u0000-\u001f]/g, '').slice(0, 16) || 'Ally' : 'Ally';
    const it = this.add({ ...c, team: ev.team, name, mine: false });
    g.ui.toast(`${name}: ${TYPES[it.type].say}`, it.team);
    g.audio.play(SOUND_OF[it.type]);
  }

  // Put a call-out on the list (renewing it if it is already there, by team and number). A player keeps at most
  // PINGS.maxMarkers markers: the oldest goes.
  add(c) {
    const g = this.g;
    let it = this.items.find((o) => o.team === c.team && o.id === c.id);
    if (it) this.drop(it);
    it = { ...c, t0: g.time, ttl: c.marker ? PINGS.markerLife : PINGS.life, vis: null };
    this.items.push(it);
    this.build(it);
    const mine = this.items.filter((o) => o.team === it.team && o.marker === it.marker);
    const cap = it.marker ? PINGS.maxMarkers : PINGS.burst;
    if (mine.length > cap) {
      mine.sort((a, b) => a.t0 - b.t0);
      this.drop(mine[0]);
    }
    return it;
  }

  drop(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    const v = it.vis;
    if (!v) return;
    this.group.remove(v.group);
    for (const m of [v.beam.material, v.base.material, v.pulse.material, v.spr.material]) m.dispose();
    v.tex.dispose();
    if (v.el) v.el.remove();
    it.vis = null;
  }

  // ---------------- looks: the beacon in the world, the arrow at the edge of the screen ----------------
  build(it) {
    const t = TYPES[it.type];
    const rim = TEAM_CSS[it.team] || '#ffffff';
    const house = new THREE.Color(TEAM_COLORS[it.team] ?? 0xffffff), tint = new THREE.Color(t.color);
    const mat = (color, map = null, depthTest = true) => new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity: 0, depthWrite: false, depthTest, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    const big = !it.marker;
    const height = big ? 40 : 18;
    const group = new THREE.Group();
    const beam = new THREE.Mesh(BEAM, mat(tint, fade()));
    beam.scale.set(big ? 1 : 0.6, height, big ? 1 : 0.6);
    const base = new THREE.Mesh(RING, mat(house, null, false));       // the sender's house colour on the ground, seen through grass and bumps
    const pulse = new THREE.Mesh(RING, mat(tint, null, false));
    base.position.y = pulse.position.y = 0.2;
    for (const m of [beam, base, pulse]) { m.renderOrder = 11; m.frustumCulled = false; }
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 176;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    spr.center.set(0.5, 0);
    spr.position.y = 2.4;
    spr.renderOrder = 13;
    group.add(beam, base, pulse, spr);
    group.position.set(it.x, it.y, it.z);
    this.group.add(group);
    let el = null;
    if (this.layer) {
      el = document.createElement('div');
      el.className = 'pg';
      const ic = document.createElement('canvas');
      ic.className = 'pgI'; ic.width = ic.height = 44;
      drawIcon(ic.getContext('2d'), it.type, 22, 22, 18, rim);
      const ar = document.createElement('i');
      ar.className = 'pgA';
      ar.style.borderLeftColor = t.color;
      const ds = document.createElement('span');
      ds.className = 'pgD';
      el.append(ar, ic, ds);
      this.layer.appendChild(el);
    }
    it.vis = { group, beam, base, pulse, spr, tex, canvas, ctx: canvas.getContext('2d'), rim, el, label: '', shown: '', r0: big ? 2.6 : 1.5 };
  }

  // the sprite: the icon with its distance underneath, drawn again only when the distance label changes
  paintSprite(it, label) {
    const v = it.vis, x = v.ctx;
    v.label = label;
    x.clearRect(0, 0, 128, 176);
    drawIcon(x, it.type, 64, 60, 50, v.rim);
    x.font = '700 38px Cinzel, Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(label, 64, 148);
    x.fillStyle = '#fff'; x.fillText(label, 64, 148);
    v.tex.needsUpdate = true;
  }

  animate() {
    const g = this.g, cam = g.camera, now = g.time;
    cam.updateMatrixWorld();
    const W = innerWidth, H = innerHeight, fovK = 2 * Math.tan((cam.fov * Math.PI) / 360);
    const v3 = this.tmp || (this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3() });
    for (const it of this.items) {
      const v = it.vis;
      if (!v) continue;
      const age = now - it.t0, left = it.ttl - age;
      const k = Math.min(1, age / 0.12) * clamp(left, 0, 1);              // pops in, fades through the last second
      const dh = Math.hypot(it.x - cam.position.x, it.z - cam.position.z);
      // the beacon in the world: a beam, the house ring, and a ring that pulses outwards
      const near = clamp(dh / 7, 0, 1);                                    // (standing in it, the beam gets out of the way)
      const ph = (age * (it.marker ? 0.6 : 1.1)) % 1;
      v.beam.material.opacity = (it.marker ? 0.4 : 0.6) * k * near;
      v.base.material.opacity = 0.95 * k;
      v.base.scale.setScalar(v.r0);
      v.pulse.scale.setScalar(v.r0 * (0.3 + 1.5 * ph));
      v.pulse.material.opacity = 0.9 * (1 - ph) * k;
      // the icon: the same size on the screen wherever it stands
      v3.a.set(it.x, it.y + 2.4, it.z);
      const dist = Math.max(1, v3.a.distanceTo(cam.position));
      const h = Math.max(1, dist * fovK * PINGS.size);
      v.spr.scale.set((h * 128) / 176, h, 1);
      v.spr.material.opacity = k;
      const step = dh < 30 ? 1 : dh < 100 ? 2 : 5;
      const label = `${Math.round(dh / step) * step} m`;
      if (label !== v.label) this.paintSprite(it, label);
      // out of view: an arrow at the edge of the screen pointing the way, with the icon and the distance
      if (!v.el) continue;
      v3.b.copy(v3.a).applyMatrix4(cam.matrixWorldInverse);                // in the camera's own frame
      let dx = 0, dy = 0, seen = false;
      if (v3.b.z < -0.1) {
        v3.a.project(cam);
        seen = Math.abs(v3.a.x) < 0.94 && Math.abs(v3.a.y) < 0.88;
        dx = v3.a.x * W / 2; dy = -v3.a.y * H / 2;
      } else { dx = v3.b.x; dy = -v3.b.y; }                                 // behind you: turn towards the side it is on
      if (seen) { if (v.shown !== 'none') { v.el.style.display = 'none'; v.shown = 'none'; } continue; }
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }
      const m = 44;
      const s = Math.min(dx ? (W / 2 - m) / Math.abs(dx) : Infinity, dy ? (H / 2 - m) / Math.abs(dy) : Infinity);
      const px = W / 2 + dx * s, py = H / 2 + dy * s;
      const css = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      const ang = `${Math.atan2(dy, dx).toFixed(3)}rad`;
      const key = css + ang + label + k.toFixed(2);
      if (key !== v.shown) {
        v.shown = key;
        v.el.style.display = 'block';
        v.el.style.transform = css;
        v.el.style.opacity = String(it.marker ? 0.75 * k : k);
        v.el.firstChild.style.transform = `rotate(${ang}) translateX(30px)`;
        v.el.lastChild.textContent = label;
      }
    }
  }

  // ---------------- the maps ----------------
  // Called at the end of the map painter (HUD minimap and big map, S pixels across): a pulsing ring for a ping, a pin
  // for a marker, in the kind's colour with the sender's house colour round it.
  paintMap(ctx, S, big) {
    if (!this.items.length) return;
    const g = this.g, now = g.time;
    const k = S / (WORLD.half * 2), m = big ? (S / 180) * 0.55 : 1;
    const X = (v) => (v + WORLD.half) * k;
    ctx.save();
    ctx.lineJoin = 'round';
    for (const pass of [true, false]) for (const it of this.items) {
      if (it.marker !== pass) continue;
      const x = X(it.x), y = X(it.z), age = now - it.t0;
      const a = clamp(it.ttl - age, 0, 1);
      const rim = TEAM_CSS[it.team] || '#fff', col = TYPES[it.type].color;
      // rings going out: all the time for a ping, a few turns for a fresh marker
      if (!it.marker || age < 3) {
        for (let i = 0; i < 2; i++) {
          const ph = (age * 0.8 + i * 0.5) % 1;
          ctx.globalAlpha = a * (1 - ph) * 0.9;
          ctx.strokeStyle = col; ctx.lineWidth = big ? 3 : 2;
          ctx.beginPath(); ctx.arc(x, y, (3 + 14 * ph) * m, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalAlpha = a;
      if (big) {
        drawIcon(ctx, it.type, x, y, (it.marker ? 4.6 : 3.8) * m, rim);
        ctx.font = '600 13px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const name = it.mine ? 'You' : it.name;
        ctx.strokeText(name, x, y - (it.marker ? 4.6 : 3.8) * m - 6);
        ctx.fillStyle = '#fff'; ctx.fillText(name, x, y - (it.marker ? 4.6 : 3.8) * m - 6);
      } else {
        ctx.fillStyle = col; ctx.strokeStyle = rim; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(x, y, it.marker ? 4.2 : 3.4, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
