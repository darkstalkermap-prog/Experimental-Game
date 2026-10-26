// Spells. Like Skyrim's destruction magic they travel in a straight line to where the caster aims;
// walls, keeps and hills stop them. Projectile spells fly through Projectiles; lightning is instant.
import * as THREE from 'three';
import { SPELLS } from './config.js';

const BOLT_GLOW = new THREE.Color(0.6, 0.85, 1.0);

export class Magic {
  constructor(game) {
    this.game = game;
    this.bolts = [];
    // one shared light for explosion / lightning flashes
    this.light = new THREE.PointLight(0xffa040, 0, 26, 1.6);
    game.scene.add(this.light);
    this.lightT = 0;
  }

  // caster: a Player or Unit. dir must be normalised. charge 0..1 (fireball only).
  cast(caster, spell, from, dir, charge = 0, mult = 1) {
    const s = SPELLS[spell];
    if (!s) return;
    const team = caster.team;
    if (spell === 'fireball') {
      const dmg = s.dmg * mult * (1 + 0.6 * charge);
      this.game.projectiles.fireSpell('fireball', from, dir.clone().multiplyScalar(s.speed), team, dmg, caster, s.radius * (1 + 0.3 * charge));
      this.game.audio.play('fireball', from);
    } else if (spell === 'ice') {
      this.game.projectiles.fireSpell('ice', from, dir.clone().multiplyScalar(s.speed), team, s.dmg * mult, caster, 0);
      this.game.audio.play('ice', from);
    } else if (spell === 'lightning') {
      this.lightning(caster, from, dir, s.dmg * mult);
    }
  }

  // Instant bolt along the line of sight, then chains to nearby enemies the target can see.
  lightning(caster, from, dir, dmg) {
    const g = this.game;
    const s = SPELLS.lightning;
    const p = new THREE.Vector3();
    let target = null, end = from.clone().addScaledVector(dir, s.range);
    for (let d = 1; d <= s.range; d += 0.5) {
      p.copy(from).addScaledVector(dir, d);
      if (g.physics.pointHit(p.x, p.y, p.z, caster.team) || p.y < g.physics.terrainHeight(p.x, p.z)) { end = p.clone(); break; }
      const hit = g.projectiles.hitCharacter(p, caster.team, 0.35) || g.siegeAt(p, caster.team);
      if (hit) { target = hit; end = p.clone(); break; }
    }
    const points = [from.clone(), end.clone()];
    if (target) {
      g.damage(target, dmg, caster, { magic: true, ranged: true });
      const hitSet = new Set([target]);
      let last = target;
      for (let i = 0; i < s.chain; i++) {
        const lc = last.chest ? last.chest(new THREE.Vector3()) : last.pos.clone();
        let next = null, bd = s.chainRange;
        g.grid.query(lc.x, lc.z, s.chainRange, (u) => {
          if (!u.alive || u.team === caster.team || hitSet.has(u)) return;
          const d = Math.hypot(u.pos.x - lc.x, u.pos.z - lc.z);
          if (d >= bd) return;
          const uc = u.chest(new THREE.Vector3());
          if (!g.physics.lineClear(lc.x, lc.y, lc.z, uc.x, uc.y, uc.z, caster.team)) return;
          bd = d; next = u;
        });
        if (!next) break;
        hitSet.add(next);
        points.push(next.chest(new THREE.Vector3()));
        g.damage(next, dmg * 0.6, caster, { magic: true, ranged: true });
        last = next;
      }
    }
    this.showBolt(points);
    g.audio.play('zap', from);
  }

  // Jagged bolt through the given points; fades out quickly.
  showBolt(points) {
    const g = this.game;
    const verts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const n = Math.max(2, Math.ceil(a.distanceTo(b) / 1.6));
      let prev = a.clone();
      for (let k = 1; k <= n; k++) {
        const q = a.clone().lerp(b, k / n);
        if (k < n) q.add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
        verts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
        g.fx.glow.emit(q, new THREE.Vector3(), BOLT_GLOW, 0.45, 0.18, { alpha: 0.9 });
        prev = q;
      }
      g.fx.zap(b, 8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xcfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.LineSegments(geo, mat);
    line.frustumCulled = false;
    g.scene.add(line);
    this.bolts.push({ line, t: 0.22 });
    this.flash(points[points.length - 1], 0x9fd8ff, 6);
    if (this.onBolt) this.onBolt(points);
  }

  flash(pos, color, intensity) {
    this.light.position.copy(pos);
    this.light.color.setHex(color);
    this.light.intensity = intensity;
    this.lightT = 0.25;
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
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.pow(0.002, dt);
      if (this.lightT <= 0) this.light.intensity = 0;
    }
  }
}
