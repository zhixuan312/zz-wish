"""Ground the crest vegetation on measured Pine Gate terrain without moving the site."""

import math
import random

from mathutils import Vector

import snow_roof as mesh
from snow_lightmap_charts import source_uv


def crest_soil_tint(x, z):
    """Dark, cool leaf mould under the trees, grading into ordinary approach soil."""
    along = max(0., min(1., (z - 5.8) / 1.9, (22. - z) / 6.5))
    sides = max(0., min(1., (abs(x) - 1.15) / .88, (8.8 - abs(x)) / 2.6))
    patch = .73 + .18 * math.sin(1.07 * x + 1.19 * z) + .09 * math.sin(2.72 * x - .78 * z)
    strength = along * sides * patch
    return 1. - .44 * strength, 1. - .24 * strength, 1. - .09 * strength


def tinted_mesh(name, material, points, faces, charts, colors, method, *, smooth=False, uv_scale=None):
    obj = mesh.mesh_object(name, points, faces, material, 'approach')
    source_uv(obj, charts, method)
    if uv_scale is not None:
        mesh.uv_world(obj, uv_scale)
    colors_layer = obj.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
    for face in obj.data.polygons:
        face.use_smooth = smooth
        for loop in face.loop_indices:
            vertex = obj.data.loops[loop].vertex_index
            colors_layer.data[loop].color = (*colors[vertex], 1.)
    obj.data.color_attributes.active_color = colors_layer
    return obj


def land_clearance(x, z, section, spring):
    centre, span = section(z)
    channel, _, half_width = spring(z)
    stair_clear = abs(x - centre) - span - .49
    stream_clear = abs(x - channel) - half_width - .19
    landing_clear = max(abs(x) - 4.49, z - 6.74)
    return min(stair_clear, stream_clear, landing_clear)


def cover_stations(section, spring, rng):
    """Vary density beside water and in shoulders, with a clear stone verge."""
    for side in (-1, 1):
        for row in range(16):
            for col in range(6):
                x = side * (1.98 + col * .69 + rng.uniform(-.26, .26))
                z = 6.46 + row * .68 + rng.uniform(-.29, .29)
                clearance = land_clearance(x, z, section, spring)
                creek_x, _, creek_width = spring(z)
                damp = math.exp(-((abs(x - creek_x) - creek_width) / 1.2) ** 2)
                cover = .59 + .19 * math.sin(1.2 * x + 1.64 * z) + .19 * damp
                if clearance > .12 and rng.random() < cover:
                    yield x, z, clearance, damp


def surface_islands(sites, height, rng, rock):
    """Return draped moss cushions or shallow schist with buried outside rims."""
    points, faces, colors = [], [], []
    for x, z, radius in sites:
        start = len(points)
        count = rng.choice((7, 8, 10))
        phase = rng.uniform(0., math.tau)
        shape = rng.uniform(.62, .96)
        centre_y = height(x, z)
        peak = radius * rng.uniform(.29, .57) if rock else rng.uniform(.023, .061)
        profiles = ((.39, .86), (.75, .63), (1., -.06)) if rock else ((.53, .86), (.84, .40), (1., -.012))
        rim = [(phase + step * math.tau / count + rng.uniform(-.11, .11), rng.uniform(.82, 1.04))
               for step in range(count)]
        colors.extend([(.61, .68, .58) if rock else (.29, .69, .27)])
        points.append((x, centre_y + peak, z))
        for level, (fraction, relief) in enumerate(profiles):
            for angle, skew in rim:
                px = x + math.cos(angle) * radius * skew * fraction
                pz = z + math.sin(angle) * radius * skew * fraction * shape
                local_height = height(px, pz)
                lift = peak * relief * rng.uniform(.67, 1.22) if relief > 0. else relief
                if rock and lift > 0.:
                    lift += .13 * (px - x) - .075 * (pz - z)
                points.append((px, local_height + lift, pz))
                if rock:
                    shade = rng.uniform(.53, .91)
                    colors.append((shade * .83, shade, shade * .87))
                else:
                    shade = rng.uniform(.76, 1.07) * (1. if level == 0 else .75)
                    colors.append((.37 * shade, .76 * shade, .32 * shade))
        for step in range(count):
            nxt = (step + 1) % count
            faces.append((start, start + 1 + nxt, start + 1 + step))
            for level in range(len(profiles) - 1):
                a = start + 1 + level * count
                b = a + count
                faces.append((a + step, a + nxt, b + nxt, b + step))
    charts = [[(points[i][0], points[i][2]) for i in face] for face in faces]
    return points, faces, charts, colors


