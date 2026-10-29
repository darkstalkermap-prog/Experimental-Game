// A4: every kind of world still renders through the new pipeline: small and large maps, the practice courtyard, Hero Mode.
// usage: CW_PORT=8214 node modes.js [quality]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const fs = require('fs');
const Q = process.argv[2] || 'high';
const OUT = S + 'gfx/A4/out/';
async function shoot(page, tag) {
  const url = await page.evaluate(() => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < 80; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
    for (let i = 0; i < 2; i++) window.__gfx.renderFrame(0.016);
    return g.renderer.domElement.toDataURL('image/png');
  });
  fs.writeFileSync(OUT + `m_${Q}_${tag}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
(async () => {
  for (const map of ['small', 'large']) {
    const { browser, page, errors } = await L.launch({ map, quality: Q, viewport: { width: 640, height: 360 } });
    await L.startSingle(page);
    await shoot(page, map);
    console.log(map, 'errors', JSON.stringify(errors.slice(0, 3)));
    await browser.close();
  }
  {
    const { browser, page, errors } = await L.launch({ map: 'medium', quality: Q, viewport: { width: 640, height: 360 } });
    await page.click('#practiceBtn');
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
    await shoot(page, 'practice');
    console.log('practice errors', JSON.stringify(errors.slice(0, 3)));
    await browser.close();
  }
  {
    const { browser, page, errors } = await L.launch({ map: 'medium', quality: Q, viewport: { width: 640, height: 360 } });
    await page.click('#objective button[data-o=hero]');
    await page.click('#play');
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
    await shoot(page, 'hero');
    console.log('hero errors', JSON.stringify(errors.slice(0, 3)));
    await browser.close();
  }
})();
