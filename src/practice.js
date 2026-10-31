// The practice courtyard: a walled yard where heroes and soldiers can be tried out on training dummies.
//
// The hero can be any class at any level with any talents; soldiers of every kind can be sent in at any veteran rank and
// training tier, and they charge the dummies. A dummy has no health to lose: it only counts what it takes (per second, the
// last blow, the best, the total) and shows it above its head, so builds and soldiers can be compared with numbers. The
// panel that drives all this is practiceui.js; the game itself only knows `game.practice` (no waves, no rival lords, no
// win or loss) and `game.court`.
import * as THREE from 'three';
import { PRACTICE, UNIT_TYPES, RANKS, PLAYER, practiceSite } from './config.js';
import { materials, box, shadowed } from './materials.js';
import { Unit } from './units.js';
import { CLASSES } from './classes.js';
import { talentsOf } from './talents.js';
import { XP_FOR_LEVEL, MAX_LEVEL } from './heroes.js';

const STANDS = ['ladder', 'row', 'crowd', 'far', 'wall'];
// where the dummies stand, in metres from the hero's start line (x across the yard, z along it)
const LAYOUT = {
  ladder: () => [-8, -4, 0, 4, 8].map((x, i) => ({ x, z: 9, tier: i })),            // one of every armour, side by side
  row: (tier) => [-8, -4, 0, 4, 8].map((x) => ({ x, z: 17, tier })),                // five alike: the fair comparison
  crowd: (tier) => { const out = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out.push({ x: (c - 1.5) * 1.7, z: 28 + r * 1.7, tier }); return out; },
  far: (tier) => [{ x: -6, z: 46, tier }, { x: 6, z: 46, tier }, { x: 0, z: 56, tier }],   // for the bow, spells and the volley
  // up on the far wall's top, the furthest the yard goes: heads over the stone for the Sniper Shot, a wall walk for the Leap to reach
  wall: (tier) => [-8, 0, 8].map((x) => ({ x, z: 2 * PRACTICE.hd - PRACTICE.start + PRACTICE.wallT / 2, y: PRACTICE.wallH, tier })),
};
export const STAND_NAMES = { ladder: 'Ladder', row: 'Row of five', crowd: 'Crowd of twelve', far: 'Far targets', wall: 'On the far wall' };
export const STAND_HINTS = {
  ladder: 'one of each armour tier, side by side (9 m)',
  row: 'five of the chosen armour in a line (17 m): the fair test for soldiers',
  crowd: 'twelve close together (28 m): area spells, the Whirlwind, the volley',
  far: 'three far off (46 and 56 m): bow, spells and the volley',
  wall: 'three up on the far wall (63 m): the Sniper Shot, and a Leap up onto the wall',
};

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const DUMMY_LOOK = [
  { body: 0xd8c27a, rough: 1, metal: 0 },        // straw
  { body: 0x8d939b, rough: 0.55, metal: 0.55 },  // mail
  { body: 0xc9cdd5, rough: 0.3, metal: 0.85 },   // plate
  { body: 0x4c525c, rough: 0.35, metal: 0.8 },   // champion: dark steel
  { body: 0x6a5a38, rough: 0.3, metal: 0.9 },    // fortress: bronze
];

