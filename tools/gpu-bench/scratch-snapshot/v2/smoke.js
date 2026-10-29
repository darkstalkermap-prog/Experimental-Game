// Smoke test: menu -> single player -> step the world; report errors.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  const classes = await page.evaluate(() => [...document.querySelectorAll('#classPick button')].map((b) => b.dataset.cls));
  console.log('class buttons', classes.join(','));
  console.log('tabs', await page.evaluate(() => [...document.querySelectorAll('#shop .tabs button')].map((b) => b.dataset.tab).join(',')));
  await L.startSingle(page);
  await L.step(page, 20);
  const info = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    return { state: g.state, class: p.classId, hp: p.hp, maxHp: p.maxHp, units: g.units.length, siege: g.siege.length, round: g.round };
  });
  console.log(JSON.stringify(info));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
