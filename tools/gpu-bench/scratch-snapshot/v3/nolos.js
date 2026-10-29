// Why do some archers stand still with no line of sight? Find them and report what blocks the shot.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const map = process.argv[2] || 'medium';
  const { browser, page, errors } = await L.launch({ map });
  await L.startSingle(page);
  await page.evaluate(() => { window.__game.phaseT = 5; });
  const seen = new Map();
  for (let t = 0; t < 300; t += 4) {
    await L.step(page, 4);
    const rows = await page.evaluate(() => {
      const g = window.__game, P = g.physics;
      const out = [];
      for (const u of g.units) {
        if (!u.alive || !u.ranged || !u.target || u.target.isStructure || u.post || u.crewOf) continue;
        if (u.los) continue;
        const c = u.shotOrigin(new u.pos.constructor(), u.target.pos);
        const tp = u.target.aimPoint ? u.target.aimPoint(new u.pos.constructor()) : u.target.chest(new u.pos.constructor());
        // what is in the way?
        let hit = null;
        const d = Math.hypot(tp.x - c.x, tp.z - c.z);
        const steps = Math.ceil(Math.hypot(d, tp.y - c.y) / 0.25);
        for (let i = 1; i < steps; i++) {
          const k = i / steps;
          const col = P.pointHit(c.x + (tp.x - c.x) * k, c.y + (tp.y - c.y) * k, c.z + (tp.z - c.z) * k, u.team);
          if (col) { hit = { kind: col.kind, at: Math.round(k * d), top: +(col.top - c.y).toFixed(1) }; break; }
        }
        out.push({ id: u.id, team: u.team, x: Math.round(u.pos.x), z: Math.round(u.pos.z), tt: u.target.type || u.target.kind, tpost: !!u.target.post, ty: Math.round(u.target.pos.y - u.pos.y), d: Math.round(d), hit, ghost: u.ghostT > 0 ? 1 : 0, order: u.order, lane: u.lane });
      }
      return out;
    });
    for (const r of rows) {
      const h = seen.get(r.id) || { n: 0, first: t };
      h.n++; h.last = r; seen.set(r.id, h);
    }
  }
  const long = [...seen.values()].filter((h) => h.n >= 4);
  const byHit = {};
  for (const h of long) { const k = `${h.last.hit ? h.last.hit.kind : 'nothing'} / target ${h.last.tt}${h.last.tpost ? ' on a wall post' : ''} / ${h.last.lane ? 'lane' : 'other'} ${h.last.order}`; byHit[k] = (byHit[k] || 0) + 1; }
  console.log('archers without a shot for 16 s or more:', long.length);
  console.log(JSON.stringify(byHit, null, 1));
  console.log(JSON.stringify(long.slice(0, 8).map((h) => h.last)));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
