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
