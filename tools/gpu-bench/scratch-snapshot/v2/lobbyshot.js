// The lobby with classes, at a normal window size.
const { session } = require('./mplib');
(async () => {
  const S = await session('relay');
  const OUT = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/v2/';
  const { page: hostPage, code } = await S.host('Arthur');
  const guest = await S.join(code, 'Gwen', 'guest');
  await guest.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=ranger]').click());
  await hostPage.evaluate(() => document.querySelector('#lobbyClassPick button[data-cls=cleric]').click());
  await hostPage.waitForTimeout(800);
  for (const p of [hostPage, guest]) await p.setViewportSize({ width: 1280, height: 720 });
  await hostPage.waitForTimeout(400);
  await hostPage.screenshot({ path: OUT + 'lobby_host.png' });
  await guest.screenshot({ path: OUT + 'lobby_guest.png' });
  console.log(JSON.stringify(await hostPage.evaluate(() => { const s = document.querySelector('#lobby .scroll'); return { scrollH: s.scrollHeight, clientH: s.clientHeight }; })));
  console.log('errors:', S.errors.join('\n') || 'none');
  await S.close();
})();
