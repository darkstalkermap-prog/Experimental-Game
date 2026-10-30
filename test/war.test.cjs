const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', file)).href);

test('War Mode packs hundreds of soldiers into a short string and reads them back', async () => {
  const { packUnits, unpackUnits } = await load('src/warnet.js');
  const { WORLD, UNIT_TYPES } = await load('src/config.js');
  const types = Object.keys(UNIT_TYPES);
  const units = [];
  for (let i = 0; i < 600; i++) {
    units.push({
      id: 70000 + i * 3, type: types[i % types.length], team: i % 4, variant: i % 6, alive: i % 7 !== 0,
      pos: { x: ((i * 37) % 400) - 200, y: 1, z: ((i * 53) % 400) - 200 }, yaw: (i * 0.37) % 7 - 1, vel: { x: (i % 5) * 0.8, z: 1 },
      swingT: i % 3 ? -1 : 0.25, staggerT: i % 11 === 0 ? 0.2 : 0, blockFlash: 0, braced: false, attackDir: 'over',
      hp: (i % 10) * 10 + 5, maxHp: 105, rank: 1 + (i % 5), army: true, lane: false, isHero: i === 5, name: i === 5 ? 'Lord Varr' : undefined,
    });
  }
  const w = packUnits(units);
  const size = JSON.stringify(w).length;
  assert.ok(size < 10000, `600 soldiers in ${size} characters`);
  const known = new Map(units.map((u) => [u.id, u]));
  const back = unpackUnits(JSON.parse(JSON.stringify(w)), known, () => 3);
  assert.equal(back.length, units.length);
  const step = (2 * WORLD.half) / 4095;
  for (const a of back) {
    const u = known.get(a[0]);
    assert.ok(u, 'id ' + a[0]);
    assert.equal(types[a[1]], u.type);
    assert.equal(a[2], u.team);
    assert.equal(a[7], u.alive ? 1 : 0);
    if (!u.alive) continue;
    assert.ok(Math.abs(a[3] - u.pos.x) <= step && Math.abs(a[5] - u.pos.z) <= step, 'position');
    assert.equal(a[4], 3);
    assert.equal(a[10], u.variant);
    assert.ok(Math.abs(a[11] - (u.hp / u.maxHp) * 100) <= 1, 'health');
    assert.equal(a[15] & 7, u.rank);
    assert.ok(a[15] & 16, 'army flag');
    let dy = Math.abs(a[6] - u.yaw) % (Math.PI * 2);
    dy = Math.min(dy, Math.PI * 2 - dy);
    assert.ok(dy < 0.06, 'yaw');
    assert.equal(a[8] >= 0, u.swingT >= 0);
    if (u.isHero) assert.equal(a[17], 'Lord Varr');
  }
});

test('War Mode keeps only a few cosmetic effects in a snapshot', async () => {
  const { thinEvents } = await load('src/warnet.js');
  const list = [];
  for (let i = 0; i < 100; i++) list.push({ k: 'fx' }, { k: 'snd' }, { k: 'arrow' });
  list.push({ k: 'toast' }, { k: 'banner' });
  thinEvents(list);
  const n = (k) => list.filter((e) => e.k === k).length;
  assert.ok(n('fx') <= 16 && n('snd') <= 12 && n('arrow') <= 32);
  assert.equal(n('toast'), 1);
  assert.equal(n('banner'), 1);
});

