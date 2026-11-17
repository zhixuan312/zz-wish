"""Read-only actual prepared transport visibility/fingerprint audit; no native jobs."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
for key in ['prepared', 'manifest', 'baker', 'out']:
    parser.add_argument('--'+key, type=Path, required=True)
for key in ['mapping', 'resting-audit']:
    parser.add_argument('--'+key, type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
if bool(args.mapping) != bool(args.resting_audit):
    raise RuntimeError('Bind both actual mapping and resting-contact pre-bake receipts, or neither')
if args.out.exists():
    raise RuntimeError('A new proof output is required')
inputs = {key: {'path': str(getattr(args, key)), 'sha256': sha(getattr(args, key))}
          for key in ['prepared', 'manifest', 'baker', 'mapping', 'resting_audit'] if getattr(args,key)}
spec = importlib.util.spec_from_file_location('pinned_transport_baker', args.baker)
baker = importlib.util.module_from_spec(spec); spec.loader.exec_module(baker)
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene = bpy.context.scene
regions = {obj['lightmap_region']: obj for obj in scene.objects
           if obj.type == 'MESH' and obj.get('one_light_static') and not obj.get('one_light_dynamic')}
profiles = {name: baker.receiver_profile(obj) for name,obj in regions.items()}
binding = baker.source_binding(scene, True)
manifest = json.loads(args.manifest.read_text())
snapshot = baker.snapshot_lighting(scene)
fingerprint, payload = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
if fingerprint != manifest['bakeFingerprint']:
    Path(str(args.out)+'.reopened-payload.json').write_text(json.dumps(payload,indent=2)+'\n')
    raise RuntimeError('Actual reopened preparation transport fingerprint differs from its manifest')
skip_bake_fingerprint = fingerprint
binding_changes = []
if args.mapping:
    geometry = hashlib.sha256()
    for name,profile in sorted(profiles.items()):
        geometry.update(name.encode())
        geometry.update(profile['receiverFingerprint'].encode())
        geometry.update(profile['lightmapUVFingerprint'].encode())
    resting = baker.validate_resting_contact_audit(scene,binding,profiles,geometry.hexdigest(),args.resting_audit)
    if not resting:
        raise RuntimeError('Actual scene requires the passing contact preflight binding')
    scene['one_light_prepared_contact_audit_binding'] = json.dumps(resting)
    scene['one_light_prepared_preview_audit'] = args.mapping.read_text()
    bound_fingerprint,bound_payload = baker.transport_fingerprint(scene,regions,snapshot,binding,profiles)
    baker.validate_prepared_normal_audit(scene,binding,profiles,bound_payload['normalTransfer'],bound_payload['preparedPreviewAudit'])
    binding_changes = sorted(key for key in set(payload)|set(bound_payload) if payload.get(key)!=bound_payload.get(key))
    if not set(binding_changes).issubset({'preparedRestingContactAudit','preparedPreviewAudit'}):
        raise RuntimeError('Pre-bake guard binding changed physical transport inputs: '+str(binding_changes))
    fingerprint,payload = bound_fingerprint,bound_payload
config = json.loads(scene['one_light_gauze_transport'])
expected_watts = config['basis']['watts']
proxies = [obj for obj in scene.objects if obj.get('one_light_transport_proxy')]
if len(proxies) != config['parts']:
    raise RuntimeError('Actual proxy population differs')
records = []
for name in ['night', 'dusk', 'day', 'lamp']:
    baker.configure_light_pass(scene, name, snapshot)
    visible = sum(not obj.hide_render for obj in proxies)
    watts = bpy.data.objects[config['basis']['sourceObject']].data.energy
    if visible != (len(proxies) if name == 'lamp' else 0) or watts != (expected_watts if name == 'lamp' else 0):
        raise RuntimeError('Actual filter visibility or candle watts differ in '+name)
    actual_fp, actual = baker.transport_fingerprint(scene, regions, snapshot, binding, profiles)
    if actual['visitorLanternTransport'] != payload['visitorLanternTransport']:
        raise RuntimeError('Pass-state mutation changes actual certified proxy geometry/configuration')
    preset = baker.PRESETS[name]
    light_states = []
    for obj, energy, colour in snapshot[0]:
        role = obj.get('bake_role', obj.data.get('bake_role', 'fixture'))
        if role == 'lamp':
            expected_energy = energy if name == 'lamp' else 0
        elif name == 'night':
            expected_energy = energy
        elif role == 'ambient':
            pre_exposure = baker.camera_pre_exposure(scene) if hasattr(baker, 'camera_pre_exposure') else 1.
            expected_energy = preset['energy']/pre_exposure if obj.data.type == 'SUN' else energy*preset['strength']
        else:
            expected_energy = energy*preset['fixtures']
        if abs(obj.data.energy-expected_energy) > max(1e-9,abs(expected_energy)*1e-6):
            raise RuntimeError('Actual light pass energy differs: '+name+'/'+obj.name)
        light_states.append({'object':obj.name,'energy':float(obj.data.energy),'expected':float(expected_energy)})
    for socket, strength in snapshot[1]:
        expected_strength = strength*preset['fixtures']
        if abs(socket.default_value-expected_strength)>max(1e-9,abs(expected_strength)*1e-6):
            raise RuntimeError('Actual material emission pass factor differs: '+name)
    records.append({'pass': name, 'visibleProxyMeshes': visible, 'actualVisitorWatts': float(watts),
                    'actualLightStates':light_states,'allMaterialEmissionPassFactorsCorrect':True,
                    'actualProxyProfilesAndCompactConfigUnchanged':True,
                    'actualPassStateFingerprint':actual_fp,
                    'canonicalPrePassFingerprintRetained':fingerprint,
                    'wholeFingerprintMayDifferBecauseMaterialEmissionPassFactorsAreActual':True})
if any('positions' in row or 'polygons' in row for row in payload['visitorLanternTransport']['actualMeshProfiles']):
    raise RuntimeError('Raw proxy arrays leaked into compact transport metadata')
report = {'scope': __doc__, 'inputs': inputs, 'sourceBinding': binding, 'passed': True,
          'skipBakePreparationFingerprint':skip_bake_fingerprint,
          'actualPreBakeGuardBindingChanges':binding_changes,
          'actualContactAndNormalPreBakeGuardsApplied':bool(args.mapping),
          'actualBakeFingerprint': fingerprint, 'receiverGeometryFingerprints': {r:p['receiverFingerprint'] for r,p in profiles.items()},
          'actualProxyParts': len(proxies), 'actualProxyGeometrySha256': config['actualProxyGeometrySha256'],
          'passStates': records, 'noProxyVertexArraysInTransportPayload': True,
          'sourcePreparedAndCodeUnchanged': True, 'renderBakeEncoderGpuJobs': 0,
          'scriptSha256': sha(__file__)}
for key, entry in inputs.items():
    if sha(getattr(args,key)) != entry['sha256']:
        raise RuntimeError('Pinned immutable input changed')
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('TRANSPORT_PASS_VISIBILITY_PASS',str(args.out),sha(args.out),fingerprint,flush=True)
