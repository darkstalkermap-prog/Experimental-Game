// Starts a game with ?perf, lets it run, screenshots the overlay.  usage: CW_PORT=8217 node overlay.js <out.png>
const L = require('./lib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', quality: 'medium', viewport: { width: 800, height: 450 }, raf: true, query: '?perf' });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  await page.evaluate(() => { const g = window.__game; g.player.buffs.add('ghost', 1e6); for (let i = 0; i < 20 * 150; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); } });
  await page.waitForTimeout(3000);
  const rep = await page.evaluate(() => window.__perf.report());
  console.log(rep);
  await page.screenshot({ path: process.argv[2] || L.S + 'gfx/A7/overlay.png', clip: { x: 0, y: 0, width: 330, height: 200 } });
  // toggle off with the key and check the hooks are gone
  await page.keyboard.press('Backquote');
  const off = await page.evaluate(() => ({ on: window.__perf.on, panel: !!document.getElementById('perfPanel'), wrapped: !!window.__game.renderer.render.__perfWrapped }));
  console.log('after toggle', JSON.stringify(off));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
