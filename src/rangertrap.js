// How the Ranger's Snare Trap looks, on every screen: an iron ring with two toothed jaws held open and a short stake, thrown in an arc
// from the Ranger's hand to where it lands, then lying open on the ground. When it springs the jaws slam shut and it is gone a moment
// later; a trap that is taken up (its time is over, or its Ranger set another) sinks away. The rules are in classes.js (Abilities.trap).
// Each trap is three meshes of two shared geometries and the shared iron material: no new shader programs.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { materials } from './materials.js';

let BASE = null, JAW = null;

// the ring, the stake and the plate in the middle; the jaws are a half ring with teeth standing up from it, hinged at y 0 along x
function geometries() {
  if (BASE) return;
  const ring = new THREE.TorusGeometry(0.34, 0.028, 6, 22);
  ring.rotateX(Math.PI / 2); ring.translate(0, 0.03, 0);
  const plate = new THREE.CylinderGeometry(0.11, 0.12, 0.03, 10);
  plate.translate(0, 0.02, 0);
  const stake = new THREE.CylinderGeometry(0.018, 0.012, 0.32, 5);
  stake.rotateZ(1.1); stake.translate(0.47, 0.06, 0);
  const link = new THREE.TorusGeometry(0.05, 0.012, 4, 8);
  link.translate(0.38, 0.03, 0);
  BASE = mergeGeometries([ring, plate, stake, link].map((g) => g.toNonIndexed()));
  const half = new THREE.TorusGeometry(0.33, 0.022, 5, 12, Math.PI);
  half.rotateX(Math.PI / 2);    // (a half ring lying flat, on the +z side)
  const parts = [half.toNonIndexed()];
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) / 7) * Math.PI;
    const tooth = new THREE.ConeGeometry(0.025, 0.09, 4);
    tooth.translate(Math.cos(a) * 0.33, 0.045, Math.sin(a) * 0.33);
    parts.push(tooth.toNonIndexed());
  }
  JAW = mergeGeometries(parts);
}

export class TrapLooks {
  constructor(game) {
    this.g = game;
    this.list = [];   // { root, jawA, jawB, from, to, t, flight, state: 'fly' | 'open' | 'shut' | 'gone', k }
  }

  make() {
    geometries();
    const M = materials();
    const root = new THREE.Group();
    const base = new THREE.Mesh(BASE, M.iron);
    const jawA = new THREE.Mesh(JAW, M.iron), jawB = new THREE.Mesh(JAW, M.iron);
    jawB.rotation.y = Math.PI;
    root.add(base, jawA, jawB);
    for (const m of [base, jawA, jawB]) m.castShadow = true;
    this.g.scene.add(root);
    return { root, jawA, jawB };
  }

  // thrown from `from` (the Ranger's eyes) to `to` on the ground; it lands after `flight` seconds
  throw(from, to, yaw, flight) {
    const o = this.make();
    // (it leaves the hand: an arm's length out toward where it is going and down at the hip, not from between the eyes)
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1, out = Math.min(0.9, l * 0.5);
    o.from = from.clone(); o.from.x += (dx / l) * out; o.from.z += (dz / l) * out; o.from.y -= 0.6;
    o.to = to.clone(); o.t = 0; o.flight = flight; o.state = 'fly'; o.k = 0;
    o.root.rotation.set(0, yaw, 0);
    o.root.position.copy(o.from);
    this.list.push(o);
    this.setOpen(o, 0.2);
  }

  setOpen(o, k) {   // 0 shut, 1 wide open (the jaws lie flat)
    const a = (1 - k) * 1.45;
    o.jawA.rotation.x = -a; o.jawB.rotation.x = a;   // (jaw B is turned half round first: the same swing is the other way about x)
  }

  // the trap nearest to a spot (the other screens only know where it lay)
  near(pos, within = 1.6) {
    let best = null, bd = within * within;
    for (const o of this.list) {
      if (o.state === 'shut' || o.state === 'gone') continue;
      const dx = o.to.x - pos.x, dz = o.to.z - pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  snap(pos) {
    const o = this.near(pos);
    if (!o) return;
    o.state = 'shut'; o.t = 0;
    o.root.position.copy(o.to);
  }

  gone(pos) {
    const o = this.near(pos);
    if (o) { o.state = 'gone'; o.t = 0; }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt;
      if (o.state === 'fly') {
        const u = Math.min(1, o.t / o.flight);
        o.root.position.lerpVectors(o.from, o.to, u);
        o.root.position.y += Math.sin(u * Math.PI) * 1.4;   // (a short lob)
        o.root.rotation.x = (1 - u) * 6.5;                   // ... turning over in the air
        if (u >= 1) {
          o.state = 'open'; o.t = 0; o.root.rotation.x = 0; o.root.position.copy(o.to);
          this.g.fx._dust(o.to.clone().setY(o.to.y + 0.1), 4, 0.5, '');
        }
      } else if (o.state === 'open') {
        this.setOpen(o, Math.min(1, 0.2 + o.t * 4));   // (it springs open as it settles)
      } else if (o.state === 'shut') {
        this.setOpen(o, Math.max(0, 1 - o.t * 14));
        if (o.t > 2.2) { this.remove(i); continue; }
        if (o.t > 1.6) o.root.position.y = o.to.y - (o.t - 1.6) * 0.5;   // (and sinks away)
      } else {
        o.root.position.y = o.to.y - o.t * 0.4;
        if (o.t > 1) { this.remove(i); continue; }
      }
    }
  }

  remove(i) {
    const o = this.list[i];
    this.g.scene.remove(o.root);
    this.list.splice(i, 1);
  }
}
