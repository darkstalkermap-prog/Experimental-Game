// debug: does an R11F_G11F_B10F scene target render here? prints GL errors and the framebuffer status
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'medium';
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript(() => { let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0); });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.text().startsWith('DBG ')) console.log(m.text().slice(4)); else if (m.type() === 'error' || m.type() === 'warning') console.log(m.type() + ': ' + m.text().slice(0, 200)); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(async () => {
    const { Q } = await import('/src/quality.js');
    const g0 = window.__game, R = g0.renderer, gfx = window.__gfx;
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    for (let i = 0; i < 10; i++) { g.update(0.05); g.input.endFrame(); }
    const gl = R.getContext();
    const log = (s) => console.log('DBG ' + s);
    const errs = () => { const e = []; let c; while ((c = gl.getError()) !== gl.NO_ERROR && e.length < 8) e.push('0x' + c.toString(16)); return e.join(','); };
    const px = new Uint8Array(4);
    const center = () => { gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px).join(','); };
    errs();
    gfx.renderFrame(0); log('base: errors [' + errs() + '] centre ' + center());
    const post = gfx.post, mk = post.makeRT;
    for (const fmt of ['R11F_G11F_B10F', 'RGB16F', 'RGBA16F']) {
      post.makeRT = function (w, h, opts = {}) { const rt = mk.call(this, w, h, opts); if (opts.depthBuffer && fmt !== 'RGBA16F') rt.texture.internalFormat = fmt; return rt; };
      post.release(); gfx.resize(true);
      errs();
      gfx.renderFrame(0); gfx.renderFrame(0);
      log(fmt + ': errors [' + errs() + '] centre ' + center() + ' samples ' + post.samples);
      // framebuffer status of the scene target
      R.setRenderTarget(post.sceneRT);
      log('  status ' + gl.checkFramebufferStatus(gl.FRAMEBUFFER) + ' (complete=' + gl.FRAMEBUFFER_COMPLETE + ') errors [' + errs() + ']');
      R.setRenderTarget(null);
    }
    post.makeRT = mk; post.release(); gfx.resize(true);
    log('ext: ' + ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'EXT_float_blend', 'OES_texture_float_linear', 'WEBGL_multisampled_render_to_texture'].map((n) => n + '=' + !!gl.getExtension(n)).join(' ') + ' maxSamples ' + gl.getParameter(gl.MAX_SAMPLES));
  });
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
