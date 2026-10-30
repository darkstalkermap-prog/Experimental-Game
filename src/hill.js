// The hill in the middle of the map. In Conquest it is only scenery (a mound ringed by standing stones, with a banner).
// In King of the Hill it is the prize: a house takes it by standing on it alone, and holds it until a rival takes it back;
// while another house has soldiers on it too it is contested and nothing changes. A house that holds it (and its
// allies) earns gold and the seconds it holds it add up to the win.
// Where the battle is run (single player or the host) update() works it all out; every screen draws it from the state
// the host sends (netState / applyNet).
import * as THREE from 'three';
import { HILL, TEAM_COLORS } from './config.js';
import { allied } from './teams.js';
import { XP } from './heroes.js';
import { band, curtain, fade, SEG } from './aimring.js';

const NEUTRAL = new THREE.Color(0xb9c4d6);   // nobody's: a cool, pale steel
const CLASH = new THREE.Color(0xff6a4a);
const COLORS = TEAM_COLORS.map((c) => new THREE.Color(c));   // (the houses' colours of this match: reset() reads them again, teams.js setPalette)

// the first house on a side stands for it (a side's houses share one score)
const leader = (team) => [0, 1, 2, 3].find((t) => allied(t, team));

export class Hill {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3(0, game.physics.terrainHeight(0, 0), 0);
    this.reset();
    this.build();
  }

  reset() {
    COLORS.forEach((c, i) => c.setHex(TEAM_COLORS[i]));
    this.lastKey = '';
    this.owner = -1;        // the house holding it (-1: nobody yet)
    this.capturer = -1;     // the house taking it, and how far it has got
    this.progress = 0;
    this.contested = false;
    this.present = [0, 0, 0, 0];   // soldiers of each house on it now
    this.held = [0, 0, 0, 0];      // seconds each side has held it (kept under the side's first house)
    this.goldT = 0;
    this.warned = new Set();
  }

  get live() { return this.g.objective === 'koth'; }
  get active() { return this.live && this.g.state === 'playing'; }

  // ---------- the rules (single player and host) ----------
  update(dt) {
    const g = this.g;
    if (!this.active) return;
    const n = [0, 0, 0, 0];
    const R = HILL.radius;
    g.grid.query(this.pos.x, this.pos.z, R + 1, (u) => {
      if (!u.alive || u.isCrew || u.drive) return;
      if (Math.hypot(u.pos.x - this.pos.x, u.pos.z - this.pos.z) > R || Math.abs(u.pos.y - this.pos.y) > 6) return;
      n[u.team] += u.isHero ? 2 : u.isGiant ? 4 : 1;
    });
    this.present = n;
    // the houses on it, grouped into sides
    const sides = [];
    for (let t = 0; t < 4; t++) {
      if (!n[t] || g.factions[t].eliminated) continue;
      const s = sides.find((x) => allied(x.team, t));
      if (s) s.n += n[t]; else sides.push({ team: t, n: n[t] });
    }
    if (this.owner >= 0 && g.factions[this.owner].eliminated) { this.owner = -1; this.progress = 0; this.capturer = -1; }
    this.contested = sides.length > 1;
    if (sides.length === 1) {
      const s = sides[0];
      if (this.owner >= 0 && allied(this.owner, s.team)) this.melt(dt * 2);          // the holders are there: a rival's capture fades fast
      else if (this.capturer >= 0 && !allied(this.capturer, s.team)) {                 // somebody else was taking it: undo that first
        this.melt(dt * 2);
      } else {
        this.capturer = s.team;
        this.progress += (dt * (1 + HILL.perHead * (Math.min(s.n, HILL.maxHeads) - 1))) / HILL.capture;
        if (this.progress >= 1) this.take(s.team);
      }
    } else if (!sides.length) this.melt(dt);

    // holding it: gold now, and in King of the Hill the seconds count toward the win
    if (this.owner >= 0 && !this.contested) {
      const k = leader(this.owner);
      this.held[k] += dt;
      this.goldT += dt * HILL.income;
      if (this.goldT >= 10) {   // in lumps, so the gold pops don't flicker
        this.goldT -= 10;
        for (const f of g.factions) if (!f.eliminated && allied(f.team, this.owner)) g.credit(f.team, 10);
      }
      this.checkWin(k);
    }
  }

  melt(amount) {
    this.progress = Math.max(0, this.progress - amount * HILL.melt);
    if (this.progress === 0) this.capturer = -1;
  }

  take(team) {
    const g = this.g;
    const from = this.owner;
    this.owner = team;
    this.capturer = -1;
    this.progress = 0;
    const name = (t) => g.factions[t].name;
    g.announce((v) => {
      if (allied(v, team)) return v === team ? 'Your house has taken the hill!' : `${name(team)} has taken the hill, for you and them.`;
      return `${name(team)} has taken the hill${from >= 0 && allied(v, from) ? ' from you' : ''}.`;
    }, team, team);
    g.audio.play('horn', this.pos);
    // the heroes who stood on it for their house are paid for taking it
    for (const h of g.humans) {
      if (h.alive && allied(h.team, team) && Math.hypot(h.pos.x - this.pos.x, h.pos.z - this.pos.z) < HILL.radius + 4) h.gainXp(XP.hill, 'hill');
    }
  }

  // King of the Hill: the first side to have held it for long enough wins
  checkWin(k) {
    const g = this.g, left = HILL.target - this.held[k];
    for (const m of [60, 30, 10]) {
      if (left <= m && !this.warned.has(`${k}:${m}`)) {
        this.warned.add(`${k}:${m}`);
        g.announce((v) => (allied(v, k) ? `You hold the hill: ${m} seconds to victory.` : `${g.factions[k].name} holds the hill: ${m} seconds to their victory!`), k, 'all');
      }
    }
    if (left <= 0) {
      const f = g.factions[k];
      const mate = g.sides && g.sides.some((s) => s.length > 1 && s.includes(k));
      g.endGame(k, `${mate ? 'The alliance of ' + f.name : f.name} held the hill for ${Math.floor(HILL.target / 60)}:${String(HILL.target % 60).padStart(2, '0')} and is crowned King of the Hill.`);
    }
  }

  // an AI house keeps a few men on the hill (King of the Hill only): does it want another?
  squadSize(team) { return this.g.units.reduce((n, u) => n + (u.alive && u.team === team && u.hillDuty ? 1 : 0), 0); }
  wantsSquad(f) {
    const quota = Math.min(HILL.squadMax, HILL.squad + Math.floor(this.g.round / 3));
    return this.squadSize(f.team) < quota;
  }
  // send this soldier up to the hill to hold it, standing on his own house's side
  sendSquad(u) {
    const c = this.g.castles[u.team].center;
    const dx = c.x - this.pos.x, dz = c.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    u.hillDuty = true;
    u.slot = this.squadSize(u.team);
    u.setOrder('hold');
    u.orderData = { pos: new THREE.Vector3(this.pos.x + (dx / l) * 5, this.pos.y, this.pos.z + (dz / l) * 5), yaw: Math.atan2(-dx, -dz) };
  }

  // ---------- what is sent to the other screens ----------
  netState() {
    const r = (x) => Math.round(x * 10) / 10;
    return [this.owner, this.capturer, Math.round(this.progress * 1000) / 1000, this.contested ? 1 : 0, ...this.held.map(r), ...this.present];
  }
  applyNet(a) {
    if (!a) return;
    [this.owner, this.capturer, this.progress] = a;
    this.contested = !!a[3];
    for (let i = 0; i < 4; i++) { this.held[i] = a[4 + i]; this.present[i] = a[8 + i]; }
  }

  // ---------- how it looks ----------
  build() {
    const g = this.g, phys = g.physics, R = HILL.radius, P = this.pos;
    if (phys.war) return;   // (War Mode's bowl has no hill: an open floor)
    const mat = (o, depthTest = true) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false, depthTest });
    this.group = new THREE.Group();
    // the rings lie on the ground: every vertex is lifted to the height of the land under it
    const lay = (geo, lift) => {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, phys.terrainHeight(pos.getX(i), pos.getZ(i)) + lift);
      return geo;
    };
    this.rimMat = mat(0.8);
    this.rimMat.depthTest = false;
    this.discMat = mat(0.1);
    this.arcMat = mat(0.9);
    this.arcMat.depthTest = false;
    this.wallMat = mat(0.3);
    this.wallMat.map = fade();
    this.beamMat = mat(0.07);
    this.rim = new THREE.Mesh(lay(band(R - 0.7, R, 1), 0.2), this.rimMat);
    this.disc = new THREE.Mesh(lay(band(0.5, R - 0.7, 4), 0.18), this.discMat);
    this.arc = new THREE.Mesh(lay(band(R - 2.2, R - 0.9, 1), 0.24), this.arcMat);   // fills up as a house takes it
    const wall = curtain(R);
    const wp = wall.attributes.position, nw = SEG + 1;
    for (let i = 0; i < nw; i++) {
      const h = phys.terrainHeight(wp.getX(i), wp.getZ(i));
      wp.setY(i, h + 0.05); wp.setY(nw + i, h + 2.4);
    }
    this.wall = new THREE.Mesh(wall, this.wallMat);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.1, 70, 12, 1, true), this.beamMat);
    this.beam.position.y = P.y + 35;
    for (const m of [this.rim, this.disc, this.arc, this.wall, this.beam]) { m.frustumCulled = false; m.renderOrder = 5; this.group.add(m); }
    this.arc.geometry.setDrawRange(0, 0);
    // the banner on its plinth
    const stone = new THREE.MeshStandardMaterial({ color: 0x8f8a7e, roughness: 0.95, flatShading: true });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 0.5, 14), stone);
    plinth.position.set(0, P.y + 0.1, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 8.2, 8), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 }));
    pole.position.set(0, P.y + 4.2, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.8, roughness: 0.35 }));
    knob.position.set(0, P.y + 8.4, 0);
    this.flagGeo = new THREE.PlaneGeometry(3.4, 2.1, 12, 1);
    this.flagGeo.translate(1.7, 0, 0);
    this.flagMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
    this.flag = new THREE.Mesh(this.flagGeo, this.flagMat);
    this.flag.position.set(0.12, P.y + 7.2, 0);
    this.flagBase = Float32Array.from(this.flagGeo.attributes.position.array);
    for (const m of [plinth, pole, knob, this.flag]) { m.castShadow = true; this.group.add(m); }
    g.scene.add(this.group);
    // the pole is solid (the plinth is low enough to step onto)
    phys.add({ minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, top: P.y + 8, kind: 'stone' });
    this.lastKey = '';
  }

  // every frame, on every screen
  visual(dt) {
    if (!this.group) return;
    const t = this.g.time;
    const live = this.live;
    for (const m of [this.rim, this.disc, this.arc, this.wall, this.beam]) m.visible = live;   // in Conquest only the banner stands there
    const owner = this.owner >= 0 ? COLORS[this.owner] : NEUTRAL;
    const key = `${this.owner}|${this.capturer}|${this.contested ? 1 : 0}`;
    const pulse = 0.8 + 0.2 * Math.sin(t * 6);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.flagMat.color.copy(owner);
    }
    const tint = this.contested ? CLASH : owner;
    for (const m of [this.rimMat, this.discMat, this.wallMat, this.beamMat]) m.color.copy(tint);
    this.rimMat.opacity = (this.contested ? 0.95 : 0.7) * (this.contested ? pulse : 1);
    this.wallMat.opacity = this.contested ? 0.5 * pulse : 0.3;
    this.arcMat.color.copy(this.capturer >= 0 ? COLORS[this.capturer] : owner);
    this.arc.geometry.setDrawRange(0, this.capturer >= 0 ? Math.floor(Math.min(1, this.progress) * SEG) * 6 : 0);
    // the flag ripples
    const p = this.flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = this.flagBase[i * 3];
      p.setZ(i, Math.sin(x * 1.7 - t * 4.5) * 0.09 * x);
    }
    p.needsUpdate = true;
    this.flag.rotation.y = Math.sin(t * 0.5) * 0.25;
  }
}
