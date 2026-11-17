"""Apply the single Round2 Snow batch to frozen Source18 without saving it.

Default is a CPU-only application/contact/budget summary. --render requires the
exclusive Metal lease and produces one eight-sample picture, never map bakes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, default=ROOT / 'art/build/snow-roof-round1/source-v18.blend')
parser.add_argument('--geometry', type=Path, default=ROOT / 'art/build/snow-roof-round2/runtime-gauze-round2-selected.json')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--render', action='store_true')
parser.add_argument('--save-source', type=Path)
parser.add_argument('--approved-picture', type=Path, help='Actual reviewed combined.json required for source saving.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.output.exists(): raise RuntimeError('Choose a new ignored output directory')
args.output.mkdir(parents=True)
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
source_sha = sha(args.scene)
report = {}


def counts(scene):
    result = {'objects': 0, 'vertices': 0, 'triangles': 0}
    for obj in scene.objects:
        if obj.type == 'MESH' and obj.get('one_light_static'):
            obj.data.calc_loop_triangles()
            result['objects'] += 1; result['vertices'] += len(obj.data.vertices)
            result['triangles'] += len(obj.data.loop_triangles)
    return result


def refresh_source_metadata(scene):
    from snow_lightmap_charts import complete_source_charts
    regions, largest = {}, []
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.get('one_light_static'): continue
        mesh = obj.data; mesh.calc_loop_triangles()
        points = [obj.matrix_world @ v.co for v in mesh.vertices]
        area = sum((points[t.vertices[1]] - points[t.vertices[0]]).cross(points[t.vertices[2]] - points[t.vertices[0]]).length / 2 for t in mesh.loop_triangles)
        row = regions.setdefault(obj.get('region', 'hall'), {'objects': 0, 'vertices': 0, 'triangles': 0, 'worldAreaM2': 0})
        row['objects'] += 1; row['vertices'] += len(mesh.vertices); row['triangles'] += len(mesh.loop_triangles); row['worldAreaM2'] += area
        largest.append({'object': obj.name, 'triangles': len(mesh.loop_triangles), 'worldAreaM2': area})
    scene['source_geometry_budget'] = json.dumps({'regions': regions, 'totalObjects': sum(r['objects'] for r in regions.values()),
        'totalTriangles': sum(r['triangles'] for r in regions.values()), 'largestContributors': sorted(largest, key=lambda r: r['triangles'], reverse=True)[:20],
        'auxiliaryTransport': {'exportExcluded': True, 'objects': report['proxy']['parts'], 'triangles': report['proxy']['triangles']}})
    scene['source_lightmap_charts'] = json.dumps(complete_source_charts(list(bpy.data.collections['STATIC'].objects)))
    materials = {mat for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static') for mat in obj.data.materials if mat}
    scene['source_material_delivery'] = json.dumps({'policy': 'Source19 photograph-based linen, existing scan maps and supported RGBA multiplication; actual geometry/normal/UV and literal contact gates remain required.',
        'materials': [{'name': mat.name, 'linearFactor': list(mat.get('one_light_basecolor_linear', [])),
            'normalStrengths': [float(n.inputs['Strength'].default_value) for n in mat.node_tree.nodes if n.type == 'NORMAL_MAP'],
            'images': [n.image.name for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]} for mat in sorted(materials, key=lambda m: m.name) if mat.use_nodes]})
    hashes = json.loads(scene.get('source_authoring_sha256', '{}')); hashes.update(report['helpers'])
    hashes[str(Path(__file__).relative_to(ROOT))] = sha(__file__)
    scene['source_authoring_sha256'] = json.dumps(hashes)
    scene['source_albedo_policy'] = 'Source19 retains Source18 linear/sRGB conventions and exposure40 +residual.35EV. Picture-approved candle.8W/3cm, hall floor albedo1.8x with normal0, photo-linen cushions and lighter ordinary ceramic/bamboo are explicit source changes; roughness/real photo UVs retained.'
    scene['authored_night_lighting'] = json.dumps({'cameraPreExposure': 40, 'residualCameraExposureEV': .35,
        'lights': [{'name': o.name, 'watts': o.data.energy, 'linearRGB': list(o.data.color)} for o in scene.objects if o.type == 'LIGHT']})


def apply_scene(_):
    import snow_lantern_transport as transport
    import snow_round2_interior as interior
    import snow_round2_exterior as exterior
    from resting_contacts import RestingContacts
    scene = bpy.context.scene
    before = counts(scene)
    for obj in list(scene.objects):
        if obj.get(transport.TAG):
            mesh = obj.data; bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0: bpy.data.meshes.remove(mesh)
    proxy = transport.apply_transport(scene, args.geometry, [-1.5, 2.25, -1.3], sha(args.geometry), watts=.8, radius=.03)
    inside = interior.apply(scene)
    outside = exterior.apply(scene)
    contacts = RestingContacts.from_scene().audit(fail=True)
    report.update({'source': {'path': str(args.scene), 'sha256': source_sha},
        'proxy': {'file': str(args.geometry), 'sha256': sha(args.geometry), 'parts': proxy['parts'],
                  'triangles': proxy['triangles'], 'cloth': proxy['cloth'], 'basis': proxy['basis'],
                  'realCeilingExtension': proxy['actualRuntimeCeilingExtension']},
        'interior': inside, 'exterior': outside, 'staticBefore': before, 'staticAfter': counts(scene),
        'contactGroups': len(contacts['groups']), 'contactsPassed': contacts['passed'],
        'sourceSaved': False, 'mapsBaked': False, 'rendered': args.render,
        'helpers': {str(Path(module.__file__).relative_to(ROOT)): sha(module.__file__)
                    for module in [transport, interior, exterior]}})
    scene['one_light_round2_combined'] = json.dumps({'sourceInputSha256': source_sha,
        'runtimeGeometrySha256': proxy['runtimeGeometrySha256'], 'helpers': report['helpers'],
        'staticAfter': report['staticAfter'], 'contactGroups': 47,
        'fullExternalReportSha256': hashlib.sha256(json.dumps(report, sort_keys=True).encode()).hexdigest()})
    (args.output / 'combined.json').write_text(json.dumps(report, indent=2) + '\n')


if args.save_source:
    if args.render or args.save_source.exists() or not args.approved_picture:
        raise RuntimeError('A new source path and actual approved picture are required; source save never renders.')
    bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve())); apply_scene(None)
    approved = json.loads(args.approved_picture.read_text())
    # Helper hashes truthfully record the metadata-only smoke-config anchor sync
    # after review. Physical choice records must otherwise match the picture.
    ignore = {'rendered', 'helpers'}
    if {k: v for k, v in report.items() if k not in ignore} != {k: v for k, v in approved.items() if k not in ignore}:
        raise RuntimeError('Source choice differs from the actual approved combined picture')
    refresh_source_metadata(bpy.context.scene)
    bpy.context.scene['one_light_round2_approved_picture'] = json.dumps({'path': str(args.approved_picture), 'sha256': sha(args.approved_picture),
        'metadataOnlyAfterPicture': 'Smoke config anchor/sourceObjects synchronized with the already-updated actual rod tips.'})
    args.save_source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.save_source.resolve()))
    (args.output / 'source-choice.json').write_text(json.dumps({'source': str(args.save_source), 'sha256': sha(args.save_source),
        'approvedPicture': str(args.approved_picture), 'groupsPassed': 47, 'renderBakeJobs': 0}, indent=2) + '\n')
elif args.render:
    camera = args.output / 'camera.json'
    camera.write_text(json.dumps({'Round2Combined': {'position': [-4.9, 2.35, -2.15],
        'look': [1.09794395, 1.2, -1.99293831], 'fov': 55}}) + '\n')
    sys.argv = ['preview.py', '--', '--scene', str(args.scene), '--output', str(args.output),
        '--cameras', 'Round2Combined', '--camera-poses', str(camera), '--samples', '8', '--integrator', 'bake',
        '--width', '1440', '--height', '900', '--look', 'authored']
    preview = ROOT / 'art/blender/preview.py'; code = preview.read_text()
    load = 'bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))'
    if code.count(load) != 1: raise RuntimeError('Actual preview load signature changed')
    code = code.replace(load, load + '\n__apply_round2_combined(None)')
    exec(compile(code, str(preview), 'exec'), {'__name__': '__main__', '__file__': str(preview),
                                           '__apply_round2_combined': apply_scene})
else:
    bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve()))
    apply_scene(None)
if sha(args.scene) != source_sha: raise RuntimeError('Frozen Source18 changed')
print('SNOW_ROUND2_COMBINED_READY', args.output, report['staticAfter'], '47contacts', report['contactsPassed'], flush=True)
