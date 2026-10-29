import json, sys
txt = open(sys.argv[1]).read()
i = txt.rindex('errors')
d = json.loads(txt[:i])
print({k: d[k] for k in ('map', 'view', 'round', 'units', 'siege', 'simMsPerFrame', 'withBoth', 'nearOnly', 'noShadow', 'mem', 'meshes', 'post') if k in d})
for p in ('main', 'near', 'far'):
    print(p, d['totals'][p])
    for k, v in sorted(d[p].items(), key=lambda kv: -kv[1]['calls']):
        print('   %-28s calls %4d  kTris %7.1f' % (k, v['calls'], v['kTris']))
