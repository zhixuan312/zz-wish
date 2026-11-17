"""Isolated CPU patch/probe of actual lantern transport on the frozen source.

Without --output this is an unsaved parameter feasibility probe. A saved source
is still a low8 proposal, not optical approval. No Cycles, image encoder, runtime
or public asset operation is performed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_export as baker
import freeze_source_modifiers as frozen
from resting_contacts import RestingContacts
import snow_lantern_transport as transport


def reference(path):
    path = Path(path)
    return {'path': str(path), 'sha256': transport.sha(path), 'bytes': path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['source', 'geometry', 'report']:
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ['source-sha256', 'geometry-sha256', 'basis']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if transport.sha(args.source) != args.source_sha256 or transport.sha(args.geometry) != args.geometry_sha256:
        raise RuntimeError('Actual frozen source/runtime geometry binding differs')
    if args.report.exists() or (args.output and args.output.exists()):
        raise RuntimeError('New isolated outputs required')
    for path in [args.report, args.output]:
        if path and not path.resolve().is_relative_to(transport.ROOT / 'art/build'):
            raise RuntimeError('Ignored art/build output required')
    basis = [float(value) for value in args.basis.split(',')]
    if len(basis) != 3:
        raise RuntimeError('Engine-space basis must have3 coordinates')
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene = bpy.context.scene
    before = frozen.evaluated_snapshots(scene)
    before_state = frozen.nonmesh_state(scene)
    contacts_before = RestingContacts.from_scene().audit(fail=True, write_metadata=False)
    config = transport.apply_transport(scene, args.geometry, basis, args.geometry_sha256)
    config['sourceRecipe'] = {'frozenBase': reference(args.source), 'geometryInput': reference(args.geometry),
        'sourceFreezeHelper': {'path': str(Path(frozen.__file__).relative_to(transport.ROOT)),
                              'sha256': transport.sha(frozen.__file__)},
        'transportHelper': {'path': str(Path(transport.__file__).relative_to(transport.ROOT)),
                            'sha256': transport.sha(transport.__file__)},
        'patcher': {'path': str(Path(__file__).relative_to(transport.ROOT)), 'sha256': transport.sha(__file__)}}
    scene[transport.META] = json.dumps(config, separators=(',', ':'))
    helper_paths = json.loads(scene.get('source_authoring_helpers', '[]'))
    helper_sha = json.loads(scene.get('source_authoring_sha256', '{}'))
    for path in [Path(frozen.__file__), Path(transport.__file__), Path(__file__)]:
        relative = str(path.relative_to(transport.ROOT))
        if relative not in helper_paths:
            helper_paths.append(relative)
        helper_sha[relative] = transport.sha(path)
    scene['source_authoring_helpers'] = json.dumps(helper_paths)
    scene['source_authoring_sha256'] = json.dumps(helper_sha)
    removed = config['removedObsoleteStaticSuspension']
    comparison = frozen.compare({name: value for name, value in before.items() if name != removed},
                                frozen.evaluated_snapshots(scene))
    contacts_after = RestingContacts.from_scene().audit(fail=True, write_metadata=False)
    after_state = frozen.nonmesh_state(scene)
    unchanged = {}
    unchanged['constructionExceptObsoleteSuspensionByteExact'] = comparison['allFieldsByteExact']
    unchanged['all47ContactMeasurementsByteValueExact'] = contacts_before == contacts_after and len(contacts_after['groups']) == 47
    unchanged['allOriginalUsedMaterialGraphsExact'] = all(after_state['materials'].get(key) == value
                                                       for key, value in before_state['materials'].items())
    unchanged['allOriginalImageIdentitiesExact'] = all(after_state['images'].get(key) == value
                                                     for key, value in before_state['images'].items())
    unchanged['worldExposureCyclesExact'] = all(before_state[key] == after_state[key] for key in ['world', 'view', 'cycles'])
    point_name = config['basis']['sourceObject']
    unchanged['allOtherObjectTransformsAndPropertiesExact'] = all(
        after_state['objectPropertiesAndMatrices'].get(name) == value
        for name, value in before_state['objectPropertiesAndMatrices'].items()
        if name not in {removed, point_name, 'Visitor_Lamp_Anchor'})
    unchanged['allOtherLightsExact'] = all(after_state['lights'].get(name) == value
                                         for name, value in before_state['lights'].items() if name != point_name)
    unchanged['candleSourceChromaticityExact'] = before_state['lights'][point_name]['color'] == after_state['lights'][point_name]['color']
    allowed = {'one_light_gauze_transport', 'one_light_lamp_basis', 'visitor_lamp_anchor',
               'one_light_anchor_fields', 'source_geometry_budget', 'architecture_bounds_engine',
               'source_authoring_helpers', 'source_authoring_sha256'}
    unchanged['allOtherSceneMetadataExact'] = all(after_state['sceneProperties'].get(key) == value
                                                for key, value in before_state['sceneProperties'].items() if key not in allowed)
    if not all(unchanged.values()):
        raise RuntimeError('Unrelated source invariant changed: ' + str(unchanged))
    profiles = transport.proxy_profiles(scene)
    snapshot = baker.snapshot_lighting(scene)
    passes = []
    for name in ['night', 'dusk', 'day', 'lamp']:
        baker.configure_light_pass(scene, name, snapshot)
        proxies = [obj for obj in scene.objects if obj.get(transport.TAG)]
        visible = [obj.name for obj in proxies if not obj.hide_render]
        expected = len(proxies) if name == 'lamp' else 0
        if len(visible) != expected or transport.proxy_profiles(scene) != profiles:
            raise RuntimeError('Pass visibility/geometry binding changed unexpectedly')
        actual_watts = bpy.data.objects[point_name].data.energy
        if actual_watts != (2. if name == 'lamp' else 0.):
            raise RuntimeError('Candle source pass energy differs')
        passes.append({'pass': name, 'visibleProxyMeshes': len(visible),
                       'pointWatts': float(actual_watts), 'actualGeometryProfilesExact': True})
    for obj, energy, color in snapshot[0]:
        obj.data.energy = energy; obj.data.color = color
    for socket, strength in snapshot[1]:
        socket.default_value = strength
    scene.world = snapshot[2]
    for obj in scene.objects:
        if obj.get(transport.TAG):
            obj.hide_render = False
    emissions = [node.name for material in {material for obj in scene.objects if obj.get(transport.TAG)
                 for material in obj.data.materials} for node in material.node_tree.nodes
                 if node.type == 'EMISSION' or node.type == 'BSDF_PRINCIPLED'
                 and node.inputs['Emission Strength'].default_value != 0]
    if emissions:
        raise RuntimeError('Transport proxy has emissive shader nodes')
    report = {'scope': __doc__, 'source': reference(args.source), 'runtimeGeometry': reference(args.geometry),
              'requestedBasisEngine': basis, 'proposal': config, 'invariants': unchanged,
              'contactGroups': len(contacts_after['groups']), 'literalContactLimitsMetres': {'gap': .002, 'penetration': .005},
              'geometryComparison': comparison, 'passVisibilityAndEnergy': passes,
              'actualProxyProfiles': profiles, 'proxyEmissionNodes': emissions,
              'sourceSaved': bool(args.output), 'opticallyApproved': False,
              'CyclesRenderBakeGpuJobs': 0,
              'scripts': {str(path.relative_to(transport.ROOT)): transport.sha(path) for path in
                  [Path(__file__), Path(transport.__file__), Path(baker.__file__), Path(frozen.__file__)]}}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
        report['output'] = reference(args.output)
    if transport.sha(args.source) != args.source_sha256 or transport.sha(args.geometry) != args.geometry_sha256:
        raise RuntimeError('Immutable source or runtime geometry changed')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print('SNOW_LANTERN_TRANSPORT_PROBE', str(args.report), transport.sha(args.report),
          'saved', bool(args.output), 'clearance', config['bodyClearance']['certifiedWholeTriangleLowerBoundMetres'], flush=True)


if __name__ == '__main__':
    main()
