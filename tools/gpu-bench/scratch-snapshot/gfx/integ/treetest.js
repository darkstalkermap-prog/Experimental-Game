// Under a tree crown, with and without the shadow proxies. usage: CW_PORT=8220 OUT=<dir> node treetest.js <tag> [quality]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 't', QUALITY = process.argv[3] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.player.buffs.add('ghost', 1e6); g.paused = false; document.getElementById('hud').style.display = 'none'; });
  const where = await page.evaluate(() => {
    const g = window.__game, me = g.player, fol = g.scene.userData.worldSystems.find((s) => s.near);
    let best = -1, bd = 1e9;
    for (let i = 0; i < fol.n; i++) { if (fol.kind[i] !== 2) continue; const d = Math.hypot(fol.pos[i * 3], fol.pos[i * 3 + 2]); if (d > 60 && d < bd && d < 120) { bd = d; best = i; } }
    const x = fol.pos[best * 3], z = fol.pos[best * 3 + 2];
    me.pos.set(x + 5, 0, z + 5); me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 40) + 0.2; me.vel.set(0, 0, 0);
    me.yaw = Math.atan2(-5, -5); me.pitch = 0.45;
    return { x, z };
  });
  console.log(JSON.stringify(where));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + `${TAG}_proxy_on.png` });
  await page.evaluate(() => { const fol = window.__game.scene.userData.worldSystems.find((s) => s.near); fol.useProxy = false; fol.near.forEach((m) => { m.castShadow = true; }); fol.proxy.forEach((p) => { p.userData.on = false; }); fol.lastPos.set(1e9, 0, 1e9); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + `${TAG}_proxy_off.png` });
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
