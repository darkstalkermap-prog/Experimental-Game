// The look of the air: one analytic sky shared by the sky dome, the fog and the environment map, a sun- and height-aware fog patched
// once into THREE.ShaderChunk (so every material gets it, nothing is hooked per material), the tone curve, and the soft cascaded
// sun shadows. Importing this module installs the chunks, so it must be imported before the first material is compiled (world.js does).
//
// Colour pipeline: the sky and the fog are computed as linear scene-referred radiance. When the scene is drawn into the HDR target
// (post.js) that is stored as it is and tone-mapped once at the end; when it is drawn straight to the canvas the fog converts its colour
// the same way the material did (tone map, then the output encoding), so the two paths agree.
import * as THREE from 'three';
import { Q, usesPost } from './quality.js';
import { skyLightGLSL } from './skylight.js';
import { active } from './biomes.js';

// the sun stands still: a warm afternoon, about 30 degrees above the horizon (everything that needs it reads this one vector)
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.45).normalize();
export const SUN_LIGHT_COLOR = 0xffd9a8;
export const SUN_INTENSITY = 3.1;

const f6 = (v) => v.toFixed(6);
const SUN_CONST = `const vec3 ATM_SUN = vec3(${f6(SUN_DIR.x)}, ${f6(SUN_DIR.y)}, ${f6(SUN_DIR.z)});`;

// ---------------------------------------------------------------------------------------------------------------------------
// The shared sky model. Linear radiance of the clear sky for a unit view direction d (y up); no clouds, no sun disc.
// Painted rather than integrated (one cheap evaluation, usable per fragment by the fog), but shaped like single scattering: deep blue
// overhead, paling to a warm haze at the horizon, brighter and more golden around the sun, darkest about ninety degrees from it.
export const ATM_GLSL = `
${SUN_CONST}
const vec3 ATM_SUN_TINT = vec3(1.0, 0.80, 0.55);
vec3 atmSrgb(vec3 c) { return pow(c, vec3(2.2)); }
float atmHg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (12.5663706 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5)); }
// tint: the colour of the haze at the horizon (1 = the meadow's), fading out overhead; murk 0..1: overcast and mist (0 = the clear meadow sky). Both are
// 1 and 0 in the meadow, where every line below gives back exactly the value it had before biomes (see the air of a biome in biomes.js).
vec3 atmHazeB(vec3 d, vec3 tint, float murk) {
  float y = clamp(d.y, 0.0, 1.0);
  float mu = clamp(dot(d, ATM_SUN), -1.0, 1.0);
  vec3 zenith = atmSrgb(vec3(0.27, 0.46, 0.79));
  vec3 mid = atmSrgb(vec3(0.44, 0.64, 0.91));
  vec3 low = atmSrgb(vec3(0.68, 0.82, 0.96));
  vec3 hor = atmSrgb(vec3(0.84, 0.90, 0.95));
  vec3 sky = mix(hor, low, smoothstep(0.0, 0.10, y));
  sky = mix(sky, mid, smoothstep(0.06, 0.42, y));
  sky = mix(sky, zenith, smoothstep(0.30, 1.0, y));
  sky = mix(sky, hor, murk * smoothstep(0.0, 0.25, y));                   // overcast: the sky above pales to the colour of the horizon
  sky *= 0.86 + 0.28 * mu * mu;                                          // Rayleigh phase: dimmest about 90 degrees from the sun
  float glow = atmHg(mu, 0.70) * 0.50 + pow(max(mu, 0.0), 3.0) * 0.14;   // forward scattering by the haze
  sky += ATM_SUN_TINT * glow * (1.0 - 0.45 * sqrt(y)) * (1.0 - 0.8 * murk);
  sky += atmSrgb(vec3(0.95, 0.74, 0.50)) * pow(max(mu, 0.0), 1.5) * 0.20 * (1.0 - smoothstep(0.0, 0.30, y)) * (1.0 - 0.9 * murk);   // golden horizon on the sun side
  return sky * mix(tint, vec3(1.0), smoothstep(0.0, 0.55, y));
}
vec3 atmHaze(vec3 d) { return atmHazeB(d, vec3(1.0), 0.0); }
`;

