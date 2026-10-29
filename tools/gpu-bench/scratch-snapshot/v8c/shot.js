const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  await page.evaluate(() => {
    const g = window.__game, me = g.player;
    g.ui.showPause(false); g.paused = false;
    const mk = (name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine, hp) => ({ player: mine ? me : { hp, maxHp: 100 }, name, team, cls, level, kills, deaths, alive, respawnIn, isBot, mine });
    g.hero = { win: 'kills', killTarget: 25, timeLimit: 0, remaining: null, sides: [{ team: 0, name: 'Blue', kills: 7, deaths: 3 }, { team: 1, name: 'Red', kills: 11, deaths: 5 }], heroes: [], clock: 187.2, prepLeft: 0, result: null,
      rows: [mk('You', 0, me.classId, 2, 3, 1, true, 0, false, true), mk('Mara', 0, 'mage', 2, 2, 2, false, 6.2, true, false, 40), mk('Edric', 0, 'cleric', 3, 1, 0, true, 0, true, false, 90),
        mk('Varr', 1, 'berserker', 4, 5, 1, true, 0, true, false, 55), mk('Sola', 1, 'ranger', 2, 0, 3, false, 11.5, true, false, 10), mk('Brann', 1, 'cavalier', 3, 3, 2, true, 0, true, false, 100)],
      roster() { return this.rows; } };
    g.round = 3; g.phaseT = 21.4;
    g.castles[1].keep.hp = g.castles[1].keep.maxHp * 0.62; g.castles[0].gate.hp = g.castles[0].gate.maxHp * 0.4;
    me.setLevel(3);
    g.ui.kill(['Varr', 1], ['Mara', 0]); g.ui.kill(['You', 0], ['Sola', 1]);
    g.alerts.raise('a1', { text: 'Enemy hero slain: 8/25', tone: 'good', icon: '⚔' }); g.alerts.raise('a2', { text: 'Your ally Mara was slain', tone: 'warn', icon: '☠' });
    g.alerts.showTip('Press [N] to spend a talent point whenever you level up: talents are the only upgrades you can get.');
  });
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 5; i++) { g.paused = false; g.update(0.1); g.input.endFrame(); g.ui.update(0.1); } });
  await page.evaluate(() => { const g = window.__game; g.ui.showPause(false); g.paused = false; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: S + 'v8c/hero_hud.png' });
  console.log('errors', errors.length);
  await browser.close();
})();
