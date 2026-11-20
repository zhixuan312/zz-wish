"""Simulate and bake a red prayer cloth seated around the Pine Gate dish."""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import interpolate_bezier
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))


SCALE = 10
WIDTH = .030
THICKNESS = .00032
ACROSS = 9
PROFILE = [(0, 0), (.038, 0), (.042, .001), (.045, .0035), (.052, .006),
           (.057, .0105), (.058, .014), (.0565, .0165), (.054, .017),
           (.0515, .0144), (.048, .0105), (.0465, .009), (0, .009)]


def blender(point):
    x, y, z = point
    return Vector((x, -z, y)) * SCALE


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([blender(p) for p in vertices], [], faces)
    data.update()
    body = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(body)
    body.data.materials.append(mat)
    for face in body.data.polygons:
        face.use_smooth = True
    return body


def lathe(name, profile, mat):
    count = 96
    verts = [(r * math.cos(i * math.tau / count), y, r * math.sin(i * math.tau / count))
             for r, y in profile for i in range(count)]
    faces = [(row * count + i, (row + 1) * count + i,
              (row + 1) * count + (i + 1) % count, row * count + (i + 1) % count)
             for row in range(len(profile) - 1) for i in range(count)]
    return mesh(name, verts, faces, mat)


def radius_at(height):
    if height > .0174:
        return 0
    hits = [a[0] + (b[0] - a[0]) * (height - a[1]) / (b[1] - a[1])
            for a, b in zip(PROFILE, PROFILE[1:])
            if a[1] != b[1] and min(a[1], b[1]) <= height <= max(a[1], b[1])]
    return max(hits, default=.054 if height > .014 else .038)


def knots():
    # Thread the first end under the crossing, wrap the foot, then return
    # through the upper bight. The two passes have real vertical clearance.
    points = [(-.071, .0023, .117), (-.058, .0057, .096), (-.035, .0085, .085),
              (-.021, .0043, .069), (-.003, .0075, .055), (.015, .0136, .057),
              (.023, .0171, .070), (.032, .0116, .061)]
    for i in range(35):
        angle = math.radians(48 - 277 * i / 34)
        points.append((math.cos(angle) * .0578,
                       .0040 + .0008 * math.sin(angle * 4 + .8),
                       math.sin(angle) * .0578))
    points.extend([(-.032, .0118, .060), (-.020, .0190, .062), (-.006, .0235, .061),
                   (.009, .0195, .069), (.015, .009, .084), (.027, .005, .095),
                   (.042, .004, .110), (.063, .0024, .120)])
    return [Vector(p) for p in points]


