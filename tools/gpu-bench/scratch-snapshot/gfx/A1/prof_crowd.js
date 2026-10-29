// (usage: CW_PORT=<port> node prof.js <map> <quality> <minutes of game time>; prints JSON)
// Baseline rendering profile: a late-game Conquest battle on the chosen map size, measured the way the page renders it.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high', MINUTES = Number(process.argv[4] || 6);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async ([minutes]) => {
    const g = window.__game, R = g.renderer;
    g.player.buffs.add('ghost', 1e6);
    const t0 = performance.now();
    let upd = 0, frames = 0;
    // play the game forward in 1/20 s steps like the page does, rendering now and then so lazy resources get built
    const steps = Math.round(minutes * 60 * 20);
    for (let i = 0; i < steps; i++) {
      const a = performance.now();
      g.update(0.05); g.ui.update(0.05); g.input.endFrame();
      upd += performance.now() - a; frames++;
    }
    const simMs = performance.now() - t0;
    // finish warming (the page prepares unit looks in the background)
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    const count = {};
    g.scene.traverse((o) => { const k = o.isInstancedMesh ? 'instanced' : o.isMesh ? 'mesh' : o.isLight ? 'light' : o.isGroup ? 'group' : o.isPoints ? 'points' : o.isSprite ? 'sprite' : 'other'; count[k] = (count[k] || 0) + 1; });
    const units = g.units.filter((u) => u.alive).length, siege = g.siege.filter((s) => s.alive).length;
    // render a number of frames and read what the renderer says
    const gl = R.getContext();
    const timeRender = (n) => { const a = performance.now(); for (let i = 0; i < n; i++) R.render(g.scene, g.camera); gl.finish(); return (performance.now() - a) / n; };
    timeRender(2);
    R.info.autoReset = false; R.info.reset();
    const submit = [];
    for (let i = 0; i < 10; i++) { const a = performance.now(); R.render(g.scene, g.camera); submit.push(performance.now() - a); }
    const info = { calls: R.info.render.calls / 10, tris: R.info.render.triangles / 10, points: R.info.render.points / 10, lines: R.info.render.lines / 10, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length };
    const measure = (n = 8) => { R.info.reset(); const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); R.render(g.scene, g.camera); t.push(performance.now() - a); } t.sort((x, y) => x - y); return { calls: Math.round(R.info.render.calls / n), tris: Math.round(R.info.render.triangles / n), medianSubmitMs: +t[Math.floor(n / 2)].toFixed(1) }; };
    const withShadow = measure();
    g.lights.sun.castShadow = false; R.render(g.scene, g.camera); R.render(g.scene, g.camera);   // (a frame to rebuild the shaders)
    const noShadow = measure();
    g.lights.sun.castShadow = true; R.render(g.scene, g.camera); R.render(g.scene, g.camera);
    // what is in view: meshes by how many triangles they carry
    const tri = [];
    g.scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry && o.geometry.attributes && o.geometry.attributes.position) tri.push([o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3, o.isInstancedMesh ? o.count : 1]); });
    const total = tri.reduce((a, [t, n]) => a + t * n, 0);
    // who owns the draw calls: the scene's top-level children, grouped by what they are (visible meshes only)
    const owners = {};
    const guess = (o) => (o.isInstancedMesh ? 'instanced:' + (o.count) : o.isPoints ? 'points' : o.isLight ? 'light' : (o.userData && o.userData.owner) || o.name || (o.children.length > 40 ? 'big group' : 'group' + o.children.length));
    for (const ch of g.scene.children) {
      let meshes = 0, trisN = 0, shadowCasters = 0;
      ch.traverse((o) => { if (o.isMesh && o.visible && o.geometry && o.geometry.attributes.position) { let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return; meshes++; const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); trisN += n; if (o.castShadow) shadowCasters++; } });
      if (meshes) { const k = guess(ch); const t = owners[k] || (owners[k] = { children: 0, meshes: 0, tris: 0, casters: 0 }); t.children++; t.meshes += meshes; t.tris += Math.round(trisN); t.casters += shadowCasters; }
    }
    const unitMeshes = { near: 0, mid: 0, far: 0, hidden: 0 };
    for (const u of g.units) if (u.alive) unitMeshes[['near', 'mid', 'far', 'hidden'][u.lod] || 'hidden']++;
    // the camera at the middle of the map looking over the field
    return { crowd: g.crowd ? g.crowd.stats : null, round: g.round, units, siege, count, info, submitMs: submit.map((x) => +x.toFixed(2)), withShadow, noShadow, sceneTris: Math.round(total), owners, unitLod: unitMeshes, terrainVerts: g.scene.children.filter((c) => c.isMesh && c.geometry && c.geometry.attributes.position.count > 5000).map((c) => c.geometry.attributes.position.count), simMsPerFrame: +(upd / frames).toFixed(2), size: [innerWidth, innerHeight], pr: R.getPixelRatio(), shadowMap: g.lights.sun.shadow.mapSize.x };
  }, [MINUTES]);
  console.log(JSON.stringify(out, null, 1));
    console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
