"""The maintained outdoor fabric of the winter pass shelter."""

import math
import random

from snow_court_approach import Geometry


def smoothrise(low, high, value):
    t = min(1., max(0., (value - low) / (high - low)))
    return t * t * (3. - 2. * t)


def sweep_center(route, z):
    for (xa, za), (xb, zb) in zip(route, route[1:]):
        if zb <= z <= za:
            return xa + (xb - xa) * (z - za) / (zb - za)
    return route[0 if z > route[0][1] else -1][0]


def boot_relief(x, z, footprints):
    """Model the heel and toe separately, with a return drift inside each print."""
    depth, tread = 0., 0.
    for px, pz, angle, age in footprints:
        if abs(z - pz) > .28:
            continue
        dx, dz = x - px, z - pz
        across = dx * math.cos(angle) - dz * math.sin(angle)
        along = dx * math.sin(angle) + dz * math.cos(angle)
        heel = ((along - .072) / .084) ** 2 + (across / .066) ** 2
        toe = ((along + .056) / .124) ** 2 + ((across - .011) / .088) ** 2
        shape = min(heel, toe)
        # Wind fills the leeward side first. A few impressions have almost
        # disappeared, while others retain a heel or part of the toe.
        filled = smoothrise(-.071, .063, across + age * .105 - along * .18)
        depression = max(0., 1. - shape) ** 1.3 * (1. - .93 * filled) * (1. - .68 * age)
        rim = math.exp(-((math.sqrt(shape) - 1.025) / .19) ** 2) * (1. - filled)
        depth += .024 * depression - .005 * rim
        tread = max(tread, depression)
    return depth, tread


def swept_ground(mesh, site, materials):
    """Build one court surface, including the thin snow left after sweeping."""
    court = site['court']
    route = site['sweptPath']
    left, right, rear, front, level = (court[key] for key in ('west', 'east', 'rear', 'front', 'level'))
    rng = random.Random(513)
    footprints = []
    for index in range(27):
        z = route[0][1] - .22 - index * .475 + rng.uniform(-.036, .036)
        sign = 1. if index % 2 else -1.
        x = sweep_center(route, z) + .21 + sign * .132 + rng.uniform(-.026, .026)
        footprints.append((x, z, sign * .19 + rng.uniform(-.08, .08), rng.uniform(.07, .96)))
    # Sample the boot centres at actual row coordinates. Keep enough regular
    # rows to describe the intervening snow and contiguous atlas chart.
    stations = [rear + (front + .08 - rear) * i / 119 for i in range(120)]
    for _, z, _, _ in footprints:
        if min(abs(z - station) for station in stations) > .035:
            stations.append(z)
    rim_offsets = (-.71, -.55, -.44, -.345, -.28, -.215, -.15, -.08, 0.,
                   .08, .15, .215, .28, .345, .44, .55, .71)
    far_cols = 21
    stride = 2 * far_cols + len(rim_offsets)
    vertices, treatments, faces, finishes = [], [], [], []
    for row, z in enumerate(sorted(stations)):
        center = sweep_center(route, z)
        rim_bend = .043 * math.sin(z * 2.41) + .027 * math.cos(z * 6.92)
        fade = smoothrise(route[-1][1] - .24, route[-1][1] + .13, z)
        offsets = [offset * (1. + rim_bend) for offset in rim_offsets]
        row_x = [left + (center + offsets[0] - left) * i / far_cols for i in range(far_cols)]
        row_x.extend(center + offset for offset in offsets)
        row_x.extend(right + (center + offsets[-1] - right) * i / far_cols
                     for i in reversed(range(far_cols)))
        for column, x in enumerate(row_x):
            across = x - center
            exposure = .355 + .039 * math.sin(z * 2.34) + .021 * math.sin(z * 9.17)
            lee = .08 * math.sin(z * 3.14 + x * 5.8) * math.sin(z * 1.49)
            seam = abs(across + lee * .42)
            ridge = 1. - fade * (1. - smoothrise(exposure, .82, seam))
            drift = (.063 + .034 * math.sin(1.88 * x + 1.45 * z) * math.cos(z * .91)
                     + .19 * math.exp(-((abs(x) - 9.1) / .91) ** 2))
            depth, tread = boot_relief(x, z, footprints)
            relief = .027 + drift * ridge - depth * fade
            relief += .005 * math.sin(x * 13.1 + z * 8.6) * math.sin(x * 7.0 - z * 10.2)
            vertices.append((x, level + max(.006, relief), z))
            treatments.append((seam - exposure, fade, tread))
            if row and column:
                i = len(vertices) - 1
                face = (i - stride - 1, i - 1, i, i - stride)
                faces.append(face)
                edge = sum(treatments[v][0] for v in face) / 4
                active = min(treatments[v][1] for v in face)
                footprint = max(treatments[v][2] for v in face)
                if active > .73 and edge < -.055 and footprint < .23:
                    finishes.append(1)
                elif active > .32 and edge < .18:
                    finishes.append(2)
                else:
                    finishes.append(0)
    crushed = mesh.material('Snow compacted where the winter court is swept',
                            '#b8c4cd', 'snow_004', .96)
    ground = mesh.mesh_object('Swept grit, buried prints and the connected snow court',
                              vertices, faces, materials['snow'])
    ground.data.materials.append(materials['granite'])
    ground.data.materials.append(crushed)
    mesh.source_uv(ground, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'One continuous x/z chart through swept stone, boot impressions and snow edges.')
    mesh.uv_world(ground, 1.46)
    for polygon, finish in zip(ground.data.polygons, finishes):
        polygon.use_smooth = True
        polygon.material_index = finish
    return ground


