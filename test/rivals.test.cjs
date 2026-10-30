const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = (file) => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '..', file)).toString('base64'));

test('the roster: at least eight personalities, six names each, three Lords and three Ladies, no first name twice', async () => {
  const { PERSONAS } = await load('src/rivals.js');
  assert.ok(PERSONAS.length >= 8);
  assert.equal(new Set(PERSONAS.map((p) => p.id)).size, PERSONAS.length);
  for (const p of PERSONAS) {
    assert.match(p.id, /^[a-z]+$/);
    assert.equal(p.names.length, 6);
    assert.equal(p.names.filter((n) => n.startsWith('Lord ')).length, 3);
    assert.equal(p.names.filter((n) => n.startsWith('Lady ')).length, 3);
    assert.match(p.epithet, /^the [A-Z]/);
    assert.ok(p.blurb && p.plan && p.tag && p.kind);
    assert.ok(p.line && p.line.length < 48, p.id);   // (the end screen's row gives each lord one short line)
  }
  const firsts = PERSONAS.flatMap((p) => p.names.map((n) => n.split(' ')[1]));
  assert.equal(new Set(firsts).size, firsts.length);
});

test('an option value names a lord (or the classic one) and the same value always shows the same name', async () => {
  const { rivalInfo } = await load('src/rivals.js');
  for (const none of ['', 'classic', 'nonsense', 'rusher123', 5, null, undefined]) assert.equal(rivalInfo(none), null);
  assert.equal(rivalInfo('rusher').name, 'Lord Varric the Reckless');
  assert.equal(rivalInfo('rusher3').name, 'Lady Kestra the Reckless');
  assert.equal(rivalInfo('rusher3').short, 'Kestra the Reckless');
  assert.equal(rivalInfo('rusher9').name, rivalInfo('rusher3').name);   // (a name index past the pool wraps)
  assert.equal(rivalInfo('turtler2'), rivalInfo('turtler2'));
});

test('CLASSIC is the old lord: the numbers the AI had before the personalities', async () => {
  const { CLASSIC } = await load('src/rivals.js');
  assert.deepEqual(CLASSIC.mix, [0.38, 0.62]);
  assert.deepEqual(CLASSIC.reserve, [100, 150]);
  assert.equal(CLASSIC.warStage, 4);
  assert.equal(CLASSIC.minTroops, 8);
  assert.equal(CLASSIC.hero, 0.6);
  assert.deepEqual(CLASSIC.elites.map((e) => [e.type, e.gold, e.stage, e.p]), [['knight', 450, 4, 0.3], ['horseman', 300, 3, 0.22], ['lancer', 600, 6, 0.15]]);
  assert.equal(CLASSIC.goals, undefined);   // (no plan, no tax, no lock: those code paths never run for it)
  assert.equal(CLASSIC.tax, undefined);
  assert.equal(CLASSIC.lock, undefined);
});

test('a roll is four different personalities, the same for the same seed, and no house draws the lord it just had', async () => {
  const { rollRivals, rivalInfo, PERSONAS } = await load('src/rivals.js');
  const a = rollRivals(12345), b = rollRivals(12345), c = rollRivals(12346);
  assert.equal(a.length, 4);
  assert.equal(new Set(a.map((x) => x.replace(/\d+$/, ''))).size, 4);
  assert.ok(a.every((x) => rivalInfo(x)));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const base = (x) => x.replace(/\d+$/, '');
  for (let s = 1; s <= 200; s++) {
    const x = rollRivals(s), y = rollRivals(s + 1000, x);
    assert.ok(y.every((id, i) => base(id) !== base(x[i])), `seed ${s}`);
  }
  const seen = new Set();
  for (let s = 1; s <= 300; s++) seen.add(base(rollRivals(s)[1]));
  assert.equal(seen.size, PERSONAS.length);   // (every personality can lead a house)
});

test('a lord\'s push is announced by his name and his own verb; a wave takes his elite in place of a foot soldier', async () => {
  const { pushLine, rivalInfo, tuneWave } = await load('src/rivals.js');
  assert.equal(pushLine(rivalInfo('rusher'), 'House Elden'), 'Lord Varric the Reckless charges out against House Elden!');
  const list = ['swordsman', 'swordsman', 'spearman', 'archer'];
  tuneWave(list, 4, { from: 3, every: 2, type: 'horseman' });
  assert.deepEqual(list, ['swordsman', 'swordsman', 'spearman', 'archer']);   // (not a wave of his)
  tuneWave(list, 5, { from: 3, every: 2, type: 'horseman' });
  assert.deepEqual(list, ['horseman', 'swordsman', 'spearman', 'archer']);   // (same size)
  tuneWave(list, 5, null);
  assert.equal(list.length, 4);
});

test('the match options accept the ids of the personalities', async () => {
  const { sanitizeOptions } = await load('src/options.js');
  const o = sanitizeOptions({ rivals: ['', 'rusher3', 'classic', 'turtler'] });
  assert.deepEqual(o.rivals, ['', 'rusher3', 'classic', 'turtler']);
  assert.deepEqual(sanitizeOptions({ rivals: [5, 'Bad Id', 'x'.repeat(40), null] }).rivals, ['', '', '', '']);
});
