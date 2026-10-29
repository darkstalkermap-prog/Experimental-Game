// Switching hero class in the field: rules, effects, shop tab, and the multiplayer path.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 1);

  // free during the preparation
  let r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const out = { start: p.classId, maxHp: p.maxHp };
    out.block = p.classBlock('mage');
    out.ok1 = g.localSwitchClass('mage');
    out.after = { cls: p.classId, maxHp: p.maxHp, hp: p.hp, q: p.abilCd.q, classAt: p.classAt };
    out.ok2 = g.localSwitchClass('cavalier');              // straight away again: allowed in the preparation
    out.horse = p.hasHorse;
    out.same = g.localSwitchClass('cavalier');             // not to the same class
    out.bad = g.localSwitchClass('wizard');
    return out;
  });
  check('class can be changed freely during the preparation', r.block === null && r.ok1 && r.after.cls === 'mage' && r.ok2, JSON.stringify(r));
  check('a Cavalier gets a horse', r.horse === true);
  check('cannot "switch" to the class you already are, or to nothing', r.same === false && r.bad === false);
  check('mage health follows the class', r.after.maxHp === Math.round(r.maxHp / 1.3 * 0.75) , `maxHp ${r.maxHp} -> ${r.after.maxHp}`);
  check('new abilities need a moment', r.after.q > 4, 'q cd ' + r.after.q);

  // only at your own castle
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player, c = g.castles[0], out = {};
    const homePos = p.pos.clone();
    const put = (lx, lz) => { const w = c.toWorld(lx, lz); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); };
    const was = p.classId;
    p.setClass('knight'); p.classAt = -99; p.lastHurt = -99;
    p.pos.set(0, g.physics.terrainHeight(0, 0), 0);                 // the middle of the map, in the preparation
    out.field = p.classBlock('ranger');
    out.fieldSwitch = g.localSwitchClass('ranger');
    out.fieldClass = p.classId;
    g.ui.tab = 'class'; g.ui.toggleShop(true);
    out.label = g.ui.classCards.find((x) => x.id === 'ranger').btn.textContent;
    out.note = document.querySelector('#shop .classnote').textContent.slice(0, 60);
    g.ui.toggleShop(false);
    put(0, 41);                                                      // 21 m beyond the front wall: too far
    out.far = p.classBlock('ranger');
    put(0, 31);                                                      // just outside the gate: still the castle's grounds
    out.nearGate = p.classBlock('ranger');
    put(0, -30);                                                     // behind the back wall
    out.behind = p.classBlock('ranger');
    put(0, 0);                                                       // in the courtyard
    out.courtyard = p.classBlock('ranger');
    // a fallen hero may choose from anywhere: they rise at their keep
    p.pos.set(0, g.physics.terrainHeight(0, 0), 0);
    p.alive = false;
    out.dead = p.classBlock('ranger');
    p.alive = true;
    // somebody else's castle
    const w2 = g.castles[1].toWorld(0, 0); p.pos.set(w2.x, g.physics.terrainHeight(w2.x, w2.z), w2.z);
    out.theirs = p.classBlock('ranger');
    p.pos.copy(homePos);
    out.homeAgain = p.classBlock('ranger');
    p.setClass(was); p.classAt = -99;
    return out;
  });
  check('away from your castle a class cannot be changed, even in the preparation', r.field === 'Only at your own castle' && r.fieldSwitch === false && r.fieldClass === 'knight', JSON.stringify(r));
  check('the Class tab says so', r.label === 'Only at your own castle' && /at your own castle/.test(r.note), JSON.stringify([r.label, r.note]));
  check('21 m beyond the walls is too far; the gate, the courtyard and the back of the castle are fine', /Only at/.test(r.far || '') && r.nearGate === null && r.behind === null && r.courtyard === null, JSON.stringify([r.far, r.nearGate, r.behind, r.courtyard]));
  check('a fallen hero may choose from anywhere (they rise at their keep)', r.dead === null, JSON.stringify(r.dead));
  check("not in another house's castle", /Only at/.test(r.theirs || ''), JSON.stringify(r.theirs));
  check('back home it is allowed again', r.homeAgain === null, JSON.stringify(r.homeAgain));

  // after the first wave: combat lock and cooldown
  await page.evaluate(() => { const g = window.__game; g.phaseT = 0.1; });
  await L.step(page, 2);
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const out = { round: g.round };
    p.lastHurt = -99; p.classAt = -99;
    p.hp = p.maxHp * 0.5;
    const before = { hp: p.hp, max: p.maxHp };
    out.ok = g.localSwitchClass('knight');
    out.hpFrac = +(p.hp / p.maxHp).toFixed(3);
    out.beforeFrac = +(before.hp / before.max).toFixed(3);
    out.cd = p.classBlock('ranger');
    p.lastHurt = g.time - 1;                               // hit a second ago
    p.classAt = -99;
    out.fight = p.classBlock('ranger');
    p.lastHurt = -99;
    g.time += 16;
    out.later = p.classBlock('ranger');
    // the class tab
    g.ui.tab = 'class'; g.ui.toggleShop(true);
    out.cards = g.ui.classCards ? g.ui.classCards.length : -1;
    out.labels = g.ui.classCards ? g.ui.classCards.map((c) => c.btn.textContent) : [];
    out.currentMarked = g.ui.classCards ? g.ui.classCards.filter((c) => c.card.classList.contains('current')).map((c) => c.id) : [];
    g.ui.toggleShop(false);
    return out;
  });
  check('after the first wave a switch keeps the health proportion', r.round >= 1 && r.ok && Math.abs(r.hpFrac - r.beforeFrac) < 0.02, JSON.stringify(r));
  check('another switch straight away is refused (cooldown)', /^Wait \d+ s$/.test(r.cd || ''), JSON.stringify(r.cd));
  check('not in the middle of a fight', r.fight === 'Not in the middle of a fight', JSON.stringify(r.fight));
  check('allowed again after the cooldown', r.later === null);
  check('the Class tab lists six classes and marks yours', r.cards === 6 && r.currentMarked.join() === 'knight' && /Your class/.test(r.labels[0]), JSON.stringify([r.cards, r.currentMarked, r.labels]));

  // clicking a card in the DOM, while dead
  r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.takeDamage(99999, null);
    const dead = !p.alive;
    g.ui.tab = 'class'; g.ui.toggleShop(true);
    const card = g.ui.classCards.find((c) => c.id === 'cleric');
    card.btn.click();
    const out = { dead, cls: p.classId, maxHp: p.maxHp, label: card.btn.textContent };
    g.ui.toggleShop(false);
    return out;
  });
  check('a dead hero can pick a class freely from the shop', r.dead && r.cls === 'cleric', JSON.stringify(r));
  // respawn as that class
  await L.step(page, 40);
  r = await page.evaluate(() => { const p = window.__game.player; return { alive: p.alive, cls: p.classId, hp: Math.round(p.hp), maxHp: p.maxHp, hud: document.getElementById('clsName').textContent }; });
  check('they respawn as the new class with full health', r.alive && r.cls === 'cleric' && r.hp === r.maxHp, JSON.stringify(r));
  r = await page.evaluate(() => { const g = window.__game; g.ui.hudT = 0; g.ui.update(0.1); g.ui.update(0.2); return { hud: document.getElementById('clsName').textContent, q: document.querySelector('#abilQ .nm').textContent, rr: document.querySelector('#abilR .nm').textContent }; });
  check('the HUD shows the new class and abilities', /Cleric/.test(r.hud) && r.q === 'Smite' && r.rr === 'Healing Light', JSON.stringify(r));

  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
