// When does the page first have a game at the menu, by the page's own clock (not Playwright's polling)? usage: CW_PORT=<port> node menutime.js [map] [quality]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = [];
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(([m, q]) => {
      try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {}
      let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
      window.__marks = {};
      let g;
      Object.defineProperty(window, '__game', { configurable: true, get() { return g; }, set(v) { g = v; window.__marks.game = performance.now(); } });
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/.test(t) && !window.__marks.gl) window.__marks.gl = performance.now(); return orig.call(this, t, ...a); };
      document.addEventListener('DOMContentLoaded', () => { window.__marks.dcl = performance.now(); });
    }, [MAP, QUALITY]);
    const page = await ctx.newPage();
    await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000, waitUntil: 'commit' });
    await page.waitForFunction(() => window.__marks && window.__marks.game, null, { timeout: 120000, polling: 100 });
    out.push(await page.evaluate(() => ({ glContext: Math.round(window.__marks.gl), gameBuilt: Math.round(window.__marks.game), domContentLoaded: Math.round(window.__marks.dcl || 0) })));
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
})();
