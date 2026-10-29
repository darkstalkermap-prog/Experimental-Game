// A4: quality changes and window resizes at runtime: nothing may leak (renderer.info.memory), nothing may throw.
// usage: CW_PORT=8214 node qcycle.js
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: 'high', viewport: { width: 640, height: 360 } });
  await L.startSingle(page);
  const snapFn = () => page.evaluate(() => { const R = window.__game.renderer, c = R.domElement; return { geo: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs.length, canvas: [c.width, c.height], ratio: R.getPixelRatio() }; });
  const frames = (n = 2) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__gfx.renderFrame(0.016); }, n);
  const log = [];
  const levels = ['low', 'medium', 'high', 'ultra', 'auto', 'low', 'medium', 'high', 'ultra', 'auto'];
  for (const lv of levels) {
    await page.evaluate((lv) => window.__game.setQuality(lv), lv);
    await frames();
    const s = await snapFn();
    const q = await page.evaluate(() => ({ name: window.__q || null }));
    log.push(`${lv}: geo ${s.geo} tex ${s.tex} prog ${s.prog} canvas ${s.canvas.join('x')} ratio ${s.ratio}`);
  }
  console.log(log.join('\n'));
  // resize the window a few times at high quality
  await page.evaluate(() => window.__game.setQuality('high'));
  for (const [w, h] of [[800, 450], [480, 300], [1000, 560], [640, 360]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await frames();
    const s = await snapFn();
    console.log(`resize ${w}x${h} inner ${await page.evaluate(() => innerWidth + 'x' + innerHeight)}: canvas ${s.canvas.join('x')} tex ${s.tex} geo ${s.geo}`);
  }
  // the world rebuilt (map change) keeps working and does not pile up targets
  console.log('errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})();