// ---------------------------------------------------------------------------------------------------------------------------
// Tone curve: the Khronos "neutral" curve without its toe (keeps hue and saturation of ordinary colours, so team colours stay themselves,
// and rolls the highlights off smoothly). Used by three.js as its CustomToneMapping (the direct-to-canvas path) and by the post pass.
export const NEUTRAL_GLSL = `
vec3 atmNeutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0), g);
}
`;

// ---------------------------------------------------------------------------------------------------------------------------
// Fog. Optical depth = clear-air haze (grows with the square of the distance, so the near field stays crisp) + valley mist (an
// exponential layer, integrated along the ray, denser low in the valley). The fog colour is the sky in the direction of the ray, so
// distant things melt into the sky: pale and cool away from the sun, warm and bright toward it. fogDensity carries the scale (Q.viewDist).
const FOG_VERTEX_PARS = `#ifdef USE_FOG
  varying vec3 vFogRay;
#endif`;
const FOG_VERTEX = `#ifdef USE_FOG
  vFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif`;
const FOG_FRAGMENT_PARS = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${ATM_GLSL}
  const float ATM_K0 = 1.0 / 400.0;   // the clear-air density that fogDensity is measured against
  const float ATM_MIST = 0.0030;      // valley mist: extinction per metre at the valley floor
  const float ATM_MIST_H = 30.0;      // ... falling to 1/e at this height above it
  vec3 atmFogColor(vec3 dir, float f, vec3 tint, float murk) {
    vec3 haze = atmHazeB(dir, tint, murk);
    float mu = max(dot(dir, ATM_SUN), 0.0);
    haze *= 1.0 + 1.4 * pow(mu, 6.0) * f;   // looking into the sun the haze glows
    #ifdef TONE_MAPPING
      haze = toneMapping( haze );
    #endif
    return haze;
  }
  vec3 atmFog(vec3 color, vec3 ray, float k) {
    // the biome's haze: fogColor carries the horizon tint and fogNear the murk (a linear Fog is used for nothing else; the meadow's are 1,1,1 and 0)
    #ifdef FOG_EXP2
      vec3 tint = vec3(1.0); float murk = 0.0;
    #else
      vec3 tint = fogColor; float murk = fogNear;
    #endif
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-3);
    float t = dist * k;
    float tau = t * t;
    float h0 = max(cameraPosition.y, -30.0);
    float h1 = max(cameraPosition.y + ray.y, -30.0);
    float dy = h1 - h0;
    float la = exp(-h0 / ATM_MIST_H), lb = exp(-h1 / ATM_MIST_H);
    float mist = abs(dy) > 0.02 ? (la - lb) * ATM_MIST_H / dy : la;
    tau += ATM_MIST * (1.0 + 2.5 * murk) * (k / ATM_K0) * dist * mist * smoothstep(6.0, 110.0, dist);
    float f = 1.0 - exp(-tau);
    vec3 haze = atmFogColor(dir, f, tint, murk);
    #ifdef TONE_MAPPING
      // straight to the canvas: the object's colour is display-encoded already, so blend in linear light as the HDR path does
      vec3 lin = mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), color));
      return linearToOutputTexel( vec4( mix(lin, haze, f), 1.0 ) ).rgb;
    #else
      return mix(color, linearToOutputTexel( vec4( haze, 1.0 ) ).rgb, f);
    #endif
  }
#endif`;
const FOG_FRAGMENT = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    gl_FragColor.rgb = atmFog( gl_FragColor.rgb, vFogRay, fogDensity );
  #else
    gl_FragColor.rgb = atmFog( gl_FragColor.rgb, vFogRay, 1.0 / max( fogFar, 1.0 ) );
  #endif
#endif`;

