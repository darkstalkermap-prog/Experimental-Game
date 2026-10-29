// quick sanity check of the talent plumbing
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await L.step(page, 0.5);
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const out = {};
    out.start = { cls: p.classId, level: p.level, points: p.talentPoints, maxHp: p.maxHp, armor: p.armor };
    p.setLevel(3);
    out.lvl3 = { points: p.talentPoints };
    out.learn1 = g.learnTalent(p, 'kn_plate');
    out.learn1again = g.learnTalent(p, 'kn_plate');
    out.learnLocked = g.learnTalent(p, 'kn_phalanx');
    out.learnOther = g.learnTalent(p, 'mg_blast');
    out.after = { points: p.talentPoints, maxHp: p.maxHp, armor: p.armor, hp: p.hp };
    out.respecHome = g.respec(p);
    out.afterRespec = { points: p.talentPoints, maxHp: p.maxHp, armor: p.armor, hp: p.hp, home: p.atHome() };
    g.ui.update(0.1);
    out.hint = { hidden: document.getElementById('talentHint').classList.contains('hidden'), text: document.getElementById('talentHint').textContent };
    g.input.pressed.add('KeyN');
    g.update(0.05);
    out.shop = { open: g.ui.shopOpen, tab: g.ui.tab, nodes: document.querySelectorAll('.tnode').length, title: document.getElementById('shopTitle').textContent };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
