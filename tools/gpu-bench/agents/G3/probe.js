// G3 probe: why do castle pixels cost so much? Runs in the fixed scene of gfx/fixed.js (same three cameras) and prints, per view:
//   over   : castle pixel share and fragment overdraw (counter materials, additive, in the real draw order), per material group
//   order  : the main-pass draw order of the opaque objects (who draws before whom)
//   abl    : milliseconds with one thing switched off (castle meshes by material key, receiveShadow, maps...)
// usage: CW_PORT=8263 node probe.js <quality> <over|order|abl|all> [WxH=1280x720]    (through b.sh)
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'high', WHAT = process.argv[3] || 'all';
const [W, H] = (process.argv[4] || '1280x720').split('x').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('OUT ')) console.log(t.slice(4)); else if (m.type() === 'error' && !/404|Failed to load resource/.test(t)) errors.push('console: ' + t); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  const heat = await page.evaluate(async ([what, W, H, wantHeat, vw]) => {
    window.__wantViews = vw;
    if (wantHeat) window.__heat = {};
    window.__views = (window.__wantViews || 'castle,field,sun').split(',');
    const THREE = await import('three');
    const out = (s) => console.log('OUT ' + s);
    const g0 = window.__game, R = g0.renderer;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    g.phaseT = 1e6;
    for (let i = 0; i < 120; i++) { g.update(0.05); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const draw = () => window.__gfx.renderFrame(0);
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    const dx = c0.center.x / (Math.hypot(c0.center.x, c0.center.z) || 1), dz = c0.center.z / (Math.hypot(c0.center.x, c0.center.z) || 1);
    const views = {
      castle: [c0.gateOut.x - dx * 38, c0.gateOut.z - dz * 38, Math.atan2(dx, dz), -0.05, 1.7],
      field: [0, 60 * sz, sz > 0 ? Math.PI : 0, -0.04, 1.7],
      sun: [-10, 20, 2.4, 0.05, 2.5],
      yard: [c0.spawnPoint.x, c0.spawnPoint.z, c0.rot, 0, 1.7],             // where a match starts: the courtyard, facing the gate
      keep: [c0.spawnPoint.x, c0.spawnPoint.z, c0.rot + Math.PI, 0, 1.7],   // the same spot facing the keep
      gate: [c0.gateOut.x - dx * 12, c0.gateOut.z - dz * 12, Math.atan2(dx, dz), 0.1, 1.7],   // 12 m outside the gate, looking at the wall
    };
    if (window.__views) for (const k of Object.keys(views)) if (!window.__views.includes(k)) delete views[k];
    const place = ([x, z, yaw, pitch, h]) => {
      me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
      me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
      for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
    };
    const castleMeshes = [];
    for (const c of g.castles) c.group.traverse((o) => { if (o.isMesh) castleMeshes.push(o); });
    const castleRoots = new Set(g.castles.map((c) => c.group));
    const keyOf = (m) => {   // which materials() entry a mesh uses
      const M = g.castles[0].mats;
      for (const k of Object.keys(M)) { const v = M[k]; if (v === m.material) return k; if (Array.isArray(v) && v.includes(m.material)) return k + v.indexOf(m.material); }
      return m.material === g.castles[0].clothMat || /cloth/i.test(m.material.type) ? 'cloth' : (m.material.name || m.material.type);
    };
    const trisOf = (m) => Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3);
    if (what === 'all' || what === 'mesh') {
      const rows = castleMeshes.filter((m) => m.parent === g.castles[0].group).map((m) => `${keyOf(m)}:${trisOf(m)}t${m.castShadow ? ':C' : ''}${m.receiveShadow ? ':R' : ''}:s${m.material.side}`);
      out('castle0 meshes ' + rows.join('  '));
      out('all castle meshes ' + castleMeshes.length + ' tris ' + castleMeshes.reduce((s, m) => s + trisOf(m), 0));
    }
    // ---------------- overdraw
    if (what === 'all' || what === 'over') {
      const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, samples: 0, type: THREE.FloatType });
      const buf = new Float32Array(W * H * 4);
      const groupOf = (k) => (/^masonry$/.test(k) ? 0 : /^(timber|tiles)$/.test(k) ? 1 : 2);   // 0 = R, 1 = G, 2 = B
      const sorted = [...new Set(castleMeshes.map((m) => m.material))].sort((a, b) => a.id - b.id);   // (keep the relative draw order)
      const ctr = new Map();
      for (const m of sorted) {
        const k = keyOf(castleMeshes.find((x) => x.material === m));
        const c = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, fog: false, side: m.side, toneMapped: false });
        c.color.setRGB(groupOf(k) === 0 ? 1 : 0, groupOf(k) === 1 ? 1 : 0, groupOf(k) === 2 ? 1 : 0);
        ctr.set(m, c);
      }
      for (const [name, v] of Object.entries(views)) {
        place(v);
        const hid = [], prev = castleMeshes.map((m) => m.material);
        g.scene.traverse((o) => { if (o !== g.scene && o.visible && !castleRoots.has(o) && !o.isCamera) { let p = o, inC = false; while (p) { if (castleRoots.has(p)) { inC = true; break; } p = p.parent; } if (!inC && (o.parent === g.scene)) { o.visible = false; hid.push(o); } } });
        castleMeshes.forEach((m) => { m.material = ctr.get(m.material); });
        const sh = R.shadowMap.enabled; R.shadowMap.enabled = false;
        const bg = g.scene.background, fog = g.scene.fog; g.scene.background = null; g.scene.fog = null;
        R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(); R.render(g.scene, g.camera); R.setRenderTarget(null);
        R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        g.scene.background = bg; g.scene.fog = fog; R.shadowMap.enabled = sh;
        castleMeshes.forEach((m, i) => { m.material = prev[i]; }); hid.forEach((o) => { o.visible = true; });
        const tot = [0, 0, 0], cov = [0, 0, 0]; let all = 0, covered = 0; const hist = new Array(8).fill(0);
        for (let i = 0; i < W * H; i++) {
          const r = Math.round(buf[i * 4]), gg = Math.round(buf[i * 4 + 1]), b = Math.round(buf[i * 4 + 2]), s = r + gg + b;
          tot[0] += r; tot[1] += gg; tot[2] += b; cov[0] += r > 0; cov[1] += gg > 0; cov[2] += b > 0;
          all += s; if (s > 0) { covered++; hist[Math.min(7, s)]++; }
        }
        if (window.__heat) window.__heat[name] = (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'), im = cx.createImageData(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = ((H - 1 - y) * W + x) * 4; im.data[j] = Math.min(255, buf[i] * 40); im.data[j + 1] = Math.min(255, buf[i + 1] * 40); im.data[j + 2] = Math.min(255, buf[i + 2] * 40); im.data[j + 3] = 255; } cx.putImageData(im, 0, 0); return c.toDataURL('image/png'); })();
        const pct = (x) => (100 * x / (W * H)).toFixed(1) + '%';
        out(`over ${name}: castle px ${pct(covered)} of frame, fragments/px ${(all / Math.max(1, covered)).toFixed(2)}, total frags ${(all / (W * H)).toFixed(2)}/frame-px; by group (frags,px) masonry ${pct(tot[0])},${pct(cov[0])} timber+roof ${pct(tot[1])},${pct(cov[1])} other ${pct(tot[2])},${pct(cov[2])}; layers hist 1..7+ ${hist.slice(1).map((x) => (100 * x / Math.max(1, covered)).toFixed(0)).join('/')}`);
      }
      rt.dispose();
    }
    // ---------------- draw order of the opaque objects in the main pass
    if (what === 'all' || what === 'order') {
      for (const name of ['castle', 'field']) {
        place(views[name]);
        const log = []; const objs = [];
        g.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) objs.push(o); });
        const saved = objs.map((o) => o.onBeforeRender);
        objs.forEach((o, i) => { o.onBeforeRender = function (r, sc, cam, geo, mat) { if (cam === g.camera && !log.some((l) => l.o === o)) log.push({ o, mat }); }; });
        draw(); draw();
        objs.forEach((o, i) => { o.onBeforeRender = saved[i]; });
        const rows = log.map((l) => { let p = l.o, tag = ''; while (p) { if (p.userData && p.userData.owner) { tag = p.userData.owner; break; } if (castleRoots.has(p)) { tag = 'castle'; break; } p = p.parent; } return `${tag || l.o.name || l.o.type}/${l.mat.type.replace('Material', '')}#${l.mat.id}${l.mat.transparent ? 'T' : ''}`; });
        // compress runs
        const comp = []; for (const r of rows) { if (comp.length && comp[comp.length - 1][0] === r) comp[comp.length - 1][1]++; else comp.push([r, 1]); }
        out(`order ${name}: ` + comp.map(([r, n]) => (n > 1 ? n + 'x ' : '') + r).join(' | '));
      }
    }
    // ---------------- masonry material swaps (what does the stone cost, by part)
    if (what === 'mat') {
      const frame = () => { draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      const measure = (n = 4) => { frame(); frame(); const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); frame(); t.push(performance.now() - a); } return med(t); };
      const mas = castleMeshes.filter((m) => keyOf(m) === 'masonry');
      const m0 = mas[0].material;
      const swap = (mk) => { const nm = mk(); const prev = mas.map((m) => m.material); mas.forEach((m) => { m.material = nm; }); return () => mas.forEach((m, i) => { m.material = prev[i]; }); };
      const abl = {
        base: () => () => {},
        hideMasonry: () => { mas.forEach((m) => { m.visible = false; }); return () => mas.forEach((m) => { m.visible = true; }); },
        basicMap: () => swap(() => new THREE.MeshBasicMaterial({ map: m0.map, vertexColors: true })),
        basicFlat: () => swap(() => new THREE.MeshBasicMaterial({ vertexColors: true })),
        lambertMap: () => swap(() => new THREE.MeshLambertMaterial({ map: m0.map, vertexColors: true })),
        stdNoWeather: () => swap(() => new THREE.MeshStandardMaterial({ map: m0.map, normalMap: m0.normalMap, vertexColors: true, roughness: 0.95 })),
        stdNoWeatherNoNormal: () => swap(() => new THREE.MeshStandardMaterial({ map: m0.map, vertexColors: true, roughness: 0.95 })),
        stdFlat: () => swap(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
        noRecv: () => { const s = mas.map((m) => m.receiveShadow); mas.forEach((m) => { m.receiveShadow = false; }); return () => mas.forEach((m, i) => { m.receiveShadow = s[i]; }); },
        noCast: () => { const s = mas.map((m) => m.castShadow); mas.forEach((m) => { m.castShadow = false; }); return () => mas.forEach((m, i) => { m.castShadow = s[i]; }); },
        noCastNoRecv: () => { const s = mas.map((m) => [m.castShadow, m.receiveShadow]); mas.forEach((m) => { m.castShadow = false; m.receiveShadow = false; }); return () => mas.forEach((m, i) => { m.castShadow = s[i][0]; m.receiveShadow = s[i][1]; }); },
      };
      for (const [name, v] of Object.entries(views)) {
        place(v);
        const line = [];
        for (const [an, fn] of Object.entries(abl)) { const undo = fn(); const t = Math.round(measure()); undo(); line.push(`${an} ${t}`); }
        out(`mat ${name}: ` + line.join(' | '));
      }
    }
    // ---------------- ablations
    if (what === 'all' || what === 'abl') {
      const frame = () => { draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      const measure = (n = 4) => { frame(); frame(); const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); frame(); t.push(performance.now() - a); } return med(t); };
      const keys = [...new Set(castleMeshes.map(keyOf))];
      const hide = (pred) => { const h = castleMeshes.filter(pred); h.forEach((m) => { m.visible = false; }); return () => h.forEach((m) => { m.visible = true; }); };
      const abl = {
        none: () => () => {},
        castlesHidden: () => { const h = [...castleRoots]; h.forEach((o) => { o.visible = false; }); return () => h.forEach((o) => { o.visible = true; }); },
        noRecv: () => { const s = castleMeshes.map((m) => m.receiveShadow); castleMeshes.forEach((m) => { m.receiveShadow = false; }); return () => castleMeshes.forEach((m, i) => { m.receiveShadow = s[i]; }); },
      };
      for (const k of keys) abl['hide ' + k] = () => hide((m) => keyOf(m) === k);
      const res = {};
      for (const [name, v] of Object.entries(views)) {
        place(v);
        const line = [];
        for (const [an, fn] of Object.entries(abl)) {
          const undo = fn(); const t = Math.round(measure()); undo(); line.push(`${an} ${t}`);
        }
        out(`abl ${name}: ` + line.join(' | '));
      }
    }
    return window.__heat || null;
  }, [WHAT, W, H, !!process.env.SHOT, process.env.VIEWS || 'castle,field,sun']);
  if (heat && process.env.SHOT) { const fs = require('fs'); const [dir, tag] = process.env.SHOT.split(':'); fs.mkdirSync(dir, { recursive: true }); for (const [n, u] of Object.entries(heat)) fs.writeFileSync(`${dir}/${tag}_${n}.png`, Buffer.from(u.split(',')[1], 'base64')); }
  console.log('errors', errors.length, errors.slice(0, 2).join(' ; '));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
