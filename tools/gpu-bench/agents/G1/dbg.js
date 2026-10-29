// G1: load the game at a quality, run a few frames, print every console error/warning in full (shader compile errors included).
// usage: CW_PORT=<port> node dbg.js [quality=medium] [WxH=480x270] [maxChars=2500]
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'medium';
const [W, H] = (process.argv[3] || '480x270').split('x').map(Number);
const MAXC = Number(process.argv[4] || 2500);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  const msgs = [];
  page.on('pageerror', (e) => msgs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(m.type() + ': ' + m.text()); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const info = await page.evaluate(async () => {
    const g0 = window.__game, R = g0.renderer;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false; g.phaseT = 1e6;
    for (let i = 0; i < 20; i++) { g.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 3; i++) window.__gfx.renderFrame(0);
    const gl = R.getContext(), px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { programs: R.info.programs.length, calls: R.info.render.calls, tris: R.info.render.triangles };
  });
  console.log(JSON.stringify(info), 'messages:', msgs.length);
  for (const m of msgs.slice(0, 4)) console.log('---\n' + m.slice(0, MAXC));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
