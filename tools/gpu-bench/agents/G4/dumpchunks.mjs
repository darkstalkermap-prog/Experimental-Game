import * as THREE from '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/three160/package/build/three.module.js';
import fs from 'fs';
const names = process.argv.slice(2);
let out = '';
for (const n of names) out += '//////// ' + n + '\n' + (THREE.ShaderChunk[n] || (THREE.ShaderLib[n] && THREE.ShaderLib[n].fragmentShader) || 'MISSING') + '\n';
fs.writeFileSync('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/G4/chunks.txt', out);
