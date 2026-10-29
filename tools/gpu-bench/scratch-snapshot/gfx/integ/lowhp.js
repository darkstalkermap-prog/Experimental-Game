// Low health and death with the HUD on: the colour drain from camfx next to the HUD's own red vignette. usage: CW_PORT=8220 OUT=<dir> node lowhp.js <tag>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'lh';
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: 'high', viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game; g.paused = false; document.getElementById('pause').classList.add('hidden');
    const me = g.player; me.pos.set(0, 0, 40); me.pos.y = g.physics.groundHeight(0, 40, 40); me.yaw = Math.PI; me.pitch = -0.05;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + `${TAG}_full.png` });
  await page.evaluate(() => { const p = window.__game.player; p.hp = p.maxHp * 0.15; p.lastHurt = window.__game.time; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + `${TAG}_low.png` });
  await page.evaluate(() => { window.__game.player.takeDamage(1e9, null, {}); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: OUT + `${TAG}_dead.png` });
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
