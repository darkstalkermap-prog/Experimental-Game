// Screenshots of the first-person sword / shield / bow at every level, to check each upgrade reads differently.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1000, height: 600 }, raf: true });
  await L.startSingle(page);
  await page.waitForTimeout(3000);
  const set = (sw, sh, bw, weapon) => page.evaluate(([sw, sh, bw, weapon]) => {
    const g = window.__game, p = g.player;
    // face the open sky-ish ground so the weapon stands out, and hide the HUD
    document.querySelectorAll('#hud, #hint, #banner, #toast, #minimap').forEach((e) => { e.style.display = 'none'; });
    p.lv.sword = sw; p.lv.shield = sh; p.lv.bow = bw;
    p.rebuildWeapons();
    p.setWeapon(weapon);
    p.pitch = 0.05;
    p.lastHurt = -99;
  }, [sw, sh, bw, weapon]);
  for (let lv = 0; lv < 3; lv++) {
    await set(lv, Math.min(1, lv), 0, 'sword');
    await page.waitForTimeout(500);
    await page.screenshot({ path: S + `v3/wp_sword_L${lv}.png`, timeout: 60000 });
  }
  for (let lv = 0; lv < 2; lv++) {
    await set(0, 0, lv, 'bow');
    await page.waitForTimeout(500);
    await page.screenshot({ path: S + `v3/wp_bow_L${lv}.png`, timeout: 60000 });
  }
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
