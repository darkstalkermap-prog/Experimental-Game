const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1100, height: 640 }, raf: true });
  await L.startSingle(page);
  await page.waitForTimeout(5000);   // let the banner fade
  const shot = async (name, lx, lz, y, faceLx, faceLz, pitch = 0.05, ground = false) => {
    await page.evaluate(([lx, lz, y, fx, fz, pitch, ground]) => {
      const g = window.__game, p = g.player, c = g.castles[0];
      const w = c.toWorld(lx, lz), t = c.toWorld(fx, fz);
      p.pos.set(w.x, ground ? g.physics.terrainHeight(w.x, w.z) : c.center.y + y, w.z);
      p.vel.set(0, 0, 0); p.vy = 0;
      p.yaw = Math.atan2(t.x - w.x, t.z - w.z);
      p.pitch = pitch;
      g.ui.hudT = 0;
    }, [lx, lz, y, faceLx, faceLz, pitch, ground]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: S + `v3/tower_${name}.png`, timeout: 60000 });
  };
  await shot('outside', 44, 44, 0, 22.5, 22.5, 0.12, true);
  await shot('walk', 12, 17, 8, 22, 21, 0.0);
  await shot('inside', 19.4, 19.5, 8, 26, 21, 0.1);
  await shot('landing', 25.2, 20.4, 10.5, 25, 26, 0.0);
  await shot('roof', 22, 24, 13, 8, 8, -0.1);
  await shot('roofedge', 24, 25.5, 13, 30, 40, -0.1);
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
