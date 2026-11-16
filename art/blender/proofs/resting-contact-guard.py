"""Exercise the actual pre-bake contact gate without rendering or baking.

Uses a genuine passing prepared-triangle replay and receiver geometry. Mutated
challenge receipts are isolated outputs; original inputs and blend stay intact.
"""
import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'art/blender'))
import bake_export as baker

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--audit', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.out = args.out.resolve()
if not args.out.is_relative_to(ROOT / 'art/build') or (args.out / 'guard-proof.json').exists():
    raise RuntimeError('New separate ignored proof directory required.')
args.out.mkdir(parents=True, exist_ok=True)
digest = lambda path: sha256(Path(path).read_bytes()).hexdigest()
originals = {'prepared': digest(args.prepared), 'audit': digest(args.audit)}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene = bpy.context.scene
binding = baker.source_binding(scene, True)
regions = {obj['lightmap_region']: obj for obj in scene.objects
           if obj.type == 'MESH' and obj.get('one_light_static')}
profiles = {region: baker.receiver_profile(obj) for region, obj in sorted(regions.items())}
fingerprint = sha256()
for region, profile in profiles.items():
    fingerprint.update(region.encode())
    fingerprint.update(profile['receiverFingerprint'].encode())
    fingerprint.update(profile['lightmapUVFingerprint'].encode())
geometry = fingerprint.hexdigest()
valid = json.loads(args.audit.read_text())
result = baker.validate_resting_contact_audit(scene, binding, profiles, geometry, args.audit)
if not result:
    raise RuntimeError('A genuine registered scene and passing replay are required.')
cases = []


def challenge(name, mutate=None, path=None):
    if mutate:
        altered = deepcopy(valid)
        mutate(altered)
        path = args.out / (name + '.json')
        path.write_text(json.dumps(altered) + '\n')
    try:
        baker.validate_resting_contact_audit(scene, binding, profiles, geometry, path)
    except RuntimeError as error:
        cases.append({'name': name, 'rejectedBeforeCycles': True, 'reason': str(error)})
        return
    raise RuntimeError('Required guard challenge was incorrectly admitted: ' + name)


first = next(i for i, group in enumerate(valid['groups']) if group['mode'] == 'resting')
region = next(iter(profiles))
challenge('missing-receipt')
challenge('missing-file', path=args.out / 'does-not-exist.json')
challenge('failed-replay', lambda value: value.update(passed=False))
challenge('wrong-source', lambda value: value.update(sourceBlendSha256='0' * 64))
challenge('wrong-geometry', lambda value: value.update(geometryFingerprint='0' * 64))
challenge('wrong-receiver', lambda value: value['receiverProfiles'][region].update(receiverFingerprint='0' * 64))
challenge('wrong-uv', lambda value: value['receiverProfiles'][region].update(lightmapUVFingerprint='0' * 64))
challenge('gap-over-literal-limit', lambda value: value['groups'][first]['contact'].update(gapMetres=.0020000001))
challenge('penetration-over-literal-limit', lambda value: value['groups'][first].update(maximumPenetrationMetres=.0050000001))
challenge('relaxed-limit', lambda value: value['literalGuardsMetres'].update(penetration=.005000001))
challenge('missing-group', lambda value: value['groups'].pop())
challenge('duplicate-group', lambda value: value['groups'].append(deepcopy(value['groups'][0])))
challenge('changed-support-mode', lambda value: value['groups'][first].update(mode='mounted'))
challenge('lost-anchor-metadata', lambda value: value.update(sourceAnchorMetadataByteExact=False))
challenge('nonfinite-measurement', lambda value: value['groups'][first]['contact'].update(gapMetres=float('nan')))
challenge('failed-raw-replay', lambda value: value['raw'].update(passed=False))
challenge('wrong-frozen-raw', lambda value: value['raw'].update(sha256='0' * 64))
challenge('raw-penetration-over-limit', lambda value: value['raw']['groups'][first].update(maximumPenetrationMetres=.0050000001))
challenge('lost-raw-anchor-metadata', lambda value: value['raw'].update(sourceAnchorMetadataByteExact=False))
scene['one_light_guard_metadata_probe'] = 'Unrelated metadata; receiver geometry is unchanged.'
if not baker.validate_resting_contact_audit(scene, binding, profiles, geometry, args.audit):
    raise RuntimeError('Pure metadata must not invalidate exact receiver/UV evidence.')
del scene['one_light_guard_metadata_probe']
if digest(args.prepared) != originals['prepared'] or digest(args.audit) != originals['audit']:
    raise RuntimeError('Immutable proof inputs changed.')
proof = {'scope': 'Actual contact validation function and genuine prepared geometry. No rendering, baking, denoising, encoding or source writes.',
         'sourceBlendSha256': binding['sha256'], 'inputs': originals,
         'geometryFingerprint': geometry, 'validActualReceiptPassed': True,
         'unrelatedMetadataAcceptedWithSameReceiverFingerprints': True,
         'challenges': cases, 'originalInputsByteUnchanged': True,
         'scriptSha256': digest(__file__), 'bakerSha256': digest(ROOT / 'art/blender/bake_export.py')}
path = args.out / 'guard-proof.json'
path.write_text(json.dumps(proof, indent=2) + '\n')
print('RESTING_CONTACT_GUARD_PROOF_PASS', str(path), digest(path), len(cases), flush=True)
