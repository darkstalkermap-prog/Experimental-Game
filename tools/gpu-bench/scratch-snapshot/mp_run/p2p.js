const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errors = [];
  const BASE = 'http://localhost:8090/';
  const Q = 'peerhost=localhost&peerport=9000&peerice=none';
  const mk = async (url, tag) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(tag + ': ' + m.text()); });
    await page.goto(url, { timeout: 120000 });
    return page;
  };
  const host = await mk(BASE + '?' + Q, 'host');
  await host.click('#mpBtn');
  await host.waitForSelector('#online:not(.hidden)');
  await host.fill('#pname', 'Arthur'); await host.click('#hostBtn');
  await host.waitForSelector('#lobby:not(.hidden)', { timeout: 60000 });
  const code = (await host.textContent('#roomCode')).trim();
  console.log('code', code, '| invite', await host.inputValue('#inviteLink'));
  const clients = [];
  for (const n of ['Gwen', 'Lance']) {
    const c = await mk(BASE + '?join=' + code + '&' + Q, n);
    await c.waitForSelector('#online:not(.hidden)');
    await c.fill('#pname', n); await c.press('#pname', 'Enter');
    await c.waitForSelector('#lobby:not(.hidden)', { timeout: 90000 });
    clients.push(c);
  }
  // wrong code
  const bad = await mk(BASE + '?join=ZZZZ&' + Q, 'bad');
  await bad.fill('#pname', 'Nobody'); await bad.press('#pname', 'Enter');
  await bad.waitForFunction(() => document.getElementById('netMsg').textContent.length > 0, null, { timeout: 90000 });
  console.log('bad code msg:', await bad.textContent('#netMsg'));
  await host.waitForTimeout(500);
  console.log('host lobby', (await host.textContent('#lobbyList')).replace(/\s+/g, ' '));
  await host.click('#lobbyModes button[data-mode=coop]');
  await host.waitForTimeout(400);
  await host.click('#startOnline');
  for (const c of clients) await c.waitForFunction(() => window.__game && window.__game.state === 'playing', null, { timeout: 90000 });
  const all = [host, ...clients];
  const step = async (secs) => { for (let i = 0; i < secs * 4; i++) for (const p of all) await p.evaluate(() => { const g = window.__game; g.paused = false; for (let k = 0; k < 15; k++) g.update(1 / 60); }); };
  for (let i = 0; i < 6; i++) { await step(1); await host.waitForTimeout(250); }
  console.log('coop', JSON.stringify(await Promise.all(all.map(p => p.evaluate(() => ({ coop: window.__game.coop, units: window.__game.units.length, humans: window.__game.humans.length, phase: window.__game.phase }))))));
  // big battle: many units through the data channel
  await host.evaluate(() => { const g = window.__game; g.round = 8; g.phaseT = 0.5; for (const f of g.factions) { f.troopCap = 40; for (let k = 0; k < 14; k++) g.recruit(f, 'archer'); } });
  for (let i = 0; i < 10; i++) { await step(1); await host.waitForTimeout(250); }
  console.log('big', JSON.stringify(await Promise.all(all.map(p => p.evaluate(() => ({ units: window.__game.units.length, round: window.__game.round }))))));
  // client buys; host sees
  const before = await host.evaluate(() => window.__game.troopCount(1));
  await clients[0].evaluate(() => { window.__game.localFaction.gold = 3000; });
  await host.evaluate(() => { window.__game.factions[1].gold = 3000; window.__game.factions[1].troopCap = 80; });
  await clients[0].evaluate(() => window.__game.buyForPlayer('recruit_swordsman'));
  for (let i = 0; i < 4; i++) { await step(0.5); await host.waitForTimeout(250); }
  console.log('buy over p2p', before, '->', await host.evaluate(() => window.__game.troopCount(1)));
  // leaving
  await clients[1].close();
  for (let i = 0; i < 6; i++) { await step(1); await host.waitForTimeout(300); }
  console.log('after leave, host humans', await host.evaluate(() => window.__game.humans.length));
  console.log(errors.slice(0, 10).join('\n'));
  await browser.close();
})();
