import sys
p = sys.argv[1]
s = open(p).read()
old_start = s.index("  // image-based light: its specular half is a second cube-map lookup")
old_end = s.index("installShaderChunks();\n", old_start)
new_block = '''  patchIbl(false);
}
installShaderChunks();

// ---------------------------------------------------------------------------------------------------------------------------
// Image-based light costs a lot per pixel: the diffuse half reads the blurred environment map (4 texture reads) and the specular half does
// it again at the surface's roughness (up to 8 more), in every pixel of every lit material. Both are changed here, in the chunk every
// material shares:
//   rough surfaces (most of the world: ground, stone, timber, cloth) reflect nothing sharp, so their specular half is the same smooth sky as the
//     diffuse half, and smooth ones (steel, armour) keep their lookup;
//   the diffuse half is a very smooth function of the direction, so once the sky is known (see skyProbe) it is taken from nine spherical-harmonic
//     coefficients, which three.js's own light probe shades with a few multiplications instead of texture reads. Until then (or where float
//     targets are not available) it falls back to the environment map.
const IBL_ORIGINAL = THREE.ShaderChunk.lights_fragment_maps;
export let iblProbe = false;
function patchIbl(probe) {
  const C = THREE.ShaderChunk, src = IBL_ORIGINAL;
  const radianceLine = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  const irradianceLine = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
  if (!src.includes(radianceLine) || !src.includes(irradianceLine)) { console.warn('atmosphere: the environment-map chunk changed; every surface reads the sky twice'); return; }
  const rough = probe ? 'getLightProbeIrradiance( lightProbe, geometryNormal ) * RECIPROCAL_PI' : 'iblIrradiance * RECIPROCAL_PI';
  let out = src.replace(radianceLine, `if ( material.roughness > 0.85 ) radiance += ${rough}; else ${radianceLine}`);
  if (probe) out = out.replace(irradianceLine, '/* the diffuse sky light comes from the light probe (atmosphere.js) */');
  C.lights_fragment_maps = out;
  iblProbe = probe;
}

// the sky's light as nine spherical-harmonic coefficients (of radiance: three.js convolves them with the cosine itself), worked out by
// drawing the environment scene into a small cube target and summing the texels; null when float targets cannot be read back
let probeCache = null;
function skyProbe(renderer, envScene) {
  if (probeCache) return probeCache;
  if (!renderer.extensions.has('EXT_color_buffer_float')) return null;
  const N = 24;
  const rt = new THREE.WebGLCubeRenderTarget(N, { type: THREE.FloatType, format: THREE.RGBAFormat, generateMipmaps: false, depthBuffer: false });
  try {
    new THREE.CubeCamera(0.1, 10, rt).update(renderer, envScene);
    // forward and up of the six cube cameras (px nx py ny pz nz), as three.js orients them
    const axes = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
    const buf = new Float32Array(N * N * 4), sh = new Float32Array(27);
    for (let face = 0; face < 6; face++) {
      renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf, face);
      const [f, u] = axes[face];
      const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];   // right = forward x up
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const s = (i + 0.5) / N * 2 - 1, t = (j + 0.5) / N * 2 - 1;
        let x = f[0] + s * r[0] + t * u[0], y = f[1] + s * r[1] + t * u[1], z = f[2] + s * r[2] + t * u[2];
        const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
        const w = (2 / N) * (2 / N) / Math.pow(1 + s * s + t * t, 1.5);   // the solid angle of the texel
        const basis = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
        const o = (j * N + i) * 4;
        if (!(buf[o] >= 0 && buf[o] < 1e4)) continue;   // (a failed read-back: leave the texel out)
        for (let k = 0; k < 9; k++) { const bw = basis[k] * w; sh[k * 3] += buf[o] * bw; sh[k * 3 + 1] += buf[o + 1] * bw; sh[k * 3 + 2] += buf[o + 2] * bw; }
      }
    }
    // a black or broken read-back shows as a vanishing first coefficient
    if (!(sh[0] + sh[1] + sh[2] > 0.05)) return null;
    probeCache = sh;
    return sh;
  } catch (e) {
    return null;
  } finally {
    rt.dispose();
  }
}

'''
s = s[:old_start] + new_block + s[old_end + len("installShaderChunks();\n"):]
open(p, 'w').write(s)
print('ok')
