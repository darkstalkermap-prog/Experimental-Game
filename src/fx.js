// GPU point-sprite particles: dust, blood, smoke, sparks, splinters. One draw call.
import * as THREE from 'three';

const MAX = 3000;

export class FX {
  constructor(scene, additive = false) {
    this.glow = additive ? null : new FX(scene, true); // glowing layer for fire, frost and sparks
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.baseA = new Float32Array(MAX);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vCol; uniform float scale;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vCol; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d);
          if (r > 0.25) discard; float a = vCol.a * smoothstep(0.25, 0.05, r); gl_FragColor = vec4(vCol.rgb, a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  setScale(h) { this.points.material.uniforms.scale.value = h * 0.7; if (this.glow) this.glow.setScale(h); }

  emit(p, v, color, size, life, { grow = 0, grav = 0, alpha = 1 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b; this.col[i * 4 + 3] = alpha;
    this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.grow[i] = grow; this.grav[i] = grav; this.baseA[i] = alpha;
  }

  burst(p, n, color, speed, size, life, opts) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(speed);
      this.emit(p, v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), opts);
    }
  }

  blood(p, n = 8) { this.burst(p, n, C.blood, 2.5, 0.18, 0.6, { grav: 9 }); }
  sparks(p, n = 10) { this.burst(p, n, C.spark, 5, 0.08, 0.35, { grav: 6 }); }
  dust(p, n = 10, spread = 2) {
    const q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      q.set(p.x + (Math.random() - 0.5) * spread * 2, p.y + Math.random() * spread, p.z + (Math.random() - 0.5) * spread * 2);
      this.emit(q, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2), C.dust, 1.2 + Math.random() * 1.5, 1.6 + Math.random(), { grow: 1.5, alpha: 0.55 });
    }
  }
  splinters(p, n = 8) { this.burst(p, n, C.wood, 4, 0.14, 0.7, { grav: 12 }); }
  smoke(p) {
    this.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.5 + Math.random(), (Math.random() - 0.5) * 0.6), C.smoke, 2.5, 4 + Math.random() * 2, { grow: 1.2, alpha: 0.45 });
    if (Math.random() < 0.5) this.emit(p, new THREE.Vector3((Math.random() - 0.5), 3, (Math.random() - 0.5)), C.fire, 1.2, 0.6, { grow: -1, alpha: 0.9 });
  }
  gold(p) { this.burst(p, 8, C.gold, 2, 0.15, 0.8, { grav: 4 }); }

  stomp(p) { this.burst(p, 10, C.dust, 3, 1.2, 1.2, { grow: 1.2, alpha: 0.4 }); }
  thud(p) { this.burst(p, 4, C.dust, 1.6, 0.4, 0.55, { grav: 3, alpha: 0.65 }); }   // an arrow driving into the ground

  // --- magic ---
  fireTrail(p) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
    this.glow.emit(p, v, C.fire, 0.55 + Math.random() * 0.35, 0.35, { grow: -1.2, alpha: 0.9 });
    if (Math.random() < 0.4) this.emit(p, v.clone().multiplyScalar(0.5), C.smoke, 0.5, 0.8, { grow: 0.8, alpha: 0.3 });
  }
  explosion(p, r = 3.5) {
    this.glow.burst(p, 40, C.fire, r * 2.2, 0.7, 0.5, { grow: -0.8, alpha: 1 });
    this.glow.burst(p, 14, C.flame, r * 1.1, 1.0, 0.35, { grow: 1.2, alpha: 0.75 });
    this.burst(p, 10, C.smoke, r * 0.7, 1.0, 1.6, { grow: 1.0, alpha: 0.25 });
    this.sparks(p, 16);
  }
  frostTrail(p) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
    this.glow.emit(p, v, C.frost, 0.3 + Math.random() * 0.2, 0.4, { grow: -0.5, alpha: 0.8 });
  }
  frost(p, n = 14) { this.glow.burst(p, n, C.frost, 3, 0.25, 0.6, { grav: 3, alpha: 0.9 }); }
  zap(p, n = 10) { this.glow.burst(p, n, C.bolt, 4, 0.2, 0.3, { alpha: 1 }); }
  orb(p, color, size) { this.glow.emit(p, new THREE.Vector3(0, 0.3, 0), color, size, 0.12, { grow: -size * 4, alpha: 0.9 }); }
  // a ring of glowing motes on the ground around p; speed pushes them outward, up lifts them
  ring(p, r, color, n = 28, { up = 0.8, speed = 0, size = 0.35, life = 0.6 } = {}) {
    const q = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      q.set(p.x + Math.cos(a) * r, p.y + 0.15, p.z + Math.sin(a) * r);
      v.set(Math.cos(a) * speed, up + Math.random() * 0.6, Math.sin(a) * speed);
      this.glow.emit(q, v, color, size * (0.7 + Math.random() * 0.6), life * (0.8 + Math.random() * 0.4), { alpha: 0.9 });
    }
  }

  // a hero reaches a new level: a golden ring that rises round them, and sparks
  levelUp(p) {
    const c = C.level;
    const q = new THREE.Vector3(p.x, p.y, p.z);
    for (let i = 0; i < 4; i++) { q.y = p.y + 0.1 + i * 0.55; this.ring(q, 0.9 + i * 0.12, c, 24, { up: 2.2, speed: 0.6, size: 0.4, life: 0.9 }); }
    this.glow.burst(new THREE.Vector3(p.x, p.y + 1, p.z), 26, c, 3, 0.22, 0.9, { grav: -1, alpha: 1 });
  }

  update(dt) {
    if (this.glow) this.glow.update(dt);
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.01, this.size[i] + this.grow[i] * dt);
      this.col[i * 4 + 3] = this.baseA[i] * Math.min(1, this.life[i] / this.maxLife[i] * 2);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

const C = {
  blood: new THREE.Color(0.45, 0.02, 0.02),
  spark: new THREE.Color(1.0, 0.85, 0.4),
  dust: new THREE.Color(0.62, 0.57, 0.5),
  wood: new THREE.Color(0.45, 0.3, 0.16),
  smoke: new THREE.Color(0.18, 0.17, 0.16),
  fire: new THREE.Color(1.0, 0.5, 0.12),
  gold: new THREE.Color(1.0, 0.82, 0.25),
  flame: new THREE.Color(1.0, 0.78, 0.35),
  frost: new THREE.Color(0.55, 0.85, 1.0),
  bolt: new THREE.Color(0.75, 0.9, 1.0),
  level: new THREE.Color(1.0, 0.86, 0.35),
};
