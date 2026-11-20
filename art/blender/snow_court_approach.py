"""The snowbound side of the pass, from the lower walk to the gate approach."""

import math
import random
from bisect import bisect_right


REGION = 'gate'
END = 14.35
START = 51.0
CROSSING = (-22, -7.5, -5.3, -3.7, -2.75, -2, -1.45, -1.14,
            -.89, -.62, -.33, 0, .33, .62, .89, 1.14, 1.45, 2, 2.75, 3.7,
            5.3, 7.5, 22)
SHOULDER = (
    # x, z, span across slope, length along slope, height above the pass grade
    (2.65, 32.60, 2.5, 4.9, 2.12),
    (-4.25, 37.20, 3.7, 6.5, 2.35),
    (8.80, 42.40, 4.4, 8.6, 1.63),
    (-5.80, 23.90, 3.8, 6.0, 2.18),
    (4.35, 23.60, 3.9, 6.2, 1.24),
    (-7.10, 17.30, 3.6, 4.4, 1.06),
)
PINES = (
    # x, z, stature, base radius, lean along the crosswind
    (0.43, 36.60, 6.28, .30, -.88),
    (3.30, 33.30, 7.54, .43, -1.15),
    (4.82, 30.15, 6.05, .28, -.68),
    (-3.72, 33.26, 6.97, .32, .83),
    (-4.52, 28.10, 6.45, .28, .73),
    (8.85, 39.05, 8.04, .41, -1.19),
    (5.95, 25.47, 6.33, .29, -.58),
    (-4.13, 21.92, 6.81, .35, -.67),
    (3.79, 18.54, 5.43, .26, .51),
    (5.96, 40.10, 7.21, .33, -.68),
    (11.33, 34.90, 7.05, .34, -1.03),
)
ROCKS = (
    # x, z, radii across the slope, up, along the slope
    (-.69, 35.66, 1.10, .86, 1.30),
    (3.25, 32.57, 1.59, 1.24, 2.08),
    (4.65, 31.68, 1.20, .80, 1.55),
    (2.38, 31.07, .69, .63, 1.19),
    (7.29, 42.95, .82, .85, 1.55),
    (8.43, 44.28, .91, 1.02, 1.30),
    (-1.67, 35.55, .79, .69, 1.51),
    (-3.67, 33.05, 1.01, 1.15, 1.16),
    (-3.72, 26.10, .89, .67, 1.10),
    (-4.19, 24.90, 1.28, 1.04, 1.87),
    (1.86, 26.11, .72, .67, 1.27),
    (2.67, 25.22, .91, .80, 1.04),
    (-5.34, 18.75, 1.20, .83, 1.91),
    (4.05, 17.40, 1.02, .71, 1.45),
    (13.00, 38.13, 1.95, 1.58, 2.30),
    (-8.00, 31.30, 1.88, 1.27, 1.97),
)
SCOURED_LEDGES = (
    # Trail-relative offset, z, and radii of the low rock breaking the drift.
    (-1.99, 44.10, .54, .41, .67),
    (2.02, 43.85, .57, .49, .78),
    (1.59, 42.12, .37, .33, .55),
    (-2.14, 40.52, .64, .53, .81),
    (1.86, 38.78, .52, .52, .77),
    (2.49, 37.27, .67, .51, .64),
    (-1.74, 34.07, .47, .39, .74),
    (1.91, 32.45, .63, .52, .80),
    (-2.14, 30.65, .62, .41, .91),
    (1.73, 27.96, .43, .34, .57),
)
WINTER_BRUSH = (
    # Small clumps root in the drift between the trail and the exposed rock.
    (-1.34, 44.67), (1.44, 42.75), (-1.48, 41.24), (1.52, 38.02),
    (-1.51, 35.34), (1.47, 33.31), (-1.62, 29.87), (1.51, 27.41),
)


