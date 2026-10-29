// Do soldiers do what they are told? Every order, for offence and for defence, on the small map.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
const only = process.argv[2] || '';
const want = (n) => !only || only.split(',').includes(n);

async function fresh(map = 'small') {
  const h = await L.launch({ map });
  await L.startSingle(h.page);
  await h.page.evaluate(() => {
    const g = window.__game;
    g.phaseT = 1e9;                                   // no waves: just the starting troops
    for (const f of g.factions) f.ai = null;          // the rival lords stand still
    for (const u of g.units) if (u.isHero && u.team !== 0) { u.think = () => {}; u.update = function (dt) { this.animate(dt, false); }; }
    const f = g.factions[0]; f.gold = 1e6; f.troopCap = 36;
    window.__mkArmy = (mix) => {
      const out = [];
      for (const t of mix) { const u = g.recruit(f, t); g.assignRole(f, u, 'army'); out.push(u); }
      g.reslot(0);
      window.__army = out;
      return out.length;
    };
    window.__place = (u, x, z) => { u.pos.set(x, g.physics.groundHeight(x, z, 60), z); u.mesh.position.copy(u.pos); u.nav = null; u.waypoint = null; u.vel.set(0, 0, 0); };
    window.__near = (list, x, z, r) => list.filter((u) => u.alive && Math.hypot(u.pos.x - x, u.pos.z - z) < r).length;
    window.__dummy = (team, x, z, hp = 3000) => {
      const U = g.units[0].constructor;
      const u = new U(g, 'swordsman', team, new g.player.pos.constructor(x, 0, z), { hp, dmg: 0 });
      u.think = () => {}; u.update = function (dt) { this.animate(dt, false); };
      u.hp = u.maxHp = hp; g.units.push(u);
      return u;
    };
  });
  return h;
}
const MIX = ['swordsman', 'swordsman', 'spearman', 'spearman', 'archer', 'archer', 'archer', 'knight', 'horseman', 'horseman', 'swordsman', 'archer'];

