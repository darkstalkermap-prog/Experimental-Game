// Siege engine close-ups: one engine on open ground, the camera at a chosen distance, canvas written to a PNG.
// usage: CW_PORT=8240 node engines.js <tag> <quality> [views] [WxH=960x540] [map=small]
//   views: comma list of  <kind>:<dist>[:<az>[:<eye>[:<look>]]]   kind ram|cat, dist metres from the engine's middle, az = degrees of the camera round the
//   sun side (default 28), eye = camera height above the ground (default 1.7), look = height of the point looked at (default 1.7)
//   default: ram:4.5,ram:10,ram:40,cat:4.5,cat:10,cat:40,ram:10:28:6.5:2.5,cat:10:28:6.5:2.5,ram:10:200,cat:10:200
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const fs = require('fs');
const TAG = process.argv[2] || 'e', QUALITY = process.argv[3] || 'high';
const VIEWS = (process.argv[4] && process.argv[4] !== 'default' ? process.argv[4] : 'ram:4.5,ram:10,ram:40,cat:4.5,cat:10,cat:40,ram:10:28:6.5:2.5,cat:10:28:6.5:2.5,ram:10:200,cat:10:200').split(',');
const [W, H] = (process.argv[5] || '960x540').split('x').map(Number);
const MAP = process.argv[6] || 'small';
const OUT = (process.env.OUT || S + 'gfx/gpu/out/').replace(/\/?$/, '/');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: W, height: H } });
  await L.startSingle(page);
  await page.evaluate(async () => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6); g.paused = false;
    const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
    if (g.player.vm) g.player.vm.root.visible = false;   // (no sword and shield in the picture)
    const { SiegeEngine } = await import('/src/siege.js');
    window.__SiegeEngine = SiegeEngine;
    g.__lab = { home: { x: -48, z: -64 }, engines: {} };
  });
  for (const spec of VIEWS) {
    const [kind, dist, az, eye, look, pose] = spec.split(':');
    const url = await page.evaluate(([kind, dist, az, eye, look, pose]) => {
      const g = window.__game, hm = g.__lab.home;
      const type = kind === 'ram' ? 'ram' : 'catapult';
      let e = g.__lab.engines[type];
      const camAz = Math.atan2(-0.55, 0.45) + (Number(az === undefined ? 28 : az)) * Math.PI / 180;   // (the sun stands towards -x, +z)
      if (!e) {
        e = g.__lab.engines[type] = new window.__SiegeEngine(g, type, 0, new g.player.pos.constructor(hm.x, 0, hm.z), g.castles[1]);
        e.abandoned = true;   // (nobody drives it)
      }
      for (const k of Object.keys(g.__lab.engines)) g.__lab.engines[k].mesh.visible = k === type;   // (one engine at a time)
      if (e.arm) e.arm.rotation.x = pose === 'fired' ? -1.45 : pose === 'mid' ? -0.4 : 0.55;
      if (e.log) e.log.position.z = pose === 'fired' ? 1.0 : pose === 'mid' ? 0.0 : -0.8;
      const gy = g.physics.groundHeight(hm.x, hm.z, 40);
      e.pos.set(hm.x, gy, hm.z); e.yaw = camAz - 0.75;
      e.mesh.position.copy(e.pos); e.mesh.rotation.set(0, e.yaw, 0);
      e.mesh.updateMatrixWorld(true);
      const d = Number(dist), ey = Number(eye === undefined ? 1.7 : eye), ly = Number(look === undefined ? 1.7 : look);
      const cx = hm.x + Math.sin(camAz) * d, cz = hm.z + Math.cos(camAz) * d;
      const cy = g.physics.groundHeight(cx, cz, 40) + ey;
      g.camera.position.set(cx, cy, cz);
      g.camera.lookAt(hm.x, gy + ly, hm.z);
      g.camera.updateMatrixWorld(true);
      const gfx = window.__gfx;
      for (let i = 0; i < 3; i++) gfx.renderFrame(0.016);
      return g.renderer.domElement.toDataURL('image/png');
    }, [kind, dist, az, eye, look, pose]);
    const name = `${TAG}_${QUALITY}_${spec.replace(/:/g, '_')}`;
    fs.writeFileSync(OUT + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved', name);
  }
  console.log('errors', JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})();
