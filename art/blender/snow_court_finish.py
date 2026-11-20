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


PLASTER_ATLAS_SIZE = 768
PLASTER_GUTTER = 6
PLASTER_CELLS = {
    'west_wall': (0, 0, 768, 222),
    'east_wall': (0, 222, 768, 222),
    'rear_wall': (0, 444, 768, 238),
    'west_sill': (0, 682, 384, 86),
    'east_sill': (384, 682, 384, 86),
}

# Leaks start at seams and behind the lattice, with a height, run and width
# in metres. Flaked patches are individual profiles with a horizontal fraction
# and a height in metres. Most touch the wet contact zone at the floor.
PLASTER_LEAKS = {
    'west_wall': ((.114, 2.75, 1.42, .105), (.682, 2.51, .73, .065), (.936, 2.76, 1.98, .104)),
    'east_wall': ((.084, 2.76, 1.22, .078), (.427, 2.77, 1.86, .109), (.805, 2.78, 1.04, .060)),
    'rear_wall': ((.156, 2.78, 1.26, .087), (.536, 2.78, .59, .068), (.859, 2.72, 1.68, .097)),
    'west_sill': ((.195, .61, .47, .062), (.727, .65, .34, .051)),
    'east_sill': ((.337, .66, .43, .064), (.846, .61, .51, .078)),
}
PLASTER_FLAKES = {
    'west_wall': (
        ((.06, -.03), (.082, .075), (.101, .102), (.131, .079), (.149, .117), (.176, .056), (.197, -.03)),
        ((.677, .075), (.686, .192), (.701, .222), (.705, .178), (.726, .144), (.752, .131),
         (.733, .092), (.715, .139), (.699, .080)),
    ),
    'east_wall': (
        ((.302, -.03), (.316, .097), (.327, .139), (.336, .111), (.348, .224), (.368, .197),
         (.381, .069), (.396, .062), (.413, -.03)),
        ((.744, .082), (.760, .163), (.771, .208), (.780, .194), (.795, .263), (.807, .157),
         (.804, .116), (.827, .107), (.794, .059), (.777, .096), (.766, .044)),
    ),
    'rear_wall': (
        ((.207, -.02), (.224, .052), (.257, .074), (.287, .068), (.309, .119), (.338, .071), (.352, -.02)),
        ((.867, .023), (.884, .125), (.890, .297), (.903, .283), (.906, .168),
         (.924, .163), (.943, .066), (.924, .091), (.901, .048), (.899, -.04)),
    ),
    'west_sill': (
        ((.052, -.025), (.075, .075), (.106, .125), (.136, .109), (.151, .149), (.170, .064),
         (.232, .047), (.216, -.025)),
        ((.641, .395), (.668, .423), (.714, .429), (.708, .386), (.686, .381), (.665, .360)),
    ),
    'east_sill': (
        ((.426, -.025), (.438, .045), (.462, .077), (.490, .065), (.512, .142), (.534, .108),
         (.553, .061), (.594, .072), (.577, -.025)),
        ((.868, .548), (.895, .576), (.906, .534), (.950, .515), (.928, .487), (.892, .503)),
    ),
}
PLASTER_CRACKS = {
    'west_wall': (((.114, 2.72), (.119, 2.59), (.125, 2.53), (.121, 2.43), (.139, 2.35)),
                  ((.692, .402), (.697, .342), (.694, .281), (.704, .219), (.701, .182))),
    'east_wall': (((.418, 2.78), (.422, 2.61), (.443, 2.49), (.440, 2.41), (.451, 2.33)),
                  ((.805, .383), (.796, .326), (.802, .285), (.793, .256))),
    'rear_wall': (((.851, 2.62), (.867, 2.54), (.866, 2.42), (.879, 2.34), (.886, 2.28)),
                  ((.304, .256), (.312, .230), (.305, .181), (.309, .115))),
    'west_sill': (((.726, .561), (.718, .515), (.715, .460), (.713, .425)),),
    'east_sill': (((.856, .618), (.860, .571), (.871, .553), (.876, .523)),),
}


def plaster_noise(rng, x, y, spacing):
    """Interpolate an independent irregular field at a scale in metres."""
    grid_x, grid_y = x / spacing, y / spacing
    ix, iy = grid_x.astype(int), grid_y.astype(int)
    samples = rng.random((iy.max() + 2, ix.max() + 2), dtype=np.float32)
    fx, fy = smooth(0., 1., grid_x - ix), smooth(0., 1., grid_y - iy)
    low = samples[iy, ix] * (1. - fx) + samples[iy, ix + 1] * fx
    high = samples[iy + 1, ix] * (1. - fx) + samples[iy + 1, ix + 1] * fx
    return low * (1. - fy) + high * fy


