// The ending of a match: a few seconds between the last blow and the end screen, so that the match ends on a high (or at least with a bang).
//   grand  the keep that decided it is framed from where the player was and falls in slow motion (the collapse is castle.js / castlecollapse.js), a war
//          horn (horn.js) over it, a letterbox, and at the end the banner with the best moment of the match (highlights.js); about 3.5 seconds
//   light  no keep to look at (King of the Hill, a keep that fell long ago): the same slow motion, horn and banner from the hero's own eyes; about 2.5 seconds
//   none   a concede, a lost connection, the practice yard, the option switched off, or a Hero Game Mode win that no keep decided: the end screen at once
//          (Hero Game Mode still gets the horn and the highlight line; a hero match decided by a keep gets the grand show)
// Any key or click skips to the end screen. The end screen itself is built the moment the match is decided (so everything that reads it finds it
// there) but kept see-through and out of the way of the mouse until the show is over.
// Slow motion is a real time scale on the world's step in single player (Game.update asks `timeScale`); in an online game nobody may slow the shared
// world, so only what is shown changes: the camera, the effects, the sound and the wait before the end screen.
import * as THREE from 'three';
import { allied } from './teams.js';
import { settings } from './settings.js';
import { pickHighlight, highlights } from './highlights.js';
import './horn.js';

const QUICK = /conced|connection|host left|left the game|disconnect/i;   // endings that are not a show
const GRACE = 0.45;           // seconds before a key or click may skip: the one that landed the last blow must not
const SLOW = 0.3;             // the time scale of the slow motion
const KEEP_Z = -6;            // where the keep stands in the castle (castlegeo.js KEEP_Z)
// the directions (from the keep, castle-local, turned by the castle's own rotation below) to the four corner towers: atan2(x, z) of (+-22.7, 22.7 - KEEP_Z) and (+-22.7, -22.7 - KEEP_Z)
const TOWER_AZ = [Math.atan2(22.7, 22.7 - KEEP_Z), -Math.atan2(22.7, 22.7 - KEEP_Z), Math.atan2(22.7, -22.7 - KEEP_Z), -Math.atan2(22.7, -22.7 - KEEP_Z)];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ss = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

const CSS = `
#gameover.finale-wait { opacity: 0; pointer-events: none; }
#gameover.finale-fade { transition: opacity 0.7s ease; }
#finale { position: fixed; inset: 0; z-index: 19; pointer-events: none; overflow: hidden; font-family: 'EB Garamond', Georgia, serif; }
#finale .bar { position: absolute; left: 0; right: 0; height: 12vh; background: #000; transition: transform 0.7s cubic-bezier(.2,.7,.2,1); }
#finale .bar.top { top: 0; transform: translateY(-100%); }
#finale .bar.bottom { bottom: 0; transform: translateY(100%); }
#finale.on .bar { transform: none; }
#finale .card { position: absolute; left: 0; right: 0; top: 60%; text-align: center; opacity: 0; transform: translateY(14px) scale(1.04); transition: opacity 0.7s ease, transform 0.9s ease; padding: 16px 16px 22px;
  background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0)); }
#finale.said .card { opacity: 1; transform: none; }
#finale.leave .card { opacity: 0; transition: opacity 0.5s ease; }
#finale .card h2 { margin: 0; font-family: 'Cinzel', Georgia, serif; font-weight: 900; font-size: clamp(38px, 8vw, 92px); letter-spacing: 0.14em; color: #f0c860;
  text-shadow: 0 0 22px rgba(255,200,90,0.55), 0 4px 14px #000; }
#finale.lost .card h2 { color: #cfc0a8; text-shadow: 0 0 22px rgba(150,30,20,0.6), 0 4px 14px #000; }
#finale .card p { margin: 6px auto 0; max-width: 900px; font-style: italic; font-size: clamp(18px, 2.6vw, 30px); line-height: 1.25; color: #f8ecd0; text-shadow: 0 2px 8px #000, 0 0 3px #000, 0 0 14px rgba(0,0,0,0.9); }
#finale .skip { position: absolute; right: 18px; bottom: calc(12vh + 10px); font-family: 'Cinzel', Georgia, serif; font-size: 12px; letter-spacing: 0.12em; color: #e9dcbc;
  opacity: 0; transition: opacity 0.6s ease; text-shadow: 0 1px 4px #000; }
#finale.on .skip { opacity: 0.55; transition-delay: 0.8s; }
@media (prefers-reduced-motion: reduce) { #finale .bar, #finale .card { transition: none; } }`;

