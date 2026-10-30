// The cards of the far forest: the trees of a biome painted side by side on one strip (four cells of 128 x 256, the foot of every tree on the
// bottom edge of its cell). foliage.js draws a tree beyond the middle distance as one camera-facing card of this strip.
//
// Why they are painted like this. From 200 m on, a card is 8 to 20 px wide on screen, so its texture is read from the 3rd to 5th level of
// the mip chain, and the alpha test (0.45) drops everything that is thinner than a texel there. The first cards had a pine, an oak and a
// birch as a crown high up on a 5 to 10 px stick (the crown's lowest leaves 40 to 60 % up the card): at that distance the stick was gone
// and what was left hung in front of the slope as a green blob, a lollipop. So every card here
//   - has its crown come down to the ground (the lowest leaves where the middle-distance model, foliagegeo.js lod 1, has them or lower),
//   - has a trunk at least 11 px wide where it meets the ground, flaring towards it, so a stub of it is still there on the farthest card,
//   - keeps its crown 8 px inside its cell, so the mip levels do not blend a neighbour's leaves into its edge.
// The crowns are as wide as the middle-distance models' (see `w` of the species in foliage.js), so a tree keeps its size when it turns into a card.
// The four painters take the colours of a variant (`c`: a, b, lo, mid, hi, trunk, snow) so that the snowy, drab and mossy forms of a biome are the same
// shapes in other colours; the leafless and desert plants of foliage.js follow the same rules (a stub at the foot).

// The card's quad reaches this far (a fraction of its height) below the tree's foot. The strip is clamped there, so the trunk goes on
// into the slope and the foot of a tree on a cross slope is never left hanging above the ground.
export const CARD_FOOT = 0.06;

const H = 256;   // the height of a cell: the trunks run down to this last row

const blob = (g, cx, cy, rx, ry, a, b) => {
  const grd = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
  grd.addColorStop(0, a); grd.addColorStop(1, b);
  g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
};
// a trunk from y0 to the bottom edge, w wide at the top and wb at the foot
export const trunk = (g, ox, y0, w, wb, col) => {
  g.fillStyle = col; g.beginPath();
  g.moveTo(ox + 64 - w / 2, y0); g.lineTo(ox + 64 + w / 2, y0);
  g.lineTo(ox + 64 + wb / 2, H); g.lineTo(ox + 64 - wb / 2, H); g.closePath(); g.fill();
};
// snow lies on the top of a crown clump
const cap = (g, cx, cy, rx, ry) => blob(g, cx, cy - ry * 0.35, rx * 0.9, ry * 0.55, '#f2f6fa', '#b9c6d2');

// spruce: stacked ragged tiers down to a short trunk (snow: a white cap on each tier)
export function paintSpruce(g, ox, c = {}) {
  trunk(g, ox, 214, 11, 17, '#3a2a1c');
  for (let i = 0; i < 7; i++) {
    const t = i / 6, y = 228 - i * 30, w = 52 - 44 * Math.pow(t, 0.85);
    const grd = g.createLinearGradient(ox + 64 - w, 0, ox + 64 + w, 0);
    grd.addColorStop(0, c.lo || '#46803f'); grd.addColorStop(0.45, c.mid || '#2c5e38'); grd.addColorStop(1, c.hi || '#173d2a');
    g.fillStyle = grd; g.beginPath(); g.moveTo(ox + 64, y - 46);
    for (let k = 0; k <= 6; k++) g.lineTo(ox + 64 + w - (k / 6) * 2 * w, y + (k % 2 ? 0 : 7));
    g.closePath(); g.fill();
    if (c.snow) {
      g.fillStyle = 'rgba(232,240,248,0.95)'; g.beginPath(); g.moveTo(ox + 64, y - 46);
      g.lineTo(ox + 64 + w * 0.82, y - 6); g.lineTo(ox + 64 + w * 0.3, y - 10); g.lineTo(ox + 64, y - 3); g.lineTo(ox + 64 - w * 0.3, y - 10); g.lineTo(ox + 64 - w * 0.82, y - 6);
      g.closePath(); g.fill();
    }
  }
}

// pine: a cone of bushy tiers (the middle distance draws a pine as a cone as well)
export function paintPine(g, ox, c = {}) {
  trunk(g, ox, 214, 12, 18, '#6b4a30');
  [[64, 26, 15, 22], [64, 64, 22, 16],
    [44, 102, 24, 16], [84, 102, 24, 16], [64, 98, 26, 18],
    [38, 144, 24, 17], [90, 144, 24, 17], [64, 140, 34, 20],
    [36, 186, 24, 17], [92, 186, 24, 17], [64, 182, 40, 22],
    [40, 218, 28, 15], [88, 218, 28, 15], [64, 214, 36, 19]].forEach(([x, y, rx, ry]) => {
    blob(g, ox + x, y, rx, ry, c.a || '#4f8a4a', c.b || '#1f4a30');
    if (c.snow) cap(g, ox + x, y, rx, ry);
  });
}

// oak: a wide, low crown on a stout trunk
export function paintOak(g, ox, c = {}) {
  trunk(g, ox, 176, 15, 22, c.trunk || '#4a3322');
  [[64, 116, 54, 54], [34, 150, 26, 32], [94, 150, 26, 32], [64, 70, 36, 30], [88, 86, 26, 24], [46, 188, 28, 22], [84, 190, 28, 22], [64, 196, 24, 18]]
    .forEach(([x, y, rx, ry]) => blob(g, ox + x, y, rx, ry, c.a || '#7aa63c', c.b || '#2d5a22'));
}

// birch: a white trunk, a tall leafy column that comes down to the lower third of the stem
export function paintBirch(g, ox, c = {}) {
  g.fillStyle = '#d8d4c6'; g.fillRect(ox + 59, 130, 10, H - 130);
  g.fillStyle = '#35332c'; for (let y = 224; y < 250; y += 17) g.fillRect(ox + 59, y, 10, 3);
  [[68, 84, 42, 76], [38, 112, 20, 26], [98, 104, 20, 28], [66, 152, 34, 40], [62, 192, 26, 22], [64, 20, 18, 18]]
    .forEach(([x, y, rx, ry]) => blob(g, ox + x, y, rx, ry, c.a || '#9cc650', c.b || '#3f7a2a'));
}
