// The profiler overlay on the real frame path: draw calls and the render bucket must be read through gfx.renderFrame, and switching it off restores everything.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', quality: 'high', viewport: { width: 800, height: 450 }, raf: true, url: 'http://localhost:' + (process.env.CW_PORT || 8220) + '/?perf' });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const P = window.__perf, g = window.__game, R = g.renderer;
    const s = P.stats(30);
    return { on: P.on, stats: s && { calls: s.calls, tris: s.tris, draw: s.parts.draw.mean, sim: s.parts.sim.mean, fps: s.fps }, autoReset: R.info.autoReset, panel: !!document.getElementById('perfpanel') || !!document.querySelector('[id*=perf]'), report: P.report().split('\n')[0] };
  });
  check('?perf switches the overlay on at start and it has measured frames', r.on && r.stats && r.stats.fps > 0, r);
  check('draw calls and triangles come through the real frame path', r.stats && r.stats.calls > 20 && r.stats.tris > 1000, { calls: r.stats && r.stats.calls, tris: r.stats && r.stats.tris });
  check('the render bucket is not empty', r.stats && r.stats.draw > 0, r.stats && r.stats.draw);
  check('the overlay leaves renderer.info.autoReset off (the frame resets it once)', r.autoReset === false, r.autoReset);
  const off = await page.evaluate(() => { const P = window.__perf; P.disable(); const g = window.__game; return { on: P.on, hooked: !!g.update.__perfWrapped, gfxHooked: !!window.__gfx.renderFrame.__perfWrapped }; });
  check('switching it off puts every wrapped method back', !off.on && !off.hooked && !off.gfxHooked, off);
  await page.waitForTimeout(1500);
  const again = await page.evaluate(() => { const P = window.__perf; P.enable(); return P.on; });
  await page.waitForTimeout(1500);
  const s2 = await page.evaluate(() => { const s = window.__perf.stats(20); return s && { calls: s.calls, fps: s.fps }; });
  check('and it can be switched on again', again && s2 && s2.calls > 20, s2);
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
