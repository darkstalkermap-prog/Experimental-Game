// Point-to-point pathing: every ordered pair of castles, one map size per run.
// usage: node p2p.js <small|medium|large> [pairsFilter e.g. 0-2,1-3] [variants closed,broken] [kinds units,ram,catapult]
const { launch, startSingle } = require('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/simlib.js');
const map = process.argv[2] || 'medium';
const pairFilter = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const variants = (process.argv[4] || 'closed,broken').split(',');
const kinds = (process.argv[5] || 'units,ram,catapult,giant,giantin').split(',');

(async () => {
  const { browser, page, errors } = await launch({ map });
  await startSingle(page);
  // one-time test setup inside the page
  await page.evaluate(async () => {
    window.__Unit = (await import('./src/units.js')).Unit;
    window.__UNIT_TYPES = (await import('./src/config.js')).UNIT_TYPES;
    const g = window.__game;
    window.__setup = () => {
      const g = window.__game;
      for (const u of g.units) u.remove();
      g.units.length = 0;
      for (const s of g.siege) g.scene.remove(s.mesh);
      g.siege.length = 0;
      g.spawnQueue.length = 0;
      for (const p of g.projectiles.list) g.scene.remove(p.mesh);
      g.projectiles.list.length = 0;
      g.phaseT = 1e9;
      for (const f of g.factions) { f.ai = null; f.siegeTarget = null; f.eliminated = false; f.troopCap = 36; }
      g.factions[0].respawnT = 1e9;
      g.player.alive = false;           // the hero stays out of the way
      for (const c of g.castles) {
        c.fallen = false; c.keep.alive = true; c.keep.hp = c.keep.maxHp;
        c.repairGate(); c.repairWalls(); c.setGateLocked(false);
        c.gate.hp = c.gate.maxHp; c.gate.alive = true; c.applyGateVisual();
      }
    };
  });
  const results = [];
  const pairs = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) pairs.push([a, b]);
  for (const [src, dst] of pairs) {
    if (pairFilter && !pairFilter.includes(src + '-' + dst)) continue;
    for (const variant of variants) {
      for (const kind of kinds) {
        const r = await page.evaluate(([src, dst, variant, kind]) => {
          const g = window.__game;
          window.__setup();
          const sc = g.castles[src], tc = g.castles[dst], sf = g.factions[src];
          if (variant === 'broken') tc.damageGate(1e9, null);
          sf.siegeTarget = tc;
          const actors = [];
          if (kind === 'units') {
            for (const type of ['swordsman', 'horseman', 'archer']) {
              const u = g.recruit(sf, type, true);
              u.setOrder('assault', tc);
              actors.push({ name: type, obj: u, speed: u.speed });
            }
          } else if (kind === 'giant') {
            const u = g.summonGiant(sf);            // appears 11 m outside its own gate
            actors.push({ name: 'giant', obj: u, speed: u.speed, giant: true });
          } else if (kind === 'giantin') {
            const t = window.__UNIT_TYPES.giant;     // a giant that starts inside its own courtyard
            const u = new window.__Unit(g, 'giant', sf.team, sc.spawnPoint.clone(), { hp: t.hp, dmg: t.dmg });
            u.homeCastle = sc; u.setOrder('assault', tc); g.units.push(u);
            actors.push({ name: 'giantIn', obj: u, speed: u.speed, giant: true });
          } else {
            const e = g.buildSiege(sf, kind);
            actors.push({ name: kind, obj: e, speed: e.speed, engine: true });
          }
          let shots = 0;
          const origThrow = g.projectiles.throwBoulder.bind(g.projectiles);
          g.projectiles.throwBoulder = (...a) => { shots++; origThrow(...a); };
          const gateHp0 = tc.gate.hp, keepHp0 = tc.keep.hp;
          const target = variant === 'closed' ? tc.gatePos : tc.keepDoor;
          for (const a of actors) {
            a.start = a.obj.pos.clone();
            a.dist = Math.hypot(target.x - a.start.x, target.z - a.start.z);
            a.expect = a.dist / a.speed;
            a.timeout = (a.engine ? 2.2 : 1.9) * a.expect + (a.engine ? 100 : a.giant ? 100 : 70);
            a.hist = [];
            a.arrived = null;
            a.minD = 1e9;
          }
          const dt = 1 / 30;
          let t = 0, nextSample = 0;
          const maxT = Math.max(...actors.map((a) => a.timeout));
          while (t < maxT) {
            g.update(dt);
            t += dt;
            for (const a of actors) {
              if (a.arrived !== null) continue;
              const o = a.obj;
              const d = Math.hypot(target.x - o.pos.x, target.z - o.pos.z);
              a.minD = Math.min(a.minD, d);
              let ok = false;
              if (a.giant) ok = variant === 'closed' ? (tc.gate.hp < gateHp0 - 1 || !tc.gate.alive) : tc.keep.hp < keepHp0 - 1;
              else if (a.engine) {
                if (a.name === 'ram') ok = variant === 'closed' ? (tc.gate.hp < gateHp0 - 1 || !tc.gate.alive) : tc.keep.hp < keepHp0 - 1;
                else ok = shots > 0;
              } else if (variant === 'closed') ok = d < 6.5;
              else ok = d < 6 || tc.keep.hp < keepHp0 - 1;
              if (ok) a.arrived = t;
              if (t >= nextSample) a.hist.push([Math.round(o.pos.x * 10) / 10, Math.round(o.pos.z * 10) / 10, o.target ? (o.target.kind || o.target.type || 'u') : null]);
            }
            if (t >= nextSample) nextSample += 1;
            if (actors.every((a) => a.arrived !== null)) break;
          }
          return actors.map((a) => {
            // longest motionless stretch before arriving (8 s windows, < 1.5 m)
            let worst = 0, worstAt = null;
            const h = a.hist;
            const end = a.arrived !== null ? Math.floor(a.arrived) : h.length;
            for (let i = 0; i + 8 < end; i++) {
              let mx = 0;
              for (let j = i + 1; j <= i + 8; j++) mx = Math.max(mx, Math.hypot(h[j][0] - h[i][0], h[j][1] - h[i][1]));
              if (mx < 1.5) { let len = 8; while (i + len + 1 < end && Math.hypot(h[i + len + 1][0] - h[i][0], h[i + len + 1][1] - h[i][1]) < 1.5) len++; if (len > worst) { worst = len; worstAt = [h[i][0], h[i][1], h[i][2], i]; } }
            }
            const o = a.obj;
            return { name: a.name, arrived: a.arrived, expect: Math.round(a.expect), eff: a.arrived ? Math.round(a.expect / a.arrived * 100) / 100 : 0, dist: Math.round(a.dist), minD: Math.round(a.minD), worst, worstAt, final: [Math.round(o.pos.x), Math.round(o.pos.z)], alive: o.alive, timeout: Math.round(a.timeout) };
          });
        }, [src, dst, variant, kind]);
        for (const x of r) results.push({ map, src, dst, variant, kind, ...x });
        const bad = r.filter((x) => x.arrived === null || x.worst >= 8);
        console.log(`${map} ${src}->${dst} ${variant.padEnd(6)} ${kind.padEnd(8)} ` + r.map((x) => `${x.name}:${x.arrived === null ? 'FAIL(minD ' + x.minD + ' at ' + x.final + ')' : Math.round(x.arrived) + 's eff ' + x.eff}${x.worst >= 8 ? ' STALL' + x.worst + 's@' + JSON.stringify(x.worstAt) : ''}`).join(' | '));
      }
    }
  }
  const fails = results.filter((x) => x.arrived === null);
  const stalls = results.filter((x) => x.arrived !== null && x.worst >= 8);
  const effs = results.filter((x) => x.arrived !== null).map((x) => x.eff);
  console.log(`SUMMARY ${map}: ${results.length} runs, ${fails.length} failed to arrive, ${stalls.length} stalled>=8s, efficiency min ${Math.min(...effs)} median ${effs.sort((a, b) => a - b)[Math.floor(effs.length / 2)]}`);
  require('fs').writeFileSync(`p2p_${map}_${(pairFilter || ['all']).join('_')}.json`, JSON.stringify(results));
  console.log('errors:', errors.slice(0, 5).join('\n') || 'none');
  await browser.close();
})();
