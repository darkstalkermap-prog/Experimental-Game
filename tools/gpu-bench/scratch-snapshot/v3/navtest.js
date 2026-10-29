// Walking round castles: from many starting points to points beyond them, the corner waypoints must never stall.
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
let failed = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++; };
(async () => {
  for (const map of ['small', 'medium', 'large']) {
    const { browser, page, errors } = await L.launch({ map });
    await L.startSingle(page);
    const r = await page.evaluate(async () => {
      const nav = await import('./src/nav.js');
      const g = window.__game;
      const V = g.player.pos.constructor;
      let runs = 0, stalls = 0, tooLong = 0, worst = 0;
      const stallSamples = [];
      // goals: the gate-out point and the middle of each wall, just outside it, of every castle
      const goals = [];
      for (const c of g.castles) {
        goals.push([c.gateOut.x, c.gateOut.z, c.team + ':gate']);
        for (const seg of c.walls) if (seg.breakable && seg.lx % 10 !== 0 || false) goals.push([seg.outPt.x, seg.outPt.z, c.team + ':wall']);
      }
      for (const c of g.castles) {
        for (const R of [31, 36, 48]) {
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const sx = c.center.x + Math.cos(a) * R, sz = c.center.z + Math.sin(a) * R;
            for (const [gx, gz, tag] of goals) {
              if (Math.hypot(gx - sx, gz - sz) < 20) continue;
              runs++;
              const pos = new V(sx, 0, sz), goal = new V(gx, 0, gz);
              let steps = 0;
              const trail = [], mem = {};
              while (steps++ < 500) {
                const wp = nav.avoidCastles(g, pos, goal, mem);
                const dx = wp.x - pos.x, dz = wp.z - pos.z, d = Math.hypot(dx, dz);
                const d2g = Math.hypot(goal.x - pos.x, goal.z - pos.z);
                if (d2g < 1.5) break;
                // a soldier walks 1.5 m between thoughts and stops within half a metre of a waypoint
                if (d > 0.5) { pos.x += dx / d * Math.min(1.5, d); pos.z += dz / d * Math.min(1.5, d); }
                trail.push([pos.x, pos.z]);
                const old = trail[trail.length - 31];
                if (old && Math.hypot(pos.x - old[0], pos.z - old[1]) < 3) {   // 30 thoughts and no progress at all
                  stalls++;
                  if (stallSamples.length < 4) stallSamples.push({ from: [Math.round(sx), Math.round(sz)], to: [Math.round(gx), Math.round(gz), tag], at: [Math.round(pos.x), Math.round(pos.z)], wp: [Math.round(wp.x), Math.round(wp.z)], castle: c.team });
                  break;
                }
              }
              if (steps >= 500) tooLong++;
              worst = Math.max(worst, steps);
            }
          }
        }
      }
      return { runs, stalls, tooLong, worst, stallSamples };
    });
    check(`${map}: walking round castles never stalls at a corner`, r.stalls === 0 && r.tooLong === 0, JSON.stringify(r));
    console.log('errors:', errors.join('\n') || 'none');
    await browser.close();
  }
  console.log(failed ? `RESULT: ${failed} FAILED` : 'RESULT: all passed');
})();