// A training post with a body on it. The armour tier shows in what the body is made of. Faces +z.
function buildDummyModel(tier) {
  const M = materials(), look = DUMMY_LOOK[tier];
  const body = new THREE.MeshStandardMaterial({ color: look.body, roughness: look.rough, metalness: look.metal, flatShading: tier === 0 });
  const trim = tier >= 3 ? M.gold : M.iron;
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  const add = (geo, mat, x, y, z, parent = tilt) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  add(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 14), M.stoneDark, 0, 0.07, 0, root);                 // the foot
  add(new THREE.CylinderGeometry(0.075, 0.09, 2.05, 8), M.wood, 0, 1.03, 0, tilt);                      // the post
  add(new THREE.BoxGeometry(1.2, 0.1, 0.1), M.wood, 0, 1.58, 0);                                         // the arms
  const wide = tier === 4 ? 1.22 : 1;
  const torso = add(new THREE.CylinderGeometry(0.27 * wide, 0.31 * wide, 0.88, 12), body, 0, 1.2, 0);
  torso.scale.z = 0.8;
  for (const y of [0.92, 1.18, 1.44]) {                                                                   // ropes (and plate bands)
    const r = add(new THREE.TorusGeometry(0.3 * wide, 0.022, 6, 16), tier === 0 ? M.rope : trim, 0, y, 0);
    r.rotation.x = Math.PI / 2; r.scale.y = 0.8;
  }
  if (tier >= 1) for (const sx of [-1, 1]) add(new THREE.SphereGeometry(tier === 4 ? 0.2 : 0.14, 8, 6), body, sx * 0.36 * wide, 1.58, 0);   // shoulders
  const head = add(new THREE.SphereGeometry(0.17, 10, 8), tier === 0 ? M.rope : body, 0, 1.86, 0);       // sack or helm
  head.scale.set(1, 1.08, 1);
  if (tier >= 2) add(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12), trim, 0, 1.96, 0);                 // helm band
  if (tier >= 3) { const plume = add(new THREE.ConeGeometry(0.06, 0.34, 6), M.team[1], 0, 2.2, 0); plume.rotation.x = -0.25; }
  if (tier === 4) { const sh = add(new THREE.BoxGeometry(0.46, 0.7, 0.07), body, -0.55, 1.2, 0.18); sh.rotation.y = 0.35; }   // a tower shield
  // the target on the chest: red and white rings
  for (const [r, c] of [[0.2, 0xb52a1e], [0.14, 0xefe6cc], [0.08, 0xb52a1e]]) {
    const d = add(new THREE.CylinderGeometry(r, r, 0.012, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }), 0, 1.32, 0.255 + (r < 0.1 ? 0.012 : r < 0.15 ? 0.006 : 0));
    d.rotation.x = Math.PI / 2;
  }
  shadowed(root);
  return { root, tilt };
}

// the readout above a dummy: its armour and what it has taken
function makeLabel() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 112;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(2.3, 1.0, 1);
  sp.renderOrder = 10;
  return { sp, c, tex, ctx: c.getContext('2d'), shown: '' };
}

export class Dummy extends Unit {
  constructor(game, pos, tier) {
    super(game, 'swordsman', 1, pos, { hp: PRACTICE.dummyHp, armor: PRACTICE.dummies[tier].armor });
    // (the soldier the Unit built is not wanted: a post stands here instead)
    game.scene.remove(this.mesh);
    const m = buildDummyModel(tier);
    this.mesh = new THREE.Group();
    this.mesh.add(m.root);
    this.mesh.rotation.y = Math.PI;                  // the target faces the hero's end of the yard
    this.mesh.position.copy(this.pos);
    this.mesh.userData.unit = this;
    game.scene.add(this.mesh);
    this.model = null;
    this.far = null;
    this.tilt = m.tilt;
    this.isDummy = true;
    this.dummyTier = tier;
    this.name = `${PRACTICE.dummies[tier].name} dummy`;
    this.radius = 0.45;
    this.height = 2.05;
    this.sway = { x: 0, z: 0, vx: 0, vz: 0 };
    this.label = makeLabel();
    this.label.sp.position.set(0, 2.85, 0);
    this.mesh.add(this.label.sp);
    this.mesh.rotation.y = Math.PI;                  // (the label is a sprite: it always faces the camera)
    this.log = [];                                   // [{ t, d }] the blows of the last few seconds
    this.last = 0; this.best = 0; this.total = 0; this.hits = 0;
    this.labelT = 0;
  }

  // Nothing that makes a soldier act: a dummy only stands there and takes it.
  think() {}
  setTier() {}
  setLod() {}
  stagger() {}
  tryBlock() { return false; }
  addGuard() {}
  addHaste() {}
  gainXp() {}

  takeDamage(amount, attacker, info = {}) {
    const g = this.game;
    this.last = amount; this.best = Math.max(this.best, amount); this.total += amount; this.hits++;
    this.log.push({ t: g.time, d: amount });
    // it rocks away from the blow
    if (attacker && attacker.pos) {
      const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z, d = Math.hypot(dx, dz) || 1;
      const k = Math.min(2.4, 0.5 + amount / 45);
      this.sway.vx += (dx / d) * k; this.sway.vz += (dz / d) * k;
    }
    if (g.court) g.court.hit(this, attacker, amount, info);
  }

