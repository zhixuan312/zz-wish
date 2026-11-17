"""Audit a new fixed-sampling recipe against immutable original physical inputs.

This runs native configuration and physical guards in memory only. It never
renders, bakes, saves a blend, relabels old maps, or changes an old fingerprint.
"""
import argparse
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_export as baker

parser = argparse.ArgumentParser(description=__doc__)
for name in ['prepared', 'reference-transport', 'mapping', 'resting-audit', 'out']:
    parser.add_argument('--' + name, type=Path, required=True)
parser.add_argument('--samples', type=int, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.out.exists():
    raise RuntimeError('A new separate preflight output is required')
digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
paths = [args.prepared, args.reference_transport, args.mapping, args.resting_audit, Path(baker.__file__), Path(__file__)]
before = {str(path): digest(path) for path in paths}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene = bpy.context.scene
baker.configure_cycles(scene, SimpleNamespace(samples=args.samples, device='METAL', skip_bake=True, export_only=False))
if scene.cycles.use_adaptive_sampling or scene.cycles.use_animated_seed:
    raise RuntimeError('Actual configured recipe is not fixed-sampling')
regions = {obj['lightmap_region']: obj for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static') and not obj.get('one_light_dynamic')}
profiles = {name: baker.receiver_profile(obj) for name, obj in sorted(regions.items())}
geometry = hashlib.sha256()
for name, profile in profiles.items():
    geometry.update(name.encode())
    geometry.update(profile['receiverFingerprint'].encode())
    geometry.update(profile['lightmapUVFingerprint'].encode())
binding = baker.source_binding(scene, True)
resting = baker.validate_resting_contact_audit(scene, binding, profiles, geometry.hexdigest(), args.resting_audit)
if not resting:
    raise RuntimeError('Actual source/prepared/raw contact guard is required')
scene['one_light_prepared_contact_audit_binding'] = json.dumps(resting)
scene['one_light_prepared_preview_audit'] = args.mapping.read_text()
snapshot = baker.snapshot_lighting(scene)
fingerprint, payload = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
baker.validate_prepared_normal_audit(scene, binding, profiles, payload['normalTransfer'], payload['preparedPreviewAudit'])
reference = json.loads(args.reference_transport.read_text())
# Fingerprints serialize graph-link tuples as JSON arrays. Compare the same
# exact JSON value representation, rather than Python tuple/list identity.
canonical = json.loads(json.dumps(payload))
differences = sorted(key for key in set(reference) | set(canonical) if reference.get(key) != canonical.get(key))
if differences != ['cycles', 'policy']:
    Path(str(args.out) + '.failed-payload.json').write_text(json.dumps(payload, indent=2) + '\n')
    raise RuntimeError('Unexpected physical source/geometry/material/lighting/binding difference: ' + str(differences))
cache_cases = []
for field, changed in [('use_adaptive_sampling', True), ('seed', scene.cycles.seed + 1),
                       ('caustics_reflective', not scene.cycles.caustics_reflective),
                       ('sample_clamp_indirect', scene.cycles.sample_clamp_indirect + .125)]:
    original = getattr(scene.cycles, field)
    setattr(scene.cycles, field, changed)
    altered_fp, _ = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
    setattr(scene.cycles, field, original)
    restored_fp, _ = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
    if altered_fp == fingerprint or restored_fp != fingerprint:
        raise RuntimeError('Actual estimator/cache mutation guard failed: ' + field)
    cache_cases.append({'field': field, 'baseline': original, 'changed': changed,
                        'actualMutatedFingerprint': altered_fp, 'different': True, 'restoredExact': True})
original_samples = scene.cycles.samples
scene.cycles.samples = 64
sample64_fp, _ = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
scene.cycles.samples = original_samples
restored_fp, _ = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
if sample64_fp != fingerprint or restored_fp != fingerprint:
    raise RuntimeError('Sample budget alone changed transport identity or failed to restore')
config = json.loads(scene['one_light_gauze_transport'])
proxies = [obj for obj in scene.objects if obj.get('one_light_transport_proxy')]
if len(proxies) != config['parts']:
    raise RuntimeError('Actual C6 proxy population changed')
passes = []
for look in ['night', 'dusk', 'day', 'lamp']:
    baker.configure_light_pass(scene, look, snapshot)
    fp, actual = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
    if actual['visitorLanternTransport'] != payload['visitorLanternTransport'] or actual['cycles'] != payload['cycles']:
        raise RuntimeError('Pass changes certified physical proxy or fixed integrator')
    visible = sum(not obj.hide_render for obj in proxies)
    watts = float(bpy.data.objects[config['basis']['sourceObject']].data.energy)
    if visible != (len(proxies) if look == 'lamp' else 0) or watts != (config['basis']['watts'] if look == 'lamp' else 0):
        raise RuntimeError('Actual C6 pass visibility/power failed')
    preset = baker.PRESETS[look]
    for obj, energy, color in snapshot[0]:
        role = obj.get('bake_role', obj.data.get('bake_role', 'fixture'))
        if role == 'lamp':
            expected = energy if look == 'lamp' else 0
        elif look == 'night':
            expected = energy
        elif role == 'ambient':
            expected = preset['energy'] / baker.camera_pre_exposure(scene) if obj.data.type == 'SUN' else energy * preset['strength']
        else:
            expected = energy * preset['fixtures']
        if abs(obj.data.energy - expected) > max(1e-9, abs(expected) * 1e-6):
            raise RuntimeError('Actual pass energy differs: ' + obj.name)
    for socket, strength in snapshot[1]:
        expected = strength * preset['fixtures']
        if abs(socket.default_value - expected) > max(1e-9, abs(expected) * 1e-6):
            raise RuntimeError('Actual emission pass factor differs')
    passes.append({'look': look, 'proxyVisible': visible, 'visitorWatts': watts, 'passStateFingerprint': fp,
                   'allLightAndEmissionFactorsPassed': True, 'physicalProxyAndFixedIntegratorExact': True})
if any(digest(path) != before[str(path)] for path in paths):
    raise RuntimeError('An immutable input changed')
args.out.mkdir(parents=True)
(args.out / 'actual-before-gi-payload.json').write_text(json.dumps(payload, indent=2) + '\n')
report = {'scope': __doc__, 'passed': True, 'inputs': [{'path': str(path), 'sha256': before[str(path)]} for path in paths],
          'sourceBlendSha256': binding['sha256'], 'geometryFingerprint': geometry.hexdigest(),
          'newActualBeforeGiFingerprint': fingerprint, 'referencePhysicalPayloadDifferences': differences,
          'allNonIntegratorPhysicalInputsByteValueExact': True, 'actualIntegrator': payload['cycles'],
          'configuredFixedSamples': args.samples, 'actualAll47ContactAndNormalGuardsPassed': True,
          'cacheMutationChallenges': cache_cases, 'onlySamples64Versus256SameFingerprint': True,
          'allActualEstimatorMutationsExactlyRestored': True,
          'passes': passes, 'immutableInputsUnchanged': True, 'renderBakeSaveGpuJobs': 0}
path = args.out / 'preflight.json'
path.write_text(json.dumps(report, indent=2) + '\n')
print('FIXED_SAMPLING_PREFLIGHT_PASS', path, digest(path), fingerprint, flush=True)
