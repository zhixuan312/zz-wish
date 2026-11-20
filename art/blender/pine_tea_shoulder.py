"""Site-approval geometry for the Pine Gate spring and tea shoulder."""

from hashlib import sha256
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

from pine_materials import apply_scan
import snow_roof as mesh
from snow_lightmap_charts import lathe_uv, profile_uv, source_uv


def frame(x, y, z, yaw=0.):
    cos, sin = math.cos(yaw), math.sin(yaw)

    def locate(a, b, c):
        return x + a * cos + c * sin, y + b, z - a * sin + c * cos

    return locate


# Interior rectangles on the original 1024 px grey clay scan. The extra
# four-pixel inset keeps filtering away from the photographed tile seams.
EARTH_SHRINE_CLAY_INTERIORS = (
    (100, 139, 181, 258), (161, 199, 181, 257), (226, 264, 194, 258), (286, 327, 292, 355),
    (350, 394, 387, 454), (414, 457, 485, 556), (540, 583, 484, 555), (666, 707, 389, 453),
)


def shrine_clay_uv(patch, u, v):
    left, right, top, bottom = EARTH_SHRINE_CLAY_INTERIORS[patch % len(EARTH_SHRINE_CLAY_INTERIORS)]
    return ((left + 4. + (right - left - 8.) * u) / 1024.,
            1. - (top + 4. + (bottom - top - 8.) * v) / 1024.)


def prism(name, points, material, scan_corners, scan_patch):
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    obj = mesh.mesh_object(name, points, faces, material, 'gate')
    start = obj.data.vertices[0].co
    run = (obj.data.vertices[1].co - start).normalized()
    rise = obj.data.polygons[0].normal.cross(run)
    plane_uv = [((obj.data.vertices[j].co - start).dot(run), (obj.data.vertices[j].co - start).dot(rise))
                for j in range(4)]
    charts = [plane_uv, [(u, v + .5) for u, v in reversed(plane_uv)]]
    distance = 0.
    for i in range(4):
        following = distance + math.dist(points[i], points[(i + 1) % 4])
        charts.append([(distance, 1.0), (distance, 1.018), (following, 1.018), (following, 1.0)])
        distance = following
    source_uv(obj, charts, 'Metre-scale planar faces and one joined edge strip on the ceramic tile.')
    scan = obj.data.uv_layers['UVMap'].data
    for polygon, chart in zip(obj.data.polygons, charts):
        for loop, vertex, (u, v) in zip(polygon.loop_indices, polygon.vertices, chart):
            local = scan_corners[vertex % 4] if polygon.index < 2 else (u / distance, .38 + .24 * (v - 1.) / .018)
            scan[loop].uv = shrine_clay_uv(scan_patch, *local)
    return obj


def shrine_cover_uv(obj, patch):
    chart = obj.data.uv_layers['SourceLightmap'].data
    scan = obj.data.uv_layers['UVMap'].data
    body = obj.data.polygons[:-2]
    circumference = max(chart[loop].uv.x for polygon in body for loop in polygon.loop_indices)
    length = max(chart[loop].uv.y for polygon in body for loop in polygon.loop_indices)
    for polygon in obj.data.polygons:
        coordinates = [chart[loop].uv for loop in polygon.loop_indices]
        if polygon.index < len(body):
            local = [(u / circumference, v / length) for u, v in coordinates]
        else:
            low_u, low_v = (min(values) for values in zip(*coordinates))
            high_u, high_v = (max(values) for values in zip(*coordinates))
            local = [(.35 + .30 * (u - low_u) / (high_u - low_u), .35 + .30 * (v - low_v) / (high_v - low_v))
                     for u, v in coordinates]
        for loop, (u, v) in zip(polygon.loop_indices, local):
            scan[loop].uv = shrine_clay_uv(patch, u, v)


def pavilion_timber_grain(obj, axis):
    along = mesh.point(axis).normalized()
    vertices = [obj.matrix_world @ v.co for v in obj.data.vertices]
    length_min = min(v.dot(along) for v in vertices)
    length_max = max(v.dot(along) for v in vertices)
    span = min(.344, (length_max - length_min) * .73)
    seed = int.from_bytes(sha256(obj.name.encode()).digest()[:2], 'big')
    boards = ((80, 157), (187, 271), (302, 388), (417, 501), (537, 616),
              (649, 730), (765, 846), (886, 957))
    scan = obj.data.uv_layers['UVMap'].data
    for face in obj.data.polygons:
        normal = obj.matrix_world.to_3x3() @ face.normal
        cross = along.cross(normal)
        if cross.length < .20:
            # The end uses a small part of the same weathered board.
            across = mesh.point((1., 0., 0.)) if abs(along.x) < .80 else mesh.point((0., 1., 0.))
            cross = normal.cross(across)
            grain = cross.cross(normal).normalized()
        else:
            grain = along
        cross.normalize()
        points = [vertices[i] for i in face.vertices]
        width_min = min(v.dot(cross) for v in points)
        width = max(v.dot(cross) for v in points) - width_min
        grain_min = length_min if grain is along else min(v.dot(grain) for v in points)
        grain_span = length_max - length_min if grain is along else max(v.dot(grain) for v in points) - grain_min
        lo, hi = boards[(seed + face.index * 3) % len(boards)]
        top = .323 + (1 + math.sin(seed + face.index * 2.4)) * (.342 - span) * .5
        for loop, v in zip(face.loop_indices, points):
            u = (lo + (hi - lo) * (v.dot(cross) - width_min) / max(width, 1e-6)) / 1024
            w = top + span * (v.dot(grain) - grain_min) / max(grain_span, 1e-6)
            scan[loop].uv = (u, w)


# The photo scan includes joints. Each real roof piece uses the interior of
# one photographed tile, keeping those old joints out of the new geometry.
PAVILION_TILE_PATCHES = ((71, 101, 151, 211), (162, 196, 309, 366), (235, 273, 531, 589),
                         (373, 410, 719, 773), (497, 529, 826, 872), (615, 648, 614, 684),
                         (776, 811, 387, 438), (937, 967, 848, 900))


