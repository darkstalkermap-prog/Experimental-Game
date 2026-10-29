// A (cont.): Node relay, 4-player lobby, Co-op = 2v2 sides; allies, friendly fire, gates, end-of-game screens.
const { session, startMatch, step, syncCheck } = require('./mplib');
const mode = process.argv[2] || 'coop4';   // coop4 | versus4 | coop3
(async () => {
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const clients = [];
  const names = ['Gwen', 'Lance', 'Elaine'];
  const nClients = mode === 'coop3' ? 2 : 3;
  for (let i = 0; i < nClients; i++) clients.push(await S.join(code, names[i], 'c' + (i + 1)));
  console.log('room', code, mode);
  const coop = mode !== 'versus4';
  // what the lobby says before the start
  await host.evaluate((coop) => { if (coop) document.querySelector('#lobbyModes button[data-mode=coop]').click(); }, coop);
  await host.waitForTimeout(500);
  const lobbyHost = await host.evaluate(() => ({ note: document.getElementById('lobbyMode').textContent, list: document.getElementById('lobbyList').innerText.replace(/\s+/g, ' ') }));
  const lobbyClient = await clients[0].evaluate(() => ({ note: document.getElementById('lobbyMode').textContent, disabled: document.querySelector('#lobbyModes button').disabled }));
  console.log('lobby (host):', JSON.stringify(lobbyHost));
  console.log('lobby (client):', JSON.stringify(lobbyClient));
  await startMatch(S, host, clients, { coop });
  const all = [host, ...clients];
  let fails = 0;
  const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : '')); };

  await step(all, 100);
  const r = await syncCheck(host, clients);
  ok(`state in sync after 100 s (wave ${r.hs.round}, units ${r.hs.units}, lane ${r.hs.laneByTeam})`, r.diffs.length === 0, r.diffs.slice(0, 4).join(' | '));

  // ---- who is on whose side, as every page sees it
  const sides = await Promise.all(all.map((p) => p.evaluate(async () => {
    const { allied } = await import('/src/teams.js');
    const g = window.__game;
    return { local: g.localTeam, coop: g.coop, sides: JSON.stringify(g.sides), table: [0, 1, 2, 3].map((a) => [0, 1, 2, 3].map((b) => (allied(a, b) ? 1 : 0)).join('')).join(' ') };
  })));
  console.log('sides per page:', JSON.stringify(sides.map((s) => [s.local, s.sides, s.table])));
  const expectTable = mode === 'coop4' ? '1100 1100 0011 0011' : mode === 'coop3' ? '1110 1110 1110 0001' : '1000 0100 0010 0001';
  ok('allied() table is right on every page (' + expectTable + ')', sides.every((s) => s.table === expectTable));
  ok('every page agrees on the co-op flag', sides.every((s) => s.coop === coop));

  // ---- friendly fire and gates (on the host, which decides damage)
  const ff = await host.evaluate(async () => {
    const g = window.__game;
    const { allied } = await import('/src/teams.js');
    const out = {};
    const mk = (team) => g.units.find((u) => u.alive && u.team === team && !u.isHero && !u.lane) || g.units.find((u) => u.alive && u.team === team && !u.isHero);
    const a0 = mk(0), a1 = mk(1), e2 = mk(2);
    // soldiers sometimes block, so try a few times and keep the best result
    const hit = (att, vic) => { let best = 0; for (let i = 0; i < 12; i++) { const hp = vic.hp; vic.staggerT = 0; vic.swingT = -1; g.damage(vic, 40, att, { melee: true }); best = Math.max(best, hp - vic.hp); vic.hp = hp; } return best; };
    out.team0_hits_team1 = hit(a0, a1);
    out.team0_hits_team2 = hit(a0, e2);
    out.team2_hits_team0 = hit(e2, a0);
    // towers and walls of an ally
    const c1 = g.castles[1];
    const wallHp = c1.walls[0].hp; g.damage(c1.walls[0], 100, a0, { melee: true }); out.team0_hits_ally_wall = wallHp - c1.walls[0].hp; c1.walls[0].hp = wallHp;
    // gate collider of castle 1 (Red): does a Blue unit stand in the gateway? does a Green one get pushed out?
    const THREE = g.camera.position.constructor;
    const gp = c1.gatePos;
    const probe = (team) => { const p = new THREE(gp.x, c1.center.y, gp.z); const moved = g.physics.resolve(p, 0.4, c1.center.y, 1.85, team); return moved ? 1 : 0; };
    // a gate is solid until it has swung open: shut, it stops everybody; open, it lets its own house and allies through
    const was = c1.gate.openAmt;
    c1.gate.openAmt = 0;
    out.shut_blocks_ally_team0 = probe(0);
    out.shut_blocks_enemy_team2 = probe(2);
    out.shut_blocks_owner_team1 = probe(1);
    c1.gate.openAmt = 1;
    out.gate_blocks_ally_team0 = probe(0);
    out.gate_blocks_enemy_team2 = probe(2);
    out.gate_blocks_owner_team1 = probe(1);
    c1.gate.openAmt = was;
    const nav = await import('/src/nav.js');
    out.entries_for_ally = nav.entriesFor(c1, 0).filter((e) => e.gate).length;
    out.entries_for_enemy = nav.entriesFor(c1, 2).filter((e) => e.gate).length;
    return out;
  });
  console.log('friendly fire / gates:', JSON.stringify(ff));
  if (mode === 'coop4') {
    ok('allies do no damage to each other', ff.team0_hits_team1 === 0 && ff.team0_hits_ally_wall === 0);
    ok('enemies still hurt each other', ff.team0_hits_team2 > 0 && ff.team2_hits_team0 > 0);
    ok('a shut gate is solid for everybody', ff.shut_blocks_ally_team0 === 1 && ff.shut_blocks_enemy_team2 === 1 && ff.shut_blocks_owner_team1 === 1);
    ok('an open gate lets an ally through and stops an enemy', ff.gate_blocks_ally_team0 === 0 && ff.gate_blocks_owner_team1 === 0 && ff.gate_blocks_enemy_team2 === 1 && ff.entries_for_ally === 1 && ff.entries_for_enemy === 0);
  } else if (mode === 'versus4') {
    ok('everyone hurts everyone in Versus', ff.team0_hits_team1 > 0 && ff.team0_hits_team2 > 0);
    ok('a shut gate is solid for everybody in Versus', ff.shut_blocks_ally_team0 === 1 && ff.shut_blocks_enemy_team2 === 1 && ff.shut_blocks_owner_team1 === 1);
    ok('only the owner walks through an open gate in Versus', ff.gate_blocks_ally_team0 === 1 && ff.gate_blocks_owner_team1 === 0 && ff.entries_for_ally === 0);
  } else {
    ok('coop3: the three humans are allies', ff.team0_hits_team1 === 0);
  }

  // ---- the end of the game: force one side out and read every screen
  const finish = async (label, elim, expect) => {
    await host.evaluate((elim) => { const g = window.__game; for (const t of elim) { const f = g.factions[t]; f.castle.fallen = true; f.eliminated = true; if (f.hero && f.hero.alive && f.hero.die) { /* AI lords */ f.hero.alive = false; } } }, elim);
    await step(all, 1.5);
    for (let i = 0; i < 40; i++) {
      const done = await Promise.all(all.map((p) => p.evaluate(() => window.__game.state === 'over')));
      if (done.every(Boolean)) break;
      await host.waitForTimeout(100);
    }
    const screens = await Promise.all(all.map((p) => p.evaluate(() => ({ team: window.__game.localTeam, state: window.__game.state, title: document.getElementById('goTitle').textContent, text: document.getElementById('goText').textContent, stats: document.getElementById('goStats').innerText.replace(/\s+/g, ' ') }))));
    console.log(label);
    screens.forEach((s) => console.log('   team ' + s.team + ': ' + s.title + ' | ' + s.text + ' | ' + s.stats));
    ok(label + ': all pages reached the end', screens.every((s) => s.state === 'over'));
    ok(label + ': titles ' + expect.join('/'), screens.every((s, i) => s.title === expect[i]));
    return screens;
  };
  if (mode === 'coop4') await finish('2v2: Green + Gold eliminated', [2, 3], ['Victory!', 'Victory!', 'Defeat', 'Defeat']);
  else if (mode === 'versus4') await finish('Versus: Red, Green, Gold eliminated', [1, 2, 3], ['Victory!', 'Defeat', 'Defeat', 'Defeat']);
  else await finish('Co-op 3 humans: the AI lord is eliminated', [3], ['Victory!', 'Victory!', 'Victory!']);
  console.log('errors:', S.errors.length ? '\n' + S.errors.slice(0, 10).join('\n') : 'none');
  console.log(fails ? `RESULT: ${fails} problem(s)` : 'RESULT: all passed');
  await S.close();
})().catch((e) => { console.error('TEST CRASHED', e); process.exit(1); });
