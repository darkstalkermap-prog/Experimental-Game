// Materials for the ground, one per Q.terrain level: 0 plain vertex colours, 1 plus a detail texture, 2 the splat shader.
import * as THREE from 'three';
import { grassDetailTexture } from './textures.js';

const cache = [];
let detail = null;

export function terrainMaterial(level) {
  if (cache[level]) return cache[level];
  let m;
  if (level === 0) m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  else {
    if (!detail) detail = grassDetailTexture();
    m = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.97, metalness: 0 });
  }
  cache[level] = m;
  return m;
}