// ---------------------------------------------------------------------------------------------------------------------------
// Sun shadows: two cascades (two shadow-casting directional lights that shadows.js keeps in step: the first is the near map, the
// second the far one) looked up together, with a soft filter, a blend between the maps and a fade at the edge of the far map. The
// per-light shadow uniforms three.js already ships to every material carry the settings, so a quality change needs no recompile:
//   light 0 shadowRadius = taps * 16 + filter radius in texels      light 1 shadowRadius = filter radius in texels
const SHADOW_PARS = `
  #if NUM_DIR_LIGHT_SHADOWS > 1
  float atmIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float atmTaps(sampler2D map, vec3 uvz, vec2 mapSize, float taps, float radius, vec2 rs) {
    float sum = 0.0;
    vec2 texel = vec2(radius) / mapSize;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= taps) break;
      float r = sqrt((float(i) + 0.5) / taps);
      float a = float(i) * 2.399963;
      vec2 o = vec2(cos(a), sin(a)) * r;
      o = vec2(o.x * rs.x - o.y * rs.y, o.x * rs.y + o.y * rs.x);
      sum += step(uvz.z, unpackRGBAToDepth(texture2D(map, uvz.xy + o * texel)));
    }
    return sum / taps;
  }
  float atmSunShadow() {
    vec3 n0 = vDirectionalShadowCoord[0].xyz / vDirectionalShadowCoord[0].w;
    vec3 n1 = vDirectionalShadowCoord[1].xyz / vDirectionalShadowCoord[1].w;
    float p0 = directionalLightShadows[0].shadowRadius;
    float taps = clamp(floor(p0 / 16.0), 1.0, 16.0);
    float rad0 = p0 - taps * 16.0;
    float rad1 = directionalLightShadows[1].shadowRadius;
    float rot = 6.2831853 * atmIgn(gl_FragCoord.xy);
    vec2 rs = vec2(cos(rot), sin(rot));
    float e0 = min(min(n0.x, 1.0 - n0.x), min(n0.y, 1.0 - n0.y));
    float w0 = (n0.z > 1.0) ? 0.0 : smoothstep(0.0, 0.10, e0);
    if (w0 >= 1.0) {
      n0.z += directionalLightShadows[0].shadowBias;
      return atmTaps(directionalShadowMap[0], n0, directionalLightShadows[0].shadowMapSize, taps, rad0, rs);
    }
    float e1 = min(min(n1.x, 1.0 - n1.x), min(n1.y, 1.0 - n1.y));
    float w1 = (n1.z > 1.0) ? 0.0 : smoothstep(0.0, 0.10, e1);
    float sf = 1.0;
    if (w1 > 0.0) {
      n1.z += directionalLightShadows[1].shadowBias;
      sf = mix(1.0, atmTaps(directionalShadowMap[1], n1, directionalLightShadows[1].shadowMapSize, taps, rad1, rs), w1);
    }
    if (w0 <= 0.0) return sf;
    n0.z += directionalLightShadows[0].shadowBias;
    return mix(sf, atmTaps(directionalShadowMap[0], n0, directionalLightShadows[0].shadowMapSize, taps, rad0, rs), w0);
  }
  #endif`;

export let cascadesPatched = false;
let installed = false;
export function installShaderChunks() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = FOG_VERTEX_PARS;
  C.fog_vertex = FOG_VERTEX;
  C.fog_pars_fragment = FOG_FRAGMENT_PARS;
  C.fog_fragment = FOG_FRAGMENT;

  // the tone curve behind THREE.CustomToneMapping
  const custom = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (C.tonemapping_pars_fragment.includes(custom)) {
    C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(custom, `${NEUTRAL_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return atmNeutral( color * toneMappingExposure ); }`);
  } else console.warn('atmosphere: the tone mapping chunk changed; the custom curve is not installed');

  // cascaded sun shadows: the lookup, and the directional loop that uses it
  const pars = C.shadowmap_pars_fragment;
  const end = pars.lastIndexOf('#endif');
  const light = C.lights_fragment_begin;
  const getLine = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  const directLine = /(#pragma unroll_loop_start\s+for \( int i = 0; i < NUM_DIR_LIGHTS; i \+\+ \) \{[\s\S]*?)(\t\tRE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/;
  if (end > 0 && light.includes(getLine) && directLine.test(light)) {
    C.shadowmap_pars_fragment = pars.slice(0, end) + SHADOW_PARS + '\n' + pars.slice(end);
    let patched = light.replace(getLine, `#if ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? atmSunShadow() : 1.0;
\t\t#else
\t\t${getLine}
\t\t#endif`);
    // the second cascade is only a shadow map: it adds no light of its own
    patched = patched.replace(directLine, (m, head, call) => `${head}\t\t#if ( UNROLLED_LOOP_INDEX == 1 ) && ( NUM_DIR_LIGHT_SHADOWS > 1 )\n\t\t#else\n${call}\n\t\t#endif`);
    C.lights_fragment_begin = patched;
    cascadesPatched = true;
  } else console.warn('atmosphere: the shadow chunks changed; the sun uses a single plain shadow map');

  // its specular half is a second cube-map lookup (up to eight texture reads). On a rough surface that is the same blurred
  // sky the diffuse half has just read, so there it is reused (smooth surfaces, steel and armour, keep their own reflection)
  const radianceLine = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  if (C.lights_fragment_maps.includes(radianceLine)) {
    C.lights_fragment_maps = C.lights_fragment_maps.replace(radianceLine, `if ( material.roughness > 0.85 ) radiance += iblIrradiance * RECIPROCAL_PI; else ${radianceLine}`);
  } else console.warn('atmosphere: the environment-map chunk changed; rough surfaces read the sky twice');
}
installShaderChunks();

