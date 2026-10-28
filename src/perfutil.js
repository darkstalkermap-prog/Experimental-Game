// Small helpers for keeping the scene and the frame cheap. Nothing here runs unless a module calls it.
//
//   freezeStatic(root)   a static object (a castle wall, a rock, the hill marker): compute its matrices once, then stop three.js
//                        from recomputing them (and from walking its children) every frame. Call it AFTER the object and
//                        everything below it has been positioned; to move it later call thawStatic(root) first.
//   sceneAudit(scene)    what is in the scene and what it costs: objects whose matrices are rebuilt every frame, objects that
//                        are never culled, transparent and shadow-casting meshes... per top-level child, so it shows who owns them.
//   probe                begin/end timers that show up in the profiler overlay (backquote) when it is on. Costs one boolean
//                        test when off:  if (probe.on) probe.begin('crowd');  ...  if (probe.on) probe.end();
export const probe = { on: false, begin() {}, end() {} };

// Static objects: world matrices are computed once; matrixAutoUpdate=false stops the local-matrix rebuild and
// matrixWorldAutoUpdate=false stops Object3D.updateMatrixWorld from even descending into the subtree each frame.
// (A frozen subtree is still refreshed when a parent forces it, so a frozen child of a moving group still follows it.)
export function freezeStatic(root, { deep = true } = {}) {
  root.updateMatrixWorld(true);
  const freeze = (o) => { o.matrixAutoUpdate = false; o.matrixWorldNeedsUpdate = false; };
  if (deep) root.traverse(freeze); else freeze(root);
  root.matrixWorldAutoUpdate = false;
  return root;
}

// Undo freezeStatic (before moving, scaling or re-parenting the object).
export function thawStatic(root) {
  root.traverse((o) => { o.matrixAutoUpdate = true; o.matrixWorldAutoUpdate = true; o.matrixWorldNeedsUpdate = true; });
  return root;
}

// Objects under `root` whose local matrix three.js rebuilds every frame (matrixAutoUpdate) and whose descendants it then re-multiplies.
export function countAutoMatrices(root) {
  let n = 0;
  root.traverse((o) => { if (o.matrixAutoUpdate) n++; });
  return n;
}

// A report on the scene, one row per top-level child (and a total). Meant for the console:  console.table(__perf.audit())
export function sceneAudit(scene) {
  const rows = [];
  const total = blank('TOTAL');
  const mats = new Set();
  const geos = new Set();
  for (const child of scene.children) {
    const r = blank(label(child));
    child.traverse((o) => {
      r.objects++;
      if (o.matrixAutoUpdate) r.auto++;
      if (o.isMesh || o.isPoints || o.isLine) {
        r.meshes++;
        if (o.isInstancedMesh) { r.instanced++; r.instances += o.count; }
        if (o.castShadow) r.casters++;
        if (o.frustumCulled === false) r.noCull++;
        if (!visibleDeep(o)) r.hidden++;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) { if (!m) continue; mats.add(m); if (m.transparent) { r.transparent++; break; } }
        if (o.geometry) {
          geos.add(o.geometry);
          const g = o.geometry, n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
          r.tris += Math.round(n / 3 * (o.isInstancedMesh ? o.count : 1));
        }
      }
    });
    rows.push(r);
    for (const k of Object.keys(total)) if (typeof total[k] === 'number') total[k] += r[k];
  }
  rows.sort((a, b) => b.objects - a.objects);
  total.materials = mats.size; total.geometries = geos.size;
  rows.push(total);
  return rows;

  function blank(name) { return { owner: name, objects: 0, auto: 0, meshes: 0, instanced: 0, instances: 0, casters: 0, noCull: 0, transparent: 0, hidden: 0, tris: 0 }; }
  function label(o) { return o.name || (o.userData && o.userData.owner) || (o.isMesh ? 'mesh:' + (o.geometry && o.geometry.type) : o.isPoints ? 'points' : o.isLight ? 'light:' + o.type : o.isInstancedMesh ? 'instanced' : o.type + '[' + o.children.length + ']'); }
  function visibleDeep(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
}
