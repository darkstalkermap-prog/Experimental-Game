// The races' own shapes and builds (races.js says which house is which race; models.js wears them). Every race is drawn on the same rig
// and poses as the men (models.js), so it walks, fights, shoots and dies the same; what differs is the build (RACE_LOOK.scale: how the
// body is drawn, never how the game measures it), the skin and hair, the face, and the shapes below, which stand in for the human ones of
// the same name ('elf:head.kettle' for 'head.kettle'). A shape a race has none of is the human one, its metal and leather tinted to the
// race in the shader (unitmat.js RACE_TINT): the legs, arms and boots. The house's colour stays on every race, on the tabard, the shield,
// the cloak and the plume, so friend and foe read at a glance.
// The designs are our own, from the broad archetypes all fantasy shares:
//   Elves    tall and slight, long faces and pointed ears, flowing hair; fine curved silver plate with gold leaf work, tall helms, leaf-bladed
//            swords and spears, long recurved bows; muted greens.
//   Dwarves  short and broad, great braided beards, heavy riveted plate and mail in iron and bronze, round helms with face guards, axes
//            where the men carry swords, short thick horn bows; deep reds and browns.
//   Orcs     big and hunched, heavy-jawed and tusked, green-grey skin; crude black iron lashed on with leather, spikes, bone and fur;
//            cleavers and barbed spears, crude bows.
//   Undead   skeletons in rotted mail and torn cloth, ribs showing, rusted and green-tarnished ancient arms, a cold light in the eye sockets.
// (Shapes are built only when first worn, so a match builds the races in it and no others: shapes.js shapeGeo.)
import * as THREE from 'three';
import { Builder, PAT, SKIRT } from './modelkit.js';
import { KIT } from './shapes.js';
import { sculptHead, sculptHair, sculptBeard } from './heads.js';

const {
  K, leather, leatherDk, cloth, clothDk, hairM, skin, mud, from, rim, rivets, over, onTrunk, trunkOut, SQ, belt, tabardSkirt,
  hips, mailSkirt, tabardTop, trunk, neckband, gorget, HC, helm, KITE_ON, ROUND_ON, GRIP, NOCK, REST, drapeGeo, collar, clasp, LEG,
} = KIT;
const TAU = Math.PI * 2, PI = Math.PI;
// (a race's shape keeps its own colours: the shader's race tint passes it by, see EXACT in modelkit.js)
const def = (name, make, open = false) => KIT.def(name, (b) => { b.exact = true; make(b); }, open);

// ---------------------------------------------------------------- the looks
// scale: the build [width, height, depth] on the man's; head: the head's own scale on that (a dwarf keeps a man's head); neck: where the head
// joint sits on the torso (a man's is [0, 0.435, -0.012]). (The game's body is a man's whatever is drawn: a hero's arrow in the top 17% of it
// is a headshot, classes.js headZone. So the dwarf is drawn no shorter than 0.88 with his head set high on his shoulders, its upper half in
// that zone, and the elf no taller than 1.05, his eyes still under the top of the body); skins, hair: per-soldier colours; faces: cells of the face atlas (unittex.js);
// coats, manes: their horses'; plume: how high a veteran's plume stands on each helm
export const RACE_LOOK = {
  elf: {
    id: 'elf', idx: 1, prefix: 'elf:', scale: [0.93, 1.05, 0.93], head: [0.98, 1.0, 0.98],
    skins: [0xe6cdb2, 0xdcbf9e, 0xeed8c2, 0xcfb08e], hair: [0xe6dfca, 0xd6b45e, 0x1a1612, 0x6a3a1c, 0xcabf98], faces: [8, 8, 0, 4],
    coats: [0xd8d2c8, 0xb8b0a4, 0x9a8a78, 0xe8e2d8], manes: [0xe8e4dc, 0xcfc8b8],
    plume: { 'head.kettle': 0.4, 'head.nasal': 0.31, 'head.great': 0.4, 'head.crown': 0.32, 'head.hood': 0.32 },
  },
  dwarf: {
    id: 'dwarf', idx: 2, prefix: 'dwarf:', scale: [1.2, 0.88, 1.16], head: [0.92, 1.1, 0.93], neck: [0, 0.47, -0.01],
    skins: [0xd29c7a, 0xc28462, 0xb87a58, 0xdcaa88], hair: [0x8a3a1a, 0x5a3420, 0x1c1814, 0x8a8478, 0xa87a3a, 0x6a2a16], faces: [9, 9, 1, 5],
    coats: [0x5a3a22, 0x7a4e2c, 0x2a221c, 0x8a5a30], manes: [0x1e1814, 0x3a2a1a],
    plume: { 'head.kettle': 0.33, 'head.nasal': 0.35, 'head.great': 0.33, 'head.crown': 0.33, 'head.hood': 0.3 },
  },
  orc: {
    id: 'orc', idx: 3, prefix: 'orc:', scale: [1.13, 1.03, 1.1], head: [1.04, 1.0, 1.04], neck: [0, 0.405, 0.045],
    skins: [0x6a8a46, 0x5e7e3e, 0x7a8c4e, 0x6c7e52, 0x52703a], hair: [0x141210, 0x2a2018, 0x3a3028], faces: [10, 10, 6, 7],
    coats: [0x2a221c, 0x3a2a1e, 0x4a3a2a, 0x1c1814], manes: [0x141210, 0x2a2018],
    plume: { 'head.kettle': 0.36, 'head.nasal': 0.34, 'head.great': 0.35, 'head.crown': 0.36, 'head.hood': 0.32 },
  },
  undead: {
    id: 'undead', idx: 4, prefix: 'undead:', scale: [0.9, 1.0, 0.88], head: [0.96, 1.0, 0.96],
    skins: [0xcfc6aa, 0xbdb69c, 0xaeaa98, 0xc4bca2], hair: [0x8a8a84, 0xb8b4a8, 0x4a4844], faces: [11],
    coats: [0x6e6c66, 0x4a4844, 0x8a8478, 0x3a3834], manes: [0x2a2826, 0x8a8a84],
    plume: { 'head.kettle': 0.37, 'head.nasal': 0.36, 'head.great': 0.34, 'head.crown': 0.32, 'head.hood': 0.33 },
  },
};

// ---------------------------------------------------------------- materials
const M = {
  silver: { c: 0xc8ced6, m: 'steel' }, silverDk: { c: 0x9aa2ac, m: 'plate' }, elfGold: { c: 0xd2a446, m: 'gold' }, elfGreen: { c: 0x3e5a3c, m: 'wool', p: PAT.weave },
  elfGreenDk: { c: 0x2c4430, m: 'wool', p: PAT.weave }, elfLeather: { c: 0x5e5236, m: 'leather', p: PAT.leather }, elfWood: { c: 0xb89a6a, m: 'wood', p: PAT.grain },
  elfScale: { c: 0xb4bcc4, m: 'mail', p: PAT.scale },
  iron: { c: 0x5c5a56, m: 'iron' }, ironDk: { c: 0x3a3836, m: 'iron' }, steel: { c: 0x9c9a94, m: 'plate' }, bronze: { c: 0xb27c3c, m: 'brass' }, bronzeDk: { c: 0x8a5a2a, m: 'brass' },
  dwarfRed: { c: 0x7a2a1c, m: 'wool', p: PAT.weave }, dwarfLeather: { c: 0x5a3220, m: 'leather', p: PAT.leather }, dwarfMail: { c: 0x6e6c68, m: 'mail', p: PAT.mail },
  orcIron: { c: 0x3c3834, m: 'iron' }, rust: { c: 0x6c3e24, m: 'iron' }, orcLeather: { c: 0x2e2218, m: 'leather', p: PAT.leather }, orcFur: { c: 0x3e3226, m: 'fur', p: PAT.fur },
  bone: { c: 0xd8ccae, m: 'bone' }, boneDk: { c: 0xa89a7c, m: 'bone' }, orcRed: { c: 0x6a1e16, m: 'cloth', p: PAT.weave }, orcWood: { c: 0x4a3420, m: 'wood', p: PAT.grain },
  verd: { c: 0x5c8a72, m: 'brass' }, verdDk: { c: 0x3e6252, m: 'brass' }, oldIron: { c: 0x5a4a3e, m: 'iron' }, rotMail: { c: 0x5e665e, m: 'mail', p: PAT.mail },
  rag: { c: 0x4a4a46, m: 'cloth', p: PAT.weave }, ragLt: { c: 0x8a867a, m: 'cloth', p: PAT.weave }, glow: { c: 0x48a8c8, m: 'gem', p: PAT.glow }, dark: { c: 0x0c0c10, m: 'iron' },
  blackWood: { c: 0x2a2420, m: 'wood', p: PAT.grain },
};
const S = M;

// ---------------------------------------------------------------- faces
const FACE = {
  elf: { long: 1, jaw: 0.9, cheek: 1.18, nose: 0.92, brow: 0.82 },
  dwarf: { brow: 1.45, nose: 1.38, jaw: 1.16, cheek: 1.16, age: 0.4 },
  orc: { brow: 1.7, jaw: 1.38, nose: 1.32, cheek: 1.25 },
  undead: { skull: 1, jaw: 0.86, cheek: 1.1, brow: 1.1, age: 1 },
};
// the sculpted surfaces each race's heads wear, as the warm-up's jobs (one a frame; heads.js keeps each once made)
export function raceHeadJobs(race, level) {
  if (level >= 2) return [];
  const f = FACE[race], jobs = [], job = (fn) => jobs.push(() => fn(new Builder(level)));
  if (!f) return jobs;
  job((b) => sculptHead(b, f));
  if (race === 'elf') job((b) => sculptHair(b, f, 1));
  if (race === 'dwarf') { job((b) => sculptHair(b, f, 0)); job((b) => sculptBeard(b, f, 1.5, 2)); }
  if (race === 'orc') job((b) => sculptHair(b, f, 3));
  return jobs;
}

