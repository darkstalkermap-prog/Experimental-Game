// The hill in the middle: terrain, capture, contest, scoring, gold, the win in King of the Hill, none of it in Conquest,
// the AI's squads, the army order, and the HUD.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
const HELPERS = () => {
  const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
  window.T = {
    V3,
    key(code, down = true) { const i = g.input; if (down) { if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); } else { if (i.keys.delete(code)) i.up.add(code); } },
    step(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let k = 0; k < n; k++) { g.update(dt); g.input.endFrame(); } },
    // a soldier who stays exactly where he is put
    dummy(team, x, z, type = 'swordsman') {
      const u = g.recruit(g.factions[team], type);
      u.pos.set(x, g.physics.terrainHeight(x, z), z);
      u.homeCastle = g.castles[0]; u.setOrder('hold'); u.orderData = { pos: u.pos.clone(), yaw: 0 }; u.attackTimer = 99;
      u.update = function () {};
      u.hp = u.maxHp = 9999;
      return u;
    },
    clear() { for (const u of g.units) if (!u.isHero && u.dummy) { u.alive = false; u.mesh.visible = false; } g.units = g.units.filter((u) => u.alive || u.isHero); },
    onHill(p0) { p0.pos.set(0, g.physics.terrainHeight(0, 4), 4); },
  };
};
(async () => {
  for (const mode of ['koth', 'conquest']) {
    console.log(`\n=== ${mode}`);
    const { browser, page, errors } = await L.launch({ map: 'medium' });
    await page.evaluate((m) => document.querySelector(`#objective button[data-o=${m}]`).click(), mode);
    await L.startSingle(page);
    await L.step(page, 1);
    await page.evaluate(() => window.__game.input.endFrame());
    await page.evaluate(HELPERS);
    const run = (fn, ...a) => page.evaluate(fn, ...a);
    // (in King of the Hill the rival lords' first men are already marching on the hill: clear them so the test is about the rules)
    await run(() => { const g = window.__game; for (const u of g.units) if (u.team !== 0 && !u.isHero) { u.alive = false; u.mesh.visible = false; } g.units = g.units.filter((u) => u.alive || u.isHero); });

    // ---- the mode, the mound, the widget
    let r = await run(() => {
      const g = window.__game, P = g.physics;
      g.ui.updateHill(0);
      const el = document.getElementById('hill');
      return { objective: g.objective, centre: +P.terrainHeight(0, 0).toFixed(2), foot: +P.terrainHeight(0, 38).toFixed(2), r11: +P.terrainHeight(11, 0).toFixed(2), r20: +P.terrainHeight(20, 0).toFixed(2),
        shown: !el.classList.contains('hidden'), text: el.textContent, owner: g.hill.owner };
    });
    ok(`the mode is ${mode}`, r.objective === mode, r.objective);
    ok('a hill rises in the middle of the map', r.centre > 4.5 && r.centre - r.foot > 2.5 && r.r11 > r.r20 && r.r20 > r.foot, r);
    if (mode === 'conquest') {
      // Conquest: the hill is scenery only: nothing is captured, nothing pays, nothing is drawn but the banner
      r = await run(() => {
        const T = window.T, g = window.__game, h = g.hill, out = {};
        const red = T.dummy(1, 3, 2); red.dummy = true;
        T.onHill(g.player);
        T.step(15);
        out.state = { owner: h.owner, capturer: h.capturer, progress: h.progress, present: h.present.slice(), held: h.held.slice() };
        out.widgetHidden = document.getElementById('hill').classList.contains('hidden');
        out.rim = h.rim.visible; out.flag = h.flag.parent !== null;
        out.score = !!document.getElementById('goStats').textContent;
        g.ui.renderScoreboard();
        out.hillColumn = document.getElementById('hillTh').style.display;
        const notes = []; const notify = g.player.notify.bind(g.player); g.player.notify = (t, i) => { notes.push(t); return notify(t, i); };
        g.localHillOrder();
        out.note = notes.join(' ');
        return out;
      });
      ok('Conquest: nothing is captured and nothing pays (the hill is scenery)', r.state.owner === -1 && r.state.progress === 0 && r.state.present.every((n) => n === 0) && r.state.held.every((x) => x === 0), r.state);
      ok('Conquest: no hill box, no ring, no scoreboard column; the banner still stands', r.widgetHidden && r.rim === false && r.hillColumn === 'none' && r.flag, r);
      ok('Conquest: the army order says there is nothing to take', /Conquest/.test(r.note), r.note);
      console.log('errors:', errors.length ? errors.join('\n') : 'none');
      await browser.close();
      continue;
    }
    ok('the hill box is on the screen and says nobody holds it', r.shown && /Nobody holds it/.test(r.text), r.text);
    ok('King of the Hill shows the scores and the target', /first to 2:30/.test(r.text), r.text);

    // ---- one soldier of Red takes it, a Gold soldier contests, Red leaves, Gold takes it
    r = await run(() => {
      const T = window.T, g = window.__game, h = g.hill, out = {};
      const red = T.dummy(1, 3, 2); red.dummy = true;
      T.step(0.5);
      out.present = h.present.slice();
      T.step(4.5);
      out.after5 = { owner: h.owner, capturer: h.capturer, progress: +h.progress.toFixed(2) };
      T.step(4);
      out.after9 = { owner: h.owner, capturer: h.capturer, progress: +h.progress.toFixed(2) };
      let hillGold = 0;
      const credit = g.credit.bind(g);
      g.credit = (t, a, at) => { if (a === 10 && !at) hillGold += a; return credit(t, a, at); };
      const g0 = g.factions[1].earned;   // (what it earned, not what it holds: the rival lord may spend some in these seconds)
      T.step(12);
      out.held = h.held.map((x) => +x.toFixed(1));
      out.hillGold = hillGold;
      // gold for the holder only
      out.gold1 = g.factions[1].earned - g0;
      // a Gold soldier steps on: contested, nothing moves
      const gold = T.dummy(3, -3, -3); gold.dummy = true;
      T.step(0.5);
      const frozen = { held: +h.held[1].toFixed(2), progress: +h.progress.toFixed(2) };
      T.step(5);
      out.contested = { flag: h.contested, heldMoved: +(h.held[1] - frozen.held).toFixed(2), progressMoved: +(h.progress - frozen.progress).toFixed(2) };
      g.ui.updateHill(0);
      out.contestedText = document.getElementById('hill').textContent;
      // Red leaves: Gold alone takes it
      red.alive = false;
      T.step(2);
      out.goldTaking = { capturer: h.capturer, progress: +h.progress.toFixed(2), owner: h.owner };
      g.ui.updateHill(0);
      out.takingText = document.getElementById('hill').textContent;
      T.step(9);
      out.after = { owner: h.owner, progress: +h.progress.toFixed(2), held3: +h.held[3].toFixed(1) };
      g.ui.updateHill(0);
      out.heldText = document.getElementById('hill').textContent;
      T.clear();
      return out;
    });
    ok('one soldier on an empty hill: the capture builds (about 5 s of 8)', r.present[1] === 1 && r.after5.owner === -1 && r.after5.capturer === 1 && r.after5.progress > 0.45 && r.after5.progress < 0.8, r.after5);
    ok('and after a few more seconds the hill is his', r.after9.owner === 1 && r.after9.progress === 0, r.after9);
    ok('the holder piles up time on the hill, and nobody else does', r.held[1] > 10 && r.held[0] === 0 && r.held[2] === 0 && r.held[3] === 0, r.held);
    ok('and earns gold for it, in lumps of ten', r.hillGold >= 20 && r.gold1 >= 20, { lumps: r.hillGold, gained: r.gold1 });
    ok('a rival soldier on the hill makes it contested: no time, no capture, no gold', r.contested.flag && Math.abs(r.contested.heldMoved) < 0.05 && Math.abs(r.contested.progressMoved) < 0.01 && /Contested/.test(r.contestedText), r.contested);
    ok('when the holder is gone the rival starts taking it', r.goldTaking.capturer === 3 && r.goldTaking.progress > 0.1 && r.goldTaking.owner === 1 && /taking it/.test(r.takingText), r.goldTaking);
    ok('and then holds it, with the time counting for him now', r.after.owner === 3 && r.after.held3 > 0.5 && /Held by Sol/.test(r.heldText), r.after);

    // ---- a destroyed house does not keep the hill; the hero on it counts for two
    r = await run(() => {
      const T = window.T, g = window.__game, h = g.hill, p = g.player, out = {};
      out.holder = h.owner;
      g.factions[3].eliminated = true;          // the holder's house falls
      T.step(0.3);
      out.eliminated = { owner: h.owner, progress: h.progress };
      g.factions[3].eliminated = false;
      const here = p.pos.clone();
      T.onHill(p);
      T.step(7);
      out.hero = { owner: h.owner, capturer: h.capturer, progress: +h.progress.toFixed(2), present: h.present.slice() };
      T.step(3);
      out.heroOwner = h.owner;
      p.pos.copy(here);
      T.step(0.5);
      return out;
    });
    ok('a house that is destroyed does not keep the hill', r.holder === 3 && r.eliminated.owner === -1, r.eliminated);
    ok('a hero counts for two soldiers (taken in about six seconds)', r.hero.present[0] === 2 && (r.hero.owner === 0 || r.hero.progress > 0.7) && r.heroOwner === 0, r.hero);

    // ---- the win (King of the Hill) or no win (Conquest)
    r = await run(() => {
      const T = window.T, g = window.__game, h = g.hill, p = g.player, out = {};
      T.onHill(p);
      T.step(10);
      out.owner = h.owner;
      h.held[0] = 148.5;
      T.step(3);
      out.state = g.state;
      out.title = document.getElementById('goTitle').textContent;
      out.text = document.getElementById('goText').textContent;
      out.stats = document.getElementById('goStats').textContent;
      return out;
    });
    ok('hold it for 2:30 in King of the Hill and the match is won', r.owner === 0 && r.state === 'over' && r.title === 'Victory!' && /King of the Hill/.test(r.text), r);
    ok('the end screen shows the time on the hill', /on the hill/.test(r.stats), r.stats);
    console.log('errors:', errors.length ? errors.join('\n') : 'none');
    await browser.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
})();
