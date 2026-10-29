// debug: why does the match never start for RoomNet clients?
const { session } = require('./mplib');
(async () => {
  const S = await session('room');
  const { page: host, code } = await S.host('Arthur');
  const c1 = await S.join(code, 'Gwen', 'c1');
  const c2 = await S.join(code, 'Lance', 'c2');
  await host.waitForTimeout(800);
  const lobby = await host.evaluate(() => document.getElementById('lobbyList').innerText.replace(/\s+/g, ' '));
  console.log('lobby on host:', lobby);
  console.log('client2 lobby:', await c2.evaluate(() => document.getElementById('lobbyList').innerText.replace(/\s+/g, ' ')));
  console.log('client lobby:', await c1.evaluate(() => document.getElementById('lobbyList').innerText.replace(/\s+/g, ' ')));
  await host.evaluate(() => document.getElementById('startOnline').click());
  for (let i = 0; i < 20; i++) {
    await host.waitForTimeout(1000);
    const st = await Promise.all([host, c1, c2].map((p) => p.evaluate(() => { const g = window.__game; const n = g.net; return { state: g.state, net: n && n.constructor.name, role: n && n.role, id: n && n.id, hostPeer: n && n.hostPeer, seq: n && n.seq, outLen: n && n.out && n.out.length, seen: n && n.seen && [...n.seen.entries()].map(([k, v]) => k.slice(0, 4) + ':' + v).join(','), menuHidden: document.getElementById('menu').classList.contains('hidden'), lobbyHidden: document.getElementById('lobby').classList.contains('hidden') }; })));
    console.log(i, JSON.stringify(st));
    if (st[1].state === 'playing' && st[2].state === 'playing') break;
  }
  console.log('errors:', S.errors.join('\n') || 'none');
  await S.close();
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
