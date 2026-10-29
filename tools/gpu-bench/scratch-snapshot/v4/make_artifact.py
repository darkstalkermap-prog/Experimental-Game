# Build the artifact copy of index.html: the artifact tool supplies the document skeleton, so the page starts at <title>,
# gets color-scheme: dark on :root, and loses the head/body wrappers.
s = open('/home/user/experimental-game/index.html').read()
head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
assert s.startswith(head)
s = s[len(head):]
assert '  :root {\n' in s
s = s.replace('  :root {\n', '  :root {\n    color-scheme: dark;\n', 1)
assert '</head>\n<body>\n' in s
s = s.replace('</head>\n<body>\n', '', 1)
assert s.rstrip().endswith('</body>\n</html>')
s = s.rstrip()[:-len('</body>\n</html>')]
open('/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/castle-wars.html', 'w').write(s)
print('wrote', len(s))
