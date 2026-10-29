const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', raf: true, viewport: { width: 1280, height: 720 }, quality: 'low' });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const g = window.__game; g.player.useAbility('r', g.input); });
  const t0 = await page.evaluate(() => window.__game.time);
  await page.waitForTimeout(1500);
  console.log('time', t0, await page.evaluate(() => [window.__game.time, window.__game.paused, window.__game.ui.shopOpen, document.getElementById('fps').textContent]));
  console.log(JSON.stringify(await page.evaluate(() => ({ buffs: window.__game.player.buffs.list(), html: document.getElementById('buffs').innerHTML, rect: JSON.stringify(document.getElementById('buffs').getBoundingClientRect()), abil: JSON.stringify(document.getElementById('abilities').getBoundingClientRect()) }))));
  await page.screenshot({ path: S + 'v2/buffs.png', clip: { x: 0, y: 440, width: 700, height: 280 } });
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
