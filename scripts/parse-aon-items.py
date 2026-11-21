"""Build src/rules/magicItems.json from Archives of Nethys pages.

Usage: python3 -I scripts/parse-aon-items.py <dir> <out.json>
<dir> holds: items/wondrous-*.html (MagicWondrous.aspx?FinalSlot=...), items/rings.html (MagicRings.aspx),
items/staves.html (MagicStaves.aspx), list-Spells.aspx_Class_Wizard.html and list-Spells.aspx_Class_Cleric.html.
"""
import glob, html, json, os, re, sys

src, out = sys.argv[1], sys.argv[2]

def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()

def price(s):
    m = re.match(r'^([\d,]+(?:\.\d+)?)\s*gp', s.replace(' ', ' '))
    return float(m.group(1).replace(',', '')) if m else None

def table_items(path):
    t = open(path, encoding='utf-8', errors='ignore').read()
    items = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S):
        cells = [text(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]
        if len(cells) < 2 or cells[0] == 'Name':
            continue
        p = price(cells[-1]) if price(cells[-1]) is not None else price(cells[1])
        if p is None or p <= 0:
            continue
        it = {'n': cells[0], 'p': int(p) if p == int(p) else p}
        if 'PFS Legal' in row:
            it['l'] = 1  # legal for Pathfinder Society play: a good proxy for mainstream items
        items.append(it)
    return items

# Core Rulebook item names; AoN names that start with one of these (e.g. "Cloak of Resistance (+1)") are marked core.
CORE = {
    'wondrous': '''Amulet of Mighty Fists|Amulet of Natural Armor|Amulet of Proof against Detection and Location|Bag of Holding|Bag of Tricks|
Bead of Force|Belt of Giant Strength|Belt of Incredible Dexterity|Belt of Mighty Constitution|Belt of Physical Might|Belt of Physical Perfection|
Boots of Elvenkind|Boots of Levitation|Boots of Speed|Boots of Striding and Springing|Boots of Teleportation|Boots of the Winterlands|
Bracelet of Friends|Bracers of Archery|Bracers of Armor|Brooch of Shielding|Broom of Flying|Candle of Truth|Cape of the Mountebank|
Carpet of Flying|Chime of Opening|Circlet of Persuasion|Cloak of Arachnida|Cloak of Displacement|Cloak of Elvenkind|Cloak of Resistance|
Cloak of the Bat|Cloak of the Manta Ray|Crystal Ball|Cube of Force|Decanter of Endless Water|Dust of Appearance|Dust of Disappearance|
Dust of Dryness|Dust of Tracelessness|Elemental Gem|Elixir of Fire Breath|Elixir of Hiding|Elixir of Love|Elixir of Swimming|
Elixir of Truth|Elixir of Tumbling|Elixir of Vision|Everburning Torch|Eversmoking Bottle|Eyes of Charming|Eyes of the Eagle|Feather Token|
Figurine of Wondrous Power|Folding Boat|Gauntlet of Rust|Gem of Brightness|Gem of Seeing|Gloves of Arrow Snaring|Gloves of Swimming and Climbing|
Goggles of Minute Seeing|Goggles of Night|Golembane Scarab|Hand of Glory|Hand of the Mage|Handy Haversack|Hat of Disguise|
Headband of Alluring Charisma|Headband of Inspired Wisdom|Headband of Mental Prowess|Headband of Vast Intelligence|
Helm of Comprehend Languages and Read Magic|Helm of Underwater Action|Horn of Fog|Horn of Goodness/Evil|Horseshoes of Speed|
Horseshoes of a Zephyr|Incense of Meditation|Ioun Stone|Lens of Detection|Lyre of Building|Mask of the Skull|Mattock of the Titans|
Medallion of Thoughts|Mirror of Life Trapping|Necklace of Adaptation|Necklace of Fireballs|Pearl of Power|Pearl of the Sirines|
Periapt of Health|Periapt of Proof against Poison|Periapt of Wound Closure|Phylactery of Faithfulness|Pipes of Haunting|Pipes of Sounding|
Pipes of the Sewers|Portable Hole|Restorative Ointment|Ring Gates|Robe of Blending|Robe of Bones|Robe of Eyes|Robe of Useful Items|
Rope of Climbing|Rope of Entanglement|Salve of Slipperiness|Scabbard of Keen Edges|Scarab of Protection|Silversheen|Slippers of Spider Climbing|
Sovereign Glue|Stone Horse|Stone of Alarm|Stone of Good Luck|Stone Salve|Unguent of Timelessness|Universal Solvent|Vest of Escape|
Vestment, Druid's|Wind Fan|Wings of Flying'''.replace('\n', '').split('|'),
    'rings': '''Ring of Animal Friendship|Ring of Blinking|Ring of Chameleon Power|Ring of Climbing|Ring of Counterspells|Ring of Djinni Calling|
Ring of Elemental Command|Ring of Energy Resistance|Ring of Evasion|Ring of Feather Falling|Ring of Force Shield|Ring of Freedom of Movement|
Ring of Friend Shield|Ring of Invisibility|Ring of Jumping|Ring of Mind Shielding|Ring of Protection|Ring of Regeneration|Ring of Shooting Stars|
Ring of Spell Storing|Ring of Spell Turning|Ring of Sustenance|Ring of Swimming|Ring of Telekinesis|Ring of the Ram|Ring of Three Wishes|
Ring of Water Walking|Ring of Wizardry|Ring of X-Ray Vision'''.replace('\n', '').split('|'),
    'staves': '''Staff of Abjuration|Staff of Charming|Staff of Conjuration|Staff of Defense|Staff of Divination|Staff of Earth and Stone|
Staff of Enchantment|Staff of Evocation|Staff of Fire|Staff of Frost|Staff of Healing|Staff of Illumination|Staff of Illusion|Staff of Life|
Staff of Necromancy|Staff of Passage|Staff of Power|Staff of Size Alteration|Staff of Swarming Insects|Staff of the Magi|Staff of the Woodlands|
Staff of Transmutation'''.replace('\n', '').split('|'),
}

def mark_core(items, names):
    low = [n.lower() for n in names]
    for it in items:
        if any(it['n'].lower().startswith(n) for n in low):
            it['c'] = 1

data = {'wondrous': [], 'rings': [], 'staves': []}
seen = set()
for f in sorted(glob.glob(os.path.join(src, 'items', 'wondrous-*.html'))):
    for it in table_items(f):
        if it['n'] not in seen:
            seen.add(it['n'])
            data['wondrous'].append(it)
data['rings'] = table_items(os.path.join(src, 'items', 'rings.html'))
data['staves'] = table_items(os.path.join(src, 'items', 'staves.html'))

for kind in ('wondrous', 'rings', 'staves'):
    mark_core(data[kind], CORE[kind])

LEVELS = ['0-Level', '1st-Level', '2nd-Level', '3rd-Level', '4th-Level', '5th-Level', '6th-Level', '7th-Level', '8th-Level', '9th-Level']

def spells(path):
    t = open(path, encoding='utf-8', errors='ignore').read()
    t = re.sub(r'<script.*?</script>', '', t, flags=re.S)
    flat = re.sub(r'<(br|/p|/li|/h\d|/div)[^>]*>', '\n', t)
    flat = html.unescape(re.sub(r'<[^>]+>', '', flat))
    out = {}
    for i, lv in enumerate(LEVELS):
        start = flat.find(lv)
        if start < 0:
            continue
        end = flat.find(LEVELS[i + 1], start) if i + 1 < len(LEVELS) else len(flat)
        chunk = flat[start + len(lv):end]
        names = re.findall(r'(?:^|\n)\s*([A-Z][A-Za-z\'’ ,/()-]{2,60}?)\s*:\s', chunk)
        clean = []
        for n in names:
            # Drop AoN's superscript markers glued to the name (e.g. "Animate DeadMY", "Alchemical TinkeringR").
            n = re.sub(r'(?<=[a-z)’\'])[A-Z]{1,3}$', '', n.strip()).strip()
            if n and n not in clean and not n.startswith('Source'):
                clean.append(n)
        out[i] = clean
    return out

data['spells'] = {
    'arcane': spells(os.path.join(src, 'list-Spells.aspx_Class_Wizard.html')),
    'divine': spells(os.path.join(src, 'list-Spells.aspx_Class_Cleric.html')),
}
json.dump(data, open(out, 'w'), separators=(',', ':'), ensure_ascii=False)
print({k: len(v) for k, v in data.items() if isinstance(v, list)},
      {k: {l: len(v) for l, v in d.items()} for k, d in data['spells'].items()})