// The head of the race, bare: the neck, the sculpted head, the ears (an elf's long and pointed, an orc's pointed and set out, a dwarf's a man's),
// an orc's tusks, the undead's cold eyes and bare spine. `hair`: false under a helm that covers it (the elf's long hair still falls behind).
function raceHead(b, race, o = {}) {
  const f = FACE[race], sk = { ...skin };
  if (b.level >= 3) { b.ell([0, 0.19, 0.0], [0.08, 0.115, 0.1], { ...sk, seg: [5, 3] }); return; }
  if (race === 'undead') {
    // the neck's bones: the spine and a few knobs of vertebrae
    b.rod([0, -0.04, -0.01], [0, 0.11, 0.0], 0.022, 0.02, { ...sk, seg: b.pick(8, 6, 4) });
    if (b.level < 2) for (const y of [0.0, 0.04, 0.08]) b.ell([0, y, -0.006], [0.03, 0.012, 0.028], { ...sk, seg: [6, 4] });
  } else {
    const nk = race === 'orc' ? 1.25 : race === 'elf' ? 0.9 : race === 'dwarf' ? 1.15 : 1;
    b.loft([[-0.04, 0.058 * nk, 0.056 * nk, -0.004], [0.04, 0.054 * nk, 0.053 * nk, 0.004], [0.11, 0.052 * nk, 0.054, 0.0]], { ...sk, a: [0.55, 0.8], seg: b.pick(16, 7, 5) });
  }
  sculptHead(b, f, o.shade || null);
  if (b.level < 2) {
    if (race === 'elf') {
      for (const s of [-1, 1]) {
        b.ell([s * 0.076, 0.172, -0.01], [0.012, 0.03, 0.02], { s: 'skinDark', m: 'skin', seg: [b.pick(8, 5, 4), b.pick(6, 3, 3)] });
        b.cone([s * 0.078, 0.18, -0.012], [s * 0.118, 0.255, -0.05], 0.019, { ...sk, seg: b.pick(7, 5, 4) });   // the long pointed ear, swept up and back
      }
    } else if (race === 'orc') {
      for (const s of [-1, 1]) {
        b.ell([s * 0.078, 0.17, -0.008], [0.013, 0.03, 0.022], { s: 'skinDark', m: 'skin', seg: [b.pick(8, 5, 4), b.pick(6, 3, 3)] });
        b.cone([s * 0.08, 0.175, -0.01], [s * 0.125, 0.21, -0.03], 0.02, { ...sk, seg: 5 });
        // the tusks, up from the lower jaw over the lip
        b.cone([s * 0.028, 0.094, 0.082], [s * 0.034, 0.14, 0.102], 0.0105, { ...S.bone, seg: 5 });
      }
    } else if (race === 'dwarf') {
      for (const s of [-1, 1]) b.ell([s * 0.078, 0.172, -0.008], [0.013, 0.032, 0.022], { s: 'skinDark', m: 'skin', seg: [b.pick(8, 5, 4), b.pick(6, 3, 3)] });
    }
  }
  if (race === 'undead') for (const s of [-1, 1]) b.ell([s * 0.032, 0.178, 0.084], [0.011, 0.009, 0.006], { ...S.glow, seg: [6, 4] });   // the cold light in the pits
  if (b.level >= 2) return;
  if (o.hair !== false) {
    if (race === 'elf') sculptHair(b, f, 1);
    else if (race === 'dwarf') sculptHair(b, f, 0);
    else if (race === 'orc') sculptHair(b, f, 3);
  }
  if (race === 'elf' && o.tail !== false) {
    // long hair falling down the back from under whatever is worn, swaying
    b.sweep([[0, 0.2, -0.085], [0, 0.11, -0.112], [0, 0.0, -0.118], [0, -0.13, -0.11]], 0.058, 0.03, { ...hairM, p: PAT.hair, seg: b.pick(10, 6, 4), segs: b.pick(10, 6, 4), w: [0.0, 0.45], sc: 1 });
  }
  if (race === 'dwarf') dwarfBeard(b, f);
}
// a dwarf's beard: full and long to the chest, in two braids bound with bronze rings
function dwarfBeard(b, f) {
  sculptBeard(b, f, 1.5, 2);
  for (const s of [-1, 1]) {
    b.sweep([[s * 0.022, 0.05, 0.088], [s * 0.028, -0.03, 0.13], [s * 0.03, -0.13, 0.162]], 0.022, 0.012, { ...hairM, p: PAT.hair, seg: 6, segs: b.pick(8, 5, 3) });
    if (b.level < 1) for (const t of [0.4, 0.75]) {
      const y = 0.05 - 0.18 * t, z = 0.088 + 0.074 * t;
      b.torus([s * (0.022 + 0.008 * t), y, z], 0.017 - 0.004 * t, 0.004, { ...S.bronze, rot: [PI / 2 - 0.4, 0, 0], seg: 10, sides: 4 });
    }
  }
  if (b.level < 1) b.ell([0, 0.0, 0.11], [0.05, 0.05, 0.028], { ...hairM, p: PAT.hair });   // (the beard's body between the braids)
}

// ---------------------------------------------------------------- outlines
// a leaf: n points round, w half-wide, from y0 (the stalk) to y1 (the tip), widest at k of the way
function leafOutline(w, y0, y1, k = 0.4, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, y = y0 + (y1 - y0) * t, x = w * Math.pow(Math.sin(PI * Math.pow(t, Math.log(0.5) / Math.log(k))), 0.9); pts.push([x, y]); }
  for (let i = n - 1; i > 0; i--) { const [x, y] = pts[i]; pts.push([-x, y]); }
  return pts;
}
// a blade as a loft along -y: [y, half width, half thickness] rings
const bladeLoft = (b, rings, o) => b.loft(b.level >= 2 ? rings.filter((r, i) => i % 2 === 0 || i === rings.length - 1) : rings, { sq: 1.35, seg: b.pick(12, 8, 4), a: [1, 1], ...o });

// ================================================================ ELVES
// ---- heads
const elfHelmBand = (b, y, rx, rz, z0) => { if (b.level < 2) rim(b, y, rx, rz, z0, 0.0055, S.elfGold); };
def('elf:head.kettle', (b) => {   // a tall helm drawn up to a point, a gold-edged crest from brow to nape, leaf-shaped cheek plates
  raceHead(b, 'elf', { hair: false });
  b.lathe([[0.092, 0.17], [0.099, 0.22], [0.094, 0.275], [0.074, 0.325], [0.042, 0.365], [0.012, 0.392], [0.0, 0.396]], [0, 0, -0.008], { sc: [1, 1, 1.16], ...S.silver, a: [0.8, 1], seg: b.pick(30, 14, 9) });
  elfHelmBand(b, 0.172, 0.093, 0.108, -0.008);
  b.sweep([[0, 0.24, 0.105], [0, 0.33, 0.07], [0, 0.4, -0.02], [0, 0.36, -0.1], [0, 0.27, -0.125]], 0.012, 0.006, { ...S.elfGold, seg: 5, segs: b.pick(14, 8, 5) });
  if (b.level < 2) for (const s of [-1, 1]) b.extrude(leafOutline(0.03, 0.2, 0.06, 0.45, 6), 0.006, 0.002, [s * 0.094, 0, 0.04], { ...S.silver, rot: [0, s * PI / 2 - s * 0.15, 0] });
}, true);
def('elf:head.nasal', (b) => {   // an open round helm with two swept wings of plate rising behind, a gold brow band
  raceHead(b, 'elf', { hair: false });
  b.shell(HC, helm(1.03), 0, TAU, 0, PI * 0.52, { ...S.silver, a: [0.8, 1] });
  b.lathe([[0.091, 0.19], [0.096, 0.19], [0.096, 0.218], [0.091, 0.218]], [0, 0, -0.006], { sc: [1, 1, 1.17], ...S.elfGold, seg: b.pick(28, 12, 8) });
  for (const s of [-1, 1]) b.extrude(leafOutline(0.026, 0.0, 0.17, 0.35, 6), 0.006, b.level < 2 ? 0.002 : 0, [s * 0.09, 0.22, -0.03], { ...S.silver, rot: [-1.05, s * PI / 2, 0] });
  if (b.level < 2) b.rbox([0, 0.2, 0.108], [0.012, 0.05, 0.01], { ...S.elfGold, e: 0.4, rot: [-0.12, 0, 0] });
}, true);
def('elf:head.great', (b) => {   // a closed tall helm, the face behind a plate with a pair of slanted sight slits, a long fin from brow to nape
  raceHead(b, 'elf', { hair: false });
  b.lathe([[0.084, 0.03], [0.096, 0.09], [0.102, 0.19], [0.096, 0.27], [0.07, 0.33], [0.035, 0.37], [0.0, 0.382]], [0, 0, 0.0], { sc: [1, 1, 1.18], ...S.silver, a: [0.75, 1], seg: b.pick(30, 14, 9) });
  for (const s of [-1, 1]) b.rbox([s * 0.036, 0.19, 0.114], [0.05, 0.011, 0.02], { ...S.dark, e: 0.2, rot: [0, 0, s * 0.3] });
  b.sweep([[0, 0.12, 0.118], [0, 0.25, 0.115], [0, 0.37, 0.05], [0, 0.4, -0.06], [0, 0.3, -0.13]], 0.011, 0.005, { ...S.elfGold, seg: 5, segs: b.pick(14, 8, 5) });
  if (b.level < 2) {
    rim(b, 0.032, 0.085, 0.1, 0, 0.005, S.elfGold);
    for (const s of [-1, 1]) b.extrude(leafOutline(0.022, 0.0, 0.15, 0.35, 6), 0.006, 0.002, [s * 0.098, 0.2, -0.02], { ...S.elfGold, rot: [-1.15, s * PI / 2, 0] });
  }
}, true);
def('elf:head.crown', (b) => {   // bare-headed, the hair flowing, a circlet of silver with leaves rising at the front and a green stone
  raceHead(b, 'elf');
  b.lathe([[0.091, 0.215], [0.096, 0.215], [0.096, 0.232], [0.091, 0.232]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.silver, seg: b.pick(28, 14, 9) });
  const n = b.pick(7, 5, 3);
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / n) * 1.9, x = Math.sin(a) * 0.097, z = Math.cos(a) * 0.112 - 0.006, h = i === (n - 1) / 2 ? 0.1 : 0.06;
    b.extrude(leafOutline(0.016, 0.0, h, 0.4, 5), 0.004, 0, [x, 0.226, z], { ...S.elfGold, rot: [0.15, a, 0] });
  }
  if (b.level < 2) b.ell([0, 0.235, 0.112], [0.012, 0.014, 0.008], { c: 0x3aa86a, m: 'gem', seg: [6, 5] });
}, true);
def('elf:head.hood', (b) => {   // bare-headed with a fine circlet, a green cowl gathered round the neck and shoulders
  raceHead(b, 'elf');
  b.lathe([[0.092, 0.205], [0.095, 0.205], [0.095, 0.214], [0.092, 0.214]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.silver, seg: b.pick(24, 12, 8) });
  b.lathe([[0.19, -0.1], [0.15, -0.035], [0.1, 0.03], [0.08, 0.075]], [0, 0, -0.015], { sc: [1, 1, 0.78], ...S.elfGreen, w: [0.2, 0], a: [0.65, 1] });
  b.torus([0, 0.06, -0.06], 0.085, 0.03, { ...S.elfGreen, rot: [PI / 2 + 0.3, 0, 0], sc: [1, 0.8, 1], seg: b.pick(16, 10, 6), sides: b.pick(6, 4, 3) });   // the cowl, down
}, true);

