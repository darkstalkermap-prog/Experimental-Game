// Long AI war with memory tracking: heap, scene size, unit and engine counts.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const url = process.argv[3] || undefined;
(async () => {
  const { browser, page, errors } = await L.launch({ map: process.argv[2] || 'medium', url });
  await L.startSingle(page);
  await page.evaluate(() => { const g = window.__game; const f = g.factions[0]; import('./src/ai.js').then((m) => { f.ai = new m.LordAI(g, f); }); g.phaseT = 5; });
  await L.step(page, 0.5);
  page.on('crash', () => console.log('PAGE CRASHED'));
  const t0 = Date.now();
  for (let i = 0; i < 14; i++) {
    await L.step(page, 100, 1 / 20);
    const r = await page.evaluate(() => {
      const g = window.__game;
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
      let meshes = 0; g.scene.traverse((o) => { if (o.isMesh) meshes++; });
      return { t: Math.round(g.time), wave: g.round, units: g.units.length, alive: g.units.filter((u) => u.alive).length, engines: g.siege.length, aliveEng: g.siege.filter((s) => s.alive).length, sceneKids: g.scene.children.length, meshes, projectiles: g.projectiles.list.length, stuck: g.projectiles.stuckMesh.count, heapMB: mem, geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures };
    }).catch((e) => ({ err: String(e).slice(0, 80) }));
    console.log(Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(r));
    if (r.err) break;
  }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
