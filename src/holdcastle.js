// Stonecleft's fortress (the map is stonecleft.js): a Castle of another shape, built from the same pieces and played by the same rules. Across the gorge runs
// one long curtain wall from cliff to cliff: in the middle the gatehouse wall and the gate of every castle with its two towers, out from them a wing on
// either side to a tower set into the cliff. Behind the wall a wooden wall walk runs its whole length with four stairs up to it; the yard is the gorge floor;
// at the back, the keep stands on a rock shelf with a ramp up to it. There are no side or back walls: the cliffs are.
// Everything a castle is to the rest of the game is here as on every castle (castle.js): the walls (the wings can be breached, the gatehouse wall cannot), the
// gate and its lever, the towers and their archers, the keep, the posts on the walls, the upgrades, the repairs, the panel's numbers, the fall of the keep.
// What differs is the shape: isInside / inFootprint (the yard is the gorge), the wall walk and the stairs, where the towers stand (castle.js buildTower takes
// an offset), and the keep raised on its shelf (keepShift: upgrades.js and castlecollapse.js move what they draw at the keep by it).
//   castle-local metres as on every castle: x across, z toward the gate (the wall's outer face is at z = CASTLE.H), y up from the yard (stonecleft.js HOLD)
import * as THREE from 'three';
import { Castle } from './castle.js';
import { CASTLE } from './config.js';
import * as G from './castlegeo.js';
import { Parts, place, between } from './parts.js';
import { partsMaterial } from './materials.js';
import { Q } from './quality.js';
import { Cloth } from './castlefx.js';
import { Upgrades } from './upgrades.js';
import { populateHold } from './props.js';
import { HOLD, gorgeHalf, shelfRise } from './stonecleft.js';

const { H, wallH, wallT: T, gateW, gateH, keepW, keepH, towerOff, towerR, towerH, walk: WALK } = CASTLE;
const GW = gateW / 2, TC = H + towerOff, F1 = TC + towerR, IN = H - T, E = IN - WALK, C = G.C;
// castlegeo draws a keep on the floor at KEEP_Z; this one stands on the shelf at HOLD.keepZ
const KS = Object.freeze({ x: 0, y: HOLD.shelf.rise, z: HOLD.keepZ - G.KEEP_Z });
const DECK = HOLD.wing - 0.5;                 // the wall walk runs to this far either side (to the cliffs)
const STAIR = { w: 3, z0: 2.5, z1: E };        // the stairs up to it rise toward the wall, from z0 in the yard to the walk's inner edge
const STAIR_X = HOLD.stairs.flatMap((x) => [-x, x]);
// the posts under the wall walk's inner edge: every 6.4 m or so, clear of the gateway and the stairs
const POSTS = [];
for (let x = -DECK + 1.5; x <= DECK - 1.5 + 0.01; x += (2 * DECK - 3) / 14) {
  if (Math.abs(x) > 3.6 && STAIR_X.every((s) => Math.abs(x - s) > STAIR.w / 2 + 0.6)) POSTS.push(x);
}

// The shelf's face is dressed: a revetment of stone from cliff to cliff with a parapet along its top (nobody falls off the shelf, nobody climbs it), and low
// walls either side of the ramp. (x0..x1: the revetment either side of the ramp, into the rock; z0..z1: its depth, its face standing a little out from the rock's.
// The ramp's walls run from its edge to x0, over the ground's fall from the ramp to the yard: the ground's grid is 2 m, and that fall reaches 6 m out.)
const REV = { x0: 6.2, x1: 31, z0: HOLD.shelf.front - 1.2, z1: HOLD.shelf.front + 0.5, para: 1.05, rail: 0.9 };
// the ramp's height over the yard at castle-local z (stonecleft.js shelfRise: the same ramp)
const rampRise = (lz) => HOLD.shelf.rise * Math.min(1, Math.max(0, (HOLD.ramp.foot - lz) / (HOLD.ramp.foot - HOLD.shelf.front)));

