// Light weather of a biome (biomes.js `weather`): flakes drifting down in the snow, banks of mist over the marsh, dust blowing across the desert. It is
// written into the smoke layer of the effects (fx.js: the same soft sprites, the same draw call; slots of their own at the top of it), a few particles at a time in a column of air round the
// camera; once written, a particle costs the CPU nothing (the vertex shader moves it). Only at medium quality and above, scaled by Q.particles.
import { F, R } from './fxtex.js';
import { Q } from './quality.js';
import { active } from './biomes.js';

const rr = (a, b) => a + (b - a) * Math.random();

// rate: particles written per second at Q.particles 1; life in seconds; size in metres (start, end); wind: the way it drifts (m/s) and how much it falls
const KINDS = {
  snow: { rate: 70, life: 9, size: [0.025, 0.05], end: 0.8, frame: F.SOFT, ramp: R.POP, alpha: 0.95, wind: [1.1, -1.5, 0.5], gust: 0.45, swirl: 0.55, height: 15, radius: 26 },
  mist: { rate: 2.0, life: 20, size: [9, 13], end: 1.15, frame: F.FLAT, ramp: R.STEAM, alpha: 0.4, wind: [0.5, 0, 0.2], gust: 0.25, swirl: 0, height: 1.4, radius: 70, lift: 0.24 },
  dust: { rate: 36, life: 7, size: [0.03, 0.07], end: 0.8, frame: F.SOFT, ramp: R.DUST, alpha: 0.75, wind: [3.4, 0.12, 1.4], gust: 1.2, swirl: 0.9, height: 5, radius: 30 },
};

export class Weather {
  constructor(game) {
    this.game = game;
    this.kind = KINDS[active.def.weather] || null;
    this.acc = 0;
    this.filled = false;
    this.cx = undefined; this.cz = 0;   // where the camera was last frame
  }

  spawn(L, cam) {
    const K = this.kind, a = Math.random() * 6.2832, r = K.radius * Math.sqrt(Math.random());
    const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
    // (lift: a share of the sprite's size that it floats above the ground. A sprite half sunk into the ground is cut off along it in a hard
    // line, and the mist banks read as grey blobs with a straight edge; lifted, their soft lower edge just meets the ground)
    const s0 = rr(K.size[0], K.size[1]);
    const y = this.game.physics.terrainHeight(x, z) + 0.2 + (K.lift || 0) * s0 + Math.random() * K.height;
    const life = K.life * rr(0.8, 1.2), s = s0;
    const o = L.spawnReserved(K.frame, K.ramp, x, y, z, K.wind[0] + rr(-K.gust, K.gust), K.wind[1] * rr(0.7, 1.3), K.wind[2] + rr(-K.gust, K.gust), life, s, s * K.end);
    L.tint(o, 1, 1, 1, K.alpha * rr(0.6, 1));
    L.motion(o, 0, 0, K.swirl * rr(0.5, 1.2), 0);
  }

  update(dt, cam) {
    if (!this.kind) return;
    const L = this.game.fx.alpha;
    const rate = Q.level >= 1 ? this.kind.rate * Q.particles : 0;
    // (the first frame already has the air full of it, and so has the frame after a cut of the camera: a respawn, the camera of the ending)
    const cut = this.cx !== undefined && (cam.x - this.cx) * (cam.x - this.cx) + (cam.z - this.cz) * (cam.z - this.cz) > 1600;
    this.cx = cam.x; this.cz = cam.z;
    if ((!this.filled || cut) && rate > 0) { this.filled = true; this.acc = rate * this.kind.life * 0.9; }
    this.acc += rate * dt;
    const n = Math.min(Math.floor(this.acc), 700);
    this.acc = rate > 0 ? Math.min(this.acc - n, 2) : 0;
    for (let i = 0; i < n; i++) this.spawn(L, cam);
  }
}
