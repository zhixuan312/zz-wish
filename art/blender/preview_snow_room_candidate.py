"""One unsaved eight-sample room/candle picture candidate; no source save."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--geometry', type=Path, help='Actual revised runtime body; replaced only in this unsaved picture process.')
parser.add_argument('--candle-watts', type=float, default=.25)
parser.add_argument('--cloth-transmission', type=float, default=.65, help='Effective translucent weight; reflection remains .35.')
parser.add_argument('--shadow-throughput', type=float, default=.22)
parser.add_argument('--candle-linear-rgb', type=float, nargs=3)
parser.add_argument('--look-y', type=float, default=1.75)
parser.add_argument('--look-x', type=float, default=1.1)
parser.add_argument('--look-z', type=float, default=-1.4)
parser.add_argument('--eye-z', type=float, default=-3.)
parser.add_argument('--door-watts', type=float)
parser.add_argument('--floor-gain', type=float, default=1.)
parser.add_argument('--remove-east-paper', action='store_true')
parser.add_argument('--save-source', type=Path, help='Save the picture-approved choice once; does not render.')
parser.add_argument('--approved-picture', type=Path, help='Actual reviewed preview.json required with --save-source.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.output.exists():
    raise RuntimeError('New candidate picture output required')
source_before = hashlib.sha256(args.scene.read_bytes()).hexdigest()
args.output.mkdir(parents=True)
poses = args.output / 'camera.json'
poses.write_text(json.dumps({'RoomCandidate_backBay': {'position': [-4.9, 2.35, args.eye_z], 'look': [args.look_x, args.look_y, args.look_z], 'fov': 55}}, indent=2) + '\n')
applied = {}


def apply_candidate(_):
    scene = bpy.context.scene
    if args.geometry:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import snow_lantern_transport as transport
        for obj in list(scene.objects):
            if obj.get(transport.TAG):
                mesh = obj.data
                bpy.data.objects.remove(obj, do_unlink=True)
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
        config = transport.apply_transport(scene, args.geometry, [-1.5, 2.25, -1.3],
                                           transport.sha(args.geometry), watts=args.candle_watts)
        applied['revisedActualRuntimeBody'] = {'file': str(args.geometry), 'parts': config['parts'],
            'triangles': config['triangles'], 'pointEngine': config['basis']['position'],
            'bodySuspensionTopEngine': config['basis']['bodySuspensionTopEngine']}
    lamp = next(obj for obj in scene.objects if obj.type == 'LIGHT' and obj.get('bake_role') == 'lamp')
    lamp.data.energy = args.candle_watts
    if args.candle_linear_rgb:
        lamp.data.color = args.candle_linear_rgb
        basis = json.loads(scene['one_light_lamp_basis'])
        basis['linearColor'] = list(lamp.data.color)
        scene['one_light_lamp_basis'] = json.dumps(basis)
        transport_meta = json.loads(scene['one_light_gauze_transport'])
        transport_meta['basis'] = basis
        scene['one_light_gauze_transport'] = json.dumps(transport_meta)
    if args.cloth_transmission != .65 or args.shadow_throughput != .22:
        gauze = next(obj for obj in scene.objects if obj.get('transport_role') == 'gauze')
        material = gauze.data.materials[0]
        nodes, links = material.node_tree.nodes, material.node_tree.links
        translucent = next(node for node in nodes if node.type == 'BSDF_TRANSLUCENT')
        original_color = translucent.inputs['Color'].links[0].from_socket
        absorb = nodes.new('ShaderNodeMix')
        absorb.data_type = 'RGBA'; absorb.blend_type = 'MULTIPLY'
        absorb.inputs[0].default_value = 1
        absorb.inputs[7].default_value = (args.cloth_transmission / .65,) * 3 + (1.,)
        links.new(original_color, absorb.inputs[6])
        links.new(absorb.outputs[2], translucent.inputs['Color'])
        transport_meta = json.loads(scene['one_light_gauze_transport'])
        cloth = transport_meta['cloth']
        rgb = [args.shadow_throughput * value / max(cloth['linearRGB']) for value in cloth['linearRGB']]
        transparent = next(node for node in nodes if node.type == 'BSDF_TRANSPARENT')
        transparent.inputs['Color'].default_value = tuple(rgb) + (1.,)
        material['shadow_throughput_linear'] = rgb
        basis = json.loads(scene['one_light_lamp_basis'])
        basis['transport'].update({'diffuseReflectionWeight': .35,
            'diffuseTransmissionWeight': args.cloth_transmission,
            'shadowTransmissionScale': args.shadow_throughput,
            'clothShadowTransmissionLinearRGB': rgb,
            'formula': f'linearCSS*{args.shadow_throughput}/max(linearCSS)'})
        cloth.update({'diffuseReflectionWeight': .35, 'diffuseTransmissionWeight': args.cloth_transmission,
            'shadowTransmissionScale': args.shadow_throughput, 'shadowTransmissionLinearRGB': rgb})
        transport_meta['basis'] = basis
        scene['one_light_lamp_basis'] = json.dumps(basis)
        scene['one_light_gauze_transport'] = json.dumps(transport_meta)
        applied['absorbingCloth'] = {'diffuseReflectionWeight': .35,
            'diffuseTransmissionWeight': args.cloth_transmission,
            'shadowTransmissionScale': args.shadow_throughput,
            'clothShadowTransmissionLinearRGB': rgb,
            'actualDiffuseBranchUnchanged': True, 'actualMixWeight': .65}
    room = bpy.data.objects['Soft warm hall interreflection']
    room.location = Vector((0, 3.3, 3.2))  # Engine [0,3.2,-3.3].
    room.data.energy = .9
    door = bpy.data.objects['Cool court light entering doorway']
    if args.door_watts is not None:
        door.data.energy = args.door_watts
    if args.remove_east_paper:
        removed = []
        for obj in list(scene.objects):
            if obj.type != 'MESH' or not any(mat and mat.name == 'Ivory window paper' for mat in obj.data.materials):
                continue
            center = obj.matrix_world @ (sum((vertex.co for vertex in obj.data.vertices), Vector()) / len(obj.data.vertices))
            if center.x > 0:
                removed.append(obj.name)
                if scene.get('source_geometry_budget'):
                    budget = json.loads(scene['source_geometry_budget'])
                    mesh = obj.data
                    mesh.calc_loop_triangles()
                    vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
                    area = sum((vertices[t.vertices[1]] - vertices[t.vertices[0]]).cross(
                        vertices[t.vertices[2]] - vertices[t.vertices[0]]).length * .5 for t in mesh.loop_triangles)
                    region = budget['regions'][obj.get('region', 'hall')]
                    for key, count in [('objects', 1), ('vertices', len(mesh.vertices)), ('triangles', len(mesh.loop_triangles)), ('worldAreaM2', area)]:
                        region[key] -= count
                    budget['totalObjects'] -= 1
                    budget['totalTriangles'] -= len(mesh.loop_triangles)
                    budget['largestContributors'] = [row for row in budget['largestContributors'] if row['object'] != obj.name]
                    scene['source_geometry_budget'] = json.dumps(budget)
                bpy.data.objects.remove(obj, do_unlink=True)
        if len(removed) != 1:
            raise RuntimeError('Expected exactly the east window paper backing; retain its real lattice/opening')
        applied['removedEastBlankPaperBacking'] = removed
    if args.floor_gain != 1:
        changes = []
        for name in ['Dark hall paving 0', 'Dark hall paving 1', 'Dark hall paving 2', 'Walk-polished worn dark stone']:
            original = bpy.data.materials[name]
            users = [obj for obj in scene.objects if obj.type == 'MESH' and any(slot.material == original for slot in obj.material_slots)]
            hall_users = [obj for obj in users if obj.get('region', obj.get('lightmap_region')) == 'hall']
            if not hall_users:
                raise RuntimeError('Expected actual hall-floor users: ' + name)
            material = original
            if len(hall_users) != len(users):
                material = original.copy()
                material.name = name + ' hall-only albedo'
                for obj in hall_users:
                    for slot in obj.material_slots:
                        if slot.material == original:
                            slot.material = material
            shader = material.node_tree.nodes.get('Principled BSDF')
            color = shader.inputs['Base Color']
            if color.is_linked:
                multiply = color.links[0].from_node
                if multiply.type != 'MIX' or multiply.blend_type != 'MULTIPLY' or multiply.inputs[7].is_linked:
                    raise RuntimeError('Expected the actual supported image×albedo multiply: ' + name)
                color = multiply.inputs[7]
            old = list(color.default_value)
            new = [value * args.floor_gain for value in old[:3]] + [old[3]]
            if any(value > 1 for value in new[:3]):
                raise RuntimeError('Physical floor albedo candidate must not clip')
            color.default_value = new
            material['one_light_basecolor_linear'] = new
            material['one_light_export_basecolor_factor'] = new
            material['one_light_hall_floor_albedo_gain'] = args.floor_gain
            changes.append({'material': material.name, 'gain': args.floor_gain, 'hallOnlyClone': material != original})
        applied['hallFloorDiffuseOnly'] = changes
    for name in ['Aged red painted timber', 'Faded teal beam paint']:
        normal = next(node for node in bpy.data.materials[name].node_tree.nodes if node.type == 'NORMAL_MAP')
        normal.inputs['Strength'].default_value = .03
    view = json.loads(scene['one_light_source_view_settings'])
    view['exposure'] += .35
    scene['one_light_source_view_settings'] = json.dumps(view)
    scene.view_settings.exposure = view['exposure']
    applied.update({'visitorActualWatts': float(lamp.data.energy), 'visitorFiniteRadiusMetres': float(lamp.data.shadow_soft_size),
                    'visitorLinearRGB': list(lamp.data.color),
                    'warmHallActualWatts': float(room.data.energy), 'warmHallEnginePosition': [0, 3.2, -3.3],
                    'doorActualWatts': float(door.data.energy),
                    'redAndTealNormalStrength': .03, 'extraNativeExposureEV': .35, 'actualNativeExposureEV': view['exposure'],
                    'coupledPhysicalCloth': True, 'independentGlowAdded': False,
                    'geometryContactsAndAuthoredSourceUnchanged': not args.remove_east_paper,
                    'restingPropsAndAllOtherConstructionUnchanged': True})


try:
    if args.save_source:
        if args.save_source.exists() or not args.approved_picture:
            raise RuntimeError('A new source path and the actual approved picture metadata are required')
        approved = json.loads(args.approved_picture.read_text())
        bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve()))
        apply_candidate(None)
        if applied != approved['unsavedRoomCandidate'] or approved['blendSha256'] != source_before:
            raise RuntimeError('Source choice differs from the actual reviewed native picture')
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import bake_export as baker
        from resting_contacts import RestingContacts
        from types import SimpleNamespace
        scene = bpy.context.scene
        view = json.loads(scene['one_light_source_view_settings'])
        baker.configure_cycles(scene, SimpleNamespace(samples=64, device='METAL', skip_bake=True, export_only=False))
        for key, value in view.items():
            setattr(scene.view_settings, key, value)
        scene.cycles.use_denoising = True
        scene.cycles.denoising_use_gpu = True
        contacts = RestingContacts.from_scene().audit(fail=True)
        if len(contacts['groups']) != 47:
            raise RuntimeError('All 47 actual resting-prop groups must remain registered')
        scene['one_light_room_picture_choice'] = json.dumps({'approvedPicture': str(args.approved_picture), **applied})
        scene['source_albedo_policy'] = ('Authored CSS-like hex colours are decoded once to linear; image colour spaces, imported PBR factors and SurfaceTint are retained. Source18 uses the picture-approved hall-only floor albedo multiplier, red/teal paint normal strength .03, actual absorbing red-gauze reflection .35/transmission ' + str(args.cloth_transmission) + ', and shadow throughput ' + str(args.shadow_throughput) + '. Camera pre-exposure remains40; the selected native view adds .35EV. Actual source energies and chromaticities are recorded in authored_night_lighting and one_light_lamp_basis.')
        scene['authored_night_lighting'] = json.dumps({'cameraPreExposure': 40, 'nativeView': view,
            'pictureChoice': applied, 'lights': [{'name': obj.name, 'actualWatts': obj.data.energy,
                'enginePosition': [obj.location.x, obj.location.z, -obj.location.y]} for obj in scene.objects if obj.type == 'LIGHT']})
        args.save_source.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.save_source.resolve()))
        (args.output / 'source-choice.json').write_text(json.dumps({'source': str(args.save_source),
            'approvedPicture': str(args.approved_picture), 'choice': applied, 'restingGroupsPassed': 47,
            'source17Unchanged': hashlib.sha256(args.scene.read_bytes()).hexdigest() == source_before,
            'renderBakeGpuJobs': 0}, indent=2) + '\n')
    else:
        sys.argv = ['preview.py', '--', '--scene', str(args.scene), '--output', str(args.output),
                    '--cameras', 'RoomCandidate_backBay', '--camera-poses', str(poses),
                    '--samples', '8', '--integrator', 'bake', '--width', '1440', '--height', '900', '--look', 'authored']
        preview_path = ROOT / 'art/blender/preview.py'
        code = preview_path.read_text()
        load = 'bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))'
        if code.count(load) != 1:
            raise RuntimeError('Preview load hook changed')
        code = code.replace(load, load + '\n__candidate_apply(None)')
        # An explicit call propagates errors before rendering. Blender load
        # handlers merely log exceptions and could otherwise render a partial
        # candidate after a failed override.
        exec(compile(code, str(preview_path), 'exec'), {'__name__': '__main__',
             '__file__': str(preview_path), '__candidate_apply': apply_candidate})
finally:
    pass
if not applied or hashlib.sha256(args.scene.read_bytes()).hexdigest() != source_before:
    raise RuntimeError('Authored source changed')
if args.save_source:
    print('PICTURE_APPROVED_SOURCE_SAVED', args.save_source, '47 resting groups pass; no render', flush=True)
    raise SystemExit(0)
metadata_path = args.output / 'preview.json'
metadata = json.loads(metadata_path.read_text())
metadata.update({'lightingCandidate': True, 'unsavedRoomCandidate': applied, 'sourceFileUnchanged': True,
                 'scope': 'One unsaved native8 picture candidate, not calibrated optical acceptance or source revision.'})
metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
print('UNSAVED_ROOM_PICTURE_READY', args.output, flush=True)
