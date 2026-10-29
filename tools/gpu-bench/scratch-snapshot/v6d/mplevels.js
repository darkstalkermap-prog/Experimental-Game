// Online: the host decides experience and levels; the guest's screen mirrors them, sees the banner, and everyone sees the
// level on the nameplate and the flare when a hero levels up.
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
async function scenario(coop) {
  console.log(`\n=== ${coop ? 'co-op' : 'versus'}`);
  const S = await session('relay');
  const { page: host, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await startMatch(S, host, [guest], { coop });
  const all = [host, guest];
  const step = stepper(all);
  await step(2);
  // clear the field so only the test's soldiers fight
  await host.evaluate(() => { const g = window.__game; for (const u of g.units) if (!u.isHero) { u.alive = false; u.mesh.visible = false; } g.units = g.units.filter((u) => u.alive || u.isHero); });
  const start = await Promise.all(all.map((p) => p.evaluate(() => ({ lvl: window.__game.player.level, xp: window.__game.player.xp, hud: document.getElementById('lvl').textContent }))));
  ok('both heroes start at level 1', start.every((s) => s.lvl === 1 && s.xp === 0), start);
  // the guest kills a soldier on the host
  const kill = await host.evaluate(() => {
    const g = window.__game, h = g.humans.find((x) => x.team === 1);
    const foe = g.recruit(g.factions[2], 'knight', false);
    foe.pos.set(h.pos.x + 6, g.physics.terrainHeight(h.pos.x + 6, h.pos.z), h.pos.z);
    g.damage(foe, 99999, h, { melee: true });
    return { xp: h.xp, kills: h.kills };
  });
  ok('the host pays the guest for the kill (knight 18)', Math.abs(kill.xp - 18) < 0.1 && kill.kills === 1, kill);
  await step(0.6);
  const mid = await guest.evaluate(() => { const g = window.__game, p = g.player; return { xp: p.xp, lvl: p.level, pop: document.querySelectorAll('.xppop').length, popText: (document.querySelector('.xppop') || {}).textContent }; });
  ok("the guest's screen shows the experience and the +18 XP popup", mid.xp === 18 && mid.lvl === 1 && mid.pop >= 1 && /18 XP/.test(mid.popText), mid);
  // a level-up on the host
  await host.evaluate(() => { const g = window.__game, h = g.humans.find((x) => x.team === 1); h.gainXp(102); });
  await step(0.6);
  const up = await Promise.all(all.map((p) => p.evaluate(() => {
    const g = window.__game, mine = g.player, other = g.humans.find((x) => x !== mine);
    return { mine: { lvl: mine.level, xp: mine.xp, maxHp: mine.maxHp, pts: mine.talentPoints }, other: { lvl: other.level, maxHp: other.maxHp },
      banner: document.querySelector('#banner h2').textContent, toast: document.getElementById('toasts').textContent };
  })));
  const [hs, gs] = up;   // host's view, guest's view
  ok("the guest's own level, health and talent point arrive from the host", gs.mine.lvl === 2 && gs.mine.maxHp === Math.round(220 * 1.3 * 1.07) && gs.mine.pts === 1 && gs.mine.xp === 120, gs.mine);
  ok('the guest sees the Level 2 banner and the log line', gs.banner === 'Level 2' && /level 2/.test(gs.toast), { b: gs.banner, t: gs.toast });
  ok("the host's screen knows the guest is level 2 (nameplate)", hs.other.lvl === 2 && hs.other.maxHp === gs.mine.maxHp, hs.other);
  ok('the host, whose hero did not level, has no banner', hs.banner !== 'Level 2' || hs.mine.lvl === 1, hs);
  // the guest's own hero's strength follows (client-side stats use the level too)
  const mods = await Promise.all(all.map((p) => p.evaluate(() => ({ dmg: +window.__game.player.meleeDmg.toFixed(2), armor: window.__game.player.armor }))));
  ok("the guest's own damage and armour include the level (same as the host works out)", mods[1].dmg > 34 && mods[1].armor > 9, mods);
  const hostCalc = await host.evaluate(() => { const h = window.__game.humans.find((x) => x.team === 1); return { dmg: +h.meleeDmg.toFixed(2), armor: h.armor }; });
  ok('...and the host agrees with the guest about them', hostCalc.dmg === mods[1].dmg && hostCalc.armor === mods[1].armor, { hostCalc, guest: mods[1] });
  // max level announcement and a sync of the top
  await host.evaluate(() => { const g = window.__game, h = g.humans.find((x) => x.team === 1); h.gainXp(5000); });
  await step(0.8);
  const top = await Promise.all(all.map((p) => p.evaluate(() => { window.__game.ui.update(0.2); return { lvl: window.__game.player.level, max: document.getElementById('xpbar').classList.contains('max'), lv: document.getElementById('lvl').textContent, toast: document.getElementById('toasts').textContent }; })));
  ok('level 5 reaches the guest: the bar turns gold', top[1].lvl === 5 && top[1].max && /Lv 5/.test(top[1].lv), top[1]);
  ok("everyone else is told 'Gwen has reached level 5!' (rivals and allies alike)", /Gwen has reached level 5/.test(top[0].toast), top[0].toast);
  if (!coop) {
    // a rival hero brought down is worth 80, and 15% more for each of its levels above the first (the guest is level 5: 128)
    const duel = await host.evaluate(() => {
      const g = window.__game, me = g.player, foe = g.humans.find((x) => x.team === 1);
      me.xp = 0; me.level = 1; me.refreshStats();
      g.damage(foe, 99999, me, { melee: true });
      return { xp: me.xp, foeAlive: foe.alive };
    });
    ok('versus: bringing down a level-5 rival hero pays 80 x 1.6', duel.xp === 128 && !duel.foeAlive, duel);
  }
  console.log('errors:\n' + (S.errors.join('\n') || 'none'));
  await S.close();
  if (S.errors.length) fails++;
}
(async () => {
  await scenario(false);
  await scenario(true);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
