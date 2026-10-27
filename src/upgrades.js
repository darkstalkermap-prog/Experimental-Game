// What a castle's upgrades look like. Every level of walls, gate, towers, barracks and elite levies changes the
// castle in a way you can see from across the field: buttresses, iron bands, dressed stone, spikes, archers on the
// towers, racks of arms along the walls, standards by the keep. The pieces are merged into a handful of meshes and
// rebuilt only when a level changes (or a wall falls or is rebuilt).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { CASTLE } from './config.js';
import { box } from './materials.js';
import { buildSoldier, poseSoldier, bakedMesh, unitMaterial } from './models.js';

const { H, wallH, wallT: T, gateW, gateH, towerH, towerR, towerOff } = CASTLE;
const GW = gateW / 2;
const TC = H + towerOff;
const F1 = TC + towerR;

const ARCHER_GEO = new Map();   // the baked archer on the tower roof, one per house

// How far the wall's stone reaches out beyond its old face at each wall level (the wall collider grows with it).
export const WALL_EXT = [0, 0.5, 0.7, 1.05];

// a box from ranges (any order)
function bx(list, xa, xb, y0, y1, za, zb, tex = 3) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  const g = box(x1 - x0, y1 - y0, z1 - z0, tex);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  list.push(g);
}

export class Upgrades {
  constructor(castle) {
    this.c = castle;
    this.M = castle.mats;
    this.shown = null;               // the levels on show
    this.wallMeshes = [];
    this.gateDecor = [];
    this.towerMeshes = [];
    this.rackMeshes = [];
    this.standardMeshes = [];
    this.flames = [];
    this.wallDirty = false;
    this.mats = {
      fine: this.M.stoneFine,
      ember: new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      emberHot: new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
  }

  // levels: { wall, gate, tower, barracks, levies }. Returns the aspects that changed (all of them the first time).
  update(levels) {
    const was = this.shown;
    const changed = [];
    for (const k of Object.keys(levels)) if (!was || was[k] !== levels[k]) changed.push(k);
    if (!changed.length) return changed;
    this.shown = { ...levels };
    if (changed.includes('wall')) this.rebuildWalls();
    if (changed.includes('gate')) this.rebuildGate();
    if (changed.includes('tower')) this.rebuildTowers();
    if (changed.includes('barracks')) this.rebuildRacks();
    if (changed.includes('levies')) this.rebuildStandards();
    return was ? changed : [];
  }

  // a wall fell or was rebuilt: its stone goes or comes back with it
  wallsChanged() { this.wallDirty = true; }

  tick(dt, time) {
    if (this.wallDirty) { this.wallDirty = false; this.rebuildWalls(); }
    const fx = this.c.game.fx;
    for (const f of this.flames) {
      const k = 1 + Math.sin(time * 11 + f.phase) * 0.14 + Math.sin(time * 23 + f.phase * 2) * 0.07;
      f.mesh.scale.set(k * 0.9, k * 1.15, k * 0.9);
      if (f.pos && fx && Math.random() < dt * 9) fx.fireTrail(f.pos);   // sparks and smoke rise from the braziers
    }
  }

  clear(list) {
    for (const m of list) { this.c.group.remove(m); m.geometry.dispose(); }
    list.length = 0;
  }

  add(list, geos, material, parent = this.c.group, castShadow = true) {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    list.push(m);
    return m;
  }

  // ---------------------------------------------------------------- walls
  // Level 1: a stone plinth and buttresses. 2: taller plinth, buttresses to the parapet, iron bands. 3: the whole
  // outer face dressed in new, paler stone with corbels, iron-banded pilasters and a crest on every wall.
  rebuildWalls() {
    const c = this.c, L = c.wallLevel, M = this.M;
    this.clear(this.wallMeshes);
    this.growWallColliders();
    if (!L) return;
    const dark = [], iron = [], fine = [], disc = [], ring = [];
    const ext = WALL_EXT[L];
    for (const seg of c.walls) {
      if (seg.breakable && !seg.alive) continue;
      const half = T / 2, len = seg.len;
      // a box in the wall's own terms: u along it, y up, o outward from its old face
      const wall = (list, u0, u1, y0, y1, o0, o1) => {
        if (seg.alongX) bx(list, seg.lx + u0, seg.lx + u1, y0, y1, seg.lz + seg.nz * (half + o0), seg.lz + seg.nz * (half + o1));
        else bx(list, seg.lx + seg.nx * (half + o0), seg.lx + seg.nx * (half + o1), y0, y1, seg.lz + u0, seg.lz + u1);
      };
      let u0 = -len / 2, u1 = len / 2;
      if (seg.nz === 1) { if (seg.lx > 0) u0 += 0.9; else u1 -= 0.9; }   // leave the gate's arch clear
      const span = u1 - u0, nb = Math.max(1, Math.round(span / 4.6));
      const ub = (k) => u0 + (k + 0.5) * span / nb;
      if (L === 1) {
        wall(dark, u0, u1, 0, 2.0, 0, ext);
        for (let k = 0; k < nb; k++) wall(dark, ub(k) - 0.6, ub(k) + 0.6, 0, 6, 0, ext + 0.4);
      } else if (L === 2) {
        wall(dark, u0, u1, 0, 3.4, 0, ext);
        for (let k = 0; k < nb; k++) {
          wall(dark, ub(k) - 0.65, ub(k) + 0.65, 0, wallH, 0, ext + 0.45);
          wall(dark, ub(k) - 0.85, ub(k) + 0.85, wallH, wallH + 0.4, 0, ext + 0.65);   // sloped cap
          wall(iron, ub(k) - 0.7, ub(k) + 0.7, 3.4, 3.75, 0, ext + 0.55);
          wall(iron, ub(k) - 0.7, ub(k) + 0.7, 5.8, 6.15, 0, ext + 0.55);
        }
        wall(iron, u0, u1, 3.4, 3.7, 0, ext + 0.06);                                      // straps along the whole face
        wall(iron, u0, u1, 5.8, 6.1, 0, ext + 0.06);
      } else {
        wall(fine, u0, u1, 0, wallH, 0, ext);                                             // dressed facing
        wall(dark, u0, u1, 0, 1.6, 0, ext + 0.4);                                         // plinth
        wall(dark, u0, u1, wallH - 1.2, wallH - 0.6, 0, ext + 0.5);                       // corbel ledge under the parapet
        for (let k = 0; k < nb; k++) {
          wall(fine, ub(k) - 0.6, ub(k) + 0.6, 1.6, wallH + 0.35, ext, ext + 0.5);        // pilasters
          wall(iron, ub(k) - 0.66, ub(k) + 0.66, 2.8, 3.1, ext, ext + 0.58);
          wall(iron, ub(k) - 0.66, ub(k) + 0.66, 5.2, 5.5, ext, ext + 0.58);
          const uc = ub(k) + span / nb / 2;
          if (k < nb - 1) {   // a crest between the pilasters
            const at = (o) => (seg.alongX ? [seg.lx + uc, seg.lz + seg.nz * (half + o)] : [seg.lx + seg.nx * (half + o), seg.lz + uc]);
            const [cx, cz] = at(ext + 0.05);
            const d = new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18);
            const r = new THREE.TorusGeometry(0.72, 0.07, 6, 20);
            if (seg.alongX) { d.rotateX(Math.PI / 2); } else { d.rotateZ(Math.PI / 2); r.rotateY(Math.PI / 2); }
            d.translate(cx, 4.4, cz); r.translate(cx, 4.4, cz);
            disc.push(d); ring.push(r);
          }
        }
      }
    }
    this.add(this.wallMeshes, dark, M.stoneDark);
    this.add(this.wallMeshes, fine, this.mats.fine);
    this.add(this.wallMeshes, iron, M.iron);
    this.add(this.wallMeshes, disc, M.team[c.team]);
    this.add(this.wallMeshes, ring, M.gold);
  }

