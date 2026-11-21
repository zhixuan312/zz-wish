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


def boot_relief(x, z, footprints, sole_scale=1.):
    """Model the heel and toe separately, with a return drift inside each print."""
    depth, tread = 0., 0.
    for px, pz, angle, age in footprints:
        if abs(z - pz) > .28:
            continue
        dx, dz = x - px, z - pz
        across = (dx * math.cos(angle) - dz * math.sin(angle)) / sole_scale
        along = (dx * math.sin(angle) + dz * math.cos(angle)) / sole_scale
        heel = ((along - .089) / .074) ** 2 + (across / .067) ** 2
        toe = ((along + .069) / .105) ** 2 + ((across - .011) / .094) ** 2
        shape = min(heel, toe)
        # Wind fills the leeward side first. A few impressions have almost
        # disappeared, while others retain a heel or part of the toe.
        filled = smoothrise(-.037, .040, across + age * .093 - along * .23)
        depression = max(0., 1. - shape) ** .79 * (1. - .95 * filled) * (1. - .73 * age)
        rim = math.exp(-((math.sqrt(shape) - 1.024) / .19) ** 2) * (1. - filled) * (1. - age)
        depth += .036 * depression - .006 * rim
        tread = max(tread, depression)
    return depth, tread


def swept_surface(x, z, across, seam, exposure, fade, tread):
    """Model a snowy walking lane, with short broom passes and displaced snow."""
    side = 1. if across >= 0. else -1.
    inside = 1. - smoothrise(exposure - .095, exposure + .11, seam)
    local = fade * (1. - smoothrise(.55, .651, abs(across)))

    # The bristle fan curves across each half of the path. Interrupted passes
    # and small deposits of blown snow soften the marks between sweeps.
    phase = z * 11.9 + side * 7.8 * across * across + .61 * math.sin(z * 3.2 + side * .7)
    fan = smoothrise(.08, .92, math.cos(phase))
    continuity = .48 + .23 * math.sin(z * 4.37 + x * 7.21) + .21 * math.cos(z * 7.23 - x * 3.89)
    marks = local * inside * fan * smoothrise(.10, .68, continuity)
    dust = .5 + .26 * math.sin(z * 5.16 + x * 5.62) + .23 * math.cos(z * 8.27 - x * 10.71)

    # Accumulation is asymmetric with a steeper foot on the swept side.
    # Fresh wind tongues fill some gaps and hide the top of older piles.
    lip = exposure + .113 + .034 * math.sin(z * 5.13 + side * 1.9)
    step = smoothrise(lip - .107, lip - .026, seam)
    shoulder = 1. - smoothrise(lip + .012, lip + .173, seam)
    load = .61 + .25 * math.sin(z * 3.83 + side * 1.2) + .14 * math.cos(z * 7.11 - side * 1.6)
    ridge = local * step * shoulder * load
    displacement = .092 * ridge - .007 * marks + .012 * dust * local * inside

    # Packed snow keeps most of the scan's albedo. The signs of use are
    # intermittent ridges, bristle arcs and the sheltered half of each print.
    pressed = local * inside * (.165 + .066 * (1. - dust))
    heel_toe = fade * smoothrise(.035, .50, tread)
    tint = tuple(1. - pressed * coefficient - .055 * marks - .35 * heel_toe + .11 * ridge
                 for coefficient in (.92, 1., 1.06))
    return displacement, tint


