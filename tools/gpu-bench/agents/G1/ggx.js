// size of the direct specular lobe of a rough dielectric (r160 BRDF_GGX) next to the Lambert term
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sat = (x) => Math.min(Math.max(x, 0), 1);
function ggx(L, V, N, rough, f0 = 0.04) {
  const alpha = rough * rough, H = norm([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
  const nl = sat(dot(N, L)), nv = sat(dot(N, V)), nh = sat(dot(N, H)), vh = sat(dot(V, H));
  const F = f0 + (1 - f0) * Math.pow(2, (-5.55473 * vh - 6.98316) * vh);
  const a2 = alpha * alpha;
  const gv = nl * Math.sqrt(a2 + (1 - a2) * nv * nv), gl = nv * Math.sqrt(a2 + (1 - a2) * nl * nl);
  const Vis = 0.5 / Math.max(gv + gl, 1e-6);
  const d = nh * nh * (a2 - 1) + 1, D = a2 / (Math.PI * d * d);
  return F * Vis * D;
}
const N = [0, 1, 0];
const cases = [['sun 60deg, view at 60deg opposite (mirror geometry)', norm([0.866, 0.5, 0]), norm([-0.866, 0.5, 0])], ['sun 30deg elev, view 30deg elev same side', norm([0.866, 0.5, 0]), norm([0.866, 0.5, 0])], ['sun 45deg, view 20deg elev opposite', norm([0.7, 0.7, 0]), norm([-0.94, 0.34, 0])], ['grazing view 10deg, sun 60', norm([0.5, 0.866, 0]), norm([-0.985, 0.17, 0])]];
for (const [name, L, V] of cases) {
  for (const r of [0.6, 0.7, 0.8, 0.9, 1.0]) {
    const s = ggx(L, V, N, r), lam = 0.4 / Math.PI;
    console.log(name.padEnd(56), 'r', r.toFixed(2), 'spec', s.toFixed(4), 'lambert(.4)', lam.toFixed(4), 'ratio', (s / lam).toFixed(3));
  }
}
