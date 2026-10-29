const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);
  const out = await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    const key = (code, down = true) => { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } };
    const step = (sec, dt = 1 / 30) => { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } };
    const home = new V3(-48, 0, -64);
    p.setClass('ranger'); p.alive = true; p.abilCd = { q: 0, r: 0 };
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z);
    p.yaw = 0; p.pitch = -Math.atan2(p.eye, 30) * 0.98;
    const r = [];
    r.push({ pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch, eye: p.eye });
    key('KeyQ');
    step(0.1);
    r.push({ pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch, aiming: !!p.aiming, at: p.aiming && [p.aiming.at.x, p.aiming.at.y, p.aiming.at.z], far: p.aiming && p.aiming.far });
    const eye = new V3(p.pos.x, p.pos.y + p.eye, p.pos.z), dir = p.lookDir();
    const ap = g.abilities.aimPoint(eye, dir, 62, 0);
    r.push({ dir: [dir.x, dir.y, dir.z], ap: [ap.pos.x, ap.pos.y, ap.pos.z], far: ap.far, terr: g.physics.terrainHeight(home.x, home.z + 30) });
    return r;
  });
  console.log(JSON.stringify(out));
  await browser.close();
})();
