"""Place the credited CC0 earth-touching figure and its stone seat."""

from hashlib import sha256
import math
from pathlib import Path

import numpy as np

from snow_bronze_maps import _png

SCAN_SOURCE = Path(__file__).resolve().parents[2] / 'art/assets/snow-court/seated-earth-touching.npz'
SCAN_MODEL = '1723172'
SCAN_CREATOR = 'Arkam'
SCAN_LICENSE = 'CC0-1.0'
SCAN_RECORD = 'https://www.printables.com/model/1723172-buddha-statue-high-detail/files'
STONE_ROUGHNESS = .84
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
# Centre lines on the original closed lids, measured by casting onto the
# fitted figure from its front. Coordinates are in the figure's local metres.
EYELID_CUTS = (
    ((-.189, 1.3716, .0300), (-.160, 1.3719, .0450), (-.145, 1.3729, .0498),
     (-.129, 1.3716, .0537), (-.109, 1.3699, .0561)),
    ((-.027, 1.3624, .0559), (-.012, 1.3688, .0552), (.003, 1.3726, .0532),
     (.018, 1.3744, .0502), (.038, 1.3741, .0436), (.053, 1.3724, .0360)),
)


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


def figure_scan_patch(bpy, path):
    """Take the same intact paver face from all three photographed maps."""
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        image.colorspace_settings.name = 'Non-Color'
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        xs = np.linspace(.214 * width, .366 * width, 128).round().astype(int)
        ys = np.linspace(.807 * height, .962 * height, 128).round().astype(int)
        return pixels.reshape(height, width, 4)[ys[:, None], xs, :3].copy()
    finally:
        bpy.data.images.remove(image)


def reflected_tile(patch, normal=False):
    """Mirror the source crop with tangent direction reflected at each join."""
    horizontal = patch[:, ::-1].copy()
    if normal:
        horizontal[:, :, 0] = 1. - horizontal[:, :, 0]
    top = np.concatenate((patch, horizontal), axis=1)
    bottom = top[::-1].copy()
    if normal:
        bottom[:, :, 1] = 1. - bottom[:, :, 1]
    return np.concatenate((top, bottom), axis=0)


def figure_surface(mesh):
    """Give the existing carved figure fine, neutral photographed stone."""
    import bpy

    source = mesh.MATERIALS / 'stone_pavers'
    inputs = tuple(source / f'{channel}.jpg' for channel in ('diffuse', 'normal', 'roughness'))
    recipe = sha256(Path(__file__).read_bytes() + b''.join(sha256(path.read_bytes()).digest() for path in inputs))
    directory = mesh.ROOT / 'art/build/authored-materials' / ('buddha-fine-stone-' + recipe.hexdigest()[:12])
    directory.mkdir(parents=True, exist_ok=True)

    diffuse, normal, roughness = (figure_scan_patch(bpy, path) for path in inputs)
    luma = reflected_tile(diffuse @ np.array([.2126, .7152, .0722]))
    low = luma
    for axis in range(2):
        low = sum(weight * np.roll(low, shift, axis=axis)
                  for shift, weight in ((-6, .0625), (-3, .25), (0, .375), (3, .25), (6, .0625)))
    grain = np.clip((luma - low) * 1.20, -.048, .048)
    texture = np.asarray([.556, .531, .506]) + grain[:, :, None]

    scanned_normal = reflected_tile(normal, normal=True)
    rough = reflected_tile(roughness[:, :, 0])
    rough = np.repeat((.79 + .13 * rough)[:, :, None], 3, axis=2)
    material = mesh.material('Matte weathered stone of the seated Buddha', '#ffffff', 'stone_pavers', STONE_ROUGHNESS)
    maps = {'diffuse.jpg': texture, 'normal.jpg': scanned_normal, 'roughness.jpg': rough}
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            source_name = Path(node.image.filepath).name
            if source_name not in maps:
                continue
            result = directory / Path(source_name).with_suffix('.png')
            data = _png(np.round(np.clip(maps[source_name][::-1], 0., 1.) * 255.).astype(np.uint8))
            if result.exists() and result.read_bytes() != data:
                raise RuntimeError(f'Immutable Buddha stone map recipe collision: {result}')
            if not result.exists():
                result.write_bytes(data)
            node.image = bpy.data.images.load(str(result), check_existing=True)
            if source_name != 'diffuse.jpg':
                node.image.colorspace_settings.name = 'Non-Color'
        elif node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = .23
    mesh.vertex_tint_shader(material)
    mesh.stable_roughness(material, .78, preserve_maps=True)
    return material


