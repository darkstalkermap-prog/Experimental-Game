// The renderer's one front door: it owns how big the picture is, which passes it goes through and what happens each frame.
//   gfx.init(renderer)      once, right after the renderer is created (main.js)
//   gfx.setGame(game)       whenever a game (a world) is built
//   gfx.applyQuality()      Game.setQuality calls it after the live settings `Q` changed (resolution, tone curve, passes)
//   gfx.renderFrame(dt)     the frame: sky and shadow maps follow the camera, the scene is drawn, post passes run
//   gfx.resize()            the window changed size
import * as THREE from 'three';
import { Q, LEVELS } from './quality.js';
import { Post } from './post.js';
import { settings } from './settings.js';
import { installShadowHooks } from './shadows.js';

const AUTO_KEY = 'cw-auto';   // the level the Auto choice settled on (kept per browser)
const WINDOW = 60;           // frames the adaptive resolution looks at

// a guess at how strong the GPU is from its name (Auto picks the first quality level from it); automation always gets 'medium'
// (`renderer` may also be a bare WebGL context)
export function guessLevel(renderer) {
  try {
    if (navigator.webdriver) return 'medium';
    const gl = renderer.getContext ? renderer.getContext() : renderer;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    if (/swiftshader|llvmpipe|software|softpipe|basic render|microsoft basic/.test(name)) return 'low';
    if (/rtx\s*(20|30|40|50)\d\d|rx\s*(6[789]|7|9)\d\d|radeon pro w|apple m[1-9]|arc a[5-9]|rtx a\d/.test(name)) return 'ultra';
    if (/gtx\s*1[0-9]\d\d|gtx\s*9[6-9]0|rx\s*(5|6[0-6])\d\d|rx\s*[45]\d\d|vega|radeon\s*(r9|pro)|quadro|titan|apple (m|a1[2-9])|geforce|nvidia|amd|radeon/.test(name)) return 'high';
    if (/mali|adreno|powervr|videocore|tegra|mesa|v3d|intel.*(hd|uhd|iris)|intel\(r\) graphics|apple gpu/.test(name)) return /iris xe|iris plus|iris pro|uhd graphics 7|apple/.test(name) ? 'medium' : 'low';
    return 'medium';
  } catch (e) { return 'medium'; }
}

// Does the canvas need multisampling of its own? Only where the scene is drawn straight into it (Low, or a GPU that cannot render
// into float targets). At every other level the scene goes through the post target, which carries its own samples (or FXAA), and
// the canvas only receives full-screen passes: a multisampled canvas there would hold several times its size in memory and
// resolve it every frame for nothing. A context's attributes cannot change once it exists, so main.js asks before it makes the
// renderer, and this reads what the page is about to choose (the saved quality; Auto: what it settled on, else a guess from the GPU).
export function canvasNeedsAA() {
  try {
    let level = null;
    try {
      const saved = localStorage.getItem('cw-quality') || 'auto';
      level = LEVELS.includes(saved) ? saved : localStorage.getItem(AUTO_KEY);
    } catch (e) { /* storage unavailable */ }
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    if (!LEVELS.includes(level)) level = guessLevel(gl);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();   // (this one only answered the question)
    return !hdr || level === 'low';
  } catch (e) { return true; }
}

class Gfx {
  constructor() {
    this.renderer = null;
    this.game = null;
    this.post = null;
    this.scale = 1;        // the adaptive resolution's share of the full render size (1 = full)
    this.lastRatio = 0;
    this.lastW = 0;
    this.lastH = 0;
    this.size = new THREE.Vector2();
    // adaptive resolution: a ring of the last frame intervals, and what the governor remembers
    this.frames = new Float32Array(WINDOW);
    this.fi = 0; this.fn = 0;
    this.lastAt = 0;
    this.pending = 0;       // a scale to switch to at the start of the next frame (never in the middle of one: that would blank the canvas)
    this.calm = 0;          // seconds since the last slow frame
    this.lastChange = -1e9;
    this.ceiling = 1;       // the highest scale tried again for now: the one just above the last that was too slow
    this.ceilingAt = 0;
    this.backoff = 45000;   // ms before the ceiling relaxes by one step; it doubles each time a try above it fails at once
    this.lastUp = -1e9;
    this.auto = { floorT: 0, drops: 0, lastDrop: -1e9 };
    // automated browsers (tests, benchmarks) keep a fixed resolution so pictures and numbers are repeatable (?dynres=1 turns it on there too)
    this.automation = typeof navigator !== 'undefined' && !!navigator.webdriver && !/[?&]dynres=1/.test(location.search);
  }

