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
import sys
from types import SimpleNamespace

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_hero_trees import CROWNS, grow_crown, needle_mesh, prototype_trunk, trunk_point

PROTOTYPE_HEIGHTS = {'young': 7., 'ridge': 8.3, 'old': 11.}
DEPTH_COLUMNS = 10
DEPTH_ROWS = 16


def azimuth_axes(degrees):
    turn = math.radians(degrees)
    return Vector((math.cos(turn), 0., -math.sin(turn))), Vector((math.sin(turn), 0., math.cos(turn)))


def load_impostors(path):
    raw = path.read_bytes()
    data = json.loads(raw)
    if (data['version'] != 1 or data['prototypeSha256'] != hero_source_hash()
            or data['depthGrid'] != [DEPTH_COLUMNS, DEPTH_ROWS]):
        raise ValueError('Pine impostors were generated from different prototype source.')
    for profile, rows in data['views'].items():
        if profile not in CROWNS or not rows:
            raise ValueError('Unknown or empty Pine impostor profile: ' + profile)
        for view in rows:
            name = view['file']
            if Path(name).name != name or not name.endswith('.png'):
                raise ValueError('Unexpected Pine impostor texture path: ' + name)
            image = path.parent / name
            raw_image = image.read_bytes()
            if not raw_image.startswith(b'\x89PNG\r\n\x1a\n') or sha256(raw_image).hexdigest() != view['imageSha256']:
                raise ValueError('Pine impostor image differs from render receipt: ' + name)
            frame = view['frameMetres']
            if (len(frame) != 4 or any(not math.isfinite(value) for value in frame)
                    or min(frame[2:]) <= 0 or view['prototypeHeightMetres'] != PROTOTYPE_HEIGHTS[profile]):
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
    reference, _ = prototype_trunk(CROWNS[profile], view['prototypeHeightMetres'])
    height = trunk[-1].y - trunk[0].y
    scale = height / view['prototypeHeightMetres']
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
        cutoff.inputs[1].default_value = .22
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


def depth_from_actual_geometry(tree, right, toward, distance, frame):
    # Antialias visibility is in the RGBA render. Centre and neighbouring
    # orthographic rays give a stable displacement even on scattered foliage.
    left, low, width, height = frame
    hits = {}
    for row in range(DEPTH_ROWS):
        for col in range(DEPTH_COLUMNS):
            values = []
            for du, dv in ((0., 0.), (-.29, 0.), (.29, 0.), (0., -.29), (0., .29),
                           (-.25, -.25), (-.25, .25), (.25, -.25), (.25, .25)):
                x = left + width * (col + du) / (DEPTH_COLUMNS - 1)
                y = low + height * (row + dv) / (DEPTH_ROWS - 1)
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


def render_prototype(profile, angles, output, samples, width):
    from bake_export import configure_cycles
    from pine_gate import bark_tube
    from pine_materials import apply_scan
    import snow_roof as mesh

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
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
    configure_cycles(scene, SimpleNamespace(samples=samples, device='METAL', skip_bake=False, export_only=False))
    scene.view_settings.view_transform = 'Standard'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
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
        xs = [point.dot(right) for point in by_engine]
        bottom, top = min(p.y for p in by_engine), max(p.y for p in by_engine)
        center_x = (max(xs) + min(xs)) * .5
        center_y = (top + bottom) * .5
        aspect = scene.render.resolution_x / scene.render.resolution_y
        data.ortho_scale = max((max(xs) - min(xs)) / aspect, top - bottom) * 1.09
        camera_frame = data.view_frame(scene=scene)
        frame_w = max(p.x for p in camera_frame) - min(p.x for p in camera_frame)
        frame_h = max(p.y for p in camera_frame) - min(p.y for p in camera_frame)
        frame = (center_x - frame_w * .5, center_y - frame_h * .5, frame_w, frame_h)
        distance = height * 4
        position = right * center_x + toward * distance + Vector((0., center_y, 0.))
        camera.location = Vector((position.x, -position.z, position.y))
        camera.rotation_euler = Vector((-toward.x, toward.z, 0.)).to_track_quat('-Z', 'Y').to_euler()
        depths, hits = depth_from_actual_geometry(tree, right, toward, distance, frame)
        name = f'{profile}-{angle:+03d}.png'
        scene.render.filepath = str(output / name)
        bpy.ops.render.render(write_still=True)
        records.append({'azimuthDegrees': angle, 'file': name, 'frameMetres': frame,
                        'prototypeHeightMetres': height, 'depthMetres': depths, 'measuredGridSites': hits,
                        'imageSha256': sha256((output / name).read_bytes()).hexdigest(),
                        'densePrototypeTriangles': len(triangles)})
        print('PINE_IMPOSTOR', profile, angle, name, 'DEPTH_SITES', hits, flush=True)
    return records


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--profile', choices=tuple(CROWNS), action='append')
    parser.add_argument('--angles', type=int, nargs='+', default=[-35, 35])
    parser.add_argument('--width', type=int, default=128)
    parser.add_argument('--samples', type=int, default=8)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    profiles = args.profile or ['young', 'ridge']
    views = {profile: render_prototype(profile, args.angles, output, args.samples, args.width)
             for profile in dict.fromkeys(profiles)}
    (output / 'impostors.json').write_text(json.dumps(
        {'version': 1, 'prototypeSha256': hero_source_hash(), 'render': 'Cycles Metal albedo / transparent studio',
         'samples': args.samples, 'depthGrid': [DEPTH_COLUMNS, DEPTH_ROWS], 'views': views},
        sort_keys=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
