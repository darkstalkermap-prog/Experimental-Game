const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const shared = await browser.newContext({ viewport: { width: 800, height: 450 } });
  await shared.addInitScript({ path: __dirname + '/roomshim.js' });
  await shared.route('**/api/ping', (r) => r.fulfill({ status: 404, body: 'no' }));
  const errors = [];
  const mk = async (tag) => {
    const page = await shared.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + '\n' + e.stack));
    page.on('console', m => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
    await page.goto('http://localhost:8080/', { timeout: 120000 });
    await page.waitForSelector('#online:not(.hidden)');
    return page;
  };
  const host = await mk('host'); const c1 = await mk('c1'); const c2 = await mk('c2');
  await host.fill('#pname', 'Arthur'); await host.click('#hostBtn');
  await host.waitForSelector('#lobby:not(.hidden)');
  const code = (await host.textContent('#roomCode')).trim();
  for (const [c, n] of [[c1, 'Gwen'], [c2, 'Lance']]) {
    await c.fill('#pname', n); await c.fill('#joinCode', code); await c.click('#joinBtn');
    await c.waitForSelector('#lobby:not(.hidden)');
  }
  await host.waitForTimeout(400);
  await host.click('#lobbyModes button[data-mode=coop]');
  await host.waitForTimeout(400);
  console.log('client lobby:', await c1.textContent('#lobbyMode'), '| disabled', await c1.evaluate(() => document.querySelector('#lobbyModes button').disabled));
  console.log((await c1.textContent('#lobbyList')).replace(/\s+/g, ' '));
  await host.click('#startOnline');
  const all = [host, c1, c2];
  for (const c of [c1, c2]) await c.waitForFunction(() => window.__game.state === 'playing');
  const step = async (secs) => { for (let i = 0; i < secs * 4; i++) for (const p of all) await p.evaluate(() => { const g = window.__game; g.paused = false; for (let k = 0; k < 15; k++) g.update(1 / 60); }); };
  await step(2);
  // let real time pass so snapshots flow through the room
  for (let i = 0; i < 6; i++) { await step(1); await host.waitForTimeout(300); }
  console.log('client view', JSON.stringify(await Promise.all([c1, c2].map(p => p.evaluate(() => { const g = window.__game; return { units: g.units.length, round: g.round, phase: g.phase, pt: Math.round(g.phaseT), heroes: g.humans.length, snapEvery: g.net.snapEvery }; })))));
  console.log('host units', await host.evaluate(() => window.__game.units.length), 'room stats', JSON.stringify(await host.evaluate(() => { const s = window.__roomStats; const t = performance.now(); return { maxBytes: s.maxBytes, rejects: s.rejects, perSec: s.sends.filter(x => x > t - 1000).length }; })));
  await host.evaluate(() => { const g = window.__game; g.round = 8; g.phaseT = 0.5; for (const f of g.factions) f.gold = 5000; for (const f of g.factions) { f.troopCap = 40; for (let k = 0; k < 14; k++) g.recruit(f, 'archer'); } });
  for (let i = 0; i < 16; i++) { await step(1); await host.waitForTimeout(250); }
  console.log('BIG host units', await host.evaluate(() => window.__game.units.length), 'client', JSON.stringify(await c1.evaluate(() => ({ u: window.__game.units.length, se: window.__game.net.snapEvery, lastSid: window.__game.net.lastSid }))),
    'host', JSON.stringify(await host.evaluate(() => { const s = window.__roomStats; const t = performance.now(); return { sid: window.__game.net.sid, maxBytes: s.maxBytes, rejects: s.rejects, perSec: s.sends.filter(x => x > t - 1000).length, se: window.__game.net.snapEvery }; })));
  await browser.close(); console.log(errors.slice(0,10).join('\n')); return;
  await c1.evaluate(() => window.__game.buyForPlayer('recruit_swordsman'));
  for (let i = 0; i < 4; i++) { await step(0.5); await host.waitForTimeout(300); }
  console.log('buy reached host', await host.evaluate(() => window.__game.troopCount(1)));
  console.log('coop flags', JSON.stringify(await Promise.all(all.map(p => p.evaluate(() => ({ coop: window.__game.coop, fac: document.querySelector('#factions').textContent.replace(/\s+/g, ' ') }))))));
  // host hero hits ally hero: no damage
  console.log('friendly hit', await host.evaluate(() => { const g = window.__game; const a = g.humans.find(h => h.team === 1); const hp = a.hp; g.damage(a, 50, g.player, {}); return [hp, a.hp]; }));
  console.log('enemy hit', await host.evaluate(() => { const g = window.__game; const e = g.factions[3].hero; if (!e) return 'no hero'; const hp = e.hp; g.damage(e, 20, g.player, {}); return [hp, e.hp]; }));
  if (process.argv[2] === 'lose') {
    await host.evaluate(() => { const g = window.__game; for (const t of [0, 1, 2]) { const f = g.factions[t]; f.castle.fallen = true; f.eliminated = true; } });
  }
  // eliminate AI house 3 -> alliance victory
  await host.evaluate(() => { const g = window.__game; const f = g.factions[3]; f.castle.fallen = true; if (f.hero) f.hero.alive = false; f.eliminated = true; });
  await step(1);
  console.log('end', JSON.stringify(await Promise.all(all.map(p => p.evaluate(() => [window.__game.state, document.querySelector('#goTitle').textContent, document.querySelector('#goText').textContent])))));
  console.log(errors.slice(0, 20).join('\n'));
  await browser.close();
})();
