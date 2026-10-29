// Integration profile: a late-game battle measured on the real frame path (gfx.renderFrame), with every draw call and triangle
// attributed to the part of the scene that owns it, separately for the main pass and each shadow cascade.
// usage: CW_PORT=8220 node prof2.js <map> <quality> <minutes> [view: field|castle]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high', MINUTES = Number(process.argv[4] || 6), VIEW = process.argv[5] || 'field';
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async ([minutes, view]) => {
    const THREE = await import('/vendor/three.module.min.js');
    const g = window.__game, R = g.renderer, gfx = window.__gfx;
    g.player.buffs.add('ghost', 1e6);
    const t0 = performance.now();
    const steps = Math.round(minutes * 60 * 20);
    let upd = 0;
    for (let i = 0; i < steps; i++) { const a = performance.now(); g.update(0.05); g.ui.update(0.05); g.input.endFrame(); upd += performance.now() - a; }
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    if (view === 'field') {
      const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
      me.pos.set(0, 0, 60 * sz); me.vel.set(0, 0, 0); me.yaw = sz > 0 ? Math.PI : 0; me.pitch = -0.04;
      me.pos.y = g.physics.groundHeight(0, 60 * sz, 30);
    }
    g.update(0.02);
    const rig = g.lights.rig;
    // ---- who owns what: the top-level child of the scene an object hangs under, named by what it is ----
    const cat = new WeakMap();
    const nameOf = (ch) => {
      if (ch.isInstancedMesh && ch.customDepthMaterial) return 'crowd';
      if (ch.userData && ch.userData.owner) return ch.userData.owner;
      if (ch.isLight) return 'light';
      if (ch.isPoints) return 'points';
      if (ch === g.player.root || ch.parent === g.camera) return 'camera';
      return ch.name || (ch.isInstancedMesh ? 'instanced' : ch.isMesh ? 'mesh' : 'group' + ch.children.length);
    };
    // castles, terrain etc. are found by identity where the game keeps a reference
    const tag = (obj, name) => { if (obj) obj.traverse((o) => cat.set(o, name)); };
    const terr = (g.scene.userData.worldSystems || []);
    for (const s of terr) { const root = s.group || s.root || s.mesh; if (root) tag(root, s.isTerrain ? 'terrain' : 'foliage'); }
    for (const c of g.castles) tag(c.group, 'castle');
    for (const s of g.siege) tag(s.mesh || s.group, 'siege');
    tag(g.grass && g.grass.mesh, 'grass');
    for (const ch of g.scene.children) if (!cat.has(ch)) { const n = nameOf(ch); ch.traverse((o) => { if (!cat.has(o)) cat.set(o, n); }); }
    const bucket = () => ({ calls: 0, tris: 0 });
    const stat = { main: {}, near: {}, far: {} };
    let pass = 'main';
    const rec = (obj, group) => {
      const geo = obj.geometry; if (!geo) return;
      const name = cat.get(obj) || 'other:' + (obj.type || '?');
      const b = (stat[pass][name] || (stat[pass][name] = bucket()));
      const cnt = geo.index ? geo.index.count : geo.attributes.position.count;
      const n = (group ? group.count : cnt) / (obj.isPoints ? 1 : 3) * (obj.isInstancedMesh ? obj.count : 1);
      b.calls++; b.tris += obj.isPoints ? 0 : n;
    };
    const P = THREE.Object3D.prototype;
    const oBR = P.onBeforeRender, oBS = P.onBeforeShadow;
    P.onBeforeRender = function (r, s, c, geo, mat, grp) { rec(this, grp); };
    P.onBeforeShadow = function (r, o, c, shCam, geo, dm, grp) { const saved = pass; pass = shCam === rig.sun.shadow.camera ? 'near' : 'far'; rec(this, grp); pass = saved; };
    const frames = (n, force) => {
      const calls = [], tris = [], ms = [];
      for (let i = 0; i < n; i++) {
        if (force) rig.far.shadow.needsUpdate = true;
        const a = performance.now(); gfx.renderFrame(1 / 60);
        ms.push(performance.now() - a); calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
      }
      const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
      return { calls: Math.round(med(calls)), tris: Math.round(med(tris)), ms: +med(ms).toFixed(1) };
    };
    for (let i = 0; i < 6; i++) gfx.renderFrame(1 / 60);   // (shaders, warm-up)
    // one frame with both cascades drawn, attributed
    for (const k of ['main', 'near', 'far']) stat[k] = {};
    rig.far.shadow.needsUpdate = true;
    gfx.renderFrame(1 / 60);
    const attributed = JSON.parse(JSON.stringify(stat));
    P.onBeforeRender = oBR; P.onBeforeShadow = oBS;
    const sunCast = g.lights.sun.castShadow;
    const withBoth = frames(10, true);
    const nearOnly = frames(10, false);
    g.lights.sun.castShadow = false; for (let i = 0; i < 3; i++) gfx.renderFrame(1 / 60);
    const noShadow = frames(10, false);
    g.lights.sun.castShadow = sunCast; for (let i = 0; i < 4; i++) gfx.renderFrame(1 / 60);
    const meshes = {}; let visible = 0;
    g.scene.traverse((o) => { if (o.isMesh || o.isPoints) { visible++; meshes[o.isInstancedMesh ? 'instanced' : o.isPoints ? 'points' : 'mesh'] = (meshes[o.isInstancedMesh ? 'instanced' : o.isPoints ? 'points' : 'mesh'] || 0) + 1; } });
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { calls: v.calls, kTris: Math.round(v.tris / 100) / 10 }]));
    return {
      map: g.mapBuiltFor, view, round: g.round, units: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length,
      simMsPerFrame: +(upd / steps).toFixed(2), withBoth, nearOnly, noShadow,
      main: round(attributed.main), near: round(attributed.near), far: round(attributed.far),
      mem: { geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length }, meshes,
      post: !!(gfx.post && gfx.post.active), canvas: [R.domElement.width, R.domElement.height],
    };
  }, [MINUTES, VIEW]);
  const sum = (o) => Object.values(o).reduce((a, v) => ({ calls: a.calls + v.calls, kTris: +(a.kTris + v.kTris).toFixed(1) }), { calls: 0, kTris: 0 });
  console.log(JSON.stringify({ ...out, totals: { main: sum(out.main), near: sum(out.near), far: sum(out.far) } }, null, 1));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