// Parts that draws everything (dx, dy, dz) metres from where it is asked for: castlegeo's tower moved along the wall, its keep moved onto the shelf. The faces
// still cull against each other, and the stone's texture is projected from where it ends up, so its courses line up with the stone round it.
class Moved extends Parts {
  constructor(seed, d) {
    super(seed);
    this.d = d;
    this.mv = new THREE.Matrix4().makeTranslation(d.x, d.y, d.z);
  }
  _box(key, m, x0, x1, y0, y1, z0, z1, color, o) {
    if (m) return super._box(key, new THREE.Matrix4().multiplyMatrices(this.mv, m), x0, x1, y0, y1, z0, z1, color, o);
    const d = this.d;
    return super._box(key, null, x0 + d.x, x1 + d.x, y0 + d.y, y1 + d.y, z0 + d.z, z1 + d.z, color, o);
  }
  add(key, geo, m = null, color, o) { return super.add(key, geo, m ? new THREE.Matrix4().multiplyMatrices(this.mv, m) : this.mv, color, o); }
  quad(key, p0, p1, p2, p3, color, uv, two) {
    const d = this.d, t = (p) => [p[0] + d.x, p[1] + d.y, p[2] + d.z];
    return super.quad(key, t(p0), t(p1), t(p2), t(p3), color, uv, two);
  }
}

// ---------------------------------------------------------------- what the pieces of the hold look like (castlegeo.js draws the rest)
// the four flights up to the wall walk, steps of dressed stone with a kerb either side; and the base of the gate's lever
function stairs(F, d) {
  const N = 14, dz = (STAIR.z1 - STAIR.z0) / N, hw = STAIR.w / 2;
  for (const xs of STAIR_X) {
    for (let i = 0; i < N; i++) {
      F.box('masonry', xs - hw, xs + hw, 0, (wallH * (i + 1)) / N, STAIR.z0 + i * dz, STAIR.z0 + (i + 1) * dz, F.jitter(C.step, 0.05), { skip: 'd' });
    }
    if (d >= 1) for (const s of [-1, 1]) F.box('masonry', xs + s * hw, xs + s * (hw + 0.15), 0, 0.6, STAIR.z0, STAIR.z1, C.plinth, { skip: 'd' });
  }
  F.box('masonry', 5.8 - 0.45, 5.8 + 0.45, 0, 0.9, IN - 5 - 0.3, IN - 5 + 0.3, C.dark, { skip: 'd' });   // the lever's base
}

// the wall walk: planks on joists from cliff to cliff, a rim beam, and the posts with their braces
function deck(A, d) {
  const TB = 'timber';
  A.box(TB, -DECK, DECK, wallH - 0.45, wallH, E, IN, A.jitter(C.wood, 0.05), { grain: 0 });
  if (d >= 1) {
    for (let x = -DECK + 1.2; x < DECK; x += 2.4) A.box(TB, x - 0.1, x + 0.1, wallH - 0.8, wallH - 0.45, E, IN, C.woodDark);
    A.box(TB, -DECK, DECK, wallH - 0.75, wallH - 0.45, E, E + 0.2, C.woodDark);
  }
  for (const x of POSTS) {
    A.box(TB, x - 0.19, x + 0.19, 0, wallH - 0.45, E - 0.19, E + 0.19, A.jitter(C.woodDark, 0.08), { skip: 'd', grain: 1 });
    if (d >= 1) { const br = between(x, wallH - 2.6, E, x, wallH - 0.5, E + 1.1); A.obox(TB, br.m, 0.07, 0.07, br.half, C.woodDark); }
  }
}