def ribbon(mat):
    controls = knots()
    points = []
    for j, (a, b) in enumerate(zip(controls, controls[1:])):
        left = controls[max(0, j - 1)]
        right = controls[min(len(controls) - 1, j + 2)]
        da = (b - left).normalized() * (b - a).length / 3
        db = (right - a).normalized() * (b - a).length / 3
        points.extend(interpolate_bezier(a, a + da, b - db, b, max(3, round((b - a).length / .0028)) + 1)[:-1])
    points.append(controls[-1])
    distances = [0.]
    for a, b in zip(points, points[1:]):
        distances.append(distances[-1] + (b - a).length)
    length = distances[-1]
    vertices, faces, uv, pinned = [], [], [], []
    for i, (centre, distance) in enumerate(zip(points, distances)):
        tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        side = Vector((-tangent.z, 0, tangent.x)).normalized()
        from_end = min(distance, length - distance)
        tail = max(0., min(1., (from_end - .036) / .043))
        knot = centre.z > .052 and abs(centre.x) < .03
        pinch = (.33 if knot else .53) * tail + 1 - tail
        for col in range(ACROSS):
            u = col / (ACROSS - 1)
            q = u - .5
            point = centre + side * (WIDTH * q * pinch)
            wave = (math.sin(4 * math.pi * u + distance * 71) + .35 * math.sin(distance * 184 + 18 * u))
            point.y += (.0024 * tail + .001 * (1 - tail)) * wave
            if from_end < .007:
                point += tangent * (.0013 * math.cos(col * 2.31) * (1 - from_end / .007))
            point.y = max(.00064, point.y)
            minimum = radius_at(point.y) + .00095
            r = math.hypot(point.x, point.z)
            if r < minimum:
                point.x *= minimum / r
                point.z *= minimum / r
            vertices.append(point)
            uv.append((u, distance / length))
            if distance > .068 and length - distance > .064:
                pinned.append(len(vertices) - 1)
            if i and col:
                n = len(vertices) - 1
                faces.append((n - ACROSS - 1, n - ACROSS, n, n - 1))
    obj = mesh('One palm-width length of coarse red cloth', vertices, faces, mat)
    texel = obj.data.uv_layers.new(name='Woven length')
    for polygon in obj.data.polygons:
        for index in polygon.loop_indices:
            texel.data[index].uv = uv[obj.data.loops[index].vertex_index]
    pins = obj.vertex_groups.new(name='Tied wrap and knot')
    pins.add(pinned, 1., 'REPLACE')
    return obj, pins


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def simulate(scene, obj, pins, colliders):
    for obstacle in colliders:
        obstacle.modifiers.new('Cloth contact', 'COLLISION')
        obstacle.collision.thickness_outer = .00030 * SCALE
    scene.gravity = (0, 0, -9.81 * SCALE)
    cloth = obj.modifiers.new('Gravity and collision settle the free tails', 'CLOTH')
    cloth.settings.quality = 11
    cloth.settings.mass = .16
    cloth.settings.tension_stiffness = 35
    cloth.settings.compression_stiffness = 32
    cloth.settings.shear_stiffness = 17
    cloth.settings.bending_stiffness = .085
    cloth.settings.vertex_group_mass = pins.name
    cloth.collision_settings.collision_quality = 5
    cloth.collision_settings.distance_min = .00040 * SCALE
    cloth.collision_settings.use_self_collision = True
    cloth.collision_settings.self_distance_min = .00044 * SCALE
    cloth.point_cache.frame_end = 32
    active(obj)
    for frame in range(1, 33):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
    bpy.ops.object.modifier_apply(modifier=cloth.name)
    # The solver is scaled to resolve submillimetre contacts. The visible
    # fabric remains an open, double-sided woven surface at scene scale.
    for vertex in obj.data.vertices:
        vertex.co /= SCALE
    for obstacle in colliders:
        for vertex in obstacle.data.vertices:
            vertex.co /= SCALE
        obstacle.modifiers.clear()
    heights = [vertex.co.z for vertex in obj.data.vertices]
    clearance = min(math.hypot(vertex.co.x, vertex.co.y) - radius_at(vertex.co.z)
                    for vertex in obj.data.vertices)
    if min(heights) < -1e-5 or clearance < -1e-5:
        raise RuntimeError(f'Cloth simulation entered stone or bowl: {min(heights):.6f}, {clearance:.6f} m')
    return {'simulationFrames': 32, 'minimumFloorGapMm': 1000 * min(heights),
            'minimumTraySeparationMm': 1000 * clearance, 'widthMm': WIDTH * 1000,
            'vertices': len(obj.data.vertices)}


