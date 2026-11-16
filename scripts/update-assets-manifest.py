"""Consolidate every delivered visual/runtime asset and its provenance into docs/assets.json."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]

def file_info(path):
    path = ROOT / path
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha256(data).hexdigest()}

assets = []
scan = json.loads((ROOT / 'docs/licenses/polyhaven-scans.json').read_text())
for asset in scan['assets']:
    assets.append({'id': asset['id'], 'kind': 'PBR material', 'provider': 'Poly Haven', 'license': scan['license'], 'licenseUrl': scan['licenseUrl'], 'sourceUrl': asset['assetUrl'], 'authors': asset['authors'], 'files': [{**file_info(m['path']), 'sourceUrl': m['sourceUrl'], 'sourceSha256': m['sourceSha256'], 'map': m['map'], 'encoding': m['encoding']} for m in asset['maps']]})
model = json.loads((ROOT / 'web/public/models/manifest.json').read_text())
for asset in model['assets']:
    assets.append({'id': asset['sourcePage'].rsplit('/', 1)[-1], 'kind': 'Scanned natural model', 'provider': 'Poly Haven', 'license': model['license'], 'licenseUrl': model['licenseSource'], 'sourceUrl': asset['sourcePage'], 'authors': asset.get('authors', {}), 'files': [{**file_info('web/public/models/' + f['local']), 'sourceUrl': f['sourceUrl'], 'sourceMd5': f.get('sourceMd5'), 'transformation': 'Geometry unchanged; source JPEGs encoded WebP at original1k resolution where recorded.'} for f in asset['files']]})
pilot = ROOT / 'docs/licenses/pilot-materials.json'
if pilot.exists():
    for asset in json.loads(pilot.read_text()):
        assets.append({**asset, 'kind': 'PBR material', 'files': [{**f, **file_info(f['path'])} for f in asset['files']]})
props = ROOT / 'docs/licenses/snow-props.json'
if props.exists():
    for asset in json.loads(props.read_text()):
        assets.append({**asset, 'files': [{**f, **file_info(f['path'])} for f in asset['files']]})
assets.append({'id': 'noto-serif-sc-subsets', 'kind': 'Font', 'provider': 'Google Fonts / Noto', 'license': 'OFL-1.1', 'licenseFile': 'web/public/fonts/OFL.txt', 'sourceUrl': 'https://fonts.google.com/noto/specimen/Noto+Serif+SC', 'transformation': 'UI character subsets; reproducible with scripts/subset-fonts.py', 'files': [file_info(str(p.relative_to(ROOT))) for p in (ROOT / 'web/public/fonts').glob('*.woff2')]})
assets.append({'id': 'basis-universal-transcoder', 'kind': 'Shared texture runtime codec', 'provider': 'Binomial / three.js 0.160.0 distribution', 'license': 'Apache-2.0', 'licenseFile': 'web/public/codecs/basis/LICENSE.txt', 'distributionLicense': 'MIT', 'distributionLicenseFile': 'web/public/codecs/basis/THREE-LICENSE.txt', 'sourceUrl': 'https://github.com/mrdoob/three.js/tree/r160/examples/jsm/libs/basis', 'upstreamSourceUrl': 'https://github.com/BinomialLLC/basis_universal', 'files': [file_info('web/public/codecs/basis/' + n) for n in ['basis_transcoder.js', 'basis_transcoder.wasm']]})
for name in ['weathered-granite.jpg', 'old-timber.jpg']:
    assets.append({'id': 'legacy-generated-' + Path(name).stem, 'kind': 'Generated legacy material source', 'provider': 'OpenAI imagegen', 'license': 'Generated project asset; no third-party scan license claimed', 'provenanceFile': 'web/public/materials/README.md', 'sourceUrl': None, 'files': [file_info('web/public/materials/' + name)]})
source = ROOT / 'art/blender/snow_roof.py'
if source.exists():
    assets.append({'id': 'snow-roof-original-architecture', 'kind': 'Original fictional architecture', 'provider': 'One Light project', 'license': 'Project-owned source; no external architecture asset', 'notes': 'Original timber hall, court and gate; no monument replica, statues or ritual asset.', 'files': [file_info('art/blender/snow_roof.py')]})
delivery = ROOT / 'web/public/places/snow-roof/manifest.json'
if delivery.exists():
    d = json.loads(delivery.read_text())
    assets.append({'id': 'snow-roof-delivery', 'kind': 'Baked/compressed derivative scene', 'provider': 'One Light project', 'license': 'Original architecture with CC0 surface inputs listed above', 'sourceFiles': ['art/blender/snow_roof.py', 'art/blender/bake_export.py'], 'bake': d.get('bake'), 'compression': d.get('compression'), 'files': [file_info('web/public/places/snow-roof/' + f['uri']) for f in d['files']]})
result = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'purpose': 'Single provenance and license register for every delivered visual asset and shared decoder.', 'assets': assets}
(ROOT / 'docs/assets.json').write_text(json.dumps(result, indent=2) + '\n')
print(len(assets), 'registered assets')
