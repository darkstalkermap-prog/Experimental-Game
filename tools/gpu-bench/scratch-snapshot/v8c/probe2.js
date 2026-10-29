const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(() => {
    const g = window.__game, me = g.player;
    g.ui.showPause(false); g.paused = false;
    const mk = (name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine, hp) => ({ player: mine ? me : { hp, maxHp: 100 }, name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine });
    g.hero = { win: 'kills', killTarget: 25, sides: [{ kills: 7 }, { kills: 11 }], clock: 5, prepLeft: 0, result: null, remaining: null,
      rows: [mk('You', 0, me.classId, 2, 3, 1, true, 0, false, true), mk('Mara', 0, 'mage', 2, 2, 2, false, 6.2, true, false, 40), mk('Edric', 0, 'cleric', 3, 1, 0, true, 0, true, false, 90)],
      roster() { return this.rows; } };
    for (let i = 0; i < 4; i++) { g.paused = false; g.update(0.1); g.input.endFrame(); g.ui.update(0.1); }
    const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    return [...document.querySelectorAll('#heroRoster .hr')].map((row) => ({ row: R(row), cs: getComputedStyle(row).height + '/' + getComputedStyle(row).display, kids: [...row.children].map((c) => c.className + ':' + R(c).join(',') + ':' + getComputedStyle(c).display) }));
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
