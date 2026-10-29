import json, sys, glob, os
tag = sys.argv[1]
base = os.path.dirname(os.path.abspath(__file__))
rows = []
for p in sorted(glob.glob(f'{base}/prof_{tag}_*.json')):
    t = open(p).read()
    try:
        i = t.rindex('errors'); d = json.loads(t[:i])
    except Exception as e:
        print(p, 'unreadable', t[-200:]); continue
    name = os.path.basename(p)[len(f'prof_{tag}_'):-5]
    def tot(k): return d['totals'][k]
    rows.append((name, d))
    print('%-14s %s r%-2d units %3d siege %2d | sim %.2f ms | both: %4d calls %4dk tris %.1f ms | near-only: %4d calls %4dk | none: %4d calls %4dk | main %3d/%4dk near %3d/%4dk far %3d/%4dk | prog %d' % (
        name, d['map'], d['round'], d['units'], d['siege'], d['simMsPerFrame'],
        d['withBoth']['calls'], d['withBoth']['tris'] / 1000, d['withBoth']['ms'],
        d['nearOnly']['calls'], d['nearOnly']['tris'] / 1000, d['noShadow']['calls'], d['noShadow']['tris'] / 1000,
        tot('main')['calls'], tot('main')['kTris'], tot('near')['calls'], tot('near')['kTris'], tot('far')['calls'], tot('far')['kTris'], d['mem']['programs']))