def needle_litter(sites, height, rng):
    points, faces, colors = [], [], []
    tones = [mesh.color(tone)[:3] for tone in ('#594836', '#665038', '#706044', '#75634a', '#94774f')]
    for x, z, clearance, _ in sites:
        for _ in range(2):
            x0, z0 = x + rng.uniform(-.045, .045), z + rng.uniform(-.043, .043)
            heading = rng.uniform(0., math.tau)
            tip_length = min(clearance - .055, rng.uniform(.102, .196))
            if tip_length < .08:
                continue
            root = len(points)
            tint = rng.choice(tones)
            points.append((x0, height(x0, z0) + .007, z0))
            colors.append(tint)
            for offset in (-.29, .31, 2.4):
                direction = heading + offset + rng.uniform(-.052, .052)
                dx, dz = math.cos(direction), math.sin(direction)
                reach = tip_length * rng.uniform(.68, 1.)
                width = rng.uniform(.0034, .0061)
                middle = len(points)
                for along, across, lift in ((.46, width, .010), (.49, -width, .010), (1., 0., .005)):
                    px, pz = x0 + reach * along * dx - across * dz, z0 + reach * along * dz + across * dx
                    points.append((px, height(px, pz) + lift, pz))
                    colors.append(tint)
                faces.extend(((root, middle, middle + 1), (middle, middle + 2, middle + 1)))
    charts = [[(points[i][0], points[i][2]) for i in face] for face in faces]
    return points, faces, charts, colors


def bank_grass(sites, height, rng):
    points, faces, charts, colors = [], [], [], []
    young = mesh.color('#778354')[:3]
    dry = mesh.color('#97886a')[:3]
    foot = mesh.color('#38412c')[:3]
    for x, z, clearance, damp in sites:
        for blade in range(rng.randint(5, 9)):
            direction = rng.uniform(0., math.tau)
            dx, dz = math.cos(direction), math.sin(direction)
            x0, z0 = x + rng.uniform(-.06, .06), z + rng.uniform(-.06, .06)
            reach = min(clearance - .08, rng.uniform(.065, .21))
            if reach < .036:
                continue
            y0 = height(x0, z0)
            tall = rng.uniform(.095, .255) * (.88 + .28 * damp)
            width = rng.uniform(.0062, .0127)
            shape = ((0., 0., -.26), (0., 0., .39), (.34, .73, -.53), (.36, .76, .60), (1., .89, .16))
            start = len(points)
            tint = dry if blade % 6 == 0 else young
            for index, (forward, lift, across) in enumerate(shape):
                px = x0 + reach * forward * dx - width * across * dz
                pz = z0 + reach * forward * dz + width * across * dx
                points.append((px, y0 - .012 + tall * lift, pz))
                weight = .14 if index < 2 else .77 if index < 4 else .98
                colors.append(tuple(a + (b - a) * weight for a, b in zip(foot, tint)))
            for face in ((0, 1, 2), (1, 3, 2), (2, 3, 4)):
                faces.append(tuple(start + j for j in face))
                charts.append([(shape[j][2] * width, math.hypot(reach * shape[j][0], tall * shape[j][1]))
                               for j in face])
    return points, faces, charts, colors


def crest_roots(pines, height, bark, tube):
    west, east = pines
    routes = (
        (west, ((0., 0.), (-.32, .40), (-.71, .76), (-1.27, 1.09), (-1.48, 1.46))),
        (west, ((0., 0.), (-.31, .58), (-.48, .98), (-.61, 1.41), (-.99, 1.98))),
        (east, ((0., 0.), (-.025, .57), (.04, 1.14), (.11, 1.68), (.105, 2.31))),
        (east, ((0., 0.), (-.07, .68), (-.04, 1.17), (-.075, 1.47), (-.06, 1.82))),
    )
    for i, ((x, z), outline) in enumerate(routes):
        points = []
        for row, (dx, dz) in enumerate(outline):
            px, pz = x + dx, z + dz
            lift = (-.092, -.060, .017, .012, -.037)[row]
            points.append(Vector((px, height(px, pz) + lift, pz)))
        tube(f'Crest pine side root {i + 1}', points, [.086, .074, .053, .027, .006], bark, 6)


def build_crest_ground(ground, rock, bark, section, spring, height, pines, bark_tube):
    rng = random.Random(27411)
    sites = list(cover_stations(section, spring, rng))
    moss = [(x, z, min(allowed * .82, rng.uniform(.14, .39) * (1. + .36 * damp)))
            for i, (x, z, allowed, damp) in enumerate(sites) if i % 3 != 1 or damp > .47]
    schist = [(x, z, min(.70 * allowed, rng.uniform(.19, .46)))
             for x, z, allowed, _ in sites if allowed > .39 and rng.random() < .21]
    tinted_mesh('Damp moss cushions under the old pines', ground, *surface_islands(moss, height, rng, False),
                'Terrain-projected moss islands with embedded margins.', smooth=True, uv_scale=.42)
    tinted_mesh('Part-buried crest schist', rock, *surface_islands(schist, height, rng, True),
                'Terrain-projected schist with buried outer rims.', uv_scale=.69)
    needles = mesh.material('Fallen and weathered pine needles', '#ffffff', rough=.97)
    grass = mesh.material('Moist crest sedge and dry blade tips', '#ffffff', rough=.92)
    for material in (needles, grass):
        mesh.vertex_tint_shader(material)
    tinted_mesh('Tapered fallen pine needles', needles, *needle_litter(sites[::2], height, rng),
                'Conformal planar charts for fallen needles in paired shoots.')
    tinted_mesh('Rooted crest sedges', grass, *bank_grass(sites[1::2], height, rng),
                'Separate longitudinal charts for folded sedge blades.')
    crest_roots(pines, height, bark, bark_tube)