def path_distance(x, y, start, end):
    ax, ay = start
    bx, by = end
    dx, dy = bx - ax, by - ay
    t = np.clip(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0., 1.)
    return np.hypot(x - (ax + t * dx), y - (ay + t * dy))


def flake_distance(x, y, points):
    inside = np.zeros_like(x, dtype=bool)
    distance = np.full_like(x, np.inf)
    for start, end in zip(points, points[1:] + points[:1]):
        ax, ay = start
        bx, by = end
        if ay != by:
            cut = ax + (y - ay) * (bx - ax) / (by - ay)
            inside ^= ((ay > y) != (by > y)) & (x < cut)
        distance = np.minimum(distance, path_distance(x, y, start, end))
    return np.where(inside, -distance, distance)


def plaster_panel(scan, panel, pixel_width, pixel_height, width, height, rng):
    """Keep photographed grit under gravity streaks and loss at wet edges."""
    y, x = np.mgrid[:pixel_height, :pixel_width].astype(np.float32)
    x /= pixel_width - 1
    y /= pixel_height - 1
    # Rotate the photographed fine grain's starting sample between panels.
    # The original albedo's coarse stains are removed before new weathering.
    pad = 12
    iy = np.rint(y[:, 0] * (scan.shape[0] - 1)).astype(int)
    ix = np.rint(x[0] * (scan.shape[1] - 1)).astype(int)
    sample = scan[(iy + rng.integers(scan.shape[0]))[:, None] % scan.shape[0],
                  (ix + rng.integers(scan.shape[1])) % scan.shape[1], :3]
    grain = sample @ np.array((.25, .59, .16), dtype=np.float32)
    blurred = grain.copy()
    for axis in range(2):
        padded = np.pad(np.moveaxis(blurred, axis, 0), ((pad, pad), (0, 0)), mode='wrap')
        sums = np.cumsum(np.pad(padded, ((1, 0), (0, 0))), axis=0)
        window = 2 * pad + 1
        blurred = np.moveaxis((sums[window:] - sums[:-window]) / window, 0, axis)
    grit = np.clip((grain - blurred) * .68, -.074, .076)
    x *= width
    y *= height
    slow = plaster_noise(rng, x, y, .63)
    mid = plaster_noise(rng, x, y, .162)
    fine = plaster_noise(rng, x, y, .037)

    # Moisture wicks unevenly out of the floor joint, gathering higher beside
    # wetter stone. Its salt residue breaks up into small discontinuous runs.
    waterline = .105 + .235 * slow[0] ** 1.8 + .074 * mid[0]
    foot = (1. - smooth(.018, waterline + .070, y)) * (.81 + .19 * mid)
    wet_age = (1. - smooth(waterline - .060, waterline + .021, y)) * smooth(.34, .83, slow)
    salt = np.exp(-((y - waterline - .013 * (fine - .5)) / .024) ** 2) * smooth(.34, .82, mid)
    field = np.array((.717, .688, .641)) + (grit + .024 * (slow - .5))[..., None]
    field -= foot[..., None] * (.116, .105, .090)
    field -= wet_age[..., None] * (.044, .043, .038)
    field += salt[..., None] * (.027, .026, .024)

    # Broad wash around a narrow broken path, rather than isolated spots.
    # Thin strands lose contrast and spread as they move away from the seam.
    for anchor, top, length, spread in PLASTER_LEAKS[panel]:
        drop = min(top, height) - y
        path = anchor * width + rng.uniform(-.09, .09) * drop + .044 * (slow - .5)
        lateral = abs(x - path - .026 * (mid - .5))
        taper = (1. - smooth(length * .49, length, drop)) * smooth(-.012, .054, drop)
        halo = np.exp(-(lateral / (spread * (1. + .26 * np.maximum(drop, 0.)))) ** 2)
        streak = np.exp(-(lateral / (spread * .30)) ** 2) * smooth(.18, .80, mid)
        field -= (taper * halo * (.46 + .42 * mid))[..., None] * (.048, .057, .061)
        field -= (taper * streak)[..., None] * (.044, .056, .064)

    jagged = .032 * (mid - .5) + .023 * (fine - .5)
    flakes = np.zeros_like(x)
    torn_edges = np.zeros_like(x)
    for point_list in PLASTER_FLAKES[panel]:
        points = tuple((u * width, h) for u, h in point_list)
        distance = flake_distance(x, y, points) + jagged
        flakes = np.maximum(flakes, 1. - smooth(-.014, .009, distance))
        rim = np.exp(-((distance - .010) / .012) ** 2) * smooth(.23, .84, fine)
        torn_edges = np.maximum(torn_edges, rim)
    undercoat = np.array((.602, .575, .530)) + (1.20 * grit + .022 * (mid - .5) - .042 * foot)[..., None]
    field += (undercoat - field) * flakes[..., None]
    field += torn_edges[..., None] * (.041, .040, .037)

    hair = np.zeros_like(x)
    for point_list in PLASTER_CRACKS[panel]:
        points = tuple((u * width, h) for u, h in point_list)
        for start, end in zip(points, points[1:]):
            distance = path_distance(x, y, start, end)
            hair = np.maximum(hair, (1. - smooth(.002, .013, distance)) * (.71 + .29 * fine))
    field -= hair[..., None] * (.083, .079, .074)
    return np.clip(field * 255. + .5, 0., 255.).astype(np.uint8)


