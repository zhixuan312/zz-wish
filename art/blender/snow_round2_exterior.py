"""Bounded Round 2 exterior construction layer over the accepted Snow18 source.

Call apply(scene) in an unsaved source process. This module never renders,
bakes, saves, translates resting props, or changes lights. Engine points use
X/Y-up/Z; existing object identities and contact ownership remain intact.
"""
import json
import math
import random

import bpy
import bmesh
from mathutils import Vector

from snow_lightmap_charts import source_uv, tube_coordinates
import snow_round1_details as tree_builder


def _point(p):
    return Vector((p[0], -p[2], p[1]))


def _engine(p):
    return Vector((p.x, p.z, -p.y))


def _triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _material_uv(obj, metres):
    uv = obj.data.uv_layers.get('UVMap') or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        normal = obj.matrix_world.to_3x3() @ face.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][axis]
        for li in face.loop_indices:
            p = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = (p[a] / metres, p[b] / metres)
    obj.data.uv_layers.active = uv
    uv.active_render = True


def _replace(obj, vertices, faces, charts, smooth_faces=0, material_metres=.65):
    old = obj.data
    inverse = obj.matrix_world.inverted()
    mesh = bpy.data.meshes.new(old.name + ' Round2')
    mesh.from_pydata([inverse @ _point(p) for p in vertices], [], faces)
    mesh.update()
    for material in old.materials:
        mesh.materials.append(material)
    obj.data = mesh
    for face in mesh.polygons:
        face.use_smooth = face.index < smooth_faces
    _material_uv(obj, material_metres)
    source_uv(obj, charts, 'Round2 real closed construction / connected metre-scale charts.')
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def _closed_step(obj, index):
    width, height, depth = 3.2, .2, .43
    cy, cz = .5 - index * .2, 4.8 + index * .4
    nx, nz, vertices, faces, charts = 40, 4, [], [], []
    for row in range(nz + 1):
        t = row / nz
        for col in range(nx + 1):
            x = -width / 2 + width * col / nx
            wear = .025 * math.exp(-(x / .73) ** 2) * t * t
            chip = sum(.013 * math.exp(-((x - c) / .07) ** 2)
                       for c in [-1.17, -.43, .81, 1.3]) * t ** 5
            nose = .016 * math.sin(x * 14.7) * (.4 + .6 * math.sin(x * 3.1) ** 2) * t ** 7
            # The top meets a narrow real nosing bevel, not disconnected strips.
            inset_x = .007 if col == 0 else -.007 if col == nx else 0
            inset_z = .007 if row == 0 else -.007 if row == nz else 0
            vertices.append((x + inset_x, cy + height / 2 - wear - chip,
                             cz - depth / 2 + depth * t - nose + inset_z))
    for row in range(nz):
        for col in range(nx):
            i = row * (nx + 1) + col
            face = (i, i + 1, i + nx + 2, i + nx + 1)
            faces.append(face)
            charts.append([(vertices[v][0] + width / 2, vertices[v][2] - cz + depth / 2) for v in face])
    top_faces = len(faces)
    boundary = list(range(nx + 1))
    boundary += [r * (nx + 1) + nx for r in range(1, nz + 1)]
    boundary += [nz * (nx + 1) + c for c in range(nx - 1, -1, -1)]
    boundary += [r * (nx + 1) for r in range(nz - 1, 0, -1)]
    bevel, bottom, lengths = [], [], [0.]
    for i, vi in enumerate(boundary):
        x, y, z = vertices[vi]
        edge_x = -.007 if abs(x + width / 2 - .007) < 1e-5 else .007 if abs(x - width / 2 + .007) < 1e-5 else 0
        edge_z = -.007 if vi <= nx else .007 if vi >= nz * (nx + 1) else 0
        bevel.append(len(vertices))
        vertices.append((x + edge_x, y - .010, z + edge_z))
        bottom.append(len(vertices))
        vertices.append((x + edge_x, cy - height / 2, z + edge_z))
        if i:
            lengths.append(lengths[-1] + (_point(vertices[vi]) - _point(vertices[boundary[i - 1]])).length)
    perimeter = lengths[-1] + (_point(vertices[boundary[0]]) - _point(vertices[boundary[-1]])).length
    count = len(boundary)
    for a in range(count):
        b = (a + 1) % count
        u0, u1 = lengths[a], lengths[b] if b else perimeter
        faces.append((boundary[a], boundary[b], bevel[b], bevel[a]))
        charts.append([(u0, depth + .05), (u1, depth + .05), (u1, depth + .06), (u0, depth + .06)])
        faces.append((bevel[a], bevel[b], bottom[b], bottom[a]))
        charts.append([(u0, depth + .06), (u1, depth + .06),
                       (u1, depth + .05 + vertices[boundary[b]][1] - (cy - height / 2)),
                       (u0, depth + .05 + vertices[boundary[a]][1] - (cy - height / 2))])
    faces.append(tuple(reversed(bottom)))
    charts.append([(vertices[v][0] + width * 1.5 + .1, vertices[v][2] - cz + depth / 2) for v in reversed(bottom)])
    _replace(obj, vertices, faces, charts, top_faces)
    obj['round2_step_construction'] = 'Closed shared-edge worn granite tread, narrow nosing bevel, complete solid risers and bottom; no backface-hiding overlay.'


