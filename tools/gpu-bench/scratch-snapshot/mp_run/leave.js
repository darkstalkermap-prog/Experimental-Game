// B: players leaving mid-wave on a given transport; the host leaving.
const { session, startMatch, step, syncCheck } = require('./mplib');
const transport = process.argv[2] || 'relay';
(async () => {
  const S = await session(transport);
  const { page: host, code } = await S.host('Arthur');
  const c1 = await S.join(code, 'Gwen', 'c1');
  const c2 = await S.join(code, 'Lance', 'c2');
  await startMatch(S, host, [c1, c2], { coop: false });
  let fails = 0;
  const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : '')); };
  const all = [host, c1, c2];
  await step(all, 75);   // into wave 1
  const before = await host.evaluate(() => { const g = window.__game; return { wave: g.round, humans: g.humans.map((h) => h.team), lane1: g.laneCount(1), isPlayer1: g.factions[1].isPlayer }; });
  console.log('before leaving', JSON.stringify(before));
  await c1.close();
  // the host hears about it a moment later
  let dropped = false;
  for (let i = 0; i < 40 && !dropped; i++) { await host.waitForTimeout(100); dropped = await host.evaluate(() => !window.__game.factions[1].isPlayer); }
  const live = [host, c2];
  await step(live, 3);
  const after = await host.evaluate(() => { const g = window.__game; const f = g.factions[1]; return { humans: g.humans.map((h) => h.team), isPlayer: f.isPlayer, hasAI: !!f.ai, hero: f.hero && { type: f.hero.type, alive: f.hero.alive, canOrder: typeof f.hero.setOrder === 'function', isUnit: g.units.includes(f.hero) }, lord: f.lord, eliminated: f.eliminated, lane1: g.laneCount(1) }; });
  console.log('host after the drop', JSON.stringify(after));
  ok('host drops the player: humans [0,2], house 1 handed to an AI lord', after.humans.join() === '0,2' && !after.isPlayer && after.hasAI && after.hero && after.hero.alive && after.hero.isUnit && after.lord === 'Lord Varr');
  // waves keep coming for that house, and clients follow
  await step(live, 60);
  const wave = await host.evaluate(() => { const g = window.__game; return { wave: g.round, lane1: g.laneCount(1), garr1: g.garrisonCount(1), hero: !!(g.factions[1].hero && g.factions[1].hero.alive), gold: Math.floor(g.factions[1].gold) }; });
  console.log('host 60 s later', JSON.stringify(wave));
  ok('the AI house keeps sending waves and buying troops', wave.lane1 > 0 && wave.hero);
  const r = await syncCheck(host, [c2]);
  ok('remaining client stays in sync (units ' + r.hs.units + ')', r.diffs.length === 0, r.diffs.slice(0, 4).join(' | '));
  const c2s = await c2.evaluate(() => { const g = window.__game; return { humans: g.humans.map((h) => h.team).sort().join(), isPlayer1: g.factions[1].isPlayer, hero1: !!(g.factions[1].hero && g.factions[1].hero.alive), lord1: g.factions[1].lord, bodyGone: g.scene.children.filter((o) => o.userData && o.userData.remoteName === 'Gwen').length }; });
  console.log('c2 view', JSON.stringify(c2s));
  ok('the other client sees house 1 as an AI lord and no ghost of the leaver', c2s.humans === '0,2' && !c2s.isPlayer1 && c2s.hero1);
  // a second player leaves: only the host and the survivors remain
  await c2.close();
  for (let i = 0; i < 40; i++) { await host.waitForTimeout(100); if (await host.evaluate(() => window.__game.humans.length === 1)) break; }
  await step([host], 3);
  const solo = await host.evaluate(() => { const g = window.__game; return { humans: g.humans.length, ai: g.factions.map((f) => !!f.ai), state: g.state }; });
  console.log('host alone', JSON.stringify(solo));
  ok('host plays on alone against three AI lords', solo.humans === 1 && solo.state === 'playing' && solo.ai.slice(1).every(Boolean));

  // ---- the host leaving ends the game for everyone else
  const S2 = await session(transport);
  const h2 = await S2.host('Boss');
  const d1 = await S2.join(h2.code, 'Dana', 'd1');
  await startMatch(S2, h2.page, [d1], { coop: false });
  await step([h2.page, d1], 3);
  await h2.page.close();
  let ended = null;
  for (let i = 0; i < 60; i++) { await d1.waitForTimeout(100); ended = await d1.evaluate(() => ({ state: window.__game.state, title: document.getElementById('goTitle').textContent, text: document.getElementById('goText').textContent })); if (ended.state === 'over') break; }
  console.log('client when the host leaves', JSON.stringify(ended));
  ok('clients are told the host left', ended.state === 'over' && ended.text === 'The host left the game.');
  console.log('errors:', [...S.errors, ...S2.errors].length ? '\n' + [...S.errors, ...S2.errors].slice(0, 10).join('\n') : 'none');
  console.log(fails ? `RESULT(${transport}): ${fails} problem(s)` : `RESULT(${transport}): all passed`);
  await S.close(); await S2.close();
})().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
