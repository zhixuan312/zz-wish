"""Pine Gate Steps. A forest path and a spring shoulder with a tea pavilion and pierced lamp shrine."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import random
from statistics import median
import sys

import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snow_roof as mesh
from pine_crest_ground import build_crest_ground, build_inner_banks, crest_soil_tint, inner_bank_tint
from pine_hero_trees import CROWNS, grow_crown, needle_fascicle, needle_mesh
from pine_impostors import load_impostors, relief_crown
from pine_materials import apply_scan
from pine_stair_seating import fit_joint_soil
from pine_native_mounts import (
    NATIVE_MOUNTS_FIELD, VALLEY_NODES, add_native_mount, has_verified_native_receipt, serialize_native_mounts,
)
from pine_tea_shoulder import build_tea_shoulder
from resting_contacts import RestingContacts, engine
from snow_lightmap_charts import box_net, profile_uv, source_uv

ROOT = Path(__file__).resolve().parents[2]
ANCHOR = (-1.8, 5.0, .9)
LAMP = (-1.8, 5.076, .9)
PINE_CREST = 6.04
TERRACE_EDGE = -1.24
STAIR_START = 45.6
STAIR_RUN = .8
STAIR_RISE = .08
STAIR_COUNT = 50
BRIDGE_DECK_CENTRES = tuple(21.07 + index * .54 for index in range(5))
BRIDGE_DECK_DEPTH = .56
BRIDGE_TREAD_MARGIN = .015
SHOULDER_SETBACK = .86
STREAM_BANK_OFFSET = .14
STREAM_RIBBON_OVERLAP = .10
WATERCOURSE = ((2.62, 4.02, 5.38), (2.32, 3.55, 10.45), (2.27, 3.01, 15.75),
               (2.16, 2.63, 19.25), (1.20, 2.24, 21.91), (-.62, 2.13, 22.55),
               (-1.98, 1.99, 23.41), (-2.16, 1.85, 25.85), (-1.93, 1.41, 30.25),
               (-2.38, .84, 36.1), (-2.6, .45, 40.6), (-2.37, .11, 45.0))
PRE_EXPOSURE = 6
RANDOM = random.Random(21594)


def supports_height(x, z, supports, ray_start=50):
    tree, _ = contacts.support(supports)
    hit, _, _, _ = tree.ray_cast(mesh.point((x, ray_start, z)), Vector((0, 0, -1)), 100)
    if hit is None:
        raise RuntimeError('Missing bearing surface for a Pine Gate prop.')
    return float(hit.z)


def neutral_granite_albedo():
    """Keep photographed relief in a neutral, full-resolution niche albedo."""
    import numpy as np

    source = bpy.data.images.load(str(mesh.MATERIALS / 'rock_pitted_mossy' / 'diffuse.jpg'),
                                  check_existing=True)
    width, height = source.size
    original = np.empty(width * height * 4, dtype=np.float32)
    source.pixels.foreach_get(original)
    rgba = original.reshape(height, width, 4)
    lightness = rgba[..., :3] @ np.asarray((.2126, .7152, .0722), dtype=np.float32)
    rgba[..., :3] = lightness[..., None]
    np.clip(rgba, 0., 1., out=rgba)
    derivative = bpy.data.images.new('pine-niche-granite-gray', width=width, height=height, alpha=False)
    derivative.pixels.foreach_set(rgba.ravel())
    derivative.pack()
    return derivative


def palette():
    stone = [mesh.material(f'Rain-darkened granite {i}', color, 'stone_pavers', .62)
             for i, color in enumerate(('#9a9b89', '#7d857b', '#879180', '#a7a89b', '#627159'))]
    rock = apply_scan(mesh.material('Scanned lichened rock', '#92998a'), 'mossy_rock', .69)
    ground = apply_scan(mesh.material('Damp pine needle litter', '#8d8874'), 'forrest_ground_03', .63)
    wood = mesh.material('Bare silvered cypress', '#a59277', 'weathered_planks', .83)
    apply_scan(wood, 'weathered_planks')
    tiles = [mesh.material(f'Wet unglazed clay tile {i}', color, 'grey_roof_tiles', .58)
             for i, color in enumerate(('#797c74', '#646b66', '#87877c'))]
    bark = apply_scan(mesh.material('Knotted pine bark', '#c1b49f'), 'knotted_pine_bark', .83)
    pine = [mesh.material(f'Woodland understory {i}', color, rough=.97)
            for i, color in enumerate(('#293626', '#3d4930', '#37452a', '#424c35', '#50603b'))]
    iron = mesh.material('Aged black iron', '#3d3831', rough=.65, metal=.35)
    clay = mesh.material('Gray green celadon', '#786c49', rough=.37)
    ledge = mesh.material('Worn fine granite on the wick shelf', '#a6a49e', 'rock_pitted_mossy', .82)
    close_albedo = neutral_granite_albedo()
    ao = bpy.data.images.load(str(mesh.MATERIALS / 'rock_pitted_mossy' / 'ao.jpg'), check_existing=True)
    ao.colorspace_settings.name = 'Non-Color'
    output = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if not output.interface.items_tree.get('Occlusion'):
        output.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    for material, amount in ((ledge, .30),):
        nodes, links = material.node_tree.nodes, material.node_tree.links
        for node in nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = amount
            if node.type == 'TEX_IMAGE' and node.label.endswith('Base Color'):
                node.image = close_albedo
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = ao
        texture.label = 'Scanned micro-occlusion'
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        occlusion = nodes.new('ShaderNodeGroup')
        occlusion.node_tree = output
        links.new(texture.outputs['Color'], occlusion.inputs['Occlusion'])
    for material in [*stone, rock, ground, ledge]:
        mesh.vertex_tint_shader(material)
    return stone, rock, ground, wood, tiles, bark, pine, iron, clay, ledge


def wet_approach_granite():
    # Use the same registered four-map rock scan as the adjoining fieldstone.
    # The paver scan records straight slab joints inside the texture itself.
    granite = apply_scan(mesh.material('Wet granite on the old footpath', '#a0a1aa'), 'mossy_rock', .68)
    mesh.vertex_tint_shader(granite)
    return granite


def stair_section(index):
    bend = .23 * math.sin(index * .11) - .15 * math.sin(index * .27)
    span = 1.91 + .23 * math.cos(index * .18) + .004 * index
    return bend, span / 2


def section_at(z):
    index = max(0, min(STAIR_COUNT - 1, (STAIR_START - z) / STAIR_RUN))
    return stair_section(index)


def stair_course_height(index):
    # Paired stone runs use deeper treads and a more substantial front
    # course where the hillside climbs. Keep the bridge and saddle levels.
    top = (index + 1) * STAIR_RISE
    if 7 <= index <= 24 or 33 <= index <= 42:
        top += .028 if index % 2 == 0 else -.028
    return top


def terrain_height(x, z):
    rise = min(4, max(0, (46 - z) * .1))
    bank = max(0, min(3., (abs(x) - 2.18) * .27))
    fold = .16 * math.sin(x * .67 + z * .24) + .09 * math.sin(x * 1.12 - z * .41)
    far_slope = max(0., min(1., (-z - 4) / 16)) * max(0., min(1., (abs(x) - 3.4) / 7))
    ridge = far_slope * (.57 + .31 * math.sin(x * .43 + z * .17))
    # Beyond the stone retaining wall the saddle drops into the valley. The
    # flanking ground still rises toward the two wooded shoulders.
    valley = max(0., -z - .55)
    valley_floor = min(32., .39 * valley + .079 * valley * valley)
    # Low shoulders flank the upper approach. The old path bends between
    # them before the spring buildings and the valley can be seen.
    crest_screen = math.exp(-((z - 13.7) / 5.3) ** 2)
    centre, half_span = section_at(z)
    outside = abs(x - centre) - half_span - SHOULDER_SETBACK
    ridge_spur = math.exp(-((outside - 1.70) / 1.22) ** 2)
    verge = min(1., max(0., outside / 1.48))
    verge = verge ** 2 * (3 - 2 * verge)
    shoulder = crest_screen * ridge_spur * verge * (1.33 + .15 * math.sin(.71 * z + 1.6 * x))
    height = rise - .10 + bank + fold * min(1., bank) + ridge - valley_floor + shoulder
    if TERRACE_EDGE <= z <= 6.8 and abs(x) < 5.62:
        # The spring court is level under the slabs and meets the ridge
        # gradually beyond the paved edge.
        edge = max(0., (abs(x) - 4.32) / 1.3, (z - 5.4) / 1.4)
        fade = 1. - edge ** 2 * (3 - 2 * edge)
        height -= max(0., height - 3.76) * fade
    return height


def watercourse_at(z):
    index = next((i for i, end in enumerate(WATERCOURSE[1:]) if z <= end[2]), len(WATERCOURSE) - 2)
    start, end = WATERCOURSE[index:index + 2]
    t = min(1., max(0., (z - start[2]) / (end[2] - start[2])))
    x, y = (a + (b - a) * t for a, b in zip(start[:2], end[:2]))
    width = .18 + .12 * ((1 - t) * math.sin(index * .53) ** 2 + t * math.sin((index + 1) * .53) ** 2)
    if index in (1, 2, 7, 8):
        # Shallow bend shelves alternate with narrow runs. They meet the
        # unchanged surveyed stations and leave the bridge profile alone.
        width += .053 * math.sin(math.pi * t) ** 2 * math.sin(math.tau * t + index * 1.42)
    return x, y, width


def watercourse_stations(spacing):
    for (_, _, start), (_, _, end) in zip(WATERCOURSE, WATERCOURSE[1:]):
        count = math.ceil((end - start) / spacing)
        yield from (start + (end - start) * j / count for j in range(count))
    yield WATERCOURSE[-1][2]


def stream_ground(x, z, water_x, water_y, half_width, blend):
    original = terrain_height(x, z)
    edge = abs(x - water_x) - half_width
    wet_depth = .017 + .002 * math.sin(4.9 * z + 1.7 * x) + .002 * math.sin(9.3 * z - 2.6 * x)
    # Alternating scour pockets and shelves move the wet contact inside the
    # existing bank chart. Preserve the grade through the narrow bridge bend.
    direction = math.copysign(1., x - water_x)
    crossing = max(0., 1. - max(0., abs(z - 22.1) - 1.35) / 2.45)
    shore = min(1., abs(x - water_x) / half_width)
    bends = direction * (.66 * math.sin(.95 * z + .4) + .34 * math.sin(2.07 * z - .9))
    pockets = .50 + .50 * bends
    wet_depth += shore * (1. - crossing ** .45) * (-.011 + .038 * pockets ** 1.44)
    wet_depth += (1. - shore) * (1. - crossing) * (.011 * math.sin(1.6 * z) + .006 * math.sin(3.8 * z + .7))
    if edge <= 0:
        bed = water_y - wet_depth + .016 * edge / half_width
    elif edge <= STREAM_BANK_OFFSET:
        t = edge / STREAM_BANK_OFFSET
        bed = water_y - wet_depth * (1. - t) + .030 * t
    else:
        # The channel turns sharply across the road. Use a shallower slope
        # there so the diagonal grade stays gentle as well as the crossfall.
        crossing = max(0., 1 - abs(z - 22.) / 4.5)
        rise = (.75 - .46 * crossing) * (edge - STREAM_BANK_OFFSET)
        bank = water_y + .030
        bed = min(bank + rise, max(original, bank - rise))
    return original + (bed - original) * blend


def terrain(material):
    outer_x = (4.32, 4.5, 6, 8, 11, 14, 19, 24, 31)
    offsets = (0, .40, SHOULDER_SETBACK, SHOULDER_SETBACK + .48, SHOULDER_SETBACK + 1.14)
    spring_start, spring_end = WATERCOURSE[0][2], WATERCOURSE[-1][2]
    end_blends = {anchor + i * .28 * direction for anchor, direction in ((spring_start, -1), (spring_end, 1))
                  for i in range(1, 6)}
    zs = sorted(set(range(-45, 67, 3)) | set(watercourse_stations(.34)) | end_blends |
                {-1.45, TERRACE_EDGE, -.72, 1.18, 4.88, 5.4, PINE_CREST, 10.5, 13.5, 16.5, 19.5})
    points, faces, previous = [], [], None
    for z in zs:
        centre, half_span = section_at(z)
        verge = [half_span + offset for offset in offsets]
        xs = [*(-x for x in reversed(outer_x)), *(centre - t for t in reversed(verge)),
              centre, *(centre + t for t in verge), *outer_x]
        stream_x, water, width = watercourse_at(z)
        distance_outside = max(0., spring_start - z, z - spring_end)
        blend = max(0., 1 - distance_outside / 1.4)
        blend *= blend * (3 - 2 * blend)
        shore = width + STREAM_BANK_OFFSET
        channel = [stream_x + t for t in (-shore, -width, 0., width, shore)]
        # Extend the cut outward as a graded bank with metre-scale contours.
        grades = [stream_x + side * (shore + amount) for side in (-1, 1)
                  for amount in (.18, .40, .67, .97, 1.32, 1.73, 2.20) if blend > 0.]
        for x in grades:
            if all(abs(x - other) > .026 for other in xs):
                xs.append(x)
        xs = [x for x in xs if x < channel[0] - 1e-6 or x > channel[-1] + 1e-6]
        x_coords = sorted([*xs, *channel])
        indexed = {x: len(points) + i for i, x in enumerate(x_coords)}
        points.extend((x, stream_ground(x, z, stream_x, water, width, blend), z) for x in x_coords)
        # Keep the two banks and the bed as continuous longitudinal strips,
        # even where the spring crosses from one side of the stair to the other.
        bands = [[indexed[x] for x in x_coords if x <= channel[0]],
                 [indexed[x] for x in channel],
                 [indexed[x] for x in x_coords if x >= channel[-1]]]
        if previous:
            for band, (before, after) in enumerate(zip(previous, bands)):
                if band == 1:
                    for i in range(len(before) - 1):
                        faces.extend(((before[i], after[i], after[i + 1]),
                                      (before[i], after[i + 1], before[i + 1])))
                    continue
                i = j = 0
                while i + 1 < len(before) or j + 1 < len(after):
                    use_after = i + 1 == len(before) or (
                        j + 1 < len(after) and points[after[j + 1]][0] <= points[before[i + 1]][0])
                    if use_after:
                        faces.append((before[i], after[j], after[j + 1]))
                        j += 1
                    else:
                        faces.append((before[i], after[j], before[i + 1]))
                        i += 1
        previous = bands
    obj = mesh.mesh_object('Continuous mountain shoulder', points, faces, material, 'approach')
    source_uv(obj, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Continuous mountain terrain grid.')
    mesh.uv_world(obj, 2.1)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def hewn_outline(rng=RANDOM):
    ring = [(-.45, -.50), (.41, -.50), (.5, -.41), (.5, .38), (.45, .47),
            (.27, .50), (.04, .48), (-.19, .50), (-.38, .48), (-.5, .41), (-.5, -.39)]
    variation = [(a + rng.uniform(-.009, .009), b + rng.uniform(-.013, .013)) for a, b in ring]
    wear = [rng.uniform(-.005, .004) - .011 * math.exp(-(a / .22) ** 2)
            if b > .45 else rng.uniform(-.003, .003) for a, b in ring]
    return variation, wear


def hewn_block(name, width, height, depth, location, material, region):
    # Chipped corners, worn toe and an irregular nose are physical geometry.
    # Near the camera, the edge casts its own uneven soft shadow.
    x, y, z = location
    variation, wear = hewn_outline()
    points = []
    for band, inset in ((-height, .018), (-.021, 0), (0, .016)):
        for j, (a, b) in enumerate(variation):
            points.append((x + a * (width - inset * 2), y + band + wear[j], z + b * (depth - inset * 2)))
    n = len(variation)
    faces = [tuple(range(n)), tuple(reversed(range(n * 2, n * 3)))]
    for row in range(2):
        for i in range(n):
            a, b = row * n, (row + 1) * n
            j = (i + 1) % n
            faces.append((a + i, b + i, b + j, a + j))
    obj = mesh.mesh_object(name, points, faces, material, region)
    profile_uv(obj, n, 3, {0, 1}, 1)
    obj['weather_stone'] = True
    return obj


def worn_approach_tread(name, width, depth, centre, material, dressing, outline, thickness=.26):
    old_rim, weather = outline
    cx, top, cz = centre
    rim, chips = [], []
    for i, ((u, v), age) in enumerate(zip(old_rim, weather)):
        corner = i in (0, 1, 2, 3, 4, 8, 9, 10)
        radius = dressing.uniform(.95, 1.) if corner else dressing.uniform(.98, 1.)
        rim.append((width * u * radius, depth * max(-.5, min(.5, v)) * radius))
        chips.append(age - dressing.uniform(.001, .014))
        if i in (0, 2, 4, 7, 9):
            uu, vv = old_rim[(i + 1) % len(old_rim)]
            run = dressing.uniform(.27, .69)
            inward = dressing.uniform(.93, .99)
            across = max(-.5, min(.5, v + (vv - v) * run))
            rim.append((width * (u + (uu - u) * run) * inward, depth * across * inward))
            chips.append(dressing.uniform(-.020, -.006))
    count = len(rim)
    hollow_x = dressing.uniform(-.12, .14) * width
    hollow_z = dressing.uniform(-.06, .16) * depth
    worn = dressing.uniform(.015, .033)
    pitch = dressing.uniform(-.022, .024)
    variation = dressing.uniform(.008, .014)

    def walking_surface(x, z):
        dx = (x - hollow_x) / (width * .37)
        dz = (z - hollow_z) / (depth * .38)
        age = math.exp(-dx * dx - dz * dz)
        relief = variation * (.56 * math.sin(8.0 * x + 13.0 * z) + .44 * math.sin(25.0 * x - 7.0 * z))
        return top + pitch * z - worn * age + relief

    points = []
    for band in range(5):
        for (x, z), chip in zip(rim, chips):
            edge = min(.047, width * .082, depth * .11) * (1. + .50 * math.sin(13 * x + 11 * z))
            shoulder_x = x * (1. - 1.18 * edge / width)
            shoulder_z = z * (1. - 2 * edge / depth)
            if band == 0:
                px, py, pz = x * .95, top - thickness, z * .96
            elif band == 1:
                px, pz = x * .977, z * .986
                py = walking_surface(shoulder_x, shoulder_z) - .091 + .46 * chip
            elif band == 2:
                px, pz = x, z
                py = walking_surface(px, pz) - .042 + .51 * chip
            elif band == 3:
                px, pz = shoulder_x, shoulder_z
                py = walking_surface(px, pz) - .010 + .71 * chip
            else:
                px, pz = hollow_x + .58 * (x - hollow_x), hollow_z + .55 * (z - hollow_z)
                py = walking_surface(px, pz) + .13 * chip
            points.append((cx + px, py, cz + pz))
    points.append((cx + hollow_x, walking_surface(hollow_x, hollow_z), cz + hollow_z))

    # Keep precisely three source charts per stone. The walking face has a
    # continuous planar chart through the shallow centre hollow rather than
    # one independent chart for every triangle.
    faces = [tuple(range(count))]
    coordinates = [[(x, z + depth + .42) for x, z in rim]]
    distance = [0.]
    for i, (x, z) in enumerate(rim):
        xx, zz = rim[(i + 1) % count]
        distance.append(distance[-1] + math.hypot(xx - x, zz - z))
    for band in range(4):
        for i in range(count):
            j = (i + 1) % count
            a, b = band * count, (band + 1) * count
            face = (a + i, b + i, b + j, a + j)
            faces.append(face)
            if band == 3:
                coordinates.append([(points[index][0] - cx, points[index][2] - cz + .25 + depth * .5)
                                    for index in faces[-1]])
            else:
                coordinates.append([(distance[k], points[index][1] - top + .22)
                                    for k, index in zip((i, i, i + 1, i + 1), face)])
    for i in range(count):
        face = (len(points) - 1, 4 * count + (i + 1) % count, 4 * count + i)
        faces.append(face)
        coordinates.append([(points[index][0] - cx, points[index][2] - cz + .25 + depth * .5)
                            for index in face])
    obj = mesh.mesh_object(name, points, faces, material, 'approach')
    material_uv = obj.data.uv_layers['UVMap']
    offset_x, offset_y = cx * 2.31 + cz * .51, cz * 1.87 - cx * 1.11
    scale = .535 + .105 * math.sin(cx * 6.13 + cz * 3.79)
    for polygon, chart in zip(obj.data.polygons, coordinates):
        for loop_index, (u, v) in zip(polygon.loop_indices, chart):
            material_uv.data[loop_index].uv = (offset_x + u / scale, offset_y + v / scale)
    source_uv(obj, coordinates, 'Stone side strip and continuous curved tread crown.')
    for face in obj.data.polygons[1:]:
        face.use_smooth = True
    obj['weather_stone'] = True
    obj['bearing_vertices'] = count
    obj['step_tone'] = dressing.uniform(.82, .99)
    return obj


def approach_joint_bedding(rows, material):
    # A continuous hillside bed sits just under the worn stone. The lower
    # end of each course folds into the next, so the rain-cut riser has earth
    # behind it even where a stone nose has broken away.
    points, sections = [], []
    tree, _ = contacts.support([tread for _, _, _, _, treads in rows for tread in treads])
    for top, rise, low_z, high_z, stones in rows:
        start = len(points)
        bend, half_span = section_at((low_z + high_z) * .5)
        extent = half_span + .045
        edges = []
        for stone in stones:
            count = stone['bearing_vertices']
            ring = stone.data.vertices[2 * count:3 * count]
            edges.append((min(v.co.x for v in ring), max(v.co.x for v in ring)))
        joint_centres = [(right + left) * .5 for (_, right), (left, _) in zip(edges, edges[1:])]
        samples = [bend + extent * (col / 6 - 1) for col in range(13)]
        for centre in joint_centres:
            # Put a strip of triangles inside each actual fitted stone joint.
            # A uniform grid lowered entire cells beside a low, rounded toe.
            samples = [x for x in samples if abs(x - centre) > .056]
            samples.extend((centre - .029, centre + .029))
        samples.sort()
        along_course = (0., .057, .19, .40, .61, .79, .92, 1.)
        for along in along_course:
            z = low_z + (high_z - low_z) * along
            centre, width = section_at(z)
            fall = max(0., (along - .86) / .14)
            for sample in samples:
                x = centre + (sample - bend) * (width + .045) / extent
                settling = .008 * math.sin(8.8 * x + 5.1 * z) + .007 * math.sin(23 * x - 4.6 * z)
                level = top - .010 + settling - rise * fall
                contact, normal, _, _ = tree.ray_cast(mesh.point((x, top + .18, z)), Vector((0, 0, -1)), 2)
                if contact is not None and normal.z > .49:
                    level = min(level, contact.z - .008)
                points.append((x, level, z))
        faces = []
        columns = len(samples)
        for row in range(len(along_course) - 1):
            for col in range(columns - 1):
                a = start + row * columns + col
                faces.extend(((a, a + columns, a + columns + 1), (a, a + columns + 1, a + 1)))
        sections.append(faces)
    points = fit_joint_soil(points, sections, [treads for _, _, _, _, treads in rows])
    faces = [face for section in sections for face in section]
    bed = mesh.mesh_object('Dark earth and needle litter in the approach stone joints', points, faces, material, 'approach')
    mesh.uv_world(bed, .29)
    bed['wet_tread_joints'] = True
    source_uv(bed, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Continuous earth bedding, including the retreat under each riser.')
    return bed


def tread_lips(stones):
    lips = []
    for stone in stones:
        count = stone['bearing_vertices']
        lips.append([Vector(engine(v.co)) for v in stone.data.vertices[3 * count:4 * count]])
    return lips


def lip_edge(lips, across, position, select):
    intersections = []
    for lip in lips:
        for a, b in zip(lip, lip[1:] + lip[:1]):
            if min(a[across], b[across]) <= position < max(a[across], b[across]):
                intersections.append(a.lerp(b, (position - a[across]) / (b[across] - a[across])))
    return select(intersections, key=lambda point: point[2 - across], default=None)


def approach_joint_infill(rows, soil):
    points = []
    sections = [[] for _ in rows]
    outlines = [tread_lips(stones) for _, _, _, _, stones in rows]

    def fill_strip(faces, edges, axis):
        tail = None
        for left, right in edges:
            if left is None or right is None or right[axis] - left[axis] < .013:
                tail = None
                continue
            start = len(points)
            center = left.lerp(right, .50)
            crest = .004 * math.sin(44 * center.x + 57 * center.z)
            points.extend(((left.x, left.y - .014, left.z),
                           (center.x, center.y - .019 + crest, center.z),
                           (right.x, right.y - .014, right.z)))
            if tail is not None:
                for col in range(2):
                    a, b = tail + col, start + col
                    patches = ((a, b, b + 1), (a, b + 1, a + 1))
                    faces.extend(patches if axis == 0 else (p[::-1] for p in patches))
            tail = start

    for index, lips in enumerate(outlines):
        faces = sections[index]
        for left, right in zip(lips, lips[1:]):
            lo = max(min(p.z for p in left), min(p.z for p in right)) + .032
            hi = min(max(p.z for p in left), max(p.z for p in right)) - .032
            cuts = sorted({p.z for p in left + right if lo < p.z < hi})
            cuts = [lo, *cuts, hi]
            fill_strip(faces, ((lip_edge([left], 2, z, max), lip_edge([right], 2, z, min))
                               for z in cuts), 0)
        if not index or abs(rows[index - 1][2] - rows[index][3]) > .02:
            continue
        course = rows[index][3]
        bend, half_span = section_at(course)
        stations = [bend + half_span * (step / 8 - 1) for step in range(17)]
        edges = []
        for x in stations:
            front = lip_edge(lips, 0, x, max)
            back = lip_edge(outlines[index - 1], 0, x, min)
            if front is not None and back is not None:
                # Pack the transverse joint at the downhill lip. The higher
                # riser remains exposed where the trail climbs.
                front.y = min(front.y, back.y + .012)
            edges.append((front, back))
        fill_strip(faces, edges, 2)

    points = fit_joint_soil(points, sections, [stones for _, _, _, _, stones in rows])
    faces = [f for row in sections for f in row]
    joint = mesh.mesh_object('Packed wet stone grit and pine litter between treads', points, faces, soil, 'approach')
    mesh.uv_world(joint, .24)
    joint['wet_tread_joints'] = True
    source_uv(joint, [[(points[i][0], points[i][2]) for i in f] for f in faces],
              'Laid-in joint strips fitted between the stone lips in metres.')


def audit_approach_tread_bearings(rows, bed, ground):
    support, _ = contacts.support([bed, ground])
    gaps = []
    unseated = []
    for _, _, _, _, treads in rows:
        for tread in treads:
            ring = tread.data.vertices[:tread['bearing_vertices']]
            for vertex in ring:
                x, bottom, z = engine(tread.matrix_world @ vertex.co)
                hit, _, _, _ = support.ray_cast(mesh.point((x, bottom + .38, z)), Vector((0., 0., -1.)), .65)
                gap = bottom - hit.z if hit is not None else math.inf
                if gap > .005:
                    unseated.append((gap, tread.name, x, z))
                gaps.append(gap)
    if unseated:
        worst = ', '.join(f'{name} at ({x:.3f}, {z:.3f}): {gap:.4f} m'
                          for gap, name, x, z in sorted(unseated, reverse=True)[:5])
        raise RuntimeError(f'{len(unseated)} tread underside probes are unseated: {worst}.')
    print(f'PINE_APPROACH_TREAD_BEARINGS {len(gaps)} probes; maximum underside gap {max(gaps):.6f} m.')


def audit_stair_course_rises(rows):
    rises = []
    for (_, _, _, uphill_end, uphill), (_, _, downhill_start, _, downhill) in zip(rows[1:], rows):
        if abs(downhill_start - uphill_end) > .10:
            continue
        uphill_height = median(stone.data.vertices[-1].co.z for stone in uphill)
        downhill_height = median(stone.data.vertices[-1].co.z for stone in downhill)
        rise = uphill_height - downhill_height
        if rise > .094:
            rises.append(rise)
    if len(rises) < 10 or max(rises) > .169:
        raise RuntimeError(f'Approach riser sequence has {len(rises)} useful rises, up to {max(rises, default=0.):.3f} m.')
    print(f'PINE_APPROACH_RISERS {len(rises)} measured rises; {min(rises):.6f}–{max(rises):.6f} m.')


def dress_retaining_stone(obj, ground, location, width, height, depth, heading, ripples, foundation, settling):
    x, y, z = location
    count = len(obj.data.vertices) // 3
    for band in range(3):
        for j, vertex in enumerate(obj.data.vertices[band * count:(band + 1) * count]):
            px, py, pz = engine(vertex.co)
            dx, dz = px - x, pz - z
            azimuth = math.atan2(dz / .798, dx / .46)
            corner = .88 + .09 * math.sin(3 * azimuth + z * .86) + .06 * math.cos(5 * azimuth - x)
            profile = (.91, 1., .81)[band]
            across = dx * width / .46 * profile * corner
            along = dz * depth / .798 * profile * corner
            vertex.co.x = x + across - heading * along
            vertex.co.y = -z - along - heading * across
            if band == 0:
                vertex.co.z = y - settling + (py - y) * height / .25
            else:
                # Lower the whole course when it settles. The shoulder must
                # stay below the cap rather than turn into an upturned lip.
                vertex.co.z = y - settling + ripples[j] + (-.042 if band == 1 else 0.)
            if foundation and band == 0:
                earth = supports_height(vertex.co.x, -vertex.co.y, [ground])
                vertex.co.z = min(vertex.co.z, earth - .018)
    obj.data.update()
    profile_uv(obj, count, 3, {0, 1}, 1)
    mesh.uv_world(obj, .67)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj['rubble_stone'] = True


def weather_drain_curb(obj, x, z, course, side):
    count = len(obj.data.vertices) // 3
    for band in range(3):
        for index, vertex in enumerate(obj.data.vertices[band * count:(band + 1) * count]):
            roll = math.sin(index * 1.69 + course * 1.88 + side)
            taper = (.91, 1.08, .79)[band]
            vertex.co.x = x + (vertex.co.x - x) * taper + .013 * roll
            depth = .78 + .19 * math.sin(course * 1.07 + side * .97)
            vertex.co.y = -z + (vertex.co.y + z) * depth * (1. - .14 * (band == 2))
            if band:
                vertex.co.z -= .020 + .014 * roll + .012 * math.sin(course * 2.9)
    obj.data.update()
    profile_uv(obj, count, 3, {0, 1}, 1)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj['rubble_stone'] = True


def approach_stone_spans(course, widths):
    edges = [0., widths[0], widths[0] + widths[1], sum(widths)]
    spans = [(edges[i], edges[i + 1], i) for i in range(3)]
    if course in (27, 28, 31):
        return spans
    layout = course % 11
    if layout in (0, 4, 8):
        # A broad slab bridges two positions in some of the old work.
        merge = (course // 2) % 2
        spans[merge:merge + 2] = [(edges[merge], edges[merge + 2], merge)]
    if layout in (2, 6):
        # Later repairs fit a splintered stone next to a shorter tread.
        widest = max(range(3), key=widths.__getitem__)
        a, b, _ = spans[widest]
        split = a + (b - a) * (.36 + .13 * (course % 2))
        spans[widest:widest + 1] = [(a, split, widest), (split, b, widest)]
    return spans


def landing_bed(material):
    # Recess the bedding under the flagstones. The approach apron and the
    # gate threshold keep the original stone landing height at both ends.
    profile = ((TERRACE_EDGE, 3.97), (.82, 3.97), (1.15, 3.970), (5.70, 3.970),
               (6.08, 4.), (6.68, 4.))
    points = [(x, y, z) for z, top in profile
              for x, y in ((-4.32, 2.68), (4.32, 2.68), (4.32, top), (-4.32, top))]
    last = 4 * (len(profile) - 1)
    faces = [(0, 3, 2, 1), (last, last + 1, last + 2, last + 3)]
    for first in range(0, last, 4):
        for side in range(4):
            a, b = first + side, first + (side + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    landing = mesh.mesh_object('Broad stone landing', points, faces, material, 'gate')
    box_net(landing, (8.64, 1.32, 7.92), (0, 3.34, 2.72))
    mesh.uv_world(landing)
    mesh.bevel(landing, .045)
    landing['weather_stone'] = landing['moss_edge'] = True


def landing_joint_fill(seams, material):
    # Rain packs local pockets of fine gravel into the gaps. The tapered
    # footprints rise from the existing bedding and stay below the stone faces.
    settle = random.Random(919)
    points, faces = [], []
    for x, z, length, along_x in seams:
        if settle.random() < .43:
            continue
        depth = settle.uniform(.009, .021)
        offset = settle.uniform(.13, .42) * length
        span = min(length - offset, settle.uniform(.18, .55))
        begin = len(points)
        for i, fraction in enumerate((0., .18, .41, .63, .83, 1.)):
            sweep = offset + span * fraction
            crest = math.sin(fraction * math.pi)
            line = settle.uniform(-.005, .005)
            for side in (-1, 1):
                across = line + side * depth * (.19 + .81 * crest) * settle.uniform(.81, 1.19)
                y = 3.970 + crest * (settle.uniform(.008, .016) - .002 * i / 5)
                points.append((x + sweep, y, z + across) if along_x else (x + across, y, z + sweep))
            if i:
                a = begin + (i - 1) * 2
                face = (a, a + 2, a + 3, a + 1)
                faces.append(tuple(reversed(face)) if along_x else face)
    grit = mesh.mesh_object('Worn gravel bed in the landing joints', points, faces, material, 'gate')
    source_uv(grit, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Tapered settlement patches projected in metres onto the bedding.')
    mesh.uv_world(grit, .24)


def landing_flagstones(stone):
    joint = random.Random(5917)
    seams = []
    course_edges = [-1.02] + [-1.02 + row * .64 + joint.uniform(-.145, .145) for row in range(1, 11)] + [6.02]
    for row, (front, back) in enumerate(zip(course_edges, course_edges[1:])):
        stagger = (.12 if row % 2 else -.11) + joint.uniform(-.08, .08)
        edges = [-4.20] + [-4.20 + col * .84 + stagger + joint.uniform(-.23, .23)
                           for col in range(1, 10)] + [4.20]
        for col, (left, right) in enumerate(zip(edges, edges[1:])):
            x, z = (left + right) * .5, (front + back) * .5
            gap = joint.uniform(.011, .031)
            settle = joint.uniform(-.009, .008) * (.44 if abs(x) < .8 else 1.)
            slab = hewn_block(f'Landing flagstone {row} {col}', right - left - gap, .092, back - front - gap,
                              (x, 4. + settle + RANDOM.uniform(-.003, .003), z), RANDOM.choice(stone), 'gate')
            slab['moss_edge'] = joint.random() < (.26 if abs(x) < 1.2 else .57)
            if front < 3.70:
                if col and right < 4.:
                    seams.append((right, front, back - front, False))
                if row:
                    seams.append((left, front, right - left, True))
    landing_joint_fill(seams, stone[4])


def audit_approach_clearance(ground):
    margins = []
    for index in range(STAIR_COUNT):
        z = STAIR_START - STAIR_RUN * index
        top = (index + 1) * STAIR_RISE
        centre, half_span = stair_section(index)
        # The limits sit below the lowest possible dressed surface after the
        # three blocks' camber, worn nosing and setting variation.
        probes = ((centre - half_span, top - .043), (centre + half_span, top - .043),
                  (centre - half_span - .09, top + .018), (centre + half_span + .24, top + .018),
                  (centre + half_span + .139, top - .085))
        for x, floor in probes:
            margin = floor - supports_height(x, z, [ground])
            if margin < -1e-6:
                raise RuntimeError(f'Pine Gate step {index + 1}, x={x:.3f}: terrain covers the stone by {-margin:.4f} m.')
            margins.append(margin)
    print(f'PINE_APPROACH_CLEARANCE {len(margins)} probes; minimum clearance {min(margins):.6f} m')


def climbing_steps(stone, ground, bedding_material, rubble_granite, tread_granite):
    bridge_curbs = []
    worn_cap = random.Random(38365)
    dressing = random.Random(498721)
    masonry = random.Random(286243)
    bedding_rows = []
    deck_far = BRIDGE_DECK_CENTRES[0] - BRIDGE_DECK_DEPTH / 2 - BRIDGE_TREAD_MARGIN
    deck_near = BRIDGE_DECK_CENTRES[-1] + BRIDGE_DECK_DEPTH / 2 + BRIDGE_TREAD_MARGIN
    for i in range(STAIR_COUNT):
        z = STAIR_START - STAIR_RUN * i
        top = (i + 1) * STAIR_RISE
        course_top = stair_course_height(i)
        if 21.17 < z < 23.16:
            continue
        # Laid in short runs around tree roots. A shallow camber takes rain
        # away from the worn center and toward the open right-hand drain.
        bend, half_span = stair_section(i)
        span = half_span * 2
        joint_a = span * .31 + RANDOM.uniform(-.10, .09) + dressing.uniform(-.24, .21)
        joint_b = span * .66 + RANDOM.uniform(-.12, .10) + dressing.uniform(-.18, .24)
        joint_a = max(.31, joint_a)
        joint_b = min(span - .32, max(joint_a + .29, joint_b))
        widths = (joint_a, joint_b - joint_a, span - joint_b)
        original = []
        # Consume the original sequence before varying the masonry. Trees
        # and props farther uphill keep their surveyed transforms.
        for j in range(3):
            depth = .82 + RANDOM.uniform(-.043, .039)
            surface = course_top + RANDOM.uniform(-.010, .009) - .005 * j
            centre_z = z + RANDOM.uniform(-.027, .031)
            RANDOM.choice(stone)
            original.append((depth, surface, centre_z, hewn_outline()))
        treads = []
        # The end deck already fills course 28. The side drainage is retained.
        if i != 28:
            for j, (a, b, original_index) in enumerate(approach_stone_spans(i, widths)):
                depth, surface, centre_z, outline = original[original_index]
                dressed_width = b - a - dressing.uniform(.003, .011)
                low_z, high_z = centre_z - depth / 2, centre_z + depth / 2
                if i == 27:
                    low_z = deck_near
                if i == 31:
                    high_z = deck_far
                tread = worn_approach_tread(f'Step {i + 1:02} block {j + 1}', dressed_width, high_z - low_z,
                                            (bend - span / 2 + (a + b) / 2, surface, (low_z + high_z) / 2),
                                            tread_granite, dressing, outline)
                tread['approach_tread'] = True
                tread['moss_edge'] = j != 1 or i % 7 == 0
                treads.append(tread)
        if treads:
            low_z = deck_near if i == 27 else z - STAIR_RUN / 2
            high_z = deck_far if i == 31 else z + STAIR_RUN / 2 + (.08 if i == 0 else 0.)
            previous_top = stair_course_height(i - 1)
            bedding_rows.append((course_top, course_top - previous_top, low_z, high_z, treads))
        drain_x = bend + span / 2 + .139
        invert = hewn_block(f'Open rainwater channel {i + 1:02}', .27, .16, .805,
                            (drain_x, top - .068, z), stone[4], 'approach')
        invert['moss_edge'] = True
        for direction in (-1, 1):
            x = bend + direction * (span / 2 + (.24 if direction > 0 else .09))
            curb = hewn_block(f'Stair drain curb {direction} {i + 1:02}', .17, .16, .782,
                              (x, top + .035, z), stone[4], 'approach')
            curb['moss_edge'] = True
            if (i, direction) in ((28, -1), (31, 1)):
                bridge_curbs.append(curb)
            else:
                weather_drain_curb(curb, x, z, i, direction)
            if (i // 5 + direction) % 4 and i < 47:
                cap = 1 + int(i > 31)
                for row in range(cap + 1):
                    position = (bend + direction * (span / 2 + .38 + row * .070),
                                top + row * .244 + .02, z + (.24 if row % 2 else 0))
                    RANDOM.choice(stone)
                    retaining = hewn_block(f'Stair retaining course {direction} {i} {row}', .46, .25, .798,
                                           position, rubble_granite, 'approach')
                    rim = len(retaining.data.vertices) // 3
                    wear = [masonry.uniform(-.040, .015) for _ in range(rim)]
                    # Headers tuck into the hill, lower stones carry the
                    # irregular capstones. Vary each joint from course to course.
                    wave = .095 * math.sin(.93 * i + 1.7 * row + direction)
                    length = .805 + .13 * math.cos(i * 1.14 + row * 2.8 + direction)
                    (x, y, zz) = position
                    offset = direction * masonry.uniform(.015, .065)
                    for vertex in retaining.data.vertices:
                        vertex.co.x += offset
                        vertex.co.y -= wave
                    settling = 0.
                    if row == cap:
                        losses = [worn_cap.uniform(.009, .051) for _ in range(rim)]
                        settling = dressing.uniform(.055, .132) + .13 * max(0., math.sin(i * 1.97 + direction)) ** 2
                        wear = [dip - loss * .45 for dip, loss in zip(wear, losses)]
                        retaining['moss_edge'] = worn_cap.random() < .72
                    else:
                        retaining['moss_edge'] = True
                    dress_retaining_stone(retaining, ground, (x + offset, y, zz + wave),
                                          masonry.uniform(.43, .66), .30 if row else .33, length,
                                          masonry.uniform(-.18, .18), wear, row == 0, settling)
    bed = approach_joint_bedding(bedding_rows, bedding_material)
    approach_joint_infill(bedding_rows, bedding_material)
    audit_approach_tread_bearings(bedding_rows, bed, ground)
    audit_stair_course_rises(bedding_rows)
    landing_bed(stone[2])
    landing_flagstones(stone)
    fit_stone_undersides(ground, bridge_curbs)
    return bridge_curbs


def terrain_bank_slopes(ground, depsgraph):
    surface = ground.evaluated_get(depsgraph)
    evaluated = surface.to_mesh()
    slopes = []
    try:
        for face in evaluated.polygons:
            x, _, z = engine(face.center)
            if WATERCOURSE[0][2] <= z <= WATERCOURSE[-1][2]:
                stream_x, _, width = watercourse_at(z)
                if abs(x - stream_x) <= width + STREAM_BANK_OFFSET + 2.20:
                    normal = face.normal
                    slopes.append(math.degrees(math.atan2(math.hypot(normal.x, normal.y), normal.z)))
    finally:
        surface.to_mesh_clear()
    return slopes


def evaluated_undersides(objects, depsgraph):
    for obj in objects:
        surface = obj.evaluated_get(depsgraph)
        evaluated = surface.to_mesh()
        try:
            # Without a fitted rim, the hewn block starts with eleven underside vertices.
            count = obj.get('bearing_vertices', obj.get('bank_ring_vertices', 11))
            yield [engine(surface.matrix_world @ vertex.co) for vertex in evaluated.vertices[:count]]
        finally:
            surface.to_mesh_clear()


def audit_bridge_tread_transition(deck_slabs, depsgraph):
    def z_bounds(obj):
        surface = obj.evaluated_get(depsgraph)
        evaluated = surface.to_mesh()
        try:
            z = [engine(surface.matrix_world @ vertex.co)[2] for vertex in evaluated.vertices]
            return min(z), max(z)
        finally:
            surface.to_mesh_clear()

    deck_bounds = [z_bounds(slab) for slab in deck_slabs]
    far = min(low for low, _ in deck_bounds)
    near = max(high for _, high in deck_bounds)
    margins = {'far': [], 'near': []}
    for tread in (obj for obj in mesh.STATIC.objects if obj.get('approach_tread')):
        low, high = z_bounds(tread)
        if high <= far:
            margins['far'].append(far - high)
        elif low >= near:
            margins['near'].append(low - near)
        else:
            raise RuntimeError(f'{tread.name} enters the deck interval {far:.6f}–{near:.6f} m.')
    for side, values in margins.items():
        if not values or not .001 <= min(values) <= .09:
            raise RuntimeError(f'Invalid stone-to-deck {side} seam: {min(values, default=math.inf):.6f} m.')
    print(f'PINE_BRIDGE_TREAD_SEAMS far {min(margins["far"]):.6f} m; near {min(margins["near"]):.6f} m.')


def audit_watercourse(ground, bank_stones, deck_slabs, bridge_curbs):
    wet, dry = [], []
    for z in watercourse_stations(.23):
        x, y, width = watercourse_at(z)
        for offset in (-width, 0, width):
            wet.append(y - supports_height(x + offset, z, [ground]))
        for offset in (-width - STREAM_BANK_OFFSET, width + STREAM_BANK_OFFSET):
            dry.append(supports_height(x + offset, z, [ground]) - y)
    if min(wet) <= 0. or min(dry) <= 0.:
        raise RuntimeError(f'Pine Gate watercourse clearance fails: wet {min(wet):.6f} m, bank {min(dry):.6f} m.')
    print(f'PINE_WATERCOURSE_CLEARANCE {len(wet)} wet probes; minimum {min(wet):.6f} m. '
          f'{len(dry)} dry bank probes; minimum {min(dry):.6f} m.')
    hidden_edges = []
    for z in watercourse_stations(.11):
        x, y, width = watercourse_at(z)
        for direction in (-1, 1):
            edge_x = x + direction * (width + STREAM_RIBBON_OVERLAP)
            hidden_edges.append(supports_height(edge_x, z, [ground]) - y)
    if min(hidden_edges) <= 0.:
        raise RuntimeError(f'Visible cut edge on the Pine Gate stream: {min(hidden_edges):.6f} m.')
    print(f'PINE_STREAM_EDGE {len(hidden_edges)} concealed edge probes; minimum {min(hidden_edges):.6f} m.')

    depsgraph = bpy.context.evaluated_depsgraph_get()
    audit_bridge_tread_transition(deck_slabs, depsgraph)
    slopes = terrain_bank_slopes(ground, depsgraph)
    stone_gaps = [y - supports_height(x, z, [ground])
                  for bottom in evaluated_undersides(bank_stones, depsgraph) for x, y, z in bottom]
    # All stream segments descend in z. The highest water anywhere under a
    # slab's footprint is at the near end of its full longitudinal extent.
    deck_gaps = [min(y for _, y, _ in bottom) - watercourse_at(min(z for _, _, z in bottom))[1]
                 for bottom in evaluated_undersides(deck_slabs, depsgraph)]
    maximum_slope, maximum_gap, minimum_deck = max(slopes), max(stone_gaps), min(deck_gaps)
    if maximum_slope > 50. or maximum_gap > .005 or minimum_deck <= 0.:
        raise RuntimeError(f'Pine Gate stream construction fails: slope {maximum_slope:.3f} degrees, '
                           f'stone gap {maximum_gap:.6f} m, deck clearance {minimum_deck:.6f} m.')
    print(f'PINE_STREAM_CONSTRUCTION {len(slopes)} bank faces; maximum {maximum_slope:.3f} degrees. '
          f'{len(stone_gaps)} stone underside vertices; maximum signed gap {maximum_gap:.6f} m. '
          f'{len(deck_gaps)} deck slabs; minimum water clearance {minimum_deck:.6f} m.')

    if len(bridge_curbs) != 2:
        raise RuntimeError(f'Pine Gate expects two fitted bridge curbs; found {len(bridge_curbs)}.')
    curb_bottoms = list(evaluated_undersides(bridge_curbs, depsgraph))
    curb_vertices = [p for rim in curb_bottoms for p in rim]
    curb_midpoints = [tuple((a + b) * .5 for a, b in zip(p, q))
                      for rim in curb_bottoms for p, q in zip(rim, rim[1:] + rim[:1])]
    maximum_curb_gap = max(abs(y - supports_height(x, z, [ground]))
                           for x, y, z in curb_vertices + curb_midpoints)
    if maximum_curb_gap > .005:
        raise RuntimeError(f'Pine Gate bridge curbs exceed the 5 mm underside-contact limit: {maximum_curb_gap:.6f} m.')
    print(f'PINE_BRIDGE_CURB_CONTACT {len(bridge_curbs)} curbs; {len(curb_vertices)} evaluated underside vertices; '
          f'{len(curb_midpoints)} edge midpoints; maximum absolute gap {maximum_curb_gap:.6f} m.')


def fit_stone_undersides(ground, stones, upper_clearances=None):
    terrain_edges = [(ground.data.vertices[a].co, ground.data.vertices[b].co)
                     for a, b in (edge.vertices for edge in ground.data.edges)]

    for rock in stones:
        original = [vertex.co.copy() for vertex in rock.data.vertices]
        count = len(original) // 3
        bottom = original[:count]
        bounds = ((min(v.x for v in bottom), max(v.x for v in bottom)),
                  (min(v.y for v in bottom), max(v.y for v in bottom)))
        nearby = [(a, b) for a, b in terrain_edges
                  if min(a.x, b.x) <= bounds[0][1] and max(a.x, b.x) >= bounds[0][0]
                  and min(a.y, b.y) <= bounds[1][1] and max(a.y, b.y) >= bounds[1][0]]
        joins = []
        for i, start in enumerate(bottom):
            next_i = (i + 1) % count
            span = bottom[next_i] - start
            cuts = {0., 1.}
            # The terrain height along this rim is linear between real
            # triangle-edge intersections. A vertex-only fit leaves gaps.
            for a, b in nearby:
                edge = b - a
                offset = a - start
                divisor = span.x * edge.y - span.y * edge.x
                if abs(divisor) < 1e-10:
                    continue
                t = (offset.x * edge.y - offset.y * edge.x) / divisor
                u = (offset.x * span.y - offset.y * span.x) / divisor
                if 0 < t < 1 and -1e-7 <= u <= 1 + 1e-7:
                    cuts.add(t)
            spacing = .0008 / math.hypot(span.x, span.y)
            previous = 0.
            joins.append((i, next_i, previous))
            for t in sorted(cuts):
                if previous + spacing < t < 1 - spacing:
                    joins.append((i, next_i, t))
                    previous = t

        ring = len(joins)
        points = []
        for row in range(3):
            for slot, (a, b, t) in enumerate(joins):
                pos = original[row * count + a].lerp(original[row * count + b], t)
                x, z = pos.x, -pos.y
                height = pos.z
                if row == 0:
                    height = supports_height(x, z, [ground]) - .002
                elif upper_clearances is not None:
                    emergence, rise = upper_clearances[row - 1]
                    surface = supports_height(x, z, [ground])
                    below = points[(row - 1) * ring + slot][1]
                    height = max(height, surface + emergence, below + rise)
                points.append((x, height, z))
        faces = [tuple(range(ring)), tuple(reversed(range(ring * 2, ring * 3)))]
        for row in range(2):
            for i in range(ring):
                a, b = row * ring, (row + 1) * ring
                j = (i + 1) % ring
                faces.append((a + i, b + i, b + j, a + j))
        rock.data.clear_geometry()
        rock.data.from_pydata([mesh.point(p) for p in points], [], faces)
        rock.data.update()
        mesh.uv_world(rock)
        profile_uv(rock, ring, 3, {0, 1}, 1)
        rock['bank_ring_vertices'] = ring


def stream_gravel_sites(rng):
    for station, z in enumerate(watercourse_stations(.39)):
        if station % 4 == 0 or not 5.65 <= z <= 44.5 or 20.67 <= z <= 23.74:
            continue
        z += rng.uniform(-.093, .091)
        x, _, width = watercourse_at(z)
        shore = station % 4 == 1
        side = -1 if station % 2 else 1
        x += side * (width + rng.uniform(.014, .055)) if shore else width * rng.uniform(-.71, .71)
        yield x, z, shore, rng.uniform(.042, .082)

    # Loose gravel settles in broken arcs on the inside of the bends. A few
    # larger, partly wet cobbles divide the edge of each densely sorted bar.
    for origin, side in ((16.5, 1), (19.6, 1), (24.22, -1), (26.9, -1), (30.8, -1), (33.0, 1)):
        for index in range(6):
            t = index / 5
            z = origin + (t - .5) * .56 + rng.uniform(-.027, .027)
            x, _, width = watercourse_at(z)
            x += side * (width - .036 + .12 * (2 * t - 1) ** 2 + rng.uniform(-.024, .024))
            shore = index % 3 != 1
            yield x, z, shore, rng.uniform(.072, .108) if index in (0, 3) else rng.uniform(.028, .065)


def stream_shoal_sites():
    rng = random.Random(732465)
    # Buried bars curve out across the shallows between the bigger rock ribs.
    # Their isolated crowns remain below the water and away from the bridge.
    for station, side in ((17.56, 1), (18.66, 1), (20.20, 1), (24.34, -1), (26.15, -1), (27.62, -1), (29.12, -1)):
        for index in range(5):
            t = index / 4
            z = station + (t - .5) * .46 + rng.uniform(-.026, .026)
            centre, _, width = watercourse_at(z)
            x = centre + side * width * (.21 + .55 * (2 * t - 1) ** 2) + rng.uniform(-.021, .021)
            yield x, z, False, rng.uniform(.043, .088)


def spring_bank_rock_noses(ground, points, faces):
    # Exposed ribs of the creek bed reach into the current at different
    # angles. Their outer skirts stay in the terrain on wet and dry sides.
    sites = ((16.57, 1, .044, .214, .29, .111, -.20),
             (17.62, 1, .048, .266, .33, .137, .27),
             (18.04, 1, .060, .129, .148, .070, -.31),
             (19.08, 1, .042, .222, .37, .090, -.17),
             (20.12, 1, .032, .198, .235, .086, .22),
             (24.93, -1, .042, .214, .31, .098, .27),
             (26.36, -1, .049, .229, .275, .120, -.16),
             (28.46, -1, .040, .178, .22, .090, .30))
    outline = ((-.94, -.47), (-.39, -.96), (.39, -1.), (.89, -.51),
               (1., .19), (.60, .84), (-.25, 1.), (-1., .40))
    rng = random.Random(86413)
    wet_skirts, dry_skirts = [], []
    for z, side, setback, width, length, relief, rake in sites:
        channel, _, half_width = watercourse_at(z)
        x = channel + side * (half_width + setback)
        start = len(points)
        peak_x, peak_z = x + side * width * .18, z + length * rng.uniform(-.20, .20)
        points.append((peak_x, supports_height(peak_x, peak_z, [ground]) + relief, peak_z))
        margins = []
        border = [(across * rng.uniform(.87, 1.07), along * rng.uniform(.88, 1.06), rng.uniform(.56, .89))
                  for across, along in outline]
        for spread, skirt in ((.62, False), (1., True)):
            for across, along, height in border:
                px = x + side * spread * (across * width + along * length * rake)
                pz = z + spread * along * length
                terrain = supports_height(px, pz, [ground])
                points.append((px, terrain - .007 if skirt else terrain + relief * height, pz))
                if skirt:
                    margins.append(terrain - watercourse_at(pz)[1])
        wet_skirts.append(-min(margins))
        dry_skirts.append(max(margins))
        sides = len(border)
        for j in range(sides):
            a, b = start + 1 + j, start + 1 + (j + 1) % sides
            crown, shoulder = (start, b, a), (a, b, b + sides, a + sides)
            faces.extend((crown, shoulder) if side > 0 else (crown[::-1], shoulder[::-1]))
    if min(wet_skirts) <= 0. or min(dry_skirts) <= 0.:
        raise RuntimeError('A spring bank rock nose misses the wet shoreline.')
    print(f'PINE_STREAM_ROCK_NOSES {len(sites)} partially wet outcrops; '
          f'minimum submerged reach {min(wet_skirts):.6f} m and dry reach {min(dry_skirts):.6f} m.')


def spring_pebbles(stone, ground):
    rng = random.Random(59924)
    patches = [([], []) for _ in stone]
    sites = list(stream_gravel_sites(rng))
    for site, (x, z, shore, radius) in enumerate((*sites, *stream_shoal_sites())):
        shoal = site >= len(sites)
        _, waterline, _ = watercourse_at(z)
        path_centre, path_half_width = section_at(z)
        if abs(x - path_centre) < path_half_width + .21 + radius:
            continue
        bottom = supports_height(x, z, [ground])
        lift = radius * rng.uniform(.28, .54) if shore else (waterline - bottom) * rng.uniform(.49, .83)
        if lift <= .005:
            continue
        eccentricity = rng.uniform(.53, .90)
        angle = rng.uniform(0., math.tau)
        lean = rng.uniform(-.22, .22)
        patch = rng.randrange(len(patches))
        points, faces = patches[2 if shoal else patch]
        start = len(points)
        points.append((x, bottom + lift if shore else min(bottom + lift, waterline - .003), z))
        sides = 8
        perimeter = [radius * rng.uniform(.81, 1.16) for _ in range(sides)]
        for band, (spread, crest) in enumerate(((.61, .76), (1., 0.))):
            for j, scale in enumerate(perimeter):
                a = j / sides * math.tau
                dx, dz = spread * scale * math.cos(a), spread * scale * math.sin(a) * eccentricity
                px = x + dx * math.cos(angle) - dz * math.sin(angle)
                pz = z + dx * math.sin(angle) + dz * math.cos(angle)
                bed = supports_height(px, pz, [ground])
                y = bed - .006 if band else bed + lift * (crest + lean * math.cos(a))
                if not shore:
                    y = min(y, watercourse_at(pz)[1] - .003)
                points.append((px, y, pz))
        for j in range(sides):
            a, b = start + 1 + j, start + 1 + (j + 1) % sides
            faces.extend(((start, b, a), (a, b, b + sides, a + sides)))
    spring_bank_rock_noses(ground, *patches[2])
    wet_gravel = stone[2].copy()
    wet_gravel.name = 'Water-darkened spring gravel'
    wet_gravel['one_light_vertex_base_tint'] = mesh.color('#888c84')[:3]
    for index, (points, faces) in enumerate(patches):
        if not points:
            continue
        material = wet_gravel if index == 2 else stone[index]
        pebbles = mesh.mesh_object(f'Water-worn pebbles in spring gravel {index + 1}', points,
                                   faces, material, 'approach')
        pebbles['weather_stone'] = True
        pebbles['moss_edge'] = index == 4
        mesh.uv_world(pebbles, .53)
        source_uv(pebbles, [[(points[i][0], points[i][2]) for i in face] for face in faces],
                  'Separate plan charts for rounded, bed-fitted pebbles.')
        for face in pebbles.data.polygons:
            face.use_smooth = True


def stream_pine_roots(bark, ground):
    # The largest roots start inside the actual trunk rather than being placed
    # independently. At each bend the root follows the local bank grade.
    stems = [obj for obj in mesh.STATIC.objects if obj.name.endswith('crooked trunk')
             and obj.name.startswith(('Old pine', 'Low forest verge pine'))]
    ends = []
    for stem in stems:
        ring = [engine(vertex.co) for vertex in stem.data.vertices[:10]]
        x, _, z = (sum(components) / len(ring) for components in zip(*ring))
        if not 16. <= z <= 34.5 or 20.0 <= z <= 24.35:
            continue
        centre, _, half_width = watercourse_at(z)
        side = math.copysign(1., x - centre)
        origin_clearance = abs(x - centre) - half_width
        if not .53 < origin_clearance < 2.04:
            continue
        tip_z = z - .28 * side
        tip_x = centre + side * (half_width + .085)
        centres = []
        radii = (.106, .082, .065, .045, .024, .009)
        for step, (radius, height) in enumerate(zip(radii, (-.038, .015, .017, .010, -.019, -.026))):
            t = step / (len(radii) - 1)
            px = x + (tip_x - x) * t
            pz = z + (tip_z - z) * t + .18 * side * math.sin(math.pi * t)
            stair_x, stair_width = section_at(pz)
            if abs(px - stair_x) < stair_width + .38 + radius:
                break
            centres.append((px, supports_height(px, pz, [ground]) + height, pz))
        if len(centres) != len(radii):
            continue
        root = bark_tube(f'{stem.name.removesuffix(" crooked trunk")} spring-bank root', centres, radii, bark, 7)
        for vertex in root.data.vertices[-7:]:
            px, py, pz = engine(vertex.co)
            ends.append(py - supports_height(px, pz, [ground]))
    if not ends or max(ends) > .005:
        raise RuntimeError('A spring-bank root lacks a buried tip.')
    print(f'PINE_STREAM_ROOTS {len(ends) // 7} exposed roots; maximum signed tip gap {max(ends):.6f} m.')


def saddle_water(stone, ground, bark, tread_granite):
    water = mesh.material('Shallow spring runnel over washed gravel', '#4d4e3d', rough=.24)
    # Leave the gravel lit during the Cycles bake. Runtime alpha follows the
    # measured depth and grazing reflection across this same surface.
    water.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .065
    water.surface_render_method = 'BLENDED'
    points, profile = [], []
    cross_section = (-1., -.85, -.68, 0., .68, .85, 1.)
    stride = len(cross_section)
    for z in watercourse_stations(.32):
        centre, y, width = watercourse_at(z)
        for lateral in cross_section:
            x = centre + lateral * (width + STREAM_RIBBON_OVERLAP)
            depth = y - supports_height(x, z, [ground])
            points.append((x, y, z))
            profile.append((max(0., min(1., .5 + depth / .16)), (lateral + 1.) * .5))
    faces = [(i + j, i + stride + j, i + stride + j + 1, i + j + 1)
             for i in range(0, len(points) - stride, stride) for j in range(stride - 1)]
    channel = mesh.mesh_object('Spring runnel through the saddle', points, faces, water, 'approach')
    material_uv = channel.data.uv_layers['UVMap']
    for loop in channel.data.loops:
        material_uv.data[loop.index].uv = profile[loop.vertex_index]
    source_uv(channel, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Metre-scale chart for the water at its original surveyed level.')
    spring_pebbles(stone, ground)
    stream_pine_roots(bark, ground)
    bank_stones, deck_slabs = [], []
    for index, (_, _, z) in enumerate(WATERCOURSE[1:-1]):
        x, _, width = watercourse_at(z)
        x += (-1 if index % 3 else 1) * (width + .19)
        bank_y = supports_height(x, z, [ground])
        rock = hewn_block(f'Water-cut stream bank {index + 1}', .32, .19, .47,
                          (x, bank_y + .101, z), stone[index % len(stone)], 'approach')
        rock['moss_edge'] = True
        bank_stones.append(rock)
    fit_stone_undersides(ground, bank_stones, ((.069, .055), (.088, .014)))
    spring = hewn_block('Spring head emerging under a granite cap', .77, .46, .9,
                        (2.77, 4.41, 5.08), stone[4], 'gate')
    spring['moss_edge'] = True
    # The bridge spans retain their full length across the water. Worn stone
    # ends and uneven fieldstone shoulders share the old stair masonry.
    crossing = random.Random(641728)
    for index, z in enumerate(BRIDGE_DECK_CENTRES):
        top = 2.51 - index * .052
        water_limit = watercourse_at(z - BRIDGE_DECK_DEPTH / 2)[1] + .022
        slab = worn_approach_tread(f'Bridge decking slab {index + 1}', 2.17, BRIDGE_DECK_DEPTH,
                                  (.09, top, z), tread_granite, crossing, hewn_outline(),
                                  thickness=min(.21, top - water_limit))
        slab['moss_edge'] = True
        slab['bridge_masonry'] = True
        deck_slabs.append(slab)
    for z, slab in ((21.02, deck_slabs[0]), (23.23, deck_slabs[-1])):
        cap = max(v.co.z for v in slab.data.vertices[:slab['bearing_vertices']]) + .012
        footing = 2.01
        height = cap - footing
        mesh.box('Granite crossing abutment', (2.18, height, .29), (0, footing + height / 2, z),
                 tread_granite, min(.045, height * .25), region='approach')
    for side in (-1, 1):
        for index in range(4):
            x = .09 + side * crossing.uniform(.900, .938)
            z = BRIDGE_DECK_CENTRES[index] + crossing.uniform(.008, .055)
            width, depth = crossing.uniform(.22, .31), crossing.uniform(.36, .51)
            support = supports_height(x, z, deck_slabs, 3.1)
            parapet = worn_approach_tread(f'Fieldstone bridge shoulder {side} {index + 1}', width, depth,
                                         (x, support + crossing.uniform(.14, .195), z),
                                         tread_granite, crossing, hewn_outline(crossing), thickness=.23)
            parapet['moss_edge'] = True
            parapet['bridge_masonry'] = True
    return bank_stones, deck_slabs


def understory(ground, foliage):
    # Vary the rooted growth with the damp ground, including the margins of
    # the shoulder. Keep the root of each connected leaf on the bank.
    pockets = [(-3.1, 6.9), (-4.7, 13.1), (-3.8, 17.4), (-6.1, 25.4), (-3.6, 29.8),
               (-4.0, 35.7), (-6.5, 39.2), (-4.9, 44.1), (-7.0, 48.5),
               (3.7, 8.6), (3.4, 15.8), (5.4, 19.2), (3.8, 24.9), (5.9, 28.8),
               (4.9, 33.4), (3.8, 38.5), (6.2, 43.5), (4.5, 46.9)]
    shoulder = [(-5.12, 5.08), (-4.7, 6.6), (-3.4, 8.1), (5.3, 6.0),
                (5.64, 4.72), (6.6, 3.46), (-4.3, 27.2), (3.8, 28.1)]
    extra = random.Random(65274)
    for i in range(136):
        rng = RANDOM if i < 88 else extra
        sites = pockets if i < 112 else shoulder
        cx, cz = sites[i % len(sites)]
        x = cx + rng.uniform(-.68, .68)
        z = cz + rng.uniform(-1.46, 1.46)
        y = supports_height(x, z, [ground]) - .018
        vertices, faces, charts = [], [], []
        count = rng.randint(4, 8)
        grass = i % 4 in (0, 1)
        for frond in range(count):
            theta = frond * math.tau / count + rng.uniform(-.40, .40)
            length = rng.uniform(.15, .43) * (.91 if grass else 1.28)
            width = length * rng.uniform(.062, .119)
            cs, sn = math.cos(theta), math.sin(theta)
            start = len(vertices)
            if grass:
                shape = [(0., 0., 0.), (.42, .44, -.45), (.57, .55, 0.),
                         (.46, .41, .58), (1., .32, 0.)]
                outline = [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)]
            else:
                # Long hooked ends and separated lobes break up the radial
                # silhouette without making detached islands in the atlas.
                shape = [(0., 0., 0.), (.34, .44, -.84), (.42, .58, 0.), (.30, .45, .77),
                         (.69, .59, -.58), (.72, .64, 0.), (.61, .54, .62), (1., .45, .14)]
                outline = [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 5),
                           (2, 5, 6), (2, 6, 3), (4, 7, 5), (5, 7, 6)]
            vertices.extend((x + length * forward * cs - width * across * sn,
                             y + length * height, z + length * forward * sn + width * across * cs)
                            for forward, height, across in shape)
            faces.extend(tuple(start + k for k in face) for face in outline)
            charts.extend([[(width * shape[k][2], length * shape[k][0]) for k in face]
                           for face in outline])
        plant = mesh.mesh_object(f'Mountain fern and sedge tufts {i + 1}', vertices, faces,
                                 foliage[(i + 2 * (not grass)) % len(foliage)], 'approach')
        source_uv(plant, charts, 'Connected metre-scale charts for individual rooted leaves.')


NEEDLE_AROUND = (0., .31, .69, 1.)


def needle_material():
    import numpy as np

    # Three neighbouring banks of fascicles wrap different sides of a twig.
    # Leave the stem to the geometry. A prominent painted spine gives every
    # spray the silhouette of a single broad frond.
    size = 384
    rgba = np.zeros((size, size, 4), dtype=np.float32)
    rgba[..., :3] = (.070, .131, .062)
    rng = random.Random(6278)

    def stroke(a, b, radius, color):
        start, end = np.asarray(a) * size, np.asarray(b) * size
        lo = np.maximum(0, np.floor(np.minimum(start, end) - radius - 1).astype(int))
        hi = np.minimum(size, np.ceil(np.maximum(start, end) + radius + 1).astype(int))
        xx, yy = np.meshgrid(np.arange(lo[0], hi[0]) + .5, np.arange(lo[1], hi[1]) + .5)
        axis = end - start
        along = np.clip(((xx - start[0]) * axis[0] + (yy - start[1]) * axis[1]) / np.dot(axis, axis), 0, 1)
        distance = np.hypot(xx - start[0] - along * axis[0], yy - start[1] - along * axis[1])
        coverage = np.clip(radius + .55 - distance, 0, 1)
        patch = rgba[lo[1]:hi[1], lo[0]:hi[0]]
        fresher = coverage >= patch[..., 3]
        patch[fresher, :3] = color
        patch[fresher, 3] = coverage[fresher]

    shades = [(.032, .062, .025), (.048, .091, .033), (.057, .115, .033),
              (.080, .139, .046), (.102, .169, .051), (.073, .117, .041)]
    for panel, (lo, hi) in enumerate(zip(NEEDLE_AROUND, NEEDLE_AROUND[1:])):
        span = hi - lo
        for whorl in range(12):
            y = .093 + whorl * .060 + panel * .009 + rng.uniform(-.038, .038)
            arch = math.sin(math.pi * (.16 + .76 * whorl / 11))
            stem = .49 + .11 * math.sin(y * 6.2 + 2.2 * panel)
            for side in (-1, 1):
                root = lo + span * (stem + side * rng.uniform(.025, .12))
                rise = rng.uniform(.081, .177)
                reach = span * arch * rng.uniform(.21, .39)
                for _ in range(12):
                    v = y + rng.uniform(-.028, .045)
                    u = root + span * rng.uniform(-.051, .051)
                    free = hi - u if side == 1 else u - lo
                    sideways = min(reach * rng.uniform(.33, 1.18), max(0., free - span * .044) * rng.uniform(.78, .98))
                    forward = min(rise * rng.uniform(.49, 1.2), (.954 - v) * rng.uniform(.87, .99))
                    stroke((u, v), (u + side * sideways, v + forward), rng.uniform(.67, 1.32), rng.choice(shades))

    image = bpy.data.images.new('Pine needle spray RGBA', width=size, height=size, alpha=True)
    image.alpha_mode = 'STRAIGHT'
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    material = mesh.material('Open pine needle sprays', '#ffffff', rough=.94)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.extension = 'CLIP'
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    cutoff = nodes.new('ShaderNodeMath')
    cutoff.operation = 'GREATER_THAN'
    cutoff.inputs[1].default_value = .29
    links.new(texture.outputs['Alpha'], cutoff.inputs[0])
    links.new(cutoff.outputs[0], bsdf.inputs['Alpha'])
    return material


def pine_sprays(name, sprays, tint, *, close=False):
    points, faces, charts, material_uvs = [], [], [], []
    # A tuft wraps around its twig in three curved panels. The base row is
    # pinned for wind; the higher rows bend in different directions.
    rows = ((0., .18), (.46, 1.), (1., .37)) if close else ((0., .39), (1., .63))
    for index, (start, direction, length, diameter, roll) in enumerate(sprays):
        a, axis = Vector(start), Vector(direction).normalized()
        side = axis.cross(Vector((0, 1, 0)))
        if side.length < .01:
            side = axis.cross(Vector((1, 0, 0)))
        side.normalize()
        side.rotate(Matrix.Rotation(roll, 3, axis))
        up = axis.cross(side)
        radius = diameter * .32
        sweep = math.radians(286)
        perimeter = 2 * radius * sum(math.sin(sweep * (b - a) / 2)
                                     for a, b in zip(NEEDLE_AROUND, NEEDLE_AROUND[1:]))
        n = len(points)
        shape, local_uvs = [], []
        for t, spread in rows:
            bend = ((.44 if index % 2 else -.42) * math.sin(t * 2.7)) * radius
            center = a + axis * (length * t) + up * bend
            for s in NEEDLE_AROUND:
                angle = (s - .5) * sweep + t * .43
                lean = .88 + .15 * math.sin(index * 2.4 + s * 6 + t * 2)
                offset = side * math.cos(angle) + up * (math.sin(angle) * lean)
                points.append(center + offset * (spread * radius))
                shape.append(((s - .5) * perimeter * spread, length * t))
                local_uvs.append((s if index % 2 else 1. - s, t))
        columns = len(NEEDLE_AROUND)
        for row in range(len(rows) - 1):
            for column in range(columns - 1):
                i = row * columns + column
                # Increasing azimuth followed by axial travel faces out.
                corners = (i, i + 1, i + columns + 1, i + columns)
                faces.append(tuple(n + j for j in corners))
                charts.append([shape[j] for j in corners])
                material_uvs.append([local_uvs[j] for j in corners])
    obj = mesh.mesh_object(name, points, faces, tint, 'approach')
    source_uv(obj, charts, 'Connected metre-scale wrapping charts for rooted pine fascicles.')
    uv = obj.data.uv_layers['UVMap']
    for face, corners in zip(obj.data.polygons, material_uvs):
        face.use_smooth = True
        for i, coordinate in zip(face.loop_indices, corners):
            uv.data[i].uv = coordinate


HERO_PINE_CROWNS = {
    'Ancient western pine at the saddle': 'old',
    'Ancient eastern pine at the saddle': 'old',
    'Back ridge pine 5': 'young',
    'Layered ridge pine 4': 'ridge',
}


def use_native_valley_crown(label, profile, far_crown):
    # At the across-valley framing distances use the measured crown of a
    # scanned tree. Both ancient pines beside the path keep close geometry.
    return (profile is not None and label in VALLEY_NODES and far_crown is not None
            and all(view.get('nativeObject') for view in far_crown[1][profile]))


def hero_pine_crown(label, trunk, phase, bark, material):
    profile = CROWNS[HERO_PINE_CROWNS[label]]
    if label == 'Back ridge pine 5':
        phase += .9
    needles = grow_crown(label, profile, trunk, phase, bark, bark_tube)
    points, faces, charts, wind = needle_mesh(needles, compact=True)
    canopy = mesh.mesh_object(f'{label} hero needle fascicles', points, faces, material, 'approach')
    source_uv(canopy, charts, 'Separate needle section nets in metres, with pinned stem UV0.')
    uv = canopy.data.uv_layers['UVMap'].data
    for face in canopy.data.polygons:
        face.use_smooth = True
        for loop, vertex in zip(face.loop_indices, face.vertices):
            uv[loop].uv = wind[vertex]


MODELLED_PINE_CROWNS = {
    'Back ridge pine 5', 'Back ridge pine 6',
    'Layered ridge pine 1', 'Layered ridge pine 2', 'Layered ridge pine 4',
    'Layered ridge pine 5', 'Layered ridge pine 6',
}

# These trees still break the silhouette at the shoulder and tea pavilion.
# Keep the distant reliefs and the three native scan mounts at their
# existing roots. The near crowns need three-dimensional branches from
# the uphill approach as well as from the valley-facing pavilion.
SHOULDER_PINE_CROWNS = {
    'Back ridge pine 4', 'Back ridge pine 6',
    'Layered ridge pine 2', 'Layered ridge pine 3',
    'Layered ridge pine 5', 'Layered ridge pine 6',
}


def pine_needles(name, shoots, material):
    points, faces, charts, wind_uv = [], [], [], []
    rng = random.Random(name)
    for start, direction, length, radius, roll in shoots:
        axis = Vector(direction).normalized()
        side = axis.cross(Vector((0., 1., 0.)))
        if side.length < .01:
            side = axis.cross(Vector((1., 0., 0.)))
        side.normalize()
        side.rotate(Matrix.Rotation(roll, 3, axis))
        up = axis.cross(side)
        curve = rng.uniform(.12, .34)
        first_vertex = len(points)
        layout, sway = [], []
        # Leave bare twig between each pair of needles. The two section rings
        # at a bud define the small attachment edge for narrow needle blades.
        half_attachment = min(.035, .0024 / length)
        samples = [0.]
        for bud in (.104, .356, .630):
            samples.extend((bud - half_attachment, bud + half_attachment))
        samples.append(.79)
        for f in samples:
            center = start + axis * (length * f) + up * (length * curve * f * f)
            half = min(.006, max(.0025, radius * .035)) * (1. - .63 * f)
            for sign in (-1, 1):
                points.append(center + side * (half * sign))
                layout.append((half * sign, length * f))
                sway.append(((sign + 1) * .5, .92 * f))

        def surface(corners):
            faces.append(tuple(first_vertex + j for j in corners))
            charts.append([layout[j] for j in corners])

        for i, (a, b) in enumerate(zip(samples, samples[1:])):
            left, right, next_left, next_right = range(i * 2, i * 2 + 4)
            surface((left, right, next_right, next_left))
            if i % 2 == 0:
                continue
            for sign, root, next_root in ((-1, left, next_left), (1, right, next_right)):
                root_pos = points[first_vertex + root].lerp(points[first_vertex + next_root], .43)
                reach = radius * rng.uniform(.66, 1.26) * (1. - .39 * a)
                slant = rng.uniform(-1.09, 1.22)
                outward = side * (sign * math.cos(slant)) + up * math.sin(slant)
                middle = root_pos + outward * (reach * .72) + axis * (reach * rng.uniform(.47, .73))
                tip = root_pos + outward * (reach * .99) + axis * (reach * rng.uniform(.86, 1.31))
                j = len(layout)
                points.extend((middle, tip))
                root_u = layout[root][0]
                layout.extend(((root_u + sign * reach * .64, length * (a * .72 + b * .28)),
                               (root_u + sign * reach * .96, length * (a * .22 + b * .78))))
                sway.extend((((sign + 1) * .5, .99 * a + .24), ((sign + 1) * .5, .98 * a + .42)))
                if sign == -1:
                    surface((root, next_root, j + 1))
                    surface((root, j + 1, j))
                else:
                    surface((next_root, root, j))
                    surface((next_root, j, j + 1))
        wind_uv.extend(sway)

    canopy = mesh.mesh_object(name, points, faces, material, 'approach')
    source_uv(canopy, charts, 'Connected metre-scale pine stem and needle charts.')
    uv = canopy.data.uv_layers['UVMap']
    for face in canopy.data.polygons:
        face.use_smooth = True
        for i, vertex in zip(face.loop_indices, face.vertices):
            uv.data[i].uv = wind_uv[vertex]


def shoulder_pine_needles(name, shoots, material):
    rng = random.Random(name)
    world_up = Vector((0., 1., 0.))
    points, faces, charts, wind = [], [], [], []
    for start, direction, length, radius, roll in shoots:
        axis = direction.normalized()
        side = axis.cross(world_up)
        if side.length < .01:
            side = axis.cross(Vector((1., 0., 0.)))
        side.normalize()
        side.rotate(Matrix.Rotation(roll, 3, axis))
        up = axis.cross(side)
        stem, attached = [start], {}
        for station, turn in ((.25, 1.), (.72, -1.)):
            distance = length * (station + rng.uniform(-.1, .09))
            lift = length * .31 * station * station
            root = start + axis * distance + up * lift
            shoot = axis + side * (turn * rng.uniform(.21, .57)) + up * (.18 + .31 * station)
            reach = radius * rng.uniform(.65, .87) * (1 - .23 * station)
            angle = roll + rng.uniform(-1.1, 1.1)
            first = tuple(needle_fascicle(root, shoot, angle, reach, rng, False))
            second = tuple(needle_fascicle(root, shoot, angle + 1.14, reach * .89, rng, False))
            index = len(stem)
            stem.extend(root + axis * (length * .16 * (i / 4 - .5)) for i in range(5))
            attached.update((index + i, pair) for i, pair in enumerate(zip(first, second)))
        stem_start = len(points)
        uvs = []
        half_width = .005
        height = 0.
        for i, center in enumerate(stem):
            if i:
                height += (center - stem[i - 1]).length
            points.extend((center - side * half_width, center + side * half_width))
            wind.extend(((0., 0.), (1., 0.)))
            uvs.append(((-half_width, height), (half_width, height)))
            half_width *= .91
        for i, (lower, higher) in enumerate(zip(uvs, uvs[1:])):
            lower_left = stem_start + i * 2
            lower_right, upper_left, upper_right = (lower_left + offset for offset in (1, 2, 3))
            faces.append((lower_left, lower_right, upper_right, upper_left))
            charts.append((lower[0], lower[1], higher[1], higher[0]))
            if i not in attached:
                continue
            center = stem[i].lerp(stem[i + 1], .5)
            for blade, low_edge, high_edge, low_uv, high_uv, sign in (
                (attached[i][0], lower_left, upper_left, lower[0], higher[0], -1.),
                (attached[i][1], lower_right, upper_right, lower[1], higher[1], 1.),
            ):
                root, shoulder, tip, width = blade
                shift = center - root
                flare = axis.cross(tip - root).normalized()
                if flare.length < .1:
                    flare = side
                low_needle = len(points)
                high_needle, end = low_needle + 1, low_needle + 2
                points.extend((shoulder + shift - flare * width, shoulder + shift + flare * width, tip + shift))
                wind.extend(((0., .52), (1., .52), (.5, 1.)))
                v = (low_uv[1] + high_uv[1]) * .5
                cross_width = min(width, (high_uv[1] - low_uv[1]) * .42)
                x = sign * (max(abs(low_uv[0]), abs(high_uv[0])) + (shoulder - root).length)
                low, high, endpoint = (x, v - cross_width), (x, v + cross_width), (x + sign * (tip - shoulder).length, v)
                if sign < 0:
                    faces.extend(((low_edge, high_edge, high_needle, low_needle), (low_needle, high_needle, end)))
                    charts.extend(((low_uv, high_uv, high, low), (low, high, endpoint)))
                else:
                    faces.extend(((high_edge, low_edge, low_needle, high_needle), (high_needle, low_needle, end)))
                    charts.extend(((high_uv, low_uv, low, high), (high, low, endpoint)))
    canopy = mesh.mesh_object(name, points, faces, material, 'approach')
    source_uv(canopy, charts, 'One unfolded twig strip with physically attached needles per shoot.')
    uv = canopy.data.uv_layers['UVMap'].data
    for face in canopy.data.polygons:
        face.use_smooth = True
        for loop, vertex in zip(face.loop_indices, face.vertices):
            uv[loop].uv = wind[vertex]


def pine_branch_shoots(name, branch, reach, rng, bark):
    joint, bend, tip = branch[1:]
    axis = (tip - joint).normalized()
    side = axis.cross(Vector((0., 1., 0.))).normalized()
    up = Vector((0., 1., 0.))
    spread = rng.choice((-1., 1.))
    scale = min(1.05, .68 + reach * .18)
    anchor = joint.lerp(bend, rng.uniform(.40, .68))
    twig_axis = (axis + side * (spread * rng.uniform(.43, .85)) + up * rng.uniform(.07, .28)).normalized()
    twig_length = min(.53, reach * rng.uniform(.25, .36))
    elbow = anchor + twig_axis * (twig_length * .58)
    twig_tip = anchor + twig_axis * twig_length + up * (twig_length * .17)
    bark_tube(f'{name} short foliage fork', [anchor, elbow, twig_tip], [.012 * scale, .007 * scale, .0025], bark, 3)
    # Stagger growth along the bough and around its short lateral fork.
    stems = [
        (joint.lerp(bend, rng.uniform(.21, .47)), axis - side * (spread * .62), 1.0),
        (anchor.lerp(elbow, .68), twig_axis + up * .32, .96),
        (elbow.lerp(twig_tip, .64), twig_axis + side * (spread * .49) + up * .13, .88),
        (bend.lerp(tip, rng.uniform(.27, .48)), axis - side * (spread * .63) + up * .18, .94),
        (bend.lerp(tip, rng.uniform(.63, .87)), axis + up * .31, .70),
    ]
    if reach > 1.20:
        stems.append((joint.lerp(bend, .72), axis + side * (spread * .53) + up * .36, .84))
    return [(root, direction + up * rng.uniform(-.18, .21), rng.uniform(.36, .57) * scale * age,
             rng.uniform(.23, .36) * scale * age, rng.uniform(-2.5, 2.5))
            for root, direction, age in stems]


def bark_tube(name, points, radii, bark, radial):
    # Reuse the tube's axial unwrapping so the scanned grain follows the
    # length of the trunk and the curved boughs, across their front faces.
    obj = mesh.curved_tube(name, points, radii, bark, radial=radial, region='approach')
    source = obj.data.uv_layers['SourceLightmap']
    material = obj.data.uv_layers['UVMap']
    repeat_width, repeat_height = (.81, 1.14) if bark.get('one_light_ancient_pine_bark') else (.88, 1.46)
    for target, axial in zip(material.data, source.data):
        target.uv = (axial.uv.x / repeat_width, axial.uv.y / repeat_height)
    return obj


def ancient_bark_contour(stem, centres, sides, phase):
    # Coarse flutes read across the walk. Finer fissures keep the relief
    # continuous with the scan when the visitor reaches the saddle.
    grooves = stem.data.attributes.new('AncientBarkGrooves', 'FLOAT', 'POINT')
    outward = math.copysign(1., centres[0].x)
    for ring, centre in enumerate(centres):
        fraction = ring / (len(centres) - 1)
        origin = mesh.point(centre)
        lower = max(0., 1. - fraction / .38) ** .72
        buttress = .48 * math.exp(-10.6 * fraction)
        for index in range(sides):
            angle = math.tau * index / sides
            bend = phase + 1.75 * fraction + .31 * math.sin(fraction * 11.0)
            rib = .089 * math.sin(angle * 7 + bend) + .044 * math.sin(angle * 11 - bend * .61)
            plate = .036 * math.sin(angle * 5 + fraction * 54.0 + phase)
            plate += .026 * math.sin(angle * 9 + bend + .68 * math.sin(fraction * 49.))
            flute = .72 * math.cos(3 * angle + bend) + .28 * math.sin(2 * angle - bend * .67)
            recess = max(0., .23 - flute)
            vertex = stem.data.vertices[ring * sides + index]
            offset = vertex.co - origin
            bank_side = max(0., .32 + .68 * outward * offset.x / offset.length)
            # Developed buttress wood stays on the bank side of the path.
            width = 1. + (rib + plate) * (1. - fraction * .72) - .19 * lower * recess
            width += buttress * bank_side * (.68 + .32 * flute)
            vertex.co = origin + offset * width
            grooves.data[vertex.index].value = lower * recess / 1.23
    stem.data.update()


def ancient_pine_roots(label, x, z, phase, bark, ground):
    outward = math.copysign(1., x)
    bearing = supports_height(x, z, [ground])
    for i, (turn, reach) in enumerate(((-1.14, 1.49), (-.43, 1.73), (.35, 1.92), (1.17, 1.58))):
        angle = turn + .10 * math.sin(phase + 2.4 * i)
        vx, vz = outward * math.cos(angle), math.sin(angle)
        curl = .13 * math.sin(phase + i * 2.9)
        centres = [(x, bearing + .35, z)]
        for t, lift in ((.31, .16), (.61, .085), (.83, .026), (1., -.063)):
            xx = x + t * reach * vx - curl * math.sin(math.pi * t) * vz
            zz = z + t * reach * vz + curl * math.sin(math.pi * t) * vx
            centres.append((xx, supports_height(xx, zz, [ground]) + lift, zz))
        width = .89 + reach * .18
        bark_tube(f'{label} exposed buttress root {i + 1}', centres,
                  [.25 * width, .153 * width, .090 * width, .046 * width, .010], bark, 7)


def roadside_bark_contour(stem, centres, sides, phase):
    # Broad root ribs merge into the lower trunk before they disappear into
    # the ground. Keep the ring centroid at the surveyed root.
    for ring, centre in enumerate(centres):
        fraction = ring / (len(centres) - 1)
        origin = mesh.point(centre)
        root_flare = .46 * math.exp(-15. * fraction)
        for index in range(sides):
            angle = math.tau * index / sides
            rib = math.cos(3. * angle + phase + 1.2 * fraction)
            grain = .044 * math.sin(4. * angle - phase + 3.7 * fraction)
            width = 1. + root_flare * (1. + .57 * rib) + grain * (1. - .6 * fraction)
            vertex = stem.data.vertices[ring * sides + index]
            vertex.co = origin + (vertex.co - origin) * width
    stem.data.update()


def pine_bough(name, root, outward, reach, drift, droop, lift, bark, radial=5):
    side = Vector((-outward.z, 0, outward.x))
    points = [root + outward * (reach * t) +
              side * (reach * drift * t * (.48 + .52 * t)) +
              Vector((0, reach * (lift * t ** 3 - droop * t), 0))
              for t in (0., .26, .61, 1.)]
    bark_tube(name, points, [reach * r for r in (.050, .037, .019, .0025)], bark, radial)
    return points


def pine_tree(label, x, z, height, bark, needles, ground, roots=False, lean=None, crown_start=.38,
              modelled_needles=None, far_crown=None, trunk_bark=None):
    ancient = lean is not None
    roadside = not ancient and z >= 12. and abs(x) < 5.
    y = supports_height(x, z, [ground]) - .26
    drift = RANDOM.uniform(-.95, .95) if lean is None else lean
    side = RANDOM.uniform(-.49, .49)
    phase = RANDOM.uniform(0, math.tau)
    def at(f):
        sweep = (.26 * f + 1.04 * f * f) if ancient else f * f
        cross = math.copysign(.86, drift) * f ** 2 if ancient else 0.
        crook = .24 * (math.sin(f * 9.5 + phase) - math.sin(phase)) * f if ancient else 0.
        mid = math.sin(math.pi * f) if roadside else 0.
        bow = math.copysign(mid * (.30 + .16 * math.sin(f * 6.4 + phase)), x)
        warp = .28 * mid * math.cos(f * 5.3 - phase)
        return Vector((x + drift * sweep + .23 * math.sin(f * 5 + phase) * f + bow,
                       y + height * f,
                       z + side * f - .19 * math.sin(f * 4.2 + phase) * f + cross + crook + warp))
    segments = 18 if ancient else 9 if roadside else 7
    centres = [at(j / segments) for j in range(segments + 1)]
    def trunk_at(f):
        j = min(segments - 1, int(f * segments))
        return centres[j].lerp(centres[j + 1], f * segments - j)

    radii = [height * (.0014 + .056 * (1 - j / segments) ** .96) if ancient
             else height * (.00065 + .027 * (1 - j / segments) ** 1.16)
             for j in range(segments + 1)]
    sides = 24 if ancient else 10
    stem = bark_tube(f'{label} crooked trunk', centres, radii, bark if trunk_bark is None else trunk_bark, sides)
    if ancient:
        ancient_bark_contour(stem, centres, sides, phase)
    if roadside:
        roadside_bark_contour(stem, centres, sides, phase)
    if roots and ancient:
        ancient_pine_roots(label, x, z, phase, bark if trunk_bark is None else trunk_bark, ground)
    if roots and not ancient:
        for i in range(3):
            direction = phase + i * 2.2
            vx, vz = math.cos(direction), math.sin(direction)
            reach_scale = .95 + .13 * math.sin(phase + i * 2.6) if roadside else 1.
            start = (x, y + .34, z)
            bend = .12 * math.sin(phase + i * 2.4) if roadside else 0.
            x1, z1 = x + vx * .43 * reach_scale - vz * bend, z + vz * .43 * reach_scale + vx * bend
            x2, z2 = x + vx * .94 * reach_scale, z + vz * .94 * reach_scale
            middle = (x1, supports_height(x1, z1, [ground]) + .035, z1)
            end = (x2, supports_height(x2, z2, [ground]) - .044, z2)
            shoulder = .102 if roadside else .074
            bark_tube(f'{label} exposed buttress root', [start, middle, end],
                      [shoulder * reach_scale, .046 * reach_scale if roadside else .038 * reach_scale, .008],
                      bark if trunk_bark is None else trunk_bark, 7)
    profile = HERO_PINE_CROWNS.get(label)
    use_native_crown = use_native_valley_crown(label, profile, far_crown)
    shoulder_crown = label in SHOULDER_PINE_CROWNS
    carries_forks = ancient or (z < 3 and abs(x) < 8)
    shoots = []
    crown_rng = random.Random(label)
    if not ancient and z < 3:
        crown_start = min(crown_start, .28)
    for i in range(7):
        height_fraction = (.31 + .095 * i) if ancient else crown_start + (.89 - crown_start) * i / 6
        for bough in range(2):
            heading = RANDOM.uniform(-.29, .29)
            growth = RANDOM.uniform(.77, 1.20)
            (side_turn, shoulder, taper, droop, lift, turn, fork, lower, upper,
             spread, roll, leader, outer_turn, outer_lift, size, fork_reach, inner_width, outer_size) = [
                RANDOM.random() for _ in range(18)
            ]
            if profile or (far_crown and not shoulder_crown):
                # Keep the shared RNG cursor stable for unswapped trees and
                # undergrowth that follow this crown in the source.
                continue
            heading += phase + i * 2.38 + bough * (2.34 + .95 * side_turn)
            direction = Vector((math.cos(heading), 0, math.sin(heading)))
            side_vector = Vector((-direction.z, 0, direction.x))
            f = height_fraction + (shoulder - .5) * .047 + bough * (.009 + .030 * taper)
            root = trunk_at(f)
            reach = height * (.186 - .012 * i) * growth * (1. if bough == 0 else .65 + .27 * spread)
            branch = pine_bough(f'{label} rising bough {i} {bough}', root, direction, reach,
                                (turn - .5) * .47, .035 + droop * .106, .11 + lift * .20, bark,
                                radial=6 if ancient else 5)
            if modelled_needles is not None:
                shoots.extend(pine_branch_shoots(f'{label} bough {i}.{bough}', branch, reach, crown_rng, bark))
                continue
            inner = branch[1].lerp(branch[2], .22 + lower * .55)
            inner_axis = direction + side_vector * (fork - .5) * .88 + Vector((0, .23 + .33 * leader, 0))
            outer = branch[2].lerp(branch[3], .25 + upper * .42)
            outer_axis = (branch[3] - branch[2]).normalized() + side_vector * (-.26 - outer_turn * .17)
            outer_axis.y += .14 + outer_lift * .39
            length = (.34 + reach * .44) * (.86 + .23 * size)
            if carries_forks:
                # A short lateral fork carries the lower tuft into the volume
                # around the main bough, the way a growing pine fills a gap.
                fork_axis = inner_axis.normalized()
                fork_end = inner + fork_axis * (length * (.31 + .15 * fork_reach))
                elbow = inner.lerp(fork_end, .52) + Vector((0, -.021 * length, 0))
                bark_tube(f'{label} lateral fork {i} {bough}', [inner, elbow, fork_end],
                          [length * r for r in (.018, .010, .002)], bark, 5)
                inner = elbow.lerp(fork_end, .25)
            sprays = [(inner, inner_axis, length, length * (1.04 + inner_width * .36), roll - .5),
                      (outer, outer_axis, length * (.76 + outer_size * .20), length * 1.02, roll + .82)]
            pine_sprays(f'{label} needle clusters {i} {bough}', sprays, needles, close=carries_forks or z < 3)
    if profile and not use_native_crown:
        hero_pine_crown(label, centres, phase, bark, modelled_needles)
        return at if ancient else None
    if far_crown and not shoulder_crown:
        camera, views, mounts = far_crown
        relief_crown(label, profile if use_native_crown else 'ridge', centres, camera, views, mesh, source_uv)
        if use_native_crown and mounts is not None:
            proxy = mesh.STATIC.objects[f'{label} depth-reconstructed crown']
            add_native_mount(mounts, label, centres, camera, views[profile], proxy, stem)
        return None
    leader = []
    for order, roll in enumerate((.33, -.27, .67)):
        origin = trunk_at(.83 + .044 * order)
        angle = phase + order * 2.18
        axis = (trunk_at(1.) - origin).normalized() + Vector((.57 * math.cos(angle), 0, .57 * math.sin(angle)))
        length = height * (.117 - .020 * order)
        leader.append((origin, axis, length, length * 1.12, roll))
    if modelled_needles is None:
        pine_sprays(f'{label} short leader growth', leader, needles, close=carries_forks or z < 3)
    else:
        shoots.extend((root, axis, .51 * length, .20 * length, roll) for root, axis, length, _, roll in leader)
        canopy = shoulder_pine_needles if shoulder_crown else pine_needles
        canopy(f'{label} modelled live needles', shoots, modelled_needles)
    return at if ancient else trunk_at


def distant_pines(ground, bark, needles, modelled_needles, far_crown):
    # Keep the staggered ridge positions; narrow older leaders disappear
    # among irregular live crowns rather than sticking above a few bare arms.
    trees = [(-4.2, -3.6, 6.9), (-6.6, -5.2, 9.4), (-9.5, -7.0, 7.9),
             (4.0, -5.1, 8.3), (6.7, -3.8, 6.7), (9.8, -7.2, 8.8),
             (-4.9, -13.6, 8.5), (-8.3, -16.2, 10.2), (-12.7, -19.8, 8.8),
             (4.7, -15.0, 9.4), (8.4, -18.2, 8.3), (12.1, -14.4, 10.1)]
    for i, (x, z, height) in enumerate(trees):
        y = supports_height(x, z, [ground]) - .13
        rng = random.Random(9197 + i)
        lean = .62 * math.sin(i * 2.01)
        phase = i * 2.39
        levels = (0., .28, .42, .54, .67, .80, .91, 1.)
        positions = [Vector((x + lean * t * t + .12 * math.sin(phase + t * 5.0) * t,
                             y + height * t, z + .25 * math.sin(phase) * t)) for t in levels]
        label = f'Layered ridge pine {i + 1}'
        stem = bark_tube(f'{label} tapered trunk', positions,
                         [height * (.00065 + .0155 * (1. - t) ** 1.21) for t in levels], bark, 7)
        profile = HERO_PINE_CROWNS.get(label)
        use_native_crown = use_native_valley_crown(label, profile, far_crown)
        shoulder_crown = label in SHOULDER_PINE_CROWNS
        if profile and not use_native_crown:
            hero_pine_crown(label, positions, phase, bark, modelled_needles)
            continue
        if far_crown and not shoulder_crown:
            camera, views, mounts = far_crown
            prototype = profile if use_native_crown else 'young' if height < 8. else 'ridge'
            relief_crown(label, prototype, positions, camera, views, mesh, source_uv)
            if mounts is not None and label in VALLEY_NODES:
                proxy = mesh.STATIC.objects[f'{label} depth-reconstructed crown']
                # The left shoulder keeps its reviewed young relief and uses
                # the ridge prototype's measured views for the shared high mesh.
                add_native_mount(mounts, label, positions, camera, views[profile or 'ridge'], proxy, stem)
            continue
        sprays, shoots = [], []
        model_crown = shoulder_crown or label in MODELLED_PINE_CROWNS
        crown_rng = random.Random(label)
        for tier in range(len(levels) - 2):
            stems = 2 if (i < 6 and tier < 4) or tier in (1, 3) else 1
            for bough in range(stems):
                angle = phase + tier * 2.29 + bough * rng.uniform(2.24, 3.26) + rng.uniform(-.42, .42)
                direction = Vector((math.cos(angle), 0, math.sin(angle)))
                side = Vector((-direction.z, 0, direction.x))
                base = positions[tier + 1].lerp(positions[tier + 2], rng.uniform(.02, .28))
                reach = height * (.181 - .016 * tier) * rng.uniform(.78, 1.18) * (.79 if bough else 1.)
                branch = pine_bough(f'{label} bough {tier + 1}.{bough + 1}', base, direction, reach,
                                    rng.uniform(-.22, .25), rng.uniform(.03, .14), rng.uniform(.11, .27), bark)
                origin = branch[1].lerp(branch[2], rng.uniform(.28, .78))
                along = (branch[3] - branch[2]).normalized() + side * rng.uniform(-.26, .38)
                along.y += rng.uniform(.13, .37)
                length = .33 + reach * rng.uniform(.55, .74)
                sprays.append((origin, along, length, length * rng.uniform(1.12, 1.47), rng.uniform(-.7, 1.7)))
                if model_crown:
                    shoots.extend(pine_branch_shoots(f'{label} bough {tier + 1}.{bough + 1}', branch, reach, crown_rng, bark))
        for order, roll in enumerate((.27, -.42)):
            origin = positions[-3].lerp(positions[-2], .28 + order * .43)
            axis = (positions[-1] - origin).normalized()
            axis += Vector((.48 * math.cos(phase + order * 1.8), 0, .48 * math.sin(phase + order * 1.8)))
            length = height * (.140 - .027 * order)
            sprays.append((origin, axis, length, length * 1.13, roll))
        if model_crown:
            shoots.extend((root, axis, .52 * length, .22 * length, roll) for root, axis, length, _, roll in sprays[-2:])
            canopy = shoulder_pine_needles if shoulder_crown else pine_needles
            canopy(f'{label} modelled live needles', shoots, modelled_needles)
        else:
            pine_sprays(f'{label} needle crown', sprays, needles, close=True)


def crest_ribbons(label, trunk_at, cloth):
    trunk = mesh.STATIC.objects[f'{label} crooked trunk']
    bark_surface, _ = contacts.support([trunk])
    for index, (fraction, heading, length) in enumerate(((.172, .82, .33), (.202, .49, .28), (.228, 1.09, .36))):
        knot = trunk_at(fraction)
        outward = Vector((math.cos(heading), 0., math.sin(heading)))
        tangent = Vector((-outward.z, 0., outward.x))
        cast_direction = mesh.point(-outward)
        vertices, uv, faces = [], [], []
        for row in range(7):
            t = row / 6
            centre = knot - Vector((0., length * t, 0.))
            centre += tangent * (.047 * t + .009 * math.sin(t * 8.))
            width = (.017 + .026 * min(1., 3.2 * t)) * (1. - .17 * t ** 3)
            for side in (-1, 0, 1):
                spot = centre + tangent * (side * width)
                if row == 6:
                    spot.y += .011 if side == 0 else -.004 * side
                hit, _, _, _ = bark_surface.ray_cast(mesh.point(spot + outward * 1.3), cast_direction, 1.8)
                if hit is None:
                    raise RuntimeError('Pine ribbon hangs outside the surveyed ancient trunk.')
                lift = .0015 + t * (.039 + .042 * t + .013 * (1 - abs(side)))
                vertices.append(engine(hit + mesh.point(outward) * lift))
                uv.append((side * width + .047 * t, length * t))
            if row:
                base = (row - 1) * 3
                faces.extend((base + side, base + side + 1, base + side + 4, base + side + 3)
                             for side in range(2))
        ribbon = mesh.mesh_object(f'Weathered ribbon on crest pine {index + 1}', vertices, faces, cloth, 'approach')
        source_uv(ribbon, [[uv[i] for i in face] for face in faces],
                  'A sewn strip departing from an evaluated contact on the bark.')


def forest(ground, rock, stone, bark, pine, far_crown=None):
    needles = needle_material()
    modelled_needles = mesh.material('Modelled pine needles', '#587541', rough=.78)
    for i, z in enumerate((13, 17, 22, 27, 32, 38, 44, 49)):
        for s in (-1, 1):
            x = s * RANDOM.uniform(3.95 if z > 42 else 2.58, 4.46)
            pine_tree(f'Old pine {i + 1} {s}', x, z + RANDOM.uniform(-1.6, 1.6),
                      RANDOM.uniform(6.1, 10.4), bark, needles, ground, roots=z >= 14)
    west_label = 'Ancient western pine at the saddle'
    old_bark = apply_scan(mesh.material('Fissured bark on the ancient saddle pines', '#af9684'),
                          'knotted_pine_bark', .91)
    mesh.vertex_tint_shader(old_bark)
    old_bark['one_light_ancient_pine_bark'] = True
    low = pine_tree(west_label, -1.88, PINE_CREST + .08, 10.6,
                    bark, needles, ground, roots=True, lean=2.43, modelled_needles=modelled_needles,
                    trunk_bark=old_bark)
    pine_tree('Ancient eastern pine at the saddle', 1.82, PINE_CREST - .32, 11.4,
              bark, needles, ground, roots=True, lean=-2.68, modelled_needles=modelled_needles,
              trunk_bark=old_bark)
    cloth = mesh.material('Sun-faded red cloth on the old pine', '#a35a4b', rough=.93)
    crest_ribbons(west_label, low, cloth)
    for i, (x, z, h) in enumerate(((-10, 0, 10), (12, -3, 9), (8, -14, 7), (-7, -10, 8),
                                   (-4, -6, 7), (4, -8, 8), (15, 18, 9), (-17, 19, 9))):
        label = f'Back ridge pine {i + 1}'
        pine_tree(label, x, z, h, bark, needles, ground,
                  modelled_needles=modelled_needles if label in MODELLED_PINE_CROWNS | SHOULDER_PINE_CROWNS else None,
                  far_crown=far_crown if z < 0 else None)
    # Shorter pines overhang the older stone and screen the buildings
    # through the middle approach. Their crowns open up at the saddle.
    for index, (x, z, height) in enumerate(((-2.73, 26.8, 5.5), (2.65, 25.1, 5.8),
                                           (3.12, 16.1, 4.8), (-3.36, 13.1, 5.05))):
        label = f'Low forest verge pine {index + 1}'
        trunk_at = pine_tree(label, x, z, height, bark, needles, ground, roots=True, crown_start=.19)
        if index >= 2:
            # The mid-slope pines carry separate, asymmetrical overhead
            # branches. Their twigs screen the valley until the walker reaches
            # the actual saddle, while staying above the existing camera.
            inward = Vector((-math.copysign(1., x), 0., -.32 if index == 2 else .17)).normalized()
            rng = random.Random(label)
            shoots = []
            for tier, fraction in enumerate((.57, .73)):
                reach = (2.17, 3.32)[index - 2] * (1 - tier * .23)
                name = f'{label} overhead bough {tier + 1}'
                branch = pine_bough(name, trunk_at(fraction), inward, reach, .12 - tier * .24,
                                    .09, .17, bark, radial=6)
                shoots.extend(pine_branch_shoots(name, branch, reach, rng, bark))
            pine_needles(f'{label} overhead needles', shoots, modelled_needles)
    distant_pines(ground, bark, needles, modelled_needles, far_crown)
    understory(ground, pine)
    # These iron-gray outcrops are part of the bank. Their lower bands extend
    # below the terrain and their exposed corners interrupt the bare slope.
    ledges = [(-5.3, 44.5, .46), (-4.4, 39.6, .52), (4.4, 42.8, .61), (5.05, 35.5, .48),
              (4.7, 30.8, .58), (-5.4, 25.1, .43), (4.1, 17.5, .46), (-4.9, 11.8, .61),
              (3.8, 9.9, .43), (-5.6, 6.7, .56)]
    for i, (x, z, radius) in enumerate(ledges):
        y = supports_height(x, z, [ground])
        slab = hewn_block(f'Exposed slate seam {i + 1}', radius * RANDOM.uniform(1.4, 2.6),
                          radius * .71, radius * RANDOM.uniform(.92, 1.46),
                          (x, y + radius * (.12 + .025 * (i % 3)), z),
                          (rock, stone[4], stone[1])[i % 3], 'approach')
        slab['moss_edge'] = True
        for vertex in slab.data.vertices:
            vx, vz = vertex.co.x - x, -vertex.co.y - z
            shoulder_y = supports_height(vertex.co.x, -vertex.co.y, [ground])
            vertex.co.z += shoulder_y - y + (.07 * vx - .04 * vz) * (-1 if i % 2 else 1)
    for i, (x, z, r) in enumerate(((-3.76, 34, .64), (3.6, 25, .76), (-3.7, 12, .51), (4.6, 6.9, .52))):
        y = supports_height(x, z, [ground])
        profile = [(0, 0), (r * .52, 0), (r, r * .28), (r * .76, r * .49), (r * .40, r * .64), (0, r * .68)]
        with contacts.group(f'Loose ridge stone {i + 1}', [ground]):
            obj = mesh.lathe(f'Weathered ridge stone {i + 1}', profile, (x, y, z),
                             (rock, stone[2], stone[4], rock)[i], 9, 'approach')
            obj['weather_stone'] = True
            obj['moss_edge'] = True
            for vertex in obj.data.vertices:
                if vertex.co.z > y + .001:
                    vertex.co.x += RANDOM.uniform(-.11, .11) * r
                    vertex.co.y += RANDOM.uniform(-.15, .15) * r
                    vertex.co.z += RANDOM.uniform(-.07, .07) * r
                # Dress the base to the actual adjoining terrain triangles.
                # A single central normal misses the crease between them.
                vertex.co.z += supports_height(vertex.co.x, -vertex.co.y, [ground]) - y


def paint_stone():
    for obj in mesh.STATIC.objects:
        materials = list(obj.data.materials)
        if not any(material.get('one_light_surface_tint') for material in materials):
            continue
        close = obj.get('region') == 'niche'
        if close:
            mesh.uv_world(obj, .40 if obj.name == 'Single hewn wick shelf' else .52)
        stair_block = obj.get('approach_tread') or obj.get('rubble_stone') or obj.get('bridge_masonry')
        crown = max(vertex.co.z for vertex in obj.data.vertices) if stair_block else 0.
        tint = obj.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
        obj.data.color_attributes.active_color = tint
        for face in obj.data.polygons:
            material = materials[face.material_index]
            base = material.get('one_light_vertex_base_tint', (1., 1., 1.))
            for i in face.loop_indices:
                world = obj.matrix_world @ obj.data.vertices[obj.data.loops[i].vertex_index].co
                shade = .88 + .15 * noise.noise(world * (22 if close else 3.5))
                green_mix = 0.
                if obj.get('weather_stone'):
                    moss_outline = noise.noise(world * 7.9) + .21 * noise.noise(world * 33)
                    green_mix = max(0., min(.65, (moss_outline + (.1 if obj.get('moss_edge') else -.11)) * .96))
                if obj.get('matched_granite'):
                    shade = .94 + .36 * (shade - .94)
                if stair_block:
                    below_crown = crown - obj.data.vertices[obj.data.loops[i].vertex_index].co.z
                    wet_base = min(1., max(0., (below_crown - .020) / .14))
                    path_surface = obj.get('approach_tread') or obj.get('bridge_masonry')
                    shade *= obj.get('step_tone', .76) * (1. - (.17 if path_surface else .31) * wet_base)
                    green_mix = max(green_mix, wet_base * (.30 if obj.get('moss_edge') else .16))
                if obj.get('wet_tread_joints'):
                    flecks = .5 + .5 * noise.noise(world * 18.4)
                    shade *= .96 + .19 * flecks
                    green_mix = .17 + .58 * flecks
                if obj.name == 'Continuous mountain shoulder':
                    bank = noise.noise(world * .34) + .44 * noise.noise(world * 1.41)
                    root_dirt = .13 * math.sin(world.x * .57 + world.y * .31)
                    shade *= .72 + .54 * max(0., min(1., .51 + bank - root_dirt))
                    green_mix = max(0., min(.63, (.15 + bank) * .77))
                tint_color = [base[channel] * shade * (1 - green_mix * (1 - tone))
                              for channel, tone in enumerate((.48, .73, .43))]
                if material.get('one_light_ancient_pine_bark'):
                    shield = .5 + .5 * noise.noise(Vector((world.x * 9., world.y * 9., world.z * 3.3)))
                    oxide = .5 + .5 * noise.noise(Vector((world.x * 4.6, world.y * 4.6, world.z * 1.9)))
                    grooves = obj.data.attributes.get('AncientBarkGrooves')
                    furrow = grooves.data[obj.data.loops[i].vertex_index].value if grooves is not None else 0.
                    relief = (.76 + .28 * shield) * (1. - .48 * furrow)
                    tint_color = [channel * relief * (1. - loss * oxide)
                                  for channel, loss in zip(tint_color, (.035, .16, .23))]
                if obj.name == 'Continuous mountain shoulder':
                    x, z = world.x, -world.y
                    creek_x, _, width = watercourse_at(z)
                    tint_color = [channel * crest * bank for channel, crest, bank in zip(
                        tint_color, crest_soil_tint(x, z), inner_bank_tint(x, z, creek_x, width))]
                tint.data[i].color = (*tint_color, 1.)


def camera(name, p, look, fov, viewport):
    data = bpy.data.cameras.new(name)
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 24
    data.lens = 12 / math.tan(math.radians(fov / 2))
    obj = bpy.data.objects.new(name, data)
    bpy.data.collections['CAMERAS'].objects.link(obj)
    obj.location = mesh.point(p)
    obj.rotation_euler = (mesh.point(look) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj['cover_viewport'] = json.dumps(viewport)
    return obj


def daylight_world():
    daylight = json.loads((ROOT / 'shared/pine-gate-daylight.json').read_text())
    day = bpy.data.worlds.new('Pine Gate midday atmosphere')
    # Keep this world in the source file while the night world is active.
    day.use_fake_user = True
    day.use_nodes = True
    sky = day.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = True
    sky.sun_size = math.radians(daylight['solarDiameterDegrees'])
    sky.sun_intensity = daylight['solarIntensity']
    sky.sun_elevation = math.radians(daylight['solarElevationDegrees'])
    sky.sun_rotation = math.radians(daylight['solarAzimuthDegrees'])
    sky.altitude = daylight['altitudeMetres']
    sky.air_density = daylight['airDensity']
    sky.aerosol_density = daylight['aerosolDensity']
    sky.ozone_density = daylight['ozoneDensity']
    day_bg = day.node_tree.nodes.get('Background')
    day_bg.inputs['Strength'].default_value = daylight['atmosphereStrength'] / PRE_EXPOSURE
    day.node_tree.links.new(sky.outputs['Color'], day_bg.inputs['Color'])
    return day


def source_lighting(scene):
    scene['one_light_ambient_worlds'] = json.dumps({'day': daylight_world().name})
    scene.world = bpy.data.worlds.new('Pine Gate night world')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.65, .72, .77, 1)
    bg.inputs['Strength'].default_value = 2.05 / PRE_EXPOSURE
    sun = bpy.data.lights.new('Blue mountain sky direction', 'SUN')
    sun.energy, sun.color, sun.angle = 2.52 / PRE_EXPOSURE, (.86, .91, .98), .28
    caster = bpy.data.objects.new(sun.name, sun)
    bpy.data.collections['LIGHTS'].objects.link(caster)
    caster.location = mesh.point((-9, 15, 14))
    caster.rotation_euler = (mesh.point((0, 4, 1)) - caster.location).to_track_quat('-Z', 'Y').to_euler()
    caster['bake_role'] = 'ambient'
    # Broad skylight follows the breaks in the canopy over the stair run.
    # The off-axis placements leave the outer banks and trunks in shadow.
    openings = [
        ('Lower stair skylight', (-1.6, 9.8, 43.8), (.35, .65, 42.), 43., 11.5),
        ('Middle stair skylight', (2.0, 12.4, 28.5), (-.35, 1.9, 26.), 42., 12.5),
        ('Upper stair skylight', (-.7, 12.3, 13.2), (.3, 3., 11.), 34., 10.2),
        ('Soft sky over the open shoulder', (.7, 11.4, 4.8), (-.2, 4.24, .5), 26., 7.2),
    ]
    for name, location, aim, energy, diameter in openings:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.color, light.shape, light.size = energy, (.76, .85, 1.), 'DISK', diameter
        source = bpy.data.objects.new(name, light)
        bpy.data.collections['LIGHTS'].objects.link(source)
        source.location = mesh.point(location)
        source.rotation_euler = (mesh.point(aim) - source.location).to_track_quat('-Z', 'Y').to_euler()
        source['bake_role'] = 'ambient'
    mesh.light('Pavilion storm lantern practical', (2.55, 5.432, 3.0), .34, '#ffd7a0', .032)
    mesh.light('Oil lamp practical at the earth shrine', (-3.18, 4.618, 3.501), .11, '#ffd09b', .014)
    point = mesh.light('Visitor candle indirect bounce basis', LAMP, .20, '#ffc88a', .007, 'lamp')
    point.data.color = (1, .72, .47)
    scene['one_light_lamp_basis'] = json.dumps({'position': list(LAMP), 'watts': float(point.data.energy),
        'linearColor': list(point.data.color), 'pointRadiusMetres': float(point.data.shadow_soft_size),
        'sourceObject': point.name})
    return point


def build(output, impostor_manifest=None, wax_sculpt=None):
    global contacts
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    for name in ('STATIC', 'LIGHTS', 'CAMERAS'):
        scene.collection.children.link(bpy.data.collections.new(name))
    mesh.STATIC = bpy.data.collections['STATIC']
    contacts = RestingContacts(height_query=supports_height)
    stone, rock, ground, wood, tiles, bark, needle, iron, clay, ledge = palette()
    tread_granite = wet_approach_granite()
    support = terrain(ground)
    audit_approach_clearance(support)
    bridge_curbs = climbing_steps(stone, support, ground, rock, tread_granite)
    route = json.loads((ROOT / 'shared/pine-gate-path.json').read_text())
    far_crown = None
    native_mounts = None
    if impostor_manifest is not None:
        views, impostor_sha = load_impostors(impostor_manifest)
        if not {'young', 'ridge'} <= views.keys():
            raise ValueError('Pine Gate needs both the young and the ridge crown views.')
        shoulder = next(shot for shot in route['waypoints'] if shot['time'] == 27.9)
        if has_verified_native_receipt(impostor_manifest, impostor_sha):
            native_mounts = {}
        far_crown = (Vector(shoulder['position']), views, native_mounts)
        scene['one_light_pine_impostor_sha256'] = impostor_sha
    forest(support, rock, stone, bark, needle, far_crown)
    stream_stones, deck_slabs = saddle_water(stone, support, bark, tread_granite)
    audit_watercourse(support, stream_stones, deck_slabs, bridge_curbs)
    build_tea_shoulder(ANCHOR, stone, wood, tiles, clay, iron, ledge, contacts, wax_sculpt)
    paint_stone()
    build_crest_ground(ground, rock, bark, section_at, watercourse_at, lambda x, z: supports_height(x, z, [support]),
                       ((-1.88, PINE_CREST + .08), (1.82, PINE_CREST - .32)), bark_tube)
    build_inner_banks(rock, section_at, watercourse_at, lambda x, z: supports_height(x, z, [support]))
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'AUTO'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = math.log2(PRE_EXPOSURE)
    entry = route['entrance']
    scene.camera = camera('Reference_PineSteps', entry['position'], entry['look'], entry['desktopFov'], (1440, 900))
    camera('Reference_PineStepsPhone', entry['phonePosition'], entry['look'], entry['phoneFov'], (390, 844))
    for name, index in (('Forest', 0), ('Crest', 3), ('Shoulder', 6)):
        shot = route['waypoints'][index]
        camera('Reference_Pine' + name, shot['position'], shot['look'], shot['desktopFov'], (1440, 900))
    camera('Reference_PineTeaPavilion', (0, 6.50, 7.05), (-.50, 5.05, 1.93), 68, (1440, 900))
    camera('Reference_PineChooseDesktop', (-1.67, 5.29, 1.48), (-1.705, 5.075, .9), 31, (1440, 900))
    camera('Reference_PineChoosePhone', (-1.71, 5.25, 1.46), (-1.80, 4.95, .9), 43, (390, 844))
    camera('Reference_PineIgnitionDesktop', (-1.63, 5.32, 1.60), (-1.76, 5.10, .9), 39, (1440, 900))
    camera('Reference_PineIgnitionPhone', (-1.69, 5.33, 1.64), (-1.80, 5.10, .9), 43, (390, 844))
    camera('Reference_PineBurnDesktop', (-1.731, 5.135, 1.244), (-1.80, 5.054, .9), 35, (1440, 900))
    camera('Reference_PineBurnPhone', (-1.771, 5.143, 1.32), (-1.80, 5.054, .9), 29, (390, 844))
    basis = source_lighting(scene)
    scene['one_light_place'] = 'pine-gate'
    scene['runtime_origin'] = 'glTF Y-up; metres'
    scene['one_light_lamp_anchor'] = json.dumps(ANCHOR)
    scene['one_light_lamp_pass_quantity'] = 'indirect-diffuse-radiance-per-unit-albedo'
    scene['one_light_camera_pre_exposure'] = PRE_EXPOSURE
    scene['lightmap_resolutions'] = json.dumps({'approach': 2048, 'gate': 1024, 'niche': 512})
    anchor_fields = ['one_light_lamp_anchor', 'one_light_lamp_basis']
    if native_mounts is not None:
        scene[NATIVE_MOUNTS_FIELD] = serialize_native_mounts(native_mounts)
        anchor_fields.append(NATIVE_MOUNTS_FIELD)
    scene['one_light_anchor_fields'] = json.dumps(anchor_fields)
    audit = contacts.audit()
    scene['resting_prop_inventory'] = json.dumps({'registeredGroups': [entry['name'] for entry in contacts.entries],
        'fixedArchitecture': 'Pine roots and slate outcrops enter terrain. Steps, bridge, shrine and terrace walls have structural support.'})
    bpy.context.view_layer.update()
    # Start close to this isolated bearing surface to preserve submicron
    # precision in the Float32 BVH intersection across the dense shelf grid.
    anchor_height = supports_height(ANCHOR[0], ANCHOR[2], [bpy.data.objects['Single hewn wick shelf']], ANCHOR[1] + .5)
    lamp_position = tuple(engine(basis.matrix_world.translation))
    if abs(anchor_height - ANCHOR[1]) > 1e-6 or any(abs(a - b) > 1e-6 for a, b in zip(lamp_position, LAMP)):
        raise RuntimeError(f'Baked shelf or lamp anchor differs from its runtime location: shelf {anchor_height}, lamp {lamp_position}.')
    scene['source_authoring_helpers'] = json.dumps([
        'art/blender/snow_roof.py', 'art/blender/snow_round1_details.py',
        'art/blender/snow_lightmap_charts.py', 'art/blender/resting_contacts.py',
        'art/blender/pine_materials.py', 'art/blender/pine_hero_trees.py', 'art/blender/pine_impostors.py',
        'art/blender/pine_native_mounts.py',
        'art/blender/pine_crest_ground.py',
        'art/blender/pine_tea_shoulder.py', 'docs/licenses/pine-gate-scans.json',
        'shared/pine-gate-path.json', 'shared/pine-gate-daylight.json',
    ])
    scene['source_authoring_sha256'] = json.dumps({
        name: sha256((ROOT / name).read_bytes()).hexdigest()
        for name in ['art/blender/pine_gate.py', *json.loads(scene['source_authoring_helpers'])]
    })
    count = len(mesh.STATIC.objects)
    for obj in mesh.STATIC.objects:
        charts = obj.data.uv_layers.get('SourceLightmap')
        if not charts:
            raise RuntimeError('Every Pine Gate mesh needs authored charts: ' + obj.name)
        # Submit centimeter coordinates to preserve tiny corner triangles in
        # xatlas. UVMap stays in its authored material scale.
        for loop in charts.uv:
            loop.vector *= 100
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    def challenge(delta):
        group = contacts.entries[-1]
        members = [bpy.data.objects[name] for name in group['members']]
        originals = [obj.matrix_world.copy() for obj in members]
        contacts.shift(members, delta)
        raised = next(row for row in contacts.audit(fail=False, write_metadata=False)['groups'] if row['name'] == group['name'])
        for obj, original in zip(members, originals):
            obj.matrix_world = original
        return {'group': group['name'], 'shiftMetres': delta, 'caught': not raised['final']['passed'], 'contact': raised['final']}
    failures = [challenge(.003), challenge(-.006)]
    if not all(row['caught'] for row in failures):
        raise RuntimeError('Literal source contact challenge did not fail.')
    receipt = {'source': {'path': str(output.relative_to(ROOT)), 'sha256': sha256(output.read_bytes()).hexdigest()},
               'sourceMeshes': count, 'contactAudit': audit, 'anchorMetadataFields': json.loads(scene['one_light_anchor_fields']),
               'anchorMetadata': {key: scene[key] for key in json.loads(scene['one_light_anchor_fields'])},
               'actualShelfHeightMetres': anchor_height, 'actualLampBasisPosition': engine(basis.matrix_world.translation),
               'toleranceChallenges': failures}
    output.with_suffix('.audit.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('PINE_GATE_SOURCE', str(output), count, 'CONTACTS', len(audit['groups']), 'SHELF', anchor_height, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='art/build/pine-gate/pine-gate.blend', type=Path)
    parser.add_argument('--impostors', type=Path, help='Explicit Cycles colour/depth manifest for the far crowns.')
    parser.add_argument('--wax-sculpt', type=Path, help='Directory containing audited wax normal bakes.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build(args.output.resolve(), impostor_manifest=args.impostors.resolve() if args.impostors else None,
          wax_sculpt=args.wax_sculpt.resolve() if args.wax_sculpt else None)
