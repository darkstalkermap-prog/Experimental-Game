import sys
p = sys.argv[1]
s = open(p).read()
a = s.index("// ---------------------------------------------------------------- hides")
b = s.index("// ---------------------------------------------------------------- bark")
new = '''// ---------------------------------------------------------------- hides
// the covering of a siege engine's roof: a few large skins of cured hide in browns and greys, fine pebbled grain and wrinkles, sewn together
// with a row of stitches along the seams, stained dark by rain and smoke. 1.3 m per tile.
export function hideSet(size = 256) {
  return once('hide' + size, () => {
    const N = size, rng = mulberry32(41), G = 2, cell = N / G;
    const fx = new Float32Array(G * G), fy = new Float32Array(G * G), tone = new Float32Array(G * G), hv = new Float32Array(G * G), hue = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) { fx[i] = 0.2 + rng() * 0.6; fy[i] = 0.2 + rng() * 0.6; tone[i] = rng(); hv[i] = 0.8 + rng() * 0.2; hue[i] = rng(); }
    const grain = fbm(N, N, 64, 2, rng, 0.6), pore = fbm(N, N, 128, 1, rng), wrinkle = fbm(N, N, 6, 3, rng, 0.62), crease = fbm(N, N, 18, 2, rng, 0.55), coarse = fbm(N, N, 3, 3, rng), stain = fbm(N, N, 3, 4, rng, 0.6);
    const color = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
    // cured hide: umber, red-brown, tan, and the odd grey raw skin
    const pal = [[140, 100, 65], [119, 81, 54], [159, 111, 73], [105, 76, 54], [170, 140, 108], [130, 89, 62]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let d1 = 1e9, d2 = 1e9, b1 = 0, p1x = 0, p1y = 0, p2x = 0, p2y = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = (gx + i + G) % G, cy = (gy + j + G) % G, k = cy * G + cx;
        const px = (gx + i + fx[k]) * cell, py = (gy + j + fy[k]) * cell, dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; p2x = p1x; p2y = p1y; d1 = d; b1 = k; p1x = px; p1y = py; } else if (d < d2) { d2 = d; p2x = px; p2y = py; }
      }
      const idx = y * N + x, i4 = idx * 4;
      const e = (d2 - d1) * 0.5, dome = smooth(0, cell * 0.3, e), seam = 1 - smooth(0.6, 3.0, e);
      // pebbled grain, wrinkles and creases of the skin; the seam is sunk, with a rolled lip beside it
      let h = (0.6 + 0.4 * dome) * hv[b1] + (wrinkle[idx] - 0.5) * 0.3 + (crease[idx] - 0.5) * 0.22 + (grain[idx] - 0.5) * 0.22 + (pore[idx] - 0.5) * 0.12;
      h -= seam * 0.4;
      // stitches: dark knots every few pixels along the seam, a little way in from it
      const ax = -(p2y - p1y), ay = p2x - p1x, al = Math.hypot(ax, ay) || 1, s = (x * ax + y * ay) / al;
      const stitch = (e > 3.6 && e < 6.4 && ((s % 9) + 9) % 9 < 2.4) ? 1 : 0;
      if (stitch) h += 0.18;
      const a = pal[Math.floor(tone[b1] * pal.length) % pal.length], b = pal[Math.floor(hue[b1] * pal.length) % pal.length];
      const wet = 0.78 + 0.22 * smooth(0.25, 0.7, coarse[idx]);          // rain-darkened and sun-dried areas
      const sh = (0.88 + (grain[idx] - 0.5) * 0.36 + (wrinkle[idx] - 0.5) * 0.3 + (crease[idx] - 0.5) * 0.2) * wet * (0.78 + 0.22 * smooth(0, 9, e));
      let cr = mix(a[0], b[0], 0.35) * sh, cg = mix(a[1], b[1], 0.35) * sh, cb = mix(a[2], b[2], 0.35) * sh;
      const st = smooth(0.55, 0.85, stain[idx]) * 0.4;                    // smoke and grime
      cr *= 1 - st; cg *= 1 - st * 0.95; cb *= 1 - st * 0.85;
      cr *= 1 - seam * 0.4; cg *= 1 - seam * 0.45; cb *= 1 - seam * 0.45;
      if (stitch) { cr = mix(cr, 44, 0.65); cg = mix(cg, 32, 0.65); cb = mix(cb, 24, 0.65); }
      color[i4] = cr; color[i4 + 1] = cg; color[i4 + 2] = cb; color[i4 + 3] = 255; height[idx] = h;
    }
    return pair(color, height, N, 1.7);
  });
}

'''
s = s[:a] + new + s[b:]
open(p, 'w').write(s)
print('ok')