function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById('finale-style')) return;
  const s = document.createElement('style');
  s.id = 'finale-style';
  s.textContent = CSS;
  document.head.append(s);
}

export class Finale {
  constructor(game) {
    this.g = game;
    this.mode = 'none';         // 'none' | 'light' | 'grand'
    this.active = false;        // a show is running (the end screen is waiting behind it)
    this.t = 0;                 // seconds of the show (real time, whatever the world is doing)
    this.dur = 0;               // when the end screen comes
    this.scale = 1;             // the time scale in force
    this.won = false;
    this.focus = null;          // the castle that is framed (grand)
    this.orbit = false;         // the show is over, the camera drifts round the ruin behind the end screen
    this.hostEvents = null;     // (a guest) the notable moments the host sent
    this.highlight = null;
    this.moment = null;         // the last rival keep has fallen but the match goes on: { t } (a moment of slow motion, see keepFell)
    this.slow = SLOW;
    this.az0 = 0; this.sweep = 0.5; this.d0 = 62; this.d1 = 48; this.h0 = 26; this.h1 = 17; this.fov0 = 46; this.fov1 = 54;
    this.K = new THREE.Vector3(); this.T = new THREE.Vector3();
    this.el = null;
    this.vmHidden = false;
    this.cut = false; this.cutAt = 0;      // the cut from the hero's own view to the camera of the show
    this.dulled = false;        // the world's sounds are dulled for the slow motion
    this.skipAt = GRACE;
    this.onInput = (e) => {
      if (!this.active) return;
      if (e.type === 'pointerlockchange') {
        if (document.pointerLockElement || this.t < this.skipAt) return;   // (it was locked, not freed)
      } else {
        e.stopImmediatePropagation();   // (nothing else answers to a key or a click while the show plays: the end screen's own shortcuts wait for it)
        if (this.t < this.skipAt || (e.type === 'keydown' && e.repeat)) return;
      }
      this.skip();
    };
  }

  // ---------------------------------------------------------------- the decision
  // what kind of ending this is
  plan(won, reason, opts) {
    const g = this.g;
    if (opts.quick || QUICK.test(reason || '') || settings.finale === 0 || g.practice) return 'none';
    // Hero Game Mode: a keep that fell decided it and gets the show; a win on kills or on the clock gets the horn and the highlight line only
    if (g.hero) return this.pickFocus(won) ? 'grand' : 'none';
    if (g.objective === 'koth') return 'light';
    // (a guest may be told that the match is over before its snapshots say that the keep has fallen: it looks for the castle as the show goes on)
    return this.pickFocus(won) || g.mode === 'client' ? 'grand' : 'light';
  }

  // The last rival keep has fallen but the match goes on (its lord still lives): a moment of slow motion and a call of the horn, in the hero's own view.
  // (If the match ends at once, as it mostly does, the show takes over.)
  keepFell(castle) {
    const g = this.g;
    if (this.active || g.state !== 'playing' || g.mode !== 'single' || g.hero || g.practice || g.objective === 'koth' || settings.finale === 0) return;
    const L = g.localTeam;
    if (allied(castle.team, L) || g.castles.some((c) => c !== castle && !c.fallen && !allied(c.team, L))) return;
    this.moment = { t: 0, called: false };
  }

  // The castle to look at: the last enemy keep to fall for a victory, your own for a defeat (its fall may be happening right now)
  pickFocus(won) {
    const g = this.g, L = g.localTeam;
    const recent = (list) => list.reduce((a, b) => (!a || (b.fellAt || 0) >= (a.fellAt || 0) ? b : a), null);
    const fallen = g.castles.filter((c) => c.fallen);
    if (won) return recent(fallen.filter((c) => !allied(c.team, L)));
    const own = g.castles[L];
    if (own && own.fallen) return own;
    return recent(fallen.filter((c) => allied(c.team, L))) || recent(fallen);
  }

