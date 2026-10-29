// The rival lords' men go for the hill in King of the Hill (and not in Conquest); the army order "take the hill".
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const HELPERS = () => {
  const g = window.__game;
  window.T = {
    key(code, down = true) { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } },
    step(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } },
  };
};
(async () => {
  for (const mode of ['koth', 'conquest']) {
    console.log(`\n=== ${mode}`);
    const { browser, page, errors } = await L.launch({ map: 'small' });
    await page.evaluate((m) => document.querySelector(`#objective button[data-o=${m}]`).click(), mode);
    await L.startSingle(page);
    await L.step(page, 1);
    await page.evaluate(() => window.__game.input.endFrame());
    await page.evaluate(HELPERS);
    const start = await page.evaluate(() => {
      const g = window.__game;
      const duty = [1, 2, 3].map((t) => g.units.filter((u) => u.alive && u.team === t && u.hillDuty));
      return { counts: duty.map((a) => a.length), orders: [...new Set(duty.flat().map((u) => u.order))], lane: duty.flat().filter((u) => u.lane).length, garrison: [1, 2, 3].map((t) => g.units.filter((u) => u.alive && u.team === t && !u.isHero && !u.hillDuty).length) };
    });
    if (mode === 'koth') ok('King of the Hill: each rival lord sends three of his first men up the hill at once (from the garrison)', start.counts.every((n) => n === 3) && start.orders.join() === 'hold' && start.lane === 0 && start.garrison.every((n) => n === 2), start);
    else ok('Conquest: nobody is sent', start.counts.every((n) => n === 0), start);
    await page.evaluate(() => {   // a clean look at the army order: the rival lords' men out of the way
      const g = window.__game;
      for (const u of g.units) if (u.team !== 0 && !u.isHero) { u.alive = false; u.mesh.visible = false; }
      g.units = g.units.filter((u) => u.alive || u.isHero);
    });
    // ---- the army order: take the hill
    const o = await page.evaluate(() => {
      const T = window.T, g = window.__game, h = g.hill, out = {};
      for (const u of g.units) if (u.team === 0 && !u.isHero && !u.isCrew && !u.lane) { u.army = true; }
      const army = g.units.filter((u) => u.alive && u.team === 0 && u.army && !u.isCrew);
      out.army = army.length;
      const notes = [];
      const notify = g.player.notify.bind(g.player);
      g.player.notify = (t, i) => { notes.push(t); return notify(t, i); };
      g.localHillOrder();
      out.notes = notes;
      out.orders = army.map((u) => u.order).filter((x, i, a) => a.indexOf(x) === i);
      T.step(45);
      const d = army.filter((u) => u.alive).map((u) => Math.hypot(u.pos.x, u.pos.z));
      out.near = d.filter((x) => x < 11).length;
      out.alive = d.length;
      out.owner = h.owner;
      out.present = h.present.slice();
      return out;
    });
    if (mode === 'koth') {
      ok('Y sends the army to the hill ("Take the hill!") and they hold', o.army >= 4 && /Take the hill/.test(o.notes.join(' ')) && o.orders.length === 1 && o.orders[0] === 'hold', o);
      ok('they walk up and stand on it, and it is theirs', o.alive > 0 && o.near >= o.alive - 1 && o.owner === 0 && o.present[0] >= 3, { near: o.near, alive: o.alive, owner: o.owner, present: o.present });
    } else ok('Y says there is no hill to fight for in Conquest, and the army is not sent', /Conquest/.test(o.notes.join(' ')) && o.orders.every((x) => x !== 'hold'), o);

    const r = await page.evaluate(() => {
      const T = window.T, g = window.__game, h = g.hill, out = { samples: [] };
      // the first waves
      g.phaseT = 0.1;
      T.step(20);
      const duty = () => [1, 2, 3].map((t) => g.units.filter((u) => u.alive && u.team === t && u.hillDuty).length);
      out.duty20 = duty();
      out.orders = g.units.filter((u) => u.hillDuty).map((u) => u.order).filter((o, i, a) => a.indexOf(o) === i);
      out.lane = g.units.filter((u) => u.hillDuty && u.lane).length;
      out.playerDuty = g.units.filter((u) => u.team === 0 && u.hillDuty).length;
      // let them march and fight for the hill
      let sawContest = false, sawOwner = false, maxPresent = 0, maxTeams = 0;
      for (let i = 0; i < 100; i++) {
        T.step(1);
        sawContest = sawContest || h.contested;
        sawOwner = sawOwner || h.owner >= 0;
        const tot = h.present.reduce((a, b) => a + b, 0);
        maxPresent = Math.max(maxPresent, tot);
        maxTeams = Math.max(maxTeams, h.present.filter((x) => x > 0).length);
      }
      out.fight = { sawContest, sawOwner, maxPresent, maxTeams, owner: h.owner, held: h.held.map((x) => +x.toFixed(1)), duty: duty() };
      out.state = g.state;
      // the UI draws without trouble
      g.ui.drawMinimap(); g.ui.toggleMap(true); g.ui.drawBigMap(); g.ui.toggleMap(false);
      g.ui.renderScoreboard();
      out.score = [...document.querySelectorAll('#scoreRows tr')].map((tr) => tr.children[6].textContent);
      return out;
    });
    if (mode === 'koth') {
      ok('the first wave of every rival lord sends men up to the hill', r.duty20.every((n) => n >= 3), r.duty20);
      ok('they hold it (a hold order), as wave soldiers', r.orders.length === 1 && r.orders[0] === 'hold' && r.lane >= 6, { orders: r.orders, lane: r.lane });
      ok('your own soldiers are never sent', r.playerDuty === 0, r.playerDuty);
      ok('several houses end up fighting for it, and it changes hands or is contested', r.fight.sawContest || r.fight.sawOwner, r.fight);
      ok('and more than one house had men on it at once', r.fight.maxTeams >= 2, r.fight);
    } else {
      ok('in Conquest the rival lords send nobody to the hill', r.duty20.every((n) => n === 0) && r.fight.duty.every((n) => n === 0), { duty20: r.duty20, later: r.fight.duty });
    }
    ok(mode === 'koth' ? 'the maps and the scoreboard draw with the hill (a Hill column)' : 'the maps and the scoreboard draw (no Hill column in Conquest)', r.score.length === 4 && r.score.every((t) => (mode === 'koth' ? /\d:\d\d/ : /\d+ \/ \d+/).test(t)), r.score);
    ok('the match is still on', r.state === 'playing', r.state);

    console.log('errors:', errors.length ? errors.join('\n') : 'none');
    await browser.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
