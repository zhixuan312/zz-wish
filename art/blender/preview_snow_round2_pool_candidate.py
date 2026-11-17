"""One unsaved Round2 Snow pool/stone candidate; CPU preparation by default.

Only --render runs the explicitly leased eight-sample Metal preview. Never saves
the authored scene, bakes maps, or writes public assets.
"""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, default=ROOT / 'art/build/snow-roof-round1/source-v18.blend')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--render', action='store_true', help='Requires the exclusive native GPU lease.')
parser.add_argument('--candle-watts', type=float, default=.8)
parser.add_argument('--emitter-radius', type=float, default=.03)
parser.add_argument('--floor-gain', type=float, default=1.8)
parser.add_argument('--floor-normal-strength', type=float, default=0.)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.output.exists():
    raise RuntimeError('Choose a new ignored candidate output')
args.output.mkdir(parents=True)
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
source_sha = digest(args.scene)
report = {}


def apply_candidate(_):
    scene = bpy.context.scene
    point = next(obj for obj in scene.objects if obj.type == 'LIGHT' and obj.get('bake_role') == 'lamp')
    old_point = {'watts': float(point.data.energy), 'radius': float(point.data.shadow_soft_size),
                 'linearRGB': list(point.data.color), 'positionBlender': list(point.matrix_world.translation)}
    point.data.energy = args.candle_watts
    point.data.shadow_soft_size = args.emitter_radius
    basis = json.loads(scene['one_light_lamp_basis'])
    basis.update({'watts': float(point.data.energy), 'pointRadiusMetres': float(point.data.shadow_soft_size)})
    scene['one_light_lamp_basis'] = json.dumps(basis)
    transport = json.loads(scene['one_light_gauze_transport'])
    transport['basis'] = basis
    scene['one_light_gauze_transport'] = json.dumps(transport)
    materials = set()
    floor = []
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.name.startswith('Settled irregular paving stone') or obj.get('region') != 'hall':
            continue
        for material in obj.data.materials:
            if material and (material.name.startswith('Dark hall paving') or material.name.startswith('Walk-polished worn dark stone')):
                materials.add(material)
        center = obj.matrix_world @ (sum((vertex.co for vertex in obj.data.vertices), Vector()) / len(obj.data.vertices))
        if abs(center.x + 1.5) < 1.5 and abs(-center.y + 1.3) < 1.5:
            floor.append(obj)
    material_rows = []
    for material in sorted(materials, key=lambda value: value.name):
        # Source18 already separates shared exterior/altar paving from hall tint.
        outsiders = [obj.name for obj in scene.objects if obj.type == 'MESH' and obj.get('region') != 'hall'
                     and any(slot.material == material for slot in obj.material_slots)]
        if outsiders:
            raise RuntimeError('Clone a shared non-hall material before changing it: ' + material.name)
        shader = material.node_tree.nodes.get('Principled BSDF')
        color = shader.inputs['Base Color']
        multiply = color.links[0].from_node
        if multiply.type != 'MIX' or multiply.blend_type != 'MULTIPLY' or multiply.inputs[7].is_linked:
            raise RuntimeError('Expected photographed stone multiplied by its actual linear factor')
        factor = multiply.inputs[7]
        before = list(factor.default_value)
        after = [value * args.floor_gain for value in before[:3]] + [before[3]]
        if max(after[:3]) > 1:
            raise RuntimeError('Physical stone factor must stay within the material range')
        factor.default_value = after
        material['one_light_basecolor_linear'] = after
        material['one_light_export_basecolor_factor'] = after
        normal = next(node for node in material.node_tree.nodes if node.type == 'NORMAL_MAP')
        old_normal = float(normal.inputs['Strength'].default_value)
        normal.inputs['Strength'].default_value = args.floor_normal_strength
        maps = [{'node': node.name, 'image': node.image.name, 'file': bpy.path.abspath(node.image.filepath),
                 'size': list(node.image.size), 'colourSpace': node.image.colorspace_settings.name}
                for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]
        material_rows.append({'material': material.name, 'linearFactorBefore': before,
                              'linearFactorAfter': after, 'normalStrengthBefore': old_normal,
                              'normalStrengthAfter': args.floor_normal_strength, 'actualImageInputs': maps,
                              'photoUVsAndRoughnessUnchanged': True})
    if len(material_rows) != 4:
        raise RuntimeError('Expected the four actual hall paving materials')
    metres_per_repeat = []
    for obj in floor[:12]:
        mesh = obj.data
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers['UVMap']
        for triangle in mesh.loop_triangles:
            if triangle.normal.z < .95:
                continue
            for index in range(3):
                a, b = triangle.loops[index], triangle.loops[(index + 1) % 3]
                duv = (uv.data[a].uv - uv.data[b].uv).length
                if duv > 1e-5:
                    pa = obj.matrix_world @ mesh.vertices[mesh.loops[a].vertex_index].co
                    pb = obj.matrix_world @ mesh.vertices[mesh.loops[b].vertex_index].co
                    metres_per_repeat.append((pa - pb).length / duv)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from resting_contacts import RestingContacts
    contacts = RestingContacts.from_scene().audit(fail=True)
    report.update({'source': {'path': str(args.scene), 'sha256': source_sha},
        'candidate': {'watts': float(point.data.energy), 'effectiveEmitterRadiusMetres': float(point.data.shadow_soft_size),
                      'linearRGB': list(point.data.color), 'clothReflection': .35, 'clothTransmission': .065,
                      'shadowTransmission': .022, 'nativeExposureUnchanged': scene.view_settings.exposure},
        'oldPoint': old_point, 'materials': material_rows,
        'measuredMedianMaterialUVMetresPerRepeat': statistics.median(metres_per_repeat) if metres_per_repeat else None,
        'floorPhotoObservation': 'Actual stone albedo/normal photos show worn grain and mortar, without the concentric lines visible in the delivered pool. Normal strength zero isolates grazing micro-normal response; surviving app rings would still require a shadow-sampling correction.',
        'expectedVisibleEffect': 'Lower cloth radiance reveals its flame-to-rim gradient; the3cm effective emitter broadens the aperture penumbra; medium-dark stone remains readable without a white stage disc. No independent fill or cloth-only brightness compensation.',
        'unchanged': ['source position', 'architecture', 'resting geometry', 'photo albedo/UVs', 'roughness', 'other lights', 'view exposure'],
        'restingContactGroupsPassed': len(contacts['groups']), 'sourceSaved': False, 'mapsBaked': False,
        'rendered': args.render, 'scriptSha256': digest(Path(__file__))})
    (args.output / 'candidate.json').write_text(json.dumps(report, indent=2) + '\n')


if args.render:
    camera = args.output / 'camera.json'
    camera.write_text(json.dumps({'Round2Pool': {'position': [-4.9, 2.35, -2.15],
        'look': [1.09794395, 1.2, -1.99293831], 'fov': 55}}) + '\n')
    sys.argv = ['preview.py', '--', '--scene', str(args.scene), '--output', str(args.output),
        '--cameras', 'Round2Pool', '--camera-poses', str(camera), '--samples', '8', '--integrator', 'bake',
        '--width', '1440', '--height', '900', '--look', 'authored']
    preview = ROOT / 'art/blender/preview.py'
    text = preview.read_text()
    load = 'bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))'
    if text.count(load) != 1:
        raise RuntimeError('Actual preview load signature changed')
    text = text.replace(load, load + '\n__apply_round2(None)')
    exec(compile(text, str(preview), 'exec'), {'__name__': '__main__', '__file__': str(preview), '__apply_round2': apply_candidate})
else:
    bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve()))
    apply_candidate(None)
if digest(args.scene) != source_sha:
    raise RuntimeError('Frozen Source18 changed')
print('SNOW_ROUND2_POOL_CANDIDATE_READY', args.output, 'rendered', args.render, flush=True)