// ---------------------------------------------------------------------------------------------------------------------------
// The sky dome: one full-screen triangle drawn after the opaque objects (so the cloud shader only runs where the sky shows), at the
// far plane. Clouds are a thin layer projected on a plane high above: fbm from a baked noise texture, lit from the sun side (the
// density toward the sun darkens the belly), a silver lining where the cloud thins out near the sun, and a high streaky layer.
// seamless value noise on a size x size grid with fx x fy lattice cells (so the texture repeats without a seam)
function periodicNoise(size, fx, fy, seed) {
  const g = new Float32Array(fx * fy);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; }
  const out = new Float32Array(size * size);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < size; y++) {
    const v = (y / size) * fy, y0 = Math.floor(v), ty = fade(v - y0), ya = y0 % fy, yb = (y0 + 1) % fy;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * fx, x0 = Math.floor(u), tx = fade(u - x0), xa = x0 % fx, xb = (x0 + 1) % fx;
      const a = g[ya * fx + xa], b = g[ya * fx + xb], c = g[yb * fx + xa], d = g[yb * fx + xb];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}
let noiseTexture = null;
// four baked fbm channels (r, g, b: cloud shapes from big to fine; a: the streaks of the high layer) in one repeating texture
function cloudNoise() {
  if (noiseTexture) return noiseTexture;
  const N = 256;
  const fbm = (cells, seed, gain = 0.5) => {
    const acc = new Float32Array(N * N);
    let amp = 1, tot = 0;
    cells.forEach(([fx, fy], i) => {
      const o = periodicNoise(N, fx, fy, seed + i * 7919);
      for (let k = 0; k < acc.length; k++) acc[k] += o[k] * amp;
      tot += amp; amp *= gain;
    });
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < acc.length; k++) { acc[k] /= tot; lo = Math.min(lo, acc[k]); hi = Math.max(hi, acc[k]); }
    for (let k = 0; k < acc.length; k++) acc[k] = (acc[k] - lo) / (hi - lo);
    return acc;
  };
  const sq = (f) => [f, f];
  const r = fbm([3, 6, 12, 24, 48].map(sq), 11), g = fbm([7, 14, 28, 56].map(sq), 23), b = fbm([19, 38, 76].map(sq), 37);
  const a = fbm([[3, 24], [6, 48], [12, 96]], 71, 0.6);
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = Math.round(r[k] * 255);
    data[k * 4 + 1] = Math.round(g[k] * 255);
    data[k * 4 + 2] = Math.round(b[k] * 255);
    data[k * 4 + 3] = Math.round(a[k] * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  noiseTexture = tex;
  return tex;
}

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0);
    vec4 v = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
    vDir = (vec4(v.xyz / v.w, 0.0) * viewMatrix).xyz;
  }`;

const SKY_FRAGMENT = `
  uniform sampler2D tNoise;
  uniform float uTime;
  uniform float uCover;
  uniform vec3 uTint;
  uniform float uMurk;
  varying vec3 vDir;
  ${ATM_GLSL}
  #if CLOUDS > 0
  // coverage 0..1 of the cumulus layer at plane position p (kilometres)
  float atmCumulus(vec2 p, int octaves) {
    vec2 w = vec2(uTime * 0.0035, uTime * 0.0012);
    float n = texture2D(tNoise, p * 0.115 + w).r * 0.56;
    n += texture2D(tNoise, p * 0.31 + w * 1.7 + 0.37).g * 0.30;
    if (octaves > 2) n += texture2D(tNoise, p * 0.93 + w * 2.6 + 0.71).b * 0.14;
    else n += 0.07;
    return n;
  }
  #endif
  void main() {
    vec3 d = normalize(vDir);
    float mu = dot(d, ATM_SUN);
    vec3 col = atmHazeB(d, uTint, uMurk);
    #ifdef ENV
      // environment map for the reflections and the ambient light: no sun disc, no clouds; the ground bounces warm light back up
      vec3 ground = atmSrgb(vec3(0.42, 0.40, 0.30)) * 0.42;
      col = mix(col, ground, smoothstep(0.02, -0.12, d.y));
    #else
      float vis = 1.0;
      #if CLOUDS > 0
      if (d.y > 0.0) {
        float fade = smoothstep(0.015, 0.20, d.y);
        float inv = 1.0 / (d.y + 0.045);
        // low cumulus
        vec2 p = d.xz * inv * 1.55;
        float n = atmCumulus(p, CLOUDS + 1);
        float cov = mix(0.58, 0.42, uCover);
        float dens = smoothstep(cov, cov + 0.22, n);
        if (dens > 0.001) {
          // density a little way toward the sun: if it is denser there, this spot lies in shadow
          vec2 toSun = normalize(ATM_SUN.xz) * 0.16;
          float ns = atmCumulus(p + toSun * 1.0, 2);
          float densSun = smoothstep(cov, cov + 0.22, ns);
          float shade = clamp(0.62 + (dens - densSun) * 1.9 - dens * 0.34, 0.0, 1.0);
          vec3 belly = mix(atmSrgb(vec3(0.46, 0.52, 0.64)), atmHaze(vec3(0.0, 0.6, 0.8)) * 0.9, 0.35) * 0.80;
          vec3 top = ATM_SUN_TINT * 1.45 + vec3(0.12, 0.13, 0.15);
          vec3 cc = mix(belly, top, shade);
          // an overcast biome (uMurk): the clouds are the grey of its haze, lit from within, with no sunlit edges
          vec3 grey = atmHazeB(vec3(0.0, 0.35, 0.94), uTint, uMurk);
          cc = mix(cc, mix(grey * 0.62, grey * 1.04, shade), uMurk);
          // silver lining: thin edges near the sun glow
          cc += ATM_SUN_TINT * 1.6 * pow(max(mu, 0.0), 10.0) * (1.0 - dens) * smoothstep(0.0, 0.35, dens) * (1.0 - uMurk);
          float a = smoothstep(0.0, 0.55, dens) * fade;
          col = mix(col, cc, a);
          vis *= 1.0 - a;
        }
        #if CLOUDS > 1
        // high thin streaks
        vec2 q = d.xz * (1.0 / (d.y + 0.10)) * 0.55;
        float sn = texture2D(tNoise, q * vec2(0.11, 0.045) + vec2(uTime * 0.0016, 0.3)).a;
        float cirrus = smoothstep(0.50, 0.92, sn) * smoothstep(0.02, 0.28, d.y) * 0.38 * (1.0 - uMurk);
        vec3 cc2 = mix(vec3(1.0, 0.95, 0.90) * 0.95, ATM_SUN_TINT * 1.3, pow(max(mu, 0.0), 4.0));
        col = mix(col, cc2, cirrus);
        vis *= 1.0 - cirrus * 0.7;
        #endif
      }
      #endif
      // the sun: a hard disc with a little glow, hidden by cloud in front of it
      float disc = smoothstep(0.99985, 0.99994, mu);
      col += ATM_SUN_TINT * (disc * 34.0 + pow(max(mu, 0.0), 2000.0) * 5.0) * vis * smoothstep(-0.02, 0.03, d.y);
      // below the horizon: haze fading to a darker tone (the far edge of the world seen past the ground)
      col = mix(col, atmHazeB(vec3(d.x, 0.0, d.z), uTint, uMurk) * 0.70, smoothstep(0.0, -0.20, d.y));
    #endif
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

let skyGeometry = null;
function fullScreenTriangle() {
  if (skyGeometry) return skyGeometry;
  skyGeometry = new THREE.BufferGeometry();
  skyGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return skyGeometry;
}

function skyMaterial(env) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { tNoise: { value: null }, uTime: { value: 0 }, uCover: { value: 0.5 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uMurk: { value: 0 } },
    defines: { CLOUDS: Q.clouds },
    depthWrite: false,
    fog: false,
  });
  if (env) mat.defines.ENV = '';
  mat.uniforms.tNoise.value = cloudNoise();
  return mat;
}