def _wall_foot(scene, name, dimensions, centre):
    x, y, z = centre
    w, h, d = [v / 2 for v in dimensions]
    vertices = [(x + a, y + b, z + c) for a, b, c in
                [(-w, -h, -d), (w, -h, -d), (w, h, -d), (-w, h, -d),
                 (-w, -h, d), (w, -h, d), (w, h, d), (-w, h, d)]]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.collections['STATIC'].objects.link(obj)
    mesh.materials.append(bpy.data.materials['Worn granite'])
    charts = []
    for i, face in enumerate(faces):
        values = []
        for vi in face:
            p = vertices[vi]
            axes = (0, 1) if i < 2 else (0, 2) if i < 4 else (2, 1)
            values.append((p[axes[0]] + i * 20, p[axes[1]]))
        charts.append(values)
    _replace(obj, vertices, faces, charts, material_metres=.65)
    obj['one_light_static'], obj['region'], obj['lightmap_uv'], obj['units'] = True, 'hall', 'Lightmap', 'metres'
    obj['round2_fixed_construction'] = 'Continuous stone wall foot overlaps the existing plaster and floor/foundation joint; no loose prop placement.'
    return obj


def _court_post(obj):
    # Preserve each actual transformed support endpoint and square footprint.
    points = [_engine(obj.matrix_world @ v.co) for v in obj.data.vertices]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    cx, cz, half = (low[0] + high[0]) / 2, (low[2] + high[2]) / 2, (high[0] - low[0]) / 2
    cut, vertices, faces, charts = .0035, [], [], []
    outline = [(-half + cut, -half), (half - cut, -half), (half, -half + cut), (half, half - cut),
               (half - cut, half), (-half + cut, half), (-half, half - cut), (-half, -half + cut)]
    levels = [(low[1], .001), (low[1] + .004, 0), (high[1] - .004, 0), (high[1], .001)]
    for y, inset in levels:
        for x, z in outline:
            scale = (half - inset) / half
            vertices.append((cx + x * scale, y, cz + z * scale))
    lengths = [0.]
    for i in range(7):
        lengths.append(lengths[-1] + math.dist(outline[i], outline[i + 1]))
    perimeter = lengths[-1] + math.dist(outline[-1], outline[0])
    for ring in range(3):
        for a in range(8):
            b = (a + 1) % 8
            faces.append((ring * 8 + a, ring * 8 + b, (ring + 1) * 8 + b, (ring + 1) * 8 + a))
            u0, u1 = lengths[a], lengths[b] if b else perimeter
            charts.append([(u0, levels[ring][0] - low[1]), (u1, levels[ring][0] - low[1]),
                           (u1, levels[ring + 1][0] - low[1]), (u0, levels[ring + 1][0] - low[1])])
    for ring, reverse in [(0, True), (3, False)]:
        face = list(range(ring * 8, ring * 8 + 8))
        if reverse:
            face.reverse()
        faces.append(tuple(face))
        charts.append([(vertices[v][0] - cx + perimeter + .1, vertices[v][2] - cz + ring * .1) for v in face])
    _replace(obj, vertices, faces, charts, material_metres=.42)
    obj['round2_stone_finish'] = 'Square carved stone upright with narrow 3.5mm eased corners; actual bearing endpoints retained; finer existing photographic UV tiling.'