// the revetment of the shelf's face (a battered foot, a string course, a parapet with a coping), the walls along the ramp (stepped with it) and two piers
// at its top
function revetment(F, d) {
  const S = HOLD.shelf, R = HOLD.ramp, M = 'masonry', top = S.rise;
  for (const s of [-1, 1]) {
    const xa = s * REV.x0, xb = s * REV.x1;
    F.box(M, xa, xb, -0.4, top + 0.1, REV.z0, REV.z1, F.jitter(C.stone, 0.03), { skip: 'd' });
    F.box(M, xa, xb, top + 0.1, top + REV.para - 0.12, REV.z1 - 0.65, REV.z1, C.stone);                              // the parapet
    if (d >= 1) {
      F.box(M, xa, xb, -0.4, 0.8, REV.z1, REV.z1 + 0.35, C.plinth, { skip: 'd' });                                    // the footing
      F.box(M, xa, xb, 3.1, 3.35, REV.z1, REV.z1 + 0.12, C.dark);                                                      // a string course
      F.box(M, xa, xb, top + REV.para - 0.12, top + REV.para, REV.z1 - 0.72, REV.z1 + 0.07, C.pale);                  // the coping
    }
    // the ramp's walls: a course of stone for every metre of the ramp, each topped a hand's breadth over the ramp beside it
    const x0 = s * R.hw, x1 = s * REV.x0;
    for (let z = R.foot; z > REV.z0 + 1e-6; z -= 1) {
      const z1 = Math.max(REV.z0, z - 1), h = rampRise((z + z1) / 2) + REV.rail;
      F.box(M, x0, x1, -0.4, h, z1, z, F.jitter(C.stone, 0.04), { skip: 'd' });
      if (d >= 1) F.box(M, x0 - s * 0.06, x1 + s * 0.06, h, h + 0.12, z1, z, C.pale);
    }
    // a pier either side of the head of the ramp
    F.box(M, x0, x1, top, top + 2.6, REV.z0, REV.z0 + 0.9, C.stone);
    if (d >= 1) F.box(M, x0 - s * 0.12, x1 + s * 0.12, top + 2.6, top + 2.85, REV.z0 - 0.12, REV.z0 + 1.02, C.pale);
  }
}

