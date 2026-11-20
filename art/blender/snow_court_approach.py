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
    verge = ease(.76, 1.90, abs(offset))
    land = .15 * math.sin(x * .84 + z * .27) + .09 * math.cos(z * .91 - x * .48)
    land += .29 * ease(2.5, 10, abs(offset))
    for sx, sz, rx, rz, rise in SHOULDER:
        radius = ((x - sx) / rx) ** 2 + ((z - sz) / rz) ** 2
        land += rise * (1 - ease(.04, 1.35, radius))
    packed = .008 * (math.cos(z * 1.83 + offset * 9) - math.cos(z * 1.83))
    packed -= .028 * ease(.09, .76, abs(offset))
    drift = .16 * ease(.55, 1.42, abs(offset)) * (1 - ease(1.42, 3.32, abs(offset)))
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


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def scale(a, amount):
    return tuple(x * amount for x in a)


def between(a, b, t):
    return tuple(mix(x, y, t) for x, y in zip(a, b))


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

    def triangle(self, a, b, c):
        ab, ac, bc = math.dist(a, b), math.dist(a, c), math.dist(b, c)
        along = (ab * ab + ac * ac - bc * bc) / (2 * ab)
        altitude = math.sqrt(max(1e-12, ac * ac - along * along))
        self.append([a, b, c], [(0, 1, 2)], [[(0, 0), (ab, 0), (along, altitude)]])

    def write(self, mesh, name, material, chart, smooth=False):
        obj = mesh.mesh_object(name, self.vertices, self.faces, material, REGION)
        mesh.source_uv(obj, self.charts, chart)
        if smooth:
            for face in obj.data.polygons:
                face.use_smooth = True
        return obj


def rock(mesh, granite, snow, ground_height, face):
    x, z, rx, ry, rz = face
    seed = round(abs(x) * 173 + z * 699)
    rng = random.Random(seed)
    root = ground_height(x, z) - ry * .29
    spines = [(i / 7 * math.tau + rng.uniform(-.17, .17), rng.uniform(.79, 1.14))
              for i in range(7)]
    rings = []
    for lift, spread in [(-.35, .71), (.14, 1), (.69, .69), (.93, .35)]:
        rings.append([(x + math.cos(a) * rx * f * spread + lift * rx * .11,
                       root + (lift + rng.uniform(-.16, .16)) * ry,
                       z + math.sin(a) * rz * f * spread - lift * rz * .19)
                      for a, f in spines])
    body = Geometry()
    for ring, low in enumerate(rings[:-1]):
        high = rings[ring + 1]
        for i in range(7):
            j = (i + 1) % 7
            body.triangle(low[i], high[i], high[j])
            body.triangle(low[i], high[j], low[j])
    tip = (x + rx * .20, root + ry * 1.03, z - rz * .21)
    for i in range(7):
        body.triangle(rings[-1][i], tip, rings[-1][(i + 1) % 7])
    body.write(mesh, f'Wind-scoured granite outcrop {seed}', granite, 'Triangulated granite faces; metre scale.')

    # A sloping snow cap follows each exposed rock lip and thins into the stone.
    rim = [add(between(rings[2][i], rings[3][i], rng.uniform(.10, .70)),
               (0, rng.uniform(.01, .028), 0)) for i in range(7)]
    crown = [add(p, (0, rng.uniform(.055, .105), 0)) for p in rings[3]]
    cap_tip = add(tip, (0, .078 + ry * .031, 0))
    points = rim + crown + [cap_tip]
    faces = []
    for i in range(7):
        j = (i + 1) % 7
        faces.extend([(i, i + 7, j + 7), (i, j + 7, j), (i + 7, 14, j + 7)])
    obj = mesh.mesh_object(f'Drift over granite {seed}', points, faces, snow, REGION)
    mesh.source_uv(obj, [[(points[i][0], points[i][2]) for i in face] for face in faces],
                   'Top-projected connected snow cap; metre scale.')
    for face in obj.data.polygons:
        face.use_smooth = True


def twig_fan(needles, branch, direction, rng, spread, close):
    """A three-dimensional group of long needles, supported by the fork."""
    az = math.atan2(direction[2], direction[0])
    count = 23 if close else 17
    for needle in range(count):
        t = .22 + .77 * needle / (count - 1)
        segment = min(len(branch) - 2, int(t * (len(branch) - 1)))
        hinge = between(branch[segment], branch[segment + 1], t * (len(branch) - 1) - segment)
        phase = math.tau * .381966 * needle + rng.uniform(-.24, .24)
        angle = az + math.sin(phase) * rng.uniform(.43, 1.15)
        y = math.cos(phase) * rng.uniform(.21, .64) + .14
        length = spread * rng.uniform(.52, 1.22) * (1 - .32 * t)
        direction = (math.cos(angle), y, math.sin(angle))
        tip = add(hinge, scale(direction, length))
        side = scale((-math.sin(angle), .74 * math.sin(phase), math.cos(angle)),
                     length * rng.uniform(.031, .054))
        needles.triangle(add(hinge, side), add(hinge, scale(side, -1)), tip)