  // ---------------------------------------------------------------- the start
  // Called by Game.finish() the moment the match is decided.
  start(won, winner, reason, opts = {}) {
    const g = this.g, ui = g.ui;
    this.won = won;
    this.hostEvents = opts.hl || null;
    let mode = 'none';
    try { mode = this.plan(won, reason, opts); } catch (e) { console.error('ending', e); }   // (whatever goes wrong, the end screen still comes)
    this.moment = null;
    const go = document.getElementById('gameover');
    if (mode !== 'none') {
      injectStyle();
      if (go) go.classList.add('finale-wait');
    }
    if (ui.shopOpen) ui.toggleShop(false);
    // the end screen is built at once, behind the show
    try { ui.gameOver(won, winner, reason); } catch (e) { if (go) go.classList.remove('finale-wait'); throw e; }
    this.highlight = ui.lastSummary ? ui.lastSummary.highlight || null : pickHighlight(g, null);
    const a = g.audio;
    if (mode === 'none') {
      g.input.unlock();
      if (g.hero) { a.play(won ? 'fanfare' : 'dirge'); a.duck(0.35, 2.2, 1.4); } else a.play(won ? 'victory' : 'defeat');
      return;
    }
    try { this.begin(mode, won); } catch (e) { this.fail(e); }
  }

  begin(mode, won) {
    const g = this.g, a = g.audio;
    a.play(won ? 'fanfare' : 'dirge');
    a.duck(0.3, mode === 'grand' ? 3 : 2, 1.6);
    if (g.mode === 'single') a.slowmo(1);
    this.dulled = g.mode === 'single';
    this.mode = mode;
    this.active = true;
    this.t = 0;
    this.orbit = false;
    this.slow = g.camfx.mute ? 0.55 : SLOW;
    this.dur = mode === 'grand' ? 3.6 : 2.6;
    this.focus = mode === 'grand' ? this.pickFocus(won) : null;
    if (this.focus) this.aim(this.focus);
    this.build(won);
    // the first frame of the show: a jolt. A hero who stands within sight of the keep sees the first beat of it with their own eyes, in slow motion,
    // and the camera cuts to the show a moment later (with the flash); anybody else gets the cut at once
    g.camfx.trauma = Math.min(1, g.camfx.trauma + 0.55);
    this.cut = false;
    this.cutAt = this.focus && g.player.alive && Math.hypot(g.player.pos.x - this.K.x, g.player.pos.z - this.K.z) < 75 ? 0.35 : 0;
    if (this.cutAt === 0 && mode === 'grand') { this.cut = true; this.flashCut(); }
    addEventListener('keydown', this.onInput, true);
    addEventListener('pointerdown', this.onInput, true);
    document.addEventListener('pointerlockchange', this.onInput);
  }

  // the cut to the show's own camera: a flash (gold for a victory, blood red for a defeat), and the weapon in the hero's hand goes
  flashCut() {
    const cf = this.g.camfx;
    if (this.won) cf.flashFrom(1, 0.86, 0.5, 0.6, 8); else cf.flashFrom(0.5, 0.05, 0.02, 0.5, 7);
    this.vmHide();
  }

  vmHide() {
    const vm = this.g.player.viewModel;
    if (vm) { vm.visible = false; this.vmHidden = true; }
  }

  // where the camera starts and how it moves: from the side the player was on (or the gate side when the player was in the castle)
  aim(c) {
    const g = this.g, p = g.player;
    this.K.copy(c.toWorld(0, KEEP_Z, 0));
    let dx = p.pos.x - this.K.x, dz = p.pos.z - this.K.z;
    if (Math.hypot(dx, dz) < 38) { dx = Math.sin(c.rot); dz = Math.cos(c.rot); }
    this.sweep = (Math.sin(c.team * 2.3 + this.K.x * 0.013) > 0 ? 1 : -1) * 0.25;
    // not in line with a corner tower, where the shot would end up beside the tower that is coming down: turn it to the nearest side that is clear
    const az = Math.atan2(dx, dz), clear = (a) => TOWER_AZ.every((t) => Math.abs(Math.atan2(Math.sin(a - t - c.rot), Math.cos(a - t - c.rot))) > 0.42);   // (a castle's own angles turned by how it stands)
    this.az0 = az;
    for (const off of [0, 0.14, -0.14, 0.28, -0.28, 0.42, -0.42, 0.56, -0.56]) {
      if (clear(az + off) && clear(az + off + this.sweep)) { this.az0 = az + off; break; }
    }
    // The shot starts far and high (the whole castle) and pushes in over the wall to a spot 47 m from the keep, clear of the towers whichever side it is
    // on (their outer corners are 43 m from it), just above the front wall: the keep is the subject, the towers frame it.
    const falling = !!(c.collapse && !c.collapse.done);   // (a keep that is coming down is framed from a little further: there is more to see)
    this.d0 = falling ? 78 : 66; this.d1 = 47;
    this.h0 = falling ? 42 : 34; this.h1 = falling ? 18 : 17;
  }

