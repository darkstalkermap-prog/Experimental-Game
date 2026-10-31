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
  // a guest who has none of them yet: every living one comes (with his fixed part), the fallen ones it never saw do not; the roster is everybody
  const back = unpackUnits(JSON.parse(JSON.stringify(w)), new Map(), () => 3);
  assert.equal(back.length, units.filter((u) => u.alive).length);
  assert.deepEqual(back.ids.slice(0, back.count), units.map((u) => u.id));
  const known = new Map(units.map((u) => [u.id, u]));
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

test('War Mode: four armies of 500 in a snapshot that fits the room transport; far and idle soldiers come less often, the fallen are laid down', async () => {
  const { packUnits, unpackUnits } = await load('src/warnet.js');
  const { UNIT_TYPES } = await load('src/config.js');
  const types = Object.keys(UNIT_TYPES);
  const units = [];
  for (let i = 0; i < 2000; i++) {
    units.push({
      id: 500 + i + (i >= 1000 ? 7 : 0), type: types[i % 8], team: i % 4, variant: i % 6, alive: true,
      pos: { x: ((i * 37) % 300) - 150, y: 1, z: ((i * 53) % 300) - 150 }, yaw: 0, vel: { x: 1, z: 0 },
      swingT: -1, staggerT: 0, blockFlash: 0, braced: false, attackDir: 'over', hp: 100, maxHp: 100, rank: 1, army: true, lane: false,
    });
  }
  const net = { seq: 0, eyes: [0, 0], ok: new Uint8Array(64).fill(1) };
  const guest = new Map();
  const take = (w) => {
    const list = unpackUnits(JSON.parse(JSON.stringify(w)), guest, () => 1);
    for (const a of list) {
      let g = guest.get(a[0]);
      if (!g) { g = { id: a[0], type: types[a[1]], team: a[2], variant: a[10], rank: a[15] & 7, army: true, lane: false, alive: true, pos: { x: 0, y: 0, z: 0 }, yaw: 0 }; guest.set(a[0], g); }
      g.pos.x = a[3]; g.pos.z = a[5]; g.alive = !!a[7];
    }
    return list;
  };
  let most = 0;
  for (let s = 0; s < 30; s++) {
    for (const u of units) if (u.alive) { u.pos.x += 0.3; u.yaw += 0.01; }   // (everybody marching: the heaviest case)
    if (s === 20) for (let i = 0; i < 2000; i += 3) units[i].alive = false;
    net.seq++;
    const w = packUnits(units, net);
    most = Math.max(most, JSON.stringify(w).length);
    take(w);
  }
  assert.ok(most < 13000, `the largest snapshot of 2000 marching soldiers: ${most} characters`);
  assert.equal(guest.size, 2000, 'every soldier known to the guest');
  const dead = units.filter((u) => !u.alive);
  assert.ok(dead.every((u) => !guest.get(u.id).alive), 'the fallen lie down on the guest');
  // nobody far off is more than a few snapshots behind
  let worst = 0;
  for (const u of units) if (u.alive) worst = Math.max(worst, Math.abs(guest.get(u.id).pos.x - u.pos.x));
  assert.ok(worst <= 0.3 * 4 + 0.2, `the furthest behind: ${worst.toFixed(2)} m`);
  // soldiers at rest: only the refreshes go
  net.seq++; packUnits(units, net);
  net.seq++;
  const rest = JSON.stringify(packUnits(units, net)).length;
  assert.ok(rest < 3000, `2000 soldiers at rest: ${rest} characters`);
  // a guest who gets only one snapshot in three (the room transport keeps the latest of a burst) and says so: what it missed is sent again, and in a
  // few snapshots it has everybody where the host has him, though the soldiers have stopped
  const lossy = new Map(), got = new Set();
  const N2 = { seq: 100, eyes: [], ok: new Uint8Array(64) };
  for (const u of units) u.netQ = null;
  for (let s = 0; s < 60; s++) {
    if (s < 30) for (const u of units) if (u.alive) u.pos.x += 0.3;
    N2.seq++;
    for (let i = 0; i < 64; i++) { const q = N2.seq - 1 - i; N2.ok[q & 63] = got.has(q) ? 1 : 0; }
    const w = packUnits(units, N2);
    if (s % 3) continue;
    got.add(w.q);
    for (const a of unpackUnits(JSON.parse(JSON.stringify(w)), lossy, () => 1)) {
      let g = lossy.get(a[0]);
      if (!g) { g = { id: a[0], type: types[a[1]], team: a[2], variant: a[10], rank: a[15] & 7, army: true, lane: false, alive: true, pos: { x: 0, y: 0, z: 0 }, yaw: 0 }; lossy.set(a[0], g); }
      g.pos.x = a[3]; g.pos.z = a[5]; g.alive = !!a[7];
    }
  }
  const step2 = 0.2;
  assert.equal([...lossy.values()].filter((g) => g.alive).length, units.filter((u) => u.alive).length, 'every living soldier reached the lossy guest');
  assert.ok(units.every((u) => !u.alive || Math.abs(lossy.get(u.id).pos.x - u.pos.x) < step2), 'and stands where the host has him');
  // a soldier sold back (gone from the roster) is dropped
  const sold = units.splice(10, 5);
  net.seq++;
  const list = take(packUnits(units, net));
  const roster = new Set(list.ids.slice(0, list.count));
  assert.ok(sold.every((u) => !roster.has(u.id)) && roster.size === units.length);
});

test('War Mode keeps only a few cosmetic effects in a snapshot', async () => {
  const { thinEvents } = await load('src/warnet.js');
  const list = [];
  for (let i = 0; i < 100; i++) list.push({ k: 'fx' }, { k: 'snd' }, { k: 'arrow' });
  list.push({ k: 'toast' }, { k: 'banner' });
  thinEvents(list);
  const n = (k) => list.filter((e) => e.k === k).length;
  assert.ok(n('fx') <= 12 && n('snd') <= 10 && n('arrow') <= 24);
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
