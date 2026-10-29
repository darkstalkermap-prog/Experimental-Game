// Hero levels: stats per level, experience from what a hero brings down, the level-up, the HUD and the rules around it.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);

  // ----- stats
  let r = await page.evaluate(async () => {
    const g = window.__game, p = g.player;
    const cfg = await import('/src/config.js'), cls = await import('/src/classes.js'), hr = await import('/src/heroes.js');
    const out = { start: { level: p.level, xp: p.xp, pts: p.talentPoints }, perClass: {} };
    for (const id of cls.CLASS_IDS) {
      p.setClass(id);
      const rows = [];
      for (let l = 1; l <= 5; l++) {
        p.setLevel(l);
        rows.push({ l, maxHp: p.maxHp, melee: +p.meleeDmg.toFixed(2), bow: +p.bowDmg.toFixed(2), armor: p.armor, speed: +p.speedMult.toFixed(3), cd: +(p.mods.cd || 1).toFixed(3), spell: +p.mods.spell.toFixed(3), pts: p.talentPoints });
      }
      out.perClass[id] = rows;
      p.level = 1; p.xp = 0; p.refreshStats();
    }
    p.setClass('knight'); p.level = 1; p.xp = 0; p.refreshStats();
    out.vet = cfg.UNIT_TYPES.lancer.dmg * (1 + cfg.RANKS.dmg * 4);
    out.base = { hp: cfg.PLAYER.hp, cls: cls.CLASSES.knight.mods, xpTable: hr.XP_FOR_LEVEL };
    out.fresh = { maxHp: p.maxHp, melee: p.meleeDmg };
    return out;
  });
  check('a new hero is level 1 with no experience and no talent points', r.start.level === 1 && r.start.xp === 0 && r.start.pts === 0, JSON.stringify(r.start));
  const k = r.perClass.knight;
  check('level 1 changes nothing: the class numbers as before', k[0].maxHp === Math.round(r.base.hp * r.base.cls.hp) && near(k[0].melee, 34 * r.base.cls.melee), JSON.stringify(k[0]));
  let mono = true;
  for (const id in r.perClass) for (let i = 1; i < 5; i++) {
    const a = r.perClass[id][i - 1], b = r.perClass[id][i];
    if (!(b.maxHp > a.maxHp && b.melee > a.melee && b.bow > a.bow && b.armor > a.armor && b.speed > a.speed && b.cd < a.cd && b.spell > a.spell)) mono = false;
  }
  check('every class gets stronger with every level (health, damage, armour, speed, recharge)', mono);
  const grow = (key) => k[4][key] / k[0][key];
  check('the growth is gradual (about +28% health, +34% damage at level 5)', near(grow('maxHp'), 1.28, 0.02) && near(grow('melee'), 1.34, 0.02), `hp x${grow('maxHp').toFixed(3)} dmg x${grow('melee').toFixed(3)}`);
  check('a level-5 Knight hits slightly harder than the best veteran (rank-5 lancer ' + r.vet + ')', k[4].melee > r.vet && k[4].melee < r.vet * 1.15, `knight L5 ${k[4].melee}`);
  check('one talent point per level after the first', k.map((x) => x.pts).join() === '0,1,2,3,4');
  check('the experience table rises', r.base.xpTable.join() === '0,0,120,320,640,1100');
  const hitL5 = (id) => Math.max(r.perClass[id][4].melee, r.perClass[id][4].bow);
  check('the hardest hitters grow less, so every fighting class ends a little above the best veteran (42..52)',
    ['knight', 'berserker', 'ranger', 'cavalier'].every((id) => hitL5(id) > r.vet && hitL5(id) < 52), JSON.stringify(['knight', 'berserker', 'ranger', 'cavalier'].map((id) => [id, +hitL5(id).toFixed(1)])));
  check('...and the casters\' spells grow by the full third', near(r.perClass.mage[4].spell / r.perClass.mage[0].spell, 1.34, 0.01) && near(r.perClass.cleric[4].spell / r.perClass.cleric[0].spell, 1.34, 0.01));
  console.log('      knight', JSON.stringify(k.map((x) => [x.l, x.maxHp, x.melee, x.armor])), ' berserker L5 melee', r.perClass.berserker[4].melee, ' ranger L5 bow', r.perClass.ranger[4].bow, ' mage L5 spell x', r.perClass.mage[4].spell);

  // ----- experience from kills
  r = await page.evaluate(async () => {
    const g = window.__game, p = g.player, hr = await import('/src/heroes.js');
    const out = {};
    p.setClass('knight'); p.level = 1; p.xp = 0; p.refreshStats();
    const foe = g.units.find((u) => u.team !== p.team && u.alive && !u.isHero) || null;
    const mk = (type, team, at) => { const u = g.recruit(g.factions[team], type, false); u.pos.set(at.x, g.physics.terrainHeight(at.x, at.z), at.z); return u; };
    const away = { x: p.pos.x + 12, z: p.pos.z };
    // a hero's own kill: full award, the victim's base (a swordsman 8)
    const u1 = mk('swordsman', 1, away);
    g.damage(u1, 9999, p, { melee: true });
    out.kill1 = p.xp;
    out.killsCounter = p.kills;
    // rank counts: a rank-3 spearman is worth 8 * 1.24
    const u2 = mk('spearman', 1, away); u2.rank = 3;
    const before = p.xp; g.damage(u2, 9999, p, { melee: true });
    out.rank3 = p.xp - before;
    // hitting without killing earns nothing
    const u3 = mk('knight', 1, away);
    const b3 = p.xp; g.damage(u3, 5, p, { melee: true });
    out.hit = p.xp - b3;
    // the share: an allied soldier kills near the hero, and far from it
    const ally = mk('swordsman', 0, { x: p.pos.x + 3, z: p.pos.z });
    const v1 = mk('swordsman', 1, { x: p.pos.x + 5, z: p.pos.z });
    const b4 = p.xp; g.damage(v1, 9999, ally, { melee: true });
    out.shareNear = p.xp - b4;
    const farp = { x: p.pos.x + 90, z: p.pos.z };
    const ally2 = mk('swordsman', 0, farp), v2 = mk('swordsman', 1, farp);
    const b5 = p.xp; g.damage(v2, 9999, ally2, { melee: true });
    out.shareFar = p.xp - b5;
    // an enemy killing an enemy gives nothing
    const e1 = mk('swordsman', 1, { x: p.pos.x + 4, z: p.pos.z }), e2 = mk('swordsman', 2, { x: p.pos.x + 5, z: p.pos.z });
    const b6 = p.xp; g.damage(e2, 9999, e1, { melee: true });
    out.rivals = p.xp - b6;
    out.table = { swordsman: hr.killXp({ type: 'swordsman', rank: 1 }), lancer3: hr.killXp({ type: 'lancer', rank: 3 }), hero: hr.killXp({ isPlayer: true, level: 3 }) };
    return out;
  });
  check('a hero\'s kill pays the base of the victim (swordsman 8)', near(r.kill1, 8) && r.killsCounter === 1, JSON.stringify({ xp: r.kill1, kills: r.killsCounter }));
  check('veterans are worth more per rank', near(r.rank3, 8 * 1.24, 0.05), 'got ' + r.rank3);
  check('wounding without killing earns nothing', r.hit === 0);
  check('a kill by an ally close by earns a share (40%)', near(r.shareNear, 3.2, 0.05), 'got ' + r.shareNear);
  check('...but nothing when the fight is far from the hero', r.shareFar === 0);
  check('...and nothing when only rivals fight each other', r.rivals === 0);
  check('experience table: lancer rank 3 = 26 x 1.24, rival hero level 3 = 80 x 1.3', near(r.table.lancer3, 26 * 1.24, 0.05) && near(r.table.hero, 80 * 1.3, 0.05), JSON.stringify(r.table));

  // ----- levelling up
  r = await page.evaluate(async () => {
    const g = window.__game, p = g.player, hr = await import('/src/heroes.js');
    const out = {};
    p.setClass('knight'); p.level = 1; p.xp = 0; p.refreshStats(); p.hp = p.maxHp * 0.5;
    const b = p.maxHp, h0 = p.hp;
    p.gainXp(119); out.below = { level: p.level };
    p.gainXp(1);
    out.up = { level: p.level, maxHp: p.maxHp, hp: p.hp, h0, b, banner: document.querySelector('#banner h2').textContent, bannerLevel: document.getElementById('banner').classList.contains('level'),
      lvl: document.getElementById('lvl').textContent, pts: p.talentPoints, toast: document.getElementById('toasts').textContent };
    g.ui.update(0.2);
    out.hud = { lvl: document.getElementById('lvl').textContent, fill: document.getElementById('xpFill').style.width, title: document.getElementById('xpbar').title, pop: document.querySelectorAll('.xppop').length, popText: document.querySelector('.xppop') ? document.querySelector('.xppop').textContent : '' };
    // a big gain crosses several levels at once
    p.gainXp(5000);
    out.top = { level: p.level, xp: p.xp, maxHp: p.maxHp, pts: p.talentPoints };
    g.ui.update(0.2);
    out.max = { cls: document.getElementById('xpbar').classList.contains('max'), title: document.getElementById('xpbar').title, lvl: document.getElementById('lvl').textContent };
    p.gainXp(100);
    out.capped = { xp: p.xp, level: p.level };
    return out;
  });
  const shareBefore = r.up.h0 / r.up.b;
  check('119 of 120 is still level 1', r.below.level === 1);
  check('120 reaches level 2: tougher, and part of the wounds mended', r.up.level === 2 && r.up.maxHp === Math.round(220 * 1.3 * 1.07) && r.up.hp > r.up.maxHp * 0.5 + 10 && r.up.hp < r.up.maxHp, JSON.stringify({ hp: r.up.hp, max: r.up.maxHp }));
  check('...with a banner, a log line and a talent point', r.up.banner === 'Level 2' && r.up.bannerLevel && /level 2/.test(r.up.toast) && r.up.pts === 1, JSON.stringify({ b: r.up.banner, t: r.up.toast, pts: r.up.pts }));
  check('the HUD shows the level, the experience bar and the gain', /Lv 2/.test(r.hud.lvl) && parseFloat(r.hud.fill) >= 0 && /120 \/ 320|\/ 320/.test(r.hud.title) && r.hud.pop >= 1, JSON.stringify(r.hud));
  check('a big gain crosses several levels at once, up to level 5', r.top.level === 5 && r.top.pts === 4 && r.top.maxHp === Math.round(220 * 1.3 * 1.28), JSON.stringify(r.top));
  check('experience stops at the top: the bar is full and gold', r.capped.level === 5 && r.capped.xp === 1100 && r.max.cls && /Lv 5/.test(r.max.lvl), JSON.stringify({ capped: r.capped, max: r.max }));

  // ----- rules: dead heroes earn nothing, class changes keep the level, spawn keeps it, wave and structure pay
  r = await page.evaluate(async () => {
    const g = window.__game, p = g.player, hr = await import('/src/heroes.js');
    const out = {};
    p.setClass('knight'); p.level = 1; p.xp = 0; p.refreshStats();
    p.alive = false; p.gainXp(50); out.dead = p.xp; p.alive = true;
    p.setLevel(3);
    out.knight3 = p.maxHp;
    g.localSwitchClass('mage');
    out.mage = { cls: p.classId, level: p.level, maxHp: p.maxHp, expect: Math.round(220 * 0.75 * 1.14) };
    p.hp = 0; p.alive = false; p.spawn(g.castles[0].spawnPoint, 0);
    out.respawn = { level: p.level, hp: p.hp, maxHp: p.maxHp, alive: p.alive };
    p.level = 1; p.xp = 0; p.refreshStats();
    const b = p.xp; g.startWave(); out.wave = p.xp - b;
    const b2 = p.xp; g.onStructureDestroyed({ kind: 'gate', team: 1, castle: g.castles[1], pos: g.castles[1].center }, p); out.gate = p.xp - b2;
    const b3 = p.xp; g.onCastleFallen(g.castles[3], p); out.keep = p.xp - b3;
    const b4 = p.xp; g.onStructureDestroyed({ kind: 'gate', team: 0, castle: g.castles[0], pos: g.castles[0].center }, p); out.ownGate = p.xp - b4;
    // the hill: paid when your house takes it with you standing on it
    const hp = g.hill.pos;
    p.pos.set(hp.x + 3, g.physics.terrainHeight(hp.x + 3, hp.z), hp.z);
    const b5 = p.xp; g.hill.take(0); out.hill = p.xp - b5;
    p.pos.set(hp.x + 60, g.physics.terrainHeight(hp.x + 60, hp.z), hp.z);
    const b6 = p.xp; g.hill.take(0); out.hillFar = p.xp - b6;
    const b7 = p.xp; p.pos.set(hp.x + 3, g.physics.terrainHeight(hp.x + 3, hp.z), hp.z); g.hill.take(1); out.hillRival = p.xp - b7;
    return out;
  });
  check('a fallen hero earns nothing', r.dead === 0);
  check('a class change keeps the level (and health follows)', r.mage.cls === 'mage' && r.mage.level === 3 && r.mage.maxHp === r.mage.expect, JSON.stringify(r.mage));
  check('the level survives death and respawn', r.respawn.level === 3 && r.respawn.alive && r.respawn.hp === r.respawn.maxHp, JSON.stringify(r.respawn));
  check('a wave marching out pays 10', near(r.wave, 10, 0.5), 'got ' + r.wave);
  check('breaking an enemy gate pays 40, and a keep 250', near(r.gate, 40) && near(r.keep, 250), JSON.stringify({ gate: r.gate, keep: r.keep }));
  check('your own gate falling pays nothing', r.ownGate === 0);
  check('taking the hill pays 25 to the heroes standing on it, not to those away from it or when a rival takes it', near(r.hill, 25) && r.hillFar === 0 && r.hillRival === 0, JSON.stringify({ on: r.hill, far: r.hillFar, rival: r.hillRival }));

  // ----- the support classes earn experience for what they do for others
  r = await page.evaluate(async () => {
    const g = window.__game, p = g.player, out = {};
    const around = (n, hpShare) => {
      const list = [];
      for (let i = 0; i < n; i++) {
        const u = g.recruit(g.factions[0], 'swordsman', false);
        u.pos.set(p.pos.x + 3 + i * 0.8, g.physics.terrainHeight(p.pos.x + 3, p.pos.z), p.pos.z + 2);
        u.hp = u.maxHp * hpShare;
        list.push(u);
      }
      return list;
    };
    p.setClass('cleric'); p.level = 1; p.xp = 0; p.refreshStats();
    const hurt = around(5, 0.1);
    g.update(1 / 30);
    p.xp = 0; g.abilities.heal(p);
    out.heal = p.xp;
    out.mended = hurt.reduce((a, u) => a + (u.hp - u.maxHp * 0.1), 0);
    p.xp = 0; g.abilities.heal(p);                       // they are mostly mended now: little left to restore
    out.again = p.xp;
    for (const u of hurt) u.hp = u.maxHp;
    p.xp = 0; g.abilities.heal(p);
    out.full = p.xp;
    p.setClass('cavalier'); p.level = 1; p.xp = 0; p.refreshStats();
    g.update(1 / 30);
    p.xp = 0; g.abilities.rally(p);
    out.rally = p.xp;
    return out;
  });
  check('a Healing Light earns the Cleric 5% of the health it really mends in others (capped at 40)', r.heal > 0 && r.heal <= 40 && near(r.heal, Math.min(40, r.mended * 0.05), 0.5), JSON.stringify({ xp: +r.heal.toFixed(2), mended: Math.round(r.mended) }));
  check('...and nothing when everyone is already well', r.full === 0, 'got ' + r.full);
  check('a Rally Cry earns the Cavalier 3 for each ally it reaches (the five just recruited, capped at 24)', near(r.rally, 15, 3.1), 'got ' + r.rally);

  // ----- the away panel tells of the levels reached while the player was not looking
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, A = g.alerts, f = g.localFaction;
    p.setClass('knight'); p.level = 1; p.xp = 0; p.refreshStats();
    A.away = { at: performance.now() - 30000, round: g.round, kills: p.kills, deaths: p.deaths, earned: f.earned, level: p.level, events: [], n: 0, label: '' };
    p.gainXp(150);
    A.back();
    const el = document.getElementById('away');
    return { hidden: el.classList.contains('hidden'), text: el.textContent.replace(/\s+/g, ' ') };
  });
  check('the "while you were away" panel says which level you reached', !r.hidden && /You reached level 2/.test(r.text), r.text);

  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  console.log(failed || errors.length ? `RESULT: ${failed} failed, ${errors.length} errors` : 'RESULT: all passed');
  process.exit(failed || errors.length ? 1 : 0);
})();
