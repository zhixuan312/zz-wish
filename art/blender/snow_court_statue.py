"""Place a CC0 scan of an anonymous seated figure on the Snow Roof altar."""

import math
from pathlib import Path

import numpy as np

SCAN_SOURCE = Path(__file__).resolve().parents[2] / 'art/assets/snow-court/seated-stone-scan.npz'
SCAN_MODEL = '720673'
SCAN_CREATOR = 'dohnni'
SCAN_LICENSE = 'CC0-1.0'
SCAN_RECORD = 'https://www.printables.com/model/720673-sitting-buddha-statue'
STONE_ROUGHNESS = .94
SEAT_ROUGHNESS = .81
SEAT_HEIGHT = .124
ASSEMBLED_HEIGHT = 1.871
SEAT_CENTRE = (-.060, -.035)
SEAT_RADII = (.620, .370)
SEAT_EXPONENT = 3.
SEAT_PETALS = 12
SEAT_SLICES = SEAT_PETALS * 6


# Loose tool marks following the existing relief, measured on the fitted scan.
# Coordinates are local engine metres. Positive sections leave raised stone.
FACE_TOOL_PATHS = (
    ('left upper eyelid', ((-.113, 1.468, .023), (-.088, 1.474, .023), (-.064, 1.468, .022), (-.041, 1.451, .022)), .017, .011),
    ('left closed eye', ((-.115, 1.457, .023), (-.085, 1.457, .024), (-.059, 1.453, .023), (-.040, 1.446, .022)), .014, -.008),
    ('right upper eyelid', ((.025, 1.451, -.001), (.047, 1.463, -.004), (.072, 1.465, -.012), (.099, 1.456, -.037)), .017, .011),
    ('right closed eye', ((.024, 1.441, 0.), (.054, 1.444, -.007), (.078, 1.450, -.020), (.099, 1.451, -.038)), .014, -.008),
    ('nose bridge', ((-.019, 1.437, .027), (-.026, 1.407, .032), (-.036, 1.376, .033)), .021, .010),
    ('left wing of nose', ((-.061, 1.385, .019), (-.054, 1.373, .025), (-.046, 1.371, .031)), .014, .007),
    ('right wing of nose', ((-.021, 1.370, .034), (-.009, 1.373, .033), (-.002, 1.384, .030)), .014, .007),
    ('underside of nose', ((-.061, 1.367, .020), (-.042, 1.359, .027), (-.021, 1.357, .028), (-.007, 1.365, .028)), .012, -.009),
    ('closed mouth', ((-.073, 1.308, .002), (-.051, 1.304, .010), (-.027, 1.304, .011), (-.005, 1.309, .004)), .014, -.010),
    ('lower lip', ((-.067, 1.296, .003), (-.049, 1.290, .004), (-.027, 1.291, .005), (-.009, 1.300, .005)), .016, .007),
)
HAND_TOOL_PATHS = (
    ('bearing hand cleft', ((-.015, .609, .174), (-.032, .586, .190), (-.041, .560, .196), (-.051, .518, .188)), .028, -.015),
    ('rounded lower palm', ((-.154, .522, .200), (-.126, .499, .192), (-.097, .501, .198), (-.069, .531, .206)), .033, .011),
    ('curved nearer thumb', ((-.104, .549, .211), (-.080, .559, .207), (-.069, .576, .201), (-.073, .596, .190)), .024, .009),
    ('curved upper thumb', ((.050, .562, .185), (.025, .567, .187), (.010, .584, .183), (-.003, .607, .171)), .024, .009),
    ('upper palm underside', ((-.030, .523, .184), (.008, .523, .180), (.049, .542, .174), (.070, .569, .170)), .025, -.008),
    ('robe fold beneath the hands', ((-.208, .436, .176), (-.153, .375, .169), (-.098, .352, .175), (-.030, .369, .161), (.058, .433, .142)), .042, -.010),
)


def smoothstep(low, high, value):
    unit = np.clip((value - low) / (high - low), 0., 1.)
    return unit * unit * (3. - 2. * unit)


