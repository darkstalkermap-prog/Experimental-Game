// Frame cost on the SOFTWARE GPU in a FIXED scene (the game just started: garrisons only, no battle; same three cameras every run), one script for
// every commit of the game: it draws through gfx.renderFrame when the page has window.__gfx (the overhauled game) and through renderer.render otherwise
// (the original). Each number is the median of 5 steady frames (gl.readPixels waits for the GPU) in milliseconds, at 1280x720 and pixel ratio 1.
// usage: CW_PORT=<port> [SHOT=<dir>:<tag>] node fixed.js <quality: low|medium|high|ultra> [map=small] [WxH=1280x720]      (through b.sh: one browser at a time)
// With SHOT=<dir>:<tag> each of the three views is also saved as <dir>/<tag>_<quality>_<view>.png (the frame as drawn: compare two commits with gpu/imgdiff.py).
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'high', MAP = process.argv[3] || 'small';
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const out = await page.evaluate(async () => {
    const g0 = window.__game, R = g0.renderer;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    g.phaseT = 1e6;
    for (let i = 0; i < 120; i++) { g.update(0.05); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const draw = window.__gfx && window.__gfx.renderFrame ? () => window.__gfx.renderFrame(0) : () => R.render(g.scene, g.camera);
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    const dx = c0.center.x / (Math.hypot(c0.center.x, c0.center.z) || 1), dz = c0.center.z / (Math.hypot(c0.center.x, c0.center.z) || 1);
    const views = {
      castle: [c0.gateOut.x - dx * 38, c0.gateOut.z - dz * 38, Math.atan2(dx, dz), -0.05, 1.7],
      field: [0, 60 * sz, sz > 0 ? Math.PI : 0, -0.04, 1.7],
      sun: [-10, 20, 2.4, 0.05, 2.5],
    };
    const res = {}, shots = {};
    for (const [name, [x, z, yaw, pitch, h]] of Object.entries(views)) {
      me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
      me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
      for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
      draw(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t = [];
      for (let i = 0; i < 5; i++) { const a = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
      res[name] = Math.round(med(t));
      draw(); shots[name] = R.domElement.toDataURL('image/png');
    }
    res.shots = shots;
    res.mean = Math.round((res.castle + res.field + res.sun) / 3);
    res.calls = R.info.render.calls; res.tris = R.info.render.triangles; res.programs = R.info.programs ? R.info.programs.length : 0;
    return res;
  });
  const shots = out.shots; delete out.shots;
  if (process.env.SHOT) {
    const [dir, tag] = process.env.SHOT.split(':'); require('fs').mkdirSync(dir, { recursive: true });
    for (const [name, url] of Object.entries(shots)) require('fs').writeFileSync(`${dir}/${tag}_${QUALITY}_${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(JSON.stringify({ quality: QUALITY, map: MAP, size: W + 'x' + H, ...out, errors: errors.length }));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