def pavilion_tile(name, grid, width, length, thickness, side, material, patch):
    rows, columns = len(grid), len(grid[0])
    upper = [point for row in grid for point in row]
    count = len(upper)
    points = upper + [(x, y - thickness, z) for x, y, z in upper]
    uv = [(width * column / (columns - 1), length * row / (rows - 1))
          for row in range(rows) for column in range(columns)]
    faces = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            face = (a, a + 1, a + columns + 1, a + columns)
            faces.append(tuple(reversed(face)) if side > 0 else face)
    visible = len(faces)
    charts = [[uv[i] for i in face] for face in faces]
    for face in faces[:visible]:
        other = tuple(reversed(face))
        faces.append(tuple(i + count for i in other))
        charts.append([(uv[i][0] + width + .026, uv[i][1]) for i in other])
    rim = (list(range(columns - 1)) + [row * columns + columns - 1 for row in range(rows - 1)]
           + [count - 1 - column for column in range(columns - 1)]
           + [row * columns for row in range(rows - 1, 0, -1)])
    if side > 0:
        rim.reverse()
    edge = length + .028
    run = 0.
    for a, b in zip(rim, rim[1:] + rim[:1]):
        following = run + math.dist(points[a], points[b])
        faces.append((b, a, a + count, b + count))
        charts.append([(following, edge), (run, edge), (run, edge + thickness), (following, edge + thickness)])
        run = following
    tile = mesh.mesh_object(name, points, faces, material, 'gate')
    source_uv(tile, charts, 'Sloped ceramic faces and their joined cut clay edges. Metres.')
    scan = tile.data.uv_layers['UVMap'].data
    u0, u1, v0, v1 = PAVILION_TILE_PATCHES[patch % len(PAVILION_TILE_PATCHES)]
    for polygon in tile.data.polygons:
        polygon.use_smooth = polygon.index < 2 * visible
        for loop, vertex, chart in zip(polygon.loop_indices, polygon.vertices, charts[polygon.index]):
            w, t = uv[vertex % count]
            if polygon.index < 2 * visible:
                u, v = w / width, t / length
            else:
                u, v = chart[0] / run, .42 + .15 * (chart[1] - edge) / thickness
            scan[loop].uv = ((u0 + (u1 - u0) * u) / 1024, 1 - (v0 + (v1 - v0) * v) / 1024)
    return tile


def pavilion_pan(name, surface, side, lane, course, x0, x1, t0, t1, depth, material):
    grid = []
    for row in (0., .58, 1.):
        rail = []
        for section in (0., .25, .5, .75, 1.):
            nicks = .005 * row ** 3 * (.5 + .5 * math.sin(section * 13.3 + lane * 5 + 3 * course))
            x, y, z = surface(x0 + (x1 - x0) * section, t0 + (t1 - t0) * row - nicks, side)
            trough = (.013 + .0022 * math.sin(lane * 2.7 + course * 4.3)) * math.sin(math.pi * section)
            rail.append((x, y - trough - .006 * course, z))
        grid.append(rail)
    return pavilion_tile(name, grid, x1 - x0, (t1 - t0) * depth, .016, side, material, lane * 5 + course * 3 + side)


def pavilion_cover(name, surface, side, lane, x, depth, material):
    for course, (start, finish) in enumerate(((.035, .374), (.349, .694), (.674, .994))):
        grid = []
        for row in (0., .46, 1.):
            t = start + (finish - start) * row
            section = []
            for u in (0., .166, .333, .5, .667, .834, 1.):
                angle = math.pi * u
                px, y, z = surface(x - (.022 + t * .001) * math.cos(angle), t, side)
                lip = .0055 * row ** 4
                section.append((px, y + .002 + (.020 - .003 * row) * math.sin(angle) + lip - .006 * course, z))
            grid.append(section)
        tile = pavilion_tile(f'{name} {course + 1}', grid, .064, (finish - start) * depth, .008, side,
                              material, lane * 3 + course * 5 + side)
        tile['weather_stone'] = tile['moss_edge'] = True


def small_roof(name, locate, width, depth, base, wood, tiles, repair, pavilion=False):
    def surface(x, t, side):
        bow = .032 * ((x / width) ** 2 - .6)
        y = base + .27 * (1 - t) ** 1.13 + bow + .018 * t ** 4
        return locate(x, y, side * t * depth)

    for lane in range(6):
        x = (lane / 5 * 2 - 1) * width * .92
        points = [surface(x, t, side) for side, t in ((-1, 1), (-1, .58), (-1, .26), (1, 0), (1, .31), (1, .66), (1, 1))]
        rafter = mesh.curved_tube(f'{name} exposed cedar rafter {lane + 1}', [(x, y - .049, z) for x, y, z in points],
                                  [.025] * len(points), wood, radial=5, region='gate')
        if pavilion:
            pavilion_timber_grain(rafter, (0., 0., 1.))

    for side in (-1, 1):
        for lane in range(9):
            x0 = -width + (lane + .052) * width * 2 / 9
            x1 = -width + (lane + .925) * width * 2 / 9
            for course in range(3):
                t0, t1 = course * .319, min(1, (course + 1) * .319 + .064)
                tile = tiles[(lane + course * 2) % len(tiles)]
                if (lane, course, side) in ((1, 1, 1), (4, 1, 1), (4, 2, 1), (7, 0, -1), (8, 0, -1)):
                    tile = repair
                label = f'{name} clay pan tile {side} {lane} {course}'
                if pavilion:
                    panel = pavilion_pan(label, surface, side, lane, course, x0, x1, t0, t1, depth, tile)
                else:
                    upper = [surface(x, t, side) for x, t in ((x0, t0), (x1, t0), (x1, t1), (x0, t1))]
                    scan_corners = [(0., 0.), (1., 0.), (1., 1.), (0., 1.)]
                    if side > 0:
                        upper.reverse()
                        scan_corners.reverse()
                    panel = prism(label, upper + [(x, y - .018, z) for x, y, z in upper], tile,
                                  scan_corners, lane * 5 + course * 3 + side)
                panel['weather_stone'] = panel['moss_edge'] = True
            if lane:
                x = -width + lane * width * 2 / 9
                label = f'{name} clay cover tile {side} {lane}'
                if pavilion:
                    pavilion_cover(label, surface, side, lane, x, depth, tiles[lane % len(tiles)])
                else:
                    rail = [surface(x, t, side) for t in (.035, .35, .65, .994)]
                    cover = mesh.curved_tube(label, [(x, y + .011, z) for x, y, z in rail],
                                            [.020, .022, .022, .018], tiles[lane % len(tiles)], radial=5, region='gate')
                    shrine_cover_uv(cover, lane * 3 + side)
    ridge = [surface(width * (i / 6 * 2 - 1), 0, 1) for i in range(7)]
    mesh.curved_tube(f'{name} old clay ridge', [(x, y + .022, z) for x, y, z in ridge],
                     [.038, .035, .032, .030, .032, .034, .037], tiles[1], radial=6, region='gate')


def small_flame(name, base, height, region='gate'):
    warm = mesh.material('Small warm flames in the shoulder fixtures', '#ffc273', rough=.76, emission=.77)
    mesh.lathe(name, [(0, 0), (height * .135, height * .14), (height * .196, height * .36),
               (height * .118, height * .69), (0, height)], base, warm, 9, region)


