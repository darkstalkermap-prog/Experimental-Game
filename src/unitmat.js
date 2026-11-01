// The one material every soldier, horse and hero is drawn with (see crowd.js), plus its shadow-pass twin. It is MeshStandardMaterial with
// the shader extended (through shaderhook.js) to read what modelkit.js bakes into the vertices and what crowd.js writes per instance:
//   per vertex    aSurf (roughness, metalness, colour slot, gate)   aFx (sway weight, pattern, u, v)   color (shade or colour)
//   per instance  iA cloth rgb + flag bits    iB skin rgb + emblem cell + 16 * face (unittex.js)    iC hair rgb    iD phase, sway, hit flash, fade-out
// Slots pick the instance colour a part wears (house cloth, skin, hair...); gates hide small parts (tier kit, beard, hair styles) by
// collapsing them; cloth sways in the vertex shader; patterns (weave, quilting, mail, leather, faces, heraldry) are drawn in the fragment
// shader. Without instancing (a baked static mesh) the vertex colours are used as they are.
import * as THREE from 'three';
import { patchMaterial } from './shaderhook.js';
import { faceAtlas, emblemAtlas, armsUniforms, LORDS } from './unittex.js';

export const crowdUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uFace: { value: null }, uEmblem: { value: null }, uArmsTint: { value: armsUniforms.tint }, uArmsInk: { value: armsUniforms.ink } };

const DECODE = `
#ifdef USE_INSTANCING
  vec4 cA = iA, cB = iB, cC = iC, cD = iD;
#else
  vec4 cA = vec4(1.0, 1.0, 1.0, 0.0), cB = vec4(1.0, 1.0, 1.0, 0.0), cC = cB, cD = vec4(0.0);
#endif
`;

