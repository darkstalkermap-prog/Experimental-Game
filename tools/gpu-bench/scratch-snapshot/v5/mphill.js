// Online: the host picks the mode in the lobby, the guest sees it, the hill state reaches every screen, an ally shares the
// hold in co-op, the win ends the game for everyone, and a guest can only change class at their own castle.
const { session, startMatch } = require('../v2/mplib');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const stepper = (all) => async (secs, dt = 1 / 30) => {
  const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
  for (let i = 0; i < slices; i++) {
    for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
    await all[0].waitForTimeout(20);
  }
};
async function scenario(coop, objective) {
  console.log(`\n=== ${coop ? 'co-op' : 'versus'} · ${objective}`);
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  if (objective === 'koth') await host.evaluate(() => document.querySelector('#lobbyObjective button[data-o=koth]').click());
  await host.waitForTimeout(600);
  const lobby = await guest.evaluate(() => ({ desc: document.getElementById('lobbyObjDesc').textContent, active: [...document.querySelectorAll('#lobbyObjective button.active')].map((b) => b.dataset.o) }));
  ok(`the guest's lobby shows the host's mode (${objective})`, lobby.active.join() === objective && /Hill|Conquest/.test(lobby.desc), lobby);
  await startMatch(S, host, [guest], { coop });
  const all = [host, guest];
  const step = stepper(all);
  await step(2);
  const modes = await Promise.all(all.map((p) => p.evaluate(() => ({ obj: window.__game.objective, live: window.__game.hill.live, hud: !document.getElementById('hill').classList.contains('hidden') }))));
  ok('both screens play the chosen mode', modes.every((m) => m.obj === objective && m.live === (objective === 'koth')), modes);
  if (objective === 'conquest') {
    ok('Conquest: no hill box on either screen', modes.every((m) => !m.hud), modes);
    await S.close();
    console.log('errors:\n' + (S.errors.join('\n') || 'none'));
    return;
  }
  // (the rival lords' first men are already marching on the hill: clear them out of the way so the test is about the rules)
  await host.evaluate(() => { const g = window.__game; for (const u of g.units) if (u.team >= 2 && !u.isHero) { u.alive = false; u.mesh.visible = false; } g.units = g.units.filter((u) => u.alive || u.isHero); });
  // the guest walks onto the hill
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(0, g.physics.terrainHeight(0, 4), 4); });
  await step(9);
  const own = await Promise.all(all.map((p) => p.evaluate(() => { const h = window.__game.hill; window.__game.ui.updateHill(0); return { owner: h.owner, capturer: h.capturer, progress: +h.progress.toFixed(2), present: h.present.slice(), held: h.held.map((x) => +x.toFixed(1)), text: document.getElementById('hill').textContent }; })));
  ok('the host works out the capture: the guest owns the hill', own[0].owner === 1, own[0]);
  ok('the guest sees the same hill state, and the HUD says so', own[1].owner === 1 && /Held by You/.test(own[1].text) && /Held by (Gwen|Your|Varr|Elden)/.test(own[0].text) || (own[1].owner === 1 && /Held by You/.test(own[1].text)), { host: own[0].text, guest: own[1].text });
  await step(4);
  const held = await Promise.all(all.map((p) => p.evaluate(() => window.__game.hill.held.map((x) => +x.toFixed(1)))));
  // in co-op the side's time is kept under its first house (the host's)
  const k = coop ? 0 : 1;
  ok('the time on the hill counts up on both screens', held[0][k] > 2 && Math.abs(held[0][k] - held[1][k]) < 2, held);
  if (coop) {
    const mine = await host.evaluate(() => { window.__game.ui.updateHill(0); return document.getElementById('hill').textContent; });
    ok("co-op: the host's box calls the ally's hold 'ally' and counts the side's time as theirs", /Held by ally/.test(mine) && /You \d:\d\d/.test(mine), mine);
  }
  // the class rule, on the host: not on the hill (away from the castle), yes at home
  const away = await guest.evaluate(() => { const g = window.__game, p = g.player; const r = { local: p.classBlock('mage') }; g.localSwitchClass('mage'); return r; });
  await step(1);
  const hostSaw = await host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { cls: h.classId, block: h.classBlock('mage') }; });
  ok('away from the castle a guest cannot change class (the guest is told, the host agrees)', away.local === 'Only at your own castle' && hostSaw.cls === 'knight' && hostSaw.block === 'Only at your own castle', { away, hostSaw });
  await guest.evaluate(() => { const g = window.__game, p = g.player, c = g.castles[p.team]; const w = c.toWorld(0, 0); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); });
  await step(1.5);
  await guest.evaluate(() => window.__game.localSwitchClass('mage'));
  await step(1.5);
  const home = await host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { cls: h.classId }; });
  ok('at their own castle the same request goes through', home.cls === 'mage', home);
  // put the guest back on the hill and let the clock run out
  await guest.evaluate(() => { const g = window.__game, p = g.player; p.pos.set(0, g.physics.terrainHeight(0, 4), 4); });
  await step(8);
  await host.evaluate((k) => { window.__game.hill.held[k] = 148.5; }, k);
  await step(4);
  const end = await Promise.all(all.map((p) => p.evaluate(() => ({ state: window.__game.state, title: document.getElementById('goTitle').textContent, text: document.getElementById('goText').textContent }))));
  ok('the hold is complete: the game is over on both screens', end.every((e) => e.state === 'over'), end);
  const guestWins = end[1].title === 'Victory!', hostWins = end[0].title === 'Victory!';
  ok(coop ? 'co-op: the alliance wins together' : 'versus: the guest wins, the host loses', coop ? (guestWins && hostWins) : (guestWins && !hostWins), end.map((e) => e.title));
  ok('the end screen says why', end.every((e) => /King of the Hill/.test(e.text)), end.map((e) => e.text));
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  await S.close();
}
(async () => {
  await scenario(false, 'conquest');
  await scenario(false, 'koth');
  await scenario(true, 'koth');
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