def stone_figure_piece(name, locate, material, profile, sectors, relief, form=1., interval=None):
    # Each row is height, half-width, depth centre, and half-depth in metres.
    rings = []
    for first, second in zip(profile, profile[1:]):
        count = math.ceil((second[0] - first[0]) / interval) if interval else 1
        rings.extend(tuple(a + (b - a) * (j / count) for a, b in zip(first, second))
                     for j in range(count))
    rings.append(profile[-1])
    points = []
    for height, width, centre, depth in rings:
        for col in range(sectors):
            angle = -math.pi + math.tau * col / sectors
            sine, cosine = math.sin(angle), math.cos(angle)
            x = width * math.copysign(abs(sine) ** form, sine)
            z = centre + depth * math.copysign(abs(cosine) ** form, cosine)
            if cosine > 0:
                z += relief(x, height) * cosine ** .6
            # Small irregularities on the old carving are large enough to
            # catch side light, without turning its silhouette into rubble.
            wear = .0011 * math.sin(7 * angle + height * 100) * math.cos(11 * angle - height * 59)
            points.append((x + wear * sine, height, z + wear * cosine))
    faces = [tuple(reversed(range(sectors))), tuple(range(len(points) - sectors, len(points)))]
    for row in range(len(rings) - 1):
        for col in range(sectors):
            a, b = row * sectors + col, row * sectors + (col + 1) % sectors
            faces.append((a, b, b + sectors, a + sectors))
    piece = mesh.mesh_object(name, [locate(*point) for point in points], faces, material, 'gate')
    # Use the broadest ring for the side chart. A beard's narrow tip is a
    # poor measure of the texel density needed farther up its length.
    reference = max(range(len(rings)), key=lambda i: rings[i][1] + rings[i][3])
    start = reference * sectors
    circumference = [0.]
    for col in range(sectors):
        circumference.append(circumference[-1] + math.dist(points[start + col], points[start + (col + 1) % sectors]))
    cap_v = 0.
    charts = []
    for cap in faces[:2]:
        left = min(points[index][0] for index in cap)
        near = min(points[index][2] for index in cap)
        charts.append([(circumference[-1] + .03 + points[index][0] - left,
                        cap_v + points[index][2] - near) for index in cap])
        cap_v += max(points[index][2] for index in cap) - near + .03
    for face in faces[2:]:
        wraps = face[0] % sectors == sectors - 1
        charts.append([(circumference[sectors if wraps and index % sectors == 0 else index % sectors],
                        points[index][1] - rings[0][0]) for index in face])
    source_uv(piece, charts, 'A rear-seam side strip and two planar caps, retaining metre-scale relief detail.')
    chart = piece.data.uv_layers['SourceLightmap']
    scan = piece.data.uv_layers['UVMap']
    for source, target in zip(chart.data, scan.data):
        target.uv = source.uv / .48
    for face in piece.data.polygons:
        face.use_smooth = face.index >= 2


def carved_earth_god(locate, granite):
    # The unchanged feet of the figure bear directly on the existing dais.
    def seated(x, y, z):
        return locate(x, .379 + y, -.25 + z)

    def bell(value, at, width):
        return math.exp(-((value - at) / width) ** 2)

    def robe(x, y):
        side = abs(x)
        collar = bell(side, .032 + .30 * (y - .178), .012) * bell(y, .228, .053)
        sleeves = bell(side, .089 + .11 * (y - .15), .046) * bell(y, .151, .052)
        cuff = bell(y, .129 + .24 * side, .012) * bell(side, .082, .029)
        sweep = bell(y, .073 + side * .17, .022) * bell(side, .093, .07)
        wrists = bell(y, .133 - .13 * x, .021) * bell(side, .035, .052)
        cut = bell(y, .128 + .36 * x, .005) * bell(x, .005, .034)
        return .009 * collar + .023 * sleeves - .009 * cuff + .011 * sweep + .015 * wrists - .004 * cut

    def face(x, y):
        side = abs(x)
        hollow = bell(side, .031, .020) * bell(y, .340 + side * .10, .010)
        brow = bell(side, .032, .025) * bell(y, .354 - 3.3 * (side - .026) ** 2, .008)
        eyelid = bell(side, .030, .021) * bell(y, .343 + side * .10, .0045)
        nose = bell(x, -.002, .014) * (.012 * bell(y, .337, .024) + .017 * bell(y, .318, .010))
        nostril = bell(side, .0105, .0065) * bell(y, .311, .0045)
        cheeks = bell(side, .044, .020) * bell(y, .317, .026)
        moustache = bell(side, .023, .022) * bell(y, .301 - side * .11, .006)
        mouth = bell(y, .292 + 2.6 * x * x, .004) * bell(x, 0., .028)
        return -.009 * hollow + .007 * brow + .004 * eyelid + nose - .005 * nostril + .006 * cheeks + .007 * moustache - .006 * mouth

    def beard(x, y):
        taper = (.299 - y) * x * 4.7
        carved = math.cos((x + taper) * 306. + y * 29.) + .55 * math.cos(x * 136. - y * 38.)
        return .0026 * carved * bell(y, .243, .055)

    def hat(x, y):
        return .008 * bell(abs(x), .071, .026) * bell(y, .385, .011)

    # The broad felt cap, worn facial cuts, long tapered beard and lap are
    # original relief shapes, carved from the same pale weathered stone.
    stone_figure_piece('Earth god seated robe and folded sleeves', seated, granite,
                       ((0., .151, -.009, .105), (.029, .171, -.008, .128), (.076, .174, -.004, .136),
                        (.132, .161, -.008, .117), (.188, .132, -.014, .102),
                        (.226, .128, -.018, .087), (.262, .092, -.012, .079), (.291, .048, .002, .048)),
                       36, robe, .86, .014)
    stone_figure_piece('Earth god rounded head with carved face and brows', seated, granite,
                       ((.260, .039, .005, .043), (.281, .052, .012, .051), (.303, .063, .013, .061),
                        (.332, .070, .010, .064), (.355, .066, .009, .058),
                        (.371, .063, .004, .051), (.392, .047, .002, .041)),
                       56, face, .96, .005)
    stone_figure_piece('Earth god broad carved cap and worn brim', seated, granite,
                       ((.366, .067, .001, .054), (.373, .085, .003, .071), (.381, .106, .004, .074),
                        (.391, .105, .002, .073), (.402, .091, -.004, .067), (.427, .084, -.005, .061),
                        (.447, .069, -.006, .053), (.455, .051, -.006, .042)),
                       40, hat, .68)
    stone_figure_piece('Earth god long carved beard at the chest', seated, granite,
                       ((.171, .004, .109, .007), (.184, .025, .111, .014),
                        (.211, .040, .106, .020), (.241, .051, .098, .024),
                        (.269, .059, .085, .026), (.281, .054, .078, .020), (.293, .041, .065, .008)),
                       40, beard, .86, .007)


