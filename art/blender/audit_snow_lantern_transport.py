"""Read-only saved-source C6 proxy, source-anchor and construction invariant audit."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import freeze_source_modifiers as frozen
import snow_lantern_transport as transport
from resting_contacts import RestingContacts


def reference(path):
    path = Path(path)
    return {'path': str(path), 'sha256': transport.sha(path), 'bytes': path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['source', 'build-audit', 'report']:
        parser.add_argument('--' + key, type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.report.exists() or not args.report.resolve().is_relative_to(transport.ROOT/'art/build'):
        raise RuntimeError('New ignored read-only audit path required')
    build = json.loads(args.build_audit.read_text())
    source_sha = transport.sha(args.source)
    if build['output']['sha256'] != source_sha:
        raise RuntimeError('Saved source differs from actual build receipt')
    base = Path(build['source']['path'])
    if transport.sha(base) != build['source']['sha256']:
        raise RuntimeError('Actual frozen source base differs')
    bpy.ops.wm.open_mainfile(filepath=str(base.resolve()))
    before = frozen.evaluated_snapshots(bpy.context.scene)
    before_state = frozen.nonmesh_state(bpy.context.scene)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene = bpy.context.scene
    config = json.loads(scene[transport.META])
    if config != build['proposal']:
        raise RuntimeError('Saved compact physical certificate differs from the measured build')
    profiles = transport.proxy_profiles(scene)
    profile_sha = hashlib.sha256(json.dumps(profiles, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if profile_sha != config['actualProxyGeometrySha256'] or profiles != build['actualProxyProfiles']:
        raise RuntimeError('Saved actual proxy geometry/normals/UV/material bindings differ')
    point = bpy.data.objects[config['basis']['sourceObject']]
    actual_basis = {'position': transport.engine(point.matrix_world.translation), 'watts': float(point.data.energy),
                    'linearColor': list(point.data.color), 'pointRadiusMetres': float(point.data.shadow_soft_size)}
    for key, value in actual_basis.items():
        if value != config['basis'][key]:
            raise RuntimeError('Saved point-source metadata is not actual: ' + key)
    anchor = transport.engine(bpy.data.objects['Visitor_Lamp_Anchor'].matrix_world.translation)
    if anchor != config['basis']['bodySuspensionTopEngine']:
        raise RuntimeError('Saved body attachment differs from actual EMPTY')
    tree, owners = transport.architecture_bvh(scene)
    support = transport.upward_support(tree, owners, anchor)
    old_support = config['suspension']
    support_error = max(abs(a-b) for a,b in zip(support['pointEngine'], old_support['pointEngine']))
    if support_error > 1e-6 or support['object'] != old_support['object'] or support['polygon'] != old_support['polygon']:
        raise RuntimeError('Saved upward support ray differs')
    proxies = [obj for obj in scene.objects if obj.get(transport.TAG)]
    clearance = transport.certify_body_clearance(tree, proxies)
    removed = config['removedObsoleteStaticSuspension']
    comparison = frozen.compare({name:value for name,value in before.items() if name != removed},
                                frozen.evaluated_snapshots(scene))
    if not comparison['allFieldsByteExact']:
        raise RuntimeError('Saved source changed unrelated construction arrays')
    after_state = frozen.nonmesh_state(scene)
    material_exact = all(after_state['materials'].get(key) == value for key,value in before_state['materials'].items())
    images_exact = all(after_state['images'].get(key) == value for key,value in before_state['images'].items())
    if not material_exact or not images_exact:
        raise RuntimeError('Original actual material/image inputs changed after save')
    contact = RestingContacts.from_scene().audit(fail=True, write_metadata=False)
    if len(contact['groups']) != 47:
        raise RuntimeError('Actual saved source contact population differs')
    cloth_obj = next(obj for obj in proxies if obj['transport_role'] == 'gauze')
    cloth_mat = cloth_obj.data.materials[0]
    transparent = next(node for node in cloth_mat.node_tree.nodes if node.type == 'BSDF_TRANSPARENT')
    actual_throughput = list(transparent.inputs['Color'].default_value)[:3]
    throughput_error = max(abs(a-b) for a,b in zip(actual_throughput, config['cloth']['shadowTransmissionLinearRGB']))
    if throughput_error > 1e-7:
        raise RuntimeError('Actual Cycles shadow RGB differs from the normalized linear-CSS filter')
    hanger = next(obj for obj in proxies if obj.get('transport_main_suspension'))
    top_y = max(transport.engine(hanger.matrix_world @ vertex.co)[1] for vertex in hanger.data.vertices)
    embedding = top_y - support['pointEngine'][1]
    if not .00099 <= embedding <= .00101:
        raise RuntimeError('Actual ceiling hanger does not bear1mm into its support')
    shader = hanger.data.materials[0].node_tree.nodes.get('Principled BSDF')
    if abs(shader.inputs['Metallic'].default_value-.7)>1e-6 or shader.inputs['Roughness'].default_value != .5:
        raise RuntimeError('Actual runtime-style ceiling hanger PBR settings differ')
    for path, digest in scene['source_authoring_sha256'] and json.loads(scene['source_authoring_sha256']).items():
        if path in build['scripts'] and transport.sha(transport.ROOT/path) != digest:
            raise RuntimeError('Recorded actual authoring helper changed: '+path)
    report = {'scope': __doc__, 'source': reference(args.source), 'buildAudit': reference(args.build_audit),
        'frozenBase': reference(base), 'passed': True, 'all47ContactGroupsPassed': True,
        'all1871RemainingStaticObjectsByteExactToFrozenBase': comparison['allFieldsByteExact'],
        'maximumStaticPositionComponentErrorMetres': comparison['maximumPositionComponentErrorMetres'],
        'maximumStaticUV0ComponentError': comparison['maximumUV0ComponentError'],
        'maximumStaticWorldNormalComponentError': comparison['maximumWorldNormalComponentError'],
        'originalUsedMaterialGraphsExact': material_exact, 'originalImageInputsExact': images_exact,
        'actualProxyProfileSha256': profile_sha, 'proxyMeshes': len(proxies),
        'proxyTriangles': sum(row['triangles'] for row in profiles), 'actualPointBasis': actual_basis,
        'actualBodyAttachmentEngine': anchor, 'upwardSupport': support, 'maximumSupportRequeryErrorMetres': support_error,
        'bodyClearance': clearance, 'actualTopEmbeddingMetres': embedding,
        'actualCyclesShadowTransmissionLinearRGB': actual_throughput, 'maximumFilterFloat32Error': throughput_error,
        'actualHangerPBR': {'metalness': float(shader.inputs['Metallic'].default_value), 'roughness': float(shader.inputs['Roughness'].default_value)},
        'newRenderBakeEncoderGpuJobs': 0, 'sourceModified': False, 'opticallyApproved': False,
        'scriptSha256': transport.sha(__file__)}
    if transport.sha(args.source) != source_sha:
        raise RuntimeError('Immutable saved source changed during read-only audit')
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2)+'\n')
    print('SAVED_LANTERN_TRANSPORT_AUDIT', str(args.report), transport.sha(args.report), True, flush=True)


if __name__ == '__main__':
    main()
