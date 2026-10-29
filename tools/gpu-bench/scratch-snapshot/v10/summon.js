// Calling a fallen ally back to life (co-op Conquest): when the rules allow it, what it costs, the shop's ally bar, the U key, the
// notices, and who can and cannot be called. One page, a co-op game of two (you and Mara) played in single mode so the world can be
// stepped by hand; the real host + guest run is in mpsummon.js.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };

const INSTALL = () => {
  window.__tick = (secs, dt = 0.05) => {
    const g = window.__game, n = Math.round(secs / dt);
    for (let i = 0; i < n && g.state === 'playing'; i++) { g.paused = false; g.update(dt); g.ui.update(dt); g.input.endFrame(); }
  };
  window.__vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
  window.__txt = (sel) => (document.querySelector(sel) || { textContent: null }).textContent;
  window.__toasts = () => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent);
  window.__enemy = () => window.__game.units.find((u) => u.team === 2 && u.alive);
  // a house falls: its keep is destroyed and its hero is killed (the hero cannot rise again, so the house is finished)
  window.__fall = (team) => {
    const g = window.__game, f = g.factions[team], foe = window.__enemy();
    g.castles[team].keep.takeDamage(1e9, foe);
    f.player.buffs.clear();
    g.damage(f.player, 1e6, foe, { melee: true });
  };
  window.__start = (setup) => {
    const g = window.__game;
    document.getElementById('menu').classList.add('hidden');
    g.ui.showHud(); g.audio.init();
    if (setup.mode === 'host') g.net = { on() {}, lock() {}, toClient() {}, toAll() {}, toHost() {}, snapEvery: 1e9, role: 'host' };   // (nobody is on the other end)
    g.start('normal', setup);
    g.paused = false;
  };
};

const COOP = { mode: 'host', localTeam: 0, players: [{ team: 0, name: 'You', cls: 'knight' }, { team: 1, name: 'Mara', cls: 'mage' }], coop: true, objective: 'conquest' };

