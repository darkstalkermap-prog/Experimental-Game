// A4: do the shadow maps keep a fixed texel grid in the world while the camera moves? (that is what stops the shimmer)
// For a handful of fixed world points, the sub-texel phase of their shadow-map coordinates must not change with the camera.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'medium', quality: process.argv[2] || 'high', viewport: { width: 320, height: 200 } });
  const out = await page.evaluate(() => {
    const g = window.__game, rig = g.lights.rig, cam = g.camera;
    const pts = [[3.3, 1.1, -7.9], [40.2, 0.3, 12.7], [-18.5, 2.0, 33.1], [0.77, 5.0, 0.12]];
    const phase = (light) => {
      const sh = light.shadow;
      sh.updateMatrices(light);
      const res = [];
      for (const p of pts) {
        const v = new (cam.position.constructor)(p[0], p[1], p[2]).applyMatrix4(sh.matrix);
        res.push([(v.x * sh.mapSize.x) % 1, (v.y * sh.mapSize.y) % 1]);
      }
      return res;
    };
    const worst = { near: 0, far: 0 };
    let ref = null, farMoves = 0, prevFar = null;
    for (let i = 0; i < 60; i++) {
      // wander: walk, turn and look about
      const a = i * 0.37;
      cam.position.set(Math.sin(a) * 25 + i * 0.173, 1.7 + Math.sin(a * 3) * 0.4, Math.cos(a * 1.3) * 25 - i * 0.211);
      cam.rotation.set(Math.sin(a * 2) * 0.3, a * 1.9, 0, 'YXZ');
      cam.updateMatrixWorld(true);
      rig.update(cam, 0.016);
      const n = phase(rig.sun), f = phase(rig.far);
      const cur = { n, f };
      if (!ref) ref = cur;
      const frac = (d) => Math.min(Math.abs(d), Math.abs(Math.abs(d) - 1));   // (a phase of 0.999 equals one of -0.001)
      for (let k = 0; k < pts.length; k++) {
        for (let c = 0; c < 2; c++) {
          worst.near = Math.max(worst.near, frac(n[k][c] - ref.n[k][c]));
          worst.far = Math.max(worst.far, frac(f[k][c] - ref.f[k][c]));
        }
      }
      const key = rig.far.target.position.x.toFixed(3) + ',' + rig.far.target.position.z.toFixed(3);
      if (key !== prevFar) { farMoves++; prevFar = key; }
    }
    return { worst, farMoves, nearR: rig.near.R, farR: rig.farC.R, nearTexel: rig.near.texel, farTexel: rig.farC.texel, taps: rig.sun.shadow.radius, farRadius: rig.far.shadow.radius, sizes: [rig.sun.shadow.mapSize.x, rig.far.shadow.mapSize.x] };
  });
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
