const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
(async () => {
  const { browser, page, errors } = await L.launch({ map: 'small' });
  await L.startSingle(page);
  const MIX = ['swordsman', 'swordsman', 'spearman', 'spearman', 'archer', 'archer', 'archer', 'knight', 'horseman', 'horseman', 'swordsman', 'archer'];
  await page.evaluate((mix) => {
    const g = window.__game;
    g.phaseT = 1e9;
    for (const f of g.factions) f.ai = null;
    for (const u of g.units) if (u.isHero && u.team !== 0) { u.think = () => {}; u.update = function (dt) { this.animate(dt, false); }; }
    const f = g.factions[0]; f.gold = 1e6; f.troopCap = 36;
    window.__army = [];
    for (const t of mix) { const u = g.recruit(f, t); g.assignRole(f, u, 'army'); window.__army.push(u); }
    g.reslot(0);
    g.localOrder('assault');
  }, MIX);
  for (let t = 0; t < 60; t += 5) {
    await L.step(page, 5);
    const s = await page.evaluate(() => {
      const g = window.__game;
      return window.__army.filter((u) => u.alive && u.kind === 'archer').slice(0, 3).map((u) => ({
        pos: [Math.round(u.pos.x), Math.round(u.pos.z)], tgt: u.target ? [u.target.kind || u.target.type, Math.round(u.target.pos.x), Math.round(u.target.pos.z), Math.round(u.target.pos.y - u.pos.y), !!u.target.post] : null,
        wp: u.waypoint ? [Math.round(u.waypoint.x), Math.round(u.waypoint.z)] : null, goal: u.goal ? [Math.round(u.goal.x), Math.round(u.goal.z)] : null, los: u.los, vel: [+u.vel.x.toFixed(1), +u.vel.z.toFixed(1)],
        avoid: u.avoid && u.avoid.corner ? [Math.round(u.avoid.corner.x), Math.round(u.avoid.corner.z)] : null, noLos: +(u.noLosT || 0).toFixed(1), ign: !!u.ignore, stuck: u.stuckCount, ghost: u.ghostT > 0,
      }));
    });
    console.log(Math.round(t + 5), JSON.stringify(s));
  }
  console.log('errors:', errors.join('\n') || 'none');
  await browser.close();
})();
