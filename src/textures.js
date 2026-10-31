// Procedurally painted canvas textures, so the game ships with no image assets.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { aniso } from './aniso.js';
import { HOUSE_SIGILS } from './emblems.js';
import { DEFAULT_ARMS, armsKey, paintField, paintSigil } from './heraldry.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return aniso(t, 8);
}

function speckle(ctx, w, h, rng, count, alpha, light = true) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng() * alpha})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

export function stoneTexture(seed = 3) {
  const rng = mulberry32(seed);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#5f5a52';
  ctx.fillRect(0, 0, 512, 512);
  const rowH = 64;
  for (let y = 0; y < 512; y += rowH) {
    let x = -rng() * 80;
    while (x < 512) {
      const w = 80 + rng() * 70;
      const g = 150 + rng() * 45;
      const warm = rng() * 14;
      ctx.fillStyle = `rgb(${g + warm},${g + warm * 0.6},${g - 6})`;
      ctx.fillRect(x + 3, y + 3, w - 6, rowH - 6);
      // subtle shading per block
      const grd = ctx.createLinearGradient(0, y, 0, y + rowH);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = grd;
      ctx.fillRect(x + 3, y + 3, w - 6, rowH - 6);
      // wrap horizontally so the texture tiles
      if (x + w > 512) {
        ctx.fillStyle = `rgb(${g + warm},${g + warm * 0.6},${g - 6})`;
        ctx.fillRect(x - 512 + 3, y + 3, w - 6, rowH - 6);
      }
      x += w;
    }
  }
  speckle(ctx, 512, 512, rng, 9000, 0.12, false);
  speckle(ctx, 512, 512, rng, 5000, 0.08, true);
  // moss / grime streaks near the bottom of blocks
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(70,80,40,${rng() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 512, rng() * 512, 10 + rng() * 30, 4 + rng() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

export function woodTexture(seed = 7, banded = true) {
  const rng = mulberry32(seed);
  const [c, ctx] = canvas(256, 256);
  const planks = 6;
  const pw = 256 / planks;
  for (let i = 0; i < planks; i++) {
    const b = 90 + rng() * 30;
    ctx.fillStyle = `rgb(${b},${b * 0.66},${b * 0.4})`;
    ctx.fillRect(i * pw, 0, pw, 256);
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(40,22,10,${0.1 + rng() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = i * pw + rng() * pw;
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + rng() * 6 - 3, 80, x0 + rng() * 6 - 3, 170, x0 + rng() * 4 - 2, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,10,5,0.6)';
    ctx.fillRect(i * pw, 0, 2, 256);
  }
  if (banded) {
    for (const y of [36, 210]) {
      ctx.fillStyle = '#2b2b2e';
      ctx.fillRect(0, y, 256, 16);
      ctx.fillStyle = '#55555a';
      for (let x = 10; x < 256; x += 32) {
        ctx.beginPath(); ctx.arc(x, y + 8, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  speckle(ctx, 256, 256, rng, 1500, 0.15, false);
  return finish(c);
}

export function roofTexture(seed = 5) {
  const rng = mulberry32(seed);
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#3c3f46';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 12) {
    for (let x = (y / 12) % 2 ? -8 : 0; x < 128; x += 16) {
      const g = 50 + rng() * 25;
      ctx.fillStyle = `rgb(${g},${g + 3},${g + 10})`;
      ctx.fillRect(x + 1, y + 1, 14, 10);
    }
  }
  return finish(c);
}

// Heraldic banner for a team: the field in the house colour (divided with a second tint, if the lord's arms say so: heraldry.js) and a sigil:
// the lord's own, or the emblem of the house (the one its soldiers wear). `arms`: { sig, div, tint }, a sigil id alone, or nothing.
export function bannerTexture(colorHex, team, arms = null) {
  const a = typeof arms === 'string' ? { ...DEFAULT_ARMS, sig: arms } : arms || DEFAULT_ARMS;
  const [c, ctx] = canvas(128, 256);
  paintField(ctx, 0, 0, 128, 256, a, colorHex, 108 / 256);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 128, 14);
  // swallowtail notch
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(30, 256); ctx.lineTo(64, 212); ctx.lineTo(98, 256); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#e9d9a6';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 20, 112, 180);
  ctx.save();
  ctx.translate(64, 108);
  paintSigil(ctx, a.sig ? a : { ...a, sig: HOUSE_SIGILS[team % HOUSE_SIGILS.length] }, colorHex, 46);
  ctx.restore();
  return finish(c, false);
}

// the banners of lords' arms, one texture for each (house colour, arms) pair; kept for the visit
const earned = new Map();
export function customBanner(colorHex, team, arms) {
  const a = typeof arms === 'string' ? { ...DEFAULT_ARMS, sig: arms } : arms;
  const key = `${colorHex}:${team}:${armsKey(a)}`;
  if (!earned.has(key)) earned.set(key, bannerTexture(colorHex, team, a));
  return earned.get(key);
}

export function soilTexture(seed = 13) {
  const rng = mulberry32(seed);
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#6a5a44';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 3000, 0.3, false);
  speckle(ctx, 128, 128, rng, 1200, 0.2, true);
  return finish(c);
}