// ---- the trunk
// a gold leaf laid on a surface (centre c, turned by rot), for the plate's and the collars' tracery
const goldLeaf = (b, c, rot, k = 1, o = S.elfGold) => b.extrude(leafOutline(0.016 * k, -0.04 * k, 0.04 * k, 0.45, 5), 0.003, 0, c, { ...o, rot });
// a long cloak of muted green down the back, from the shoulders to the knee (behind where a trained soldier's own cloak hangs)
const elfCloak = (b) => b.sheet([0, -0.06, -0.15], 0.48, 0.96, 5, b.pick(8, 5, 3), { rot: [0.05, 0, 0], ...S.elfGreenDk, w: [1.9, 1.0], dz: (x) => -0.035 * (x / 0.24) ** 2, d: mud(-0.52, -0.25, 0.4) });
def('elf:chest.mail', (b) => {   // a fine scale shirt, the house's long narrow surcoat, a high silver collar with gold leaves, a long cloak
  trunk(b, { ...S.elfScale, a: [0.75, 1] });
  elfCloak(b);
  tabardTop(b, 0.36, -0.03, 0.012, cloth, 0.55);
  if (b.level < 2) {
    neckband(b, S.silver, 1.02);
    rim(b, 0.475, 0.076, 0.066, -0.012, 0.005, S.elfGold);
    for (const s of [-1, 1]) goldLeaf(b, onTrunk(0.37, s * 0.4, 0.016), [-0.3, s * 0.4, s * 0.9], 1.1);
  }
}, true);
def('elf:chest.plate', (b) => {   // curved plate swept up to a ridge, gold veins over it like a leaf's, a high gorget, the surcoat open over it
  trunk(b, { c: 0x3a4a3c, m: 'cloth', p: PAT.quilt, a: [0.7, 1], seg: b.pick(16, 10, 9), smooth: false });
  elfCloak(b);
  b.loft(over(-0.05, 0.38, 0.022, 0.03), { sq: SQ, arc: [-1.25, 2.5], ...S.silver, a: [0.85, 1], seg: b.pick(20, 10, 6) });
  b.loft(over(-0.05, 0.4, 0.02), { sq: SQ, arc: [PI - 1.05, 2.1], ...S.silverDk, a: [0.85, 1], seg: b.pick(16, 8, 5) });
  b.band([onTrunk(-0.04, 0, 0.034), onTrunk(0.15, 0, 0.038), onTrunk(0.37, 0, 0.032)], 0.012, 0.004, { ...S.elfGold, out: trunkOut, segs: b.pick(10, 5, 3) });   // the midrib
  if (b.level < 2) {
    for (const s of [-1, 1]) for (const y of [0.05, 0.16, 0.27]) b.band([onTrunk(y, 0, 0.036), onTrunk(y + 0.06, s * 0.5, 0.032), onTrunk(y + 0.1, s * 0.95, 0.026)], 0.007, 0.004, { ...S.elfGold, out: trunkOut, segs: b.pick(8, 4, 3) });   // the veins
    gorget(b, S.silver);
    rim(b, 0.49, 0.078, 0.067, -0.012, 0.005, S.elfGold);
  }
  tabardTop(b, 0.3, -0.03, 0.036, cloth, 0.5);
}, true);
def('elf:chest.gambeson', (b) => {   // a green jerkin of soft leather, a short mantle of the house's colour, the quiver's baldric
  trunk(b, { ...S.elfGreen, a: [0.78, 1] });
  b.loft(over(-0.08, 0.33, 0.012, 0.016), { sq: SQ, arc: [0.12, TAU - 0.24], ...S.elfLeather, a: [0.8, 1], seg: b.pick(28, 12, 7) });
  b.lathe([[0.25, 0.3], [0.244, 0.35], [0.222, 0.4], [0.16, 0.45], [0.085, 0.485]], [0, 0, -0.012], { sc: [1, 1, 0.68], ...clothDk, a: [0.65, 1], w: [0.25, 0], seg: b.pick(32, 14, 8) });
  if (b.level < 2) {
    rim(b, 0.302, 0.25, 0.17, -0.012, 0.005, S.elfGold);
    b.band([[-0.15, 0.19, 0.125], [-0.06, 0.12, 0.13], [0.04, 0.05, 0.124], [0.14, -0.01, 0.1]], 0.03, 0.005, { ...S.elfLeather, out: trunkOut, segs: b.pick(10, 5, 3) });
    goldLeaf(b, [-0.03, 0.1, 0.138], [0, 0, 0.9], 0.9);
  }
}, true);
def('elf:chest.leather', (b) => {   // a long green tunic belted at the waist, a leaf brooch
  trunk(b, { ...S.elfGreenDk, a: [0.78, 1] });
  b.loft(over(-0.06, 0.32, 0.008), { sq: SQ, arc: [-0.6, 1.2], ...cloth, p: PAT.weave, a: [0.8, 1], seg: b.pick(12, 6, 4) });
  if (b.level < 2) { neckband(b, S.elfGreen, 1.06); goldLeaf(b, onTrunk(0.36, 0.3, 0.02), [0, 0.3, 0.6], 1); }
}, true);
// a longer surcoat skirt to the knee, in two narrow panels (the elves' cut)
def('elf:pelvis.mail', (b) => {
  hips(b, LEG.cloth);
  mailSkirt(b, -0.3);
  belt(b, false, S.elfLeather);
  tabardSkirt(b, -0.5, 0.9, cloth, 0.95);
}, true);
def('elf:pelvis.plate', (b) => {
  hips(b, LEG.cloth);
  if (b.level < 2) mailSkirt(b, -0.26);
  belt(b, false, S.elfLeather);
  // the fauld in two sweeping lames, edged in gold
  for (const [i, y] of [[0, -0.01], [1, -0.08]]) {
    b.lathe([[0.21 + i * 0.014, y - 0.075], [0.19 + i * 0.012, y + 0.04]], [0, 0, 0], { sc: [1, 1, 0.8], ...S.silver, w: SKIRT, a: [0.7, 1], seg: b.pick(28, 12, 8), arc: [-2.2, 4.4] });
    if (b.level < 2) rim(b, y - 0.074, 0.212 + i * 0.014, (0.212 + i * 0.014) * 0.8, 0, 0.004, { ...S.elfGold, w: SKIRT }, [-2.2, 4.4]);
  }
  tabardSkirt(b, -0.52, 0.9, cloth, 0.9);
}, true);

// ---- arms
def('elf:weapon.sword', (b) => {   // a long leaf-shaped blade, a slim guard swept toward the point, a long grip and a teardrop pommel
  bladeLoft(b, [[-0.11, 0.019, 0.005], [-0.3, 0.02, 0.0052], [-0.55, 0.025, 0.0052], [-0.78, 0.03, 0.005], [-0.92, 0.024, 0.0042], [-1.02, 0.01, 0.0026], [-1.07, 0.001, 0.001]], S.silver);
  if (b.level < 2) for (const s of [-1, 1]) b.rbox([0, -0.46, s * 0.005], [0.0055, 0.6, 0.0014], { ...S.elfGold, e: 0.5 });   // (a gold line inlaid down each face)
  b.sweep([[-0.11, -0.13, 0], [-0.06, -0.105, 0], [0, -0.1, 0], [0.06, -0.105, 0], [0.11, -0.13, 0]], 0.008, 0.006, { ...S.elfGold, seg: 6, segs: b.pick(10, 6, 4) });
  b.rod([0, 0.09, 0], [0, -0.1, 0], 0.015, 0.016, { ...S.elfLeather, seg: b.pick(10, 7, 5) });
  b.ell([0, 0.11, 0], [0.018, 0.03, 0.016], { ...S.elfGold, seg: [8, 6] });
}, false);
def('elf:weapon.spear', (b) => {   // a slender pale shaft, a long leaf blade on a gold socket
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.019, 0.017, { ...S.elfWood, seg: b.pick(10, 6, 4) });
  bladeLoft(b, [[-1.88, 0.012, 0.008], [-1.95, 0.034, 0.008], [-2.06, 0.042, 0.007], [-2.18, 0.026, 0.005], [-2.27, 0.001, 0.001]], S.silver);
  b.rod([0, -1.8, 0], [0, -1.89, 0], 0.024, 0.018, { ...S.elfGold });
  b.cone([0, 0.55, 0], [0, 0.62, 0], 0.02, { ...S.elfGold, seg: 5 });
  if (b.level < 2) for (const y of [-1.0, -0.4]) b.rod([0, y, 0], [0, y - 0.015, 0], 0.022, 0.022, { ...S.elfGold });
});
def('elf:weapon.lance', (b) => {   // a long pale lance with a leaf head and a pennon of the house's colour cut in a swallowtail
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.03, 0.016, { ...S.elfWood, seg: b.pick(10, 6, 4) });
  bladeLoft(b, [[-2.92, 0.016, 0.008], [-3.0, 0.032, 0.008], [-3.12, 0.026, 0.006], [-3.22, 0.001, 0.001]], S.silver);
  b.lathe([[0.03, -0.3], [0.1, -0.22], [0.09, -0.12], [0.03, -0.1]], [0, 0, 0], { ...S.silver, seg: b.pick(16, 10, 6) });
  b.extrude([[0, 0.25], [0.5, 0.18], [0.36, 0.0], [0.5, -0.18], [0, -0.25]], 0.004, 0, [0.02, -2.65, 0], { ...cloth, rot: [0, 0, -PI / 2], w: [0.95, 0] });
}, true);
// ---- shields: an almond, pointed above and below, the house's arms on its face, a silver rim and a gold midrib
function elfShield(b, k, on) {
  b.within(on, () => {
    const c = [0.03, -0.12, 0.078];
    const out = leafOutline(0.27 * k, -0.62 * k, 0.42 * k, 0.48, b.pick(12, 8, 6));
    b.extrude(out, 0.03, b.level < 2 ? 0.005 : 0, c, { ...S.silver, a: [0.75, 1] });
    b.extrude(leafOutline(0.24 * k, -0.57 * k, 0.37 * k, 0.48, b.pick(12, 8, 6)), 0.034, 0, [c[0], c[1], c[2] + 0.004], { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.02, 0.46 * k, 0.46 * k], a: [0.8, 1] });
    if (b.level < 2) {
      b.rbox([c[0], c[1] - 0.1 * k, c[2] + 0.024], [0.012, 0.9 * k, 0.012], { ...S.elfGold, e: 0.4 });
      b.ell([c[0], c[1] - 0.02, c[2] + 0.028], [0.04, 0.05, 0.02], { ...S.elfGold });
    }
  });
}
def('elf:shield.round', (b) => elfShield(b, 0.85, ROUND_ON), true);
def('elf:shield.kite', (b) => elfShield(b, 1, KITE_ON), true);
def('elf:shield.kiteL', (b) => elfShield(b, 1.12, KITE_ON), true);

