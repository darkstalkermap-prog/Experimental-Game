// Shared helpers for headless simulation tests: loads the game with rendering disabled and steps it by hand.
const { chromium } = require('playwright');
exports.launch = async function (opts = {}) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 320, height: 200 } });
  // no render loop: the page's frame() runs once, then we drive game.update ourselves
  if (!opts.raf) await ctx.addInitScript(() => { let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const url = opts.url || ('http://localhost:' + (process.env.CW_PORT || 8090) + '/');   // CW_PORT: a private server (static files and relay on one port)
  if (opts.quality) await ctx.addInitScript((q) => { try { localStorage.setItem('cw-quality', q); } catch (e) {} }, opts.quality);
  if (opts.map) await ctx.addInitScript((m) => { try { localStorage.setItem('cw-map', m); } catch (e) {} }, opts.map);
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  return { browser, page, errors };
};
exports.startSingle = async function (page, difficulty = 'normal') {
  if (difficulty !== 'normal') await page.click(`#difficulty button[data-d=${difficulty}]`);
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.paused = false; });
};
// advance the simulation by `secs` of game time at dt
exports.step = async function (page, secs, dt = 1 / 30) {
  await page.evaluate(([secs, dt]) => {
    const g = window.__game;
    g.paused = false;
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) g.update(dt);
  }, [secs, dt]);
};
