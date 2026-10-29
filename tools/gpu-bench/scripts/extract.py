"""usage: python3 -I extract.py <agent transcript .jsonl> [max_assistant_msgs=6]
Prints (1) every benchmark JSON line the agent saw (lines with "mean": and "quality"), de-duplicated in order, and
(2) the last few assistant text messages (each cut to 900 chars). Nothing else, so a long transcript stays small."""
import json, re, sys
p = sys.argv[1]; k = int(sys.argv[2]) if len(sys.argv) > 2 else 6
bench, said = [], []
def blocks(msg):
    c = msg.get('content') if isinstance(msg, dict) else None
    if isinstance(c, str):
        yield 'text', c
    elif isinstance(c, list):
        for b in c:
            if not isinstance(b, dict): continue
            if b.get('type') == 'text': yield 'text', b.get('text', '')
            elif b.get('type') == 'tool_result':
                t = b.get('content')
                if isinstance(t, list): t = ' '.join(x.get('text', '') for x in t if isinstance(x, dict))
                yield 'result', t or ''
for line in open(p):
    try: d = json.loads(line)
    except Exception: continue
    msg = d.get('message')
    for kind, text in blocks(msg):
        if kind == 'result':
            for l in text.splitlines():
                if '"mean"' in l and '"quality"' in l:
                    l = l.strip()
                    if not bench or bench[-1] != l: bench.append(l[:260])
        elif kind == 'text' and d.get('type') == 'assistant' and text.strip():
            said.append(text.strip())
print('--- benchmark lines seen: %d (showing last 14)' % len(bench))
for l in bench[-14:]: print(l)
print('--- last assistant messages')
for t in said[-k:]: print('>', t[:900].replace('\n', ' '))