  init(renderer) {
    this.renderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;   // (the soft filter is our own: see atmosphere.js)
    installShadowHooks(renderer);                     // (crowds and engines cast into the near map only: see shadows.js)
    renderer.toneMapping = THREE.CustomToneMapping;   // the neutral curve patched in by atmosphere.js
    renderer.toneMappingExposure = Q.exposure;
    renderer.info.autoReset = false;                  // reset once per frame here, so every pass of the frame is counted together
    try {
      this.post = new Post(renderer);
      this.probe();
    } catch (e) { console.warn('post-processing is not available here:', e && e.message); this.post = null; }
    // renderer.compile (shader warm-up) must see the same target the frame will use, or it warms the wrong shader variants
    const compile = renderer.compile.bind(renderer);
    renderer.compile = (scene, camera, target) => {
      const rt = this.post && this.post.active && this.post.sceneRT;
      if (!rt) return compile(scene, camera, target);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      try { return compile(scene, camera, target); } finally { renderer.setRenderTarget(prev); }
    };
    return this;
  }

  // can this GPU render into a multisampled half-float target? (a tiny one is bound and checked; otherwise fewer samples, or no post)
  probe() {
    const post = this.post, r = this.renderer, gl = r.getContext();
    if (!post.ok) return;
    const works = (samples) => {
      let ok = false;
      const rt = post.makeRT(8, 8, { depthBuffer: true, samples });
      try {
        while (gl.getError() !== gl.NO_ERROR) { /* clear old errors */ }
        r.setRenderTarget(rt);
        r.clear();
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
      } catch (e) { ok = false; }
      r.setRenderTarget(null);
      rt.dispose();
      return ok;
    };
    if (!works(0)) { post.ok = false; return; }
    if (post.floatMsaa && !works(Math.min(4, post.maxSamples))) post.floatMsaa = false;
  }

  setGame(game) { this.game = game; this.lastRatio = 0; }

  // the level a quality choice stands for: Auto is what it settled on before in this browser, else a guess from the GPU name; while
  // playing, the governor below steps it down if even the lowest resolution cannot hold the frame rate
  levelFor(choice) {
    if (choice !== 'auto') return choice;
    if (!this.autoLevel) {
      let saved = null;
      try { saved = localStorage.getItem(AUTO_KEY); } catch (e) { /* storage unavailable */ }
      this.autoLevel = LEVELS.includes(saved) ? saved : guessLevel(this.renderer);
    }
    return this.autoLevel;
  }

  // the player pressed Auto again: forget what it settled on and guess afresh
  resetAuto() {
    this.autoLevel = null;
    try { localStorage.removeItem(AUTO_KEY); } catch (e) { /* ignore */ }
  }

  stepDownAuto() {
    const lv = LEVELS[Math.max(0, Q.level - 1)];
    this.autoLevel = lv;
    try { localStorage.setItem(AUTO_KEY, lv); } catch (e) { /* ignore */ }
    if (this.game) this.game.setQuality('auto');
  }

  // pixel ratio of the drawing buffer: what the device and the quality allow, times the adaptive share
  ratio() { return Math.max(0.35, Math.min(window.devicePixelRatio || 1, Q.pixelRatio) * this.scale); }

  // (re)size the drawing buffer when the window or the ratio changed
  resize(force = false) {
    const r = this.renderer, game = this.game;
    if (!r) return;
    const ratio = this.ratio();
    if (force || ratio !== this.lastRatio || innerWidth !== this.lastW || innerHeight !== this.lastH) {
      r.setPixelRatio(ratio);
      r.setSize(innerWidth, innerHeight);
      this.lastRatio = ratio; this.lastW = innerWidth; this.lastH = innerHeight;
      if (this.post) { r.getDrawingBufferSize(this.size); this.post.setup(this.size.x, this.size.y); }
    }
    if (game) {
      game.camera.aspect = innerWidth / innerHeight;
      game.camera.updateProjectionMatrix();
      game.fx.setScale(innerHeight * ratio);   // (point sprites scale with the height of the drawing buffer)
    }
  }

