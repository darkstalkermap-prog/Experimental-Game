// Find soldiers that stand still far from their target and say why.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const map = process.argv[2] || 'small';
  const until = Number(process.argv[3] || 240);
  const { browser, page, errors } = await L.launch({ map });
  await L.startSingle(page);
  await page.evaluate(() => { window.__game.phaseT = 5; window.__hist = new Map(); });
  const sample = () => page.evaluate(() => {
    const g = window.__game;
    for (const u of g.units) {
      if (!u.alive || u.post || u.crewOf) continue;
      const h = window.__hist.get(u.id) || [];
      h.push([g.time, u.pos.x, u.pos.z]);
      if (h.length > 6) h.shift();
      window.__hist.set(u.id, h);
    }
  });
  for (let t = 0; t < until; t += 3) { await L.step(page, 3); await sample(); }
  const rows = await page.evaluate(() => {
    const g = window.__game, P = g.physics;
    const out = [];
    for (const u of g.units) {
      if (!u.alive || u.post || u.crewOf || !u.lane) continue;
      const h = window.__hist.get(u.id);
      if (!h || h.length < 5) continue;
      const dev = Math.max(...h.map((e) => Math.hypot(e[1] - h[0][1], e[2] - h[0][2])));
      if (dev > 2) continue;
      const tc = u.orderData;
      const near = [...P.near(u.pos.x, u.pos.z, 3)].filter((c) => c.active && Math.max(c.minX - u.pos.x, u.pos.x - c.maxX, c.minZ - u.pos.z, u.pos.z - c.maxZ) < 1.2).map((c) => `${c.kind}:${Math.round(c.minX)},${Math.round(c.minZ)}..${Math.round(c.maxX)},${Math.round(c.maxZ)} top ${(c.top - u.pos.y).toFixed(1)}`);
      out.push({
        id: u.id, team: u.team, type: u.type, pos: [Math.round(u.pos.x), Math.round(u.pos.z), +u.pos.y.toFixed(1)], order: u.order, tc: tc && tc.team,
        target: u.target ? (u.target.kind || u.target.type) : null, tdist: u.target ? Math.round(Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z)) : null,
        goal: u.goal ? [Math.round(u.goal.x), Math.round(u.goal.z)] : null, wp: u.waypoint ? [Math.round(u.waypoint.x), Math.round(u.waypoint.z), ] : null,
        blockedBy: u.blockedBy && u.blockedBy.kind, nav: u.nav ? u.nav.phase : null, ghost: u.ghostT > 0 ? 1 : 0, stuckCount: u.stuckCount,
        castleHere: (() => { const c = g.castleAt(u.pos); return c ? c.team : -1; })(), near, los: u.los, vel: [+u.vel.x.toFixed(1), +u.vel.z.toFixed(1)],
        gateOpen: g.castles.map((c) => +c.gate.openAmt.toFixed(1)),
      });
    }
    return out;
  });
  console.log('stationary lane units:', rows.length);
  for (const r of rows.slice(0, 14)) console.log(JSON.stringify(r));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
