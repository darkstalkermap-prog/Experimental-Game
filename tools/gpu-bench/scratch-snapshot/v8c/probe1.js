const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1280, height: 720 } });
  const info = (label) => page.evaluate((label) => {
    const sc = document.querySelector('#menu .scroll'), k = document.querySelector('#objective button[data-o=koth]').getBoundingClientRect();
    const at = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
    return `${label}: scrollTop ${sc.scrollTop} scrollH ${sc.scrollHeight} clientH ${sc.clientHeight} koth y ${Math.round(k.top)}-${Math.round(k.bottom)} at-point ${at && (at.id || at.tagName + '.' + at.className)} menuHidden ${document.getElementById('menu').classList.contains('hidden')} locked ${!!document.pointerLockElement}`;
  }, label);
  console.log(await info('start'));
  await page.evaluate(() => { window.__game.start = () => { document.getElementById('menu').classList.remove('hidden'); document.getElementById('hud').classList.add('hidden'); }; });
  await page.click('#objective button[data-o=hero]');
  console.log(await info('hero'));
  await page.click('#play');
  console.log(await info('after play'));
  await page.waitForTimeout(500);
  console.log(await info('after 500ms'));
  await browser.close();
})();
