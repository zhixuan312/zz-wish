"""Render and reconstruct distant pine crowns from the dense prototype meshes.

Render into art/build, then pass the resulting impostors.json to pine_gate.py.
The colour PNGs contain albedo and cutout alpha for the place's lightmaps. The
coarse mesh displaces that image using orthographic intersection depths from
the same Blender geometry. The scene keeps its original trunk and roots.
"""

from argparse import ArgumentParser
from array import array
from hashlib import sha256
import json
import math
from pathlib import Path
from statistics import median
import struct
import sys
from types import SimpleNamespace

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_hero_trees import CROWNS, grow_crown, needle_mesh, prototype_trunk, trunk_point
from pine_native_crowns import NativeSurface, NATIVE_SHA256, OBJECTS, asset_provenance, load_tree, loader_hash, verify_source

PROTOTYPE_HEIGHTS = {'young': 7., 'ridge': 8.3, 'old': 11.}
DEPTH_COLUMNS = 10
DEPTH_ROWS = 16
NATIVE_CUTOFF = .17


def azimuth_axes(degrees):
    turn = math.radians(degrees)
    return Vector((math.cos(turn), 0., -math.sin(turn))), Vector((math.sin(turn), 0., math.cos(turn)))


def load_impostors(path):
    raw = path.read_bytes()
    data = json.loads(raw)
    native = data.get('nativeSource')
    expected = NATIVE_SHA256 if native else hero_source_hash()
    if (data['version'] != 1 or data['prototypeSha256'] != expected
            or data['depthGrid'] != [DEPTH_COLUMNS, DEPTH_ROWS]):
        raise ValueError('Pine impostors were generated from different prototype source.')
    if native:
        for key, value in asset_provenance().items():
            if native.get(key) != value:
                raise ValueError('Pine native receipt has incorrect Poly Haven provenance: ' + key)
        if (native.get('loaderSha256') != loader_hash() or
                native.get('rendererSha256') != sha256(Path(__file__).read_bytes()).hexdigest()):
            raise ValueError('Pine native receipt uses a different bake recipe.')
        if native['profiles'].keys() != data['views'].keys():
            raise ValueError('Pine native receipt has different measured and rendered profiles.')
    for profile, rows in data['views'].items():
        if profile not in CROWNS or not rows:
            raise ValueError('Unknown or empty Pine impostor profile: ' + profile)
        if native:
            source = native['profiles'][profile]
            mount = source['mountBlenderMetres']
            if (source['object'] != OBJECTS.get(profile) or source['lod'] != 0
                    or len(mount) != 3 or not all(math.isfinite(v) for v in mount)
                    or not 0. <= source['crownCutMetres'] < source['heightMetres']
                    or source['triangles']['foliage'] < 1_000_000):
                raise ValueError('Invalid measured native Pine profile: ' + profile)
        for view in rows:
            name = view['file']
            if Path(name).name != name or not name.endswith('.png'):
                raise ValueError('Unexpected Pine impostor texture path: ' + name)
            image = path.parent / name
            raw_image = image.read_bytes()
            if not raw_image.startswith(b'\x89PNG\r\n\x1a\n') or sha256(raw_image).hexdigest() != view['imageSha256']:
                raise ValueError('Pine impostor image differs from render receipt: ' + name)
            frame = view['frameMetres']
            height = source['heightMetres'] if native else PROTOTYPE_HEIGHTS[profile]
            if native:
                width, length, bits, mode = struct.unpack_from('>IIBB', raw_image, 16)
                coverage = view['coverage']
                if (view['nativeObject'] != source['object'] or view['alphaCutoff'] != NATIVE_CUTOFF
                        or not 256 <= width <= 384 or length != round(width * 1.55) or bits != 8 or mode != 6
                        or [width, length] != coverage['dimensions']
                        or not 0 < coverage['opaqueFootprint'] < coverage['alphaBoundsPixels'] <= width * length):
                    raise ValueError('Pine native projection integrity check failed: ' + name)
            if (len(frame) != 4 or any(not math.isfinite(value) for value in frame)
                    or min(frame[2:]) <= 0 or view['prototypeHeightMetres'] != height):
                raise ValueError('Invalid Pine impostor projection frame: ' + name)
            depth = view['depthMetres']
            if (len(depth) != DEPTH_COLUMNS * DEPTH_ROWS
                    or any(not math.isfinite(v) for v in depth)
                    or min(depth) == max(depth)):
                raise ValueError('Pine impostor depth is not a finite relief: ' + name)
            view['imagePath'] = image
    return data['views'], sha256(raw).hexdigest()


