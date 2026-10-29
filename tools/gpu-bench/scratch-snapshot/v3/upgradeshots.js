// Screenshots of every upgrade level, to check each one looks different from the last.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const which = process.argv[2] || 'castle';
  const { browser, page, errors } = await L.launch({ map: 'small', viewport: { width: 1100, height: 640 }, raf: true });
  await L.startSingle(page);
  await page.waitForTimeout(4500);
  const look = async (name, lx, lz, y, fx, fz, pitch = 0.05, ground = false) => {
    await page.evaluate(([lx, lz, y, fx, fz, pitch, ground]) => {
      const g = window.__game, p = g.player, c = g.castles[0];
      const w = c.toWorld(lx, lz), t = c.toWorld(fx, fz);
      p.pos.set(w.x, ground ? g.physics.terrainHeight(w.x, w.z) : c.center.y + y, w.z);
      p.vel.set(0, 0, 0); p.vy = 0;
      p.yaw = Math.atan2(t.x - w.x, t.z - w.z);
      p.pitch = pitch;
    }, [lx, lz, y, fx, fz, pitch, ground]);
    await page.waitForTimeout(450);
    await page.screenshot({ path: S + `v3/up_${name}.png`, timeout: 60000 });
  };
  const setLevels = (w, gt, t, b, l, tr) => page.evaluate(([w, gt, t, b, l, tr]) => {
    const g = window.__game, f = g.factions[0], c = g.castles[0];
    c.wallLevel = w; c.gateLevel = gt; c.towerLevel = t;
    f.troopCap = 12 + 6 * b; f.levies = l; f.training = tr;
    g.player.lastHurt = -99;
  }, [w, gt, t, b, l, tr]);
  if (which === 'gate') {
    for (let lv = 0; lv <= 3; lv++) {
      await setLevels(0, lv, 0, 0, 0, 0);
      await page.waitForTimeout(4200);
      await look(`gate2_L${lv}`, 1, 27, 0, 0, 19, 0.12, true);
    }
  } else if (which === 'towers') {
    for (let lv = 0; lv <= 3; lv++) {
      await setLevels(0, 0, lv, 0, 0, 0);
      await page.waitForTimeout(4200);
      await look(`tower_ext_L${lv}`, 48, 40, 0, 22.5, 22.5, 0.3, true);
      await look(`tower_roof_L${lv}`, 21.5, 22.9, 13, 23, 27, -0.12);
    }
  } else if (which === 'roof') {
    await setLevels(0, 0, 3, 0, 0, 0);
    await page.waitForTimeout(4200);
    await look('roof_ballista', 22.8, 22.2, 13, 20.4, 25.0, -0.32);
    await look('roof_braziers', 21.5, 25.2, 13, 21.5, 21.0, -0.25);
    await look('roof_overview', 23.2, 25.4, 13, 19.5, 21.8, -0.45);
  } else if (which === 'castle') {
    for (let lv = 0; lv <= 3; lv++) {
      await setLevels(lv, lv, lv, 0, 0, 0);
      await page.waitForTimeout(400);
      await look(`front_L${lv}`, -16, 46, 0, 4, 19, 0.12, true);
      await look(`gate_L${lv}`, 2, 32, 0, 0, 19, 0.1, true);
    }
  } else if (which === 'inside') {
    for (let lv = 0; lv <= 4; lv++) {
      await setLevels(0, 0, 0, lv, Math.min(3, lv), 0);
      await page.waitForTimeout(400);
      await look(`racks_L${lv}`, 4, 12, 0, -18, -4, 0.05);
      await look(`stand_L${lv}`, 0, 9, 0, 0, -3, 0.12);
    }
    await look('racks_back', 6, -8, 0, -6, -18, 0.08);
    await look('racks_right', -6, 10, 0, 18, -2, 0.05);
    await look('racks_front', 0, -8, 0, 8, 18, 0.05);
  } else if (which === 'soldiers') {
    await page.evaluate(() => {
      const g = window.__game, c = g.castles[0], f = g.factions[0];
      g.updateLod = () => {};
      const types = ['swordsman', 'archer', 'horseman'];
      window.__row = [];
      for (let tier = 0; tier <= 5; tier++) {
        types.forEach((type, j) => {
          const u = g.recruit(f, type);
          u.think = () => {}; u.update = function () { this.animate(0.016, false); };
          const w = c.toWorld(-6.5 + tier * 2.6, 31 + j * 4.5);
          u.pos.set(w.x, g.physics.terrainHeight(w.x, w.z), w.z);
          u.mesh.position.copy(u.pos);
          u.yaw = c.rot + Math.PI; u.mesh.rotation.y = u.yaw;
          u.setTier(tier);
          window.__row.push(u);
        });
      }
    });
    await page.waitForTimeout(500);
    await look('soldiers_front', 0, 22, 3.2, 0, 36, -0.16, false);
    await look('soldiers_close', -3, 27, 0, -3, 31, 0.0, true);
    await page.evaluate(() => { for (const u of window.__row) { u.yaw = window.__game.castles[0].rot; u.mesh.rotation.y = u.yaw; } });
    await look('soldiers_back', 0, 49, 3.5, 0, 36, -0.12, true);
  }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
