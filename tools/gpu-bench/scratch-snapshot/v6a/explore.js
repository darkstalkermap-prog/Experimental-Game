const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    return { pings: !!g.pings, items: g.pings.items.length, paused: g.paused, pauseShown: !document.getElementById('pause').classList.contains('hidden'), locked: g.input.locked,
      layer: !!document.getElementById('pingLayer'), palette: document.querySelectorAll('#pingPalette button').length, wheel: document.querySelectorAll('#pingWheel .pw').length,
      mouse: Object.keys(g.input.mouse).join() };
  });
  console.log(JSON.stringify(r));
  await L.step(page, 1);
  const a = await page.evaluate(() => { const g = window.__game; const p = g.player; return { pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(1)), yaw: p.yaw, aim: g.pings.aim() }; });
  console.log(JSON.stringify(a));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
