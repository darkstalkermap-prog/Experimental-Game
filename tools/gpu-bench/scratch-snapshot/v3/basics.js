// Prep timer lock, greyed-out Items tab, rocks and gates solid, armies move on when a castle falls.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);

  // ---- prep timer ----
  const t0 = await page.evaluate(() => { const g = window.__game; return { t: g.phaseT, phase: g.phase, round: g.round }; });
  check('prep starts at 60 s', Math.abs(t0.t - 60) < 0.5 && t0.phase === 'prep' && t0.round === 0, JSON.stringify(t0));
  await page.evaluate(() => { const g = window.__game; g.input.pressed.add('Enter'); g.update(1 / 30); g.input.endFrame(); });
  const t1 = await page.evaluate(() => window.__game.phaseT);
  check('Enter no longer skips the preparation', t1 > 59, 't=' + t1.toFixed(2));
  await page.evaluate(() => { const g = window.__game; g.ui.hudT = 0; g.ui.update(1 / 30); });
  const txt = await page.evaluate(() => document.getElementById('phase').textContent);
  check('HUD shows the countdown as m:ss', /Battle begins in 1:0\d/.test(txt), JSON.stringify(txt));
  await L.step(page, 30);
  const txt2 = await page.evaluate(() => { const g = window.__game; g.ui.hudT = 0; g.ui.update(1 / 30); return document.getElementById('phase').textContent; });
  check('countdown ticks down', /Battle begins in 0:(2\d|3\d)/.test(txt2), JSON.stringify(txt2));

  // ---- items tab ----
  const tab = await page.evaluate(() => {
    const g = window.__game, b = document.querySelector('#shop .tabs button[data-tab="items"]');
    g.ui.toggleShop(true);
    b.click();
    const afterClick = g.ui.tab;
    g.ui.tab = 'items'; g.ui.renderShop();
    const fallback = g.ui.tab;
    const cs = getComputedStyle(b);
    const r = { disabled: b.disabled, afterClick, fallback, filter: cs.filter, opacity: cs.opacity, active: b.classList.contains('active') };
    g.ui.toggleShop(false);
    return r;
  });
  check('Items tab is greyed out and cannot be opened', tab.disabled && tab.afterClick !== 'items' && tab.fallback === 'army' && !tab.active && /grayscale/.test(tab.filter), JSON.stringify(tab));

  // ---- rocks ----
  const rock = await page.evaluate(() => {
    const g = window.__game, P = g.physics, p = g.player;
    // a boulder with open ground around it
    const seen = new Set(); const rocks = [];
    for (const list of P.grid.values()) for (const c of list) {
      if (seen.has(c)) continue; seen.add(c);
      if (c.kind === 'stone' && c.noWalk && (c.maxX - c.minX) / 2 < 3 && Math.hypot((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) > 30) rocks.push(c);
    }
    const total = [...seen].filter((c) => c.kind === 'stone').length;
    const clear = (c) => {
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      for (const o of P.near(cx, cz, 8)) if (o !== c && !(o.maxX < cx - 8 || o.minX > cx + 8 || o.maxZ < cz - 8 || o.minZ > cz + 8)) return false;
      // gentle ground only: a 60-degree hillside can always be walked over
      for (const d of [-4, -2, 2, 4]) if (Math.abs(P.terrainHeight(cx + d, cz) - P.terrainHeight(cx, cz)) / Math.abs(d) > 0.25) return false;
      return true;
    };
    const c = rocks.find(clear) || rocks[0];
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const fake = (keys) => ({ mouse: { dx: 0, dy: 0, left: false, right: false, leftPressed: false, leftReleased: false, rightPressed: false, wheel: 0 }, down: (k) => keys.includes(k), hit: () => false });
    // walk straight at the middle of the rock from 4 m away, for five seconds
    const start = { x: cx - 4, z: cz };
    p.pos.set(start.x, P.terrainHeight(start.x, start.z), start.z);
    p.vel.set(0, 0, 0);
    p.yaw = Math.PI / 2;     // +x
    let inside = false, maxX = -1e9;
    for (let i = 0; i < 300; i++) {
      g.grid.clear(); g.grid.insert(p);
      p.update(1 / 60, fake(['KeyW']));
      if (p.pos.x > c.minX + 0.05 && p.pos.x < c.maxX - 0.05 && p.pos.z > c.minZ + 0.05 && p.pos.z < c.maxZ - 0.05) inside = true;
      maxX = Math.max(maxX, p.pos.x);
    }
    return { rocks: rocks.length, total, size: +(c.maxX - c.minX).toFixed(2), top: +(c.top - P.terrainHeight(cx, cz)).toFixed(2), reachedX: +(maxX - cx).toFixed(2), inside, stoppedAt: +(p.pos.x - cx).toFixed(2) };
  });
  check('boulders exist as colliders', rock.rocks > 5, JSON.stringify(rock));
  check('walking into a boulder stops at its side', !rock.inside && rock.reachedX < -0.3, JSON.stringify(rock));
  // soldiers steer round it
  const steer = await page.evaluate(() => {
    const g = window.__game, P = g.physics;
    let c = null;
    outer: for (const list of P.grid.values()) for (const k of list) if (k.kind === 'stone' && k.noWalk && Math.hypot(k.minX, k.minZ) > 30 && (k.maxX - k.minX) > 1.6) { c = k; break outer; }
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const s = P.steerAroundTrees(cx - 2.5, cz, 1, 0, 0.4, 1);
    return { steered: !!s, turn: s ? +s.z.toFixed(2) : 0 };
  });
  check('soldiers steer round rocks', steer.steered, JSON.stringify(steer));

  // ---- gates ----
  const gates = await page.evaluate(() => {
    const g = window.__game, P = g.physics, c = g.castles[0];
    const gate = c.gate;
    const out = {};
    const probe = (team, open) => {
      gate.openAmt = open;
      const w = c.toWorld(0.4, 19);                       // in the middle of the gate
      const pos = new w.constructor(w.x, w.y, w.z);
      const hit = P.resolve(pos, 0.4, c.center.y, 1.8, team);
      const l = c.toLocal(pos.x, pos.z);
      return { hit, z: +l.z.toFixed(2) };
    };
    out.ownShut = probe(0, 0);
    out.ownHalf = probe(0, 0.4);
    out.ownOpen = probe(0, 1);
    out.foeOpen = probe(1, 1);
    // arrows
    const a = c.toWorld(0, 19, 3);
    gate.openAmt = 0; out.arrowOwnShut = !!P.pointHit(a.x, a.y, a.z, 0);
    gate.openAmt = 1; out.arrowOwnOpen = !!P.pointHit(a.x, a.y, a.z, 0);
    out.arrowFoeOpen = !!P.pointHit(a.x, a.y, a.z, 1);
    gate.openAmt = 0;
    return out;
  });
  check('a shut gate stops its own side', gates.ownShut.hit && (gates.ownShut.z < 18.1 || gates.ownShut.z > 20.3), JSON.stringify(gates.ownShut));
  check('a half-open gate still stops everyone', gates.ownHalf.hit, JSON.stringify(gates.ownHalf));
  check('an open gate lets its own side through', !gates.ownOpen.hit, JSON.stringify(gates.ownOpen));
  check('an open gate still stops enemies', gates.foeOpen.hit, JSON.stringify(gates.foeOpen));
  check('arrows: shut gate stops them, open gate passes its own', gates.arrowOwnShut && !gates.arrowOwnOpen && gates.arrowFoeOpen, JSON.stringify([gates.arrowOwnShut, gates.arrowOwnOpen, gates.arrowFoeOpen]));

  // when the gate opens and shuts
  const rules = await page.evaluate(() => {
    const g = window.__game, c = g.castles[0], U = g.units[0].constructor;
    for (const u of g.units) { u.think = () => {}; u.update = () => {}; }       // freeze everyone
    const place = (team, lx, lz, y = 0) => { const w = c.toWorld(lx, lz); const u = new U(g, 'swordsman', team, w, { hp: 100, dmg: 1 }); u.think = () => {}; u.update = () => {}; u.pos.y = c.center.y + y; g.units.push(u); return u; };
    const grid = () => { g.grid.clear(); for (const o of g.units) if (o.alive) g.grid.insert(o); for (const h of g.humans) if (h.alive) g.grid.insert(h); };
    const res = {};
    for (const u of g.units) u.alive = false;               // clear the field (keeps the objects)
    g.player.pos.set(c.center.x, c.center.y, c.center.z);   // hero in the middle of the courtyard
    g.player.alive = true;
    grid();
    res.nobody = g.gateShouldOpen(c);
    const f = place(0, 0, 14); grid();
    res.friend = g.gateShouldOpen(c);
    const e = place(1, 0, 24); grid();
    res.friendAndFoe = g.gateShouldOpen(c);
    // the lord beside the gate overrides
    g.player.pos.copy(c.toWorld(0, 15)); grid();
    res.lordNear = g.gateShouldOpen(c);
    g.player.pos.set(c.center.x, c.center.y, c.center.z); grid();
    // a friend in the gateway keeps it open
    f.pos.copy(c.toWorld(0, 19)); grid();
    res.inGateway = g.gateShouldOpen(c);
    // a friend on the wall walk does not
    f.pos.copy(c.toWorld(2, 19)); f.pos.y = c.center.y + 8; e.alive = false; grid();
    res.archerOnWall = g.gateShouldOpen(c);
    return res;
  });
  check('gate stays shut with nobody near', rules.nobody === false, JSON.stringify(rules));
  check('gate opens for a friend', rules.friend === true);
  check('gate shuts when an enemy is at it', rules.friendAndFoe === false);
  check('the lord beside the gate holds it open', rules.lordNear === true);
  check('nobody is shut in the gateway', rules.inGateway === true);
  check('archers on the wall do not work the gate', rules.archerOnWall === false);

  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
