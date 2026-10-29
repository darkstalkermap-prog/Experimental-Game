// DFGApprox / multiscatter of three r160 for a dielectric (F0 0.04, F90 1): what the rough-surface shortcut has to reproduce.
const sat = (x) => Math.min(Math.max(x, 0), 1);
function dfg(nv, r) {
  const c0 = [-1, -0.0275, -0.572, 0.022], c1 = [1, 0.0425, 1.04, -0.04];
  const R = c0.map((c, i) => r * c + c1[i]);
  const a004 = Math.min(R[0] * R[0], Math.pow(2, -9.28 * nv)) * R[0] + R[1];
  return [-1.04 * a004 + R[2], 1.04 * a004 + R[3]];
}
function full(nv, r, f0 = 0.04, albedo = 0.4) {
  const [a, b] = dfg(nv, r);
  const FssEss = f0 * a + 1.0 * b, Ess = a + b, Ems = 1 - Ess;
  const Favg = f0 + (1 - f0) * 0.047619, Fms = FssEss * Favg / (1 - Ems * Favg);
  const single = FssEss, multi = Fms * Ems, total = single + multi;
  // out = radiance*single + multi*E + albedo*(1-total)*E   (radiance = E for rough, E = blurred irradiance)
  return { single, multi, total, kd: albedo * (1 - total), out: single + multi + albedo * (1 - total) };
}
console.log('r    nv   single  multi   diffuseScale  out(albedo .4)  vs shortcut(0.4*0.98+0.0185)');
for (const r of [0.6, 0.7, 0.8, 0.9, 1.0]) for (const nv of [1.0, 0.7, 0.4, 0.2, 0.1, 0.03]) {
  const f = full(nv, r);
  console.log(r.toFixed(2), nv.toFixed(2), f.single.toFixed(4), f.multi.toFixed(4), (1 - f.total).toFixed(4), f.out.toFixed(4), (0.4 * 0.98 + 0.0185).toFixed(4));
}
