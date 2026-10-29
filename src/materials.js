// Shared materials and geometry helpers.
import * as THREE from 'three';
import { bannerTexture, soilTexture } from './textures.js';
import { stoneSet, flagSet, cobbleSet, timberSet, gateSet, roofSet, noiseTexture } from './castletex.js';
import { patchMaterial } from './shaderhook.js';
import { Q, onQuality } from './quality.js';
import { fireMaterial } from './castlefx.js';
import { engineMaterial } from './siegemat.js';
import { TEAM_COLORS } from './config.js';

let M = null;

// one flag shared by every weathered material: 1 = the weathering shader runs, 0 = plain textured stone (Low)
const FX = { value: 1 };

// Masonry shader additions: damp and moss at the foot of a wall, long rain streaks, large-scale patchiness (so repeated tiles do not read)
// Positions are in the mesh's own space, which for a castle is castle-local, so "y = 0" is the ground. Normal maps and the
// weathering are switched by Q.detail (see below).
// The fine detail is also given up with distance, with a branch instead of a fade of the result so that the reads themselves are skipped:
// the rain streaks (finer than a pixel from about 50 m, the noise texture's mips have averaged them out by then) and the normal map's relief
// (the courses and bevels, under a pixel from about 50 m) are drawn in full up to the first distance and not at all past the second.
// The patchiness and the damp stay at every distance: they are large (several metres) and carry the look of a far castle.
const STREAK_FADE = '30.0, 60.0', NORMAL_FADE = '34.0, 70.0';
export function weathering(material) {
  return patchMaterial(material, 'cwStone', (shader) => {
    shader.uniforms.cwNoise = { value: noiseTexture() };
    shader.uniforms.cwFx = FX;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCwP;\nvarying vec3 vCwN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCwP = position;\nvCwN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D cwNoise;\nuniform float cwFx;\nvarying vec3 vCwP;\nvarying vec3 vCwN;')
      // the tangent frame of the normal map is worked out where the relief is drawn (see normal_fragment_maps below), not here
      .replace('#include <normal_fragment_begin>', `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
      vec3 normal = normalize( vNormal );
      #ifdef DOUBLE_SIDED
        normal *= faceDirection;
      #endif
      vec3 nonPerturbedNormal = normal;`)
      .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
        // (the screen derivatives are taken here, outside the branch; the rest is the stock tangent frame of three.js)
        vec3 cwQ0 = dFdx( - vViewPosition ), cwQ1 = dFdy( - vViewPosition );
        vec2 cwS0 = dFdx( vNormalMapUv ), cwS1 = dFdy( vNormalMapUv );
        float cwNK = 1.0 - smoothstep( ${NORMAL_FADE}, vViewPosition.z );
        if ( cwNK > 0.0 ) {
          vec3 cwQ1p = cross( cwQ1, normal ), cwQ0p = cross( normal, cwQ0 );
          vec3 cwT = cwQ1p * cwS0.x + cwQ0p * cwS1.x;
          vec3 cwB = cwQ1p * cwS0.y + cwQ0p * cwS1.y;
          float cwDet = max( dot( cwT, cwT ), dot( cwB, cwB ) );
          float cwSc = ( cwDet == 0.0 ) ? 0.0 : inversesqrt( cwDet );
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale * cwNK;
          normal = normalize( mat3( cwT * cwSc, cwB * cwSc, normal ) * mapN );
        }
      #endif`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      if (cwFx > 0.5) {   // (Low: the plain textured stone, nothing is read)
        float cwVert = 1.0 - smoothstep(0.55, 0.9, abs(vCwN.y));
        vec2 cwP = mix(vec2(vCwP.x + vCwP.z, vCwP.y), vCwP.xz, 1.0 - cwVert);
        vec4 cwA = texture2D(cwNoise, cwP * 0.09);
        float cwDamp = smoothstep(1.7 + cwA.g * 1.3, 0.0, vCwP.y) * cwVert;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.66, 0.74, 0.52), cwDamp * 0.7);
        float cwStreakK = cwVert * (1.0 - smoothstep(${STREAK_FADE}, vViewPosition.z));   // (none on a roof or a step: nothing runs down it)
        if (cwStreakK > 0.0) {
          float cwStreak = texture2D(cwNoise, vec2((vCwP.x + vCwP.z) * 0.75, vCwP.y * 0.035)).g;
          diffuseColor.rgb *= 1.0 - 0.24 * smoothstep(0.55, 0.92, cwStreak) * cwStreakK;
        }
        diffuseColor.rgb *= 0.8 + 0.4 * cwA.b;
      }`);
  });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export function materials() {
  if (M) return M;
  const st = stoneSet(512), tm = timberSet(256), rf = roofSet(256), gt = gateSet(), cb = cobbleSet(512);
  flagSet(512);
  const stone = (color, roughness) => weathering(std({ map: st.map, normalMap: st.normalMap, color, roughness }));
  M = {
    // ---- the long-standing set (the practice yard and the centre piece use these): textured, no vertex colours ----
    stone: stone(0xf0eadc, 0.93),
    stoneDark: stone(0x9a948a, 0.98),
    stoneFine: stone(0xfff0d2, 0.82),   // dressed sandstone (level 3 walls)
    stoneBurnt: stone(0x4a4540, 1),
    wood: std({ map: tm.map, normalMap: tm.normalMap, color: 0xffffff, roughness: 0.85 }),
    plank: std({ map: tm.map, normalMap: tm.normalMap, color: 0xd8c8b0, roughness: 0.9 }),
    roof: std({ map: rf.map, normalMap: rf.normalMap, color: 0xffffff, roughness: 0.8 }),
    iron: std({ color: 0x3a3b3f, metalness: 0.8, roughness: 0.45 }),
    steel: std({ color: 0xd5d9e0, metalness: 0.9, roughness: 0.25 }),
    gold: std({ color: 0xd8a83a, metalness: 0.9, roughness: 0.3 }),
    leather: std({ color: 0x4b3020, roughness: 0.9 }),
    rope: std({ color: 0x8a7550, roughness: 1 }),
    soil: std({ map: soilTexture(), roughness: 1 }),
    dark: std({ color: 0x141210, roughness: 1 }),
    banners: TEAM_COLORS.map((c, i) => new THREE.MeshStandardMaterial({
      map: bannerTexture(c, i), side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5,
    })),
    team: TEAM_COLORS.map((c) => std({ color: c, roughness: 0.85 })),
    // ---- scenery for castles, engines and props: one mesh per material, every piece tinted by its vertex colours (see parts.js) ----
    masonry: weathering(std({ map: st.map, normalMap: st.normalMap, vertexColors: true, roughness: 0.95 })),
    ground: std({ map: cb.map, normalMap: cb.normalMap, vertexColors: true, roughness: 1 }),
    timber: std({ map: tm.map, normalMap: tm.normalMap, vertexColors: true, roughness: 0.88 }),
    tiles: std({ map: rf.map, normalMap: rf.normalMap, vertexColors: true, roughness: 0.75 }),
    metal: std({ vertexColors: true, metalness: 0.65, roughness: 0.5 }),
    plain: std({ vertexColors: true, roughness: 0.92 }),
    gate: std({ map: gt.map, normalMap: gt.normalMap, color: 0xffffff, roughness: 0.85 }),
    engine: engineMaterial(),   // siege engines: timber, hides, iron, rope, stone and cloth in one (see siegemat.js)
    fire: fireMaterial(),
    gateBurnt: std({ map: gt.map, normalMap: gt.normalMap, color: 0x3a322c, roughness: 1 }),
    // geometries shared by every castle live here so that Game.dispose keeps them (it keeps everything this object holds)
    geos: [],
  };
  // normal maps and the weathering shader are for Medium and above
  const withMaps = Object.values(M).flat().filter((m) => m && m.isMaterial && m.normalMap);
  const maps = new Map(withMaps.map((m) => [m, m.normalMap]));
  onQuality(() => {
    FX.value = Q.detail > 0 ? 1 : 0;
    for (const [m, n] of maps) {
      const want = Q.detail > 0 ? n : null;
      if (m.normalMap !== want) { m.normalMap = want; m.needsUpdate = true; }
    }
  });
  return M;
}

// the material a Parts key is drawn with
export function partsMaterial(key) {
  const m = materials();
  return key === 'roof' ? m.tiles : m[key];
}

// Box with UVs scaled to world size so textures keep a constant density.
export function box(w, h, d, texScale = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / texScale, uv.getY(i) * dims[f][1] / texScale);
    }
  }
  return g;
}

export function shadowed(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