// The environment map is the same for every world (the sky never changes), so it is built once for the page and shared; it is never
// disposed with a world (see resources.js). The first build also fits the sky's diffuse light (skylight.js) and writes it into the light
// chunks, which must happen before any lit material compiles: createAtmosphere runs when a world is made, before its first frame.
let sharedEnv = null;
function sharedEnvironment(renderer) {
  if (sharedEnv) return sharedEnv;
  const envScene = new THREE.Scene();
  const envMat = skyMaterial(true);
  envMat.defines.CLOUDS = 0;
  envScene.add(new THREE.Mesh(fullScreenTriangle(), envMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnv = pmrem.fromScene(envScene, 0.02);
  sharedEnv.texture.userData.shared = true;
  envMat.dispose();
  pmrem.dispose();
  const glsl = skyLightGLSL(renderer, sharedEnv.texture);
  const C = THREE.ShaderChunk;
  const lookupLine = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
  if (glsl && C.lights_fragment_maps.includes(lookupLine) && C.envmap_physical_pars_fragment.includes('getIBLIrradiance')) {
    C.envmap_physical_pars_fragment += glsl;
    C.lights_fragment_maps = C.lights_fragment_maps.replace(lookupLine, 'iblIrradiance += atmSkyE( inverseTransformDirection( geometryNormal, viewMatrix ) ) * envMapIntensity;');
  } else console.warn('atmosphere: the sky light stays a cube-map lookup per pixel (' + (glsl ? 'the light chunks changed' : 'no float render targets') + ')');
  return sharedEnv;
}

// Build the sky dome, the fog and the environment map for a scene. Returns the dome mesh (its `userData.atmosphere` has the per-frame update).
export function createAtmosphere(scene, renderer = null) {
  const air = active.def.air;
  const mat = skyMaterial(false);
  mat.uniforms.uCover.value = air.cover;
  mat.uniforms.uTint.value.set(air.tint[0], air.tint[1], air.tint[2]);
  mat.uniforms.uMurk.value = air.murk;
  const sky = new THREE.Mesh(fullScreenTriangle(), mat);
  sky.frustumCulled = false;
  sky.renderOrder = 1000;   // after every opaque object, before the transparent ones: early depth rejection keeps the clouds cheap
  sky.name = 'sky';
  scene.add(sky);

  // image-based lighting from the same sky, so steel and armour reflect it and shadows take the colour of the sky
  if (renderer) scene.environment = sharedEnvironment(renderer).texture;
  // The fog is a linear Fog only because it has two spare numbers: fog.color is the haze tint and fog.near the murk of the biome (biomes.js `air`); the
  // shader reads the reach from fog.far (see the fog chunk above)
  scene.fog = new THREE.Fog(0xffffff, air.murk, 400);
  // The renderer hands a fog colour to the shader display-encoded when the frame goes straight to the canvas (no post pass: Low) and as it is when it goes
  // to the HDR target. The shader wants the tint as it is, so for the canvas it is stored decoded (and 1, the meadow's, is 1 either way).
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  let direct = null;
  const setTint = () => {
    const t = air.tint, f = direct ? linear : (c) => c;
    scene.fog.color.setRGB(f(t[0]), f(t[1]), f(t[2]));
  };
  scene.background = null;

  const atm = {
    sky,
    time: 0,
    update(dt) {
      this.time += dt;
      mat.uniforms.uTime.value = this.time;
      const clouds = Q.clouds | 0;
      if (mat.defines.CLOUDS !== clouds) { mat.defines.CLOUDS = clouds; mat.needsUpdate = true; }
      scene.fog.far = 1 / ((1 / 400) * (1000 / Math.max(300, Q.viewDist)) * air.fog);
      if (direct !== !usesPost()) { direct = !usesPost(); setTint(); }
    },
  };
  atm.update(0);
  sky.userData.atmosphere = atm;
  scene.userData.atmosphere = atm;
  return sky;
}