def weave_texture(path):
    height, width = 192, 96
    y, x = np.indices((height, width), dtype=np.float32)
    a, b = x * math.tau * .18, y * math.tau * .225
    ribs = .45 * np.sin(a + .31 * np.sin(b)) + .45 * np.sin(b + .28 * np.sin(a))
    nx = np.roll(ribs, 1, 1) - np.roll(ribs, -1, 1)
    ny = np.roll(ribs, 1, 0) - np.roll(ribs, -1, 0)
    norms = np.stack((nx * .46, ny * .44, np.ones_like(nx)), axis=-1)
    norms /= np.linalg.norm(norms, axis=-1)[..., None]
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[..., :3] = .5 + .5 * norms
    image = bpy.data.images.new('Baked raised warp and weft tangent normals', width, height, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(path)
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


def textures(scene, cloth, out):
    mat = cloth.active_material
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Sheen Weight'].default_value = .22
    source = nodes.new('ShaderNodeTexImage')
    source.image = weave_texture(out / 'weave-normal.png')
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .62
    links.new(source.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    ao = bpy.data.images.new('Baked cloth, stone and wrap contact AO', 96, 192, alpha=False)
    ao.colorspace_settings.name = 'Non-Color'
    image_node = nodes.new('ShaderNodeTexImage')
    image_node.image = ao
    nodes.active = image_node
    active(cloth)
    scene.cycles.samples = 16
    bpy.ops.object.bake(type='AO', margin=3)
    ao.filepath_raw = str(out / 'cloth-ao.png')
    ao.file_format = 'PNG'
    ao.save()
    ao.pack()
    group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    occlusion = nodes.new('ShaderNodeGroup')
    occlusion.node_tree = group
    links.new(image_node.outputs['Color'], occlusion.inputs['Occlusion'])


def light(name, location, color, power, radius):
    data = bpy.data.lights.new(name, 'POINT')
    data.color, data.energy, data.shadow_soft_size = color, power, radius
    obj = bpy.data.objects.new(name, data)
    obj.location = blender(location) / SCALE
    bpy.context.collection.objects.link(obj)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.out.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    from pine_valley_backdrop import set_device
    import pine_valley_backdrop
    pine_valley_backdrop.bpy = bpy
    set_device(scene, 'METAL')
    scene.unit_settings.system = 'METRIC'
    stone = material('Rough dark shrine granite', (.17, .16, .137), .88)
    glaze = material('Turned dark olive ceramic', (.083, .112, .082), .35)
    red = material('Fresh dyed red coarse weave', (.39, .015, .023), .89)
    floor = mesh('Stone bearing plane', [(-.3, 0, -.27), (-.3, 0, .29),
                                         (.3, 0, .29), (.3, 0, -.27)], [(0, 1, 2, 3)], stone)
    tray = lathe('Runtime-profile Pine Gate ceramic dish', PROFILE, glaze)
    cloth, pins = ribbon(red)
    receipt = simulate(scene, cloth, pins, [floor, tray])
    textures(scene, cloth, args.out)
    active(cloth)
    model = args.out / 'pine-visitor-cloth.glb'
    bpy.ops.export_scene.gltf(filepath=str(model), export_format='GLB', use_selection=True,
                              export_yup=True, export_materials='EXPORT')
    wax = material('Warm candle wax', (.69, .47, .21), .36)
    wax.node_tree.nodes.get('Principled BSDF').inputs['Subsurface Weight'].default_value = .13
    candle = lathe('Wax candle in the tray', [(0, .009), (.022, .009), (.021, .019), (.020, .113),
                    (.018, .123), (.015, .121), (.010, .117), (0, .117)], wax)
    wick = lathe('Blackened wick', [(.0012, .117), (.0010, .128), (.00055, .131)],
                 material('Charred cotton', (.018, .009, .004), .93))
    flame_mat = material('Translucent warm flame core', (1., .30, .036), .35)
    emitter = flame_mat.node_tree.nodes.get('Principled BSDF')
    emitter.inputs['Emission Color'].default_value = (1., .39, .075, 1)
    emitter.inputs['Emission Strength'].default_value = 7.
    flame = lathe('One small wick flame', [(0, .129), (.0015, .132), (.0036, .139),
                 (.0025, .148), (.0011, .152), (0, .156)], flame_mat)
    for obj in [candle, wick, flame]:
        for vertex in obj.data.vertices:
            vertex.co /= SCALE
    light('Warm light from the visitor wick', (0, .139, 0), (1., .49, .22), .53, .013)
    light('Cool reflected sky along the open ledge', (-.24, .30, .22), (.56, .71, 1.), 3.1, .18)
    camera_data = bpy.data.cameras.new('Pine Gate settled burning camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = blender((-.055, .092, .44)) / SCALE
    target = blender((0, .074, -.045)) / SCALE
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.lens = 12 / math.tan(math.radians(17))
    camera_data.sensor_height = 24
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.filepath = str(args.out / 'burning.png')
    bpy.ops.render.render(write_still=True)
    receipt['assetBytes'] = model.stat().st_size
    receipt['maps'] = ['baked tangent normal', 'baked ambient occlusion']
    (args.out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('PINE_VISITOR_CLOTH', json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
