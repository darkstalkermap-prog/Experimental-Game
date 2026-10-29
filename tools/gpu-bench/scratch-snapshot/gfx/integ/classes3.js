// Each class in first person (the kit), and the bot heroes of Hero Mode in third person. usage: CW_PORT=8220 OUT=<dir> node classes3.js <tag> <quality> [fp|tp]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
const TAG = process.argv[2] || 'c', QUALITY = process.argv[3] || 'high', PART = process.argv[4] || 'both';
const CLASSES = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];
(async () => {
  if (PART !== 'tp') {
    const { browser, page, errors } = await L.launch({ quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
    await page.click('#practiceBtn');
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
    await page.evaluate(() => {
      const g = window.__game; g.paused = false; g.player.buffs.add('ghost', 1e6);
      document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
    });
    for (const id of CLASSES) {
      await page.evaluate((id) => { const g = window.__game; g.court.setHeroClass(id); g.player.hp = g.player.maxHp; document.getElementById('pause').classList.add('hidden'); }, id);
      await page.waitForTimeout(2600);
      await page.screenshot({ path: OUT + `${TAG}_fp_${id}.png` });
    }
    console.log('fp errors', JSON.stringify(errors.slice(0, 3)));
    await browser.close();
  }
  if (PART !== 'fp') {
    const { browser, page, errors } = await L.launch({ quality: QUALITY, viewport: { width: 960, height: 540 }, raf: true });
    await page.click('#objective button[data-o=hero]');
    await page.click('#play');
    await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
    await page.evaluate(() => {
      const g = window.__game; g.paused = false;
      document.getElementById('hud').style.display = 'none'; document.getElementById('pause').classList.add('hidden');
      g.player.buffs.add('ghost', 1e6);
      for (let i = 0; i < 20 * 45; i++) { g.update(0.05); g.input.endFrame(); }
    });
    const n = await page.evaluate(() => window.__game.humans.length);
    for (let k = 1; k < n; k++) {
      const info = await page.evaluate((k) => {
        const g = window.__game, h = g.humans[k], me = g.player;
        if (!h || !h.body) return null;
        h.hp = h.maxHp = 1e6;
        const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
        me.pos.set(h.pos.x + fx * 3.2 + fz * 0.8, 0, h.pos.z + fz * 3.2 - fx * 0.8); me.pos.y = g.physics.groundHeight(me.pos.x, me.pos.z, 30); me.vel.set(0, 0, 0);
        me.yaw = Math.atan2(h.pos.x - me.pos.x, h.pos.z - me.pos.z); me.pitch = 0.0;
        return { cls: h.classId, name: h.name, team: h.team };
      }, k);
      if (!info) continue;
      await page.waitForTimeout(1200);
      await page.evaluate((k) => { const g = window.__game, h = g.humans[k], me = g.player; me.yaw = Math.atan2(h.pos.x - me.pos.x, h.pos.z - me.pos.z); }, k);
      await page.waitForTimeout(900);
      await page.screenshot({ path: OUT + `${TAG}_tp_${k}_${info.cls}.png` });
      console.log('tp', k, JSON.stringify(info));
    }
    console.log('tp errors', JSON.stringify(errors.slice(0, 3)));
    await browser.close();
  }
})();