  applyQuality() {
    const r = this.renderer;
    if (!r) return;
    r.toneMappingExposure = Q.exposure;
    if (this.game) { this.game.camera.far = Math.max(400, Q.viewDist); this.game.camera.updateProjectionMatrix(); }
    this.scale = 1; this.pending = 0; this.fn = 0; this.ceiling = 1; this.backoff = 45000; this.lastChange = performance.now();
    this.resize(true);
  }

  dynEnabled() { return !!(Q.dynRes && settings.dynres) && !this.automation; }

  // "62 fps · 85%": the share of the full resolution next to the frame rate
  scaleLabel() { return ` · ${Math.round(this.scale * 100)}%`; }

  // Adaptive resolution. Looks at the real time between frames: when a good share of the last second was slow and the CPU was not the
  // reason (the GPU was), the render scale steps down at once; it steps up again only after several calm seconds, never above the
  // last scale that failed (that ceiling relaxes slowly), so it settles instead of pumping.
  govern(now, cpuMs) {
    const dtMs = now - this.lastAt;
    this.lastAt = now;
    if (!this.dynEnabled()) { if (this.scale !== 1) this.pending = 1; return; }
    if (dtMs > 250 || dtMs <= 0 || document.hidden) { this.fn = 0; this.calm = 0; return; }   // a stall or a hidden tab says nothing about the GPU
    this.frames[this.fi] = dtMs;
    this.fi = (this.fi + 1) % WINDOW;
    this.fn = Math.min(WINDOW, this.fn + 1);
    if (dtMs > 20.5) this.calm = 0; else this.calm += dtMs / 1000;
    if (now - this.lastChange < 1500) return;
    let slow = 0, sum = 0;
    for (let i = 0; i < this.fn; i++) { const f = this.frames[i]; sum += f; if (f > 20.5) slow++; }
    const ceil = Math.min(1, this.ceiling + 0.05 * Math.floor((now - this.ceilingAt) / this.backoff));
    if (this.fn >= 40 && slow / this.fn > 0.3 && cpuMs < 0.75 * dtMs) {
      const mean = sum / this.fn;
      const f = Math.min(0.95, Math.max(0.78, Math.sqrt(16.7 / mean)));
      const next = Math.max(Q.dynMin, Math.min(this.scale - 0.05, Math.round((this.scale * f) / 0.05) * 0.05));
      if (next < this.scale - 1e-3) {
        if (now - this.lastUp < 8000) this.backoff = Math.min(this.backoff * 2, 480000);   // the step up just failed: wait longer next time
        this.ceiling = Math.max(next, this.scale - 0.05); this.ceilingAt = now;
        this.pending = +next.toFixed(2); this.lastChange = now; this.fn = 0; this.calm = 0;
      }
    } else if (this.calm > 8 && this.scale < ceil - 1e-3 && now - this.lastChange > 8000) {
      this.pending = +Math.min(ceil, this.scale + 0.05).toFixed(2); this.lastChange = now; this.lastUp = now; this.fn = 0;
    }
    // Auto only: stuck at the lowest resolution and still slow for a good while: the level is too high for this machine
    const a = this.auto, g = this.game;
    if (Q.choice === 'auto' && g && g.state === 'playing' && !g.paused) {
      const floor = this.scale <= Q.dynMin + 0.001;
      if (floor && dtMs > 24) a.floorT += dtMs / 1000; else a.floorT = Math.max(0, a.floorT - dtMs / 1000);
      if (a.floorT > 6 && Q.level > 0 && a.drops < 3 && now - a.lastDrop > 20000) { a.drops++; a.lastDrop = now; a.floorT = 0; this.stepDownAuto(); }
    }
  }

  // t0: when this animation frame began (so the governor can tell CPU-bound frames from GPU-bound ones)
  renderFrame(dt, t0 = 0) {
    const game = this.game, r = this.renderer;
    const scene = game.scene, camera = game.camera;
    if (this.pending && this.pending !== this.scale) { this.scale = this.pending; this.resize(true); }
    this.pending = 0;
    const atm = scene.userData.atmosphere;
    if (atm) atm.update(dt);
    const rig = game.lights && game.lights.rig;
    if (rig) rig.update(camera, dt);
    r.info.reset();
    if (this.post && this.post.active) this.post.render(scene, camera);
    else r.render(scene, camera);
    const now = performance.now();
    this.govern(now, t0 ? now - t0 : 0);
  }
}

export const gfx = new Gfx();
