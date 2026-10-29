// CPU profile of the page load up to the main menu (top self-time functions). usage: CW_PORT=<port> node loadprof.js [map] [quality] [top]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high', TOP = Number(process.argv[4] || 25);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const ms = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  const dt = profile.timeDeltas, nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const n = nodes.get(profile.samples[i]), cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/\/[^/]+\//, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
  }
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, r) => a + r[1], 0);
  console.log(`load to menu ${ms} ms, profiled ${Math.round(total)} ms`);
  for (const [k, v] of rows.slice(0, TOP)) console.log(String(Math.round(v)).padStart(6), 'ms', k);
  // inclusive time per function (ours only): who is the expensive caller
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const cf = nodes.get(id).callFrame;
      if (!/\/src\//.test(cf.url)) continue;
      const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/\/[^/]+\//, '')}:${cf.lineNumber + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      incl.set(key, (incl.get(key) || 0) + (dt[i] || 0) / 1000);
    }
  }
  console.log('--- inclusive (src only)');
  for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(Math.round(v)).padStart(6), 'ms', k);
  // by file
  const byFile = new Map();
  for (const [k, v] of rows) { const f = k.split(' ').pop().replace(/:\d+$/, ''); byFile.set(f, (byFile.get(f) || 0) + v); }
  console.log('--- by file');
  for (const [k, v] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(Math.round(v)).padStart(6), 'ms', k);
  await browser.close();
})();