def _smooth_path(points, radii, radial):
    if radial < 9:
        return points, radii
    p = [Vector(v) for v in points]
    result, rr = [], []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = p[max(0, i - 1)], p[i], p[i + 1], p[min(len(p) - 1, i + 2)]
        midpoint = (2 * p1 + (-p0 + p2) * .5 + (2 * p0 - 5 * p1 + 4 * p2 - p3) * .25 + (-p0 + 3 * p1 - 3 * p2 + p3) * .125) * .5
        result.extend([tuple(p1), tuple(midpoint)])
        rr.extend([radii[i], (radii[i] + radii[i + 1]) / 2])
    return result + [tuple(p[-1])], rr + [radii[-1]]


def _transport_tube(points, radii, radial=10, closed=False, flatten=1):
    if closed:
        raise RuntimeError('Exterior tree layer expects open branch paths')
    points, radii = _smooth_path(points, radii, radial)
    p, vertices, faces, previous = [Vector(v) for v in points], [], [], None
    for j, centre in enumerate(p):
        tangent = (p[min(len(p) - 1, j + 1)] - p[max(0, j - 1)]).normalized()
        if previous is None:
            reference = Vector((0, 1, 0)) if abs(tangent.y) < .9 else Vector((1, 0, 0))
            u = tangent.cross(reference).normalized()
        else:
            u = previous - tangent * previous.dot(tangent)
            if u.length < .000001:
                u = tangent.cross(Vector((1, 0, 0)))
            u.normalize()
        previous = u
        v = tangent.cross(u).normalized()
        for i in range(radial):
            angle = i / radial * math.tau
            vertices.append(tuple(centre + radii[j] * (u * math.cos(angle) + v * math.sin(angle) * flatten)))
    for j in range(len(p) - 1):
        for i in range(radial):
            faces.append((j * radial + i, j * radial + (i + 1) % radial,
                          (j + 1) * radial + (i + 1) % radial, (j + 1) * radial + i))
    faces.extend([tuple(reversed(range(radial))), tuple((len(p) - 1) * radial + i for i in range(radial))])
    return vertices, faces