def shrine_daylight(locate):
    source = bpy.data.lights.new('Soft daylight returned from the earth shrine threshold', 'AREA')
    source.energy = .56
    source.color = (.80, .85, .88)
    source.shape = 'RECTANGLE'
    source.size, source.size_y = .54, .42
    bounce = bpy.data.objects.new(source.name, source)
    bpy.data.collections['LIGHTS'].objects.link(bounce)
    bounce.location = mesh.point(locate(0, 1.0, .42))
    aim = mesh.point(locate(0, .54, -.32))
    bounce.rotation_euler = (aim - bounce.location).to_track_quat('-Z', 'Y').to_euler()
    # This local bounce remains in the authored daylight pass. The ambient
    # role would remove it along with the fallback world and sun.
    bounce['bake_role'] = 'threshold-bounce'


def earth_shrine(stone, wood, tiles, repair, clay, iron, statue_granite, contacts):
    yaw = .70
    locate = frame(-3., 4., 3., yaw)
    plaster = mesh.material('Earth shrine weathered ochre limewash', '#aa8d60', 'stone_pavers', .92)
    mesh.box('Small earth shrine old granite foundation', (1.76, .182, 1.52), locate(0, .081, 0),
             stone[3], .027, yaw, 'gate')
    for side in (-1, 1):
        mesh.box('Old granite lower course of the earth shrine', (.244, .241, 1.19), locate(side * .67, .28, 0),
                 stone[side % len(stone)], .020, yaw, 'gate')
        mesh.box('Earth shrine side rendered in ochre lime', (.216, .970, 1.18), locate(side * .67, .874, -.025),
                 plaster, .023, yaw, 'gate')
        mesh.box('Granite jamb of the earth shrine doorway', (.175, 1.11, .214), locate(side * .61, .726, .573),
                 stone[2], .018, yaw, 'gate')
    mesh.box('Sheltered ochre stone rear wall', (1.39, 1.15, .192), locate(0, .747, -.557),
             plaster, .014, yaw, 'gate')
    mesh.box('Weathered granite cross stone over the shrine opening', (1.45, .175, .24), locate(0, 1.352, .565),
             stone[4], .026, yaw, 'gate')
    for row in (-1, 1):
        mesh.box('Cedar bearing plate on the earth shrine masonry', (1.51, .135, .14), locate(0, 1.416, row * .554),
                 wood, .012, yaw, 'gate')
    small_roof('Earth shrine', locate, 1.10, .818, 1.458, wood, tiles, repair)

    altar = mesh.box('Stone offering and oil-lamp ledge before the earth god', (1.25, .119, .40),
                     locate(0, .5085, .314), stone[1], .017, yaw, 'gate')
    mesh.box('Stone support under the earth shrine altar', (1.12, .36, .34),
             locate(0, .287, .31), stone[2], .024, yaw, 'gate')
    mesh.box('Stone dais inside the little earth shrine', (.625, .226, .52), locate(0, .266, -.248),
             stone[4], .026, yaw, 'gate')
    carved_earth_god(locate, statue_granite)
    with contacts.group('Earth shrine oil lamp', [altar]):
        mesh.lathe('Plain earthen oil lamp before the image', [(0, 0), (.019, 0), (.030, .006), (.038, .017),
                   (.032, .023), (.025, .014), (0, .014)], (-3.18, 4.568, 3.47), clay, 18, 'gate')
        mesh.beam('Cloth wick on the ordinary shrine lamp', (-3.18, 4.588, 3.49), (-3.18, 4.604, 3.501),
                  .0017, iron, .0012, 'gate')
    small_flame('Low flame in the earth shrine oil lamp', (-3.18, 4.604, 3.501), .028)
    shrine_daylight(locate)


def storm_lantern(iron, clay):
    x, z = 2.55, 3.
    glass = mesh.material('Weathered honey mica of the tea-pavilion lamp', '#a2814e', rough=.36)
    glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .34
    mesh.lathe('Plain storm-lantern foot', [(0, 0), (.078, 0), (.080, .033), (.067, .041), (0, .041)],
               (x, 5.33, z), iron, 12, 'gate')
    mesh.lathe('Amber mica around the pavilion storm lantern', [(0, 0), (.065, .007), (.071, .026),
               (.067, .216), (.054, .242), (0, .242)], (x, 5.367, z), glass, 12, 'gate')
    mesh.lathe('Plain storm-lantern rain cap', [(0, 0), (.086, 0), (.083, .012), (.053, .045), (0, .050)],
               (x, 5.605, z), iron, 12, 'gate')
    for i in range(6):
        angle = i * math.tau / 6
        offset = (.072 * math.cos(angle), .072 * math.sin(angle))
        mesh.beam('Thin storm-lantern protective rib', (x + offset[0], 5.367, z + offset[1]),
                  (x + offset[0] * .86, 5.620, z + offset[1] * .86), .0030, iron, .0025, 'gate')
    mesh.curved_tube('Iron hanger from the tea pavilion front beam', [(x, 5.645, z), (x + .034, 5.694, z),
                     (x, 5.748, z), (x, 5.819, z)], [.0042] * 4, iron, radial=6, region='gate')
    mesh.lathe('Ordinary lamp central earthen cup', [(0, 0), (.023, 0), (.019, .016), (0, .016)],
               (x, 5.371, z), clay, 10, 'gate')
    mesh.beam('Wick inside the pavilion lantern', (x, 5.387, z), (x, 5.407, z), .0015, iron, .0011, 'gate')
    small_flame('Steady small flame inside the pavilion lamp', (x, 5.407, z), .050)