// ================================================================ DWARVES
def('dwarf:head.kettle', (b) => {   // a round iron helm, a heavy bronze brow band, a spectacle guard round the eyes and down the nose
  raceHead(b, 'dwarf', { hair: false });
  b.shell(HC, helm(1.05), 0, TAU, 0, PI * 0.55, { ...S.iron, a: [0.8, 1] });
  b.lathe([[0.094, 0.18], [0.102, 0.183], [0.104, 0.208], [0.096, 0.215]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...S.bronze, seg: b.pick(30, 14, 9) });
  for (const s of [-1, 1]) b.torus([s * 0.034, 0.178, 0.098], 0.024, 0.0065, { ...S.iron, rot: [0.1, s * 0.25, 0], seg: b.pick(14, 8, 6), sides: 4 });
  b.rbox([0, 0.15, 0.112], [0.018, 0.075, 0.012], { ...S.iron, e: 0.3, rot: [-0.15, 0, 0] });
  if (b.level < 2) {
    rivets(b, Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return [Math.sin(a) * 0.105, 0.196, Math.cos(a) * 0.12 - 0.006]; }), 0.006, S.bronzeDk);
    b.cone([0, 0.31, -0.006], [0, 0.345, -0.006], 0.022, { ...S.bronze, seg: 6 });
    for (const s of [-1, 1]) b.rbox([s * 0.09, 0.13, 0.04], [0.016, 0.09, 0.07], { ...S.iron, e: 0.35, rot: [0, s * 0.2, 0] });   // the cheek plates
  }
}, true);
def('dwarf:head.nasal', (b) => {   // a ridged bronze-banded helm with a broad nasal, cheek plates and a mail curtain behind
  raceHead(b, 'dwarf', { hair: false });
  b.lathe([[0.096, 0.18], [0.098, 0.24], [0.08, 0.29], [0.04, 0.325], [0.0, 0.332]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.steel, a: [0.8, 1], seg: b.pick(28, 12, 8) });
  b.lathe([[0.096, 0.178], [0.103, 0.178], [0.103, 0.205], [0.096, 0.205]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.bronze, seg: b.pick(28, 12, 8) });
  b.band([[0, 0.205, 0.118], [0, 0.31, 0.06], [0, 0.335, -0.006], [0, 0.31, -0.07], [0, 0.205, -0.12]], 0.022, 0.006, { ...S.bronze, out: from(HC), segs: b.pick(10, 6, 3) });
  b.rbox([0, 0.145, 0.112], [0.032, 0.09, 0.012], { ...S.steel, e: 0.3, rot: [-0.14, 0, 0] });
  for (const s of [-1, 1]) b.rbox([s * 0.092, 0.13, 0.03], [0.016, 0.1, 0.08], { ...S.steel, e: 0.35, rot: [0, s * 0.2, 0] });
  if (b.level < 3) b.lathe([[0.15, -0.02], [0.13, 0.06], [0.1, 0.17]], [0, 0, -0.03], { arc: [PI * 0.5 + 0.6, PI - 1.2], sc: [1, 1, 0.9], ...S.dwarfMail, a: [0.7, 1] });
}, true);
def('dwarf:head.great', (b) => {   // a round helm with a full face plate: eye slits under a heavy brow, breaths in rows, the beard flowing from under it
  raceHead(b, 'dwarf', { hair: false });
  b.shell(HC, helm(1.06), 0, TAU, 0, PI * 0.56, { ...S.steel, a: [0.8, 1] });
  b.lathe([[0.09, 0.1], [0.1, 0.14], [0.104, 0.2], [0.1, 0.215]], [0, 0, 0.0], { arc: [-1.35, 2.7], sc: [1, 1, 1.18], ...S.steel, a: [0.85, 1], seg: b.pick(22, 10, 6) });   // the face plate
  b.lathe([[0.096, 0.2], [0.106, 0.205], [0.106, 0.228], [0.096, 0.232]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.bronze, seg: b.pick(28, 12, 8) });
  for (const s of [-1, 1]) b.rbox([s * 0.036, 0.181, 0.12], [0.05, 0.012, 0.02], { ...S.dark, e: 0.2 });
  if (b.level < 2) {
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.rbox([s * (0.02 + i * 0.016), 0.128, 0.12 - i * 0.006], [0.006, 0.026, 0.012], { ...S.dark, sharp: true, rot: [0, s * 0.3, 0] });
    b.band([[0, 0.23, 0.12], [0, 0.315, 0.06], [0, 0.34, -0.006], [0, 0.31, -0.08]], 0.03, 0.007, { ...S.bronze, out: from(HC), segs: b.pick(10, 6, 3) });
    rivets(b, Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * TAU; return [Math.sin(a) * 0.107, 0.217, Math.cos(a) * 0.123 - 0.006]; }), 0.006, S.bronzeDk);
  }
}, true);
def('dwarf:head.crown', (b) => {   // a round helm under a broad bronze crown of square merlons, a red stone
  raceHead(b, 'dwarf', { hair: false });
  b.shell(HC, helm(1.04), 0, TAU, 0, PI * 0.5, { ...S.steel, a: [0.8, 1] });
  b.lathe([[0.098, 0.2], [0.106, 0.2], [0.106, 0.255], [0.098, 0.255]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...S.elfGold, seg: b.pick(28, 14, 9) });
  const n = b.pick(8, 6, 5);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; b.rbox([Math.sin(a) * 0.104, 0.27, Math.cos(a) * 0.12 - 0.006], [0.034, 0.034, 0.016], { ...S.elfGold, e: 0.3, rot: [0, a, 0] }); }
  if (b.level < 2) b.ell([0, 0.228, 0.124], [0.016, 0.018, 0.01], { c: K.red, m: 'gem', seg: [6, 5] });
}, true);
def('dwarf:head.hood', (b) => {   // a leather cap with a fur brim and ear flaps
  raceHead(b, 'dwarf', { hair: false });
  b.shell(HC, helm(1.03), 0, TAU, 0, PI * 0.5, { ...S.dwarfLeather, a: [0.8, 1] });
  b.lathe([[0.094, 0.185], [0.106, 0.19], [0.108, 0.21], [0.1, 0.225], [0.094, 0.228]], [0, 0, -0.006], { sc: [1, 1, 1.14], ...S.orcFur, seg: b.pick(28, 12, 8) });
  for (const s of [-1, 1]) b.rbox([s * 0.092, 0.15, -0.01], [0.022, 0.09, 0.07], { ...S.orcFur, e: 0.5, rot: [0, 0, s * 0.12] });
}, true);

def('dwarf:chest.mail', (b) => {   // heavy mail, a riveted breastplate of iron with bronze edges, a broad belt high on the belly, the house's tabard
  trunk(b, { ...S.dwarfMail, a: [0.75, 1] });
  b.loft(over(0.06, 0.36, 0.022, 0.028), { sq: SQ, arc: [-0.95, 1.9], ...S.iron, a: [0.85, 1], seg: b.pick(18, 10, 6) });
  tabardTop(b, 0.2, -0.03, 0.03, cloth, 0.7);
  b.loft(over(-0.06, 0.02, 0.036, 0.04), { sq: SQ, ...S.dwarfLeather, seg: b.pick(28, 12, 8) });   // the broad belt
  if (b.level < 2) {
    rim(b, 0.36, 0.17, 0.12, 0.0, 0.006, S.bronze, [-0.95, 1.9]);
    rivets(b, [-0.7, -0.35, 0, 0.35, 0.7].map((t) => onTrunk(0.3, t, 0.03)), 0.008, S.bronze);
    b.rbox(onTrunk(-0.02, 0, 0.05), [0.07, 0.065, 0.016], { ...S.bronze, e: 0.3 });   // the buckle plate
    neckband(b, S.dwarfMail, 1.05);
  }
}, true);
def('dwarf:chest.plate', (b) => {   // banded plate: lames round the chest stepping out, rivets and bronze at every edge, a gorget, the tabard
  trunk(b, { ...S.dwarfMail, a: [0.7, 1], seg: b.pick(16, 10, 9), smooth: false });
  const ys = b.level < 2 ? [[-0.05, 0.08], [0.07, 0.2], [0.19, 0.32], [0.31, 0.4]] : [[-0.05, 0.4]];
  for (const [y0, y1] of ys) {
    b.loft(over(y0, y1, 0.026, 0.03), { sq: SQ, ...S.steel, a: [0.82, 1], seg: b.pick(24, 12, 8) });
    if (b.level < 2) b.loft(over(y0, y0 + 0.012, 0.03, 0.034), { sq: SQ, ...S.bronze, seg: b.pick(24, 12, 8), smooth: false });
  }
  if (b.level < 2) {
    gorget(b, S.steel);
    rivets(b, [0.02, 0.14, 0.26].flatMap((y) => [-1.2, 1.2].map((t) => onTrunk(y, t, 0.034))), 0.008, S.bronze);
  }
  tabardTop(b, 0.3, -0.03, 0.038, cloth, 0.62);
}, true);
def('dwarf:chest.gambeson', (b) => {   // a thick leather coat over mail, studded, a red scarf
  trunk(b, { ...S.dwarfLeather, a: [0.78, 1] });
  b.loft(over(0.0, 0.33, 0.012), { sq: SQ, arc: [-0.8, 1.6], ...S.dwarfMail, a: [0.8, 1], seg: b.pick(14, 8, 5) });
  if (b.level < 2) {
    neckband(b, S.dwarfRed, 1.12);
    rivets(b, [0.05, 0.15, 0.25].flatMap((y) => [-1.1, 1.1].map((t) => onTrunk(y, t, 0.008))), 0.008, S.bronze);
    b.band([[0.15, 0.4, -0.02], [0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.128], [-0.14, 0.0, 0.106]], 0.034, 0.005, { ...leatherDk, out: trunkOut, segs: b.pick(14, 6, 3) });
  }
  b.loft(over(-0.1, 0.2, 0.016), { sq: SQ, arc: [-0.55, 1.1], ...cloth, a: [0.8, 1], seg: b.pick(10, 6, 4) });   // (the house's colour on a short apron)
}, true);
def('dwarf:chest.leather', (b) => {   // a smith's leather apron over a red shirt
  trunk(b, { ...S.dwarfRed, a: [0.78, 1] });
  b.loft(over(-0.06, 0.32, 0.01), { sq: SQ, arc: [-0.8, 1.6], ...S.dwarfLeather, a: [0.8, 1], seg: b.pick(12, 6, 4) });
  if (b.level < 2) b.band([[0.12, 0.33, 0.1], [0.08, 0.43, 0.04], [0, 0.46, -0.02], [-0.08, 0.43, 0.04], [-0.12, 0.33, 0.1]], 0.022, 0.004, { ...leatherDk, out: from([0, 0.35, 0.0]), segs: 8 });
  b.loft(over(0.12, 0.28, 0.016), { sq: SQ, arc: [-0.45, 0.9], ...cloth, a: [0.8, 1], seg: b.pick(10, 6, 4) });
}, true);

