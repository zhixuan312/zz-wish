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
from snow_lightmap_charts import closed_grid_uv, profile_uv, source_uv

ROOT = Path(__file__).resolve().parents[2]
ANCHOR = (-1.8, 5.0, .9)
LAMP = (-1.8, 5.076, .9)
PRE_EXPOSURE = 6
RANDOM = random.Random(21594)


def supports_height(x, z, supports):
    tree, _ = contacts.support(supports)
    hit, _, _, _ = tree.ray_cast(mesh.point((x, 50, z)), Vector((0, 0, -1)), 100)
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
    rgba[..., :3] = lightness[..., None] * np.asarray((.945, 1., 1.035), dtype=np.float32)
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
    soot = mesh.material('Chisel-faced granite beneath soot', '#a9b0bb', 'rock_pitted_mossy', .92)
    ledge = mesh.material('Worn fine granite on the wick shelf', '#a1a7af', 'rock_pitted_mossy', .82)
    reveal = mesh.material('Dressed granite inside the arch', '#838a93', 'rock_pitted_mossy', .91)
    close_albedo = neutral_granite_albedo()
    for material, amount in ((soot, .18), (ledge, .22), (reveal, .16)):
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP':
                node.inputs['Strength'].default_value = amount
            if node.type == 'TEX_IMAGE' and node.label.endswith('Base Color'):
                node.image = close_albedo
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        for link in list(bsdf.inputs['Roughness'].links):
            material.node_tree.links.remove(link)
    for material in [*stone, rock, ground, soot, ledge, reveal]:
        mesh.vertex_tint_shader(material)
    return stone, rock, ground, wood, red, tiles, bark, pine, iron, clay, soot, ledge, reveal


def terrain_height(x, z):
    rise = min(4, max(0, (46 - z) * .1))
    bank = max(0, min(3., (abs(x) - 2.18) * .27))
    return rise - .10 + bank + .12 * math.sin(x * .95 + z * .25) * min(1., bank)


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
    mesh.box('Broad stone landing', (5.2, .40, 6.3), (0, 3.80, 3.19), stone[2], .045, region='gate')
    for row in range(7):
        z = 1.51 + row * .64
        for col in range(6):
            x = (col - 2.5) * .84 + .045 * (row % 2)
            hewn_block(f'Landing flagstone {row} {col}', .829, .092, .628,
                       (x, 4.00 + RANDOM.uniform(-.003, .003), z), RANDOM.choice(stone), 'gate')


def understory(ground, foliage):
    # Folded leaves rise out of the terrain. The roots are part of the bank.
    vents = [(s * x, z) for s in (-1, 1) for x, z in ((3.1, 6.9), (3.8, 16.8), (4.6, 27.3),
                                                       (3.3, 33.1), (5.0, 40.6), (5.7, 47.8))]
    for i in range(88):
        cx, cz = vents[i % len(vents)]
        x = cx + RANDOM.uniform(-.48, .48)
        z = cz + RANDOM.uniform(-1.63, 1.63)
        y = supports_height(x, z, [ground]) - .018
        vertices, faces = [], []
        count = RANDOM.randint(4, 8)
        for frond in range(count):
            theta = frond * math.tau / count + RANDOM.uniform(-.40, .40)
            length = RANDOM.uniform(.13, .40)
            width = length * RANDOM.uniform(.10, .17)
            cs, sn = math.cos(theta), math.sin(theta)
            start = len(vertices)
            vertices.extend([(x, y, z),
                             (x + length * .45 * cs - width * sn, y + length * .56, z + length * .45 * sn + width * cs),
                             (x + length * .58 * cs, y + length * .69, z + length * .58 * sn),
                             (x + length * .45 * cs + width * sn, y + length * .53, z + length * .45 * sn - width * cs),
                             (x + length * cs, y + length * .48, z + length * sn)])
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