def refine_sole_triangles(vertices, faces, footprints, sample):
    """Split shared edges locally, retaining the adjacent unswept triangles."""
    # Deep, fresh impressions need the finest samples. A faint old sole
    # retains the first split as its rim disappears under the drifting snow.
    for age_limit, half_width, half_length in ((.76, .078, .144), (.36, .064, .123)):
        new_edges = {}
        for face in faces:
            xs, _, zs = zip(*(vertices[i] for i in face))
            left, right, near, far = min(xs), max(xs), min(zs), max(zs)
            if not any(age < age_limit and left - half_width < x < right + half_width
                       and near - half_length < z < far + half_length for x, z, _angle, age in footprints):
                continue
            for a, b in zip(face, (*face[1:], face[0])):
                edge = tuple(sorted((a, b)))
                if edge not in new_edges:
                    x = (vertices[a][0] + vertices[b][0]) / 2
                    z = (vertices[a][2] + vertices[b][2]) / 2
                    new_edges[edge] = sample(x, z)
        split = []
        for face in faces:
            edges = [new_edges.get(tuple(sorted((a, b))))
                     for a, b in zip(face, (*face[1:], face[0]))]
            count = sum(i is not None for i in edges)
            if count == 0:
                split.append(face)
                continue
            if count == 3:
                a, b, c = face
                ab, bc, ca = edges
                split.extend(((a, ab, ca), (ab, b, bc), (bc, c, ca), (ab, bc, ca)))
                continue
            start = edges.index(None) + 1 if count == 2 else next(i for i, v in enumerate(edges) if v is not None)
            a, b, c = (face[(start + i) % 3] for i in range(3))
            ab, bc = (edges[(start + i) % 3] for i in range(2))
            if count == 2:
                split.extend(((a, ab, c), (ab, b, bc), (ab, bc, c)))
            else:
                split.extend(((a, ab, c), (ab, b, c)))
        faces = split
    return faces


def wall_foot_snow(site, x, z):
    """Catch blown snow below the quiet eaves, clear of the walked lane."""
    hall = site['hall']
    near_centre = smoothrise(1.48, 2.01, abs(x))

    def drift(distance, along, phase):
        # A compact lip against the wall grades into a longer feather.
        length = .68 + .19 * math.sin(along * 1.91 + phase)
        lip = smoothrise(-.11, .095, distance) * (1. - smoothrise(.22, length, distance))
        mass = .67 + .20 * math.sin(along * 2.56 + phase) + .13 * math.cos(along * 5.32 - phase)
        return lip * mass

    hall_end = 1. - smoothrise(3.76, 4.67, abs(x))
    hall_snow = .165 * drift(z - (hall['front'] + .38), x, .73) * hall_end
    side_snow = 0.
    for room, side in zip(site['rooms'], (-1, 1)):
        face = room['east'] if side < 0 else room['west']
        end = smoothrise(room['rear'] - .29, room['rear'] + .11, z)
        end *= 1. - smoothrise(room['front'] - .24, room['front'] + .58, z)
        side_snow += .14 * drift(side * (face - x), z, 2.3 * side) * end
        width = 1. - smoothrise(room['east'], room['east'] + .41, x)
        width *= smoothrise(room['west'] - .41, room['west'], x)
        side_snow += .10 * drift(z - (room['front'] + .12), x, side) * width
    # Leave the measured supports under the broom and fuel rack as authored.
    broom_foot = math.hypot((x + 3.14) / .74, (z - hall['front'] - .94) / .79)
    kitchen = site['kitchen']
    rack = math.hypot((x - kitchen['east'] - .035) / .85, (z - kitchen['front'] - .21) / .73)
    keep_supports = smoothrise(.98, 1.48, broom_foot) * smoothrise(.98, 1.48, rack)
    return near_centre * keep_supports * max(hall_snow, side_snow)


def drift_roof_snow(mesh, label):
    """Shape unequal loads along each eave while keeping the settled seam."""
    caps = [obj for obj in mesh.STATIC.objects if obj.name.startswith(label + ' curved settled snow cap')]
    if len(caps) != 2:
        raise RuntimeError('Expected two authored snow caps for ' + label)
    for cap in caps:
        vertices = cap.data.vertices
        half = len(vertices) // 2
        for i in range(half):
            top, base = vertices[i].co, vertices[i + half].co
            if abs(top.x - base.x) > 1e-5 or abs(top.y - base.y) > 1e-5 or base.z > top.z:
                raise RuntimeError('Roof snow layers no longer match for ' + label)
            depth = top.z - base.z
            # Preserve the closed tile seam and the certified deep-cover limit.
            flank = smoothrise(.06, .13, depth) * (1. - .55 * smoothrise(.22, .43, depth))
            gust = .067 * math.sin(top.x * 1.74 - top.y * 2.13)
            gust += .046 * math.sin(top.x * 3.94 + top.y * 2.74) + .027 * math.cos(top.x * 5.15 + top.y * .43)
            eroded = min(depth, .238)
            top.z = base.z + max(eroded, depth + flank * gust)
        cap.data.update()


