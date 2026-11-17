"""Freeze one evaluated construction snapshot into an isolated authored source.

No rendering, baking, UV packing, tint reconstruction or material change occurs.
All meshes are captured from one unchanged dependency graph before any modifier
is removed. Save/reopen equality is measured against those actual captured data.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def values(collection, prop, width, kind='f'):
    result = array(kind, [0]) * (len(collection) * width)
    collection.foreach_get(prop, result)
    return np.frombuffer(result, dtype={'f': np.float32, 'i': np.int32, 'b': np.int8}[kind]).copy()


def json_value(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, bpy.types.ID):
        return {'type': value.bl_rna.identifier, 'name': value.name_full}
    if hasattr(value, 'to_dict'):
        return {key: json_value(item) for key, item in value.to_dict().items()}
    if hasattr(value, '__iter__'):
        return [json_value(item) for item in value]
    return str(value)


def props(item):
    return {key: json_value(value) for key, value in item.items()}


def node_graph(tree):
    if tree is None:
        return None
    nodes = []
    for node in sorted(tree.nodes, key=lambda n: n.name):
        row = {'name': node.name, 'type': node.bl_idname,
               'inputs': [(socket.identifier, json_value(socket.default_value))
                          for socket in node.inputs if hasattr(socket, 'default_value')]}
        for field in ['blend_type', 'data_type', 'operation', 'attribute_name', 'uv_map',
                      'extension', 'interpolation', 'projection', 'image']:
            if hasattr(node, field):
                row[field] = json_value(getattr(node, field))
        nodes.append(row)
    return {'nodes': nodes, 'links': sorted((link.from_node.name, link.from_socket.identifier,
                                            link.to_node.name, link.to_socket.identifier)
                                           for link in tree.links)}


def nonmesh_state(scene):
    used_materials = {slot.material for obj in scene.objects if obj.type == 'MESH'
                      for slot in obj.material_slots if slot.material}
    return {'sceneProperties': props(scene),
            'objectPropertiesAndMatrices': {obj.name: {'type': obj.type,
                'matrix': [list(row) for row in obj.matrix_world], 'properties': props(obj),
                'parent': obj.parent.name if obj.parent else None,
                'collections': sorted(collection.name for collection in obj.users_collection)}
                for obj in scene.objects},
            'materials': {material.name: {'properties': props(material),
                'diffuse': list(material.diffuse_color), 'useNodes': material.use_nodes,
                'graph': node_graph(material.node_tree)} for material in used_materials},
            'images': {image.name: {'resolvedFilepath': str(Path(bpy.path.abspath(image.filepath)).resolve())
                if image.filepath and image.source == 'FILE' else None,
                'colorspace': image.colorspace_settings.name,
                'size': list(image.size), 'packedSha256': hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
                if image.packed_file else None} for image in bpy.data.images},
            'lights': {obj.name: {'energy': obj.data.energy, 'color': list(obj.data.color),
                'type': obj.data.type, 'radius': obj.data.shadow_soft_size if obj.data.type == 'POINT'
                else getattr(obj.data, 'angle', None)} for obj in scene.objects if obj.type == 'LIGHT'},
            'world': node_graph(scene.world.node_tree),
            'view': {key: getattr(scene.view_settings, key)
                     for key in ['view_transform', 'look', 'exposure', 'gamma']},
            'cycles': {'device': scene.cycles.device, 'threadsMode': scene.render.threads_mode,
                       'denoiser': scene.cycles.denoiser}}


def mesh_snapshot(obj, mesh):
    local = values(mesh.vertices, 'co', 3).reshape(-1, 3)
    normals = values(mesh.corner_normals, 'vector', 3).reshape(-1, 3)
    matrix = np.asarray(obj.matrix_world, dtype=np.float64)
    world = local.astype(np.float64) @ matrix[:3, :3].T + matrix[:3, 3]
    normal_matrix = np.linalg.inv(matrix[:3, :3]).T
    world_normals = normals.astype(np.float64) @ normal_matrix.T
    world_normals /= np.maximum(np.linalg.norm(world_normals, axis=1)[:, None], 1e-30)
    fields = {'positionsLocal': local, 'positionsWorld': world, 'cornerNormalsLocal': normals,
              'cornerNormalsWorld': world_normals,
              'loopVertexIndices': values(mesh.loops, 'vertex_index', 1, 'i'),
              'polygonStarts': values(mesh.polygons, 'loop_start', 1, 'i'),
              'polygonTotals': values(mesh.polygons, 'loop_total', 1, 'i'),
              'materialIndices': values(mesh.polygons, 'material_index', 1, 'i'),
              'faceSmooth': values(mesh.polygons, 'use_smooth', 1, 'b')}
    for layer in mesh.uv_layers:
        fields['uv:' + layer.name] = values(layer.data, 'uv', 2)
    for layer in mesh.color_attributes:
        fields['color:' + layer.name + ':' + layer.domain + ':' + layer.data_type] = values(layer.data, 'color', 4)
    for name in ['sharp_edge', 'sharp_face']:
        attribute = mesh.attributes.get(name)
        if attribute:
            fields['attribute:' + name] = values(attribute.data, 'value', 1, 'b')
    return {'fields': fields, 'materials': [material.name if material else None for material in mesh.materials],
            'attributes': sorted((a.name, a.domain, a.data_type) for a in mesh.attributes if a.name != 'custom_normal'),
            'activeUV': mesh.uv_layers.active.name if mesh.uv_layers.active else None,
            'renderUV': [layer.name for layer in mesh.uv_layers if layer.active_render],
            'activeColor': mesh.color_attributes.active_color.name if mesh.color_attributes.active_color else None}


def compare(expected, actual):
    if set(expected) != set(actual):
        raise RuntimeError('Static mesh population differs')
    rows = []
    for name, before in expected.items():
        after = actual[name]
        differences = []
        for key in ['materials', 'attributes', 'activeUV', 'renderUV', 'activeColor']:
            if before[key] != after[key]:
                differences.append(key)
        if set(before['fields']) != set(after['fields']):
            differences.append('fieldInventory')
        maxima = {}
        for key, a in before['fields'].items():
            b = after['fields'].get(key)
            if b is None or a.shape != b.shape:
                differences.append(key)
                continue
            maximum = float(np.max(np.abs(a.astype(np.float64) - b.astype(np.float64)))) if a.size else 0.
            maxima[key] = maximum
            if not np.array_equal(a, b):
                differences.append(key)
        rows.append({'object': name, 'byteExactFields': not differences,
                     'differences': differences, 'maximumComponentDifferences': maxima,
                     'fieldSha256': {key: hashlib.sha256(value.tobytes()).hexdigest()
                                     for key, value in before['fields'].items()}})
    return {'objects': rows, 'allFieldsByteExact': all(row['byteExactFields'] for row in rows),
            'maximumPositionComponentErrorMetres': max(row['maximumComponentDifferences'].get('positionsWorld', 0) for row in rows),
            'maximumUV0ComponentError': max(row['maximumComponentDifferences'].get('uv:UVMap', 0) for row in rows),
            'maximumWorldNormalComponentError': max(row['maximumComponentDifferences'].get('cornerNormalsWorld', 0) for row in rows)}


def evaluated_snapshots(scene):
    graph = bpy.context.evaluated_depsgraph_get()
    rows = {}
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.get('one_light_static'):
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        rows[obj.name] = mesh_snapshot(obj, mesh)
        evaluated.to_mesh_clear()
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['source', 'output', 'report']:
        parser.add_argument('--' + key, type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = Path(__file__).resolve().parents[2]
    if any(path.exists() for path in [args.output, args.report]) or not args.output.resolve().is_relative_to(root / 'art/build'):
        raise RuntimeError('New ignored prototype output/report required')
    source_sha = sha(args.source)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    scene = bpy.context.scene
    before_nonmesh = nonmesh_state(scene)
    image_paths_before = {image.name: image.filepath for image in bpy.data.images}
    unused_materials_before = [material.name for material in bpy.data.materials
                               if material.name not in before_nonmesh['materials']]
    before = evaluated_snapshots(scene)
    graph = bpy.context.evaluated_depsgraph_get()
    staged = []
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.get('one_light_static') or not obj.modifiers:
            continue
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        captured = before[obj.name]
        persistent = mesh_snapshot(obj, mesh)
        for key in ['positionsLocal', 'loopVertexIndices', 'polygonStarts', 'polygonTotals',
                    'materialIndices', 'faceSmooth']:
            if not np.array_equal(persistent['fields'][key], captured['fields'][key]):
                raise RuntimeError('Persistent evaluated mesh has different physical data: ' + obj.name + '/' + key)
        # new_from_object can request a second Bevel evaluation. Its physical
        # indexing is proven above; freeze the FIRST actual captured UV/color
        # streams explicitly instead of trusting that second evaluation's ULPs.
        for layer in mesh.uv_layers:
            layer.data.foreach_set('uv', captured['fields']['uv:' + layer.name])
        for layer in mesh.color_attributes:
            key = 'color:' + layer.name + ':' + layer.domain + ':' + layer.data_type
            layer.data.foreach_set('color', captured['fields'][key])
        previous = mesh.attributes.get('custom_normal')
        if previous:
            mesh.attributes.remove(previous)
        normal = mesh.attributes.new(name='custom_normal', type='FLOAT_VECTOR', domain='CORNER')
        normal.data.foreach_set('vector', captured['fields']['cornerNormalsLocal'].astype(np.float32).ravel())
        for key, value in obj.data.items():
            mesh[key] = value
        mesh.update()
        staged.append((obj, mesh, [modifier.type for modifier in obj.modifiers]))
    for obj, mesh, modifiers in staged:
        obj.modifiers.clear()
        obj.data = mesh
    modified_owners = [{'object': obj.name, 'removedModifierTypes': mods}
                       for obj, _, mods in staged]
    bpy.context.view_layer.update()
    after = evaluated_snapshots(scene)
    comparison = compare(before, after)
    if not comparison['allFieldsByteExact'] or nonmesh_state(scene) != before_nonmesh:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({'failedBeforeSave': True, 'comparison': comparison,
            'nonmeshStateExact': nonmesh_state(scene) == before_nonmesh}, indent=2) + '\n')
        raise RuntimeError('Freeze candidate differs from the actual capture; not saved')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()))
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()))
    reopened = compare(before, evaluated_snapshots(bpy.context.scene))
    nonmesh_exact = nonmesh_state(bpy.context.scene) == before_nonmesh
    passed = comparison['allFieldsByteExact'] and reopened['allFieldsByteExact'] and nonmesh_exact
    report = {'scope': __doc__, 'source': {'path': str(args.source), 'sha256': source_sha},
              'prototype': {'path': str(args.output), 'sha256': sha(args.output)},
              'modifiedOwners': modified_owners,
              'staticObjects': len(before), 'frozenOwners': len(staged), 'beforeSave': comparison,
              'afterSaveReopen': reopened, 'allNonmeshStateMaterialsImagesLightsAnchorsAndRegistryExact': nonmesh_exact,
              'nonmeshFieldDifferences': [key for key, value in before_nonmesh.items()
                                         if value != nonmesh_state(bpy.context.scene)[key]],
              'imageRelativePathRemaps': [{'image': image.name, 'before': image_paths_before[image.name],
                                          'after': image.filepath}
                                         for image in bpy.data.images
                                         if image.filepath != image_paths_before[image.name]],
              'unusedMaterialsOutsideSceneNotGuarded': unused_materials_before,
              'passed': passed, 'renderBakeEncoderGpuJobs': 0,
              'sourceModifierEvaluationCaptureIsNewNotHistoricalCertifiedDataset': True,
              'scriptSha256': sha(__file__)}
    if sha(args.source) != source_sha:
        raise RuntimeError('Original immutable source changed')
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print('SOURCE_FREEZE_PROTOTYPE', passed, len(staged), sha(args.output), sha(args.report), flush=True)
    if not passed:
        raise RuntimeError('Save/reopen freeze equality failed')


if __name__ == '__main__':
    main()
