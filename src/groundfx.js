// Ground and shell effects for the hero abilities, all pooled and built at start-up:
//   glyphs   a patch of ground (a polar grid that follows the land) painted by a shader: an expanding shockwave, a magic circle
//            that turns, a cone swept forward, a spinning slash, a glowing pulse. Readable from far off in a crowd.
//   domes    a shimmering shell round a hero (Bulwark, Frost Ward) that follows them for as long as it lasts
//   pillars  a column of light (Smite, Healing Light)
// Everything is additive and uses the scene's fog chunks, a mesh that is idle draws nothing (but stays in the scene, so its shader
// is compiled up front).
import * as THREE from 'three';
import { FOG_ADD } from './particles.js';

const GLYPHS = 10, DOMES = 3, PILLARS = 3;
const RINGS = 14, SEGS = 56;

const COMMON = `
const float PI = 3.14159265;
const float TAU = 6.2831853;
float line(float x, float c, float w) { float d = (x - c) / w; return exp(-d * d); }
float angdiff(float a, float b) { return mod(a - b + PI, TAU) - PI; }
`;

const GLYPH_V = `
attribute vec2 aPolar;
varying vec2 vPolar;
#include <fog_pars_vertex>
void main() {
  vPolar = aPolar;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const GLYPH_F = `
