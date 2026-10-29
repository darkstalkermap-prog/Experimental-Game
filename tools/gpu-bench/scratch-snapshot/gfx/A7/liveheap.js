// Who owns the live JS heap? Sampling heap profiler across page load and a few minutes of play, then gc and read what is still alive.
// usage: CW_PORT=8217 node liveheap.js <map> <minutes>
const L = require('./lib.js');
const MAP = process.argv[2] || 'medium', MINUTES = Number(process.argv[3] || 3);
(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', 'high'); } catch (e) {} let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); }, MAP);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
  await page.goto('http://localhost:' + (process.env.CW_PORT || 8217) + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const live = async (label) => { await cdp.send('HeapProfiler.collectGarbage'); const m = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576)); console.log(label, m, 'MB live'); };
  await live('menu');
  await L.startSingle(page);
  await page.evaluate(async ([minutes]) => {
    const g = window.__game; g.player.buffs.add('ghost', 1e6);
    const m = await import('./src/ai.js'); const f = g.factions[0]; f.ai = new m.LordAI(g, f); g.phaseT = 5;
    for (let i = 0; i < 20 * 60 * minutes; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
  }, [MINUTES]);
  await live('after ' + MINUTES + ' min');
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const h = L.summariseHeap(profile, 22);
  console.log('live objects by allocation site, total', h.totalKB, 'KB');
  for (const r of h.rows) console.log(String(r.kb).padStart(8) + ' KB', String(r.pct).padStart(5) + '%', r.fn);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