def side_aperture(mesh, label, x, z, z0, z1, level, eave, direction, wood, plaster):
    """Cut a real aperture in a side wall while retaining its outside line."""
    width, low, high = 1.64, level + .71, eave - .35
    opening = (z - width / 2, z + width / 2)
    for a, b in ((z0, opening[0]), (opening[1], z1)):
        mesh.box(label + ' masonry beside the opening', (.19, eave - level, b - a),
                 (x, (level + eave) / 2, (a + b) / 2), plaster, .015)
    for a, b in ((level, low), (high, eave)):
        mesh.box(label + ' masonry above or beneath the opening', (.19, b - a, width),
                 (x, (a + b) / 2, z), plaster, .013)
    for zz in opening:
        mesh.box(label + ' late timber jamb', (.20, high - low + .087, .094),
                 (x, (high + low) / 2, zz), wood, .012)
    for yy in (low, high):
        mesh.box(label + ' worn horizontal frame', (.23, .091, width + .088),
                 (x, yy, z), wood, .012)
    return width, low, high, x + direction * .079


def winter_boards(mesh, label, coord, center, width, y0, y1, side, wood):
    rng = random.Random(913 if side else 781)
    tints = ['#b0a296', '#877665', '#9f8f7a', '#806b5a']
    planks = [mesh.material('Reused winter board ' + str(i + 1), tint, 'weathered_planks', .94)
              for i, tint in enumerate(tints)]
    count = round(width / .175)
    for i in range(count):
        along = center - width / 2 + (i + .5) * width / count
        base, top = y0 + rng.uniform(-.022, .014), y1 + rng.uniform(-.019, .023)
        thickness = rng.uniform(.047, .064)
        outer = coord + rng.uniform(-.013, .013)
        dimensions = (width / count - rng.uniform(.003, .010), top - base, thickness)
        location = (along, (base + top) / 2, outer)
        if side:
            dimensions = (dimensions[2], dimensions[1], dimensions[0])
            location = (outer, location[1], along)
        obj = mesh.box(label + ' reused winter plank', dimensions, location,
                       planks[rng.randrange(len(planks))], .007, rng.uniform(-.027, .027))
        offset = rng.uniform(0., 1.)
        for loop in obj.data.uv_layers['UVMap'].data:
            loop.uv.x += offset
    for yy, age in ((y0 + .27, .96), (y1 - .29, .91)):
        outside = coord + .055
        dimensions = (width * age, .103, .050)
        location = (center, yy, outside)
        if side:
            dimensions = (dimensions[2], dimensions[1], dimensions[0])
            location = (outside, yy, center)
        mesh.box(label + ' removable bracing across winter boards', dimensions, location, wood, .008)


def warm_side_window(mesh, area, label, frame_x, z, width, y0, y1, direction, wood, paper):
    window_y = (y1 + y0) / 2
    height = y1 - y0
    backing = frame_x - direction * .11
    mesh.box(label + ' recessed warm oiled paper', (.019, height, width),
             (backing, window_y, z), paper, .003)
    for i in range(1, 9):
        zz = z - width / 2 + width * i / 9
        mesh.box(label + ' slender lattice upright', (.063, height, .027),
                 (frame_x - direction * .056, window_y, zz), wood, .004)
    for i in range(1, 5):
        yy = y0 + height * i / 5
        mesh.box(label + ' slender lattice crossbar', (.063, .026, width),
                 (frame_x - direction * .052, yy, z), wood, .004)
    # The paper scatters soft warm light from a small room behind it.
    area(label + ' low spill from translucent paper',
         (frame_x + direction * .015, window_y, z), (frame_x + direction * 1.7, y0 - .05, z),
         1.8, '#ffcb83', .88)


def replace_roof_tiles(mesh, label, target_x, roof_front):
    """Retint connected clay shells where a few damaged tiles were replaced."""
    clay = mesh.material('Greyer clay of the replaced eave tiles', '#a19a8e', 'grey_roof_tiles', .84)
    names = (label + ' convex cover tile rows', label + ' concave pan tile rows')
    for obj in mesh.STATIC.objects:
        if not obj.name.startswith(names):
            continue
        obj.data.materials.append(clay)
        # Each tile is a separate component in the joined tile shell mesh.
        incident = {}
        for polygon in obj.data.polygons:
            for vi in polygon.vertices:
                incident.setdefault(vi, []).append(polygon.index)
        unseen = set(range(len(obj.data.polygons)))
        while unseen:
            pending = [unseen.pop()]
            component = []
            vertices = set()
            while pending:
                index = pending.pop()
                component.append(index)
                for vi in obj.data.polygons[index].vertices:
                    if vi in vertices:
                        continue
                    vertices.add(vi)
                    for neighbor in incident[vi]:
                        if neighbor in unseen:
                            unseen.remove(neighbor)
                            pending.append(neighbor)
            x = sum(obj.data.vertices[vi].co.x for vi in vertices) / len(vertices)
            z = -sum(obj.data.vertices[vi].co.y for vi in vertices) / len(vertices)
            if abs(x - target_x) <= .32 and roof_front - .72 <= z <= roof_front - .04:
                for index in component:
                    obj.data.polygons[index].material_index = len(obj.data.materials) - 1


