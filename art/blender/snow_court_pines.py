"""Author the swept, snow-laden pines on the Snow Court approach."""

import math
import random

from snow_court_approach import Geometry, PINES, add, between, interpolate, road_height, scale, snow_sleeve


# The same crosswind direction as the chimney plume, in engine coordinates.
LEE_HEADING = math.atan2(-.23, -.43)
LEE = (math.cos(LEE_HEADING), 0., math.sin(LEE_HEADING))
TRUNK_HEIGHTS = (-.042, .055, .195, .36, .54, .72, .89, 1.)
TRUNK_SWEEP = (0., .007, .050, .134, .291, .505, .775, 1.)
TRUNK_RADII = (1.29, 1.03, .84, .71, .52, .34, .13, .025)
BRANCH_LEVELS = (.31, .38, .44, .50, .55, .60, .65, .70, .75, .80, .85, .90, .95, .985)


def forward(azimuth):
    return math.cos(azimuth), 0., math.sin(azimuth)


def position_along(trunk, height):
    a, b = next((a, b) for a, b in zip(trunk, trunk[1:]) if a[1] <= height <= b[1])
    return between(a, b, (height - a[1]) / (b[1] - a[1]))


def tree_layout(profile, ground_height, index, road_clearance, local_centroid):
    """Retain each surveyed root and stature while shaping the canopy in the lee."""
    x, z, stature, root_radius, old_sweep = profile
    ground = ground_height(x, z)
    origin = (x, ground, z)
    rng = random.Random(71963 + 941 * index)
    motion = forward(LEE_HEADING + rng.uniform(-.14, .14))
    span = stature * math.tan(math.radians(6.9 + 5.3 * abs(old_sweep) / 1.19))
    trunk = [add(add(origin, (0., t * stature, 0.)), scale(motion, span * bend))
             for t, bend in zip(TRUNK_HEIGHTS, TRUNK_SWEEP)]
    roots, boughs, mounts = [], [], []
    windward, leeward = [], []
    for i in range(3):
        heading = i * math.tau / 3. + rng.uniform(-.24, .24)
        end_x, _, end_z = add(origin, scale(forward(heading), root_radius * rng.uniform(2.2, 3.0)))
        end = (end_x, ground_height(end_x, end_z) - .047, end_z)
        roots.append(([trunk[1], between(trunk[0], end, .53), end],
                      [root_radius * .43, root_radius * .25, .014], 5))

    phase = rng.uniform(0., math.tau)
    for index_at_level, level in enumerate(BRANCH_LEVELS):
        direction = phase + index_at_level * 2.39996 + rng.uniform(-.32, .32)
        shelter = .5 + .5 * math.cos(direction - LEE_HEADING)
        if shelter < .18 and index_at_level % 3 == 0 and level < .86:
            continue
        start = position_along(trunk, ground + stature * level)
        length = stature * rng.uniform(.56, .73) * (1. - level) * (.83 + .196 * shelter)
        if .43 < level < .81:
            length *= 1.09
        (windward if shelter < .5 else leeward).append(length)
        heading = forward(direction)
        outward = (.26, .53, .78, 1.)
        bends = (.009, .027, .044, .062)
        rises = (-.045, -.128, -.106, -.042)
        path = [start]
        for fraction, bend, rise in zip(outward, bends, rises):
            p = add(start, add(scale(heading, length * fraction), scale(LEE, length * bend)))
            path.append(add(p, (0., length * rise, 0.)))
        root_branch = root_radius * (1. - level) * rng.uniform(.26, .36)
        radii = (root_branch, root_branch * .79, root_branch * .54, root_branch * .29, .004)
        boughs.append((path, radii, index_at_level % 3 == 0))
        branch_mounts = ((1, .31, -.96), (2, .24, .71), (2, .90, -.83),
                         (3, .42, .78), (3, .97, -.16))
        for mount_index, (part, t, turn) in enumerate(branch_mounts):
            side = direction + turn + rng.uniform(-.12, .13)
            base = between(path[part], path[part + 1], t)
            reach = length * rng.uniform(.14, .24) * (.84 + .22 * shelter)
            point = add(base, add(scale(forward(side), reach), scale(LEE, reach * .18)))
            rise = rng.uniform(.11, .26)
            end = add(point, (0., reach * rise, 0.)) if mount_index in (0, 2) else base
            fullness = min(1.34, max(.55, 1.29 - .68 * level + .09 * shelter))
            fullness *= rng.uniform(.90, 1.12)
            if not road_clearance(end, fullness):
                continue
            mounts.append((end, side, (fullness, fullness * .86, fullness * 1.06)))
            if mount_index in (0, 2):
                # The exposed fork is wood. The short buds beyond it are
                # part of the instanced needle and snow assembly.
                boughs.append(([base, between(base, end, .48), end],
                               (root_branch * .41, root_branch * .26, .004), False))
    for level in (.88, .935, .975):
        point = position_along(trunk, ground + stature * level)
        for side in (-.57, .63):
            mounts.append((point, LEE_HEADING + side + rng.uniform(-.17, .17), (.76, .67, .81)))
    trunk_angle = math.degrees(math.atan2(math.hypot(trunk[-1][0] - x, trunk[-1][2] - z), stature))
    crown_points = []
    for position, yaw, dimensions in mounts:
        dx, dy, dz = (local_centroid[axis] * dimensions[axis] for axis in range(3))
        crown_points.append(add(position, add(scale(forward(yaw), dx),
                                               add((0., dy, 0.), scale(forward(yaw + math.pi / 2), dz)))))
    total_size = sum(math.prod(dimensions) for _, _, dimensions in mounts)
    centre = tuple(sum(point[axis] * math.prod(mount[2])
                       for point, mount in zip(crown_points, mounts)) / total_size for axis in range(3))
    crown_angle = math.degrees(math.atan2(math.hypot(centre[0] - x, centre[2] - z), centre[1] - ground))
    lee_advance = (centre[0] - x) * LEE[0] + (centre[2] - z) * LEE[2]
    if not 5. <= trunk_angle <= 15. or not 5. <= crown_angle <= 15. or lee_advance <= 0.:
        raise RuntimeError(f'Pine {index + 1} escaped its lee bend: trunk {trunk_angle:.2f}, crown {crown_angle:.2f}, lee {lee_advance:.2f}')
    return {
        'origin': origin, 'trunk': trunk, 'trunkAngle': trunk_angle, 'crownAngle': crown_angle,
        'rootRadii': tuple(root_radius * r for r in TRUNK_RADII), 'roots': roots, 'boughs': boughs,
        'mounts': mounts, 'windward': windward, 'leeward': leeward,
    }


