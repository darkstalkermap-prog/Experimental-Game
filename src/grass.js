// Grass that grows around the camera: instanced blade clumps swaying in the wind.
// The patch is rebuilt (deterministically, so it doesn't flicker) when the camera moves far enough.
import * as THREE from 'three';
import { CASTLE } from './config.js';
import { CASTLE_SITES } from './physics.js';
import { roadDist } from './world.js';

const SPACING = 0.62;

function hash(x, z, s) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function bladeGeometry() {
  // three crossed blades, each a tapered quad bending slightly forward
  const pos = [], col = [], idx = [];
  const base = new THREE.Color(0x3d5a1e), tip = new THREE.Color(0xa8b860);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI;
    const cx = Math.cos(a), cz = Math.sin(a);
    const w = 0.09, h = 0.55 + b * 0.08;
    const o = pos.length / 3;
    const pts = [[-w, 0, 0], [w, 0, 0], [-w * 0.35, h * 0.6, 0.04], [w * 0.35, h * 0.6, 0.04], [0, h, 0.12]];
    for (const [x, y, z] of pts) {
      pos.push(x * cx - z * cz, y, x * cz + z * cx);
      const c = base.clone().lerp(tip, y / h);
      col.push(c.r, c.g, c.b);
    }
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // point normals up so blades shade like the ground beneath them
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export class Grass {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.radius = 44;
    this.max = 0;
    this.mesh = null;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.uniforms = { time: { value: 0 } };
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.time = this.uniforms.time;
      shader.vertexShader = 'uniform float time;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float sway = sin(time * 1.8 + ip.x * 0.35 + ip.y * 0.21) * 0.5 + sin(time * 3.1 + ip.x * 0.9) * 0.2;
        float k = position.y * position.y;
        transformed.x += sway * k * 0.35;
        transformed.z += sway * k * 0.2;`,
      );
    };
    this.geo = bladeGeometry();
  }

  setDensity(level) {
    // level: 0 off, 1 medium, 2 high
    const max = [0, 9000, 20000][level];
    this.radius = [0, 34, 46][level];
    if (max === this.max) return;
    this.max = max;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); this.mesh = null; }
    if (!max) return;
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.stageMat = null; this.stageCol = null; this.job = null;
    this.scene.add(this.mesh);
    this.center.set(1e9, 1e9);
  }

  allowed(x, z) {
    for (const s of CASTLE_SITES) {
      const d = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      if (d < CASTLE.H + 9) return false;
    }
    if (roadDist(x, z) < 3.2) return false;
    if (Math.hypot(x, z) < 17) return false;
    return true;
  }

  // Rebuilding is spread over several frames (a small time budget each) into a staging buffer,
  // then swapped in, so walking never causes a hitch.
  startRebuild(cx, cz) {
    const R = this.radius;
    this.job = {
      cx, cz, n: 0,
      i: Math.floor((cx - R) / SPACING), i1: Math.floor((cx + R) / SPACING),
      j0: Math.floor((cz - R) / SPACING), j1: Math.floor((cz + R) / SPACING),
      mat: this.stageMat || (this.stageMat = new Float32Array(this.max * 16)),
      col: this.stageCol || (this.stageCol = new Float32Array(this.max * 3)),
    };
  }

  work(budgetMs) {
    const job = this.job;
    if (!job) return;
    const t0 = performance.now();
    const m4 = this.tmpM || (this.tmpM = new THREE.Matrix4());
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const R = this.radius;
    const { fbm } = this.physics.noise;
    const { cx, cz } = job;
    for (; job.i <= job.i1; job.i++) {
      if (performance.now() - t0 > budgetMs) return;
      const i = job.i;
      for (let j = job.j0; j <= job.j1 && job.n < this.max; j++) {
        const x = (i + hash(i, j, 1)) * SPACING, z = (j + hash(i, j, 2)) * SPACING;
        const d = Math.hypot(x - cx, z - cz);
        if (d > R) continue;
        const dens = fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.62;
        if (hash(i, j, 3) > dens) continue;
        if (!this.allowed(x, z)) continue;
        const y = this.physics.terrainHeight(x, z);
        const edge = Math.min(1, (R - d) / 8); // shrink toward the rim so the patch has no hard edge
        const s = (0.55 + hash(i, j, 4) * 0.45) * edge;
        p.set(x, y - 0.02, z);
        q.setFromAxisAngle(up, hash(i, j, 5) * Math.PI * 2);
        sc.set(s * 1.25, s * (0.55 + hash(i, j, 6) * 0.45), s * 1.25);
        m4.compose(p, q, sc);
        m4.toArray(job.mat, job.n * 16);
        const v = 0.8 + hash(i, j, 7) * 0.35;
        job.col[job.n * 3] = v; job.col[job.n * 3 + 1] = v * (0.95 + hash(i, j, 8) * 0.1); job.col[job.n * 3 + 2] = v * 0.85;
        job.n++;
      }
    }
    // finished: swap the new patch in
    this.mesh.instanceMatrix.array.set(job.mat.subarray(0, job.n * 16));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.mesh.instanceColor) this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.array.set(job.col.subarray(0, job.n * 3));
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = job.n;
    this.job = null;
  }

  update(dt, camPos) {
    this.uniforms.time.value += dt;
    if (!this.mesh) return;
    if (!this.job && Math.hypot(camPos.x - this.center.x, camPos.z - this.center.y) > this.radius * 0.3) {
      const first = this.center.x > 1e8;
      this.center.set(camPos.x, camPos.z);
      this.startRebuild(camPos.x, camPos.z);
      if (first) this.work(Infinity); // the very first patch appears at once
    }
    this.work(1.5);
  }
}
