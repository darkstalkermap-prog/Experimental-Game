// usage: node progsum.js progs_<tag>_<q>.json [more.json ...]   one line per program: family, material classes, hooks, flags, users
const fs = require('fs');
for (const file of process.argv.slice(2)) {
  const progs = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('==', file.split('/').pop(), progs.length, 'programs');
  const rows = progs.map((p) => {
    const m = p.mats;
    const cls = [...new Set(m.map((x) => x.cls.replace('Material', '')))].join('/') || '-';
    const hooks = [...new Set(m.map((x) => x.hooks))].filter(Boolean).join('/') || '-';
    const flags = [];
    if (m.some((x) => x.map)) flags.push('map'); if (m.some((x) => x.nmap)) flags.push('nmap'); if (m.some((x) => x.vcol)) flags.push('vcol');
    if (m.some((x) => x.side === 2)) flags.push('double'); if (m.some((x) => x.side === 1)) flags.push('back'); if (m.some((x) => x.aTest)) flags.push('aTest'); if (m.some((x) => x.flat)) flags.push('flat');
    if (m.some((x) => x.transp)) flags.push('transp'); if (m.some((x) => x.fog === false)) flags.push('nofog');
    if (m.some((x) => x.obj.includes('*'))) flags.push('inst');
    const names = [...new Set(m.map((x) => x.name || x.obj))].slice(0, 5).join(',');
    return { id: p.id, name: p.name, used: p.used, cls, hooks, flags: flags.join('+') || '-', n: m.length, names };
  });
  for (const r of rows) console.log(String(r.id).padStart(3), r.name.padEnd(16), 'x' + String(r.used).padEnd(3), r.cls.padEnd(22), r.hooks.padEnd(26), r.flags.padEnd(30), 'mats:' + r.n, r.names.slice(0, 60));
  const byName = {};
  for (const r of rows) byName[r.name] = (byName[r.name] || 0) + 1;
  console.log('by name:', Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join('  '));
}
