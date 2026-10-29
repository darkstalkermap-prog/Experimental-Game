const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ viewport: { width: 1280, height: 720 }, raf: true });
  await page.click('#practiceBtn');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.court;
    return { practice: g.practice, size: g.mapBuiltFor, pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(1)), site: c.site, dummies: c.dummies.length, units: g.units.length, phase: g.phase, round: g.round, state: g.state, hudClass: document.getElementById('hud').className };
  });
  console.log(JSON.stringify(r));
  await page.screenshot({ path: S + 'v7/first.png' });
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
