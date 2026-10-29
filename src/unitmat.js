// The one material every soldier, horse and hero is drawn with (see crowd.js), plus its shadow-pass twin. It is MeshStandardMaterial with
// the shader extended (through shaderhook.js) to read what modelkit.js bakes into the vertices and what crowd.js writes per instance:
//   per vertex    aSurf (roughness, metalness, colour slot, gate)   aFx (sway weight, pattern, u, v)   color (shade or colour)
//   per instance  iA cloth rgb + flag bits    iB skin rgb + team + 8 * face    iC hair rgb    iD phase, sway, hit flash, fade-out
// Slots pick the instance colour a part wears (house cloth, skin, hair...); gates hide small parts (tier kit, beard, hair styles) by
// collapsing them; cloth sways in the vertex shader; patterns (weave, quilting, mail, leather, faces, heraldry) are drawn in the fragment
// shader. Without instancing (a baked static mesh) the vertex colours are used as they are.
import * as THREE from 'three';
import { patchMaterial } from './shaderhook.js';
import { faceAtlas, emblemAtlas } from './unittex.js';

export const crowdUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uFace: { value: null }, uEmblem: { value: null } };

const DECODE = `
#ifdef USE_INSTANCING
  vec4 cA = iA, cB = iB, cC = iC, cD = iD;
#else
  vec4 cA = vec4(1.0, 1.0, 1.0, 0.0), cB = vec4(1.0, 1.0, 1.0, 0.0), cC = cB, cD = vec4(0.0);
#endif
`;

// hide a part whose gate bit is not set, and sway cloth (weights 0..0.99 hang, 1..2 are capes that stream out behind a runner)
const poseCloth = (normal) => `
float cGate = aSurf.w;
if (cGate != 0.0) {
  int cBits = int(cA.w + 0.5);
  bool cOn = ((cBits >> (int(abs(cGate) + 0.5) - 1)) & 1) == 1;
  if (cGate < 0.0) cOn = !cOn;
  if (!cOn) transformed = vec3(0.0);
}
float cW = aFx.x;
if (cW > 0.0) {
  float cape = step(1.0, cW);
  float wt = cW - cape;
  float amp = wt * wt;
  float ph = uTime * 2.6 + cD.x * 6.2831 + transformed.y * 6.0 + transformed.x * 9.0;
  float bil = cD.y;
  float rip = (0.5 + 0.5 * sin(ph)) * (0.014 + 0.03 * bil + 0.012 * uWind);
  transformed += ${normal} * (amp * rip * 2.0 * (1.0 - cape * 0.5));
  transformed.z -= cape * amp * (0.3 * bil + 0.025 * uWind * (0.6 + 0.4 * sin(ph * 0.6)));
  transformed.y += cape * amp * 0.05 * bil;
}
`;

const VERT_PARS = `
attribute vec4 aSurf;
attribute vec4 aFx;
#ifdef USE_INSTANCING
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
#endif
uniform float uTime;
uniform float uWind;
`;