// the dwarves' axe, in place of the sword: a thick haft, a broad bearded bit (along -x: the sword's frame is turned so its edge leads, models.js),
// a hammer's back, bronze bands
def('dwarf:weapon.sword', (b) => {
  b.rod([0, 0.12, 0], [0, -0.86, 0], 0.024, 0.026, { ...S.orcWood, seg: b.pick(10, 7, 5) });
  if (b.level < 2) for (const y of [0.1, -0.1, -0.6]) b.rod([0, y, 0], [0, y - 0.03, 0], 0.029, 0.029, { ...S.bronze, seg: b.pick(10, 7, 5) });
  const bit = [[0.0, 0.07], [-0.08, 0.1], [-0.17, 0.15], [-0.22, 0.1], [-0.24, -0.02], [-0.22, -0.14], [-0.15, -0.17], [-0.08, -0.1], [0.0, -0.06]];
  b.extrude(bit, 0.026, b.level < 2 ? 0.006 : 0, [0, -0.74, 0], { ...S.steel });
  // the ground edge, bright along the whole bit
  const out = bit.slice(2, 7);
  b.extrude([...out, ...out.map(([x, y], i) => [x + (i === 0 || i === 4 ? 0.012 : 0.026), y * 0.94]).reverse()], b.level < 2 ? 0.039 : 0.027, 0, [0, -0.74, 0], { c: 0xd2d4d6, m: 'steel' });
  if (b.level < 1) for (const s of [-1, 1]) for (const y of [-0.7, -0.78]) b.ell([0.055, y, s * 0.031], [0.006, 0.006, 0.004], { ...S.bronze, seg: [5, 3] });   // (rivets through the socket)
  b.rbox([0.03, -0.74, 0], [0.09, 0.14, 0.06], { ...S.iron, e: 0.35 });
  if (b.level < 2) b.rbox([0.085, -0.74, 0], [0.04, 0.09, 0.07], { ...S.iron, e: 0.3 });   // the hammer's back
  b.cone([0, -0.86, 0], [0, -0.92, 0], 0.03, { ...S.bronze, seg: 5 });
});
def('dwarf:weapon.spear', (b) => {   // a stout spear with a broad blade and a lugged socket
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.024, 0.022, { ...S.orcWood, seg: b.pick(10, 6, 4) });
  bladeLoft(b, [[-1.88, 0.02, 0.012], [-1.92, 0.055, 0.013], [-2.02, 0.05, 0.011], [-2.12, 0.022, 0.007], [-2.18, 0.001, 0.001]], S.steel);
  b.rod([0, -1.78, 0], [0, -1.9, 0], 0.034, 0.026, { ...S.bronze });
  b.rod([-0.07, -1.8, 0], [0.07, -1.8, 0], 0.011, 0.011, { ...S.iron, seg: 5 });
  b.cone([0, 0.55, 0], [0, 0.63, 0], 0.028, { ...S.bronze, seg: 5 });
});
def('dwarf:weapon.lance', (b) => {
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.038, 0.022, { ...S.orcWood, seg: b.pick(10, 6, 4) });
  b.cone([0, -2.9, 0], [0, -3.18, 0], 0.032, { ...S.steel, seg: 6 });
  b.lathe([[0.034, -0.32], [0.13, -0.22], [0.12, -0.12], [0.034, -0.1]], [0, 0, 0], { ...S.bronze, seg: b.pick(16, 10, 6) });
  if (b.level < 2) for (const y of [-1.2, -2.0, -2.8]) b.rod([0, y, 0], [0, y - 0.04, 0], 0.036, 0.036, { ...S.bronze });
  b.place(new THREE.PlaneGeometry(0.22, 0.45, 3, 3), [0.3, -2.65, 0], [0, 0, PI / 2], 1, { ...cloth, w: [0.95, 0] });
}, true);
// ---- shields: a heavy round one, a broad oblong with bronze bands, a great oblong; rivets everywhere
def('dwarf:shield.round', (b) => {
  b.within(ROUND_ON, () => {
    const c = [0.03, -0.14, 0.088];
    b.lathe([[0.0, -0.034], [0.2, -0.026], [0.38, -0.01], [0.4, 0.0], [0.39, 0.02], [0.2, 0.034], [0.0, 0.04]], c, { rot: [PI / 2, 0, 0], ...cloth, p: PAT.emblem, uv: [c[0], c[1], 0.62, 0.62], a: [0.85, 1], seg: b.pick(22, 14, 9) });
    b.torus([c[0], c[1], c[2] - 0.004], 0.395, 0.03, { ...S.iron, sc: [1, 1, 1.3] });
    b.ell([c[0], c[1], c[2] + 0.034], [0.09, 0.09, 0.05], { ...S.bronze });
    if (b.level < 2) {
      rivets(b, Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * TAU; return [c[0] + Math.cos(a) * 0.35, c[1] + Math.sin(a) * 0.35, c[2] + 0.03]; }), 0.012, S.bronze);
      b.rbox([c[0], c[1], c[2] - 0.04], [0.06, 0.22, 0.03], { ...leather });
    }
  });
}, true);
function dwarfOblong(b, w, h) {
  b.within(KITE_ON, () => {
    const c = [0.03, -0.12, 0.078];
    b.rbox([c[0], c[1] - 0.08, c[2]], [w, h, 0.04], { ...S.iron, e: 0.18, a: [0.7, 1] });
    b.rbox([c[0], c[1] - 0.08, c[2] + 0.012], [w - 0.06, h - 0.06, 0.03], { ...cloth, p: PAT.emblem, e: 0.12, uv: [c[0], c[1] + 0.02, 0.5, 0.5], a: [0.8, 1] });
    if (b.level < 2) {
      for (const y of [-h * 0.36, h * 0.36]) b.rbox([c[0], c[1] - 0.08 + y, c[2] + 0.03], [w + 0.01, 0.04, 0.018], { ...S.bronze, e: 0.3 });
      b.ell([c[0], c[1] - 0.04, c[2] + 0.034], [0.07, 0.07, 0.035], { ...S.bronze });
      rivets(b, [-1, 1].flatMap((s) => [-0.36, -0.12, 0.12, 0.36].map((k) => [c[0] + s * (w / 2 - 0.035), c[1] - 0.08 + k * h, c[2] + 0.028])), 0.012, S.bronze);
    }
  });
}
def('dwarf:shield.kite', (b) => dwarfOblong(b, 0.5, 0.78), true);
def('dwarf:shield.kiteL', (b) => dwarfOblong(b, 0.56, 0.96), true);

// ================================================================ ORCS
// (crude: faceted, uneven, the plates' edges jagged)
const jag = (b, pts, r, o) => { for (const [a, c] of pts) b.cone(a, c, r, { ...o, seg: 4 }); };
def('orc:head.kettle', (b) => {   // a crude iron cap riveted from plates, a jagged brim, three spikes on the crown
  raceHead(b, 'orc', { hair: false });
  b.shell(HC, helm(1.05), 0, TAU, 0, PI * 0.54, { ...S.orcIron, a: [0.75, 1], flat: true, seg: [b.pick(10, 8, 6), b.pick(6, 4, 3)] });
  const n = b.pick(14, 10, 6);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; b.cone([Math.sin(a) * 0.09, 0.195, Math.cos(a) * 0.105 - 0.006], [Math.sin(a) * 0.15, 0.17 + (i % 2) * 0.01, Math.cos(a) * 0.17 - 0.006], 0.03, { ...S.rust, seg: 3 }); }
  for (const [x, z] of [[0, 0.03], [-0.05, -0.04], [0.05, -0.04]]) b.cone([x, 0.29, z], [x * 1.4, 0.38, z * 1.4], 0.018, { ...S.orcIron, seg: 4 });
}, true);
def('orc:head.nasal', (b) => {   // a crude helm with a jagged nasal and two bone horns thrust forward
  raceHead(b, 'orc', { hair: false });
  b.shell(HC, helm(1.04), 0, TAU, 0, PI * 0.52, { ...S.orcIron, a: [0.75, 1], flat: true, seg: [b.pick(10, 8, 6), b.pick(6, 4, 3)] });
  b.extrude([[-0.018, 0.0], [0.018, 0.0], [0.012, -0.05], [0.02, -0.08], [0.0, -0.11], [-0.016, -0.075], [-0.01, -0.05]], 0.01, 0, [0, 0.215, 0.108], { ...S.rust, rot: [-0.15, 0, 0] });
  for (const s of [-1, 1]) b.sweep([[s * 0.08, 0.25, 0.0], [s * 0.14, 0.28, 0.04], [s * 0.17, 0.33, 0.11], [s * 0.15, 0.37, 0.17]], 0.026, 0.005, { ...S.bone, seg: b.pick(8, 5, 4), segs: b.pick(10, 6, 4) });
  if (b.level < 2) rivets(b, [0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * TAU; return [Math.sin(a) * 0.093, 0.2, Math.cos(a) * 0.11 - 0.006]; }), 0.008, S.rust);
}, true);
def('orc:head.great', (b) => {   // a closed bucket of black iron, a jagged eye slit, a jaw of iron teeth, a row of spikes from brow to nape
  if (b.level < 3) b.loft([[-0.04, 0.07, 0.07, 0.0], [0.06, 0.066, 0.066, 0.004]], { ...skin, seg: b.pick(14, 7, 5) });
  b.lathe([[0.1, 0.02], [0.108, 0.08], [0.11, 0.2], [0.104, 0.27], [0.08, 0.31], [0.0, 0.33]], [0, 0, 0.0], { sc: [1, 1, 1.14], ...S.orcIron, a: [0.7, 1], seg: b.pick(12, 9, 7), flat: true });
  b.extrude([[-0.075, 0.0], [-0.04, 0.012], [-0.012, 0.0], [0.012, 0.0], [0.04, 0.012], [0.075, 0.0], [0.05, -0.016], [-0.05, -0.016]], 0.02, 0, [0, 0.19, 0.114], { ...S.dark });
  for (let i = 0; i < b.pick(7, 5, 3); i++) { const x = -0.06 + (i / (b.pick(7, 5, 3) - 1)) * 0.12; b.cone([x, 0.1, 0.118], [x, 0.06, 0.13], 0.012, { ...S.rust, seg: 3 }); }
  for (let i = 0; i < 4; i++) { const t = i / 3, a = -0.4 + t * 2.2; b.cone([0, 0.25 + Math.cos(a) * 0.07, Math.sin(a) * 0.11], [0, 0.25 + Math.cos(a) * 0.15, Math.sin(a) * 0.17], 0.02, { ...S.orcIron, seg: 4 }); }
}, true);
def('orc:head.crown', (b) => {   // a crown of iron spikes and horn over the topknot, a bone tied at the brow
  raceHead(b, 'orc');
  b.lathe([[0.094, 0.2], [0.102, 0.2], [0.102, 0.23], [0.094, 0.23]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...S.orcIron, seg: b.pick(20, 12, 8) });
  const n = b.pick(9, 7, 5);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU, h = i % 2 ? 0.09 : 0.14; b.cone([Math.sin(a) * 0.098, 0.225, Math.cos(a) * 0.114 - 0.006], [Math.sin(a) * 0.11, 0.225 + h, Math.cos(a) * 0.13 - 0.006], 0.016, { ...(i % 3 ? S.orcIron : S.bone), seg: 4 }); }
  if (b.level < 2) b.rod([-0.04, 0.215, 0.115], [0.04, 0.215, 0.115], 0.01, 0.01, { ...S.bone, seg: 5 });
}, true);
def('orc:head.hood', (b) => {   // a leather skullcap, the topknot through it, a string of teeth
  raceHead(b, 'orc');
  b.shell(HC, helm(1.02), 0, TAU, 0, PI * 0.42, { ...S.orcLeather, a: [0.8, 1] });
  if (b.level < 2) for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; b.cone([Math.sin(a) * 0.12, 0.02, Math.cos(a) * 0.11], [Math.sin(a) * 0.125, -0.02, Math.cos(a) * 0.115], 0.01, { ...S.bone, seg: 3 }); }
}, true);

