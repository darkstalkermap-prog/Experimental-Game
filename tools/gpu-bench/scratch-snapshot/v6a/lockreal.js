// Realistic use: the real game loop, real key presses. Open and close the big map with M at various rhythms; does the mouse always come back?
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page } = await L.launch({ map: 'small', raf: true, viewport: { width: 640, height: 400 } });
  await L.startSingle(page);
  await page.waitForTimeout(1500);
  const st = () => page.evaluate(() => { const g = window.__game; return { locked: g.input.locked, map: g.ui.mapOpen, paused: g.paused, hint: document.getElementById('pauseHint').textContent.slice(0, 14) }; });
  for (const [openFor, closedFor] of [[1500, 3000], [700, 1500], [400, 700], [300, 300]]) {
    let fails = 0, log = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('KeyM');
      await page.waitForTimeout(openFor);
      const a = await st();
      await page.keyboard.press('KeyM');
      await page.waitForTimeout(closedFor);
      const b = await st();
      if (!a.map || a.locked) log.push(`open? ${JSON.stringify(a)}`);
      if (b.map || !b.locked || b.paused) { fails++; log.push(`cycle ${i}: ${JSON.stringify(b)}`); }
      if (b.paused) { await page.evaluate(() => { document.getElementById('resume').click(); }); await page.waitForTimeout(500); }
    }
    console.log(`open ${openFor} ms / closed ${closedFor} ms -> ${fails} of 8 cycles failed to get the mouse back`, log.slice(0, 3).join(' | '));
    await page.waitForTimeout(4000);
  }
  await browser.close();
})();
