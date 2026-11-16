"""Bake a source scene into three ambient irradiance atlases and a lamp-only atlas.

blender -b art/build/snow-roof.blend --python art/blender/bake_export.py -- \
  --out art/build/snow-roof --resolution 1024 --samples 96 --device METAL

The STATIC meshes must have material UVMap first and one_light_static=True.
Custom property region (court/hall/gate) chooses the atlas. Light bake_role is
ambient, fixture, or lamp. All sources/EXR masters stay outside the web payload.
"""
import argparse
from array import array
import json
from hashlib import sha256
import math
from pathlib import Path
import sys
import time
import subprocess
import os
import bpy

PRESETS = {
    'night': {'sourceLighting': True, 'fixtures': 1},
    'dusk': {'world': [.25, .31, .42], 'strength': .65, 'sun': [1, .62, .38], 'energy': .45, 'fixtures': .8},
    'day': {'world': [.64, .77, 1], 'strength': .75, 'sun': [1, .92, .8], 'energy': 2.2, 'fixtures': 1},
    'lamp': {'world': [0, 0, 0], 'strength': 0, 'sun': [1, 1, 1], 'energy': 0, 'fixtures': 0},
}

def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--resolution', type=int, default=1024)
    parser.add_argument('--samples', type=int, default=96)
    parser.add_argument('--hall-resolution', type=int)
    parser.add_argument('--court-resolution', type=int)
    parser.add_argument('--gate-resolution', type=int)
    parser.add_argument('--hidden-faces', type=Path, help='Source-hash-verified conservative UV exclusions; geometry stays in the scene.')
    parser.add_argument('--chart-cache', type=Path, help='Reuse only exact receiver/chart matches from this earlier preparation; never imports bake pixels.')
    parser.add_argument('--receiver-report', action='store_true', help='Write receiver/UV fingerprints for an existing prepared blend; no render, bake or export.')
    parser.add_argument('--prepared-preview-audit', type=Path, help='Source/generated-hash-bound native prepared-preview proof, included in the scene-wide bake identity.')
    parser.add_argument('--device', choices=['METAL', 'CPU'], default='METAL')
    parser.add_argument('--oidn-device', choices=['METAL', 'CPU'], default='METAL')
    parser.add_argument('--passes', default='night,dusk,day,lamp')
    parser.add_argument('--regions', help='Comma-separated bake subset for a real atlas timing pilot; export and UV audit still cover every region.')
    parser.add_argument('--skip-bake', action='store_true')
    parser.add_argument('--export-only', action='store_true')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--probe-denoise', action='store_true')
    parser.add_argument('--probe-cycles', action='store_true')
    parser.add_argument('--probe-ktx-quality', action='store_true')
    parser.add_argument('--verify-delivery', type=Path, help='CPU image-I/O audit of already-transcoded delivery maps; never invokes Cycles.')
    parser.add_argument('--reencode-existing', action='store_true', help='Regenerate delivery PNGs from existing denoised EXRs; no Cycles or OIDN work.')
    parser.add_argument('--log-gain', type=float, default=4096)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

def configure_cycles(scene, options):
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'AUTO'
    scene.cycles.samples = options.samples
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    if options.device == 'CPU' and not options.skip_bake and not options.export_only:
        raise RuntimeError('Current scope requires Cycles on Metal for every render/bake; CPU is not an allowed fallback.')
    # Texture bakes bypass render denoising; actual OIDN filtering runs explicitly after each atlas.
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 2
    scene.cycles.transparent_max_bounces = 4
    if options.device == 'METAL':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        enabled = []
        for device in prefs.devices:
            device.use = device.type == 'METAL'
            if device.use:
                enabled.append(device.name)
        if not enabled:
            raise RuntimeError('No Metal device; Cycles CPU fallback is forbidden in the current delivery scope.')
        scene.cycles.device = 'GPU'
        print('BAKE_DEVICE', enabled, flush=True)
    else:
        scene.cycles.device = 'CPU'
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 4
    scene.render.bake.margin_type = 'EXTEND'
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1