def tea_pavilion(stone, wood, tiles, repair, clay, iron, contacts):
    locate = frame(2., 4., 2.35)
    for side in (-1, 1):
        for row in (-1, 1):
            x, z = side * .737, row * .56
            mesh.box('Shaped stone footing of pavilion post', (.28, .149, .275), locate(x, .070, z),
                     stone[4], .030, region='gate')
            post = mesh.box('Bare tea-pavilion timber post', (.134, 1.67, .146), locate(x, .97, z),
                            wood, .015, region='gate')
            pavilion_timber_grain(post, (0., 1., 0.))
            bracket = mesh.beam('Timber bracket under pavilion eave', locate(x, 1.516, z),
                                locate(x - side * .29, 1.760, z), .041, wood, .035, 'gate')
            pavilion_timber_grain(bracket, (-side * .29, .244, 0.))
    for row in (-1, 1):
        eave = mesh.box('Tea pavilion open-side eave beam', (1.88, .160, .171), locate(0, 1.824, row * .64),
                        wood, .013, region='gate')
        pavilion_timber_grain(eave, (1., 0., 0.))
    small_roof('Tea pavilion', locate, 1.06, .841, 1.90, wood, tiles, repair, pavilion=True)
    storm_lantern(iron, clay)

    table = mesh.box('Worn low granite tea table', (.91, .088, .60), locate(.043, .638, -.04),
                     stone[3], .030, region='gate')
    for side in (-1, 1):
        mesh.box('Stone support under tea table', (.196, .60, .396), locate(side * .329, .299, -.04),
                 stone[2], .017, region='gate')
        seat = mesh.box('Simple tea pavilion bench seat', (.243, .074, .658), locate(side * .58, .394, -.04),
                        wood, .013, region='gate')
        pavilion_timber_grain(seat, (0., 0., 1.))
        for row in (-1, 1):
            leg = mesh.box('Bench bearing leg', (.137, .37, .136), locate(side * .58, .178, -.04 + row * .224),
                           wood, .014, region='gate')
            pavilion_timber_grain(leg, (0., 1., 0.))
    bowls = [(0, 0), (.024, 0), (.031, .009), (.045, .039), (.049, .052),
             (.046, .056), (.042, .052), (.037, .031), (.024, .010), (0, .009)]
    with contacts.group('Tea pavilion coarse bowls', [table]):
        for a, b in ((-.197, .07), (.117, .082), (.184, -.164)):
            mesh.lathe('Coarse tea bowl on the stone table', bowls, locate(a, .682, b), clay, 20, 'gate')

    ash = mesh.material('Dull grey ash under the tea stove', '#7b7669', rough=.95)
    black = mesh.material('Charcoal left in the tea stove', '#393630', rough=.98)
    mesh.lathe('Small earthen tea stove', [(0, 0), (.119, 0), (.127, .03), (.139, .202),
               (.124, .226), (.102, .218), (.092, .160), (.083, .145), (0, .142)],
               locate(-.54, .002, .445), clay, 18, 'gate')
    mesh.lathe('Warm ash in the tea stove', [(0, 0), (.083, 0), (.089, .005), (0, .009)],
               locate(-.54, .149, .445), ash, 18, 'gate')
    for a, b, c in ((-.593, .164, .459), (-.505, .167, .421), (-.52, .166, .482), (-.562, .164, .412)):
        mesh.box('Cold charcoal fragment resting in ash', (.023, .016, .014), locate(a, b, c),
                 black, .003, a + c, 'gate')
    bamboo = mesh.material('Weathered bamboo used for tea tools', '#929379', rough=.74)
    mesh.beam('Carrying pole left against the pavilion post', locate(.433, .019, .678), locate(.718, 1.31, .546),
              .015, bamboo, .012, 'gate')
    mesh.beam('Bamboo broom handle against the same post', locate(.42, .088, .735), locate(.686, .92, .574),
              .010, bamboo, .008, 'gate')
    for t in (-.044, -.024, 0, .022, .042):
        mesh.beam('Bound bamboo broom bristle', locate(.42 + t, .013, .743), locate(.42 + t * .40, .142, .725),
                  .006, bamboo, .005, 'gate')


def spring_basin(wood):
    centre = (2.20, 3.988, 4.35)
    waterline = 4.188
    sectors = 48
    angles = [math.tau * col / sectors for col in range(sectors)]
    # The same irregular outline controls the wetted wall and the meniscus.
    outline = [1 + .020 * math.sin(3 * a + .5) + .010 * math.cos(7 * a - .9)
               + .006 * math.sin(13 * a + 1.7) for a in angles]

    def turn(name, profile, material, rim_wear=False):
        points, rings, faces = [], [], []
        for radius, height in profile:
            start = len(points)
            for col in range(sectors if radius else 1):
                a = angles[col]
                r = radius * outline[col]
                worn = (.006 * math.sin(4 * a - .4) + .003 * math.cos(11 * a)) if rim_wear and height >= .235 else 0
                points.append((centre[0] + r * math.cos(a), centre[1] + height + worn, centre[2] + r * math.sin(a)))
            rings.append(range(start, len(points)))
        for first, last in zip(rings, rings[1:]):
            for col in range(sectors):
                following = (col + 1) % sectors
                if len(first) == 1:
                    faces.append((first[0], last[col], last[following]))
                elif len(last) == 1:
                    faces.append((first[col], last[0], first[following]))
                else:
                    faces.append((first[col], last[col], last[following], first[following]))
        obj = mesh.mesh_object(name, points, faces, material, 'gate')
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj, points, rings, faces

    granite = apply_scan(mesh.material('Wet carved granite of the spring basin', '#b2aea3'), 'mossy_rock', .54)
    granite['pine_spring_waterline'] = (centre[0], waterline, centre[2])
    inner_top = (.339, .217)
    inner_bottom = (.321, .067)
    bowl_profile = [(0, 0), (.337, 0), (.408, .036), (.429, .065), (.450, .199),
                    (.447, .235), (.432, .255), (.395, .261), (.365, .252),
                    (.351, .237), inner_top, inner_bottom, (.296, .063), (0, .062)]
    bowl, _, rings, _ = turn('Low worn granite spring basin with a real hollow', bowl_profile, granite, rim_wear=True)
    lathe_uv(bowl, bowl_profile, rings, sectors)
    # A continuous meridian strip keeps the scan's grain the same size on
    # the exterior and in the hollow. Keep the lightmap chart at metre scale.
    chart = bowl.data.uv_layers['SourceLightmap']
    for corner, material_uv in zip(chart.data, bowl.data.uv_layers['UVMap'].data):
        material_uv.uv = corner.uv / .52

    mouth_start = Vector((2.68, 4.506, 4.998))
    mouth_end = Vector((2.355, 4.445, 4.566))
    impact = (2.326, waterline, 4.536)
    water = mesh.material('Clear water in the granite spring basin', '#99988b', rough=.105)
    water['pine_spring_impact'] = impact
    water['pine_spring_depth'] = waterline - centre[1] - bowl_profile[-1][1]
    water.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .045
    water.surface_render_method = 'BLENDED'
    level = waterline - centre[1]
    wall_slope = (inner_top[0] - inner_bottom[0]) / (inner_top[1] - inner_bottom[1])
    radius_at_level = inner_bottom[0] + (level - inner_bottom[1]) * wall_slope
    # The edge follows the interpolated inner wall at the meniscus height.
    meniscus = ((.0004, .0019), (.0028, .0011), (.008, .00025), (.015, 0))
    water_profile = [(radius_at_level + lift * wall_slope - inset, level + lift) for inset, lift in meniscus]
    water_profile.extend(((.258, level), (0, level)))
    liquid, points, rings, faces = turn('Water surface and curved meniscus below the spring basin rim',
                                       water_profile, water)
    source_uv(liquid, [[(points[i][0], points[i][2]) for i in face] for face in faces],
              'Continuous plan chart through the shallow spring water and its curved meniscus.')
    edge_coverage = {i: coverage for ring, coverage in zip(rings, (.48, .86, 1, 1, 1, 1)) for i in ring}
    uv = liquid.data.uv_layers['UVMap'].data
    for polygon in liquid.data.polygons:
        for loop, index in zip(polygon.loop_indices, polygon.vertices):
            uv[loop].uv = (edge_coverage[index], 0)

    mesh.box('Old wood support beneath the spring pipe', (.084, .388, .084), (2.56, 4.188, 4.786),
             wood, .011, region='gate')
    spring_spout(mouth_start, mouth_end, impact)