def snow_sleeve(snow, path, width, rng):
    """An irregular rounded strip supported on the upper side of a bough."""
    for i, (p, q) in enumerate(zip(path, path[1:])):
        az = math.atan2(q[2] - p[2], q[0] - p[0])
        side = (-math.sin(az), 0, math.cos(az))
        radius = width * (1 - .15 * i)
        for small in range(2):
            t = .07 + small * .45 + rng.uniform(-.05, .05)
            root = add(between(p, q, t), (0, radius * 1.22, 0))
            tip = add(between(p, q, t + .40), (0, radius * .63, 0))
            ridge = add(between(root, tip, .46), (0, radius * .47, 0))
            left = add(root, scale(side, radius * rng.uniform(.70, 1.18)))
            right = add(root, scale(side, -radius * rng.uniform(.74, 1.25)))
            snow.triangle(left, tip, ridge)
            snow.triangle(ridge, tip, right)


def pine(mesh, bark, needles, snow, ground_height, profile, i):
    x, z, stature, root, lean = profile
    rng = random.Random(93489 + 1393 * i)
    ground = ground_height(x, z)
    direction = rng.uniform(-.56, .29)
    trunk = [(x + lean * bend, ground + stature * y, z + bend * direction) for y, bend in
             [(-.042, 0), (.06, -.02), (.22, .12), (.42, .23),
              (.64, .59), (.81, .77), (.95, 1.13), (1, 1.22)]]
    bark.tube(mesh, trunk, [root * r for r in (1.29, 1.03, .81, .67, .47, .31, .13, .025)], 8)
    for j in range(3):
        az = j / 3 * math.tau + rng.uniform(-.25, .25)
        reach = root * rng.uniform(2.1, 3.1)
        end = (x + math.cos(az) * reach, 0, z + math.sin(az) * reach)
        y = ground_height(end[0], end[2])
        bark.tube(mesh, [trunk[1], between(trunk[0], (end[0], y, end[2]), .55),
                         (end[0], y - .055, end[2])], [root * .44, root * .28, .013], 5)
    phase = rng.uniform(0, math.tau)
    close = i < 8
    for j in range(9):
        t = .43 + j / 9 * .50 + rng.uniform(-.017, .017)
        ring = next(k for k, (a, b) in enumerate(zip(trunk, trunk[1:]))
                    if a[1] <= ground + stature * t <= b[1])
        a, b = trunk[ring:ring + 2]
        hinge = between(a, b, (ground + stature * t - a[1]) / (b[1] - a[1]))
        az = phase + j * 2.400 + rng.uniform(-.53, .51)
        horizontal = (math.cos(az), 0, math.sin(az))
        length = stature * (1 - t) * rng.uniform(.47, .71)
        radius = root * (1 - t) * rng.uniform(.26, .37)
        bend = add(hinge, add(scale(horizontal, length * .36), (.13 * lean, -length * .10, 0)))
        shoulder = add(hinge, add(scale(horizontal, length * .72), (.24 * lean, -length * .15, 0)))
        end = add(hinge, add(scale(horizontal, length), (.36 * lean, length * .025, .08)))
        bark.tube(mesh, [hinge, bend, shoulder, end], [radius, radius * .82, radius * .51, .008], 4, caps=False)
        if j % 2 == 0:
            snow_sleeve(snow, [bend, shoulder, end], radius * 1.20, rng)
        for fork in (-1, 0, 1):
            foot = between(bend, shoulder, .38 + rng.uniform(-.11, .20)) if fork else shoulder
            theta = az + fork * rng.uniform(.46, .79)
            out = (math.cos(theta), 0, math.sin(theta))
            reach = length * rng.uniform(.42, .61)
            mid = add(foot, add(scale(out, reach * .54), (.09 * lean, -reach * .095, 0)))
            tip = add(foot, add(scale(out, reach), (.15 * lean, reach * .16, 0)))
            bark.tube(mesh, [foot, mid, tip], [radius * .50, radius * .27, .006], 3, caps=False)
            twig_fan(needles, [foot, mid, tip], out, rng, min(.46, .185 + reach * .31), close)
    tip = trunk[-1]
    twig_fan(needles, [trunk[-3], trunk[-2], tip], (-.34, .78, .23), rng, .245, True)


def build_approach(site, materials):
    """Add the walk-in side of the pass and return its snow support surface."""
    import snow_roof as mesh

    centerline = road_centerline(site)
    vertices, faces = terrain_geometry(site, centerline)
    support = mesh.mesh_object('Narrow packed snow trail and wind-cut verges', vertices, faces,
                               materials['snow'], REGION)
    mesh.source_uv(support, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'Connected walk surface projected in metres.')
    for face in support.data.polygons:
        face.use_smooth = True
    ground_height = surface_sampler(vertices)
    for face in ROCKS:
        rock(mesh, materials['granite'], materials['snow'], ground_height, face)

    bark, needles, snow = (Geometry() for _ in range(3))
    for i, profile in enumerate(PINES):
        pine(mesh, bark, needles, snow, ground_height, profile, i)
    stems = bark.write(mesh, 'Tapered trunks and wind-bent pine boughs', materials['bark'],
                       'Unrolled bark and end charts; metre scale.', smooth=True)
    # Share the circumferential material UV across each taper instead of projecting a flat side.
    uv = stems.data.uv_layers['UVMap'].data
    for polygon, coordinates in zip(stems.data.polygons, bark.charts):
        for loop, (u, v) in zip(polygon.loop_indices, coordinates):
            uv[loop].uv = (u / .75, v / .75)
    needles.write(mesh, 'Pine needle geometry in three-dimensional tufts', materials['needle'],
                  'Individual long needles unfolded in metres.')
    snow.write(mesh, 'Broken snow ridges along pine boughs', materials['snow'],
               'Individual supported snow strips unfolded in metres.')
    return support
