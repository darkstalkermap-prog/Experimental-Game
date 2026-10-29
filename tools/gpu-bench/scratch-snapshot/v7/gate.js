// Repairing the gate costs 1500 gold, whatever state it is in, for the player and for the rival lords.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!ok) failed++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1100, height: 800 } });
  await L.startSingle(page);
  await L.step(page, 1);
  let r = await page.evaluate(async () => {
    const g = window.__game, f = g.factions[0], c = f.castle, E = await import('/src/economy.js'), C = await import('/src/config.js');
    const item = E.SHOP_BY_ID.repair_gate, out = { constant: C.GATE_REPAIR_COST };
    out.intact = item.can(g, f);
    c.gate.hp = c.gate.maxHp * 0.4;
    out.hurt = { can: item.can(g, f), cost: item.cost(g, f) };
    f.gold = 1499;
    out.poor = { res: E.buy(g, f, 'repair_gate'), gold: f.gold, hp: Math.round(c.gate.hp) };
    f.gold = 1500;
    out.rich = { res: E.buy(g, f, 'repair_gate'), gold: f.gold, hp: Math.round(c.gate.hp), max: Math.round(c.gate.maxHp) };
    // a broken gate costs the same to rebuild
    c.gate.takeDamage(1e6, null);
    out.broken = { alive: c.gate.alive, can: item.can(g, f), cost: item.cost(g, f) };
    f.gold = 2000;
    out.rebuilt = { res: E.buy(g, f, 'repair_gate'), gold: f.gold, alive: c.gate.alive };
    // the shop's card says 1500
    c.gate.hp = c.gate.maxHp * 0.5; f.gold = 5000;
    g.ui.tab = 'castle'; g.ui.toggleShop(true);
    g.ui.refreshShop();
    const card = [...document.querySelectorAll('#shop .card')].find((x) => /Repair Gate/.test(x.textContent));
    out.card = card ? card.textContent.replace(/\s+/g, ' ') : null;
    g.ui.toggleShop(false);
    // the upgrades keep their own prices
    out.reinforce = E.SHOP_BY_ID.reinforce_gate.cost(g, f);
    // a rival lord pays the same: with 1499 it cannot, with 1500 it does
    const f1 = g.factions[1], c1 = f1.castle;
    c1.gate.hp = c1.gate.maxHp * 0.2;
    const rnd = Math.random; Math.random = () => 0.99;     // (the lord's other spending is random: the Iron-Banded Gate upgrade would mend the gate too)
    f1.gold = 1499;
    f1.ai.spend();
    out.ai = { poorHp: Math.round(c1.gate.hp), max: Math.round(c1.gate.maxHp) };
    f1.gold = 1500;
    f1.ai.spend();
    Math.random = rnd;
    out.ai.richHp = Math.round(c1.gate.hp);
    return out;
  });
  check('the price is one constant: 1500', r.constant === 1500);
  check('an intact gate is not for sale', r.intact === 'Gate is intact');
  check('a damaged gate costs 1500; with 1499 gold nothing happens', r.hurt.can === true && r.hurt.cost === 1500 && r.poor.res === 'Not enough gold' && r.poor.gold === 1499 && r.poor.hp < r.rich.max, { hurt: r.hurt, poor: r.poor });
  check('with 1500 gold the gate is repaired in full and the 1500 is paid', r.rich.res === true && r.rich.gold === 0 && r.rich.hp === r.rich.max, r.rich);
  check('a broken gate also costs 1500 to rebuild (not 250 as before)', r.broken.alive === false && r.broken.can === true && r.broken.cost === 1500 && r.rebuilt.res === true && r.rebuilt.gold === 500 && r.rebuilt.alive, { broken: r.broken, rebuilt: r.rebuilt });
  check('the shop card shows 1500', /Repair Gate/.test(r.card || '') && /1500/.test(r.card || ''), r.card);
  check('the Iron-Banded Gate upgrade keeps its own price (250 for the first level)', r.reinforce === 250, r.reinforce);
  check('a rival lord pays the same: nothing at 1499, the repair at 1500', r.ai.poorHp < r.ai.max * 0.5 && r.ai.richHp === r.ai.max, r.ai);
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  console.log(failed || errors.length ? `RESULT: ${failed} failed, ${errors.length} errors` : 'RESULT: all passed');
  process.exit(failed || errors.length ? 1 : 0);
})();
