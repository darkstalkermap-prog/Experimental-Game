// The in-game profiler and the benchmark.
//
//   ` (backquote), or ?perf in the address: an overlay with the frame rate, the worst frame of the last second, where the frame
//   time goes (simulation, AI, physics, effects, network, HUD/DOM, render submit), what the renderer drew (draw calls, triangles,
//   geometries, textures, programs), how many soldiers, engines, arrows and particles there are, the JS heap and a log of long frames.
//   window.__perf is the same thing for the console (enable, disable, stats, report, longFrames, audit, wrap).
//   window.__bench(opts), called from the main menu: starts a single-player game with a seeded Math.random, plays the same
//   late-game battle every time and returns the median and 95th percentile of every part of the frame, plus a hash of the final
//   state (two builds that simulate the same game give the same hash: it is how pure optimisations are proven harmless).
//
// While the overlay is off nothing is hooked: switching it on wraps a handful of methods with timers and switching it off puts the
// originals back, so the cost of having this file is one key listener.
import { Game } from './game.js';
import { UI } from './ui.js';
import { Unit } from './units.js';
import { Physics } from './physics.js';
import { LordAI } from './ai.js';
import { HostSync, ClientSync } from './netsync.js';
import { FX } from './fx.js';
import { Projectiles } from './projectiles.js';
import { Magic } from './magic.js';
import { Alerts } from './alerts.js';
import { Pings } from './pings.js';
import { prewarmSoldier } from './models.js';
import { probe, sceneAudit } from './perfutil.js';

const now = () => performance.now();
const RING = 600;                 // frames remembered
const MAXB = 16;                  // timer buckets (the built-in ones plus any a module adds with probe.begin)
const LONG = 34;                  // ms: a frame this long is logged
const NAMES = ['sim', 'ai', 'phys', 'fx', 'net', 'hud', 'draw'];
const LABELS = { sim: 'simulation', ai: 'AI', phys: 'physics', fx: 'effects', net: 'network', hud: 'HUD/DOM', draw: 'render submit' };
const COLORS = ['#4f8cff', '#b06cff', '#ff9f43', '#2ed1c4', '#ff6b9a', '#f1d34a', '#5ee06b', '#9aa0a6', '#c0ff6b', '#ff6b6b'];