def forest(ground, rock, bark, pine):
    needles = needle_material()
    for i, z in enumerate((7, 14, 21, 29, 36, 43, 49)):
        for s in (-1, 1):
            x = s * RANDOM.uniform(4.50 if z > 42 else 3.35, 5.8)
            pine_tree(f'Old pine {i + 1} {s}', x, z + RANDOM.uniform(-1.6, 1.6),
                      RANDOM.uniform(6.1, 10.4), bark, needles, ground, roots=z >= 14)
    for i, (x, z, h) in enumerate(((-10, 0, 10), (12, -3, 9), (8, -14, 7), (-7, -10, 8),
                                   (-4, -6, 7), (4, -8, 8), (15, 18, 9), (-17, 19, 9))):
        pine_tree(f'Back ridge pine {i + 1}', x, z, h, bark, needles, ground)
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
                          (x, y + radius * .28, z), rock, 'approach')
        slab['moss_edge'] = True
        for vertex in slab.data.vertices:
            vx, vz = vertex.co.x - x, -vertex.co.y - z
            vertex.co.z += (.21 * vx - .12 * vz) * (-1 if i % 2 else 1)
    for i, (x, z, r) in enumerate(((-3.1, 34, .64), (3.6, 25, .76), (-3.7, 12, .51), (4.6, 6.9, .52))):
        y = supports_height(x, z, [ground])
        profile = [(0, 0), (r * .40, 0), (r, r * .36), (r * .78, r * .65), (r * .43, r * .82), (0, r * .88)]
        with contacts.group(f'Loose ridge stone {i + 1}', [ground]):
            obj = mesh.lathe(f'Weathered ridge stone {i + 1}', profile, (x, y, z), rock, 9, 'approach')
            for vertex in obj.data.vertices:
                if vertex.co.z > y + .001:
                    vertex.co.x += RANDOM.uniform(-.11, .11) * r
                    vertex.co.y += RANDOM.uniform(-.15, .15) * r
                    vertex.co.z += RANDOM.uniform(-.07, .07) * r
            # Turn the broad base onto the sampled terrain plane before the
            # contact solver applies the final vertical settling correction.
            tree, _ = contacts.support([ground])
            loc = mesh.point((x, y, z))
            _, normal, _, _ = tree.ray_cast(mesh.point((x, 50, z)), Vector((0, 0, -1)), 100)
            turn = Vector((0, 0, 1)).rotation_difference(normal).to_matrix().to_4x4()
            obj.matrix_world = Matrix.Translation(loc) @ turn @ Matrix.Translation(-loc)


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
            mesh.box(f'Wall cap {s} {i}', (.88, .12, .67), (x, 5.27, .44), tiles[i % len(tiles)], .024, region='gate')
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
               3.55 / PRE_EXPOSURE, '#ffca91', .13)
    mesh.light('Warm light spilling down the inside of the gate', (x - .10, y - .24, z - .045),
               1.85 / PRE_EXPOSURE, '#ffc68e', .16)


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


def arch_segment(name, cx, spring, center_z, r0, r1, depth, a, b, mat):
    # Deep radial stone wedge with real front, intrados and jamb seams.
    points = []
    for z in (-depth / 2, depth / 2):
        for r, theta in ((r0, a), (r1, a), (r1, b), (r0, b)):
            wear = (.002 + .0021 * math.sin(theta * 12.9)) if z > 0 else 0
            real_radius = r + wear * (1 if r == r0 else -.52)
            points.append((cx + real_radius * math.cos(theta), spring + real_radius * math.sin(theta),
                           center_z + z - wear * (1 + .34 * math.cos(theta * 7))))
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = mesh.mesh_object(name, points, faces, mat, 'niche')
    # These pieces are compact, nondegenerate convex prisms. Isolate the six
    # exact planar faces by area-bearing local coordinates before atlas packing.
    charts = []
    for face_index, face in enumerate(obj.data.polygons):
        origin = obj.data.vertices[face.vertices[0]].co
        direction = (obj.data.vertices[face.vertices[1]].co - origin).normalized()
        across = face.normal.cross(direction)
        charts.append([((obj.data.vertices[i].co - origin).dot(direction) + face_index,
                        (obj.data.vertices[i].co - origin).dot(across)) for i in face.vertices])
    source_uv(obj, charts, 'Separate charts across the radiating granite joints.')
    mesh.bevel(obj, .0038, 2)


def hewn_back(x, y, z, material):
    count = 26
    vertices = []
    for row in range(count):
        for col in range(count):
            u, v = col / (count - 1), row / (count - 1)
            px, py = x + (u - .5) * .803, y + v * .74 - .036
            chip = noise.noise(Vector((px * 29, py * 34, .6))) * .0016
            chiselled = math.sin(py * 103 + px * 12) * .00015
            vertices.append((px, py, z + chip + chiselled))
    faces = [(row * count + col, row * count + col + 1, (row + 1) * count + col + 1, (row + 1) * count + col)
             for row in range(count - 1) for col in range(count - 1)]
    back = mesh.mesh_object('Hand-chiselled niche back under old soot', vertices, faces, material, 'niche')
    source_uv(back, [[(vertices[i][0], vertices[i][1]) for i in face] for face in faces],
              'Continuous hewn front plane with actual chisel relief.')
    for face in back.data.polygons:
        face.use_smooth = True
    return back