// crude plates on the trunk: [y, angle round, size, tilt], each with a lashing strap
function crudePlates(b, list, o = S.orcIron) {
  for (const [y, t, s, spin] of list) {
    const p = onTrunk(y, t, 0.026), r = trunkOut(...onTrunk(y, t, 0));
    b.rbox(p, [s, s * 0.8, 0.016], { ...o, e: 0.15, flat: true, rot: [0, Math.atan2(r[0], r[2]), spin] });   // (turned in its own plane, then to face out)
    if (b.level < 1) rivets(b, [[p[0], p[1] + s * 0.3, p[2]]], 0.007, S.rust);
  }
}
function orcSpikes(b, pts) { for (const [p, q] of pts) b.cone(p, q, 0.02, { ...S.orcIron, seg: 4 }); }
// the house's colour as a ragged hanging, its lower edge torn in points (front and back)
function raggedTabard(b, top, bottom, wide = 0.55, d = 0.03) {
  tabardTop(b, top, bottom, d, cloth, wide);
  if (b.level >= 2) return;
  for (const back of [0, PI]) for (let i = -2; i <= 2; i++) {
    const t = back + i * wide * 0.4, p = onTrunk(bottom + 0.005, t, d + 0.006);
    b.cone(p, [p[0] * 1.02, p[1] - 0.06 - (i & 1) * 0.03, p[2] * 1.02], 0.028, { ...cloth, seg: 3 });
  }
}
def('orc:chest.mail', (b) => {   // a black leather jerkin with crude plates lashed over it, spiked shoulders, a ragged hanging of the house's colour, a bone trophy
  trunk(b, { ...S.orcLeather, a: [0.75, 1] });
  crudePlates(b, [[0.28, -0.5, 0.13, 0.2], [0.26, 0.45, 0.12, -0.15], [0.12, -0.9, 0.11, 0.1], [0.14, 0.95, 0.1, -0.2], [0.3, PI, 0.18, 0.1]]);
  raggedTabard(b, 0.24, -0.03, 0.42);
  if (b.level < 2) {
    for (const s of [-1, 1]) b.band([onTrunk(0.41, s * 2.6, 0.03), [s * 0.12, 0.45, 0.02], onTrunk(0.3, s * 0.55, 0.03), onTrunk(0.12, -s * 0.2, 0.034), onTrunk(-0.02, -s * 0.75, 0.03)], 0.026, 0.005, { ...leatherDk, out: from([0, 0.2, -0.01]), segs: b.pick(12, 6, 3) });
    orcSpikes(b, [-1, 1].map((s) => [[s * 0.15, 0.41, 0.0], [s * 0.2, 0.5, -0.01]]));
    b.rod([0.1, 0.34, 0.13], [0.06, 0.26, 0.14], 0.009, 0.007, { ...S.bone, seg: 5 });
  }
}, true);
def('orc:chest.plate', (b) => {   // heavier: a breastplate beaten from black iron, rusty, spiked shoulder guards on the trunk, a fur collar
  trunk(b, { ...S.orcLeather, a: [0.7, 1], seg: b.pick(16, 10, 9), smooth: false });
  b.loft(over(-0.04, 0.37, 0.024, 0.03), { sq: SQ, arc: [-1.15, 2.3], ...S.orcIron, a: [0.8, 1], seg: b.pick(10, 8, 6), flat: true });
  b.loft(over(-0.04, 0.4, 0.02), { sq: SQ, arc: [PI - 1.0, 2.0], ...S.orcIron, a: [0.8, 1], seg: b.pick(8, 6, 5), flat: true });
  crudePlates(b, [[0.2, 0.05, 0.12, 0.25]], S.rust);
  b.loft([[0.36, 0.21, 0.14, -0.004], [0.41, 0.2, 0.13, -0.01], [0.45, 0.15, 0.1, -0.013], [0.49, 0.08, 0.07, -0.014]], { ...S.orcFur, a: [0.65, 1], seg: b.pick(20, 10, 7) });
  raggedTabard(b, 0.26, -0.03, 0.4, 0.036);
  if (b.level < 2) orcSpikes(b, [-1, 1].flatMap((s) => [[[s * 0.16, 0.42, 0.04], [s * 0.21, 0.53, 0.05]], [[s * 0.17, 0.42, -0.05], [s * 0.22, 0.52, -0.08]]]));
}, true);
def('orc:chest.gambeson', (b) => {   // a fur and leather harness over bare green skin
  trunk(b, { ...skin, a: [0.72, 1] });
  for (const sx of [-1, 1]) b.ell([sx * 0.085, 0.29, 0.07], [0.095, 0.06, 0.05], { ...skin, a: [0.8, 1], rot: [0, 0, sx * -0.12] });   // (a heavy, square chest)
  if (b.level < 2) b.ell([0, 0.12, 0.07], [0.1, 0.12, 0.05], { ...skin, a: [0.85, 1] });   // the gut
  b.loft([[0.3, 0.2, 0.135, -0.004], [0.36, 0.22, 0.145, -0.006], [0.41, 0.2, 0.13, -0.01], [0.45, 0.14, 0.1, -0.013], [0.49, 0.075, 0.068, -0.014]], { ...S.orcFur, a: [0.65, 1], seg: b.pick(24, 10, 7) });
  for (const sx of [-1, 1]) b.band([onTrunk(0.4, sx * 2.6, 0.012), [sx * 0.13, 0.44, 0.02], onTrunk(0.3, sx * 0.55, 0.014), onTrunk(0.15, 0, 0.026), onTrunk(-0.02, -sx * 0.75, 0.01)], 0.03, 0.005, { ...S.orcLeather, out: from([0, 0.2, -0.01]), segs: b.pick(14, 6, 3) });
  b.band([[-0.18, 0.43, -0.02], [-0.14, 0.38, 0.1], [-0.03, 0.24, 0.142], [0.09, 0.08, 0.128], [0.16, -0.05, 0.1]], 0.07, 0.006, { ...cloth, out: from([0, 0.2, -0.02]), segs: b.pick(14, 6, 3) });
  if (b.level < 2) b.ell([0, 0.15, 0.142], [0.03, 0.04, 0.014], { ...S.bone });
}, true);
def('orc:chest.leather', (b) => {   // a fur vest, the house's rag at the belly
  trunk(b, { ...S.orcFur, a: [0.75, 1] });
  b.loft(over(-0.06, 0.24, 0.012), { sq: SQ, arc: [-0.55, 1.1], ...cloth, a: [0.8, 1], seg: b.pick(10, 6, 4) });
  if (b.level < 2) neckband(b, S.orcFur, 1.15);
}, true);

def('orc:weapon.sword', (b) => {   // a cleaver: a broad heavy blade squared at the end, its back thick, notched along the edge (the edge at -x leads)
  b.extrude([[0.02, -0.12], [-0.03, -0.12], [-0.05, -0.4], [-0.075, -0.7], [-0.08, -0.9], [-0.06, -0.97], [0.03, -0.95], [0.035, -0.6], [0.028, -0.3]], 0.012, b.level < 2 ? 0.004 : 0, [0, 0, 0], { ...S.orcIron, rot: [0, 0, 0] });
  // its edge ground bright in a ragged band (dark notches bitten out of it)
  b.extrude([[-0.03, -0.13], [-0.05, -0.4], [-0.075, -0.7], [-0.08, -0.9], [-0.06, -0.97], [-0.045, -0.95], [-0.064, -0.88], [-0.058, -0.7], [-0.036, -0.4], [-0.018, -0.14]], b.level < 2 ? 0.0205 : 0.0125, 0, [0, 0, 0], { c: 0xb6b2aa, m: 'steel' });
  if (b.level < 2) for (const y of [-0.45, -0.66]) b.cone([-0.06, y, 0], [-0.04, y - 0.03, 0], 0.02, { ...S.dark, seg: 3 });   // the notches
  b.rbox([0, -0.11, 0], [0.12, 0.025, 0.035], { ...S.rust, e: 0.3, flat: true });
  b.rod([0, 0.08, 0], [0, -0.1, 0], 0.019, 0.02, { ...S.orcLeather, seg: b.pick(8, 6, 5) });
  b.ell([0, 0.09, 0], [0.024, 0.02, 0.024], { ...S.bone, seg: [6, 5] });
});
def('orc:weapon.spear', (b) => {   // a crude spear: a rough shaft, a barbed iron head lashed on, a bone fetish
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.024, 0.02, { ...S.orcWood, seg: b.pick(7, 5, 4) });
  b.extrude([[0, 0.0], [0.04, -0.04], [0.02, -0.06], [0.05, -0.14], [0.0, -0.36], [-0.05, -0.14], [-0.02, -0.06], [-0.04, -0.04]], 0.014, 0, [0, -1.84, 0], { ...S.orcIron });
  b.rod([0, -1.76, 0], [0, -1.86, 0], 0.03, 0.03, { ...S.orcLeather, seg: 6 });
  if (b.level < 2) b.rod([0.02, -1.7, 0.02], [0.04, -1.55, 0.04], 0.008, 0.006, { ...S.bone, seg: 4 });
});
def('orc:weapon.lance', (b) => {
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.036, 0.022, { ...S.orcWood, seg: b.pick(8, 6, 4) });
  b.extrude([[0, 0.0], [0.05, -0.06], [0.02, -0.08], [0.04, -0.18], [0.0, -0.36], [-0.04, -0.18], [-0.02, -0.08], [-0.05, -0.06]], 0.016, 0, [0, -2.92, 0], { ...S.orcIron });
  b.lathe([[0.03, -0.3], [0.12, -0.24], [0.11, -0.14], [0.03, -0.1]], [0, 0, 0], { ...S.orcIron, seg: b.pick(10, 8, 6), flat: true });
  b.extrude([[0, 0.2], [0.5, 0.12], [0.42, 0.04], [0.52, -0.04], [0.44, -0.1], [0, -0.2]], 0.004, 0, [0.02, -2.6, 0], { ...cloth, rot: [0, 0, -PI / 2], w: [0.95, 0] });
}, true);
// ---- shields: planks of rough wood, a hide face painted with the house's arms, iron straps and a spiked boss
function orcPlanks(b, w, h, on, round) {
  b.within(on, () => {
    const c = round ? [0.03, -0.14, 0.088] : [0.03, -0.14, 0.078];
    const n = round ? 5 : 4, pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + pw * (i + 0.5), hh = round ? h * Math.sqrt(Math.max(0.2, 1 - (2 * x / w) ** 2)) : h * (0.92 + ((i * 37) % 7) * 0.02);
      b.rbox([c[0] + x, c[1] - 0.06 + ((i * 13) % 5) * 0.01, c[2] - 0.006], [pw * 0.96, hh, 0.034], { ...S.orcWood, e: 0.1, flat: true, a: [0.7, 1] });
    }
    b.rbox([c[0], c[1] - 0.05, c[2] + 0.016], [w * 0.7, h * 0.62, 0.012], { ...cloth, p: PAT.emblem, e: 0.25, uv: [c[0], c[1] - 0.03, w * 0.75, w * 0.75], a: [0.8, 1] });
    if (b.level < 2) for (const y of [h * 0.35, -h * 0.4]) b.rbox([c[0], c[1] - 0.06 + y, c[2] + 0.018], [w * 0.98, 0.035, 0.012], { ...S.orcIron, e: 0.2, flat: true });
    b.cone([c[0], c[1] - 0.04, c[2] + 0.02], [c[0], c[1] - 0.04, c[2] + 0.14], 0.045, { ...S.orcIron, seg: 5 });
  });
}
def('orc:shield.round', (b) => orcPlanks(b, 0.7, 0.72, ROUND_ON, true), true);
def('orc:shield.kite', (b) => orcPlanks(b, 0.5, 0.86, KITE_ON, false), true);
def('orc:shield.kiteL', (b) => orcPlanks(b, 0.56, 1.0, KITE_ON, false), true);

