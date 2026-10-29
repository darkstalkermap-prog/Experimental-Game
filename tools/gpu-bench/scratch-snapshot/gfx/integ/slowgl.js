// A frame that takes seconds in the small-map benchmark: which WebGL calls (and which of our passes) it spends the time in.
// usage: CW_PORT=8220 node slowgl.js <map> <ffMinutes>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', FF = Number(process.argv[3] || 6);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: 'high', viewport: { width: 1280, height: 720 } });
  const out = await page.evaluate(async ([ff]) => {
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
    const gl = R.getContext(), proto = Object.getPrototypeOf(gl);
    let T = {};
    for (const name of Object.getOwnPropertyNames(proto)) {
      const d0 = Object.getOwnPropertyDescriptor(proto, name);
      const f = d0 && d0.value;
      if (typeof f !== 'function' || name === 'constructor') continue;
      proto[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const e = T[name] || (T[name] = [0, 0]); e[0] += d; e[1]++; return r; };
    }
    const rows = () => Object.entries(T).sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([k, v]) => [k, Math.round(v[0]), v[1]]);
    // time our own passes too (each is wrapped with a finish so the GPU work lands in it)
    const post = gfx.post, passes = {};
    const wrap = (obj, name, label) => { const o = obj[name]; if (!o) return; obj[name] = function (...a) { const t = performance.now(); const r = o.apply(this, a); const d = performance.now() - t; passes[label] = (passes[label] || 0) + d; return r; }; };
    wrap(R, 'render', 'renderer.render');
    wrap(R.shadowMap, 'render', 'shadowMap.render');
    if (post) for (const k of Object.keys(post)) if (typeof post[k] === 'function' && /render|bloom|grade|fxaa|resolve|blit/i.test(k)) wrap(post, k, 'post.' + k);
    const found = [];
    for (let i = 0; i < 700; i++) {
      T = {}; for (const k of Object.keys(passes)) passes[k] = 0;
      g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame();
      if (i % 2 === 0) {
        const a = performance.now(); gfx.renderFrame(1 / 60); const d = performance.now() - a;
        if (d > 3000) { found.push({ i, d: Math.round(d), gl: rows(), passes: Object.fromEntries(Object.entries(passes).map(([k, v]) => [k, Math.round(v)])), calls: R.info.render.calls, tris: R.info.render.triangles, shadowNear: !!g.lights.sun.castShadow, far: g.lights.rig.far.shadow.needsUpdate }); if (found.length >= 2) break; }
      }
    }
    return found;
  }, [FF]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
