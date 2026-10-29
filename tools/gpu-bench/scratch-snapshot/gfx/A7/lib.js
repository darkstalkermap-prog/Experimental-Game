// A7 helpers: a launcher with precise memory info and gc(), a seeded battle fast-forward, and CDP profile summaries.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { chromium } = require('playwright');
exports.S = S;

exports.launch = async function (opts = {}) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 960, height: 540 } });
  if (!opts.raf) await ctx.addInitScript(() => { let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const url = (opts.url || ('http://localhost:' + (process.env.CW_PORT || 8217) + '/')) + (opts.query || '');
  if (opts.quality) await ctx.addInitScript((q) => { try { localStorage.setItem('cw-quality', q); } catch (e) {} }, opts.quality);
  if (opts.map) await ctx.addInitScript((m) => { try { localStorage.setItem('cw-map', m); } catch (e) {} }, opts.map);
  const t0 = Date.now();
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  return { browser, ctx, page, errors, loadMs: Date.now() - t0 };
};

// in-page source of a seeded Math.random and the deterministic fast-forward (installed as window.__det)
exports.detSource = `
window.__det = (function () {
  const real = Math.random;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  return {
    seed(s) { Math.random = mulberry32(s); },
    unseed() { Math.random = real; },
  };
})();`;

exports.startSingle = async function (page) {
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.paused = false; });
};

// aggregate a CDP cpu profile into self time per function
exports.summariseCpu = function (profile, top = 40) {
  const nodes = new Map();
  for (const n of profile.nodes) nodes.set(n.id, n);
  const self = new Map();
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = nodes.get(profile.samples[i]);
    const dt = (dts[i] || 0) / 1000;
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\//, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + dt);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ fn: k, ms: +v.toFixed(1), pct: +(v / total * 100).toFixed(1) }));
  return { totalMs: +total.toFixed(0), rows };
};

// aggregate a CDP sampling-heap profile into bytes per function (everything allocated while sampling, when the flags are on)
exports.summariseHeap = function (profile, top = 30) {
  const by = new Map();
  let total = 0;
  (function walk(n) {
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\//, '')}:${cf.lineNumber + 1}`;
    if (n.selfSize) { by.set(key, (by.get(key) || 0) + n.selfSize); total += n.selfSize; }
    for (const c of n.children) walk(c);
  })(profile.head);
  const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ fn: k, kb: Math.round(v / 1024), pct: +(v / total * 100).toFixed(1) }));
  return { totalKB: Math.round(total / 1024), rows };
};