export function initPerf({ renderer, getGame, render = null }) {
  const names = NAMES.slice();    // bucket names; modules may add more through probe.begin(name)
  const acc = new Float64Array(MAXB);      // exclusive milliseconds of this frame, per bucket
  const stack = new Int8Array(64);
  let sp = 0, curT = 0;
  const wrapped = [];

  // ---- the ring of finished frames ----
  const R = { n: 0, t: new Float64Array(RING), interval: new Float32Array(RING), busy: new Float32Array(RING), heap: new Float32Array(RING), calls: new Float32Array(RING), tris: new Float32Array(RING), b: [] };
  for (let i = 0; i < names.length; i++) R.b.push(new Float32Array(RING));
  const P = {
    on: false, longFrames: [], sink: null, game: null, renderFn: render,
    enable, disable, toggle() { return P.on ? disable() : enable(); },
    stats, report, audit() { const g = getGame(); return g ? sceneAudit(g.scene) : []; },
    wrap: (obj, key, bucket) => wrap(obj, key, bucketId(bucket)),
    names, reset,
  };
  window.__perf = P;
  window.__bench = (opts) => runBench(opts);

  // ---- timers: exclusive time per bucket (a bucket entered inside another one pauses it) ----
  function bucketId(name) {
    let i = names.indexOf(name);
    if (i < 0 && names.length < MAXB) { i = names.push(name) - 1; R.b.push(new Float32Array(RING)); }
    return i < 0 ? 0 : i;
  }
  function enter(b) {
    const t = now();
    if (sp > 0) acc[stack[sp - 1]] += t - curT;
    stack[sp++] = b; curT = t;
  }
  function leave() {
    const t = now();
    if (sp > 0) acc[stack[--sp]] += t - curT;
    curT = t;
  }
  function wrap(obj, key, b) {
    const orig = obj && obj[key];
    if (typeof orig !== 'function' || orig.__perfWrapped) return;
    const fn = function () { enter(b); try { return orig.apply(this, arguments); } finally { leave(); } };
    fn.__perfWrapped = true;
    obj[key] = fn;
    wrapped.push({ obj, key, orig, fn });
  }
  probe.begin = (name) => enter(bucketId(name));
  probe.end = leave;

  // ---- frames ----
  // A frame starts when Game.update starts; the previous one is closed at that moment, so everything the page did in between
  // (HUD, render, waiting for the next vsync) belongs to it. Its `interval` is the time to the next frame, `busy` the time in our buckets.
  let frameStart = 0, inFrame = false, cur = null, panelAt = 0, lastHeap = 0;
  const cnt = { calls: 0, tris: 0 };
  function frameBegin(g) {
    const t = now();
    if (inFrame) frameEnd(t);
    P.game = g;
    inFrame = true; frameStart = t; sp = 0; curT = t;
    acc.fill(0);
    cnt.calls = 0; cnt.tris = 0;
    if (t - panelAt > 250) { panelAt = t; if (panel) paint(g); }
  }
  function frameEnd(tNext) {
    inFrame = false;
    const i = R.n % RING;
    let busy = 0;
    for (let b = 0; b < names.length; b++) { R.b[b][i] = acc[b]; busy += acc[b]; }
    const interval = tNext - frameStart;
    R.t[i] = frameStart; R.interval[i] = interval; R.busy[i] = busy; R.calls[i] = cnt.calls; R.tris[i] = cnt.tris;
    const mem = performance.memory;
    const heap = mem ? mem.usedJSHeapSize / 1048576 : 0;
    R.heap[i] = heap;
    R.n++;
    if (P.sink) P.sink.push([interval, busy, ...Array.from(acc.subarray(0, names.length)), cnt.calls, cnt.tris, heap]);
    if (interval > LONG && P.longFrames.length < 200) {
      const rec = { at: +(P.game ? P.game.time : 0).toFixed(1), ms: +interval.toFixed(1), busy: +busy.toFixed(1), gc: heap > 0 && lastHeap - heap > 1.5 };
      for (let b = 0; b < names.length; b++) if (acc[b] >= 0.5) rec[names[b]] = +acc[b].toFixed(1);
      P.longFrames.push(rec);
    }
    lastHeap = heap;
  }
  function flush() { if (inFrame) frameEnd(now()); }
  function reset() { R.n = 0; P.longFrames.length = 0; }

  // renderer.info numbers: with autoReset on, each render() call restarts them (add the passes up); with it off the page resets
  // them once a frame and they run on (take the largest)
  function readInfo() {
    const r = renderer.info.render;
    if (renderer.info.autoReset) { cnt.calls += r.calls; cnt.tris += r.triangles; } else { cnt.calls = Math.max(cnt.calls, r.calls); cnt.tris = Math.max(cnt.tris, r.triangles); }
  }

  // ---- switching on and off ----
  function enable(showPanel = true) {
    if (P.on) return P;
    P.on = true; probe.on = true;
    const g = getGame();
    const proto = g ? Object.getPrototypeOf(g) : Game.prototype;
    const frameWrap = function (orig) { return function (dt) { frameBegin(this); enter(0); try { return orig.call(this, dt); } finally { leave(); } }; };
    { const orig = proto.update; const fn = frameWrap(orig); fn.__perfWrapped = true; proto.update = fn; wrapped.push({ obj: proto, key: 'update', orig, fn }); }
    wrap(UI.prototype, 'update', 5);
    wrap(Alerts.prototype, 'update', 5); wrap(Pings.prototype, 'update', 5);
    wrap(Unit.prototype, 'think', 1); wrap(LordAI.prototype, 'update', 1);
    for (const k of ['resolve', 'groundHeight', 'steerAroundTrees', 'lineClear', 'pointHit', 'covered', 'ledge']) wrap(Physics.prototype, k, 2);
    wrap(FX.prototype, 'update', 3); wrap(Projectiles.prototype, 'update', 3); wrap(Magic.prototype, 'update', 3);
    wrap(HostSync.prototype, 'update', 4); wrap(ClientSync.prototype, 'update', 4);
    // the page's own draw call: renderer.render is an instance method of the renderer
    const orig = renderer.render;
    const fn = function (scene, camera) { enter(6); try { return orig.call(this, scene, camera); } finally { leave(); readInfo(); } };
    fn.__perfWrapped = true; renderer.render = fn; wrapped.push({ obj: renderer, key: 'render', orig, fn, own: Object.prototype.hasOwnProperty.call(renderer, 'render') });
    if (showPanel) buildPanel();
    return P;
  }
  function disable() {
    if (!P.on) return P;
    flush();
    P.on = false; probe.on = false;
    for (const w of wrapped) {
      if (w.obj[w.key] !== w.fn) continue;
      if (w.own === false) delete w.obj[w.key]; else w.obj[w.key] = w.orig;
    }
    wrapped.length = 0;
    sp = 0;
    removePanel();
    return P;
  }

  // ---- numbers ----
  const pick = (arr, n) => { const out = new Float32Array(n); const last = R.n; for (let k = 0; k < n; k++) out[k] = arr[(last - n + k + RING * 4) % RING]; return out; };
  const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  function summarise(a) {
    const s = Float32Array.from(a).sort();
    let sum = 0; for (const v of a) sum += v;
    return { mean: sum / (a.length || 1), p50: pct(s, 0.5), p95: pct(s, 0.95), max: s[s.length - 1] || 0 };
  }
  // the last `n` finished frames (default: a bit more than a second)
  function stats(n = 90) {
    n = Math.min(n, R.n, RING);
    if (n < 2) return null;
    const out = { frames: n, parts: {} };
    out.interval = summarise(pick(R.interval, n));
    out.busy = summarise(pick(R.busy, n));
    for (let b = 0; b < names.length; b++) out.parts[names[b]] = summarise(pick(R.b[b], n));
    out.fps = 1000 / (out.interval.mean || 1);
    // the worst frame of the last second
    const ts = pick(R.interval, Math.min(R.n, RING)); let worst = 0, span = 0;
    for (let k = ts.length - 1; k >= 0 && span < 1000; k--) { worst = Math.max(worst, ts[k]); span += ts[k]; }
    out.worstSecond = worst;
    out.calls = R.calls[(R.n - 1 + RING) % RING]; out.tris = R.tris[(R.n - 1 + RING) % RING];
    return out;
  }
  function liveParticles(fx) {
    if (!fx) return 0;
    if (typeof fx.liveCount === 'function') return fx.liveCount();
    let n = 0;
    for (const f of [fx, fx.glow]) { if (!f || !f.life) continue; for (let i = 0; i < f.life.length; i++) if (f.life[i] > 0) n++; }
    return n;
  }
  function counts(g) {
    let alive = 0; for (const u of g.units) if (u.alive) alive++;
    let siege = 0; for (const s of g.siege) if (s.alive) siege++;
    return { alive, units: g.units.length, siege, proj: g.projectiles && g.projectiles.list ? g.projectiles.list.length : 0, particles: liveParticles(g.fx) };
  }
  function report() {
    const s = stats();
    if (!s) return 'no frames yet';
    const g = getGame(), info = renderer.info, c = g ? counts(g) : {};
    const f = (v) => v.toFixed(2);
    const lines = [`${s.fps.toFixed(0)} fps  ${f(s.interval.mean)} ms  p95 ${f(s.interval.p95)}  worst-1s ${f(s.worstSecond)}  busy ${f(s.busy.mean)} ms`];
    lines.push(names.map((n) => `${n} ${f(s.parts[n].mean)}`).join('  '));
    lines.push(`calls ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k  geometries ${info.memory.geometries}  textures ${info.memory.textures}  programs ${info.programs ? info.programs.length : 0}`);
    lines.push(`units ${c.alive}/${c.units}  siege ${c.siege}  projectiles ${c.proj}  particles ${c.particles}`);
    return lines.join('\n');
  }

  // ---- the overlay ----
  let panel = null, canvas = null, ctx2 = null, textEl = null, sceneObjs = 0, sceneAt = 0, heapMark = null;
  function buildPanel() {
    if (panel) return;
    const style = document.createElement('style');
    style.id = 'perfStyle';
    style.textContent = '#perfPanel{position:fixed;left:8px;top:8px;z-index:60;width:344px;padding:6px 8px 7px;background:rgba(8,10,14,.82);color:#d7e0ea;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border:1px solid #2c3a4b;border-radius:4px;pointer-events:none;white-space:pre;text-shadow:none}#perfPanel b{color:#fff;font-weight:600}#perfPanel canvas{display:block;margin:3px 0 4px;width:328px;height:46px}';
    document.head.appendChild(style);
    panel = document.createElement('div');
    panel.id = 'perfPanel';
    textEl = document.createElement('div');
    canvas = document.createElement('canvas');
    canvas.width = 328 * 2; canvas.height = 46 * 2;
    ctx2 = canvas.getContext('2d');
    panel.append(canvas, textEl);
    document.body.appendChild(panel);
  }
  function removePanel() {
    if (panel) panel.remove();
    const st = document.getElementById('perfStyle'); if (st) st.remove();
    panel = canvas = ctx2 = textEl = null;
  }
  function paint(g) {
    const s = stats(); if (!s) return;
    const t = now();
    const c = counts(g), info = renderer.info;
    if (t - sceneAt > 1000) { sceneAt = t; let n = 0; g.scene.traverse((o) => { if (o.isMesh && o.visible) n++; }); sceneObjs = n; }
    const mem = performance.memory;
    let heap = '';
    if (mem) {
      const mb = mem.usedJSHeapSize / 1048576;
      if (!heapMark) heapMark = { t, mb, alloc: 0, gcs: 0, rate: 0, gcRate: 0, last: mb };
      if (mb < heapMark.last - 1.5) heapMark.gcs++; else if (mb > heapMark.last) heapMark.alloc += mb - heapMark.last;
      heapMark.last = mb;
      if (t - heapMark.t >= 1000) { const dt = (t - heapMark.t) / 1000; heapMark.rate = heapMark.alloc / dt; heapMark.gcRate = heapMark.gcs / dt; heapMark.t = t; heapMark.alloc = 0; heapMark.gcs = 0; }
      heap = `heap <b>${mb.toFixed(0)}</b> MB  +${heapMark.rate.toFixed(1)} MB/s  gc ${heapMark.gcRate.toFixed(1)}/s`;
    }
    const f1 = (v) => v.toFixed(1);
    const parts = names.map((n) => `${n} ${f1(s.parts[n].mean)}`);
    const lines = [
      `<b>${s.fps.toFixed(0)}</b> fps  <b>${f1(s.interval.mean)}</b> ms  p95 ${f1(s.interval.p95)}  worst ${f1(s.worstSecond)}`,
      parts.slice(0, 4).join('  '),
      parts.slice(4).join('  ') + `  busy ${f1(s.busy.mean)}`,
      `calls <b>${s.calls}</b>  tris <b>${(s.tris / 1000).toFixed(0)}k</b>  geo ${info.memory.geometries}  tex ${info.memory.textures}  prog ${info.programs ? info.programs.length : 0}`,
      `units ${c.alive}/${c.units}  siege ${c.siege}  proj ${c.proj}  parts ${c.particles}`,
      `meshes ${sceneObjs}  ` + heap,
    ];
    const last = P.longFrames.slice(-3).reverse();
    if (last.length) lines.push('slow (' + P.longFrames.length + '): ' + last.slice(0, 2).map((r) => `${r.at}s ${r.ms}ms${r.gc ? ' gc' : ''}`).join(' · '));
    textEl.innerHTML = lines.join('\n');
    // frame-time bars (last 138 frames: green fast, amber slow, red a hitch) with the split of the mean frame underneath
    const w = canvas.width, h = canvas.height, x = ctx2;
    x.clearRect(0, 0, w, h);
    const n = Math.min(R.n, 138), iv = pick(R.interval, n), top = 40;
    x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, h - (16.7 / top) * (h - 14) - 14, w, 1); x.fillRect(0, h - (33.4 / top) * (h - 14) - 14, w, 1);
    for (let k = 0; k < n; k++) {
      const v = Math.min(top, iv[k]), bh = (v / top) * (h - 14);
      x.fillStyle = iv[k] > LONG ? '#ff5a5a' : iv[k] > 18.5 ? '#f1b84a' : '#5ee06b';
      x.fillRect(k * 2, h - 14 - bh, 1.6, bh);
    }
    let px = 0; const scale = (w - 2) / Math.max(16.7, s.interval.mean);
    for (let b = 0; b < names.length; b++) { const bw = s.parts[names[b]].mean * scale; x.fillStyle = COLORS[b % COLORS.length]; x.fillRect(px, h - 10, bw, 8); px += bw; }
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    P.toggle();
  });
  if (/[?&]perf\b/.test(location.search)) enable();

  // ---------------- the benchmark ----------------
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // FNV-1a over the bits of every number that makes up the battle: soldiers, engines, castles, houses and the hero
  function hashState(g) {
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    let h = 0x811c9dc5;
    const mix = (v) => { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
    mix(g.round); mix(g.time); mix(g.units.length); mix(g.siege.length);
    for (const u of g.units) { mix(u.id); mix(u.alive ? 1 : 0); mix(u.pos.x); mix(u.pos.y); mix(u.pos.z); mix(u.hp); mix(u.yaw); mix(u.kills); mix(u.xp); }
    for (const s of g.siege) { mix(s.alive ? 1 : 0); mix(s.pos.x); mix(s.pos.z); mix(s.hp); }
    for (const c of g.castles) { mix(c.keep.hp); mix(c.gate.hp); }
    for (const f of g.factions) { mix(f.gold); mix(f.kills); mix(f.earned); mix(f.troopCap); }
    const p = g.player; mix(p.pos.x); mix(p.pos.y); mix(p.pos.z); mix(p.hp);
    mix(g.projectiles.list.length);
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  P.hashState = hashState;

  function runBench(opts = {}) {
    const o = { seconds: 10, ffMinutes: 6, seed: 12345, dt: 1 / 60, ffDt: 0.05, render: true, renderEvery: 2, traceEvery: 600, view: 'field', ...opts };
    let g = getGame();
    if (!g || g.state !== 'menu') throw new Error('__bench() starts a game of its own: call it from the main menu (reload the page first)');
    const realRandom = Math.random;
    const wasOn = P.on;
    // no sound during the run: Audio.play throttles on the audio clock (wall time), which would make the battle differ from run to run
    const audio = g.audio;
    audio.init = audio.startMusic = audio.play = () => {};
    Math.random = mulberry32(o.seed);
    try {
      document.getElementById('play').click();   // the menu's own Play button: the same path a player takes
      g = getGame();
      g.paused = false;
      // the page prepares every soldier look in the background, a few ms per frame; here it is done at once so the run is reproducible
      while (g.warmQueue && g.warmQueue.length) prewarmSoldier(...g.warmQueue.shift());
      g.player.buffs.add('ghost', 1e6);                       // the hero takes no part: only the armies fight
      const own = g.factions[g.player.team];
      own.ai = new LordAI(g, own); g.phaseT = 5;              // the player's house is led by the AI too
      const trace = [];
      const t0 = now();
      const ff = Math.round(o.ffMinutes * 60 / o.ffDt);
      for (let i = 0; i < ff; i++) {
        g.update(o.ffDt); g.ui.update(o.ffDt); g.input.endFrame();
        if (o.traceEvery && i % o.traceEvery === o.traceEvery - 1) trace.push(hashState(g));
      }
      const ffMs = now() - t0;
      const before = { round: g.round, alive: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length };
      // a viewpoint over the field, 60 m in front of the player's castle
      if (o.view === 'field') {
        const me = g.player, c0 = g.castles[me.team];
        const sz = Math.sign(c0.center.z || 1);
        me.pos.set(0, 0, 60 * sz); me.vel.set(0, 0, 0); me.yaw = sz > 0 ? Math.PI : 0; me.pitch = -0.04;
        me.pos.y = g.physics.groundHeight(0, 60 * sz, 30);
      }
      enable(false);
      P.sink = [];
      renderer.info.reset();
      const draw = P.renderFn || (() => renderer.render(g.scene, g.camera));
      const frames = Math.round(o.seconds / o.dt);
      const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const w0 = now();
      for (let i = 0; i < frames; i++) {
        g.update(o.dt); g.ui.update(o.dt); g.input.endFrame();
        if (o.render && i % o.renderEvery === 0) draw();
      }
      const wallMs = now() - w0;
      flush();
      const rows = P.sink; P.sink = null;
      const col = (k) => rows.map((r) => r[k]);
      const sum = (a) => { const s = summarise(a.length ? a : [0]); return { mean: +s.mean.toFixed(3), p50: +s.p50.toFixed(3), p95: +s.p95.toFixed(3), max: +s.max.toFixed(2) }; };
      const parts = {};
      // (render submit is summed over the frames that rendered)
      names.forEach((n, i) => { const c = col(2 + i); parts[n] = sum(n === 'draw' ? c.filter((v) => v > 0) : c); });
      let allocMB = 0, gcs = 0;
      const hs = col(2 + names.length + 2);
      for (let i = 1; i < hs.length; i++) { const d = hs[i] - hs[i - 1]; if (d > 0) allocMB += d; else if (d < -0.5) gcs++; }
      const info = renderer.info;
      return {
        seed: o.seed, ffMinutes: o.ffMinutes, ffMs: Math.round(ffMs), before, frames, wallMsPerFrame: +(wallMs / frames).toFixed(3),
        busy: sum(col(1)), parts, hash: hashState(g), trace,
        info: { calls: Math.max(...col(2 + names.length)), tris: Math.max(...col(3 + names.length)), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : 0 },
        heap: { startMB: +(heap0 / 1048576).toFixed(1), endMB: +hs[hs.length - 1].toFixed(1), allocMB: +allocMB.toFixed(1), allocMBperSec: +(allocMB / (frames * o.dt)).toFixed(1), gcs },
        alive: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length, round: g.round,
      };
    } finally {
      Math.random = realRandom;
      delete audio.init; delete audio.startMusic; delete audio.play;
      P.sink = null;
      if (!wasOn) disable();
    }
  }
  return P;
}
