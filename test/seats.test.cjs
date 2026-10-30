const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (file) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));

test('a war: castles are taken only when open and free, and a war needs two houses', async () => {
  const S = await load('src/seats.js');
  const slots = S.freshSlots();
  const host = { team: 0, hs: 0 }, guest = { team: 1, hs: 4 }, players = [host, guest];
  assert.equal(S.canTakeSlot(slots, players, host, 1), false, 'the guest holds castle 2');
  assert.equal(S.canTakeSlot(slots, players, host, 3), true);
  slots[3] = 'ai';
  assert.equal(S.canTakeSlot(slots, players, host, 3), false, 'a closed castle cannot be taken');
  assert.equal(S.canTakeSlot(slots, players, host, 7), false, 'no castle 8');
  assert.equal(S.canTakeSlot(slots, players, host, '2'), false, 'only numbers');
  assert.equal(S.firstFreeSlot(slots, players), 2);
  slots[2] = 'empty';
  assert.equal(S.firstFreeSlot(slots, players), -1, 'nothing free: the host answers "full"');
  assert.deepEqual(S.emptyTeams(slots, players), [2]);
  assert.equal(S.warProblem(['open', 'empty', 'empty', 'empty'], [host], false) !== null, true, 'one house alone is no war');
  assert.equal(S.warProblem(['open', 'empty', 'empty', 'empty'], [host, guest], false), null, 'two people are two houses');
  assert.equal(S.warProblem(['open', 'open', 'empty', 'empty'], [host, guest], true) !== null, true, 'co-op needs an enemy');
  assert.equal(S.warProblem(['open', 'open', 'ai', 'empty'], [host, guest], true), null);
  assert.deepEqual(S.cleanSlots(['open', 'x', 'empty']), ['open', 'open', 'empty', 'open']);
  assert.equal(S.nextState('open'), 'ai'); assert.equal(S.nextState('ai'), 'empty'); assert.equal(S.nextState('empty'), 'open');
});

test('a hero match: seats by side, the side with fewer people first, every side needs a hero', async () => {
  const S = await load('src/seats.js');
  const seats = S.freshSeats();
  const a = { team: 0, hs: 0 }, b = { team: 1, hs: -1 };
  assert.equal(S.firstFreeSeat(seats, 2, [a]), 4, 'the second side has nobody: a newcomer goes there');
  b.hs = 4;
  assert.equal(S.firstFreeSeat(seats, 2, [a, b]), 1);
  assert.equal(S.canTakeSeat(seats, 2, [a, b], a, 2), false, 'seat 3 of a side is not in use in 2 v 2');
  assert.equal(S.canTakeSeat(seats, 3, [a, b], a, 2), true);
  assert.equal(S.canTakeSeat(seats, 3, [a, b], a, 4), false, 'taken');
  seats[1] = 'empty';
  assert.equal(S.heroProblem(seats, 2, [a, b]), null);
  seats[4] = seats[5] = 'empty';
  assert.equal(S.heroProblem(seats, 2, [a]) !== null, true, 'the second side has nobody at all');
  seats[4] = 'open';
  assert.deepEqual(S.heroCast(seats, 2, [a, b]), ['h', '', '', '', 'h', '', '', ''], 'people, bots and nobody');
  seats[5] = 'ai';
  assert.deepEqual(S.heroCast(seats, 2, [a, b]).slice(4, 6), ['h', 'b']);
});

test('reseat gives everybody a place, opening a closed one when it must', async () => {
  const S = await load('src/seats.js');
  const slots = ['ai', 'empty', 'empty', 'open'], seats = ['empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'];
  const players = [{ team: 0, hs: 6 }, { team: -1, hs: -1 }, { team: 0, hs: 6 }];
  S.reseat(players, slots, seats, 2);
  const teams = players.map((p) => p.team), hs = players.map((p) => p.hs);
  assert.equal(new Set(teams).size, 3, 'three castles: ' + teams);
  assert.equal(new Set(hs).size, 3, 'three seats: ' + hs);
  for (const p of players) { assert.equal(slots[p.team], 'open'); assert.equal(seats[p.hs], 'open'); assert.ok(S.seatInUse(p.hs, 2)); }
});

test('colour wishes: a war by castle, a hero match by the first person of each side', async () => {
  const S = await load('src/seats.js');
  assert.deepEqual(S.colorWants([{ team: 2, col: 'teal' }, { team: 0, col: 'rose' }], false), ['rose', null, 'teal', null]);
  assert.deepEqual(S.colorWants([{ hs: 5, col: 'teal' }, { hs: 4, col: 'rose' }, { hs: 1, col: 'gold' }], true), ['gold', 'rose', null, null]);
});
