// Geometry of the Talents tab (numbers only): do the nodes sit in a tidy grid inside the shop box, at a few window sizes?
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  for (const vp of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 560, height: 800 }]) {
    const { browser, page, errors } = await L.launch({ map: 'small', viewport: vp });
    await L.startSingle(page);
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.player, ui = g.ui;
      const out = {};
      for (const cls of ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier']) {
        p.setClass(cls); p.setLevel(3);
        const q = p.talentPoints; ui.tab = 'talents'; ui.toggleShop(true);
        const box = document.querySelector('#shop .box').getBoundingClientRect();
        const grid = document.getElementById('shopGrid');
        const rects = [...document.querySelectorAll('.tnode')].map((n) => { const b = n.getBoundingClientRect(); return { id: n.dataset.talent, x: b.x, y: b.y, w: b.width, h: b.height }; });
        const overlap = rects.some((a, i) => rects.some((b, j) => i < j && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1));
        const wide = Math.max(...rects.map((r) => r.x + r.w)) <= box.right + 1 && Math.min(...rects.map((r) => r.x)) >= box.left - 1;
        const hs = rects.map((r) => Math.round(r.h));
        out[cls] = { overlap, insideBox: wide, minH: Math.min(...hs), maxH: Math.max(...hs), w: Math.round(rects[0].w), scrolls: grid.scrollHeight > grid.clientHeight + 1, gridH: grid.scrollHeight, boxH: Math.round(box.height) };
        ui.toggleShop(false);
      }
      return out;
    });
    console.log(vp.width + 'x' + vp.height, JSON.stringify(r));
    if (errors.length) console.log('errors', errors.join('|'));
    await browser.close();
  }
})();
