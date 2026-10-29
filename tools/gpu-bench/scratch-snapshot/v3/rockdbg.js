const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const r = await page.evaluate(() => {
    const g = window.__game, P = g.physics, p = g.player;
    const seen = new Set(); const rocks = [];
    for (const list of P.grid.values()) for (const c of list) {
      if (seen.has(c)) continue; seen.add(c);
      if (c.kind === 'stone' && c.noWalk && (c.maxX - c.minX) / 2 < 3 && Math.hypot((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) > 30) rocks.push(c);
    }
    const c = rocks[0];
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const fake = (keys) => ({ mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0 }, down: (k) => keys.includes(k), hit: () => false });
    p.pos.set(cx - 4, P.terrainHeight(cx - 4, cz), cz);
    p.vel.set(0, 0, 0); p.yaw = Math.PI / 2;
    const log = [];
    for (let i = 0; i < 240; i++) {
      g.grid.clear(); g.grid.insert(p);
      p.update(1 / 60, fake(['KeyW']));
      if (i % 12 === 0) log.push([i, +(p.pos.x - cx).toFixed(2), +(p.pos.z - cz).toFixed(2), +p.pos.y.toFixed(2), +P.terrainHeight(p.pos.x, p.pos.z).toFixed(2), +c.top.toFixed(2), p.onGround, +p.vy.toFixed(2)]);
    }
    return { cx, cz, c: { minX: c.minX, maxX: c.maxX, top: c.top, kind: c.kind, noWalk: c.noWalk, active: c.active }, log, mounted: p.mounted, alive: p.alive, radius: p.radius, height: p.height, dash: !!p.dash, drive: !!p.drive };
  });
  console.log(JSON.stringify(r, null, 0));
  console.log(errors.join('\n'));
  await browser.close();
})();
