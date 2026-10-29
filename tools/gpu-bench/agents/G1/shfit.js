// Weighted least-squares SH9 fit of the blurred analytic sky (sigma 0.582 Gaussian stands in for the PMREM roughness-1 tile).
const { envSky } = require('./skyfit.js');
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const N = 5000, pts = [];
for (let i = 0; i < N; i++) { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963; pts.push([r * Math.cos(a), y, r * Math.sin(a)]); }
const L = pts.map(envSky);
const sigma = 0.582;
const blur = (c) => { let s = [0, 0, 0], w = 0; for (let j = 0; j < N; j++) { const p = pts[j]; const th = Math.acos(clamp(c[0] * p[0] + c[1] * p[1] + c[2] * p[2], -1, 1)); const k = Math.exp(-0.5 * (th / sigma) * (th / sigma)); w += k; s[0] += L[j][0] * k; s[1] += L[j][1] * k; s[2] += L[j][2] * k; } return s.map((x) => x / w); };
const B = pts.map(blur);
const basis = (n) => { const [x, y, z] = n; return [1, y, z, x, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y]; };
// weighted LSQ per channel: minimise sum w (basis . c - B)^2
function solve(wfun) {
  const A = Array.from({ length: 9 }, () => new Array(9).fill(0)), rhs = [[], [], []].map(() => new Array(9).fill(0));
  for (let i = 0; i < N; i++) { const b = basis(pts[i]), w = wfun(pts[i]); for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) A[r][c] += w * b[r] * b[c]; for (let ch = 0; ch < 3; ch++) rhs[ch][r] += w * b[r] * B[i][ch]; } }
  const gauss = (M, v) => { const n = 9, a = M.map((row, i) => [...row, v[i]]); for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r; [a[i], a[p]] = [a[p], a[i]]; for (let r = i + 1; r < n; r++) { const f = a[r][i] / a[i][i]; for (let c = i; c <= n; c++) a[r][c] -= f * a[i][c]; } } const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = a[i][n]; for (let c = i + 1; c < n; c++) s -= a[i][c] * x[c]; x[i] = s / a[i][i]; } return x; };
  return [0, 1, 2].map((ch) => gauss(A, rhs[ch]));
}
const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
function report(name, coef, region) {
  let se = 0, mx = 0, cnt = 0, mxd = 0;
  for (let i = 0; i < N; i++) { if (!region(pts[i])) continue; const b = basis(pts[i]); const r = [0, 1, 2].map((ch) => b.reduce((s, v, k) => s + v * coef[ch][k], 0)); const rel = (lum(r) - lum(B[i])) / lum(B[i]); se += rel * rel; mx = Math.max(mx, Math.abs(rel)); cnt++; mxd = Math.max(mxd, Math.abs(lum(r) - lum(B[i]))); }
  console.log(name.padEnd(34), 'rms rel', Math.sqrt(se / cnt).toFixed(4), 'max rel', mx.toFixed(3), 'max abs', mxd.toFixed(3));
}
const up = (p) => p[1] > -0.15, all = () => true;
for (const [name, w] of [['uniform', () => 1], ['upper x1 lower x0.2', (p) => (p[1] > -0.15 ? 1 : 0.2)], ['upper x1 lower x0.02', (p) => (p[1] > -0.15 ? 1 : 0.02)], ['horizontal band boost', (p) => (p[1] > -0.15 ? 1 + 2 * Math.exp(-p[1] * p[1] * 8) : 0.1)]]) {
  const c = solve(w);
  report(name + ' (upper)', c, up);
  report(name + ' (all)', c, all);
}
