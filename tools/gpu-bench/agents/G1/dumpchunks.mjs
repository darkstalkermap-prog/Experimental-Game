import * as THREE from '/home/user/experimental-game/.claude/worktrees/agent-a4d81fe972a41d18e/vendor/three.module.min.js';
import fs from 'fs';
const names = ['lights_fragment_maps','lights_physical_pars_fragment','envmap_physical_pars_fragment','lights_fragment_begin','lights_physical_fragment','lights_fragment_end','cube_uv_reflection_fragment','meshphysical_frag','normal_fragment_begin','normal_fragment_maps','lights_pars_begin','bsdfs'];
for (const n of names) fs.writeFileSync(`chunk_${n}.glsl`, THREE.ShaderChunk[n] || 'MISSING');
console.log(THREE.REVISION);
