// Several modules add to the shader of the same built-in material (per-instance colours, wind, cloth sway, ...), but three.js keeps only
// one onBeforeCompile per material, so a second module that assigns it would silently undo the first. Everybody goes through here instead:
//   patchMaterial(material, 'wind', (shader, renderer) => { shader.uniforms.time = ...; shader.vertexShader = ...; });
// The hooks of one material run in the order they were added, and the material is given a program cache key built from their names, so
// materials with different sets of hooks never share a compiled program. Adding a key twice replaces the earlier function.
// A key stands for the shader CODE it adds: two materials may use the same key only if the GLSL they get is identical (vary the look
// with uniforms, or put the variation in the key, e.g. 'sway:2'), otherwise three.js would give the second one the first one's program.
// (Fog and other effects meant for every material are better patched once into THREE.ShaderChunk than hooked one material at a time.)
export function patchMaterial(material, key, fn) {
  const hooks = material.userData.shaderHooks || (material.userData.shaderHooks = new Map());
  const first = hooks.size === 0;
  hooks.set(key, fn);
  if (first) {
    const earlier = material.onBeforeCompile;   // (a hook assigned the old way keeps working: it runs first)
    const hasEarlier = earlier && earlier !== Object.getPrototypeOf(material).onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (hasEarlier) earlier.call(material, shader, renderer);
      for (const f of hooks.values()) f(shader, renderer);
    };
    const baseKey = material.customProgramCacheKey;
    material.customProgramCacheKey = () => `${baseKey ? baseKey.call(material) : ''}|${[...hooks.keys()].join(',')}`;
  }
  material.needsUpdate = true;
  return material;
}
