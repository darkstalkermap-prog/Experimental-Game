// The practice courtyard: the world and the yard, the dummies and what they count, the hero's class / level / talents, soldiers by
// kind, rank and tier, the panel, and going back to a normal game.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!ok) failed++; };
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
(async () => {
  const { browser, page, errors } = await L.launch({ viewport: { width: 1280, height: 800 } });
  // the stand-in clock: g.update and the input reset, as a frame does
  const run = (secs, dt = 0.1) => page.evaluate(([secs, dt]) => { const g = window.__game; g.paused = false; for (let i = 0; i < Math.round(secs / dt); i++) { g.update(dt); g.input.endFrame(); } }, [secs, dt]);

  await page.click('#practiceBtn');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6); });
  await run(2);

  // ---------------------------------------------------------------- 1. the world and the match
  let r = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.court, S = c.site;
    const P = { hw: 13, hd: 34 };
    const floor = [[0, 0], [P.hw - 1, 0], [-(P.hw - 1), 0], [0, P.hd - 1], [0, -(P.hd - 1)]].map(([dx, dz]) => +g.physics.terrainHeight(S.x + dx, S.z + dz).toFixed(2));
    const wall = g.physics.pointHit(S.x + 13.8, S.y + 2, S.z);
    return { practice: g.practice, built: g.mapBuiltFor, inside: Math.abs(p.pos.x - S.x) < P.hw && Math.abs(p.pos.z - S.z) < P.hd, yaw: +p.yaw.toFixed(2),
      z: +(p.pos.z - (S.z - P.hd)).toFixed(1), dummies: c.dummies.length, units: g.units.length, nonDummy: g.units.filter((u) => !u.isDummy).length,
      phase: g.phase, factions: g.factions.length, floor, wall: wall ? wall.kind : null, hud: document.getElementById('hud').className, state: g.state,
      aiLords: g.factions.filter((f) => f.ai).length, banner: document.querySelector('#banner h2').textContent };
  });
  check('the practice button builds a practice world and starts a match in it', r.practice && r.built === 'small+practice' && r.state === 'playing', r);
  check('the hero stands inside the yard, six metres from the south wall, facing the dummies', r.inside && near(r.z, 6, 0.6) && r.yaw === 0, { inside: r.inside, z: r.z, yaw: r.yaw });
  check('the yard floor is flat and level with the castles (2 m), and its wall is solid', r.floor.every((h) => h === 2) && r.wall === 'yard', { floor: r.floor, wall: r.wall });
  check('no rival lords and no soldiers: only the dummies stand in the yard (a row of five and a crowd of twelve)', r.dummies === 17 && r.nonDummy === 0 && r.aiLords === 0, { dummies: r.dummies, other: r.nonDummy, lords: r.aiLords });
  check('the HUD is the practice HUD and the banner says so', r.hud === 'practice' && /Practice courtyard/.test(r.banner), { hud: r.hud, banner: r.banner });

  r = await page.evaluate(() => { const g = window.__game; g.court.resetReadout(); return null; });
  await run(150);
  r = await page.evaluate(() => { const g = window.__game; return { state: g.state, round: g.round, units: g.units.length, alerts: document.getElementById('alerts').children.length, alive: g.player.alive, gold: g.localFaction.gold }; });
  check('two and a half minutes later nothing has marched, nobody has won and no alert has fired', r.state === 'playing' && r.round === 0 && r.units === 17 && r.alerts === 0 && r.alive, r);

  // ---------------------------------------------------------------- 2. the dummies
  r = await page.evaluate(() => {
    const g = window.__game, c = g.court, p = g.player, out = {};
    c.toggleStand('ladder');                              // one of each armour
    const ladder = c.dummies.filter((d) => d.stand === 'ladder');
    out.ladderArmor = ladder.map((d) => d.armor).join();
    out.ladderTiers = ladder.map((d) => d.dummyTier).join();
    out.taken = ladder.map((d) => { const b = d.total; g.damage(d, 50, p, { melee: true }); return +(d.total - b).toFixed(1); }).join();
    const d0 = ladder[0];
    g.damage(d0, 1e6, p, { melee: true });
    out.alive = d0.alive; out.hp = d0.hp === d0.maxHp;
    out.d0 = { hits: d0.hits, last: Math.round(d0.last), best: Math.round(d0.best), total: Math.round(d0.total) };
    const h = c.readout().hero;
    out.hero = { total: Math.round(h.total), hits: h.hits, last: Math.round(h.last), best: Math.round(h.best), dps: +h.dps.toFixed(1) };
    g.camera.updateMatrixWorld();
    g.damage(ladder[2], 70, p, { melee: true });            // (the camera's matrices are only brought up to date by a render: do it by hand here)
    for (let i = 0; i < 3; i++) { g.update(0.1); g.input.endFrame(); }
    g.ui.update(0.2);
    out.hud = document.getElementById('pracStats').textContent;
    out.pops = document.getElementById('dmgpops').children.length;
    return out;
  });
  check('a ladder of five dummies has armour 0, 3, 7, 11, 15 and takes a 50-damage blow as 50, 47, 43, 39 and 35', r.ladderArmor === '0,3,7,11,15' && r.ladderTiers === '0,1,2,3,4' && r.taken === '50,47,43,39,35', { armor: r.ladderArmor, taken: r.taken });
  check('a dummy cannot be beaten: a million damage leaves it standing and whole', r.alive && r.hp, { alive: r.alive, hp: r.hp });
  check('it keeps the count: hits, last, best and total (and the hero\'s own counters agree)', r.d0.hits === 2 && r.d0.last === 1e6 - 0 && r.hero.hits === 6 && r.hero.best === r.d0.best, { d0: r.d0, hero: r.hero });
  check('the HUD readout shows the damage per second and the floating numbers rise from the dummies', /You/.test(r.hud) && /peak/.test(r.hud) && r.hero.dps > 0 && r.pops >= 1, { hud: r.hud.slice(0, 60), pops: r.pops });
  r = await page.evaluate(() => {
    const g = window.__game, c = g.court, out = {};
    const scene0 = g.scene.children.length;
    c.setArmor(4);
    out.rowArmor = [...new Set(c.dummies.filter((d) => d.stand === 'row').map((d) => d.armor))].join();
    out.ladderKept = c.dummies.filter((d) => d.stand === 'ladder').map((d) => d.armor).join();
    out.crowdArmor = [...new Set(c.dummies.filter((d) => d.stand === 'crowd').map((d) => d.armor))].join();
    out.n = c.dummies.length;
    c.toggleStand('far');
    out.far = c.dummies.filter((d) => d.stand === 'far').length;
    c.clearDummies();
    out.cleared = { n: c.dummies.length, units: g.units.length, scene: g.scene.children.length - scene0 };
    c.stands.row = true; c.stands.crowd = true; c.armor = 2; c.placeStands();
    out.back = c.dummies.length;
    return out;
  });
  check('the armour choice re-dresses the row, the crowd and the far targets but not the ladder', r.rowArmor === '15' && r.crowdArmor === '15' && r.ladderKept === '0,3,7,11,15' && r.n === 22 && r.far === 3, r);
  check('clearing the dummies removes them from the world; the stands can be filled again', r.cleared.n === 0 && r.cleared.units === 0 && r.cleared.scene <= 0 && r.back === 17, r.cleared);

  // ---------------------------------------------------------------- 3. the hero
  r = await page.evaluate(() => {
    const g = window.__game, c = g.court, p = g.player, out = {};
    p.hp = 5; p.abilCd = { q: 9, r: 9 };
    c.setHeroClass('mage'); c.setHeroLevel(5);
    out.mage5 = { cls: p.classId, level: p.level, maxHp: p.maxHp, expect: Math.round(220 * 0.75 * 1.28), hp: p.hp, cd: p.abilCd.q + p.abilCd.r, talents: Object.keys(p.talents).length, xp: p.xp };
    c.setHeroLevel(1);
    out.mage1 = { level: p.level, maxHp: p.maxHp, expect: Math.round(220 * 0.75) };
    c.setHeroClass('knight'); c.setHeroLevel(5);
    out.knight5 = { melee: +p.meleeDmg.toFixed(1), hp: p.maxHp };
    c.setHeroLevel(1);
    out.knight1 = { melee: +p.meleeDmg.toFixed(1), hp: p.maxHp };
    c.setAllTalents(true);
    out.all = { n: Object.keys(p.talents).length, all: c.allTalents, hp: p.maxHp };
    c.setHeroLevel(3);                                    // the level changes, the whole tree stays on
    out.all3 = { level: p.level, n: Object.keys(p.talents).length };
    c.setAllTalents(false);
    out.none = { n: Object.keys(p.talents).length, all: c.allTalents, hp: p.maxHp };
    c.heal(); c.setHeroClass('cavalier');
    out.cav = { horse: p.hasHorse };
    c.setHeroClass('knight'); c.setHeroLevel(1);
    return out;
  });
  check('class and level are set at once: a level-5 Mage has 28% more health than at level 1, full health, ready abilities, no talents', r.mage5.cls === 'mage' && r.mage5.level === 5 && r.mage5.maxHp === r.mage5.expect && r.mage5.hp === r.mage5.maxHp && r.mage5.cd === 0 && r.mage5.talents === 0 && r.mage1.maxHp === r.mage1.expect, { mage5: r.mage5, mage1: r.mage1 });
  check('level 5 hits harder than level 1 (a Knight: 45.6 against 34)', near(r.knight5.melee, 45.6, 0.2) && near(r.knight1.melee, 34, 0.2), { l5: r.knight5, l1: r.knight1 });
  check('"All talents" gives the whole tree (7 for the Knight) at any level and survives a level change; "No talents" clears it', r.all.n === 7 && r.all.all && r.all.hp > r.knight1.hp && r.all3.n === 7 && r.none.n === 0 && !r.none.all && r.none.hp === Math.round(220 * 1.3 * 1.14), { all: r.all, all3: r.all3, none: r.none });
  check('a Cavalier gets a warhorse', r.cav.horse === true);

  // ---------------------------------------------------------------- 4. soldiers by kind, rank and tier
  r = await page.evaluate(() => {
    const g = window.__game, c = g.court, out = {};
    const n0 = g.units.length;
    out.sent = c.send('knight', 5, 3, 2);
    const ks = g.units.filter((u) => u.practiceKey);
    const u = ks[0];
    out.k = { n: ks.length, hp: Math.round(u.maxHp), dmg: +u.dmg.toFixed(1), armor: u.armor, rank: u.rank, tier: u.tier, fixed: u.fixedTier, army: u.army, order: u.order, team: u.team };
    out.preview = (() => { const v = c.preview('knight', 3, 2); return { hp: v.hp, dmg: +v.dmg.toFixed(1), armor: v.armor }; })();
    out.expect = { hp: Math.round(240 * 1.3 * 1.12 * 1.12), dmg: +(26 * 1.3 * 1.1 * 1.1).toFixed(1), armor: 9 };
    out.giant = c.send('giant', 1, 5, 5);               // rank does not apply to a giant, tier does (health and damage only)
    const gi = g.units.find((x) => x.type === 'giant');
    out.g = { hp: Math.round(gi.maxHp), expect: Math.round(3200 * 1.75), rank: gi.rank, key: gi.practiceKey };
    out.lord = c.send('lord', 1, 5, 5);
    const lo = g.units.find((x) => x.type === 'lord' && x.practiceKey);
    out.l = { hp: Math.round(lo.maxHp), expect: 340, key: lo.practiceKey };
    out.eng = c.send('engineer', 3);
    out.cap = c.send('swordsman', 100, 1, 0);
    out.total = c.characters().length;
    c.clearCharacters();
    out.cleared = { chars: c.characters().length, units: g.units.filter((x) => !x.isDummy).length, groups: c.groups.size };
    return out;
  });
  check('Knights sent in at rank 3, tier 2 are what the preview says: health 392, damage 40.9, armour 9, rank and tier kept, in the army, charging', r.sent === 5 && r.k.n === 5 && r.k.hp === r.expect.hp && r.k.dmg === r.expect.dmg && r.k.armor === 9 && r.k.rank === 3 && r.k.tier === 2 && r.k.fixed && r.k.army && r.k.order === 'charge' && r.k.team === 0 && r.preview.hp === r.k.hp && r.preview.dmg === r.k.dmg, { k: r.k, expect: r.expect, preview: r.preview });
  check('a giant takes the tier (health 5600) but not the rank, a lord neither; crew are refused; the yard holds at most 40', r.g.hp === r.g.expect && r.g.rank === 1 && /giant\|1\|5/.test(r.g.key) && r.l.hp === r.l.expect && r.eng === 0 && r.cap === 33 && r.total === 40, { g: r.g, l: r.l, eng: r.eng, cap: r.cap, total: r.total });
  check('sending them away clears the soldiers and their counters', r.cleared.chars === 0 && r.cleared.units === 0 && r.cleared.groups === 0, r.cleared);

  // ---------------------------------------------------------------- 5. they fight the dummies, and keep their rank and tier while they do
  await page.evaluate(() => { const g = window.__game, c = g.court; c.resetReadout(); c.send('knight', 5, 3, 2); c.send('archer', 4, 1, 0); c.send('swordsman', 5, 1, 0); c.send('horseman', 2, 1, 0); });
  await run(25);
  r = await page.evaluate(() => {
    const g = window.__game, c = g.court, out = {};
    const ro = c.readout();
    out.groups = ro.groups.map((x) => ({ label: x.label, n: x.n, dps: +x.dps.toFixed(1), each: +x.each.toFixed(1), total: Math.round(x.total) }));
    const ks = g.units.filter((u) => u.practiceKey && u.type === 'knight');
    out.knights = { rank: [...new Set(ks.map((u) => u.rank))].join(), tier: [...new Set(ks.map((u) => u.tier))].join(), xp: Math.max(...ks.map((u) => u.xp)) };
    out.dummyTotal = Math.round(c.dummies.reduce((a, d) => a + d.total, 0));
    out.groupTotal = Math.round(ro.groups.reduce((a, x) => a + x.total, 0));
    out.dps = +ro.soldiersDps.toFixed(1);
    g.ui.update(0.2);
    out.hud = document.getElementById('pracStats').textContent;
    return out;
  });
  check('every group lands blows on the dummies by itself (melee, archers and cavalry)', r.groups.length === 4 && r.groups.every((x) => x.total > 0 && x.each > 0), r.groups);
  check('the soldiers keep the rank and the tier they were sent in with while they fight', r.knights.rank === '3' && r.knights.tier === '2' && r.knights.xp === 0, r.knights);
  check('what the groups did adds up to what the dummies took, and the HUD box names the groups', Math.abs(r.groupTotal - r.dummyTotal) <= r.dummyTotal * 0.02 + 2 && /Soldiers/.test(r.hud) && /Knight/.test(r.hud), { dummies: r.dummyTotal, groups: r.groupTotal, hud: r.hud.slice(0, 90) });

  // ---------------------------------------------------------------- 6. the panel
  await page.evaluate(() => { window.__game.court.clearCharacters(); });
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('KeyP'); g.update(0.05); g.input.endFrame(); });
  r = await page.evaluate(() => {
    const g = window.__game, ui = g.ui, out = {};
    const q = (s) => document.querySelectorAll(s).length;
    out.open = ui.practiceOpen; out.hidden = document.getElementById('practice').classList.contains('hidden');
    out.chips = { cls: q('#practice .chips button') };
    const t0 = g.time; for (let i = 0; i < 10; i++) { g.update(0.1); g.input.endFrame(); }
    out.runs = g.time > t0 + 0.9;                        // the world goes on behind the panel
    out.text = document.getElementById('practice').textContent;
    return out;
  });
  check('P opens the practice panel; the world keeps running behind it', r.open && !r.hidden && r.runs, { open: r.open, hidden: r.hidden, runs: r.runs });
  check('the panel offers the six classes, the levels, the soldiers, ranks, tiers, counts, armours and stands', /Knight/.test(r.text) && /Berserker/.test(r.text) && /Giant/.test(r.text) && /Lancer/.test(r.text) && /Fortress/.test(r.text) && /Row of five/.test(r.text) && /Crowd of twelve/.test(r.text) && /Training tier/.test(r.text) && /Veteran rank/.test(r.text), { text: r.text.slice(0, 120) });
  r = await page.evaluate(() => {
    const g = window.__game, out = {};
    const click = (label, within = '#practice') => { const b = [...document.querySelectorAll(`${within} button`)].find((x) => x.textContent.trim().startsWith(label)); if (!b) throw new Error('no button ' + label); b.click(); };
    click('🏹 Ranger');                                                  // class chip
    click('5', '#practice .chips');
    out.hero = { cls: g.player.classId };
    // the chips of the rows: find by title
    const chip = (title) => [...document.querySelectorAll('#practice button')].find((b) => b.title === title);
    chip('Level 4: 3 talent points by the rules').click();
    out.level = g.player.level;
    chip('Rank 5: +12% health, +10% damage and +1 armour for each rank above the first').click();
    chip('Tier 3: +45% health and damage, and a better kit').click();
    [...document.querySelectorAll('#practice .chips button')].find((b) => b.textContent === '10' && b.parentElement.previousSibling && /How many/.test(b.parentElement.previousSibling.textContent)).click();
    [...document.querySelectorAll('#practice button')].find((b) => b.textContent === 'Lancer').click();
    out.pick = { ...g.court.pick };
    out.preview = document.querySelectorAll('#practice .note.nums')[1].textContent;
    [...document.querySelectorAll('#practice button')].find((b) => b.textContent.startsWith('Send them in')).click();
    out.sent = g.court.characters().length;
    out.u = (() => { const u = g.court.characters()[0]; return { type: u.type, rank: u.rank, tier: u.tier }; })();
    [...document.querySelectorAll('#practice button')].find((b) => b.textContent.startsWith('Send them away')).click();
    out.after = g.court.characters().length;
    [...document.querySelectorAll('#practice button')].find((b) => b.textContent.startsWith('Mail')).click();
    out.armor = g.court.armor;
    [...document.querySelectorAll('#practice button')].find((b) => b.textContent.startsWith('Crowd of twelve')).click();
    out.crowd = g.court.stands.crowd;
    return out;
  });
  check('clicking the chips changes the hero, the level, what is sent and the dummies', r.hero.cls === 'ranger' && r.level === 4 && r.pick.type === 'lancer' && r.pick.rank === 5 && r.pick.tier === 3 && r.pick.count === 10 && r.armor === 1 && r.crowd === false, { hero: r.hero, level: r.level, pick: r.pick, armor: r.armor, crowd: r.crowd });
  check('the preview describes the pick, and "Send them in" brings ten rank-5 tier-3 Lancers (then "Send them away")', /Lancer/.test(r.preview) && /★★★★★/.test(r.preview) && r.sent === 10 && r.u.type === 'lancer' && r.u.rank === 5 && r.u.tier === 3 && r.after === 0, { preview: r.preview.slice(0, 120), sent: r.sent, u: r.u, after: r.after });
  await page.evaluate(() => { const g = window.__game; g.court.setHeroClass('knight'); g.court.setHeroLevel(1); g.court.clearCharacters(); g.court.stands.crowd = true; g.court.placeStands(); });

  r = await page.evaluate(() => {
    const g = window.__game, ui = g.ui, out = {};
    g.input.pressed.add('KeyB'); g.update(0.05); g.input.endFrame();
    out.bOpensNothing = !ui.shopOpen && ui.practiceOpen;                // the panel has the keys while it is up
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    out.escCloses = !ui.practiceOpen && document.getElementById('practice').classList.contains('hidden') && document.getElementById('pause').classList.contains('hidden');
    g.input.pressed.add('KeyP'); g.update(0.05); g.input.endFrame();
    out.reopen = ui.practiceOpen;
    g.input.pressed.add('KeyP'); g.update(0.05); g.input.endFrame();
    out.pCloses = !ui.practiceOpen;
    g.input.pressed.add('KeyP'); g.update(0.05); g.input.endFrame();
    ui.toggleShop(true);
    out.shopTakes = ui.shopOpen && !ui.practiceOpen;
    ui.toggleShop(false);
    return out;
  });
  check('while the panel is up B does nothing; Esc closes it (without the game menu); P toggles it; the shop takes its place', r.bOpensNothing && r.escCloses && r.reopen && r.pCloses && r.shopTakes, r);

  // ---------------------------------------------------------------- 7. back to a normal game, and into the yard again
  await page.evaluate(() => { document.getElementById('menu').classList.remove('hidden'); });
  await page.evaluate(() => document.getElementById('play').click());
  await page.waitForFunction(() => window.__game.state === 'playing' && !window.__game.practice, null, { timeout: 120000 });
  r = await page.evaluate(() => {
    const g = window.__game;
    return { practice: g.practice, built: g.mapBuiltFor, units: g.units.length, lords: g.factions.filter((f) => f.ai).length, hud: document.getElementById('hud').className, court: !!g.court, yard: !!g.physics.practice, phaseT: g.phaseT > 0 && g.phaseT <= 60 };
  });
  check('a normal game after the yard has the whole war back (lords, soldiers, the prep clock) and no yard', !r.practice && r.built === 'medium' && r.units > 20 && r.lords === 3 && !r.hud.includes('practice') && !r.court && !r.yard && r.phaseT, r);
  await page.evaluate(() => { document.getElementById('menu').classList.remove('hidden'); });
  await page.evaluate(() => document.getElementById('practiceBtn').click());
  await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.practice, null, { timeout: 120000 });
  r = await page.evaluate(() => { const g = window.__game; return { dummies: g.court.dummies.length, units: g.units.length, built: g.mapBuiltFor }; });
  check('and into the yard once more', r.dummies === 17 && r.units === 17 && r.built === 'small+practice', r);

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  console.log(failed || errors.length ? `RESULT: ${failed} failed, ${errors.length} errors` : 'RESULT: all passed');
  process.exit(failed || errors.length ? 1 : 0);
})();
