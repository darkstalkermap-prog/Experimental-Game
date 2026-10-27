// The circle on the ground that shows where the Ranger's volley will fall. While Q is held it follows the crosshair
// (green; amber when the spot is further than the volley reaches), and when the volley is loosed a fading copy stays
// where it was aimed, on every screen. The rings lie on the ground: each vertex is lifted to the ground height under it,
// so a circle on a slope or beside a wall follows the land instead of sinking into it. A glowing curtain stands round the
// rim so the circle can still be seen from low down and far off, where a flat ring is only a hairline.
import * as THREE from 'three';
import { CASTLE } from './config.js';
import { CASTLE_SITES } from './physics.js';

const SEG = 56;
const GOOD = new THREE.Color(0x8fe88a);
const FAR = new THREE.Color(0xffb347);

// a flat band between two radii (in the xz plane, centred on the origin), `rings` quads thick
function band(rIn, rOut, rings) {
  const pos = new Float32Array((rings + 1) * SEG * 3), idx = [];
  for (let j = 0; j <= rings; j++) {
    const r = rIn + ((rOut - rIn) * j) / rings;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const k = (j * SEG + i) * 3;
      pos[k] = Math.cos(a) * r; pos[k + 1] = 0; pos[k + 2] = Math.sin(a) * r;
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * SEG + i, b = j * SEG + ((i + 1) % SEG), c = (j + 1) * SEG + i, d = (j + 1) * SEG + ((i + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  return geo;
}

// a tall strip standing on the circle's rim: bottom row at the ground, top row above it
function curtain(r) {
  const pos = new Float32Array(2 * (SEG + 1) * 3), uv = new Float32Array(2 * (SEG + 1) * 2), idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    for (let j = 0; j < 2; j++) {
      const k = j * (SEG + 1) + i;
      pos[k * 3] = Math.cos(a) * r; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = Math.sin(a) * r;
      uv[k * 2] = i / SEG; uv[k * 2 + 1] = j;
    }
  }
  for (let i = 0; i < SEG; i++) { const a = i, b = i + 1, c = SEG + 1 + i, d = SEG + 2 + i; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// white at the foot of the curtain fading to black at the top (black adds nothing, so it simply fades out)
let fadeTex = null;
function fade() {
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#6a6a6a'); g.addColorStop(1, '#000000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  fadeTex = new THREE.CanvasTexture(c);
  return fadeTex;
}

export class AimRing {
  constructor(game) {
    this.g = game;
    this.main = this.make(true);
    this.main.group.visible = false;
    game.scene.add(this.main.group);
    this.flashes = [];
    this.pool = [];
  }

  // a ring set: the rim, a faint disc inside it and (for the live one) a beam so it can be seen from afar
  make(beam) {
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false });
    const group = new THREE.Group();
    const set = { group, r: 0, rim: null, disc: null, wall: null, beam: null, rimMat: mat(0.85), discMat: mat(0.18), wallMat: mat(0.55), beamMat: mat(0.22) };
    set.rimMat.depthTest = false;                       // the rim shows through grass, trunks and hills: you can always see where it will land
    set.wallMat.map = fade();
    set.rim = new THREE.Mesh(new THREE.BufferGeometry(), set.rimMat);
    set.disc = new THREE.Mesh(new THREE.BufferGeometry(), set.discMat);
    set.wall = new THREE.Mesh(new THREE.BufferGeometry(), set.wallMat);
    for (const m of [set.rim, set.disc, set.wall]) { m.frustumCulled = false; m.renderOrder = 6; group.add(m); }
    if (beam) {
      set.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.35, 16, 10, 1, true), set.beamMat);
      set.beam.position.y = 8;
      set.beam.renderOrder = 6;
      group.add(set.beam);
    }
    return set;
  }

  // lay a ring set on the ground around (x, y, z)
  place(set, at, r) {
    if (set.r !== r) {
      set.rim.geometry.dispose(); set.disc.geometry.dispose(); set.wall.geometry.dispose();
      set.rim.geometry = band(r - 0.8, r, 1);
      set.disc.geometry = band(0.02, r - 0.8, 4);
      set.wall.geometry = curtain(r);
      set.r = r;
    }
    set.group.position.set(at.x, 0, at.z);
    const phys = this.g.physics;
    const nearCastle = (x, z) => {
      for (const s of CASTLE_SITES) if (Math.abs(x - s.x) < CASTLE.H + 8 && Math.abs(z - s.z) < CASTLE.H + 8) return true;
      return false;
    };
    const height = (x, z) => (nearCastle(x, z) ? phys.groundHeight(x, z, at.y + 0.8) : phys.terrainHeight(x, z));
    for (const m of [set.rim, set.disc]) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, height(at.x + pos.getX(i), at.z + pos.getZ(i)) + 0.16);
      pos.needsUpdate = true;
    }
    const w = set.wall.geometry.attributes.position, n = SEG + 1;
    for (let i = 0; i < n; i++) {
      const h = height(at.x + w.getX(i), at.z + w.getZ(i));
      w.setY(i, h + 0.05);
      w.setY(n + i, h + 1.7);
    }
    w.needsUpdate = true;
    if (set.beam) set.beam.position.set(0, at.y + 8, 0);
  }

  tint(set, color, k = 1) {
    set.rimMat.color.copy(color); set.discMat.color.copy(color); set.wallMat.color.copy(color); set.beamMat.color.copy(color);
    set.rimMat.opacity = 0.85 * k; set.discMat.opacity = 0.18 * k; set.wallMat.opacity = 0.55 * k; set.beamMat.opacity = 0.22 * k;
  }

  // the live circle, every frame while Q is held
  show(at, r, far, t) {
    const s = this.main;
    s.group.visible = true;
    this.place(s, at, r);
    this.tint(s, far ? FAR : GOOD, 0.85 + 0.15 * Math.sin(t * 9));
    if (s.beam) s.beam.visible = true;
  }

  hide() { this.main.group.visible = false; }

  // a circle that stays a moment where a volley was aimed, then fades
  flash(at, r, life) {
    const s = this.pool.pop() || this.make(false);
    this.place(s, at, r);
    this.tint(s, GOOD, 1);
    s.group.visible = true;
    if (!s.group.parent) this.g.scene.add(s.group);
    this.flashes.push({ s, t: 0, life });
  }

  update(dt) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t >= f.life) {
        f.s.group.visible = false;
        this.pool.push(f.s);
        this.flashes.splice(i, 1);
        continue;
      }
      const k = 1 - f.t / f.life;
      this.tint(f.s, GOOD, k * (0.7 + 0.3 * Math.sin(f.t * 14)));
    }
  }
}
