// The light of the sky, as a lookup table instead of a per-pixel cube-map walk.
//
// three.js lights every standard material from a PMREM environment map: a cube-UV atlas that each pixel reads with face selection, a
// mip blend and (for smooth surfaces) a second read, plus the multi-scattering terms of the GGX fit. Our sky is analytic and always the
// same: its radiance depends on only two numbers, the height of the direction (y) and its angle to the sun (mu), and so does every
// blur of it (the sky is mirror-symmetric about the plane through the up axis and the sun). So the whole filtered sky fits in one tiny
// 2D table, SL_W x SL_H texels per band, one band per roughness step stacked along v: band k (0..15) is the sky as a surface of
// roughness k / 15 sees it, and band 15, the roughest, is the diffuse light too.
// The table is baked once on the GPU from the PMREM map itself (so it is the same picture the old lookups produced) and then takes the
// place of that map in `scene.environment`: every program keeps the stock envMap uniform, only the GLSL that reads it changes.
// Coordinates: u = sin(angle to the sun / 2), v = 0.5 + 0.5 * sign(y) * sqrt(|y|), both warped to give texels where the sky changes fast
// (the sun's glow, the horizon).
import * as THREE from 'three';

export const SL_W = 64;
export const SL_H = 64;
export const SL_ROUGH_BANDS = 15;   // band k holds roughness k / 15 (band 0 the smallest roughness the shader uses, 0.05)
export const SL_BANDS = 16;         // 16 * 64 = 1024 rows: three.js reads a cube-UV map's size as a power of two (it builds GLSL constants from it)

const f6 = (v) => v.toFixed(6);

// GLSL shared by the lookups: the table's coordinates and one filtered read
const sunConst = (sun) => `const vec3 SL_SUN = vec3(${f6(sun.x)}, ${f6(sun.y)}, ${f6(sun.z)});`;
const consts = `const float SL_W = ${SL_W}.0; const float SL_H = ${SL_H}.0; const float SL_HT = ${SL_H * SL_BANDS}.0;`;

const lookup = (sun) => `
${sunConst(sun)}
${consts}
vec2 slCoord( const in vec3 w ) {
  return vec2( sqrt( max( 0.5 - 0.5 * dot( w, SL_SUN ), 0.0 ) ), 0.5 + 0.5 * sign( w.y ) * sqrt( abs( w.y ) ) );
}
vec3 slFetch( const in vec2 c, const in float band ) {
  return texture2DLodEXT( envMap, vec2( ( c.x * ( SL_W - 1.0 ) + 0.5 ) / SL_W, ( band * SL_H + c.y * ( SL_H - 1.0 ) + 0.5 ) / SL_HT ), 0.0 ).rgb;
}
// the sky as seen by a surface of this roughness (two reads, blended)
vec3 slSky( const in vec3 w, const in float roughness ) {
  vec2 c = slCoord( w );
  float b = clamp( roughness, 0.05, 1.0 ) * ${SL_ROUGH_BANDS}.0;
  float b0 = min( floor( b ), ${SL_ROUGH_BANDS - 1}.0 );
  return mix( slFetch( c, b0 ), slFetch( c, b0 + 1.0 ), b - b0 );
}
`;