def hero_source_hash():
    return sha256((Path(__file__).parent / 'pine_hero_trees.py').read_bytes()).hexdigest()


def relief_crown(name, profile, trunk, camera, views, mesh, source_uv):
    angle = math.degrees(math.atan2(camera.x - trunk[0].x, camera.z - trunk[0].z))
    view = min(views[profile], key=lambda row: abs(math.remainder(angle - row['azimuthDegrees'], 360.)))
    right, toward = azimuth_axes(angle)
    photographed_right, photographed_toward = azimuth_axes(view['azimuthDegrees'])
    source_height = view['prototypeHeightMetres']
    if view.get('nativeObject'):
        # Capture coordinates are already relative to the measured root.
        # Reproject the real branch drift as an offset from that root.
        reference = [Vector((0., 0., 0.)), Vector((0., source_height, 0.))]
    else:
        reference, _ = prototype_trunk(CROWNS[profile], source_height)
    height = trunk[-1].y - trunk[0].y
    scale = height / source_height
    left, bottom, width, length = view['frameMetres']

    points, coords, uv = [], [], []
    for row in range(DEPTH_ROWS):
        v = row / (DEPTH_ROWS - 1)
        y = bottom + v * length
        fraction = min(1., max(0., y / view['prototypeHeightMetres']))
        original = trunk_point(reference, fraction)
        actual = trunk_point(trunk, fraction)
        for col in range(DEPTH_COLUMNS):
            u = col / (DEPTH_COLUMNS - 1)
            x = left + u * width - original.dot(photographed_right)
            z = view['depthMetres'][row * DEPTH_COLUMNS + col] - original.dot(photographed_toward)
            points.append(actual + right * (scale * x) + toward * (scale * z)
                          + Vector((0., (y - original.y) * scale, 0.)))
            coords.append((u * width * scale, v * length * scale))
            uv.append((u, v))
    faces = []
    for row in range(DEPTH_ROWS - 1):
        for col in range(DEPTH_COLUMNS - 1):
            a = row * DEPTH_COLUMNS + col
            faces.append((a, a + 1, a + 1 + DEPTH_COLUMNS, a + DEPTH_COLUMNS))

    material = mesh.material(f'Depth-reconstructed pine crown {view["file"]}', '#ffffff', rough=.91)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    if not any(node.type == 'TEX_IMAGE' for node in nodes):
        image = bpy.data.images.load(str(view['imagePath']), check_existing=True)
        image.pack()
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'CLIP'
        coordinates = nodes.new('ShaderNodeUVMap')
        coordinates.uv_map = 'UVMap'
        links.new(coordinates.outputs['UV'], texture.inputs['Vector'])
        surface = nodes.get('Principled BSDF')
        links.new(texture.outputs['Color'], surface.inputs['Base Color'])
        cutoff = nodes.new('ShaderNodeMath')
        cutoff.operation = 'GREATER_THAN'
        cutoff.inputs[1].default_value = view.get('alphaCutoff', .22)
        links.new(texture.outputs['Alpha'], cutoff.inputs[0])
        links.new(cutoff.outputs[0], surface.inputs['Alpha'])

    tree = mesh.mesh_object(f'{name} depth-reconstructed crown', points, faces, material, 'approach')
    source_uv(tree, [[coords[corner] for corner in face] for face in faces],
              'Connected metre-scale orthographic depth reconstruction.')
    material_uv = tree.data.uv_layers['UVMap'].data
    for face in tree.data.polygons:
        face.use_smooth = True
        for i, corner in zip(face.loop_indices, face.vertices):
            material_uv[i].uv = uv[corner]


