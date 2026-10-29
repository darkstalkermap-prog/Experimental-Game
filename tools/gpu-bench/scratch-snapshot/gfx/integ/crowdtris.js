// Where the crowd's triangles go: by level of detail (units with a rig at that level, whether or not they are on screen), plus the instances actually drawn.
// usage: CW_PORT=8220 node crowdtris.js <map> <quality> <minutes>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high', MINUTES = Number(process.argv[4] || 6);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async ([minutes]) => {
    const { shapeGeo } = await import('/src/shapes.js');
    const { geoLevel, farShapeOf } = await import('/src/models.js');
    const g = window.__game, gfx = window.__gfx;
    g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < minutes * 60 * 20; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 4; i++) gfx.renderFrame(1 / 60);
    const lv = [0, 1, 2, 3].map(() => ({ units: 0, tris: 0, parts: 0 }));
    const tr = (geo) => geo.index.count / 3;
    const rigTris = (rig, level) => { let t = 0, n = 0; for (const p of rig.parts) { if (!p.on) continue; t += tr(shapeGeo(p.shape, level)); n++; } return [t, n]; };
    for (const u of g.units) {
      if (!u.alive || !u.model) continue;
      const k = u.lod;
      lv[k].units++;
      if (k <= 1) { const [t, n] = rigTris(u.model, geoLevel(k)); lv[k].tris += t; lv[k].parts += n; if (u.horse) { const [t2, n2] = rigTris(u.horse, geoLevel(k)); lv[k].tris += t2; lv[k].parts += n2; } }
      else if (k === 2) { lv[2].tris += tr(farShapeOf(u.model).geo[3]); if (u.horse) lv[2].tris += tr(farShapeOf(u.horse).geo[3]); }
    }
    const kinds = {};
    for (const u of g.units) { if (!u.alive || u.lod !== 0) continue; const key = (u.kind || u.type || '?') + (u.horse ? '+horse' : ''); const [t] = rigTris(u.model, geoLevel(0)); const o = kinds[key] || (kinds[key] = { n: 0, tris: 0 }); o.n++; o.tris += t; }
    return { st: g.crowd.stats, lv, kinds, rich: g.units.filter((u) => u.alive && u.lod === 0).length, nearK: g.nearK };
  }, [MINUTES]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
