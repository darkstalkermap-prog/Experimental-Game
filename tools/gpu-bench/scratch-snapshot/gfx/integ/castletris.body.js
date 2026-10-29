const g = window.__game;
const { Q } = await import('/src/quality.js');
const c = g.castles[0];
const out = {};
for (const [detail, props] of [[0, 0], [1, 1], [2, 0], [2, 1], [2, 2]]) {
  Q.detail = detail; Q.props = props;
  c.buildVisuals();
  const by = {};
  let total = 0;
  for (const m of c.vis) {
    const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const k = (m.material && (Object.entries(c.mats).find(([, v]) => v === m.material) || [])[0]) || 'other';
    by[k] = (by[k] || 0) + t; total += t;
  }
  out[`detail${detail}_props${props}`] = { total, meshes: c.vis.length, by };
}
return out;
