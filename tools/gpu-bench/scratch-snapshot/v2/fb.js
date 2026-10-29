const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const out = await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    const home = new V3(-48, 0, -64);
    p.setClass('mage');
    p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z); p.yaw = 0; p.pitch = 0;
    const f1 = g.factions[1];
    const u = g.recruit(f1, 'swordsman'); u.pos.set(home.x, g.physics.groundHeight(home.x, home.z + 20, 20), home.z + 20);
    u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.hp = u.maxHp = 400; u.attackTimer = 99;
    g.update(0.001);
    const log = [];
    const ex = g.projectiles.explode.bind(g.projectiles);
    g.projectiles.explode = (pr, at, col) => { log.push(['explode', at.x.toFixed(1), at.y.toFixed(1), at.z.toFixed(1), col ? col.kind : null]); ex(pr, at, col); };
    const probe = g.projectiles.hitCharacter(new V3(u.pos.x, u.pos.y + 1.4, u.pos.z), 0, 0.35, new Set());
    log.push(['probe', !!probe, 'unit alive', u.alive, 'team', u.team, 'height', u.height, 'radius', u.radius]);
    let cnt = 0; g.grid.query(u.pos.x, u.pos.z, 3, (o) => { cnt++; }); log.push(['grid count near unit', cnt, 'units', g.units.length]);
    const cam = p.camera.position.clone();
    log.push(['cam', cam.x, cam.y, cam.z, 'unit', u.pos.x, u.pos.y, u.pos.z]);
    g.abilities.use(p, 'q', cam, new V3(0, 0, 1));
    const pr = g.projectiles.list[0];
    log.push(['proj', pr.pos.x.toFixed(1), pr.pos.y.toFixed(1), pr.pos.z.toFixed(1), pr.vel.x, pr.vel.y.toFixed(2), pr.vel.z, pr.dmg, pr.radius]);
    for (let i = 0; i < 40; i++) {
      g.update(1 / 30);
      const q = g.projectiles.list[0];
      if (q && i >= 10 && i <= 16) { const hc = g.projectiles.hitCharacter(q.pos, 0, 0.35, new Set()); g.grid.query(q.pos.x, q.pos.z, 1.55, (o) => { log.push(['  cand', o.type, o.alive, o.team, (q.pos.x - o.pos.x).toFixed(2), (q.pos.z - o.pos.z).toFixed(2), 'y', q.pos.y.toFixed(2), o.pos.y.toFixed(2), o.height, o.radius]); }); let n = 0; g.grid.query(q.pos.x, q.pos.z, 3, () => n++); log.push(['t' + i, q.pos.x.toFixed(2), q.pos.y.toFixed(2), q.pos.z.toFixed(2), 'hc', !!hc, 'grid', n, 'unitz', u.pos.z.toFixed(2), 'hitSet', q.hitSet.size]); }
    }
    log.push(['hp', u.hp, u.alive]);
    return log;
  });
  for (const l of out) console.log(l.join(' '));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
