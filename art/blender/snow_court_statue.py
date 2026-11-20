"""Original stone Buddha for the winter pass hall, in engine metres."""

from bisect import bisect_right
import math


def _profile(keys, level):
    index = min(len(keys) - 2, max(0, bisect_right([key[0] for key in keys], level) - 1))
    low = keys[index]
    high = keys[index + 1]
    fraction = (level - low[0]) / (high[0] - low[0])
    return tuple(a + (b - a) * fraction for a, b in zip(low[1:], high[1:]))


def _ring_levels(keys, spacing):
    levels = [keys[0][0]]
    for start, end in zip(keys, keys[1:]):
        length = end[0] - start[0]
        count = math.ceil(length / spacing)
        levels.extend(start[0] + length * i / count for i in range(1, count))
        levels.append(end[0])
    return levels


def _bell(value, width):
    return math.exp(-((value / width) ** 2))


def _finish_shell(mesh, name, at, rings, material, smooth_caps=False):
    """Closed unrolled shell with independent charts for flat stone caps.

    Rings wind clockwise when seen from above. The seam is behind the statue.
    Chart width and length are the mean edge lengths across adjacent rings.
    """
    steps = len(rings[0])
    vertices = [tuple(a + b for a, b in zip(point, at)) for ring in rings for point in ring]
    faces, charts = [], []
    circumference = [sum(math.dist(ring[i], ring[(i + 1) % steps]) for i in range(steps)) for ring in rings]
    lifts = [0.]
    for lower, upper in zip(rings, rings[1:]):
        lifts.append(lifts[-1] + sum(math.dist(a, b) for a, b in zip(lower, upper)) / steps)
    for row, (low, high) in enumerate(zip(circumference, circumference[1:])):
        for i in range(steps):
            following = (i + 1) % steps
            faces.append((row * steps + i, row * steps + following,
                          (row + 1) * steps + following, (row + 1) * steps + i))
            charts.append(((i * low / steps, lifts[row]), ((i + 1) * low / steps, lifts[row]),
                           ((i + 1) * high / steps, lifts[row + 1]), (i * high / steps, lifts[row + 1])))
    # A triangle fan avoids a nonplanar n-gon on curved cap rims.
    width = max(circumference)
    for ring_index, reverse in ((0, False), (len(rings) - 1, True)):
        points = rings[ring_index]
        centre = tuple(sum(point[axis] for point in points) / steps for axis in range(3))
        centre_index = len(vertices)
        vertices.append(tuple(a + b for a, b in zip(centre, at)))
        a = tuple(value - centre[axis] for axis, value in enumerate(points[0]))
        b = tuple(value - centre[axis] for axis, value in enumerate(points[steps // 4]))
        normal = _cross(a, b)
        normal_axis = max(range(3), key=lambda axis: abs(normal[axis]))
        first_axis, second_axis = [axis for axis in range(3) if axis != normal_axis]
        offset_u = width + max(abs(point[first_axis] - centre[first_axis]) for point in points) + .08
        offset_v = .08 if not reverse else 2.0
        for i in range(steps):
            j = (i + 1) % steps
            ids = (j, i) if not reverse else (i, j)
            faces.append((centre_index, *(ring_index * steps + k for k in ids)))
            charts.append(tuple((offset_u + point[first_axis] - centre[first_axis],
                                 offset_v + point[second_axis] - centre[second_axis])
                                for point in (centre, *(points[k] for k in ids))))
    obj = mesh.mesh_object(name, vertices, faces, material)
    mesh.source_uv(obj, charts, 'Measured horizontal rings with a rear seam and independent caps.')
    side_count = (len(rings) - 1) * steps
    for index, face in enumerate(obj.data.polygons):
        face.use_smooth = index < side_count or smooth_caps
    return obj


def _rings(keys, spacing, steps, shape):
    rings = []
    for level in _ring_levels(keys, spacing):
        dimensions = _profile(keys, level)
        rings.append([shape(level, -math.pi + math.tau * index / steps, *dimensions)
                      for index in range(steps)])
    return rings


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(a):
    length = math.hypot(*a)
    return tuple(value / length for value in a)


def _sleeve(side):
    # A buried shoulder cap, a drooping elbow and a broad cuff define where
    # the weight of the layered stone robe pulls away from the body.
    control = [(side * x, height, depth, width, thickness) for x, height, depth, width, thickness in (
        (.246, 1.397, -.018, .054, .055), (.328, 1.384, -.008, .100, .089),
        (.379, 1.324, .007, .120, .107), (.415, 1.211, .026, .125, .112),
        (.449, 1.060, .065, .118, .107), (.478, .925, .121, .109, .101),
        (.459, .817, .177, .109, .106), (.385, .760, .235, .097, .091),
        (.285, .735, .281, .079, .075), (.173, .728, .319, .055, .050),
        (.148, .732, .322, .047, .045),
    )]
    samples = []
    for index in range(len(control) - 1):
        a, b, c, d = [control[min(len(control) - 1, max(0, index + delta))] for delta in (-1, 0, 1, 2)]
        for t in (0., 1 / 3, 2 / 3):
            samples.append(tuple(.5 * (2 * q + (r - p) * t + (2 * p - 5 * q + 4 * r - s) * t ** 2
                                        + (3 * q - p - 3 * r + s) * t ** 3)
                                 for p, q, r, s in zip(a, b, c, d)))
    samples.append(control[-1])
    rings = []
    radial = 20
    for index, (*point, width, thickness) in enumerate(samples):
        before = samples[max(0, index - 1)][:3]
        after = samples[min(len(samples) - 1, index + 1)][:3]
        tangent = _unit(tuple(b - a for a, b in zip(before, after)))
        first = _unit(_cross(tangent, (0., 0., 1.)))
        second = _cross(tangent, first)
        level = index / (len(samples) - 1)
        ring = []
        for step in range(radial):
            angle = math.tau * step / radial
            crease = .014 * _bell(level - .64 - .05 * math.cos(angle), .044)
            crease += .009 * _bell(level - .77 - .04 * math.cos(angle + .8), .035)
            a = (width + crease) * math.cos(angle)
            b = (thickness + crease) * math.sin(angle)
            ring.append(tuple(p + a * u + b * v for p, u, v in zip(point, first, second)))
        rings.append(ring)
    return rings


def _petal(angle):
    theta = 12 * angle + .094 * math.sin(2 * angle) + .044 * math.sin(5 * angle)
    return ((1 + math.cos(theta)) / 2) ** 2


def _pedestal(height, angle, width, depth, belly):
    leaf = .016 * belly * _petal(angle)
    radial = 1 + .0039 * math.sin(7 * angle + height * 31) + .0024 * math.sin(13 * angle - height * 53)
    return ((width * radial + leaf) * math.sin(angle), height,
            (depth * radial + leaf * .64) * math.cos(angle))


BASE = (
    (0, .586, .334, 0),
    (.014, .604, .344, 0),
    (.039, .618, .351, 0),
    (.066, .617, .350, 0),
    (.088, .604, .342, 0),
    (.108, .577, .334, 0),
    (.127, .600, .347, .25),
    (.151, .643, .369, .88),
    (.179, .661, .375, 1),
    (.201, .667, .378, .55),
    (.221, .653, .371, 0),
    (.240, .628, .354, 0),
)


BODY = (
    (.222, .550, .309, -.022),
    (.253, .618, .337, -.018),
    (.293, .676, .358, -.015),
    (.336, .713, .363, -.013),
    (.407, .731, .355, -.015),
    (.482, .683, .330, -.017),
    (.548, .587, .302, -.036),
    (.608, .434, .256, -.033),
    (.685, .351, .218, -.040),
    (.782, .314, .202, -.034),
    (.906, .301, .204, -.034),
    (1.049, .322, .217, -.042),
    (1.189, .368, .215, -.044),
    (1.323, .408, .194, -.049),
    (1.410, .393, .169, -.044),
    (1.469, .351, .148, -.035),
    (1.517, .260, .121, -.027),
    (1.553, .149, .090, -.014),
    (1.593, .100, .077, -.002),
    (1.655, .093, .075, -.001),
)


# Each line gives the centre height, fall, swing, lateral centre, extent,
# amplitude and width for one shoulder overlap, belly sweep or lap fold.
ROBE_FOLDS = (
    (1.272, .58, -.34, .080, .34, .034, .037),
    (1.158, .65, -.08, -.050, .37, .027, .030),
    (1.038, .56, .19, -.094, .27, .020, .030),
    (.932, .40, .47, -.062, .28, .025, .030),
    (.847, .25, .46, -.047, .28, .018, .029),
    (.514, -.13, .42, -.275, .36, .034, .035),
    (.466, .11, -.20, .203, .46, .031, .033),
    (.407, -.08, -.28, .160, .54, .038, .038),
    (.340, .15, .23, -.110, .53, .030, .035),
)


def _fold_lobes(height, x):
    for level, fall, swing, shift, length, relief, thickness in ROBE_FOLDS:
        line = level + fall * x + swing * x * x
        yield (relief, _bell(x - shift, length), _bell(height - line, thickness),
               _bell(height - line - thickness, thickness * .80))


def _robe(height, angle, width, depth, centre):
    sine, cosine = math.sin(angle), math.cos(angle)
    x = width * sine
    front = max(cosine, 0)
    z = centre + depth * cosine
    # Shaped knees swell beneath the folded cloth and the two shoulders
    # do not share the silhouette of a turned vessel.
    knees = .124 * _bell(height - .441, .084) * _bell(x + .507, .207)
    knees += .119 * _bell(height - .417, .080) * _bell(x - .521, .222)
    crossed = .118 * _bell(height - .365 - .112 * x, .068) * _bell(x + .09, .542)
    chest = .035 * _bell(height - 1.234, .123) * _bell(abs(x) - .102, .145)
    folds = 0.
    for relief, run, crest, hollow in _fold_lobes(height, x):
        folds += relief * run * (crest - .42 * hollow)
    lint = .0015 * math.sin(7 * angle + height * 21) * math.sin(height * 17)
    return (x, height, z + (knees + crossed + chest + folds) * front ** .7 + lint)


HEAD = (
    (1.577, .032, .055, .048),
    (1.604, .061, .073, .045),
    (1.629, .088, .089, .041),
    (1.676, .114, .101, .034),
    (1.729, .133, .112, .026),
    (1.783, .143, .117, .018),
    (1.843, .142, .115, .014),
    (1.892, .142, .115, .008),
    (1.945, .130, .104, .002),
    (1.978, .109, .088, .003),
    (1.996, .071, .057, .006),
    (2.008, .046, .043, .007),
    (2.035, .045, .043, .007),
    (2.057, .022, .022, .007),
    (2.061, .009, .010, .007),
)


def _facial_relief(x, height):
    """Shape the broad carved planes and reuse their recesses for stone tone."""
    side = abs(x)
    eye_x = side - .063
    eye_shape = _bell(eye_x, .033) * (1. - _bell(side, .026))
    lid_line = 1.778 + .016 * _bell(eye_x + .004, .027) - .09 * eye_x
    upper_lid = eye_shape * _bell(height - lid_line - .014, .016)
    closure = eye_shape * _bell(height - lid_line + .003, .010)
    lower_lid = eye_shape * _bell(height - lid_line + .019, .015)
    eye_socket = eye_shape * _bell(height - lid_line - .031, .018)
    brow = _bell(eye_x, .052) * _bell(height - lid_line - .054, .023)
    eye = .020 * upper_lid - .024 * closure + .011 * lower_lid - .014 * eye_socket + .025 * brow

    bridge = _bell(x, .025) * _bell(height - 1.761, .055)
    tip = _bell(x, .026) * _bell(height - 1.728, .026)
    wings = _bell(side - .021, .020) * _bell(height - 1.717, .018)
    nose_side = _bell(side - .038, .015) * _bell(height - 1.743, .035)
    under_nose = _bell(side - .019, .018) * _bell(height - 1.704, .015)
    nose = .031 * bridge + .048 * tip + .017 * wings - .014 * nose_side - .017 * under_nose

    lip_line = 1.670 + .006 * (1. - _bell(x, .036))
    lip_span = _bell(x, .044)
    upper_lip = lip_span * _bell(height - lip_line - .014, .014)
    opening = lip_span * _bell(height - lip_line, .010)
    lower_lip = lip_span * _bell(height - lip_line + .013, .014)
    under_lip = _bell(x, .039) * _bell(height - lip_line + .035, .016)
    mouth = .019 * upper_lip - .019 * opening + .023 * lower_lip - .010 * under_lip

    cheek = _bell(height - 1.733, .036) * _bell(side - .084, .040)
    chin = _bell(x, .053) * _bell(height - 1.629, .029)
    depth = eye + nose + mouth + .022 * cheek + .021 * chin
    recess = (.48 * closure + .16 * eye_socket + .19 * nose_side + .22 * under_nose
              + .40 * opening + .088 * under_lip)
    return depth, recess


def _head(height, angle, width, depth, centre):
    sine, cosine = math.sin(angle), math.cos(angle)
    x = width * sine
    front = max(cosine, 0)
    z = centre + depth * cosine
    face, _ = _facial_relief(x, height)
    hairline = 1.884 - .033 * (1 - front)
    hair = min(1., max(0., (height - hairline) / .028))
    comb = math.sin(28 * angle + .56 * math.sin(height * 122)) * math.cos(height * 128)
    stone_ridge = (.0035 + .0026 * comb) * hair
    return (x + sine * stone_ridge, height, z + front ** 1.8 * face + cosine * stone_ridge)


def _ear(height, angle, width, depth, centre, side):
    return (side * (.132 + centre) + width * math.sin(angle), height,
            .017 + depth * math.cos(angle))


def _palm(height, angle, width, depth, centre, front, side):
    x = side * centre + width * math.sin(angle)
    z = front + depth * math.cos(angle)
    return (x, height, z)


def _front(z, depth, centre):
    return min(1., max(0., (z - centre) / depth))


def _face_cavity(x, height, z):
    _, depth, centre = _profile(HEAD, height)
    front = _front(z, depth, centre)
    _, recess = _facial_relief(x, height)
    return min(.48, front ** 1.5 * recess)


def _robe_cavity(x, height, z):
    _, depth, centre = _profile(BODY, height)
    front = _front(z, depth, centre)
    crease = max(run * max(0., hollow - .46 * crest) * relief / .031
                 for relief, run, crest, hollow in _fold_lobes(height, x))
    return min(.32, .36 * crease * front ** .70)


def _pedestal_cavity(x, height, z):
    width, depth, belly = _profile(BASE, height)
    angle = math.atan2(x / width, z / depth)
    rim = min(1., math.hypot(x / width, z / depth))
    recess = .088 * belly * (1. - _petal(angle))
    recess += .155 * _bell(height - .109, .023) + .055 * _bell(height - .023, .018)
    return rim * recess


def apply_relief(parts):
    """Replace the stock tint on the three broad carved surfaces."""
    for obj, at, seat, scale, cavity in parts:
        layer = obj.data.color_attributes.get('SurfaceTint')
        if layer is None:
            raise RuntimeError('Stone relief requires the exported SurfaceTint layer')
        shades = []
        for vertex in obj.data.vertices:
            point = vertex.co
            x = (point.x - at[0]) / scale
            y = seat + (point.z - at[1] - seat) / scale
            z = (-point.y - at[2]) / scale
            shade = 1. - cavity(x, y, z)
            shades.append((shade, shade, shade, 1.))
        for loop in obj.data.loops:
            layer.data[loop.index].color = shades[loop.vertex_index]
        obj['surface_tint_export'] = 'Preserve neutral carved recess tint as glTF COLOR_0.'


def build(mesh, at, material):
    """Carve the upright figure and lowered hands over its bearing plinth."""
    plinth = _finish_shell(mesh, 'Weather-softened stone lotus bearing block', at,
                           _rings(BASE, .023, 48, _pedestal), material)
    parts = [(plinth, at, 0., 1., _pedestal_cavity)]
    # Retain the altar contact and keep the hair crown visible beneath the
    # rear ceiling beam when viewed from the hall entry.
    seat = BASE[-1][0]
    scale = 1. - .190 / (HEAD[-1][0] - seat)

    def compact(point):
        x, y, z = point
        return (x * scale, seat + (y - seat) * scale, z * scale)

    def figure_shell(name, rings, cavity=None):
        obj = _finish_shell(mesh, name, at, [[compact(point) for point in ring] for ring in rings],
                            material, smooth_caps=True)
        if cavity is not None:
            parts.append((obj, at, seat, scale, cavity))
        return obj

    def figure_detail(name, points, radii, segments):
        placed = [tuple(a + b for a, b in zip(compact(point), at)) for point in points]
        return mesh.curved_tube(name, placed, [radius * scale for radius in radii], material, segments)

    figure_shell('Continuous carved seated robe and crossing knees', _rings(BODY, .030, 48, _robe), _robe_cavity)
    figure_shell('Downcast face and low carved hair crown', _rings(HEAD, .007, 64, _head), _face_cavity)

    for side in (-1, 1):
        ears = (
            (1.632, .010, .016, .006), (1.656, .019, .024, .010),
            (1.704, .023, .023, .019), (1.757, .026, .024, .023),
            (1.800, .023, .019, .017), (1.828, .012, .013, .010),
        )
        figure_shell('Carved ear and long earlobe',
                     _rings(ears, .027, 14, lambda h, a, w, d, c: _ear(h, a, w, d, c, side)))
        figure_shell('Draped sleeve from shoulder through bent elbow to lap', _sleeve(side))

    # Palms turn upward and overlap in the lap, leaving one deliberate
    # opening under the joined thumb tips.
    for side, rise in ((-1, 0.), (1, .036)):
        palm = ((.699, .101, .038, .054, .342), (.708, .151, .059, .050, .338),
                (.730, .161, .074, .045, .343), (.753, .151, .067, .046, .350),
                (.769, .113, .044, .049, .359), (.773, .068, .023, .059, .368))
        raised = [(height + rise, w, d, c, front) for height, w, d, c, front in palm]
        figure_shell('Open palm resting over the lap',
                     _rings(raised, .014, 24, lambda h, a, w, d, c, f: _palm(h, a, w, d, c, f, side)))
        for offset, radius, length in ((0, .016, .133), (1, .015, .144),
                                       (2, .014, .131), (3, .012, .109)):
            level = .741 + rise - .004 * offset
            front = .329 + .022 * offset
            finger = ((side * (.080 - offset * .004), level, front),
                      (side * -.006, level - .004, front + .007),
                      (side * (.080 - length), level, front + .011))
            figure_detail('Rounded fingertip in the resting palm', finger, [radius, radius, radius * .60], 8)
        thumb = ((side * .100, .753 + rise, .370),
                 (side * .068, .797 + rise * .52, .390),
                 (side * .033, .829 + rise * .30, .386),
                 (side * .007, .833, .381))
        figure_detail('Thumb sloping toward the joined meditation gesture', thumb,
                      [.027, .023, .018, .010], 12)
    return parts
