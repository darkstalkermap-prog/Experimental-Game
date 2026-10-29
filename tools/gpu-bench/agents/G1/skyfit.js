// Port of the analytic sky (atmosphere.js ATM_GLSL + the ENV ground) and a fit study: blurred sky B(n) vs SH9 reconstruction vs cosine irradiance.
const SUN = (() => { const v = [-0.55, 0.42, 0.45]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const srgb = (c) => c.map((x) => Math.pow(x, 2.2));
const hg = (mu, g) => { const g2 = g * g; return (1 - g2) / (12.5663706 * Math.pow(Math.max(1 + g2 - 2 * g * mu, 1e-4), 1.5)); };
const TINT = [1.0, 0.80, 0.55];
function haze(d) {
  const y = clamp(d[1], 0, 1), mu = clamp(d[0] * SUN[0] + d[1] * SUN[1] + d[2] * SUN[2], -1, 1);
  const zenith = srgb([0.27, 0.46, 0.79]), mid = srgb([0.44, 0.64, 0.91]), low = srgb([0.68, 0.82, 0.96]), hor = srgb([0.84, 0.90, 0.95]);
  let sky = mix(hor, low, smooth(0, 0.10, y));
  sky = mix(sky, mid, smooth(0.06, 0.42, y));
  sky = mix(sky, zenith, smooth(0.30, 1.0, y));
  sky = sky.map((x) => x * (0.86 + 0.28 * mu * mu));
  const glow = hg(mu, 0.70) * 0.50 + Math.pow(Math.max(mu, 0), 3) * 0.14;
  sky = sky.map((x, i) => x + TINT[i] * glow * (1 - 0.45 * Math.sqrt(y)));
  const gh = srgb([0.95, 0.74, 0.50]);
  sky = sky.map((x, i) => x + gh[i] * Math.pow(Math.max(mu, 0), 1.5) * 0.20 * (1 - smooth(0, 0.30, y)));
  return sky;
}
const GROUND = srgb([0.42, 0.40, 0.30]).map((x) => x * 0.42);
function envSky(d) { return mix(haze(d), GROUND, smooth(0.02, -0.12, d[1])); }
module.exports = { envSky, haze, SUN, GROUND };

if (require.main === module) {
  // Fibonacci sphere
  const N = 6000, pts = [];
  for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963; pts.push([r * Math.cos(a), y, r * Math.sin(a)]); }
  const L = pts.map(envSky);
  const sigma = Number(process.argv[2] || 0.582);
  const blur = (c) => { let s = [0, 0, 0], w = 0; for (let j = 0; j < N; j++) { const p = pts[j]; const cs = clamp(c[0] * p[0] + c[1] * p[1] + c[2] * p[2], -1, 1); const th = Math.acos(cs); const k = Math.exp(-0.5 * (th / sigma) * (th / sigma)); w += k; s[0] += L[j][0] * k; s[1] += L[j][1] * k; s[2] += L[j][2] * k; } return s.map((x) => x / w); };
  const B = pts.map(blur);
  // real SH basis up to l=2
  const Y = (n) => { const [x, y, z] = n; return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)]; };
  const proj = (F) => { const c = Array.from({ length: 9 }, () => [0, 0, 0]); for (let i = 0; i < N; i++) { const b = Y(pts[i]); for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) c[k][ch] += F[i][ch] * b[k] * 4 * Math.PI / N; } return c; };
  const recon = (c, n) => { const b = Y(n); const o = [0, 0, 0]; for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) o[ch] += c[k][ch] * b[k]; return o; };
  const cB = proj(B);
  const A = [Math.PI, 2.094395, 2.094395, 2.094395, 0.785398, 0.785398, 0.785398, 0.785398, 0.785398];
  const cL = proj(L);
  const irr = (n) => { const b = Y(n); const o = [0, 0, 0]; for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) o[ch] += cL[k][ch] * A[k] * b[k] / Math.PI; return o; };
  let se = 0, mx = 0, seI = 0, cnt = 0;
  const rows = [];
  for (let i = 0; i < N; i += 7) {
    const t = B[i], r = recon(cB, pts[i]), e = irr(pts[i]);
    const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const rel = (lum(r) - lum(t)) / lum(t), relI = (lum(e) - lum(t)) / lum(t);
    se += rel * rel; seI += relI * relI; mx = Math.max(mx, Math.abs(rel)); cnt++;
  }
  console.log('sigma', sigma, 'SH9 fit of B: rms rel err', Math.sqrt(se / cnt).toFixed(4), 'max', mx.toFixed(4), '| cosine irradiance vs B: rms rel diff', Math.sqrt(seI / cnt).toFixed(4));
  const show = (name, n) => { const l = Math.hypot(...n); n = n.map((x) => x / l); const t = blur(n), r = recon(cB, n), e = irr(n); console.log(name.padEnd(14), 'B', t.map((x) => x.toFixed(3)).join(','), ' SH9', r.map((x) => x.toFixed(3)).join(','), ' cosIrr', e.map((x) => x.toFixed(3)).join(',')); };
  show('up', [0, 1, 0]); show('horiz-sun', [-0.55, 0, 0.45]); show('horiz-away', [0.55, 0, -0.45]); show('horiz-side', [0.45, 0, 0.55]); show('down', [0, -1, 0]); show('45deg-sun', [-0.55, 1, 0.45]); show('45deg-away', [0.55, 1, -0.45]); show('-30deg', [0.3, -0.5, 0]);
}
