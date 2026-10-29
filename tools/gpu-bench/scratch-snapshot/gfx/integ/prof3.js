// Why does the plain renderer.render path (gfx/prof.js) count more triangles than gfx.renderFrame in the same state?
// Same warm-up as prof.js, then the same frame counted both ways and attributed by owner for the plain path.
// usage: CW_PORT=8220 node prof3.js <map> <quality> <minutes>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'medium', QUALITY = process.argv[3] || 'high', MINUTES = Number(process.argv[4] || 6);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async ([minutes]) => {
    const THREE = await import('/vendor/three.module.min.js');
    const g = window.__game, R = g.renderer, gfx = window.__gfx;
    g.player.buffs.add('ghost', 1e6);
    const steps = Math.round(minutes * 60 * 20);
    for (let i = 0; i < steps; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    for (let i = 0; i < 60; i++) { g.update(0.05); g.input.endFrame(); }
    const rig = g.lights.rig;
    const cat = new WeakMap();
    const tag = (obj, name) => { if (obj) obj.traverse((o) => cat.set(o, name)); };
    for (const s of (g.scene.userData.worldSystems || [])) { const root = s.group || s.root || s.mesh; if (root) tag(root, s.isTerrain ? 'terrain' : 'foliage'); }
    for (const c of g.castles) tag(c.group, 'castle');
    for (const s of g.siege) tag(s.mesh || s.group, 'siege');
    tag(g.grass && g.grass.mesh, 'grass');
    for (const ch of g.scene.children) if (!cat.has(ch)) { const n = ch.isInstancedMesh && ch.customDepthMaterial ? 'crowd' : (ch.userData && ch.userData.owner) || ch.name || (ch.isInstancedMesh ? 'instanced' : ch.isMesh ? 'mesh' : 'group' + ch.children.length); ch.traverse((o) => { if (!cat.has(o)) cat.set(o, n); }); }
    const stat = { main: {}, near: {}, far: {} };
    let pass = 'main';
    const rec = (obj, group) => {
      const geo = obj.geometry; if (!geo) return;
      const name = cat.get(obj) || 'other:' + (obj.type || '?');
      const b = (stat[pass][name] || (stat[pass][name] = { calls: 0, tris: 0 }));
      const cnt = geo.index ? geo.index.count : geo.attributes.position.count;
      const n = (group ? group.count : cnt) / (obj.isPoints ? 1 : 3) * (obj.isInstancedMesh ? obj.count : 1);
      b.calls++; b.tris += obj.isPoints ? 0 : n;
    };
    const P = THREE.Object3D.prototype;
    P.onBeforeRender = function (r, s, c, geo, mat, grp) { rec(this, grp); };
    P.onBeforeShadow = function (r, o, c, shCam, geo, dm, grp) { const saved = pass; pass = shCam === rig.sun.shadow.camera ? 'near' : 'far'; rec(this, grp); pass = saved; };
    R.info.autoReset = false;
    for (let i = 0; i < 3; i++) R.render(g.scene, g.camera);
    for (const k of ['main', 'near', 'far']) stat[k] = {};
    R.info.reset();
    R.render(g.scene, g.camera);
    const plain = { calls: R.info.render.calls, tris: R.info.render.triangles };
    const snap = JSON.parse(JSON.stringify(stat));
    P.onBeforeRender = () => {}; P.onBeforeShadow = () => {};
    for (const k of ['main', 'near', 'far']) stat[k] = {};
    const cam = g.camera;
    const info = { camera: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(1)), fov: cam.fov, far: cam.far, player: [g.player.pos.x, g.player.pos.z].map((v) => +v.toFixed(1)), thirdPerson: !!g.player.thirdPerson };
    const sum = (o) => Object.values(o).reduce((a, v) => ({ calls: a.calls + v.calls, kTris: Math.round(a.kTris + v.tris / 100) / 10 }), { calls: 0, kTris: 0 });
    const top = (o) => Object.entries(o).map(([k, v]) => [k, v.calls, Math.round(v.tris / 100) / 10]).sort((a, b) => b[2] - a[2]).slice(0, 12);
    return { plain, info, main: sum(snap.main), near: sum(snap.near), far: sum(snap.far), topMain: top(snap.main), topNear: top(snap.near), topFar: top(snap.far) };
  }, [MINUTES]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
