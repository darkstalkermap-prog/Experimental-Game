// Find the source of the faint grid on the meadow: the same view with one thing switched off at a time. usage: CW_PORT=8220 OUT=<dir> node meadow.js <tag> [variants...]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'mw';
const ONLY = process.argv.slice(3);
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: 'high', viewport: { width: 960, height: 540 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game; g.player.buffs.add('ghost', 1e6); g.paused = false;
    document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
    const me = g.player; me.pos.set(0, 0, 0); me.pos.y = g.physics.groundHeight(0, 0, 30) + 2.5; me.vel.set(0, 0, 0); me.yaw = 0.6; me.pitch = -0.02;
    window.__Q = null;
  });
  const variants = {
    base: '',
    nograss: `(async () => { const { Q } = await import('/src/quality.js'); Q.grass = 0; })()`,
    terr1: `(async () => { const { Q } = await import('/src/quality.js'); Q.terrain = 1; })()`,
    terr0: `(async () => { const { Q } = await import('/src/quality.js'); Q.terrain = 0; })()`,
    noshadow: `(() => { window.__game.lights.sun.castShadow = false; })()`,
    nopost: `(async () => { const { Q } = await import('/src/quality.js'); Q.post = { bloom: false, aa: false, vignette: false, grade: false, ao: false }; window.__gfx.resize(true); })()`,
    flat: `(async () => { const { Q } = await import('/src/quality.js'); Q.grass = 0; Q.terrain = 0; window.__game.lights.sun.castShadow = false; })()`,
  };
  for (const [name, code] of Object.entries(variants)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    if (code) await page.evaluate(code);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png`, clip: { x: 300, y: 300, width: 400, height: 150 } });
  }
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
