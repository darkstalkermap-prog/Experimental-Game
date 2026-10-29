// Draws every soldier, horse and hero as INSTANCES of shared shapes instead of as meshes of their own. There is one InstancedMesh per
// (shape geometry, cast shadows or not): each frame the soldiers that can be seen write the world matrix of each of their parts (the
// joint Groups of the rig, see models.js) and their per-instance look (colours and flags) into the batch's buffers, so the draw cost
// scales with the number of different shapes in view and not with the number of soldiers.
//   near  (lod 0)  the rich shapes
//   mid   (lod 1)  plain shapes, animated
//   far   (lod 2)  one static model per kind of rig, no animation
// Soldiers closer than Q.crowdShadowDist cast shadows (near or mid), so the shadow pass scales with the shapes close by. They cast into
// the near shadow map only (see shadows.js), and a rich shape is drawn into it as its plainest version (a proxy that shares the batch's
// instance buffers): a silhouette needs no face.
// A soldier outside the view frustum costs nothing but the test. Rigs whose owner is not in the scene graph are updated here.
import * as THREE from 'three';
import { Q } from './quality.js';
import { shapeGeo } from './shapes.js';
import { unitMaterial, crowdDepthMaterial, crowdUniforms } from './unitmat.js';
import { farShapeOf, geoLevel, warmStep } from './models.js';
import { limitShadow, shadowProxy } from './shadows.js';

// the distances (metres) at which a soldier drops to the next level of detail, from the quality settings
const LOD = { near: 15, mid: 85, far: 260 };
export function lodLimits(out = LOD) {
  out.near = Q.crowdNear;
  out.mid = 85 * Q.lodScale;
  out.far = 260 * Q.lodScale;
  return out;
}

const _sphere = new THREE.Sphere(), _frustum = new THREE.Frustum(), _proj = new THREE.Matrix4();
const STATIC = ['position', 'normal', 'color', 'aSurf', 'aFx'];

class Batch {
  constructor(crowd, geo, open, shadow, plain = null) {
    this.crowd = crowd; this.geo = geo; this.open = open; this.shadow = shadow;
    this.plain = plain;   // the plainest version of the shape, which stands in for it in the shadow map (null: the shape itself casts)
    this.n = 0; this.cap = 0; this.mesh = null; this.proxy = null;
    this.grow(24);
  }

