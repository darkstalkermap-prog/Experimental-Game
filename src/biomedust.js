// A dusting of the biome on the castles: snow on the roofs and the tops of the walls, a little windblown sand in the desert, moss in the marsh. The castle
// materials are shared by every world of the page, so this is a hook on their shaders with two uniforms (how much, and the colour) that each world sets;
// in the meadow the amount is 0 and nothing changes. Only surfaces that face up take it (the normal in the castle's own space: castles only turn about y).
import { patchMaterial } from './shaderhook.js';
import { active } from './biomes.js';
import * as THREE from 'three';

const DUST = { amount: { value: 0 }, color: { value: new THREE.Color(1, 1, 1) } };
const done = new WeakSet();

function hook(material) {
  if (done.has(material)) return;
  done.add(material);
  patchMaterial(material, 'biome-dust', (shader) => {
    shader.uniforms.uDust = DUST.amount; shader.uniforms.uDustColor = DUST.color;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vDustUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDustUp = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDust; uniform vec3 uDustColor;\nvarying float vDustUp;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, uDust * smoothstep(0.36, 0.8, vDustUp));');
  });
}

// set for the world being built: `set` is the page's shared materials (materials.js)
export function setBiomeDust(set) {
  const d = active.def.dust;
  DUST.amount.value = d ? d.amount : 0;
  if (d) DUST.color.value.setRGB(d.color[0], d.color[1], d.color[2]);
  if (!d && !done.size) return;   // (the meadow never touches the castles' shaders: they stay as they were until a biome with dust is built)
  for (const k of ['stone', 'stoneDark', 'stoneFine', 'masonry', 'tiles', 'timber', 'plain']) if (set[k]) hook(set[k]);
}
