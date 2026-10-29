// What a frame costs on the software GPU, component by component, in a late-battle frame (same flow and camera as the integrator's gputime.js).
// usage: CW_PORT=8240 node cost.js <quality> [ablations: all | comma list | none] [WxH=1280x720] [map=small] [seed=1]
// Each ablation is applied on its own to the same frame and then undone. Every number is the median of steady frames (the far shadow map is
// not redrawn: dt = 0) and the 'far' column adds one frame that redraws the far map; amort = steady + (far - steady) / 4 (the map is redrawn at 15 Hz).
const S = __dirname + '/';
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'high';
const WANT = (process.argv[3] || 'all');
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
const MAP = process.argv[5] || 'small', SEED = Number(process.argv[6] || 1);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((seed) => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = seed >>> 0;   // a seeded Math.random: the same battle every run
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, SEED);
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, [MAP, QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.text().startsWith('ROW ')) { const r = JSON.parse(m.text().slice(4)); console.log(String(r.label).padEnd(22), String(r.steady).padStart(7), String(r.far).padStart(7), String(r.amort).padStart(7), String(r.calls).padStart(6), String(r.tris).padStart(8), r.error || ''); return; } if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const out = await page.evaluate(async ([want, ff, extra]) => {
    const THREE = await import('three'); const { LordAI } = await import('/src/ai.js');
    const { Q } = await import('/src/quality.js');
    const { terrainMaterial } = await import('/src/terrainmat.js');
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
    // steady frames (the far map is not redrawn), then frames that redraw it
    const measure = (label, ns = 3, nf = 2) => {
      frame(0); frame(0);   // (compile whatever the change needs)
      const st = [], fr = [];
      let calls = 0, tris = 0;
      for (let i = 0; i < ns; i++) { const a = performance.now(); frame(0); st.push(performance.now() - a); calls = R.info.render.calls; tris = R.info.render.triangles; }
      for (let i = 0; i < nf; i++) { rig.far.shadow.needsUpdate = true; const a = performance.now(); frame(0); fr.push(performance.now() - a); }
      const s = Math.round(med(st)), f = Math.round(med(fr));
      return { label, steady: s, far: f, amort: Math.round(s + (f - s) / 4), calls, tris };
    };
    const rows = [];
    const hideBy = (pred) => { const hid = []; g.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hid.push(o); } }); return () => { for (const o of hid) o.visible = true; }; };
    const own3 = (name) => (o) => o.userData && o.userData.owner === name;
    const castleRoots = new Set(g.castles.map((c) => c.group));
    const keep = JSON.parse(JSON.stringify({ post: Q.post, msaa: Q.msaa, shadowMap: Q.shadowMap, shadowNearMap: Q.shadowNearMap }));
    const postSet = (patch, msaa) => { Object.assign(Q.post, patch); if (msaa !== undefined) Q.msaa = msaa; gfx.resize(true); };
    const postBack = () => { Object.assign(Q.post, keep.post); Q.msaa = keep.msaa; gfx.resize(true); };
    const terr = g.scene.children.find((o) => o.userData && o.userData.owner === 'a3 terrain');
    const terrMeshes = [];
    terr.traverse((o) => { if (o.isMesh) terrMeshes.push(o); });
    const swapTerrain = (lv) => { const prev = terrMeshes.map((m) => m.material); const mat = terrainMaterial(lv); for (const m of terrMeshes) m.material = mat; return () => { terrMeshes.forEach((m, i) => { m.material = prev[i]; }); }; };
    const taps = rig.sun.shadow.radius;
    const ABL = {
      cBasic: () => { const ms = []; for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) ms.push(o); }); const prev = ms.map((m) => m.material); const cache = new Map(); const bas = (m) => { if (!cache.has(m)) cache.set(m, new THREE.MeshBasicMaterial({ color: m.color ? m.color : 0x888888, map: m.map || null, vertexColors: !!m.vertexColors, side: m.side })); return cache.get(m); }; ms.forEach((m) => { m.material = Array.isArray(m.material) ? m.material.map(bas) : bas(m.material); }); return () => { ms.forEach((m, i) => { m.material = prev[i]; }); }; },
      cNoNormal: () => { const mats = new Set(); for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); }); const prev = [...mats].map((m) => [m, m.normalMap]); for (const [m] of prev) { m.normalMap = null; m.needsUpdate = true; } return () => { for (const [m, n] of prev) { m.normalMap = n; m.needsUpdate = true; } }; },
      cNoMap: () => { const mats = new Set(); for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); }); const prev = [...mats].map((m) => [m, m.map, m.normalMap]); for (const [m] of prev) { m.map = null; m.normalMap = null; m.needsUpdate = true; } return () => { for (const [m, a, n] of prev) { m.map = a; m.normalMap = n; m.needsUpdate = true; } }; },
      cNoRecv: () => { const ms = []; for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) ms.push([o, o.receiveShadow]); }); for (const [o] of ms) o.receiveShadow = false; return () => { for (const [o, r] of ms) o.receiveShadow = r; }; },
      cNoCast: () => { const ms = []; for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) ms.push([o, o.castShadow]); }); for (const [o] of ms) o.castShadow = false; return () => { for (const [o, r] of ms) o.castShadow = r; }; },
      cAniso1: () => { const texs = new Set(); for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v); }); }); const prev = [...texs].map((t) => [t, t.anisotropy]); for (const t of texs) { t.anisotropy = 1; t.needsUpdate = true; } return () => { for (const [t, a] of prev) { t.anisotropy = a; t.needsUpdate = true; } }; },
      cCount: () => { let tris = 0, meshes = 0; for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); console.log('ROW ' + JSON.stringify({ label: 'castle meshes ' + meshes + ' tris ' + tris, steady: 0, far: 0, amort: 0, calls: 0, tris: 0 })); return () => {}; },
      all: () => () => {},
      sky: () => hideBy((o) => o.name === 'sky'),
      terrainChunks: () => hideBy((o) => o.userData && o.userData.chunk),
      terrainFar: () => hideBy((o) => o.userData && o.userData.far),
      terrain: () => hideBy(own3('a3 terrain')),
      terrainFlat: () => swapTerrain(0),
      terrainDetail: () => swapTerrain(1),
      foliage: () => hideBy(own3('a3 foliage')),
      grass: () => hideBy(own3('a3 grass')),
      crowd: () => hideBy((o) => o.isInstancedMesh && o.customDepthMaterial),
      castles: () => hideBy((o) => castleRoots.has(o)),
      siege: () => hideBy((o) => g.siege.some((s) => s.mesh === o)),
      fx: () => hideBy((o) => /^fx-/.test(o.name || '') || o.isPoints),
      shadowsOff: () => { g.lights.sun.castShadow = false; return () => { g.lights.sun.castShadow = true; }; },
      oneCascade: () => { rig.twoMaps = false; return () => { rig.twoMaps = true; }; },
      taps4: () => { rig.sun.shadow.radius = taps - Math.floor(taps / 16) * 16 + 4 * 16; return () => { rig.sun.shadow.radius = taps; }; },
      taps1: () => { rig.sun.shadow.radius = taps - Math.floor(taps / 16) * 16 + 1 * 16; return () => { rig.sun.shadow.radius = taps; }; },
      postOff: () => { postSet({ bloom: false, aa: false, vignette: false, grade: false }, 0); return postBack; },
      noBloom: () => { postSet({ bloom: false }); return postBack; },
      noAA: () => { postSet({ aa: false }); return postBack; },
      noGradeVig: () => { postSet({ vignette: false, grade: false }); return postBack; },
      msaa0: () => { postSet({}, 0); return postBack; },
      msaa2: () => { postSet({}, 2); return postBack; },
      msaa4: () => { postSet({}, 4); return postBack; },
      px75: () => { const k = Q.pixelRatio; Q.pixelRatio = 0.75; gfx.resize(true); return () => { Q.pixelRatio = k; gfx.resize(true); }; },
      px50: () => { const k = Q.pixelRatio; Q.pixelRatio = 0.5; gfx.resize(true); return () => { Q.pixelRatio = k; gfx.resize(true); }; },
      empty: () => hideBy((o) => o.parent === g.scene && !o.isLight && !o.isCamera),
      noEnv: () => { const e = g.scene.environment; g.scene.environment = null; return () => { g.scene.environment = e; }; },
      terrainNoRecv: () => { const prev = terrMeshes.map((m) => m.receiveShadow); for (const m of terrMeshes) m.receiveShadow = false; return () => { terrMeshes.forEach((m, i) => { m.receiveShadow = prev[i]; }); }; },
      aniso1: () => {
        const texs = new Set();
        g.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v); const u = R.properties.get(m).uniforms; if (u) for (const x of Object.values(u)) if (x && x.value && x.value.isTexture) texs.add(x.value); } });
        const prev = [...texs].map((t) => [t, t.anisotropy]);
        for (const t of texs) { t.anisotropy = 1; t.needsUpdate = true; }
        return () => { for (const [t, a] of prev) { t.anisotropy = a; t.needsUpdate = true; } };
      },
      rt11: () => {
        const post = gfx.post, mk = post.makeRT;
        post.makeRT = function (w, h, opts = {}) { const rt = mk.call(this, w, h, opts); if (opts.depthBuffer) rt.texture.internalFormat = 'R11F_G11F_B10F'; return rt; };
        post.release(); gfx.resize(true);
        return () => { post.makeRT = mk; post.release(); gfx.resize(true); };
      },
    };
    const list = want === 'all' ? Object.keys(ABL) : want === 'none' ? [] : want.split(',');
    // a baseline first and last: the drift of the machine shows in the difference
    rows.push(measure('baseline')); console.log('ROW ' + JSON.stringify(rows[0]));
    for (const name of list) {
      if (name === 'all') continue;
      const parts = name.split('+');
      if (parts.some((p) => !ABL[p])) { rows.push({ label: name, error: 'unknown' }); continue; }
      const undos = [];
      try {
        for (const p of parts) undos.push(ABL[p]());
        const r = measure(name); rows.push(r); console.log('ROW ' + JSON.stringify(r));
      } catch (e) { rows.push({ label: name, error: String(e && e.message || e).slice(0, 80) }); console.log('ROW ' + JSON.stringify(rows[rows.length - 1])); }
      for (let i = undos.length - 1; i >= 0; i--) { try { undos[i](); } catch (e) { /* ignore */ } }
    }
    rows.push(measure('baseline again')); console.log('ROW ' + JSON.stringify(rows[rows.length - 1]));
    return { q: g.quality, units: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length, canvas: [R.domElement.width, R.domElement.height], post: !!(gfx.post && gfx.post.active), msaa: Q.msaa, rows };
  }, [WANT, Number(process.env.FF === undefined ? 6 : process.env.FF), Number(process.env.EXTRA === undefined ? 440 : process.env.EXTRA)]);   // (FF=0 EXTRA=0: no battle at all, a scene that is the same every run)
  const { rows, ...meta } = out;
  console.log(JSON.stringify(meta));
  const last = rows[rows.length - 1];
  console.log('final baseline', last.steady, last.far, last.amort);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
