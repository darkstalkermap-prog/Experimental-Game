// does closing the shop re-lock the mouse in headless Chromium, with and without the map in between? (with timings and the reason)
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  await page.evaluate(() => {
    const cv = document.querySelector('#app canvas');
    window.__log = [];
    const t0 = performance.now();
    const orig = cv.requestPointerLock.bind(cv);
    cv.requestPointerLock = (o) => {
      __log.push(`${Math.round(performance.now() - t0)} request ${JSON.stringify(o || null)} act=${navigator.userActivation.isActive}`);
      const r = orig(o);
      if (r && r.then) r.then(() => __log.push(`${Math.round(performance.now() - t0)} ok`), (e) => __log.push(`${Math.round(performance.now() - t0)} reject ${e.name}: ${e.message}`));
      return r;
    };
    const ex = document.exitPointerLock.bind(document);
    document.exitPointerLock = () => { __log.push(`${Math.round(performance.now() - t0)} exit`); return ex(); };
    document.addEventListener('pointerlockchange', () => __log.push(`${Math.round(performance.now() - t0)} change el=${!!document.pointerLockElement}`));
    document.addEventListener('pointerlockerror', () => __log.push(`${Math.round(performance.now() - t0)} lockerror`));
  });
  const st = (tag) => page.evaluate((tag) => { const g = window.__game; return tag + ' ' + JSON.stringify({ locked: g.input.locked, paused: g.paused, hint: document.getElementById('pauseHint').textContent.slice(0, 20), shop: g.ui.shopOpen, map: g.ui.mapOpen }); }, tag);
  const flush = async () => { console.log((await page.evaluate(() => { const l = __log.slice(); __log.length = 0; return l; })).join('\n   ')); };
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__game.ui.toggleShop(true); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__game.ui.toggleShop(false); });
  await page.waitForTimeout(600);
  console.log(await st('shop cycle'), '\n  ', (await page.evaluate(() => __log.splice(0).join('\n   '))));
  await page.evaluate(() => { const g = window.__game; g.paused = false; g.input.pressed.add('KeyM'); g.update(1 / 60); g.input.endFrame(); });
  await page.waitForTimeout(400);
  console.log(await st('map open'), '\n  ', (await page.evaluate(() => __log.splice(0).join('\n   '))));
  await page.evaluate(() => { window.__game.ui.toggleShop(true); });
  await page.waitForTimeout(400);
  console.log(await st('shop over map'), '\n  ', (await page.evaluate(() => __log.splice(0).join('\n   '))));
  await page.evaluate(() => { window.__game.ui.toggleShop(false); });
  await page.waitForTimeout(600);
  console.log(await st('shop closed'), '\n  ', (await page.evaluate(() => __log.splice(0).join('\n   '))));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