def plaster_colour(scan, hall):
    """Pack each visible plaster plane once in a single material atlas."""
    width, depth = hall['east'] - hall['west'], hall['front'] - hall['rear']
    height = hall['eave'] - hall['floor']
    atlas = np.empty((PLASTER_ATLAS_SIZE, PLASTER_ATLAS_SIZE, 3), dtype=np.uint8)
    pad = PLASTER_GUTTER
    for index, (panel, (x, y, w, h)) in enumerate(PLASTER_CELLS.items()):
        metres = (2.72, .66) if panel.endswith('_sill') else (width if panel == 'rear_wall' else depth, height)
        rng = np.random.default_rng(73213 + index * 1387)
        pixels = plaster_panel(scan, panel, w - 2 * pad, h - 2 * pad, *metres, rng)
        atlas[y:y + h, x:x + w] = np.pad(pixels, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    return atlas


def plaster_material(mesh, root, hall):
    """Use the CC0 scan normal and roughness with the unique albedo panels."""
    import bpy

    source = root / 'web/public/materials/scans/white_plaster_rough_01/diffuse.jpg'
    source_hash = sha256(source.read_bytes()).hexdigest()
    hall_dimensions = json.dumps(hall, sort_keys=True).encode()
    recipe = sha256(Path(__file__).read_bytes() + source_hash.encode() + hall_dimensions).hexdigest()
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
    atlas = plaster_colour(pixels.reshape(height, width, 4), hall)
    encoded = _png(atlas[::-1])
    path = directory / 'winter-hall-limewash.png'
    if path.exists() and path.read_bytes() != encoded:
        raise RuntimeError('Immutable hall plaster recipe collision')
    if not path.exists():
        path.write_bytes(encoded)
    scan_texture.image = bpy.data.images.load(str(path), check_existing=True)
    scan_texture.image.colorspace_settings.name = 'sRGB'
    scan_texture.label = 'CC0 plaster grain under five distinct authored hall surfaces'
    material['one_light_hall_plaster_provenance'] = json.dumps({
        'source': str(source.relative_to(root)), 'sourceSha256': source_hash,
        'albedoSha256': sha256(encoded).hexdigest(), 'recipeSha256': recipe,
        'licence': 'CC0-1.0 (Poly Haven, white_plaster_rough_01)',
        'atlasSize': PLASTER_ATLAS_SIZE, 'paddedCellsBottomLeft': PLASTER_CELLS,
    })
    return material


def interior_plaster(obj, material, axis, sign, panel):
    """Assign the inward face its atlas panel and leave its light chart intact."""
    horizontal = 1 - axis
    face = max(obj.data.polygons, key=lambda poly: poly.normal[axis] * sign)
    vertices = [obj.data.vertices[index].co for index in face.vertices]
    left, right = min(v[horizontal] for v in vertices), max(v[horizontal] for v in vertices)
    bottom, top = min(v.z for v in vertices), max(v.z for v in vertices)
    x, y, width, height = PLASTER_CELLS[panel]
    pad = PLASTER_GUTTER
    uv = obj.data.uv_layers['UVMap'].data
    obj.data.materials.append(material)
    face.material_index = len(obj.data.materials) - 1
    for loop, vertex in zip(face.loop_indices, vertices):
        u = (vertex[horizontal] - left) / (right - left)
        v = (vertex.z - bottom) / (top - bottom)
        uv[loop].uv = ((x + pad + .5 + u * (width - 2 * pad - 1)) / PLASTER_ATLAS_SIZE,
                       (y + pad + .5 + v * (height - 2 * pad - 1)) / PLASTER_ATLAS_SIZE)


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
    rim_size = len(faces[0])
    crown = [(2. * (points[index][0] - x), 2. * (points[index][2] - z)) for index in faces[0]]
    # Reserve a separate gutter where the shadowed skirt meets the worn top.
    # The extra UV height gives the shallow edge whole texels at the hall atlas density.
    skirt_depth = 12. * math.dist(points[0], points[rim_size])
    skirt = []
    run = 0.
    for k in range(rim_size):
        next_run = run + math.dist(points[k], points[(k + 1) % rim_size])
        skirt.append([(run, 1.), (next_run, 1.), (next_run, 1. + skirt_depth), (run, 1. + skirt_depth)])
        run = next_run
    mesh.source_uv(paver, [crown, *skirt], 'Dense slate crown and separately unrolled cut edges with their own gutter.')