def wick_shelf(x, y, z, material):
    # A flat dish seat is surrounded by a hand-worn lip. The weathered top,
    # bevel band and face belong to one closed slab with a single material.
    columns, rows = 33, 29
    points = []
    for top in (True, False):
        for i in range(rows):
            v = i / (rows - 1)
            for j in range(columns):
                u = j / (columns - 1)
                dx = (u - .5) * .70
                dz = (v - .5) * .61
                tip = min(1., max(0., (v - .83) / .17)) ** 3
                rim = tip * (.015 + .006 * math.sin(dx * 44 + .9) + .0035 * math.sin(dx * 111))
                points.append((x + dx, y - rim if top else y - .115, z + .031 + dz - (rim * .63 if top else 0)))
    size = columns * rows
    faces = []
    for i in range(rows - 1):
        for j in range(columns - 1):
            a = i * columns + j
            face = (a, a + columns, a + columns + 1, a + 1)
            faces.append(face)
            faces.append(tuple(size + v for v in reversed(face)))
    outline = ([j for j in range(columns)] + [i * columns + columns - 1 for i in range(1, rows)]
               + [(rows - 1) * columns + j for j in range(columns - 2, -1, -1)]
               + [i * columns for i in range(rows - 2, 0, -1)])
    for a, b in zip(outline, outline[1:] + outline[:1]):
        faces.append((a, b, b + size, a + size))
    shelf = mesh.mesh_object('Single hewn wick shelf', points, faces, material, 'niche')
    closed_grid_uv(shelf, columns, rows, .70, .61)
    return shelf


def hewn_reveal(x, y, z, side, course, material):
    # The arch cheeks continue behind the exposed back face. A soft taper
    # connects each chipped opening edge to solid masonry behind the joints.
    columns, rows = 14, 9
    depth, height = .396, .141
    span = columns * rows
    points = []
    for inner in (True, False):
        for row in range(rows):
            v = row / (rows - 1)
            for col in range(columns):
                u = col / (columns - 1)
                front_wear = u ** 4 * (.005 + .003 * math.sin(v * 10 + side + course))
                relief = .0043 * math.sin(u * 8.4 + v * 6.9 + course * 2.2 + side)
                taper = .195 + .016 * u ** 1.4 + .012 * (1 - u) ** 4
                xx = x + side * (taper + (relief + front_wear if inner else .171))
                seam = .0062 * math.sin(u * 5.6 + side) * (.78 + .22 * v)
                yy = y + .001 + course * .144 + v * height + seam
                if course == 0:
                    yy += (.001 - yy + y) * (1 - v) ** 5
                zz = z - .181 + u * depth - front_wear * .57
                points.append((xx, yy, zz))
    faces = []
    for row in range(rows - 1):
        for col in range(columns - 1):
            a = row * columns + col
            face = (a, a + 1, a + columns + 1, a + columns)
            if side < 0:
                face = tuple(reversed(face))
            faces.append(face)
            faces.append(tuple(span + n for n in reversed(face)))
    edge = ([col for col in range(columns)] + [row * columns + columns - 1 for row in range(1, rows)]
            + [(rows - 1) * columns + col for col in range(columns - 2, -1, -1)]
            + [row * columns for row in range(rows - 2, 0, -1)])
    for a, b in zip(edge, edge[1:] + edge[:1]):
        face = (a, b, b + span, a + span)
        faces.append(face if side < 0 else tuple(reversed(face)))
    obj = mesh.mesh_object(f'Hand dressed niche jamb {side} course {course + 1}', points, faces, material, 'niche')
    closed_grid_uv(obj, columns, rows, depth, height)
    for face in obj.data.polygons[:2 * (rows - 1) * (columns - 1)]:
        face.use_smooth = True