test('War Mode: a hill for every army, allies on neighbouring hills, walkable slopes, each army on its hilltop', async () => {
  const { WORLD, setMapSize, setWarWorld } = await load('src/config.js');
  const { FIELD, layoutField, fieldProfile, sideSpot } = await load('src/warmap.js');
  for (const size of ['small', 'medium', 'large']) {
    for (const plan of ['11', '111', '1111', '22', '21', '31']) {
      setMapSize(size);
      setWarWorld(plan);
      layoutField();
      const sizes = [...plan].map(Number), hills = sizes.reduce((a, b) => a + b, 0);
      assert.equal(FIELD.hills, hills);
      assert.equal(FIELD.plan, plan);
      let steepest = 0;
      const spots = [];
      sizes.forEach((of, side) => {
        for (let slot = 0; slot < of; slot++) {
          const s = sideSpot(side, sizes.length, slot, of);
          spots.push({ side, ...s });
          // the front rank stands on the flat top, the middle of the map is the low field
          assert.ok(fieldProfile(s.x, s.z) > FIELD.height - 0.5, `${size}/${plan}: side ${side}.${slot} on its hilltop`);
          assert.ok(fieldProfile(s.x - s.fx * 20, s.z - s.fz * 20) > FIELD.height - 0.5, 'the ranks behind it too');
          for (let d = 0; d < FIELD.front + 10; d += 0.5) {
            const a = fieldProfile(s.x + s.fx * d, s.z + s.fz * d), b = fieldProfile(s.x + s.fx * (d + 0.5), s.z + s.fz * (d + 0.5));
            steepest = Math.max(steepest, Math.abs(a - b) / 0.5);
          }
        }
      });
      // every army a hill of its own: the hills all differ, allies' tops well apart, nearer each other than to any enemy
      assert.equal(new Set(spots.map((s) => s.hill)).size, hills, `${size}/${plan}: a hill each`);
      let ally = Infinity, foe = Infinity;
      for (const a of spots) for (const b of spots) if (a !== b) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (a.side === b.side) ally = Math.min(ally, d); else foe = Math.min(foe, d); }
      if (ally < Infinity) {
        assert.ok(ally > FIELD.hw * 2, `${size}/${plan}: allied armies ${ally.toFixed(0)} m apart, on hills of their own`);
        assert.ok(ally < foe, `${size}/${plan}: allies are neighbours (${ally.toFixed(0)} m; the nearest enemy ${foe.toFixed(0)} m)`);
      }
      assert.ok(foe > FIELD.hw, `${size}/${plan}: enemies far apart`);
      const deg = (Math.atan(steepest) * 180) / Math.PI;
      assert.ok(fieldProfile(0, 0) < 1, `${size}/${plan}: the middle is low`);
      assert.ok(deg < 28, `${size}/${plan}: slopes ${deg.toFixed(1)} degrees`);
      assert.ok(FIELD.front + FIELD.hd * 2 < WORLD.playHalf, 'the hills lie inside the play area');
    }
  }
  setWarWorld(0);
  setMapSize('medium');
});

test('War Mode: the sides of a match and the hills its world needs', async () => {
  const { warSides, warHills, menuPlan } = await load('src/warmap.js');
  const { setWarWorld, WAR_WORLD } = await load('src/config.js');
  assert.deepEqual(warSides('duel', [0], [0, 1, 2, 3], false).sides, [[0], [1]]);
  assert.deepEqual(warSides('teams', [0], [0, 1, 2, 3], false).sides, [[0, 2], [1, 3]]);
  assert.equal(warSides('ffa', [0], [0, 1, 2, 3], false).sides.length, 4);
  assert.deepEqual(warSides('ffa', [0, 1], [0, 1, 2, 3], true).sides, [[0, 1], [2, 3]]);
  // one hill per army, grouped by side
  assert.equal(warHills({ players: [{ team: 0 }], war: { format: 'ffa' } }), '1111');
  assert.equal(warHills({ players: [{ team: 0 }], war: { format: 'ffa' }, empty: [3] }), '111');
  assert.equal(warHills({ players: [{ team: 0 }], war: { format: 'duel' } }), '11');
  assert.equal(warHills({ players: [{ team: 0 }], war: { format: 'teams' } }), '22');
  assert.equal(warHills({ players: [{ team: 0 }, { team: 1 }], coop: true, war: { format: 'ffa' } }), '22');
  assert.equal(warHills({ players: [{ team: 0 }, { team: 1 }, { team: 2 }], coop: true, war: { format: 'ffa' } }), '31');
  assert.equal(warHills({ players: [{ team: 0 }], war: { format: '__proto__' } }), '1111');
  assert.equal(menuPlan('teams'), '22');
  // the world's switch takes a plan or a number of hills, and nothing odd
  for (const [v, plan, n] of [['22', '22', 4], [3, '111', 3], ['31', '31', 4], ['9x', '11', 2], ['44', '1111', 4], [true, '11', 2]]) {
    setWarWorld(v);
    assert.equal(WAR_WORLD.plan, plan, String(v));
    assert.equal(WAR_WORLD.hills, n, String(v));
  }
  setWarWorld(0);
  assert.equal(WAR_WORLD.on, false);
});
