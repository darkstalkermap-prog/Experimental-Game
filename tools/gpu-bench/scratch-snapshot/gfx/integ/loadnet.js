// How the page load splits between fetching modules and running them. usage: CW_PORT=<port> node loadnet.js [map] [quality]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const reqs = [];
  page.on('requestfinished', async (r) => { const t = r.timing(); reqs.push({ url: r.url().replace(/^.*\/\/[^/]+/, ''), start: t.startTime, end: t.responseEnd }); });
  const t0 = Date.now();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const ms = Date.now() - t0;
  const marks = await page.evaluate(() => ({ res: performance.getEntriesByType('resource').filter((e) => /\.js/.test(e.name)).map((e) => ({ n: e.name.replace(/^.*\/\/[^/]+/, ''), s: Math.round(e.startTime), e: Math.round(e.responseEnd) })), nav: performance.getEntriesByType('navigation')[0].toJSON() }));
  const js = marks.res;
  const last = js.reduce((a, r) => Math.max(a, r.e), 0);
  console.log(`load ${ms} ms; ${js.length} scripts; the last script finished arriving at ${last} ms; DOMContentLoaded ${Math.round(marks.nav.domContentLoadedEventEnd)} load ${Math.round(marks.nav.loadEventEnd)}`);
  const per = js.slice().sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, 6).map((r) => `${r.n} ${r.e - r.s}ms`).join(', ');
  console.log('slowest fetches:', per);
  await browser.close();
})();
