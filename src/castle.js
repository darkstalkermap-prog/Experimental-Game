// A castle: curtain walls (breakable by siege engines), a gate (breakable by anyone),
// corner towers, the keep (the castle falls when it is destroyed) and ramps to the wall walk.
// What it looks like is built in castlegeo.js (pieces per material) and merged here into a handful of meshes: the walls (rebuilt when
// one is damaged, broken or mended), the keep and towers, timber, roofs, metal, soft goods, the courtyard floor and the cloth.
import * as THREE from 'three';
import { CASTLE, TEAM_COLORS, TROOP_CAP } from './config.js';
import { materials, box, shadowed, partsMaterial } from './materials.js';
import { Upgrades } from './upgrades.js';
import { Q, onQuality } from './quality.js';
import { Parts, place } from './parts.js';
import { Cloth, clothMaterial, updateWind, FireSet, dustBank, fireBurst } from './castlefx.js';
import * as G from './castlegeo.js';
import { populate } from './props.js';
import { customBanner } from './textures.js';
import { highlights } from './highlights.js';
import { Collapse } from './castlecollapse.js';
import { downMask, applyDownMask } from './towerarchers.js';

const { H, wallH, wallT: T, gateW, gateH, towerR, towerH, keepW, keepH, towerOff, walk: WALK } = CASTLE;
const TC = H + towerOff; // corner tower centres
const GW = gateW / 2;
const KEEP_Z = G.KEEP_Z;
const MERLON_H = G.MERLON_H;   // merlons stand chest-high: they cover a soldier's body and leave the head showing
const POST_LEAN = 0.95; // an archer at a slot leans out to the wall's outer face, so he can shoot at the foot of the wall

const _cp = new THREE.Vector3(), _cq = new THREE.Vector3(), _cv = new THREE.Vector3(), _gold = new THREE.Color(1, 0.8, 0.4);

export class Castle {
  constructor(game, team, site) {
    this.game = game;
    this.team = team;
    this.site = site;
    this.center = new THREE.Vector3(site.x, CASTLE.baseY, site.z);
    this.rot = site.rot;
    this.cos = Math.cos(site.rot);
    this.sin = Math.sin(site.rot);
    this.fallen = false;
    this.wallLevel = 0;
    this.gateLevel = 0;
    this.towerLevel = 0;
    this.towerCd = [0, 0, 0, 0];
    // stands in as the 'attacker' for tower arrows (kill credit); soldiers can't fight back at it
    this.towerShooter = { team, alive: true, isTower: true, isStructure: true, name: 'Tower archers', pos: new THREE.Vector3(site.x, CASTLE.baseY + 14, site.z) };
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.rotation.y = this.rot;
    game.scene.add(this.group);
    this.bucket = game.physics.addBucket(site.x, site.z, H + 8);
    this.mats = materials();
    this.clothMat = clothMaterial(this.mats.banners[team].map);   // (its own: the fallen keep scorches it)
    this.flagMat = this.mats.banners[team];   // the cloth of the levy standards (see setBanner)
    this.bannerId = '';
    this.vis = [];
    this.fire = new FireSet(this.group, this.mats.fire);   // torches, braziers, chimneys, the burning ruin
    this.build();
    this.group.updateMatrix();
    this.group.matrixAutoUpdate = false;
    // the geometry depends on Q.detail: build it again when the graphics setting changes
    const off = this.offQuality = onQuality((q) => {   // (kept so that Game.dispose can let go of it: a world rebuilt before the next quality change would stay alive otherwise)
      if (this.detail === undefined) return;
      if (!this.group.parent) { off(); return; }   // (the world was rebuilt: this castle is gone)
      if (q.detail !== this.detail || q.props !== this.props) this.buildVisuals();
    });
  }

  // The emblem this house flies, from its lord's account ('' is the house's own, as it always was): the hanging banners, the flags and the standards.
  // The field stays the house colour, so the houses can still be told apart.
  setBanner(id) {
    id = id || '';
    if (this.bannerId === id) return;
    this.bannerId = id;
    const base = this.mats.banners[this.team];
    const map = id ? customBanner(TEAM_COLORS[this.team], this.team, id) : base.map;
    this.clothMat.map = map;
    if (id) { this.flagMat = base.clone(); this.flagMat.map = map; } else this.flagMat = base;
  }

  toWorld(lx, lz, y = 0) {
    return new THREE.Vector3(
      this.center.x + lx * this.cos + lz * this.sin,
      this.center.y + y,
      this.center.z - lx * this.sin + lz * this.cos,
    );
  }
  toLocal(x, z) {
    const dx = x - this.center.x, dz = z - this.center.z;
    return { x: dx * this.cos - dz * this.sin, z: dx * this.sin + dz * this.cos };
  }
  dirToWorld(lx, lz) {
    return new THREE.Vector3(lx * this.cos + lz * this.sin, 0, -lx * this.sin + lz * this.cos);
  }
  // Is a world position inside the courtyard?
  isInside(p, margin = 0) {
    const l = this.toLocal(p.x, p.z);
    const m = H - T + margin;
    return Math.abs(l.x) < m && Math.abs(l.z) < m;
  }
  // Within the castle footprint (walls included)?
  inFootprint(p, margin = 0) {
    return Math.abs(p.x - this.center.x) < H + margin && Math.abs(p.z - this.center.z) < H + margin;
  }