def snow_mantle(blades, rng):
    """Set a joined snow cap into the upper needles of each instanced shoot."""
    samples = [tuple(root.lerp(v, fraction)) for root, middle, tip, _ in blades
               for v in (middle, tip) for fraction in (.40, .64, .82, 1.)]
    points, faces = [], []
    rows, columns = 7, 5
    for row in range(rows):
        u = row / (rows - 1)
        x = .075 + u * .492
        width = (.047 + .105 * math.sin(u * math.pi) ** .71) * rng.uniform(.83, 1.17)
        for col in range(columns):
            side = 2. * col / (columns - 1) - 1.
            z = side * width + .018 * math.sin(4.6 * u)
            near = sorted(samples, key=lambda p: (p[0] - x) ** 2 + (p[2] - z) ** 2)[:10]
            contact = max(point[1] for point in near)
            body = max(0., 1. - side * side) * math.sin(u * math.pi) ** .62
            points.append((x, contact + .054 * body + rng.uniform(-.007, .009), z))
    for row in range(rows - 1):
        for col in range(columns - 1):
            a = row * columns + col
            faces.append((a, a + 1, a + 1 + columns, a + columns))
    rim = [*range(columns),
           *(i * columns + columns - 1 for i in range(1, rows)),
           *((rows - 1) * columns + i for i in reversed(range(columns - 1))),
           *(i * columns for i in reversed(range(1, rows - 1)))]
    offset = len(points)
    for i in rim:
        x, y, z = points[i]
        points.append((x, y - rng.uniform(.025, .057), z))
    for i, a in enumerate(rim):
        j = (i + 1) % len(rim)
        faces.append((rim[j], a, offset + i, offset + j))
    faces.append(tuple(offset + i for i in reversed(range(len(rim)))))
    return points, faces


def shoot_profile(seed):
    """Build curved 3D needle pairs at successive nodes of a terminal bough."""
    from mathutils import Vector
    from pine_hero_trees import needle_fascicle, needle_mesh

    rng = random.Random(seed)
    fascicles = []
    for i, position in enumerate((.025, .10, .18, .27, .36, .44, .51)):
        fan_width = .120 * math.sin(math.pi * (i + 1) / 8.) ** .67
        for side in (-1., 0., 1.):
            if side == 0. and i != 3:
                continue
            root = Vector((position + rng.uniform(-.022, .028), rng.uniform(-.071, .045),
                           side * fan_width * rng.uniform(.42, 1.15)))
            axis = Vector((rng.uniform(.32, .82), rng.uniform(-.04, .76),
                           side * rng.uniform(.38, .86)))
            reach = rng.uniform(.128, .213) * (.85 if i >= 5 else 1.)
            needles = needle_fascicle(root, axis, rng.uniform(0., math.tau), reach, rng,
                                      True, mature=True, pairs=3)
            fascicles.append(tuple((base, middle, tip, max(.0052, width * 2.65))
                                    for base, middle, tip, width in needles))
    points, faces, _, _ = needle_mesh(fascicles, compact=True)
    snow, snow_faces = snow_mantle([blade for fan in fascicles for blade in fan], rng)
    return points, faces, snow, snow_faces, len(fascicles), sum(map(len, fascicles))