const FRAG_PARS = `
varying vec4 vSurf;
varying vec4 vFx;
varying vec3 vObj;
varying vec3 vHair;
uniform sampler2D uFace;
uniform sampler2D uEmblem;
float cHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FRAG_PATTERNS = `
if (vFx.w > 0.001) {                       // fading out: a dither, so nothing is blended
  float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dth < vFx.w) discard;
}
float pRough = 0.0, pMetal = 0.0;
float pat = vSurf.z;
if (pat > 0.5) {
  vec3 q = vObj;
  float aa = clamp(1.0 - length(fwidth(q)) * 55.0, 0.0, 1.0);   // fine patterns fade out where they would shimmer
  if (pat < 1.5) {
    float w = sin(q.x * 300.0) * sin((q.y + q.z) * 300.0);
    diffuseColor.rgb *= 1.0 + 0.08 * w * aa;
    pRough += 0.04 * w * aa;
  } else if (pat < 2.5) {
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 36.0;
    float puff = abs(sin(d.x)) * abs(sin(d.y));
    diffuseColor.rgb *= mix(1.0, 0.72 + 0.32 * puff, aa);
  } else if (pat < 3.5) {
    float n = cNoise(q.xy * 220.0 + q.z * 90.0);
    float ring = sin(q.x * 260.0 + n * 3.0) * sin(q.y * 260.0 + n * 3.0);
    diffuseColor.rgb *= 1.0 + (0.22 * ring + 0.12 * (n - 0.5)) * aa;
    pRough += 0.1 * (n - 0.5) * aa;
  } else if (pat < 4.5) {
    float n = cNoise(q.xy * 140.0 + q.z * 70.0);
    diffuseColor.rgb *= 1.0 + 0.2 * (n - 0.5) * aa;
  } else if (pat < 5.5) {
    float n = cNoise(vec2((q.x + q.z) * 90.0, q.y * 8.0));
    diffuseColor.rgb *= 1.0 + 0.3 * (n - 0.5) * aa;
  } else if (pat < 6.5) {
    float n = cNoise(q.xy * 60.0 + q.z * 40.0) * 0.6 + cNoise(q.xy * 190.0 + q.z * 120.0) * 0.4;
    diffuseColor.rgb *= 0.7 + 0.6 * n;
  } else if (pat < 7.5) {
    vec2 fuv = clamp(vFx.xy, 0.0, 1.0);
    vec4 f = texture2D(uFace, vec2((fuv.x + vSurf.w) * 0.125, fuv.y));
    vec3 c = diffuseColor.rgb * f.r;
    c = mix(c, vHair * 0.85, f.g);
    c = mix(c, vec3(0.8, 0.78, 0.74), f.b);
    c = mix(c, vec3(0.04, 0.03, 0.025), f.a);
    diffuseColor.rgb = c;
  } else if (pat < 8.5) {
    vec2 euv = clamp(vFx.xy, 0.0, 1.0);
    vec4 e = texture2D(uEmblem, vec2((euv.x + vSurf.w) * 0.125, euv.y));
    vec3 ink = mix(vec3(0.84, 0.78, 0.6), vec3(0.12, 0.09, 0.06), step(2.5, vSurf.w) * step(vSurf.w, 3.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, ink, e.r);
    diffuseColor.rgb *= 1.0 - 0.45 * e.g;
  }
}
`;

const FRAG_RIM = `
{
  float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * rim * 0.28 * vec3(0.85, 0.92, 1.0);
  totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * vFx.z * 0.9;
  if (vSurf.z > 9.5) totalEmissiveRadiance += diffuseColor.rgb * 2.2;
}
`;

function mainShader(shader) {
  Object.assign(shader.uniforms, crowdUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${VERT_PARS}
varying vec4 vSurf;
varying vec4 vFx;
varying vec3 vObj;
varying vec3 vHair;`)
    .replace('#include <color_vertex>', `#include <color_vertex>
${DECODE}
float cSlot = aSurf.z;
if (cSlot > 0.5) {
  vec3 tint = cA.rgb;
  if (cSlot > 6.5) tint = vec3(1.0);
  else if (cSlot > 5.5) tint = cB.rgb * 0.7;
  else if (cSlot > 4.5) tint = mix(cA.rgb, vec3(0.92, 0.86, 0.7), 0.55);
  else if (cSlot > 3.5) tint = cA.rgb * 0.5;
  else if (cSlot > 2.5) tint = cC.rgb;
  else if (cSlot > 1.5) tint = cB.rgb;
  vColor = tint * color;
}
float cPat = aFx.y;
vSurf = vec4(aSurf.x, aSurf.y, cPat, cPat > 7.5 ? mod(cB.w, 8.0) : floor(cB.w / 8.0));
vFx = vec4(aFx.zw, cD.z, cD.w);
vHair = cC.rgb;
vObj = position;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${poseCloth('normalize(objectNormal)')}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>${FRAG_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>${FRAG_PATTERNS}`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vSurf.x + pRough, 0.05, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = clamp(vSurf.y + pMetal, 0.0, 1.0);')
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${FRAG_RIM}`);
}

function depthShader(shader) {
  Object.assign(shader.uniforms, crowdUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${VERT_PARS}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${DECODE}${poseCloth('vec3(0.0)')}`);
}

let mats = null;
function shared() {
  if (!mats) {
    crowdUniforms.uFace.value = faceAtlas();
    crowdUniforms.uEmblem.value = emblemAtlas();
    const make = (side) => patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side }), 'crowd', mainShader);
    mats = { front: make(THREE.FrontSide), double: make(THREE.DoubleSide), depth: patchMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'crowdDepth', depthShader) };
  }
  return mats;
}

// closed shapes use FrontSide; thin cloth (capes, tabards, skirts) is DoubleSide (so is the default, for meshes that mix both)
export function unitMaterial(open = true) { const m = shared(); return open ? m.double : m.front; }
export function crowdDepthMaterial() { return shared().depth; }
export function unitMaterials() { return mats ? [mats.front, mats.double, mats.depth] : []; }