def render_albedo_without_baked_lighting(material, floor=None):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    surfaces = [node for node in nodes if node.type == 'BSDF_PRINCIPLED' and node.outputs[0].is_linked]
    if not surfaces:
        raise ValueError('Pine albedo requires a connected Principled surface in ' + material.name)
    clear = nodes.new('ShaderNodeBsdfTransparent')

    def material_mask(surface, value):
        mix = nodes.new('ShaderNodeMixShader')
        if isinstance(value, bpy.types.NodeSocket):
            links.new(value, mix.inputs[0])
        else:
            mix.inputs[0].default_value = value
        links.new(clear.outputs[0], mix.inputs[1])
        links.new(surface, mix.inputs[2])
        return mix.outputs[0]

    for bsdf in surfaces:
        targets = [link.to_socket for link in bsdf.outputs[0].links]
        colour = bsdf.inputs['Base Color']
        unlit = nodes.new('ShaderNodeEmission')
        if colour.is_linked:
            links.new(colour.links[0].from_socket, unlit.inputs['Color'])
        else:
            unlit.inputs['Color'].default_value = colour.default_value
        surface = unlit.outputs['Emission']
        alpha = bsdf.inputs['Alpha']
        if alpha.is_linked or alpha.default_value < 1.:
            surface = material_mask(surface, alpha.links[0].from_socket if alpha.is_linked else alpha.default_value)
        for target in targets:
            links.new(surface, target)

    if floor is not None:
        output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL' and node.is_active_output)
        socket = output.inputs['Surface']
        position = nodes.new('ShaderNodeNewGeometry')
        split = nodes.new('ShaderNodeSeparateXYZ')
        links.new(position.outputs['Position'], split.inputs[0])
        cut = nodes.new('ShaderNodeMath')
        cut.operation = 'GREATER_THAN'
        links.new(split.outputs['Z'], cut.inputs[0])
        cut.inputs[1].default_value = floor
        links.new(material_mask(socket.links[0].from_socket, cut.outputs[0]), socket)


