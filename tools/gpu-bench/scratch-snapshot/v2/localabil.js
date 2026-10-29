// The local input path (Player.useAbility) for every class: cooldown starts once, effect happens, dash moves the hero.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const out = await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = g.camera.position.constructor, I = g.input;
    const home = new V3(-48, 0, -64);
    const res = {};
    for (const cls of ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier']) {
      p.setClass(cls);
      p.pos.set(home.x, g.physics.groundHeight(home.x, home.z, 20), home.z); p.yaw = 0; p.pitch = 0; p.alive = true; p.hp = p.maxHp * 0.5;
      p.buffs.clear(); p.abilCd = { q: 0, r: 0 }; p.dash = null; g.projectiles.list.length = 0;
      const foe = g.recruit(g.factions[1], 'swordsman');
      foe.pos.set(home.x, g.physics.groundHeight(home.x, home.z + 3, 20), home.z + 3); foe.hp = foe.maxHp = 500; foe.attackTimer = 99;
      foe.update = function (dt) { if (this.staggerT > 0) this.staggerT -= dt; };
      g.update(0.001);
      const z0 = p.pos.z, hp0 = p.hp;
      p.useAbility('q', I);
      const afterQ = { cd: +p.abilCd.q.toFixed(1), dash: !!p.dash, arrows: g.projectiles.list.length, buffs: p.buffs.list().map((b) => b[0]) };
      for (let i = 0; i < 40; i++) { g.update(1 / 30); I.endFrame(); }
      const dz = +(p.pos.z - z0).toFixed(1);
      p.useAbility('r', I);
      const afterR = { cd: +p.abilCd.r.toFixed(1), dash: !!p.dash, buffs: p.buffs.list().map((b) => b[0]), hp: Math.round(p.hp - hp0) };
      for (let i = 0; i < 20; i++) { g.update(1 / 30); I.endFrame(); }
      res[cls] = { afterQ, movedZ: dz, foeHp: Math.round(foe.hp), afterR, moved2: +(p.pos.z - z0 - dz).toFixed(1) };
      foe.alive = false;
      g.units = g.units.filter((u) => u.alive || u.isHero);
    }
    return res;
  });
  for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