  // damage per second over the last few seconds
  dps(now) {
    const w = PRACTICE.window;
    while (this.log.length && now - this.log[0].t > w) this.log.shift();
    let s = 0;
    for (const h of this.log) s += h.d;
    return s / w;
  }

  update(dt) {
    const s = this.sway;
    s.vx += (-s.x * 70 - s.vx * 7) * dt; s.vz += (-s.z * 70 - s.vz * 7) * dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    // (the mesh faces the other way, so the tilt axes are mirrored)
    this.tilt.rotation.z = s.x * 0.2;
    this.tilt.rotation.x = -s.z * 0.2;
    this.labelT -= dt;
    if (this.labelT <= 0) {
      this.labelT = 0.25;
      this.paint();
      // (a crowd of twelve would hide one another's readouts: they show only while they are being hit)
      this.label.sp.visible = this.stand !== 'crowd' || this.log.length > 0;
    }
  }

  paint() {
    const L = this.label, now = this.game.time, dps = this.dps(now);
    const tier = PRACTICE.dummies[this.dummyTier];
    const key = `${Math.round(dps)}|${Math.round(this.last)}|${Math.round(this.total)}`;
    if (key === L.shown) return;
    L.shown = key;
    const x = L.ctx;
    x.clearRect(0, 0, 256, 112);
    x.fillStyle = 'rgba(20,16,12,0.78)';
    x.fillRect(4, 4, 248, 104);
    x.strokeStyle = 'rgba(224,180,76,0.7)';
    x.lineWidth = 2;
    x.strokeRect(4, 4, 248, 104);
    x.textAlign = 'center';
    x.fillStyle = '#e0b44c';
    x.font = '600 20px Georgia, serif';
    x.fillText(`${tier.name} · armour ${tier.armor}`, 128, 28);
    x.fillStyle = '#fff3cf';
    x.font = '700 40px Georgia, serif';
    x.fillText(this.hits ? `${dps >= 100 ? Math.round(dps) : dps.toFixed(1)} dps` : '— dps', 128, 70);
    x.fillStyle = '#d9c9a0';
    x.font = '400 18px Georgia, serif';
    x.fillText(this.hits ? `last ${Math.round(this.last)} · best ${Math.round(this.best)} · total ${Math.round(this.total)}` : 'hit me', 128, 96);
    L.tex.needsUpdate = true;
  }

  remove() {
    this.game.scene.remove(this.mesh);
    this.label.tex.dispose();
    this.label.sp.material.dispose();
  }
}

export class PracticeCourt {
  constructor(game) {
    this.g = game;
    this.site = practiceSite();
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.build();
    this.dummies = [];
    this.stands = Object.fromEntries(STANDS.map((s) => [s, false]));
    this.armor = 2;                    // the armour tier the row, the crowd and the far targets get (0 to 4)
    this.pick = { type: 'swordsman', rank: 1, tier: 0, count: 5 };   // what the next "send in" brings
    this.groups = new Map();           // key -> { label, type, rank, tier, total, hits, peak, recent: [] }
    this.hero = { total: 0, hits: 0, last: 0, best: 0, peak: 0, recent: [] };
    this.allTalents = false;
    this.deadT = 0;
    this.onHeroHit = null;             // (dummy, damage) for the floating numbers
  }

  // ------------------------------------------------------------ the yard
  // where the hero stands to begin with, and the point m metres ahead of it
  point(dx, dz) { return new THREE.Vector3(this.site.x + dx, 0, this.site.z - PRACTICE.hd + PRACTICE.start + dz); }
  get startPoint() { return this.point(0, 0); }

