// War Mode's marks in the world, for the lord giving orders (warui.js drives them; nothing here decides anything):
//   selection   a small gold arrowhead over the head of every soldier of the group(s) chosen on the command bar (1 / 2 / 3 / 4), none over the others.
//               One instanced mesh for the whole army (WAR.armyCap instances, one draw call), drawn over everything so it shows through a crowd.
//   aim         while a group is chosen, a ring on the ground where the crosshair meets it: where Move here (F1) sends them.
//   banners     where each group was sent (Move here, Advance, Fall back): a banner in the house's colour with the group's number (1 infantry, 2
//               archers, 3 cavalry) on a ring, as Bannerlord marks a formation's place. Bright while that group is chosen, faint otherwise.
// Made once per world (a rematch on the same ground reuses them) and hidden whenever War Mode is not being fought on screen.
import * as THREE from 'three';
import { WAR, TEAM_CSS, UNIT_TYPES } from './config.js';

const GROUPS = ['inf', 'arch', 'cav'];
const KIND = { archer: 'arch', cavalry: 'cav' };
const groupKey = (u) => (u.isGiant ? 'inf' : KIND[UNIT_TYPES[u.type].kind] || 'inf');
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const tmpD = new THREE.Vector3();

// a ring keeps about the same size on screen: small at the hero's feet, a few metres across far down the field
const ringScale = (cam, x, y, z) => Math.max(0.3, Math.min(2.2, Math.hypot(x - cam.x, y - cam.y, z - cam.z) * 0.018));

