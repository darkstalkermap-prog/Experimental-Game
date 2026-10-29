// How long the page load spends in WebGL calls (shader compile and link are the slow ones in software GL). usage: CW_PORT=<port> node glcost.js [map] [quality]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => {
    try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {}
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    const T = window.__glT = {};
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      for (const name of Object.getOwnPropertyNames(C.prototype)) {
        const d0 = Object.getOwnPropertyDescriptor(C.prototype, name);
        const f = d0 && d0.value;
        if (typeof f !== 'function' || name === 'constructor') continue;
        C.prototype[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const e = T[name] || (T[name] = [0, 0]); e[0] += d; e[1]++; return r; };
      }
    }
  }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const ms = Date.now() - t0;
  const out = await page.evaluate(() => ({ T: window.__glT, programs: window.__game.renderer.info.programs.length }));
  const rows = Object.entries(out.T).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10);
  const total = Object.values(out.T).reduce((a, v) => a + v[0], 0);
  console.log(`load ${ms} ms, in GL calls ${Math.round(total)} ms, programs ${out.programs}`);
  for (const [k, v] of rows) console.log(String(Math.round(v[0])).padStart(6), 'ms', String(v[1]).padStart(6), 'calls', k);
  await browser.close();
})();
