// The first frames after a long fast-forward: how long each takes and which shader programs the time goes to (software GL compiles on the first draw).
// usage: CW_PORT=8220 node firstframe.js <map> <quality> <minutes>
const S = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/';
const L = require(S + 'simlib.js');
const MAP = process.argv[2] || 'small', QUALITY = process.argv[3] || 'high', MINUTES = Number(process.argv[4] || 6);
(async () => {
  const { browser, page, errors } = await L.launch({ map: MAP, quality: QUALITY, viewport: { width: 1280, height: 720 } });
  await L.startSingle(page);
  const out = await page.evaluate(async ([minutes]) => {
    const g = window.__game, gfx = window.__gfx, R = g.renderer;
    g.player.buffs.add('ghost', 1e6);
    for (let i = 0; i < minutes * 60 * 20; i++) { g.update(0.05); g.ui.update(0.05); g.input.endFrame(); }
    const gl = R.getContext();
    const slow = [];
    const proto = Object.getPrototypeOf(gl);
    const orig = proto.getProgramInfoLog;
    proto.getProgramInfoLog = function (p) {
      const a = performance.now();
      const r = orig.call(this, p);
      const dt = performance.now() - a;
      if (dt > 30) {
        let fs = 0, vs = 0;
        try { for (const s of this.getAttachedShaders(p)) { const src = this.getShaderSource(s) || ''; if (this.getShaderParameter(s, this.FRAGMENT_SHADER === this.getShaderParameter(s, this.SHADER_TYPE) ? this.SHADER_TYPE : this.SHADER_TYPE) === this.FRAGMENT_SHADER) fs = src.length; else vs = src.length; } } catch (e) {}
        slow.push({ ms: Math.round(dt), fsLen: fs, vsLen: vs });
      }
      return r;
    };
    const times = [];
    const progs0 = R.info.programs ? R.info.programs.length : 0;
    for (let i = 0; i < 6; i++) { const a = performance.now(); gfx.renderFrame(1 / 60); gl.finish(); times.push(Math.round(performance.now() - a)); }
    const names = (R.info.programs || []).map((p) => p.name + ':' + (p.cacheKey ? p.cacheKey.length : 0));
    proto.getProgramInfoLog = orig;
    return { frames: times, progs0, progs1: R.info.programs ? R.info.programs.length : 0, slow: slow.sort((a, b) => b.ms - a.ms).slice(0, 8), post: !!(gfx.post && gfx.post.active), canvas: [R.domElement.width, R.domElement.height], names: names.slice(0, 5) };
  }, [MINUTES]);
  console.log(JSON.stringify(out));
  console.log('errors', JSON.stringify(errors.slice(0, 3)));
  await browser.close();
})();
