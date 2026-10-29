// Siege crews: real units, killed one by one; abandoned engines are taken over by soldiers or by the hero.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const out = await page.evaluate(async () => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor;
    const res = {};
    const f0 = g.factions[0], f2 = g.factions[2];
    f0.gold = 9999;
    const garrisonBefore = g.garrisonCount(0), troopsBefore = g.troopCount(0);
    const e = g.buildSiege(f0, 'ram');
    res.crew = e.crew.map((c) => c && { type: c.type, hp: c.hp, crewOf: !!c.crewOf, slot: c.crewSlot });
    res.counts = { garrisonDelta: g.garrisonCount(0) - garrisonBefore, troopDelta: g.troopCount(0) - troopsBefore };
    const start = e.pos.clone();
    for (let i = 0; i < 150; i++) g.update(1 / 30);   // 5 s
    res.moved = +e.pos.distanceTo(start).toFixed(1);
    // crew ride with the engine
    const seat = new V3(); e.seatPos(0, seat);
    res.crewFollows = +e.crew[0].pos.distanceTo(seat).toFixed(2);
    res.speedNow = +e.speedNow.toFixed(2);

    // kill one crewman: slower
    g.damage(e.crew[0], 999, f2.hero || { team: 2 }, { melee: true });
    res.afterOne = { alive: e.crewAlive(), factor: e.crewFactor(), abandoned: e.abandoned };
    const before = e.pos.clone();
    for (let i = 0; i < 60; i++) g.update(1 / 30);
    res.oneCrewSpeed = +(e.pos.distanceTo(before) / 2).toFixed(2);

    // kill the other: abandoned, stops
    g.damage(e.crew[1], 999, { team: 2 }, { melee: true });
    res.afterTwo = { alive: e.crewAlive(), abandoned: e.abandoned, driver: !!e.driver };
    const stop = e.pos.clone();
    for (let i = 0; i < 60; i++) g.update(1 / 30);
    res.abandonedMoved = +e.pos.distanceTo(stop).toFixed(2);
    res.countedAsSiege = g.siegeCount(0);

    // an enemy marching soldier takes it over
    const foe = g.recruit(f2, 'swordsman', true);
    foe.pos.set(e.pos.x + 8, e.pos.y, e.pos.z);
    foe.setOrder('assault', g.castles[0]);
    for (let i = 0; i < 150 && e.abandoned; i++) g.update(1 / 30);
    res.seized = { team: e.team, abandoned: e.abandoned, crewAlive: e.crewAlive(), manned: foe.crewOf === e, enemyTarget: e.targetCastle && e.targetCastle.team };
    const mv = e.pos.clone();
    for (let i = 0; i < 90; i++) g.update(1 / 30);
    res.seizedMoves = +e.pos.distanceTo(mv).toFixed(2);

    // kill that crewman too; the player boards it
    g.damage(foe, 9999, p, { melee: true });
    res.reabandoned = e.abandoned;
    p.pos.set(e.pos.x + 4, e.pos.y, e.pos.z); p.alive = true;
    g.update(1 / 30);
    res.near = !!g.engineNear(p);
    res.board = g.boardEngine(p, e);
    res.driving = { drive: !!p.drive, team: e.team, driver: e.driver === p, abandoned: e.abandoned };
    // steer through the real input path (keys and mouse)
    const I = g.input;
    const tick = (n) => { for (let i = 0; i < n; i++) { g.update(1 / 30); I.endFrame(); } };
    const yaw0 = e.yaw, pos0 = e.pos.clone();
    I.keys.add('KeyW'); tick(90); I.keys.delete('KeyW');
    res.drivenMoved = +e.pos.distanceTo(pos0).toFixed(1);
    I.keys.add('KeyA'); tick(30); I.keys.delete('KeyA');
    res.turned = +(e.yaw - yaw0).toFixed(2);
    res.hudPrompt = null;
    // ram the enemy gate
    const tc = g.castles[2];
    e.pos.copy(tc.gateOut.clone().lerp(tc.gatePos, 0.25)); e.yaw = Math.atan2(tc.gatePos.x - e.pos.x, tc.gatePos.z - e.pos.z);
    p.yaw = e.yaw;
    const gate0 = tc.gate.hp;
    I.mouse.left = true; tick(200); I.mouse.left = false;
    res.gateDamage = Math.round(gate0 - tc.gate.hp);
    res.heroInside = { dist: +Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z).toFixed(1), inGrid: (() => { let n = 0; g.grid.query(p.pos.x, p.pos.z, 1, (o) => { if (o === p) n++; }); return n; })() };
    // climb out with E
    I.pressed.add('KeyE'); tick(2);
    res.left = { drive: p.drive, abandoned: e.abandoned, dist: +Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z).toFixed(1) };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
