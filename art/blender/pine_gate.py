"""Pine Gate Steps. A forest path and a spring shoulder with a tea pavilion and pierced lamp shrine."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snow_roof as mesh
from pine_materials import apply_scan
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
SHOULDER_SETBACK = .86
STREAM_BANK_OFFSET = .14
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


def stair_section(index):
    bend = .23 * math.sin(index * .11) - .15 * math.sin(index * .27)
    span = 1.91 + .23 * math.cos(index * .18) + .004 * index
    return bend, span / 2


def section_at(z):
    index = max(0, min(STAIR_COUNT - 1, (STAIR_START - z) / STAIR_RUN))
    return stair_section(index)


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
    return x, y, width


def watercourse_stations(spacing):
    for (_, _, start), (_, _, end) in zip(WATERCOURSE, WATERCOURSE[1:]):
        count = math.ceil((end - start) / spacing)
        yield from (start + (end - start) * j / count for j in range(count))
    yield WATERCOURSE[-1][2]


def stream_ground(x, z, water_x, water_y, half_width, blend):
    original = terrain_height(x, z)
    edge = abs(x - water_x) - half_width
    if edge <= 0:
        bed = water_y - .017 + .016 * edge / half_width
    elif edge <= STREAM_BANK_OFFSET:
        bed = water_y - .017 + .047 * edge / STREAM_BANK_OFFSET
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


def hewn_block(name, width, height, depth, location, material, region):
    # Chipped corners, worn toe and an irregular nose are physical geometry.
    # Near the camera, the edge casts its own uneven soft shadow.
    ring = [(-.45, -.50), (.41, -.50), (.5, -.41), (.5, .38), (.45, .47),
            (.27, .50), (.04, .48), (-.19, .50), (-.38, .48), (-.5, .41), (-.5, -.39)]
    x, y, z = location
    variation = [(a + RANDOM.uniform(-.009, .009), b + RANDOM.uniform(-.013, .013)) for a, b in ring]
    wear = [RANDOM.uniform(-.005, .004) - .011 * math.exp(-(a / .22) ** 2)
            if b > .45 else RANDOM.uniform(-.003, .003) for a, b in ring]
    points = []
    for band, inset in ((-height, .018), (-.021, 0), (0, .016)):
        for j, (a, b) in enumerate(variation):
            points.append((x + a * (width - inset * 2), y + band + wear[j], z + b * (depth - inset * 2)))
    n = len(ring)
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


def climbing_steps(stone):
    for i in range(STAIR_COUNT):
        z = STAIR_START - STAIR_RUN * i
        top = (i + 1) * STAIR_RISE
        if 21.17 < z < 23.16:
            continue
        # Laid in short runs around tree roots. A shallow camber takes rain
        # away from the worn center and toward the open right-hand drain.
        bend, half_span = stair_section(i)
        span = half_span * 2
        widths = [span * .31 + RANDOM.uniform(-.10, .09), span * .35 + RANDOM.uniform(-.12, .10)]
        widths.append(span - sum(widths))
        edge = bend - span / 2
        for j, width in enumerate(widths):
            block = hewn_block(f'Step {i + 1:02} block {j + 1}', width - .018, .24,
                               .82 + RANDOM.uniform(-.043, .039),
                               (edge + width / 2, top + RANDOM.uniform(-.010, .009) - .008 * j,
                                z + RANDOM.uniform(-.027, .031)), RANDOM.choice(stone), 'approach')
            block['moss_edge'] = j != 1 or i % 7 == 0
            edge += width
        drain_x = bend + span / 2 + .139
        invert = hewn_block(f'Open rainwater channel {i + 1:02}', .27, .16, .805,
                            (drain_x, top - .068, z), stone[4], 'approach')
        invert['moss_edge'] = True
        for direction in (-1, 1):
            x = bend + direction * (span / 2 + (.24 if direction > 0 else .09))
            curb = hewn_block(f'Stair drain curb {direction} {i + 1:02}', .17, .16, .782,
                              (x, top + .035, z), stone[4], 'approach')
            curb['moss_edge'] = True
            if (i // 5 + direction) % 4 and i < 47:
                for row in range(2 + int(i > 31)):
                    hewn_block(f'Stair retaining course {direction} {i} {row}', .46, .25, .798,
                               (bend + direction * (span / 2 + .38 + row * .070), top + row * .244 + .02,
                                z + (.24 if row % 2 else 0)), RANDOM.choice(stone), 'approach')
    landing_bed(stone[2])
    for row in range(11):
        z = -.70 + row * .64
        for col in range(10):
            x = (col - 4.5) * .84 + .045 * (row % 2)
            hewn_block(f'Landing flagstone {row} {col}', .829, .092, .628,
                       (x, 4.00 + RANDOM.uniform(-.003, .003), z), RANDOM.choice(stone), 'gate')


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
            # Without a fitted bank rim, the hewn block starts with eleven underside vertices.
            count = obj.get('bank_ring_vertices', 11)
            yield [engine(surface.matrix_world @ vertex.co) for vertex in evaluated.vertices[:count]]
        finally:
            surface.to_mesh_clear()


def audit_watercourse(ground, bank_stones, deck_slabs):
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

    depsgraph = bpy.context.evaluated_depsgraph_get()
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


def saddle_water(stone, ground):
    terrain_edges = [(ground.data.vertices[a].co, ground.data.vertices[b].co)
                     for a, b in (edge.vertices for edge in ground.data.edges)]

    def drape_bank(rock):
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
        for row, (emergence, rise) in enumerate(((-.002, 0.), (.069, .055), (.088, .014))):
            for slot, (a, b, t) in enumerate(joins):
                pos = original[row * count + a].lerp(original[row * count + b], t)
                x, z = pos.x, -pos.y
                surface = supports_height(x, z, [ground])
                below = points[(row - 1) * ring + slot][1] if row else surface
                height = max(pos.z, surface + emergence, below + rise) if row else surface + emergence
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

    water = mesh.material('Spring water on a slate bed', '#4a6865', rough=.20, metal=.24)
    points = []
    for i, (x, y, z) in enumerate(WATERCOURSE):
        half_width = .18 + .12 * math.sin(i * .53) ** 2
        points.extend(((x - half_width, y, z), (x + half_width, y, z)))
    faces = [(i, i + 2, i + 3, i + 1) for i in range(0, len(points) - 2, 2)]
    channel = mesh.mesh_object('Spring runnel through the saddle', points, faces, water, 'approach')
    source_uv(channel, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Meter-scale stream ribbon.')
    bank_stones, deck_slabs = [], []
    for index, (_, _, z) in enumerate(WATERCOURSE[1:-1]):
        x, _, width = watercourse_at(z)
        x += (-1 if index % 3 else 1) * (width + .19)
        bank_y = supports_height(x, z, [ground])
        rock = hewn_block(f'Water-cut stream bank {index + 1}', .32, .19, .47,
                          (x, bank_y + .101, z), stone[index % len(stone)], 'approach')
        drape_bank(rock)
        rock['moss_edge'] = True
        bank_stones.append(rock)
    spring = hewn_block('Spring head emerging under a granite cap', .77, .46, .9,
                        (2.77, 4.41, 5.08), stone[4], 'gate')
    spring['moss_edge'] = True
    # One low crossing standing on two rubble abutments. The water is still
    # visible outside the near edge before and after crossing.
    for index in range(5):
        z = 21.07 + index * .54
        slab = hewn_block(f'Bridge decking slab {index + 1}', 2.17, .21, .56,
                          (.09, 2.51 - index * .052, z), stone[index % len(stone)], 'approach')
        vertices = list(slab.data.vertices)
        ring = len(vertices) // 3
        # The runnel descends monotonically. Keep the underside at a level
        # above the highest water across the full footprint, including seams.
        water_limit = max(watercourse_at(-vertex.co.y)[1] for vertex in vertices) + .018
        for vertex in vertices[:ring]:
            vertex.co.z = max(vertex.co.z, water_limit)
        slab.data.update()
        profile_uv(slab, ring, 3, {0, 1}, 1)
        mesh.uv_world(slab)
        slab['moss_edge'] = True
        deck_slabs.append(slab)
    for z, slab in ((21.02, deck_slabs[0]), (23.23, deck_slabs[-1])):
        vertices = list(slab.data.vertices)
        cap = max(vertex.co.z for vertex in vertices[:len(vertices) // 3]) + .012
        footing = 2.01
        height = cap - footing
        mesh.box('Granite crossing abutment', (2.18, height, .29), (0, footing + height / 2, z),
                 stone[2], min(.045, height * .25), region='approach')
    for side in (-1, 1):
        for index in range(4):
            mesh.box('Low bridge parapet block', (.22, .23, .66),
                     (side * 1.06, 2.61 - index * .066, 21.18 + index * .64),
                     stone[(index + 2) % len(stone)], .037, region='approach')
    return bank_stones, deck_slabs


def understory(ground, foliage):
    # Folded leaves rise out of the terrain. The roots are part of the bank.
    pockets = [(-3.1, 6.9), (-4.7, 13.1), (-3.8, 17.4), (-6.1, 25.4), (-3.6, 29.8),
               (-4.0, 35.7), (-6.5, 39.2), (-4.9, 44.1), (-7.0, 48.5),
               (3.7, 8.6), (3.4, 15.8), (5.4, 19.2), (3.8, 24.9), (5.9, 28.8),
               (4.9, 33.4), (3.8, 38.5), (6.2, 43.5), (4.5, 46.9)]
    extra = random.Random(65274)
    for i in range(112):
        rng = RANDOM if i < 88 else extra
        cx, cz = pockets[i % len(pockets)]
        x = cx + rng.uniform(-.68, .68)
        z = cz + rng.uniform(-1.46, 1.46)
        y = supports_height(x, z, [ground]) - .018
        vertices, faces = [], []
        count = rng.randint(4, 8)
        height = .55 if i % 4 < 2 else 1.
        for frond in range(count):
            theta = frond * math.tau / count + rng.uniform(-.40, .40)
            length = rng.uniform(.15, .43)
            width = length * rng.uniform(.062, .119)
            cs, sn = math.cos(theta), math.sin(theta)
            start = len(vertices)
            vertices.extend([(x, y, z),
                             (x + length * .45 * cs - width * sn, y + length * .54 * height, z + length * .45 * sn + width * cs),
                             (x + length * .58 * cs, y + length * .69 * height, z + length * .58 * sn),
                             (x + length * .45 * cs + width * sn, y + length * .51 * height, z + length * .45 * sn - width * cs),
                             (x + length * cs, y + length * .40 * height, z + length * sn)])
            faces.extend([(start, start + 1, start + 2), (start, start + 2, start + 3),
                          (start + 1, start + 4, start + 2), (start + 2, start + 4, start + 3)])
        plant = mesh.mesh_object(f'Mountain fern tufts {i + 1}', vertices, faces, foliage[i % len(foliage)], 'approach')
        leaf_uv = [(0, 0), (.10, .10), (.15, .13), (.20, .10), (.15, .28)]
        source_uv(plant, [[(leaf_uv[k % 5][0] + (k // 5) * .4, leaf_uv[k % 5][1]) for k in face] for face in faces],
                  'Individual folded forest leaves.')


def needle_material():
    import numpy as np

    # Author one radial spray in RGBA, down to the individual needle. The
    # byte image is packed with the Blender source and reused by every bough.
    size = 384
    rgba = np.zeros((size, size, 4), dtype=np.float32)
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

    stroke((.5, .018), (.49, .98), 1.5, (.115, .079, .050))
    shades = [(0.109, .185, .112), (.152, .216, .126), (.207, .249, .151), (.123, .204, .14)]
    for i in range(74):
        y = .08 + .83 * i / 74 + rng.uniform(-.014, .014)
        sign = -1 if i % 2 else 1
        spread = .33 * math.sin(math.pi * y) ** .65 * rng.uniform(.64, 1.24)
        end = (.50 + sign * spread, min(.98, y + rng.uniform(.064, .17)))
        stroke((.5, y), end, rng.uniform(.65, 1.37), shades[i % 4])
        for j in range(5):
            f = .24 + .145 * j
            sx, sy = .50 + (end[0] - .50) * f, y + (end[1] - y) * f
            needle = (sx + sign * rng.uniform(.017, .057), min(.995, sy + rng.uniform(.041, .12)))
            stroke((sx, sy), needle, rng.uniform(.62, 1.21), shades[(i + j + 1) % 4])
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


def pine_sprays(name, sprays, tint):
    points, faces, chart = [], [], []
    for start, direction, length, width, roll in sprays:
        a, axis = Vector(start), Vector(direction).normalized()
        side = axis.cross(Vector((0, 1, 0)))
        if side.length < .01:
            side = axis.cross(Vector((1, 0, 0)))
        side.normalize()
        side.rotate(Matrix.Rotation(roll, 3, axis))
        b = a + axis * length
        n = len(points)
        points.extend([a - side * width / 2, a + side * width / 2,
                       b + side * width / 2, b - side * width / 2])
        faces.append((n, n + 1, n + 2, n + 3))
        chart.append([(0, 0), (width, 0), (width, length), (0, length)])
    obj = mesh.mesh_object(name, points, faces, tint, 'approach')
    source_uv(obj, chart, 'Separate rectilinear charts for anchored pine needle sprays.')
    uv = obj.data.uv_layers['UVMap']
    for face in obj.data.polygons:
        for j, i in enumerate(face.loop_indices):
            uv.data[i].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][j]


def pine_tree(label, x, z, height, bark, needles, ground, roots=False, lean=None, crown_start=.38):
    ancient = lean is not None
    y = supports_height(x, z, [ground]) - .26
    drift = RANDOM.uniform(-.95, .95) if lean is None else lean
    side = RANDOM.uniform(-.49, .49)
    phase = RANDOM.uniform(0, math.tau)
    def at(f):
        sweep = (.26 * f + 1.04 * f * f) if ancient else f * f
        return Vector((x + drift * sweep + .23 * math.sin(f * 5 + phase) * f,
                       y + height * f, z + side * f - .19 * math.sin(f * 4.2 + phase) * f))
    centres = [at(j / 7) for j in range(8)]
    mesh.curved_tube(f'{label} crooked trunk', centres,
                     [height * (.004 + (.047 if ancient else .023) * (1 - j / 7) ** .84)
                      for j in range(8)], bark, radial=14 if ancient else 10, region='approach')
    if roots:
        reach_scale = 1.53 if ancient else 1.
        for i in range(4 if ancient else 3):
            direction = phase + i * 2.2
            vx, vz = math.cos(direction), math.sin(direction)
            start = (x, supports_height(x, z, [ground]) + .08, z)
            x1, z1 = x + vx * .43 * reach_scale, z + vz * .43 * reach_scale
            x2, z2 = x + vx * .94 * reach_scale, z + vz * .94 * reach_scale
            middle = (x1, supports_height(x1, z1, [ground]) + .035, z1)
            end = (x2, supports_height(x2, z2, [ground]) - .044, z2)
            mesh.curved_tube(f'{label} exposed buttress root', [start, middle, end],
                             [.074 * reach_scale, .038 * reach_scale, .008], bark, radial=7, region='approach')
    for i in range(7):
        f = (.31 + .095 * i) if ancient else (crown_start + (.90 - crown_start) * i / 6)
        for bough in range(2):
            a = phase + i * 2.4 + bough * 2.7 + RANDOM.uniform(-.28, .28)
            radial = Vector((math.cos(a), 0, math.sin(a)))
            normal = Vector((-radial.z, 0, radial.x))
            root = at(f + bough * .012)
            reach = height * (.24 - i * .019) * RANDOM.uniform(.76, 1.24) * (1 if bough == 0 else .78)
            # The thicker bough dips outward, then the terminal shoots turn to light.
            joint = root + radial * reach * .42 + Vector((0, -.064 * reach, 0))
            bridge = root + radial * reach * .78 + normal * (.11 * reach) + Vector((0, .014 * reach, 0))
            tip = root + radial * reach + normal * (.16 * reach) + Vector((0, .11 * reach, 0))
            mesh.curved_tube(f'{label} articulated bough {i} {bough}', [root, joint, bridge, tip],
                             [reach * t for t in (.07, .048, .028, .009)], bark, radial=6, region='approach')
            sprays = []
            for q in range(3):
                attachment = joint.lerp(tip, (.28, .67, .94)[q])
                along = radial * RANDOM.uniform(.60, .87) + normal * (-1 if q % 2 else 1) * RANDOM.uniform(.36, .62)
                along.y = .19 + RANDOM.random() * .39
                length = (.32 + reach * .44) * RANDOM.uniform(.89, 1.25)
                width = length * RANDOM.uniform(.74, 1.04)
                roll = RANDOM.uniform(-.50, .42)
                sprays.append((attachment, along, length, width, roll))
                sprays.append((attachment, along, length * .88, width * .83, roll + 1.18))
            pine_sprays(f'{label} crossed needle sprays {i} {bough}', sprays, needles)
    leader = at(.89)
    upward = at(1.) - leader
    pine_sprays(f'{label} upright leader',
                [(leader, upward, height * .14, height * .095, roll) for roll in (0, 1.1, 2.2)], needles)
    if ancient:
        return at


def distant_pines(ground, bark, needles):
    # Stagger rooted trunks beyond the retaining wall. At this distance a few
    # rising forks and the same cutout needle sprays give the crowns depth.
    trees = [(-4.2, -3.6, 6.9), (-6.6, -5.2, 9.4), (-9.5, -7.0, 7.9),
             (4.0, -5.1, 8.3), (6.7, -3.8, 6.7), (9.8, -7.2, 8.8),
             (-4.9, -13.6, 8.5), (-8.3, -16.2, 10.2), (-12.7, -19.8, 8.8),
             (4.7, -15.0, 9.4), (8.4, -18.2, 8.3), (12.1, -14.4, 10.1)]
    for i, (x, z, height) in enumerate(trees):
        y = supports_height(x, z, [ground]) - .13
        lean = .45 * math.sin(i * 2.01)
        phase = i * 2.39
        positions = [Vector((x + lean * t * t, y + height * t, z + .2 * math.sin(phase) * t))
                     for t in (0., .38, .58, .76, .89, 1.)]
        label = f'Layered ridge pine {i + 1}'
        mesh.curved_tube(f'{label} tapered trunk', positions,
                         [height * scale for scale in (.014, .012, .009, .006, .004, .001)],
                         bark, radial=6, region='approach')
        sprays = []
        for tier, base in enumerate(positions[1:-1]):
            angle = phase + tier * 2.21
            direction = Vector((math.cos(angle), .18 + tier * .072, math.sin(angle)))
            reach = height * (.205 - .026 * tier)
            bend, end = base + direction * reach * .47, base + direction * reach
            mesh.curved_tube(f'{label} bough {tier + 1}', [base, bend, end],
                             [reach * scale for scale in (.048, .029, .005)], bark, radial=5, region='approach')
            for offset, roll in ((.26, .05), (.56, 1.19)):
                sprays.append((bend.lerp(end, offset), direction, reach * .85, reach * .70, roll))
        pine_sprays(f'{label} needle silhouette', sprays, needles)


def forest(ground, rock, stone, bark, pine):
    needles = needle_material()
    for i, z in enumerate((13, 17, 22, 27, 32, 38, 44, 49)):
        for s in (-1, 1):
            x = s * RANDOM.uniform(3.95 if z > 42 else 2.58, 4.46)
            pine_tree(f'Old pine {i + 1} {s}', x, z + RANDOM.uniform(-1.6, 1.6),
                      RANDOM.uniform(6.1, 10.4), bark, needles, ground, roots=z >= 14)
    low = pine_tree('Ancient western pine at the saddle', -1.88, PINE_CREST + .08, 10.6,
                    bark, needles, ground, roots=True, lean=2.43)
    pine_tree('Ancient eastern pine at the saddle', 1.82, PINE_CREST - .32, 11.4,
              bark, needles, ground, roots=True, lean=-2.68)
    cloth = mesh.material('Sun-faded red cloth on the old pine', '#874b42', rough=.93)
    for index, fraction in enumerate((.181, .209, .238)):
        x, y, z = low(fraction)
        vertices = [(x + .19, y, z + .30), (x + .257, y - .016, z + .32),
                    (x + .275, y - .195 - .03 * index, z + .36), (x + .211, y - .19, z + .34)]
        ribbon = mesh.mesh_object(f'Weathered ribbon on crest pine {index + 1}', vertices, [(0, 1, 2, 3)], cloth, 'approach')
        source_uv(ribbon, [[(0., 0.), (.068, 0.), (.068, .21), (0., .21)]], 'A loose ribbon beside its knot.')
    for i, (x, z, h) in enumerate(((-10, 0, 10), (12, -3, 9), (8, -14, 7), (-7, -10, 8),
                                   (-4, -6, 7), (4, -8, 8), (15, 18, 9), (-17, 19, 9))):
        pine_tree(f'Back ridge pine {i + 1}', x, z, h, bark, needles, ground)
    # Shorter pines overhang the older stone and screen the buildings
    # through the middle approach. Their crowns open up at the saddle.
    for index, (x, z, height) in enumerate(((-2.73, 26.8, 5.5), (2.65, 25.1, 5.8),
                                           (3.12, 16.1, 4.8), (-3.36, 13.1, 5.05))):
        pine_tree(f'Low forest verge pine {index + 1}', x, z, height, bark, needles, ground,
                  roots=True, crown_start=.19)
    distant_pines(ground, bark, needles)
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
                if obj.name == 'Continuous mountain shoulder':
                    bank = noise.noise(world * .34) + .44 * noise.noise(world * 1.41)
                    root_dirt = .13 * math.sin(world.x * .57 + world.y * .31)
                    shade *= .72 + .54 * max(0., min(1., .51 + bank - root_dirt))
                    green_mix = max(0., min(.63, (.15 + bank) * .77))
                tint_color = [base[channel] * shade * (1 - green_mix * (1 - tone))
                              for channel, tone in enumerate((.48, .73, .43))]
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


def source_lighting(scene):
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


def build(output):
    global contacts
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    for name in ('STATIC', 'LIGHTS', 'CAMERAS'):
        scene.collection.children.link(bpy.data.collections.new(name))
    mesh.STATIC = bpy.data.collections['STATIC']
    contacts = RestingContacts(height_query=supports_height)
    stone, rock, ground, wood, tiles, bark, needle, iron, clay, ledge = palette()
    support = terrain(ground)
    audit_approach_clearance(support)
    climbing_steps(stone)
    forest(support, rock, stone, bark, needle)
    stream_stones, deck_slabs = saddle_water(stone, support)
    audit_watercourse(support, stream_stones, deck_slabs)
    build_tea_shoulder(ANCHOR, stone, wood, tiles, clay, iron, ledge, contacts)
    paint_stone()
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'AUTO'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = math.log2(PRE_EXPOSURE)
    route = json.loads((ROOT / 'shared/pine-gate-path.json').read_text())
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
    scene['one_light_anchor_fields'] = json.dumps(['one_light_lamp_anchor', 'one_light_lamp_basis'])
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
        'art/blender/pine_materials.py', 'art/blender/pine_tea_shoulder.py', 'docs/licenses/pine-gate-scans.json',
        'shared/pine-gate-path.json',
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
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build(args.output.resolve())
