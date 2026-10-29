const { launch, startSingle, step } = require('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/simlib.js');
const map = process.argv[2] || 'medium';
const minutes = Number(process.argv[3] || 6);
(async () => {
  const { browser, page, errors } = await launch({ map });
  await startSingle(page);
  // let the player's house run on the AI so it also buys and fields troops
  await page.evaluate(() => { const g = window.__game; const f = g.factions[0]; import('./src/ai.js').then(m => { f.ai = new m.LordAI(g, f); f.ai.cooldown = 1e9; }); g.phaseT = 5; });
  await step(page, 0.5);
  const hist = new Map();   // id -> [{t,x,z}]
  const flagged = new Map();
  const report = [];
  const total = minutes * 60;
  for (let t = 0; t < total; t += 4) {
    await step(page, 4);
    const rows = await page.evaluate(() => {
      const g = window.__game;
      return g.units.filter(u => u.alive && u.lane).map(u => ({
        id: u.id, team: u.team, type: u.type, x: u.pos.x, z: u.pos.z, y: u.pos.y, order: u.order, ghost: u.ghostT > 0 ? 1 : 0,
        tgt: u.target ? (u.target.isStructure ? u.target.kind : u.target.isSiege ? 'siege' : u.target.type || 'hero') : null,
        tdist: u.target ? Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) : null,
        dest: u.orderData && u.orderData.keepDoor ? Math.hypot(u.orderData.keepDoor.x - u.pos.x, u.orderData.keepDoor.z - u.pos.z) : null,
        tc: u.orderData && u.orderData.team !== undefined ? u.orderData.team : null,
        inCastle: (() => { const c = g.castleAt(u.pos); return c ? c.team : -1; })(),
        blocked: u.blockedBy ? u.blockedBy.kind : null, post: !!u.post, ranged: u.ranged, los: u.los, range: u.range, siegeOrder: 0,
        nearest: (() => { let b = -1, bd = 1e9; for (const c of g.castles) { const d = Math.hypot(c.center.x - u.pos.x, c.center.z - u.pos.z); if (d < bd) { bd = d; b = c.team; } } return [b, Math.round(bd)]; })(),
      }));
    });
    const now = t + 4;
    for (const r of rows) {
      const h = hist.get(r.id) || [];
      h.push({ t: now, x: r.x, z: r.z, r });
      hist.set(r.id, h);
      // compare to ~16 s ago
      const old = h.find(e => now - e.t >= 16 && now - e.t <= 20);
      if (old) {
        const disp = Math.hypot(r.x - old.x, r.z - old.z);
        // moving window all through? require every sample in the window to be close to the old point
        const win = h.filter(e => e.t >= old.t);
        const maxDev = Math.max(...win.map(e => Math.hypot(e.x - old.x, e.z - old.z)));
        if (maxDev < 2.5 && !r.post) {
          let kind;
          if (r.tgt) {
            if (r.ranged) kind = r.tdist !== null && r.tdist <= r.range + 1 && r.los ? 'shooting' : (r.tdist > r.range + 1 ? 'archer-chase-stuck' : 'archer-no-LOS');
            else kind = r.tdist !== null && r.tdist < 4.2 ? 'fighting' : 'melee-chase-stuck';
          } else kind = r.dest !== null && r.dest < 8 ? 'arrived' : 'STUCK-no-target';
          if (kind.includes('stuck') || kind.includes('STUCK') || kind === 'archer-no-LOS') {
            if (!flagged.has(r.id)) { flagged.set(r.id, { kind, t: now, r }); }
          }
        }
      }
    }
    if (t % 60 === 56) {
      const alive = rows.length;
      const tops = await page.evaluate(() => { const g = window.__game; return { round: g.round, fallen: g.castles.map(c => c.fallen), gate: g.castles.map(c => Math.round(c.gate.hp)), keep: g.castles.map(c => Math.round(c.keep.hp)), lane: [0,1,2,3].map(x => g.laneCount(x)), garr: [0,1,2,3].map(x => g.garrisonCount(x)), siege: g.siege.filter(s => s.alive).length }; });
      console.log(`t=${now}s lane units alive ${alive}`, JSON.stringify(tops));
    }
  }
  console.log('flagged units:', flagged.size);
  const byKind = {};
  for (const [id, f] of flagged) {
    const k = f.kind + ' @' + (f.r.inCastle >= 0 ? 'inside castle ' + f.r.inCastle : 'near castle ' + f.r.nearest[0] + ' d=' + Math.round(f.r.nearest[1] / 10) * 10) + (f.r.blocked ? ' blockedBy=' + f.r.blocked : '') + (f.r.tgt ? ' tgt=' + f.r.tgt : '');
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log(JSON.stringify(byKind, null, 1));
  const samples = [...flagged.values()].slice(0, 8).map(f => ({ t: f.t, kind: f.kind, type: f.r.type, team: f.r.team, pos: [Math.round(f.r.x), Math.round(f.r.z)], tc: f.r.tc, dest: f.r.dest && Math.round(f.r.dest), tgt: f.r.tgt, tdist: f.r.tdist && Math.round(f.r.tdist), inCastle: f.r.inCastle, near: f.r.nearest, ghost: f.r.ghost, blocked: f.r.blocked }));
  console.log(JSON.stringify(samples));
  console.log('errors:', errors.slice(0, 5).join('\n'));
  await browser.close();
})();
