// The practice courtyard and Hero Mode, as the page renders them. usage: CW_PORT=8220 OUT=<dir> node modes.js <tag> <quality>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'm', QUALITY = process.argv[3] || 'high';
(async () => {
  // ---- practice ----
  let { browser, page, errors } = await L.launch({ quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#practiceBtn');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6); document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden'); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + `${TAG}_practice1.png` });
  await page.evaluate(() => {
    const g = window.__game, me = g.player, S = g.court.site;
    me.pos.set(S.x + 9, S.y, S.z - 20); me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 30); me.yaw = -Math.PI * 0.75; me.pitch = -0.1;
    document.getElementById('pause').classList.add('hidden');
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + `${TAG}_practice2.png` });
  // the hero as another class, seen from outside (a bot's body: the third-person look of each class)
  await page.evaluate(() => {
    const g = window.__game, me = g.player, S = g.court.site;
    me.pos.set(S.x, S.y, S.z - 22); me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 30); me.yaw = 0; me.pitch = -0.05;
  });
  console.log('practice errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
  // ---- hero mode ----
  ({ browser, page, errors } = await L.launch({ quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true }));
  await page.click('#objective button[data-o=hero]');
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.paused = false; for (let i = 0; i < 20 * 70; i++) { g.update(0.05); g.input.endFrame(); } });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + `${TAG}_hero1.png` });
  console.log('hero errors', JSON.stringify(errors.slice(0, 3)), await page.evaluate(() => ({ units: window.__game.units.length, heroes: window.__game.humans.length })));
  await browser.close();
})();