def tool_section(local, knots, width):
    """A rounded tool path with tapered ends embedded in the original stone."""
    points = np.asarray(knots)
    # Restrict the path in depth too. The raised detail must stop on the front.
    stretch = np.asarray((1., 1., .42))
    local = local * stretch
    points = points * stretch
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    length = lengths.sum()
    start = 0.
    section = np.zeros(len(local))
    for a, b, segment_length in zip(points, points[1:], lengths):
        direction = b - a
        progress = np.clip(((local - a) @ direction) / segment_length ** 2, 0., 1.)
        foot = a + progress[:, None] * direction
        radius2 = np.sum((local - foot) ** 2, axis=1) / width ** 2
        across = np.clip(1. - radius2 / 3.5, 0., 1.)
        along = (start + progress * segment_length) / length
        ends = smoothstep(-.01, .18, along) * (1. - smoothstep(.82, 1.01, along))
        section = np.maximum(section, across ** 2 * ends)
        start += segment_length
    return section


def stippled_stone_finish(local, stone, scar, polish):
    """Conserve the CC0 colour and keep tended wear and pigment very restrained."""
    x, y, z = local.T
    linear = np.where(stone <= .04045, stone / 12.92, ((stone + .055) / 1.055) ** 2.4)
    mineral = 1. + .025 * np.sin(19 * x + 22 * y) * np.cos(17 * z - 31 * y)
    soot = np.exp(-((x - .48) / .27) ** 2 - ((y - .08) / .22) ** 2 - ((z - .27) / .22) ** 2)
    tone = mineral * (1. - .14 * scar + .085 * polish - .16 * soot)
    # Mineral-red traces remain where the lower robe is sheltered from handling.
    pigment = np.exp(-((x + .20) / .085) ** 2 - ((y - .39) / .11) ** 2 - ((z - .18) / .065) ** 2)
    pigment *= .45 + .55 * np.sin(57 * x + 41 * y) ** 2
    return np.clip(linear * (tone[:, None] + pigment[:, None] * [.105, -.048, -.084]), 0., 1.)


def restore_relief(local):
    """Preserve the scan and deepen only its existing shallow front relief."""
    delta = np.zeros(len(local))
    scar = np.zeros(len(local))
    polish = np.zeros(len(local))
    for _name, path, width, depth in (*FACE_TOOL_PATHS, *HAND_TOOL_PATHS):
        section = tool_section(local, path, width)
        delta += depth * section
        if depth < 0.:
            scar = np.maximum(scar, section)
        else:
            polish = np.maximum(polish, section)
    final = local.astype(np.float64, copy=True)
    taper = 1. - smoothstep(.055, .45, final[:, 1])
    final[:, 0] *= 1. - .060 * taper
    final[:, 2] *= 1. - .090 * taper
    final[:, 1] *= (ASSEMBLED_HEIGHT - SEAT_HEIGHT) / local[:, 1].max()
    final[:, 2] += np.clip(delta, -.017, .016)
    return final, scar, polish