uniform float uAge;
uniform float uLife;
uniform float uType;
uniform vec3 uColor;
uniform vec3 uTeam;
uniform float uArms;
uniform float uSeed;
uniform float uDir;
uniform float uArc;
uniform float uStrength;
varying vec2 vPolar;
${COMMON}
#include <fog_pars_fragment>
void main() {
  float k = clamp(uAge / uLife, 0.0, 1.0);
  float r = vPolar.x, th = vPolar.y;
  float a = 0.0;
  vec3 c = uColor;
  float team = step(0.01, uTeam.r + uTeam.g + uTeam.b);
  if (uType < 0.5) {
    // a shockwave: a bright front running out to the rim, a faint wake behind it and a second ring in the house colour
    float front = 1.0 - pow(1.0 - k, 2.2);
    float w = 0.03 + 0.07 * (1.0 - k);
    float ring = line(r, front, w);
    float wake = smoothstep(front, front - 0.5, r) * smoothstep(0.0, 0.25, r) * 0.26;
    float ring2 = line(r, front - 0.07, w * 0.9);
    a = (ring + wake + ring2 * 0.5 * team) * (1.0 - k * k);
    c = mix(uColor, vec3(1.0), ring * 0.55);
    c = mix(c, uTeam, ring2 * 0.85 * team);
  } else if (uType < 1.5) {
    // a magic circle: rings, ticks, two turning polygons and a soft glow, drawn in quickly and faded out at the end
    float appear = smoothstep(0.0, 0.14, k), fade = 1.0 - smoothstep(0.72, 1.0, k);
    float rr = r / (0.8 + 0.2 * appear);
    float ang = th + uSeed + k * 0.9;
    float rings = line(rr, 0.97, 0.014) + line(rr, 0.82, 0.01) * 0.8 + line(rr, 0.36, 0.012) * 0.6;
    float tick = step(0.5, fract(th * 24.0 / TAU)) * line(rr, 0.9, 0.04) * 0.7;
    float cell = TAU / uArms;
    float s1 = mod(ang, cell) - cell * 0.5;
    float poly = line(rr, 0.82 * cos(PI / uArms) / cos(s1), 0.012) * smoothstep(0.0, 0.1, rr);
    float s2 = mod(ang + cell * 0.5, cell) - cell * 0.5;
    float poly2 = line(rr, 0.82 * cos(PI / uArms) / cos(s2), 0.01) * 0.7 * smoothstep(0.0, 0.1, rr);
    float glow = 0.2 * (1.0 - rr);
    a = clamp(rings + tick + poly + poly2 + glow, 0.0, 1.0) * appear * fade * step(rr, 1.03);
    c = mix(uColor, vec3(1.0), 0.2 + 0.35 * poly);
    c = mix(c, uTeam, line(rr, 0.97, 0.03) * 0.85 * team);
  } else if (uType < 2.5) {
    // a cone swept forward: a wedge that runs out, bright at its front and along its edges
    float d = abs(angdiff(th, uDir));
    float inside = smoothstep(uArc, uArc * 0.8, d);
    float front = 1.0 - pow(1.0 - k, 2.0);
    float band = smoothstep(front, front - 0.55, r) * smoothstep(0.02, 0.2, r);
    float edge = line(r, front, 0.05);
    float sides = line(d, uArc * 0.92, 0.035) * smoothstep(front + 0.03, front - 0.35, r) * step(r, 1.0);
    a = (inside * (band * 0.5 + edge) + sides * 0.9) * (1.0 - k * k);
    c = mix(uColor, vec3(1.0), edge * 0.6);
    c = mix(c, uTeam, sides * 0.6 * team);
  } else if (uType < 3.5) {
    // a slash that spins round the hero: two bright arms with comet tails
    float rot = uSeed + k * 7.0;
    float m = fract((th - rot) / TAU * 2.0);
    float tail = pow(1.0 - m, 3.5);
    float head = smoothstep(0.07, 0.0, m);
    float band = smoothstep(0.5, 0.72, r) * smoothstep(1.0, 0.93, r);
    a = (tail * 0.9 + head) * band * (1.0 - smoothstep(0.55, 1.0, k)) * smoothstep(0.0, 0.08, k);
    c = mix(uColor, vec3(1.0), head * 0.7 + tail * 0.25);
    c = mix(c, uTeam, line(r, 0.97, 0.03) * 0.5 * team);
  } else {
    // a pulse of light on the ground
    float front = 1.0 - pow(1.0 - k, 2.0);
    a = exp(-r * r * 2.4) * pow(1.0 - k, 2.0) + line(r, front, 0.07) * 0.8 * (1.0 - k);
    c = mix(uColor, vec3(1.0), exp(-r * r * 6.0) * 0.6);
  }
  a = clamp(a, 0.0, 1.0);
  gl_FragColor = vec4(c * uStrength, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${FOG_ADD}
}`;

const SHELL_V = `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vH;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vH = position.y;
  vN = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const DOME_F = `
uniform float uAge;
uniform float uLife;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vH;
${COMMON}
#include <fog_pars_fragment>
void main() {
  float k = clamp(uAge / uLife, 0.0, 1.0);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec2 p = vec2(vUv.x * 24.0, vUv.y * 9.0 + (mod(floor(vUv.x * 24.0), 2.0)) * 0.5);
  vec2 q = abs(fract(p) - 0.5);
  float grid = smoothstep(0.42, 0.5, max(q.x * 1.2, q.y));
  float scan = line(fract(vH * 0.5 - uAge * 0.6), 0.5, 0.06) * 0.35;
  float appear = smoothstep(0.0, 0.1, k) * (1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.18, k)));
  float fade = 1.0 - smoothstep(0.8, 1.0, k);
  float pulse = 0.88 + 0.12 * sin(uAge * 7.0);
  float a = (fres * 0.75 + grid * (0.12 + 0.3 * fres) + scan * fres + 0.04) * appear * fade * pulse;
  vec3 c = mix(uColor, vec3(1.0), fres * 0.4 + grid * 0.2);
  gl_FragColor = vec4(c * uStrength, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${FOG_ADD}
}`;

const PILLAR_F = `
uniform float uAge;
uniform float uLife;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying float vH;
${COMMON}
#include <fog_pars_fragment>
void main() {
  float k = clamp(uAge / uLife, 0.0, 1.0);
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float y = vUv.y;
  float along = smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.55, 1.0, y));
  float streak = 0.72 + 0.28 * sin(y * 36.0 - uAge * 26.0 + vUv.x * 18.0);
  float env = pow(1.0 - k, 1.6) * smoothstep(0.0, 0.05, k);
  float a = pow(facing, 1.3) * along * streak * env;
  vec3 c = mix(uColor, vec3(1.0), pow(facing, 3.0) * 0.7);
  gl_FragColor = vec4(c * uStrength, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
${FOG_ADD}
}`;

function fogUniforms() { return THREE.UniformsUtils.clone(THREE.UniformsLib.fog); }
const TYPES = { shock: 0, rune: 1, cone: 2, slash: 3, pulse: 4 };

export class GroundFX {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.glyphs = [];
    this.domes = [];
    this.pillars = [];
    this.col = new THREE.Color();
    this.col2 = new THREE.Color();
    // shared glyph geometry data (the polar coordinates); each glyph has its own positions
    const nv = (RINGS + 1) * (SEGS + 1);
    const polar = new Float32Array(nv * 2), idx = [];
    for (let j = 0; j <= RINGS; j++) {
      for (let i = 0; i <= SEGS; i++) { const v = j * (SEGS + 1) + i; polar[v * 2] = j / RINGS; polar[v * 2 + 1] = (i / SEGS) * Math.PI * 2; }
    }
    for (let j = 0; j < RINGS; j++) {
      for (let i = 0; i < SEGS; i++) {
        const a = j * (SEGS + 1) + i, b = a + 1, c = a + SEGS + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.polar = polar; this.idx = idx; this.nv = nv;
    for (let i = 0; i < GLYPHS; i++) this.glyphs.push(this.makeGlyph());
    for (let i = 0; i < DOMES; i++) this.domes.push(this.makeShell(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), DOME_F, 'dome'));
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
    cyl.translate(0, 0.5, 0);
    for (let i = 0; i < PILLARS; i++) this.pillars.push(this.makeShell(cyl, PILLAR_F, 'pillar'));
  }

  material(frag, vert, extra) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uAge: { value: 0 }, uLife: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 1 }, ...extra, ...fogUniforms() },
      vertexShader: vert, fragmentShader: frag,
    });
  }

  makeGlyph() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aPolar', new THREE.BufferAttribute(this.polar, 2));
    geo.setIndex(this.idx);
    geo.setDrawRange(0, 0);
    const mat = this.material(GLYPH_F, GLYPH_V, {
      uType: { value: 0 }, uTeam: { value: new THREE.Color(0, 0, 0) }, uArms: { value: 6 }, uSeed: { value: 0 }, uDir: { value: 0 }, uArc: { value: 1 },
    });
    mat.name = 'glyph';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 5;
    this.g.scene.add(mesh);
    return { mesh, geo, mat, born: 0, life: 0, on: false };
  }

  makeShell(geo, frag, name) {
    const mat = this.material(frag, SHELL_V, {});
    mat.name = name;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    mesh.scale.setScalar(0.0001);
    mesh.visible = false;
    this.g.scene.add(mesh);
    return { mesh, mat, born: 0, life: 0, on: false, follow: null, r0: 1, h0: 1, dy: 0 };
  }

  free(list) {
    for (const e of list) if (!e.on) return e;
    let old = list[0];
    for (const e of list) if (e.born < old.born) old = e;   // all busy: take the oldest
    return old;
  }

  // opts: arms (rune points), dir (cone heading, radians from +x toward +z), arc (cone half angle), team (a Color for the house ring),
  // strength, seed
  glyph(type, x, y, z, radius, hex, life, opts = {}) {
    const e = this.free(this.glyphs);
    const phys = this.g.physics;
    const pos = e.geo.attributes.position, pl = this.polar;
    for (let v = 0; v < this.nv; v++) {
      const rad = pl[v * 2] * radius, th = pl[v * 2 + 1];
      const wx = x + Math.cos(th) * rad, wz = z + Math.sin(th) * rad;
      pos.setXYZ(v, wx, phys.groundHeight(wx, wz, y + 0.9) + 0.1, wz);
    }
    pos.needsUpdate = true;
    const u = e.mat.uniforms;
    u.uType.value = TYPES[type] ?? 0;
    u.uColor.value.set(hex);
    if (opts.team) u.uTeam.value.copy(opts.team); else u.uTeam.value.set(0, 0, 0);
    u.uArms.value = opts.arms || 6;
    u.uSeed.value = opts.seed !== undefined ? opts.seed : Math.random() * 6.283;
    u.uDir.value = opts.dir || 0;
    u.uArc.value = opts.arc || 1;
    u.uStrength.value = (opts.strength || 1.5) * 0.8;
    u.uLife.value = life; u.uAge.value = 0;
    e.born = this.t; e.life = life; e.on = true;
    e.geo.setDrawRange(0, RINGS * SEGS * 6);
    return e;
  }

  shell(list, hex, life, radius, height, follow, opts = {}) {
    const e = this.free(list);
    const u = e.mat.uniforms;
    u.uColor.value.set(hex); u.uLife.value = life; u.uAge.value = 0; u.uStrength.value = opts.strength || 1.4;
    e.born = this.t; e.life = life; e.on = true; e.follow = follow;
    e.r0 = radius; e.h0 = height; e.dy = opts.dy || 0;
    e.mesh.visible = true;
    e.mesh.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
    if (follow) e.mesh.position.set(follow.pos.x, follow.pos.y + e.dy, follow.pos.z);
    e.mesh.scale.set(radius, height, radius);
    return e;
  }
  dome(hex, life, radius, follow, opts) { return this.shell(this.domes, hex, life, radius, radius * 1.05, follow, opts); }
  pillar(x, y, z, hex, life, radius, height, strength = 1.6) { return this.shell(this.pillars, hex, life, radius, height, null, { x, y, z, strength }); }

  update(dt) {
    this.t += dt;
    for (const e of this.glyphs) {
      if (!e.on) continue;
      const age = this.t - e.born;
      if (age >= e.life) { e.on = false; e.geo.setDrawRange(0, 0); continue; }
      e.mat.uniforms.uAge.value = age;
    }
    for (const list of [this.domes, this.pillars]) {
      for (const e of list) {
        if (!e.on) continue;
        const age = this.t - e.born;
        if (age >= e.life || (e.follow && e.follow.alive === false)) { e.on = false; e.mesh.visible = false; continue; }
        e.mat.uniforms.uAge.value = age;
        if (e.follow) e.mesh.position.set(e.follow.pos.x, e.follow.pos.y + e.dy, e.follow.pos.z);
        else if (list === this.pillars) { const k = age / e.life, s = e.r0 * (1 - 0.55 * k); e.mesh.scale.set(s, e.h0, s); }
      }
    }
  }
}
