const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ viewport: { width: 1280, height: 720 }, raf: true, map: 'small' });
  await page.click('#objective button[data-o=hero]');
  await page.click('#heroWin button[data-w=kills]');
  await page.evaluate(() => document.getElementById('play').click());
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: S + 'v9/hero_start.png' });
  await page.evaluate(() => {
    const g = window.__game; g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < 20 * 150; i++) { g.update(0.05); g.input.endFrame(); if (i % 20 === 0) g.ui.update(0.05); }
    // look down the lane from behind the local hero
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: S + 'v9/hero_mid.png' });
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