def averaged_normals(data):
    from mathutils import Vector

    normals = [Vector((0., 0., 0.)) for _ in data.vertices]
    for polygon in data.polygons:
        polygon.use_smooth = True
        weighted = polygon.normal * polygon.area
        for index in polygon.vertices:
            normals[index] += weighted
    data.normals_split_custom_set_from_vertices([v.normalized() for v in normals])


def prototype_mesh(mesh, variant, foliage, rime):
    import bpy

    points, faces, snow, snow_faces, fans, needles = shoot_profile(53177 + variant * 569)
    splits = len(faces)
    offset = len(points)
    points.extend(snow)
    faces.extend(tuple(vertex + offset for vertex in face) for face in snow_faces)
    data = bpy.data.meshes.new(f'Wind-packed living needle shoot {variant + 1}')
    data.from_pydata([mesh.point(v) for v in points], [], faces)
    data.update()
    data.materials.append(foliage)
    data.materials.append(rime)
    for face in data.polygons[splits:]:
        face.material_index = 1
    averaged_normals(data)
    tris = sum(len(face) - 2 for face in faces)
    centroid = tuple(sum(v[axis] for v in points) / len(points) for axis in range(3))
    return data, fans, needles, tris, centroid


def build_pines(mesh, materials, site, centreline, ground_height):
    import bpy

    runtime = bpy.data.collections['RUNTIME']
    bark, snow = Geometry(), Geometry()
    needle = mesh.material('Living winter pine needles', '#536e3f', rough=.86)
    needle.use_backface_culling = False
    ice = mesh.material('Wind-packed snow held in pine fascicles', '#dce6e9', rough=.93)
    prototypes = [prototype_mesh(mesh, variant, needle, ice) for variant in range(4)]
    crowns = bpy.data.objects.new('Snow Court native pine crowns', None)
    runtime.objects.link(crowns)
    crowns['snow_court_needle_crowns'] = True
    select = [crowns]

    def road_clearance(position, size):
        x, y, z = position
        route_x = interpolate(centreline, z, smooth=True)
        eye_y = road_height(site, z) + 1.64
        return abs(x - route_x) - .45 * size > .94 or y - eye_y - .32 * size > 1.03

    count = fans = needles = triangles = 0
    for i, profile in enumerate(PINES):
        data, at_fans, at_needles, at_triangles, centroid = prototypes[i % len(prototypes)]
        authored = tree_layout(profile, ground_height, i, road_clearance, centroid)
        bark.tube(mesh, authored['trunk'], authored['rootRadii'], 10)
        for path, radii, sides in authored['roots']:
            bark.tube(mesh, path, radii, sides)
        for path, radii, frosted in authored['boughs']:
            bark.tube(mesh, path, radii, 5, caps=False)
            if frosted:
                snow_sleeve(snow, path[1:-1], radii[1:-1],
                            random.Random(32125 + 157 * i + len(snow.faces)))
        group = bpy.data.objects.new(f'Wind-bent pine crown {i + 1:02}', None)
        runtime.objects.link(group)
        group.parent = crowns
        group['snow_court_root_engine'] = list(authored['origin'])
        group['snow_court_trunk_lean_degrees'] = authored['trunkAngle']
        group['snow_court_crown_lean_degrees'] = authored['crownAngle']
        for aspect in ('windward', 'leeward'):
            lengths = authored[aspect]
            group[f'snow_court_{aspect}_bough_count'] = len(lengths)
            group[f'snow_court_{aspect}_mean_reach_metres'] = sum(lengths) / len(lengths)
        select.append(group)
        for number, (point, yaw, dimensions) in enumerate(authored['mounts']):
            shoot = bpy.data.objects.new(f'Living snowy pine shoot {i + 1:02}-{number + 1:02}', data)
            runtime.objects.link(shoot)
            shoot.parent = group
            shoot.location = mesh.point(point)
            shoot.rotation_euler.z = -yaw
            shoot.scale = dimensions[0], dimensions[2], dimensions[1]
            select.append(shoot)
            count += 1
            fans += at_fans
            needles += at_needles
            triangles += at_triangles

    if triangles > 400_000:
        raise RuntimeError(f'Approach crown geometry is over the draw budget: {triangles:,} triangles')
    crowns['snow_court_crown_instance_count'] = count
    crowns['snow_court_fascicle_count'] = fans
    crowns['snow_court_needle_count'] = needles
    crowns['snow_court_crown_triangle_count'] = triangles
    stems = bark.write(mesh, 'Tapered trunks and wind-bent pine boughs', materials['pine_bark'],
                       'Unrolled bark and end charts; metre scale.', smooth=True)
    uv = stems.data.uv_layers['UVMap'].data
    for polygon, coordinates in zip(stems.data.polygons, bark.charts):
        for loop, (u, v) in zip(polygon.loop_indices, coordinates):
            uv[loop].uv = (u / 1.80, v / 1.80)
    snow.write(mesh, 'Broken snow ridges along pine boughs', materials['snow'],
               'Joined supported snow strips unfolded in metres.', smooth=True)
    print('SNOW_COURT_SWEEP', count, 'snowy shoots', fans, 'fascicles', needles, 'needles', triangles, 'triangles')
    return select
