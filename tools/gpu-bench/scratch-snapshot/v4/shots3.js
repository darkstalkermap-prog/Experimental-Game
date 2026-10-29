const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 900, height: 640 }, raf: true, quality: 'low' });
  await page.evaluate(() => document.getElementById('menuControls').click());
  await page.waitForTimeout(500);
  await page.screenshot({ path: S + 'v4/cd_controls.png' });
  await page.evaluate(() => document.getElementById('controlsBack').click());
  await L.startSingle(page);
  await page.waitForTimeout(2500);
  // next to a castle wall, facing it: the prompt
  await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    const a = c.toWorld(8, -21.0), b = c.toWorld(8, -10);
    p.pos.set(a.x, g.physics.terrainHeight(a.x, a.z), a.z);
    p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = 0.25; p.vel.set(0, 0, 0); p.stamina = 100;
    g.input.endFrame();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: S + 'v4/cd_prompt.png' });
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
