// G2 experiments: the fixed scene (same three cameras as gfx/fixed.js) measured under several in-page VARIANTS in one browser session.
// usage: CW_PORT=<port> [SHOT=<dir>] [VARS=<file>] node exp.js <quality> <variant,variant,...> [WxH=1280x720] [map=small]
// A variant is source text in variants.js: (c) => { ...; return undo; } with c = { Q, gfx, R, g, THREE, rig, post(patch, msaa), repost() }.
// Every variant is applied, measured (median of 5 steady frames per view, ms) and undone. SHOT saves <dir>/<variant>_<view>.png.
const { chromium } = require('playwright');
const fs = require('fs');
const QUALITY = process.argv[2] || 'high', NAMES = (process.argv[3] || 'base').split(',');
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
const MAP = process.argv[5] || 'small';
const VARS = require(process.env.VARS || '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/G2/variants.js');
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
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('ROW ')) { const r = JSON.parse(t.slice(4)); if (r.shots && process.env.SHOT) { fs.mkdirSync(process.env.SHOT, { recursive: true }); for (const [v, url] of Object.entries(r.shots)) fs.writeFileSync(`${process.env.SHOT}/${r.name}_${QUALITY}_${v}.png`, Buffer.from(url.split(',')[1], 'base64')); delete r.shots; } console.log(JSON.stringify(r)); return; }
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + t.slice(0, 160));
  });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/' + (process.env.QS || ''), { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const defs = {}; for (const n of NAMES) { if (!VARS[n]) { console.error('unknown variant', n); process.exit(2); } defs[n] = VARS[n]; }
  await page.evaluate(async ([defs, names, wantShots]) => {
    const { Q } = await import('/src/quality.js');
    const THREE = await import('three');
    const g0 = window.__game, R = g0.renderer, gfx = window.__gfx;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    g.phaseT = 1e6;
    for (let i = 0; i < 120; i++) { g.update(0.05); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const draw = () => gfx.renderFrame(0);
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    const dx = c0.center.x / (Math.hypot(c0.center.x, c0.center.z) || 1), dz = c0.center.z / (Math.hypot(c0.center.x, c0.center.z) || 1);
    const views = {
      castle: [c0.gateOut.x - dx * 38, c0.gateOut.z - dz * 38, Math.atan2(dx, dz), -0.05, 1.7],
      field: [0, 60 * sz, sz > 0 ? Math.PI : 0, -0.04, 1.7],
      sun: [-10, 20, 2.4, 0.05, 2.5],
    };
    const keep = JSON.parse(JSON.stringify({ post: Q.post, msaa: Q.msaa }));
    const c = {
      Q, gfx, R, g, THREE, rig: g.lights.rig,
      post(patch, msaa) { Object.assign(Q.post, patch); if (msaa !== undefined) Q.msaa = msaa; gfx.resize(true); },
      repost() { Object.assign(Q.post, keep.post); Q.msaa = keep.msaa; gfx.resize(true); },
    };
    for (const name of names) {
      let undo = null, err = null;
      try { undo = eval(defs[name])(c); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
      const row = { name, q: Q.name };
      if (err) row.error = err;
      else {
        const shots = {};
        for (const [vn, [x, z, yaw, pitch, h]] of Object.entries(views)) {
          me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
          me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
          for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
          draw(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          const t = [];
          for (let i = 0; i < 5; i++) { const a = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
          row[vn] = Math.round(med(t));
          if (wantShots) { draw(); shots[vn] = R.domElement.toDataURL('image/png'); }
        }
        row.mean = Math.round((row.castle + row.field + row.sun) / 3);
        row.calls = R.info.render.calls; row.tris = R.info.render.triangles; row.programs = R.info.programs ? R.info.programs.length : 0;
        if (wantShots) row.shots = shots;
      }
      console.log('ROW ' + JSON.stringify(row));
      if (undo) { try { undo(); } catch (e) { /* ignore */ } }
    }
  }, [defs, NAMES, !!process.env.SHOT]);
  console.log('errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
