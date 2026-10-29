import fs from 'fs';
const src = fs.readFileSync('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/three160/package/build/three.module.js', 'utf8');
const lines = src.split('\n');
const want = process.argv.slice(2);
for (const w of want) {
  const l = lines.find((x) => x.startsWith('var ' + w + ' = ') || x.startsWith('const ' + w + ' = '));
  if (!l) { console.log('NOT FOUND', w); continue; }
  const val = eval(l.slice(l.indexOf('=') + 1).replace(/;\s*$/, ''));
  console.log('=== ' + w + '\n' + val);
}
