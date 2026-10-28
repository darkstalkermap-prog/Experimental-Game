// Snapshot interpolation: keep the two latest samples and show the world slightly in the past,
// blending between them, so movement is smooth even though updates arrive ~10 times a second.
let DELAY = 0.12;
export function setInterpDelay(d) { DELAY = d; }
const now = () => performance.now() / 1000;
export class Interp {
  constructor() { this.a = null; this.b = null; }
  push(x, y, z, yaw, extra = 0) {
    const s = { t: now(), x, y, z, yaw, extra };
    const teleported = this.b && Math.hypot(x - this.b.x, z - this.b.z) > 12;
    this.a = teleported ? s : this.b || s;
    this.b = s;
  }
  sample(out) {
    const { a, b } = this;
    if (!b) return false;
    const span = Math.max(0.03, b.t - a.t);
    const k = a === b ? 1 : Math.max(0, Math.min(1.25, (now() - DELAY - a.t) / span));
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    let dy = b.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    out.yaw = a.yaw + dy * Math.min(1, k);
    out.extra = b.extra;
    return true;
  }
}