  build() {
    const g = this.g, M = materials(), P = PRACTICE, S = this.site, grp = this.group;
    const y0 = S.y;
    const wall = (x0, x1, z0, z1, h, mat = M.stone) => {
      const m = new THREE.Mesh(box(x1 - x0, h, z1 - z0, 4), mat);
      m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
      shadowed(m);
      grp.add(m);
      g.physics.add({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, top: y0 + h, kind: 'yard' });
      return m;
    };
    const ix0 = S.x - P.hw, ix1 = S.x + P.hw, iz0 = S.z - P.hd, iz1 = S.z + P.hd, t = P.wallT;
    wall(ix0 - t, ix1 + t, iz0 - t, iz0, P.wallH);     // south (behind the hero)
    wall(ix0 - t, ix1 + t, iz1, iz1 + t, P.wallH);     // north
    wall(ix0 - t, ix0, iz0, iz1, P.wallH);             // west
    wall(ix1, ix1 + t, iz0, iz1, P.wallH);             // east
    for (const [cx, cz] of [[ix0 - t, iz0 - t], [ix1 + t, iz0 - t], [ix0 - t, iz1 + t], [ix1 + t, iz1 + t]]) {   // corner towers
      wall(cx - 2.2, cx + 2.2, cz - 2.2, cz + 2.2, P.wallH + 2.6, M.stoneDark);
    }
    // merlons along the wall tops
    const spots = [];
    for (let x = ix0 + 1; x < ix1; x += 2.4) { spots.push([x, iz0 - t / 2, 0], [x, iz1 + t / 2, 0]); }
    for (let z = iz0 + 1; z < iz1; z += 2.4) { spots.push([ix0 - t / 2, z, 1], [ix1 + t / 2, z, 1]); }
    const merlon = new THREE.InstancedMesh(box(1.3, 0.95, t * 0.7, 3), M.stone, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, turn], i) => {
      q.setFromAxisAngle(up, turn ? Math.PI / 2 : 0);
      m4.compose(new THREE.Vector3(x, y0 + P.wallH + 0.47, z), q, new THREE.Vector3(1, 1, 1));
      merlon.setMatrixAt(i, m4);
    });
    merlon.castShadow = merlon.receiveShadow = true;
    grp.add(merlon);
    // banners on the north wall
    for (const dx of [-8, 0, 8]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), M.banners[0]);
      b.position.set(S.x + dx, y0 + P.wallH - 2.1, iz1 - 0.05);
      b.rotation.y = Math.PI;
      grp.add(b);
    }
    // distance boards on both side walls and chalk lines across the floor, every ten metres from the start line
    for (let m = 10; m <= 60; m += 10) {
      const z = this.point(0, m).z;
      if (z > iz1 - 2) break;
      const tex = this.signTexture(`${m} m`);
      for (const [x, ry] of [[ix0 + 0.02, Math.PI / 2], [ix1 - 0.02, -Math.PI / 2]]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        s.position.set(x, y0 + 2.4, z); s.rotation.y = ry;
        grp.add(s);
      }
      const line = new THREE.Mesh(new THREE.PlaneGeometry(P.hw * 2, 0.16), new THREE.MeshBasicMaterial({ color: 0xf1e8cf, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      line.rotation.x = -Math.PI / 2; line.position.set(S.x, y0 + 0.02, z);
      grp.add(line);
    }
    const start = new THREE.Mesh(new THREE.PlaneGeometry(P.hw * 2, 0.3), new THREE.MeshBasicMaterial({ color: 0xe0b44c, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    start.rotation.x = -Math.PI / 2; start.position.set(S.x, y0 + 0.025, this.point(0, 0).z + 1.2);
    grp.add(start);
    // a few hay bales and a weapon rack against the south wall, for company
    const hay = new THREE.MeshStandardMaterial({ color: 0xc9ac5a, roughness: 1, flatShading: true });
    for (const [dx, dz] of [[-10.2, -4.4], [-8.4, -4.8], [10.2, -4.4], [8.6, -4.9]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 10), hay);
      b.rotation.z = Math.PI / 2; b.rotation.y = dx * 0.3;
      b.position.set(S.x + dx, y0 + 0.55, this.point(0, dz).z);
      shadowed(b); grp.add(b);
    }
  }

  signTexture(text) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 104;
    const x = c.getContext('2d');
    x.fillStyle = '#3a2a18'; x.fillRect(0, 0, 256, 104);
    x.strokeStyle = '#e0b44c'; x.lineWidth = 5; x.strokeRect(5, 5, 246, 94);
    x.fillStyle = '#f3e6c0'; x.font = '700 52px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 128, 54);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ------------------------------------------------------------ the match
  // a practice match begins: the hero stands at the start line, the stands get their first dummies
  begin() {
    const g = this.g, p = g.player, s = this.startPoint;
    p.spawn(s, 0);
    p.classAt = -99;
    this.resetReadout();
    this.stands.row = true; this.stands.crowd = true; this.stands.far = false; this.stands.ladder = false;
    this.armor = 2;
    this.placeStands();
    g.units = g.units.filter((u) => u.isDummy || !u.alive || u.isHero === false);
  }

  update(dt) {
    const g = this.g, p = g.player;
    const now = g.time, w = PRACTICE.window;
    // a hero who somehow falls gets up again at the start line
    if (!p.alive) {
      this.deadT += dt;
      if (this.deadT > 2.5) { this.deadT = 0; p.spawn(this.startPoint, 0); }
    } else this.deadT = 0;
    // the damage per second of the hero and of each group of soldiers (and their best)
    const roll = (r) => {
      while (r.recent.length && now - r.recent[0].t > w) r.recent.shift();
      let s = 0;
      for (const h of r.recent) s += h.d;
      const dps = s / w;
      if (dps > r.peak) r.peak = dps;
      return dps;
    };
    roll(this.hero);
    for (const grp of this.groups.values()) roll(grp);
  }

  // a dummy was hit: remember who did it
  hit(dummy, attacker, amount, info) {
    const now = this.g.time;
    if (attacker && attacker.isPlayer) {
      const h = this.hero;
      h.total += amount; h.hits++; h.last = amount; h.best = Math.max(h.best, amount);
      h.recent.push({ t: now, d: amount });
      if (this.onHeroHit) this.onHeroHit(dummy, amount, info);
    } else if (attacker && attacker.practiceKey && this.groups.has(attacker.practiceKey)) {
      const grp = this.groups.get(attacker.practiceKey);
      grp.total += amount; grp.hits++;
      grp.recent.push({ t: now, d: amount });
    }
  }

  resetReadout() {
    const clear = (r) => { r.total = 0; r.hits = 0; r.last = 0; r.best = 0; r.peak = 0; r.recent.length = 0; };
    clear(this.hero);
    for (const grp of this.groups.values()) clear(grp);
    for (const d of this.dummies) { d.log.length = 0; d.last = d.best = d.total = d.hits = 0; d.label.shown = ''; }
  }

  // what the panel and the HUD show
  readout() {
    const w = PRACTICE.window, now = this.g.time;
    const sum = (r) => { let s = 0; for (const h of r.recent) if (now - h.t <= w) s += h.d; return s / w; };
    const hero = { dps: sum(this.hero), last: this.hero.last, best: this.hero.best, peak: this.hero.peak, total: this.hero.total, hits: this.hero.hits };
    const groups = [];
    for (const grp of this.groups.values()) {
      const n = this.characters().filter((u) => u.practiceKey === grp.key).length;
      const dps = sum(grp);
      groups.push({ key: grp.key, label: grp.label, n, dps, each: n ? dps / n : 0, peakEach: n ? grp.peak / n : grp.peak, total: grp.total, hits: grp.hits });
    }
    return { hero, groups, soldiersDps: groups.reduce((a, b) => a + b.dps, 0), dummies: this.dummies.length };
  }

  // ------------------------------------------------------------ the hero
  setHeroClass(id) {
    const p = this.g.player;
    if (!CLASSES[id]) return;
    if (id !== p.classId) p.changeClass(id);
    this.refreshHero();
  }

  setHeroLevel(n) {
    const p = this.g.player;
    n = Math.max(1, Math.min(MAX_LEVEL, n | 0));
    p.level = n;
    p.xp = XP_FOR_LEVEL[n];
    p.clearTalents();
    this.refreshHero();
  }

  // every talent of the class at once (to try a whole tree), or none
  setAllTalents(on) {
    this.allTalents = !!on;
    const p = this.g.player;
    p.clearTalents();
    for (const b of ['reflect', 'twin', 'focus']) p.buffs.del(b);
    if (on) { for (const t of talentsOf(p.classId)) p.talents[t.id] = true; p.talentRev++; }
    this.refreshHero();
  }

  // full health, stamina, arrows, potions and ready abilities, with the talents as chosen
  refreshHero() {
    const p = this.g.player;
    if (this.allTalents && !Object.keys(p.talents).length) { for (const t of talentsOf(p.classId)) p.talents[t.id] = true; p.talentRev++; }
    p.refreshStats();
    this.heal();
  }

  heal() {
    const p = this.g.player;
    p.hp = p.maxHp; p.stamina = 100; p.abilCd = { q: 0, r: 0 };
    p.arrows = PLAYER.maxArrows; p.potions = 3; p.lastHurt = -99;
    p.buffs.clear();
  }

  // ------------------------------------------------------------ the dummies
  setArmor(tier) {
    this.armor = Math.max(0, Math.min(PRACTICE.dummies.length - 1, tier | 0));
    this.placeStands();
  }

  toggleStand(name) {
    if (!(name in this.stands)) return;
    this.stands[name] = !this.stands[name];
    this.placeStands();
  }

  // (re)place the dummies of every stand that is switched on
  placeStands() {
    const g = this.g;
    for (const d of this.dummies) { g.scene.remove(d.mesh); d.remove(); }
    g.units = g.units.filter((u) => !u.isDummy);
    this.dummies = [];
    for (const name of STANDS) {
      if (!this.stands[name]) continue;
      for (const s of LAYOUT[name](this.armor)) {
        const at = this.point(s.x, s.z);
        if (s.y) at.y = this.site.y + s.y;
        const d = new Dummy(g, at, s.tier);
        d.stand = name;
        g.units.push(d);
        this.dummies.push(d);
      }
    }
  }

  clearDummies() {
    for (const k of STANDS) this.stands[k] = false;
    this.placeStands();
  }

  // ------------------------------------------------------------ the soldiers
  characters() { return this.g.units.filter((u) => u.practiceKey && u.alive); }

  // What a soldier of this kind, veteran rank and training tier would be (the same numbers the real thing gets).
  preview(type, rank, tier) {
    const t = UNIT_TYPES[type];
    const ranked = !(t.kind === 'hero' || t.giant || t.crew);
    const k = 1 + 0.15 * tier;
    let hp = Math.round(t.hp * k), dmg = t.dmg * k, armor = t.armor;
    if (ranked) for (let r = 2; r <= rank; r++) { hp += hp * RANKS.hp; dmg *= 1 + RANKS.dmg; armor += RANKS.armor; }
    return { name: t.name, hp: Math.round(hp), dmg, armor, range: t.range, cd: t.cd, speed: t.speed, dps: dmg / t.cd, ranked, ranged: !!t.ranged, mounted: !!t.mounted, tiered: !(t.kind === 'hero' || t.crew) };
  }

  groupKey(type, rank, tier) { return `${type}|${rank}|${tier}`; }

  // Send soldiers in: they stand behind the hero's start line and charge the nearest dummy.
  send(type = this.pick.type, count = this.pick.count, rank = this.pick.rank, tier = this.pick.tier) {
    const g = this.g, t = UNIT_TYPES[type];
    if (!t || t.crew) return 0;
    const prev = this.preview(type, rank, tier);
    rank = prev.ranked ? Math.max(1, Math.min(5, rank | 0)) : 1;
    tier = prev.tiered ? Math.max(0, Math.min(5, tier | 0)) : 0;
    count = Math.max(0, Math.min(count | 0, PRACTICE.maxCharacters - this.characters().length));
    const key = this.groupKey(type, rank, tier);
    if (count && !this.groups.has(key)) {
      const stars = rank > 1 ? ` ★${rank}` : '';
      this.groups.set(key, { key, type, rank, tier, label: `${t.name}${stars}${tier ? ` · tier ${tier}` : ''}`, total: 0, hits: 0, peak: 0, recent: [] });
    }
    const k = 1 + 0.15 * tier;
    const back = this.g.player.pos;
    for (let i = 0; i < count; i++) {
      const col = i % 15, row = Math.floor(i / 15);
      const at = this.point((col - 7) * 1.65, -1.5 - row * 1.6);
      const u = new Unit(g, type, g.localTeam, at, { hp: Math.round(t.hp * k), dmg: t.dmg * k });
      u.homeCastle = g.castles[g.localTeam];
      u.army = true;
      u.noXp = true;              // the rank and tier asked for stay as they are
      u.fixedTier = true;
      u.practiceKey = key;
      if (prev.tiered && tier) u.setTier(tier);
      if (prev.ranked) for (let r = 2; r <= rank; r++) { u.rank = r; u.applyRankBonus(); }
      u.yaw = 0;
      u.slot = i;
      u.setOrder('charge');
      g.units.push(u);
    }
    void back;
    return count;
  }

  clearCharacters() {
    const g = this.g;
    for (const u of g.units) if (u.practiceKey) { u.alive = false; u.remove(); }
    g.units = g.units.filter((u) => !u.practiceKey);
    this.groups.clear();
  }
}