def firewood_stack(mesh, site, room, ground, contacts, materials):
    rng = random.Random(775)
    level = site['court']['level']
    end = room['east']
    stack_z = room['front'] - 1.27
    y = level + .22
    stack_x = end + .337
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    shoes = []
    with contacts.group('Granite shoes on the kitchen snow court', [ground]):
        for shift in (-.37, .37):
            perimeter = [(stack_x + dx, stack_z + shift + dz)
                         for dx, dz in ((-.224, -.16), (.224, -.16), (.224, .16), (-.224, .16))]
            foot = [(x, mesh.resting_contact_height(x, z, [ground]) - .001, z) for x, z in perimeter]
            top = [(x, y, z) for x, z in perimeter]
            shoes.append(mesh.mesh_object('Granite shoe under the kitchen fuel rack',
                                          foot + top, faces, materials['granite']))
    slats = []
    with contacts.group('Weathered fuel rack carried by two granite shoes', shoes):
        for shift in (-.111, .111):
            slats.append(mesh.box('Raised hardwood board from the kitchen fuel rack', (.214, .067, 1.02),
                                  (stack_x + shift, y + .0335, stack_z), materials['wood'], .005))
    y += .067
    heart = mesh.material('Fresh and faded split firewood faces', '#b39573', 'weathered_planks', .87)
    pale_wood = mesh.material('Pale exposed firewood sapwood', '#ceb594', 'weathered_planks', .93)
    with contacts.group('Split fuel resting on the raised wood rack', slats):
        for row, count in enumerate((6, 5, 4)):
            for index in range(count):
                center = stack_z + (index - (count - 1) / 2) * .163 + rng.uniform(-.006, .006)
                front = end + rng.uniform(.49, .55)
                rear = end + rng.uniform(.106, .138)
                bottom = y + row * .104
                half = rng.uniform(.064, .073)
                cross = [(-half * .58, 0.), (half * .61, 0.),
                         (half, .032), (half * .64, .104), (-half * .51, .104), (-half, .066)]
                skew = rng.uniform(-.039, .037)
                vertices = [(x, bottom + height, center + offset + drift)
                            for x, drift in ((front, 0.), (rear, skew)) for offset, height in cross]
                sides = [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
                sides.extend((tuple(reversed(range(6))), tuple(range(6, 12))))
                log = mesh.mesh_object('Stacked hand-split winter fuel', vertices, sides, materials['bark'])
                log.data.materials.append(heart)
                log.data.materials.append(pale_wood)
                for i in (0, 2, 3, 6, 7):
                    log.data.polygons[i].material_index = 1 + (i >= 6 and (index + row) % 3 != 0)
                mesh.uv_world(log, .63)
                mesh.bevel(log, .004)


def broom(mesh, site, ground, contacts, materials):
    hall = site['hall']
    post_x, post_z = -3.41, hall['front'] + .52
    base = site['court']['level'] + .046
    x, z = post_x + .27, post_z + .42
    handle = mesh.material('Polished winter birch broom handle', '#9c7650', 'weathered_planks', .79)
    twig = mesh.material('Dry split broom branches', '#786041', rough=.96)
    rng = random.Random(688)
    with contacts.group('Branch broom left leaning on the veranda post', [ground]):
        neck = (x, base + .235, z)
        mesh.curved_tube('Worn birch handle reaching the west veranda post',
                         [neck, (x - .09, base + .71, z - .105),
                          (post_x + .018, base + 1.30, post_z + .119)],
                         [.027, .023, .017], handle, 9)
        fibres = Geometry()
        for _ in range(46):
            offset = rng.uniform(-.137, .137)
            spread = rng.uniform(-.041, .047)
            root = (x + offset * .10, base + rng.uniform(.21, .245), z + spread * .30)
            transition = (x + offset * .60, base + rng.uniform(.070, .138), z + spread * .81)
            tip = (x + offset, base + rng.uniform(0., .024), z + spread)
            fibres.tube(mesh, [root, transition, tip], [.0055, .0036, .0017], 6)
        fibres.write(mesh, 'Individual wiry branches of the swept-path broom', twig,
                     'Connected lengths of bundled broom fibres.')
        for i in range(4):
            yy = base + .204 + i * .008
            points = [(x + .039 * math.cos(math.tau * k / 15), yy,
                       z + .035 * math.sin(math.tau * k / 15)) for k in range(15)]
            mesh.curved_tube('Waxed cord securing the broom bundle', points, [.0038] * 15,
                             materials['rope'], 6, closed=True)