function flagTexture(n, css) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = css; x.fillRect(0, 0, 64, 96);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 64, 6); x.fillRect(0, 90, 64, 6);
  x.strokeStyle = '#f3e3b0'; x.lineWidth = 4; x.strokeRect(5, 5, 54, 86);
  x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(String(n), 32, 50);
  x.fillStyle = '#fff6da'; x.fillText(String(n), 32, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Marks {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'warMarks';
    scene.add(this.group);
    const over = (m, order) => { m.frustumCulled = false; m.renderOrder = order; return m; };
    // the arrowheads: a four-sided cone pointing down
    const cone = new THREE.ConeGeometry(0.3, 0.6, 4);
    cone.rotateX(Math.PI);
    const selMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
    this.sel = over(new THREE.InstancedMesh(cone, selMat, WAR.armyCap + 8), 20);
    this.sel.count = 0;
    this.group.add(this.sel);
    // the rings (three banners and the aim) and the banners' poles: instanced, a colour each
    const ring = new THREE.RingGeometry(1.6, 2.1, 32);
    ring.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    this.rings = over(new THREE.InstancedMesh(ring, ringMat, 4), 19);
    this.rings.count = 0;
    for (let i = 0; i < 4; i++) this.rings.setColorAt(i, tmpC.set(i === 3 ? 0xfff2b0 : 0xffd34d));
    this.group.add(this.rings);
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6);
    pole.translate(0, 2.1, 0);
    this.poles = over(new THREE.InstancedMesh(pole, new THREE.MeshBasicMaterial({ color: 0x5a4126, fog: false }), 3), 0);
    this.poles.count = 0;
    this.group.add(this.poles);
    // the banners themselves (a texture each: the group's number on the house's colour)
    const cloth = new THREE.PlaneGeometry(1.1, 1.6);
    cloth.translate(0.6, 3.25, 0);
    this.flags = GROUPS.map(() => {
      const m = new THREE.Mesh(cloth, new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide, transparent: true }));
      m.frustumCulled = false;
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.team = -1;
    this.group.visible = false;
  }

  // the banners in this house's colour (the palette is the match's own)
  colour(team) {
    if (this.team === team && this.css === TEAM_CSS[team]) return;
    this.team = team; this.css = TEAM_CSS[team];
    this.flags.forEach((m, i) => { if (m.material.map) m.material.map.dispose(); m.material.map = flagTexture(i + 1, this.css); m.material.needsUpdate = true; });
  }

  hide() { this.group.visible = false; }

  // every frame while the battle is fought on screen: sel is the bar's group ('inf', 'arch', 'cav', 'all' or null), aim [x, y, z] or null, counts the
  // soldiers left in each group (the bar's)
  update(g, f, sel, aim, t, counts) {
    this.group.visible = true;
    this.colour(f.team);
    const cam = g.camera.position;
    // the arrowheads over the chosen soldiers (none for a group not chosen)
    let n = 0;
    if (sel) {
      const max = this.sel.instanceMatrix.count;
      const bob = Math.sin(t * 4) * 0.12;
      for (const u of g.units) {
        if (n >= max) break;
        if (!u.alive || u.team !== f.team || u.isHero || u.isCrew) continue;
        if (sel !== 'all' && groupKey(u) !== sel) continue;
        const d = Math.hypot(u.pos.x - cam.x, u.pos.y - cam.y, u.pos.z - cam.z);
        const s = Math.max(0.35, Math.min(3.2, d * 0.02));   // (about the same size on screen near and far)
        tmpM.makeScale(s, s, s).setPosition(u.pos.x, u.pos.y + (u.height || 1.8) + 0.45 + 0.35 * s + bob, u.pos.z);
        this.sel.setMatrixAt(n++, tmpM);
      }
    }
    if (this.sel.count !== n || n) { this.sel.count = n; this.sel.instanceMatrix.needsUpdate = true; }
    // the banners where the groups were sent, and the aim
    let r = 0, p = 0;
    GROUPS.forEach((k, i) => {
      const d = f.war.dest[k], o = f.war.plan[k], flag = this.flags[i];
      const on = !!d && (o === 'move' || o === 'forward' || o === 'back') && counts[k] > 0;
      flag.visible = on;
      if (!on) return;
      const y = g.physics.terrainHeight(d.x, d.z);
      const bright = sel === k || sel === 'all';
      flag.material.opacity = bright ? 1 : 0.55;
      flag.position.set(d.x, y, d.z);
      flag.rotation.y = Math.atan2(cam.x - d.x, cam.z - d.z) + Math.sin(t * 1.7 + i) * 0.2;   // (turned to the eye, stirring)
      tmpM.makeTranslation(d.x, y, d.z);
      this.poles.setMatrixAt(p++, tmpM);
      const k = ringScale(cam, d.x, y, d.z);
      tmpM.makeScale(k, 1, k).setPosition(d.x, y + 0.15, d.z);
      this.rings.setMatrixAt(r, tmpM);
      this.rings.setColorAt(r++, tmpC.set(bright ? 0xffd34d : 0xb89a50));
    });
    if (aim) {
      const s = ringScale(cam, aim[0], aim[1], aim[2]) * (0.9 + Math.sin(t * 5) * 0.06);
      tmpM.makeScale(s, 1, s).setPosition(aim[0], aim[1] + 0.15, aim[2]);
      this.rings.setMatrixAt(r, tmpM);
      this.rings.setColorAt(r++, tmpC.set(0xfff2b0));
    }
    this.rings.count = r; this.poles.count = p;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.poles.instanceMatrix.needsUpdate = true;
  }
}

// the marks of this scene (one set per world)
export function warMarks(scene) {
  if (!scene.userData.warMarks) scene.userData.warMarks = new Marks(scene);
  return scene.userData.warMarks;
}

// Where the crosshair meets the ground (the War Mode field has no walls or roofs): marched along the camera's line, then narrowed down -> [x, y, z], or null
// when it looks at the sky or past `far` metres
export function aimGround(g, far = 340) {
  const cam = g.camera, P = g.physics;
  cam.getWorldDirection(tmpD);
  const o = cam.position;
  if (tmpD.y > 0.05) return null;
  let a = 0, step = 2;
  for (let t = step; t <= far; t += step) {
    const x = o.x + tmpD.x * t, y = o.y + tmpD.y * t, z = o.z + tmpD.z * t;
    if (y <= P.terrainHeight(x, z)) {
      let lo = a, hi = t;
      for (let i = 0; i < 8; i++) {
        const m = (lo + hi) / 2, mx = o.x + tmpD.x * m, mz = o.z + tmpD.z * m;
        if (o.y + tmpD.y * m <= P.terrainHeight(mx, mz)) hi = m; else lo = m;
      }
      const x2 = o.x + tmpD.x * hi, z2 = o.z + tmpD.z * hi;
      return [x2, P.terrainHeight(x2, z2), z2];
    }
    a = t;
    if (t > 40) step = 3;
  }
  return null;
}
