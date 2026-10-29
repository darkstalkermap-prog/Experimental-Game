// Release one world's GPU resources without invalidating application-wide caches.
export function disposeWorld(scene, shared = [], extra = []) {
  const collect = (values) => {
    const resources = new Set();
    const visit = (value) => {
      if (!value || resources.has(value)) return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (value.isTexture || value.isBufferGeometry) resources.add(value);
      else if (value.isMaterial) {
        resources.add(value);
        Object.values(value).filter((v) => v && v.isTexture).forEach(visit);
        for (const uniform of Object.values(value.uniforms || {})) visit(uniform.value);
      }
    };
    values.forEach(visit);
    return resources;
  };
  const preserved = collect(shared);
  const owned = [...extra];
  scene.traverse((object) => {
    owned.push(object.geometry, object.material);
    // InstancedMesh has separate instance buffers; geometries/materials are handled below.
    if (object.isInstancedMesh) object.dispose();
    if (object.shadow) object.shadow.dispose();
  });
  const environmentTarget = scene.userData.environmentTarget;
  if (environmentTarget) environmentTarget.dispose();
  else if (!(scene.environment && scene.environment.userData.shared)) owned.push(scene.environment);   // (the sky's map is shared by every world)
  owned.push(scene.background);
  for (const resource of collect(owned)) if (!preserved.has(resource)) resource.dispose();
  scene.environment = null;
  scene.background = null;
  delete scene.userData.environmentTarget;
  scene.clear();
}
