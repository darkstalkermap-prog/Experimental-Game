// Builds the desktop app: copies the game (index.html, src/, vendor/) next to the app's own files in build/app, then packages it for
// Windows, macOS and Linux into dist/ (one folder per platform; zip them to hand out).
//   node build.cjs                 every platform
//   node build.cjs win32 darwin    some of them (win32, darwin, linux)
//   node build.cjs --stage-only    only build/app (npm start runs it)
const fs = require('fs');
const path = require('path');

const HERE = __dirname, GAME = path.join(HERE, '..'), APP = path.join(HERE, 'build', 'app');
fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(path.join(APP, 'game'), { recursive: true });
for (const f of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(APP, f));
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, main: pkg.main }, null, 2));
fs.copyFileSync(path.join(GAME, 'index.html'), path.join(APP, 'game', 'index.html'));
for (const d of ['src', 'vendor']) fs.cpSync(path.join(GAME, d), path.join(APP, 'game', d), { recursive: true });
console.log('staged', APP);
if (process.argv.includes('--stage-only')) process.exit(0);

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64'], ['linux', 'x64']].filter(([p]) => !wanted.length || wanted.includes(p));
(async () => {
  const { packager } = await import('@electron/packager');
  for (const [platform, arch] of targets) {
    const out = await packager({
      dir: APP, out: path.join(HERE, 'dist'), overwrite: true, platform, arch, asar: true, prune: false,
      name: 'Castle Wars', executableName: platform === 'linux' ? 'castle-wars' : 'Castle Wars', appBundleId: 'io.github.darkstalkermap.castlewars',
      appCopyright: 'Castle Wars', win32metadata: { ProductName: 'Castle Wars', FileDescription: 'Castle Wars' },
    });
    console.log('built', out.join(', '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
