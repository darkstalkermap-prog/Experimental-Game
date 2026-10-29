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
    const clear = (c) => {
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      for (const o of P.near(cx, cz, 8)) if (o !== c && !(o.maxX < cx - 8 || o.minX > cx + 8 || o.maxZ < cz - 8 || o.minZ > cz + 8)) return false;
      return true;
    };
    const c = rocks.find(clear) || rocks[0];
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const fake = (keys) => ({ mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0 }, down: (k) => keys.includes(k), hit: () => false });
    p.pos.set(cx - 4, P.terrainHeight(cx - 4, cz), cz);
    p.vel.set(0, 0, 0); p.yaw = Math.PI / 2;
    const log = [];
    for (let i = 0; i < 120; i++) {
      g.grid.clear(); g.grid.insert(p);
      p.update(1 / 60, fake(['KeyW']));
      if (i % 6 === 0) log.push([i, +(p.pos.x - cx).toFixed(2), +p.pos.y.toFixed(2), +P.terrainHeight(p.pos.x, p.pos.z).toFixed(2), +c.top.toFixed(2), +(c.top - P.terrainHeight(cx, cz)).toFixed(2)]);
    }
    const ts = [-4, -2, -1, 0, 1, 2, 4].map((d) => +P.terrainHeight(cx + d, cz).toFixed(2));
    return { cx, cz, w: c.maxX - c.minX, top: c.top, terr: ts, log, others: [...P.near(cx, cz, 2)].filter((o) => o !== c && o.maxX > cx - 6 && o.minX < cx + 6 && o.maxZ > cz - 6 && o.minZ < cz + 6).map((o) => [o.kind, +o.minX.toFixed(1), +o.maxX.toFixed(1)]) };
  });
  console.log(JSON.stringify(r));
  console.log(errors.join('\n'));
  await browser.close();
})();