(async () => {
  // ------------------------------------------------------------ follow: through the gate and across the field
  if (want('follow')) {
    const { browser, page, errors } = await fresh();
    const n = await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await L.step(page, 4);
    const r = await page.evaluate(() => {
      const g = window.__game, c = g.castles[0], p = g.player;
      const out = {};
      out.inside = window.__army.filter((u) => c.isInside(u.pos, 2)).length;
      const w = c.toWorld(0, 60); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z);
      g.localOrder('follow');
      return out;
    });
    await L.step(page, 45);
    const f1 = await page.evaluate(() => {
      const g = window.__game, p = g.player, c = g.castles[0];
      const a = window.__army.filter((u) => u.alive);
      const d = a.map((u) => Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z));
      return { alive: a.length, within16: d.filter((x) => x < 16).length, max: Math.round(Math.max(...d)), inside: a.filter((u) => c.isInside(u.pos, 2)).length, orders: [...new Set(a.map((u) => u.order))].join() };
    });
    check('follow: the army marches out of the gate and gathers round the hero', n === MIX.length && f1.within16 >= f1.alive - 1 && f1.inside === 0, JSON.stringify({ start: r, f1 }));
    // the hero walks on across the field; the army keeps up
    await page.evaluate(() => { const g = window.__game, c = g.castles[0], w = c.toWorld(40, 90); g.player.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); });
    await L.step(page, 35);
    const f2 = await page.evaluate(() => {
      const g = window.__game, p = g.player;
      const a = window.__army.filter((u) => u.alive);
      const d = a.map((u) => Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z));
      return { alive: a.length, within18: d.filter((x) => x < 18).length, max: Math.round(Math.max(...d)) };
    });
    check('follow: and keeps up when the hero moves on', f2.within18 >= f2.alive - 1, JSON.stringify(f2));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ hold
  if (want('hold')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0], p = g.player;
      const w = c.toWorld(0, 45); p.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z);
      const t = c.toWorld(0, 80); p.yaw = Math.atan2(t.x - w.x, t.z - w.z); p.pitch = 0;
      g.localOrder('hold');
      window.__holdAt = { x: w.x + Math.sin(p.yaw) * 6, z: w.z + Math.cos(p.yaw) * 6 };
    });
    await L.step(page, 40);
    const a = await page.evaluate(() => { const h = window.__holdAt; const a = window.__army.filter((u) => u.alive); return { alive: a.length, near: window.__near(a, h.x, h.z, 12), orders: [...new Set(a.map((u) => u.order))].join() }; });
    check('hold: the army takes the position in front of the hero', a.near >= a.alive - 1 && a.orders === 'hold', JSON.stringify(a));
    await page.evaluate(() => { const g = window.__game, c = g.castles[0], w = c.toWorld(0, 12); g.player.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z); });
    await L.step(page, 30);
    const b = await page.evaluate(() => { const h = window.__holdAt; const a = window.__army.filter((u) => u.alive); return { near: window.__near(a, h.x, h.z, 12), alive: a.length }; });
    check('hold: and stays there when the hero walks away', b.near >= b.alive - 1, JSON.stringify(b));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ charge
  if (want('charge')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      window.__foes = [];
      for (let i = 0; i < 6; i++) { const w = c.toWorld(-10 + i * 4, 58); window.__foes.push(window.__dummy(1, w.x, w.z, 4000)); }
      g.localOrder('charge');
    });
    await L.step(page, 50);
    const a = await page.evaluate(() => {
      const foes = window.__foes;
      const dmg = foes.reduce((s, u) => s + (u.maxHp - u.hp), 0);
      const fighters = window.__army.filter((u) => u.alive && u.kind !== 'archer');
      const close = fighters.filter((u) => foes.some((f) => Math.hypot(u.pos.x - f.pos.x, u.pos.z - f.pos.z) < 6)).length;
      const archers = window.__army.filter((u) => u.alive && u.kind === 'archer');
      const shooting = archers.filter((u) => foes.some((f) => Math.hypot(u.pos.x - f.pos.x, u.pos.z - f.pos.z) < u.range + 3)).length;
      return { dmg: Math.round(dmg), fighters: fighters.length, close, archers: archers.length, shooting };
    });
    check('charge: the army rides out of the gate and cuts into the enemy', a.dmg > 1500 && a.close >= a.fighters - 2 && a.shooting >= a.archers - 1, JSON.stringify(a));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ defend: from the field back into the castle
  if (want('defend')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      window.__army.forEach((u, i) => { const w = c.toWorld(-8 + (i % 6) * 3, 50 + Math.floor(i / 6) * 3); window.__place(u, w.x, w.z); });
      g.localOrder('defend');
    });
    await L.step(page, 45);
    const a = await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      const army = window.__army.filter((u) => u.alive);
      const inside = army.filter((u) => c.isInside(u.pos, 2) || u.post).length;
      const posts = c.posts.filter((p) => p.occupant && window.__army.includes(p.occupant)).length;
      return { alive: army.length, inside, posts, archersOnWalls: army.filter((u) => u.kind === 'archer' && u.post).length };
    });
    check('defend: the army falls back into the castle', a.inside >= a.alive - 1, JSON.stringify(a));
    check('defend: the archers climb onto the walls', a.archersOnWalls >= 3, JSON.stringify(a));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ assault: march on the enemy castle and break it
  if (want('assault')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await page.evaluate(() => { const g = window.__game; g.factions[0].levies = 0; g.localOrder('assault'); window.__target = g.siegeTarget(g.factions[0]).team; });
    await L.step(page, 200);
    const a = await page.evaluate(() => {
      const g = window.__game, t = g.castles[window.__target];
      const army = window.__army.filter((u) => u.alive);
      const near = army.filter((u) => Math.hypot(u.pos.x - t.center.x, u.pos.z - t.center.z) < 40).length;
      return { target: window.__target, alive: army.length, near, gate: Math.round(t.gate.hp), gateAlive: t.gate.alive, keep: Math.round(t.keep.hp), fallen: t.fallen, orders: [...new Set(army.map((u) => u.order))].join() };
    });
    check('assault: the army marches on the target castle, breaks into it (and moves on once it has fallen)', a.alive > 0 && (a.fallen || (!a.gateAlive && a.keep < 2500) || (a.near >= a.alive - 2 && (!a.gateAlive || a.gate < 1400 || a.keep < 3000))), JSON.stringify(a));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ roles
  if (want('roles')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate((mix) => window.__mkArmy(mix), MIX);
    await L.step(page, 3);
    await page.evaluate(() => { const g = window.__game; g.setRoles(0, { role: 'garrison' }); });
    await L.step(page, 20);
    const a = await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      const mine = g.units.filter((u) => u.team === 0 && u.alive && !u.isHero);
      return { n: mine.length, inside: mine.filter((u) => c.isInside(u.pos, 2) || u.post).length, orders: [...new Set(mine.map((u) => u.order))].join() };
    });
    check('garrison: everyone stays home and defends', a.inside === a.n && a.orders === 'defend', JSON.stringify(a));
    await page.evaluate(() => { const g = window.__game; g.setRoles(0, { role: 'lane' }); });
    await L.step(page, 20);
    const b = await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      const mine = g.units.filter((u) => u.team === 0 && u.alive && !u.isHero);
      return { n: mine.length, outside: mine.filter((u) => !c.inFootprint(u.pos, 2)).length, orders: [...new Set(mine.map((u) => u.order))].join() };
    });
    check('lane: everyone marches out on the enemy', b.outside >= b.n - 2 && /assault/.test(b.orders), JSON.stringify(b));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }

  // ------------------------------------------------------------ defence against an attack
  if (want('siege')) {
    const { browser, page, errors } = await fresh();
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0], f1 = g.factions[1];
      f1.gold = 1e6;
      window.__att = [];
      for (const t of ['swordsman', 'swordsman', 'spearman', 'spearman', 'archer', 'archer', 'knight', 'horseman']) {
        const u = g.recruit(f1, t);
        const w = c.toWorld(-6 + window.__att.length * 1.6, 42);
        window.__place(u, w.x, w.z);
        u.setOrder('assault', c);
        window.__att.push(u);
      }
      // the garrison is bigger than usual
      const f0 = g.factions[0]; f0.gold = 1e6;
      for (const t of ['swordsman', 'swordsman', 'archer', 'archer', 'archer', 'spearman']) g.recruit(f0, t);
      window.__gateMin = 1;
    });
    let t = 0, dead = false, archersUp = 0, gateClosed = false;
    while (t < 90 && !dead) {
      await L.step(page, 3); t += 3;
      const s = await page.evaluate(() => {
        const g = window.__game, c = g.castles[0];
        window.__gateMin = Math.min(window.__gateMin, c.gate.openAmt);
        return { alive: window.__att.filter((u) => u.alive).length, up: g.units.filter((u) => u.team === 0 && u.post).length, closed: c.gate.openAmt < 0.3, hp: Math.round(c.gate.hp) };
      });
      archersUp = Math.max(archersUp, s.up); gateClosed = gateClosed || s.closed; dead = s.alive === 0;
    }
    const end = await page.evaluate(() => { const g = window.__game, c = g.castles[0]; return { att: window.__att.filter((u) => u.alive).length, mine: g.units.filter((u) => u.team === 0 && u.alive && !u.isHero).length, gate: Math.round(c.gate.hp), gateMin: +window.__gateMin.toFixed(2), keep: Math.round(c.keep.hp) }; });
    check('defence: the garrison beats the attackers', end.att === 0 && end.keep === 3000, JSON.stringify({ t, ...end }));
    check('defence: archers man the walls and the gate shuts on the enemy', archersUp >= 3 && gateClosed, JSON.stringify({ archersUp, gateClosed, gateMin: end.gateMin }));
    await page.evaluate(() => { window.__game.castles[0].repairGate(); });   // (the attackers broke it)
    await L.step(page, 4);
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0];
      const w = c.toWorld(0, 14);
      const u = window.__dummy(0, w.x, w.z, 500);
      u.pos.y = c.center.y;
    });
    await L.step(page, 3);
    const gate = await page.evaluate(() => +window.__game.castles[0].gate.openAmt.toFixed(2));
    check('defence: with the enemy gone the gate opens again for a friend', gate > 0.7, 'openAmt=' + gate);
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
