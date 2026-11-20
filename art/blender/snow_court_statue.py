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
SEAT_HEIGHT = .184
ASSEMBLED_HEIGHT = 1.871
SEAT_CENTRE = (-.065, -.045)
# Four dressed faces fill the available altar depth. The short clipped corners
# and separate foot, waist and crown are cut into one block of stone.
SEAT_PROFILE = (
    (0., .581, .335), (.010, .603, .355), (.026, .608, .359),
    (.042, .598, .351), (.049, .573, .329), (.064, .563, .315),
    (.078, .537, .287), (.106, .528, .281), (.129, .545, .298),
    (.145, .576, .326), (.153, .601, .350), (.168, .609, .359),
    (SEAT_HEIGHT, .600, .350),
)
SEAT_CORNER_EASE = (.022, .029, .023, .032)
# These UV centres are inside Poly Haven's individual ungrouted stone faces.
# One scale in both axes keeps the photographed stone grain isotropic.
SEAT_SCAN_PATCHES = (
    (.626, .868), (.300, .879), (.292, .874), (.641, .869),
    (.632, .872), (.649, .872), (.639, .865), (.301, .873),
)
SEAT_SCAN_CAP = (.300, .878)
SEAT_SCAN_UV_PER_METRE = .22


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


def seat_ring(x, z):
    """Walk the four chamfered edges counterclockwise in the X/Z plane."""
    near_right, near_left, far_left, far_right = SEAT_CORNER_EASE
    return np.asarray(((x, -z + far_right), (x, z - near_right),
                       (x - near_right, z), (-x + near_left, z),
                       (-x, z - near_left), (-x, -z + far_left),
                       (-x + far_left, -z), (x - far_right, -z)))


def stone_seat_surface():
    """Carve a short Sumeru-style profile as one solid with separate cap charts."""
    cx, cz = SEAT_CENTRE
    widest = seat_ring(max(x for _, x, _ in SEAT_PROFILE), max(z for _, _, z in SEAT_PROFILE))
    edge = np.roll(widest, -1, axis=0) - widest
    length = np.linalg.norm(edge, axis=1)
    perimeter = np.r_[0., np.cumsum(length)]
    scale = SEAT_SCAN_UV_PER_METRE
    count = len(widest)
    panel_normal = np.column_stack((edge[:, 1], -edge[:, 0])) / length[:, None]
    scan_v = np.zeros(count)
    vertices, faces, charts, material_uv, colours = [], [], [], [], []
    v = 0.
    previous = None
    previous_ring = None
    for row, (y, half_x, half_z) in enumerate(SEAT_PROFILE):
        ring = seat_ring(half_x, half_z) + [cx, cz]
        vertices.extend((x, y, z) for x, z in ring)
        soot = np.exp(-((ring[:, 0] - .491) / .22) ** 2 -
                      ((ring[:, 1] - .227) / .21) ** 2 - ((y - .125) / .14) ** 2)
        rubbed = (.03, .11, .13, .04, -.01, -.035, -.04, -.06, -.035, -.012, .025, .08, .09)[row]
        stone = .89 + rubbed - .10 * soot + .017 * np.sin(47 * ring[:, 0] + 73 * ring[:, 1] + 39 * y)
        colours.extend((stone[:, None] * [1., 1.025, 1.045]).clip(0., 1.).tolist())
        if previous is not None:
            dy = y - previous[0]
            radial = np.linalg.norm([half_x - previous[1], half_z - previous[2]])
            high_v = v + math.hypot(dy, radial)
            for i, (panel_u, panel_v) in enumerate(SEAT_SCAN_PATCHES):
                j = (i + 1) % count
                a, b = (row - 1) * count, row * count
                faces.append((a + i, b + i, b + j, a + j))
                u0, u1 = perimeter[i:i + 2]
                charts.append(((u0, v), (u0, high_v), (u1, high_v), (u1, v)))
                old_width = np.linalg.norm(previous_ring[j] - previous_ring[i]) * scale
                new_width = np.linalg.norm(ring[j] - ring[i]) * scale
                shift = np.dot((ring[i] + ring[j] - previous_ring[i] - previous_ring[j]) * .5,
                               panel_normal[i])
                low = panel_v + scan_v[i] * scale
                scan_v[i] += math.hypot(dy, shift)
                high = panel_v + scan_v[i] * scale
                material_uv.append(((panel_u - old_width / 2, low), (panel_u - new_width / 2, high),
                                    (panel_u + new_width / 2, high), (panel_u + old_width / 2, low)))
            v = high_v
        previous = y, half_x, half_z
        previous_ring = ring
    for top, height, offset in ((False, 0., 0), (True, SEAT_HEIGHT, (len(SEAT_PROFILE) - 1) * count)):
        centre = len(vertices)
        vertices.append((cx, height, cz))
        colours.append([.93, .955, .97])
        cap_u = perimeter[-1] + .8
        cap_v = 1. + 2. * int(top)
        for i in range(count):
            j = (i + 1) % count
            ids = (offset + i, centre, offset + j) if top else (centre, offset + i, offset + j)
            faces.append(ids)
            coordinates = [(vertices[k][0] - cx, vertices[k][2] - cz) for k in ids]
            charts.append(tuple((cap_u + x, cap_v + z) for x, z in coordinates))
            material_uv.append(tuple((SEAT_SCAN_CAP[0] + x * scale, SEAT_SCAN_CAP[1] + z * scale)
                                     for x, z in coordinates))
    return vertices, faces, charts, material_uv, np.asarray(colours)


def build_seat(mesh, anchor, material):
    vertices, faces, charts, material_uv, colours = stone_seat_surface()
    seat = mesh.mesh_object('Dressed stone Sumeru seat of the Buddha',
                            (np.asarray(vertices) + np.asarray(anchor)).tolist(), faces, material)
    material_layer = seat.data.uv_layers['UVMap'].data
    material_layer.foreach_set('uv', np.asarray([p for face in material_uv for p in face], dtype=np.float32).ravel())
    mesh.source_uv(seat, charts, 'Continuous stepped stone perimeter strip and two planar bearing charts.')
    seat['source_stone_surface'] = 'https://polyhaven.com/a/stone_pavers'
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
