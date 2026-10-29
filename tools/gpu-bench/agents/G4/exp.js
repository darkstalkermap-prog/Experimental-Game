// G4 experiments on the fixed scene (the three cameras of fixed.js): each variant is applied on its own, measured (median of N steady frames per view, mean of
// the three views) and undone. Variants swap materials / hide things in the page, so one page load answers many questions.
// usage: CW_PORT=<port> node exp.js <quality> <variant,variant,...> [frames=5] [WxH=1280x720]
const { chromium } = require('playwright');
const QUALITY = process.argv[2] || 'high';
const WANT = (process.argv[3] || 'base').split(',');
const NF = Number(process.argv[4] || 5);
const [W, H] = (process.argv[5] || '1280x720').split('x').map(Number);
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    let n = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
    let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await ctx.addInitScript(([m, q]) => { try { localStorage.setItem('cw-map', m); localStorage.setItem('cw-quality', q); } catch (e) {} }, ['small', QUALITY]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.text().startsWith('ROW ')) { console.log(m.text().slice(4)); return; } if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); if (m.type() === 'warning' && /THREE\.WebGLProgram|shader|GLSL/i.test(m.text())) errors.push('warn: ' + m.text().slice(0, 600)); });
  await page.goto('http://localhost:' + process.env.CW_PORT + '/', { timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(async ([want, NF]) => {
    const THREE = await import('three');
    const { Q } = await import('/src/quality.js');
    const tm = await import('/src/terrainmat.js');
    const tt = await import('/src/terraintex.js');
    const g0 = window.__game, R = g0.renderer;
    if (g0.audio) { g0.audio.init = g0.audio.startMusic = g0.audio.play = () => {}; }
    document.getElementById('play').click();
    const g = window.__game; g.paused = false;
    g.player.buffs.add('ghost', 1e6);
    g.phaseT = 1e6;
    for (let i = 0; i < 120; i++) { g.update(0.05); g.input.endFrame(); }
    const gl = R.getContext(), px = new Uint8Array(4);
    const draw = () => window.__gfx.renderFrame(0);
    const med = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };
    const me = g.player, c0 = g.castles[me.team], sz = Math.sign(c0.center.z || 1);
    const dx = c0.center.x / (Math.hypot(c0.center.x, c0.center.z) || 1), dz = c0.center.z / (Math.hypot(c0.center.x, c0.center.z) || 1);
    const views = {
      castle: [c0.gateOut.x - dx * 38, c0.gateOut.z - dz * 38, Math.atan2(dx, dz), -0.05, 1.7],
      field: [0, 60 * sz, sz > 0 ? Math.PI : 0, -0.04, 1.7],
      sun: [-10, 20, 2.4, 0.05, 2.5],
    };
    const place = ([x, z, yaw, pitch, h]) => {
      me.pos.set(x, 0, z); me.vel.set(0, 0, 0); me.yaw = yaw; me.pitch = pitch;
      me.pos.y = g.physics.groundHeight(x, z, 30) + h - 1.7; me.alive = true; me.hp = me.maxHp;
      for (let i = 0; i < 3; i++) { g.update(1e-4); g.input.endFrame(); }
    };
    const measure = (label) => {
      const res = {};
      for (const [name, v] of Object.entries(views)) {
        place(v);
        draw(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t = [];
        for (let i = 0; i < NF; i++) { const a = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
        res[name] = Math.round(med(t));
      }
      res.mean = Math.round((res.castle + res.field + res.sun) / 3);
      res.label = label; res.calls = R.info.render.calls; res.tris = R.info.render.triangles; res.programs = R.info.programs ? R.info.programs.length : 0;
      return res;
    };
    const hideBy = (pred) => { const hid = []; g.scene.traverse((o) => { if (o.visible && pred(o)) { o.visible = false; hid.push(o); } }); return () => { for (const o of hid) o.visible = true; }; };
    const own = (name) => (o) => o.userData && o.userData.owner === name;
    const terr = g.scene.children.find((o) => o.userData && o.userData.owner === 'a3 terrain');
    const terrMeshes = []; terr.traverse((o) => { if (o.isMesh) terrMeshes.push(o); });
    const swapTerrain = (mat) => { const prev = terrMeshes.map((m) => m.material); for (const m of terrMeshes) m.material = mat; return () => { terrMeshes.forEach((m, i) => { m.material = prev[i]; }); }; };
    const terrain = g.scene.userData.worldSystems.find((o) => o.isTerrain);
    const farRings = (keep) => {
      const prev = terrain.far.map((m) => [m.geometry.drawRange.start, m.geometry.drawRange.count]);
      terrain.far.forEach((m) => {
        const side = m.userData.far; let n = 0;
        terrain.rings.forEach((r, k) => {
          if (k >= keep) return;
          const c = r.c, a = r.a, b = r.b;
          const w = side === 'N' || side === 'S' ? 2 * b : b - a, d = side === 'N' || side === 'S' ? b - a : 2 * a;
          n += (w / c) * (d / c) * 6;
        });
        m.geometry.setDrawRange(0, n);
      });
      return () => { terrain.far.forEach((m, i) => m.geometry.setDrawRange(prev[i][0], prev[i][1])); };
    };
    const cur = terrMeshes[0].material;   // the splat material in use
    const grassMeshes = [], foliageMeshes = [];
    g.scene.traverse((o) => { if (o.isMesh && o.userData.owner === 'a3 grass') grassMeshes.push(o); });
    const fol = g.scene.userData.worldSystems.find((s) => s.near && s.cards);
    fol.group.traverse((o) => { if (o.isMesh && o.visible) foliageMeshes.push(o); });
    const setRecv = (list, v) => { const prev = list.map((m) => m.receiveShadow); for (const m of list) m.receiveShadow = v; return () => { list.forEach((m, i) => { m.receiveShadow = prev[i]; }); }; };
    const swapMat = (list, make) => { const prev = list.map((m) => m.material); const cache = new Map(); for (const m of list) { if (!cache.has(m.material)) cache.set(m.material, make(m.material)); m.material = cache.get(m.material); } return () => { list.forEach((m, i) => { m.material = prev[i]; }); }; };
    const vertOnly = (list) => {
      const was = R.getScissorTest();
      const prev = list.map((m) => [m.onBeforeRender, m.onAfterRender]);
      for (const m of list) { m.onBeforeRender = (r) => { r.setScissorTest(true); r.setScissor(0, 0, 0, 0); }; m.onAfterRender = (r) => { r.setScissorTest(was); }; }
      return () => { list.forEach((m, i) => { m.onBeforeRender = prev[i][0]; m.onAfterRender = prev[i][1]; }); R.setScissorTest(was); };
    };
    const derived = (Cls, edit, key, params = {}) => {
      const m = new Cls(params);
      m.onBeforeCompile = (shader, r) => { cur.onBeforeCompile(shader, r); if (edit) edit(shader); };
      m.customProgramCacheKey = () => key;
      return m;
    };
    const fr = (s, a, b) => { if (!s.includes(a)) throw new Error('no match: ' + a.slice(0, 40)); return s.replace(a, b); };
    const V = {
      base: () => () => {},
      tHidden: () => hideBy(own('a3 terrain')),
      tFlat: () => swapTerrain(tm.terrainMaterial(0)),
      tLambert: () => swapTerrain(derived(THREE.MeshLambertMaterial, null, 'tLambert')),
      // pieces of the splat shader (anchors of the restructured shader)
      sNoCanopy: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(s.fragmentShader, 'if (canopy > 0.002) {   // (only', 'if (false) {   // (only'); }, 'sNoCanopy', { roughness: 0.97, metalness: 0 })),
      sNoRock: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(s.fragmentShader, 'if (rockW > 0.003) {   // (flat', 'if (false) {   // (flat'); }, 'sNoRock', { roughness: 0.97, metalness: 0 })),
      sNoD: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(fr(s.fragmentShader, 'd1 = texture2D(uDetail, p * 0.43);', 'd1 = vec4(0.5);'), 'd2 = texture2D(uDetail, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.117 + vec2(0.37, 0.11));', 'd2 = vec4(0.5);'); }, 'sNoD', { roughness: 0.97, metalness: 0 })),
      sNoN: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(fr(fr(s.fragmentShader, 'n2 = texture2D(uNoise, p * 0.021 + vec2(0.57, 0.29));', 'n2 = vec4(0.5);'), 'n3 = texture2D(uNoise, p * 0.083 + vec2(0.31, 0.93));', 'n3 = vec4(0.5);'), 'peb = texture2D(uNoise, p * 0.9).a;', 'peb = 0.3;'); }, 'sNoN', { roughness: 0.97, metalness: 0 })),
      sAniso1: () => { const texs = [tt.detailTexture(), tt.noiseTexture()]; const prev = texs.map((t) => t.anisotropy); for (const t of texs) { t.anisotropy = 1; t.needsUpdate = true; } return () => { texs.forEach((t, i) => { t.anisotropy = prev[i]; t.needsUpdate = true; }); }; },
      // the lit path of the terrain: no diffuse sky lookup at all / no specular terms (direct GGX, DFG, multiscatter) with the lookup kept
      tNoIBL: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(s.fragmentShader, '#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += vec3(1.2);')); }, 'tNoIBL', { roughness: 0.97, metalness: 0 })),
      tNoSpec: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => {
        s.fragmentShader = fr(s.fragmentShader, '#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_T( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
  reflectedLight.directDiffuse += dotNL * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_T( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += material.diffuseColor * irradiance * RECIPROCAL_PI;
}
#undef RE_Direct
#undef RE_IndirectSpecular
#define RE_Direct RE_Direct_T
#define RE_IndirectSpecular RE_IndirectSpecular_T`);
      }, 'tNoSpec', { roughness: 0.97, metalness: 0 })),
      tNoFog: () => { const m = derived(THREE.MeshStandardMaterial, null, 'tNoFog', { roughness: 0.97, metalness: 0 }); m.fog = false; return swapTerrain(m); },
      tNoBump: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(s.fragmentShader, 'normal = normalize(abs(det) * normal - grad * 0.8);', ''); }, 'tNoBump', { roughness: 0.97, metalness: 0 })),
      tNoRoad: () => swapTerrain(derived(THREE.MeshStandardMaterial, (s) => { s.fragmentShader = fr(s.fragmentShader, 'if (max(abs(p.x), abs(p.y)) < uRoadExt) {', 'if (false) {'); }, 'tNoRoad', { roughness: 0.97, metalness: 0 })),
      tNoRecv: () => { const prev = terrMeshes.map((m) => m.receiveShadow); for (const m of terrMeshes) m.receiveShadow = false; return () => { terrMeshes.forEach((m, i) => { m.receiveShadow = prev[i]; }); }; },
      // the far landscape with only its first k rings drawn (the strips of a side are in ring order in its index)
      tFarK3: () => farRings(3), tFarK4: () => farRings(4), tFarK5: () => farRings(5),
      tLast: () => { const prev = terrMeshes.map((m) => m.renderOrder); for (const m of terrMeshes) m.renderOrder = 500; return () => { terrMeshes.forEach((m, i) => { m.renderOrder = prev[i]; }); }; },
      tFirst: () => { const prev = terrMeshes.map((m) => m.renderOrder); for (const m of terrMeshes) m.renderOrder = -500; return () => { terrMeshes.forEach((m, i) => { m.renderOrder = prev[i]; }); }; },
      tChunks: () => hideBy((o) => o.userData && o.userData.chunk),
      tFar: () => hideBy((o) => o.userData && o.userData.far),
      // scissor trick: the vertices of a set of meshes are processed but every fragment is clipped away
      sky: () => hideBy((o) => o.name === 'sky'),
      skyAniso1: () => { const t = g.scene.userData.atmosphere.sky.material.uniforms.tNoise.value; const k = t.anisotropy; t.anisotropy = 1; t.needsUpdate = true; return () => { t.anisotropy = k; t.needsUpdate = true; }; },
      skyNoCirrus: () => { const m = g.scene.userData.atmosphere.sky.material; const k = Q.clouds; Q.clouds = 1; g.scene.userData.atmosphere.update(0); return () => { Q.clouds = k; g.scene.userData.atmosphere.update(0); }; },
      gNoRecv: () => setRecv(grassMeshes, false),
      gHalf: () => { const prev = grassMeshes.map((m) => m.geometry.instanceCount); grassMeshes.forEach((m) => { m.geometry.instanceCount = prev.length ? Math.floor(m.geometry.instanceCount / 2) : 0; }); return () => { grassMeshes.forEach((m, i) => { m.geometry.instanceCount = prev[i]; }); }; },
      gVert: () => vertOnly(grassMeshes),
      gLambert: () => swapMat(grassMeshes, (m) => { const d = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); d.onBeforeCompile = (s, r) => m.onBeforeCompile(s, r); d.customProgramCacheKey = () => 'gLambert' + m.id; return d; }),
      fNoRecv: () => setRecv(foliageMeshes, false),
      fVert: () => vertOnly(foliageMeshes),
      fCards: () => hideBy((o) => o === fol.cards),
      fNear: () => hideBy((o) => fol.near.includes(o)),
      fMid: () => hideBy((o) => fol.mid.includes(o)),
      fRocks: () => hideBy((o) => fol.rocks.includes(o)),
      sky1: () => { const k = Q.clouds; Q.clouds = 1; g.scene.userData.atmosphere.update(0); return () => { Q.clouds = k; g.scene.userData.atmosphere.update(0); }; },
      sky0: () => { const k = Q.clouds; Q.clouds = 0; g.scene.userData.atmosphere.update(0); return () => { Q.clouds = k; g.scene.userData.atmosphere.update(0); }; },
      grass: () => hideBy(own('a3 grass')),
      foliage: () => hideBy(own('a3 foliage')),
      fx: () => hideBy((o) => /^fx-/.test(o.name || '') || o.isPoints),
    };
    // the order the opaque objects are drawn in (main pass): [label, material id]
    const dumpOrder = () => {
      const orig = R.renderBufferDirect.bind(R), seq = [];
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        const lab = (object.userData && (object.userData.owner || (object.userData.chunk && 'chunk') || (object.userData.far && 'far'))) || object.name || (object.isInstancedMesh ? 'inst:' + (geometry.index ? geometry.index.count / 3 : '?') : object.type);
        seq.push(lab + '#' + material.id + (material.transparent ? 't' : ''));
        return orig(camera, scene, geometry, material, object, group);
      };
      draw();
      R.renderBufferDirect = orig;
      console.log('ROW ' + JSON.stringify({ label: 'order', n: seq.length, seq: seq.join(' ') }));
    };
    const done = [];
    const run = (name) => {
      let undo;
      try { undo = V[name](); } catch (e) { console.log('ROW ' + JSON.stringify({ label: name, error: String(e.message || e).slice(0, 120) })); return; }
      try { const r = measure(name); console.log('ROW ' + JSON.stringify(r)); } catch (e) { console.log('ROW ' + JSON.stringify({ label: name, error: String(e.message || e).slice(0, 120) })); }
      try { undo(); } catch (e) { /* ignore */ }
    };
    if (want.includes('order')) { place(views.field); dumpOrder(); want.splice(want.indexOf('order'), 1); }
    const list = want.slice();
    if (list[0] !== 'base') list.unshift('base');
    for (const n of list) { if (!V[n]) { console.log('ROW ' + JSON.stringify({ label: n, error: 'unknown' })); continue; } run(n); }
    run('base');
  }, [WANT, NF]);
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error('RUN ERROR', e.message); process.exit(2); });
