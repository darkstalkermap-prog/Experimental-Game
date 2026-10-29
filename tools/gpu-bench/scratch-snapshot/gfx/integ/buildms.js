// World build time: page load to the menu, and three rebuilds (dispose + new Game + first frames). usage: CW_PORT=<port> node buildms.js <map> <quality>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const { chromium } = require('playwright');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const loadMs = Date.now() - t0;
  const out = await page.evaluate(async ([map, quality]) => {
    const cfg = await import('./src/config.js');
    const { Game } = await import('./src/game.js');
    const res = [];
    let g = window.__game;
    for (let i = 0; i < 3; i++) {
      const R = g.renderer, ui = g.ui, audio = g.audio, input = g.input;
      g.dispose();
      cfg.setMapSize(map); cfg.setPracticeWorld(false);
      const a = performance.now();
      g = new Game(R, ui, audio, input, { practice: false });
      const ctor = performance.now() - a;
      g.state = 'menu'; window.__game = g; ui.mapBg = ui.bigBg = null;
      g.setQuality(quality);
      const b = performance.now();
      for (let k = 0; k < 3; k++) { g.update(0.05); if (window.__gfx) window.__gfx.renderFrame(0.05); else R.render(g.scene, g.camera); }
      res.push({ ctorMs: Math.round(ctor), firstFramesMs: Math.round(performance.now() - b) });
    }
    return res;
  }, [MAP, QUALITY]);
  console.log(JSON.stringify({ map: MAP, quality: QUALITY, loadMs, rebuilds: out, errors: errors.slice(0, 3) }));
  await browser.close();
})();
