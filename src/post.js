// Post-processing: the scene is drawn into a half-float target (linear HDR radiance; multisampled where `Q.msaa` asks for it), then
//   bloom (a down/up-sampled chain: soft, wide, cheap)  ->  composite (exposure, tone curve, grade, vignette, dither)  ->  FXAA
// and the result goes to the canvas. FXAA is what smooths the edges wherever the target has no samples. Everything is behind `Q.post`;
// when no pass is on gfx.js draws straight to the canvas instead.
// The passes are single full-screen triangles with their own tiny ShaderMaterials; targets are created lazily and resized with the canvas.
import * as THREE from 'three';
import { NEUTRAL_GLSL } from './atmosphere.js';
import { Q } from './quality.js';

const VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 5-tap downsample (the one used for the bloom chain: the centre, which a bilinear tap makes a 2x2 average, and the four diagonal
// neighbours); with FIRST the first level weighs bright taps down so single hot pixels do not flicker
const BLOOM_DOWN = `
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform vec3 uThreshold;   // x: threshold, y: knee
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 prefilter(vec3 c) {
  #ifdef FIRST
    float br = max(c.r, max(c.g, c.b));
    float knee = uThreshold.y;
    float soft = clamp(br - uThreshold.x + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    return c * (max(soft, br - uThreshold.x) / max(br, 1e-4));
  #else
    return c;
  #endif
}
vec3 tap(vec2 o) { return prefilter(min(texture2D(tInput, vUv + o * uTexel).rgb, vec3(64.0))); }
void main() {
  vec3 e = tap(vec2(0.0)), a = tap(vec2(-1.0, -1.0)), b = tap(vec2(1.0, -1.0)), c = tap(vec2(-1.0, 1.0)), d = tap(vec2(1.0, 1.0));
  #ifdef FIRST
    float we = 4.0 / (1.0 + lum(e)), wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d));
    gl_FragColor = vec4((e * we + a * wa + b * wb + c * wc + d * wd) / (we + wa + wb + wc + wd), 1.0);
  #else
    gl_FragColor = vec4((e * 4.0 + a + b + c + d) * 0.125, 1.0);
  #endif
}`;

// 3x3 tent upsample (the weights 1 2 1 / 2 4 2 / 1 2 1 are four bilinear taps half a texel off the centre), added onto the next larger level
const BLOOM_UP = `
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;
void main() {
  vec2 d = uTexel * (0.5 * uRadius);
  vec3 s = texture2D(tInput, vUv + d * vec2(-1.0, -1.0)).rgb + texture2D(tInput, vUv + d * vec2(1.0, -1.0)).rgb
         + texture2D(tInput, vUv + d * vec2(-1.0, 1.0)).rgb + texture2D(tInput, vUv + d * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(s * (uWeight * 0.25), 1.0);
}`;

// exposure, bloom, tone curve, grade, vignette, dither: scene-referred in, display-encoded out
const COMPOSITE = `
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uAspect;
uniform float uSharp;
uniform vec2 uTexel;
uniform vec3 uCam;   // x: desaturate, y: flash, z: unused (camfx.js)
uniform vec3 uFlash;
${NEUTRAL_GLSL}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  #ifdef SHARPEN
    vec3 n = texture2D(tScene, vUv + vec2(0.0, -uTexel.y)).rgb + texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb
           + texture2D(tScene, vUv + vec2(-uTexel.x, 0.0)).rgb + texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb;
    c += (c - n * 0.25) * uSharp;
    c = max(c, vec3(0.0));
  #endif
  #ifdef BLOOM
    c += texture2D(tBloom, vUv).rgb * uBloom;
  #endif
  c = atmNeutral(c * uExposure);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  #ifdef GRADE
    // warm highlights, cool shadows, a little more colour, a gentle S-curve
    c *= mix(vec3(0.95, 0.985, 1.05), vec3(1.045, 1.0, 0.93), smoothstep(0.12, 0.8, l));
    c = mix(vec3(l), c, 1.10);
    vec3 g = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
    g = mix(g, g * g * (3.0 - 2.0 * g), 0.30);
    c = pow(g, vec3(2.2));
  #endif
  if (uCam.x > 0.0) c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uCam.x);
  if (uCam.y > 0.0) c = mix(c, uFlash, uCam.y);
  #ifdef VIGNETTE
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    c *= 1.0 - uVignette * smoothstep(0.38, 1.05, length(q) * 1.25);
  #endif
  c = toSrgb(clamp(c, 0.0, 1.0)) + (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// FXAA (3.11 quality: edge detection, an end-of-edge search along it, and a sub-pixel term), on the display-encoded image
const FXAA = `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;
float fxLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxFetch(vec2 uv) { return texture2D(tColor, uv).rgb; }
void main() {
  vec2 uv = vUv;
  vec3 rgbM = fxFetch(uv);
  float lM = fxLuma(rgbM);
  float lN = fxLuma(fxFetch(uv + vec2(0.0, -uTexel.y))), lS = fxLuma(fxFetch(uv + vec2(0.0, uTexel.y)));
  float lW = fxLuma(fxFetch(uv + vec2(-uTexel.x, 0.0))), lE = fxLuma(fxFetch(uv + vec2(uTexel.x, 0.0)));
  float rangeMin = min(lM, min(min(lN, lS), min(lW, lE)));
  float rangeMax = max(lM, max(max(lN, lS), max(lW, lE)));
  float range = rangeMax - rangeMin;
  if (range < max(0.0625, rangeMax * 0.166)) { gl_FragColor = vec4(rgbM, 1.0); return; }   // (low-contrast texture is left alone: it is not an edge)
  float lNW = fxLuma(fxFetch(uv + vec2(-uTexel.x, -uTexel.y))), lNE = fxLuma(fxFetch(uv + vec2(uTexel.x, -uTexel.y)));
  float lSW = fxLuma(fxFetch(uv + vec2(-uTexel.x, uTexel.y))), lSE = fxLuma(fxFetch(uv + vec2(uTexel.x, uTexel.y)));
  float lNS = lN + lS, lWE = lW + lE, lNWNE = lNW + lNE, lSWSE = lSW + lSE, lNWSW = lNW + lSW, lNESE = lNE + lSE;
  float edgeH = abs(-2.0 * lW + lNWSW) + abs(-2.0 * lM + lNS) * 2.0 + abs(-2.0 * lE + lNESE);
  float edgeV = abs(-2.0 * lN + lNWNE) + abs(-2.0 * lM + lWE) * 2.0 + abs(-2.0 * lS + lSWSE);
  bool horz = edgeH >= edgeV;
  float step1 = horz ? uTexel.y : uTexel.x;
  float luma1 = horz ? lN : lW, luma2 = horz ? lS : lE;
  float grad1 = luma1 - lM, grad2 = luma2 - lM;
  bool steepest1 = abs(grad1) >= abs(grad2);
  float gradScaled = 0.25 * max(abs(grad1), abs(grad2));
  float lumaLocalAvg;
  if (steepest1) { step1 = -step1; lumaLocalAvg = 0.5 * (luma1 + lM); } else { lumaLocalAvg = 0.5 * (luma2 + lM); }
  vec2 cur = uv;
  if (horz) cur.y += step1 * 0.5; else cur.x += step1 * 0.5;
  vec2 offs = horz ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);
  vec2 uv1 = cur - offs, uv2 = cur + offs;
  float end1 = fxLuma(fxFetch(uv1)) - lumaLocalAvg, end2 = fxLuma(fxFetch(uv2)) - lumaLocalAvg;
  bool reached1 = abs(end1) >= gradScaled, reached2 = abs(end2) >= gradScaled;
  bool reachedBoth = reached1 && reached2;
  if (!reached1) uv1 -= offs;
  if (!reached2) uv2 += offs;
  if (!reachedBoth) {
    for (int i = 2; i < 12; i++) {
      if (!reached1) end1 = fxLuma(fxFetch(uv1)) - lumaLocalAvg;
      if (!reached2) end2 = fxLuma(fxFetch(uv2)) - lumaLocalAvg;
      reached1 = abs(end1) >= gradScaled; reached2 = abs(end2) >= gradScaled;
      reachedBoth = reached1 && reached2;
      float q = i < 5 ? 1.0 : (i < 7 ? 1.5 : (i < 11 ? 2.0 : 4.0));
      if (!reached1) uv1 -= offs * q;
      if (!reached2) uv2 += offs * q;
      if (reachedBoth) break;
    }
  }
  float dist1 = horz ? (uv.x - uv1.x) : (uv.y - uv1.y);
  float dist2 = horz ? (uv2.x - uv.x) : (uv2.y - uv.y);
  bool dir1 = dist1 < dist2;
  float distFinal = min(dist1, dist2);
  float thickness = dist1 + dist2;
  float pixelOffset = -distFinal / thickness + 0.5;
  bool centerSmaller = lM < lumaLocalAvg;
  bool correct = ((dir1 ? end1 : end2) < 0.0) != centerSmaller;
  float finalOffset = correct ? pixelOffset : 0.0;
  float lumaAvg = (1.0 / 12.0) * (2.0 * (lNS + lWE) + lNWSW + lNESE);
  float sp1 = clamp(abs(lumaAvg - lM) / range, 0.0, 1.0);
  float sp2 = (-2.0 * sp1 + 3.0) * sp1 * sp1;
  finalOffset = max(finalOffset, sp2 * sp2 * 0.5);
  vec2 finalUv = uv;
  if (horz) finalUv.y += finalOffset * step1; else finalUv.x += finalOffset * step1;
  gl_FragColor = vec4(fxFetch(finalUv), 1.0);
}`;

function passMaterial(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const gl = renderer.getContext();
    const ext = renderer.extensions;
    // half-float colour targets (and multisampling them) need EXT_color_buffer_float in WebGL2
    this.hdr = !!(renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));
    this.floatMsaa = !!(renderer.capabilities.isWebGL2 && ext.has('EXT_color_buffer_float'));
    this.maxSamples = renderer.capabilities.maxSamples || 0;
    this.ok = this.hdr;
    // does the canvas itself have samples? (main.js only asks for that where the scene is drawn straight into it)
    const attrs = renderer.getContextAttributes && renderer.getContextAttributes();
    this.canvasAA = !attrs || !!attrs.antialias;
    this.aa = false;   // whether the FXAA pass runs (the level asks for it, or nothing else smooths the edges)
    this.active = false;
    this.width = 0; this.height = 0;
    this.sceneRT = null; this.samples = -1; this.ldrRT = null; this.bloomRT = [];
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const v2 = () => ({ value: new THREE.Vector2(1, 1) });
    this.matDown0 = passMaterial(BLOOM_DOWN, { tInput: { value: null }, uTexel: v2(), uThreshold: { value: new THREE.Vector3(1.0, 0.6, 0) } }, { FIRST: '' });
    this.matDown = passMaterial(BLOOM_DOWN, { tInput: { value: null }, uTexel: v2(), uThreshold: { value: new THREE.Vector3() } });
    this.matUp = passMaterial(BLOOM_UP, { tInput: { value: null }, uTexel: v2(), uRadius: { value: 1 }, uWeight: { value: 1 } });
    this.matUp.blending = THREE.AdditiveBlending;
    this.matUp.transparent = true;
    this.matComposite = passMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.1 }, uVignette: { value: 0.2 }, uAspect: { value: 1 }, uSharp: { value: 0 },
      uTexel: v2(), uCam: { value: new THREE.Vector3() }, uFlash: { value: new THREE.Vector3(1, 1, 1) },
    });
    this.matFxaa = passMaterial(FXAA, { tColor: { value: null }, uTexel: v2() });
    // what camfx.js and friends may set: desaturate and flash amounts (0..1) and the flash colour (linear)
    this.cam = { desaturate: 0, flash: 0, flashColor: new THREE.Color(1, 1, 1) };
    this.defineKey = '';
    this.stats = { passes: 0 };
    this.kept = { calls: 0, triangles: 0, points: 0, lines: 0 };   // (the scene's own counts while the passes run)
  }

  makeRT(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false, ...opts,
    });
  }

  // follow the quality settings and the canvas size; returns whether the post pipeline is in use
  setup(w, h) {
    const p = Q.post;
    const samples = this.floatMsaa ? Math.min(Q.msaa | 0, this.maxSamples) : 0;
    // FXAA runs where the level asks for it, and also where nothing else would smooth the edges: a scene drawn into a target without
    // samples (a GPU that cannot multisample it), or straight to a canvas that has none (Low, switched to from a level that made it so)
    this.aa = !!p.aa || (samples === 0 && !!(p.bloom || p.vignette || p.grade || p.ao || !this.canvasAA));
    const wanted = this.ok && !!(p.bloom || this.aa || p.vignette || p.grade || p.ao);
    this.active = wanted;
    if (!wanted) { this.release(); return false; }
    if (!this.sceneRT || this.samples !== samples) {
      if (this.sceneRT) this.sceneRT.dispose();
      this.sceneRT = this.makeRT(w, h, { depthBuffer: true, samples });
      this.samples = samples;
      this.width = w; this.height = h;
    } else if (this.width !== w || this.height !== h) {
      this.sceneRT.setSize(w, h);
      this.width = w; this.height = h;
    }
    // bloom: a chain from half size down to about 1/64
    const levels = p.bloom ? this.bloomLevels(w, h) : [];
    const sizeKey = levels.map((l) => l.join('x')).join(',');
    if (this.bloomKey !== sizeKey) {
      for (const rt of this.bloomRT) rt.dispose();
      this.bloomRT = levels.map(([lw, lh]) => this.makeRT(lw, lh));
      this.bloomKey = sizeKey;
    }
    if (this.aa) {
      if (!this.ldrRT) this.ldrRT = this.makeRT(w, h, { type: THREE.UnsignedByteType });
      else if (this.ldrRT.width !== w || this.ldrRT.height !== h) this.ldrRT.setSize(w, h);
    } else if (this.ldrRT) { this.ldrRT.dispose(); this.ldrRT = null; }
    // composite variants
    const key = `${p.bloom ? 'B' : ''}${p.grade ? 'G' : ''}${p.vignette ? 'V' : ''}`;
    if (key !== this.defineKey) {
      const d = this.matComposite.defines;
      delete d.BLOOM; delete d.GRADE; delete d.VIGNETTE;
      if (p.bloom) d.BLOOM = '';
      if (p.grade) d.GRADE = '';
      if (p.vignette) d.VIGNETTE = '';
      this.matComposite.needsUpdate = true;
      this.defineKey = key;
    }
    return true;
  }

  bloomLevels(w, h) {
    const out = [];
    let lw = w >> 1, lh = h >> 1;
    for (let i = 0; i < 6 && lw >= 8 && lh >= 8; i++) { out.push([lw, lh]); lw >>= 1; lh >>= 1; }
    return out;
  }

  release() {
    if (this.sceneRT) { this.sceneRT.dispose(); this.sceneRT = null; this.samples = -1; }
    if (this.ldrRT) { this.ldrRT.dispose(); this.ldrRT = null; }
    for (const rt of this.bloomRT) rt.dispose();
    this.bloomRT = []; this.bloomKey = '';
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
    this.stats.passes++;
  }

  // draw `scene` through the pipeline into the canvas
  render(scene, camera) {
    const r = this.renderer, p = Q.post;
    this.stats.passes = 0;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    // what the scene itself cost (the passes below would add their own draw calls to the same counters)
    const info = r.info.render, keep = this.kept;
    keep.calls = info.calls; keep.triangles = info.triangles; keep.points = info.points; keep.lines = info.lines;
    const auto = r.autoClear;
    r.autoClear = false;
    const w = this.width, h = this.height;
    let bloomTex = null;
    if (p.bloom && this.bloomRT.length) {
      const rts = this.bloomRT;
      this.matDown0.uniforms.tInput.value = this.sceneRT.texture;
      this.matDown0.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.matDown0.uniforms.uThreshold.value.set(1.5, 0.8, 0);
      this.pass(this.matDown0, rts[0]);
      for (let i = 1; i < rts.length; i++) {
        this.matDown.uniforms.tInput.value = rts[i - 1].texture;
        this.matDown.uniforms.uTexel.value.set(1 / rts[i - 1].width, 1 / rts[i - 1].height);
        this.pass(this.matDown, rts[i]);
      }
      for (let i = rts.length - 1; i > 0; i--) {
        this.matUp.uniforms.tInput.value = rts[i].texture;
        this.matUp.uniforms.uTexel.value.set(1 / rts[i].width, 1 / rts[i].height);
        this.matUp.uniforms.uRadius.value = 1.0;
        this.matUp.uniforms.uWeight.value = 1.0;
        this.pass(this.matUp, rts[i - 1]);
      }
      bloomTex = rts[0].texture;
    }
    const u = this.matComposite.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = bloomTex;
    u.uExposure.value = Q.exposure;
    u.uBloom.value = 0.10;
    u.uVignette.value = 0.30;
    u.uAspect.value = w / h;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uCam.value.set(this.cam.desaturate, this.cam.flash, 0);
    u.uFlash.value.set(this.cam.flashColor.r, this.cam.flashColor.g, this.cam.flashColor.b);
    if (this.aa && this.ldrRT) {
      this.pass(this.matComposite, this.ldrRT);
      this.matFxaa.uniforms.tColor.value = this.ldrRT.texture;
      this.matFxaa.uniforms.uTexel.value.set(1 / w, 1 / h);
      this.pass(this.matFxaa, null);
    } else {
      this.pass(this.matComposite, null);
    }
    r.autoClear = auto;
    info.calls = keep.calls; info.triangles = keep.triangles; info.points = keep.points; info.lines = keep.lines;
  }

  dispose() {
    this.release();
    for (const m of [this.matDown0, this.matDown, this.matUp, this.matComposite, this.matFxaa]) m.dispose();
    this.quad.geometry.dispose();
  }
}