// ================================================================ UNDEAD
def('undead:head.kettle', (b) => {   // an ancient bowl helm of green-tarnished bronze, a ragged crest of grey hair, cheek flaps
  raceHead(b, 'undead');
  b.shell(HC, helm(1.04), 0, TAU, 0, PI * 0.54, { ...S.verd, a: [0.75, 1] });
  b.sweep([[0, 0.3, 0.09], [0, 0.37, 0.0], [0, 0.35, -0.1], [0, 0.26, -0.17]], 0.02, 0.012, { c: 0x6a6a64, m: 'hair', p: PAT.hair, seg: 5, segs: b.pick(10, 6, 4), w: [0.2, 0.8] });
  if (b.level < 2) {
    b.lathe([[0.094, 0.19], [0.1, 0.19], [0.1, 0.205], [0.094, 0.205]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.verdDk, seg: b.pick(24, 12, 8) });
    for (const s of [-1, 1]) b.extrude([[0, 0.0], [0.06, 0.0], [0.05, -0.08], [0.02, -0.11], [0, -0.09]], 0.006, 0, [s * 0.094, 0.2, 0.06], { ...S.verd, rot: [0, s * PI / 2, 0] });
  }
}, true);
def('undead:head.nasal', (b) => {   // a tall rusted cone with long cheek guards and a curtain of rotted mail
  raceHead(b, 'undead');
  b.lathe([[0.093, 0.19], [0.094, 0.24], [0.07, 0.3], [0.03, 0.35], [0.0, 0.37]], [0, 0, -0.006], { sc: [1, 1, 1.16], ...S.oldIron, a: [0.75, 1], seg: b.pick(24, 12, 8) });
  for (const s of [-1, 1]) b.rbox([s * 0.09, 0.12, 0.04], [0.014, 0.13, 0.07], { ...S.oldIron, e: 0.3, rot: [0, s * 0.25, 0] });
  if (b.level < 3) b.lathe([[0.15, -0.04], [0.13, 0.06], [0.1, 0.18]], [0, 0, -0.03], { arc: [PI * 0.5 + 0.5, PI - 1.0], sc: [1, 1, 0.9], ...S.rotMail, a: [0.65, 1] });
}, true);
def('undead:head.great', (b) => {   // a closed ancient helm, the face a T opening the cold eyes look out of, tarnished green, a ragged plume
  raceHead(b, 'undead');
  b.lathe([[0.09, 0.03], [0.1, 0.09], [0.104, 0.2], [0.098, 0.27], [0.075, 0.31], [0.03, 0.332], [0.0, 0.335]], [0, 0, 0.0], { arc: [0.3, TAU - 0.6], sc: [1, 1, 1.16], ...S.verd, a: [0.7, 1], seg: b.pick(28, 14, 9) });
  b.lathe([[0.098, 0.21], [0.102, 0.24], [0.098, 0.27]], [0, 0, 0.0], { arc: [-0.32, 0.64], sc: [1, 1, 1.16], ...S.verd, seg: 6 });   // (the brow over the T)
  b.lathe([[0.09, 0.03], [0.1, 0.09], [0.103, 0.15]], [0, 0, 0.0], { arc: [-0.32, 0.18], sc: [1, 1, 1.16], ...S.verd, seg: 3 });
  b.lathe([[0.09, 0.03], [0.1, 0.09], [0.103, 0.15]], [0, 0, 0.0], { arc: [0.14, 0.18], sc: [1, 1, 1.16], ...S.verd, seg: 3 });
  b.sweep([[0, 0.33, 0.05], [0, 0.39, -0.03], [0, 0.36, -0.14], [0, 0.26, -0.2]], 0.03, 0.01, { ...clothDk, seg: 5, segs: b.pick(10, 6, 4), w: [0.2, 0.9] });
}, true);
def('undead:head.crown', (b) => {   // a rusted crown on the bare skull, a tattered hood fallen behind
  raceHead(b, 'undead');
  b.lathe([[0.09, 0.2], [0.098, 0.2], [0.098, 0.235], [0.09, 0.235]], [0, 0, -0.006], { sc: [1, 1, 1.15], ...S.verdDk, seg: b.pick(24, 12, 8) });
  const n = b.pick(7, 6, 5);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; b.cone([Math.sin(a) * 0.095, 0.232, Math.cos(a) * 0.11 - 0.006], [Math.sin(a) * 0.1, i % 3 === 1 ? 0.27 : 0.3, Math.cos(a) * 0.115 - 0.006], 0.02, { ...S.verd, seg: 4 }); }
  b.lathe([[0.2, -0.08], [0.15, -0.02], [0.1, 0.05], [0.07, 0.09]], [0, 0, -0.03], { sc: [1, 1, 0.8], ...S.rag, w: [0.3, 0], a: [0.6, 1] });
}, true);
def('undead:head.hood', (b) => {   // a tattered hood drawn over the skull, the eyes' light in its shadow
  raceHead(b, 'undead', { shade: [0.5, 0.75] });
  b.shell([0, 0.2, -0.016], [0.106, 0.13, 0.12], PI * 0.5 + 0.75, TAU - 1.5, 0, PI * 0.88, { ...S.rag, a: [0.6, 1] });
  b.lathe([[0.2, -0.1], [0.15, -0.03], [0.085, 0.06]], [0, 0, -0.01], { sc: [1, 1, 0.76], ...S.rag, w: [0.25, 0], a: [0.6, 1] });
  if (b.level < 2) for (let i = 0; i < 7; i++) { const a = PI * 0.5 + 0.9 + (i / 6) * (TAU - 1.8); b.cone([Math.cos(a) * 0.19, -0.09, Math.sin(a) * 0.15 - 0.01], [Math.cos(a) * 0.21, -0.16 - (i % 2) * 0.04, Math.sin(a) * 0.16 - 0.01], 0.03, { ...S.rag, seg: 3, w: [0.4, 0.3] }); }
}, true);

// ribs: bone hoops round the front of the trunk from y0 up, showing through the rot
function ribs(b, y0, n, d = 0.004, arc = 2.2) {
  for (let i = 0; i < n; i++) {
    const y = y0 + i * 0.045, k = 1 - Math.abs(i - n * 0.55) * 0.04;
    b.loft(over(y, y + 0.018, d * k, d * k), { sq: SQ, arc: [-arc / 2, arc], ...skin, a: [0.8, 1], seg: b.pick(14, 8, 5), smooth: false });
  }
  b.loft(over(y0 - 0.02, y0 + n * 0.045, d + 0.004, d + 0.004), { sq: SQ, arc: [-0.06, 0.12], ...skin, seg: 3, smooth: false });   // the breastbone
}
// the dark of the hollow body behind the bones
const hollow = (b) => trunk(b, { c: 0x16161a, m: 'cloth', a: [0.6, 0.8], seg: b.pick(16, 10, 8), smooth: false });
// the house's colour as a tattered hanging: its hem torn in points
function tatters(b, top, bottom, wide, d) {
  tabardTop(b, top, bottom, d, cloth, wide);
  if (b.level >= 2) return;
  for (const back of [0, PI]) for (let i = -2; i <= 2; i++) {
    const t = back + i * wide * 0.42, p = onTrunk(bottom + 0.005, t, d + 0.005);
    b.cone(p, [p[0], p[1] - 0.05 - ((i + 3) % 3) * 0.035, p[2]], 0.025, { ...cloth, seg: 3, w: [0.3, 0.2] });
  }
}
def('undead:chest.mail', (b) => {   // ribs under a rotted mail shirt that has fallen open at the chest, the house's colour in tatters
  hollow(b);
  ribs(b, 0.12, 5);
  b.loft(over(-0.1, 0.34, 0.012, 0.016), { sq: SQ, arc: [0.75, TAU - 1.5], ...S.rotMail, a: [0.7, 1], seg: b.pick(22, 10, 7) });
  tatters(b, 0.12, -0.04, 0.5, 0.02);
  if (b.level < 2) b.lathe([[0.112, 0.37], [0.116, 0.4], [0.1, 0.43]], [0, 0, -0.01], { sc: [1, 1, 0.86], ...S.rotMail });
}, true);
def('undead:chest.plate', (b) => {   // a cracked breastplate of tarnished bronze over the ribs, open at the sides, the tattered surcoat
  hollow(b);
  ribs(b, 0.1, 6, 0.004, 3.0);
  b.loft(over(0.0, 0.37, 0.024, 0.03), { sq: SQ, arc: [-0.85, 1.7], ...S.verd, a: [0.8, 1], seg: b.pick(16, 8, 6) });
  b.loft(over(-0.04, 0.4, 0.02), { sq: SQ, arc: [PI - 0.9, 1.8], ...S.verdDk, a: [0.8, 1], seg: b.pick(12, 8, 5) });
  if (b.level < 2) {
    b.band([onTrunk(0.32, -0.2, 0.034), onTrunk(0.22, -0.05, 0.036), onTrunk(0.12, -0.25, 0.034)], 0.006, 0.004, { ...S.dark, out: trunkOut, segs: 4 });   // the crack
    gorget(b, S.verd);
  }
  tatters(b, 0.26, -0.04, 0.42, 0.038);
}, true);
def('undead:chest.gambeson', (b) => {   // a grave shroud in rags over the bones
  hollow(b);
  ribs(b, 0.1, 6, 0.004, 2.6);
  b.loft(over(-0.1, 0.42, 0.01, 0.012), { sq: SQ, arc: [1.2, TAU - 2.4], ...S.ragLt, a: [0.65, 1], seg: b.pick(20, 10, 7) });
  b.band([[0.15, 0.4, -0.02], [0.13, 0.36, 0.085], [0.05, 0.25, 0.13], [-0.04, 0.12, 0.128], [-0.14, 0.0, 0.106]], 0.03, 0.005, { ...leatherDk, out: trunkOut, segs: b.pick(14, 6, 3) });
  tatters(b, 0.06, -0.06, 0.4, 0.016);
}, true);
def('undead:chest.leather', (b) => {
  hollow(b);
  ribs(b, 0.1, 6);
  b.loft(over(-0.1, 0.42, 0.01, 0.012), { sq: SQ, arc: [1.0, TAU - 2.0], ...S.rag, a: [0.65, 1], seg: b.pick(20, 10, 7) });
  tatters(b, 0.06, -0.06, 0.4, 0.016);
}, true);