def candle_niche(stone, rock, soot, clay, iron, ledge, reveal):
    x, y, z = ANCHOR
    # Opening is 0.398 m wide. The calibrated 5.000 m top of the real slab
    # directly bears the live stone dish; its 8 mm seat bears the runtime wax.
    wick_shelf(x, y, z, ledge)
    hewn_back(x, y, z - .142, soot)
    mesh.box('Solid dark lime mortar behind the arch joints', (1.06, .79, .104),
             (x, y + .367, z - .225), stone[4], .012, region='niche')
    for s in (-1, 1):
        for i in range(2):
            hewn_reveal(x, y, z, s, i, reveal)
    joints = [0.] + [j * math.pi / 9 + .034 * math.sin(j * 2.5) for j in range(1, 9)] + [math.pi]
    for j, (left, right) in enumerate(zip(joints, joints[1:])):
        gap = .0068 + .0021 * math.sin(j * 1.8)
        arch_segment(f'Hewn niche voussoir {j + 1}', x, y + .287, z + .005, .199, .352,
                     .390, left + gap, right - gap, reveal)
    for s in (-1, 1):
        for j in range(5):
            m = stone[(j + (s > 0)) % len(stone)]
            p = (x + s * (.47 + .025 * (j % 2)), 4.227 + .329 * j, z - .047)
            mesh.box(f'Massive gate-pier jamb {s} course {j + 1}', (.28, .323, .69), p, m, .028, region='niche')
    mesh.box('Niche stone base course', (.75, .87, .64), (x, 4.445, z - .035), stone[1], .038, region='niche')
    mesh.box('Niche overarch granite header', (.93, .25, .70), (x, y + .771, z), stone[2], .028, region='niche')
    mesh.box('Niche upper pier', (.97, .43, .72), (x, y + 1.11, z), stone[4], .038, region='niche')
    mesh.box('Rain drip cornice', (1.17, .145, .83), (x, y + 1.37, z + .018), rock, .028, region='niche')
    shelf = mesh.box('Side offering ledge', (.49, .083, .24), (x - .72, 4.834, z + .17), stone[1], .015, region='niche')
    with contacts.group('Celadon rain cup', [shelf]):
        mesh.lathe('Small weathered celadon rain cup', [(0, 0), (.039, 0), (.046, .011), (.057, .059),
                   (.058, .067), (.050, .068), (.044, .025), (.021, .013), (0, .013)],
                   (x - .75, 4.8755, z + .175), clay, 18, 'niche')
    with contacts.group('Spare iron wick plate', [shelf]):
        mesh.lathe('Spare stone-shelf iron wick plate', [(0, 0), (.048, 0), (.059, .009), (.059, .013),
                   (.050, .016), (.044, .007), (0, .007)],
                   (x - .59, 4.8755, z + .175), iron, 16, 'niche')


