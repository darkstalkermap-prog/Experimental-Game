// Which frames of the benchmark are slow and why: the bench's own flow (ghost hero, AI-led houses, a fast-forward, then 60 steps a second with a frame
// every other step) with each frame timed and the renderer's counters watched. usage: CW_PORT=8220 node slowframes.js <map> <ffMinutes> <seconds>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', FF = Number(process.argv[3] || 6), SECS = Number(process.argv[4] || 10);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 1280, height: 720 } });
  const out = await page.evaluate(async ([ff, secs]) => {
    const { LordAI } = await import('/src/ai.js');
    const g0 = window.__game, gfx = window.__gfx, R = g0.renderer;
    const audio = g0.audio; audio.init = audio.startMusic = audio.play = () => {};
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    const own = g.factions[g.player.team]; own.ai = new LordAI(g, own); g.phaseT = 5;
    for (let i = 0; i < ff * 60 / 0.05; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    me.pos.set(0, 0, 60 * sz); me.vel.set(0, 0, 0); me.yaw = sz > 0 ? Math.PI : 0; me.pitch = -0.04;
    me.pos.y = g.physics.groundHeight(0, 60 * sz, 30);
    const log = [];
    const gl = R.getContext();
    const frames = Math.round(secs * 60);
    let slowTotal = 0;
    for (let i = 0; i < frames; i++) {
      const progs = R.info.programs ? R.info.programs.length : 0;
      const a = performance.now();
      g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame();
      const b = performance.now();
      let d = 0;
      if (i % 2 === 0) { gfx.renderFrame(1 / 60); d = performance.now() - b; }
      const progs2 = R.info.programs ? R.info.programs.length : 0;
      if (d > 60 || b - a > 60) { slowTotal += d; log.push({ i, upd: Math.round(b - a), draw: Math.round(d), progs, progs2, scale: gfx.scale || (gfx.dyn && gfx.dyn.scale) || null, geos: R.info.memory.geometries, tex: R.info.memory.textures }); }
    }
    return { slow: log.length, slowTotal: Math.round(slowTotal), first: log.slice(0, 12), post: !!(gfx.post && gfx.post.active), alive: g.units.filter((u) => u.alive).length };
  }, [FF, SECS]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
