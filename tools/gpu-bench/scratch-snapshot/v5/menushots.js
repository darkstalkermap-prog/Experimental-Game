const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  for (const [w, h, name] of [[1100, 700, 'menu_wide'], [820, 640, 'menu_narrow']]) {
    const { browser, page, errors } = await L.launch({ map: 'medium', viewport: { width: w, height: h }, raf: true, quality: 'low' });
    await page.evaluate(() => document.querySelector('#objective button[data-o=koth]').click());
    await page.waitForTimeout(400);
    await page.screenshot({ path: S + `v5/${name}.png` });
    await browser.close();
  }
  console.log('done');
})();
