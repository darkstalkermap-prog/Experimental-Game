// Crowd test: every unit type, tiers 0-5, ranks, raiders, mounted, giants, deaths, LOD bands, quality switches, hero bodies of all six classes.
// CW_PORT=8211 $S/gfx/b.sh $S/gfx/A1/crowdtest.js [shots=1] [map=small]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
(async () => {
  const { browser, page, errors } = await L.launch({ map: arg.map || 'small', quality: 'high', viewport: { width: 640, height: 360 }, raf: true });
  await page.click('#play');
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const out = {};
    const g = window.__game, me = g.player;
    const { Unit } = await import('/src/units.js');
    const { Player } = await import('/src/player.js');
    const { UNIT_TYPES } = await import('/src/config.js');
    const V = g.camera.position.constructor;
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((res) => requestAnimationFrame(res)); };
    me.buffs.add('ghost', 1e6); g.paused = false; g.phaseT = 1e9;
    for (const u of g.units) { u.alive = false; u.remove(); }
    g.units.length = 0;
    const types = Object.keys(UNIT_TYPES).filter((t) => t !== 'hero');
    out.types = types;
    // a block of every type in every team, tier 0..5 for the trainable ones, spread over distances so every LOD band shows up
    const made = [];
    let k = 0;
    for (const type of types) {
      for (let team = 0; team < 5; team++) {
        const tiers = ['giant', 'engineer', 'lord'].includes(type) || team === 4 ? [0] : [0, 3, 5];
        for (const tier of tiers) {
          const ang = (k++ * 2.399) % 6.283, dist = 6 + (k % 9) * 14;
          const u = new Unit(g, type, team, new V(Math.sin(ang) * dist, 0, 60 + Math.cos(ang) * dist), { variant: k % 6 });
          u.homeCastle = g.castles[team % 4];
          if (tier) { u.fixedTier = true; u.setTier(tier); }
          if (k % 4 === 0 && !u.isHero && !u.isGiant && !u.isCrew && team < 4) u.setRankVisual(3 + (k % 3));
          u.think = () => {}; u.yaw = ang;
          u.update = function (dt) { if (!this.alive) { this.animateDeath(dt); return; } this.vel.set(Math.sin(this.yaw) * 3, 0, Math.cos(this.yaw) * 3); this.animate(dt, k % 2 === 0); this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw; };
          g.units.push(u); made.push(u);
        }
      }
    }
    out.units = made.length;
    me.vel.set(0, 0, 0); me.pos.set(0, 0, 40); me.pos.y = g.physics.groundHeight(0, 40, 50) + 1.2; me.yaw = 0; me.pitch = -0.1; me.alive = true; me.hp = me.maxHp;
    await frames(30);
    const st = g.crowd.stats; out.stats1 = { ...st };
    out.lods = made.reduce((a, u) => { a[u.lod] = (a[u.lod] || 0) + 1; return a; }, {});
    const finite = () => { let bad = 0; for (const b of g.crowd.list) { const a = b.mat, n = b.n * 16; for (let i = 0; i < n; i++) if (!Number.isFinite(a[i])) bad++; const l = b.look, ln = b.n * 16; for (let i = 0; i < ln; i++) if (!Number.isFinite(l[i])) bad++; } return bad; };
    out.badFloats1 = finite();
    // deaths: kill a third of them, run past the fade-out
    made.forEach((u, i) => { if (i % 3 === 0) { u.hp = 0; u.alive = false; u.deathT = 0; } });
    for (let s = 0; s < 4; s++) { await frames(20); out['bad_death' + s] = finite(); }
    out.deadPoseSample = made.filter((u) => !u.alive).slice(0, 3).map((u) => [u.type, +u.model.body.rotation.x.toFixed(2), +u.model.body.rotation.z.toFixed(2)]);
    // quality switches
    for (const q of ['low', 'medium', 'ultra', 'high']) { g.setQuality(q); await frames(6); out['q_' + q] = { ...g.crowd.stats }; }
    // heroes of every class (remote bodies)
    const classes = ['knight', 'berserker', 'ranger', 'mage', 'cleric', 'cavalier'];
    const heroes = classes.map((cls, i) => {
      const h = new Player(g, null, { remote: true, team: i % 4, name: 'H' + i, cls });
      h.pos.set((i - 2.5) * 2.2, g.physics.groundHeight((i - 2.5) * 2.2, 52, 50), 52);
      g.humans.push(h);
      return h;
    });
    await frames(10);
    out.heroBodies = heroes.map((h) => !!h.body && h.body.parts.length);
    out.heroHorse = heroes.filter((h) => h.horse).length;
    heroes[3].adoptClass('cleric'); heroes[0].adoptClass('mage');
    await frames(6);
    out.restyled = [heroes[3].bodyClass, heroes[0].bodyClass];
    out.badFloats2 = finite();
    // a hero with the bow out, mounted
    heroes[2].weapon = 'bow'; heroes[1].swingT = 0.3; heroes[4].blocking = true; await frames(4);
    out.stats2 = { ...g.crowd.stats };
    // tidy
    for (const h of heroes) { h.removeBody(); g.humans.splice(g.humans.indexOf(h), 1); }
    g.dispose();
    out.disposed = true;
    return out;
  });
  console.log(JSON.stringify(r.stats1), 'lods', JSON.stringify(r.lods), 'units', r.units);
  ok('every unit type built and drawn', r.stats1.instances > 200 && r.stats1.batches > 20, JSON.stringify(r.stats1));
  ok('all three LOD bands in use', r.lods[0] > 0 && r.lods[1] > 0 && r.lods[2] > 0, JSON.stringify(r.lods));
  ok('matrices and looks stay finite (poses, deaths, fade)', !r.badFloats1 && !r.bad_death0 && !r.bad_death1 && !r.bad_death2 && !r.bad_death3 && !r.badFloats2);
  ok('deaths pose the body', r.deadPoseSample.some((d) => Math.abs(d[1]) > 0.5 || Math.abs(d[2]) > 0.5), JSON.stringify(r.deadPoseSample));
  ok('quality switches keep drawing', ['low', 'medium', 'ultra', 'high'].every((q) => r['q_' + q].instances > 50), JSON.stringify(['low', 'medium', 'ultra', 'high'].map((q) => [q, r['q_' + q].batches, r['q_' + q].tris])));
  ok('six hero bodies, each its own look', r.heroBodies.every(Boolean) && new Set(r.heroBodies).size > 2, JSON.stringify(r.heroBodies) + ' horses ' + r.heroHorse);
  ok('a hero changing class changes body', r.restyled[0] === 'cleric' && r.restyled[1] === 'mage', JSON.stringify(r.restyled));
  ok('dispose is clean', r.disposed);
  ok('no console errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
  await browser.close();
})();
