"""Compose an evidence gallery from settled UI stills and original burning views."""
import argparse
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', default='final-contact')
parser.add_argument('--ui-evidence', default='final-contact-ui-settled')
parser.add_argument('--contacts', action='store_true', help='Also create phone review sheets; requires Pillow.')
args = parser.parse_args()
original_path = ROOT / 'artifacts/snow-time-looks' / args.evidence / 'report.json'
repair_path = ROOT / 'artifacts/snow-time-looks' / args.ui_evidence / 'report.json'
original = json.loads(original_path.read_text())
repair = json.loads(repair_path.read_text())
assert len(original['views']) == 48 and len(repair['views']) == 36
assert not original['errors'] and not repair['errors']
assert not original['sourceChanged'] and not repair['sourceChanged']
assert original['sourceStart']['aggregateSha256'] == repair['sourceStart']['aggregateSha256']
selected = repair['views'] + [v for v in original['views'] if v['name'] == 'burning']
lookup = {(v['viewport'], v['hour'], v['name']): v for v in selected}
assert len(lookup) == 48
hours = [5.5, 7, 13, 17.5, 19.5, 22]
names = ['outside', 'choose', 'confirm', 'burning']
output = ROOT / f'docs/evidence/snow-journey/{args.evidence}-time-looks.html'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source = original['sourceStart']
scene_id = source['instrumentation']['originalSceneSha256'][:8]
manifest_id = next(f['sha256'][:8] for f in source['files'] if f['path'] == 'web/public/places/snow-roof/manifest.json')
geometry_id = next(f['sha256'][:8] for f in source['files'] if f['path'] == 'web/public/places/snow-roof/snow-roof.glb')
provenance = {'originalReport': {'path': str(original_path.relative_to(ROOT)), 'sha256': sha(original_path)},
              'uiSettledReport': {'path': str(repair_path.relative_to(ROOT)), 'sha256': sha(repair_path)}, 'frames': []}
page = ['''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Snow Roof Court · six lighting looks</title><style>
body{margin:0;background:#111611;color:#eee6d4;font:16px/1.5 system-ui}
main{max-width:1500px;margin:auto;padding:24px}h1{font:32px Georgia}a{color:#e4b570}
nav{position:sticky;top:0;background:#111611ed;padding:12px;z-index:2}
button{font:inherit;padding:8px 18px;background:#273024;color:inherit;border:1px solid #777;cursor:pointer}
section{border-top:1px solid #46513d;margin-top:24px;padding-top:12px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0}
img{display:block;width:100%;height:auto;background:#000}figcaption{font-size:13px;margin:6px 0 18px}
.meta{font-size:13px;color:#b7bda8;overflow-wrap:anywhere}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
<main><h1>Snow Roof Court · six lighting looks</h1>
<p>48 final views, six local hours at both sizes. Outside, choice and confirmation use
the 36 replacement stills that wait for the CSS entrance to finish. Burning uses
the 12 original settled ignition views. Original captures and all four live map-transition traces are retained.</p>
<p class="meta">Scene SOURCE_ID… · manifest MANIFEST_ID… · geometry GEOMETRY_ID… .
Phone is390×844 touch emulation on the M1. Click an image for its full-resolution file.</p>
<nav><button onclick="show('all')">Both sizes</button>
<button onclick="show('desktop-en')">Desktop</button>
<button onclick="show('phone-zh')">Phone</button> <a href="final-review.md">Full review</a></nav>'''
        .replace('SOURCE_ID', scene_id).replace('MANIFEST_ID', manifest_id).replace('GEOMETRY_ID', geometry_id)]
for viewport in ['desktop-en', 'phone-zh']:
    for hour in hours:
        label = f'{int(hour):02d}:{round((hour % 1) * 60):02d}'
        page.append(f'<section data-viewport="{viewport}"><h2>{viewport} · {label}</h2><div class="grid">')
        for name in names:
            view = lookup[(viewport, hour, name)]
            path = Path(view['file'])
            path = path if path.is_absolute() else ROOT / path
            assert path.is_file()
            relative = str(path.relative_to(ROOT))
            uri = html.escape('../../../' + relative)
            dataset = 'Original settled burning' if name == 'burning' else 'UI-settled replacement'
            page.append(f'<figure><a href="{uri}"><img loading="lazy" src="{uri}" '
                        f'alt="{viewport} {label} {name}"></a><figcaption>{name} · {dataset}</figcaption></figure>')
            provenance['frames'].append({'viewport': viewport, 'hour': hour, 'name': name,
                                         'dataset': dataset, 'path': relative, 'sha256': sha(path)})
        page.append('</div></section>')
page.append('''<script>function show(v){document.querySelectorAll('section').forEach(
s=>s.hidden=v!=='all'&&s.dataset.viewport!==v)}</script></main></html>''')
output.write_text('\n'.join(page) + '\n')
output.with_suffix('.json').write_text(json.dumps(provenance, indent=2) + '\n')
if args.contacts:
    from PIL import Image, ImageDraw
    contacts = repair_path.parent / 'phone-review'
    contacts.mkdir(exist_ok=True)
    for start in [0, 2, 4]:
        canvas = Image.new('RGB', (1170, 1740), '#172017')
        draw = ImageDraw.Draw(canvas)
        for row, hour in enumerate(hours[start:start + 2]):
            for col, name in enumerate(names[:3]):
                path = ROOT / lookup[('phone-zh', hour, name)]['file']
                image = Image.open(path).convert('RGB')
                assert image.size == (390, 844)
                x, y = col * 390, row * 870
                draw.text((x + 8, y + 5), f'{hour:04.1f}  {name}  UI settled', fill='#f1d7a0')
                canvas.paste(image, (x, y + 26))
        canvas.save(contacts / f'phone-ui-{start // 2 + 1}.jpg', quality=93)
print(json.dumps({'gallery': str(output.relative_to(ROOT)), 'selectedFrames': len(selected)}))