def figure_stone_uv(local):
    """Project a continuous stone grain at a 270 mm repeat."""
    yaw, pitch = math.radians(-8.), math.radians(3.)
    right = (math.cos(yaw), 0., -math.sin(yaw))
    up = (math.sin(yaw) * math.sin(pitch), math.cos(pitch), math.cos(yaw) * math.sin(pitch))
    # Keep the front projection and the lightmap coordinates independent.
    return ((local @ np.asarray([right, up]).T) / .27 + [.5, .18]).astype(np.float32)


def figure_eyelid_weight(local):
    """Feather the cut around each existing eyelid crease."""
    x, y, z = local.T
    weight = np.zeros(len(local))

    def smooth(value):
        t = np.clip(value, 0., 1.)
        return t * t * (3. - 2. * t)

    for cut in EYELID_CUTS:
        line_x, line_y, line_z = np.asarray(cut).T
        along = smooth((x - line_x[0] + .005) / .015) * smooth((line_x[-1] + .005 - x) / .015)
        dy = abs(y - np.interp(x, line_x, line_y))
        dz = abs(z - np.interp(x, line_x, line_z))
        across = np.exp(-.5 * (dy / .008) ** 2) * (1. - smooth((dy - .016) / .008))
        weight += along * across * (1. - smooth((dz - .008) / .012))
    return weight


def figure_stone_colours(vertices, faces):
    """Keep dust in the cuts, with rubbed ridges and a trace of lamp soot."""
    a, b, c = vertices[faces].transpose(1, 0, 2)
    face_normals = np.cross(b - a, c - a)
    vertex_normals = np.zeros_like(vertices)
    for corners in faces.T:
        np.add.at(vertex_normals, corners, face_normals)
    vertex_normals /= np.maximum(np.linalg.norm(vertex_normals, axis=1, keepdims=True), 1e-9)
    starts = faces.ravel()
    ends = np.roll(faces, -1, axis=1).ravel()
    offsets = vertices[ends] - vertices[starts]
    displacement = np.zeros_like(vertices)
    reach = np.zeros(len(vertices))
    np.add.at(displacement, starts, offsets)
    np.add.at(displacement, ends, -offsets)
    lengths = np.linalg.norm(offsets, axis=1)
    np.add.at(reach, starts, lengths)
    np.add.at(reach, ends, lengths)
    relief = (displacement * vertex_normals).sum(axis=1) / np.maximum(reach, 1e-9)
    dust = np.clip((relief - .012) / .112, 0., 1.)
    polish = np.clip((-relief - .027) / .15, 0., 1.)
    x, y, _ = vertices.T
    # The oil cup stands on the right of the altar. A faint stain trails
    # up across the front of the chest towards the underside of the chin.
    chest = np.exp(-((x - .29) / .20) ** 2 - ((y - .96) / .20) ** 2)
    chin = np.exp(-((x - .02) / .125) ** 2 - ((y - 1.16) / .075) ** 2)
    front = np.clip((vertex_normals[:, 2] + .24) / .72, 0., 1.)
    soot = (.060 * chest + .038 * chin) * front
    tone = .96 - .16 * dust + .04 * polish - soot
    return np.repeat(tone[:, None], 3, axis=1)


def build(mesh, anchor, material):
    """Place the reduced figure with separate photographed stone and light UVs."""
    with np.load(SCAN_SOURCE, allow_pickle=False) as data:
        local = data['vertices']
        faces = data['faces']
        charts = data['charts']
        material_uv = figure_stone_uv(local)[faces]
    eyelids = figure_eyelid_weight(local)
    local[:, 2] -= .003 * eyelids
    vertices = local + np.asarray(anchor)
    colours = figure_stone_colours(local, faces)
    colours *= (1. - .045 * eyelids[:, None])

    figure = mesh.mesh_object('Seated weathered stone Buddha', vertices.tolist(), faces.tolist(), material)
    figure.data.uv_layers['UVMap'].data.foreach_set('uv', material_uv.ravel())
    mesh.source_uv(figure, charts.tolist(), 'Nonoverlapping metre-scale charts from the fitted figure proxy.')
    for polygon in figure.data.polygons:
        polygon.use_smooth = True
    figure['source_cc0_asset'] = SCAN_RECORD
    figure['source_scan_model'] = SCAN_MODEL
    figure['source_scan_creator'] = SCAN_CREATOR
    figure['source_scan_license'] = SCAN_LICENSE
    return figure, colours


def apply_stone_colors(carvings):
    """Restore the authored stone colours after the standard tint pass."""
    for stone, colours in carvings:
        layer = stone.data.color_attributes.get('SurfaceTint')
        if layer is None:
            raise RuntimeError('The carved stone requires the exported SurfaceTint layer')
        for loop in stone.data.loops:
            layer.data[loop.index].color = (*colours[loop.vertex_index], 1.)
        stone['surface_tint_export'] = 'Stone colour in linear glTF COLOR_0.'
