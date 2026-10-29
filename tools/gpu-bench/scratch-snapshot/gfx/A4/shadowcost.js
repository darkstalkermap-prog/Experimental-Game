// A4: what does each shadow cascade cost the CPU in a big battle? usage: CW_PORT=8214 node shadowcost.js <quality> <battle minutes>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: process.argv[2] || 'high', viewport: { width: 640, height: 360 } });
  await L.startSingle(page);
  const out = await page.evaluate(async (minutes) => {
    const g = window.__game, R = g.renderer;
    g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < minutes * 60 * 20; i++) { g.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    const rig = g.lights.rig;
    const units = g.units.filter((u) => u.alive).length;
    const measure = (label, n = 14) => {
      for (let i = 0; i < 3; i++) R.render(g.scene, g.camera);
      R.info.autoReset = false; R.info.reset();
      const t = [];
      for (let i = 0; i < n; i++) { const a = performance.now(); R.render(g.scene, g.camera); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      return { label, calls: Math.round(R.info.render.calls / n), tris: Math.round(R.info.render.triangles / n), median: +t[n >> 1].toFixed(1), min: +t[0].toFixed(1) };
    };
    const res = [];
    // the player stands in the middle of the field, looking over it
    g.player.pos.set(0, 6, 40); g.player.yaw = Math.PI; g.update(0.016);
    res.push(measure('both cascades, every frame'));
    rig.far.shadow.autoUpdate = false; rig.far.shadow.needsUpdate = false;
    res.push(measure('near cascade only (far map kept)'));
    rig.far.shadow.autoUpdate = true;
    g.lights.sun.castShadow = false;
    res.push(measure('no shadows'));
    g.lights.sun.castShadow = true;
    res.push(measure('both again'));
    return { units, siege: g.siege.filter((s) => s.alive).length, res };
  }, Number(process.argv[3] || 6));
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