  // The collider reaches out as far as the plinth, so nobody walks into the new stone.
  growWallColliders() {
    const c = this.c, ext = WALL_EXT[c.wallLevel];
    for (const seg of c.walls) {
      const b = seg.box;
      const a = c.toWorld(b.x0 + (seg.nx < 0 ? -ext : 0), b.z0 + (seg.nz < 0 ? -ext : 0));
      const d = c.toWorld(b.x1 + (seg.nx > 0 ? ext : 0), b.z1 + (seg.nz > 0 ? ext : 0));
      const k = seg.collider;
      k.minX = Math.min(a.x, d.x); k.maxX = Math.max(a.x, d.x);
      k.minZ = Math.min(a.z, d.z); k.maxZ = Math.max(a.z, d.z);
    }
  }

  // ---------------------------------------------------------------- gate
  // Level 1: three iron bands. 2: vertical straps and rivets. 3: spikes on the outside and a gold crest.
  rebuildGate() {
    const c = this.c, L = c.gateLevel, M = this.M;
    for (const l of c.gate.leaves) {
      for (const d of l.decor || []) { l.pivot.remove(d); d.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      l.decor = [];
      if (!L) continue;
      const iron = [], gold = [];
      const face = 0.225;   // half the leaf's thickness
      for (const z of [-face, face]) {
        const o = Math.sign(z) * 0.06;
        for (const y of [0.9, 3.0, 5.1]) bx(iron, 0.04, GW - 0.04, y - 0.16, y + 0.16, z + o - 0.05, z + o + 0.05, 1);   // bands
        if (L >= 2) {
          for (const x of [0.45, 1.5, 2.55]) bx(iron, x - 0.1, x + 0.1, 0.1, gateH - 0.1, z + o - 0.045, z + o + 0.045, 1);   // straps
          for (const x of [0.45, 1.0, 1.5, 2.0, 2.55]) for (const y of [0.9, 3.0, 5.1]) {
            const s = new THREE.SphereGeometry(0.09, 6, 4);
            s.translate(x, y, z + o + Math.sign(z) * 0.06);
            iron.push(s);
          }
        }
      }
      if (L >= 3) {
        for (const x of [0.75, 1.5, 2.25]) for (const y of [1.9, 3.0, 4.1]) {
          const s = new THREE.ConeGeometry(0.1, 0.38, 6);
          s.rotateX(Math.PI / 2);                  // points along +z, outward
          s.translate(x, y, face + 0.25);
          iron.push(s);
        }
        const crest = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18);
        crest.rotateX(Math.PI / 2);
        crest.translate(GW * 0.5, 3.0 + 0.0, face + 0.2);
        gold.push(crest);
        bx(iron, 0, 0.14, 0, gateH, -face - 0.08, face + 0.08, 1);   // a heavy iron hinge stile on each leaf
        bx(iron, GW - 0.14, GW, 0, gateH, -face - 0.08, face + 0.08, 1);
      }
      const parent = new THREE.Group();            // leaf-local coordinates, mirrored like the leaf itself
      parent.scale.x = -l.s;
      l.pivot.add(parent);
      l.decor.push(parent);
      this.add([], iron, M.iron, parent);
      this.add([], gold, M.gold, parent);
    }
    this.gateDecorVisible(c.gate.alive);
  }

