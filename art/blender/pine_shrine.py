"""The abandoned Pine Gate shrine shelter and its unlit stone lamp places."""

import json
import math

from mathutils import Vector

import snow_roof as mesh
from snow_lightmap_charts import source_uv


def shrine_roof(anchor, wood, tiles, moss):
    x, y, z = anchor

    def point(u, t, side):
        height = y + .946 - .047 * (1 - u * u) - t * (.169 + .060 * t)
        height += .011 * math.sin(3.4 * u + .44) + .022 * abs(u) ** 2 * t
        return x - .19 + .635 * u, height, z - .044 + side * .434 * t

    def panel(name, corners, material):
        pts = [*corners, *((px, py - .014, pz) for px, py, pz in corners)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        roof = mesh.mesh_object(name, pts, faces, material, 'niche')
        charts = []
        for i, face in enumerate(roof.data.polygons):
            start = roof.data.vertices[face.vertices[0]].co
            axis = (roof.data.vertices[face.vertices[1]].co - start).normalized()
            across = face.normal.cross(axis)
            charts.append([((roof.data.vertices[j].co - start).dot(axis),
                            (roof.data.vertices[j].co - start).dot(across) + i * .6) for j in face.vertices])
        source_uv(roof, charts, 'Separate shallow ceramic tile faces with metre-scale coordinates.')
        return roof

    for u in (-.88, -.54, -.20, .17, .54, .86):
        line = [point(u, t, side) for side, t in ((-1, 1), (-1, .61), (-1, .26), (1, 0), (1, .29), (1, .66), (1, 1))]
        mesh.curved_tube('Rain-darkened bowed shrine rafter', [(a, b - .037, c) for a, b, c in line],
                         [.021] * len(line), wood, radial=5, region='niche')

    holes = {(-1, 1, 2), (-1, 5, 1), (1, 2, 2), (1, 3, 2), (1, 7, 0)}
    for side in (-1, 1):
        for lane in range(9):
            u = -1 + lane * 2 / 9
            for row in range(3):
                if (side, lane, row) in holes:
                    continue
                t0, t1 = row * .325, min(1., (row + 1) * .325 + .066)
                x0, x1 = u + .011, u + 2 / 9 - .010
                upper = [point(a, b, side) for a, b in ((x0, t0), (x1, t0), (x1, t1), (x0, t1))]
                if side < 0:
                    upper.reverse()
                pottery = tiles[(lane + row * 2) % len(tiles)]
                tile = panel(f'Uneven shrine pan tile {side} {lane} {row}', upper,
                             moss if (lane * 5 + row * 3 + side) % 11 == 0 else pottery)
                tile['moss_edge'] = tile['weather_stone'] = True
            if lane == 0:
                continue
            caps = [point(u, t, side) for t in (.015, .26, .56, .84, .998)]
            mesh.curved_tube('Weathered shrine cover tile', [(a, b + .012, c) for a, b, c in caps],
                             [.017, .018, .018, .017, .014], tiles[lane % len(tiles)], radial=5, region='niche')

    ridge = [point(u, 0, 1) for u in (-1, -.79, -.53, -.26, .03, .28, .53, .81, 1)]
    mesh.curved_tube('Sagging broken-tile ridge on the shrine', [(a, b + .018, c) for a, b, c in ridge],
                     [.024, .025, .024, .022, .021, .023, .026, .025, .023], tiles[1], radial=6, region='niche')


def lamp_terrace(registry_path, stone, supports_height):
    registry = json.loads(registry_path.read_text())
    sizes = {'shrine-low': 6, 'shrine-high': 6, 'valley-wall': 12,
             'terrace-low': 6, 'terrace-high': 6, 'spring-rim': 12}
    slots = registry['slots']
    by_group = {name: [row for row in slots if row['group'] == name] for name in sizes}
    if (registry['version'] != 1 or registry['units'] != 'metres' or len(slots) != 48
            or len({row['id'] for row in slots}) != 48 or any(len(by_group[key]) != value for key, value in sizes.items())):
        raise ValueError('Pine Gate requires the 48 individually named metre-scale seats.')
    supports = {}

    def cap(name, rows, width, depth, yaw, material, thickness=.07):
        x, y, z = rows[0]['position']
        end_x, end_y, end_z = rows[-1]['position']
        if abs(end_y - y) > 1e-8:
            raise ValueError('A stone cap cannot have differing seat heights.')
        surface = mesh.box(name, (width, thickness, depth), ((x + end_x) / 2, y - thickness / 2, (z + end_z) / 2),
                           material, .013, yaw, 'niche')
        surface['moss_edge'] = surface['weather_stone'] = True
        for row in rows:
            supports[row['id']] = surface

    for name in ('shrine-low', 'shrine-high', 'terrace-low', 'terrace-high'):
        rows = by_group[name]
        x, y, front = rows[0]['position']
        back = rows[-1]['position'][2]
        for i, section in enumerate((rows[:3], rows[3:])):
            start, _, near = section[0]['position']
            far = section[-1]['position'][2]
            span = far - near + .205
            cap(f'Cold candle ledge {name} {i + 1}', section, .184, span, 0, stone[(i + 3) % len(stone)])
            h = y - 4.025
            for pier, z in enumerate((near + .028, far - .008)):
                mesh.box(f'Bearing stone under {name} {i + 1} {pier + 1}', (.192, h, .155),
                         (start, 3.965 + h / 2, z), stone[(pier + 1) % len(stone)], .015, region='niche')

    rows = by_group['valley-wall']
    for i in range(4):
        section = rows[i * 3:i * 3 + 3]
        x, y, z = section[1]['position']
        span = section[-1]['position'][0] - section[0]['position'][0] + .188
        cap(f'Valley wall candle coping {i + 1}', section, span, .216, 0, stone[(i + 2) % len(stone)])
        height = y - 4.025
        mesh.box(f'Granite parapet under candle coping {i + 1}', (span - .025, height, .232),
                 (x + .008, 3.965 + height / 2, z), stone[i % len(stone)], .017, region='niche')

    for i, row in enumerate(by_group['spring-rim']):
        x, y, z = row['position']
        yaw = row['yaw']
        cap(f'Spring basin rim lamp stone {i + 1}', [row], .291, .218, yaw, stone[(i + 1) % len(stone)])
        if i == 2:
            # A covered outlet keeps water underneath this seat.
            tangent = Vector((math.cos(yaw), 0, -math.sin(yaw)))
            for side in (-1, 1):
                at = Vector((x, 4.055, z)) + tangent * side * .103
                mesh.box('Dressed spring outlet bearing', (.072, .166, .218), at, stone[2], .013, yaw, 'niche')
        else:
            h = y - 4.023
            mesh.box(f'Spring basin bearing stone {i + 1}', (.274, h, .231),
                     (x, 3.959 + h / 2, z), stone[(i + 3) % len(stone)], .012, yaw, 'niche')

    proof = []
    for row in slots:
        x, y, z = row['position']
        samples = [(x, z), (x - .057, z), (x + .057, z), (x, z - .057), (x, z + .057)]
        positions = [supports_height(a, b, [supports[row['id']]], y + .25) for a, b in samples]
        error = max(abs(actual - y) for actual in positions)
        if error > 1e-6:
            raise RuntimeError(f'Lamp seat {row["id"]} has support error {error} m.')
        proof.append({'id': row['id'], 'position': row['position'], 'yaw': row['yaw'],
                      'support': supports[row['id']].name, 'maximumErrorMetres': error})
    return proof
