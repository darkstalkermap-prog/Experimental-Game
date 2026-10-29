// CPU profile of three warm world rebuilds (dispose + new Game): inclusive time of our own functions. usage: CW_PORT=<port> node rebuildprof.js [map] [quality]
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const ms = await page.evaluate(async ([map]) => {
    const cfg = await import('./src/config.js');
    const { Game } = await import('./src/game.js');
    let g = window.__game;
    const a = performance.now();
    for (let i = 0; i < 3; i++) {
      const R = g.renderer, ui = g.ui, audio = g.audio, input = g.input;
      g.dispose();
      cfg.setMapSize(map); cfg.setPracticeWorld(false);
      g = new Game(R, ui, audio, input, { practice: false });
      g.state = 'menu'; window.__game = g; ui.mapBg = ui.bigBg = null;
    }
    return (performance.now() - a) / 3;
  }, [MAP]);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = profile.timeDeltas, nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = new Map(), self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const cf = nodes.get(id).callFrame;
      const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/\/[^/]+\//, '')}:${cf.lineNumber + 1}`;
      if (id === profile.samples[i]) self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000 / 3);
      if (!/\/src\//.test(cf.url) || seen.has(key)) continue;
      seen.add(key);
      incl.set(key, (incl.get(key) || 0) + (dt[i] || 0) / 1000 / 3);
    }
  }
  console.log(`average rebuild ${Math.round(ms)} ms`);
  console.log('--- inclusive per rebuild (src only)');
  for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26)) console.log(String(Math.round(v)).padStart(6), 'ms', k);
  console.log('--- self');
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(String(Math.round(v)).padStart(6), 'ms', k);
  await browser.close();
})();