def lotus_surface():
    """Worn stone seat with carved petals, one side strip and two planar caps."""
    # Profile rows run from the underside to the figure's continuous bearing.
    # Petal depth is carved back into the stone, within the maximum footprint.
    profile = ((0., .875, 0.), (.011, .910, 0.), (.025, .938, 0.),
               (.044, .959, .030), (.063, 1., .065), (.081, 1., .075),
               (.096, .992, .044), (.108, .947, .007), (.115, .969, 0.),
               (SEAT_HEIGHT, .965, 0.))
    angles = np.arange(SEAT_SLICES) * math.tau / SEAT_SLICES
    cx, cz = SEAT_CENTRE
    base_x = np.sign(np.cos(angles)) * np.abs(np.cos(angles)) ** (2. / SEAT_EXPONENT) * SEAT_RADII[0]
    base_z = np.sign(np.sin(angles)) * np.abs(np.sin(angles)) ** (2. / SEAT_EXPONENT) * SEAT_RADII[1]
    segments = np.diff(np.r_[np.column_stack((base_x, base_z)), [[base_x[0], base_z[0]]]], axis=0)
    u = np.r_[0., np.cumsum(np.linalg.norm(segments, axis=1))]
    vertices, faces, charts, colours = [], [], [], []
    v = 0.
    previous = None
    for row, (y, radius, cut) in enumerate(profile):
        width = 1. - cut * (.5 - .5 * np.cos(SEAT_PETALS * angles + 10. * (y - .07)))
        width *= radius * (1. - (.004 * (.5 + .5 * np.sin(5 * angles + .72))) * (cut > 0.))
        ring = np.column_stack((cx + width * base_x, np.full(SEAT_SLICES, y), cz + width * base_z))
        vertices.extend(ring.tolist())
        soot = np.exp(-((ring[:, 0] - .47) / .23) ** 2 - ((ring[:, 2] - .20) / .20) ** 2)
        faded = (np.sin(7. * angles + y * 26.) ** 2) * cut / .075
        rubbed_rim = .13 if row in (1, 8, 9) else 0.
        grain = .035 * np.sin(29. * angles + y * 163.) + .020 * np.sin(53. * angles - y * 411.)
        luminance = .193 * (width / radius + rubbed_rim + grain - .18 * soot)
        colours.extend((luminance[:, None] * (np.array([.99, 1., .975]) + faded[:, None] * [.07, -.019, -.047])).tolist())
        if previous is not None:
            old_y, old_radius = previous
            high_v = v + math.hypot(y - old_y, (radius - old_radius) * max(SEAT_RADII))
            for i in range(SEAT_SLICES):
                j = (i + 1) % SEAT_SLICES
                a, b = (row - 1) * SEAT_SLICES, row * SEAT_SLICES
                faces.append((a + i, b + i, b + j, a + j))
                charts.append(((u[i], v), (u[i], high_v), (u[i + 1], high_v), (u[i + 1], v)))
            v = high_v
        previous = y, radius
    for top, height, offset in ((False, 0., 0), (True, SEAT_HEIGHT, (len(profile) - 1) * SEAT_SLICES)):
        centre = len(vertices)
        vertices.append((cx, height, cz))
        colours.append([.196, .196, .190])
        cap_u = u[-1] + .10 + max(SEAT_RADII)
        cap_v = 1. + 2. * int(top)
        for i in range(SEAT_SLICES):
            j = (i + 1) % SEAT_SLICES
            ids = (offset + i, centre, offset + j) if top else (centre, offset + i, offset + j)
            faces.append(ids)
            charts.append(tuple((cap_u + vertices[k][0] - cx, cap_v + vertices[k][2] - cz) for k in ids))
    return vertices, faces, charts, np.asarray(colours)


def build_lotus(mesh, anchor, material):
    vertices, faces, charts, colours = lotus_surface()
    seat = mesh.mesh_object('Carved stone lotus seat of the Buddha',
                            (np.asarray(vertices) + np.asarray(anchor)).tolist(), faces, material)
    mesh.source_uv(seat, charts, 'Connected carved perimeter strip and separate planar stone caps.')
    for polygon in seat.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return seat, colours


def build(mesh, anchor, material):
    """Place the fitted scan and its independent lightmap charts in engine metres."""
    with np.load(SCAN_SOURCE, allow_pickle=False) as data:
        local = data['vertices']
        carved, scar, polish = restore_relief(local)
        vertices = carved + np.asarray(anchor)
        faces = data['faces']
        charts = data['charts']
        stone = data['colors'] / 255.

    figure = mesh.mesh_object('Seated weathered stone Buddha', vertices.tolist(), faces.tolist(), material)
    # The stone colour is vertex-bound. Planar UV0 avoids unused atlas seams.
    figure.data.uv_layers['UVMap'].data.foreach_set('uv', local[faces, :2].astype(np.float32).ravel())
    mesh.source_uv(figure, charts.tolist(), 'Nonoverlapping lightmap charts of the fitted scan, derived on a smoothed proxy.')
    for polygon in figure.data.polygons:
        polygon.use_smooth = True
    figure['source_cc0_asset'] = SCAN_RECORD
    figure['source_scan_model'] = SCAN_MODEL
    figure['source_scan_creator'] = SCAN_CREATOR
    figure['source_scan_license'] = SCAN_LICENSE
    return figure, stippled_stone_finish(local, stone, scar, polish)


def apply_stone_colors(carvings):
    """Restore the authored stone colours after the standard tint pass."""
    for stone, colours in carvings:
        layer = stone.data.color_attributes.get('SurfaceTint')
        if layer is None:
            raise RuntimeError('The carved stone requires the exported SurfaceTint layer')
        for loop in stone.data.loops:
            layer.data[loop.index].color = (*colours[loop.vertex_index], 1.)
        stone['surface_tint_export'] = 'Stone colour in linear glTF COLOR_0.'
