// The renderer's one front door: it owns how big the picture is, which passes it goes through and what happens each frame.
//   gfx.init(renderer)      once, right after the renderer is created (main.js)
//   gfx.setGame(game)       whenever a game (a world) is built
//   gfx.applyQuality()      Game.setQuality calls it after the live settings `Q` changed (resolution, tone curve, passes)
//   gfx.renderFrame(dt)     the frame: sky and shadow maps follow the camera, the scene is drawn, post passes run
//   gfx.resize()            the window changed size
import * as THREE from 'three';
import { Q } from './quality.js';

// a guess at how strong the GPU is from its name (Auto picks the first quality level from it); automation always gets 'medium'
export function guessLevel(renderer) {
  try {
    if (navigator.webdriver) return 'medium';
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    if (/swiftshader|llvmpipe|software|softpipe|basic render|microsoft basic/.test(name)) return 'low';
    if (/rtx\s*(20|30|40|50)\d\d|rx\s*(6[789]|7|9)\d\d|radeon pro w|apple m[1-9]|arc a[5-9]|rtx a\d/.test(name)) return 'ultra';
    if (/gtx\s*1[0-9]\d\d|gtx\s*9[6-9]0|rx\s*(5|6[0-6])\d\d|rx\s*[45]\d\d|vega|radeon\s*(r9|pro)|quadro|titan|apple (m|a1[2-9])|geforce|nvidia|amd|radeon/.test(name)) return 'high';
    if (/mali|adreno|powervr|videocore|tegra|mesa|v3d|intel.*(hd|uhd|iris)|intel\(r\) graphics|apple gpu/.test(name)) return /iris xe|iris plus|iris pro|uhd graphics 7|apple/.test(name) ? 'medium' : 'low';
    return 'medium';
  } catch (e) { return 'medium'; }
}

class Gfx {
  constructor() {
    this.renderer = null;
    this.game = null;
    this.scale = 1;        // the adaptive resolution's share of the full render size (1 = full)
    this.lastRatio = 0;
    this.lastW = 0;
    this.lastH = 0;
  }

  init(renderer) {
    this.renderer = renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;   // (the soft filter is our own: see atmosphere.js)
    renderer.toneMapping = THREE.CustomToneMapping;   // the neutral curve patched in by atmosphere.js
    renderer.toneMappingExposure = Q.exposure;
    renderer.info.autoReset = false;                  // reset once per frame here, so every pass of the frame is counted together
    return this;
  }

  setGame(game) { this.game = game; this.lastRatio = 0; }

  // the level a quality choice stands for: Auto is a guess from the GPU (and what the first seconds of play showed: see governor below)
  levelFor(choice) {
    if (choice !== 'auto') return choice;
    if (!this.autoLevel) this.autoLevel = guessLevel(this.renderer);
    return this.autoLevel;
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
    this.resize(true);
  }

  renderFrame(dt) {
    const game = this.game, r = this.renderer;
    const scene = game.scene, camera = game.camera;
    const atm = scene.userData.atmosphere;
    if (atm) atm.update(dt);
    const rig = game.lights && game.lights.rig;
    if (rig) rig.update(camera, dt);
    r.info.reset();
    r.render(scene, camera);
  }
}

export const gfx = new Gfx();
