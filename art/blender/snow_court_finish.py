"""Finish the rebuilt hall using the existing CC0 plaster and paving scans."""

from hashlib import sha256
import json
import math
from pathlib import Path
import random

import numpy as np

from snow_bronze_maps import _png


# Bounds measured inside individual faces of Poly Haven's stone_pavers scan.
# The image's own joints never cross the constructed slate joints.
SLATE_FACES = (
    (.204, .420, .051, .203),
    (.513, .755, .048, .218),
    (.325, .611, .286, .464),
    (.157, .384, .551, .727),
    (.460, .719, .546, .728),
    (.470, .722, .796, .953),
)


def smooth(low, high, values):
    t = np.clip((values - low) / (high - low), 0., 1.)
    return t * t * (3. - 2. * t)


def plaster_colour(scan, size=640):
    """Keep photographed plaster grain under sparse, directional weathering."""
    rng = np.random.default_rng(73213)
    y, x = np.mgrid[:size, :size].astype(np.float32) / (size - 1)
    x *= 7.6
    y *= 2.78
    iy = np.rint(y[:, 0] / 2.78 * (scan.shape[0] - 1)).astype(int)
    ix = np.rint(x[0] / 7.6 * (scan.shape[1] - 1)).astype(int)
    sample = scan[iy[:, None], ix, :3]
    grain = sample @ np.array((.25, .59, .16), dtype=np.float32)
    # The photographed grog and pits remain, while baked broad stains in the
    # source photograph do not repeat across the wall or double-light it.
    blurred = grain.copy()
    for axis in range(2):
        padded = np.moveaxis(blurred, axis, 0)
        padded = np.pad(padded, ((12, 12), (0, 0)), mode='edge')
        sums = np.cumsum(np.pad(padded, ((1, 0), (0, 0))), axis=0)
        blurred = np.moveaxis((sums[25:] - sums[:-25]) / 25., 0, axis)
    grit = np.clip((grain - blurred) * .64, -.073, .075)

    salt_line = .27 + .047 * np.sin(3.18 * x + .51) + .027 * np.sin(8.72 * x)
    damp = 1. - smooth(.02, salt_line, y)
    crust = np.exp(-((y - salt_line * .86) / .027) ** 2) * (.42 + .38 * np.sin(7.4 * x) ** 2)
    streak = np.zeros_like(y)
    for xp, top, run in ((.38, 2.77, 1.86), (1.57, 2.79, 1.16), (2.01, 1.78, .80),
                         (3.07, 2.76, 1.52), (4.17, 2.80, 1.98), (5.72, 2.65, .91),
                         (6.41, 2.71, 1.36), (7.17, 2.79, 1.87)):
        flow = max(.03, float(rng.uniform(.035, .091)))
        path = xp + .037 * (top - y) + .014 * np.sin(y * 7.1 + xp)
        stem = np.exp(-((x - path) / flow) ** 2)
        streak += stem * smooth(top - run, top - .28, y) * (1. - smooth(top - .04, top + .07, y))
    tint = np.array((.717, .688, .641)) + grit[..., None]
    tint -= damp[..., None] * (.118, .114, .097)
    tint += crust[..., None] * (.021, .020, .016)
    tint -= np.minimum(streak, 1.)[..., None] * (.040, .057, .054)

    flaking = np.zeros_like(y)
    flake_rim = np.zeros_like(y)
    for xp, yp, rx, ry in ((.19, .19, .15, .17), (.91, .28, .105, .177),
                            (1.48, .35, .19, .124), (2.73, .13, .22, .092),
                            (3.22, .42, .14, .113), (4.19, 1.12, .138, .088),
                            (4.49, .32, .20, .11), (5.96, .25, .24, .121),
                            (6.62, 1.67, .094, .098), (7.31, .19, .18, .128)):
        dx, dy = (x - xp) / rx, (y - yp) / ry
        angle = np.arctan2(dy, dx)
        broken_edge = (np.sin(angle * 5. + xp) + .46 * np.sin(angle * 11. + yp)) * .17
        fine_edge = .073 * np.sin(x * 193. + y * 131.) + .049 * np.sin(x * 257. - y * 117.)
        border = np.hypot(dx, dy) - 1. - broken_edge - fine_edge
        flaking = np.maximum(flaking, 1. - smooth(-.14, .037, border))
        flake_rim = np.maximum(flake_rim, np.exp(-((border - .047) / .061) ** 2))
    undercoat = np.array((.557, .517, .455)) + grit[..., None] * 1.17 - damp[..., None] * .077
    tint += (undercoat - tint) * flaking[..., None]
    tint += .044 * flake_rim[..., None]

    hair = np.zeros_like(y)
    for path in (
        ((.22, 2.70), (.28, 2.58), (.22, 2.46), (.35, 2.37), (.38, 2.25), (.46, 2.18)),
        ((1.36, .83), (1.42, .72), (1.39, .64), (1.48, .53), (1.46, .44), (1.49, .35)),
        ((2.98, 2.76), (3.06, 2.58), (3.18, 2.48), (3.14, 2.38), (3.23, 2.29)),
        ((3.17, 2.49), (3.25, 2.45), (3.30, 2.40), (3.38, 2.38)),
        ((4.57, 1.52), (4.47, 1.43), (4.43, 1.31), (4.29, 1.23), (4.19, 1.13)),
        ((5.86, .59), (5.87, .48), (5.94, .40), (5.96, .25)),
        ((6.19, 2.48), (6.22, 2.38), (6.36, 2.26), (6.39, 2.14), (6.52, 1.98), (6.61, 1.74)),
        ((6.39, 2.14), (6.46, 2.17), (6.53, 2.11), (6.59, 2.11)),
    ):
        for (a, b), (c, d) in zip(path, path[1:]):
            dx, dy = c - a, d - b
            t = np.clip(((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy), 0., 1.)
            distance = np.hypot(x - (a + t * dx), y - (b + t * dy))
            hair = np.maximum(hair, (1. - smooth(.002, .015, distance)) * .85)
    tint -= hair[..., None] * (.101, .095, .085)
    return np.clip(tint * 255. + .5, 0., 255.).astype(np.uint8)


def plaster_material(mesh, root):
    """Use the CC0 scan normal and roughness with a restrained albedo study."""
    import bpy

    source = root / 'web/public/materials/scans/white_plaster_rough_01/diffuse.jpg'
    source_hash = sha256(source.read_bytes()).hexdigest()
    recipe = sha256(Path(__file__).read_bytes() + source_hash.encode()).hexdigest()
    directory = root / 'art/build/authored-materials' / ('winter-hall-plaster-' + recipe[:12])
    directory.mkdir(parents=True, exist_ok=True)
    material = mesh.material('Worn hall limewash over grey plaster', '#fffdf8', 'white_plaster_rough_01', .96)
    nodes = material.node_tree.nodes
    scan_texture = next(node for node in nodes if node.label == 'white_plaster_rough_01 Base Color')
    for node in nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = .45
    old = scan_texture.image
    width, height = old.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    old.pixels.foreach_get(pixels)
    atlas = plaster_colour(pixels.reshape(height, width, 4))
    encoded = _png(atlas[::-1])
    path = directory / 'winter-hall-limewash.png'
    if path.exists() and path.read_bytes() != encoded:
        raise RuntimeError('Immutable hall plaster recipe collision')
    if not path.exists():
        path.write_bytes(encoded)
    scan_texture.image = bpy.data.images.load(str(path), check_existing=True)
    scan_texture.image.colorspace_settings.name = 'sRGB'
    scan_texture.label = 'CC0 plaster grain with authored hall limewash wear'
    material['one_light_hall_plaster_provenance'] = json.dumps({
        'source': str(source.relative_to(root)), 'sourceSha256': source_hash,
        'albedoSha256': sha256(encoded).hexdigest(), 'recipeSha256': recipe,
        'licence': 'CC0-1.0 (Poly Haven, white_plaster_rough_01)',
    })
    return material


def interior_plaster(obj, material, axis, sign, floor, wall_height, reverse=False):
    """Finish only the inward face of the existing, still-bevelled masonry."""
    horizontal = 1 - axis
    face = max(obj.data.polygons, key=lambda poly: poly.normal[axis] * sign)
    vertices = [obj.data.vertices[index].co for index in face.vertices]
    left, right = min(v[horizontal] for v in vertices), max(v[horizontal] for v in vertices)
    uv = obj.data.uv_layers['UVMap'].data
    obj.data.materials.append(material)
    face.material_index = len(obj.data.materials) - 1
    for loop, vertex in zip(face.loop_indices, vertices):
        u = (vertex[horizontal] - left) / (right - left)
        v = (vertex.z + obj.location.z - floor) / wall_height
        uv[loop].uv = (.02 + .96 * (1. - u if reverse else u), .01 + .98 * min(1., max(0., v)))


def slate_shape(x, z, width, depth, height, i, j):
    rng = random.Random(41233 + i * 1391 + j * 3617)
    left, right = -width / 2, width / 2
    back, front = -depth / 2, depth / 2
    chips = [rng.uniform(.006, .021) for _ in range(4)]
    outline = [
        (left + chips[0], back), (right - chips[1], back),
        (right, back + chips[1]), (right, front - chips[2]),
        (right - chips[2], front), (left + chips[3], front),
        (left, front - chips[3]), (left, back + chips[0]),
    ]
    lip = rng.uniform(.002, .004)
    tilt_x, tilt_z = (rng.uniform(-.0028, .0028) for _ in range(2))
    vertices = []
    for y, inset in ((height, lip), (height - .016, 0.)):
        for a, b in outline:
            dx = a * (1. - 2. * inset / width)
            dz = b * (1. - 2. * inset / depth)
            lift = dx * tilt_x / width + dz * tilt_z / depth
            vertices.append((x + dx, y + lift, z + dz))
    length = len(outline)
    faces = [tuple(reversed(range(length)))]
    for k in range(length):
        after = (k + 1) % length
        faces.append((k, after, after + length, k + length))
    corner = rng.randrange(len(SLATE_FACES))
    u0, u1, v0, v1 = SLATE_FACES[corner]
    uvs = []
    for vx, _, vz in vertices:
        s, t = (vx - x) / width + .5, (vz - z) / depth + .5
        if (i + 2 * j) % 2:
            s, t = 1. - s, 1. - t
        uvs.append((u0 + (u1 - u0) * s, 1. - (v0 + (v1 - v0) * t)))
    softness = .87 + .15 * rng.random()
    wear = .04 * math.exp(-((x - .28) / 1.16) ** 2)
    return vertices, faces, uvs, softness + wear


def add_slate(mesh, x, z, width, depth, height, i, j, material):
    points, faces, texture, gain = slate_shape(x, z, width, depth, height, i, j)
    paver = mesh.mesh_object('Bedded hall slate with a worn split edge', points, faces, material)
    uv = paver.data.uv_layers['UVMap'].data
    tint = paver.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
    paver.data.color_attributes.active_color = tint
    base = material['one_light_vertex_base_tint']
    for face in paver.data.polygons:
        for loop, index in zip(face.loop_indices, face.vertices):
            uv[loop].uv = texture[index]
            fade = gain * (1. if index < 8 else .91)
            tint.data[loop].color = (*(channel * fade for channel in base), 1.)
    mesh.source_uv(paver, [[(points[index][0] - x, points[index][2] - z) for index in face]
                           for face in faces], 'Metric chart over the flat slate and shallow cut edge.')