  gateDecorVisible(on) {
    for (const l of this.c.gate.leaves) for (const d of l.decor || []) d.visible = on;
  }

  // ---------------------------------------------------------------- towers
  // Level 1: house shields hung on the north faces and an archer on the roof. 2: shields on the east faces too, a second
  // archer and a ballista. 3: a third archer, braziers, wooden hoardings round the roof and gold-rimmed shields.
  rebuildTowers() {
    const c = this.c, L = c.towerLevel, M = this.M;
    this.clear(this.towerMeshes);
    this.flames.length = 0;
    for (const a of this.archers || []) this.c.group.remove(a);
    this.archers = [];
    if (!L) return;
    const wood = [], iron = [], plank = [], disc = [], rim = [];
    for (const t of c.towers) {
      const { sx, sz } = t;
      // a box given in the (+,+) frame, mirrored into this corner
      const tb = (list, x0, x1, y0, y1, z0, z1, tex = 2) => bx(list, sx * x0, sx * x1, y0, y1, sz * z0, sz * z1, tex);
      // shields on the outer faces, just under the roof edge
      const shield = (north, a) => {
        const d = new THREE.CylinderGeometry(0.72, 0.72, 0.1, 18);
        const r = new THREE.TorusGeometry(0.72, 0.065, 6, 20);
        if (north) { d.rotateX(Math.PI / 2); } else { d.rotateZ(Math.PI / 2); r.rotateY(Math.PI / 2); }
        const x = north ? sx * a : sx * (F1 + 0.06), z = north ? sz * (F1 + 0.06) : sz * a;
        d.translate(x, towerH - 1.7, z); r.translate(x, towerH - 1.7, z);
        disc.push(d); if (L >= 3) rim.push(r);
      };
      for (const a of [19.8, 22.5, 25.2]) shield(true, a);
      if (L >= 2) for (const a of [19.8, 22.5, 25.2]) shield(false, a);
      if (L >= 3) for (const a of [20.8, 24.2]) { shield(true, a); shield(false, a); }
      // archers on the roof, one behind each gap in the battlements, facing out
      const spots = [[22, 26.2, 0], [26.2, 22, 1], [26.2, 24, 1]];
      for (let i = 0; i < Math.min(L, 3); i++) {
        const [ax, az, east] = spots[i];
        const m = this.archerMesh();
        m.position.set(sx * ax, towerH, sz * az);
        m.rotation.y = east ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : (sz > 0 ? 0 : Math.PI);
        c.group.add(m);
        this.archers.push(m);
      }
      if (L >= 2) {
        // a ballista on the roof deck, aimed out over the north wall
        const bz = 25.0, bxx = 20.4;
        tb(wood, bxx - 0.55, bxx + 0.55, towerH, towerH + 0.35, bz - 0.7, bz + 0.7);                // frame
        tb(wood, bxx - 0.1, bxx + 0.1, towerH + 0.35, towerH + 0.62, bz - 0.6, bz + 1.1);           // the stock
        tb(wood, bxx - 0.35, bxx + 0.35, towerH + 0.35, towerH + 0.62, bz - 0.7, bz - 0.5);
        tb(iron, bxx - 1.05, bxx - 0.05, towerH + 0.5, towerH + 0.62, bz + 0.55, bz + 0.7);         // the bow arms
        tb(iron, bxx + 0.05, bxx + 1.05, towerH + 0.5, towerH + 0.62, bz + 0.55, bz + 0.7);
        tb(iron, bxx - 0.03, bxx + 0.03, towerH + 0.62, towerH + 0.68, bz - 0.2, bz + 1.5);         // the bolt
      }
      if (L >= 3) {
        // braziers
        for (const [fx, fz] of [[19.7, 22.2], [23.3, 22.2]]) {
          tb(iron, fx - 0.3, fx + 0.3, towerH + 0.7, towerH + 0.85, fz - 0.3, fz + 0.3);
          for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) tb(iron, fx + dx - 0.04, fx + dx + 0.04, towerH, towerH + 0.75, fz + dz - 0.04, fz + dz + 0.04);
          const bowl = new THREE.CylinderGeometry(0.42, 0.28, 0.3, 10);
          bowl.translate(sx * fx, towerH + 0.95, sz * fz);
          iron.push(bowl);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 7), this.mats.ember);
          fl.position.set(sx * fx, towerH + 1.5, sz * fz);
          const core = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), this.mats.emberHot);
          core.position.set(sx * fx, towerH + 1.42, sz * fz);
          const lick = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 5), this.mats.ember);
          lick.position.set(sx * fx + 0.14, towerH + 1.38, sz * fz - 0.08);
          lick.rotation.z = -0.35;
          c.group.add(fl, core, lick);
          this.towerMeshes.push(fl, core, lick);
          const pos = c.toWorld(sx * fx, sz * fz, towerH + 1.5);
          this.flames.push({ mesh: fl, phase: Math.random() * 6, pos }, { mesh: core, phase: Math.random() * 6 }, { mesh: lick, phase: Math.random() * 6 });
        }
        // wooden hoardings overhanging the north and east faces
        tb(plank, 18, F1 + 0.95, towerH - 1.35, towerH - 0.95, F1, F1 + 0.95);
        tb(plank, F1, F1 + 0.95, towerH - 1.35, towerH - 0.95, 18, F1);
        for (const a of [18.8, 21.4, 24, 26.4]) {
          tb(wood, a - 0.12, a + 0.12, towerH - 2.2, towerH - 1.3, F1 - 0.05, F1 + 0.8);       // brackets
          tb(wood, F1 - 0.05, F1 + 0.8, towerH - 2.2, towerH - 1.3, a - 0.12, a + 0.12);
        }
        tb(wood, 18, F1 + 0.95, towerH - 0.95, towerH - 0.1, F1 + 0.85, F1 + 0.95);            // the outer boards
        tb(wood, F1 + 0.85, F1 + 0.95, towerH - 0.95, towerH - 0.1, 18, F1);
      }
    }
    this.add(this.towerMeshes, wood, M.wood);
    this.add(this.towerMeshes, iron, M.iron);
    this.add(this.towerMeshes, plank, M.plank);
    this.add(this.towerMeshes, disc, M.team[c.team]);
    this.add(this.towerMeshes, rim, M.gold);
  }

  // one archer drawing his bow, baked into a single static mesh
  archerMesh() {
    const c = this.c;
    let geo = ARCHER_GEO.get(c.team);
    if (!geo) {
      const m = buildSoldier('archer', c.team, 1);
      poseSoldier(m, { phase: 0, speed: 0, moving: false, swingT: 0.34, attackDir: 'over', stagger: 0, mounted: false });
      geo = bakedMesh(`towerArcher:${c.team}`, m.root).geometry;
      ARCHER_GEO.set(c.team, geo);
    }
    const mesh = new THREE.Mesh(geo, unitMaterial());
    mesh.castShadow = true;
    return mesh;
  }

  // ---------------------------------------------------------------- barracks
  // Racks of spears and shields along the inside of the walls, one wall more for each level of Expand Barracks.
  rebuildRacks() {
    const c = this.c, L = c.barracksLevel || 0, M = this.M;
    this.clear(this.rackMeshes);
    if (!L) return;
    const IN = H - T;
    const wood = [], iron = [], disc = [], pennant = [];
    // [wall: the inner face it stands against (+x, -x, +z, -z), span]
    const sides = [[0, -1], [-1, 0], [1, 0], [0, 1]].slice(0, L);   // back, left, right, then the front
    const spans = [];
    for (const [nx, nz] of sides) {
      if (nz > 0) spans.push([nx, nz, -13, -4.8], [nx, nz, 4.8, 13]);   // the front wall leaves the gateway clear
      else spans.push([nx, nz, nz ? -13 : -11, nz ? 13 : 11]);
    }
    for (const [nx, nz, from, to] of spans) {
      const alongX = nz !== 0;
      // everything in the wall's own frame, then placed against its inner face
      const place = (u, y, o) => (alongX ? [u, nz < 0 ? -IN + o : IN - o] : [nx < 0 ? -IN + o : IN - o, u]);
      const rack = (u0, u1, y0, y1, o0, o1, list) => {
        const [xa, za] = place(u0, 0, o0), [xb, zb] = place(u1, 0, o1);
        bx(list, xa, xb, y0, y1, za, zb, 2);
      };
      // a long timber rail low down and another higher up
      rack(from, to, 0.45, 0.6, 0.12, 0.42, wood);
      rack(from, to, 1.65, 1.8, 0.12, 0.42, wood);
      for (let u = from; u <= to + 0.01; u += 2.6) rack(u - 0.07, u + 0.07, 0, 2.0, 0.12, 0.42, wood);   // uprights
      // spears leaning in the racks and shields on the wall above them
      for (let u = from + 0.6; u <= to - 0.3; u += 0.65) {
        const [x, z] = place(u, 0, 0.27);
        const s = new THREE.CylinderGeometry(0.025, 0.025, 2.9, 5);
        s.translate(x, 1.45, z);
        wood.push(s);
        const tip = new THREE.ConeGeometry(0.06, 0.28, 5);
        tip.translate(x, 2.99, z);
        iron.push(tip);
      }
      for (let u = from + 1.2; u <= to - 1.0; u += 2.6) {
        const [x, z] = place(u, 0, 0.12);
        const d = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 16);
        if (alongX) d.rotateX(Math.PI / 2); else d.rotateZ(Math.PI / 2);
        d.translate(x, 3.5, z);
        disc.push(d);
      }
      // a pennant hung over the middle of each rack (the level's mark)
      const [px, pz] = place(0, 0, 0.1);
      const pb = new THREE.BoxGeometry(alongX ? 1.5 : 0.04, 2.2, alongX ? 0.04 : 1.5);
      pb.translate(px, 5.0, pz);
      pennant.push(pb);
    }
    this.add(this.rackMeshes, wood, M.wood);
    this.add(this.rackMeshes, iron, M.iron);
    this.add(this.rackMeshes, disc, M.team[c.team]);
    this.add(this.rackMeshes, pennant, M.team[c.team]);
  }

  // ---------------------------------------------------------------- elite levies
  // Tall standards by the keep door: one pair per level, topped with a spearhead, then a gold ball, then a gold eagle.
  rebuildStandards() {
    const c = this.c, L = c.levies || 0, M = this.M;
    this.clear(this.standardMeshes);
    if (!L) return;
    const wood = [], iron = [], gold = [], cloth = [];
    const z = 0.9;
    for (let k = 0; k < L; k++) {
      for (const s of [-1, 1]) {
        const x = s * (3.7 + k * 2.4);
        const pole = new THREE.CylinderGeometry(0.07, 0.09, 6.4, 6);
        pole.translate(x, 3.2, z);
        wood.push(pole);
        bx(wood, x - 0.3, x + 0.3, 0, 0.35, z - 0.3, z + 0.3, 1);   // the foot
        // a long banner hanging from a crossbar
        bx(wood, x - 0.7, x + 0.7, 5.35, 5.45, z - 0.04, z + 0.04, 1);
        const flag = new THREE.BoxGeometry(1.25, 2.6, 0.03);
        flag.translate(x, 4.1, z);
        cloth.push(flag);
        if (L === 1) {
          const tip = new THREE.ConeGeometry(0.11, 0.5, 6); tip.translate(x, 6.65, z); iron.push(tip);
        } else if (L === 2) {
          const ball = new THREE.SphereGeometry(0.2, 8, 6); ball.translate(x, 6.55, z); gold.push(ball);
        } else {
          // a gold eagle: body, wings, head
          bx(gold, x - 0.1, x + 0.1, 6.45, 6.85, z - 0.1, z + 0.1, 1);
          bx(gold, x - 0.5, x + 0.5, 6.6, 6.7, z - 0.04, z + 0.04, 1);
          bx(gold, x - 0.07, x + 0.07, 6.85, 7.0, z + 0.05, z + 0.2, 1);
        }
      }
    }
    this.add(this.standardMeshes, wood, M.wood);
    this.add(this.standardMeshes, iron, M.iron);
    this.add(this.standardMeshes, gold, M.gold);
    const flagMat = M.banners[c.team];
    this.add(this.standardMeshes, cloth, flagMat, c.group, false);
  }
}
