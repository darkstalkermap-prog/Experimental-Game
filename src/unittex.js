// Procedural textures for the characters: a strip of eight faces and a strip of eight heraldic emblems. Both are masks read by the
// unit shader (unitmat.js): the colours come from the soldier (skin, hair, house), so one texture serves everyone.
//   faces    R skin shading (1 none)   G hair mask (brows, stubble)   B eye whites   A dark details (pupils, mouth, paint, scars)
//   emblems  R the charge   G a dark outline around it
import * as THREE from 'three';

const CELL = 64, CELLS = 8;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const cov = (d, w = 0.013) => clamp01(0.5 - d / w);                       // pixel coverage from a signed distance (negative inside)
const sdCircle = (u, v, cx, cy, r) => Math.hypot(u - cx, v - cy) - r;
const sdBox = (u, v, cx, cy, hx, hy) => {
  const dx = Math.abs(u - cx) - hx, dy = Math.abs(v - cy) - hy;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};
const sdSeg = (u, v, ax, ay, bx, by, r) => {
  const px = u - ax, py = v - ay, dx = bx - ax, dy = by - ay;
  const h = clamp01((px * dx + py * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(px - dx * h, py - dy * h) - r;
};
const sdEll = (u, v, cx, cy, rx, ry) => (Math.hypot((u - cx) / rx, (v - cy) / ry) - 1) * Math.min(rx, ry);
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

function makeTexture(data) {
  const t = new THREE.DataTexture(data, CELL * CELLS, CELL, THREE.RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// face variants: brow thickness / height / tilt, eye size, mouth width and curve (+ = smile), stubble, scar, war paint
const FACES = [
  { brow: 0.032, by: 0.665, tilt: 0.0, eye: 1.0, mw: 0.16, mc: 0.0, stub: 0.0, scar: 0, paint: 0 },
  { brow: 0.046, by: 0.655, tilt: -0.05, eye: 0.9, mw: 0.15, mc: -0.012, stub: 0.0, scar: 0, paint: 0 },
  { brow: 0.036, by: 0.67, tilt: 0.02, eye: 1.0, mw: 0.17, mc: 0.0, stub: 0.55, scar: 0, paint: 0 },
  { brow: 0.04, by: 0.66, tilt: -0.03, eye: 0.95, mw: 0.15, mc: -0.006, stub: 0.2, scar: 1, paint: 0 },
  { brow: 0.028, by: 0.68, tilt: 0.03, eye: 1.1, mw: 0.17, mc: 0.012, stub: 0.0, scar: 0, paint: 0 },
  { brow: 0.04, by: 0.65, tilt: -0.04, eye: 0.85, mw: 0.14, mc: -0.014, stub: 0.35, scar: 0, paint: 0 },
  { brow: 0.05, by: 0.655, tilt: -0.07, eye: 0.9, mw: 0.16, mc: -0.01, stub: 0.3, scar: 0, paint: 1 },
  { brow: 0.045, by: 0.66, tilt: -0.05, eye: 0.95, mw: 0.15, mc: -0.008, stub: 0.2, scar: 1, paint: 2 },
];

let faceTex = null;
export function faceAtlas() {
  if (faceTex) return faceTex;
  const W = CELL * CELLS, data = new Uint8Array(W * CELL * 4);
  for (let c = 0; c < CELLS; c++) {
    const f = FACES[c];
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = (x + 0.5) / CELL, v = (y + 0.5) / CELL, su = Math.abs(u - 0.5);
        let r = 1, g = 0, b = 0, a = 0;
        // the face sits in the middle of the cell: shade the edges so it melts into the head
        r -= 0.35 * clamp01((su - 0.3) / 0.2);
        r -= 0.25 * clamp01((0.18 - v) / 0.18);
        // eye sockets and nose
        const sock = Math.min(sdEll(u, v, 0.5 - 0.18, 0.555, 0.12, 0.075), sdEll(u, v, 0.5 + 0.18, 0.555, 0.12, 0.075));
        r -= 0.16 * cov(sock, 0.09);
        r -= 0.2 * cov(Math.abs(su - 0.085) - 0.016, 0.05) * clamp01((v - 0.33) / 0.05) * clamp01((0.56 - v) / 0.08);
        r -= 0.12 * cov(sdEll(u, v, 0.5, 0.345, 0.07, 0.04), 0.04);
        // eyes
        for (const s of [-1, 1]) {
          const ex = 0.5 + s * 0.18, ey = 0.555;
          const eye = sdEll(u, v, ex, ey, 0.082 * f.eye, 0.036 * f.eye);
          b = Math.max(b, cov(eye));
          a = Math.max(a, cov(sdCircle(u, v, ex, ey, 0.03 * f.eye)) * cov(eye, 0.02));
          a = Math.max(a, 0.6 * cov(Math.abs(sdEll(u, v, ex, ey + 0.012, 0.09 * f.eye, 0.04 * f.eye)) - 0.006) * (v > ey ? 1 : 0));   // lid line
          g = Math.max(g, 0.92 * cov(sdSeg(u, v, 0.5 + s * 0.07, f.by - 0.02 + f.tilt * 0.4, 0.5 + s * 0.27, f.by + f.tilt, f.brow * 0.5)));   // brows
        }
        // nostrils and mouth
        for (const s of [-1, 1]) a = Math.max(a, 0.55 * cov(sdEll(u, v, 0.5 + s * 0.052, 0.36, 0.02, 0.012)));
        const my = 0.235 + f.mc * (1 - Math.pow((u - 0.5) / f.mw, 2));
        if (su < f.mw) a = Math.max(a, 0.6 * cov(Math.abs(v - my) - 0.007));
        r -= 0.1 * cov(sdEll(u, v, 0.5, 0.17, 0.09, 0.03), 0.04);
        // stubble and moustache
        if (f.stub > 0) {
          const area = cov(sdBox(u, v, 0.5, 0.18, 0.33, 0.2), 0.12) * (1 - cov(sdEll(u, v, 0.5, 0.235, 0.14, 0.05), 0.02) * 0.5);
          g = Math.max(g, area * f.stub * (0.55 + 0.45 * hash(x, y)));
        }
        g = Math.max(g, 0.5 * cov(sdEll(u, v, 0.5, 0.275, 0.12, 0.025), 0.03));                  // moustache shadow
        if (f.scar) a = Math.max(a, 0.5 * cov(sdSeg(u, v, 0.67, 0.72, 0.56, 0.42, 0.007)));
        if (f.paint === 1) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) a = Math.max(a, 0.78 * cov(sdSeg(u, v, 0.5 + s * (0.16 + k * 0.05), 0.47, 0.5 + s * (0.2 + k * 0.05), 0.26, 0.012)));
        if (f.paint === 2) { a = Math.max(a, 0.78 * cov(Math.abs(v - 0.555) - 0.06)); a = Math.max(a, 0.6 * cov(sdSeg(u, v, 0.5, 0.5, 0.5, 0.88, 0.02))); }
        const i = (y * W + c * CELL + x) * 4;
        data[i] = Math.round(clamp01(r) * 255); data[i + 1] = Math.round(clamp01(g) * 255); data[i + 2] = Math.round(clamp01(b) * 255); data[i + 3] = Math.round(clamp01(a) * 255);
      }
    }
  }
  faceTex = makeTexture(data);
  return faceTex;
}

// emblems: 0 a tower, 1 crossed swords, 2 an oak, 3 a sun, 4 a skull, 5 a cross, 6 a chevron, 7 a star
const EMBLEMS = [
  (u, v) => Math.min(
    Math.max(sdBox(u, v, 0.5, 0.4, 0.17, 0.27), -Math.min(sdBox(u, v, 0.5, 0.27, 0.06, 0.1), sdCircle(u, v, 0.5, 0.37, 0.06), sdBox(u, v, 0.5, 0.58, 0.014, 0.05))),
    sdBox(u, v, 0.35, 0.74, 0.045, 0.06), sdBox(u, v, 0.5, 0.74, 0.045, 0.06), sdBox(u, v, 0.65, 0.74, 0.045, 0.06)),
  (u, v) => Math.min(sdSeg(u, v, 0.26, 0.18, 0.74, 0.8, 0.032), sdSeg(u, v, 0.74, 0.18, 0.26, 0.8, 0.032), sdSeg(u, v, 0.34, 0.6, 0.5, 0.45, 0.025) + 0.0,
    sdSeg(u, v, 0.66, 0.6, 0.5, 0.45, 0.025), sdSeg(u, v, 0.3, 0.3, 0.42, 0.4, 0.03), sdSeg(u, v, 0.7, 0.3, 0.58, 0.4, 0.03)),
  (u, v) => Math.min(sdBox(u, v, 0.5, 0.3, 0.045, 0.22), sdCircle(u, v, 0.5, 0.62, 0.2), sdCircle(u, v, 0.35, 0.5, 0.13), sdCircle(u, v, 0.65, 0.5, 0.13)),
  (u, v) => {
    let d = sdCircle(u, v, 0.5, 0.5, 0.16);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; d = Math.min(d, sdSeg(u, v, 0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22, 0.5 + Math.cos(a) * 0.37, 0.5 + Math.sin(a) * 0.37, 0.026)); }
    return d;
  },
  (u, v) => Math.max(Math.min(sdCircle(u, v, 0.5, 0.6, 0.22), sdBox(u, v, 0.5, 0.33, 0.12, 0.09)),
    -Math.min(sdCircle(u, v, 0.4, 0.58, 0.065), sdCircle(u, v, 0.6, 0.58, 0.065), sdSeg(u, v, 0.5, 0.5, 0.5, 0.42, 0.02), sdBox(u, v, 0.42, 0.3, 0.012, 0.05), sdBox(u, v, 0.58, 0.3, 0.012, 0.05), sdBox(u, v, 0.5, 0.3, 0.012, 0.05))),
  (u, v) => Math.min(sdBox(u, v, 0.5, 0.5, 0.06, 0.34), sdBox(u, v, 0.5, 0.58, 0.24, 0.06)),
  (u, v) => Math.min(sdSeg(u, v, 0.2, 0.34, 0.5, 0.66, 0.05), sdSeg(u, v, 0.8, 0.34, 0.5, 0.66, 0.05)),
  (u, v) => { let d = 1; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + Math.PI / 2; d = Math.min(d, sdSeg(u, v, 0.5, 0.5, 0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.34, 0.045)); } return d; },
];

let emblemTex = null;
export function emblemAtlas() {
  if (emblemTex) return emblemTex;
  const W = CELL * CELLS, data = new Uint8Array(W * CELL * 4);
  for (let c = 0; c < CELLS; c++) {
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = (x + 0.5) / CELL, v = (y + 0.5) / CELL;
        const d = EMBLEMS[c](u, v);
        const charge = cov(d, 0.02), ring = cov(d - 0.028, 0.02) * (1 - charge);
        const i = (y * W + c * CELL + x) * 4;
        data[i] = Math.round(charge * 255); data[i + 1] = Math.round(ring * 255); data[i + 2] = 0; data[i + 3] = 255;
      }
    }
  }
  emblemTex = makeTexture(data);
  return emblemTex;
}

export function unitTextures() { return [faceTex, emblemTex].filter(Boolean); }