def paint_stone():
    for obj in mesh.STATIC.objects:
        materials = list(obj.data.materials)
        if not any(material.get('one_light_surface_tint') for material in materials):
            continue
        close = obj.get('region') == 'niche'
        if close:
            # Keep enough source granite texels in the close view. Each piece
            # starts at a distinct texture offset, with UVs in its world plane.
            hero_plane = obj.name in ('Hand-chiselled niche back under old soot', 'Single hewn wick shelf')
            mesh.uv_world(obj, RANDOM.uniform(.49, .57) if hero_plane else RANDOM.uniform(.32, .52))
            offset = Vector((RANDOM.uniform(-3, 3), RANDOM.uniform(-3, 3)))
            uv = obj.data.uv_layers['UVMap'].uv
            for face in obj.data.polygons:
                for loop in face.loop_indices:
                    co = obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    if obj.name.startswith('Hand-chiselled niche back'):
                        uv[loop].vector = (co.x / .547, co.z / .547)
                    elif obj.name == 'Single hewn wick shelf' and abs(face.normal.z) > .85:
                        uv[loop].vector = (co.x / .481, -co.y / .481)
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
                    bank = noise.noise(world * .39) + .39 * noise.noise(world * 1.33)
                    root_dirt = .13 * math.sin(world.x * .57 + world.y * .31)
                    shade *= .78 + .42 * max(0., min(1., .49 + bank - root_dirt))
                    green_mix = max(0., min(.55, (.18 + bank) * .62))
                if obj.name.startswith('Hand-chiselled niche back'):
                    dx = (world.x - ANCHOR[0] + .014 * math.sin(world.z * 24)) / .108
                    dy = (world.z - ANCHOR[1] - .37) / .265
                    black = math.exp(-dx * dx - dy * dy) * (.78 + .16 * noise.noise(world * 44))
                    shade *= 1 - black
                tint_color = [base[channel] * shade * (1 - green_mix * (1 - tone))
                              for channel, tone in enumerate((.48, .73, .43))]
                if obj.name == 'Single hewn wick shelf' and face.normal.z > .8:
                    dx, dz = world.x - ANCHOR[0], -world.y - ANCHOR[2]
                    flecks = 0.
                    for px, pz, sx, sz in ((-.104, .035, .045, .021), (.095, .051, .036, .019),
                                            (.052, -.086, .022, .031), (-.067, -.056, .024, .031),
                                            (.074, .111, .016, .027)):
                        contour = .008 * noise.noise(world * 68)
                        flecks += math.exp(-((dx - px + contour) / sx) ** 2 - ((dz - pz - contour) / sz) ** 2)
                    marks = min(.54, flecks * (.44 + .19 * noise.noise(world * 44)))
                    for channel, worn in enumerate((.51, .39, .26)):
                        tint_color[channel] += (worn - tint_color[channel]) * marks
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
    bg.inputs['Color'].default_value = (.47, .55, .68, 1)
    bg.inputs['Strength'].default_value = 1.18 / PRE_EXPOSURE
    sun = bpy.data.lights.new('Blue mountain sky direction', 'SUN')
    sun.energy, sun.color, sun.angle = 1.42 / PRE_EXPOSURE, (.66, .77, 1), .22
    caster = bpy.data.objects.new(sun.name, sun)
    bpy.data.collections['LIGHTS'].objects.link(caster)
    caster.location = mesh.point((-9, 15, 14))
    caster.rotation_euler = (mesh.point((0, 4, 1)) - caster.location).to_track_quat('-Z', 'Y').to_euler()
    caster['bake_role'] = 'ambient'
    # Model the diffuse sky bounce off the front sill as a broad, weak source.
    # The ambient role keeps the visitor's lamp-only atlas independent.
    bounce = bpy.data.lights.new('Cool diffuse bounce from the niche lip', 'AREA')
    bounce.energy, bounce.color, bounce.shape, bounce.size = .004, (.86, .92, 1.), 'DISK', .22
    emitter = bpy.data.objects.new(bounce.name, bounce)
    bpy.data.collections['LIGHTS'].objects.link(emitter)
    emitter.location = mesh.point((-1.88, 5.23, 1.04))
    emitter.rotation_euler = (mesh.point((-1.91, 5.23, .758)) - emitter.location).to_track_quat('-Z', 'Y').to_euler()
    emitter['bake_role'] = 'ambient'
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
    forest(support, rock, bark, needle)
    gate(stone, tiles, wood, red, iron)
    candle_niche(stone, rock, soot, clay, iron, ledge, reveal)
    paint_stone()
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'AUTO'
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = math.log2(PRE_EXPOSURE)
    scene.camera = camera('Reference_PineSteps', (3.8, 2.3, 52), (-.4, 5.4, 1), 32, (1440, 900))
    camera('Reference_PineStepsPhone', (3.8, 2.3, 52), (-.4, 4.3, 1), 48, (390, 844))
    camera('Reference_PineWalkLower', (.2, 1.7, 46), (-.15, 2.65, 36), 32, (1440, 900))
    camera('Reference_PineWalkMiddle', (.2, 3.65, 26), (0, 4.65, 16), 44, (390, 844))
    camera('Reference_PineLanding', (.1, 5.65, 6), (-1.09, 5.55, 2.75), 40, (1440, 900))
    camera('Reference_PineChooseDesktop', (-1.67, 5.29, 1.48), (-1.705, 5.075, .9), 31, (1440, 900))
    camera('Reference_PineChoosePhone', (-1.71, 5.25, 1.46), (-1.80, 4.95, .9), 43, (390, 844))
    camera('Reference_PineBurnDesktop', (-1.705, 5.24, 1.33), (-1.775, 5.075, .9), 34, (1440, 900))
    camera('Reference_PineBurnPhone', (-1.715, 5.26, 1.43), (-1.795, 5.060, .9), 40, (390, 844))
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
    anchor_height = supports_height(ANCHOR[0], ANCHOR[2], [bpy.data.objects['Single hewn wick shelf']])
    if abs(anchor_height - ANCHOR[1]) > 1e-6 or any(abs(a - b) > 1e-6 for a, b in zip(engine(basis.matrix_world.translation), LAMP)):
        raise RuntimeError('Baked shelf and lamp basis must use their measured runtime locations.')
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
