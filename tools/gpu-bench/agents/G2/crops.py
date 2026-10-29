"""usage: python3 -I crops.py out.png x0,y0,x1,y1 scale cols file1 [file2 ...]
Crops the same box from each image, upscales it (nearest neighbour), labels each with its file name stem and tiles them in a grid of `cols` columns."""
import sys, os
from PIL import Image, ImageDraw

out, box, scale, cols = sys.argv[1], [int(v) for v in sys.argv[2].split(',')], int(sys.argv[3]), int(sys.argv[4])
files = sys.argv[5:]
tiles = []
for f in files:
    im = Image.open(f).convert('RGB').crop(box)
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(im)
    label = os.path.splitext(os.path.basename(f))[0]
    d.rectangle([0, 0, 8 * len(label) + 6, 14], fill=(0, 0, 0))
    d.text((3, 2), label, fill=(255, 255, 0))
    tiles.append(im)
w, h = tiles[0].size
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 4, rows * h + (rows - 1) * 4), (255, 0, 255))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * (w + 4), (i // cols) * (h + 4)))
sheet.save(out)
print(out, sheet.size)
