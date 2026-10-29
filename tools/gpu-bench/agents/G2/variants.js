// in-page variants for exp.js: source text of (c) => undo
const post = (patch, msaa) => `(c) => { c.post(${JSON.stringify(patch)}, ${msaa}); return () => c.repost(); }`;
const rt11 = (inner) => `(c) => {
  const post = c.gfx.post, mk = post.makeRT;
  post.makeRT = function (w, h, opts = {}) { const rt = mk.call(this, w, h, opts); if (opts.depthBuffer) rt.texture.internalFormat = 'R11F_G11F_B10F'; return rt; };
  post.release(); c.gfx.resize(true);
  const inner = (${inner});
  const undoInner = inner ? inner(c) : null;
  return () => { if (undoInner) undoInner(); post.makeRT = mk; post.release(); c.gfx.resize(true); };
}`;
module.exports = {
  base: '(c) => () => {}',
  m0: post({ aa: false }, 0),
  m0aa: post({ aa: true }, 0),
  m2: post({ aa: false }, 2),
  m2aa: post({ aa: true }, 2),
  m4: post({ aa: false }, 4),
  m4aa: post({ aa: true }, 4),
  rt11: rt11('null'),
  rt11_m2aa: rt11(post({ aa: true }, 2)),
  rt11_m2: rt11(post({ aa: false }, 2)),
  direct: post({ bloom: false, aa: false, vignette: false, grade: false }, 0),
  nobloom: post({ bloom: false }, undefined),
  noaa: post({ aa: false }, undefined),
};
