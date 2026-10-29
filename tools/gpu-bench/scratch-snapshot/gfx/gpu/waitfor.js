// usage: node waitfor.js <max seconds> <file> [file...]  -> returns when every file (under gfx/gpu/) has its final line, or when the time is up
const fs = require('fs');
const G = '/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/gpu/';
const max = Number(process.argv[2]) * 1000, files = process.argv.slice(3);
const t0 = Date.now();
const done = (f) => { try { return /(^|\n)errors|errors:|RESULT|Error/.test(fs.readFileSync(G + f, 'utf8')); } catch (e) { return false; } };
const t = setInterval(() => {
  const left = files.filter((f) => !done(f));
  if (!left.length || Date.now() - t0 > max) { console.log(left.length ? 'timeout, still waiting for: ' + left.join(' ') : 'all done: ' + files.join(' ')); clearInterval(t); }
}, 5000);
