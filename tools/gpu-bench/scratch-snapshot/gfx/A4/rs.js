const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: 'high', viewport: { width: 640, height: 360 } });
  await L.startSingle(page);
  const info = () => page.evaluate(() => { const c = window.__game.renderer.domElement; return { inner: [innerWidth, innerHeight], canvas: [c.width, c.height], css: [c.style.width, c.style.height], last: [window.__gfx.lastW, window.__gfx.lastH] }; });
  console.log(JSON.stringify(await info()));
  await page.setViewportSize({ width: 800, height: 450 });
  await page.waitForTimeout(300);
  console.log(JSON.stringify(await info()));
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  console.log(JSON.stringify(await info()));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