def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def receiver_profile(obj):
    """Exact evaluated receiver identity, independently from any baked illumination."""
    mesh = obj.data
    fingerprint = sha256()
    field_hashes = {}
    def record(name, data):
        fingerprint.update(data)
        field_hashes[name] = sha256(data).hexdigest()
    def values(collection, field, kind, count, name):
        buffer = array(kind, [0]) * count
        collection.foreach_get(field, buffer)
        record(name, buffer.tobytes())
    record('worldMatrix', array('f', [value for row in obj.matrix_world for value in row]).tobytes())
    values(mesh.vertices, 'co', 'f', len(mesh.vertices) * 3, 'positions')
    values(mesh.loops, 'vertex_index', 'i', len(mesh.loops), 'topology')
    values(mesh.polygons, 'material_index', 'i', len(mesh.polygons), 'materialIndices')
    values(mesh.corner_normals, 'vector', 'f', len(mesh.corner_normals) * 3, 'cornerNormals')
    values(mesh.uv_layers['UVMap'].data, 'uv', 'f', len(mesh.loops) * 2, 'UVMap')
    tint = mesh.color_attributes.get('SurfaceTint')
    if tint:
        values(tint.data, 'color', 'f', len(tint.data) * 4, 'SurfaceTint')
    excluded = mesh.attributes.get('one_light_uv_excluded')
    record('provenHiddenMask', bytes(int(value.value) for value in excluded.data) if excluded else b'none')
    record('materialSlots', json.dumps([material.name if material else None for material in mesh.materials]).encode())
    profile = {'receiverFingerprint': fingerprint.hexdigest(), 'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons), 'loops': len(mesh.loops), 'fields': list(field_hashes), 'fieldSha256': field_hashes}
    if mesh.uv_layers.get('Lightmap'):
        buffer = array('f', [0]) * (len(mesh.loops) * 2)
        mesh.uv_layers['Lightmap'].data.foreach_get('uv', buffer)
        profile['lightmapUVFingerprint'] = sha256(buffer.tobytes()).hexdigest()
    report = json.loads(obj.get('one_light_unwrap_report', '{}'))
    profile['unwrapSignature'] = report.get('unwrapSignature')
    profile['resolution'] = report.get('resolution')
    return profile


GENERATED_ATTRIBUTE = 'one_light_source_generated'
GENERATED_POLICY = 'implicit-procedural-generated-evaluated-undeformed-source-texspace-v2'


def preserve_generated_coordinates(objects):
    """Freeze implicit procedural Generated coordinates before object joins change texspace.

    Image textures are deliberately excluded: an unconnected Image Texture can
    use the active UV map. Original UVMap and SurfaceTint are never rewritten.
    """
    import numpy as np
    procedural = {'TEX_NOISE', 'TEX_VORONOI', 'TEX_MUSGRAVE', 'TEX_WAVE', 'TEX_GRADIENT', 'TEX_CHECKER', 'TEX_BRICK', 'TEX_MAGIC'}
    materials = {material for obj in objects for material in obj.data.materials if material and material.use_nodes}
    remaps = [(material, node) for material in materials for node in material.node_tree.nodes if node.type in procedural and node.inputs.get('Vector') and not node.inputs['Vector'].is_linked]
    needed = {material for material, _ in remaps}
    audit = {'policy': GENERATED_POLICY, 'attribute': GENERATED_ATTRIBUTE, 'space': 'Source local position normalized by source mesh texspace: (position-location)/(2*size)+.5; zero-size axes use.5.', 'objects': {}, 'remappedInputs': []}
    for obj in objects:
        if not any(material in needed for material in obj.data.materials):
            continue
        mesh = obj.data
        location = np.array(mesh.texspace_location, dtype=np.float64)
        size = np.array(mesh.texspace_size, dtype=np.float64)
        positions = np.empty((len(mesh.vertices), 3), dtype=np.float32)
        mesh.vertices.foreach_get('co', positions.ravel())
        coordinates = np.full_like(positions, .5)
        np.divide(positions - location, size * 2, out=coordinates, where=np.abs(size) > 1e-20)
        coordinates[:, np.abs(size) > 1e-20] += .5
        attribute = mesh.attributes.get(GENERATED_ATTRIBUTE) or mesh.attributes.new(name=GENERATED_ATTRIBUTE, type='FLOAT_VECTOR', domain='POINT')
        attribute.data.foreach_set('vector', coordinates.ravel())
        examples = sorted({0, len(positions) // 2, len(positions) - 1})
        audit['objects'][obj.name] = {'vertices': len(positions), 'texspaceLocation': location.tolist(), 'texspaceSize': size.tolist(), 'autoTexspace': mesh.use_auto_texspace, 'localBounds': [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()], 'attributeSha256': sha256(coordinates.tobytes()).hexdigest(), 'examples': [{'vertex': i, 'local': positions[i].tolist(), 'generated': coordinates[i].tolist()} for i in examples]}
    for material, node in remaps:
        attribute = material.node_tree.nodes.get('ONE_LIGHT_SOURCE_GENERATED') or material.node_tree.nodes.new('ShaderNodeAttribute')
        attribute.name = 'ONE_LIGHT_SOURCE_GENERATED'
        attribute.attribute_name = GENERATED_ATTRIBUTE
        material.node_tree.links.new(attribute.outputs['Vector'], node.inputs['Vector'])
        audit['remappedInputs'].append({'material': material.name, 'node': node.name, 'socket': 'Vector', 'source': 'implicit Generated'})
    bpy.context.view_layer.update()
    return audit


def prepare_regions(resolution=1024, hall_resolution=None, output_dir=None, hidden_faces=None, court_resolution=None, gate_resolution=None, chart_cache=None):
    exclusions = {}
    if hidden_faces:
        proof = json.loads(hidden_faces.read_text())
        if sha256(Path(bpy.data.filepath).read_bytes()).hexdigest() != proof['sourceSha256']:
            raise RuntimeError('Hidden-face proof does not match the loaded source blend; refusing stale exclusions.')
        for part in proof['parts']:
            exclusions[part['object']] = {index for component in part['safeComponents'] for low, high in component['polygonRanges'] for index in range(low, high + 1)}
        print('HIDDEN_UV_PROOF', proof['sourceSha256'], proof['summary'], flush=True)
    by_region = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.get('one_light_static', False):
            region = obj.get('lightmap_region', obj.get('region', 'court'))
            by_region.setdefault(region, []).append(obj)
    if not by_region:
        raise RuntimeError('Source contains no one_light_static meshes.')
    generated_audit = preserve_generated_coordinates([obj for objects in by_region.values() for obj in objects])
    # Evaluate construction modifiers once. Repeated modifier_apply operators rebuild the
    # entire 1000-object dependency graph for every bevel; a single graph avoids that quadratic cost.
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = []
    for objects in by_region.values():
        for obj in objects:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
            if obj.name in generated_audit['objects']:
                import numpy as np
                attribute = mesh.attributes.get(GENERATED_ATTRIBUTE)
                if not attribute or len(attribute.data) != len(mesh.vertices):
                    raise RuntimeError('Modifier evaluation lost source Generated coordinates: ' + obj.name)
                coordinates = np.empty((len(mesh.vertices), 3), dtype=np.float32)
                attribute.data.foreach_get('vector', coordinates.ravel())
                if not np.all(np.isfinite(coordinates)):
                    raise RuntimeError('Nonfinite Generated coordinates after evaluation: ' + obj.name)
                record = generated_audit['objects'][obj.name]
                record['evaluatedVertices'] = len(mesh.vertices)
                record['modifierTypes'] = [modifier.type for modifier in obj.modifiers]
                if any(modifier.type not in {'BEVEL', 'WEIGHTED_NORMAL', 'TRIANGULATE'} for modifier in obj.modifiers):
                    raise RuntimeError('Generated-coordinate transfer needs a native equivalence proof for this modifier: ' + obj.name)
                evaluated_positions = np.empty((len(mesh.vertices), 3), dtype=np.float32)
                mesh.vertices.foreach_get('undeformed_co', evaluated_positions.ravel())
                location, size = np.asarray(record['texspaceLocation']), np.asarray(record['texspaceSize'])
                affine = np.full_like(evaluated_positions, .5)
                np.divide(evaluated_positions - location, size * 2, out=affine, where=np.abs(size) > 1e-20)
                affine[:, np.abs(size) > 1e-20] += .5
                record['interpolatedPointMaxAbsError'] = float(np.max(np.abs(coordinates - affine)))
                # Generated uses evaluated undeformed_co, not a generic POINT
                # attribute's bevel interpolation. A Metal emission-bake proof
                # distinguishes these paths down to float rounding.
                attribute.data.foreach_set('vector', affine.ravel())
                coordinates = affine
                record['evaluatedAttributeSha256'] = sha256(coordinates.tobytes()).hexdigest()
                record['evaluationPolicy'] = 'Evaluated MeshVertex.undeformed_co normalized by ORIGINAL source texspace; frozen before join.'
                if not obj.modifiers and record['evaluatedAttributeSha256'] != record['attributeSha256']:
                    raise RuntimeError('Unmodified source Generated coordinates changed: ' + obj.name)
            # Joined meshes share one active COLOR_0 layer. Untinted source pieces
            # need white, rather than Blender's zero-initialized missing attribute.
            tint = mesh.color_attributes.get('SurfaceTint')
            if tint is None:
                tint = mesh.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
                tint.data.foreach_set('color', array('f', [1.0]) * (len(tint.data) * 4))
            mesh.color_attributes.active_color = tint
            hidden = exclusions.get(obj.name, set())
            if hidden:
                if obj.modifiers or len(mesh.polygons) != len(obj.data.polygons):
                    raise RuntimeError('Hidden-face proof requires unchanged polygon correspondence: ' + obj.name)
                attribute = mesh.attributes.new(name='one_light_uv_excluded', type='BOOLEAN', domain='FACE')
                for index in hidden:
                    attribute.data[index].value = True
            evaluated.append((obj, mesh))
    for obj, mesh in evaluated:
        obj.modifiers.clear()
        obj.data = mesh
    bpy.context.scene['one_light_generated_policy'] = GENERATED_POLICY
    regions = {}
    for region, objects in by_region.items():
        print('REGION_UNWRAP', region, len(objects), flush=True)
        select_only(objects)
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = 'SnowRoof_' + region
        obj['one_light_static'] = True
        obj['lightmap_region'] = region
        # xatlas may put the two triangles of a quad into different charts. Give
        # every output triangle independent loops before UV transfer; source UV0,
        # face attributes, tint and evaluated normals are preserved by the modifier.
        modifier = obj.modifiers.new(name='Lightmap topology triangulation', type='TRIANGULATE')
        if hasattr(modifier, 'keep_custom_normals'):
            modifier.keep_custom_normals = True
        graph = bpy.context.evaluated_depsgraph_get()
        triangulated = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
        obj.modifiers.clear()
        obj.data = triangulated
        generated = obj.data.attributes.get(GENERATED_ATTRIBUTE)
        if generated:
            coordinates = array('f', [0]) * (len(generated.data) * 3)
            generated.data.foreach_get('vector', coordinates)
            generated_audit.setdefault('receivers', {})[region] = {'attribute': GENERATED_ATTRIBUTE, 'domain': generated.domain, 'dataType': generated.data_type, 'vertices': len(generated.data), 'sha256': sha256(coordinates.tobytes()).hexdigest()}
        if len(obj.data.uv_layers) == 0:
            raise RuntimeError('Source region lacks UVMap: ' + region)
        obj.data.uv_layers[0].name = 'UVMap'
        while len(obj.data.uv_layers) > 1:
            obj.data.uv_layers.remove(obj.data.uv_layers[-1])
        lightmap = obj.data.uv_layers.new(name='Lightmap')
        obj.data.uv_layers.active = lightmap
        target_resolution = {'hall': hall_resolution, 'court': court_resolution, 'gate': gate_resolution}.get(region) or resolution
        # xatlas sees positions and topology only; source material UVs and shading seams are not constraints.
        # It creates connected curved charts, rather than one sliver per post-bevel normal cluster.
        obj.data.calc_loop_triangles()
        excluded = obj.data.attributes.get('one_light_uv_excluded')
        triangles = [triangle for triangle in obj.data.loop_triangles if not excluded or not excluded.data[triangle.polygon_index].value]
        # (0,0) is outside chart cores and their filtered padding. Proven permanently
        # enclosed faces retain full geometry, UV0 and shadows, but allocate no UV2 area.
        if excluded:
            for polygon in obj.data.polygons:
                if excluded.data[polygon.index].value:
                    for loop in polygon.loop_indices:
                        lightmap.data[loop].uv = (0, 0)
        positions = [component for vertex in obj.data.vertices for component in (obj.matrix_world @ vertex.co)]
        indices = [index for triangle in triangles for index in triangle.vertices]
        input_path = output_dir / f'{region}-unwrap-input.json'
        output_path = output_dir / f'{region}-unwrap-output.json'
        input_path.write_text(json.dumps({'positions': positions, 'indices': indices}))
        project_root = Path(__file__).resolve().parents[2]
        tools = os.environ.get('ONE_LIGHT_GLTF_TOOLS', '/tmp/one-light-gltf-tools')
        command = ['node', str(project_root / 'scripts/pack-blender-assets.mjs'), '--unwrap', str(input_path), str(output_path), '--resolution', str(target_resolution), '--tools', tools]
        before = receiver_profile(obj)
        cache_profile = chart_cache / f'{region}-receiver.json' if chart_cache else None
        if cache_profile and cache_profile.exists():
            previous = json.loads(cache_profile.read_text())
            if previous['receiverFingerprint'] == before['receiverFingerprint'] and previous.get('resolution') == target_resolution:
                command.extend(['--unwrap-cache', str(chart_cache)])
                print('EXACT_RECEIVER_CHART_CACHE', region, before['receiverFingerprint'], flush=True)
            else:
                print('RECEIVER_CHANGED_REPACK', region, flush=True)
        subprocess.run(command, check=True)
        unwrapped = json.loads(output_path.read_text())
        references = unwrapped['vertices']
        chart_attribute = obj.data.attributes.new(name='one_light_uv_chart', type='INT', domain='FACE')
        pending = {}
        for triangle in triangles:
            pending.setdefault(tuple(sorted(triangle.vertices)), []).append((tuple(triangle.vertices), tuple(triangle.loops), triangle.polygon_index))
        for start in range(0, len(unwrapped['indices']), 3):
            corners = [references[index] for index in unwrapped['indices'][start:start + 3]]
            key = tuple(sorted(corner[0] for corner in corners))
            if not pending.get(key):
                raise RuntimeError('xatlas triangle correspondence lost: ' + region)
            original, loops, polygon_index = pending[key].pop()
            chart_indices = {corner[3] for corner in corners}
            if len(chart_indices) != 1:
                raise RuntimeError('xatlas triangle crosses chart indices: ' + region)
            chart_attribute.data[polygon_index].value = next(iter(chart_indices)) + 1
            for vertex, u, v, chart_index in corners:
                lightmap.data[loops[original.index(vertex)]].uv = (u, v)
        if any(pending.values()):
            raise RuntimeError('xatlas omitted triangles: ' + region)
        obj['one_light_unwrap_report'] = json.dumps(unwrapped['report'])
        profile = receiver_profile(obj)
        if cache_profile and cache_profile.exists() and previous['receiverFingerprint'] == profile['receiverFingerprint'] and previous.get('resolution') == target_resolution and previous.get('lightmapUVFingerprint') != profile['lightmapUVFingerprint']:
            raise RuntimeError('Exact receiver reused different chart UVs: ' + region)
        (output_dir / f'{region}-receiver.json').write_text(json.dumps(profile, indent=2) + '\n')
        obj.data.uv_layers[0].active_render = True
        regions[region] = obj
        print('REGION_READY', region, len(obj.data.polygons), len(obj.data.uv_layers), flush=True)
    (output_dir / 'generated-coordinate-audit.json').write_text(json.dumps(generated_audit, indent=2) + '\n')
    bpy.context.scene['one_light_generated_audit_sha256'] = sha256((output_dir / 'generated-coordinate-audit.json').read_bytes()).hexdigest()
    return regions


def snapshot_lighting(scene):
    lights = [(obj, obj.data.energy, tuple(obj.data.color)) for obj in scene.objects if obj.type == 'LIGHT']
    emission = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            socket = node.inputs.get('Emission Strength') if node.type == 'BSDF_PRINCIPLED' else node.inputs.get('Strength') if node.type == 'EMISSION' else None
            if socket and not socket.is_linked:
                emission.append((socket, socket.default_value))
    # Keep the accepted authored night world intact while other looks use separate worlds.
    return lights, emission, scene.world.copy() if scene.world else None


def lighting_metadata(snapshot):
    lights, emissions, world = snapshot
    world_info = None
    if world:
        world_info = {'name': world.name, 'colour': list(world.color), 'backgrounds': [], 'environmentTextures': []}
        if world.use_nodes:
            for node in world.node_tree.nodes:
                if node.type == 'BACKGROUND':
                    world_info['backgrounds'].append({'colour': list(node.inputs['Color'].default_value), 'strength': node.inputs['Strength'].default_value, 'linkedColour': node.inputs['Color'].is_linked})
                elif node.type == 'TEX_ENVIRONMENT' and node.image:
                    world_info['environmentTextures'].append(node.image.filepath)
    return {'world': world_info, 'lights': [{'name': obj.name, 'role': obj.get('bake_role', 'fixture'), 'type': obj.data.type, 'energy': energy, 'linearColour': list(colour), 'positionBlender': list(obj.matrix_world.translation), 'rotationBlender': list(obj.rotation_euler), 'includedInNight': obj.get('bake_role') != 'lamp'} for obj, energy, colour in lights], 'sourceEmissionStrengths': [strength for _, strength in emissions], 'meaning': 'Authored accepted source lighting, restored exactly for night except visitor lamp omitted. Positions/rotations use Blender coordinates; source socket colours are linear.'}


def source_binding(scene, prepared):
    """A prepared blend must retain its original authored source identity."""
    if prepared:
        raw = scene.get('one_light_source_binding')
        if not raw:
            raise RuntimeError('Legacy prepared blend lacks an authored source binding. Regenerate preparation from source; exact chart caches may still be reused.')
        binding = json.loads(raw)
        source = Path(binding['path'])
        if not source.exists() or sha256(source.read_bytes()).hexdigest() != binding['sha256']:
            raise RuntimeError('Authored source changed or is missing; regenerate preparation and all bake pixels.')
        return binding
    source = Path(bpy.data.filepath)
    if not source.is_file():
        raise RuntimeError('Load a saved authored source blend before preparing lightmaps.')
    binding = {'path': str(source.resolve()), 'sha256': sha256(source.read_bytes()).hexdigest()}
    scene['one_light_source_binding'] = json.dumps(binding)
    return binding


def transport_fingerprint(scene, regions, snapshot, binding, receiver_profiles):
    """Conservative scene-wide cache key; regional UV identity never reuses illumination."""
    images = {}
    def image_identity(image):
        key = image.name
        if key in images:
            return key
        path = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
        packed = image.packed_file
        images[key] = {'source': image.source, 'size': list(image.size), 'colourSpace': image.colorspace_settings.name,
                       'sha256': sha256(bytes(packed.data)).hexdigest() if packed else sha256(path.read_bytes()).hexdigest() if path and path.is_file() else None}
        return key
    def clean(value):
        if isinstance(value, (bool, str, int)) or value is None:
            return value
        if isinstance(value, float):
            return value if math.isfinite(value) else str(value)
        try:
            return [clean(item) for item in value]
        except TypeError:
            return str(value)
    def graph(owner):
        if not owner or not owner.use_nodes:
            return None
        nodes = []
        for node in sorted(owner.node_tree.nodes, key=lambda value: value.name):
            if node.name == 'ONE_LIGHT_BAKE_TARGET':
                continue
            inputs = {}
            for socket in node.inputs:
                if hasattr(socket, 'default_value'):
                    inputs[socket.identifier] = clean(socket.default_value)
            properties = {name: clean(getattr(node, name)) for name in ['operation', 'blend_type', 'vector_type', 'uv_map', 'attribute_name', 'layer_name', 'space', 'distribution', 'interpolation', 'projection', 'extension', 'sky_type', 'sun_elevation', 'sun_rotation', 'altitude', 'air_density', 'dust_density', 'ozone_density'] if hasattr(node, name)}
            if getattr(node, 'image', None):
                properties['image'] = image_identity(node.image)
            nodes.append({'name': node.name, 'type': node.bl_idname, 'inputs': inputs, 'properties': properties})
        links = sorted((link.from_node.name, link.from_socket.identifier, link.to_node.name, link.to_socket.identifier) for link in owner.node_tree.links if link.from_node.name != 'ONE_LIGHT_BAKE_TARGET' and link.to_node.name != 'ONE_LIGHT_BAKE_TARGET')
        return {'nodes': nodes, 'links': links}
    materials = {}
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        for material in obj.data.materials:
            if material and material.name not in materials:
                materials[material.name] = {'graph': graph(material), 'colour': list(material.diffuse_color), 'backfaceCulling': material.use_backface_culling, 'alphaThreshold': getattr(material, 'alpha_threshold', None), 'surfaceMethod': getattr(material, 'surface_render_method', None)}
    lights = []
    for obj, energy, colour in snapshot[0]:
        lights.append({'name': obj.name, 'role': obj.get('bake_role'), 'type': obj.data.type, 'energy': energy, 'colour': list(colour), 'worldMatrix': [list(row) for row in obj.matrix_world], 'shape': {name: clean(getattr(obj.data, name)) for name in ['shadow_soft_size', 'angle', 'shape', 'size', 'size_y', 'spot_size', 'spot_blend', 'use_shadow'] if hasattr(obj.data, name)}})
    visibility = [{'name': obj.name, 'hidden': obj.hide_render, 'rays': {name: getattr(obj, name) for name in ['visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_shadow'] if hasattr(obj, name)}} for obj in scene.objects if obj.type == 'MESH']
    auxiliary = {obj.name: {'positions': [[*vertex.co] for vertex in obj.data.vertices], 'polygons': [list(polygon.vertices) for polygon in obj.data.polygons], 'worldMatrix': [list(row) for row in obj.matrix_world]} for obj in scene.objects if obj.type == 'MESH' and obj not in regions.values()}
    generated = {}
    for region, obj in sorted(regions.items()):
        attribute = obj.data.attributes.get(GENERATED_ATTRIBUTE)
        if not attribute:
            raise RuntimeError('Prepared receiver lacks the preserved Generated attribute: ' + region)
        coordinates = array('f', [0]) * (len(attribute.data) * 3)
        attribute.data.foreach_get('vector', coordinates)
        generated[region] = {'attribute': GENERATED_ATTRIBUTE, 'domain': attribute.domain, 'dataType': attribute.data_type, 'vertices': len(attribute.data), 'sha256': sha256(coordinates.tobytes()).hexdigest()}
    preview_audit = json.loads(scene.get('one_light_prepared_preview_audit', 'null'))
    if preview_audit and (preview_audit['sourceBlendSha256'] != binding['sha256'] or preview_audit['generatedReceivers'] != generated or preview_audit['mappingPolicy'] != scene.get('one_light_generated_policy')):
        raise RuntimeError('Prepared-preview mapping evidence does not match current source/Generated bytes.')
    payload = {'policy': 'scene-wide-source-geometry-material-lighting-generated-v3', 'sourceBlendSha256': binding['sha256'], 'receivers': receiver_profiles, 'generatedCoordinates': {'policy': scene.get('one_light_generated_policy'), 'receivers': generated, 'preparationAuditSha256': scene.get('one_light_generated_audit_sha256')}, 'preparedPreviewAudit': preview_audit, 'auxiliaryOccluders': auxiliary, 'visibility': visibility, 'world': graph(snapshot[2]), 'worldColour': list(snapshot[2].color) if snapshot[2] else None, 'lights': lights, 'materials': materials, 'images': images, 'presets': PRESETS,
               'cycles': {name: getattr(scene.cycles, name) for name in ['max_bounces', 'diffuse_bounces', 'glossy_bounces', 'transmission_bounces', 'transparent_max_bounces', 'volume_bounces', 'sample_clamp_direct', 'sample_clamp_indirect']}, 'bake': {'passes': ['DIRECT', 'INDIRECT'], 'colour': False, 'oidn': 'Metal RT HDR HIGH per exact chart', 'gutterPixels': 8}}
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    return sha256(encoded.encode()).hexdigest(), payload


def configure_light_pass(scene, name, snapshot):
    preset = PRESETS[name]
    if name == 'night':
        scene.world = snapshot[2]
    else:
        world = bpy.data.worlds.get('ONE_LIGHT_PASS_WORLD') or bpy.data.worlds.new('ONE_LIGHT_PASS_WORLD')
        scene.world = world
        world.use_nodes = True
        nodes = world.node_tree.nodes
        nodes.clear()
        background = nodes.new('ShaderNodeBackground')
        background.inputs['Color'].default_value = (*preset['world'], 1)
        background.inputs['Strength'].default_value = preset['strength']
        output = nodes.new('ShaderNodeOutputWorld')
        world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])
    for obj, energy, color in snapshot[0]:
        role = obj.get('bake_role', obj.data.get('bake_role', 'fixture'))
        obj.data.color = color
        if role == 'lamp':
            obj.data.energy = energy if name == 'lamp' else 0
        elif name == 'night':
            obj.data.energy = energy
        elif role == 'ambient':
            obj.data.energy = preset['energy'] if obj.data.type == 'SUN' else energy * preset['strength']
            obj.data.color = preset['sun']
        else:
            obj.data.energy = energy * preset['fixtures']
    for socket, strength in snapshot[1]:
        socket.default_value = strength * preset['fixtures']


def set_bake_image(obj, image):
    for material in obj.data.materials:
        if material is None:
            continue
        material.use_nodes = True
        nodes = material.node_tree.nodes
        node = nodes.get('ONE_LIGHT_BAKE_TARGET') or nodes.new('ShaderNodeTexImage')
        node.name = 'ONE_LIGHT_BAKE_TARGET'
        node.image = image
        node.select = True
        nodes.active = node


def save_linear(scene, image, stem, valid_mask=None, gain=4096.0, write_master=True):
    """Keep linear EXR masters; logarithmically encode delivery to protect dark values in 8-bit UASTC."""
    import numpy as np
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '32'
    scene.render.image_settings.exr_codec = 'ZIP'
    if write_master:
        image.save_render(str(stem.with_suffix('.exr')), scene=scene)
    pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    original = pixels.copy()
    rgba = pixels.reshape(image.size[1], image.size[0], 4)
    rgb = np.nan_to_num(np.maximum(rgba[:, :, :3], 0), posinf=0)
    maximum = float(rgb.max(initial=0))
    scale = 2 ** math.ceil(math.log2(maximum)) if maximum > 0 else 1
    log_range = math.log2(1 + scale * gain)
    encoded = np.log2(1 + rgb * gain) / log_range
    rgba[:, :, :3] = encoded
    rgba[:, :, 3] = 1
    image.pixels.foreach_set(pixels)
    image.update()
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 40
    image.save_render(str(stem.with_suffix('.png')), scene=scene)
    image.pixels.foreach_set(original)
    image.update()
    # Build only the supported mip levels in linear radiance, then encode each level.
    # toktx cannot generate a partial pyramid, so provide the three levels explicitly.
    png_mipmaps = [stem.name + '.png']
    smaller = rgb
    for level in [1, 2]:
        smaller = (smaller[0::2, 0::2] + smaller[1::2, 0::2] + smaller[0::2, 1::2] + smaller[1::2, 1::2]) * .25
        height, width = smaller.shape[:2]
        mip = bpy.data.images.new(stem.name + f'-mip{level}', width, height, float_buffer=True)
        mip.colorspace_settings.name = 'Non-Color'
        mip_pixels = np.ones((height, width, 4), dtype=np.float32)
        mip_pixels[:, :, :3] = np.log2(1 + smaller * gain) / log_range
        mip.pixels.foreach_set(mip_pixels.ravel())
        filename = stem.name + f'-mip{level}.png'
        mip.save_render(str(stem.parent / filename), scene=scene)
        bpy.data.images.remove(mip)
        png_mipmaps.append(filename)
    values = rgb[valid_mask] if valid_mask is not None else rgb.reshape(-1, 3)
    luminance = values @ np.array([.2126, .7152, .0722])
    percentiles = {f'p{p}': float(np.percentile(luminance, p)) for p in [0, 1, 10, 50, 90, 99, 100]}
    log_steps = {name: (2 ** (math.log2(1 + value * gain) + log_range / 255) - 1) / gain - value for name, value in percentiles.items()}
    return {'scale': scale, 'maximum': maximum, 'encoding': 'log2-hdr', 'logRange': log_range, 'logGain': gain, 'source': stem.name + '.exr', 'png': stem.name + '.png', 'pngMipmaps': png_mipmaps, 'mipLevels': 3, 'gutterPixels': 8, 'anisotropy': 1, 'maxLod': 2,
            'precision': {'surfaceTexels': int(len(luminance)), 'luminancePercentiles': percentiles, 'idealLinear8bitStep': scale / 255, 'idealLog8bitStepAtPercentile': log_steps, 'blackTexelFraction': float(np.mean(luminance <= 0)), 'note': 'Ideal scalar 8-bit precision only; UASTC block/RDO and device transcode errors need delivery-image inspection.'}}


def log_encoding_proof(out):
    """Numerical reconstruction probe over dark, middle and peak values; no scene or GPU work."""
    import numpy as np
    gain = 16.0
    reports = []
    for scale in [.25, 4, 64, 1024]:
        log_range = math.log2(1 + scale * gain)
        values = np.array([.0001, .001, .005, .01, .05, .2, 1, scale], dtype=np.float64)
        values = np.minimum(values, scale)
        encoded = np.log2(1 + values * gain) / log_range
        quantized = np.round(encoded * 255) / 255
        decoded = (2 ** (quantized * log_range) - 1) / gain
        linear = np.round(values / scale * 255) / 255 * scale
        reports.append({'scale': scale, 'logRange': log_range, 'logGain': gain, 'values': values.tolist(), 'logDecoded8bit': decoded.tolist(), 'logAbsoluteError': np.abs(decoded - values).tolist(), 'linearDecoded8bit': linear.tolist(), 'linearAbsoluteError': np.abs(linear - values).tolist()})
    result = {'encoding': 'log2-hdr', 'decode': '(exp2(sample * logRange) - 1) / logGain', 'cases': reports, 'scope': 'Ideal 8-bit scalar quantization; excludes UASTC block/transcode error.', 'interpolationTradeoff': 'Filtering encoded log values reconstructs a geometric-like brightness mixture and can darken mixed bright/dark edges versus filtering linear radiance. Decode before blending ambient looks or lamp contributions. Atlas mips are bounded and actual delivery captures still need review.'}
    (out / 'hdr-encoding-proof.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def ktx_quality_probe(out):
    """Measure actual UASTC RGBA8 reconstruction after the official KTX transcoder."""
    import struct
    import numpy as np
    truth = np.load(out / 'hdr-truth.npy')[::-1]
    reports = []
    for gain in [16, 256]:
        data = (out / f'hdr-gain{gain}-decoded.ktx2').read_bytes()
        vk_format, width, height, levels = (struct.unpack_from('<I', data, offset)[0] for offset in [12, 20, 24, 40])
        if vk_format != 37 or (width, height) != (128, 128) or levels != 3:
            raise RuntimeError('KTX proof requires RGBA8 UNORM128px and all three explicit mip levels.')
        offset, length, _ = struct.unpack_from('<QQQ', data, 80)
        encoded = np.frombuffer(data[offset:offset + length], dtype=np.uint8).reshape(height, width, 4)[:, :, :3] / 255
        log_range = math.log2(1 + 64 * gain)
        decoded = (2 ** (encoded * log_range) - 1) / gain
        bands = {}
        for name, low, high in [('dark', 0, .01), ('middle', .01, 1), ('peak', 1, 65)]:
            valid = (truth >= low) & (truth < high)
            error = np.abs(decoded[valid] - truth[valid])
            bands[name] = {'samples': int(valid.sum()), 'meanAbsoluteError': float(error.mean()), 'maximumAbsoluteError': float(error.max()), 'meanRelativeError': float(np.mean(error / np.maximum(truth[valid], 1e-8))), 'zeroFraction': float(np.mean(decoded[valid] == 0))}
        reports.append({'logGain': gain, 'logRange': log_range, 'bands': bands, 'mipLevels': levels})
    result = {'cases': reports, 'scope': 'Actual UASTC quality2/RDO1/Zstd18 then official RGBA8 transcode, synthetic HDR gradient plus64peak. Device BC7/ASTC/ETC transcode can add further block error; runtime review remains required.'}
    (out / 'ktx-quality-proof.json').write_text(json.dumps(result, indent=2) + '\n')
    print('KTX_QUALITY_PROOF', json.dumps(result), flush=True)


def verify_delivery_maps(source, delivery):
    """Compare actual compressed/transcoded lightmaps against denoised linear EXR masters."""
    import numpy as np
    import struct
    manifest = json.loads((delivery / 'manifest.json').read_text())
    reports = {}
    for region, passes in manifest['lightmaps'].items():
        with np.load(source / f'{region}-coverage.npz', allow_pickle=False) as coverage:
            labels = coverage['labels']
        for name, entry in passes.items():
            path = source / f'{region}-{name}-decoded.ktx2'
            if not path.exists():
                continue
            data = path.read_bytes()
            vk_format, width, height, levels = (struct.unpack_from('<I', data, offset)[0] for offset in [12, 20, 24, 40])
            if vk_format != 37 or labels.shape != (height, width) or levels != entry['mipLevels']:
                raise RuntimeError('Delivery image audit requires matching RGBA8 UNORM transcode dimensions.')
            image = bpy.data.images.load(str(source / entry['source']), check_existing=False)
            image.colorspace_settings.name = 'Non-Color'
            pixels = np.empty(width * height * 4, dtype=np.float32)
            image.pixels.foreach_get(pixels)
            truth = pixels.reshape(height, width, 4)[:, :, :3]
            mip_reports = []
            mip_labels = labels.copy()
            for level in range(levels):
                h, w = truth.shape[:2]
                offset, length, _ = struct.unpack_from('<QQQ', data, 80 + level * 24)
                encoded = np.frombuffer(data[offset:offset + length], dtype=np.uint8).reshape(h, w, 4)[::-1, :, :3].astype(np.float32) / 255
                decoded = (np.exp2(encoded * entry['logRange']) - 1) / entry['logGain']
                bands = {}
                luminance = truth @ np.array([.2126, .7152, .0722])
                decoded_luminance = decoded @ np.array([.2126, .7152, .0722])
                for band, low, high in [('dark', 0, .01), ('middle', .01, 1), ('peak', 1, float('inf'))]:
                    mask = (mip_labels > 0) & (luminance >= low) & (luminance < high)
                    count = int(mask.sum())
                    if not count:
                        continue
                    error = np.abs(decoded_luminance[mask] - luminance[mask])
                    nonzero = luminance[mask] > .0001
                    bands[band] = {'texels': count, 'meanAbsoluteLuminanceError': float(error.mean()), 'p95AbsoluteLuminanceError': float(np.percentile(error, 95)), 'meanAbsoluteRGBError': float(np.mean(np.abs(decoded[mask] - truth[mask]))), 'meanRelativeLuminanceErrorAbove0001': float(np.mean(error[nonzero] / luminance[mask][nonzero])) if np.any(nonzero) else None, 'nonzeroTexelsQuantizedToBlack': int(np.count_nonzero(nonzero & (decoded_luminance[mask] == 0)))}
                mip_reports.append({'level': level, 'size': [w, h], 'representedTexels': int(np.count_nonzero(mip_labels)), 'bands': bands})
                if level + 1 < levels:
                    truth = truth.reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
                    children = mip_labels.reshape(h // 2, 2, w // 2, 2).transpose(0, 2, 1, 3).reshape(h // 2, w // 2, 4)
                    mip_labels = np.where(np.all(children == children[:, :, :1], axis=2), children[:, :, 0], 0)
            reports[f'{region}/{name}'] = {'bands': mip_reports[0]['bands'], 'mips': mip_reports, 'encoding': entry['encoding'], 'logGain': entry['logGain'], 'logRange': entry['logRange'], 'codec': entry.get('codec', 'unspecified'), 'gutterPixels': entry['gutterPixels'], 'anisotropy': entry['anisotropy']}
            bpy.data.images.remove(image)
            print('DELIVERY_IMAGE_AUDIT', region, name, json.dumps(reports[f'{region}/{name}']), flush=True)
    (source / 'delivery-image-audit.json').write_text(json.dumps({'maps': reports, 'scope': 'Actual compressed maps plus official RGBA8 transcode compared with denoised EXR. Base checks all chart cores; coarser mips check only texels whose full child footprint remains one chart. Reference mip averaging happens in linear radiance. Device ASTC/BC7/ETC output and screen interpolation still require runtime capture review.'}, indent=2) + '\n')


def reencode_existing(options):
    """Keep full-range EXR masters byte-for-byte and rebuild only delivery encoding."""
    import numpy as np
    source = options.out
    path = source / 'manifest.json'
    manifest = json.loads(path.read_text())
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    for region, passes in manifest['lightmaps'].items():
        with np.load(source / f'{region}-coverage.npz', allow_pickle=False) as coverage:
            valid = coverage['labels'] > 0
        for name, entry in passes.items():
            master = source / entry['source']
            before = sha256(master.read_bytes()).hexdigest()
            image = bpy.data.images.load(str(master), check_existing=False)
            image.colorspace_settings.name = 'Non-Color'
            encoded = save_linear(scene, image, source / f'{region}-{name}', valid, gain=options.log_gain, write_master=False)
            bpy.data.images.remove(image)
            if sha256(master.read_bytes()).hexdigest() != before:
                raise RuntimeError('Re-encoding changed a linear EXR master.')
            entry.update(encoded)
            entry['masterSha256'] = before
            entry.pop('bytes', None)
            print('DELIVERY_REENCODED', region, name, options.log_gain, flush=True)
    manifest['bake']['deliveryEncoding'] = {'encoding': 'log2-hdr', 'logGain': options.log_gain, 'note': 'Actual compressed-map comparison selected this gain to preserve deep night detail; EXR masters remain linear and unchanged.'}
    path.write_text(json.dumps(manifest, indent=2) + '\n')


def read_png16_rgb(path):
    """Read integer PNG samples without a display transform or 8-bit decoder conversion."""
    import struct
    import zlib
    import numpy as np
    content = path.read_bytes()
    offset, compressed = 8, bytearray()
    while offset < len(content):
        length = struct.unpack('>I', content[offset:offset + 4])[0]
        kind, data = content[offset + 4:offset + 8], content[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            width, height, depth, colour, _, _, interlace = struct.unpack('>IIBBBBB', data)
            if depth != 16 or colour not in (2, 6) or interlace:
                raise RuntimeError('Proof expects an uninterlaced 16-bit RGB/RGBA PNG.')
            channels = 3 if colour == 2 else 4
        if kind == b'IDAT':
            compressed.extend(data)
        offset += length + 12
    packed = zlib.decompress(compressed)
    stride, bpp = width * channels * 2, channels * 2
    previous, rows = bytearray(stride), []
    for row in range(height):
        begin = row * (stride + 1)
        mode = packed[begin]
        values = bytearray(packed[begin + 1:begin + 1 + stride])
        for i in range(stride):
            a, b, c = (values[i - bpp] if i >= bpp else 0), previous[i], (previous[i - bpp] if i >= bpp else 0)
            if mode == 1: prediction = a
            elif mode == 2: prediction = b
            elif mode == 3: prediction = (a + b) // 2
            elif mode == 4:
                p = a + b - c
                distances = (abs(p - a), abs(p - b), abs(p - c))
                prediction = (a, b, c)[distances.index(min(distances))]
            elif mode == 0: prediction = 0
            else: raise RuntimeError('Unknown PNG filter.')
            values[i] = (values[i] + prediction) & 255
        rows.append(bytes(values))
        previous = values
    return np.frombuffer(b''.join(rows), dtype='>u2').reshape(height, width, channels)[:, :, :3].astype(np.float64) / 65535


class LightmapDenoiser:
    """Explicit OIDN backend; Metal uses OIDN-owned device-accessible buffers."""
    def __init__(self, backend='METAL'):
        import ctypes as ct
        self.ct = ct
        library_dir = Path(bpy.app.binary_path).parent.parent / 'Resources/lib'
        # Preload absolute paths: the stand-alone macOS Python executable has no Blender rpaths.
        self.backend = backend
        self.dependencies = [ct.CDLL(str(library_dir / name), mode=ct.RTLD_GLOBAL) for name in ['libtbb.dylib', 'libOpenImageDenoise_core.dylib', f'libOpenImageDenoise_device_{backend.lower()}.dylib']]
        self.lib = ct.CDLL(str(library_dir / 'libOpenImageDenoise.dylib'))
        signatures = {
            'oidnNewDevice': ([ct.c_int], ct.c_void_p),
            'oidnCommitDevice': ([ct.c_void_p], None),
            'oidnGetDeviceError': ([ct.c_void_p, ct.POINTER(ct.c_char_p)], ct.c_int),
            'oidnNewFilter': ([ct.c_void_p, ct.c_char_p], ct.c_void_p),
            'oidnSetSharedFilterImage': ([ct.c_void_p, ct.c_char_p, ct.c_void_p, ct.c_int, ct.c_size_t, ct.c_size_t, ct.c_size_t, ct.c_size_t, ct.c_size_t], None),
            'oidnSetFilterInt': ([ct.c_void_p, ct.c_char_p, ct.c_int], None),
            'oidnSetFilterBool': ([ct.c_void_p, ct.c_char_p, ct.c_bool], None),
            'oidnCommitFilter': ([ct.c_void_p], None),
            'oidnExecuteFilter': ([ct.c_void_p], None),
            'oidnReleaseFilter': ([ct.c_void_p], None),
            'oidnReleaseDevice': ([ct.c_void_p], None),
            'oidnGetDeviceInt': ([ct.c_void_p, ct.c_char_p], ct.c_int),
            'oidnNewBuffer': ([ct.c_void_p, ct.c_size_t], ct.c_void_p),
            'oidnGetBufferData': ([ct.c_void_p], ct.c_void_p),
            'oidnReleaseBuffer': ([ct.c_void_p], None),
            'oidnSetFilterImage': ([ct.c_void_p, ct.c_char_p, ct.c_void_p, ct.c_int, ct.c_size_t, ct.c_size_t, ct.c_size_t, ct.c_size_t, ct.c_size_t], None),
        }
        for name, (arguments, result) in signatures.items():
            function = getattr(self.lib, name)
            function.argtypes, function.restype = arguments, result
        self.device = self.lib.oidnNewDevice(5 if backend == 'METAL' else 1)
        self.lib.oidnCommitDevice(self.device)
        self.check()
        if self.lib.oidnGetDeviceInt(self.device, b'type') != (5 if backend == 'METAL' else 1):
            raise RuntimeError('OIDN backend differs from the explicitly requested device.')
        self.filters = {}
        self.buffers = {}

    def check(self):
        message = self.ct.c_char_p()
        error = self.lib.oidnGetDeviceError(self.device, self.ct.byref(message))
        if error:
            raise RuntimeError('OIDN: ' + (message.value.decode() if message.value else str(error)))

    def filter(self, rgb):
        import numpy as np
        data = np.ascontiguousarray(rgb, dtype=np.float32)
        height, width = data.shape[:2]
        output = np.empty_like(data)
        key = (width, height)
        if key not in self.filters:
            # RT filters own scratch/model state. Thousands of chart dimensions
            # must not retain thousands of filter allocations throughout a place.
            if len(self.filters) >= 16:
                oldest = next(iter(self.filters))
                self.lib.oidnReleaseFilter(self.filters.pop(oldest))
                for buffer in self.buffers.pop(oldest, []):
                    self.lib.oidnReleaseBuffer(buffer)
            handle = self.lib.oidnNewFilter(self.device, b'RT')
            self.lib.oidnSetFilterBool(handle, b'hdr', True)
            self.lib.oidnSetFilterInt(handle, b'quality', 6)  # OIDN_QUALITY_HIGH
            self.filters[key] = handle
        handle = self.filters[key]
        if self.backend == 'METAL':
            if key not in self.buffers:
                self.buffers[key] = [self.lib.oidnNewBuffer(self.device, data.nbytes) for _ in range(2)]
                self.check()
            source, destination = self.buffers[key]
            self.ct.memmove(self.lib.oidnGetBufferData(source), data.ctypes.data, data.nbytes)
            for name, buffer in [(b'color', source), (b'output', destination)]:
                self.lib.oidnSetFilterImage(handle, name, buffer, 3, width, height, 0, 0, 0)
        else:
            for name, buffer in [(b'color', data), (b'output', output)]:
                self.lib.oidnSetSharedFilterImage(handle, name, buffer.ctypes.data, 3, width, height, 0, 0, 0)
        self.lib.oidnCommitFilter(handle)
        self.check()
        self.lib.oidnExecuteFilter(handle)
        self.check()
        if self.backend == 'METAL':
            self.ct.memmove(output.ctypes.data, self.lib.oidnGetBufferData(destination), output.nbytes)
        return np.maximum(output, 0)

    def close(self):
        for handle in self.filters.values():
            self.lib.oidnReleaseFilter(handle)
        for buffers in self.buffers.values():
            for buffer in buffers:
                self.lib.oidnReleaseBuffer(buffer)
        self.lib.oidnReleaseDevice(self.device)


def uv_chart_mask(obj, size):
    """Rasterize exact second-UV chart cores. Report subpixel loss by 3D surface area."""
    import numpy as np
    mesh = obj.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers['Lightmap'].data
    excluded = mesh.attributes.get('one_light_uv_excluded')
    is_hidden = [bool(excluded and excluded.data[i].value) for i in range(len(mesh.polygons))]
    authored_charts = mesh.attributes.get('one_light_uv_chart')
    parent = list(range(len(mesh.polygons)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    edges = {}
    for polygon in [] if authored_charts else mesh.polygons:
        if is_hidden[polygon.index]:
            continue
        loops = list(polygon.loop_indices)
        for i, index in enumerate(loops):
            other = loops[(i + 1) % len(loops)]
            endpoints = tuple(sorted((mesh.loops[k].vertex_index, round(uv[k].uv.x * 1e7), round(uv[k].uv.y * 1e7)) for k in [index, other]))
            previous = edges.get(endpoints)
            if previous is not None:
                a, b = root(polygon.index), root(previous)
                parent[a] = b
            else:
                edges[endpoints] = polygon.index
    if authored_charts:
        roots = sorted({authored_charts.data[i].value for i in range(len(mesh.polygons)) if not is_hidden[i]})
        numbering = {value: i + 1 for i, value in enumerate(roots)}
        polygon_chart = [0 if is_hidden[i] else numbering[authored_charts.data[i].value] for i in range(len(parent))]
    else:
        roots = sorted({root(i) for i in parent if not is_hidden[i]})
        numbering = {r: i + 1 for i, r in enumerate(roots)}
        polygon_chart = [0 if is_hidden[i] else numbering[root(i)] for i in range(len(parent))]
    labels = np.zeros((size, size), dtype=np.int32)
    areas = np.zeros(len(roots) + 1, dtype=np.float64)
    overlaps = 0
    hidden_area = 0.0
    triangle_core_area = 0.0
    for triangle in mesh.loop_triangles:
        label = polygon_chart[triangle.polygon_index]
        a, b, c = [obj.matrix_world @ mesh.vertices[i].co for i in triangle.vertices]
        area = (b - a).cross(c - a).length * .5
        if label == 0:
            hidden_area += area
            continue
        areas[label] += area
        coordinates = np.array([tuple(uv[i].uv) for i in triangle.loops]) * size
        low = np.maximum(0, np.floor(coordinates.min(axis=0)).astype(int))
        high = np.minimum(size - 1, np.ceil(coordinates.max(axis=0)).astype(int))
        if np.any(low > high):
            continue
        xx, yy = np.meshgrid(np.arange(low[0], high[0] + 1) + .5, np.arange(low[1], high[1] + 1) + .5)
        a, b, c = coordinates
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-12:
            continue
        u = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / denominator
        v = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / denominator
        inside = (u >= -1e-7) & (v >= -1e-7) & (u + v <= 1 + 1e-7)
        if np.any(inside):
            triangle_core_area += area
        view = labels[low[1]:high[1] + 1, low[0]:high[0] + 1]
        overlaps += int(np.count_nonzero(inside & (view != 0) & (view != label)))
        view[inside] = label
    counts = np.bincount(labels.ravel(), minlength=len(areas))
    represented = counts > 0
    total_area = float(areas.sum())
    report = {'charts': len(roots), 'representedCharts': int(np.count_nonzero(represented[1:])), 'subpixelCharts': int(np.count_nonzero(~represented[1:])), 'representedSurfaceAreaFraction': float(areas[represented].sum() / total_area) if total_area else 1, 'triangleWithNativeTexelSurfaceAreaFraction': triangle_core_area / total_area if total_area else 1, 'surfaceAreaInChartsWithAtLeast16CoreTexelsFraction': float(areas[counts >= 16].sum() / total_area) if total_area else 1, 'totalSurfaceAreaSquareMetres': total_area, 'provenOccludedSurfaceAreaSquareMetres': hidden_area, 'provenOccludedPolygons': sum(is_hidden), 'coreTexels': int(np.count_nonzero(labels)), 'overlappingCorePixels': overlaps, 'coverageMeaning': 'World-space mapped surface-area weighted; proven enclosed geometry is reported separately. A represented chart may contain subpixel triangles; their native-texel area is also reported. Camera-visible sampled coverage is separate.'}
    if overlaps:
        raise RuntimeError(f'{obj.name}: {overlaps} overlapping chart-core pixels; atlas cannot be accepted.')
    return labels, polygon_chart, report


def camera_visible_coverage(scene, regions, chart_maps, masks, width=96, height=60):
    """Area-on-screen estimate from first opaque triangle hits in the authored reference cameras."""
    import numpy as np
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    vertices, faces, owners = [], [], []
    for region, obj in regions.items():
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            faces.append(tuple(offset + index for index in triangle.vertices))
            owners.append((region, chart_maps[region][triangle.polygon_index]))
    tree = BVHTree.FromPolygons(vertices, faces, all_triangles=True)
    represented = {region: set(np.unique(mask)) - {0} for region, mask in masks.items()}
    cameras = [obj for obj in scene.objects if obj.type == 'CAMERA' and obj.name.startswith('Reference_')]
    totals = {region: {'sampledVisiblePixels': 0, 'representedVisiblePixels': 0, 'provenOccludedVisiblePixels': 0, 'referenceCameras': [camera.name for camera in cameras], 'perCamera': {}} for region in regions}
    for camera in cameras:
        camera_totals = {region: {'sampledVisiblePixels': 0, 'representedVisiblePixels': 0, 'provenOccludedVisiblePixels': 0} for region in regions}
        frame = camera.data.view_frame(scene=scene)
        x0, x1 = min(v.x for v in frame), max(v.x for v in frame)
        y0, y1 = min(v.y for v in frame), max(v.y for v in frame)
        z = frame[0].z
        origin = camera.matrix_world.translation
        rotation = camera.matrix_world.to_3x3()
        for iy in range(height):
            for ix in range(width):
                direction = (rotation @ Vector((x0 + (ix + .5) / width * (x1 - x0), y0 + (iy + .5) / height * (y1 - y0), z))).normalized()
                _, _, index, _ = tree.ray_cast(origin, direction, 1000)
                if index is None:
                    continue
                region, chart = owners[index]
                totals[region]['sampledVisiblePixels'] += 1
                camera_totals[region]['sampledVisiblePixels'] += 1
                if chart == 0:
                    totals[region]['provenOccludedVisiblePixels'] += 1
                    camera_totals[region]['provenOccludedVisiblePixels'] += 1
                if chart in represented[region]:
                    totals[region]['representedVisiblePixels'] += 1
                    camera_totals[region]['representedVisiblePixels'] += 1
        for region, values in camera_totals.items():
            count = values['sampledVisiblePixels']
            values['representedCameraVisibleFraction'] = values['representedVisiblePixels'] / count if count else None
            totals[region]['perCamera'][camera.name] = values
    for region, values in totals.items():
        count = values['sampledVisiblePixels']
        values['representedCameraVisibleFraction'] = values['representedVisiblePixels'] / count if count else None
        values['samplesPerCamera'] = [width, height]
        values['scope'] = 'Coarse first-hit geometry visibility over the source reference cameras; excludes sky. Features smaller than the sampling grid and shading/noise quality are not verified by this metric.'
    return totals


def denoise_isolated_charts(rgb, labels, denoiser, gutter=8):
    """No chart reads a neighbour's samples, even when the lightmap model uses a wide receptive field."""
    import numpy as np
    output = np.zeros_like(rgb, dtype=np.float32)
    # Compute bounding boxes in one raster pass, rather than rescanning a 4K
    # atlas for every one of its thousands of construction charts.
    yy, xx = np.nonzero(labels)
    ids = labels[yy, xx]
    active = np.unique(ids)
    count = int(ids.max()) + 1 if len(ids) else 1
    bounds = np.empty((count, 4), dtype=np.int32)
    bounds[:, :2] = labels.shape[0] + labels.shape[1]
    bounds[:, 2:] = -1
    np.minimum.at(bounds[:, 0], ids, yy)
    np.minimum.at(bounds[:, 1], ids, xx)
    np.maximum.at(bounds[:, 2], ids, yy)
    np.maximum.at(bounds[:, 3], ids, xx)
    began = time.time()
    chart_ids = active[active != 0]
    for completed, chart in enumerate(chart_ids, 1):
        y0, x0, y1, x1 = bounds[chart]
        y1 += 1
        x1 += 1
        mask = labels[y0:y1, x0:x1] == chart
        patch = np.zeros((y1 - y0, x1 - x0, 3), dtype=np.float32)
        # Fill outside this chart using only its own edge colours. No other atlas island enters OIDN.
        good_rows = []
        for y in range(mask.shape[0]):
            known = np.flatnonzero(mask[y])
            if len(known):
                good_rows.append(y)
                for channel in range(3):
                    patch[y, :, channel] = np.interp(np.arange(mask.shape[1]), known, rgb[y0 + y, x0 + known, channel])
        for x in range(mask.shape[1]):
            for channel in range(3):
                patch[:, x, channel] = np.interp(np.arange(mask.shape[0]), good_rows, patch[good_rows, x, channel])
        # A fixed border and 32-pixel dimensions allow filter reuse without introducing black-edge bias.
        pad = 16
        target_h = math.ceil((patch.shape[0] + pad * 2) / 32) * 32
        target_w = math.ceil((patch.shape[1] + pad * 2) / 32) * 32
        padded = np.pad(patch, ((pad, target_h - patch.shape[0] - pad), (pad, target_w - patch.shape[1] - pad), (0, 0)), mode='edge')
        clean = denoiser.filter(padded)[pad:pad + patch.shape[0], pad:pad + patch.shape[1]]
        destination = output[y0:y1, x0:x1]
        destination[mask] = clean[mask]
        if len(chart_ids) > 512 and (completed % 1024 == 0 or completed == len(chart_ids)):
            print('DENOISE_CHARTS', completed, len(chart_ids), round(time.time() - began, 2), flush=True)
    # Rebuild gutters after denoising. A pixel belongs to exactly one chart; colours are never averaged across charts.
    ownership = labels.copy()
    for _ in range(gutter):
        previous = ownership.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            shifted = np.roll(previous, (dy, dx), axis=(0, 1))
            colours = np.roll(output, (dy, dx), axis=(0, 1))
            if dy < 0: shifted[-1] = 0
            if dy > 0: shifted[0] = 0
            if dx < 0: shifted[:, -1] = 0
            if dx > 0: shifted[:, 0] = 0
            take = (ownership == 0) & (shifted != 0)
            ownership[take] = shifted[take]
            output[take] = colours[take]
    return output


def denoise_image(image, labels, denoiser):
    import numpy as np
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(height, width, 4)
    clean = denoise_isolated_charts(rgba[:, :, :3], labels, denoiser)
    rgba[:, :, :3] = clean
    rgba[:, :, 3] = 1
    image.pixels.foreach_set(pixels)
    image.update()


def denoise_probe(out, backend='METAL'):
    """Small explicit-backend OIDN proof, with no Cycles render/bake."""
    import numpy as np
    out.mkdir(parents=True, exist_ok=True)
    random = np.random.default_rng(18)
    size = 128
    labels = np.zeros((size, size), dtype=np.int32)
    labels[16:112, 8:56] = 1
    labels[16:112, 72:120] = 2
    truth = np.zeros((size, size, 3), dtype=np.float32)
    truth[labels == 1] = [.4, .015, .005]
    truth[labels == 2] = [.005, .015, .4]
    noise = np.clip(1 + random.normal(0, .32, truth.shape), .05, 3)
    noisy = truth * noise
    began = time.time()
    denoiser = LightmapDenoiser(backend)
    clean = denoise_isolated_charts(noisy, labels, denoiser)
    denoiser.close()
    mask = labels > 0
    before = float(np.sqrt(np.mean((noisy[mask] - truth[mask]) ** 2)))
    after = float(np.sqrt(np.mean((clean[mask] - truth[mask]) ** 2)))
    report = {'backend': 'OpenImageDenoise RT HDR ' + backend, 'seconds': time.time() - began, 'noiseRMSEBefore': before, 'noiseRMSEAfter': after, 'noiseReduction': 1 - after / before, 'redChartBlueMean': float(clean[labels == 1, 2].mean()), 'blueChartRedMean': float(clean[labels == 2, 0].mean()), 'knownMinorityChannel': .005, 'gutterPixels': 8, 'mipLevels': 3, 'anisotropy': 1, 'scope': 'Synthetic two-chart OIDN proof; no Cycles render or bake; not a full-scene quality or bake-time claim.'}
    for name, data in [('noisy', noisy), ('denoised', clean)]:
        image = bpy.data.images.new(name, size, size, float_buffer=True)
        image.colorspace_settings.name = 'Non-Color'
        rgba = np.ones((size, size, 4), dtype=np.float32); rgba[:, :, :3] = data
        image.pixels.foreach_set(rgba.ravel())
        scene = bpy.context.scene; scene.view_settings.view_transform = 'Raw'; scene.view_settings.look = 'None'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
        entry = save_linear(scene, image, out / name)
        encoded = read_png16_rgb(out / entry['png'])
        decoded = (2 ** (encoded * entry['logRange']) - 1) / entry['logGain']
        # PNG top-left origin is the reverse of Blender's bottom-left pixel array.
        error = np.abs(decoded[::-1] - data)
        report.setdefault('pngRoundTrip', {})[name] = {'encoding': entry['encoding'], 'maximumAbsoluteError': float(error.max()), 'meanAbsoluteError': float(error.mean()), 'logRange': entry['logRange'], 'logGain': entry['logGain'], 'pngMipmaps': entry['pngMipmaps'], 'scope': 'Actual 16-bit PNG integer samples decoded without sRGB/AgX; UASTC error is measured separately.'}
    log_encoding_proof(out)
    # Source-independent HDR delivery fixture: a dark gradient and a tiny bright
    # fixture-like peak. Compress/transcode these with the same CLI settings.
    hdr = np.broadcast_to(np.linspace(.0005, .15, 128, dtype=np.float32)[None, :, None], (128, 128, 3)).copy()
    hdr[16:20, 16:20] = 64
    np.save(out / 'hdr-truth.npy', hdr)
    image = bpy.data.images.new('HDR delivery fixture', 128, 128, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((128, 128, 4), dtype=np.float32)
    rgba[:, :, :3] = hdr
    image.pixels.foreach_set(rgba.ravel())
    for gain in [16, 256]:
        save_linear(scene, image, out / f'hdr-gain{gain}', gain=gain)
    bpy.data.images.remove(image)
    (out / 'denoise-proof.json').write_text(json.dumps(report, indent=2) + '\n')
    print('DENOISE_PROOF', json.dumps(report), flush=True)


def cycles_denoise_probe(out):
    """A tiny independent Metal Cycles bake: four samples, explicit OIDN, 128-sample reference."""
    import numpy as np
    from types import SimpleNamespace
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_cycles(scene, SimpleNamespace(samples=4, device='METAL', skip_bake=False, export_only=False))
    scene.cycles.use_denoising = False; scene.cycles.max_bounces = 4; scene.cycles.diffuse_bounces = 4
    scene.world = bpy.data.worlds.new('ProbeWorld'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .03
    def diffuse(name, colour):
        material = bpy.data.materials.new(name); material.use_nodes = True
        nodes = material.node_tree.nodes; nodes.clear()
        shader = nodes.new('ShaderNodeBsdfDiffuse'); shader.inputs['Color'].default_value = (*colour, 1)
        output = nodes.new('ShaderNodeOutputMaterial'); material.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
        return material
    material = diffuse('ProbeFloor', [1, 1, 1])
    mesh = bpy.data.meshes.new('TwoSeparateUVCharts')
    mesh.from_pydata([(-2.1,-1,0),(-.1,-1,0),(-.1,1,0),(-2.1,1,0),(.1,-1,0),(2.1,-1,0),(2.1,1,0),(.1,1,0)], [], [(0,1,2,3),(4,5,6,7)])
    obj = bpy.data.objects.new('ProbeFloor', mesh); scene.collection.objects.link(obj); mesh.materials.append(material)
    base_uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        u0,u1=(.07,.43) if polygon.index==0 else (.57,.93)
        for index,uv in zip(polygon.loop_indices,[(u0,.1),(u1,.1),(u1,.9),(u0,.9)]): base_uv.data[index].uv=uv
    mesh.uv_layers.new(name='Lightmap',do_init=True)
    for name,location,scale,colour in [('RedWall',(-2.2,0,.75),(.1,1.2,.75),[.65,.08,.035]),('BlueWall',(2.2,0,.75),(.1,1.2,.75),[.04,.12,.65]),('Back',(0,1.2,.75),(2.3,.1,.75),[.6,.6,.6])]:
        bpy.ops.mesh.primitive_cube_add(size=2, location=location); wall=bpy.context.object; wall.scale=scale; wall.data.materials.append(diffuse(name,colour))
    light=bpy.data.lights.new('ProbeArea','AREA');light.energy=50;light.shape='DISK';light.size=2
    lamp=bpy.data.objects.new('ProbeArea',light);scene.collection.objects.link(lamp);lamp.location=(0,0,2.2)
    size=128; image=bpy.data.images.new('ProbeBake',size,size,float_buffer=True);image.colorspace_settings.name='Non-Color';set_bake_image(obj,image)
    select_only([obj]); labels,_,coverage=uv_chart_mask(obj,size)
    data=[];seconds=[]
    for samples in [4,128]:
        scene.cycles.samples=samples;began=time.time()
        bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'},use_clear=True,uv_layer='Lightmap',margin=0)
        seconds.append(time.time()-began)
        pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);data.append(pixels.reshape(size,size,4)[:,:,:3].copy())
    denoiser=LightmapDenoiser();began=time.time();clean=denoise_isolated_charts(data[0],labels,denoiser);denoise_seconds=time.time()-began;denoiser.close()
    valid=labels>0
    raw_error=float(np.sqrt(np.mean((data[0][valid]-data[1][valid])**2)))
    clean_error=float(np.sqrt(np.mean((clean[valid]-data[1][valid])**2)))
    report={'backend':'Cycles Metal diffuse DIRECT+INDIRECT, explicit OIDN RT HDR Metal per chart','resolution':size,'noisySamples':4,'referenceSamples':128,'bakeSeconds4Samples':seconds[0],'bakeSeconds128Samples':seconds[1],'denoiseSeconds':denoise_seconds,'rawRMSEAgainstReference':raw_error,'denoisedRMSEAgainstReference':clean_error,'rmseReduction':1-clean_error/raw_error,'coverage':coverage,'scope':'Tiny two-chart area-lit corner proof; these timings are not a full temple estimate.'}
    (out/'cycles-denoise-proof.json').write_text(json.dumps(report,indent=2)+'\n')
    scene.view_settings.view_transform='Raw';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    for name,rgb in [('cycles-4-samples',data[0]),('cycles-4-denoised',clean),('cycles-128-reference',data[1])]:
        rgba=np.ones((size,size,4),dtype=np.float32);rgba[:,:,:3]=rgb;image.pixels.foreach_set(rgba.ravel());image.update();save_linear(scene,image,out/name,valid)
    print('CYCLES_DENOISE_PROOF',json.dumps(report),flush=True)


def main():
    options = arguments()
    options.out.mkdir(parents=True, exist_ok=True)
    if options.probe_denoise:
        denoise_probe(options.out, options.oidn_device)
        return
    if options.probe_cycles:
        cycles_denoise_probe(options.out)
        return
    if options.probe_ktx_quality:
        ktx_quality_probe(options.out)
        return
    if options.verify_delivery:
        verify_delivery_maps(options.out, options.verify_delivery)
        return
    if options.reencode_existing:
        reencode_existing(options)
        return
    scene = bpy.context.scene
    if options.receiver_report:
        regions = {obj['lightmap_region']: obj for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static') and obj.data.uv_layers.get('Lightmap')}
        if not regions:
            raise RuntimeError('Receiver report requires an already prepared blend.')
        for region, obj in regions.items():
            profile = receiver_profile(obj)
            profile['preparedBlendSha256'] = sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
            (options.out / f'{region}-receiver.json').write_text(json.dumps(profile, indent=2) + '\n')
            print('RECEIVER_REPORT', region, profile['receiverFingerprint'], profile['lightmapUVFingerprint'], flush=True)
        return
    if not scene.get('one_light_source_view_settings'):
        scene['one_light_source_view_settings'] = json.dumps({name: getattr(scene.view_settings, name) for name in ['view_transform', 'look', 'exposure', 'gamma']})
    configure_cycles(scene, options)
    started = time.time()
    prepared = (options.export_only or options.resume) and all(obj.data.uv_layers.get('Lightmap') for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static'))
    binding = source_binding(scene, prepared)
    if options.hidden_faces and json.loads(options.hidden_faces.read_text())['sourceSha256'] != binding['sha256']:
        raise RuntimeError('The hidden-face proof belongs to a different authored source.')
    regions = {obj['lightmap_region']: obj for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static')} if prepared else prepare_regions(options.resolution, options.hall_resolution, options.out, options.hidden_faces, options.court_resolution, options.gate_resolution, options.chart_cache)
    if not prepared:
        bpy.ops.wm.save_as_mainfile(filepath=str(options.out / 'snow-roof-uv-candidate.blend'))
    fingerprint = sha256()
    receiver_profiles = {}
    for region, obj in sorted(regions.items()):
        receiver_profiles[region] = receiver_profile(obj)
        fingerprint.update(region.encode())
        fingerprint.update(receiver_profiles[region]['receiverFingerprint'].encode())
        fingerprint.update(receiver_profiles[region]['lightmapUVFingerprint'].encode())
    geometry_fingerprint = fingerprint.hexdigest()
    resolution_by_region = {region: {'hall': options.hall_resolution, 'court': options.court_resolution, 'gate': options.gate_resolution}.get(region) or options.resolution for region in regions}
    snapshot = snapshot_lighting(scene)
    if options.prepared_preview_audit:
        scene['one_light_prepared_preview_audit'] = options.prepared_preview_audit.read_text()
    bake_fingerprint, transport_payload = transport_fingerprint(scene, regions, snapshot, binding, receiver_profiles)
    (options.out / 'bake-fingerprint.json').write_text(json.dumps(transport_payload, indent=2) + '\n')
    manifest = {'version': 1, 'place': 'snow-roof', 'scene': 'snow-roof.glb', 'lampAnchor': [0, 3.22, -.5], 'lampBasis': {'watts': 45, 'position': [0, 2.99, -.5], 'linearColor': [1, 189/255, 120/255]}, 'lightmaps': {}, 'bake': {'engine': 'Cycles', 'blender': bpy.app.version_string, 'samples': options.samples, 'resolution': options.resolution, 'resolutionByRegion': resolution_by_region, 'passes': ['DIRECT', 'INDIRECT'], 'colorExcluded': True, 'materialUV': 'TEXCOORD_0', 'lightmapUV': 'TEXCOORD_1', 'runtimeAlias': 'uv2', 'unwrap': 'xatlas/watlas1.0.1, topology-only input; UV0 preserved', 'quantity': 'diffuse-radiance-per-unit-albedo', 'threeLightMapIrradianceMultiplier': math.pi, 'denoising': {'backend': 'OpenImageDenoise RT HDR', 'device': 'CPU', 'isolation': 'Per-UV-chart with same-chart edge extension; subpixel charts excluded and reported'}, 'sampling': {'mipLevels': 3, 'gutterPixels': 8, 'anisotropy': 1, 'maxLod': 2}, 'presets': PRESETS}}
    manifest_path = options.out / 'manifest.json'
    manifest['bake']['denoising']['device'] = options.oidn_device
    manifest['bake']['sourceNightLighting'] = lighting_metadata(snapshot)
    manifest['bake']['sourceBlendSha256'] = binding['sha256']
    manifest['bake']['receiverProfiles'] = receiver_profiles
    manifest['bake']['generatedCoordinates'] = transport_payload['generatedCoordinates']
    manifest['bake']['preparedPreviewAudit'] = transport_payload['preparedPreviewAudit']
    manifest['bake']['cachePolicy'] = 'Full scene/source/material/image/lighting identity. Region chart equality reuses UV preparation only, never illumination.'
    if options.hidden_faces:
        proof_bytes = options.hidden_faces.read_bytes()
        proof = json.loads(proof_bytes)
        manifest['bake']['hiddenUVAllocationProof'] = {'sha256': sha256(proof_bytes).hexdigest(), 'sourceSha256': proof['sourceSha256'], 'rule': proof['rule'], 'summary': proof['summary'], 'representativeCameraRayChecks': proof['representativeCameraRayChecks'], 'geometryRetained': True, 'reservedUV': [0, 0]}
    reusable = False
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        same_geometry = previous.get('geometryFingerprint') == geometry_fingerprint
        same_transport = previous.get('bakeFingerprint') == bake_fingerprint
        reusable = same_geometry and same_transport and previous['bake']['resolution'] == options.resolution and previous['bake']['samples'] >= options.samples and previous['bake'].get('resolutionByRegion', resolution_by_region) == resolution_by_region
        if reusable:
            manifest['lightmaps'] = previous.get('lightmaps', {})
        elif options.resume and previous.get('lightmaps') and (not same_geometry or not same_transport):
            raise RuntimeError('Full-scene geometry/lighting/source identity differs from existing lightmaps; use a new output and rebake all regions.')
    manifest['geometryFingerprint'] = geometry_fingerprint
    manifest['bakeFingerprint'] = bake_fingerprint
    masks = {}
    chart_maps = {}
    coverage = {}
    for region, obj in regions.items():
        import numpy as np
        cache_path = options.out / f'{region}-coverage.npz'
        cache_key = f'chart-id-v1:{geometry_fingerprint}:{resolution_by_region[region]}'
        cached = None
        if cache_path.exists():
            with np.load(cache_path, allow_pickle=False) as data:
                if str(data['key']) == cache_key:
                    cached = (data['labels'], data['charts'].tolist(), json.loads(str(data['report'])))
        if cached:
            masks[region], chart_maps[region], coverage[region] = cached
            print('UV_COVERAGE_REUSED', region, flush=True)
        else:
            masks[region], chart_maps[region], coverage[region] = uv_chart_mask(obj, resolution_by_region[region])
            np.savez_compressed(cache_path, key=cache_key, labels=masks[region], charts=np.asarray(chart_maps[region], dtype=np.int32), report=json.dumps(coverage[region]))
        print('UV_COVERAGE', region, json.dumps(coverage[region]), flush=True)
    visible = camera_visible_coverage(scene, regions, chart_maps, masks)
    for region in coverage:
        coverage[region].update(visible[region])
        print('VISIBLE_UV_COVERAGE', region, json.dumps(visible[region]), flush=True)
    manifest['bake']['coverage'] = coverage
    bpy.ops.wm.save_as_mainfile(filepath=str(options.out / 'snow-roof-prepared.blend'))
    if not options.skip_bake and not options.export_only:
        requested_regions = set(options.regions.split(',')) if options.regions else set(regions)
        if requested_regions - set(regions):
            raise RuntimeError('Unknown bake regions: ' + ', '.join(requested_regions - set(regions)))
        failed = [region for region, values in coverage.items() if values['representedSurfaceAreaFraction'] < .999 or values['representedCameraVisibleFraction'] is not None and values['representedCameraVisibleFraction'] < .999 or values['provenOccludedVisiblePixels'] or any(camera['representedCameraVisibleFraction'] is not None and camera['representedCameraVisibleFraction'] < .995 for camera in values['perCamera'].values())]
        if failed:
            raise RuntimeError('UV coverage gate failed; no Cycles bake started. Review subpixel and visible surface coverage for: ' + ', '.join(failed))
        denoiser = LightmapDenoiser(options.oidn_device)
        for name in options.passes.split(','):
            if name not in PRESETS:
                raise ValueError('Unknown pass: ' + name)
            configure_light_pass(scene, name, snapshot)
            for region, obj in regions.items():
                if region not in requested_regions:
                    continue
                if options.resume and reusable and (options.out / f'{region}-{name}.png').exists() and name in manifest['lightmaps'].get(region, {}):
                    print('BAKE_REUSED', region, name, flush=True)
                    continue
                select_only([obj])
                obj.data.uv_layers.active = obj.data.uv_layers['Lightmap']
                image = bpy.data.images.new(f'{region}-{name}', width=resolution_by_region[region], height=resolution_by_region[region], alpha=False, float_buffer=True)
                image.colorspace_settings.name = 'Non-Color'
                set_bake_image(obj, image)
                print('BAKE_START', region, name, flush=True)
                began = time.time()
                bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, uv_layer='Lightmap', margin=4)
                bake_seconds = time.time() - began
                print('CYCLES_BAKE_DONE', region, name, round(bake_seconds, 3), flush=True)
                # Preserve the noisy full-range master, then denoise only represented UV-chart cores.
                raw_stem = options.out / f'{region}-{name}-raw'
                scene.render.image_settings.file_format = 'OPEN_EXR'
                scene.render.image_settings.color_mode = 'RGBA'
                scene.render.image_settings.color_depth = '32'
                scene.render.image_settings.exr_codec = 'ZIP'
                image.save_render(str(raw_stem.with_suffix('.exr')), scene=scene)
                denoise_started = time.time()
                denoise_image(image, masks[region], denoiser)
                denoise_seconds = time.time() - denoise_started
                entry = save_linear(scene, image, options.out / f'{region}-{name}', masks[region] > 0, gain=options.log_gain)
                entry['denoiseSeconds'] = round(denoise_seconds, 3)
                entry['bakeSeconds'] = round(bake_seconds, 3)
                entry['samples'] = options.samples
                entry['bakeDevice'] = options.device
                entry['denoiseDevice'] = options.oidn_device
                entry['bakeFingerprint'] = bake_fingerprint
                entry['uri'] = f'{region}-{name}.ktx2'
                entry['seconds'] = round(time.time() - began, 3)
                manifest['lightmaps'].setdefault(region, {})[name] = entry
                manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
                print('BAKE_DONE', region, name, entry['seconds'], entry['maximum'], flush=True)
                bpy.data.images.remove(image)
        denoiser.close()
    # Export the restrained night emissive fixtures, rather than the black materials of the lamp-only pass.
    configure_light_pass(scene, 'night', snapshot)
    # Keep the source materials on UVMap and export both UV sets, without baked albedo or light baked into base color.
    for obj in regions.values():
        obj.data.uv_layers.active = obj.data.uv_layers[0]
        obj.data.uv_layers[0].active_render = True
    for material in bpy.data.materials:
        if material.use_nodes:
            node = material.node_tree.nodes.get('ONE_LIGHT_BAKE_TARGET')
            if node:
                material.node_tree.nodes.remove(node)
    select_only(list(regions.values()))
    bpy.ops.export_scene.gltf(filepath=str(options.out / 'snow-roof.raw.glb'), export_format='GLB', use_selection=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=True, export_yup=True, export_cameras=False, export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(options.out / 'snow-roof-baked.blend'))
    manifest['bake']['totalSeconds'] = round(time.time() - started, 3)
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('EXPORT_DONE', options.out, manifest['bake']['totalSeconds'], flush=True)

if __name__ == '__main__':
    main()
