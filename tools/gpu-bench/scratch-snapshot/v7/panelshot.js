const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ viewport: { width: 1280, height: 800 }, raf: true });
  await page.click('#practiceBtn');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game, c = g.court;
    c.setHeroClass('mage'); c.setHeroLevel(4);
    c.send('knight', 5, 3, 2); c.send('archer', 5, 2, 1);
    g.ui.togglePractice(true);
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: S + 'v7/panel.png' });
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
