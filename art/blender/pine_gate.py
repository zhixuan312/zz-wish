"""Pine Gate Steps. Original mountain temple exterior and stone candle niche."""
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
from resting_contacts import RestingContacts, engine
from snow_lightmap_charts import box_net, closed_grid_uv, profile_uv, source_uv

ROOT = Path(__file__).resolve().parents[2]
ANCHOR = (-1.8, 5.0, .9)
LAMP = (-1.8, 5.076, .9)
PRE_EXPOSURE = 6
RANDOM = random.Random(21594)
SHELF_WAX_DEPOSITS = (
    (-.037, -.099, .0092, .0080, .0016),
    (.036, -.096, .0100, .0068, .0017),
)


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
    stone = [mesh.material(f'Wet granite {i}', color, 'stone_pavers', .86)
             for i, color in enumerate(('#90897b', '#817d72', '#827d70', '#9d998a', '#6f7569'))]
    rock = mesh.material('Iron-gray granite and soft moss', '#748381', 'rock_pitted_mossy', .96)
    ground = mesh.material('Damp mountain soil', '#353d30', 'rock_pitted_mossy', .98)
    wood = mesh.material('Weathered cypress', '#79513a', 'weathered_planks', .83)
    red = [mesh.material(f'Aged cinnabar {i}', color, 'weathered_planks', .72)
           for i, color in enumerate(('#a35443', '#8c4839', '#9e5943', '#884b3d'))]
    tiles = [mesh.material(f'Glazed shadow tile {i}', color, 'grey_roof_tiles', .75)
             for i, color in enumerate(('#45494b', '#393d3d', '#484742'))]
    bark = mesh.material('Rough pine bark', '#562f24', 'weathered_planks', .97)
    pine = [mesh.material(f'Woodland understory {i}', color, rough=.97)
            for i, color in enumerate(('#293626', '#3d4930', '#37452a', '#424c35', '#50603b'))]
    iron = mesh.material('Aged black iron', '#3d3831', rough=.65, metal=.35)
    clay = mesh.material('Gray green celadon', '#786c49', rough=.37)
    soot = mesh.material('Chisel-faced granite beneath soot', '#aaa8a4', 'rock_pitted_mossy', .92)
    ledge = mesh.material('Worn fine granite on the wick shelf', '#a6a49e', 'rock_pitted_mossy', .82)
    reveal = mesh.material('Dressed granite inside the arch', '#85847f', 'rock_pitted_mossy', .91)
    close_albedo = neutral_granite_albedo()
    ao = bpy.data.images.load(str(mesh.MATERIALS / 'rock_pitted_mossy' / 'ao.jpg'), check_existing=True)
    ao.colorspace_settings.name = 'Non-Color'
    output = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if not output.interface.items_tree.get('Occlusion'):
        output.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    for material, amount in ((soot, .34), (ledge, .30), (reveal, .32)):
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
    for material in [*stone, rock, ground, soot, ledge, reveal]:
        mesh.vertex_tint_shader(material)
    return stone, rock, ground, wood, red, tiles, bark, pine, iron, clay, soot, ledge, reveal


def terrain_height(x, z):
    rise = min(4, max(0, (46 - z) * .1))
    bank = max(0, min(3., (abs(x) - 2.18) * .27))
    fold = .16 * math.sin(x * .67 + z * .24) + .09 * math.sin(x * 1.12 - z * .41)
    far_slope = max(0., min(1., (-z - 4) / 16)) * max(0., min(1., (abs(x) - 3.4) / 7))
    ridge = far_slope * (.57 + .31 * math.sin(x * .43 + z * .17))
    return rise - .10 + bank + fold * min(1., bank) + ridge


def terrain(material):
    xs = [-31, -24, -19, -14, -11, -8, -6, -4.5, -3.2, -2.12, 0,
          2.12, 3.2, 4.5, 6, 8, 11, 14, 19, 24, 31]
    zs = list(range(-30, 67, 3))
    points = [(x, terrain_height(x, z), z) for z in zs for x in xs]
    faces = []
    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            a = j * len(xs) + i
            b = a + len(xs)
            # The authored, contact-tested diagonal also reaches prepared and
            # raw meshes. A warped terrain quad has two different support planes.
            faces.extend([(a, b, b + 1), (a, b + 1, a + 1)])
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
    profile = ((.04, 4.), (.82, 4.), (1.15, 3.970), (5.70, 3.970), (6.08, 4.), (6.34, 4.))
    points = [(x, y, z) for z, top in profile
              for x, y in ((-2.6, 3.6), (2.6, 3.6), (2.6, top), (-2.6, top))]
    last = 4 * (len(profile) - 1)
    faces = [(0, 3, 2, 1), (last, last + 1, last + 2, last + 3)]
    for first in range(0, last, 4):
        for side in range(4):
            a, b = first + side, first + (side + 1) % 4
            faces.append((a, b, b + 4, a + 4))
    landing = mesh.mesh_object('Broad stone landing', points, faces, material, 'gate')
    box_net(landing, (5.2, .40, 6.3), (0, 3.80, 3.19))
    mesh.uv_world(landing)
    mesh.bevel(landing, .045)


