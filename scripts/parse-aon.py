"""Convert text dumps of Archives of Nethys Ultimate Campaign pages into JSON data.

Usage: python3 -I scripts/parse-aon.py <dir-with-1543.txt-and-1545.txt> <out-dir>
The .txt files are plain-text conversions of aonprd.com/Rules.aspx?ID=1543 (buildings)
and ID=1545 (events).
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower().replace("'", '')).strip('-')

def num(s):
    return int(s.replace('–', '-').replace('−', '-').replace('+', ''))

# ---------- buildings ----------
text = open(f'{src}/1543.txt', encoding='utf-8').read()
text = text.split('Academy (52 BP', 1)[1]
text = 'Academy (52 BP' + text
head = re.compile(r'^([A-Z][A-Za-z\' ]+?) \((\d+) BP(?:, ([\d–-]+) Lots?)?\)\s*$', re.M)
matches = list(head.finditer(text))
buildings = []
for i, m in enumerate(matches):
    body = text[m.end(): matches[i + 1].start() if i + 1 < len(matches) else len(text)]
    body = body.split('Site Owner')[0]
    name, cost, lots = m.group(1).strip(), int(m.group(2)), m.group(3)
    b = {'id': slug(name), 'name': name, 'cost': cost,
         'lots': (int(lots.split('–')[0].split('-')[0]) if lots else 0)}
    fields = {}
    key = None
    desc = []
    for line in [l.strip() for l in body.strip().split('\n') if l.strip()]:
        fm = re.match(r'^(Kingdom|Discount|Limit|Upgrade From|Upgrade To|Special|Magic Items|Settlement)\b ?(.*)$', line)
        if key == 'Limit' and not fields.get('Limit'):
            # "Limit" with its text on the next line
            fields['Limit'] = line
            key = None
        elif fm:
            k, v = fm.group(1), fm.group(2)
            if k == 'Upgrade From' and '; Upgrade To ' in v:
                v, to = v.split('; Upgrade To ')
                fields['Upgrade To'] = to
            if k == 'Special' and '. ' in v and k not in fields:
                # e.g. "Can share lot with another building Contains a safe supply..."
                pass
            fields[k] = v
            key = k
        else:
            desc.append(line)
    kd = fields.get('Kingdom', '')
    for attr in ['Economy', 'Loyalty', 'Stability', 'Unrest', 'Fame']:
        mm = re.search(attr + r' ([+–-]\d+)', kd)
        if mm:
            b[attr.lower()] = num(mm.group(1))
    if 'once per settlement' in kd:
        b['unrestOncePerSettlement'] = True
    for k, name_ in [('Discount', 'discounts'), ('Upgrade To', 'upgradeTo'), ('Upgrade From', 'upgradeFrom')]:
        if k in fields:
            b[name_] = [slug(x) for x in re.split(r', | or ', fields[k]) if x.strip()]
    for k, name_ in [('Limit', 'limitText'), ('Special', 'specialText'), ('Magic Items', 'magicItems'), ('Settlement', 'settlementText')]:
        if k in fields and fields[k]:
            b[name_] = fields[k]
    sp = fields.get('Special', '')
    bv = re.search(r'Base value \+([\d,]+) gp', sp)
    if bv:
        b['baseValue'] = int(bv.group(1).replace(',', ''))
    df = re.search(r'Defense \+(\d+)', sp)
    if df:
        b['defense'] = int(df.group(1))
    if desc:
        b['description'] = ' '.join(desc)
    buildings.append(b)
json.dump(buildings, open(f'{out}/buildings.json', 'w'), indent=1, ensure_ascii=False)
print(len(buildings), 'buildings')

# ---------- events ----------
t = open(f'{src}/1545.txt', encoding='utf-8').read().split('Site Owner')[0]
tables = {}
for tm in re.finditer(r'Table (4-\d+): ([^\n]+)\nd% \| Event \| \n((?:[\d-]+ \| [^\n]+\n)+)', t):
    rows = []
    for line in tm.group(3).strip().split('\n'):
        rng, ev = [x.strip() for x in line.split('|')[:2]]
        lo, hi = (rng.split('-') + [rng])[:2]
        rows.append({'min': int(lo), 'max': int(hi), 'event': ev})
    tables[tm.group(1)] = {'title': tm.group(2).strip(), 'rows': rows}
names = sorted({r['event'] for k, tb in tables.items() if k != '4-7' for r in tb['rows']}, key=len, reverse=True)
names += ['Squatters', 'Vandals']
body = t.split('91-100 | Vandals | ', 1)[1]
pat = re.compile(r'(?:(?<=^)|(?<=\n)|(?<=\. )|(?<=\.\) ))\s*(' + '|'.join(re.escape(n) for n in set(names)) + r')( \([^)]*\))?: ', re.I)
parts = list(pat.finditer(body))
events = {}
for i, m in enumerate(parts):
    end = parts[i + 1].start() if i + 1 < len(parts) else len(body)
    nm = m.group(1).strip()
    tags = (m.group(2) or '').strip(' ()')
    events[slug(nm)] = {'name': nm[0].upper() + nm[1:], 'tags': tags, 'text': re.sub(r'\s+', ' ', body[m.end():end]).strip()}
json.dump({'tables': tables, 'events': events}, open(f'{out}/events.json', 'w'), indent=1, ensure_ascii=False)
print(len(events), 'events', list(tables))
