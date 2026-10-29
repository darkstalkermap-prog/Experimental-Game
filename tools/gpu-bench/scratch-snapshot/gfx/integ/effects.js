// Effects on the REAL frame path (gfx.renderFrame: post on or off by the quality level). usage: CW_PORT=8220 node effects.js <tag> <quality>
const lab = require('./lab.js');
const TAG = process.argv[2] || 'fx', QUALITY = process.argv[3] || 'high';
(async () => {
  const L = await lab.open({ w: 960, h: 540, quality: QUALITY });
  await L.run(() => { const g = window.__game; g.__V3 = g.camera.position.constructor; g.__Col = g.lights.sun.color.constructor; g.grass.setDensity(2); });
  const at = (code) => `(() => { const g = window.__game, V3 = g.__V3, Col = g.__Col, h = g.__lab.home, fx = g.fx;
    const gy = (x, z) => g.physics.groundHeight(x, z, 30);
    const p = new V3(h.x, gy(h.x, h.z) + 1.2, h.z), gr = new V3(h.x, gy(h.x, h.z), h.z); ${code} })()`;
  // 1. a melee: blood, sparks, dust, splinters, a level-up ring, with a few soldiers standing about
  await L.cam([0, -6, 0], [0, 1.3, 0]);
  await L.run(at(`
    fx.blood(p, 12, 1, 0); fx.blood(p, 9, 0.6, 0.8); fx.sparks(p.clone().setX(p.x - 1.5), 24); fx.dust(gr.clone().setX(gr.x + 2), 26, 3); fx.splinters(p.clone().setX(p.x + 3), 30);
    fx.levelUp(gr.clone().setZ(gr.z + 3)); fx.explosion(p.clone().setZ(p.z + 9), 3);
    for (let i = 0; i < 10; i++) g.fx.splat(h.x + (i % 5) * 0.6 - 1.2, gr.y, h.z - 2 + Math.floor(i / 5) * 0.8, 0.7);`));
  await L.shot(`${TAG}_melee`, 10);
  // 2. projectiles: arrows crossing, a fireball, lightning
  await L.step(120);
  await L.cam([0, -5, 0], [0, 1.6, 4]);
  await L.run(at(`
    for (let i = 0; i < 14; i++) {
      const from = new V3(h.x - 14, gy(h.x - 14, h.z + 1) + 1.8 + i * 0.08, h.z + 1 + i * 0.25), to = new V3(h.x + 10 + (i % 4), gy(h.x + 10, h.z + 3), h.z + 3 + (i % 5) * 0.6);
      const t = 0.9, v = new V3((to.x - from.x) / t, (to.y - from.y + 0.5 * 9.8 * t * t) / t, (to.z - from.z) / t);
      g.projectiles.fireArrow(from, v, i % 4, 0, null, false);
    }
    g.projectiles.fireSpell('fireball', new V3(h.x - 8, gy(h.x - 8, h.z + 3) + 1.5, h.z + 3), new V3(1, -0.02, 0).normalize().multiplyScalar(26), 0, 0, null, 3.5);
    const at2 = new V3(h.x + 3, gy(h.x + 3, h.z + 9), h.z + 9);
    g.magic.showBolt([new V3(at2.x + 1, at2.y + 42, at2.z), at2], 0xffe9a0);`));
  await L.shot(`${TAG}_proj`, 9);
  await L.step(150);
  // 3. abilities: heal, rally, whirlwind, smite
  await L.cam([0, -12, 4], [0, 1.2, 3]);
  await L.run(at(`
    const me = g.player; me.hp = me.maxHp = 1e6;
    g.abilities.show('rally', gr.clone().setZ(gr.z + 4), new V3(0, 0, 1), true, null, 1);
    g.abilities.show('heal', gr.clone().setX(gr.x - 4).setZ(gr.z + 2), new V3(0, 0, 1), true, [new V3(h.x - 2, gr.y + 1.2, h.z + 2), new V3(h.x - 7, gr.y + 1.2, h.z + 5)], 1);
    g.abilities.show('whirl', gr.clone().setX(gr.x + 4).setZ(gr.z + 2), new V3(0, 0, 1), true, null, 1);
    const sm = new V3(h.x + 1, gy(h.x + 1, h.z + 10), h.z + 10); g.abilities.show('smite', sm, new V3(0, 0, 1), true, null, 1);
    g.magic.showBolt([new V3(sm.x + 1, sm.y + 42, sm.z), sm.clone()], 0xffe9a0);`));
  await L.shot(`${TAG}_abil`, 12);
  await L.close();
})();