def spring_spout(start, end, impact):
    axis = (end - start).normalized()
    side = axis.cross(Vector((0, 1, 0))).normalized()
    down = axis.cross(side).normalized()
    # A weathered bamboo node is a ridge in the tube, with an open bevel at
    # the outlet and a dark inner wall, including the bottom of the cut.
    profile = [(0., .032), (.201, .031), (.214, .033), (.229, .031),
               (.620, .029), (.634, .031), (.649, .029), (.896, .0275),
               (.913, .0292), (.929, .0275), (1., .027), (1., .022),
               (.935, .022), (.14, .027), (0., .027)]
    bamboo = mesh.material('Weathered hollow bamboo spring spout', '#a08d55', rough=.58)
    points, faces, charts = [], [], []
    sides = 18
    length = (end - start).length
    chart_stations = [0.]
    for a, b in zip(profile, profile[1:] + profile[:1]):
        chart_stations.append(chart_stations[-1] + math.hypot((b[0] - a[0]) * length, b[1] - a[1]))
    for station, radius in profile:
        for col in range(sides):
            theta = math.tau * col / sides
            cut = (.004 + .005 * math.sin(theta)) * max(0., (station - .94) / .06)
            point = start.lerp(end, station) + cut * axis + radius * (math.cos(theta) * side + math.sin(theta) * down)
            points.append(tuple(point))
    circumference = math.tau * .032
    for row in range(len(profile)):
        following = (row + 1) % len(profile)
        v, next_v = chart_stations[row:row + 2]
        for col in range(sides):
            next_col = (col + 1) % sides
            faces.append((row * sides + col, row * sides + next_col,
                          following * sides + next_col, following * sides + col))
            u, next_u = col / sides * circumference, (col + 1) / sides * circumference
            charts.append(((u, v), (next_u, v), (next_u, next_v), (u, next_v)))
    pipe = mesh.mesh_object('Bamboo feed with an open cut, thick lip and raised nodes', points, faces, bamboo, 'gate')
    source_uv(pipe, charts, 'Connected metre-scale bamboo wall, cut-end and inner wall.')
    uv = pipe.data.uv_layers['UVMap'].data
    for polygon, coordinates in zip(pipe.data.polygons, charts):
        polygon.use_smooth = polygon.index // sides not in (10, 14)
        for loop, (u, v) in zip(polygon.loop_indices, coordinates):
            uv[loop].uv = (u / circumference, v / chart_stations[-1])
    bamboo['pine_spring_bamboo_lip'] = chart_stations[10] / chart_stations[-1]
    bamboo['pine_spring_bamboo_inner'] = chart_stations[11] / chart_stations[-1]

    # The falling thread leaves the low inner edge and accelerates downwards
    # under gravity. End it just below the sheet so the impact never gaps.
    launch = end + axis * .007 + down * .0185
    landing = Vector((impact[0], impact[1] - .0005, impact[2]))
    jet = mesh.material('Running spring water below the bamboo spout', '#b3b1a3', rough=.11)
    jet.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = .11
    jet.surface_render_method = 'BLENDED'
    arc, radii = [], []
    for i in range(10):
        t = i / 9
        point = launch.lerp(landing, t)
        point.y = launch.y - (launch.y - landing.y) * (.12 * t + .88 * t * t)
        arc.append(tuple(point))
        radii.append(.0040 - .0012 * t)
    mesh.curved_tube('Continuous curved spring jet into the basin', arc, radii, jet, radial=9, region='gate')


def candle_wax(name, color, roughness):
    material = mesh.material(name, color, rough=roughness)
    surface = material.node_tree.nodes.get('Principled BSDF')
    surface.inputs['IOR'].default_value = 1.43
    surface.inputs['Coat Weight'].default_value = .13
    surface.inputs['Coat Roughness'].default_value = .31
    surface.inputs['Subsurface Weight'].default_value = .09
    surface.inputs['Subsurface Radius'].default_value = (1., .56, .28)
    surface.inputs['Subsurface Scale'].default_value = .0028
    return material


def wax_lightmap_density(obj):
    # The thin wax profiles fill the frame. Allocate more atlas space to their
    # existing charts while keeping the sculpt's material UVs untouched.
    chart = obj.data.uv_layers['SourceLightmap']
    for corner in chart.data:
        corner.uv *= 2.5


def wax_spill_layer(locate, a, c, radius, direction, height, material, index):
    extent = radius * (.66 + .12 * math.sin(index * 2.3))
    x, y, z = locate(a + radius * .91 * math.cos(direction), 0, c + radius * .91 * math.sin(direction))
    profile = [(0., -.00055), (extent * .99, -.00055), (extent, .00014),
               (extent * .94, height * .35), (extent * .73, height * .81),
               (extent * .38, height), (0., height * .81)]
    layer = mesh.lathe(f'Older wax run fused underneath stub {index + 1}', profile, (x, y, z),
                       material, 28, 'niche')
    cos, sin = math.cos(direction), math.sin(direction)
    for vertex in layer.data.vertices:
        dx, dz = vertex.co.x - x, -vertex.co.y - z
        angle = math.atan2(dz, dx)
        ripple = 1. + .082 * math.sin(3 * angle + index) + .048 * math.cos(7 * angle - index)
        along = (dx * cos + dz * sin) * (1.12 + .16 * math.cos(index))
        across = (-dx * sin + dz * cos) * (.61 + .14 * math.sin(index))
        vertex.co.x = x + (cos * along - sin * across) * ripple
        vertex.co.y = -z - (sin * along + cos * across) * ripple
    for face in layer.data.polygons:
        face.use_smooth = True
    mesh.uv_world(layer, .034)
    wax_lightmap_density(layer)


