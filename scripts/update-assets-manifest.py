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
runtime_files = [
    'web/src/engine/scene.js', 'web/src/engine/WickPlume.js',
    'web/src/engine/baked/loadPlace.js', 'web/src/engine/baked/prefetchPlace.js',
    'web/src/engine/baked/sha256.js', 'web/src/engine/baked/visitorShadow.js',
    'web/src/engine/baked/gauzeTransmission.js', 'web/src/engine/baked/gauzeMask.js',
    'web/src/engine/baked/staticLampShadow.js',
    'web/src/engine/baked/nativeAgX.js',
    'web/src/engine/places/snow-roof-baked.js',
    'web/src/engine/places/cloud-cliff-baked.js',
    'web/src/engine/places/cloud-volume-live.js',
    'web/src/engine/places/cloud-live-cache-v1.js',
    'web/src/engine/places/cloud-light-volume.js',
    'web/src/engine/places/cloud-light-prefix-v1.js',
    'web/src/engine/places/cloud-light-phase.js',
    'web/src/engine/places/cloud-depth-composite.js',
    'web/src/engine/places/cloudOpaqueDepth.js',
]
assets.append({'id': 'baked-place-runtime', 'kind': 'Original scene runtime', 'provider': 'One Light project', 'license': 'Project-owned source; imported libraries retain their own licenses', 'files': [file_info(path) for path in runtime_files]})
native_view_path = ROOT / 'docs/licenses/native-agx.json'
if native_view_path.exists():
    view = json.loads(native_view_path.read_text())
    files = [file_info(view['delivered']['path']), file_info(str(native_view_path.relative_to(ROOT))), file_info(view['dataLicense']['historicalNotice']['path']), file_info(view['softwareNotice']['notice']['path'])]
    if files[0]['bytes'] != view['delivered']['bytes'] or files[0]['sha256'] != view['delivered']['sha256']:
        raise ValueError('Changed shared native AgX view data')
    assets.append({'id': view['asset'], 'kind': 'Shared native display transform', 'provider': 'Blender / AgX contributors', 'credits': view['credits'], 'sourceUrl': view['sourceAttribution']['lut'], 'license': view['dataLicense']['status'], 'softwareLicense': view['softwareNotice']['spdx'], 'provenanceFile': 'docs/licenses/native-agx.json', 'transformation': view['delivered']['precision'], 'files': files})
for name in ['weathered-granite.jpg', 'old-timber.jpg']:
    assets.append({'id': 'legacy-generated-' + Path(name).stem, 'kind': 'Generated legacy material source', 'provider': 'OpenAI imagegen', 'license': 'Generated project asset; no third-party scan license claimed', 'provenanceFile': 'web/public/materials/README.md', 'sourceUrl': None, 'files': [file_info('web/public/materials/' + name)]})
fabric_path = ROOT / 'docs/licenses/lantern-fabric.json'
if fabric_path.exists():
    fabric = json.loads(fabric_path.read_text())
    assets.append({'id': 'visitor-lantern-rough-linen', 'kind': 'Photographed fabric material', 'provider': 'Poly Haven', 'license': fabric['license'], 'licenseUrl': fabric['licenseURL'], 'sourceUrl': fabric['assetPage'], 'authors': fabric['authors'], 'transformation': fabric['process'], 'runtimeUse': 'Photographed yarn luminance modulates the chosen cloth dye; normal and roughness maps remain linear data.', 'provenanceFile': 'docs/licenses/lantern-fabric.json', 'files': [{**file_info(m['derived']['path']), 'role': m['role'], 'sourceUrl': m['source']['url'], 'sourceSha256': m['source']['sha256']} for m in fabric['maps']]})
    if fabric.get('cushionDerivatives'):
        assets[-1]['cushionDerivatives'] = fabric['cushionDerivatives']
