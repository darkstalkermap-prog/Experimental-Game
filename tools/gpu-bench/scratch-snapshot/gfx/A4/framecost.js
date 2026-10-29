// A4: the real frame path (gfx.renderFrame: sky, snapped cascades with the far map at 15 Hz, scene, post passes) in a big battle.
// usage: CW_PORT=8214 node framecost.js <quality> <battle minutes>   (the player stays where the game put them: at their own castle)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: process.argv[2] || 'high', viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async (minutes) => {
    const g = window.__game, R = g.renderer, gfx = window.__gfx;
    g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < minutes * 60 * 20; i++) { g.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 6; i++) gfx.renderFrame(1 / 60);
    const ms = [], calls = [], tris = [];
    for (let i = 0; i < 24; i++) {
      const a = performance.now();
      gfx.renderFrame(1 / 60);
      ms.push(performance.now() - a); calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
    }
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(1); };
    const mean = (v) => Math.round(v.reduce((x, y) => x + y, 0) / v.length);
    return { q: window.__game.quality, units: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length, medianMs: med(ms), meanCalls: mean(calls), minCalls: Math.min(...calls), maxCalls: Math.max(...calls), meanTris: mean(tris), canvas: [R.domElement.width, R.domElement.height], post: !!(gfx.post && gfx.post.active), passes: gfx.post ? gfx.post.stats.passes : 0, shadows: g.lights.sun.castShadow };
  }, Number(process.argv[3] || 6));
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