// hide a part whose gate bit is not set, and sway cloth (weights 0..0.99 hang, 1..2 are capes that stream out behind a runner).
// A skirt (weight + 2, see SKIRT in modelkit.js) follows the thighs when they come up (a crouch, a kneel): the front lies along them,
// pulled in to their tops, the back flares a little behind. cC.w is minus the mean thigh angle (radians, forward) plus 8 x the hips'
// shift forward in cm (see legsForSkirt in models.js); 0 is standing. The pivot is the hip joints' height in the pelvis frame.
const poseCloth = (normal, fixNormal) => `
float cGate = aSurf.w;
if (cGate != 0.0) {
  int cBits = int(cA.w + 0.5);
  bool cOn = ((cBits >> (int(abs(cGate) + 0.5) - 1)) & 1) == 1;
  if (cGate < 0.0) cOn = !cOn;
  if (!cOn) transformed = vec3(0.0);
}
float cW = aFx.x;
float cSk = step(2.0, cW);
cW -= 2.0 * cSk;
if (cSk > 0.0 && cC.w < -0.001) {
  float sV = -cC.w, sA = -mod(sV, 8.0), sHz = floor(sV / 8.0) * 0.01;
  float sF = smoothstep(-0.03, 0.09, transformed.z);
  float sLow = smoothstep(0.07, -0.05, transformed.y);
  float sK = clamp(sA / -1.45, 0.0, 1.0) * sLow;
  float sAng = sLow * sA * mix(-0.12, 0.92, sF);
  float sc = cos(sAng), ss = sin(sAng);
  vec3 sQ = transformed - vec3(0.0, -0.02, 0.0);
  sQ.z *= 1.0 - 0.5 * sF * sK;
  // (the sides, between a thigh and the seat, gather up out of the way; the back is shortened a little: it bunches over the heels)
  sQ.y *= 1.0 - sK * (2.4 * sF * (1.0 - sF) + 0.2 * (1.0 - sF));
  transformed = vec3(sQ.x, sQ.y * sc - sQ.z * ss - 0.02, sQ.y * ss + sQ.z * sc + sHz * sF * sLow);${fixNormal ? `
  #ifndef FLAT_SHADED
  vec3 sN = vec3(objectNormal.x, objectNormal.y * sc - objectNormal.z * ss, objectNormal.y * ss + objectNormal.z * sc);
  #ifdef USE_INSTANCING
  mat3 sIm = mat3(instanceMatrix);
  sN = sIm * (sN / vec3(dot(sIm[0], sIm[0]), dot(sIm[1], sIm[1]), dot(sIm[2], sIm[2])));
  #endif
  vNormal = normalize(normalMatrix * sN);
  #endif` : ''}
}
if (cW > 0.0) {
  float cape = step(1.0, cW);
  float wt = cW - cape;
  float amp = wt * wt;
  float ph = uTime * 2.6 + cD.x * 6.2831 + transformed.y * 6.0 + transformed.x * 9.0;
  float bil = max(cD.y, 0.0);
  float rip = (0.5 + 0.5 * sin(ph)) * (0.014 + 0.03 * bil + 0.012 * uWind);
  transformed += ${normal} * (amp * rip * 2.0 * (1.0 - cape * 0.5));
  transformed.z -= cape * amp * (0.3 * bil + 0.025 * uWind * (0.6 + 0.4 * sin(ph * 0.6)));
  transformed.y += cape * amp * 0.05 * bil;
  // a cape on a man lying on his face sags over the backs of his legs (cD.y below 0: how far he is down, see poseDeath)
  transformed.z += cape * max(-cD.y, 0.0) * 0.13 * smoothstep(-0.4, -0.95, transformed.y);
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
varying float vSeed;
uniform sampler2D uFace;
uniform sampler2D uEmblem;
uniform vec3 uArmsTint[${LORDS}];
uniform vec3 uArmsInk[${LORDS}];
float cHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// The surface of each material, drawn here so a shape needs no texture of its own (q is the point in the shape's own frame, so a pattern
// stays put on a moving limb; vSeed is the soldier's own number, so his stains are not his neighbour's). Every material is a little
// uneven (stains, fading, oil, wear: the large noise), and mud climbs from the feet (the dirt that modelkit.js bakes into the pattern
// channel's fraction).
const FRAG_PATTERNS = `
if (vFx.w > 0.001) {                       // fading out: a dither, so nothing is blended
  float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (dth < vFx.w) discard;
}
float pRough = 0.0, pMetal = 0.0;
float pat = floor(vSurf.z + 0.5);
float pDirt = clamp((vSurf.z - pat) * 2.5, 0.0, 1.0);
vec3 q = vObj;
float aa = clamp(1.0 - length(fwidth(q)) * 55.0, 0.0, 1.0);   // fine patterns fade out where they would shimmer
vec2 sq = q.xy * 6.0 + q.z * 4.3 + vSeed * 13.0;
float stain = cNoise(sq) * 0.62 + cNoise(sq * 2.9 + 3.1) * 0.38;
if (pat > 0.5) {
  if (pat < 1.5) {
    // woven cloth: the weave, dye that took unevenly, and patches faded by sun and washing
    float w = sin(q.x * 300.0) * sin((q.y + q.z) * 300.0);
    diffuseColor.rgb *= (1.0 + 0.09 * w * aa) * mix(0.8, 1.1, stain);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.45, 0.25))) * 1.05, 0.25 * smoothstep(0.55, 0.85, stain));
    pRough += 0.04 * w * aa;
  } else if (pat < 2.5) {
    vec2 d = vec2(q.x + q.y, q.x - q.y) * 36.0;
    float puff = abs(sin(d.x)) * abs(sin(d.y));
    diffuseColor.rgb *= mix(1.0, 0.7 + 0.34 * puff, aa) * mix(0.84, 1.08, stain);
  } else if (pat < 3.5) {
    float n = cNoise(q.xy * 220.0 + q.z * 90.0);
    float ring = sin(q.x * 260.0 + n * 3.0) * sin(q.y * 260.0 + n * 3.0);
    diffuseColor.rgb *= (1.0 + (0.24 * ring + 0.12 * (n - 0.5)) * aa) * mix(0.7, 1.12, stain);
    pRough += 0.1 * (n - 0.5) * aa + 0.2 * (0.5 - stain);
  } else if (pat < 4.5) {
    // leather: pores, a coarser mottle, creases where it bends, darker where it was oiled or sweated through, paler where it rubs
    float n = cNoise(q.xy * 140.0 + q.z * 70.0);
    float pore = cNoise(q.xy * 560.0 + q.z * 410.0);
    float crease = abs(cNoise(vec2(q.x * 26.0 + q.z * 19.0, q.y * 95.0) + vSeed * 3.0) - 0.5);
    diffuseColor.rgb *= 1.0 + 0.22 * (n - 0.5) + 0.16 * (pore - 0.5) * aa;
    diffuseColor.rgb *= mix(0.74, 1.16, stain) * (1.0 - 0.2 * smoothstep(0.05, 0.0, crease) * aa);
    pRough += 0.2 * (stain - 0.5) + 0.1 * (pore - 0.5) * aa;
  } else if (pat < 5.5) {
    float n = cNoise(vec2((q.x + q.z) * 90.0, q.y * 8.0));
    diffuseColor.rgb *= (1.0 + 0.3 * (n - 0.5)) * mix(0.82, 1.1, stain);
  } else if (pat < 6.5) {
    // fur: tufts and strands that run down the pelt
    float n = cNoise(q.xy * 60.0 + q.z * 40.0) * 0.5 + cNoise(vec2((q.x + q.z) * 230.0, q.y * 30.0)) * 0.5;
    diffuseColor.rgb *= (0.62 + 0.7 * n) * mix(0.85, 1.1, stain);
    pRough += 0.1 * (0.5 - n);
  } else if (pat < 7.5) {
    vec2 fuv = clamp(vFx.xy, 0.0, 1.0);
    vec4 f = texture2D(uFace, vec2((fuv.x + vSurf.w) * 0.125, fuv.y));
    vec3 c = diffuseColor.rgb * f.r;
    c = mix(c, vHair * 0.85, f.g);
    c = mix(c, vec3(0.7, 0.66, 0.6), f.b);
    c = mix(c, vec3(0.04, 0.03, 0.025), f.a);
    diffuseColor.rgb = c;
    float n = cNoise(q.xy * 34.0 + q.z * 27.0);
    diffuseColor.rgb *= mix(vec3(0.96, 0.98, 1.0), vec3(1.05, 0.98, 0.95), n);
    // blood under the skin: the cheeks, the nose and the lips warmer than the brow
    vec2 cu = vec2(abs(fuv.x - 0.5), fuv.y);
    float red = exp(-dot(cu - vec2(0.2, 0.42), cu - vec2(0.2, 0.42)) * 90.0) + exp(-dot(cu - vec2(0.0, 0.38), cu - vec2(0.0, 0.38)) * 260.0) + 0.8 * exp(-dot(cu - vec2(0.0, 0.235), cu - vec2(0.0, 0.235)) * 300.0);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.1, 0.92, 0.88), clamp(red, 0.0, 1.0) * step(0.0, vFx.x) * 0.7);
  } else if (pat < 8.5 || (pat > 11.5 && pat < 12.5)) {
    // the emblem (8: a surcoat or shield, the whole of the arms; 12: a badge on a cloak of fixed colours, the sigil only)
    vec2 euv = clamp(vFx.xy, 0.0, 1.0);
    vec4 e = texture2D(uEmblem, vec2((euv.x + vSurf.w) * 0.0625, euv.y));
    vec3 ink = mix(vec3(0.84, 0.78, 0.6), vec3(0.12, 0.09, 0.06), step(2.5, vSurf.w) * step(vSurf.w, 3.5));
    if (vSurf.w > 7.5) {   // a lord's own arms (unittex.js): the tinted part of the field, and the colour of the sigil
      int k = int(vSurf.w - 7.5);
      if (pat < 8.5) diffuseColor.rgb = mix(diffuseColor.rgb, uArmsTint[k] * 0.85, e.b);
      ink = uArmsInk[k];
    }
    float w = sin(q.x * 300.0) * sin((q.y + q.z) * 300.0);   // (the weave of the cloth, under the paint as well)
    diffuseColor.rgb = mix(diffuseColor.rgb, ink, e.r);
    diffuseColor.rgb *= (1.0 - 0.45 * e.g) * (1.0 + 0.08 * w * aa) * mix(0.84, 1.08, stain);
  } else if (pat > 10.5 && pat < 11.5) {
    // skin: blotches of colour (a little ruddier here, paler there) and a fine grain in the sheen
    float n = cNoise(q.xy * 34.0 + q.z * 27.0);
    diffuseColor.rgb *= mix(vec3(0.96, 0.98, 1.0), vec3(1.05, 0.98, 0.95), n);
    pRough += 0.1 * (cNoise(q.xy * 420.0 + q.z * 300.0) - 0.5) * aa;
  } else if (pat > 12.5 && pat < 13.5) {
    // hair and beards: strands running down, in locks of lighter and darker
    float s1 = cNoise(vec2((q.x + q.z * 0.7) * 300.0, q.y * 22.0)), s2 = cNoise(vec2((q.x - q.z) * 70.0, q.y * 7.0));
    diffuseColor.rgb *= 0.62 + 0.42 * s2 + 0.3 * (s1 - 0.5) * aa;
    pRough += 0.14 * (0.5 - s1);
  }
}
if (vSurf.y > 0.5 && (pat < 0.5 || pat > 13.5)) {
  // bare metal: hammer marks and wear make the shine uneven; fine scratches catch the light; oil, soot and a bloom of rust dull it in patches
  float n = cNoise(q.xy * 70.0 + q.z * 55.0), m = cNoise(q.yz * 23.0 + q.x * 17.0 + vSeed * 9.0);
  float scr = smoothstep(0.8, 0.97, cNoise(vec2(q.x * 700.0 + q.z * 520.0, q.y * 22.0 + q.z * 30.0))) * aa;
  float grime = smoothstep(0.56, 0.9, stain);
  pRough += 0.12 * (n - 0.5) + 0.12 * (m - 0.5) + 0.26 * grime - 0.12 * scr;
  diffuseColor.rgb *= (0.88 + 0.16 * m) * mix(vec3(1.0), vec3(0.72, 0.66, 0.58), grime);
  diffuseColor.rgb += scr * 0.07;
}
if (pDirt > 0.003) {
  float dn = cNoise(q.xy * 19.0 + q.z * 15.0 + vSeed * 5.0) * 0.62 + cNoise(q.xy * 71.0 + q.z * 53.0) * 0.38;
  float d = smoothstep(0.22, 0.8, pDirt * (0.35 + 1.15 * dn));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42 + vec3(0.075, 0.058, 0.04), d);
  pRough += 0.45 * d;
  pMetal -= 0.75 * d;
}
`;

const FRAG_RIM = `
{
  float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  // (skin lets light through at its edges, warm, where cloth and steel catch a cool sky rim)
  float flesh = step(6.5, pat) * step(pat, 7.5) + step(10.5, pat) * step(pat, 11.5);
  totalEmissiveRadiance += diffuseColor.rgb * rim * mix(vec3(0.17, 0.19, 0.21), vec3(0.3, 0.14, 0.09), flesh);
  totalEmissiveRadiance += vec3(1.0, 0.8, 0.55) * vFx.z * 0.9;
  if (pat > 9.5 && pat < 10.5) totalEmissiveRadiance += diffuseColor.rgb * 2.2;
}
`;

function mainShader(shader) {
  Object.assign(shader.uniforms, crowdUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>${VERT_PARS}
varying vec4 vSurf;
varying vec4 vFx;
varying vec3 vObj;
varying vec3 vHair;
varying float vSeed;`)
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
vSurf = vec4(aSurf.x, aSurf.y, cPat, cPat > 7.5 ? mod(cB.w, 16.0) : floor(cB.w / 16.0));
vFx = vec4(aFx.zw, cD.z, cD.w);
vHair = cC.rgb;
vSeed = fract(cD.x * 7.31);
vObj = position;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>${poseCloth('normalize(objectNormal)', true)}`);
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
    .replace('#include <begin_vertex>', `#include <begin_vertex>${DECODE}${poseCloth('vec3(0.0)', false)}`);
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
