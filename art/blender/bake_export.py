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
import bpy

PRESETS = {
    'night': {'world': [.18, .24, .34], 'strength': .55, 'sun': [.58, .7, 1], 'energy': .18, 'fixtures': 1.15},
    'dusk': {'world': [.25, .31, .42], 'strength': .65, 'sun': [1, .62, .38], 'energy': .45, 'fixtures': .8},
    'day': {'world': [.64, .77, 1], 'strength': .75, 'sun': [1, .92, .8], 'energy': 2.2, 'fixtures': .12},
    'lamp': {'world': [0, 0, 0], 'strength': 0, 'sun': [1, 1, 1], 'energy': 0, 'fixtures': 0},
}

def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--resolution', type=int, default=1024)
    parser.add_argument('--samples', type=int, default=96)
    parser.add_argument('--device', choices=['METAL', 'CPU'], default='METAL')
    parser.add_argument('--passes', default='night,dusk,day,lamp')
    parser.add_argument('--skip-bake', action='store_true')
    parser.add_argument('--export-only', action='store_true')
    parser.add_argument('--resume', action='store_true')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

def configure_cycles(scene, options):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = options.samples
    scene.cycles.use_denoising = True
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
            raise RuntimeError('No Metal device; pass --device CPU explicitly for a CPU bake.')
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


def prepare_regions():
    by_region = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.get('one_light_static', False):
            region = obj.get('lightmap_region', obj.get('region', 'court'))
            by_region.setdefault(region, []).append(obj)
    if not by_region:
        raise RuntimeError('Source contains no one_light_static meshes.')
    # Evaluate construction modifiers once. Repeated modifier_apply operators rebuild the
    # entire 1000-object dependency graph for every bevel; a single graph avoids that quadratic cost.
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = []
    for objects in by_region.values():
        for obj in objects:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
            evaluated.append((obj, mesh))
    for obj, mesh in evaluated:
        obj.modifiers.clear()
        obj.data = mesh
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
        if len(obj.data.uv_layers) == 0:
            raise RuntimeError('Source region lacks UVMap: ' + region)
        obj.data.uv_layers[0].name = 'UVMap'
        while len(obj.data.uv_layers) > 1:
            obj.data.uv_layers.remove(obj.data.uv_layers[-1])
        lightmap = obj.data.uv_layers.new(name='Lightmap')
        obj.data.uv_layers.active = lightmap
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.006, area_weight=.15, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.pack_islands(rotate=True, margin=.008)
        bpy.ops.object.mode_set(mode='OBJECT')
        obj.data.uv_layers[0].active_render = True
        regions[region] = obj
        print('REGION_READY', region, len(obj.data.polygons), len(obj.data.uv_layers), flush=True)
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
    return lights, emission


def configure_light_pass(scene, name, snapshot):
    preset = PRESETS[name]
    if not scene.world:
        scene.world = bpy.data.worlds.new('BakeWorld')
    scene.world.use_nodes = True
    nodes = scene.world.node_tree.nodes
    nodes.clear()
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Color'].default_value = (*preset['world'], 1)
    background.inputs['Strength'].default_value = preset['strength']
    output = nodes.new('ShaderNodeOutputWorld')
    scene.world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])
    for obj, energy, color in snapshot[0]:
        role = obj.get('bake_role', obj.data.get('bake_role', 'fixture'))
        obj.data.color = color
        if role == 'lamp':
            obj.data.energy = energy if name == 'lamp' else 0
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


def save_linear(scene, image, stem):
    # EXR stores unbounded scene-linear values before the normalized delivery encoding.
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '32'
    scene.render.image_settings.exr_codec = 'ZIP'
    image.save_render(str(stem.with_suffix('.exr')), scene=scene)
    pixels = array('f', [0.0]) * (image.size[0] * image.size[1] * 4)
    image.pixels.foreach_get(pixels)
    maximum = max((value for i, value in enumerate(pixels) if i % 4 != 3 and math.isfinite(value)), default=0)
    scale = 2 ** math.ceil(math.log2(maximum)) if maximum > 0 else 1
    normalized = array('f', (max(0.0, v) / scale if i % 4 != 3 else 1 for i, v in enumerate(pixels)))
    image.pixels.foreach_set(normalized)
    image.update()
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '16'
    scene.render.image_settings.compression = 40
    image.save_render(str(stem.with_suffix('.png')), scene=scene)
    image.pixels.foreach_set(pixels)
    image.update()
    return {'scale': scale, 'maximum': maximum, 'encoding': 'linear-normalized', 'source': stem.name + '.exr', 'png': stem.name + '.png'}