  // One shot-blocking box per merlon, matching the stone ones drawn by castlegeo.
  addMerlons(cx, cz, len, alongX, outer, ref, skip = null) {
    const list = [];
    const n = Math.floor(len / 2);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + 1 + i * 2;
      if (skip && skip(t)) continue;
      const lx = alongX ? cx + t : cx + outer, lz = alongX ? cz + outer : cz + t;
      const hx = alongX ? 0.55 : 0.25, hz = alongX ? 0.25 : 0.55;
      const a = this.toWorld(lx - hx, lz - hz), b = this.toWorld(lx + hx, lz + hz);
      list.push(this.game.physics.addMerlon({
        minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z),
        top: this.center.y + wallH + MERLON_H, bottom: this.center.y + wallH - 0.05, kind: 'merlon', team: this.team, ref,
      }, this.bucket));
    }
    return list;
  }

  // a battlement rail's inward side (castle-local lx, lz), in world terms: someone who ends up inside the rail (dropping into a
  // crenel from the top of a merlon) is put back on that side, onto the walk, never pushed out over the wall (Physics.pushOut)
  inward(lx, lz) {
    const d = this.dirToWorld(lx, lz);
    return { inX: Math.round(d.x), inZ: Math.round(d.z) };
  }

  addCollider(lx0, lx1, lz0, lz1, top, extra = {}) {
    const a = this.toWorld(lx0, lz0), b = this.toWorld(lx1, lz1);
    return this.game.physics.add({
      minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z),
      top: this.center.y + top, ...extra,
    }, this.bucket);
  }

  build() {
    const M = this.mats;
    const g = this.group;

    // ---- curtain wall segments ----
    // [x0,x1,z0,z1, normal x, normal z, destructible]
    const segDefs = [];
    for (let i = 0; i < 4; i++) segDefs.push([-H + i * 10, -H + (i + 1) * 10, -H, -H + T, 0, -1, true]); // back
    for (let i = 0; i < 4; i++) {
      const z0 = -H + T + i * 9, z1 = z0 + 9;
      segDefs.push([-H, -H + T, z0, z1, -1, 0, true]); // left
      segDefs.push([H - T, H, z0, z1, 1, 0, true]);    // right
    }
    // front wall: reinforced gatehouse wall, not breakable
    segDefs.push([-H, -GW, H - T, H, 0, 1, false]);
    segDefs.push([GW, H, H - T, H, 0, 1, false]);

    this.walls = [];
    for (const [x0, x1, z0, z1, nx, nz, breakable] of segDefs) {
      const w = x1 - x0, d = z1 - z0;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const alongX = w > d;
      const len = alongX ? w : d;
      const outer = alongX ? nz * (T / 2 - 0.25) : nx * (T / 2 - 0.25);
      // the corner towers stand on the corner squares of the front and back walls: no merlons there
      const atCorner = (t) => Math.abs(alongX ? cx + t : cx) > H - T - 0.1 && Math.abs(alongX ? cz : cz + t) > H - T - 0.1;
      const seg = {
        kind: 'wall', isStructure: true, castle: this, team: this.team, breakable,
        hp: CASTLE.wallHp, maxHp: CASTLE.wallHp, alive: true,
        vis: 'full',   // what is drawn: 'full', 'damaged' or 'gone' (see applyWallVisual)
        lx: cx, lz: cz, nx, nz, len, alongX,
        pos: this.toWorld(cx, cz, wallH * 0.5),
        radius: Math.max(w, d) / 2,
        outPt: this.toWorld(cx + nx * 6, cz + nz * 6),
        inPt: this.toWorld(cx - nx * 5.5, cz - nz * 5.5),
        posts: [],
        box: { x0, x1, z0, z1 },   // its footprint in castle coordinates (the collider grows outward with Thicken Walls)
      };
      seg.collider = this.addCollider(x0, x1, z0, z1, wallH, { kind: 'wall', ref: seg });
      // the battlements: an invisible rail along the outer edge keeps soldiers from stepping off the wall walk,
      // and every merlon stops arrows and spells. The gaps between the merlons are the firing slots.
      const PT = 0.55; // rail thickness
      // (the rail stops at the inner face of the side walls: the tower takes over from there)
      const px0 = alongX ? Math.max(x0, -(H - T)) : nx > 0 ? x1 - PT : x0, px1 = alongX ? Math.min(x1, H - T) : nx > 0 ? x1 : x0 + PT;
      const pz0 = alongX ? (nz > 0 ? z1 - PT : z0) : z0, pz1 = alongX ? (nz > 0 ? z1 : z0 + PT) : z1;
      seg.parapet = this.addCollider(px0, px1, pz0, pz1, wallH + MERLON_H, { kind: 'parapet', ref: seg, noWalk: true, noProjectile: true, bottom: this.center.y + wallH - 0.05, ...this.inward(-nx, -nz) });
      seg.merlons = this.addMerlons(cx, cz, len, alongX, outer, seg, atCorner);
      seg.takeDamage = (amt, attacker, cause) => this.damageWall(seg, amt, attacker, cause);
      this.walls.push(seg);
      // archer posts along the wall walk, each one standing behind a gap between two merlons
      const nMerlons = Math.floor(len / 2);
      const gaps = Math.max(1, nMerlons - 1);
      const n = Math.max(1, Math.floor(len / 4.5));
      for (let i = 0; i < n; i++) {
        const gap = Math.min(gaps - 1, Math.max(0, Math.round((i + 0.5) * gaps / n - 0.5)));
        const t = -len / 2 + 2 + 2 * gap;
        const lx = alongX ? cx + t : cx, lz = alongX ? cz : cz + t;
        seg.posts.push({
          seg, occupant: null,
          pos: this.toWorld(lx, lz, wallH),
          base: this.toWorld(lx - nx * 4, lz - nz * 4),
          lean: this.dirToWorld(nx, nz).multiplyScalar(POST_LEAN),
          front: nz === 1,
        });
      }
    }

    // ---- gate lintel ----
    this.addCollider(-GW, GW, H - T, H, wallH, { bottom: this.center.y + gateH, kind: 'lintel' });
    this.addCollider(-GW, GW, H - 0.55, H, wallH + MERLON_H, { kind: 'parapet', noWalk: true, noProjectile: true, bottom: this.center.y + wallH - 0.05, ...this.inward(0, -1) });
    this.addMerlons(0, H - T / 2, gateW, true, T / 2 - 0.25, null);

    // ---- gate ----
    this.buildGate();

    // ---- corner towers ----
    this.buildTowers();

    // ---- keep ----
    this.buildKeep();

    // ---- wall walk: a wooden hoarding all the way round the inside of the walls ----
    // It joins the 2 m stone wall top into one 5.5 m walk; soldiers walk underneath it.
    const IN = H - T;            // inner face of the walls
    const E = IN - WALK;         // inner edge of the walkway
    const cy = this.center.y;
    const slabs = [[-IN, IN, E, IN], [-IN, IN, -IN, -E], [-IN, -E, -E, E], [E, IN, -E, E],
      // landings: the top of each staircase runs straight on into the back walkway
      [E - 3, E, -E, -6], [-E, -E + 3, -E, -6]];
    for (const [x0, x1, z0, z1] of slabs) {
      this.addCollider(x0, x1, z0, z1, wallH, { kind: 'walk', bottom: cy + wallH - 0.5, noProjectile: true, team: this.team });
    }
    // support posts with braces along the inner edge (stairs leave gaps)
    const postAt = (x, z) => {
      this.addCollider(x - 0.22, x + 0.22, z - 0.22, z + 0.22, wallH - 0.5, { kind: 'post', noWalk: true, noProjectile: true });
    };
    for (let t = -E; t <= E + 0.01; t += (2 * E) / 6) {
      if (Math.abs(t) > 3.6) postAt(t, E);               // front: keep the gateway clear
      postAt(t, -E);                                     // back
      if (Math.abs(t) > 6.5) { postAt(-E, t); postAt(E, t); } // sides: the stairs fill the middle
    }
    for (const sx of [-1, 1]) postAt(sx * (E - 3), -10.2); // under the landings

    // stairs up to the walk, one on each side, rising toward the back of the castle
    const STAIR_W = 3, z0 = 6, z1 = -6;
    for (const s of [-1, 1]) {
      const xs = s * (E - STAIR_W / 2);
      this.addCollider(Math.min(xs - STAIR_W / 2, xs + STAIR_W / 2), Math.max(xs - STAIR_W / 2, xs + STAIR_W / 2), z1, z0, wallH, {
        kind: 'ramp',
        heightFn: (x, z) => {
          const l = this.toLocal(x, z);
          return cy + wallH * Math.min(1, Math.max(0, (z0 - l.z) / (z0 - z1)));
        },
      });
    }

    // ---- the gate lever and the bar that locks the gate ----
    this.leverLocal = { x: 5.8, z: IN - 5 };
    const lever = new THREE.Group();
    lever.position.set(this.leverLocal.x, 0, this.leverLocal.z);
    const handle = new THREE.Group();
    handle.position.y = 0.9;
    const hp = new Parts(1);
    hp.cyl('timber', 0.05, 0.05, 1.2, 6, null, G.C.wood);
    hp.add('timber', new THREE.SphereGeometry(0.11, 8, 6), place(0, 1.2, 0), G.C.iron);
    const stick = new THREE.Mesh(hp.geometry('timber'), M.timber);
    stick.castShadow = true;
    handle.add(stick);
    handle.rotation.x = 0.6;
    lever.add(handle);
    g.add(lever);
    this.leverHandle = handle;
    this.leverPos = this.toWorld(this.leverLocal.x, this.leverLocal.z, 1.2);
    const bar = new THREE.Mesh(box(gateW + 1.2, 0.35, 0.35, 2), M.wood);
    bar.position.set(0, 2.6, IN - 0.3);
    bar.visible = false;
    g.add(shadowed(bar));
    this.gateBar = bar;
    this.gateLocked = false;

    // ---- defend positions and key points ----
    this.gatePos = this.toWorld(0, H - T / 2, gateH / 2);
    this.gateOut = this.toWorld(0, H + 5);
    this.gateIn = this.toWorld(0, H - T - 7);
    this.spawnPoint = this.toWorld(0, 2.5);
    this.defendPts = [];
    for (let row = 0; row < 3; row++) {
      for (let i = -3; i <= 3; i++) this.defendPts.push(this.toWorld(i * 2.3, 11 - row * 2.6));
    }
    for (let i = 0; i < 16; i++) this.defendPts.push(this.toWorld(-9 + (i % 8) * 2.6, -14.5 + Math.floor(i / 8) * 2.4));
    this.posts = this.walls.flatMap((w) => w.posts);
    // front posts first
    this.posts.sort((a, b) => (b.front ? 1 : 0) - (a.front ? 1 : 0));
    // lintel posts
    for (const x of [-1, 1]) {
      this.posts.unshift({ seg: null, occupant: null, pos: this.toWorld(x, H - T / 2, wallH), base: this.toWorld(x * 4.5, H - T - 6), lean: this.dirToWorld(0, 1).multiplyScalar(POST_LEAN), front: true });
    }
    this.buildVisuals();
    this.barracksLevel = 0;
    this.levies = 0;
    this.upg = new Upgrades(this);
  }

  // ---------------------------------------------------------------- what the castle looks like
  // Everything static is merged by material. Built again when Q.detail changes. (castlegeo.js holds the shapes.)
  clearVisuals() {
    for (const m of this.vis) { this.group.remove(m); m.geometry.dispose(); }
    this.vis.length = 0;
    this.wallMesh = this.keepMesh = this.tilesMesh = null;
    this.aMesh = this.aRanges = null;
    this.collapse = null;     // (a fallen keep is drawn again from its end state: see applyBurn)
  }

  buildVisuals() {
    this.clearVisuals();
    const d = Q.detail, g = this.group, seed = this.team * 101 + 5;
    this.detail = d;
    this.props = Q.props;
    const fixed = new Parts(seed + 1), A = new Parts(seed + 2), R = new Parts(seed + 3), K = new Parts(seed + 4), cloth = new Cloth(), fires = [];
    G.gatehouse(fixed, A, d, fires);
    G.stairs(fixed, d);
    G.deck(A, d);
    G.courtyard(A, d, seed);
    // where the pieces of the keep and the towers lie in the shared timber, metal and glass meshes (the collapse folds them away: see hideKeep)
    const ranges = { timber: [], metal: [], plain: [] };
    const at = () => ({ timber: A.a('timber').pos.length / 3, metal: A.a('metal').pos.length / 3, plain: A.a('plain').pos.length / 3 });
    const span = (from) => { const to = at(); for (const k in ranges) if (to[k] > from[k]) ranges[k].push([from[k], to[k]]); };
    const m0 = at();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) G.tower(K, A, R, sx, sz, d);
    G.keep(K, A, R, d, fires);
    span(m0);
    this.dress(cloth, A, d, (from) => span(from), at);
    // barrels, stalls, a forge, a well...: decoration only (see props.js); the ground under them follows the terrain outside the walls
    populate(A, fixed, fires, { team: this.team, detail: Math.min(d, Q.props), ground: (x, z) => { const w = this.toWorld(x, z); return Math.max(-2, Math.min(6, this.game.physics.terrainHeight(w.x, w.z) - this.center.y)); } });
    this.fire.set('static', fires);
    const mesh = (parts, key, geo = null, cast = false) => {
      geo = geo || parts.geometry(key);
      if (!geo) return null;
      const m = new THREE.Mesh(geo, partsMaterial(key));
      m.castShadow = cast; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      g.add(m);
      this.vis.push(m);
      return m;
    };
    // the walls: pieces for each state of each segment, merged again whenever one changes
    this.wallParts = this.walls.map((seg, i) => G.wallParts(seg, d, seed * 31 + i));
    // faces buried in other stone are seen from nowhere, so they are not drawn. A wall piece is only tested against what always stands; the keep and the towers
    // (K) fall in the finish and are hidden then (hideKeep), so what they bury has to stay drawn: K is culled by the rest but culls nothing of it
    const stays = [fixed, A];
    K.cull(stays);
    fixed.cull([A]);
    A.cull([fixed]);
    for (const w of this.wallParts) for (const P of [w.full, w.damaged, w.gone]) P.cull(stays);
    this.fixedParts = fixed;
    this.wallMesh = mesh(null, 'masonry', this.mergeWalls(), true);
    this.wallsDirty = false;
    this.keepMesh = mesh(K, 'masonry', null, true);
    this.aMesh = { timber: mesh(A, 'timber', null, true), metal: null, plain: null };
    this.tilesMesh = mesh(R, 'roof', null, true);
    this.aMesh.metal = mesh(A, 'metal');
    this.aMesh.plain = mesh(A, 'plain');
    this.aRanges = ranges;
    this.staticFires = fires;
    mesh(A, 'ground');
    if (!cloth.empty()) {
      const m = new THREE.Mesh(cloth.geometry(), this.clothMat);
      m.receiveShadow = false;
      m.matrixAutoUpdate = false;
      g.add(m);
      this.vis.push(m);
    }
    if (this.burning) this.applyBurn();
  }

  // the walls mesh: the fixed stone plus each segment as it stands now
  mergeWalls() {
    const P = new Parts(1);
    P.merge(this.fixedParts);
    this.walls.forEach((seg, i) => P.merge(this.wallParts[i][seg.vis]));
    return P.geometry('masonry');
  }
  rebuildWalls() {
    this.wallsDirty = false;
    if (!this.wallMesh) return;
    const old = this.wallMesh.geometry;
    this.wallMesh.geometry = this.mergeWalls();
    old.dispose();
  }

  // banners, flags, rods and the few loose things that are not architecture
  dress(cloth, A, d, span = () => {}, at = () => null) {
    const wood = G.C.woodDark;
    for (const s of [-1, 1]) {            // hanging banners on the front wall, on a rod and brackets in front of the corbels
      const x = s * 8.5, top = wallH - 1.0, zb = H + 0.5;
      cloth.rect([x - 1.3, top - 5.2, zb], [2.6, 0, 0], [0, 5.2, 0], 'top', { segU: 6, segV: 10, amp: 0.16 });
      A.box('timber', x - 1.45, x + 1.45, top, top + 0.15, zb - 0.08, zb + 0.08, wood);
      for (const k of [-1.2, 1.2]) A.box('timber', x + k - 0.06, x + k + 0.06, top - 0.05, top + 0.1, H, zb, wood);
    }
    const keepFrom = at();
    const kz = KEEP_Z + keepW / 2 + 0.22;   // the keep's big banner
    cloth.rect([-1.5, 6, kz], [3, 0, 0], [0, 6, 0], 'top', { segU: 6, segV: 10, amp: 0.14, tag: 1 });
    A.box('timber', -1.65, 1.65, 12, 12.15, kz - 0.08, kz + 0.08, wood);
    for (const k of [-1.3, 1.3]) A.box('timber', k - 0.06, k + 0.06, 11.95, 12.1, kz - 0.2, kz, wood);
    const flag = (x, y, z, size, tag = 1) => {   // a pole with a flag streaming from its top (tag 1: it burns away when the keep falls)
      A.cyl('metal', 0.06, 0.06, size * 2.6, 6, place(x, y, z), G.C.iron);
      if (d >= 1) A.add('metal', new THREE.SphereGeometry(0.13, 8, 6), place(x, y + size * 2.6, z), G.C.gold);
      cloth.flag([x, y + size * 1.6, z], size, tag);
    };
    const F1 = TC + towerR;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (d >= 1) flag(sx * (F1 + 0.55), towerH + 5.2, sz * (F1 + 0.55), 0.9);   // on the point of the corner turret's roof
      else flag(sx * (F1 - 0.75), towerH + 0.1, sz * (F1 - 0.75), 1.3);
    }
    if (d >= 1) flag(0, keepH + 3.0, KEEP_Z, 2.2, 1); else flag(-keepW / 2 + 1, keepH + 1.2, KEEP_Z + keepW / 2 - 1, 2.2, 1);
    span(keepFrom);
    // (the courtyard's crates and barrels, and the rest of the life in the castle, are props.js)
  }

  // Show the house's upgrades on the castle. Called every frame: it only does anything when a level has changed.
  syncUpgrades(f) {
    const levels = {
      wall: this.wallLevel, gate: this.gateLevel, tower: this.towerLevel,
      barracks: Math.round(((f.troopCap || TROOP_CAP.start) - TROOP_CAP.start) / TROOP_CAP.step), levies: f.levies || 0, training: f.training || 0,
    };
    this.barracksLevel = levels.barracks;
    this.levies = levels.levies;
    const changed = this.upg.update(levels);
    if (changed.length) this.upgradeFx(changed);
  }

  // Dust, sparks and house-coloured motes where the new work went up, so a purchase is seen as well as read.
  upgradeFx(changed) {
    const g = this.game, col = new THREE.Color(TEAM_COLORS[this.team]);
    const burst = (lx, lz, y, r = 2.5) => {
      const p = this.toWorld(lx, lz, y);
      g.fx.ring(p, r, col, 24, { up: 1.4, speed: 1.5 });
      if (g.mode !== 'client') { g.fx.dust(p, 12, 3); g.fx.sparks(p.clone().setY(p.y + 1), 10); }   // (clients replay these from the host)
    };
    const f = g.factions[this.team];
    const says = {
      wall: `Walls reinforced to level ${this.wallLevel}`, gate: `Gate iron-banded to level ${this.gateLevel}`,
      tower: `Tower archers at level ${this.towerLevel}`, barracks: 'The barracks has grown: racks of arms line the walls',
      levies: `Elite levies at level ${this.levies}`, training: `Drill sergeants at level ${f ? f.training : 0}: your soldiers are better equipped`,
    };
    for (const k of changed) {
      if (k === 'wall') for (const [x, z] of [[0, -H], [-H, 0], [H, 0], [0, H]]) burst(x, z, 3);
      else if (k === 'gate') burst(0, H + 1.5, 2.5, 3);
      else if (k === 'tower') for (const t of this.towers) burst(t.sx * TC, t.sz * TC, towerH, 3);
      else if (k === 'barracks') for (const [x, z] of [[0, -16], [-16, 0], [16, 0]]) burst(x, z, 1.5);
      else if (k === 'levies') burst(0, 2, 1, 4);
      else if (k === 'training') burst(0, 8, 1, 5);
      if (says[k] && f && f.isPlayer && f.player && g.mode !== 'client') f.player.notify(says[k]);   // (a guest hears it from the host)
    }
    if (g.mode !== 'client') g.audio.play('thud', this.center);
  }

  // The four corner towers. Each is a square tower standing outside a wall corner, solid up to the wall walk. You go
  // in from the wall walk through the open inner corner, climb two flights of stairs and come out on the crenellated
  // roof (the wall walk, the stairs and the roof are all ordinary walkable colliders).
  // Layout of the (+,+) tower in castle-local metres, mirrored for the other three:
  //   footprint x,z in [18, 27]; rooms inside [19, 26]; floor at wall-walk height; roof at towerH.
  //   stairs A run east along the south wall (x 20 to 24.5, then a landing), stairs B north along the east wall
  //   (z 21.5 to 26); the roof deck covers the rest of the room; the stairwell above the stairs stays open.
  buildTowers() {
    const cy = this.center.y;
    const F0 = H - T, F1 = TC + towerR;      // the tower's inner and outer faces
    const W = 1;                             // wall thickness
    const FLOOR = wallH;                     // level with the wall walk
    const RISE = 2.5;                        // each flight climbs half of the 5 m
    const A0 = H, A1 = H + 4.5;              // stairs A: x range of the slope (then a 1.5 m landing)
    const B0 = 21.5, B1 = F1 - W;            // stairs B: z range of the slope
    const SA = [19, 21.5];                   // stairs A / landing: z range
    const SB = [F1 - W - 2, F1 - W];         // stairs B: x range
    this.towers = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const col = (x0, x1, z0, z1, top, extra = {}) => this.addCollider(sx * x0, sx * x1, sz * z0, sz * z1, top, extra);
      // merlons round the roof edge (each one also stops enemy arrows, like the ones on the walls)
      const mer = (cx, cz, len, alongX, outer) => {
        const n = Math.floor(len / 2);
        for (let i = 0; i < n; i++) {
          const t = -len / 2 + 1 + i * 2;
          const lx = alongX ? cx + t : cx + outer, lz = alongX ? cz + outer : cz + t;
          const hx = alongX ? 0.55 : 0.25, hz = alongX ? 0.25 : 0.55;
          const a = this.toWorld(sx * (lx - hx), sz * (lz - hz)), b = this.toWorld(sx * (lx + hx), sz * (lz + hz));
          this.game.physics.addMerlon({
            minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z),
            top: cy + towerH + MERLON_H, bottom: cy + towerH - 0.05, kind: 'merlon', team: this.team, ref: null,
          }, this.bucket);
        }
      };
      const edges = [
        [F1 - W / 2, (F0 + F1) / 2, F1 - F0, false, W / 2 - 0.25],           // east
        [(F0 + F1) / 2, F1 - W / 2, F1 - F0, true, W / 2 - 0.25],            // north
        [F0 + W / 2, (H + F1) / 2, F1 - H, false, -(W / 2 - 0.25)],          // west
        [(H + F1) / 2, F0 + W / 2, F1 - H, true, -(W / 2 - 0.25)],           // south
      ];
      for (const e of edges) mer(...e);

      // ---- what you bump into ----
      col(F0, F1, F0, F1, FLOOR, { kind: 'tower' });                         // the solid base, and the floor inside it
      col(F1 - W, F1, F0, F1, towerH, { kind: 'tower' });
      col(F0, F1, F1 - W, F1, towerH, { kind: 'tower' });
      col(F0, F0 + W, H, F1, towerH, { kind: 'tower' });
      col(H, F1, F0, F0 + W, towerH, { kind: 'tower' });
      col(F0 + W, F1 - W - 2, B0, F1 - W, towerH, { kind: 'walk', bottom: cy + towerH - 0.4, noProjectile: true, team: this.team });   // the roof deck
      const rail = (x0, x1, z0, z1, ix, iz) => col(x0, x1, z0, z1, towerH + MERLON_H, { kind: 'parapet', noWalk: true, noProjectile: true, bottom: cy + towerH - 0.05, ...this.inward(sx * ix, sz * iz) });
      rail(F1 - 0.55, F1, F0, F1, -1, 0);                                    // keeps you on the roof
      rail(F0, F1, F1 - 0.55, F1, 0, -1);
      rail(F0, F0 + 0.55, H, F1, 1, 0);
      rail(H, F1, F0, F0 + 0.55, 0, 1);
      // the two flights
      const climb = (lo, hi, along) => (x, z) => {
        const l = this.toLocal(x, z);
        const u = Math.min(1, Math.max(0, ((along === 'x' ? sx * l.x : sz * l.z) - lo) / (hi - lo)));
        return u;
      };
      const uA = climb(A0, A1, 'x'), uB = climb(B0, B1, 'z');
      col(A0, F1 - W, SA[0], SA[1], towerH, { kind: 'ramp', heightFn: (x, z) => cy + FLOOR + RISE * uA(x, z) });
      col(SB[0], SB[1], B0, B1, towerH, { kind: 'ramp', heightFn: (x, z) => cy + FLOOR + RISE + RISE * uB(x, z) });

      this.towers.push({ top: this.toWorld(sx * (F1 - 1.2), sz * (F1 - 1.2), towerH + 1.6), sx, sz });   // (where the tower archers' arrows leave: the roof's outer corner)
    }
  }

  buildGate() {
    const M = this.mats;
    const gate = {
      kind: 'gate', isStructure: true, castle: this, team: this.team,
      hp: CASTLE.gateHp, maxHp: CASTLE.gateHp, alive: true, openAmt: 0,
      pos: this.toWorld(0, H - T / 2, gateH / 2), radius: 3.2,
    };
    gate.takeDamage = (amt, attacker, cause) => this.damageGate(amt, attacker, cause);
    const leafGeo = new THREE.BoxGeometry(GW, gateH, 0.45);   // (the gate picture covers each leaf once)
    leafGeo.translate(GW / 2, gateH / 2, 0);
    gate.leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * GW, 0, H - T / 2);
      const leaf = new THREE.Mesh(leafGeo, M.gate);
      leaf.scale.x = -s; // mirror so each leaf extends toward the centre
      pivot.add(shadowed(leaf));
      this.group.add(pivot);
      gate.leaves.push({ pivot, s });
    }
    gate.collider = this.addCollider(-GW, GW, H - T, H, gateH, { kind: 'gate', ref: gate, passTeam: this.team });
    this.gate = gate;
  }

  buildKeep() {
    const hw = keepW / 2;
    this.keep = {
      kind: 'keep', isStructure: true, castle: this, team: this.team,
      hp: CASTLE.keepHp, maxHp: CASTLE.keepHp, alive: true,
      pos: this.toWorld(0, KEEP_Z, 2), radius: hw + 0.6,
    };
    this.keep.takeDamage = (amt, attacker, cause) => this.damageKeep(amt, attacker, cause);
    this.keep.collider = this.addCollider(-hw - 0.4, hw + 0.4, KEEP_Z - hw - 0.4, KEEP_Z + hw + 0.4, keepH, { kind: 'keep', ref: this.keep });
    // spot in front of the keep door that attackers bash at
    this.keepDoor = this.toWorld(0, KEEP_Z + hw + 2.2);
  }

  // --- visual / collider state (shared by the simulation and by network clients) ---
  applyWallVisual(seg) {
    if (this.upg && seg.armorOn !== seg.alive) { seg.armorOn = seg.alive; this.upg.wallsChanged(); }   // the stone Thicken Walls added goes with the wall
    // the battlements go with the merlons: gone once the wall is badly damaged or breached
    const on = seg.alive && seg.hp > seg.maxHp * 0.5;
    seg.parapet.active = on;
    for (const m of seg.merlons) m.active = on;
    let vis;
    if (!seg.alive) {
      seg.collider.top = this.center.y + 0.5;
      vis = 'gone';
    } else {
      seg.collider.top = this.center.y + wallH;
      vis = seg.hp <= seg.maxHp * 0.5 ? 'damaged' : 'full';
    }
    if (seg.vis !== vis) { seg.vis = vis; this.wallsDirty = true; }   // (merged once per frame, however many walls changed)
  }

  applyGateVisual() {
    const gate = this.gate;
    gate.collider.active = gate.alive;
    if (this.upg) this.upg.gateDecorVisible(gate.alive);
    for (const l of gate.leaves) {
      const leaf = l.pivot.children[0];
      if (gate.alive) {
        l.pivot.position.y = 0;
        leaf.rotation.z = 0;
        leaf.material = this.mats.gate;
      } else {
        l.pivot.rotation.y = l.s * 1.2;
        l.pivot.position.y = -0.2;
        leaf.rotation.z = l.s * 0.25;
        leaf.material = this.mats.gateBurnt;
      }
    }
  }

  applyFallenVisual() {
    if (this.burning) return;
    this.burning = true;
    this.fellAt = this.game.time;   // (the ending frames the keep that fell last: see finale.js)
    this.applyBurn(false);
  }
  // A fallen keep: the keep and the towers crumble into a burning ruin (castlegeo.js draws them again as pieces, castlecollapse.js moves the pieces),
  // the roofs are gone, the cloth burnt. `instant`: show the end state at once (a castle that is built again after a graphics change).
  applyBurn(instant = true) {
    this.clothMat.userData.cwFall.value = 1;
    try {
      this.hideKeep();
      this.collapse = new Collapse(this, instant);
      if (instant) this.collapseEnded(this.collapse);
    } catch (e) {
      // (never let a fault in the show stop the match: the keep just stands there, charred, as it used to)
      console.error('keep collapse', e);
      this.collapse = null;
      if (this.keepMesh) {
        this.keepMesh.visible = true;
        if (!this.keepMesh.userData.charred) {
          const c = this.keepMesh.geometry.attributes.color;
          for (let i = 0; i < c.array.length; i++) c.array[i] *= 0.3;
          c.needsUpdate = true;
          this.keepMesh.userData.charred = true;
        }
      }
    }
  }

  partsMaterial(key) { return partsMaterial(key); }   // (for castlecollapse.js)

  // The standing keep and towers go: their stone and roofs are hidden, what they share with the courtyard (timber, metal, glass) is folded to a point
  hideKeep() {
    if (this.keepMesh) this.keepMesh.visible = false;
    if (this.tilesMesh) this.tilesMesh.visible = false;
    if (this.aMesh && this.aRanges) {
      for (const key in this.aRanges) {
        const m = this.aMesh[key];
        if (!m || !this.aRanges[key].length) continue;
        const attr = m.geometry.attributes.position;
        for (const [a, b] of this.aRanges[key]) attr.array.fill(0, a * 3, b * 3);
        attr.needsUpdate = true;
      }
    }
    for (const m of this.upg.towerMeshes) m.visible = false;   // (the shields, archers and ballistas of the tower upgrades)
    this.fire.set('tower', []);
    if (this.staticFires) this.fire.set('static', this.staticFires.filter((f) => !(f[0] === 2 && f[2] > 12 && Math.abs(f[1]) < 8)));   // (the chimneys)
  }

  // what the collapse asks for as it goes (castlecollapse.js); `col` is the Collapse. Effects that the host replicates to guests (dust, sounds with a
  // place) are made by the host only; the rest each screen makes for itself.
  collapseEvent(ev, col) {
    const g = this.game, fx = g.fx, host = g.mode !== 'client', fin = g.finale;
    const p = _cp.copy(this.toWorld(ev.x || 0, ev.z || 0, ev.y || 0));
    const near = fin.active && fin.focus === this;
    switch (ev.k) {
      case 'blast':
        fx.flash(p, _gold, 16, 0.6, 1);   // (no shock ring: it faces the camera, so from up high it hangs behind the keep like a halo; the dust bank is the shock wave)
        dustBank(fx, _cq.copy(p).setY(this.center.y + 0.3), 7, 42, 16);
        for (let i = 0; i < 6; i++) fx.smoke(_cq.copy(p).add(_cv.set((Math.random() - 0.5) * 8, 4 + Math.random() * 3, (Math.random() - 0.5) * 8)));
        if (host) { fx.dust(_cq.copy(p).setY(this.center.y + 0.3), 46, 8, 'stone'); g.audio.play('collapse', p); g.audio.play('boom', p); }
        g.camfx.boom(p, 1);
        if (near) fin.jolt(0.7);
        break;
      case 'tower':
        dustBank(fx, _cq.copy(p).setY(this.center.y + 0.5), 4.5, 22, 11);
        if (host) { fx.dust(_cq.copy(p).setY(this.center.y + 1), 30, 5.5, 'stone'); g.audio.play('collapse', p); }
        g.camfx.boom(p, 0.7);
        if (near) fin.jolt(0.3);
        break;
      case 'column':
        if (host) fx.dust(p, ev.n, ev.s, 'stone');
        break;
      case 'dust':
        if (host) { fx.dust(_cq.copy(p).setY(p.y + 0.3), ev.n, ev.s, 'stone'); if (ev.s > 3.3) g.audio.play('thud', p); }
        if (near && ev.s > 2.4) fin.jolt(0.12);
        break;
      case 'burst':
        fireBurst(fx, p, ev.s);
        g.camfx.boom(p, ev.s / 5);
        break;
      case 'ignite':
        this.igniteRuin(col);
        break;
      default: break;
    }
  }

  // the stumps burn: flames and smoke columns on their tops, and the spots the smoke comes from afterwards
  igniteRuin(col) {
    if (this.smokeSpots) return;
    const list = col.fires();
    this.fire.set('ruin', list.fires);
    this.smokeSpots = list.spots.map(([x, y, z]) => this.toWorld(x, z, y));
  }
  collapseEnded(col) {
    this.igniteRuin(col);
  }

  // --- damage (simulation only) ---
  // (`cause` names an ability or weapon the caller knows ('Fireball'); the attacker says the rest: see highlights.js)
  damageWall(seg, amt, attacker, cause) {
    if (!seg.alive || !seg.breakable || this.fallen) return;
    highlights.hit(seg, Math.min(amt, seg.hp), attacker, cause);   // (what the blow really took, not the overkill)
    seg.hp -= amt;
    this.game.fx.dust(seg.pos, 10, 2.5);
    if (seg.hp <= 0) {
      seg.hp = 0;
      seg.alive = false;
      this.game.fx.dust(seg.pos, 40, 6);
      this.game.audio.play('collapse', seg.pos);
      for (const p of seg.posts) if (p.occupant) p.occupant.fallFromWall();
      this.applyWallVisual(seg);
      highlights.down(this.game, seg, attacker, cause);
      this.game.onStructureDestroyed(seg, attacker);
    } else this.applyWallVisual(seg);
  }

  repairWalls() {
    for (const seg of this.walls) {
      if (!seg.breakable) continue;
      seg.maxHp = CASTLE.wallHp * (1 + 0.35 * this.wallLevel);
      seg.hp = seg.maxHp;
      seg.alive = true;
      seg.hl = null;
      this.applyWallVisual(seg);
    }
    this.game.pushOutOfWalls(this);
  }

  damageGate(amt, attacker, cause) {
    const gate = this.gate;
    if (!gate.alive || this.fallen) return;
    highlights.hit(gate, Math.min(amt, gate.hp), attacker, cause);
    gate.hp -= amt;
    this.game.fx.splinters(gate.pos, 6);
    if (gate.hp <= 0) {
      gate.hp = 0;
      gate.alive = false;
      this.applyGateVisual();
      this.gateBar.visible = false;
      this.game.fx.splinters(gate.pos, 40);
      this.game.fx.dust(gate.pos, 25, 4);
      this.game.audio.play('collapse', gate.pos);
      highlights.down(this.game, gate, attacker, cause);
      this.game.onStructureDestroyed(gate, attacker);
    }
  }

  repairGate() {
    const gate = this.gate;
    gate.maxHp = CASTLE.gateHp * (1 + 0.4 * this.gateLevel);
    gate.hp = gate.maxHp;
    gate.hl = null;
    if (!gate.alive) {
      gate.alive = true;
      this.applyGateVisual();
      this.game.pushOutOfGate(this);
    }
    this.setGateLocked(this.gateLocked);
  }

  damageKeep(amt, attacker, cause) {
    const keep = this.keep;
    if (!keep.alive) return;
    highlights.hit(keep, Math.min(amt, keep.hp), attacker, cause);
    keep.hp -= amt;
    if (Math.random() < 0.3) this.game.fx.dust(this.keepDoor.clone().setY(this.keepDoor.y + 2), 4, 1.5);
    if (keep.hp <= 0) {
      keep.hp = 0;
      keep.alive = false;
      highlights.down(this.game, keep, attacker, cause);
      this.fall(attacker);
    }
  }

  repairKeep() {
    this.keep.hp = this.keep.maxHp;
    this.keep.hl = null;
  }

  fall(attacker) {
    if (this.fallen) return;
    this.fallen = true;
    if (this.gate.alive) this.damageGate(1e9, attacker);
    this.applyFallenVisual();
    this.game.onCastleFallen(this, attacker);
  }

  // Bar or unbar the gate. Barred, it stays shut for everyone, your own troops included.
  setGateLocked(locked) {
    this.gateLocked = !!locked;
    this.gate.collider.passTeam = this.gateLocked ? -1 : this.team;
    this.gateBar.visible = this.gateLocked && this.gate.alive;
    this.leverHandle.rotation.x = this.gateLocked ? -0.6 : 0.6;
  }

  // --- network snapshot ---
  netState() {
    const br = this.walls.filter((w) => w.breakable);
    return [
      Math.round(this.gate.hp), Math.round(this.gate.maxHp), this.gate.alive ? 1 : 0,
      Math.round(this.keep.hp), this.keep.maxHp, this.fallen ? 1 : 0,
      this.wallLevel, this.gateLevel, this.towerLevel,
      br.map((w) => Math.round(w.hp)), Math.round(br[0] ? br[0].maxHp : 0), this.gateLocked ? 1 : 0,
      this.gateWant ? 1 : 0,   // (whether the host's gate is swinging open: a guest's own soldiers lack the orders to work it out)
      downMask(this),          // (which tower archers are down: towerarchers.js)
    ];
  }

  applyNet(a) {
    const g = this.gate;
    g.hp = a[0]; g.maxHp = a[1];
    const gAlive = !!a[2];
    if (gAlive !== g.alive) { g.alive = gAlive; this.applyGateVisual(); }
    this.keep.hp = a[3]; this.keep.maxHp = a[4];
    if (a[5] && !this.fallen) { this.fallen = true; this.keep.alive = false; this.applyFallenVisual(); }
    this.wallLevel = a[6]; this.gateLevel = a[7]; this.towerLevel = a[8];
    if (!!a[11] !== this.gateLocked) this.setGateLocked(!!a[11]);
    this.netGateOpen = !!a[12];
    applyDownMask(this, a[13] | 0);
    const br = this.walls.filter((w) => w.breakable);
    br.forEach((w, i) => {
      const hp = a[9][i];
      const alive = hp > 0;
      const wasDamaged = w.hp <= w.maxHp * 0.5;
      w.maxHp = a[10];
      const changed = alive !== w.alive || (hp <= w.maxHp * 0.5) !== wasDamaged;
      w.hp = hp;
      w.alive = alive;
      if (changed) this.applyWallVisual(w);
    });
  }

  // --- per-frame ---
  update(dt, time) {
    this.upg.tick(dt, time);
    updateWind(time);   // (every castle sets the one shared clock the cloth waves by)
    this.fire.update();
    if (this.wallsDirty) this.rebuildWalls();
    // gate opens for friendly troops when no enemy is close
    const gate = this.gate;
    if (gate.alive) {
      const want = !this.gateLocked && this.game.gateShouldOpen(this) ? 1 : 0;
      gate.openAmt += (want - gate.openAmt) * Math.min(1, dt * 3);
      for (const l of gate.leaves) l.pivot.rotation.y = -l.s * 1.35 * gate.openAmt;
    }
    if (this.collapse && !this.collapse.done) {
      try { this.collapse.update(dt, this); } catch (e) {   // (a fault in the show must never stop the game: the keep goes to its end state at once)
        console.error('keep collapse', e);
        try { this.collapse.settle(); } catch (err) { this.collapse.done = true; }
      }
    }
    if (this.smokeSpots && Math.random() < dt * 8) this.game.fx.smoke(this.smokeSpots[(Math.random() * this.smokeSpots.length) | 0]);
  }
}
