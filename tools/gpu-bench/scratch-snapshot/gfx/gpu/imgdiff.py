"""usage: python3 -I imgdiff.py a.png b.png [diff_out.png]  -> mean abs difference (0..255), signed mean per channel, p99, and an amplified difference picture"""
import sys
from PIL import Image, ImageChops

a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size:
    print('size mismatch', a.size, b.size)
    sys.exit(1)
d = ImageChops.difference(a, b)
px = list(d.getdata())
n = len(px)
mad = sum(sum(p) for p in px) / (3.0 * n)
mx = max(max(p) for p in px)
flat = sorted(max(p) for p in px)
p99 = flat[int(n * 0.99)]
pa = list(a.getdata())
pb = list(b.getdata())
sm = [sum(pb[i][c] - pa[i][c] for i in range(n)) / n for c in range(3)]
print('meanabs %.2f  p99 %d  max %d  signed(b-a) r%.2f g%.2f b%.2f' % (mad, p99, mx, sm[0], sm[1], sm[2]))
if len(sys.argv) > 3:
    amp = d.point(lambda v: min(255, v * 6))
    amp.save(sys.argv[3])
