// Is the simulation the same game in two builds? A7's benchmark hash cannot say: every visual effect draws from the one seeded Math.random, so
// any change to how an effect uses random numbers moves the whole battle. This splits the stream: calls made from the files that run the
// game (units, ai, siege, projectiles, player, game, classes, herobot, herogame) draw from stream A, every other caller (effects, models,
// castle looks, noise, sound, the viewmodel) from stream B. Builds with the same game rules then give the same hash of the battle whatever
// their visuals do. Works on the original game as well (nothing from the page is needed but window.__game).
// usage: CW_PORT=<port> node hashcmp.js <map> <minutes> [seed]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', MINUTES = Number(process.argv[3] || 6), SEED = Number(process.argv[4] || 12345);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 640, height: 360 } });
  const out = await page.evaluate(async ([minutes, seed]) => {
    const g0 = window.__game;
    if (!g0 || g0.state !== 'menu') throw new Error('call from the main menu');
    const mulberry32 = (a) => function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const A = mulberry32(seed), B = mulberry32(seed ^ 0x5bd1e995);
    const GAME = /\/src\/(units|ai|siege|projectiles|player|game|classes|herobot|herogame)\.js/;
    const counts = { A: 0, B: 0 };
    const realRandom = Math.random;
    const limit = Error.stackTraceLimit;
    Math.random = function () {
      Error.stackTraceLimit = 2;
      const s = new Error().stack;
      Error.stackTraceLimit = limit;
      const line = s.split('\n')[2] || '';
      if (GAME.test(line)) { counts.A++; return A(); }
      counts.B++; return B();
    };
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    const hashState = (g) => {
      let h = 0x811c9dc5;
      const mix = (v) => { f64[0] = v; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
      mix(g.round); mix(g.time); mix(g.units.length); mix(g.siege.length);
      for (const u of g.units) { mix(u.id); mix(u.alive ? 1 : 0); mix(u.pos.x); mix(u.pos.y); mix(u.pos.z); mix(u.hp); mix(u.yaw); mix(u.kills); mix(u.xp); }
      for (const s of g.siege) { mix(s.alive ? 1 : 0); mix(s.pos.x); mix(s.pos.z); mix(s.hp); }
      for (const c of g.castles) { mix(c.keep.hp); mix(c.gate.hp); }
      for (const f of g.factions) { mix(f.gold); mix(f.kills); mix(f.earned); mix(f.troopCap); }
      const p = g.player; mix(p.pos.x); mix(p.pos.y); mix(p.pos.z); mix(p.hp);
      mix(g.projectiles.list.length);
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    let LordAI, prewarmSoldier;
    LordAI = (await import('/src/ai.js')).LordAI;
    try { prewarmSoldier = (await import('/src/models.js')).prewarmSoldier; } catch (e) {}
    const audio = g0.audio;
    audio.init = audio.startMusic = audio.play = () => {};
    try {
      document.getElementById('play').click();
      const g = window.__game;
      g.paused = false;
      if (prewarmSoldier) while (g.warmQueue && g.warmQueue.length) prewarmSoldier(...g.warmQueue.shift());
      g.player.buffs.add('ghost', 1e6);
      const own = g.factions[g.player.team];
      own.ai = new LordAI(g, own); g.phaseT = 5;
      const trace = [];
      const steps = Math.round(minutes * 60 / 0.05);
      for (let i = 0; i < steps; i++) {
        g.update(0.05); g.ui.update(0.05); g.input.endFrame();
        if (i % 600 === 599) trace.push(hashState(g));
      }
      return { hash: hashState(g), trace, round: g.round, alive: g.units.filter((u) => u.alive).length, siege: g.siege.filter((s) => s.alive).length, counts, units: g.units.length, time: +g.time.toFixed(2), gold: g.factions.map((f) => Math.round(f.gold)), kills: g.factions.map((f) => f.kills) };
    } finally {
      Math.random = realRandom;
    }
  }, [MINUTES, SEED]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
