const g = window.__game, gfx = window.__gfx;
for (let i = 0; i < 40; i++) { g.update(0.05); g.input.endFrame(); }
for (let i = 0; i < 6; i++) gfx.renderFrame(1 / 60);
const fol = g.scene.userData.worldSystems.find((s) => s.near);
const rig = g.lights.rig;
const casters = g.scene.userData.casters || [];
return {
  useProxy: fol.useProxy,
  proxies: fol.proxy.map((p) => ({ count: p.count, on: p.userData.on, vis: p.visible, cast: p.castShadow, parent: !!p.parent, tris: p.geometry.index.count / 3 })),
  near: fol.near.map((m) => ({ count: m.count, cast: m.castShadow, tris: m.geometry.index.count / 3 })),
  rocks: fol.rocks.map((m) => ({ count: m.count, cast: m.castShadow, tris: m.geometry.index.count / 3 })),
  casters: casters.length, rigHooked: !!g.scene.userData.shadowRig, hook: !!g.renderer.shadowMap.render.__rigHooked,
};
