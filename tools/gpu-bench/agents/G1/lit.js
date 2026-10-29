// G1 harness: the fixed scene (as gfx/fixed.js) measured under several SHADER-CHUNK VARIANTS inside one page session.
// usage: CW_PORT=<port> [SHOT=<dir>:<tag>] node lit.js <quality[,quality...]> <variants.json> [names,comma] [WxH]
// variants.json: { name: { edits: [[chunk, find, replace], ...], js: 'code run in the page with (g, THREE, Q, R, C)' } }; each variant starts from the original chunks.
// Every material in the scene gets a new program cache key per variant, so the whole scene recompiles with the changed chunks.
// Several qualities run one after the other in this process (one browser lock for all of them).
const fs = require('fs');
const { chromium } = require('playwright');
const QUALITIES = (process.argv[2] || 'high').split(',');
const VARS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const WANT = (process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : Object.keys(VARS).join(',')).split(',');
const [W, H] = (process.argv[5] || '1280x720').split('x').map(Number);

async function runQuality(browser, QUALITY) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('ROW ')) console.log(JSON.stringify({ q: QUALITY, ...JSON.parse(t.slice(4)) }));
    else if (m.type() === 'error' || (m.type() === 'warning' && !t.includes('GPU stall'))) { if (!t.includes('GPU stall')) errors.push(t.slice(0, 400)); }
  });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const shots = await page.evaluate(async ([vars, want, shotOn]) => {
    const THREE = await import('/vendor/three.module.min.js');
    const { Q } = await import('/src/quality.js');
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
    const C = THREE.ShaderChunk, orig = { ...C };
    const mats = new Set();
    g.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) mats.add(m); });
    let vid = 0;
    const AF = Object.getPrototypeOf(async function () {}).constructor;
    const run = async (name, v) => {
      if (window.__reset) { window.__reset(); window.__reset = null; }
      for (const k of Object.keys(C)) C[k] = orig[k];
      for (const [chunk, find, repl] of (v.edits || [])) {
        if (!C[chunk].includes(find)) { console.log('ROW ' + JSON.stringify({ name, error: 'edit not found in ' + chunk + ': ' + find.slice(0, 60) })); return null; }
        C[chunk] = C[chunk].split(find).join(repl);
      }
      vid++;
      for (const m of mats) {
        if (!m.__baseKey) m.__baseKey = m.customProgramCacheKey;
        const b = m.__baseKey, id = vid;
        m.customProgramCacheKey = function () { return b.call(this) + '|lit' + id; };
        m.needsUpdate = true;
      }
      if (v.js) await new AF('g', 'THREE', 'Q', 'R', 'C', v.js)(g, THREE, Q, R, C);
      const res = {}, imgs = {};
      for (const [vn, [x, z, yaw, pitch, h]] of Object.entries(views)) {
        me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
        me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
        for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
        draw(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t = [];
        for (let i = 0; i < 3; i++) { const a = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
        res[vn] = Math.round(med(t));
        if (shotOn && !v.noshot) { draw(); imgs[vn] = R.domElement.toDataURL('image/png'); }
      }
      res.mean = Math.round((res.castle + res.field + res.sun) / 3);
      res.calls = R.info.render.calls; res.tris = R.info.render.triangles;
      console.log('ROW ' + JSON.stringify({ name, ...res }));
      return imgs;
    };
    const all = {};
    for (const name of want) {
      if (!vars[name]) { console.log('ROW ' + JSON.stringify({ name, error: 'unknown variant' })); continue; }
      const imgs = await run(name, vars[name]);
      if (imgs) all[name] = imgs;
    }
    return all;
  }, [VARS, WANT, !!process.env.SHOT]);
  if (process.env.SHOT) {
    const [dir, tag] = process.env.SHOT.split(':'); fs.mkdirSync(dir, { recursive: true });
    for (const [name, imgs] of Object.entries(shots)) for (const [vn, url] of Object.entries(imgs)) fs.writeFileSync(`${dir}/${tag}_${name}_${QUALITY}_${vn}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  if (errors.length) console.log('ERRORS', QUALITY, errors.length, JSON.stringify(errors.slice(0, 3)));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const q of QUALITIES) await runQuality(browser, q);
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
