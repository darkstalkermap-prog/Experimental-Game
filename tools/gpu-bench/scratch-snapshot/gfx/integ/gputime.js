// What a frame costs on the software GPU, part by part: the bench's flow up to a late frame, then renders that wait for the GPU (gl.finish) with one kind of
// scene content hidden at a time. usage: CW_PORT=8220 node gputime.js <map> <ffMinutes> <extraSteps> [quality]
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', FF = Number(process.argv[3] || 6), EXTRA = Number(process.argv[4] || 440), QUALITY = process.argv[5] || 'high';
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  const out = await page.evaluate(async ([ff, extra]) => {
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
    for (let i = 0; i < extra; i++) { g.update(1 / 60); g.ui.update(1 / 60); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const time = (n = 2) => { const t = []; for (let i = 0; i < n; i++) { const a = performance.now(); gfx.renderFrame(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); } t.sort((x, y) => x - y); return Math.round(t[t.length >> 1]); };
    time(1);
    const res = { all: time(3) };
    const top = g.scene.children;
    const hideBy = (label, pred) => { const hid = []; g.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hid.push(o); } }); res[label] = time(2) + ' (' + hid.length + ' hidden)'; for (const o of hid) o.visible = true; };
    const isFx = (o) => /^fx-/.test(o.name || '');
    hideBy('no fx particles/decals', isFx);
    hideBy('no sky', (o) => o.name === 'sky');
    hideBy('no terrain', (o) => o.userData && o.userData.owner === 'a3 terrain');
    hideBy('no foliage', (o) => o.userData && o.userData.owner === 'a3 foliage');
    hideBy('no grass', (o) => o.userData && o.userData.owner === 'a3 grass');
    hideBy('no crowd', (o) => o.isInstancedMesh && o.customDepthMaterial);
    const castleRoots = new Set(g.castles.map((c) => c.group));
    hideBy('no castles', (o) => castleRoots.has(o));
    hideBy('no siege', (o) => g.siege.some((s) => s.mesh === o || s.group === o));
    hideBy('no points', (o) => o.isPoints);
    g.lights.sun.castShadow = false; res.noShadows = time(2) + ''; g.lights.sun.castShadow = true;
    const pst = gfx.post; const was = pst && pst.active;
    return { res, units: g.units.filter((u) => u.alive).length, post: !!was, canvas: [R.domElement.width, R.domElement.height], children: top.length };
  }, [FF, EXTRA]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