def spent_wax_on_sill(locate, iron, sculpt_normal):
    wax_materials = [candle_wax(f'Weathered cold wax tone {i + 1}', color, roughness)
                     for i, (color, roughness) in enumerate((('#b7aa90', .64), ('#ab9c80', .68),
                                                             ('#c0b398', .57), ('#b0a184', .63)))]
    if sculpt_normal:
        for material in wax_materials:
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            image = nodes.new('ShaderNodeTexImage')
            image.image = sculpt_normal
            normal = nodes.new('ShaderNodeNormalMap')
            normal.inputs['Strength'].default_value = .31
            links.new(image.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])
    # Keep the owner dish empty, with the larger remnants gathered at the sides.
    remnants = ((-.170, -.034, .013, .015), (-.110, -.009, .011, .006),
                (-.100, -.056, .007, .004), (-.109, .061, .011, .014),
                (-.066, .076, .009, .004), (-.068, .115, .008, .010),
                (.102, -.058, .009, .007), (.126, .004, .011, .017),
                (.094, .050, .009, .006), (.071, .084, .008, .006),
                (.126, .078, .009, .010))
    for i, (a, c, radius, height) in enumerate(remnants):
        spill = min(.0017, height * .24)
        taper = .58 + .068 * (i % 5)
        spread = 1.17 + .063 * (i % 4)
        profile = [(0, -.0004), (radius * spread, -.0004), (radius * spread, spill * .17),
                   (radius * (spread - .05), spill * .28), (radius * (spread - .09), spill * .41),
                   (radius * (spread - .12), spill * .50), (radius * 1.03, spill),
                   (radius * 1.01, height * .28), (radius * .99, height * .49),
                   (radius * .97, height * .67), (radius * .93, height * .87),
                   (radius * .88, height * .96), (radius * taper, height),
                   (radius * (taper - .09), height * .93),
                   (radius * .46, height * .69), (radius * .23, height * .47), (0, height * .42)]
        x, y, z = locate(a, 0, c)
        wax = mesh.lathe(f'Burnt-out candle fused to the sill {i + 1}', profile, (x, y, z),
                         wax_materials[i % len(wax_materials)], 48, 'niche')
        for vertex in wax.data.vertices:
            dx, dz = vertex.co.x - x, -vertex.co.y - z
            radial = math.hypot(dx, dz) / radius
            elevation = vertex.co.z - y
            age = max(0., elevation / height)
            angle = math.atan2(dx, dz)
            tide = 1 - min(1., max(0., elevation) / (spill + .0012))
            main_flow = max(0., math.cos(angle - i * 2.11)) ** 7
            old_flow = max(0., math.cos(angle - i * 1.73 - 1.64)) ** 10
            flow = .18 * main_flow + .12 * old_flow
            lobes = .026 * math.sin(angle * 3 + i * 1.63) + .043 * math.sin(angle * 2 - i * 1.7)
            vertical = max(0., 1. - age) ** .4
            surface = min(1., max(0., (radial - .60) / .34))
            scale = 1. + lobes + surface * (tide * (1.5 * flow - .060) + vertical * flow)
            vertex.co.x = x + dx * scale
            vertex.co.y = -z - dz * scale
            mouth = max(0., (age - .43) / .57)
            collapse = max(0., math.cos(angle + i * 2.12 + .2)) ** (3 + i % 4)
            lobe = math.sin(angle * 5. + i * .8) * .018 + .045 * math.sin(angle * 2. - i)
            vertex.co.z += height * mouth * (lobe - (.27 + .08 * (i % 3)) * collapse)
        for face in wax.data.polygons:
            face.use_smooth = True
        wax_lightmap_density(wax)
        if sculpt_normal:
            mesh.uv_world(wax, .034)
            if i % 2 == 0 or height >= .014:
                spill_height = min(.0019, .45 * height)
                wax_spill_layer(locate, a, c, radius, i * 2.11 - .28, spill_height,
                                wax_materials[(i + 1) % len(wax_materials)], i)
        mesh.curved_tube(f'Extinguished charred wick {i + 1}',
                         [locate(a, height * .42 - .0006, c),
                          locate(a + .0005 * math.cos(i), height * .42 + .0018, c - .0003),
                          locate(a + .0016 * math.cos(i), height * .42 + .0025, c - .0012)],
                         [.00076, .00066, .0004], iron, radial=7, region='niche')


def dressed_shrine_stone(name, locate, x, z, material, profile, seed):
    section = ((-.72, -1), (.70, -1), (1, -.70), (1, .68),
               (.69, 1), (-.73, 1), (-1, .70), (-1, -.76))
    width = len(section)
    points = [locate(x + u * (half_width + .0015 * math.sin(i * 2.3 + seed)), height,
                     z + v * (half_depth + .0019 * math.cos(i * 1.6 + row * .27 - seed)))
              for row, (height, half_width, half_depth) in enumerate(profile) for i, (u, v) in enumerate(section)]
    last = (len(profile) - 1) * width
    faces = [tuple(range(width)), tuple(reversed(range(last, last + width)))]
    for row in range(len(profile) - 1):
        first, second = row * width, (row + 1) * width
        for i in range(width):
            j = (i + 1) % width
            faces.append((first + i, second + i, second + j, first + j))
    stone = mesh.mesh_object(name, points, faces, material, 'niche')
    profile_uv(stone, width, len(profile), {0, 1}, 1)
    return stone


