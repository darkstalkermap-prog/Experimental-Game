// G4: the late-battle frame (same flow, seed and camera as gpu/cost.js) with a crowd report: instances and triangles per level of detail, and a few timings.
// usage: CW_PORT=<port> [SHOT=<file.png>] [FF=6] [EXTRA=440] node battle.js <quality> [variant,variant,...] [WxH=1280x720]
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'high';
const WANT = (process.argv[3] || 'base').split(',');
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
const SEED = 1;
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((seed) => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, SEED);
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.text().startsWith('ROW ')) { console.log(m.text().slice(4)); return; } if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); if (m.type() === 'warning' && /THREE\.WebGLProgram|shader|GLSL/i.test(m.text())) errors.push('warn: ' + m.text().slice(0, 600)); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const out = await page.evaluate(async ([want, ff, extra]) => {
    const { LordAI } = await import('/src/ai.js');
    const { Q } = await import('/src/quality.js');
    const { SHAPES } = await import('/src/shapes.js');
    const g0 = window.__game, gfx = window.__gfx, R = g0.renderer;
    const audio = g0.audio; audio.init = audio.startMusic = audio.play = () => {};
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    const own = g.factions[g.player.team]; own.ai = new LordAI(g, own); g.phaseT = 5;
    for (let i = 0; i < ff * 60 / 0.05; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    me.pos.set(0, 0, 60 * sz); me.vel.set(0, 0, 0); me.yaw = sz > 0 ? Math.PI : 0; me.pitch = -0.04;
    me.pos.y = g.physics.groundHeight(0, 60 * sz, 30);
    for (let i = 0; i < extra; i++) { g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const rig = g.lights.rig;
    const frame = (dt) => { gfx.renderFrame(dt); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
    const measure = (label, ns = 3) => {
      frame(0); frame(0);
      const st = []; let calls = 0, tris = 0;
      for (let i = 0; i < ns; i++) { const a = performance.now(); frame(0); st.push(performance.now() - a); calls = R.info.render.calls; tris = R.info.render.triangles; }
      return { label, steady: Math.round(med(st)), calls, tris };
    };
    // the crowd: which level of detail does each batch carry, how many instances and triangles
    const levelOf = new Map();
    for (const s of SHAPES.values()) s.geo.forEach((geo, l) => { if (geo) levelOf.set(geo, l); });
    const report = () => {
      const per = {};
      for (const b of g.crowd.list) {
        if (!b.n) continue;
        const l = levelOf.has(b.geo) ? 'L' + levelOf.get(b.geo) : 'far';
        const t = b.geo.index.count / 3;
        const key = l + (b.shadow ? '+sh' : '');
        const e = per[key] || (per[key] = { batches: 0, inst: 0, tris: 0, shTris: 0 });
        e.batches++; e.inst += b.n; e.tris += b.n * t;
        if (b.shadow && b.proxy) e.shTris += b.n * (b.proxy.geometry.index.count / 3);
        else if (b.shadow) e.shTris += b.n * t;
      }
      const lods = [0, 0, 0, 0, 0];
      let alive = 0;
      for (const u of g.units) { if (u.alive) alive++; lods[u.lod]++; }
      return { per, units: g.units.length, alive, lods, stats: g.crowd.stats };
    };
    const hideBy = (pred) => { const hid = []; g.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hid.push(o); } }); return () => { for (const o of hid) o.visible = true; }; };
    const V = {
      base: () => () => {},
      crowd: () => hideBy((o) => o.isInstancedMesh && o.customDepthMaterial),
      // keep the soldiers, drop only their shadows
      crowdNoShadow: () => { const prev = []; for (const b of g.crowd.list) { prev.push([b, b.mesh.castShadow, b.proxy && b.proxy.userData.on]); b.mesh.castShadow = false; if (b.proxy) b.proxy.userData.on = false; } return () => { for (const [b, c, p] of prev) { b.mesh.castShadow = c; if (b.proxy) b.proxy.userData.on = p; } }; },
      // the soldiers' vertices only: every fragment of theirs is clipped away by an empty scissor rectangle (their shadows stay)
      crowdVertexOnly: () => {
        const was = R.getScissorTest();
        const meshes = g.crowd.list.map((b) => b.mesh);
        const prev = meshes.map((m) => [m.onBeforeRender, m.onAfterRender]);
        for (const m of meshes) { m.onBeforeRender = (r) => { r.setScissorTest(true); r.setScissor(0, 0, 0, 0); }; m.onAfterRender = (r) => { r.setScissorTest(was); }; }
        return () => { meshes.forEach((m, i) => { m.onBeforeRender = prev[i][0]; m.onAfterRender = prev[i][1]; }); R.setScissorTest(was); };
      },
      terrain: () => hideBy((o) => o.userData && o.userData.owner === 'a3 terrain'),
      grass: () => hideBy((o) => o.userData && o.userData.owner === 'a3 grass'),
      foliage: () => hideBy((o) => o.userData && o.userData.owner === 'a3 foliage'),
      sky: () => hideBy((o) => o.name === 'sky'),
      fx: () => hideBy((o) => /^fx-/.test(o.name || '') || o.isPoints),
      siege: () => hideBy((o) => g.siege.some((s) => s.mesh === o)),
      shadowsOff: () => { g.lights.sun.castShadow = false; return () => { g.lights.sun.castShadow = true; }; },
    };
    const rows = [];
    // the picture first (the frame as the battle left it)
    frame(0); frame(0);
    const shot = R.domElement.toDataURL('image/png');
    const rep = report();
    console.log('ROW ' + JSON.stringify({ label: 'crowd report', ...rep }));
    const list = want.slice();
    if (list[0] !== 'base') list.unshift('base');
    list.push('base');
    for (const name of list) {
      if (!V[name]) { console.log('ROW ' + JSON.stringify({ label: name, error: 'unknown' })); continue; }
      const undo = V[name]();
      const r = measure(name); rows.push(r); console.log('ROW ' + JSON.stringify(r));
      undo();
    }
    return { q: g.quality, units: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length, canvas: [R.domElement.width, R.domElement.height], shot };
  }, [WANT, Number(process.env.FF === undefined ? 6 : process.env.FF), Number(process.env.EXTRA === undefined ? 440 : process.env.EXTRA)]);
  const { shot, ...meta } = out;
  if (process.env.SHOT) require('fs').writeFileSync(process.env.SHOT, Buffer.from(shot.split(',')[1], 'base64'));
  console.log(JSON.stringify(meta));
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