(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(INSTALL);
  await ev((s) => window.__start(s), COOP);

  // ---------------------------------------------------------------- nobody has fallen yet
  let r = await ev(() => {
    const g = window.__game, f0 = g.factions[0], f1 = g.factions[1];
    return { coop: g.coop, live: g.summonLive, ally: g.humans.length, down: g.fallenAllies(0).length, block: g.summonBlock(f0, f1), gold: f0.gold };
  });
  check('a co-op Conquest game of two: the summon rule is live, nobody is down', r.coop && r.live && r.ally === 2 && r.down === 0, JSON.stringify(r));
  check('a standing ally cannot be called ("still fighting")', /still fighting/.test(r.block), r.block);
  await ev(() => { window.__game.input.pressed.add('KeyU'); window.__tick(0.1); });
  r = await ev(() => ({ toasts: window.__toasts() }));
  check('U with nobody down says so', r.toasts.some((t) => /No ally has fallen/.test(t)), JSON.stringify(r.toasts));

  // ---------------------------------------------------------------- Mara's house falls and she dies
  await ev(() => { window.__fall(1); window.__tick(0.3); });
  r = await ev(() => {
    const g = window.__game, f1 = g.factions[1];
    return { fallen: g.castles[1].fallen, dead: !f1.player.alive, elim: f1.eliminated, down: g.fallenAllies(0).map((a) => a.team), back: g.callableBack(f1), state: g.state,
      block: g.summonBlock(g.factions[0], f1), toasts: window.__toasts() };
  });
  check('Mara\'s keep has fallen and she is dead: her house is eliminated and listed as a fallen ally', r.fallen && r.dead && r.elim && r.down.join() === '1' && r.state === 'playing', JSON.stringify(r));
  check('the game tells the allies how to call her back (U, 500 gold)', r.toasts.some((t) => /has been destroyed! Press U to call Mara back to life \(500 gold\)/.test(t)), JSON.stringify(r.toasts));
  check('you can call her: nothing blocks it', r.block === null && r.back === true, String(r.block));
  await ev(() => window.__tick(3.2));   // (the alerts look about once a second)
  r = await ev(() => ({ alert: window.__game.alerts.recent.filter((a) => a.key === 'ally:1').map((a) => a.text) }));
  check('an alert reminds you (gold is enough: "Press U")', r.alert.length >= 1 && /Press U to call them back \(500 gold\)/.test(r.alert[0]), JSON.stringify(r.alert));

  // ---------------------------------------------------------------- the shop's ally bar
  r = await ev(() => {
    const g = window.__game;
    g.factions[0].gold = 120;
    g.ui.toggleShop();
    g.ui.refreshShop();
    const rows = document.querySelectorAll('#allyBar .al');
    return { open: window.__vis('#shop'), bar: window.__vis('#allyBar'), rows: rows.length, text: window.__txt('#allyBar .al > span'), btn: window.__txt('#allyBar .al button'),
      poor: document.querySelector('#allyBar .al button').classList.contains('poor'), tab: g.ui.tab };
  });
  check('the shop shows one ally bar naming Mara', r.open && r.bar && r.rows === 1 && /Mara/.test(r.text) && /fallen with their keep/.test(r.text), JSON.stringify([r.rows, r.text]));
  check('the button says 500 gold and looks "poor" with 120 gold', /500/.test(r.btn) && r.poor, r.btn);
  r = await ev(() => {
    const g = window.__game;
    document.querySelector('#allyBar .al button').click();
    return { gold: g.factions[0].gold, elim: g.factions[1].eliminated, alive: g.factions[1].player.alive, toasts: window.__toasts() };
  });
  check('clicking without the gold buys nothing and says how much is missing', r.gold === 120 && r.elim && !r.alive && r.toasts.some((t) => /Need 380 more gold/.test(t)), JSON.stringify(r));
  // the bar is there on every tab
  r = await ev(() => { const g = window.__game; g.ui.tab = 'castle'; g.ui.renderShop(); return { bar: window.__vis('#allyBar'), tab: g.ui.tab }; });
  check('the bar stays up on the other tabs (Castle)', r.bar && r.tab === 'castle');

  // paying
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0], f1 = g.factions[1], mara = f1.player;
    f0.gold = 700; const spent0 = f0.spent;
    g.ui.refreshShop();
    document.querySelector('#allyBar .al button').click();
    const k = g.castles[1].spawnPoint, k0 = g.castles[0].spawnPoint;
    window.__r = { gold: f0.gold, spent: f0.spent - spent0, elim: f1.eliminated, alive: mara.alive, hp: mara.hp / mara.maxHp, near: Math.hypot(mara.pos.x - k.x, mara.pos.z - k.z), far: Math.hypot(mara.pos.x - k0.x, mara.pos.z - k0.z),
      ghost: mara.buffs.has('ghost'), respawnT: f1.respawnT, fallen: g.castles[1].fallen, seq: mara.spawnSeq };
    g.ui.refreshShop();
    window.__r.bar = window.__vis('#allyBar');
    window.__r.toasts = window.__toasts();
    return window.__r;
  });
  check('with the gold it works: 500 paid, Mara alive again with full health, house no longer eliminated', r.gold === 200 && r.spent === 500 && !r.elim && r.alive && r.hp === 1, JSON.stringify(r));
  check('she rises in the courtyard of her OWN keep (a ruin), not at the keep that paid, protected for a moment', r.near < 1.5 && r.far > 40 && r.ghost, JSON.stringify([r.near, r.far, r.ghost]));
  check('her keep is still a ruin and the bar is gone', r.fallen && !r.bar);
  check('the game announces it', r.toasts.some((t) => /Mara rises again from the ruins of their keep/.test(t)), JSON.stringify(r.toasts));
  await ev(() => { window.__game.ui.toggleShop(); });

  // she is simply a hero again: she moves, can be hit, and her protection ends
  r = await ev(() => {
    const g = window.__game, mara = g.factions[1].player;
    window.__tick(3);
    return { ghost: mara.buffs.has('ghost'), alive: mara.alive, elim: g.factions[1].eliminated, down: g.fallenAllies(0).length };
  });
  check('after the protection she is a normal hero in a living house', !r.ghost && r.alive && !r.elim && r.down === 0, JSON.stringify(r));

  // ---------------------------------------------------------------- she falls again: out again, the U key calls her back
  await ev(() => { const g = window.__game, mara = g.factions[1].player; mara.buffs.clear(); g.damage(mara, 1e6, window.__enemy(), { melee: true }); window.__tick(0.3); });
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0];
    f0.gold = 499;
    g.input.pressed.add('KeyU'); window.__tick(0.1);
    const poor = { gold: f0.gold, alive: g.factions[1].player.alive, toasts: window.__toasts() };
    f0.gold = 500;
    g.input.pressed.add('KeyU'); window.__tick(0.1);
    return { poor, gold: f0.gold, alive: g.factions[1].player.alive, elim: g.factions[1].eliminated, down: g.fallenAllies(0).length };
  });
  check('she is out again when she falls without a keep (the ruin cannot raise her)', r.poor.alive === false, JSON.stringify(r.poor));
  check('U with 499 gold does nothing but complain', r.poor.gold === 499 && r.poor.toasts.some((t) => /Need 1 more gold/.test(t)), JSON.stringify(r.poor));
  check('U with 500 gold calls her back again', r.gold === 0 && r.alive && !r.elim && r.down === 0, JSON.stringify([r.gold, r.alive, r.elim]));

  // ---------------------------------------------------------------- who cannot be called
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0], f1 = g.factions[1], f2 = g.factions[2];
    const out = {};
    const back = () => { const mara = f1.player; mara.buffs.clear(); g.damage(mara, 1e6, window.__enemy(), { melee: true }); window.__tick(0.3); };
    back(); f0.gold = 900;
    out.enemy = g.summonBlock(f0, f2);
    f1.isPlayer = false; out.left = g.summonBlock(f0, f1); out.leftList = g.fallenAllies(0).length; f1.isPlayer = true;
    f0.castle.fallen = true; out.keep = g.summonBlock(f0, f1); f0.castle.fallen = false;   // (the buyer's keep makes no difference: she rises in her own courtyard)
    f0.eliminated = true; out.out = g.summonBlock(f0, f1); f0.eliminated = false;
    g.objective = 'koth'; out.koth = g.summonBlock(f0, f1); out.kothList = g.fallenAllies(0).length; g.objective = 'conquest';
    g.coop = false; out.solo = g.summonBlock(f0, f1); g.coop = true;
    out.gold = f0.gold; out.elim = f1.eliminated;
    return out;
  });
  check('an enemy house is not an ally', /Not your ally/.test(r.enemy), r.enemy);
  check('a house whose player has left cannot be called back', /left the game/.test(r.left) && r.leftList === 0, JSON.stringify([r.left, r.leftList]));
  check('a buyer whose own keep has fallen can still call her back (she rises in her own courtyard)', r.keep === null, String(r.keep));
  check('a buyer who is out of the battle themselves cannot', /out of the battle/.test(r.out), r.out);
  check('King of the Hill: not offered', /Not in this game/.test(r.koth) && r.kothList === 0, JSON.stringify([r.koth, r.kothList]));
  check('not co-op: not offered', /Not in this game/.test(r.solo), r.solo);
  check('none of those cost anything or revived her', r.gold === 900 && r.elim, JSON.stringify([r.gold, r.elim]));

  // an AI lord cannot buy it either (the shop item is for players)
  r = await ev(async () => {
    const m = await import('./src/economy.js');
    const g = window.__game;
    return { ai: m.buy(g, g.factions[2], 'summon_1'), ids: ['summon_0', 'summon_1', 'summon_2', 'summon_3'].every((id) => !!m.SHOP_BY_ID[id]), tab: m.SHOP_BY_ID.summon_1.tab, cost: m.SHOP_BY_ID.summon_1.cost() };
  });
  check('the AI lords cannot buy a summon; the four items exist with no tab and cost 500', r.ai === 'Not available' && r.ids && r.tab === 'allies' && r.cost === 500, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' || '));

  // ================================================================ the other way round: you are the one who has fallen
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  errors.length = 0;
  await ev(INSTALL);
  await ev((s) => window.__start(s), COOP);
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0];
    g.castles[0].keep.takeDamage(1e9, window.__enemy());
    g.player.buffs.clear();
    g.damage(g.player, 1e6, window.__enemy(), { melee: true });
    window.__tick(0.4);
    return { elim: f0.eliminated, over: g.state, overlay: window.__vis('#respawn'), text: window.__txt('#respawnT'), toasts: window.__toasts() };
  });
  check('you fall with your keep while Mara still holds hers: the game goes on', r.elim && r.over === 'playing', JSON.stringify([r.elim, r.over]));
  check('the overlay says an ally can call you back for 500 gold', r.overlay && /no respawn \(an ally can call you back for 500 gold\)/.test(r.text), r.text);
  check('your house is told so', r.toasts.some((t) => /an ally can call you back for 500 gold/.test(t)), JSON.stringify(r.toasts));
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0], f1 = g.factions[1];
    f1.gold = 800;
    const res = g.buyFor(1, 'summon_0');   // what the host does when Mara's guest presses the button
    window.__tick(0.2);
    const k = g.castles[0].spawnPoint;
    return { res, gold: f1.gold, alive: g.player.alive, elim: f0.eliminated, near: Math.hypot(g.player.pos.x - k.x, g.player.pos.z - k.z), overlay: window.__vis('#respawn') };
  });
  check('Mara pays and you rise in the courtyard of your own keep', r.res === true && r.gold === 300 && r.alive && !r.elim && r.near < 1.5 && !r.overlay, JSON.stringify(r));
  check('no page errors in the second run', errors.length === 0, errors.slice(0, 3).join(' || '));

  // ================================================================ three players: two allies down at once, a button for each
  await page.reload({ timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  errors.length = 0;
  await ev(INSTALL);
  await ev((s) => window.__start(s), { ...COOP, players: [...COOP.players, { team: 2, name: 'Edric', cls: 'cleric' }] });
  r = await ev(() => {
    const g = window.__game;
    // team 3 is the one AI lord left: its soldiers are the foe
    const foe = () => g.units.find((u) => u.team === 3 && u.alive);
    for (const t of [1, 2]) { g.castles[t].keep.takeDamage(1e9, foe()); g.factions[t].player.buffs.clear(); g.damage(g.factions[t].player, 1e6, foe(), { melee: true }); }
    window.__tick(0.3);
    g.factions[0].gold = 1200;
    g.ui.toggleShop(); g.ui.refreshShop();
    const rows = [...document.querySelectorAll('#allyBar .al')].map((e) => e.textContent.replace(/\s+/g, ' '));
    return { sides: JSON.stringify(g.sides), down: g.fallenAllies(0).map((a) => a.team), rows, state: g.state };
  });
  check('three players are one side; both allies are down and the shop has a bar for each', r.sides === '[[0,1,2]]' && r.down.join() === '1,2' && r.rows.length === 2 && /Mara/.test(r.rows[0]) && /Edric/.test(r.rows[1]) && r.state === 'playing', JSON.stringify(r));
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0];
    document.querySelectorAll('#allyBar .al button')[1].click();   // Edric's button: only Edric comes back
    g.ui.refreshShop();
    return { gold: f0.gold, mara: g.factions[1].player.alive, edric: g.factions[2].player.alive, rows: document.querySelectorAll('#allyBar .al').length, text: window.__txt('#allyBar .al > span') };
  });
  check('the second button calls back only Edric (500), and the bar now lists only Mara', r.gold === 700 && !r.mara && r.edric && r.rows === 1 && /Mara/.test(r.text), JSON.stringify(r));
  r = await ev(() => {
    const g = window.__game, f0 = g.factions[0];
    g.ui.toggleShop();
    g.input.pressed.add('KeyU'); window.__tick(0.1);   // U: the first one still down
    return { gold: f0.gold, mara: g.factions[1].player.alive, edric: g.factions[2].player.alive, down: g.fallenAllies(0).length };
  });
  check('U then calls back Mara', r.gold === 200 && r.mara && r.edric && r.down === 0, JSON.stringify(r));
  check('no page errors with three players', errors.length === 0, errors.slice(0, 3).join(' || '));

  await browser.close();
  console.log(failed ? `FAILED ${failed}` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('RUN ERROR', e); process.exit(2); });
