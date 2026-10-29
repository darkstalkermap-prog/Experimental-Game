// The diffuse light of the sky as a short polynomial in the surface normal instead of a texture lookup.
//
// three.js lights every standard material from a PMREM environment map; its diffuse half is one read of that map per pixel at its roughest
// level (a cube-UV atlas: face selection, mip arithmetic, an explicit-gradient fetch), about a tenth of a frame by itself. That light is one
// very smooth function of the normal, and eleven numbers per colour carry it: the stock lookup is sampled ONCE over the sphere (the sky is
// analytic and never changes), fitted by least squares with the nine spherical harmonics of bands 0-2 plus the two next zonal terms (the
// horizon step between sky and ground needs them: bands 0-2 alone are 15 % off on faces that look down), and the coefficients are written
// into the shaders as constants. A pixel then evaluates ~30 arithmetic operations and reads no texture. The fit follows whatever the sky and
// the filter are: nothing here knows about the sky itself, and atmosphere.js feeds the result into `iblIrradiance`, the variable the lookup fed,
// so the energy-conserving diffuse term and the multi-scattering terms downstream are untouched.
import * as THREE from 'three';

const SAMPLES = 1024;   // directions of the fit (a golden-angle spiral: even over the sphere)

const VERT = 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
// pixel k of a SAMPLES x 1 target holds PI * lookup(n_k), exactly what getIBLIrradiance returned for a surface facing n_k
const FRAG = `
  #include <common>
  #include <cube_uv_reflection_fragment>
  uniform sampler2D envMap;
  void main() {
    float k = floor( gl_FragCoord.x );
    float y = 1.0 - 2.0 * ( k + 0.5 ) / ${SAMPLES}.0;
    float r = sqrt( max( 0.0, 1.0 - y * y ) );
    float phi = 2.399963229728653 * ( k + 0.5 );
    gl_FragColor = vec4( PI * textureCubeUV( envMap, vec3( r * cos( phi ), y, r * sin( phi ) ), 1.0 ).rgb, 1.0 );
  }`;

// the eleven basis functions of a unit direction: bands 0-2 in three.js's order, then the zonal Legendre terms P3 and P4 of y
const basis = (x, y, z) => [
  0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z,
  0.546274 * (x * x - y * y), 0.5 * y * (5 * y * y - 3), 0.125 * (y * y * (35 * y * y - 30) + 3),
];

// solve A x = b in place (Gaussian elimination with pivoting)
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let q = i; q < n; q++) A[r][q] -= f * A[i][q];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let q = i + 1; q < n; q++) s -= A[i][q] * x[q];
    x[i] = s / A[i][i];
  }
  return x;
}

let cached;   // the GLSL, or null when the bake is not possible; the sky is the same in every world, so it is built once

// -> GLSL that defines `vec3 atmSkyE(vec3 worldNormal)` (the irradiance PI * lookup(n)), or null where the bake is not possible
// (no float render targets): the caller then keeps the cube-map lookup
export function skyLightGLSL(renderer, env) {
  if (cached === undefined) {
    try { cached = bake(renderer, env); } catch (e) { cached = null; }
  }
  return cached;
}

function bake(renderer, env) {
  const h = env && env.image && env.image.height;
  if (!h || !renderer.extensions.has('EXT_color_buffer_float')) return null;
  const maxMip = Math.log2(h) - 2;
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { envMap: { value: env } },
    defines: {   // (what the stock programs derive from the map's size, see WebGLProgram.js)
      ENVMAP_TYPE_CUBE_UV: '',
      CUBEUV_TEXEL_WIDTH: String(1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16))),
      CUBEUV_TEXEL_HEIGHT: String(1 / h),
      CUBEUV_MAX_MIP: maxMip + '.0',
    },
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const target = new THREE.WebGLRenderTarget(SAMPLES, 1, {
    type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
  });
  const px = new Float32Array(SAMPLES * 4);
  const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear;
  let ok = true;
  try {
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.render(scene, new THREE.Camera());
    renderer.readRenderTargetPixels(target, 0, 0, SAMPLES, 1, px);
  } catch (e) { ok = false; }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;
  target.dispose(); material.dispose(); geometry.dispose();
  if (!ok || px.some((v) => !Number.isFinite(v))) return null;

  // least squares, one fit per colour channel
  const nb = basis(0, 0, 1).length;
  const AtA = Array.from({ length: nb }, () => new Array(nb).fill(0));
  const Atb = [0, 1, 2].map(() => new Array(nb).fill(0));
  for (let k = 0; k < SAMPLES; k++) {
    const y = 1 - 2 * (k + 0.5) / SAMPLES, r = Math.sqrt(Math.max(0, 1 - y * y)), phi = 2.399963229728653 * (k + 0.5);
    const B = basis(r * Math.cos(phi), y, r * Math.sin(phi));
    for (let i = 0; i < nb; i++) {
      for (let j = 0; j < nb; j++) AtA[i][j] += B[i] * B[j];
      for (let q = 0; q < 3; q++) Atb[q][i] += B[i] * px[k * 4 + q];
    }
  }
  const fit = Atb.map((b) => solve(AtA.map((row) => row.slice()), b.slice()));   // [r, g, b], each nb coefficients
  if (fit.some((c) => c.some((v) => !Number.isFinite(v)))) return null;

  // fold each basis function's own factor into its coefficient: what is left is a plain polynomial
  const K = (i) => {
    const f = [0.282095, 0.488603, 0.488603, 0.488603, 1.092548, 1.092548, 0.315392, 1.092548, 0.546274, 0.5, 0.125][i];
    return 'vec3( ' + [0, 1, 2].map((q) => (fit[q][i] * f).toFixed(5)).join(', ') + ' )';
  };
  return `
#ifdef USE_ENVMAP
  // the sky's diffuse light for a world-space normal (fitted to the environment map by skylight.js)
  vec3 atmSkyE( const in vec3 w ) {
    float x = w.x, y = w.y, z = w.z;
    vec3 e = ${K(0)} + ${K(1)} * y + ${K(2)} * z + ${K(3)} * x
      + ${K(4)} * ( x * y ) + ${K(5)} * ( y * z ) + ${K(6)} * ( 3.0 * z * z - 1.0 ) + ${K(7)} * ( x * z ) + ${K(8)} * ( x * x - y * y )
      + ${K(9)} * ( y * ( 5.0 * y * y - 3.0 ) ) + ${K(10)} * ( y * y * ( 35.0 * y * y - 30.0 ) + 3.0 );
    return max( e, vec3( 0.0 ) );
  }
#endif`;
}