  // ---------------------------------------------------------------- the overlay
  build(won) {
    const old = document.getElementById('finale');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'finale';
    if (!won) el.classList.add('lost');
    const bt = document.createElement('div'); bt.className = 'bar top';
    const bb = document.createElement('div'); bb.className = 'bar bottom';
    const card = document.createElement('div'); card.className = 'card';
    const h = document.createElement('h2');
    h.textContent = won ? 'Victory' : 'Defeat';
    const p = document.createElement('p');
    p.textContent = this.highlight && this.highlight.text ? this.highlight.text : '';
    card.append(h, p);
    const skip = document.createElement('div'); skip.className = 'skip'; skip.textContent = 'Press any key to skip';
    el.append(bt, bb, card, skip);
    document.body.append(el);
    this.el = el;
    void el.offsetWidth;
    el.classList.add('on');
  }

  // ---------------------------------------------------------------- every frame
  // Called by Game.update with the real step. Returns what the world's step is multiplied by.
  timeScale(dt) {
    if (!this.active && !this.orbit && !this.moment) return 1;
    try { return this.step(dt); } catch (e) { this.fail(e); return 1; }
  }

  step(dt) {
    if (this.orbit) { this.t += dt; return 1; }
    if (this.moment) return this.momentScale(dt);
    if (!this.active) return 1;
    this.t += dt;
    const t = this.t;
    if (this.el) {
      const sayAt = this.mode === 'grand' ? this.dur - 2.0 : this.dur - 1.6;
      if (t >= sayAt && !this.el.classList.contains('said')) this.el.classList.add('said');
      if (t >= this.dur - 0.35) this.el.classList.add('leave');
    }
    if (t >= this.dur) { this.reveal(); return 1; }
    const cf = this.g.camfx, e = ss(t / this.dur);
    if (this.mode === 'light') cf.push = 1 + 0.1 * e;
    cf.grade = this.won ? 0 : 0.5 * e;
    if (this.g.mode !== 'single') return 1;   // (the shared world is not ours to slow down)
    const S = this.slow, out = this.dur - 1.0;
    if (this.dulled && t >= out) { this.dulled = false; this.g.audio.slowmo(0); }   // (the sounds open up again as the world speeds up)
    let k;
    if (t < 0.16) k = lerp(1, S, ss(t / 0.16));
    else if (t < out) k = lerp(S, S * 1.3, ss((t - 0.16) / (out - 0.16)));
    else k = lerp(S * 1.3, 1, ss((t - out) / 1.0));
    this.scale = k;
    return k;
  }

  momentScale(dt) {
    const m = this.moment, g = this.g;
    if (m.t === 0) g.audio.slowmo(0.8);
    m.t += dt;
    if (!m.called && m.t >= 0.6) { m.called = true; g.audio.play('call'); g.audio.duck(0.5, 1.0, 1.0); }
    if (m.t > 2.6) { this.moment = null; g.audio.slowmo(0); return 1; }
    const S = g.camfx.mute ? 0.6 : 0.4;
    return m.t < 0.15 ? lerp(1, S, ss(m.t / 0.15)) : m.t < 1.5 ? S : lerp(S, 1, ss((m.t - 1.5) / 1.1));
  }

  // The camera of a grand show (and the slow drift behind the end screen). Called after the hero has placed the camera for the frame.
  camera() {
    if (!(this.active && this.mode === 'grand') && !this.orbit) return;
    try { this.place(); } catch (e) { this.fail(e); }
  }

