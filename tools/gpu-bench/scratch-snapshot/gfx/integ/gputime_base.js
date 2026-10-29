// The same late battle on the original game (no gfx.renderFrame there): what one frame costs on the software GPU, waiting for it with a one-pixel read-back.
// usage: CW_PORT=8222 node gputime_base.js <map> <ffMinutes> <extraSteps> [quality]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', FF = Number(process.argv[3] || 6), EXTRA = Number(process.argv[4] || 440), QUALITY = process.argv[5] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  const out = await page.evaluate(async ([ff, extra]) => {
    const { LordAI } = await import('/src/ai.js');
    const g0 = window.__game, R = g0.renderer;
    const audio = g0.audio; audio.init = audio.startMusic = audio.play = () => {};
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    const own = g.factions[g.player.team]; own.ai = new LordAI(g, own); g.phaseT = 5;
    for (let i = 0; i < ff * 60 / 0.05; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    me.pos.set(0, 0, 60 * sz); me.vel.set(0, 0, 0); me.yaw = sz > 0 ? Math.PI : 0; me.pitch = -0.04;
    me.pos.y = g.physics.groundHeight(0, 60 * sz, 30);
    for (let i = 0; i < extra; i++) { g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const time = (n = 2) => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); R.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); } t.sort((x, y) => x - y); return Math.round(t[t.length >> 1]); };
    time(1);
    const all = time(3);
    g.lights.sun.castShadow = false; time(1); const noShadow = time(3); g.lights.sun.castShadow = true;
    return { all, noShadow, units: g.units.filter((u) => u.alive).length, canvas: [R.domElement.width, R.domElement.height] };
  }, [FF, EXTRA]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
