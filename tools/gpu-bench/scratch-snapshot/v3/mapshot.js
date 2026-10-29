const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const size = process.argv[2] || 'medium';
  const { browser, page, errors } = await L.launch({ map: size, viewport: { width: 1280, height: 760 }, raf: true });
  await L.startSingle(page);
  // let a few waves get going so there is something to look at
  await page.evaluate(() => { const g = window.__game; g.phaseT = 0.5; });
  await L.step(page, 100);
  const info = await page.evaluate(() => {
    const g = window.__game;
    // M key through the real input path
    g.input.pressed.add('KeyM'); g.update(1 / 60); g.input.endFrame();
    return { open: g.ui.mapOpen, hidden: document.getElementById('bigmap').classList.contains('hidden'), units: g.units.length, round: g.round };
  });
  console.log(JSON.stringify(info));
  await page.waitForTimeout(600);
  await page.screenshot({ path: S + `v3/bigmap_${size}.png`, timeout: 60000 });
  const info2 = await page.evaluate(() => {
    const g = window.__game;
    g.input.pressed.add('KeyM'); g.update(1 / 60); g.input.endFrame();
    return { open: g.ui.mapOpen, hidden: document.getElementById('bigmap').classList.contains('hidden') };
  });
  console.log(JSON.stringify(info2));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
