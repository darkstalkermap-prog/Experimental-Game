// C: RoomNet (claude.ai live room) and PeerNet smoke test: host + 2 clients, actions, >= 2 simulated minutes, optional 300-unit stress.
const { session, startMatch, step, syncCheck } = require('./mplib');
const transport = process.argv[2] || 'room';
const big = process.argv.includes('big');
const coop = process.argv.includes('coop');
(async () => {
  const S = await session(transport);
  const { page: host, code } = await S.host('Arthur');
  const c1 = await S.join(code, 'Gwen', 'c1');
  const c2 = await S.join(code, 'Lance', 'c2');
  console.log(transport, 'room', code, coop ? 'coop' : 'versus', big ? 'BIG' : '');
  await startMatch(S, host, [c1, c2], { coop });
  const all = [host, c1, c2];
  let fails = 0;
  const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : '')); };
  const report = (label, r) => {
    const h = r.hs;
    ok(`${label}: wave ${h.round}/${h.phase} t-${h.phaseT}, units ${h.units}, lane ${h.laneByTeam}, siege ${h.siegeCount}, levies ${h.levies}`, r.diffs.length === 0, r.diffs.slice(0, 5).join(' | '));
  };
  // instrument the host's sender (RoomNet only)
  if (transport === 'room') {
    await host.evaluate(() => {
      const net = window.__game.net;
      window.__snap = [];
      const orig = net.sendSnapshot.bind(net);
      net.sendSnapshot = (s, me) => {
        const t0 = performance.now();
        orig(s, me);
        const ms = performance.now() - t0;
        const pieces = [];
        for (let i = 1; i < net.rooms.length; i++) {
          const peer = net.rooms[i].peers().find((p) => p.sameTab);
          const c = peer && peer.presence && peer.presence.c;
          if (c && c.sid === net.sid) pieces.push({ i, bytes: JSON.stringify(c).length, u: c.u.length, s: c.s.length, ev: c.ev.length });
        }
        window.__snap.push({ ms, n: pieces.length, bytes: pieces.reduce((a, p) => a + p.bytes, 0), maxPiece: Math.max(...pieces.map((p) => p.bytes)), unitsSent: pieces.reduce((a, p) => a + p.u, 0), unitsAvail: s.u.length, siegeSent: pieces.reduce((a, p) => a + p.s, 0), siegeAvail: s.s.length, evSent: pieces.reduce((a, p) => a + p.ev, 0), evAvail: s.ev.length, every: net.snapEvery });
      };
    });
  }
  await step(all, 3);
  report('t=3', await syncCheck(host, [c1, c2]));
  // client actions
  const acts = await c1.evaluate(() => { const g = window.__game; return [g.buyForPlayer('levies'), g.buyForPlayer('recruit_archer')]; });
  await c2.evaluate(() => { const g = window.__game; g.setSiegeTarget(g.castles[3]); g.localFormation(); });
  await step(all, 3);
  const hv = await host.evaluate(() => { const g = window.__game; return { lev1: g.factions[1].levies, tgt2: g.factions[2].siegeTarget && g.factions[2].siegeTarget.team, form2: g.factions[2].formation }; });
  ok('client actions reach the host ' + JSON.stringify(hv), hv.lev1 === 1 && hv.tgt2 === 3);
  await c2.evaluate(() => { const g = window.__game; g.ui.toggleShop(true); g.ui.tab = 'siege'; g.ui.renderShop(); g.ui.autoBtn.click(); g.ui.toggleShop(false); });
  await step(all, 2);
  ok('Auto lanes reaches the host', (await host.evaluate(() => window.__game.factions[2].siegeTarget)) === null);
  for (const T of [30, 40, 40, 40]) {
    await step(all, T);
    report('t=' + (await host.evaluate(() => Math.round(window.__game.time))), await syncCheck(host, [c1, c2]));
  }
  if (transport === 'room') {
    const st = await host.evaluate(() => window.__snap.slice(-20));
    const avg = (k) => Math.round(st.reduce((a, s) => a + s[k], 0) / st.length * 10) / 10;
    console.log('RoomNet snapshots (last 20): pieces', avg('n'), 'bytes', avg('bytes'), 'maxPiece', Math.max(...st.map((s) => s.maxPiece)), 'every', avg('every'), 's', 'units sent/avail', avg('unitsSent'), '/', avg('unitsAvail'), 'events sent/avail', avg('evSent'), '/', avg('evAvail'));
  }
  if (big) {
    // ~300 units: every house at its maximum army, plus engines
    await host.evaluate(() => {
      const g = window.__game;
      g.phaseT = 1e9;
      for (const f of g.factions) {
        f.troopCap = 36;
        const types = ['swordsman', 'spearman', 'archer', 'knight', 'horseman', 'swordsman', 'archer'];
        while (g.laneCount(f.team) < 36) { const u = g.recruit(f, types[g.units.length % types.length], true); u.setOrder('assault', g.siegeTarget(f)); }
        while (g.garrisonCount(f.team) < 36) g.recruit(f, types[g.units.length % types.length]);
        for (let k = 0; k < 2; k++) g.buildSiege(f, k ? 'catapult' : 'ram');
      }
      window.__snap = [];
    });
    await step(all, 12);
    const info = await host.evaluate(() => ({ units: window.__game.units.length, alive: window.__game.units.filter((u) => u.alive).length, siege: window.__game.siege.length }));
    console.log('stress world:', JSON.stringify(info));
    if (transport === 'room') {
      const st = await host.evaluate(() => window.__snap.slice(-30));
      const avg = (k) => Math.round(st.reduce((a, s) => a + s[k], 0) / st.length * 10) / 10;
      console.log('RoomNet BIG snapshots: pieces', avg('n'), 'bytes', avg('bytes'), 'every', avg('every'), 's  units sent/avail', avg('unitsSent'), '/', avg('unitsAvail'), ' engines', avg('siegeSent'), '/', avg('siegeAvail'), ' effects', avg('evSent'), '/', avg('evAvail'), ' host ms/snapshot', avg('ms'));
      ok('no unit is dropped from a snapshot at 300 units', st.every((s) => s.unitsSent === s.unitsAvail && s.siegeSent === s.siegeAvail));
    }
    report('BIG t=' + (await host.evaluate(() => Math.round(window.__game.time))), await syncCheck(host, [c1, c2]));
    const rate = await c1.evaluate(() => window.__game.net.snapEvery);
    console.log('snapshot interval', rate);
  }
  console.log('errors:', S.errors.length ? '\n' + S.errors.slice(0, 10).join('\n') : 'none');
  console.log(fails ? `RESULT(${transport}): ${fails} problem(s)` : `RESULT(${transport}): all passed`);
  await S.close();
})().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
