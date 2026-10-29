// The one material a siege engine is drawn with. Timber, hides, iron, rope, stone, painted cloth and bark are told apart by a per-vertex
// kind (the geometry carries it in `aKind`, see siegegeo.js), so a whole engine needs one material and one draw call per moving part
// instead of one per sort of surface:
//   0 wood  the boards texture and its normal map          1 hide   patched leather (castletex.js hideSet)
//   2 iron  dark steel: metal, hammered, a little rust     3 rope   twisted strands, rough
//   4 stone mottled grey                                   5 cloth  house colours, a soft weave       6 bark  a felled trunk
//   7 paint house colours painted on boards (the boards' grain and seams show through)
// The vertex colour is the tint of every kind (linear). `aEP` is where the vertex stands in the engine's own frame at rest (y = 0 is the
// ground), so mud and age work the same on the turning wheels and the swinging arm as on the frame. Normal maps and the dirt are for
// Medium and above (materials.js switches the normal map with Q.detail, like the castle's).
import * as THREE from 'three';
import { timberSet, hideSet, barkSet, noiseTexture } from './castletex.js';
import { patchMaterial } from './shaderhook.js';
import { Q, onQuality } from './quality.js';

export const KIND = { wood: 0, hide: 1, iron: 2, rope: 3, stone: 4, cloth: 5, bark: 6, paint: 7 };

const FX = { value: 1 };

const VERT_PARS = `attribute float aKind; attribute vec3 aEP;
varying float vKind; varying vec3 vEP;`;

const FRAG_PARS = `uniform sampler2D uHide; uniform sampler2D uHideN; uniform sampler2D uBark; uniform sampler2D uBarkN; uniform sampler2D uGrime; uniform float uFx;
varying float vKind; varying vec3 vEP;`;

// which texture a surface wears (all three are read and one chosen: the pictures are small and the engines few, and no texture is read
// inside a branch, where its derivatives would be undefined)
const MAP = `
float eKind = floor(vKind + 0.5);
{
  vec4 tW = texture2D(map, vMapUv), tH = texture2D(uHide, vMapUv), tB = texture2D(uBark, vMapUv);
  // paint: the boards' brightness (grain, seams) over the colour of the paint
  vec4 tP = vec4(vec3(clamp(dot(tW.rgb, vec3(0.3, 0.59, 0.11)) * 7.5, 0.35, 1.25)), 1.0);
  diffuseColor *= eKind < 0.5 ? tW : (eKind < 1.5 ? tH : (eKind < 5.5 ? vec4(1.0) : (eKind < 6.5 ? tB : tP)));
}`;

// iron, rope and stone have no texture, so they get their character here; then age and mud on everything
const GRIME = `
{
  vec4 gA = texture2D(uGrime, vec2(vEP.x + vEP.z, vEP.y) * 0.23);
  vec4 gB = texture2D(uGrime, vec2(vEP.x - vEP.z * 0.7, vEP.y * 1.3 + vEP.z * 0.5) * 1.3);
  float rope = step(2.5, eKind) * (1.0 - step(3.5, eKind));
  float iron = step(1.5, eKind) * (1.0 - step(2.5, eKind));
  float stone = step(3.5, eKind) * (1.0 - step(4.5, eKind));
  float cloth = step(4.5, eKind) * (1.0 - step(5.5, eKind));
  float twist = 0.5 + 0.5 * sin((vMapUv.x + vMapUv.y) * 6.2832);
  diffuseColor.rgb *= mix(1.0, 0.68 + 0.55 * twist, rope);
  diffuseColor.rgb *= mix(1.0, 0.78 + 0.5 * gB.g, iron);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.5, 0.9, 0.55), iron * smoothstep(0.6, 0.9, gA.r) * 0.55 * uFx);
  diffuseColor.rgb *= mix(1.0, 0.62 + 0.75 * gA.g * (0.6 + 0.8 * gB.b), stone);
  diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * gB.g, cloth);
  float foot = 1.0 - smoothstep(0.0, 0.9 + gA.g * 0.9, vEP.y);
  float dirt = foot * (0.4 + 0.6 * gB.r) * (1.0 - 0.65 * cloth) * uFx;
  diffuseColor.rgb *= (0.82 + 0.36 * gA.b) * (1.0 - 0.5 * dirt);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.66, 0.48), dirt * 0.6);
}`;

const ROUGH = 'roughnessFactor = eKind < 0.5 ? 0.9 : (eKind < 1.5 ? 0.66 : (eKind < 2.5 ? 0.58 : (eKind < 3.5 ? 0.96 : (eKind < 4.5 ? 0.97 : (eKind < 5.5 ? 0.82 : (eKind < 6.5 ? 0.96 : 0.74))))));';
const METAL = 'metalnessFactor = (eKind > 1.5 && eKind < 2.5) ? 0.7 : 0.0;';

// the normal map of whichever kind this is; iron, rope, stone and cloth are flat
const NORMAL_FROM = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
const NORMAL_TO = 'vec3 mapN = ( ( eKind < 0.5 || eKind > 6.5 ) ? texture2D( normalMap, vNormalMapUv ) : ( eKind < 1.5 ? texture2D( uHideN, vNormalMapUv ) : ( ( eKind > 5.5 ) ? texture2D( uBarkN, vNormalMapUv ) : vec4( 0.5, 0.5, 1.0, 1.0 ) ) ) ).xyz * 2.0 - 1.0;';

let mat = null;
export function engineMaterial() {
  if (mat) return mat;
  const tm = timberSet(256), hd = hideSet(256), bk = barkSet(256);
  mat = new THREE.MeshStandardMaterial({ map: tm.map, normalMap: tm.normalMap, vertexColors: true, roughness: 1, metalness: 0 });
  const U = { uHide: { value: hd.map }, uHideN: { value: hd.normalMap }, uBark: { value: bk.map }, uBarkN: { value: bk.normalMap }, uGrime: { value: noiseTexture() }, uFx: FX };
  let normalChunk = THREE.ShaderChunk.normal_fragment_maps;
  if (normalChunk.includes(NORMAL_FROM)) normalChunk = normalChunk.replace(NORMAL_FROM, NORMAL_TO);
  else console.warn('siegemat: the normal map chunk changed; engines use the timber normal map everywhere');
  patchMaterial(mat, 'engine', (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKind = aKind; vEP = aEP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', MAP)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GRIME)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + ROUGH)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + METAL)
      .replace('#include <normal_fragment_maps>', normalChunk);
  });
  onQuality(() => { FX.value = Q.detail > 0 ? 1 : 0; });
  return mat;
}
