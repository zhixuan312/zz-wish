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


PLASTER_ATLAS_SIZE = 1024
PLASTER_GUTTER = 8
PLASTER_SCAN_WIDTH_METRES = 1.
PLASTER_CELLS = {
    'west_wall': (0, 0, 1024, 300),
    'east_wall': (0, 300, 1024, 300),
    'rear_wall': (0, 600, 1024, 320),
    'west_sill': (0, 920, 512, 104),
    'east_sill': (512, 920, 512, 104),
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
PLASTER_REPAIRS = {
    'west_wall': (
        ((.299, .72), (.314, .69), (.343, .72), (.351, .80), (.343, .93),
         (.352, 1.00), (.333, 1.055), (.303, 1.04), (.293, .937)),
    ),
    'east_wall': (
        ((.483, .96), (.497, .917), (.533, .94), (.558, .995), (.547, 1.089),
         (.564, 1.192), (.545, 1.26), (.508, 1.238), (.486, 1.151)),
        ((.861, 1.34), (.882, 1.32), (.913, 1.392), (.902, 1.481), (.884, 1.468), (.864, 1.507)),
    ),
    'rear_wall': (
        ((.076, .91), (.098, .84), (.132, .883), (.157, .922), (.145, 1.052),
         (.120, 1.09), (.107, 1.06), (.089, 1.16), (.079, 1.12)),
    ),
    'west_sill': (),
    'east_sill': (),
}
# Local rub marks follow the height of hands, passing shoulders and the table.
# Horizontal fraction, height in metres, half width and slope.
PLASTER_RUBS = {
    'west_wall': ((.21, 1.34, .34, -.12), (.648, 1.52, .28, .13)),
    'east_wall': ((.394, 1.06, .45, .07), (.721, 1.42, .24, -.18), (.898, 1.11, .37, .24)),
    'rear_wall': ((.216, 1.17, .31, .16), (.781, 1.52, .39, -.11)),
    'west_sill': ((.678, .468, .24, -.09),),
    'east_sill': ((.267, .483, .29, .11),),
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


def scan_at(scan, u, v):
    """Bilinearly sample the measured one-metre scan without rescaling it."""
    h, w = scan.shape[:2]
    u, v = (u % 1.) * w, (v % 1.) * h
    i, j = u.astype(int), v.astype(int)
    s, t = (u - i)[..., None], (v - j)[..., None]
    low = scan[j, i] * (1. - s) + scan[j, (i + 1) % w] * s
    high = scan[(j + 1) % h, i] * (1. - s) + scan[(j + 1) % h, (i + 1) % w] * s
    return low * (1. - t) + high * t


def plaster_scan_patches(scan, x, y, rng):
    """Feather rotated crops of the actual scan at its physical scale."""
    # A short overlap keeps joins continuous. Unequal shift and rotation keep
    # memorable pits or trowel marks from marching along the same row.
    tile, overlap = .79, .093
    colour = np.zeros((*x.shape, 3), dtype=np.float32)
    coverage = np.zeros_like(x)
    for row in range(math.ceil(float(y[-1, 0]) / tile)):
        y0 = row * tile
        rows = np.flatnonzero((y[:, 0] >= y0 - overlap) & (y[:, 0] <= y0 + tile + overlap))
        for col in range(math.ceil(float(x[0, -1]) / tile) + 1):
            x0 = (col - (.5 if row % 2 else 0.)) * tile
            cols = np.flatnonzero((x[0] >= x0 - overlap) & (x[0] <= x0 + tile + overlap))
            if not cols.size:
                continue
            section = np.ix_(rows, cols)
            dx, dy = x[section] - x0, y[section] - y0
            sx = smooth(-overlap, overlap, dx) * (1. - smooth(tile - overlap, tile + overlap, dx))
            sy = smooth(-overlap, overlap, dy) * (1. - smooth(tile - overlap, tile + overlap, dy))
            w = sx * sy
            angle = rng.uniform(0., math.tau)
            ca, sa = math.cos(angle), math.sin(angle)
            offset_u, offset_v = rng.random(2)
            u = (ca * dx + sa * dy) / PLASTER_SCAN_WIDTH_METRES + offset_u
            v = (ca * dy - sa * dx) / PLASTER_SCAN_WIDTH_METRES + offset_v
            colour[section] += scan_at(scan, u, v) * w[..., None]
            coverage[section] += w
    return colour / coverage[..., None]


def blur_scan(scan, pad):
    """Filter the repeating scan without creating a seam at its boundary."""
    blurred = scan.copy()
    window = 2 * pad + 1
    for axis in range(2):
        channel = np.moveaxis(blurred, axis, 0)
        padded = np.pad(channel, ((pad, pad), (0, 0), (0, 0)), mode='wrap')
        sums = np.cumsum(np.pad(padded, ((1, 0), (0, 0), (0, 0))), axis=0)
        blurred = np.moveaxis((sums[window:] - sums[:-window]) / window, 0, axis)
    return blurred


def plaster_panel(scan, panel, pixel_width, pixel_height, width, height, rng):
    """Keep the scanned plaster colour underneath local repairs and wear."""
    y, x = np.mgrid[:pixel_height, :pixel_width].astype(np.float32)
    x *= width / (pixel_width - 1)
    y *= height / (pixel_height - 1)
    scan_rgb = plaster_scan_patches(scan, x, y, rng)
    delta = scan_rgb - np.mean(scan, axis=(0, 1))
    relief = delta @ np.array((.25, .59, .16), dtype=np.float32)
    # Neutralize the outdoor source's green cast while retaining its measured
    # tonal range, pocks and mottling. No synthetic field drives the clean wall.
    colour_variation = 1.15 * (.77 * relief[..., None] + .23 * delta)
    field = np.array((.767, .744, .703)) + colour_variation
    slow = plaster_noise(rng, x, y, .63)
    mid = plaster_noise(rng, x, y, .162)
    fine = plaster_noise(rng, x, y, .037)

    # Moisture wicks unevenly out of the floor joint, gathering higher beside
    # wetter stone. Its salt residue breaks up into small discontinuous runs.
    waterline = .13 + .37 * slow[0] ** 1.8 + .10 * mid[0] + .038 * (fine - .5)
    foot = (1. - smooth(.04, waterline + .085, y)) * (.72 + .28 * mid)
    wet_age = (1. - smooth(waterline - .077, waterline + .026, y)) * (.39 + .61 * slow)
    salt_limit = waterline + .052 + .015 * (fine - .5)
    salt = np.exp(-((y - salt_limit) / .034) ** 2) * smooth(.34, .82, mid)
    field -= foot[..., None] * (.190, .171, .143)
    field -= wet_age[..., None] * (.083, .091, .077)
    field += salt[..., None] * (.041, .041, .035)

    # Broad wash around a narrow broken path, rather than isolated spots.
    # Thin strands lose contrast and spread as they move away from the seam.
    for anchor, top, length, spread in PLASTER_LEAKS[panel]:
        drop = min(top, height) - y
        path = anchor * width + rng.uniform(-.09, .09) * drop + .044 * (slow - .5)
        lateral = abs(x - path - .026 * (mid - .5))
        taper = (1. - smooth(length * .49, length, drop)) * smooth(-.012, .054, drop)
        halo = np.exp(-(lateral / (spread * (1. + .26 * np.maximum(drop, 0.)))) ** 2)
        streak = np.exp(-(lateral / (spread * .30)) ** 2) * smooth(.18, .80, mid)
        field -= (taper * halo * (.46 + .42 * mid))[..., None] * (.024, .029, .031)
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
    undercoat = np.array((.654, .628, .585)) + 1.18 * colour_variation - .070 * foot[..., None]
    field += (undercoat - field) * flakes[..., None]
    field += torn_edges[..., None] * (.041, .040, .037)

    for point_list in PLASTER_REPAIRS[panel]:
        points = tuple((u * width, h) for u, h in point_list)
        edge = flake_distance(x, y, points) + jagged
        patch = (1. - smooth(-.031, .025, edge)) * (.65 + .35 * mid)
        field += patch[..., None] * (.087, .086, .075)

    for anchor, level, span, tilt in PLASTER_RUBS[panel]:
        dx = x - anchor * width
        path = y - level - tilt * dx - .034 * (fine - .5)
        edge = (1. - smooth(span * .36, span, abs(dx))) * smooth(.28, .73, mid)
        grime = edge * np.exp(-(path / .043) ** 2)
        scrape = edge * np.exp(-((path + .021) / .012) ** 2) * smooth(.32, .79, fine)
        field -= grime[..., None] * (.092, .079, .060)
        field += scrape[..., None] * (.066, .064, .061)

    hair = np.zeros_like(x)
    for point_list in PLASTER_CRACKS[panel]:
        points = tuple((u * width, h) for u, h in point_list)
        for start, end in zip(points, points[1:]):
            distance = path_distance(x, y, start, end)
            hair = np.maximum(hair, (1. - smooth(.002, .011, distance)) * (.71 + .29 * fine))
    field -= hair[..., None] * (.176, .157, .132)
    return np.clip(field * 255. + .5, 0., 255.).astype(np.uint8)


def plaster_metres(hall, panel):
    if panel.endswith('_sill'):
        return 2.72, .66
    width = hall['east'] - hall['west'] if panel == 'rear_wall' else hall['front'] - hall['rear']
    return width, hall['eave'] - hall['floor']


def plaster_colour(scan, hall):
    """Pack each visible plaster plane once in a single material atlas."""
    atlas = np.empty((PLASTER_ATLAS_SIZE, PLASTER_ATLAS_SIZE, 3), dtype=np.uint8)
    pad = PLASTER_GUTTER
    # Preserve pocks and grit at roughly one centimetre and smaller. Large
    # stains on the outdoor source are reduced before placing isolated marks.
    scan = blur_scan(scan[..., :3], 2)
    coarse = blur_scan(scan, round(scan.shape[0] * .048 / PLASTER_SCAN_WIDTH_METRES))
    scan -= .49 * (coarse - coarse.mean(axis=(0, 1)))
    for index, (panel, (x, y, w, h)) in enumerate(PLASTER_CELLS.items()):
        metres = plaster_metres(hall, panel)
        rng = np.random.default_rng(73213 + index * 1387)
        pixels = plaster_panel(scan, panel, w - 2 * pad, h - 2 * pad, *metres, rng)
        atlas[y:y + h, x:x + w] = np.pad(pixels, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    return atlas


def plaster_materials(mesh, root, hall):
    """Keep the unique albedo atlas and place the CC0 microsurface at real scale."""
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
        'scanWidthMetres': PLASTER_SCAN_WIDTH_METRES,
        'scanSourceUrl': 'https://polyhaven.com/a/white_plaster_rough_01',
        'atlasSize': PLASTER_ATLAS_SIZE, 'paddedCellsBottomLeft': PLASTER_CELLS,
    })
    panels = {}
    pad = PLASTER_GUTTER
    for panel, (x, y, width, height) in PLASTER_CELLS.items():
        face = material.copy()
        face.name = f'Worn hall limewash, {panel.replace("_", " ")}'
        face_nodes, links = face.node_tree.nodes, face.node_tree.links
        metres_u, metres_v = plaster_metres(hall, panel)
        scale_u = metres_u * PLASTER_ATLAS_SIZE / ((width - 2 * pad - 1) * PLASTER_SCAN_WIDTH_METRES)
        scale_v = metres_v * PLASTER_ATLAS_SIZE / ((height - 2 * pad - 1) * PLASTER_SCAN_WIDTH_METRES)
        left = (x + pad + .5) / PLASTER_ATLAS_SIZE
        bottom = (y + pad + .5) / PLASTER_ATLAS_SIZE
        # UV0 stays in the photographed albedo atlas. Remap just the repeating
        # scan maps from that cell to metres, in Blender and in glTF.
        mapping = face_nodes.new('ShaderNodeMapping')
        mapping.vector_type = 'POINT'
        mapping.inputs['Location'].default_value = (-left * scale_u, -bottom * scale_v, 0.)
        mapping.inputs['Scale'].default_value = (scale_u, scale_v, 1.)
        for scan_slot in ('Normal', 'Roughness'):
            texture = next(node for node in face_nodes if node.label == 'white_plaster_rough_01 ' + scan_slot)
            source_uv = texture.inputs['Vector'].links[0].from_socket
            if not mapping.inputs['Vector'].is_linked:
                links.new(source_uv, mapping.inputs['Vector'])
            links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        panels[panel] = face
    return panels


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
    obj.data.materials.append(material[panel])
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
