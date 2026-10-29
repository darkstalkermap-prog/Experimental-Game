# the published page is index.html without the document skeleton (the Artifact tool wraps it), plus color-scheme for the dark theme
root = '/home/user/experimental-game/'
s = open(root + 'index.html').read()
head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
assert s.startswith(head)
s = s[len(head):]
a = '  :root {\n    --parch'
assert a in s
s = s.replace(a, '  :root {\n    color-scheme: dark;\n    --parch', 1)
assert '</head>\n<body>\n' in s and s.rstrip().endswith('</body>\n</html>')
s = s.replace('</head>\n<body>\n', '', 1)
s = s.rstrip()[:-len('</body>\n</html>')]
open('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/castle-wars.html', 'w').write(s)
print(len(s))