def swept_ground(mesh, site, materials):
    """Build one court surface, including the thin snow left after sweeping."""
    court = site['court']
    route = site['sweptPath']
    left, right, rear, front, level = (court[key] for key in ('west', 'east', 'rear', 'front', 'level'))
    rng = random.Random(513)
    footprints = []
    z = route[0][1] - .22
    for index in range(27):
        if index:
            z -= rng.uniform(.395, .545)
        sign = 1. if index % 2 else -1.
        x = sweep_center(route, z) + .166 + sign * .114 + rng.uniform(-.043, .043)
        drifted = smoothrise(.12, .81, math.sin(z * 2.41 - .57))
        age = min(.99, rng.uniform(.08, .86) + .34 * drifted)
        footprints.append((x, z, sign * .16 + rng.uniform(-.19, .19), age))

    # A few slab faces break through on the lee side of the swept lane.
    # Keep intact snow between them and clear of the boot track.
    scoured_stones = ((7.12, -.14, .13, .24), (5.46, -.16, .13, .32),
                     (4.69, -.17, .10, .18), (2.90, -.17, .15, .35),
                     (.94, -.12, .12, .22), (-.24, -.19, .12, .23),
                     (-1.36, -.15, .15, .29))

    def stone_exposure(across, z):
        for pz, px, width, length in scoured_stones:
            t = (z - pz) / length
            if abs(t) < 1.22:
                u = (across - px) / width + .31 * t
                texture = .15 * math.sin(17. * z + across * 23.)
                cover = abs(u) ** 2.4 + abs(t) ** 2.2 + texture
                return .76 * (1. - smoothrise(.19, 1.32, cover))
        return 0.

    # Keep granite colour under a continuous skin of frost. A material
    # boundary along the triangulation would make the thin edge look cut.
    frost_over_stone = (.54, .57, .61)
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
    vertices, colours, faces = [], [], []

    def sample(x, z):
        across = x - sweep_center(route, z)
        fade = smoothrise(route[-1][1] - .24, route[-1][1] + .13, z)
        exposure = .355 + .039 * math.sin(z * 2.34) + .021 * math.sin(z * 9.17)
        lee = .08 * math.sin(z * 3.14 + x * 5.8) * math.sin(z * 1.49)
        seam = abs(across + lee * .42)
        ridge = 1. - fade * (1. - smoothrise(exposure, .82, seam))
        drift = (.063 + .034 * math.sin(1.88 * x + 1.45 * z) * math.cos(z * .91)
                 + .19 * math.exp(-((abs(x) - 9.1) / .91) ** 2))
        depth, tread = boot_relief(x, z, footprints, sole_scale=.92)
        displacement, tint = swept_surface(x, z, across, seam, exposure, fade, tread)
        scoured = stone_exposure(across, z)
        tint = tuple(snow + scoured * (stone - snow) for snow, stone in zip(tint, frost_over_stone))
        lee_drift = wall_foot_snow(site, x, z)
        lee_drift *= smoothrise(.86, 1.31, abs(across))
        relief = .027 + drift * ridge - 1.40 * depth * fade + displacement + lee_drift
        relief += .005 * math.sin(x * 13.1 + z * 8.6) * math.sin(x * 7.0 - z * 10.2)
        vertices.append((x, level + max(.006, relief), z))
        colours.append(tint)
        return len(vertices) - 1

    for row, z in enumerate(sorted(stations)):
        center = sweep_center(route, z)
        rim_bend = .043 * math.sin(z * 2.41) + .027 * math.cos(z * 6.92)
        offsets = [offset * (1. + rim_bend) for offset in rim_offsets]
        row_x = [left + (center + offsets[0] - left) * i / far_cols for i in range(far_cols)]
        row_x.extend(center + offset for offset in offsets)
        row_x.extend(right + (center + offsets[-1] - right) * i / far_cols
                     for i in reversed(range(far_cols)))
        for column, x in enumerate(row_x):
            i = sample(x, z)
            if row and column:
                # Use one explicit diagonal for source support and glTF replay.
                # A warped snow quad can otherwise settle props on a different surface.
                a, b, c, d = i - stride - 1, i - 1, i, i - stride
                faces.extend(((a, b, c), (a, c, d)))
    faces = refine_sole_triangles(vertices, faces, footprints, sample)
    surface = materials['snow'].copy()
    surface.name = 'Wind-packed snow with recent broom marks'
    for node in surface.node_tree.nodes:
        if node.type == 'NORMAL_MAP':
            node.inputs['Strength'].default_value = .82
    mesh.vertex_tint_shader(surface)
    # Freeze this surface's authored field before the global pass for plaster
    # and paint. The shader and ordinary COLOR_0 stream use the same layer.
    del surface['one_light_surface_tint']
    snow_factor = surface.get('one_light_vertex_base_tint', (1., 1., 1.))
    ground = mesh.mesh_object('Swept snow, displaced berms and buried prints',
                              vertices, faces, surface)
    mesh.source_uv(ground, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'One continuous x/z chart through the swept lane, boot impressions and snow berms.')
    # Reuse the same scanned grain at a finer pitch. The slight diagonal
    # skew puts the wind-packed texture at an angle to the broom strokes.
    uv = ground.data.uv_layers['UVMap'].data
    layer = ground.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
    ground.data.color_attributes.active_color = layer
    for polygon in ground.data.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            i = ground.data.loops[loop].vertex_index
            x, _, z = vertices[i]
            uv[loop].uv = ((x + .17 * z) / .76, -z / .91)
            layer.data[loop].color = (*(a * b for a, b in zip(snow_factor, colours[i])), 1.)
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