  grow(cap) {
    const old = this.mesh, oldProxy = this.proxy;
    const mat = new Float32Array(cap * 16), look = new Float32Array(cap * 16);
    if (old) { mat.set(this.mat.subarray(0, this.n * 16)); look.set(this.look.subarray(0, this.n * 16)); }
    this.mat = mat; this.look = look; this.cap = cap;
    const g = new THREE.BufferGeometry();
    for (const k of STATIC) g.setAttribute(k, this.geo.attributes[k]);
    g.setIndex(this.geo.index);
    const buf = new THREE.InstancedInterleavedBuffer(look, 16, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    ['iA', 'iB', 'iC', 'iD'].forEach((k, i) => g.setAttribute(k, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
    const mesh = new THREE.InstancedMesh(g, unitMaterial(this.open), 1);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = this.shadow && !this.plain;
    mesh.customDepthMaterial = crowdDepthMaterial();
    mesh.count = this.n;
    mesh.visible = false;
    this.buf = buf; this.mesh = mesh;
    const scene = this.crowd.scene;
    scene.add(limitShadow(scene, mesh));
    if (this.plain) {
      const pg = new THREE.BufferGeometry();
      for (const k of STATIC) pg.setAttribute(k, this.plain.attributes[k]);
      pg.setIndex(this.plain.index);
      ['iA', 'iB', 'iC', 'iD'].forEach((k, i) => pg.setAttribute(k, new THREE.InterleavedBufferAttribute(buf, 4, i * 4)));
      const proxy = new THREE.InstancedMesh(pg, unitMaterial(this.open), 1);
      proxy.instanceMatrix = mesh.instanceMatrix;
      proxy.customDepthMaterial = crowdDepthMaterial();
      proxy.count = this.n;
      this.proxy = proxy;
      scene.add(shadowProxy(scene, proxy));
    }
    if (old) { scene.remove(old); old.geometry.dispose(); old.dispose(); }
    if (oldProxy) { scene.remove(oldProxy); oldProxy.geometry.dispose(); oldProxy.dispose(); }
  }

  push(e, inst) {
    if (this.n === this.cap) this.grow(this.cap * 2);
    const o = this.n++ * 16, mat = this.mat;
    for (let i = 0; i < 16; i++) mat[o + i] = e[i];
    this.look.set(inst, o);
  }

  end(cast) {
    const mesh = this.mesh, n = this.n, proxy = this.proxy;
    mesh.visible = n > 0;
    if (!n) { mesh.count = 0; if (proxy) { proxy.count = 0; proxy.userData.on = false; } return; }
    mesh.count = n;
    mesh.castShadow = this.shadow && cast && !proxy;
    if (proxy) { proxy.count = n; proxy.userData.on = this.shadow && cast; }
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    this.buf.clearUpdateRanges(); this.buf.addUpdateRange(0, n * 16); this.buf.needsUpdate = true;
  }
}

export class Crowd {
  constructor(scene) {
    this.scene = scene;
    this.byGeo = new Map();
    this.list = [];
    this.time = 0;
    this.stats = { instances: 0, batches: 0 };
  }

  batchFor(geo, open, shadow, shape = null, level = 2) {
    let pair = this.byGeo.get(geo);
    if (!pair) { pair = [null, null]; this.byGeo.set(geo, pair); }
    const k = shadow ? 1 : 0;
    if (!pair[k]) { pair[k] = new Batch(this, geo, open, shadow, shadow && shape && level < 2 ? shapeGeo(shape, 2) : null); this.list.push(pair[k]); }
    return pair[k];
  }

  // all the parts of one rig at a level of detail, their joints' matrices already up to date
  addRig(rig, level, cast) {
    const parts = rig.parts, inst = rig.inst;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      this.batchFor(shapeGeo(p.shape, level), p.shape.open, cast, p.shape, level).push(p.node.matrixWorld.elements, inst);
    }
  }

  addFar(rig) {
    rig.body.updateWorldMatrix(true, false);
    const f = farShapeOf(rig);
    this.batchFor(f.geo[3], true, false).push(rig.body.matrixWorld.elements, rig.inst);
  }

  // Draw what can be seen. `lod` of a unit was chosen by the game (0 near, 1 mid, 2 far, 3 hidden).
  update(game, dt) {
    const cam = game.camera;
    cam.updateMatrixWorld();
    _proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_proj);
    this.time += dt;
    crowdUniforms.uTime.value = this.time;
    crowdUniforms.uWind.value = Q.wind ? 1 : 0;
    const cast = !!(Q.shadows && Q.crowdShadowDist > 0 && game.lights && game.lights.sun.castShadow);
    const sd2 = Q.crowdShadowDist * Q.crowdShadowDist, cp = cam.position;
    for (const b of this.list) b.n = 0;
    const units = game.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i], m = u.model;
      if (!m || u.lod > 2) continue;
      const r = (u.mounted ? 2.4 : Math.max(1.5, u.height * 0.62)) + 1.4;
      _sphere.center.set(u.pos.x, u.pos.y + u.height * 0.5, u.pos.z);
      _sphere.radius = r;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const mesh = u.mesh;
      if (u.lod === 2) {
        this.addFar(m);
        if (u.horse) this.addFar(u.horse);
      } else {
        mesh.updateMatrixWorld(true);
        const level = geoLevel(u.lod), c = cast && (u.pos.x - cp.x) ** 2 + (u.pos.z - cp.z) ** 2 < sd2;
        this.addRig(m, level, c);
        if (u.horse) this.addRig(u.horse, level, c);
      }
    }
    const lim = lodLimits();
    for (const h of game.humans) {
      if (h.body && h.alive !== undefined) this.addHero(h, h.body, h.mounted ? 2.4 : 1.9, lim, cast, game);
      if (h.horse) this.addHero(h, h.horse, 2.6, lim, cast, game);
    }
    let n = 0, nb = 0, tris = 0, shadowBatches = 0, shadowTris = 0;
    for (const b of this.list) {
      b.end(cast);
      n += b.n;
      if (b.n) { nb++; const t = b.n * (b.geo.index.count / 3); tris += t; if (b.shadow) { shadowBatches++; shadowTris += t; } }
    }
    this.stats.instances = n; this.stats.batches = nb; this.stats.tris = Math.round(tris); this.stats.shadowBatches = shadowBatches; this.stats.shadowTris = Math.round(shadowTris);
    warmStep();
  }

  // another person's hero (or a bot) and its horse: a rig that lives in the scene graph under the player
  addHero(h, rig, radius, lim, cast, game) {
    const root = rig.root;
    if (!root.visible) return;
    const p = root.position, cp = game.camera.position;
    _sphere.center.set(p.x, p.y + 1, p.z);
    _sphere.radius = radius + 1.4;
    if (!_frustum.intersectsSphere(_sphere)) return;
    const d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2;
    const lod = d2 < lim.near * lim.near ? 0 : d2 < lim.mid * lim.mid ? 1 : d2 < lim.far * lim.far ? 2 : 3;
    if (lod === 3) return;
    if (lod === 2) { this.addFar(rig); return; }
    root.updateMatrixWorld(true);
    this.addRig(rig, geoLevel(lod), cast && d2 < Q.crowdShadowDist * Q.crowdShadowDist);
  }

  dispose() {
    for (const b of this.list) {
      this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose();
      if (b.proxy) { this.scene.remove(b.proxy); b.proxy.geometry.dispose(); b.proxy.dispose(); }
    }
    this.list.length = 0;
    this.byGeo.clear();
  }
}
