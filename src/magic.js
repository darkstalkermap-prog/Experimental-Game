// Spell effects for the Mage's Fireball and the Cleric's Smite. Fireballs travel in a straight line to where the
// caster aims; walls, keeps and hills stop them. Smite is an instant bolt from the sky (see classes.js).
import * as THREE from 'three';
import { SPELLS } from './config.js';

export class Magic {
  constructor(game) {
    this.game = game;
    this.bolts = [];
    this.flashColor = new THREE.Color();
    this.boltColor = new THREE.Color();
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // caster: a Player. dir must be normalised.
  fireball(caster, from, dir, dmg, radius) {
    const s = SPELLS.fireball;
    this.game.projectiles.fireSpell('fireball', from, dir.clone().multiplyScalar(s.speed), caster.team, dmg, caster, radius);
    this.game.audio.play('fireball', from);
  }

  // Jagged bolt through the given points; fades out quickly.
  showBolt(points, color = 0xcfeaff) {
    const g = this.game;
    this.boltColor.setHex(color);
    const glow = this.boltColor.clone().lerp(new THREE.Color(1, 1, 1), 0.4);
    const verts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const n = Math.max(2, Math.ceil(a.distanceTo(b) / 1.6));
      let prev = a.clone();
      for (let k = 1; k <= n; k++) {
        const q = a.clone().lerp(b, k / n);
        if (k < n) q.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
        verts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        g.fx.glow.emit(q, new THREE.Vector3(), glow, 0.45, 0.18, { alpha: 0.9 });
        prev = q;
      }
      g.fx.zap(b, 8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = this.boltMat.clone();
    mat.color.setHex(color);
    const line = new THREE.LineSegments(geo, mat);
    line.frustumCulled = false;
    g.scene.add(line);
    this.bolts.push({ line, t: 0.22 });
    this.flash(points[points.length - 1], color, 6);
    if (this.onBolt) this.onBolt(points, color);
  }

  // A bright glow burst. (A real light would add lighting cost to every surface on screen.)
  flash(pos, color, intensity) {
    this.flashColor.setHex(color);
    this.game.fx.glow.emit(pos, new THREE.Vector3(), this.flashColor, intensity * 0.9, 0.22, { grow: intensity * 2, alpha: 0.55 });
  }

  update(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      b.line.material.opacity = Math.max(0, b.t / 0.22);
      if (b.t <= 0) {
        this.game.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }
}
