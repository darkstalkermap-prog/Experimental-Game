import json, sys
for name in sys.argv[1:]:
    t = open(name).read()
    j = json.loads(t[:t.rindex('}') + 1])
    print(name.split('/')[-1], 'units', j['units'], 'siege', j['siege'], 'calls', j['info']['calls'], 'tris', j['info']['tris'],
          'programs', j['info']['programs'], 'textures', j['info']['textures'], 'withShadow', j['withShadow'], 'noShadow', j['noShadow'],
          'sim', j['simMsPerFrame'], 'shadowMap', j['shadowMap'])