def alpha_measurement(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        width, height = image.size
        rgba = array('f', [0.]) * (width * height * 4)
        image.pixels.foreach_get(rgba)
        alpha = rgba[3::4]
    finally:
        bpy.data.images.remove(image)
    footprint = []
    for index, value in enumerate(alpha):
        if value >= NATIVE_CUTOFF:
            footprint.append((index % width, index // width))
    if not footprint:
        raise ValueError('Pine impostor has no visible LOD0 canopy.')
    left, right = min(x for x, _ in footprint), max(x for x, _ in footprint)
    floor, top = min(y for _, y in footprint), max(y for _, y in footprint)
    bounds = (right - left + 1) * (top - floor + 1)
    if bounds <= len(footprint):
        raise ValueError('Pine impostor alpha lacks porosity within its crop.')
    evidence = {'dimensions': [width, height], 'opaqueFootprint': len(footprint),
                'alphaBoundsPixels': bounds, 'antialiasedPixels': sum(0. < value < 1. for value in alpha)}

    def occupied(u, v):
        return 0. <= u < 1. and 0. <= v < 1. and alpha[int(v * height) * width + int(u * width)] >= NATIVE_CUTOFF

    return evidence, occupied


def depth_from_actual_geometry(tree, right, toward, distance, frame, occupied=None):
    # Antialias visibility is in the RGBA render. Centre and neighbouring
    # orthographic rays give a stable displacement even on scattered foliage.
    left, low, width, height = frame
    hits = {}
    for row in range(DEPTH_ROWS):
        for col in range(DEPTH_COLUMNS):
            values = []
            for du, dv in ((0., 0.), (-.29, 0.), (.29, 0.), (0., -.29), (0., .29),
                           (-.25, -.25), (-.25, .25), (.25, -.25), (.25, .25)):
                u, v = (col + du) / (DEPTH_COLUMNS - 1), (row + dv) / (DEPTH_ROWS - 1)
                if occupied is not None and not occupied(u, v):
                    continue
                x = left + width * u
                y = low + height * v
                ray = right * x + toward * distance + Vector((0., y, 0.))
                _, _, _, depth = tree.ray_cast(Vector((ray.x, -ray.z, ray.y)),
                                               Vector((-toward.x, toward.z, 0.)))
                if depth is not None:
                    values.append(distance - depth)
            if values:
                hits[(col, row)] = median(values)
    if len(hits) < 4:
        raise RuntimeError('Insufficient depth intersections for a Pine impostor view.')
    output = []
    for row in range(DEPTH_ROWS):
        for col in range(DEPTH_COLUMNS):
            if (col, row) in hits:
                output.append(hits[(col, row)])
                continue
            nearest = min(hits, key=lambda p: (p[0] - col) ** 2 + (p[1] - row) ** 2)
            output.append(hits[nearest])
    return [round(value, 5) for value in output], len(hits)


def original_prototype(scene, profile):
    from pine_gate import bark_tube
    from pine_materials import apply_scan
    import snow_roof as mesh

    mesh.CACHE.clear()
    mesh.STATIC = bpy.data.collections.new('DENSE PINE PROTOTYPE')
    scene.collection.children.link(mesh.STATIC)
    bark = apply_scan(mesh.material('Knotted pine bark', '#c1b49f'), 'knotted_pine_bark', .83)
    leaf = mesh.material('Modelled pine needles', '#587541', rough=.78)
    for material in (bark, leaf):
        render_albedo_without_baked_lighting(material)
    height = PROTOTYPE_HEIGHTS[profile]
    trunk, _ = prototype_trunk(CROWNS[profile], height)
    foliage = grow_crown(profile, CROWNS[profile], trunk, 0., bark, bark_tube, dense=True)
    vertices, faces, _, _ = needle_mesh(foliage)
    obj = mesh.mesh_object('Dense prototype needles', vertices, faces, leaf, 'prototype')
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bpy.context.view_layer.update()
    points, triangles = [], []
    for obj in mesh.STATIC.objects:
        source = obj.data
        offset = len(points)
        points.extend(obj.matrix_world @ vertex.co for vertex in source.vertices)
        source.calc_loop_triangles()
        triangles.extend(tuple(offset + i for i in triangle.vertices) for triangle in source.loop_triangles)
    tree = BVHTree.FromPolygons(points, triangles, all_triangles=True)
    by_engine = [Vector((p.x, p.z, -p.y)) for p in points]
    bottom, top = min(p.y for p in by_engine), max(p.y for p in by_engine)
    return tree, bottom, top, height, by_engine, len(triangles)


def render_prototype(profile, angles, output, samples, width, native_path):
    from bake_export import configure_cycles

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    native = None
    if native_path is not None:
        obj = load_tree(scene, native_path, profile)
        native = NativeSurface(obj, {angle: azimuth_axes(angle)[0] for angle in angles})
        for material in native.materials:
            if material is not None:
                render_albedo_without_baked_lighting(material, native.crown_floor)
        tree = native
        bottom, top, height = native.crown_floor, native.height, native.height
        triangle_count = sum(native.evidence['triangles'].values())
    else:
        tree, bottom, top, height, by_engine, triangle_count = original_prototype(scene, profile)

    configure_cycles(scene, SimpleNamespace(samples=samples, device='METAL', skip_bake=False, export_only=False))
    if native:
        scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_x = width
    scene.render.resolution_y = round(width * 1.55)
    scene.render.resolution_percentage = 100
    data = bpy.data.cameras.new('Orthographic tree capture')
    data.type = 'ORTHO'
    data.clip_end = height * 12
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    records = []
    for angle in angles:
        right, toward = azimuth_axes(angle)
        if native:
            x0, x1 = native.angle_bounds[angle]
        else:
            projected = [point.dot(right) for point in by_engine]
            x0, x1 = min(projected), max(projected)
        center_x = (x1 + x0) * .5
        center_y = (top + bottom) * .5
        aspect = scene.render.resolution_x / scene.render.resolution_y
        data.ortho_scale = max((x1 - x0) / aspect, top - bottom) * 1.09
        camera_frame = data.view_frame(scene=scene)
        frame_w = max(p.x for p in camera_frame) - min(p.x for p in camera_frame)
        frame_h = max(p.y for p in camera_frame) - min(p.y for p in camera_frame)
        frame = (center_x - frame_w * .5, center_y - frame_h * .5, frame_w, frame_h)
        distance = height * 4
        position = right * center_x + toward * distance + Vector((0., center_y, 0.))
        camera.location = Vector((position.x, -position.z, position.y))
        camera.rotation_euler = Vector((-toward.x, toward.z, 0.)).to_track_quat('-Z', 'Y').to_euler()
        name = f'{profile}-{angle:+03d}.png'
        image_path = output / name
        scene.render.filepath = str(image_path)
        if 'FINISHED' not in bpy.ops.render.render(write_still=True):
            raise RuntimeError('Pine impostor render did not finish: ' + name)
        extra, occupied = {}, None
        if native:
            coverage, occupied = alpha_measurement(image_path)
            extra = {'nativeObject': native.evidence['object'], 'alphaCutoff': NATIVE_CUTOFF,
                     'coverage': coverage}
        depths, hits = depth_from_actual_geometry(tree, right, toward, distance, frame, occupied=occupied)
        records.append({'azimuthDegrees': angle, 'file': name, 'frameMetres': frame,
                        'prototypeHeightMetres': height, 'depthMetres': depths, 'measuredGridSites': hits,
                        'imageSha256': sha256(image_path.read_bytes()).hexdigest(),
                        'densePrototypeTriangles': triangle_count, **extra})
        print('PINE_IMPOSTOR', profile, angle, name, 'DEPTH_SITES', hits,
              'COVERAGE', extra.get('coverage'), flush=True)
    return records, native.evidence if native else None


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--profile', choices=tuple(CROWNS), action='append')
    parser.add_argument('--angles', type=int, nargs='+', default=[-35, 35])
    parser.add_argument('--width', type=int, help='128 for procedural or 384 for native, unless specified.')
    parser.add_argument('--samples', type=int, default=8)
    parser.add_argument('--polyhaven-blend', type=Path, help='Official Blender LOD0 with its adjacent textures directory.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    profiles = args.profile or ['young', 'ridge']
    angles = list(dict.fromkeys(args.angles))
    native_path = args.polyhaven_blend.resolve() if args.polyhaven_blend else None
    width = args.width if args.width is not None else 384 if native_path else 128
    if width < 1 or args.samples < 1:
        parser.error('Positive width and samples are required.')
    if native_path and (not 256 <= width <= 384 or any(profile not in OBJECTS for profile in profiles)):
        parser.error('Native crowns require a width of 256–384 and young or ridge profiles.')
    native_source = verify_source(native_path) if native_path else None

    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    views, provenance = {}, {}
    for profile in dict.fromkeys(profiles):
        views[profile], measured = render_prototype(profile, angles, output, args.samples, width, native_path)
        if measured:
            provenance[profile] = measured
    receipt = {'version': 1, 'prototypeSha256': NATIVE_SHA256 if native_path else hero_source_hash(),
               'render': 'Cycles Metal albedo / transparent studio', 'samples': args.samples,
               'depthGrid': [DEPTH_COLUMNS, DEPTH_ROWS], 'views': views}
    if native_source:
        receipt['nativeSource'] = {**native_source, 'profiles': provenance,
                                   'loaderSha256': loader_hash(),
                                   'rendererSha256': sha256(Path(__file__).read_bytes()).hexdigest(),
                                   'blenderBuildHash': bpy.app.build_hash.decode('ascii')}
    (output / 'impostors.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