  place() {
    if (!this.focus && this.active) {          // (a guest: the snapshot that says which keep has fallen may still be on its way)
      const c = this.pickFocus(this.won);
      if (c) { this.focus = c; this.aim(c); this.cutAt = this.t; } else if (this.t > 1.2) this.mode = 'light';
    }
    const c = this.focus;
    if (!c) return;
    const g = this.g, cam = g.camera, K = this.K;
    if (this.t < this.cutAt) return;                 // (the first beat is the hero's own view, in slow motion)
    if (!this.cut) { this.cut = true; this.flashCut(); }
    const e = ss((this.t - this.cutAt) / (this.dur - this.cutAt));
    const drift = this.orbit ? (this.t - this.dur) * 0.035 : 0;
    const az = this.az0 + this.sweep * e + drift;
    const d = lerp(this.d0, this.d1, e), h = lerp(this.h0, this.h1, e);
    cam.position.set(K.x + Math.sin(az) * d, K.y + h, K.z + Math.cos(az) * d);
    const floor = g.physics.terrainHeight(cam.position.x, cam.position.z) + 5;
    if (cam.position.y < floor) cam.position.y = floor;
    this.T.set(K.x, K.y + lerp(4, 10, e), K.z);
    cam.lookAt(this.T);
    const fov = lerp(this.fov0, this.fov1, e);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // a fault in the show must never stop the game: say so once, and let the end screen come up at once
  fail(e) {
    console.error('ending', e);
    this.reset();
    try { this.g.input.unlock(); } catch (err) { /* nothing to do */ }
  }

  // something heavy came down while the camera was watching: a jolt of shake, however far away it was
  jolt(a) { const cf = this.g.camfx; cf.trauma = Math.min(1, cf.trauma + a * cf.amp()); }

  // ---------------------------------------------------------------- the end
  skip() {
    if (!this.active) return;
    this.reveal();
  }

  reveal() {
    if (!this.active) return;
    const g = this.g;
    this.active = false;
    this.scale = 1;
    this.g.audio.slowmo(0);
    removeEventListener('keydown', this.onInput, true);
    removeEventListener('pointerdown', this.onInput, true);
    document.removeEventListener('pointerlockchange', this.onInput);
    g.input.unlock();
    const go = document.getElementById('gameover');
    if (go) {
      go.classList.add('finale-fade');
      void go.offsetWidth;
      go.classList.remove('finale-wait');
    }
    if (this.el) {
      const el = this.el;
      el.classList.add('leave');
      el.classList.remove('on');   // (the letterbox slides away)
      setTimeout(() => el.remove(), 900);
      this.el = null;
    }
    // behind the end screen the camera goes on drifting round the ruin; with no keep to look at the hero's own view comes back
    if (this.mode === 'grand' && this.focus) { this.orbit = true; this.t = this.dur; } else this.restoreView();
    g.camfx.flash = Math.min(g.camfx.flash, 0.2);
    g.camfx.push = 1;
    g.camfx.grade = this.won || !this.focus ? 0 : 0.5;   // (a lost match stays grey behind the end screen)
  }

  restoreView() {
    const g = this.g, cam = g.camera;
    if (this.vmHidden && g.player.viewModel && g.player.alive) g.player.viewModel.visible = true;
    this.vmHidden = false;
    if (cam.fov !== g.player.baseFov) { cam.fov = g.player.baseFov; cam.updateProjectionMatrix(); }
  }

  // a new match starts on this game (or the game is let go): nothing of the last ending may be left
  reset() {
    this.active = false;
    this.orbit = false;
    this.moment = null;
    this.mode = 'none';
    this.focus = null;
    this.hostEvents = null;
    this.highlight = null;
    this.scale = 1;
    this.t = 0;
    this.cut = false; this.cutAt = 0;
    if (this.g.audio) this.g.audio.slowmo(0);
    if (this.g.camfx) { this.g.camfx.push = 1; this.g.camfx.grade = 0; }
    removeEventListener('keydown', this.onInput, true);
    removeEventListener('pointerdown', this.onInput, true);
    document.removeEventListener('pointerlockchange', this.onInput);
    if (this.el) { this.el.remove(); this.el = null; }
    const old = typeof document !== 'undefined' && document.getElementById('finale');
    if (old) old.remove();
    const go = typeof document !== 'undefined' && document.getElementById('gameover');
    if (go) go.classList.remove('finale-wait', 'finale-fade');
    this.vmHidden = false;
    if (this.g.player && this.g.player.viewModel && this.g.player.alive) this.g.player.viewModel.visible = true;
  }

  dispose() { this.reset(); highlights.reset(null); }   // (the match log's helper lets go of this game)
}
