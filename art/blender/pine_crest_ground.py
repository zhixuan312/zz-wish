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


def inner_bank_tint(x, z, channel_x, width):
    approach = max(0., min(1., (z - 15.) / 3.6, (34. - z) / 4.7))
    distance = max(0., abs(x - channel_x) - width)
    damp = math.exp(-(distance / .50) ** 2)
    patch = .50 + .26 * math.sin(4.23 * x + 1.18 * z) + .22 * math.sin(2.81 * x - 2.35 * z)
    forest = max(0., min(1., (abs(x) - 1.3) / .62, (6. - abs(x)) / 1.6))
    strength = approach * (.34 * damp + (.31 + .36 * patch) * forest)
    return 1. - .67 * strength, 1. - .32 * strength, 1. - .45 * strength


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
        heading = rng.uniform(0., math.tau)
        tip_length = min(clearance - .055, rng.uniform(.125, .211))
        if tip_length < .10:
            continue
        tint = rng.choice(tones)
        # The two needles join at the fallen sheath, a single grounded chart.
        root = len(points)
        points.append((x, height(x, z) + .007, z))
        colors.append(tint)
        border = (-.91, .035, .98, math.pi)
        for offset in border:
            angle = heading + offset
            px, pz = x + .0058 * math.cos(angle), z + .0058 * math.sin(angle)
            points.append((px, height(px, pz) + .007, pz))
            colors.append(tint)
        faces.extend((root, root + 1 + (i + 1) % len(border), root + 1 + i) for i in range(len(border)))
        for branch, offset in enumerate((-.438, .507)):
            direction = heading + offset + rng.uniform(-.052, .052)
            dx, dz = math.cos(direction), math.sin(direction)
            reach = tip_length * rng.uniform(.76, 1.)
            width = rng.uniform(.0041, .0065)
            middle = len(points)
            for along, across, lift in ((.43, -width, .010), (.52, width, .010), (1., 0., .005)):
                px, pz = x + reach * along * dx - across * dz, z + reach * along * dz + across * dx
                points.append((px, height(px, pz) + lift, pz))
                colors.append(tint)
            a, b = root + 1 + branch, root + 2 + branch
            faces.extend(((a, b, middle), (b, middle + 1, middle), (middle, middle + 1, middle + 2)))
    charts = [[(points[i][0], points[i][2]) for i in face] for face in faces]
    return points, faces, charts, colors


def bank_grass(sites, height, rng):
    points, faces, charts, colors = [], [], [], []
    young = mesh.color('#778354')[:3]
    dry = mesh.color('#97886a')[:3]
    foot = mesh.color('#38412c')[:3]
    for x, z, clearance, damp in sites:
        reach_limit = clearance - .055
        if reach_limit < .052:
            continue
        count = rng.randint(6, 10)
        phase = rng.uniform(0., math.tau)
        collar = rng.uniform(.019, .030)
        base = len(points)
        points.append((x, height(x, z) - .022, z))
        colors.append(foot)
        local_uv = [(0., 0.)]
        border = [phase + i * math.tau / count + rng.uniform(-.09, .09) for i in range(count)]
        border.append(border[0] + math.tau)
        for angle in border[:-1]:
            px, pz = x + collar * math.cos(angle), z + collar * math.sin(angle)
            points.append((px, height(px, pz) - .015, pz))
            local_uv.append((px - x, pz - z))
            colors.append(foot)
        for blade, (left, right) in enumerate(zip(border, border[1:])):
            direction = .5 * (left + right)
            dx, dz = math.cos(direction), math.sin(direction)
            reach = min(reach_limit, rng.uniform(.075, .22))
            ground_y = height(x + collar * dx, z + collar * dz)
            tall = rng.uniform(.095, .255) * (.88 + .28 * damp)
            width = rng.uniform(.0062, .0127)
            shape = ((.34, .73, -.53), (.36, .76, .60), (1., .89, rng.uniform(-.46, .42)))
            start = len(points)
            tint = dry if blade % 6 == 0 else young
            for index, (forward, lift, across) in enumerate(shape):
                offset = collar + reach * forward
                px = x + offset * dx - width * across * dz
                pz = z + offset * dz + width * across * dx
                points.append((px, ground_y - .012 + tall * lift, pz))
                arc = collar + math.hypot(reach * forward, tall * lift)
                local_uv.append((arc * dx - width * across * dz, arc * dz + width * across * dx))
                weight = .77 if index < 2 else .98
                colors.append(tuple(a + (b - a) * weight for a, b in zip(foot, tint)))
            a, b = base + 1 + blade, base + 1 + (blade + 1) % count
            tuft_faces = ((base, b, a), (a, b, start), (b, start + 1, start), (start, start + 1, start + 2))
            faces.extend(tuft_faces)
            charts.extend([[local_uv[j - base] for j in face] for face in tuft_faces])
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
    moss = [(x, z, min(allowed * .82, rng.uniform(.23, .51) * (1. + .36 * damp)))
            for i, (x, z, allowed, damp) in enumerate(sites) if i % 3 == 0 or (damp > .62 and i % 2)]
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
    # The existing forest-floor scan contains needle litter across the bank.
    # Only the larger fallen pairs need separate silhouette geometry.
    debris = [site for site in sites[::7] if site[2] > .19]
    tinted_mesh('Tapered fallen pine needles', needles, *needle_litter(debris, height, rng),
                'Conformal planar chart from each fallen sheath through the needle pair.')
    tinted_mesh('Rooted crest sedges', grass, *bank_grass(sites[1::2], height, rng),
                'A radial chart for each rooted sedge clump and its folded blades.')
    crest_roots(pines, height, bark, bark_tube)


def build_inner_banks(rock, section, spring, height):
    rng = random.Random(3843)
    sites = []
    # The forest views look along the inner banks rather than the upper slope.
    for side in (-1, 1):
        for station in range(13):
            z = 17.8 + station * 1.06 + rng.uniform(-.31, .31)
            stream_x, _, width = spring(z)
            x = side * rng.uniform(2.46, 3.35)
            if side * stream_x > 0.:
                x = side * max(abs(x), abs(stream_x) + width + rng.uniform(.34, .63))
            clearance = land_clearance(x, z, section, spring)
            if clearance >= .12:
                damp = math.exp(-((abs(x - stream_x) - width) / .83) ** 2)
                sites.append((x, z, clearance, damp))
    stones = [(x, z, min(.74 * clear, rng.uniform(.10, .27))) for x, z, clear, _ in sites[1::4]]
    tinted_mesh('Small exposed schist in the spring banks', rock, *surface_islands(stones, height, rng, True),
                'Planar charts with exterior rims embedded in the banks.', uv_scale=.59)
    litter = mesh.material('Loose pine needles under the inner banks', '#ffffff', rough=.95)
    grass = mesh.material('Damp bank sedge and dry tips', '#ffffff', rough=.93)
    mesh.vertex_tint_shader(litter)
    mesh.vertex_tint_shader(grass)
    tinted_mesh('Rooted inner-bank pine litter', litter, *needle_litter(sites[::3], height, rng),
                'Continuous planar charts from each fallen sheath into its two needles.')
    tinted_mesh('Rooted sedges between the spring and forest banks', grass, *bank_grass(sites[1::2], height, rng),
                'An unfolding radial chart for each rooted clump.')
