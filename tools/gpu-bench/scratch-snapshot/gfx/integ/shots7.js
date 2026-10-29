// Integration QA: shadows and models close up. usage: CW_PORT=8220 OUT=<dir> node shots7.js <tag> <map> <quality> [w h] [minutes] [names]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const TAG = process.argv[2] || 'x', MAP = process.argv[3] || 'medium', QUALITY = process.argv[4] || 'high';
const W = Number(process.argv[5] || 960), H = Number(process.argv[6] || 540), MIN = Number(process.argv[7] || 3);
const ONLY = process.argv[8] ? process.argv[8].split(',') : null;
const OUT = (process.env.OUT || S + 'gfx/integ/out/').replace(/\/?$/, '/');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: W, height: H }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await page.evaluate((minutes) => {
    const g = window.__game;
    g.player.buffs.add('ghost', 1e6);
    g.paused = false;
    // upgrade the player's towers so the archers show
    g.factions[0].gold = 99999;
    for (let i = 0; i < 3; i++) { g.buyForPlayer('towers'); g.buyForPlayer('fortify_walls'); g.buyForPlayer('reinforce_gate'); }
    for (let i = 0; i < 20 * 60 * minutes; i++) { g.update(0.05); g.input.endFrame(); }
    document.getElementById('hud').style.display = 'none';
  }, MIN);
  if (process.env.INITFILE) await page.evaluate(require('fs').readFileSync(process.env.INITFILE, 'utf8'));   // (a switch to try, as a JS expression in a file)
  const place = async (name, f, wait = 2500) => {
    if (ONLY && !ONLY.includes(name)) return;
    const ok = await page.evaluate(f);
    if (!ok) { console.log('skip', name); return; }
    await page.waitForTimeout(wait);
    await page.screenshot({ path: OUT + `${TAG}_${name}.png` });
  };
  const aim = `
    const aim = (me, tx, ty, tz) => { const dx = tx - me.pos.x, dz = tz - me.pos.z, dy = ty - (me.pos.y + 1.7); me.yaw = Math.atan2(dx, dz); me.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
    const put = (me, g, x, z, up = 0) => { me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.pos.y = g.physics.groundHeight(x, z, 40) + up; me.alive = true; me.hp = me.maxHp; };
  `;
  // (a) the densest knot of soldiers, seen from 7 m
  await place('cluster', `(() => { ${aim}
    const g = window.__game, me = g.player, us = g.units.filter((u) => u.alive && !u.isCrew && !u.isHero && u.lod < 3);
    let best = null, bn = 0;
    for (const u of us) { let n = 0; for (const v of us) if ((u.pos.x - v.pos.x) ** 2 + (u.pos.z - v.pos.z) ** 2 < 100) n++; if (n > bn) { bn = n; best = u; } }
    if (!best) return false;
    put(me, g, best.pos.x + 6, best.pos.z + 4, 1.0); aim(me, best.pos.x, best.pos.y + 1.2, best.pos.z); return true; })()`);
  // (b) a siege engine at 9 m
  await place('engine', `(() => { ${aim}
    const g = window.__game, me = g.player, e = g.siege.find((s) => s.alive);
    if (!e) return false;
    put(me, g, e.pos.x - 7, e.pos.z + 5, 1.0); aim(me, e.pos.x, e.pos.y + 1.6, e.pos.z); return true; })()`);
  await place('engine2', `(() => { ${aim}
    const g = window.__game, me = g.player, es = g.siege.filter((s) => s.alive && s.type !== 'ram');
    const e = es[0];
    if (!e) return false;
    put(me, g, e.pos.x + 9, e.pos.z - 6, 1.0); aim(me, e.pos.x, e.pos.y + 2, e.pos.z); return true; })()`);
  // (c) the castle wall and its shadow from the field, and the towers' archers
  await place('castle_side', `(() => { ${aim}
    const g = window.__game, me = g.player, c = g.castles[0];
    put(me, g, c.center.x + 38, c.center.z + 4, 6); aim(me, c.center.x, c.center.y + 8, c.center.z); return true; })()`);
  await place('tower', `(() => { ${aim}
    const g = window.__game, me = g.player, c = g.castles[0];
    const t = c.towers[0].top;
    put(me, g, t.x + 14, t.z - 14, 4); aim(me, t.x, t.y + 1, t.z); return true; })()`);
  // (d) trees at 10-30 m with the shadows on the grass
  await place('trees', `(() => { ${aim}
    const g = window.__game, me = g.player, fol = g.scene.userData.worldSystems.find((s) => s.near);
    let best = -1, bn = 0;
    for (let i = 0; i < fol.n; i++) { if (fol.kind[i] > 3) continue; let n = 0; for (let j = 0; j < fol.n; j += 3) if (fol.kind[j] < 4 && (fol.pos[i * 3] - fol.pos[j * 3]) ** 2 + (fol.pos[i * 3 + 2] - fol.pos[j * 3 + 2]) ** 2 < 900) n++; if (n > bn && Math.hypot(fol.pos[i * 3], fol.pos[i * 3 + 2]) < 150) { bn = n; best = i; } }
    if (best < 0) return false;
    const x = fol.pos[best * 3], z = fol.pos[best * 3 + 2];
    put(me, g, x + 12, z + 12, 1.7); aim(me, x, 3, z); return true; })()`);
  // (e) the kit's own shadow: look down and to the right on open ground
  await place('own_shadow', `(() => { ${aim}
    const g = window.__game, me = g.player;
    put(me, g, 0, 40, 1.0); me.yaw = Math.PI * 0.5; me.pitch = -0.7; return true; })()`);
  // (f) the whole field from a rise: soldiers at every distance
  await place('field_wide', `(() => { ${aim}
    const g = window.__game, me = g.player;
    put(me, g, 0, 62, 5.5); me.yaw = Math.PI; me.pitch = -0.12; return true; })()`);
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
