// Trees on the steepest ground they are allowed on, seen from 14 m below. usage: CW_PORT=8220 OUT=<dir> node slopetree.js <tag> [map]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'st', MAP = process.argv[3] || 'small';
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.player.buffs.add('ghost', 1e6); g.paused = false; document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden'); });
  const picks = await page.evaluate(() => {
    const g = window.__game, fol = g.scene.userData.worldSystems.find((s) => s.near), P = g.physics;
    const slope = (x, z) => Math.hypot(P.rawHeight(x + 2.5, z) - P.rawHeight(x - 2.5, z), P.rawHeight(x, z + 2.5) - P.rawHeight(x, z - 2.5)) / 5;
    const list = [];
    for (let i = 0; i < fol.n; i++) {
      if (fol.kind[i] > 3) continue;
      const x = fol.pos[i * 3], z = fol.pos[i * 3 + 2], e = Math.max(Math.abs(x), Math.abs(z));
      if (e < 100 || e > 400) continue;
      const sl = slope(x, z);
      list.push({ i, x, z, sl, e });
    }
    list.sort((a, b) => b.sl - a.sl);
    return [list[0], list[Math.floor(list.length * 0.03)], list[Math.floor(list.length * 0.15)]].filter(Boolean);
  });
  console.log(JSON.stringify(picks.map((p) => ({ slope: +p.sl.toFixed(2), edge: Math.round(p.e) }))));
  let k = 0;
  for (const p of picks) {
    await page.evaluate((p) => {
      const g = window.__game, me = g.player, P = g.physics;
      // 14 m toward the middle of the map from the tree, at the height of the ground there
      const len = Math.hypot(p.x, p.z), ux = -p.x / len, uz = -p.z / len;
      const x = p.x + ux * 14, z = p.z + uz * 14;
      me.pos.set(x, P.rawHeight(x, z) + 1.0, z); me.vel.set(0, 0, 0);
      const ty = P.rawHeight(p.x, p.z) + 2;
      me.yaw = Math.atan2(p.x - x, p.z - z); me.pitch = Math.atan2(ty - (me.pos.y + 1.7), 14);
    }, p);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: OUT + `${TAG}_${k++}.png` });
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
