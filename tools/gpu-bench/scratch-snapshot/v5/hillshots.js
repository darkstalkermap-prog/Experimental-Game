// Screenshots of the hill in the middle: from afar, close up, with a house taking it, contested, and the HUD.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const mode = process.argv[2] || 'koth';
  const { browser, page, errors } = await L.launch({ map: 'medium', viewport: { width: 1100, height: 640 }, raf: true });
  await page.evaluate((m) => document.querySelector(`#objective button[data-o=${m}]`).click(), mode);
  await page.screenshot({ path: S + 'v5/hill_menu.png' });
  await L.startSingle(page);
  await page.waitForTimeout(3500);
  const shot = async (name, ms = 600) => { await page.waitForTimeout(ms); await page.screenshot({ path: S + `v5/${name}.png`, timeout: 60000 }); };
  const at = (x, z, tx, tz, y = 0, pitch = -0.1) => page.evaluate(([x, z, tx, tz, y, pitch]) => {
    const g = window.__game, p = g.player;
    p.pos.set(x, g.physics.terrainHeight(x, z) + y, z);
    p.yaw = Math.atan2(tx - x, tz - z); p.pitch = pitch; p.vel.set(0, 0, 0); p.vy = 0;
    g.input.endFrame();
  }, [x, z, tx, tz, y, pitch]);
  // from the road, a way off
  await at(0, 75, 0, 0, 0, -0.04);
  await shot('hill_far');
  // close, on the slope
  await at(0, 26, 0, 0, 0, 0.02);
  await shot('hill_near');
  // standing in the ring
  await at(0, 9, 0, -2, 0, 0.1);
  await shot('hill_inside');
  // a house takes it: two Red soldiers on top
  await page.evaluate(() => {
    const g = window.__game, V3 = g.camera.position.constructor;
    window.__sold = [];
    for (let i = 0; i < 3; i++) {
      const u = g.recruit(g.factions[1], 'swordsman');
      u.pos.set(-2 + i * 2, g.physics.terrainHeight(0, 0), 1 + i);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
      window.__sold.push(u);
    }
  });
  await at(0, 36, 0, 0, 0, -0.03);
  await page.evaluate(() => { const g = window.__game; g.input.endFrame(); });
  await shot('hill_capturing', 2200);
  await shot('hill_held', 5500);
  // contested: a Gold soldier walks on
  await page.evaluate(() => {
    const g = window.__game;
    const u = g.recruit(g.factions[3], 'spearman');
    u.pos.set(3, g.physics.terrainHeight(3, -3), -3);
    u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
    window.__sold.push(u);
  });
  await shot('hill_contested', 1500);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
