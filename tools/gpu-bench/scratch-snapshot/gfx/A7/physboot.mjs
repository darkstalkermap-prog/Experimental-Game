// Times the Physics constructor (terrain heights) in plain node.  usage: node physboot.mjs <map>
const root = '/home/user/experimental-game/.claude/worktrees/agent-ac4feb3b20b5b1d48/src/';
const { setMapSize, WORLD } = await import(root + 'config.js');
const { Physics } = await import(root + 'physics.js');
for (const size of [process.argv[2] || 'medium']) {
  setMapSize(size);
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    const p = new Physics(11);
    console.log(size, 'half', WORLD.half, 'cells', p.n * p.n, 'ctor ms', (performance.now() - t).toFixed(1));
  }
}
