// Online (host + guest): the alerts are worked out on the guest's own screen from the snapshot (castle parts, units, engines,
// its hero, the wave clock), the host does not see the guest's alerts, a guest in a hidden tab keeps playing and gets its
// away panel, and a hidden host's timer keeps the match going for the guest. Prints failures only.
const { session, startMatch } = require('../v2/mplib');
let failed = 0, total = 0;
const check = (name, ok, extra) => { total++; if (!ok) { failed++; console.log('FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
const stepper = (all) => async (secs, dt = 1 / 30) => {
  const slices = Math.ceil(secs / 0.25), n = Math.round(0.25 / dt);
  for (let i = 0; i < slices; i++) {
    for (const p of all) await p.evaluate(([n, dt]) => { const g = window.__game; g.paused = false; for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } }, [n, dt]);
    await all[0].waitForTimeout(20);
  }
};
const has = (arr, re) => arr.some((x) => re.test(x));
const count = (arr, re) => arr.filter((x) => re.test(x)).length;
(async () => {
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await startMatch(S, host, [guest]);
  const all = [host, guest];
  const step = stepper(all);
  await step(2);
  // spies on both screens, a key held so nobody is idle, no wave in the way
  for (const p of all) {
    await p.evaluate(() => {
      const g = window.__game;
      window.__snd = []; window.__seen = new WeakSet();
      const play = g.audio.play.bind(g.audio);
      g.audio.play = (n, ...a) => { window.__snd.push(n); return play(n, ...a); };
      window.__since = () => {
        const fresh = g.alerts.recent.filter((r) => !window.__seen.has(r));
        for (const r of fresh) window.__seen.add(r);
        const out = { raised: fresh.map((r) => r.key + (r.text ? ':' + r.text : '')), snd: window.__snd.slice() };
        window.__snd.length = 0;
        return out;
      };
      g.input.keys.add('KeyJ');
      window.__hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    });
  }
  await host.evaluate(() => { window.__game.phaseT = 9999; });
  await step(1);
  const since = (p) => p.evaluate(() => window.__since());
  await since(host); await since(guest);
  const mode = await Promise.all(all.map((p) => p.evaluate(() => ({ mode: window.__game.mode, team: window.__game.localTeam }))));
  check('a host and a guest (team 1)', mode[0].mode === 'host' && mode[1].mode === 'client' && mode[1].team === 1, mode);

  // ------------------------------------------------------------------ the guest's castle is attacked: the host decides, the guest alerts
  await host.evaluate(() => { window.__game.castles[1].gate.hp -= 200; });
  await step(1);
  let g = await since(guest), h = await since(host);
  check('guest: "Your south gate is under attack!" from the snapshot, with the horn', has(g.raised, /^attack0:Your south gate is under attack!$/) && g.snd.includes('alertDanger'), g);
  check("host: nothing for the guest's castle", !has(h.raised, /^attack/) && !h.snd.includes('alertDanger'), h);
  await step(7);
  await since(guest);
  await host.evaluate(() => { const c = window.__game.castles[1]; const w = c.walls.filter((x) => x.breakable)[0]; c.damageWall(w, 1e9, null); });
  await step(1);
  g = await since(guest);
  check('guest: a wall falling on the host is "Breach! The ... wall has fallen"', has(g.raised, /^breach\d+:Breach! The \w+ wall has fallen$/), g);

  // ------------------------------------------------------------------ an army and an engine near the guest's castle
  await host.evaluate(() => {
    const g = window.__game, c = g.castles[1];
    window.__foes = [];
    for (let i = 0; i < 6; i++) {
      const u = g.recruit(g.factions[i % 2 ? 2 : 0], 'swordsman', true);
      u.hp = u.maxHp = 1e6; u.update = () => {};
      u.pos.set(c.center.x + 45 + i, 2, c.center.z + 45 + i);
      window.__foes.push(u);
    }
  });
  await step(2);
  g = await since(guest); h = await since(host);
  check('guest: "Enemy army approaching from the south-east!" with the war horn, from units it only sees through snapshots', has(g.raised, /^army:Enemy army approaching from the south-east!$/) && g.snd.includes('horn'), g);
  check("host: the army is not at the host's castle: no alert", !has(h.raised, /^army/), h);
  await host.evaluate(() => {
    const g = window.__game, c = g.castles[1];
    const e = g.buildSiege(g.factions[0], 'ram');
    e.update = () => {};
    e.pos.set(c.center.x, 2, c.center.z + 55);
  });
  await step(2);
  g = await since(guest);
  check('guest: "Enemy battering ram spotted to the south"', has(g.raised, /^siege:Enemy battering ram spotted to the south$/), g);
  await host.evaluate(() => { for (const u of window.__foes) { u.alive = false; u.mesh.visible = false; } for (const e of window.__game.siege) { e.alive = false; e.mesh.visible = false; } });
  await step(2);
  await since(guest);

  // ------------------------------------------------------------------ the guest's hero: health and kills come in the snapshot
  await host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); h.hp = h.maxHp * 0.2; });
  await step(3);
  g = await since(guest);
  check('guest: low health from the snapshot: the callout and the heartbeat', has(g.raised, /^low:Low health! /) && count(g.snd, /^heartbeat$/) >= 2, g);
  await host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); h.hp = h.maxHp; });
  await step(1);
  await since(guest);
  await host.evaluate(() => { window.__game.humans.find((x) => x.team === 1).kills += 3; });
  await step(1);
  g = await since(guest);
  check('guest: three kills counted by the host make a Killing spree on the guest\'s screen', has(g.raised, /^streak:Killing spree$/) && g.snd.includes('streak'), g);

  // ------------------------------------------------------------------ a guest looking away: the match goes on, and the panel says what happened
  await guest.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await host.evaluate(() => { const c = window.__game.castles[1]; c.keep.hp -= 300; });
  await step(1);
  const titles = [];
  for (let i = 0; i < 8; i++) { titles.push(await guest.evaluate(() => document.title)); await guest.waitForTimeout(300); }
  let r = await guest.evaluate(() => ({ away: !!window.__game.alerts.away }));
  check('guest hidden: the tab title flashes the keep attack (and back to the normal title)', titles.some((t) => /^⚔ \(\d+\) .*attack/.test(t)) && titles.includes('Castle Wars') && r.away, titles);
  r = await guest.evaluate(() => {
    const g = window.__game, a = g.alerts, t0 = g.time, ph0 = g.phaseT;
    a.bgAt = 0; a.bgAcc = 0;
    const out = { first: a.background(1000), half: a.background(1500) };
    out.dt = +(g.time - t0).toFixed(2);
    return out;
  });
  check("guest hidden: the background ticker steps the client's game (no rendering needed)", r.first === 0 && r.half === 10 && r.dt === 0.5, r);
  await host.evaluate(() => { const g = window.__game; g.humans.find((x) => x.team === 1).kills += 2; });
  await step(1);
  await guest.evaluate(() => { const a = window.__game.alerts; a.away.at -= 20000; });
  r = await guest.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); const el = document.getElementById('away'); return { title: document.title, shown: !el.classList.contains('hidden'), lines: [...el.querySelectorAll('li')].map((l) => l.textContent) }; });
  check('guest back: title restored, the panel shows the attack and the gold', r.title === 'Castle Wars' && r.shown && r.lines.some((l) => /attack/.test(l)), r);

  // ------------------------------------------------------------------ a host looking away: its timer keeps the match going for the guest
  const before = await Promise.all(all.map((p) => p.evaluate(() => ({ phaseT: window.__game.phaseT, time: window.__game.time }))));
  await host.evaluate(() => { const a = window.__game.alerts; window.__hidden = true; a.bgAt = 0; a.bgAcc = 0; window.__game.phaseT = 600; });
  await host.waitForTimeout(2200);                       // (nobody calls game.update on either page now: only the timers)
  const after = await Promise.all(all.map((p) => p.evaluate(() => ({ phaseT: window.__game.phaseT, time: window.__game.time }))));
  await host.evaluate(() => { window.__hidden = false; });
  const hostAdvance = after[0].time - before[0].time;
  check('hidden host: the timer advanced the host\'s game by about the real time', hostAdvance > 1.3 && hostAdvance < 2.6, { hostAdvance });
  check('hidden host: the guest keeps getting snapshots (its wave clock follows the host\'s, which keeps running)', after[1].phaseT < 599.5 && Math.abs(after[1].phaseT - after[0].phaseT) < 0.5, after);

  // ------------------------------------------------------------------ the wave clock on the guest
  await host.evaluate(() => { const g = window.__game; g.phaseT = 13.6; });
  await step(1);
  await since(guest);
  await step(3.4);
  g = await since(guest);
  const round = await guest.evaluate(() => window.__game.round);
  check(`guest: "Wave ${round + 1} marches in 10 s" when the host's clock passes ten`, has(g.raised, new RegExp(`^wave10:Wave ${round + 1} marches in 10 s$`)), g);
  await step(10);
  g = await since(guest);
  check('guest: a tick for each of the last three seconds', count(g.snd, /^tick$/) === 3, g);

  console.log(`${total} checks, ${failed} failed`);
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  if (S.errors.length) failed++;
  await S.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
