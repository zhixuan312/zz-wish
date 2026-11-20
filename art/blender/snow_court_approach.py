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


def rock(mesh, granite, snow, ground_height, face):
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
    points = [point for ring in rings for point in ring]
    points.append((x + rx * lean[0], root + ry * 1.02, z + rz * lean[1]))
    peak = len(points) - 1
    faces = []
    charts = []
    # Use one strip around the exposed lower facies and a separate projection
    # above it, with the same metric coordinates used for the actual scan.
    arcs = [0.]
    for i in range(sides):
        other = (i + 1) % sides
        arcs.append(arcs[-1] + math.dist(rings[2][i], rings[2][other]))
    snow_first_ring = 2
    for row in range(len(rings) - 1):
        for i in range(sides):
            a, b = row * sides + i, row * sides + (i + 1) % sides
            c, d = a + sides, b + sides
            pair = [(a, c, d), (a, d, b)]
            faces.extend(pair)
            if row >= snow_first_ring:
                charts.extend([[(points[v][0], points[v][2]) for v in triangle] for triangle in pair])
                continue
            band = [(arcs[i], profile[row][0] * ry), (arcs[i], profile[row + 1][0] * ry),
                    (arcs[i + 1], profile[row + 1][0] * ry), (arcs[i + 1], profile[row][0] * ry)]
            charts.extend([band[:3], [band[0], band[2], band[3]]])
    top = peak - sides
    for i in range(sides):
        triangle = (top + i, peak, top + (i + 1) % sides)
        faces.append(triangle)
        charts.append([(points[v][0], points[v][2]) for v in triangle])
    body = mesh.mesh_object(f'Wind-scoured weathered outcrop {seed}', points, faces, granite, REGION)
    rock_profile_uv = []
    for i, (polygon, coordinates) in enumerate(zip(body.data.polygons, charts)):
        polygon.use_smooth = True
        if i < snow_first_ring * sides * 2:
            rock_profile_uv.append(coordinates)
        else:
            rock_profile_uv.append([(u - x, v - z + ry * 3.4) for u, v in coordinates])
    mesh.source_uv(body, rock_profile_uv, 'Connected facies strip and separated planar crown; metre scale.')
    material_uv = body.data.uv_layers['UVMap'].data
    shift_u, shift_v = rng.random(), rng.random()
    for polygon, coordinates in zip(body.data.polygons, rock_profile_uv):
        for loop, (u, v) in zip(polygon.loop_indices, coordinates):
            material_uv[loop].uv = (u / 1.32 + shift_u, v / 1.32 + shift_v)

    # Clip the covering against the real facets so its feathered boundary
    # settles between the stone's rings, with pockets in the rock's lee.
    snowline = [3.30 + .56 * math.cos(angle - .32) + .24 * math.sin(3 * angle + strike)
                for angle, _ in spines]
    margins = [i // sides - snowline[i % sides] for i in range(peak)] + [2.8]
    margins = [math.copysign(max(.06, abs(margin)), margin) for margin in margins]
    snow_points, snow_faces = clip_snow(points, faces[snow_first_ring * sides * 2:], margins, ry, strike)
    cap = mesh.mesh_object(f'Wind-set snow lapping onto rock {seed}', snow_points, snow_faces, snow, REGION)
    mesh.source_uv(cap, [[(snow_points[i][0], snow_points[i][2]) for i in face] for face in snow_faces],
                   'Joined snow cover follows the actual rock triangles; metre scale.')
    for face in cap.data.polygons:
        face.use_smooth = True


def clip_snow(points, faces, margins, height, strike):
    snow_points, snow_faces, vertices = [], [], {}

    def add_vertex(key, point, margin):
        if key not in vertices:
            ripple = .83 + .17 * math.sin(5 * point[0] - 3 * point[2] + strike)
            depth = .0025 + (.105 + .023 * height) * ripple * ease(0., 1.8, margin)
            vertices[key] = len(snow_points)
            snow_points.append(add(point, (0., depth, 0.)))
        return vertices[key]

    for face in faces:
        clipped = []
        for a, b in zip(face, (*face[1:], face[0])):
            if margins[a] > 0:
                clipped.append(add_vertex(a, points[a], margins[a]))
            if (margins[a] > 0) != (margins[b] > 0):
                proportion = margins[a] / (margins[a] - margins[b])
                point = between(points[a], points[b], proportion)
                clipped.append(add_vertex(tuple(sorted((a, b))), point, 0.))
        for i in range(1, len(clipped) - 1):
            snow_faces.append((clipped[0], clipped[i], clipped[i + 1]))
    return snow_points, snow_faces


def twig_tufts(needles, branch, az, rng, length, close):
    """Cluster individual fascicles in depth around the youngest wood."""
    for station, sweep in ((.35, -.27), (.56, .33), (.76, -.42), (.96, .23)):
        anchor = path_point(branch, station + rng.uniform(-.04, .035))
        angle = az + sweep + rng.uniform(-.23, .23)
        forward = (math.cos(angle), .17, math.sin(angle))
        side = (-math.sin(angle), 0., math.cos(angle))
        width = length * rng.uniform(.087, .115)
        phase = rng.uniform(0., math.tau)
        sides = 5
        # The attached roots share a small ring. Individual needle tips sweep
        # around the shoot, with the widest growth staggered between stations.
        points = []
        for i in range(sides):
            turn = phase + math.tau * i / sides
            points.append(add(anchor, add(scale(side, math.sin(turn) * width),
                                          (0., math.cos(turn) * width * .82, 0.))))
        faces = []
        for i in range(17 if close else 14):
            root = i % sides
            turn = phase + math.tau * (root + .5) / sides + rng.uniform(-.42, .42)
            reach = length * rng.uniform(.58, 1.10)
            loop = reach * rng.uniform(.48, .99)
            rise = loop * (.66 * math.cos(turn) + .14 * math.sin(4 * station))
            tip = add(anchor, add(scale(forward, reach * rng.uniform(.37, .96)),
                                  add(scale(side, loop * math.sin(turn)), (0., rise, 0.))))
            faces.append((root, (root + 1) % sides, len(points)))
            points.append(tip)
        needles.append(points, faces, ())


def snow_sleeve(snow, path, radii, rng):
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
        snow.append(points, faces, [[coordinates[i] for i in face] for face in faces])


def pine(mesh, bark, needles, snow, ground_height, profile, i):
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
        length = stature * (1 - t) * rng.uniform(.45, .65) * (.81 + .48 * shelter)
        radius = root * (1 - t) * rng.uniform(.26, .37)
        rise = length * rng.uniform(.04, .16)
        bend = add(hinge, add(scale(horizontal, length * .32), (.07 * lean, -.09 * length, .04)))
        shoulder = add(hinge, add(scale(horizontal, length * .70), (.20 * lean, -.13 * length, .08)))
        elbow = add(hinge, add(scale(horizontal, length * .91), (.32 * lean, -.04 * length, .10)))
        end = add(hinge, add(scale(horizontal, length), (.38 * lean, rise, .10)))
        bark.tube(mesh, [hinge, bend, shoulder, elbow, end],
                  [radius, radius * .84, radius * .56, radius * .31, .005], 5, caps=False)
        if j % 2 == 0:
            snow_sleeve(snow, [bend, shoulder, elbow], [radius * .84, radius * .56, radius * .31], growth)
        for root_point, sweep in ((between(bend, shoulder, .42), -.93), (shoulder, .71), (elbow, -.22)):
            theta = az + sweep + rng.uniform(-.15, .15)
            out = (math.cos(theta), 0, math.sin(theta))
            reach = length * rng.uniform(.38, .60)
            mid = add(root_point, add(scale(out, reach * .53), (.08 * lean, -.063 * reach, 0)))
            tip = add(root_point, add(scale(out, reach), (.15 * lean, reach * rng.uniform(.09, .30), 0)))
            branch = [root_point, mid, tip]
            bark.tube(mesh, branch, [radius * .47, radius * .24, .004], 4, caps=False)
            twig_tufts(needles, branch, theta, growth, min(.39, .205 + reach * .35), close)
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
            twig_tufts(needles, shoot, heading, growth, min(.38, .19 + span * .19), close)
    twig_tufts(needles, trunk[-3:], math.pi if lean < 0 else 0., growth, .29, close)


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

    centerline = road_centerline(site)
    vertices, faces = terrain_geometry(site, centerline)
    support = mesh.mesh_object('Narrow packed snow trail and wind-cut verges', vertices, faces,
                               materials['snow'], REGION)
    mesh.source_uv(support, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'Connected walk surface projected in metres.')
    for face in support.data.polygons:
        face.use_smooth = True
    ground_height = surface_sampler(vertices)
    rock_scan = mesh.material('Pitted exposed rock of the winter pass', '#a8c9ed', 'rock_pitted_mossy', .89)
    for face in ROCKS:
        rock(mesh, rock_scan, materials['snow'], ground_height, face)

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
    # These untextured crowns cast into the bake, then receive live sun and
    # sky. The independent GLB does not need either material or atlas UVs.
    needle_green = mesh.material('Living grey-green winter pine needles', '#628263', rough=.86)
    needle_green.use_backface_culling = False
    foliage = mesh.mesh_object('Pine needle geometry in layered three-dimensional tufts',
                               needles.vertices, needles.faces, needle_green, REGION)
    bpy.data.collections['RUNTIME'].objects.link(foliage)
    mesh.STATIC.objects.unlink(foliage)
    del foliage['one_light_static']
    foliage.data.uv_layers.remove(foliage.data.uv_layers['UVMap'])
    set_crown_normals(foliage.data)
    foliage['snow_court_needle_crowns'] = True
    snow.write(mesh, 'Broken snow ridges along pine boughs', materials['snow'],
               'Joined supported snow strips unfolded in metres.', smooth=True)
    return foliage
