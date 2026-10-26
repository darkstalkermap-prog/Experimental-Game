// A castle: curtain walls (breakable by siege engines), a gate (breakable by anyone),
// corner towers, the keep (the castle falls when it is destroyed) and ramps to the wall walk.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { CASTLE, TEAM_COLORS } from './config.js';
import { materials, box, shadowed } from './materials.js';

const { H, wallH, wallT: T, gateW, gateH, towerR, towerH, keepW, keepH } = CASTLE;
const GW = gateW / 2;
const KEEP_Z = -6;

function merlonGeos(len, alongX, outer) {
  const geos = [];
  const n = Math.floor(len / 2);
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + 1 + i * 2;
    const g = box(alongX ? 1.1 : 0.5, 1.1, alongX ? 0.5 : 1.1);
    g.translate(alongX ? t : outer, wallH + 0.55, alongX ? outer : t);
    geos.push(g);
  }
  return geos;
}

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
    this.flags = [];
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.rotation.y = this.rot;
    game.scene.add(this.group);
    this.bucket = game.physics.addBucket(site.x, site.z, H + 8);
    this.mats = materials();
    this.build();
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
      const body = box(w, wallH, d);
      body.translate(0, wallH / 2, 0);
      const full = mergeGeometries([body, ...merlonGeos(len, alongX, outer)]);
      const damaged = box(w, wallH - 0.9, d);
      damaged.translate(0, (wallH - 0.9) / 2, 0);
      const mesh = new THREE.Mesh(full, M.stone);
      mesh.position.set(cx, 0, cz);
      shadowed(mesh);
      g.add(mesh);
      const seg = {
        kind: 'wall', isStructure: true, castle: this, team: this.team, breakable,
        hp: CASTLE.wallHp, maxHp: CASTLE.wallHp, alive: true,
        mesh, full, damaged, lx: cx, lz: cz, nx, nz, len, alongX,
        pos: this.toWorld(cx, cz, wallH * 0.5),
        radius: Math.max(w, d) / 2,
        outPt: this.toWorld(cx + nx * 6, cz + nz * 6),
        inPt: this.toWorld(cx - nx * 5.5, cz - nz * 5.5),
        posts: [],
      };
      seg.collider = this.addCollider(x0, x1, z0, z1, wallH, { kind: 'wall', ref: seg });
      seg.takeDamage = (amt, attacker) => this.damageWall(seg, amt, attacker);
      this.walls.push(seg);
      // archer posts along the wall walk
      const n = Math.max(1, Math.floor(len / 4.5));
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + len * (i + 0.5) / n;
        const lx = alongX ? cx + t : cx, lz = alongX ? cz : cz + t;
        seg.posts.push({
          seg, occupant: null,
          pos: this.toWorld(lx, lz, wallH),
          base: this.toWorld(lx - nx * 4, lz - nz * 4),
          front: nz === 1,
        });
      }
    }

    // ---- gate lintel ----
    const lintel = box(gateW + 0.2, wallH - gateH, T);
    lintel.translate(0, gateH + (wallH - gateH) / 2, H - T / 2);
    const lintelMesh = new THREE.Mesh(mergeGeometries([lintel, ...merlonGeos(gateW, true, T / 2 - 0.25).map((m) => m.translate(0, 0, H - T / 2))]), M.stone);
    g.add(shadowed(lintelMesh));
    this.addCollider(-GW, GW, H - T, H, wallH, { bottom: this.center.y + gateH, kind: 'lintel' });
    // arch trim
    const trim = new THREE.Mesh(box(0.6, gateH, T + 0.4), M.stoneDark);
    for (const s of [-1, 1]) {
      const t2 = trim.clone();
      t2.position.set(s * (GW + 0.3), gateH / 2, H - T / 2);
      g.add(shadowed(t2));
    }

    // ---- gate ----
    this.buildGate();

    // ---- corner towers ----
    this.towers = [];
    const towerGeo = new THREE.CylinderGeometry(towerR, towerR * 1.12, towerH, 18, 1);
    towerGeo.translate(0, towerH / 2, 0);
    const uv = towerGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * towerH / 4);
    const crownGeo = new THREE.CylinderGeometry(towerR + 0.45, towerR + 0.3, 1.0, 18);
    crownGeo.translate(0, towerH + 0.5, 0);
    const mer = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = box(1.0, 1.0, 0.5);
      m.rotateY(-a);
      m.translate(Math.cos(a) * (towerR + 0.2), towerH + 1.5, Math.sin(a) * (towerR + 0.2));
      mer.push(m);
    }
    const towerFull = mergeGeometries([towerGeo, crownGeo, ...mer]);
    const roofGeo = new THREE.ConeGeometry(towerR + 0.9, 5.5, 18);
    roofGeo.translate(0, towerH + 2.75 + 0.8, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const t = new THREE.Mesh(towerFull, M.stone);
      t.position.set(sx * H, 0, sz * H);
      g.add(shadowed(t));
      if (sz === -1) {
        const roof = new THREE.Mesh(roofGeo, M.roof);
        roof.position.copy(t.position);
        g.add(shadowed(roof));
        this.addFlag(sx * H, towerH + 6.3, sz * H, 1.4);
      } else {
        this.addFlag(sx * H, towerH + 1.5, sz * H, 1.2);
      }
      const r = towerR * 0.92;
      this.addCollider(sx * H - r, sx * H + r, sz * H - r, sz * H + r, towerH, { kind: 'tower' });
      this.towers.push({ top: this.toWorld(sx * H, sz * H, towerH + 1.6) });
    }

    // ---- keep ----
    this.buildKeep();

    // ---- ramps up to the front wall walk ----
    for (const s of [-1, 1]) {
      const lo = 15.5, hi = 4;
      // solid stone stairs (the collider below is a smooth ramp)
      const steps = [];
      const N = 12, w = (lo - hi) / N;
      for (let i = 0; i < N; i++) {
        const h = (wallH * (i + 1)) / N;
        const st = box(w, h, 3);
        st.translate(s * (lo - (i + 0.5) * w), h / 2, H - T - 1.5);
        steps.push(st);
      }
      const ramp = new THREE.Mesh(mergeGeometries(steps), M.stoneDark);
      g.add(shadowed(ramp));
      const cy = this.center.y;
      this.addCollider(Math.min(s * hi, s * lo), Math.max(s * hi, s * lo), H - T - 3, H - T, wallH, {
        kind: 'ramp',
        heightFn: (x, z) => {
          const l = this.toLocal(x, z);
          const t = Math.min(1, Math.max(0, (lo - Math.abs(l.x)) / (lo - hi)));
          return cy + wallH * t;
        },
      });
    }

    // ---- hanging banners on the front wall ----
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), M.banners[this.team]);
      b.position.set(s * 8.5, wallH - 3.0, H + 0.06);
      g.add(b);
    }

    // ---- courtyard props ----
    const crate = new THREE.Mesh(box(1.1, 1.1, 1.1, 1.1), M.plank);
    const props = [[-12, -14], [-13.3, -14.2], [-12.6, -12.8], [13, -15], [12, -9]];
    for (const [x, z] of props) {
      const c = crate.clone();
      c.position.set(x, 0.55, z);
      c.rotation.y = x * 0.37;
      g.add(shadowed(c));
    }
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
    for (const [x, z] of [[14, -12], [14.8, -11.2], [-14.6, -9]]) {
      const b = new THREE.Mesh(barrelGeo, M.plank);
      b.position.set(x, 0.55, z);
      g.add(shadowed(b));
    }

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
    for (const x of [-1.5, 1.5]) {
      this.posts.unshift({ seg: null, occupant: null, pos: this.toWorld(x, H - T / 2, wallH), base: this.toWorld(x * 3, H - T - 6), front: true });
    }
  }

  buildGate() {
    const M = this.mats;
    const gate = {
      kind: 'gate', isStructure: true, castle: this, team: this.team,
      hp: CASTLE.gateHp, maxHp: CASTLE.gateHp, alive: true, openAmt: 0,
      pos: this.toWorld(0, H - T / 2, gateH / 2), radius: 3.2,
    };
    gate.takeDamage = (amt, attacker) => this.damageGate(amt, attacker);
    const leafGeo = box(GW, gateH, 0.45, 3);
    leafGeo.translate(GW / 2, gateH / 2, 0);
    gate.leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * GW, 0, H - T / 2);
      const leaf = new THREE.Mesh(leafGeo, M.wood);
      leaf.scale.x = -s; // mirror so each leaf extends toward the centre
      pivot.add(shadowed(leaf));
      this.group.add(pivot);
      gate.leaves.push({ pivot, s });
    }
    gate.collider = this.addCollider(-GW, GW, H - T, H, gateH, { kind: 'gate', ref: gate, passTeam: this.team });
    this.gate = gate;
  }

  buildKeep() {
    const M = this.mats;
    const g = this.group;
    const hw = keepW / 2;
    const parts = [];
    const body = box(keepW, keepH, keepW);
    body.translate(0, keepH / 2, KEEP_Z);
    parts.push(body);
    // merlons
    for (let i = 0; i < 6; i++) {
      const t = -hw + 0.9 + i * ((keepW - 1.8) / 5);
      for (const [x, z, rx] of [[t, KEEP_Z - hw + 0.25, true], [t, KEEP_Z + hw - 0.25, true], [-hw + 0.25, KEEP_Z + t, false], [hw - 0.25, KEEP_Z + t, false]]) {
        const m = box(rx ? 1 : 0.5, 1.2, rx ? 0.5 : 1);
        m.translate(x, keepH + 0.6, z);
        parts.push(m);
      }
    }
    // buttresses
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const b = box(1.4, keepH - 2, 1.4);
      b.translate(sx * (hw - 0.3), (keepH - 2) / 2, KEEP_Z + sz * (hw - 0.3));
      parts.push(b);
    }
    const keepGeo = mergeGeometries(parts);
    this.keepMesh = new THREE.Mesh(keepGeo, M.stone);
    g.add(shadowed(this.keepMesh));
    // turret
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 6, 14), M.stone);
    turret.position.set(hw - 1, keepH + 3, KEEP_Z - hw + 1);
    g.add(shadowed(turret));
    const troof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 3.5, 14), M.roof);
    troof.position.set(hw - 1, keepH + 7.75, KEEP_Z - hw + 1);
    g.add(shadowed(troof));
    // door + windows
    const door = new THREE.Mesh(box(2.4, 3.6, 0.3, 2.4), M.wood);
    door.position.set(0, 1.8, KEEP_Z + hw + 0.1);
    g.add(door);
    for (const [x, y] of [[-3, 7], [3, 7], [-3, 11], [3, 11], [0, 11]]) {
      const w = new THREE.Mesh(box(0.7, 1.4, 0.2), M.dark);
      w.position.set(x, y, KEEP_Z + hw + 0.05);
      g.add(w);
    }
    // big banner on the keep
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3, 6), M.banners[this.team]);
    banner.position.set(0, 9, KEEP_Z + hw + 0.12);
    g.add(banner);
    this.keepBanner = banner;
    this.addFlag(-hw + 1, keepH + 1.2, KEEP_Z + hw - 1, 2.2);
    this.keepFlag = this.flags[this.flags.length - 1];

    this.keep = {
      kind: 'keep', isStructure: true, castle: this, team: this.team,
      hp: CASTLE.keepHp, maxHp: CASTLE.keepHp, alive: true,
      pos: this.toWorld(0, KEEP_Z, 2), radius: hw + 0.6,
    };
    this.keep.takeDamage = (amt, attacker) => this.damageKeep(amt, attacker);
    this.keep.collider = this.addCollider(-hw - 0.4, hw + 0.4, KEEP_Z - hw - 0.4, KEEP_Z + hw + 0.4, keepH, { kind: 'keep', ref: this.keep });
    // spot in front of the keep door that attackers bash at
    this.keepDoor = this.toWorld(0, KEEP_Z + hw + 2.2);
  }

  addFlag(x, y, z, size) {
    const M = this.mats;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, size * 2.6, 6), M.iron);
    pole.position.set(x, y + size * 1.3, z);
    this.group.add(pole);
    const geo = new THREE.PlaneGeometry(size * 1.8, size, 8, 2);
    geo.translate(size * 0.9, 0, 0);
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: TEAM_COLORS[this.team], side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(x, y + size * 2.6 - size / 2, z);
    this.group.add(flag);
    const base = geo.attributes.position.array.slice();
    this.flags.push({ flag, base, phase: Math.random() * 10, size, pole });
  }

  // --- visual / collider state (shared by the simulation and by network clients) ---
  applyWallVisual(seg) {
    if (!seg.alive) {
      seg.collider.top = this.center.y + 0.5;
      seg.mesh.visible = false;
      if (!seg.rubble) seg.rubble = this.makeRubble(seg);
      return;
    }
    seg.collider.top = this.center.y + wallH;
    if (seg.rubble) { this.group.remove(seg.rubble); seg.rubble = null; }
    seg.mesh.visible = true;
    const damaged = seg.hp <= seg.maxHp * 0.5;
    seg.mesh.geometry = damaged ? seg.damaged : seg.full;
    seg.mesh.material = damaged ? this.mats.stoneDark : this.mats.stone;
  }

  applyGateVisual() {
    const gate = this.gate;
    gate.collider.active = gate.alive;
    for (const l of gate.leaves) {
      const leaf = l.pivot.children[0];
      if (gate.alive) {
        l.pivot.position.y = 0;
        leaf.rotation.z = 0;
        leaf.material = this.mats.wood;
      } else {
        l.pivot.rotation.y = l.s * 1.2;
        l.pivot.position.y = -0.2;
        leaf.rotation.z = l.s * 0.25;
        leaf.material = this.mats.stoneBurnt;
      }
    }
  }

  applyFallenVisual() {
    if (this.burning) return;
    this.keepMesh.material = this.mats.stoneBurnt;
    this.keepBanner.visible = false;
    this.keepFlag.flag.visible = false;
    for (const f of this.flags) f.flag.material.color.multiplyScalar(0.35);
    this.burning = true;
  }

  // --- damage (simulation only) ---
  damageWall(seg, amt, attacker) {
    if (!seg.alive || !seg.breakable || this.fallen) return;
    seg.hp -= amt;
    this.game.fx.dust(seg.pos, 10, 2.5);
    if (seg.hp <= 0) {
      seg.hp = 0;
      seg.alive = false;
      this.game.fx.dust(seg.pos, 40, 6);
      this.game.audio.play('collapse', seg.pos);
      for (const p of seg.posts) if (p.occupant) p.occupant.fallFromWall();
      this.applyWallVisual(seg);
      this.game.onStructureDestroyed(seg, attacker);
    } else this.applyWallVisual(seg);
  }

  makeRubble(seg) {
    const grp = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, this.mats.stoneDark);
      const t = (Math.random() - 0.5) * seg.len * 0.9;
      const off = (Math.random() - 0.5) * 3;
      m.position.set(seg.alongX ? seg.lx + t : seg.lx + off, 0.2 + Math.random() * 0.5, seg.alongX ? seg.lz + off : seg.lz + t);
      m.scale.set(0.6 + Math.random() * 0.9, 0.3 + Math.random() * 0.5, 0.6 + Math.random() * 0.9);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      grp.add(m);
    }
    this.group.add(shadowed(grp));
    return grp;
  }

  repairWalls() {
    for (const seg of this.walls) {
      if (!seg.breakable) continue;
      seg.maxHp = CASTLE.wallHp * (1 + 0.35 * this.wallLevel);
      seg.hp = seg.maxHp;
      seg.alive = true;
      this.applyWallVisual(seg);
    }
    this.game.pushOutOfWalls(this);
  }

  damageGate(amt, attacker) {
    const gate = this.gate;
    if (!gate.alive || this.fallen) return;
    gate.hp -= amt;
    this.game.fx.splinters(gate.pos, 6);
    if (gate.hp <= 0) {
      gate.hp = 0;
      gate.alive = false;
      this.applyGateVisual();
      this.game.fx.splinters(gate.pos, 40);
      this.game.fx.dust(gate.pos, 25, 4);
      this.game.audio.play('collapse', gate.pos);
      this.game.onStructureDestroyed(gate, attacker);
    }
  }

  repairGate() {
    const gate = this.gate;
    gate.maxHp = CASTLE.gateHp * (1 + 0.4 * this.gateLevel);
    gate.hp = gate.maxHp;
    if (!gate.alive) {
      gate.alive = true;
      this.applyGateVisual();
      this.game.pushOutOfGate(this);
    }
  }

  damageKeep(amt, attacker) {
    const keep = this.keep;
    if (!keep.alive) return;
    keep.hp -= amt;
    if (Math.random() < 0.3) this.game.fx.dust(this.keepDoor.clone().setY(this.keepDoor.y + 2), 4, 1.5);
    if (keep.hp <= 0) {
      keep.hp = 0;
      keep.alive = false;
      this.fall(attacker);
    }
  }

  repairKeep() {
    this.keep.hp = this.keep.maxHp;
  }

  fall(attacker) {
    if (this.fallen) return;
    this.fallen = true;
    if (this.gate.alive) this.damageGate(1e9, attacker);
    this.applyFallenVisual();
    this.game.onCastleFallen(this, attacker);
  }

  // --- network snapshot ---
  netState() {
    const br = this.walls.filter((w) => w.breakable);
    return [
      Math.round(this.gate.hp), Math.round(this.gate.maxHp), this.gate.alive ? 1 : 0,
      Math.round(this.keep.hp), this.keep.maxHp, this.fallen ? 1 : 0,
      this.wallLevel, this.gateLevel, this.towerLevel,
      br.map((w) => Math.round(w.hp)), Math.round(br[0] ? br[0].maxHp : 0),
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
    for (const f of this.flags) {
      if (!f.flag.visible) continue;
      const arr = f.flag.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = f.base[i];
        arr[i + 2] = f.base[i + 2] + Math.sin(time * 4 + x * 2.2 + f.phase) * 0.12 * x;
      }
      f.flag.geometry.attributes.position.needsUpdate = true;
    }
    // gate opens for friendly troops when no enemy is close
    const gate = this.gate;
    if (gate.alive) {
      const want = this.game.gateShouldOpen(this) ? 1 : 0;
      gate.openAmt += (want - gate.openAmt) * Math.min(1, dt * 3);
      for (const l of gate.leaves) l.pivot.rotation.y = -l.s * 1.35 * gate.openAmt;
    }
    if (this.burning && Math.random() < dt * 8) {
      const p = this.toWorld((Math.random() - 0.5) * keepW, KEEP_Z + (Math.random() - 0.5) * keepW, keepH + 1);
      this.game.fx.smoke(p);
    }
  }
}
