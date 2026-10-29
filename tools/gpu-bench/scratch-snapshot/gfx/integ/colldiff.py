import json, sys
def load(p):
    t = open(p).read()
    i = t.rindex('errors')
    return json.loads(t[:i])
a = load(sys.argv[1]); b = load(sys.argv[2])
ra = [tuple(r) for r in a['rows']]; rb = [tuple(r) for r in b['rows']]
sa = {}; sb = {}
for r in ra: sa[r] = sa.get(r, 0) + 1
for r in rb: sb[r] = sb.get(r, 0) + 1
only_a = [r for r in sa if sa[r] != sb.get(r, 0)]
only_b = [r for r in sb if sb[r] != sa.get(r, 0)]
print('rows', len(ra), len(rb), 'only in base', len(only_a), 'only in merged', len(only_b))
for r in sorted(only_a)[:12]: print(' base  ', r)
for r in sorted(only_b)[:12]: print(' merged', r)
