// What the page load spends its time on outside JS: when each script/module request starts and ends, and the page's own timeline marks.
// usage: CW_PORT=8220 node resources.js [map] [quality]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const out = await page.evaluate(() => {
    const r = performance.getEntriesByType('resource').map((e) => ({ n: e.name.replace(/^.*\/\/[^/]+\//, ''), s: Math.round(e.startTime), e: Math.round(e.responseEnd) }));
    const nav = performance.getEntriesByType('navigation')[0];
    const last = r.reduce((a, b) => (b.e > a.e ? b : a), r[0]);
    return { count: r.length, lastEnd: last.e, lastName: last.n, domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), now: Math.round(performance.now()),
      slowest: r.slice().sort((a, b) => (b.e - b.s) - (a.e - a.s)).slice(0, 6) };
  });
  console.log(JSON.stringify(out));
  await browser.close();
})();
