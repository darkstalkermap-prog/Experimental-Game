const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.update(0.05);
    g.ui.tab = 'castle'; g.ui.toggleShop(true);
    g.update(0.05); g.update(0.05);
    g.ui.toggleShop(false);
    return [...g.alerts.learned].sort().join();
  });
  console.log('learned after opening the castle tab:', r, '| errors:', errors.join('\n') || 'none');
  await browser.close();
})();