def _foreground_tree(obj):
    meta = json.loads(obj['winter_tree_geometry'])
    captured = []
    original_tube, original_chart = tree_builder.tube_path, tree_builder.tube_coordinates
    def build(points, radii, radial=10, closed=False, flatten=1):
        if flatten == 1 and radial == 5:
            captured.append((points, radii))
        return _transport_tube(points, radii, radial, closed, flatten)
    def chart(points, radii, radial=10, closed=False):
        points, radii = _smooth_path(points, radii, radial)
        return original_chart(points, radii, radial, closed)
    tree_builder.tube_path, tree_builder.tube_coordinates = build, chart
    try:
        bark, _snow, result = tree_builder.mature_winter_tree_meshes(
            meta['originEngine'], meta['heightMetres'], meta['seed'],
            companion=meta['style'] == 'offset smaller forecourt companion')
    finally:
        tree_builder.tube_path, tree_builder.tube_coordinates = original_tube, original_chart
    charts = result.pop('barkChartUV')
    rng = random.Random(meta['seed'] + 23019)
    selected = captured[::max(1, len(captured) // (6 if 'companion' in meta['style'] else 10))]
    added = 0
    for path, radii in selected[:6 if 'companion' in meta['style'] else 10]:
        start = Vector(path[-2])
        direction = (Vector(path[-1]) - start).normalized()
        side = Vector((-direction.z, 0, direction.x)).normalized()
        length = rng.uniform(.22, .36)
        end = start + direction * length + side * rng.choice([-1, 1]) * length * .65 + Vector((0, rng.uniform(.04, .13), 0))
        middle = start.lerp(end, .5) + Vector((0, -.025, 0))
        twig = [tuple(start), tuple(middle), tuple(end)]
        rr = [min(.010, radii[-2] * .8), .005, .0025]
        vertices, faces = _transport_tube(twig, rr, 5)
        tree_builder.append_mesh(bark, vertices, faces)
        charts.extend(tube_coordinates(twig, rr, 5))
        added += 1
    _replace(obj, *bark, charts, smooth_faces=len(bark[1]), material_metres=.65)
    meta['round2_detail'] = {'originalBranchPaths': meta['branchPaths'],
                            'transportFrames': 'Continuous parallel-transport rings, without per-ring reference-axis flips',
                            'primaryCurveSampling': 'One Catmull-Rom midpoint per original trunk/primary segment',
                            'additionalShortTerminalForks': added,
                            'rootAndAcceptedCrownPlacementUnchanged': True}
    meta['branchPaths'] += added
    meta['outerForkCount'] += added
    obj['winter_tree_geometry'] = json.dumps(meta)
    return added


def apply(scene):
    if scene.get('one_light_round2_exterior'):
        raise RuntimeError('Round2 exterior layer already applied; reopen immutable Source18')
    static = bpy.data.collections.get('STATIC')
    if static is None:
        raise RuntimeError('Actual Snow STATIC source collection required')
    before = sum(_triangles(o) for o in static.objects if o.type == 'MESH')
    changed = []
    for i, name in enumerate(['Chipped and worn granite step', 'Chipped and worn granite step.001', 'Chipped and worn granite step.002']):
        _closed_step(bpy.data.objects[name], i)
        changed.append(name)
    added = []
    for name, dimensions, centre in [
        ('Round2 hall rear stone wall foot', (10.68, .34, .22), (0, .57, -6.405)),
        ('Round2 hall west stone wall foot', (.22, .34, 8.95), (-5.095, .57, -2.3)),
        ('Round2 hall east stone wall foot', (.22, .34, 8.95), (5.095, .57, -2.3)),
    ]:
        added.append(_wall_foot(scene, name, dimensions, centre).name)
    for obj in list(static.objects):
        if obj.name.startswith('Court stone lantern chamber post'):
            _court_post(obj)
            changed.append(obj.name)
        elif obj.name.startswith('Court stone lantern') and obj.type == 'MESH':
            # Surface detail only; the actual cup support shelf is not rebuilt.
            uv = obj.data.uv_layers.get('UVMap')
            if uv:
                for value in uv.data:
                    value.uv *= 3.5
                changed.append(obj.name + ' UV0 only')
    twigs = 0
    for obj in list(static.objects):
        if obj.type != 'MESH' or not obj.get('winter_tree_geometry'):
            continue
        meta = json.loads(obj['winter_tree_geometry'])
        if meta.get('seed') in [39422, 39628]:
            twigs += _foreground_tree(obj)
            changed.append(obj.name)
    bpy.context.view_layer.update()
    after = sum(_triangles(o) for o in static.objects if o.type == 'MESH')
    report = {'layer': 'snow_round2_exterior.apply', 'changed': changed, 'addedConstruction': added,
              'trianglesBefore': before, 'trianglesAfter': after, 'triangleDelta': after - before,
              'additionalTerminalForks': twigs, 'contactObjectNamesAndRegistryUnchanged': True,
              'sourceLightsAndRuntimeAnchorsUnchanged': True, 'renderBakeSaveJobs': 0,
              'status': 'Unsaved construction candidate; actual native and packaged picture review pending'}
    scene['one_light_round2_exterior'] = json.dumps(report)
    return report
