// Shared materials and geometry helpers.
import * as THREE from 'three';
import { stoneTexture, woodTexture, roofTexture, bannerTexture, soilTexture } from './textures.js';
import { TEAM_COLORS } from './config.js';

let M = null;

export function materials() {
  if (M) return M;
  const stone = stoneTexture(3);
  const wood = woodTexture(7, true);
  const plank = woodTexture(9, false);
  M = {
    stone: new THREE.MeshStandardMaterial({ map: stone, color: 0xe2dccf, roughness: 0.93 }),
    stoneDark: new THREE.MeshStandardMaterial({ map: stone, color: 0x8f8a80, roughness: 0.98 }),
    stoneBurnt: new THREE.MeshStandardMaterial({ map: stone, color: 0x4a4540, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, color: 0xffffff, roughness: 0.85 }),
    plank: new THREE.MeshStandardMaterial({ map: plank, color: 0xd8c8b0, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTexture(), color: 0xffffff, roughness: 0.8 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3b3f, metalness: 0.8, roughness: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd5d9e0, metalness: 0.9, roughness: 0.25 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.9, roughness: 0.3 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4b3020, roughness: 0.9 }),
    rope: new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 }),
    banners: TEAM_COLORS.map((c, i) => new THREE.MeshStandardMaterial({
      map: bannerTexture(c, i), side: THREE.DoubleSide, roughness: 0.9, transparent: true, alphaTest: 0.5,
    })),
    team: TEAM_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
  };
  return M;
}

// Box with UVs scaled to world size so textures keep a constant density.
export function box(w, h, d, texScale = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / texScale, uv.getY(i) * dims[f][1] / texScale);
    }
  }
  return g;
}

export function shadowed(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
