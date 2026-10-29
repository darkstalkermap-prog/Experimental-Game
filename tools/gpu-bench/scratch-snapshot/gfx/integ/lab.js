// A6 effect lab: puts the camera on an open patch of ground, lets a script fire effects, steps the simulation by hand and writes
// PNGs of the canvas (rendered in the same task, so the picture is exactly the frame after N steps of dt).
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const fs = require('fs');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
fs.mkdirSync(OUT, { recursive: true });

exports.OUT = OUT;
exports.open = async function (o = {}) {
  const W = o.w || 960, H = o.h || 540;
  const { browser, page, errors } = await L.launch({ map: o.map || 'small', quality: o.quality || 'high', viewport: { width: W, height: H }, raf: false });
  await L.startSingle(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6);
    g.paused = false;
    const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
    g.__lab = { home: { x: -48, z: -64 } };
  });
  const api = {
    page, errors, browser,
    // camera: stand at pos = [x, z, extraHeight] relative to home, looking at target = [x, height above ground, z] relative to home
    async cam(pos, target) {
      await page.evaluate(([pos, target]) => {
        const g = window.__game, me = g.player, hm = g.__lab.home;
        g.update(0.0001); g.input.endFrame();   // (flush the mouse movement the page still holds from the click on Play)
        const px = hm.x + pos[0], pz = hm.z + pos[1];
        const gy = g.physics.terrainHeight(px, pz);
        me.pos.set(px, gy + (pos[2] || 0), pz);
        me.vel.set(0, 0, 0);
        const tx = hm.x + target[0], tz = hm.z + target[2], ty = g.physics.terrainHeight(tx, tz) + target[1];
        const dx = tx - px, dz = tz - pz, eye = me.eye || 1.65;
        me.yaw = Math.atan2(dx, dz);
        me.pitch = Math.atan2(ty - (gy + (pos[2] || 0) + eye), Math.hypot(dx, dz));
        me.alive = true; me.hp = me.maxHp;
        me.climb = null; me.climbing = false; me.vmDown = 0; me.climbCd = 9e9;   // no scrambling up the wall next to the lab spot
        g.update(0.0001); g.input.endFrame();
        me.climb = null; me.vmDown = 0; g.update(0.0001); g.input.endFrame();
      }, [pos, target]);
    },
    async run(fn, arg) { return page.evaluate(fn, arg); },
    // step the game dt*steps then render and save
    async shot(name, steps = 0, dt = 1 / 30) {
      const data = await page.evaluate(([steps, dt]) => {
        const g = window.__game;
        for (let i = 0; i < steps; i++) { g.update(dt); g.input.endFrame(); }
        window.__gfx.renderFrame(dt);
        return g.renderer.domElement.toDataURL('image/png');
      }, [steps, dt]);
      fs.writeFileSync(OUT + name + '.png', Buffer.from(data.split(',')[1], 'base64'));
    },
    // like shot, but the camera is put where you say (absolute world x, y, z) after the steps, looking at `look`
    async freeShot(name, steps, camPos, look, dt = 1 / 30) {
      const data = await page.evaluate(([steps, dt, camPos, look]) => {
        const g = window.__game;
        for (let i = 0; i < steps; i++) { g.update(dt); g.input.endFrame(); }
        g.camera.position.set(camPos[0], camPos[1], camPos[2]);
        g.camera.lookAt(look[0], look[1], look[2]);
        g.camera.updateMatrixWorld();
        window.__gfx.renderFrame(dt);
        return g.renderer.domElement.toDataURL('image/png');
      }, [steps, dt, camPos, look]);
      fs.writeFileSync(OUT + name + '.png', Buffer.from(data.split(',')[1], 'base64'));
    },
    async step(steps, dt = 1 / 30) {
      await page.evaluate(([steps, dt]) => { const g = window.__game; for (let i = 0; i < steps; i++) { g.update(dt); g.input.endFrame(); } }, [steps, dt]);
    },
    async close() { console.log('errors:', errors.join('\n') || 'none'); await browser.close(); },
  };
  return api;
};
