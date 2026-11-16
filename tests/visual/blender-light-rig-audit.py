"""Read two .blend files and compare source lights/worlds. Never render, bake or save."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--before', required=True)
parser.add_argument('--after', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def value(data):
    if data is None or isinstance(data, (str, int, float, bool)):
        return data
    try:
        return [value(item) for item in data]
    except TypeError:
        return {'type': type(data).__name__, 'name': getattr(data, 'name', None)}

def node_tree(tree):
    if tree is None:
        return None
    nodes = []
    for node in sorted(tree.nodes, key=lambda item: item.name):
        entry = {'name': node.name, 'type': node.bl_idname, 'mute': node.mute,
                 'inputs': [{'name': socket.name, 'identifier': socket.identifier,
                             'value': value(socket.default_value) if hasattr(socket, 'default_value') else None}
                            for socket in node.inputs]}
        properties = ['operation', 'use_clamp', 'blend_type', 'projection', 'interpolation', 'extension',
                      'sky_type', 'sun_direction', 'sun_elevation', 'sun_rotation', 'sun_disc', 'sun_size',
                      'sun_intensity', 'altitude', 'air_density', 'dust_density', 'ozone_density',
                      'turbidity', 'ground_albedo', 'is_active_output']
        entry['properties'] = {key: value(getattr(node, key)) for key in properties if hasattr(node, key)}
        image = getattr(node, 'image', None)
        if image:
            path = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
            entry['image'] = {'filepath': image.filepath, 'source': image.source,
                              'colorSpace': image.colorspace_settings.name,
                              'sha256': file_hash(path) if path and path.is_file() else None}
            packed = getattr(image, 'packed_file', None)
            if packed:
                entry['image']['packedSha256'] = hashlib.sha256(packed.data).hexdigest()
        if getattr(node, 'node_tree', None):
            entry['group'] = node_tree(node.node_tree)
        nodes.append(entry)
    links = sorted([{'fromNode': link.from_node.name, 'fromSocket': link.from_socket.identifier,
                     'toNode': link.to_node.name, 'toSocket': link.to_socket.identifier}
                    for link in tree.links], key=lambda link: json.dumps(link, sort_keys=True))
    return {'nodes': nodes, 'links': links}

def snapshot(path):
    path = Path(path).resolve()
    original_hash = file_hash(path)
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    lights = []
    for obj in sorted((item for item in scene.objects if item.type == 'LIGHT'), key=lambda item: item.name):
        light = obj.data
        properties = ['type', 'color', 'energy', 'shadow_soft_size', 'angle', 'shape', 'size', 'size_y',
                      'spot_size', 'spot_blend', 'use_shadow', 'normalize', 'diffuse_factor',
                      'specular_factor', 'volume_factor', 'use_nodes']
        entry = {'name': obj.name, 'matrixWorld': [list(row) for row in obj.matrix_world],
                 'location': list(obj.location), 'rotationEuler': list(obj.rotation_euler),
                 'scale': list(obj.scale), 'hideRender': obj.hide_render,
                 'collections': sorted([{'name': collection.name, 'hideRender': collection.hide_render}
                                        for collection in obj.users_collection], key=lambda item: item['name']),
                 'properties': {key: value(getattr(light, key)) for key in properties if hasattr(light, key)},
                 'nodes': node_tree(light.node_tree) if getattr(light, 'use_nodes', False) else None}
        lights.append(entry)
    world = scene.world
    world_data = None if world is None else {'useNodes': world.use_nodes, 'color': list(world.color),
                                           'nodes': node_tree(world.node_tree) if world.use_nodes else None}
    rig = {'lights': lights, 'world': world_data}
    view_keys = ['view_transform', 'look', 'exposure', 'gamma', 'use_hdr_view', 'use_white_balance',
                 'white_balance_temperature', 'white_balance_tint']
    view = {key: value(getattr(scene.view_settings, key)) for key in view_keys if hasattr(scene.view_settings, key)}
    digest = hashlib.sha256(json.dumps(rig, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'path': str(path), 'fileSha256': original_hash, 'fileUnchangedAfterRead': file_hash(path) == original_hash,
            'rigSha256': digest, 'rig': rig, 'colorManagement': view}

def differences(before, after, path=''):
    if type(before) is not type(after):
        return [{'path': path, 'before': before, 'after': after}]
    if isinstance(before, dict):
        rows = []
        for key in sorted(set(before) | set(after)):
            if key not in before or key not in after:
                rows.append({'path': path + '/' + key, 'before': before.get(key), 'after': after.get(key)})
            else:
                rows.extend(differences(before[key], after[key], path + '/' + key))
        return rows
    if isinstance(before, list):
        if len(before) != len(after):
            return [{'path': path + '/length', 'before': len(before), 'after': len(after)}]
        return [difference for index, (a, b) in enumerate(zip(before, after))
                for difference in differences(a, b, path + '/' + str(index))]
    return [] if before == after else [{'path': path, 'before': before, 'after': after}]

before = snapshot(args.before)
after = snapshot(args.after)
rig_differences = differences(before['rig'], after['rig'])
view_differences = differences(before['colorManagement'], after['colorManagement'])
report = {'before': before, 'after': after, 'sourceRigIdentical': not rig_differences,
          'colorManagementIdentical': not view_differences,
          'rigDifferences': rig_differences, 'colorManagementDifferences': view_differences,
          'scope': ['Light object transforms, colors, energy, radii, shape, visibility and node graphs.',
                    'World shader nodes, input values, image identity and links; color management is compared separately.',
                    'Read-only: no render, bake, scene edit or save. Both source files are rehashed after reading.',
                    'Identical source rigs do not imply identical pixels: new geometry and materials change occlusion, reflections and indirect bounce.',
                    'Emissive material/mesh changes belong to the geometry/material review and are not equated with source light-object identity.']}
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + '\n')
print('ONE_LIGHT_RIG_AUDIT', json.dumps({'sourceRigIdentical': report['sourceRigIdentical'],
                                      'colorManagementIdentical': report['colorManagementIdentical'],
                                      'lightsBefore': len(before['rig']['lights']), 'lightsAfter': len(after['rig']['lights']),
                                      'rigDifferences': len(rig_differences), 'output': str(output)}), flush=True)
