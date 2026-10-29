// prints one line when each queued output file has its last line (they all end with 'errors ...' or a RESULT line)
const fs = require('fs');
const G = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/gpu/';
const files = ['s_before_high.txt', 's_before_medium.txt', 's_after_medium.txt', 's_before_low.txt', 's_after_low.txt', 't_tris_after.txt', 't_classswitch.txt', 't_crowdtest.txt', 't_qcycle.txt', 't_crew.txt',
  'v_before_high.txt', 'v_after_high.txt', 'v_before_medium.txt', 'v_after_medium.txt', 'v_before_court.txt', 'v_after_court.txt', 'e_before_high.txt', 'e_after_high.txt', 'e_before_low.txt', 'e_after_low.txt', 'p_after.json'];
const seen = new Set();
const t = setInterval(() => {
  for (const f of files) {
    if (seen.has(f)) continue;
    let s = '';
    try { s = fs.readFileSync(G + f, 'utf8'); } catch (e) { continue; }
    if (/(^|\n)errors|errors:|RESULT|Error|rc=/.test(s)) { seen.add(f); console.log('done: ' + f); }
  }
  if (seen.size >= files.length) { console.log('all done'); clearInterval(t); }
}, 10000);