def climbing_steps(stone):
    for i in range(50):
        z = 45.6 - .8 * i
        top = (i + 1) * .08
        widths = [1.37 + RANDOM.uniform(-.24, .17), 1.40 + RANDOM.uniform(-.19, .22)]
        widths.append(4.28 - sum(widths))
        edge = -2.14
        for j, width in enumerate(widths):
            hewn_block(f'Step {i + 1:02} block {j + 1}', width - .012, .24, .818,
                       (edge + width / 2, top + RANDOM.uniform(-.007, .004),
                        z + RANDOM.uniform(-.007, .007)), RANDOM.choice(stone), 'approach')
            edge += width
        for direction in (-1, 1):
            curb = hewn_block(f'Stair drain curb {direction} {i + 1:02}', .23, .14, .782,
                              (direction * 2.26, top + .05, z), stone[4], 'approach')
            curb['moss_edge'] = True
            if (i // 5 + direction) % 4 and i < 47:
                for row in range(2 + int(i > 31)):
                    hewn_block(f'Stair retaining course {direction} {i} {row}', .46, .25, .798,
                               (direction * (2.64 + row * .070), top + row * .244 + .02,
                                z + (.24 if row % 2 else 0)), RANDOM.choice(stone), 'approach')
    landing_bed(stone[2])
    for row in range(7):
        z = 1.51 + row * .64
        for col in range(6):
            x = (col - 2.5) * .84 + .045 * (row % 2)
            hewn_block(f'Landing flagstone {row} {col}', .829, .092, .628,
                       (x, 4.00 + RANDOM.uniform(-.003, .003), z), RANDOM.choice(stone), 'gate')


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


def pine_tree(label, x, z, height, bark, needles, ground, roots=False):
    y = terrain_height(x, z) - .26
    drift = RANDOM.uniform(-.95, .95)
    side = RANDOM.uniform(-.49, .49)
    phase = RANDOM.uniform(0, math.tau)
    def at(f):
        return Vector((x + drift * f * f + .23 * math.sin(f * 5 + phase) * f,
                       y + height * f, z + side * f - .19 * math.sin(f * 4.2 + phase) * f))
    centres = [at(j / 7) for j in range(8)]
    mesh.curved_tube(f'{label} crooked trunk', centres,
                     [height * (.004 + .023 * (1 - j / 7) ** .84) for j in range(8)],
                     bark, radial=10, region='approach')
    if roots:
        for i in range(3):
            direction = phase + i * 2.2
            vx, vz = math.cos(direction), math.sin(direction)
            start = (x, supports_height(x, z, [ground]) + .08, z)
            x1, z1 = x + vx * .43, z + vz * .43
            x2, z2 = x + vx * .94, z + vz * .94
            middle = (x1, supports_height(x1, z1, [ground]) + .035, z1)
            end = (x2, supports_height(x2, z2, [ground]) - .044, z2)
            mesh.curved_tube(f'{label} exposed buttress root', [start, middle, end],
                             [.074, .038, .008], bark, radial=7, region='approach')
    for i in range(7):
        f = .42 + .082 * i
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
    for i, z in enumerate((7, 14, 21, 29, 36, 43, 49)):
        for s in (-1, 1):
            x = s * RANDOM.uniform(4.50 if z > 42 else 3.35, 5.8)
            pine_tree(f'Old pine {i + 1} {s}', x, z + RANDOM.uniform(-1.6, 1.6),
                      RANDOM.uniform(6.1, 10.4), bark, needles, ground, roots=z >= 14)
    for i, (x, z, h) in enumerate(((-10, 0, 10), (12, -3, 9), (8, -14, 7), (-7, -10, 8),
                                   (-4, -6, 7), (4, -8, 8), (15, 18, 9), (-17, 19, 9))):
        pine_tree(f'Back ridge pine {i + 1}', x, z, h, bark, needles, ground)
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
    for i, (x, z, r) in enumerate(((-3.1, 34, .64), (3.6, 25, .76), (-3.7, 12, .51), (4.6, 6.9, .52))):
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


def gate(stone, tiles, wood, red, iron):
    # Layered lintels and deliberately uneven courses are fixed architecture.
    for s in (-1, 1):
        bx = s * 1.23
        mesh.box(f'Gate column plinth {s}', (.66, .33, .70), (bx, 4.164, .05), stone[0], .038, region='gate')
        mesh.box(f'Gate massive timber {s}', (.36, 2.75, .39), (bx, 5.64, .05), red[1], .027, region='gate')
        mesh.box(f'Gate bracket lower block {s}', (.56, .23, .72), (bx, 6.92, .08), wood, .023, region='gate')
        mesh.box(f'Gate bracket cantilever {s}', (.29, .16, 1.02), (bx, 7.08, .08), red[2], .018, region='gate')
        mesh.box(f'Gate bracket ledge {s}', (.50, .12, 1.25), (bx, 7.22, .08), wood, .015, region='gate')
    for side in (-1, 1):
        x = side * 1.23
        for tier, reach in enumerate((.32, .47, .64)):
            y = 6.89 + tier * .135
            for turn in (False, True):
                arm = mesh.profile_arm(f'Interlocked pine gate bracket {side} {tier} {turn}', x,
                                       y + .046 * turn, .08, reach * (.84 if turn else 1), .17,
                                       .118 if turn else .143, wood if turn else red[(tier + 1) % len(red)], turn)
                arm['region'] = 'gate'
            for end in (-1, 1):
                mesh.box('Exposed gate bracket end grain', (.13, .07, .046),
                         (x, y + .061, .08 + end * reach), wood, .006, region='gate')
    for x in (-1.78, -1.45, -1.11, -.77, -.41, 0, .41, .77, 1.11, 1.45, 1.78):
        mesh.box('Exposed weathered rafter end', (.11, .15, .30),
                 (x, 7.251 + .24 * abs(x / 2.58) ** 5, 1.36), wood, .008, region='gate')
    mesh.box('Weathered gate threshold', (2.19, .16, .52), (0, 4.075, .29), stone[0], .026, region='gate')
    mesh.box('Cypress transom', (3.27, .35, .46), (0, 6.76, .13), red[0], .034, region='gate')
    mesh.box('Shallow shadow lintel', (3.63, .15, .65), (0, 7.08, .12), wood, .015, region='gate')
    mesh.box('Old carved sign back', (.95, .26, .09), (0, 6.79, .42), wood, .016, region='gate')
    mesh.box('Old carved sign inner panel', (.87, .20, .034), (0, 6.79, .472), red[1], .010, region='gate')
    for i in range(5):
        angle = math.radians(32)
        x = .32 + i * .148
        z = -.62 + i * .093
        mesh.box(f'Open gate leaf plank {i + 1}', (.168, 2.35, .092), (x, 5.24, z), red[i % len(red)], .014, -angle, 'gate')
    for y in (4.31, 5.00, 6.17):
        mesh.box('Weathered gate door strap', (.83, .075, .12), (.62, y, -.40), iron, .008, math.radians(-32), 'gate')
    for s in (-1, 1):
        for i in range(6):
            x = s * (2.42 + i * .83)
            for j in range(3):
                mesh.box(f'Shoulder wall {s} {i} {j}', (.84, .41, .49),
                         (x + s * .09 * (j % 2), 4.205 + j * .40, .44),
                         stone[(i + j) % len(stone)], .024, region='gate')
            cap_width, cap_x = .88, x
            if s < 0 and i == 0:
                # Keep the outer end and stop the glazed cap inside the solid jamb.
                cap_width, cap_x = .80, x - .04
            mesh.box(f'Wall cap {s} {i}', (cap_width, .12, .67), (cap_x, 5.27, .44),
                     tiles[i % len(tiles)], .024, region='gate')
    gate_guide(wood, iron)
    roof(z=.08, x=0, y=7.26, w=5.15, d=1.34, h=.87, tiles=tiles, wood=wood, label='Gate', region='gate')
    mesh.box('Inner shrine stone platform', (5.7, .31, 4.2), (.17, 4.05, -5.0), stone[1], .038, region='gate')
    mesh.box('Inner shrine backdrop', (5.0, 2.53, .23), (.17, 5.47, -6.35), red[2], .023, region='gate')
    for x in (-2.11, -.61, .95, 2.45):
        mesh.box('Inner shrine cypress post', (.18, 2.45, .23), (x, 5.4, -3.62), red[1], .018, region='gate')
    roof(z=-4.95, x=.17, y=6.70, w=6.05, d=1.85, h=.97, tiles=tiles, wood=wood, label='Inner shrine', region='gate')


def gate_guide(wood, iron):
    # This small fixed guide belongs to the right gate bracket, away from the
    # personal candle recess. A dark arm visibly carries its paper-and-metal box.
    x, y, z = .91, 6.34, 1.12
    paper = mesh.material('Amber mulberry paper gate guide', '#d99751', rough=.84,
                          emission=1.25 / PRE_EXPOSURE)
    glaze = mesh.material('Brown patina on gate guide metal', '#513a2e', rough=.52, metal=.54)
    mesh.box('Guide mounting saddle fixed into gate post', (.28, .17, .12),
             (1.23, 6.73, .272), wood, .012, region='gate')
    mesh.curved_tube('Guide bracket forged into saddle',
                     [(1.17, 6.73, .31), (.96, 6.79, .72), (x, 6.72, z), (x, 6.59, z)],
                     [.023, .020, .016, .010], iron, radial=8, region='gate')
    mesh.lathe('Guide roof and drip edge', [(0, -.018), (.156, -.018), (.157, .005),
               (.092, .059), (.023, .073), (0, .073)], (x, y + .218, z), glaze, 8, 'gate')
    mesh.lathe('Guide terminal bronze foot', [(0, -.044), (.066, -.044), (.134, -.013),
               (.133, .013), (0, .013)], (x, y - .121, z), glaze, 8, 'gate')
    radius = .117
    vertices = []
    for h in (.0, .333):
        for i in range(8):
            angle = math.pi / 8 + i * math.tau / 8
            vertices.append((x + math.cos(angle) * radius, y - .12 + h, z + math.sin(angle) * radius))
    faces = [(i, i + 8, (i + 1) % 8 + 8, (i + 1) % 8) for i in range(8)]
    shell = mesh.mesh_object('Eight amber paper faces in the gate guide', vertices, faces, paper, 'gate')
    chart = [(.0895 * i, .333) for i in range(9)]
    source_uv(shell, [[(chart[i][0], 0), chart[i], chart[i + 1], (chart[i + 1][0], 0)]
                      for i in range(8)], 'Continuous octagonal guide paper strip.')
    for i in range(8):
        a, b = vertices[i], vertices[i + 8]
        mesh.beam('Fine metal rib on the guide', a, b, .0034, glaze, .0034, 'gate')
    mesh.light('Front emission spill from the suspended gate guide', (x + .15, y - .10, z + .21),
               4.75 / PRE_EXPOSURE, '#ffca91', .13)
    mesh.light('Warm light spilling down the inside of the gate', (x - .10, y - .24, z - .045),
               2.40 / PRE_EXPOSURE, '#ffc68e', .16)
    # The pale paving returns a broad, muted wash to the brackets and transom.
    # A small area source leaves the roof and surrounding forest in cool shadow.
    bounce = bpy.data.lights.new('Warm paving bounce under the gate guide', 'AREA')
    bounce.energy, bounce.color, bounce.shape, bounce.size = .88, (1., .76, .54), 'DISK', 1.04
    emitter = bpy.data.objects.new(bounce.name, bounce)
    bpy.data.collections['LIGHTS'].objects.link(emitter)
    emitter.location = mesh.point((.42, 6.06, 1.71))
    emitter.rotation_euler = (mesh.point((.26, 6.89, .42)) - emitter.location).to_track_quat('-Z', 'Y').to_euler()
    emitter['bake_role'] = 'fixture'


def roof(z, x, y, w, d, h, tiles, wood, label, region):
    lanes, rows = 19, 4
    for s in (-1, 1):
        points = []
        for i in range(rows + 1):
            t = i / rows
            for j in range(lanes + 1):
                u = j / lanes * 2 - 1
                end = abs(u) ** 5
                points.append((x + u * w / 2, y + h * (1 - t) ** 1.65 + end * (.10 + .30 * t),
                               z + s * t * d))
        faces = []
        for i in range(rows):
            for j in range(lanes):
                a = i * (lanes + 1) + j
                face = (a, a + lanes + 1, a + lanes + 2, a + 1)
                faces.append(face if s > 0 else tuple(reversed(face)))
        obj = mesh.mesh_object(f'{label} swept tile roof {s}', points, faces, tiles[0], region)
        for tile in tiles[1:]:
            obj.data.materials.append(tile)
        for face in obj.data.polygons:
            face.material_index = RANDOM.choices([0, 1, 2], weights=[60, 25, 15])[0]
        source_uv(obj, [[(points[i][0], points[i][2]) for i in face] for face in faces],
                  'Continuous roof slope chart.')
        mesh.uv_world(obj, .9)
        for j in range(lanes + 1):
            rafter = [points[i * (lanes + 1) + j] for i in range(rows + 1)]
            mesh.curved_tube(f'{label} roof cap {s} {j}', rafter, [.042] * len(rafter),
                             tiles[j % len(tiles)], radial=7, region=region)
        eave = [points[rows * (lanes + 1) + i] for i in (0, 2, 5, 9, 13, 17, 19)]
        mesh.curved_tube(f'{label} smiling eave {s}', [(a, b - .044, c + .012 * s) for a, b, c in eave],
                         [.056] * len(eave), wood, radial=8, region=region)
    ridge = [(x + u * w / 2, y + h + .057 + .16 * abs(u) ** 5, z)
             for u in (-1, -.83, -.61, 0, .61, .83, 1)]
    mesh.curved_tube(f'{label} clay ridge', ridge, [.116, .095, .07, .065, .07, .095, .116],
                     tiles[1], radial=9, region=region)


def carved_shrine(x, y, z, stone, recess):
    """One rounded granite block, hollowed into a tapering arched recess."""
    points, faces, charts, assignments = [], [], [], []
    rear, mouth = z - .156, z + .173
    levels, crown, base = 7, 36, 18

    def section(t):
        s = t ** 1.45
        width = .157 + .042 * s
        spring = .061 + .218 * s
        height = .094 + .105 * s
        floor = -.012
        side = list(range(levels + 1))
        arch = [math.pi * (1 - i / crown) for i in range(1, crown + 1)]
        return ([(-width, floor + (spring - floor) * i / levels) for i in side]
                + [(width * math.cos(a), spring + height * math.sin(a)) for a in arch]
                + [(width, floor + (spring - floor) * i / levels) for i in reversed(side[:-1])]
                + [(width * (1 - 2 * i / base), floor) for i in range(1, base)])

    def ring(contour):
        indices = list(range(len(points), len(points) + len(contour)))
        points.extend(contour)
        return indices

    def add(face, uv, material):
        faces.append(face)
        charts.append(uv)
        assignments.append(material)

    def join(a, b, reverse, material, plane_offset=None, strip=None):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            face = (a[i], a[j], b[j], b[i])
            if strip:
                perimeter, v0, v1 = strip
                uv = [(perimeter[i], v0), (perimeter[i + 1], v0), (perimeter[i + 1], v1), (perimeter[i], v1)]
            else:
                uv = [(points[k][0] - x, points[k][1] - y + plane_offset) for k in face]
            add(tuple(reversed(face)) if reverse else face, list(reversed(uv)) if reverse else uv, material)

    def cap(boundary, center, offset, reverse, material):
        current = boundary
        for step in range(1, 13):
            scale = (13 - step) / 13
            contour = [(center[0] + (points[k][0] - center[0]) * scale,
                        center[1] + (points[k][1] - center[1]) * scale,
                        center[2] + (points[k][2] - center[2]) * scale ** 2) for k in boundary]
            next_ring = ring(contour)
            join(current, next_ring, reverse, material, plane_offset=offset)
            current = next_ring
        tip = len(points)
        points.append(center)
        for i, first in enumerate(current):
            face = (first, current[(i + 1) % len(current)], tip)
            if reverse:
                face = tuple(reversed(face))
            add(face, [(points[k][0] - x, points[k][1] - y + offset) for k in face], material)

    front = section(1.)
    opening = ring([(x + px, y + py, mouth) for px, py in front])
    distances = [0.]
    for a, b in zip(front, front[1:] + front[:1]):
        distances.append(distances[-1] + math.dist(a, b))
    current = opening
    for row in range(1, 25):
        t = 1 - row / 24
        contour = []
        for px, py in section(t):
            # Shallow, irregular dragged chisel marks remain true relief.
            grain = math.sin(px * 148 + py * 188 + t * 41) * math.sin(py * 109 - t * 28)
            chip = .0012 * grain * math.sin(math.pi * t)
            contour.append((x + px + chip, y + py, rear + (mouth - rear) * t))
        next_ring = ring(contour)
        join(current, next_ring, True, 1, strip=(distances, (mouth - rear) * (1 - t - 1 / 24), (mouth - rear) * (1 - t)))
        current = next_ring
    cap(current, (x, y + .054, rear - .016), 1.20, True, 1)

    block = []
    for px, py in front:
        angle = math.atan2(py - .09, px)
        a, b = math.cos(angle), math.sin(angle)
        rough = 1 + .085 * math.sin(5 * angle + .5) + .038 * math.cos(9 * angle - 1)
        width = .515 * math.copysign(abs(a) ** .81, a) * rough
        height = (.63 if b > 0 else 1.20) * math.copysign(abs(b) ** .86, b) * rough
        block.append((x + width, y + .09 + height, mouth - .019 + .036 * math.sin(angle * 3 - .6)))
    current = opening
    for row in range(1, 10):
        t = row / 9
        contour = []
        for i, (bx, by, bz) in enumerate(block):
            px, py, pz = points[opening[i]]
            ridge = .034 * math.sin(math.pi * t) * (1 + .22 * math.sin(i * .68))
            contour.append((px + (bx - px) * t, py + (by - py) * t, pz + (bz - pz) * t + ridge))
        next_ring = ring(contour)
        join(current, next_ring, False, 0, plane_offset=3.4)
        current = next_ring
    perimeter = [0.]
    for a, b in zip(block, block[1:] + block[:1]):
        perimeter.append(perimeter[-1] + math.dist(a[:2], b[:2]))
    layers = ((1., 0.), (1.04, .092), (1.07, .224), (1.02, .386), (.87, .519), (.67, .612))
    for (old_scale, old_depth), (scale, depth) in zip(layers, layers[1:]):
        contour = [(x + (bx - x) * scale, y + .09 + (by - y - .09) * scale,
                    bz - depth + .025 * math.sin(i * .48) * depth) for i, (bx, by, bz) in enumerate(block)]
        next_ring = ring(contour)
        join(current, next_ring, False, 0, strip=(perimeter, 5.1 + old_depth, 5.1 + depth))
        current = next_ring
    cap(current, (x, y + .09, mouth - .66), 7.5, False, 0)

    shrine = mesh.mesh_object('Carved roadside granite shrine', points, faces, stone, 'niche')
    shrine.data.materials.append(recess)
    source_uv(shrine, charts, 'Independent metric front, outer and inner stone charts on one closed carving.')
    material_uv = shrine.data.uv_layers['UVMap'].uv
    for polygon, chart, material in zip(shrine.data.polygons, charts, assignments):
        polygon.material_index = material
        polygon.use_smooth = True
        for loop, (u, v) in zip(polygon.loop_indices, chart):
            material_uv[loop].vector = (u / .372 + .31, v / .372 + .23)
    return shrine


def trim_shrine(obj, section_point, section_normal, remove_positive, chart_offset):
    """Dress one Rock section and close its physical cut with a metric chart."""
    import bmesh

    model = bmesh.new()
    model.from_mesh(obj.data)
    bmesh.ops.bisect_plane(model, geom=[*model.verts, *model.edges, *model.faces], dist=1e-6,
                         plane_co=mesh.point(section_point), plane_no=mesh.point(section_normal).normalized(),
                         clear_outer=remove_positive, clear_inner=not remove_positive)
    cut = [edge for edge in model.edges if edge.is_boundary]
    filled = bmesh.ops.holes_fill(model, edges=cut).get('faces', [])
    caps = bmesh.ops.triangulate(model, faces=filled).get('faces', [])
    if not caps or any(not edge.is_manifold for edge in model.edges):
        raise RuntimeError('A carved shrine section failed to close: ' + obj.name)
    chart_uv = model.loops.layers.uv['SourceLightmap']
    material_uv = model.loops.layers.uv['UVMap']
    vertical = abs(section_normal[0]) > .5
    for face in caps:
        face.material_index = 0
        for loop in face.loops:
            x, y, z = engine(loop.vert.co)
            u, v = ((z - ANCHOR[2]) * math.hypot(section_normal[0], section_normal[2]), y - ANCHOR[1]) if vertical else (x - ANCHOR[0], z - ANCHOR[2])
            loop[chart_uv].uv = (u, v + chart_offset)
            loop[material_uv].uv = (u / .372 + .31, v / .372 + .53)
    bmesh.ops.recalc_face_normals(model, faces=list(model.faces))
    model.to_mesh(obj.data)
    model.free()


def old_wax_profile(x, z):
    height = pigment = 0.
    for i, (cx, cz, width, length, relief) in enumerate(SHELF_WAX_DEPOSITS):
        dx, dz = (x - cx) / width, (z - cz) / length
        angle = math.atan2(dz, dx)
        edge = 1 + .095 * math.sin(angle * 3 + i) + .055 * math.cos(angle * 5 - i)
        radius = math.hypot(dx, dz) / edge
        meniscus = max(0., 1 - radius * radius)
        height = max(height, relief * meniscus ** .79)
        pigment = max(pigment, min(1., meniscus * 2.2))
    return height, pigment


def wick_shelf(x, y, z, material):
    # A flat dish seat is surrounded by a hand-worn lip. The weathered top,
    # wax menisci, bevel band and face are part of one closed stone surface.
    xs = {round((j / 32 - .5) * .70, 7) for j in range(33)}
    zs = {round(.031 + (i / 28 - .5) * .61, 7) for i in range(29)}
    zs.add(0.)
    for cx, cz, width, length, _ in SHELF_WAX_DEPOSITS:
        for step in (-1.17, -.64, 0., .64, 1.17):
            xs.add(round(cx + step * width, 7))
            zs.add(round(cz + step * length, 7))
    xs, zs = sorted(xs), sorted(zs)
    columns, rows = len(xs), len(zs)
    points = []
    for top in (True, False):
        for dz in zs:
            v = (dz - .031) / .61 + .5
            for dx in xs:
                tip = min(1., max(0., (v - .76) / .24)) ** 2.5
                rim = tip * (.018 + .007 * math.sin(dx * 44 + .9) + .0035 * math.sin(dx * 111))
                height = old_wax_profile(dx, dz)[0] if top else 0.
                lip_z = dz - .31 * max(0., dz - .12)
                points.append((x + dx * (1 - .10 * tip), y - rim + height if top else y - .115,
                               z + lip_z - (rim * .63 if top else 0)))
    size = columns * rows
    faces = []
    charts = []
    for i in range(rows - 1):
        for j in range(columns - 1):
            a = i * columns + j
            face = (a, a + columns, a + columns + 1, a + 1)
            bottom = tuple(size + v for v in reversed(face))
            faces.append(face)
            faces.append(bottom)
            charts.append([(points[v][0] - x, points[v][2] - z) for v in face])
            charts.append([(points[v][0] - x, points[v][2] - z + .72) for v in bottom])
    outline = ([j for j in range(columns)] + [i * columns + columns - 1 for i in range(1, rows)]
               + [(rows - 1) * columns + j for j in range(columns - 2, -1, -1)]
               + [i * columns for i in range(rows - 2, 0, -1)])
    distance = 0.
    skirt_base = 1.26
    for a, b in zip(outline, outline[1:] + outline[:1]):
        ap, bp = points[a + size], points[b + size]
        next_distance = distance + math.hypot(bp[0] - ap[0], bp[2] - ap[2])
        faces.append((a, b, b + size, a + size))
        charts.append([(distance, skirt_base + points[a][1] - ap[1]),
                       (next_distance, skirt_base + points[b][1] - bp[1]),
                       (next_distance, skirt_base), (distance, skirt_base)])
        distance = next_distance
    shelf = mesh.mesh_object('Single hewn wick shelf', points, faces, material, 'niche')
    source_uv(shelf, charts, 'Metric shelf faces and unfolded perimeter skirt across the variable relief grid.')
    for index in range(0, 2 * (columns - 1) * (rows - 1), 2):
        shelf.data.polygons[index].use_smooth = True
    return shelf


def candle_niche(stone, soot, clay, iron, ledge, reveal):
    x, y, z = ANCHOR
    shelf = wick_shelf(x, y, z, ledge)
    hood = carved_shrine(x, y, z, reveal, soot)
    sill = hood.copy()
    sill.data = hood.data.copy()
    sill.name = 'Carved roadside granite shrine low sill'
    mesh.STATIC.objects.link(sill)
    trim_shrine(sill, (x, y + .016, z), (0, 1, 0), True, 10.)
    trim_shrine(hood, (x, y + .012, z), (0, 1, 0), False, 10.)
    # Leave the sheltered left return and crown. The diagonal right edge
    # opens the candle view toward the valley on the far side of the terrace.
    trim_shrine(hood, (x + .045, y, z), (1, 0, -.43), True, 12.)
    with contacts.group('Celadon rain cup', [shelf]):
        cup_x, cup_z = x - .127, z + .088
        cup = mesh.lathe('Chipped celadon offering cup', [(0, 0), (.022, 0), (.030, .006), (.037, .029),
                        (.036, .034), (.033, .034), (.028, .010), (.014, .007), (0, .007)],
                        (cup_x, y, cup_z), clay, 28, 'niche')
        for vertex in cup.data.vertices:
            dx, dz = vertex.co.x - cup_x, -vertex.co.y - cup_z
            angle = math.atan2(dx, dz)
            rim = max(0., (vertex.co.z - y - .023) / .011)
            vertex.co.z -= .006 * rim * math.exp(-((angle - .5) / .27) ** 2)
    side_stone = mesh.box('Low offering stone beside the shrine', (.28, .21, .22),
                         (x - .68, 4.73, z + .169), stone[1], .023, region='niche')
    with contacts.group('Spare iron wick plate', [side_stone]):
        mesh.lathe('Spare stone-shelf iron wick plate', [(0, 0), (.039, 0), (.051, .006), (.051, .009),
                   (.044, .012), (.039, .004), (0, .004)], (x - .65, 4.835, z + .175), iron, 16, 'niche')


def paint_stone():
    for obj in mesh.STATIC.objects:
        materials = list(obj.data.materials)
        if not any(material.get('one_light_surface_tint') for material in materials):
            continue
        close = obj.get('region') == 'niche'
        carving = obj.name.startswith('Carved roadside granite shrine')
        if close and not carving:
            # Keep enough source granite texels in the close view. Each piece
            # starts at a distinct texture offset, with UVs in its world plane.
            hero_plane = obj.name == 'Single hewn wick shelf'
            mesh.uv_world(obj, RANDOM.uniform(.49, .57) if hero_plane else RANDOM.uniform(.32, .52))
            offset = Vector((RANDOM.uniform(-3, 3), RANDOM.uniform(-3, 3)))
            uv = obj.data.uv_layers['UVMap'].uv
            for face in obj.data.polygons:
                for loop in face.loop_indices:
                    co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    if hero_plane and abs(face.normal.z) > .85:
                        uv[loop].vector = (co.x / .382, -co.y / .382)
                    uv[loop].vector += offset
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
                if carving and face.material_index == 1:
                    rise = max(0., min(1., (world.z - ANCHOR[1] - .046) / .106))
                    drift = .013 + .014 * math.sin(world.z * 35) + .015 * noise.noise(world * 42)
                    dx = (world.x - ANCHOR[0] + drift) / (.021 + .070 * rise)
                    smoke_stain = rise ** .53 * math.exp(-dx * dx) * min(.90, .81 + .17 * noise.noise(world * 79))
                    shade *= 1 - smoke_stain
                if carving and face.material_index == 0:
                    water = .5 + .5 * noise.noise(Vector((world.x * 28, world.y * 24, world.z * 2.8)))
                    shade *= .68 + .38 * water
                    damp = max(0., min(1., (5.15 - world.z) / .74))
                    green_mix = damp * max(0., (water - .45) * .95)
                tint_color = [base[channel] * shade * (1 - green_mix * (1 - tone))
                              for channel, tone in enumerate((.48, .73, .43))]
                if obj.name == 'Single hewn wick shelf' and face.normal.z > .8:
                    dx, dz = world.x - ANCHOR[0], -world.y - ANCHOR[2]
                    lip = max(0., min(1., (dz - .104) / .076))
                    lip_wear = lip * (.28 + .14 * noise.noise(world * 44))
                    pigment = old_wax_profile(dx, dz)[1]
                    for channel, deposit in enumerate((.54, .49, .39)):
                        tint_color[channel] += (.46 - tint_color[channel]) * lip_wear
                        tint_color[channel] += (deposit - tint_color[channel]) * pigment * .87
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
    bg.inputs['Color'].default_value = (.55, .59, .65, 1)
    bg.inputs['Strength'].default_value = 1.18 / PRE_EXPOSURE
    sun = bpy.data.lights.new('Blue mountain sky direction', 'SUN')
    sun.energy, sun.color, sun.angle = 1.42 / PRE_EXPOSURE, (.81, .87, .97), .22
    caster = bpy.data.objects.new(sun.name, sun)
    bpy.data.collections['LIGHTS'].objects.link(caster)
    caster.location = mesh.point((-9, 15, 14))
    caster.rotation_euler = (mesh.point((0, 4, 1)) - caster.location).to_track_quat('-Z', 'Y').to_euler()
    caster['bake_role'] = 'ambient'
    # Broad skylight follows the breaks in the canopy over the stair run.
    # The off-axis placements leave the outer banks and trunks in shadow.
    openings = [
        ('Lower stair skylight', (-1.6, 9.8, 43.8), (.35, .65, 42.), 36., 11.5),
        ('Middle stair skylight', (2.0, 12.4, 28.5), (-.35, 1.9, 26.), 33., 12.5),
        ('Upper stair skylight', (-.7, 12.3, 13.2), (.3, 3., 11.), 26., 10.2),
        ('Soft sky over the gate front', (-.55, 10.0, 7.4), (0., 6.4, .7), 11., 6.5),
    ]
    for name, location, aim, energy, diameter in openings:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy, light.color, light.shape, light.size = energy, (.76, .85, 1.), 'DISK', diameter
        source = bpy.data.objects.new(name, light)
        bpy.data.collections['LIGHTS'].objects.link(source)
        source.location = mesh.point(location)
        source.rotation_euler = (mesh.point(aim) - source.location).to_track_quat('-Z', 'Y').to_euler()
        source['bake_role'] = 'ambient'
    for p, watts in [((.98, 6.38, .62), 1.98), ((.15, 6.25, -4.8), 2.1)]:
        mesh.light('Hidden warm reflected temple light', p, watts / PRE_EXPOSURE, '#f5b27e', .26)
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
    stone, rock, ground, wood, red, tiles, bark, needle, iron, clay, soot, ledge, reveal = palette()
    support = terrain(ground)
    climbing_steps(stone)
    forest(support, rock, stone, bark, needle)
    gate(stone, tiles, wood, red, iron)
    candle_niche(stone, soot, clay, iron, ledge, reveal)
    paint_stone()
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'AUTO'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = math.log2(PRE_EXPOSURE)
    scene.camera = camera('Reference_PineSteps', (.97, 2.96, 33.7), (-.12, 4.55, 1), 30, (1440, 900))
    camera('Reference_PineStepsPhone', (.62, 2.91, 34.05), (-.11, 4.42, 1), 40, (390, 844))
    camera('Reference_PineWalkLower', (.30, 3.34, 29.5), (.15, 3.42, 23.5), 30, (1440, 900))
    camera('Reference_PineWalkMiddle', (.12, 4.70, 16), (.11, 4.78, 10), 40, (390, 844))
    camera('Reference_PineLanding', (.1, 5.65, 6), (-1.09, 5.55, 2.75), 40, (1440, 900))
    camera('Reference_PineChooseDesktop', (-1.67, 5.29, 1.48), (-1.705, 5.075, .9), 31, (1440, 900))
    camera('Reference_PineChoosePhone', (-1.71, 5.25, 1.46), (-1.80, 4.95, .9), 43, (390, 844))
    camera('Reference_PineIgnitionDesktop', (-1.63, 5.32, 1.60), (-1.76, 5.10, .9), 39, (1440, 900))
    camera('Reference_PineIgnitionPhone', (-1.69, 5.33, 1.64), (-1.80, 5.10, .9), 43, (390, 844))
    camera('Reference_PineBurnDesktop', (-1.728446, 5.194143, 1.223875), (-1.80, 5.054197, .9), 33.185668, (1440, 900))
    camera('Reference_PineBurnPhone', (-1.736421, 5.208135, 1.296435), (-1.80, 5.054197, .9), 28.376397, (390, 844))
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
        'fixedArchitecture': 'Pine roots and slate outcrops enter terrain. Stone courses, steps, niche and eaves are structural. The guide bracket is built into the right gate post.'})
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