def ease(a, b, value):
    t = min(1, max(0, (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def interpolate(points, depth, smooth=False):
    i = min(len(points) - 2, max(0, bisect_right(points, depth, key=lambda point: point[0]) - 1))
    a, b = points[i:i + 2]
    t = min(1, max(0, (depth - a[0]) / (b[0] - a[0])))
    if not smooth:
        return mix(a[1], b[1], t)
    previous = points[max(i - 1, 0)]
    following = points[min(i + 2, len(points) - 1)]
    width = b[0] - a[0]
    left = width * (b[1] - previous[1]) / (b[0] - previous[0])
    right = width * (following[1] - a[1]) / (following[0] - a[0])
    return (1 - t) ** 2 * ((1 + 2 * t) * a[1] + t * left) + t * t * (
        (3 - 2 * t) * b[1] + (t - 1) * right)


def road_height(site, depth):
    return interpolate(site['roadGrade'], depth)


def road_centerline(site):
    knots = [(frame['position'][2], frame['position'][0]) for frame in site['walk']
             if frame['position'][2] >= END]
    last = next(frame['position'] for frame in site['walk'] if frame['position'][2] < END)
    return sorted([(END, last[0]), *knots, (START, 6.72)])


def snow_ground(site, centerline, x, z):
    offset = x - interpolate(centerline, z, smooth=True)
    distance = abs(offset)
    side = 1 if offset >= 0 else -1
    verge = ease(.76, 1.90, distance)
    land = .15 * math.sin(x * .84 + z * .27) + .09 * math.cos(z * .91 - x * .48)
    land += .29 * ease(2.5, 10, distance)
    for sx, sz, rx, rz, rise in SHOULDER:
        radius = ((x - sx) / rx) ** 2 + ((z - sz) / rz) ** 2
        land += rise * (1 - ease(.04, 1.35, radius))
    packed = .008 * (math.cos(z * 1.83 + offset * 9) - math.cos(z * 1.83))
    packed -= .028 * ease(.09, .76, distance)
    old_drift = .16 * ease(.55, 1.42, distance) * (1 - ease(1.42, 3.32, distance))
    # Wind scours some exposures and drops staggered loads in their lee.
    # Blend outside the walked strip, retaining its established grade.
    phase = z * .76 + side * 1.37
    crest = 1.58 + .28 * math.sin(phase) + .13 * math.sin(z * 1.52 - side)
    wedge = ease(.66, crest, distance) * (1 - ease(crest, crest + 1.57, distance))
    load = .11 + .09 * math.sin(phase + .2) ** 2 + .034 * math.sin(z * 2.35 + offset * 3.1)
    near_steps = ease(21., 27., z) * (1 - ease(46., START, z))
    drift = mix(old_drift, wedge * load, near_steps * ease(.76, 1.36, distance))
    scour = (.11 + .33 * (.5 + .5 * math.cos(phase * 1.71 + offset * 2.06)) ** 2)
    land -= scour * near_steps * ease(1.13, 1.82, distance) * (1 - ease(3.4, 5.1, distance))
    end_blend = ease(END, 17.2, z)
    return road_height(site, z) + end_blend * (packed + drift + land * verge)


def terrain_geometry(site, centerline):
    depths = sorted({END, START, *[depth for depth, _ in site['roadGrade'] if END < depth < START],
                     *[depth for depth, _ in centerline],
                     *[END + row * (START - END) / 73 for row in range(1, 73)]})
    rows = []
    for z in depths:
        center = interpolate(centerline, z, smooth=True)
        rows.append([(center + dx, snow_ground(site, centerline, center + dx, z), z) for dx in CROSSING])
    cols, faces = len(CROSSING), []
    for row in range(len(depths) - 1):
        for col in range(cols - 1):
            i = row * cols + col
            if (row + col) % 2:
                faces.extend([(i, i + cols, i + cols + 1), (i, i + cols + 1, i + 1)])
            else:
                faces.extend([(i, i + cols, i + 1), (i + 1, i + cols, i + cols + 1)])
    return [p for row in rows for p in row], faces


def surface_sampler(vertices):
    """Locate the authored terrain triangle under a support in engine space."""
    cols = len(CROSSING)
    depths = [point[2] for point in vertices[::cols]]

    def height(x, z):
        row = max(0, min(len(depths) - 2, bisect_right(depths, z) - 1))
        t = (z - depths[row]) / (depths[row + 1] - depths[row])
        low = vertices[row * cols:(row + 1) * cols]
        high = vertices[(row + 1) * cols:(row + 2) * cols]
        boundaries = [mix(a[0], b[0], t) for a, b in zip(low, high)]
        col = max(0, min(cols - 2, bisect_right(boundaries, x) - 1))
        a, b, c, d = low[col], low[col + 1], high[col], high[col + 1]
        diag_a, diag_b = (a, d) if (row + col) % 2 else (b, c)
        if x < mix(diag_a[0], diag_b[0], t):
            left = between(a, c, t)
            right = between(diag_a, diag_b, t)
        else:
            left = between(diag_a, diag_b, t)
            right = between(b, d, t)
        width = right[0] - left[0]
        return mix(left[1], right[1], (x - left[0]) / width) if width > 1e-8 else left[1]

    return height


def boot_trail(centerline):
    """Return an uphill set of older boot impressions on the brushed strip."""
    rng = random.Random(63906)
    prints = []
    depth = 44.29
    for step in range(54):
        side = 1 if step % 2 else -1
        depth -= rng.uniform(.43, .53)
        if step in (4, 10, 11, 24, 36, 37, 49):
            continue  # fresh snow has filled these impressions completely
        center = interpolate(centerline, depth, smooth=True)
        tangent = interpolate(centerline, depth + .22, smooth=True) - center
        offset = side * rng.uniform(.112, .178) + .075 * math.sin(depth * .54)
        angle = math.atan2(tangent, .22) + side * .12 + rng.uniform(-.09, .09)
        # Keep snow-covered examples in the path as well as the weak ghosts.
        burial = rng.uniform(.06, .31) if step in (0, 6, 13, 15, 18, 20, 28, 35, 43) else rng.uniform(.23, .91)
        prints.append((center + offset, depth, angle, burial))
    return prints


def worn_terrain(site, centerline):
    """Cut the boot relief into the same support as the rest of the trail."""
    from snow_court_use import boot_relief, refine_sole_triangles

    vertices, faces = terrain_geometry(site, centerline)
    support = surface_sampler(vertices.copy())
    footprints = boot_trail(centerline)
    colours = []

    def sample(x, z, index=None):
        offset = x - interpolate(centerline, z, smooth=True)
        cut, packed = boot_relief(x, z, footprints)
        brush = 1 - ease(.28, .58, abs(offset + .043 * math.sin(z * 1.68)))
        fine = .5 + .28 * math.sin(z * 5.07 + x * 7.61) + .22 * math.cos(x * 12.1 - z * 8.3)
        visit = ease(17.2, 19., z) * (1 - ease(45., 47., z))
        below = visit * (max(0., cut) + brush * (.004 + .006 * fine))
        grade = support(x, z) if index is None else vertices[index][1]
        point = (x, grade - below, z)
        # Packed snow takes a slightly darker, cooler colour underneath the blown cover.
        strength = visit * (brush * (.055 + .027 * fine) + .33 * packed)
        shade = tuple(1 - strength * k for k in (.96, .86, .70))
        if index is None:
            vertices.append(point)
            colours.append(shade)
            return len(vertices) - 1
        vertices[index] = point
        colours.append(shade)

    for i, (x, _, z) in enumerate(vertices):
        sample(x, z, i)
    faces = refine_sole_triangles(vertices, faces, footprints, sample)
    return vertices, faces, colours, support


def trail_scan_uv(vertices, centerline):
    """Use one continuous scan projection, stretched by actual bank climb."""
    cols = len(CROSSING)
    ground_rows = [point[2] for point in vertices[::cols]]
    # The regular sections end before the adaptive footprint midpoints.
    stop = ground_rows.index(START)
    lengths = []
    center_col = CROSSING.index(0)
    for row in range(stop + 1):
        points = vertices[row * cols:(row + 1) * cols]
        station = [0.]
        for a, b in zip(points, points[1:]):
            station.append(station[-1] + math.dist(a, b))
        lengths.extend(s - station[center_col] for s in station)
    tile = .91
    return [(across / tile, -point[2] / tile) for across, point in zip(lengths, vertices)] + [
        ((x - interpolate(centerline, z, smooth=True)) / tile, -z / tile)
        for x, _, z in vertices[len(lengths):]
    ]


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def scale(a, amount):
    return tuple(x * amount for x in a)


def between(a, b, t):
    return tuple(mix(x, y, t) for x, y in zip(a, b))


def path_point(path, t):
    station = t * (len(path) - 1)
    segment = min(len(path) - 2, int(station))
    return between(path[segment], path[segment + 1], station - segment)


class Geometry:
    """Combine repeated forms while preserving their individual source charts."""

    def __init__(self):
        self.vertices, self.faces, self.charts = [], [], []

    def append(self, points, faces, charts):
        start = len(self.vertices)
        self.vertices.extend(points)
        self.faces.extend(tuple(start + i for i in face) for face in faces)
        self.charts.extend(charts)

    def tube(self, mesh, points, radii, sides, caps=True):
        vertices, faces = mesh.tube_path(points, radii, sides, False)
        charts = mesh.tube_coordinates(points, radii, sides)
        self.append(vertices, faces if caps else faces[:-2], charts if caps else charts[:-2])

    def write(self, mesh, name, material, chart, smooth=False):
        obj = mesh.mesh_object(name, self.vertices, self.faces, material, REGION)
        mesh.source_uv(obj, self.charts, chart)
        if smooth:
            for face in obj.data.polygons:
                face.use_smooth = True
        return obj


def rock_crown_scan_uv(rings, summit):
    """Open the crown radially using actual lengths down its stone facets."""
    sides = len(rings[0])
    angles = [math.atan2(z - summit[2], x - summit[0]) for x, _, z in rings[0]]
    radii = [0.] * sides
    previous = [summit] * sides
    rows = []
    for ring in reversed(rings):
        radii = [radius + math.dist(a, b) for radius, a, b in zip(radii, previous, ring)]
        mean = sum(radii) / sides
        # Shared bearings keep the steep sloping faces from collapsing into
        # the top projection. Modest meridian blending keeps the scan smooth.
        lengths = [mix(mean, radius, .60) for radius in radii]
        rows.append([(math.cos(angle) * radius, math.sin(angle) * radius)
                     for angle, radius in zip(angles, lengths)])
        previous = ring
    return [uv for row in reversed(rows) for uv in row] + [(0., 0.)]


def refine_rock_rings(rings, stations, x, z, scale_y, strike, ground_height):
    """Round the broad blocks inside their original footprint, then erode the surface."""
    rounded = [[between(a, b, t) for a, b in zip(ring, ring[1:] + ring[:1]) for t in (.24, .76)]
               for ring in rings]
    lowest = min(point[1] for ring in rings for point in ring)
    highest = max(point[1] for ring in rings for point in ring)
    rows = [(stations[0], rounded[0])]
    for low, high, a, b in zip(stations, stations[1:], rounded, rounded[1:]):
        cuts = (.29, .71) if scale_y >= .53 else (.5,)
        rows.extend((mix(low, high, t), [between(p, q, t) for p, q in zip(a, b)]) for t in cuts)
    rows.append((stations[-1], rounded[-1]))
    for index, (station, ring) in enumerate(rows):
        for i, (px, py, pz) in enumerate(ring):
            theta = math.atan2(pz - z, px - x)
            # Joint planes make short recessed runs, with finer breaks at their ends.
            joint = (.5 + .5 * math.cos(7 * theta + strike + station * 11.5)) ** 3
            weather = .5 + .5 * math.sin(17 * theta - 9 * station + strike)
            recession = .013 + .048 * joint + .014 * weather
            nx, nz = mix(px, x, recession), mix(pz, z, recession)
            lift = scale_y * .016 * math.sin(9 * theta - 10 * station) * math.cos(4 * theta + strike)
            ny = min(highest, max(lowest, py + lift))
            if index == 0:
                ny = min(ny, ground_height(nx, nz) - .061)
            ring[i] = (nx, ny, nz)
    return rows


def rock(mesh, granite, snow, ground_height, face, scoured=False):
    x, z, rx, ry, rz = face
    seed = round(abs(x) * 173 + z * 699)
    rng = random.Random(seed)
    root = ground_height(x, z) - ry * .29
    sides = 13
    strike = rng.uniform(0, math.tau)
    spines = [(strike + i / sides * math.tau + rng.uniform(-.15, .15), rng.uniform(.76, 1.10))
              for i in range(sides)]
    lean = rng.uniform(-.10, .10), rng.uniform(-.13, .13)
    ledges = [.092 * math.sin(2.3 * angle + strike) + rng.uniform(-.08, .08) for angle, _ in spines]
    rings = []
    profile = [(-.38, .66), (.05, .87), (.29, .99), (.57, .81), (.82, .51), (.95, .22)]
    for row, (lift, span) in enumerate(profile):
        ring = []
        for column, (angle, size) in enumerate(spines):
            radius = span * size * rng.uniform(.93, 1.045)
            dx = math.cos(angle) * radius + lift * lean[0]
            dz = math.sin(angle) * radius + lift * lean[1]
            tilt = .16 * (dx * math.cos(strike) + dz * math.sin(strike))
            fracture = .043 * math.sin(4 * angle + strike + row * 1.6)
            height = root + ry * (lift + tilt + fracture + ledges[column] * (.55 if row < 2 else 1))
            if row == 0:
                height = min(height, ground_height(x + dx * rx, z + dz * rz) - .06)
            ring.append((x + dx * rx, height, z + dz * rz))
        rings.append(ring)
    rows = refine_rock_rings(rings, [lift for lift, _ in profile], x, z, ry, strike, ground_height)
    stations, rings = zip(*rows)
    sides = len(rings[0])
    summit = (x + rx * lean[0], root + ry * 1.02, z + rz * lean[1])
    points = [point for ring in rings for point in ring] + [summit]
    peak = len(points) - 1
    faces = []
    charts = []
    # A separate lightmap strip keeps the upward cap independent of the
    # shaded skirt. The photographic texture is continuous between them.
    arcs = [0.]
    snow_first_ring = next(i for i, station in enumerate(stations) if station > .18)
    for i in range(sides):
        other = (i + 1) % sides
        arcs.append(arcs[-1] + math.dist(rings[snow_first_ring][i], rings[snow_first_ring][other]))
    crown_uv = rock_crown_scan_uv(rings[snow_first_ring:], summit)
    first = snow_first_ring * sides
    for row in range(len(rings) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            c, d = a + sides, b + sides
            pair = [(a, c, d), (a, d, b)]
            faces.extend(pair)
            if row >= snow_first_ring:
                charts.extend([[crown_uv[v - first] for v in triangle] for triangle in pair])
                continue
            band = [(arcs[i], stations[row] * ry), (arcs[i], stations[row + 1] * ry),
                    (arcs[i + 1], stations[row + 1] * ry), (arcs[i + 1], stations[row] * ry)]
            charts.extend([band[:3], [band[0], band[2], band[3]]])
    top = peak - sides
    for i in range(sides):
        triangle = (top + i, peak, top + (i + 1) % sides)
        faces.append(triangle)
        charts.append([crown_uv[v - first] for v in triangle])
    body = mesh.mesh_object(f'Wind-scoured weathered outcrop {seed}', points, faces, granite, REGION)
    extent = max(math.hypot(u, v) for u, v in crown_uv)
    atlas_uv = [chart if i < first * 2 else [(u, v + extent + ry * 1.3) for u, v in chart]
                for i, chart in enumerate(charts)]
    mesh.source_uv(body, atlas_uv, 'Unfolded rock skirt and measured crown with a separate lightmap gutter.')
    stone_uv = rock_crown_scan_uv(rings, summit)
    material_uv = body.data.uv_layers['UVMap'].data
    shift_u, shift_v = rng.random(), rng.random()
    metres = rng.uniform(.91, 1.19)
    for polygon, face_indices in zip(body.data.polygons, faces):
        polygon.use_smooth = True
        for loop, i in zip(polygon.loop_indices, face_indices):
            u, v = stone_uv[i]
            material_uv[loop].uv = (u / metres + shift_u, v / metres + shift_v)

    # Snow is clipped over the refined stone itself. The thin margin enters
    # the stone instead of leaving a floating white edge above it.
    lower = .685 if scoured else .605
    margins = []
    for station, ring in rows:
        for px, _, pz in ring:
            angle = math.atan2(pz - z, px - x)
            snowline = lower + .105 * math.cos(angle - .32) + .036 * math.sin(3 * angle + strike)
            snowline += .026 * math.sin(8 * angle - strike)
            value = (station - snowline) * 6
            margins.append(math.copysign(max(.025, abs(value)), value))
    margins.append(2.8)
    snow_points, snow_faces, snow_uv = clip_snow(points, faces[first * 2:], margins, crown_uv, first, ry, strike)
    cap = mesh.mesh_object(f'Wind-set snow lapping onto rock {seed}', snow_points, snow_faces, snow, REGION)
    mesh.source_uv(cap, [[snow_uv[i] for i in face] for face in snow_faces],
                   'Joined snow cover follows the actual rock triangles; metre scale.')
    uv = cap.data.uv_layers['UVMap'].data
    for polygon, face_indices in zip(cap.data.polygons, snow_faces):
        polygon.use_smooth = True
        for loop, i in zip(polygon.loop_indices, face_indices):
            u, v = snow_uv[i]
            uv[loop].uv = (u / 1.08 + shift_u, v / 1.08 + shift_v)


def brush_tips(mesh, ground_height, centerline, bark):
    """Low winter stems enter the actual terrain, with most growth buried."""
    rng = random.Random(30029)
    brush = Geometry()
    for offset, z in WINTER_BRUSH:
        origin = interpolate(centerline, z, smooth=True) + offset
        for i in range(rng.randint(3, 5)):
            x = origin + rng.uniform(-.071, .071)
            depth = z + rng.uniform(-.11, .11)
            ground = ground_height(x, depth)
            height = rng.uniform(.20, .46)
            lean = rng.uniform(-.19, -.058)
            fan = rng.uniform(-.15, .19)
            root = (x, ground - .068, depth)
            bend = (x + lean * .32, ground + height * .54, depth + fan * .46)
            tip = (x + lean, ground + height, depth + fan)
            brush.tube(mesh, [root, bend, tip], [.012, .007, .002], 4, caps=False)
            if i % 2 == 0:
                shoot = add(bend, (rng.uniform(.02, .13), height * .26, fan * -.47))
                brush.tube(mesh, [bend, shoot], [.004, .0018], 3, caps=False)
    brush.write(mesh, 'Dormant brush emerging from the wind-cut banks', bark,
                'Unfolded stems rooted below the adjacent drift.')


def clip_snow(points, faces, margins, chart, first, height, strike):
    snow_points, snow_faces, snow_uv, vertices = [], [], [], {}

    def add_vertex(key, point, margin, uv):
        if key not in vertices:
            ripple = .83 + .17 * math.sin(5 * point[0] - 3 * point[2] + strike)
            depth = -.0012 + (.066 + .026 * height) * ripple * ease(0., 1.8, margin)
            vertices[key] = len(snow_points)
            snow_points.append(add(point, (0., depth, 0.)))
            snow_uv.append(uv)
        return vertices[key]

    for face in faces:
        clipped = []
        for a, b in zip(face, (*face[1:], face[0])):
            if margins[a] > 0:
                clipped.append(add_vertex(a, points[a], margins[a], chart[a - first]))
            if (margins[a] > 0) != (margins[b] > 0):
                proportion = margins[a] / (margins[a] - margins[b])
                point = between(points[a], points[b], proportion)
                uv = between(chart[a - first], chart[b - first], proportion)
                clipped.append(add_vertex(tuple(sorted((a, b))), point, 0., uv))
        for i in range(1, len(clipped) - 1):
            snow_faces.append((clipped[0], clipped[i], clipped[i + 1]))
    return snow_points, snow_faces, snow_uv


def twig_tufts(needles, rime, branch, rng, length, close, snowy):
    """Wrap paired pine needles around the distal, wind-combed twig."""
    from mathutils import Vector
    from pine_hero_trees import needle_fascicle

    up = Vector((0., 1., 0.))
    twig = Vector(branch[-1]) - Vector(branch[-2])
    twig.normalize()
    side = twig.cross(up).normalized()
    for i, station in enumerate((.23, .40, .58, .75, .89, .98)):
        offset = station + rng.uniform(-.035, .02)
        anchor = Vector(path_point(branch, offset))
        spokes = (-1, 0, 1) if i in (2, 4) else (-1, 1)
        for sign in spokes:
            rise = rng.uniform(.22, .56) if sign == 0 else rng.uniform(-.11, .30)
            axis = twig + side * (sign * rng.uniform(.45, .79)) + up * rise
            reach = length * rng.uniform(.85, 1.29)
            blades = needle_fascicle(anchor, axis, rng.uniform(0., math.tau), reach, rng,
                                     dense=True, mature=True, pairs=3 if close else 2)
            # A visible blade represents the adjacent needles of a tight pair.
            # Use its combined width so the bunch still reads on the middleground.
            needles.append(tuple((root, bend, tip, max(width * 1.85, .0033 if close else .0040))
                                 for root, bend, tip, width in blades))
        if snowy and 1 <= i <= 3:
            crown = anchor + twig * (.22 * length) + up * (.20 * length)
            if i == 1:
                sleeve_start = crown
            elif i == 3:
                # The lower rim intersects the needle layer. Small joined
                # deposits follow the bent shoot, not the whole crown outline.
                path = [tuple(sleeve_start), tuple(sleeve_start.lerp(crown, .53)), tuple(crown)]
                snow_sleeve(rime, path, [.30 * length, .47 * length, .29 * length], rng, charts=False)


def snow_sleeve(snow, path, radii, rng, *, charts=True):
    """Break the settled snow into narrow deposits on actual bough surfaces."""
    for i, (p, q) in enumerate(zip(path, path[1:])):
        az = math.atan2(q[2] - p[2], q[0] - p[0])
        side = (-math.sin(az), 0, math.cos(az))
        span = math.dist(p, q)
        points, faces, coordinates = [], [], []
        start, finish = rng.uniform(.04, .14), rng.uniform(.72, .94)
        for section in range(4):
            t = mix(start, finish, section / 3)
            radius = mix(radii[i], radii[i + 1], t)
            center = between(p, q, t)
            load = math.sin(math.pi * section / 3)
            crown = add(center, (0., radius * (1.06 + load * rng.uniform(.27, .45)), 0.))
            skirt = add(center, (0., radius * .64, 0.))
            width = radius * (.37 + .29 * load)
            points.extend((add(skirt, scale(side, width)), crown, add(skirt, scale(side, -width))))
            bank = math.dist(crown, points[-1])
            coordinates.extend(((-bank, t * span), (0., t * span), (bank, t * span)))
        for row in range(3):
            for strip in (0, 1):
                a = row * 3 + strip
                faces.extend(((a, a + 3, a + 1), (a + 1, a + 3, a + 4)))
        snow.append(points, faces, [[coordinates[i] for i in face] for face in faces] if charts else ())


def pine(mesh, bark, needles, snow, rime, ground_height, profile, i):
    x, z, stature, root, lean = profile
    rng = random.Random(93489 + 1393 * i)
    growth = random.Random(67119 + 1777 * i)
    ground = ground_height(x, z)
    direction = rng.uniform(-.56, .29)
    trunk = [(x + lean * bend, ground + stature * y, z + bend * direction) for y, bend in
             [(-.042, 0), (.06, -.02), (.22, .12), (.42, .23),
              (.64, .59), (.81, .77), (.95, 1.13), (1, 1.22)]]
    bark.tube(mesh, trunk, [root * r for r in (1.29, 1.03, .81, .67, .47, .31, .13, .025)], 10)
    for j in range(3):
        az = j / 3 * math.tau + rng.uniform(-.25, .25)
        reach = root * rng.uniform(2.1, 3.1)
        end = (x + math.cos(az) * reach, 0, z + math.sin(az) * reach)
        y = ground_height(end[0], end[2])
        bark.tube(mesh, [trunk[1], between(trunk[0], (end[0], y, end[2]), .55),
                         (end[0], y - .055, end[2])], [root * .44, root * .28, .013], 5)
    phase = rng.uniform(0, math.tau)
    close = i < 8
    for j, tier in enumerate((.36, .43, .46, .53, .59, .63, .71, .77, .80, .88, .93)):
        t = tier + rng.uniform(-.015, .015)
        ring = next(k for k, (a, b) in enumerate(zip(trunk, trunk[1:]))
                    if a[1] <= ground + stature * t <= b[1])
        a, b = trunk[ring:ring + 2]
        hinge = between(a, b, (ground + stature * t - a[1]) / (b[1] - a[1]))
        az = phase + j * 2.400 + rng.uniform(-.53, .51)
        horizontal = (math.cos(az), 0, math.sin(az))
        shelter = .5 + math.copysign(.5, lean) * horizontal[0]
        length = stature * (1 - t) * rng.uniform(.50, .72) * (.59 + .74 * shelter)
        radius = root * (1 - t) * rng.uniform(.26, .37)
        rise = length * rng.uniform(.04, .16)
        bend = add(hinge, add(scale(horizontal, length * .32), (.07 * lean, -.09 * length, .04)))
        shoulder = add(hinge, add(scale(horizontal, length * .70), (.20 * lean, -.13 * length, .08)))
        elbow = add(hinge, add(scale(horizontal, length * .91), (.32 * lean, -.04 * length, .10)))
        end = add(hinge, add(scale(horizontal, length), (.54 * lean, rise, .10)))
        bark.tube(mesh, [hinge, bend, shoulder, elbow, end],
                  [radius, radius * .84, radius * .56, radius * .31, .005], 5, caps=False)
        if j % 2 == 0:
            snow_sleeve(snow, [bend, shoulder, elbow], [radius * .84, radius * .56, radius * .31], growth)
        for k, (root_point, sweep) in enumerate(((between(bend, shoulder, .42), -.96),
                                                (shoulder, .62), (elbow, -.46), (end, .26))):
            theta = az + sweep + rng.uniform(-.15, .15)
            out = (math.cos(theta), 0, math.sin(theta))
            reach = length * rng.uniform(.38, .60)
            mid = add(root_point, add(scale(out, reach * .53), (.08 * lean, -.063 * reach, 0)))
            tip = add(root_point, add(scale(out, reach), (.15 * lean, reach * rng.uniform(.09, .30), 0)))
            branch = [root_point, mid, tip]
            bark.tube(mesh, branch, [radius * .47, radius * .24, .004], 4, caps=False)
            twig_tufts(needles, rime, branch, growth, min(.235, .108 + reach * .155),
                       close, snowy=(j + k + i) % 3 != 0 and shelter > .21)
        if j in (7, 9, 10):
            # Short shoots split away from the bent leader instead of leaving
            # a bare spear above the broader lower whorls.
            heading = az + growth.uniform(1.25, 2.01)
            fan = (math.cos(heading), .25, math.sin(heading))
            span = stature * growth.uniform(.096, .144)
            first = add(hinge, add(scale(fan, span * .53), (lean * .12, -.03, 0.)))
            final = add(hinge, add(scale(fan, span), (lean * .19, .06, 0.)))
            shoot = [hinge, first, final]
            bark.tube(mesh, shoot, [max(.019, .75 * radius), .012, .004], 4, caps=False)
            twig_tufts(needles, rime, shoot, growth, min(.19, .10 + span * .17), close, snowy=j != 9)
    twig_tufts(needles, rime, trunk[-3:], growth, .142, close, snowy=False)


def set_crown_normals(data):
    # Keep shared roots smooth and indexed when multiple fascicles meet.
    normals = [(0., 0., 0.) for _ in data.vertices]
    for face in data.polygons:
        face.use_smooth = True
        weighted = scale(face.normal, face.area)
        for index in face.vertices:
            normals[index] = add(normals[index], weighted)
    directions = [scale(normal, 1 / length) if (length := math.hypot(*normal)) else normal for normal in normals]
    data.normals_split_custom_set_from_vertices(directions)


def build_approach(site, materials):
    """Add the walk-in side of the pass and return its snow support surface."""
    import bpy
    import snow_roof as mesh
    from pine_hero_trees import needle_mesh

    centerline = road_centerline(site)
    vertices, faces, shades, ground_height = worn_terrain(site, centerline)
    scan_uv = trail_scan_uv(vertices, centerline)
    surface = materials['snow'].copy()
    surface.name = 'Wind-packed snow on the pass trail'
    for node in surface.node_tree.nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = .46
    mesh.vertex_tint_shader(surface)
    del surface['one_light_surface_tint']
    support = mesh.mesh_object('Narrow packed snow trail and wind-cut verges', vertices, faces,
                               surface, REGION)
    mesh.source_uv(support, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'Connected walk surface projected in metres.')
    uv = support.data.uv_layers['UVMap'].data
    tint = support.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
    support.data.color_attributes.active_color = tint
    colour_factor = surface['one_light_vertex_base_tint']
    for polygon in support.data.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            i = support.data.loops[loop].vertex_index
            uv[loop].uv = scan_uv[i]
            tint.data[loop].color = (*(a * b for a, b in zip(colour_factor, shades[i])), 1.)

    rock_scan = mesh.material('Pitted exposed rock of the winter pass', '#a8c9ed', 'rock_pitted_mossy', .89)
    for face in ROCKS:
        rock(mesh, rock_scan, materials['snow'], ground_height, face)
    for offset, z, rx, ry, rz in SCOURED_LEDGES:
        x = interpolate(centerline, z, smooth=True) + offset
        rock(mesh, rock_scan, materials['snow'], ground_height, (x, z, rx, ry, rz), scoured=True)
    brush_tips(mesh, ground_height, centerline, materials['bark'])

    bark, snow, rime = (Geometry() for _ in range(3))
    needles = []
    for i, profile in enumerate(PINES):
        pine(mesh, bark, needles, snow, rime, ground_height, profile, i)
    stems = bark.write(mesh, 'Tapered trunks and wind-bent pine boughs', materials['pine_bark'],
                       'Unrolled bark and end charts; metre scale.', smooth=True)
    # Share the circumferential material UV across each taper instead of projecting a flat side.
    uv = stems.data.uv_layers['UVMap'].data
    for polygon, coordinates in zip(stems.data.polygons, bark.charts):
        for loop, (u, v) in zip(polygon.loop_indices, coordinates):
            uv[loop].uv = (u / 1.80, v / 1.80)
    # Use Pine Gate's native needle sections. The joined twigs cast shadows
    # into the source bake. Only stems and bough snow consume chart area.
    points, faces, _charts, _wind = needle_mesh(needles, compact=True)
    first_snow = len(faces)
    rime_offset = len(points)
    points.extend(rime.vertices)
    faces.extend(tuple(i + rime_offset for i in face) for face in rime.faces)
    needle_green = mesh.material('Living grey-green winter pine needles', '#6b8961', rough=.89)
    needle_green.use_backface_culling = False
    foliage = mesh.mesh_object('Winter pine paired needle fascicles and settled rime',
                               points, faces, needle_green, REGION)
    foliage.data.materials.append(mesh.material('Settled rime in winter pine fascicles', '#d4e1e5', rough=.94))
    for face in foliage.data.polygons[first_snow:]:
        face.material_index = 1
    bpy.data.collections['RUNTIME'].objects.link(foliage)
    mesh.STATIC.objects.unlink(foliage)
    del foliage['one_light_static']
    foliage.data.uv_layers.remove(foliage.data.uv_layers['UVMap'])
    set_crown_normals(foliage.data)
    foliage['snow_court_needle_crowns'] = True
    foliage['snow_court_fascicle_count'] = len(needles)
    foliage['snow_court_needle_count'] = sum(map(len, needles))
    snow.write(mesh, 'Broken snow ridges along pine boughs', materials['snow'],
               'Joined supported snow strips unfolded in metres.', smooth=True)
    return foliage