// the cobbled way from the gate across the yard, up the ramp and onto the shelf before the keep
const hash = (x, z) => { let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
function way(A, d) {
  const a = A.a('ground'), step = d >= 2 ? 1 : 2;
  const keepFront = HOLD.keepZ + keepW / 2 + 0.4;
  const strip = (x0, x1, z0, z1) => {
    for (let z = z0; z < z1 - 1e-6; z += step) for (let x = x0; x < x1 - 1e-6; x += step) {
      const za = z, zb = Math.min(z1, z + step), xa = x, xb = Math.min(x1, x + step);
      const k = 0.72 + hash(Math.round(x * 3), Math.round(z * 3)) * 0.22, col = [k, k * 0.97, k * 0.9];
      const base = a.pos.length / 3;
      for (const [vx, vz] of [[xa, za], [xb, za], [xb, zb], [xa, zb]]) A._vert(a, vx, shelfRise(vx, vz) + 0.06, vz, 0, 1, 0, vx / 4, vz / 4, col);
      a.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
  };
  strip(-3.5, 3.5, REV.z0, IN);                                  // the yard and the ramp
  strip(-8, 8, keepFront, REV.z0);                               // before the keep's door
}

export class HoldCastle extends Castle {
  // (Castle's constructor calls build: what the shape adds is set there, before anything reads it)
  build() {
    this.sealsGorge = true;   // (nav.js: nobody goes round it)
    this.rampFoot = this.toWorld(0, HOLD.ramp.foot + 0.5);
    this.rampTop = this.toWorld(0, HOLD.shelf.front - 1.5, HOLD.shelf.rise);
    this.keepShift = KS;
    this.archerReach = HOLD.wing + 10;   // (towerarchers.js: the end towers stand far out from the hold's middle)
    this.wallFx = [[-34, H - 1], [-12, H - 1], [12, H - 1], [34, H - 1]];   // (upgradeFx: where the dust goes up when the walls are reinforced, and the barracks)
    this.yardFx = [[-22, 8], [22, 8], [0, -6]];

    // ---- the curtain wall: the gatehouse wall either side of the gate (every castle's, not breakable), and the wings out to the cliffs ----
    this.walls = [];
    this.addWall(-H, -GW, H - T, H, 0, 1, false);
    this.addWall(GW, H, H - T, H, 0, 1, false);
    const [a, b, c] = HOLD.wingSegs;
    for (const s of [-1, 1]) for (const [u0, u1] of [[a, b], [b, c]]) this.addWall(Math.min(s * u0, s * u1), Math.max(s * u0, s * u1), H - T, H, 0, 1, true, false);
    this.buildGateway();
    // ---- the towers: the gate towers (every castle's front corner towers) and the end towers, set against the cliffs ----
    this.towers = [];
    this.buildTower(-1, 1);
    this.buildTower(1, 1);
    for (const s of [-1, 1]) this.buildTower(s, 1, s * (HOLD.endTower - TC), 0);
    this.buildKeep();

    // ---- the wall walk, from cliff to cliff, its posts, and the stairs up to it ----
    const cy = this.center.y;
    this.addCollider(-DECK, DECK, E, IN, wallH, { kind: 'walk', bottom: cy + wallH - 0.5, noProjectile: true, team: this.team });
    for (const x of POSTS) this.addCollider(x - 0.22, x + 0.22, E - 0.22, E + 0.22, wallH - 0.5, { kind: 'post', noWalk: true, noProjectile: true });
    for (const xs of STAIR_X) {
      this.addCollider(xs - STAIR.w / 2, xs + STAIR.w / 2, STAIR.z0, STAIR.z1, wallH, {
        kind: 'ramp',
        heightFn: (x, z) => cy + wallH * Math.min(1, Math.max(0, (this.toLocal(x, z).z - STAIR.z0) / (STAIR.z1 - STAIR.z0))),
      });
    }
    // ---- the shelf's revetment and parapet, and the walls along the ramp (the rock is the floor up there: physics.js reads it from the ground) ----
    const R = HOLD.ramp;
    for (const s of [-1, 1]) {
      this.addCollider(Math.min(s * REV.x0, s * REV.x1), Math.max(s * REV.x0, s * REV.x1), REV.z0, REV.z1, HOLD.shelf.rise + REV.para, { kind: 'yard' });
      this.addCollider(Math.min(s * R.hw, s * REV.x0), Math.max(s * R.hw, s * REV.x0), REV.z0, R.foot, HOLD.shelf.rise + REV.rail, {
        kind: 'yard', heightFn: (x, z) => cy + rampRise(this.toLocal(x, z).z) + REV.rail,
      });
    }
    this.buildLever();

    // ---- where things happen ----
    this.gatePos = this.toWorld(0, H - T / 2, gateH / 2);
    this.gateOut = this.toWorld(0, H + 5);
    this.gateIn = this.toWorld(0, H - T - 7);
    this.spawnPoint = this.toWorld(0, 6);
    this.defendPts = [];   // inside the gate, and round the foot of the ramp
    for (let row = 0; row < 3; row++) for (let i = -3; i <= 3; i++) this.defendPts.push(this.toWorld(i * 2.3, 11 - row * 2.6));
    for (let i = 0; i < 16; i++) this.defendPts.push(this.toWorld(-9 + (i % 8) * 2.6, 2 - Math.floor(i / 8) * 2.2));
    this.buildPosts();
    this.buildVisuals();
    this.barracksLevel = 0;
    this.levies = 0;
    this.upg = new Upgrades(this);
  }

  // the keep, on its shelf at the back of the gorge
  buildKeep() {
    const hw = keepW / 2, kz = HOLD.keepZ, y = KS.y;
    this.keep = {
      kind: 'keep', isStructure: true, castle: this, team: this.team,
      hp: CASTLE.keepHp, maxHp: CASTLE.keepHp, alive: true,
      pos: this.toWorld(0, kz, y + 2), radius: hw + 0.6,
    };
    this.keep.takeDamage = (amt, attacker, cause) => this.damageKeep(amt, attacker, cause);
    this.keep.collider = this.addCollider(-hw - 0.4, hw + 0.4, kz - hw - 0.4, kz + hw + 0.4, y + keepH, { kind: 'keep', ref: this.keep });
    this.keepDoor = this.toWorld(0, kz + hw + 2.2, y);
  }

  // The yard is the gorge floor between the cliffs, from the inner face of the wall back to the shelf's back (the cliffs are its other walls)
  isInside(p, margin = 0) {
    const l = this.toLocal(p.x, p.z);
    return l.z < IN + margin && l.z > HOLD.shelf.back - margin && Math.abs(l.x) < gorgeHalf(l.z) + margin;
  }
  // the yard and the curtain wall
  inFootprint(p, margin = 0) {
    const l = this.toLocal(p.x, p.z);
    return l.z < H + margin && l.z > HOLD.shelf.back - margin && Math.abs(l.x) < Math.max(HOLD.wing, gorgeHalf(Math.min(l.z, IN))) + margin;
  }

  // The way up to the shelf (and down from it) is its ramp: anyone in the yard bound for a place up there (the keep's door, a spot along its walls, a man
  // on the shelf) walks to the ramp's foot and up it, and anyone up there bound for the yard, the wall or the gate comes down the same way. Its face is
  // too steep to climb, so a straight line at it would end with the walker pressed against the rock. (nav.js navigate asks, for anyone inside the hold.)
  climb(pos, goal) {
    const S = HOLD.shelf, R = HOLD.ramp;
    const pz = this.toLocal(pos.x, pos.z), gz = this.toLocal(goal.x, goal.z).z;
    const up = pz.z < S.front - 0.5, want = gz < S.front - 0.5;
    if (up === want) return goal;
    if (up) return Math.hypot(pos.x - this.rampTop.x, pos.z - this.rampTop.z) < 2.5 ? this.rampFoot : this.rampTop;
    const onWay = Math.abs(pz.x) < R.hw - 0.6 && pz.z < R.foot + 3.5;   // (at the foot of the ramp, or on it)
    return onWay ? this.rampTop : this.rampFoot;
  }

  // Racks of arms under the wall walk (Expand Barracks): beside the gate first, then along the wings (upgrades.js reads it)
  rackSpans(L) {
    const out = [];
    const spans = [[4.8, 12], [16.5, 26.5], [28.5, 31], [35.5, 38.5]];
    for (let i = 0; i < Math.min(L, spans.length); i++) out.push([0, 1, -spans[i][1], -spans[i][0]], [0, 1, spans[i][0], spans[i][1]]);
    return out;
  }

  // ---------------------------------------------------------------- what the hold looks like
  buildVisuals() {
    this.clearVisuals();
    const d = Q.detail, g = this.group, seed = this.team * 101 + 5;
    this.detail = d;
    this.props = Q.props;
    // fixed: the stone that always stands (the wall's fixed parts, the stairs, the towers), A: timber, metal and the rest, TR: the towers' roofs;
    // the keep's own pieces (K stone, KA the rest, R its roofs) stand on the shelf and go when it falls (hideKeep)
    const fixed = new Parts(seed + 1), A = new Parts(seed + 2), TR = new Parts(seed + 7), cloth = new Cloth(), fires = [];
    const K = new Moved(seed + 4, KS), KA = new Moved(seed + 5, KS), R = new Moved(seed + 3, KS);
    G.gatehouse(fixed, A, d, fires);
    stairs(fixed, d);
    revetment(fixed, d);
    deck(A, d);
    way(A, d);
    const moved = [];
    for (const t of this.towers) {
      if (!t.ox && !t.oz) { G.tower(fixed, A, TR, t.sx, t.sz, d); continue; }
      const at = { x: t.ox, y: 0, z: t.oz }, m = { F: new Moved(seed + 11, at), A: new Moved(seed + 12, at), R: new Moved(seed + 13, at) };
      G.tower(m.F, m.A, m.R, t.sx, t.sz, d);
      moved.push(m);
    }
    const kf = [];
    G.keep(K, KA, R, d, kf);
    for (const f of kf) { f[1] += KS.x; f[2] += KS.y; f[3] += KS.z; fires.push(f); }   // (its torches and chimneys, on the shelf)
    this.dress(cloth, A, d);
    populateHold(A, fixed, fires, { team: this.team, detail: Math.min(d, Q.props), ground: (x, z) => { const w = this.toWorld(x, z); return Math.max(-2, Math.min(12, this.game.physics.terrainHeight(w.x, w.z) - this.center.y)); } });
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
    // the end towers join the stone and timber that always stand
    for (const m of moved) { m.F.cull([m.A]); fixed.merge(m.F); A.merge(m.A); TR.merge(m.R); }
    this.wallParts = this.walls.map((seg, i) => G.wallParts(seg, d, seed * 31 + i));
    const stays = [fixed, A];
    K.cull(stays);
    fixed.cull([A]);
    A.cull([fixed]);
    for (const w of this.wallParts) for (const P of [w.full, w.damaged, w.gone]) P.cull(stays);
    // where the keep's own timber, metal and glass lie in the shared meshes (the fall folds them away: hideKeep)
    const ranges = { timber: [], metal: [], plain: [] };
    const from = {};
    for (const k in ranges) from[k] = A.a(k).pos.length / 3;
    A.merge(KA);
    for (const k in ranges) { const to = A.a(k).pos.length / 3; if (to > from[k]) ranges[k].push([from[k], to]); }
    this.fixedParts = fixed;
    this.wallMesh = mesh(null, 'masonry', this.mergeWalls(), true);
    this.keepMesh = mesh(K, 'masonry', null, true);
    this.aMesh = { timber: mesh(A, 'timber', null, true), metal: null, plain: null };
    this.tilesMesh = mesh(R, 'roof', null, true);
    this.towerRoofs = mesh(TR, 'roof', null, true);
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

  // banners on the wall either side of the gate, the keep's banner, flags on the four towers and the keep
  dress(cloth, A, d) {
    const wood = C.woodDark;
    for (const s of [-1, 1]) {
      const x = s * 8.5, top = wallH - 1.0, zb = H + 0.5;
      cloth.rect([x - 1.3, top - 5.2, zb], [2.6, 0, 0], [0, 5.2, 0], 'top', { segU: 6, segV: 10, amp: 0.16 });
      A.box('timber', x - 1.45, x + 1.45, top, top + 0.15, zb - 0.08, zb + 0.08, wood);
      for (const k of [-1.2, 1.2]) A.box('timber', x + k - 0.06, x + k + 0.06, top - 0.05, top + 0.1, H, zb, wood);
    }
    const ky = KS.y, kz = G.KEEP_Z + KS.z + keepW / 2 + 0.22;   // the keep's big banner (it burns with the keep: tag 1)
    cloth.rect([-1.5, 6 + ky, kz], [3, 0, 0], [0, 6, 0], 'top', { segU: 6, segV: 10, amp: 0.14, tag: 1 });
    A.box('timber', -1.65, 1.65, 12 + ky, 12.15 + ky, kz - 0.08, kz + 0.08, wood);
    const flag = (x, y, z, size, tag) => {
      A.cyl('metal', 0.06, 0.06, size * 2.6, 6, place(x, y, z), C.iron);
      if (d >= 1) A.add('metal', new THREE.SphereGeometry(0.13, 8, 6), place(x, y + size * 2.6, z), C.gold);
      cloth.flag([x, y + size * 1.6, z], size, tag);
    };
    for (const t of this.towers) {   // (the towers' flags outlast the keep: they stand on the wall)
      if (d >= 1) flag(t.sx * (F1 + 0.55) + t.ox, towerH + 5.2, t.sz * (F1 + 0.55) + t.oz, 0.9, 0);
      else flag(t.sx * (F1 - 0.75) + t.ox, towerH + 0.1, t.sz * (F1 - 0.75) + t.oz, 1.3, 0);
    }
    if (d >= 1) flag(0, keepH + 3.0 + ky, HOLD.keepZ, 2.2, 1); else flag(-keepW / 2 + 1, keepH + 1.2 + ky, HOLD.keepZ + keepW / 2 - 1, 2.2, 1);
  }

  // The keep goes, the wall and its towers stand: its stone and roofs are hidden and its own timber, metal and glass folded away (the tower archers and the
  // braziers on the towers stay; the keep's chimneys go out)
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
    if (this.staticFires) this.fire.set('static', this.staticFires.filter((f) => !(f[2] > KS.y + 2 && Math.abs(f[3] - HOLD.keepZ) < 9 && Math.abs(f[1]) < 9)));
  }

  // the fall plays in the keep's own frame (castlecollapse.js, keepShift): what it asks for in castle-local metres is moved onto the shelf
  collapseEvent(ev, col) {
    super.collapseEvent(ev.k === 'ignite' ? ev : { ...ev, x: (ev.x || 0) + KS.x, y: (ev.y || 0) + KS.y, z: (ev.z || 0) + KS.z }, col);
  }
  igniteRuin(col) {
    if (this.smokeSpots) return;
    const list = col.fires();
    this.fire.set('ruin', list.fires.map((f) => { const o = f.slice(); o[1] += KS.x; o[2] += KS.y; o[3] += KS.z; return o; }));
    this.smokeSpots = list.spots.map(([x, y, z]) => this.toWorld(x + KS.x, z + KS.z, y + KS.y));
  }
}
