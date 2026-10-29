// A: Node relay transport, host + 2 clients, Versus, 4 simulated minutes of waves with client actions.
const { session, startMatch, step, syncCheck } = require('./mplib');
(async () => {
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const c1 = await S.join(code, 'Gwen', 'c1');
  const c2 = await S.join(code, 'Lance', 'c2');
  console.log('room', code);
  await startMatch(S, host, [c1, c2], { coop: false });
  const all = [host, c1, c2];
  let fails = 0;
  const report = (label, r) => {
    const bad = r.diffs.length;
    if (bad) fails += bad;
    const h = r.hs;
    console.log(`${bad ? 'DIFF' : ' ok '} ${label}: wave ${h.round}/${h.phase} t-${h.phaseT} units ${h.units} (lane ${h.laneByTeam}) siege ${h.siegeCount} gold ${h.gold} levies ${h.levies} target ${h.target}`);
    for (const d of r.diffs.slice(0, 8)) console.log('      ', d);
  };
  await step(all, 3);
  report('t=3 initial', await syncCheck(host, [c1, c2]));

  // ---- client actions while preparing
  const act = await c1.evaluate(() => { const g = window.__game; const r = [g.buyForPlayer('levies'), g.buyForPlayer('recruit_archer')]; g.localFormation(); g.localToggleGate(); return { r, gold: Math.floor(g.localFaction.gold), form: g.localFaction.formation, locked: g.localFaction.castle.gateLocked }; });
  console.log('c1 actions', JSON.stringify(act));
  await c2.evaluate(() => { const g = window.__game; g.setSiegeTarget(g.castles[3]); });
  await step(all, 2);
  report('t=5 after buys/target/formation/gate', await syncCheck(host, [c1, c2]));
  const hv = await host.evaluate(() => { const g = window.__game; return { levies1: g.factions[1].levies, target2: g.factions[2].siegeTarget && g.factions[2].siegeTarget.team, form1: g.factions[1].formation, locked1: g.castles[1].gateLocked, garrison1: g.garrisonCount(1) }; });
  console.log('host sees', JSON.stringify(hv));
  if (hv.levies1 !== 1 || hv.target2 !== 3 || hv.locked1 !== true) { fails++; console.log('FAIL host did not apply client actions'); }
  // unbar the gate again so the army can march
  await c1.evaluate(() => window.__game.localToggleGate());

  // ---- the Siege tab buttons (Auto lanes + a castle)
  const ui1 = await c2.evaluate(() => { const g = window.__game, ui = g.ui; ui.toggleShop(true); ui.tab = 'siege'; ui.renderShop(); const labels = ui.targetBtns.map((t) => t.b.textContent); const auto = ui.autoBtn && ui.autoBtn.textContent; ui.autoBtn.click(); const afterAuto = g.localFaction.siegeTarget; ui.targetBtns[0].b.click(); const afterPick = g.localFaction.siegeTarget && g.localFaction.siegeTarget.team; const pickTeam = ui.targetBtns[0].c.team; ui.toggleShop(false); return { labels, auto, afterAuto: afterAuto && afterAuto.team, afterPick, pickTeam }; });
  console.log('c2 siege tab', JSON.stringify(ui1));
  await step(all, 1);
  const t1 = await host.evaluate(() => window.__game.factions[2].siegeTarget && window.__game.factions[2].siegeTarget.team);
  console.log('host target for c2 after picking castle', ui1.pickTeam, '->', t1);
  if (t1 !== ui1.pickTeam) { fails++; console.log('FAIL siege target not applied on host'); }
  await c2.evaluate(() => { const g = window.__game; g.ui.toggleShop(true); g.ui.tab = 'siege'; g.ui.renderShop(); g.ui.autoBtn.click(); g.ui.toggleShop(false); });
  await step(all, 1);
  const t2 = await host.evaluate(() => window.__game.factions[2].siegeTarget);
  console.log('host target for c2 after Auto lanes ->', t2);
  if (t2 !== null) { fails++; console.log('FAIL Auto lanes not applied on host'); }

  // ---- let the battle run
  for (const T of [20, 40, 40, 40, 40, 40]) {
    await step(all, T);
    report(`t=${await host.evaluate(() => Math.round(window.__game.time))}`, await syncCheck(host, [c1, c2]));
  }
  // orders from a client
  await c1.evaluate(() => { const g = window.__game; g.localOrder('charge'); });
  await c2.evaluate(() => { const g = window.__game; g.localOrder('assault'); });
  await step(all, 2);
  const orders = await host.evaluate(() => { const g = window.__game; const by = (t) => g.units.filter((u) => u.alive && u.team === t && !u.isHero).reduce((m, u) => { m[u.order] = (m[u.order] || 0) + 1; return m; }, {}); return { team1: by(1), team2: by(2) }; });
  console.log('orders applied on host', JSON.stringify(orders));
  console.log('errors:', S.errors.length ? '\n' + S.errors.slice(0, 10).join('\n') : 'none');
  console.log(fails ? `RESULT: ${fails} problem(s)` : 'RESULT: all in sync');
  await S.close();
})().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