// the stock chunks, with the lookups swapped for ours. Returns false (and says why) if three.js changed under us.
export function installSkyLightChunks(C, sun) {
  const envPars = `#ifdef USE_ENVMAP
${lookup(sun)}
  vec3 getIBLIrradiance( const in vec3 normal ) {
    return PI * slFetch( slCoord( ( vec4( normal, 0.0 ) * viewMatrix ).xyz ), ${SL_ROUGH_BANDS}.0 ) * envMapIntensity;
  }
  vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
    vec3 reflectVec = reflect( - viewDir, normal );
    reflectVec = normalize( mix( reflectVec, normal, roughness * roughness ) );
    return slSky( ( vec4( reflectVec, 0.0 ) * viewMatrix ).xyz, roughness ) * envMapIntensity;
  }
#endif`;
  // Rough dielectrics (earth, stone, timber, cloth) get what the full terms add up to for them: the diffuse colour a touch dimmer and
  // a faint colourless sheen, both times the one blurred sky they already read; no second lookup, no DFG fit, no multi-scattering.
  // Metals and smooth surfaces keep the whole path (slSmooth tells them apart).
  const radianceLine = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  const scatterLine = '\tvec3 singleScattering = vec3( 0.0 );';
  const specularHead = 'void RE_IndirectSpecular_Physical(';
  const maps = C.lights_fragment_maps, pars = C.lights_physical_pars_fragment, env = C.envmap_physical_pars_fragment;
  if (!(env.includes('getIBLIrradiance') && env.includes('getIBLRadiance') && maps.includes(radianceLine) && pars.includes(scatterLine) && pars.includes(specularHead))) {
    console.warn('skylight: the environment-map or light chunks changed; the stock lookups stay');
    return false;
  }
  C.envmap_physical_pars_fragment = envPars;
  C.lights_fragment_maps = maps.replace(radianceLine, `if ( slSmooth( material ) ) ${radianceLine}`);
  C.lights_physical_pars_fragment = pars
    .replace(scatterLine, `\t#if ! defined( USE_CLEARCOAT ) && ! defined( USE_SHEEN ) && ! defined( USE_IRIDESCENCE )
\tif ( ! slSmooth( material ) ) {
\t\treflectedLight.indirectDiffuse += irradiance * RECIPROCAL_PI * ( material.diffuseColor * 0.98 + material.specularColor * ( 0.41 + 0.8 * ( 1.0 - material.roughness ) ) );
\t\treturn;
\t}
\t#endif
${scatterLine}`)
    // the test, defined after the material struct and before its first use
    .replace(specularHead, `bool slSmooth( const in PhysicalMaterial material ) { return material.roughness < ${SL_ROUGH_LIMIT} || material.specularColor.g > 0.1; }
${specularHead}`);
  return true;
}

// roughness above which a non-metal takes the shortcut
const SL_ROUGH_LIMIT = '0.7';

// the cube-UV lookup of the PMREM map, for the bake only (this module reads it before installSkyLightChunks changes anything it needs)
export function bakeSkyLight(renderer, pmremTarget, sun) {
  const cubeUV = THREE.ShaderChunk.cube_uv_reflection_fragment;
  const height = pmremTarget.height;
  const maxMip = Math.log2(height) - 2;
  const mat = new THREE.ShaderMaterial({
    defines: {
      ENVMAP_TYPE_CUBE_UV: '', CUBEUV_MAX_MIP: maxMip.toFixed(1), CUBEUV_TEXEL_HEIGHT: (1 / height).toFixed(10),
      CUBEUV_TEXEL_WIDTH: (1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16))).toFixed(10),
    },
    uniforms: { tSky: { value: pmremTarget.texture } },
    vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `
      uniform sampler2D tSky;
      ${cubeUV}
      ${sunConst(sun)}
      ${consts}
      void main() {
        vec2 px = gl_FragCoord.xy;
        float band = floor( px.y / SL_H );
        vec2 t = vec2( ( px.x - 0.5 ) / ( SL_W - 1.0 ), ( px.y - band * SL_H - 0.5 ) / ( SL_H - 1.0 ) );
        // a direction with this height and this angle to the sun (the sky is the same on both sides of the plane through up and the sun)
        float mu = 1.0 - 2.0 * t.x * t.x;
        float yw = t.y * 2.0 - 1.0;
        float y = sign( yw ) * yw * yw;
        float sh = sqrt( 1.0 - SL_SUN.y * SL_SUN.y );
        vec3 a = vec3( SL_SUN.x, 0.0, SL_SUN.z ) / sh;
        vec3 b = vec3( - SL_SUN.z, 0.0, SL_SUN.x ) / sh;
        float rho = sqrt( max( 1.0 - y * y, 0.0 ) );
        float p = clamp( ( mu - y * SL_SUN.y ) / sh, - rho, rho );
        vec3 d = vec3( 0.0, y, 0.0 ) + p * a + sqrt( max( rho * rho - p * p, 0.0 ) ) * b;
        gl_FragColor = vec4( textureCubeUV( tSky, d, max( band / ${SL_ROUGH_BANDS}.0, 0.05 ) ).rgb, 1.0 );
      }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, fog: false, toneMapped: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const target = new THREE.WebGLRenderTarget(SL_W, SL_H * SL_BANDS, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: false, colorSpace: THREE.LinearSRGBColorSpace,
  });
  target.texture.mapping = THREE.CubeUVReflectionMapping;   // so that three.js hands it to the shaders as an environment map as it is
  target.texture.name = 'skylight';
  const prev = renderer.getRenderTarget(), autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(target);
  renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(prev);
  renderer.autoClear = autoClear;
  geo.dispose();
  mat.dispose();
  return target;
}
