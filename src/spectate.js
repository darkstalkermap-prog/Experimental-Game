// Spectating: the cameras of somebody who is out of the fight, and of somebody who only watches.
//   - Out of the fight: your hero is dead and waiting to rise, your house is destroyed, or (War Mode) your hero has fallen while the battle goes on. Instead of
//     a death screen you watch the battle; your hero takes the camera back the moment it rises again, and the end of the match brings the end screen as ever.
//   - A spectator (game.spectator): a battle started from the menu's Spectate button (every house an AI lord, every army an AI general's, every hero a bot), or
//     a seat in an online room taken to watch instead of play (main.js). The local player then holds no hero, no house and no seat: it is not in game.humans,
//     it never spawns, and it sends the host nothing. A guest who watches gets the host's snapshots like any guest (netsync.js); the host who watches simulates
//     the battle without a hero of its own.
// Three cameras:
//   follow    behind a living hero or lord (left / right click or Q / E: the previous and the next one; the mouse turns round them, the wheel moves in and out)
//   free      Space: fly with WASD and the mouse, Shift for speed; kept inside the map and above the ground
//   overview  C: high above the battlefield, turning slowly; WASD moves it, the mouse turns it, the wheel goes up and down
// (1 / 2 / 3 pick follow / free / overview too.) The HUD while spectating is a small bar (who you watch, the camera, the keys), the minimap, the scores and the
// kill feed; the hero's own bars, the abilities and the crosshair go (CSS below, by the classes `spectating` and `spectator` on #hud).
import * as THREE from 'three';
import { TEAM_CSS, WORLD } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const MODES = ['follow', 'free', 'overview'];
const MODE_NAME = { follow: 'Following', free: 'Free camera', overview: 'Overview' };
const FREE = { speed: 16, fast: 48, top: 160 };
const SEE_DEAD = 2.5;   // seconds the camera stays on a hero who has just fallen before it moves on to the next

