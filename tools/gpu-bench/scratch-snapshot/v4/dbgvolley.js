const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);
  await page.evaluate(() => window.__game.input.endFrame());
  const out = await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    const key = (code, down = true) => { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } };
    const step = (sec, dt = 1 / 30) => { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } };
    const home = new V3(-48, 0, -64);
    const f1 = g.factions[1];
    const dummies = [];
    const place = (type, dx, dz) => {
      const u = g.recruit(f1, type);
      u.pos.set(home.x + dx, g.physics.groundHeight(home.x + dx, home.z + dz, 20), home.z + dz);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
      u.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };
      u.hp = u.maxHp = 400; dummies.push(u); return u;
    };
    p.setClass('ranger'); p.alive = true; p.abilCd = { q: 0, r: 0 };
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z); p.yaw = 0;
    const pack = [place('swordsman', 0, 30), place('swordsman', 1.5, 31), place('swordsman', -1.5, 29), place('spearman', 2, 28.5), place('swordsman', -2.5, 31.5), place('archer', 0.5, 33)];
    g.update(0.001);
    const log = { dmg: [], stick: [], targets: [] };
    const dm = g.damage.bind(g);
    g.damage = (t, a, o, i) => { if (o === p) log.dmg.push([pack.indexOf(t), Math.round(a), t.pos.x - home.x, t.pos.z - home.z]); return dm(t, a, o, i); };
    const st = g.projectiles.stick.bind(g.projectiles);
    g.projectiles.stick = (i, pr, at) => { if (pr.owner === p) log.stick.push([+(at.x - home.x).toFixed(1), +(at.z - home.z).toFixed(1), +at.y.toFixed(1)]); return st(i, pr, at); };
    const fa = g.projectiles.fireArrow.bind(g.projectiles);
    g.projectiles.fireArrow = (from, vel, team, dmg, owner) => { if (owner === p) log.targets.push([+(from.x - home.x).toFixed(1), +(from.z - home.z).toFixed(1), +from.y.toFixed(1), +vel.x.toFixed(1), +vel.y.toFixed(1), +vel.z.toFixed(1)]); return fa(from, vel, team, dmg, owner); };
    p.pitch = -Math.atan2(p.eye, 30) * 0.98;
    log.trials = [];
    for (let t = 0; t < 8; t++) {
      for (const u of pack) u.hp = 400;
      log.dmg.length = 0; log.stick.length = 0;
      p.abilCd = { q: 0, r: 0 };
      key('KeyQ'); step(0.35);
      key('KeyQ', false); step(3.5);
      log.trials.push({ hits: log.dmg.length, perUnit: pack.map((u, i) => log.dmg.filter((d) => d[0] === i).length), stuck: log.stick.length });
    }
    delete log.dmg; delete log.stick; delete log.targets;
    return log;
  });
  console.log(JSON.stringify(out));
  await browser.close();
})();
