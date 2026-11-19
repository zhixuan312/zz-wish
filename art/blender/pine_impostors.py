"""Render and reconstruct distant pine crowns from the dense prototype meshes.

Render into art/build, then pass the resulting impostors.json to pine_gate.py.
The colour PNGs contain albedo and cutout alpha for the place's lightmaps. The
coarse mesh displaces that image using orthographic intersection depths from
the same Blender geometry. The scene keeps its original trunk and roots.
"""

from argparse import ArgumentParser
from hashlib import sha256
import json
import math
from pathlib import Path
from statistics import median
import struct
import sys
from types import SimpleNamespace
from zlib import decompressobj

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_hero_trees import CROWNS, grow_crown, needle_mesh, prototype_trunk, trunk_point
from pine_native_crowns import (
    NativeSurface, NATIVE_SHA256, OBJECTS, UV_ATTRIBUTE, asset_provenance, load_tree, loader_hash, material_evidence,
    native_albedo, verify_source,
)

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
            attribute = source.get('uvAttribute', {})
            transforms = source.get('materialUvTransforms', {})
            if (source['object'] != OBJECTS.get(profile) or source['lod'] != 0
                    or len(mount) != 3 or not all(math.isfinite(v) for v in mount)
                    or not 0. <= source['crownCutMetres'] < source['heightMetres']
                    or source['triangles']['foliage'] < 1_000_000 or source.get('uvMap') != UV_ATTRIBUTE
                    or attribute.get('name') != UV_ATTRIBUTE or attribute.get('dataType') != 'FLOAT_VECTOR'
                    or attribute.get('domain') != 'CORNER' or attribute.get('corners', 0) < 1_000_000
                    or source.get('materialMaps') != material_evidence()
                    or transforms.keys() != material_evidence().keys()):
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
                coverage, _ = alpha_measurement(raw_image, name)
                if (view['nativeObject'] != source['object'] or view['alphaCutoff'] != NATIVE_CUTOFF
                        or coverage != view['coverage']):
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


def render_albedo_without_baked_lighting(material):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    colour = nodes.get('Principled BSDF').inputs['Base Color']
    unlit = nodes.new('ShaderNodeEmission')
    if colour.is_linked:
        links.new(colour.links[0].from_socket, unlit.inputs['Color'])
    else:
        unlit.inputs['Color'].default_value = colour.default_value
    links.new(unlit.outputs['Emission'], next(node for node in nodes if node.type == 'OUTPUT_MATERIAL').inputs['Surface'])


def rgba_rows(raw, name):
    # Native plates are single-view, non-interlaced RGBA8 PNG files. Read the
    # encoded scanlines to check the published colour and alpha independently
    # of Blender's image cache, display transform, or alpha association.
    width, height, bits, mode, codec, filters, interlace = struct.unpack_from('>IIBBBBB', raw, 16)
    if (not 256 <= width <= 384 or height != round(width * 1.55)
            or (bits, mode, codec, filters, interlace) != (8, 6, 0, 0, 0)):
        raise ValueError('Pine native plate is not an approved RGBA8 crop: ' + name)
    position, compressed = 8, []
    while position + 12 <= len(raw):
        size, kind = struct.unpack_from('>I4s', raw, position)
        end = position + 12 + size
        if end > len(raw):
            raise ValueError('Truncated native Pine PNG: ' + name)
        if kind == b'IDAT':
            compressed.append(raw[position + 8:end - 4])
        if kind == b'IEND':
            break
        position = end
    stride = width * 4
    length = (stride + 1) * height
    inflater = decompressobj()
    data = inflater.decompress(b''.join(compressed), length + 1)
    if len(data) != length or not inflater.eof:
        raise ValueError('Pine native PNG has an invalid scanline length: ' + name)

    def paeth(left, above, corner):
        prediction = left + above - corner
        dl, da, dc = (abs(prediction - value) for value in (left, above, corner))
        return left if dl <= min(da, dc) else above if da <= dc else corner

    previous = bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        mode, row = data[start], bytearray(data[start + 1:start + 1 + stride])
        if mode > 4:
            raise ValueError('Unknown Pine PNG filter: ' + name)
        if mode:
            for i, code in enumerate(row):
                left = row[i - 4] if i >= 4 else 0
                above = previous[i]
                if mode == 1:
                    predictor = left
                elif mode == 2:
                    predictor = above
                elif mode == 3:
                    predictor = (left + above) // 2
                else:
                    predictor = paeth(left, above, previous[i - 4] if i >= 4 else 0)
                row[i] = (code + predictor) & 255
        previous = row
        yield width, height, row


def alpha_measurement(raw, name):
    footprint, alpha = [], bytearray()
    total = bright = chromatic = 0
    sums, peaks, luminance = [0, 0, 0], [0, 0, 0], []
    cutoff = math.ceil(NATIVE_CUTOFF * 255)
    for y, (width, height, row) in enumerate(rgba_rows(raw, name)):
        alpha.extend(row[3::4])
        for x in range(width):
            r, g, b, a = row[x * 4:x * 4 + 4]
            if a >= cutoff:
                footprint.append((x, y))
            if a < 60:
                continue
            total += 1
            bright += max(r, g, b) >= 26
            chromatic += max(r, g, b) - min(r, g, b) >= 8
            luminance.append((54 * r + 183 * g + 19 * b + 128) >> 8)
            for c, value in enumerate((r, g, b)):
                sums[c] += value
                peaks[c] = max(peaks[c], value)
    if total < 256 or not footprint:
        raise ValueError('Pine impostor has no measurable LOD0 albedo: ' + name)
    left, right = min(x for x, _ in footprint), max(x for x, _ in footprint)
    floor, top = min(y for _, y in footprint), max(y for _, y in footprint)
    bounds = (right - left + 1) * (top - floor + 1)
    if bounds <= len(footprint):
        raise ValueError('Pine impostor alpha lacks porosity within its crop: ' + name)
    luminance.sort()
    p10, p90 = (luminance[math.floor((total - 1) * fraction)] for fraction in (.10, .90))
    color = {'minAlphaByte': 60, 'pixels': total, 'meanRgb': [round(value / total, 4) for value in sums],
             'maxRgb': peaks, 'brightFraction': round(bright / total, 5),
             'chromaticFraction': round(chromatic / total, 5), 'lumaP10P90': [p10, p90]}
    if bright / total < .55 or chromatic / total < .25 or p90 - p10 < 8:
        raise ValueError(f'Pine native albedo is black, gray or flat: {name} {color}')
    evidence = {'dimensions': [width, height], 'opaqueFootprint': len(footprint), 'alphaBoundsPixels': bounds,
                'antialiasedPixels': sum(0 < value < 255 for value in alpha), 'albedoRgb8': color}

    def occupied(u, v):
        if not (0. <= u < 1. and 0. <= v < 1.):
            return False
        y = height - 1 - int(v * height)
        return alpha[y * width + int(u * width)] >= cutoff

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
        native_albedo(obj, native_path, native)
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
            coverage, occupied = alpha_measurement(image_path.read_bytes(), name)
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
