const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (file) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));

test('a match\'s races: what each lord asked for, the others random, the same or human', async () => {
  const R = await load('src/races.js');
  assert.deepEqual(R.assignRaces(['elf', null, 'orc', null], 'human'), ['elf', 'human', 'orc', 'human']);
  assert.deepEqual(R.assignRaces([null, 'dwarf', null, null], 'same'), ['dwarf', 'dwarf', 'dwarf', 'dwarf']);
  assert.deepEqual(R.assignRaces([null, null, null, null], 'same', 'undead'), ['undead', 'undead', 'undead', 'undead'], 'watched: the menu\'s race');
  const rolled = R.assignRaces(['human', null, null, null], 'random');
  assert.equal(rolled[0], 'human');
  assert.ok(rolled.every(R.isRaceId));
});

test('races never draw from Math.random (a seeded battle plays the same with any races)', async () => {
  const R = await load('src/races.js');
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try { for (let i = 0; i < 50; i++) R.assignRaces([null, null, null, null], 'random'); } finally { Math.random = real; }
  assert.equal(draws, 0);
});

test('what a lord asks for: a castle each in a war, a side\'s first player in Hero Mode; a guest\'s message made safe', async () => {
  const R = await load('src/races.js');
  assert.deepEqual(R.raceWants([{ team: 0, rc: 'elf' }, { team: 2, rc: 'troll' }, { team: 3, rc: 'orc' }], false), ['elf', null, null, 'orc']);
  assert.deepEqual(R.raceWants([{ hs: 5, rc: 'undead' }, { hs: 4, rc: 'dwarf' }, { hs: 0, rc: 'elf' }], true), ['elf', 'dwarf', null, null]);
  assert.deepEqual(R.sanitizeRaces(['elf', 'x', 3]), ['elf', 'human', 'human', 'human']);
  assert.deepEqual(R.sanitizeRaces(null), ['human', 'human', 'human', 'human']);
  R.setRaces(['orc', 'elf', '<b>', 'dwarf']);
  assert.equal(R.raceOf(0), 'orc');
  assert.equal(R.raceOf(2), 'human');
  assert.equal(R.raceOf(4), 'human', 'the raiders are men');
  assert.deepEqual(R.racesInPlay().sort(), ['dwarf', 'elf', 'human', 'orc']);
});