def winter_boards(mesh, label, coord, center, width, y0, y1, side, materials):
    """Close a window with continuous reused boards, fixed from outside."""
    rng = random.Random(913 if side else 781)
    wood = materials['wood']
    tints = ('#c0b5a8', '#a49583', '#c7bfb2', '#b1aa9c')
    planks = [mesh.material('Silvered winter closure timber ' + str(i + 1), tint, 'weathered_planks', .96)
              for i, tint in enumerate(tints)]

    def wall_point(along, height, outward):
        return (outward, height, along) if side else (along, height, outward)

    def piece(name, span, height, thickness, along, yy, outward, material, edge):
        dimensions = (thickness, height, span) if side else (span, height, thickness)
        return mesh.box(label + ' ' + name, dimensions, wall_point(along, yy, outward), material, edge)

    # On the weather face, only the lengths of the planks and their nails are
    # exposed. The two horizontal battens support them from inside the frame.
    width += .13
    for yy in (y0 + .19, y1 - .25):
        piece('inside batten supporting closure timber', width - .095, .104, .062,
              center, yy, coord - .014, wood, .008)
    count = round(width / .233)
    sizes = [rng.uniform(.79, 1.22) for _ in range(count)]
    total = sum(sizes)
    edge = center - width / 2
    frost, frost_faces, nails, nail_faces = [], [], [], []
    for index, breadth in enumerate(sizes):
        pitch = width * breadth / total
        along = edge + pitch / 2
        base, top = y0 + rng.uniform(-.071, -.030), y1 + rng.uniform(.031, .080)
        thickness = rng.uniform(.058, .074)
        outward = coord + rng.uniform(.048, .058)
        obj = piece('full-height reused plank', pitch - rng.uniform(.007, .016), top - base,
                    thickness, along, (base + top) / 2, outward, planks[rng.randrange(len(planks))], .007)
        offset = rng.random()
        for loop in obj.data.uv_layers['UVMap'].data:
            loop.uv.x += offset
        surface = outward + thickness / 2
        for nail_y in (y0 + .19, y1 - .25):
            nail_x = along + rng.uniform(-.027, .027)
            first = len(nails)
            for i in range(6):
                angle = i * math.tau / 6
                nails.append(wall_point(nail_x + .009 * math.cos(angle),
                                        nail_y + .009 * math.sin(angle), surface + .002))
            face = tuple(range(first, first + 6))
            nail_faces.append(tuple(reversed(face)) if side else face)
        edge += pitch
        if index != count - 1:
            # Packed snow lies low in open joints and feathers onto both
            # board edges. Its exposed face is raised above the timber.
            extent = rng.uniform(.105, .41)
            peak = len(frost)
            strips = ((base + .024, .014), (base + .066, .026),
                      (base + extent * .70, .010), (base + extent, .002))
            for yy, radius in strips:
                frost.extend((wall_point(edge - radius, yy, surface + .002),
                              wall_point(edge + .002, yy, surface + .013),
                              wall_point(edge + radius, yy, surface + .002)))
            for row in range(3):
                for col in range(2):
                    a = peak + 3 * row + col
                    face = (a, a + 1, a + 4, a + 3)
                    frost_faces.append(tuple(reversed(face)) if side else face)
    mesh.mesh_object(label + ' hand-driven iron nail heads', nails, nail_faces, materials['ash'])
    snow = mesh.mesh_object(label + ' snow packed into winter plank joints',
                            frost, frost_faces, materials['snow'])
    for polygon in snow.data.polygons:
        polygon.use_smooth = True


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
    """Keep short split fuel dry beside the front corner of the kitchen."""
    rng = random.Random(775)
    level = site['court']['level']
    front = room['front']
    stack_x, stack_z = room['east'] + .035, front + .21
    y = level + .22
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    shoes = []
    with contacts.group('Granite shoes on the kitchen snow court', [ground]):
        for shift in (-.169, .169):
            perimeter = [(stack_x + shift + dx, stack_z + dz)
                         for dx, dz in ((-.085, -.13), (.085, -.13), (.085, .13), (-.085, .13))]
            foot = [(x, mesh.resting_contact_height(x, z, [ground]) - .001, z) for x, z in perimeter]
            top = [(x, y, z) for x, z in perimeter]
            shoes.append(mesh.mesh_object('Granite shoe under the kitchen fuel rack',
                                          foot + top, faces, materials['granite']))
    slats = []
    with contacts.group('Weathered fuel rack carried by two granite shoes', shoes):
        for shift in (-.063, .063):
            slats.append(mesh.box('Raised hardwood rail from the kitchen fuel rack', (.502, .067, .125),
                                  (stack_x, y + .0335, stack_z + shift), materials['wood'], .005))
    y += .067
    heart = mesh.material('Fresh and faded split firewood faces', '#b39573', 'weathered_planks', .87)
    pale_wood = mesh.material('Pale exposed firewood sapwood', '#ceb594', 'weathered_planks', .93)
    with contacts.group('Split fuel resting on the raised wood rack', slats):
        for row, count in enumerate((3, 3, 3, 2, 1)):
            for index in range(count):
                center = stack_x + (index - (count - 1) / 2) * .146 + rng.uniform(-.008, .008)
                end = front + rng.uniform(.305, .336)
                rear = front + rng.uniform(.102, .131)
                bottom = y + row * .108
                half = rng.uniform(.062, .074)
                cross = [(-half * .78, 0.), (half * .73, 0.),
                         (half, .039), (half * .52, .105), (-half * .35, .108), (-half, .061)]
                skew = rng.uniform(-.022, .022)
                vertices = [(center + offset + drift, bottom + height, z)
                            for z, drift in ((end, 0.), (rear, skew)) for offset, height in cross]
                # The cut faces face the open passage, with bark left on the
                # soft outer sides and two differently coloured split faces.
                sides = [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
                sides.extend((tuple(reversed(range(6))), tuple(range(6, 12))))
                log = mesh.mesh_object('Stacked hand-split winter fuel', vertices,
                                       [tuple(reversed(face)) for face in sides], materials['bark'])
                log.data.materials.append(heart)
                log.data.materials.append(pale_wood)
                for i in (0, 2, 3, 6, 7):
                    log.data.polygons[i].material_index = 1 + (i >= 6 and (index + row) % 3 != 0)
                mesh.uv_world(log, .48)
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