const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
#specBar { position: absolute; left: 16px; bottom: 16px; width: 330px; padding: 7px 12px 8px; font-size: 14px; line-height: 1.3; }
#specBar .sb-out { font-family: Cinzel, Georgia, serif; font-size: 13px; color: #ffb39a; margin-bottom: 4px; }
#specBar .sb-out:empty { display: none; }
#specBar .sb-who { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; }
#specBar .sb-mode { flex-basis: 100%; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; }
#specBar .sb-name { font-family: Cinzel, Georgia, serif; font-size: 16px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#specBar .sb-name:empty { display: none; }
#specBar .sb-sub { font-size: 13px; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#specBar .sb-hp { height: 5px; margin: 5px 0 2px; background: rgba(0,0,0,0.45); border-radius: 3px; overflow: hidden; }
#specBar .sb-hp i { display: block; height: 100%; width: 0; background: #c9443a; transition: width 0.15s linear; }
#specBar.nohp .sb-hp { display: none; }
#specBar .sb-keys { margin-top: 5px; font-size: 12px; opacity: 0.85; line-height: 1.6; }
#specBar .sb-keys kbd { font-size: 10px; padding: 0 4px; margin-right: 2px; }
#hud.spectating #dock, #hud.spectating #crosshair, #hud.spectating #drawbar, #hud.spectating #hitmarker, #hud.spectating #respawn, #hud.spectating #prompt,
#hud.spectating #target, #hud.spectating #aimhint, #hud.spectating #hint, #hud.spectating #vignette { display: none !important; }
#hud.spectator #goldbox, #hud.spectator #goldpops, #hud.spectator #xppops, #hud.spectator #command, #hud.spectator #war, #hud.spectator .flowrow,
#hud.spectator #minimapWrap .mapHint { display: none !important; }
#hud:not(.spectating) #specBar { display: none; }
@media (max-width: 760px) { #specBar { width: 250px; } #specBar .sb-keys { display: none; } }
`;
  document.head.appendChild(s);
}

// the bar is made once per page and kept (each match has a new Spectate)
function bar() {
  let el = $('specBar');
  if (el) return el;
  style();
  el = document.createElement('div');
  el.id = 'specBar';
  el.className = 'panel';
  el.innerHTML = '<div class="sb-out"></div><div class="sb-who"><span class="sb-mode"></span><b class="sb-name"></b><span class="sb-sub"></span></div><div class="sb-hp"><i></i></div><div class="sb-keys"></div>';
  $('hud').appendChild(el);
  return el;
}

export class Spectate {
  constructor(game) {
    this.g = game;
    this.mode = 'follow';
    this.target = null;      // the hero or lord the follow camera is behind (a Player or a Unit)
    this.deadT = 0;          // how long the target has been down
    this.was = false;        // was the camera ours last frame
    this.began = false;      // (a spectator's first moments: the banner, a short preparation)
    this.t = 0;
    this.hudT = 0;
    this.shown = {};         // what the bar shows now (DOM is only written when it changes)
    this.classes = '';
    // the cameras' own state
    this.orbit = 0; this.lift = 0.4; this.dist = 7;            // follow: around the target, above it, how far
    this.camYaw = 0;
    this.free = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.3 };
    this.over = { x: 0, z: 0, yaw: 0, zoom: 1 };
    this.smooth = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.mark = { pos: new THREE.Vector3(), yaw: 0 };           // where the minimap's arrow stands while spectating
  }

  // is the camera ours this frame: the match is on and this screen has no living hero (and War Mode's army panel is not open)
  get on() {
    const g = this.g;
    return g.state === 'playing' && !g.practice && (g.spectator || !g.player.alive) && !(g.war && g.war.panelOpen);
  }

  // ---------------- the heroes and lords that can be followed ----------------
  candidates() {
    const g = this.g, out = [];
    for (const h of g.humans) if (h !== g.player && h.alive && !h.specGone) out.push(h);
    for (const u of g.units) if (u.isHero && u.alive && !u.specGone) out.push(u);
    // (a steady order to step through: by house, then by name)
    out.sort((a, b) => a.team - b.team || String(a.name).localeCompare(String(b.name)));
    return out;
  }

  // the one to start with: your own side's nearest to where you fell (or to the camera), else anybody's nearest
  pickFirst() {
    const g = this.g, list = this.candidates();
    if (!list.length) return null;
    const at = g.player.alive || g.spectator ? g.camera.position : g.player.pos;
    let best = null, bd = Infinity;
    for (const c of list) {
      const d = (c.pos.x - at.x) ** 2 + (c.pos.z - at.z) ** 2 + (!g.spectator && c.team !== g.localTeam ? 1e7 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  step(dir) {
    const list = this.candidates();
    if (!list.length) { this.target = null; return; }
    const i = list.indexOf(this.target);
    this.target = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length];
    this.deadT = 0;
    this.orbit = 0;
    this.snap = true;
  }

  setMode(m) {
    if (!MODES.includes(m) || m === this.mode) return;
    const cam = this.g.camera;
    if (m === 'free') {   // (free flight starts where the camera is, looking where it looks)
      cam.getWorldDirection(tmpV);
      this.free.pos.copy(cam.position);
      this.free.yaw = Math.atan2(tmpV.x, tmpV.z);
      this.free.pitch = clamp(Math.asin(clamp(tmpV.y, -1, 1)), -1.45, 1.45);
    }
    if (m === 'overview') {   // (over the middle of the fighting)
      const c = this.centre();
      this.over.x = c.x; this.over.z = c.z;
      cam.getWorldDirection(tmpV);
      this.over.yaw = Math.atan2(tmpV.x, tmpV.z);
    }
    if (m === 'follow' && (!this.target || !this.target.alive)) this.target = this.pickFirst();
    this.mode = m;
    this.snap = m === 'follow';
    this.shown.keys = null;
  }

  // where the soldiers are, on average (the overview looks there)
  centre() {
    const g = this.g;
    let sx = 0, sz = 0, n = 0;
    for (const u of g.units) if (u.alive) { sx += u.pos.x; sz += u.pos.z; n++; }
    return n ? { x: sx / n, z: sz / n } : { x: 0, z: 0 };
  }

  // ---------------- keys (Game.handleInput, before anything else). true: the keys are all ours (a spectator gives no orders and buys nothing) ----------------
  input(i) {
    const g = this.g;
    if (!this.on) return false;
    const free = !g.ui.shopOpen && !g.ui.mapOpen;
    if (free) {
      const m = i.mouse;
      if (i.hit('KeyQ') || (m.leftPressed && i.locked)) { if (this.mode !== 'follow') this.setMode('follow'); this.step(-1); }
      if (i.hit('KeyE') || (m.rightPressed && i.locked)) { if (this.mode !== 'follow') this.setMode('follow'); this.step(1); }
      if (i.hit('Space')) this.setMode(this.mode === 'free' ? 'follow' : 'free');
      if (i.hit('KeyC')) this.setMode(this.mode === 'overview' ? 'follow' : 'overview');
      if (i.hit('Digit1')) this.setMode('follow');
      if (i.hit('Digit2')) this.setMode('free');
      if (i.hit('Digit3')) this.setMode('overview');
    }
    if (!g.spectator) return false;   // (a lord who is out still has the shop, the map and the orders)
    i.mouse.middlePressed = false;    // (no markers either: they would be some house's)
    if (i.hit('KeyM')) g.ui.toggleMap();
    return true;
  }

  // ---------------- the camera (Game.update: after the hero, the ending and War Mode have placed theirs) ----------------
  camera(dt) {
    const g = this.g, on = this.on;
    this.t += dt;
    if (on && g.spectator && !this.began && this.t > 0.3) this.begin();
    if (on !== this.was) {
      this.was = on;
      if (on) {
        if (!this.target || !this.target.alive) this.target = this.pickFirst();
        this.snap = true;
        if (g.player.viewModel) g.player.viewModel.visible = false;
      }
      this.hudT = 0;
    }
    this.hud(dt, on);
    if (!on) return;
    const cam = g.camera, inp = g.input;
    const look = inp.locked && !g.paused && !g.ui.shopOpen && !g.ui.mapOpen;
    const m = inp.mouse, sens = g.player.sensitivity || 0.0022;
    const dx = look ? m.dx * sens : 0, dy = look ? m.dy * sens : 0, wheel = look ? m.wheel : 0;
    if (cam.fov !== g.player.baseFov) { cam.fov = g.player.baseFov; cam.updateProjectionMatrix(); }
    if (this.mode === 'follow') {
      const t = this.target;
      // (a few times a second: is the target still in the battle at all? A person who left is taken off the list without dying)
      this.checkT = (this.checkT || 0) - dt;
      if (t && this.checkT <= 0) { this.checkT = 0.25; if (!(g.units.includes(t) || g.humans.includes(t))) t.specGone = true; }
      if (!t || !t.alive || t.specGone) {
        this.deadT += dt;
        if (!t || t.specGone || this.deadT > SEE_DEAD) { this.target = this.pickFirst(); this.deadT = 0; this.snap = true; }
      } else this.deadT = 0;
      if (!this.target) { this.overview(dt, 0, 0, 0, true); return; }   // (nobody left to follow: look over the field)
      this.follow(dt, dx, dy, wheel);
    } else if (this.mode === 'free') this.fly(dt, dx, dy);
    else this.overview(dt, dx, dy, wheel, false);
    // the minimap's arrow: where the camera stands and which way it looks
    cam.getWorldDirection(tmpV);
    this.mark.pos.copy(cam.position);
    this.mark.yaw = Math.atan2(tmpV.x, tmpV.z);
  }

  follow(dt, dx, dy, wheel) {
    const g = this.g, t = this.target, cam = g.camera;
    const big = t.isGiant ? 2.2 : t.mounted ? 1.35 : 1;
    this.orbit = wrap(this.orbit - dx);
    this.lift = clamp(this.lift + dy, -0.15, 1.2);
    if (wheel) this.dist = clamp(this.dist * (wheel > 0 ? 1.12 : 0.89), 3.5, 24);
    const facing = (t.mounted && t.heading !== undefined ? t.heading : t.yaw) || 0;
    const want = facing + this.orbit;
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 3);
    this.camYaw = wrap(this.camYaw + wrap(want - this.camYaw) * k);
    const d = this.dist * big, h = 1.5 * big;
    const tp = t.mesh && !t.pos ? t.mesh.position : t.pos;
    tmpL.set(tp.x, tp.y + h, tp.z);
    const cl = Math.cos(this.lift);
    tmpV.set(tp.x - Math.sin(this.camYaw) * d * cl, tp.y + h + Math.sin(this.lift) * d, tp.z - Math.cos(this.camYaw) * d * cl);
    this.keepIn(tmpV, 1.2);
    const kp = this.snap ? 1 : 1 - Math.exp(-dt * 10);
    this.smooth.lerp(tmpV, kp);
    this.look.lerp(tmpL, kp);
    this.snap = false;
    cam.position.copy(this.smooth);
    cam.lookAt(this.look);
  }

  fly(dt, dx, dy) {
    const g = this.g, f = this.free, i = g.input, cam = g.camera;
    f.yaw = wrap(f.yaw - dx);
    f.pitch = clamp(f.pitch - dy, -1.45, 1.45);
    const fx = Math.sin(f.yaw) * Math.cos(f.pitch), fy = Math.sin(f.pitch), fz = Math.cos(f.yaw) * Math.cos(f.pitch);
    const rx = -Math.cos(f.yaw), rz = Math.sin(f.yaw);   // (to the right of the view)
    const busy = g.ui.shopOpen || g.ui.mapOpen || g.paused;
    const fw = busy ? 0 : (i.down('KeyW') ? 1 : 0) - (i.down('KeyS') ? 1 : 0), st = busy ? 0 : (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    const v = (i.down('ShiftLeft') || i.down('ShiftRight') ? FREE.fast : FREE.speed) * dt;
    f.pos.x += (fx * fw + rx * st) * v;
    f.pos.y += fy * fw * v;
    f.pos.z += (fz * fw + rz * st) * v;
    this.keepIn(f.pos, 1.6);
    cam.position.copy(f.pos);
    cam.rotation.set(f.pitch, f.yaw + Math.PI, 0, 'YXZ');
    this.smooth.copy(f.pos);
  }

  overview(dt, dx, dy, wheel, idle) {
    const g = this.g, o = this.over, i = g.input, cam = g.camera, P = WORLD.playHalf;
    o.yaw = wrap(o.yaw - dx + dt * 0.035);   // (and a slow turn of its own)
    o.zoom = clamp(o.zoom * (wheel > 0 ? 1.1 : wheel < 0 ? 0.91 : 1) * (1 + dy * 0.6), 0.35, 1.4);
    const busy = idle || g.ui.shopOpen || g.ui.mapOpen || g.paused;
    const fw = busy ? 0 : (i.down('KeyW') ? 1 : 0) - (i.down('KeyS') ? 1 : 0), st = busy ? 0 : (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    const v = (i.down('ShiftLeft') || i.down('ShiftRight') ? 2.5 : 1) * P * 0.35 * o.zoom * dt;
    o.x = clamp(o.x + (Math.sin(o.yaw) * fw - Math.cos(o.yaw) * st) * v, -P, P);
    o.z = clamp(o.z + (Math.cos(o.yaw) * fw + Math.sin(o.yaw) * st) * v, -P, P);
    const base = Math.min(P * 0.46, 90) * o.zoom, back = base * 0.95, up = base;   // (not too far out: the haze of the land thickens with distance)
    const gy = g.physics.terrainHeight(o.x, o.z);
    tmpV.set(o.x - Math.sin(o.yaw) * back, gy + up, o.z - Math.cos(o.yaw) * back);
    this.keepIn(tmpV, 4);
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 4);
    this.smooth.lerp(tmpV, k);
    this.look.lerp(tmpL.set(o.x, gy, o.z), k);
    this.snap = false;
    cam.position.copy(this.smooth);
    cam.lookAt(this.look);
  }

  // inside the map and above whatever stands under the camera
  keepIn(v, above) {
    const g = this.g, lim = WORLD.half - 6;
    v.x = clamp(v.x, -lim, lim);
    v.z = clamp(v.z, -lim, lim);
    const floor = g.physics.groundHeight(v.x, v.z, v.y + 1) + above;
    v.y = clamp(v.y, floor, Math.max(floor, g.physics.terrainHeight(v.x, v.z) + FREE.top + WORLD.playHalf * 0.4));
  }

  // ---------------- a spectator's first moments ----------------
  begin() {
    const g = this.g;
    this.began = true;
    // nobody plays: the first preparation is short (the AI lords and generals have their armies at once)
    if (g.simulating && !g.humans.some((h) => !h.isBot)) {
      const prep = g.war ? 6 : 10;
      if (g.phase === 'prep' && g.round === 0 && g.phaseT > prep) g.phaseT = prep;
      if (g.hero && g.hero.prepLeft > prep) g.hero.prepLeft = prep;
    }
    const what = g.hero ? 'Hero Mode' : g.war ? 'War Mode' : g.objective === 'koth' ? 'King of the Hill' : 'Conquest';
    g.ui.banner(`Spectating · ${what}`, 'Left / right click or Q / E: the next hero or lord · Space: free camera · C: overview · Tab: scores · M: map · Esc: menu');
  }

  // ---------------- the bar ----------------
  hud(dt, on) {
    const g = this.g, hud = $('hud');
    if (!hud) return;
    const cls = on ? (g.spectator ? 'spectating spectator' : 'spectating') : '';
    if (cls !== this.classes || (on && !hud.classList.contains('spectating'))) {
      this.classes = cls;
      hud.classList.toggle('spectating', on);
      hud.classList.toggle('spectator', on && !!g.spectator);
      if (on) bar();
    }
    if (!on) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const el = bar(), s = this.shown;
    const set = (k, node, v, html = false) => { if (s[k] !== v) { s[k] = v; if (html) node.innerHTML = v; else node.textContent = v; } };
    set('out', el.querySelector('.sb-out'), this.outLine());
    const t = this.mode === 'follow' ? this.target : null;
    set('mode', el.querySelector('.sb-mode'), MODE_NAME[this.mode] || '');
    const lord = t && !t.cls;   // (an AI lord is a soldier of the lord type; a hero is a Player with a class)
    const name = t ? `${!lord && t.cls.icon ? t.cls.icon + ' ' : ''}${t.name || 'Lord'}` : this.mode === 'follow' ? 'Nobody to follow' : '';
    set('name', el.querySelector('.sb-name'), name);
    const nameEl = el.querySelector('.sb-name'), col = t ? TEAM_CSS[t.team] || '#fff' : '';
    if (s.col !== col) { s.col = col; nameEl.style.color = col; }
    const f = t ? g.factions[t.team] : null;
    const sub = t ? [f ? f.name : '', lord ? 'Lord' : `${t.cls.name} · Lv ${t.level || 1}`, t.alive ? '' : 'fallen'].filter(Boolean).join(' · ') : '';
    set('sub', el.querySelector('.sb-sub'), sub);
    const hp = t && t.alive && t.maxHp ? clamp(t.hp / t.maxHp, 0, 1) : 0;
    const w = t ? `${(hp * 100).toFixed(0)}%` : '0%';
    if (s.hp !== w) { s.hp = w; el.querySelector('.sb-hp i').style.width = w; }
    if (s.nohp !== !t) { s.nohp = !t; el.classList.toggle('nohp', !t); }
    if (s.keys === null || s.keys === undefined || s.keysMode !== this.mode) {
      s.keysMode = this.mode;
      const keys = this.mode === 'free' ? '<kbd>WASD</kbd> fly · <kbd>Shift</kbd> fast · <kbd>Space</kbd> back to the heroes · <kbd>C</kbd> overview'
        : this.mode === 'overview' ? '<kbd>WASD</kbd> move · mouse turn · wheel height · <kbd>C</kbd> back to the heroes · <kbd>Space</kbd> free camera'
          : '<kbd>LMB</kbd><kbd>RMB</kbd> or <kbd>Q</kbd><kbd>E</kbd> previous / next · <kbd>Space</kbd> free camera · <kbd>C</kbd> overview';
      set('keys', el.querySelector('.sb-keys'), keys + ' · <kbd>Tab</kbd> scores', true);
    }
  }

  // the first line of the bar: why you are watching (nothing for a spectator)
  outLine() {
    const g = this.g, f = g.localFaction;
    if (g.spectator || !f) return '';
    if (g.war) return f.eliminated ? 'Your army has fallen.' : 'You have fallen. Your army fights on without you.';
    if (g.hero) { const n = Math.ceil(g.ui.heroRespawn ? g.ui.heroRespawn() : f.respawnT); return n > 0 ? `You have fallen · back in ${n} s` : 'You rise again…'; }
    if (f.eliminated || f.castle.fallen) return f.eliminated && !(g.callableBack && g.callableBack(f)) ? 'Your house has been destroyed.' : 'Your keep has fallen: no respawn.';
    return `You have fallen · respawn in ${Math.ceil(Math.max(0, f.respawnT))} s`;
  }
}
