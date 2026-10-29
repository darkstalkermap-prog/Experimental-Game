// Screenshots: mid-climb, on the wall top, ducked behind the merlons, the bodies' crouch and climb poses, the volley circle.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1000, height: 600 }, raf: true });
  await L.startSingle(page);
  await page.waitForTimeout(3500);
  const shot = async (name, ms = 450) => { await page.waitForTimeout(ms); await page.screenshot({ path: S + `v4/${name}.png`, timeout: 60000 }); };
  const hud = (show) => page.evaluate((show) => { document.querySelectorAll('#hud').forEach((e) => { e.style.display = show ? '' : 'none'; }); }, show);
  await page.evaluate(() => window.__game.input.endFrame());
  const only = process.argv[2];
  if (only !== 'volley') {
  // 1. hanging on the wall, half way up (castle 0, back wall, from outside)
  await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    const a = c.toWorld(6, -21.0), b = c.toWorld(6, -10);
    p.pos.set(a.x, g.physics.terrainHeight(a.x, a.z), a.z);
    p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = 0.15; p.vel.set(0, 0, 0); p.stamina = 100;
    p.climb = { t: 40, dur: 100, x0: a.x, y0: p.pos.y, z0: a.z, hx: a.x, hz: a.z, lx: a.x, lz: a.z, top: c.center.y + 8, puff: 0 };
    g.input.keys.clear();
  });
  await hud(false);
  await shot('cd_climb_mid');
  // 2. just landed on the wall top, looking along the wall walk
  await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    p.climb = null;
    const a = c.toWorld(6, -18.6), b = c.toWorld(14, -18.6);
    p.pos.set(a.x, c.center.y + 8, a.z); p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = -0.05; p.onGround = true;
  });
  await shot('cd_walltop');
  // 3. ducked behind a merlon on the wall top, looking out (the merlons cover the view; stand to peer through a gap)
  await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0];
    const a = c.toWorld(5.0, -18.9), b = c.toWorld(5.0, -30);
    p.pos.set(a.x, c.center.y + 8, a.z); p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = -0.02;
    g.input.keys.add('KeyC');
  });
  await shot('cd_duck_view', 900);
  await page.evaluate(() => window.__game.input.keys.delete('KeyC'));
  await shot('cd_stand_view', 900);
  // 4. bodies: a remote hero standing, ducked and climbing, seen from the side
  await page.evaluate(async () => {
    const g = window.__game, p = g.player, c = g.castles[0];
    const mod = await import('/src/player.js');
    const V3 = g.camera.position.constructor;
    window.__ex = [];
    const base = c.toWorld(0, 8);   // inside the courtyard, open ground
    for (let i = 0; i < 3; i++) {
      const h = new mod.Player(g, null, { remote: true, team: 1, name: ['Standing', 'Ducked', 'Climbing'][i], cls: 'ranger' });
      g.humans.push(h);
      h.alive = true;
      h.pos.set(base.x + (i - 1) * 2.4, g.physics.terrainHeight(base.x, base.z), base.z);
      h.yaw = Math.PI / 2;
      h.netPose = { x: h.pos.x, y: h.pos.y + (i === 2 ? 0.0 : 0), z: h.pos.z, yaw: h.yaw, pitch: 0, vx: 0, vz: 0, b: 0, w: 0, m: 0, h: 0, rs: 0, dk: i === 1 ? 1 : 0, cl: i === 2 ? 1 : 0 };
      window.__ex.push(h);
    }
    // park the camera to see them from the side
    p.pos.set(base.x, g.physics.terrainHeight(base.x, base.z), base.z + 7);
    p.yaw = Math.PI; p.pitch = -0.03;
  });
  await shot('cd_bodies', 900);
  }
  // 5. the volley circle: foes 30 m ahead, circle shown, then loosed
  await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    for (const h of (window.__ex || [])) { h.removeBody(); g.humans = g.humans.filter((x) => x !== h); }
    const home = new V3(-48, 0, -64);
    p.setClass('ranger'); p.alive = true; p.abilCd = { q: 0, r: 0 };
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z);
    p.yaw = 0; p.pitch = -0.07;
    window.__dummies = [];
    for (const [dx, dz, t] of [[0, 30, 'swordsman'], [1.5, 31, 'swordsman'], [-1.5, 29, 'spearman'], [2, 28.5, 'swordsman'], [-2.5, 31.5, 'archer'], [0.5, 33, 'swordsman'], [3, 26, 'swordsman'], [-3.5, 27, 'swordsman']]) {
      const u = g.recruit(g.factions[1], t);
      u.pos.set(home.x + dx, g.physics.groundHeight(home.x + dx, home.z + dz, 20), home.z + dz);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
      u.hp = u.maxHp = 400;
      window.__dummies.push(u);
    }
    g.input.keys.add('KeyQ'); g.input.pressed.add('KeyQ');
  });
  await hud(true);
  await shot('cd_volley_aim', 700);
  await page.evaluate(() => { const i = window.__game.input; i.keys.delete('KeyQ'); i.up.add('KeyQ'); });
  await shot('cd_volley_fire', 750);
  await shot('cd_volley_rain', 420);
  await shot('cd_volley_rain2', 330);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