def('undead:weapon.sword', (b) => {   // an old straight sword, rusted dark, notched, its guard green
  const bl = [[-0.122, 0.028, 0.006], [-0.35, 0.026, 0.0055], [-0.6, 0.023, 0.005], [-0.84, 0.019, 0.0044], [-0.95, 0.013, 0.0036], [-1.0, 0.002, 0.002]];
  bladeLoft(b, bl, S.oldIron);
  if (b.level < 2) for (const [y, s] of [[-0.4, 1], [-0.62, -1], [-0.78, 1]]) b.cone([s * 0.03, y, 0], [s * 0.012, y - 0.02, 0], 0.016, { ...S.dark, seg: 3 });
  b.rbox([0, -0.115, 0], [0.22, 0.03, 0.03], { ...S.verd, e: 0.4 });
  b.rod([0, 0.07, 0], [0, -0.105, 0], 0.017, 0.019, { ...S.ragLt, seg: b.pick(8, 6, 5) });
  b.ell([0, 0.085, 0], [0.03, 0.03, 0.016], { ...S.verd, seg: [8, 6] });
});
def('undead:weapon.spear', (b) => {   // a dark old spear, a corroded head, a tattered pennon of the house's colour
  b.rod([0, 0.55, 0], [0, -1.86, 0], 0.021, 0.019, { ...S.blackWood, seg: b.pick(8, 6, 4) });
  bladeLoft(b, [[-1.86, 0.016, 0.01], [-1.9, 0.04, 0.011], [-2.02, 0.034, 0.009], [-2.14, 0.014, 0.005], [-2.2, 0.001, 0.001]], S.oldIron);
  b.rod([0, -1.8, 0], [0, -1.9, 0], 0.03, 0.022, { ...S.verd });
  b.extrude([[0, 0.12], [0.3, 0.1], [0.22, 0.03], [0.32, -0.02], [0.2, -0.06], [0.26, -0.1], [0, -0.12]], 0.004, 0, [0.02, -1.62, 0], { ...cloth, rot: [0, 0, -PI / 2], w: [0.9, 0] });
}, true);
def('undead:weapon.lance', (b) => {
  b.rod([0, 0.35, 0], [0, -2.95, 0], 0.032, 0.018, { ...S.blackWood, seg: b.pick(8, 6, 4) });
  b.cone([0, -2.92, 0], [0, -3.18, 0], 0.024, { ...S.oldIron, seg: 6 });
  b.lathe([[0.03, -0.3], [0.11, -0.2], [0.1, -0.12], [0.03, -0.1]], [0, 0, 0], { ...S.verd, seg: b.pick(16, 10, 6) });
  b.extrude([[0, 0.25], [0.48, 0.2], [0.36, 0.1], [0.52, 0.02], [0.3, -0.06], [0.44, -0.14], [0, -0.25]], 0.004, 0, [0.02, -2.65, 0], { ...cloth, rot: [0, 0, -PI / 2], w: [0.95, 0] });
}, true);
// ---- shields: a cracked round one missing a piece of its rim, an old kite chipped at the edge
def('undead:shield.round', (b) => {
  b.within(ROUND_ON, () => {
    const c = [0.03, -0.14, 0.088];
    b.lathe([[0.0, -0.034], [0.2, -0.026], [0.37, -0.01], [0.39, 0.0], [0.38, 0.02], [0.2, 0.034], [0.0, 0.04]], c, { arc: [0.5, TAU - 0.9], rot: [PI / 2, 0, 0], ...cloth, p: PAT.emblem, uv: [c[0], c[1], 0.62, 0.62], a: [0.8, 1], seg: b.pick(22, 14, 9) });
    b.lathe([[0.0, -0.034], [0.2, -0.026], [0.28, -0.012], [0.28, 0.024], [0.2, 0.034], [0.0, 0.04]], c, { arc: [-0.4, 0.9], rot: [PI / 2, 0, 0], ...S.blackWood, seg: 4 });
    b.ell([c[0], c[1], c[2] + 0.034], [0.075, 0.075, 0.04], { ...S.verd });
    if (b.level < 2) b.torus([c[0], c[1], c[2] - 0.004], 0.385, 0.018, { ...S.verdDk, sc: [1, 1, 1.4], seg: b.pick(20, 12, 8) });
  });
}, true);
function undeadKite(b, k) {
  b.within(KITE_ON, () => {
    const c = [0.03, -0.12, 0.078];
    const KT = [[-0.27, 0.29], [-0.14, 0.335], [0.06, 0.335], [0.1, 0.27], [0.16, 0.3], [0.27, 0.29], [0.275, 0.1], [0.22, -0.15], [0.12, -0.38], [0.05, -0.47], [-0.02, -0.44], [-0.06, -0.5], [-0.12, -0.38], [-0.22, -0.15], [-0.275, 0.1]];
    const sc = (q) => KT.map(([x, y]) => [x * q * k, y * q * k]);
    b.extrude(sc(1), 0.034, b.level < 2 ? 0.005 : 0, c, { ...S.oldIron, a: [0.7, 1] });
    b.extrude(sc(0.9), 0.036, 0, [c[0], c[1] + 0.012, c[2] + 0.004], { ...cloth, p: PAT.emblem, uv: [c[0], c[1] + 0.1, 0.46 * k, 0.46 * k], a: [0.75, 1] });
    if (b.level < 2) b.ell([c[0], c[1] + 0.08, c[2] + 0.032], [0.055, 0.055, 0.03], { ...S.verd });
  });
}
def('undead:shield.kite', (b) => undeadKite(b, 1), true);
def('undead:shield.kiteL', (b) => undeadKite(b, 1.2), true);

// ================================================================ bows (every race), at rest and drawn
// The limbs are a path from tip to tip through the grip (in the grip frame: the limbs along z, the string on the +y side); `curl` bends each
// tip away from the string (a recurve). The drawn bow's string meets at NOCK, where the archer's pose puts the anchor (models.js drawPose).
function bowPath(half, bend, curl) {
  const pts = [-1, -0.55, -0.27, 0, 0.27, 0.55, 1].map((t) => [0, -0.36 + bend * t * t, half * t]);
  if (curl) { pts.unshift([0, -0.36 + bend - curl, -half - curl * 0.7]); pts.push([0, -0.36 + bend - curl, half + curl * 0.7]); }
  return pts;
}
function raceBow(b, o, drawn) {
  const { half, bend, dbend, curl, r0, r1, wood, tip, grip, extra } = o;
  b.within(GRIP, () => {
    const hf = drawn ? half * 0.93 : half, bd = drawn ? dbend : bend;
    const pts = bowPath(hf, bd, curl);
    b.sweep(pts, r0, r1, { ...wood, seg: 5, segs: b.pick(16, 10, 6) });
    const end = (s) => (curl ? [0, -0.36 + bd - curl, s * (hf + curl * 0.7)] : [0, -0.36 + bd, s * hf]);
    if (drawn) for (const s of [-1, 1]) b.rod(end(s), NOCK, 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
    else b.rod(end(-1), end(1), 0.004, 0.004, { c: K.linen, m: 'cloth', seg: 3 });
    b.rod([0, -0.4, 0.07], [0, -0.3, -0.07], r0 + 0.004, r0 + 0.004, { ...grip });
    if (tip && b.level < 2) for (const s of [-1, 1]) b.ell(end(s), [0.012, 0.012, 0.02], { ...tip, seg: [6, 4] });
    if (extra && b.level < 2) extra(b, hf, bd);
    if (drawn) {
      const d = REST.map((v, i) => v - NOCK[i]), n = Math.hypot(...d), tp = REST.map((v, i) => v + (d[i] / n) * 0.07);
      b.rod(NOCK, tp, 0.006, 0.006, { c: K.wood, m: 'wood', seg: 4 });
      b.cone(tp, tp.map((v, i) => v + (d[i] / n) * 0.06), 0.012, { c: K.steel, m: 'steel', seg: 4 });
      if (b.level < 2) b.rod(NOCK.map((v, i) => v + (d[i] / n) * 0.02), NOCK.map((v, i) => v + (d[i] / n) * 0.13), 0.016, 0.016, { c: K.linen, m: 'cloth', seg: 3 });
    }
  });
}
const BOWS = {
  elf: { bow: { half: 0.72, bend: 0.12, dbend: 0.27, curl: 0.06, r0: 0.018, r1: 0.008, wood: S.elfWood, tip: S.elfGold, grip: S.elfGreen },
    'bow.long': { half: 0.92, bend: 0.14, dbend: 0.31, curl: 0.07, r0: 0.02, r1: 0.008, wood: S.elfWood, tip: S.elfGold, grip: S.elfGreen } },
  dwarf: { bow: { half: 0.5, bend: 0.12, dbend: 0.24, curl: 0.035, r0: 0.03, r1: 0.016, wood: S.orcWood, tip: S.bronze, grip: S.dwarfLeather },
    'bow.long': { half: 0.6, bend: 0.13, dbend: 0.26, curl: 0.04, r0: 0.032, r1: 0.017, wood: S.orcWood, tip: S.bronze, grip: S.dwarfLeather } },
  orc: { bow: { half: 0.6, bend: 0.2, dbend: 0.29, curl: 0, r0: 0.026, r1: 0.016, wood: S.orcWood, tip: S.bone, grip: S.orcLeather },
    'bow.long': { half: 0.78, bend: 0.22, dbend: 0.32, curl: 0, r0: 0.028, r1: 0.016, wood: S.orcWood, tip: S.bone, grip: S.orcLeather } },
  undead: { bow: { half: 0.64, bend: 0.17, dbend: 0.27, curl: 0.02, r0: 0.02, r1: 0.011, wood: S.blackWood, tip: S.verd, grip: S.ragLt },
    'bow.long': { half: 0.85, bend: 0.2, dbend: 0.31, curl: 0.02, r0: 0.022, r1: 0.011, wood: S.blackWood, tip: S.verd, grip: S.ragLt } },
};
for (const [race, set] of Object.entries(BOWS)) {
  for (const [name, o] of Object.entries(set)) {
    def(`${race}:${name}`, (b) => raceBow(b, o, false), true);
    def(`${race}:${name}.drawn`, (b) => raceBow(b, o, true), true);
  }
}

// ================================================================ the lord's cloak, per race
// (a tattered or fur-hemmed version of the long cloak: drapeGeo, with its hem cut in points where `rag` is set)
function raceCloak(b, w, h, o, k = {}) {
  const g = drapeGeo(b, w, h, k);
  if (k.rag) {
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), down = (h / 2 - y) / h;
      if (down > 0.7) pa.setY(i, y - k.rag * (down - 0.7) / 0.3 * (0.5 + 0.5 * Math.sin(pa.getX(i) * 41 + 1.7)) * Math.abs(Math.sin(pa.getX(i) * 23)));
    }
    g.computeVertexNormals();
  }
  b.place(g, [0, -h / 2, -0.03], [0, 0, 0], 1, { ...o, w: [1.95, 1.0], a: [0.7, 1], d: mud(-h, -h + 0.35, 0.5) });
}
def('elf:cape.long', (b) => {   // longer and finer, a silver clasp, a green lining at the collar
  raceCloak(b, 0.56, 1.12, { ...cloth }, { folds: 1.2, phase: 0.3, flare: 0.36 });
  collar(b, 0.62, 0.06, S.elfGreen);
  clasp(b, S.silver);
}, true);
def('dwarf:cape.long', (b) => {   // shorter and heavy, a deep fur collar, a bronze clasp
  raceCloak(b, 0.66, 0.82, { ...cloth }, { folds: 0.7, flare: 0.24 });
  collar(b, 0.74, 0.14, S.orcFur);
  clasp(b, S.bronze);
}, true);
def('orc:cape.long', (b) => {   // a ragged cloak under a mantle of black fur
  raceCloak(b, 0.62, 0.95, { ...cloth }, { folds: 1.1, rag: 0.12 });
  collar(b, 0.72, 0.17, S.orcFur);
}, true);
def('undead:cape.long', (b) => {   // a burial cloak in tatters
  raceCloak(b, 0.56, 1.02, { ...cloth }, { folds: 1.3, rag: 0.2, phase: 1.1 });
  collar(b, 0.6, 0.05, S.rag);
  clasp(b, S.verd);
}, true);