for place_id, script in [('snow-roof', 'snow_roof'), ('cloud-cliff', 'cloud_cliff')]:
    source = ROOT / f'art/blender/{script}.py'
    if source.exists():
        assets.append({'id': place_id + '-original-architecture', 'kind': 'Original fictional architecture', 'provider': 'One Light project', 'license': 'Project-owned source; CC0 inputs registered separately', 'notes': 'Authored fictional timber architecture and setting; no monument replica.', 'files': [file_info(str(source.relative_to(ROOT)))]})
    delivery = ROOT / f'web/public/places/{place_id}/manifest.json'
    if not delivery.exists():
        continue
    d = json.loads(delivery.read_text())
    source_files = [
        f'art/blender/{script}.py',
        'art/blender/resting_contacts.py',
        'art/blender/contact_fingerprints.py',
        'art/blender/bake_export.py',
        'scripts/pack-blender-assets.mjs',
        'scripts/pack-float-position-diagnostic.mjs',
        'scripts/prune-float32-baked.mjs',
        'scripts/strip-delivery-audit-metadata.mjs',
        'scripts/gzip-place-models.mjs',
        'scripts/compact-place-manifest.mjs',
        'scripts/attach-place-runtime-assets.mjs',
    ]
    source_files += (['art/blender/preview_snow_room_candidate.py', 'scripts/prepare-snow-priority-atlas.py', 'scripts/package-snow-compact-preview.py', 'scripts/assemble-snow-preview.mjs', 'scripts/probe-uv16-budget.mjs', 'scripts/probe-normal16-budget.mjs', 'scripts/probe-material-normal-budget.mjs', 'art/blender/snow_round1_details.py', 'art/blender/snow_bronze_maps.py', 'art/blender/snow_paint_maps.py', 'art/blender/snow_lightmap_charts.py', 'art/blender/freeze_source_modifiers.py', 'art/blender/snow_lantern_transport.py', 'art/blender/patch_snow_lantern_transport.py', 'art/blender/rebase_snow_radiometry.py', 'art/blender/join_tube_lightmap_charts.py', 'art/blender/priority_lightmap_allocation.py', 'art/blender/refine_underside_lightmap.py', 'scripts/export-gauze-transport.mjs', 'scripts/load-gauze-geometry.mjs'] if place_id == 'snow-roof' else ['art/blender/fixed_view_allocation.py', 'art/blender/build_cloud_source19.py', 'art/blender/export_cloud_field_metadata.py', 'scripts/prototype-cloud-live-envelope.mjs', 'scripts/prove-cloud-hash-lattice.mjs', 'scripts/pack-cloud-noise-lattice.mjs', 'scripts/pack-cloud-live-density.mjs'])
    if place_id == 'snow-roof':
        source_files += [
            'art/blender/preview_snow_round2_pool_candidate.py',
            'art/blender/preview_snow_round2_combined.py',
            'art/blender/snow_round2_interior.py',
            'art/blender/snow_round2_exterior.py',
            'art/blender/snow_round2_fixture_materials.py',
            'art/blender/preview_snow_round2_fixtures.py',
        ]
    files = [file_info(str(delivery.relative_to(ROOT)))]
    for f in d['files']:
        actual = file_info(f'web/public/places/{place_id}/' + f['uri'])
        if actual['bytes'] != f['bytes'] or actual['sha256'] != f['sha256']:
            raise ValueError(f"Stale {place_id} manifest entry: {f['uri']}")
        files.append(actual)
    assets.append({'id': place_id + '-delivery', 'kind': 'Baked/compressed derivative scene', 'provider': 'One Light project', 'license': 'Original architecture with CC0 surface inputs listed above', 'sourceFiles': source_files, 'sourceFileHashes': [file_info(path) for path in source_files], 'bake': d.get('bake'), 'compression': d.get('compression'), 'files': files})
result = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'purpose': 'Single provenance and license register for every delivered visual asset and shared decoder.', 'assets': assets}
(ROOT / 'docs/assets.json').write_text(json.dumps(result, indent=2) + '\n')
print(len(assets), 'registered assets')
