// Live checks: soldiers leave through the gate when it opens, stay in while an enemy holds it, and armies move on to
// the next castle when one falls.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 2);

  // ---- soldiers walk out through a gate that opens for them ----
  const sally = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    g.setRoles(0, { role: 'lane' });
    return { lane: g.laneCount(0), inside: g.units.filter((u) => u.team === 0 && u.alive && c.isInside(u.pos, 1)).length };
  });
  await L.step(page, 9);
  const out1 = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const mine = g.units.filter((u) => u.team === 0 && u.alive && u.lane);
    return { lane: mine.length, outside: mine.filter((u) => !c.inFootprint(u.pos, 1)).length, inside: mine.filter((u) => c.isInside(u.pos, 1)).length, gate: +c.gate.openAmt.toFixed(2) };
  });
  check('lane soldiers leave through their own gate', out1.lane >= 4 && out1.outside >= out1.lane - 1, JSON.stringify({ sally, out1 }));

  // ---- an enemy at the gate keeps it shut ----
  const held = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0], U = g.units[0].constructor;
    const foe = new U(g, 'swordsman', 1, c.toWorld(0, 23), { hp: 9e9, dmg: 0 });
    foe.think = () => {}; foe.update = () => {};
    g.units.push(foe);
    window.__foe = foe;
    window.__garr = [];
    for (let i = 0; i < 3; i++) { const u = g.recruit(g.factions[0], 'swordsman'); window.__garr.push(u); }
    return window.__garr.filter((u) => c.isInside(u.pos, 1)).length;
  });
  await L.step(page, 12);
  const during = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const mine = window.__garr.filter((u) => u.alive);
    const insideNow = mine.filter((u) => c.isInside(u.pos, 0.5));
    // nobody may be inside the closed gate's wall
    const inWall = mine.filter((u) => { const l = c.toLocal(u.pos.x, u.pos.z); return Math.abs(l.x) < 3 && l.z > 18.2 && l.z < 19.9 && u.pos.y - c.center.y < 3; }).length;
    return { inside: insideNow.length, gate: +c.gate.openAmt.toFixed(2), inWall };
  });
  check('enemy at the gate: it stays shut and the garrison waits behind it', during.gate < 0.2 && during.inside >= 3 && during.inWall === 0, JSON.stringify({ held, during }));
  // soldiers ordered out are obeyed even with the enemy at the gate
  await page.evaluate(() => { for (const u of window.__garr) u.setOrder('charge'); });
  await L.step(page, 8);
  const sallied = await page.evaluate(() => { const g = window.__game, c = g.castles[0]; return { out: window.__garr.filter((u) => u.alive && !c.isInside(u.pos, 0.5)).length, gate: +c.gate.openAmt.toFixed(2) }; });
  check('soldiers ordered out (charge) force the gate and march out against the besieger', sallied.out >= 2 && sallied.gate > 0.5, JSON.stringify(sallied));
  await page.evaluate(() => { const foe = window.__foe; foe.alive = false; foe.hp = 0; foe.deathT = 99; });
  await L.step(page, 12);
  const after = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0];
    const lane = g.units.filter((u) => u.team === 0 && u.alive && u.lane);
    return { inside: lane.filter((u) => c.isInside(u.pos, 0.5)).length, total: lane.length };
  });
  check('once the enemy is gone the gate opens and they march out', after.inside <= 1, JSON.stringify(after));

  // ---- the lord can lead a sally through a contested gate ----
  const lordSally = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0], U = g.units[0].constructor;
    const foe = new U(g, 'swordsman', 1, c.toWorld(0, 23), { hp: 9e9, dmg: 0 });
    foe.think = () => {}; foe.update = () => {};
    g.units.push(foe); window.__foe2 = foe;
    g.player.pos.copy(c.toWorld(0, 15)); g.player.pos.y = c.center.y;
    return null;
  });
  await L.step(page, 2);
  const lordGate = await page.evaluate(() => { const g = window.__game, c = g.castles[0]; return +c.gate.openAmt.toFixed(2); });
  check('the lord standing at the gate holds it open against a foe', lordGate > 0.9, 'openAmt=' + lordGate);
  await page.evaluate(() => { const f = window.__foe2; f.alive = false; f.hp = 0; f.deathT = 99; });

  // ---- armies move on when a castle falls ----
  const setup = await page.evaluate(() => {
    const g = window.__game;
    for (const u of g.units) if (u.alive && u.team === 0) { u.lane = false; u.army = false; u.setOrder('defend'); }
    const f0 = g.factions[0];
    const target = g.siegeTarget(f0);       // castle 2 in an odd round
    const mk = (type, lane, army) => { const u = g.recruit(f0, type, lane); u.lane = lane; u.army = army; u.setOrder('assault', target); return u; };
    window.__lane = [mk('swordsman', true, false), mk('archer', true, false)];
    window.__army = [mk('swordsman', false, true), mk('spearman', false, true)];
    window.__giant = g.summonGiant(f0);
    window.__ram = g.buildSiege(f0, 'ram');
    window.__ram.targetCastle = target;
    window.__target = target.team;
    // the player's explicit target too
    return { target: target.team, giantOrder: window.__giant.order, giantData: window.__giant.orderData && window.__giant.orderData.team };
  });
  const notes = await page.evaluate(() => { window.__notes = []; const p = window.__game.player; const old = p.notify.bind(p); p.notify = (m, ...a) => { window.__notes.push(m); return old(m, ...a); }; return 0; });
  await page.evaluate(() => { const g = window.__game; g.castles[window.__target].fall(null); });
  await L.step(page, 3);
  const adv = await page.evaluate(() => {
    const g = window.__game, f0 = g.factions[0];
    const next = g.siegeTarget(f0);
    const d = (u) => ({ order: u.order, to: u.orderData ? u.orderData.team : null });
    return {
      fell: window.__target, next: next ? next.team : null,
      lane: window.__lane.map(d), army: window.__army.map(d), giant: d(window.__giant),
      ram: window.__ram.targetCastle ? window.__ram.targetCastle.team : null,
      notes: window.__notes.slice(-3),
    };
  });
  const ok = (x) => x.order === 'assault' && x.to === adv.next && x.to !== adv.fell;
  check('wave soldiers march on the next castle', adv.lane.every(ok), JSON.stringify(adv.lane));
  check('army soldiers on assault orders march on too', adv.army.every(ok), JSON.stringify(adv.army));
  check('the giant marches on', ok(adv.giant), JSON.stringify(adv.giant));
  check('siege engines roll on', adv.ram === adv.next, 'ram -> ' + adv.ram + ', next ' + adv.next);
  check('the player is told', adv.notes.some((m) => /march on/.test(m)), JSON.stringify(adv.notes));

  // ---- the rival lords' pushes roll on ----
  const ai = await page.evaluate(() => {
    const g = window.__game;
    g.round = 12;                                    // late enough for the AI to wage war
    const f = g.factions[1], ai = f.ai;
    const alive = g.castles.filter((c) => !c.fallen && c.team !== 1).map((c) => c.team);
    const first = g.castles[alive[0]];
    const men = [];
    for (let i = 0; i < 5; i++) { const u = g.recruit(f, 'swordsman'); u.setOrder('assault', first); men.push(u); }
    ai.assault = { castle: first, since: g.time };
    f.siegeTarget = first;
    first.fall(null);                                 // that push has won
    const rest = g.castles.filter((c) => !c.fallen && c.team !== 1).map((c) => c.team);
    ai.timer = 0; ai.war();
    return { first: first.team, rest, now: ai.assault ? ai.assault.castle.team : null, orders: men.map((u) => [u.order, u.orderData && u.orderData.team]), target: f.siegeTarget ? f.siegeTarget.team : null };
  });
  check('a rival lord whose push won rolls on to the next castle', ai.rest.length === 0 ? ai.now === null : (ai.now !== null && ai.now !== ai.first && ai.orders.every(([o, t]) => o === 'assault' && t === ai.now)), JSON.stringify(ai));

  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