def pierced_lamp_shrine(anchor, stone, ledge, iron, contacts, sculpt_normal):
    locate = frame(anchor[0], anchor[1], anchor[2])
    foundation = dressed_shrine_stone('Broad coursed foundation of the stone lamp shrine', locate, 0, 0,
                                      stone[4], ((-1.003, .310, .274), (-.981, .331, .291),
                                                 (-.842, .328, .286), (-.815, .314, .274),
                                                 (-.791, .272, .244)), 5.1)
    foundation['weather_stone'] = foundation['moss_edge'] = True
    shaft = dressed_shrine_stone('Battered rectangular shaft of the pierced lamp shrine', locate, 0, 0,
                                stone[2], ((-.793, .242, .205), (-.774, .249, .212),
                                           (-.728, .237, .201), (-.700, .214, .189),
                                           (-.319, .188, .157), (-.162, .180, .149),
                                           (-.135, .213, .182), (-.111, .235, .199),
                                           (-.091, .229, .191)), 1.7)
    shaft['weather_stone'] = True
    # Moss and lichen live on the foot of the shaft, up to 12 cm above the shrine's own base.
    shaft['shrine_moss_base'] = anchor[1]
    shelf = mesh.box('Single hewn wick shelf', (.552, .092, .469), locate(0, -.046, 0), ledge, .024, region='niche')
    # Spent wax runs over the shelf's front edge; masked into the same granite, not a new material.
    shelf['shrine_wax_drip'] = True
    pier_profile = ((-.002, .045, .044), (.017, .046, .044), (.033, .044, .041),
                    (.054, .040, .037), (.118, .040, .036), (.210, .039, .036),
                    (.250, .040, .037), (.277, .044, .041), (.304, .045, .042))
    for side in (-1, 1):
        for row in (-1, 1):
            pier = dressed_shrine_stone('Chisel-dressed granite pier in the pierced shrine', locate,
                                       side * .211, row * .177, ledge, pier_profile, side * 1.7 + row * 3.2)
            pier['matched_granite'] = True
    lintel = mesh.box('Weathered stone lintel around the open crown', (.551, .069, .472), locate(0, .337, 0),
                      stone[2], .026, region='niche')
    # The visitor's flame deposits soot on the lintel underside directly above the wick.
    lintel['shrine_soot'] = True
    roof = dressed_shrine_stone('Four pitched sides of the hewn lantern roof', locate, 0, 0, stone[3],
                               ((.370, .270, .227), (.388, .296, .250), (.407, .308, .263),
                                (.428, .301, .257), (.495, .251, .066), (.511, .216, .049)), 4.8)
    roof['weather_stone'] = roof['moss_edge'] = True
    # The roof's upper face holds the same lichen as the foundation, from its own top down. The mask
    # climbs 12 cm above this height, so pass the roof's top minus that band.
    roof['shrine_moss_base'] = anchor[1] + .495
    mesh.beam('Old iron peg for wishes below the centre seat', locate(-.078, -.081, .208),
              locate(-.078, -.081, .244), .005, iron, .004, 'niche')
    with contacts.group('Spent wax fused to the wick shelf', [shelf]):
        spent_wax_on_sill(locate, iron, sculpt_normal)
        hanging_wax_on_shelf_edge(locate)
    wax = candle_wax('Wax of the two remaining short candles', '#a29476', .46)
    for a, c, h, radius in ((-.143, -.105, .026, .014), (.139, -.081, .019, .012)):
        stub = mesh.lathe('Earlier candle still burning on the outer sill', [(0, 0), (radius * 1.33, 0),
                          (radius * 1.26, .0007), (radius, .005), (radius * .95, h * .87),
                          (radius * .89, h), (radius * .71, h * .98), (radius * .58, h * .93),
                          (radius * .33, h * .88), (0, h * .88)], locate(a, .0002, c), wax, 28, 'niche')
        for face in stub.data.polygons:
            face.use_smooth = True
        wax_lightmap_density(stub)
        mesh.beam('Black wick of an earlier wish', locate(a, h * .9, c), locate(a + .001, h + .005, c),
                  .0011, iron, .0009, 'niche')
        small_flame('Short earlier wish still burning on the outer sill', locate(a + .001, h + .005, c), .017, 'niche')


def hanging_wax_on_shelf_edge(locate):
    """Two or three old spills that ran over the shelf's front edge and set there.

    They hang from the lip, well outside the centre where the visitor's own tray stands, so they never
    cover the tray the burning view is composed around."""
    wax = candle_wax('Cold wax run over the shelf lip', '#b3a68c', .66)
    # (a, c, radius, drop) in the shrine's own frame: front of the shelf is z = +.2345, its top y = 0.
    # Radius is half the run's width: 7.5-8.5 mm gives the 1.5-1.7 cm width an old spill has, with a
    # 2.2-3.0 cm drop below the lip.
    # The shelf's front lip is z = +.2345, so a run that has come over the edge centres on it.
    for index, (a, c, radius, drop) in enumerate(((-.196, .232, .0085, .030),
                                                  (.171, .233, .0075, .022))):
        # Keep the run cheap in the atlas: a short profile and twelve sides read as a set bead at the
        # distances the burning view uses. The profile runs from the lowest point upward, because the
        # lathe winds its quads outward only when the radii are walked in that direction; descending
        # here turned every face inside out and the runs rendered as black backfaces.
        profile = [(0, -drop), (radius * .30, -drop * .92), (radius * .62, -drop * .62),
                   (radius * .92, -.006), (radius, 0), (0, 0)]
        x, y, z = locate(a, -.0034, c)
        drip = mesh.lathe(f'Old wax run over the shelf edge {index + 1}', profile, (x, y, z), wax, 12, 'niche')
        for vertex in drip.data.vertices:
            # Wobble the run's section only. The height axis must be left alone: writing it from the
            # depth offset flattened the profile onto the pier face and read as a pale triangle.
            dx, dz = vertex.co.x - x, vertex.co.z - z
            angle = math.atan2(dx, dz)
            wobble = .16 * math.sin(angle * 3. + index * 2.1) + .09 * math.sin(angle * 5. - index)
            vertex.co.x = x + dx * (1. + wobble)
            vertex.co.z = z + dz * (1. + wobble)
        for face in drip.data.polygons:
            face.use_smooth = True
        # The shelf's own charts already own this corner of the atlas; the run gets no extra claim on it.



def load_old_wax_normal(sculpt_dir):
    receipt = json.loads((sculpt_dir / 'wax-sculpt.json').read_text())
    sculpt_source = Path(__file__).with_name('pine_wax_sculpt.py')
    if receipt['sourceSha256'] != sha256(sculpt_source.read_bytes()).hexdigest():
        raise RuntimeError('The wax normal bake belongs to a different sculpt source.')
    spec = receipt['normalMaps']['oldSpill']
    image = sculpt_dir / 'pine-old-wax-normal.png'
    if spec['uri'] != image.name or sha256(image.read_bytes()).hexdigest() != spec['sha256']:
        raise RuntimeError('The baked old wax normal did not match its receipt.')
    texture = bpy.data.images.load(str(image), check_existing=True)
    texture.colorspace_settings.name = 'Non-Color'
    texture.pack()
    bpy.context.scene['pine_old_wax_sculpt_proof'] = json.dumps(spec)
    return texture


def build_tea_shoulder(anchor, stone, wood, tiles, clay, iron, ledge, contacts, sculpt_dir=None):
    repair = mesh.material('Small unglazed replacement tiles on old roofs', '#a7a395', 'grey_roof_tiles', .73)
    earth_shrine(stone, wood, tiles, repair, clay, iron, ledge, contacts)
    tea_pavilion(stone, wood, tiles, repair, clay, iron, contacts)
    spring_basin(wood)
    pierced_lamp_shrine(anchor, stone, ledge, iron, contacts, load_old_wax_normal(sculpt_dir) if sculpt_dir else None)
