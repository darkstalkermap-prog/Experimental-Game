import json, sys
for p in sys.argv[1:]:
    t = open(p).read()
    i = t.rindex('errors')
    d = json.loads(t[:i])
    print(p.split('/')[-1], {k: d[k] for k in ('round', 'units', 'siege', 'simMsPerFrame', 'info', 'withShadow', 'noShadow', 'sceneTris', 'unitLod', 'pr') if k in d})