def main():
    options = arguments()
    options.out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    configure_cycles(scene, options)
    started = time.time()
    prepared = (options.export_only or options.resume) and all(obj.data.uv_layers.get('Lightmap') for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static'))
    regions = {obj['lightmap_region']: obj for obj in scene.objects if obj.type == 'MESH' and obj.get('one_light_static')} if prepared else prepare_regions()
    fingerprint = sha256()
    for region, obj in sorted(regions.items()):
        fingerprint.update(region.encode())
        vertices = array('f', [0.0]) * (len(obj.data.vertices) * 3)
        obj.data.vertices.foreach_get('co', vertices)
        uv = array('f', [0.0]) * (len(obj.data.uv_layers['Lightmap'].data) * 2)
        obj.data.uv_layers['Lightmap'].data.foreach_get('uv', uv)
        fingerprint.update(vertices.tobytes())
        fingerprint.update(uv.tobytes())
        fingerprint.update(str(obj.matrix_world).encode())
    geometry_fingerprint = fingerprint.hexdigest()
    snapshot = snapshot_lighting(scene)
    manifest = {'version': 1, 'place': 'snow-roof', 'scene': 'snow-roof.glb', 'lampAnchor': [0, 3.22, -.5], 'lightmaps': {}, 'bake': {'engine': 'Cycles', 'blender': bpy.app.version_string, 'samples': options.samples, 'resolution': options.resolution, 'passes': ['DIRECT', 'INDIRECT'], 'colorExcluded': True, 'materialUV': 'TEXCOORD_0', 'lightmapUV': 'TEXCOORD_1', 'runtimeAlias': 'uv2', 'quantity': 'diffuse-radiance-per-unit-albedo', 'threeLightMapIrradianceMultiplier': math.pi, 'presets': PRESETS}}
    manifest_path = options.out / 'manifest.json'
    reusable = False
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        same_geometry = previous.get('geometryFingerprint') in (None, geometry_fingerprint)
        reusable = same_geometry and previous['bake']['resolution'] == options.resolution and previous['bake']['samples'] >= options.samples
        if reusable:
            manifest['lightmaps'] = previous.get('lightmaps', {})
        elif options.resume and previous.get('lightmaps') and not same_geometry:
            raise RuntimeError('Prepared UV/geometry differs from existing lightmaps; rebuild without --resume.')
    manifest['geometryFingerprint'] = geometry_fingerprint
    bpy.ops.wm.save_as_mainfile(filepath=str(options.out / 'snow-roof-prepared.blend'))
    if not options.skip_bake and not options.export_only:
        for name in options.passes.split(','):
            if name not in PRESETS:
                raise ValueError('Unknown pass: ' + name)
            configure_light_pass(scene, name, snapshot)
            for region, obj in regions.items():
                if options.resume and reusable and (options.out / f'{region}-{name}.png').exists() and name in manifest['lightmaps'].get(region, {}):
                    print('BAKE_REUSED', region, name, flush=True)
                    continue
                select_only([obj])
                obj.data.uv_layers.active = obj.data.uv_layers['Lightmap']
                image = bpy.data.images.new(f'{region}-{name}', width=options.resolution, height=options.resolution, alpha=False, float_buffer=True)
                image.colorspace_settings.name = 'Non-Color'
                set_bake_image(obj, image)
                print('BAKE_START', region, name, flush=True)
                began = time.time()
                bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=True, uv_layer='Lightmap', margin=4)
                entry = save_linear(scene, image, options.out / f'{region}-{name}')
                entry['uri'] = f'{region}-{name}.ktx2'
                entry['seconds'] = round(time.time() - began, 3)
                manifest['lightmaps'].setdefault(region, {})[name] = entry
                manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
                print('BAKE_DONE', region, name, entry['seconds'], entry['maximum'], flush=True)
                bpy.data.images.remove(image)
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
