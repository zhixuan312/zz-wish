"""Site-approval geometry for the Pine Gate spring and tea shoulder."""

import math

import bpy

import snow_roof as mesh
from snow_lightmap_charts import profile_uv, source_uv


def frame(x, y, z, yaw=0.):
    cos, sin = math.cos(yaw), math.sin(yaw)

    def locate(a, b, c):
        return x + a * cos + c * sin, y + b, z - a * sin + c * cos

    return locate


def prism(name, points, material):
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
    return obj


def small_roof(name, locate, width, depth, base, wood, tiles, repair):
    def surface(x, t, side):
        bow = .032 * ((x / width) ** 2 - .6)
        y = base + .27 * (1 - t) ** 1.13 + bow + .018 * t ** 4
        return locate(x, y, side * t * depth)

    for lane in range(6):
        x = (lane / 5 * 2 - 1) * width * .92
        points = [surface(x, t, side) for side, t in ((-1, 1), (-1, .58), (-1, .26), (1, 0), (1, .31), (1, .66), (1, 1))]
        mesh.curved_tube(f'{name} exposed cedar rafter {lane + 1}', [(x, y - .049, z) for x, y, z in points],
                         [.025] * len(points), wood, radial=5, region='gate')

    for side in (-1, 1):
        for lane in range(9):
            x0 = -width + (lane + .052) * width * 2 / 9
            x1 = -width + (lane + .925) * width * 2 / 9
            for course in range(3):
                t0, t1 = course * .319, min(1, (course + 1) * .319 + .064)
                upper = [surface(x, t, side) for x, t in ((x0, t0), (x1, t0), (x1, t1), (x0, t1))]
                if side > 0:
                    upper.reverse()
                tile = tiles[(lane + course * 2) % len(tiles)]
                if (lane, course, side) in ((1, 1, 1), (4, 1, 1), (4, 2, 1), (7, 0, -1), (8, 0, -1)):
                    tile = repair
                panel = prism(f'{name} clay pan tile {side} {lane} {course}',
                              upper + [(x, y - .018, z) for x, y, z in upper], tile)
                panel['weather_stone'] = panel['moss_edge'] = True
            if lane:
                rail = [surface(-width + lane * width * 2 / 9, t, side) for t in (.035, .35, .65, .994)]
                mesh.curved_tube(f'{name} clay cover tile {side} {lane}', [(x, y + .011, z) for x, y, z in rail],
                                 [.020, .022, .022, .018], tiles[lane % len(tiles)], radial=5, region='gate')
    ridge = [surface(width * (i / 6 * 2 - 1), 0, 1) for i in range(7)]
    mesh.curved_tube(f'{name} old clay ridge', [(x, y + .022, z) for x, y, z in ridge],
                     [.038, .035, .032, .030, .032, .034, .037], tiles[1], radial=6, region='gate')


def small_flame(name, base, height, region='gate'):
    warm = mesh.material('Small warm flames in the shoulder fixtures', '#ffc273', rough=.76, emission=.77)
    mesh.lathe(name, [(0, 0), (height * .135, height * .14), (height * .196, height * .36),
               (height * .118, height * .69), (0, height)], base, warm, 9, region)


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
    bounce['bake_role'] = 'ambient'


def earth_shrine(stone, wood, tiles, repair, clay, iron, contacts):
    yaw = .70
    locate = frame(-3., 4., 3., yaw)
    plaster = mesh.material('Earth shrine weathered ochre limewash', '#aa8d60', 'stone_pavers', .92)
    image = mesh.material('Unpainted earth god terracotta', '#846748', rough=.79)
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
    robe = [(0, 0), (.159, .0), (.176, .063), (.142, .154), (.112, .277),
            (.081, .293), (.059, .306), (.052, .325), (.077, .348),
            (.084, .395), (.071, .424), (.051, .445), (0, .455)]
    mesh.lathe('Generic small seated image of the local earth god', robe, locate(0, .379, -.25), image, 18, 'gate')
    mesh.box('Simple terracotta lap and folded hands', (.239, .072, .120), locate(0, .515, -.126),
             image, .022, yaw, 'gate')
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
            mesh.box('Bare tea-pavilion timber post', (.134, 1.67, .146), locate(x, .97, z),
                     wood, .015, region='gate')
            mesh.beam('Timber bracket under pavilion eave', locate(x, 1.516, z),
                      locate(x - side * .29, 1.760, z), .041, wood, .035, 'gate')
    for row in (-1, 1):
        mesh.box('Tea pavilion open-side eave beam', (1.88, .160, .171), locate(0, 1.824, row * .64),
                 wood, .013, region='gate')
    small_roof('Tea pavilion', locate, 1.06, .841, 1.90, wood, tiles, repair)
    storm_lantern(iron, clay)

    table = mesh.box('Worn low granite tea table', (.91, .088, .60), locate(.043, .638, -.04),
                     stone[3], .030, region='gate')
    for side in (-1, 1):
        mesh.box('Stone support under tea table', (.196, .60, .396), locate(side * .329, .299, -.04),
                 stone[2], .017, region='gate')
        mesh.box('Simple tea pavilion bench seat', (.243, .074, .658), locate(side * .58, .394, -.04),
                 wood, .013, region='gate')
        for row in (-1, 1):
            mesh.box('Bench bearing leg', (.137, .37, .136), locate(side * .58, .178, -.04 + row * .224),
                     wood, .014, region='gate')
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


def spring_basin(stone, wood):
    x, z = 2.20, 4.35
    jade = mesh.material('Still spring water in the granite basin', '#708b78', rough=.19, metal=.19)
    bamboo = mesh.material('Split green bamboo spring pipe', '#80925f', rough=.63)
    bowl = [(0, 0), (.339, 0), (.426, .056), (.451, .207), (.439, .255),
            (.374, .260), (.339, .217), (.321, .067), (0, .062)]
    mesh.lathe('Low worn granite spring basin with a real hollow', bowl, (x, 3.988, z), stone[3], 28, 'gate')
    mesh.lathe('Reflective water below the basin rim', [(0, 0), (.351, 0), (0, .0005)],
               (x, 4.188, z), jade, 32, 'gate')
    mesh.box('Old wood support beneath the spring pipe', (.084, .388, .084), (2.56, 4.188, 4.786),
             wood, .011, region='gate')
    a, b = (2.68, 4.506, 4.998), (2.355, 4.445, 4.566)
    mesh.beam('Bamboo spring pipe descending into the basin', a, b, .032, bamboo, .027, 'gate')
    for k in (.21, .63, .92):
        inlet = tuple(x + (y - x) * k for x, y in zip(a, b))
        outlet = tuple(x + (y - x) * (k + .018) for x, y in zip(a, b))
        mesh.beam('Dark natural node around the spring bamboo', inlet, outlet, .034 - .004 * k,
                  wood, .033 - .004 * k, 'gate')
    mesh.beam('Thin stream directly beneath the bamboo outlet', b, (2.326, 4.190, 4.536), .005,
              jade, .003, 'gate')


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


def spent_wax_on_sill(locate, iron):
    wax_materials = [candle_wax(f'Weathered cold wax tone {i + 1}', color, roughness)
                     for i, (color, roughness) in enumerate((('#b2a080', .49), ('#827055', .58),
                                                             ('#c0b396', .41), ('#96866c', .54)))]
    # Keep the owner dish empty, with the larger remnants gathered at the sides.
    remnants = ((-.170, -.034, .013, .015), (-.110, -.009, .011, .011),
                (-.100, -.056, .007, .007), (-.109, .061, .011, .014),
                (-.066, .076, .009, .006), (-.068, .115, .008, .012),
                (.102, -.058, .009, .011), (.126, .004, .011, .017),
                (.094, .050, .009, .006), (.071, .084, .008, .010),
                (.126, .078, .009, .010))
    for i, (a, c, radius, height) in enumerate(remnants):
        profile = [(0, -.0004), (radius * 1.59, -.0004), (radius * 1.57, .00031),
                   (radius * 1.48, .00085), (radius * 1.28, .00142), (radius * 1.10, .00212),
                   (radius * .99, height * .39), (radius * .97, height * .72),
                   (radius * .91, height * .92), (radius * .84, height), (radius * .74, height * .98),
                   (radius * .66, height * .87), (radius * .57, height * .59),
                   (radius * .35, height * .43), (radius * .14, height * .42), (0, height * .42)]
        x, y, z = locate(a, 0, c)
        wax = mesh.lathe(f'Burnt-out candle fused to the sill {i + 1}', profile, (x, y, z),
                         wax_materials[i % len(wax_materials)], 28, 'niche')
        for vertex in wax.data.vertices:
            dx, dz = vertex.co.x - x, -vertex.co.y - z
            elevation = vertex.co.z - y
            angle = math.atan2(dx, dz)
            scallop = .058 * math.sin(angle * 3 + i * 1.81) + .047 * math.sin(angle * 5 - i * .51)
            spill = 1 - min(1., max(0., elevation) / .0044)
            drift = .11 * math.sin(angle + i) + .16 * math.cos(angle * 2 - i)
            vertex.co.x = x + dx * (1 + scallop + spill * drift)
            vertex.co.y = -z - dz * (1 + scallop + spill * drift)
            mouth = min(1., max(0., (elevation / height - .43) / .47))
            vertex.co.z += height * mouth * (.15 * math.sin(angle * 3 + i) + .045 * math.cos(angle * 5))
        for face in wax.data.polygons:
            face.use_smooth = True
        mesh.curved_tube(f'Extinguished charred wick {i + 1}',
                         [locate(a, height * .42 - .0006, c),
                          locate(a + .0005 * math.cos(i), height * .42 + .0018, c - .0003),
                          locate(a + .0016 * math.cos(i), height * .42 + .0025, c - .0012)],
                         [.00076, .00066, .0004], iron, radial=7, region='niche')


def carved_shrine_pier(locate, x, z, material, seed):
    section = ((-.72, -1), (.70, -1), (1, -.70), (1, .68),
               (.69, 1), (-.73, 1), (-1, .70), (-1, -.76))
    profile = ((-.002, .043), (.015, .044), (.031, .041), (.045, .035),
               (.053, .036), (.122, .034), (.210, .033), (.254, .035),
               (.266, .037), (.282, .041), (.306, .042), (.320, .041))
    width = len(section)
    points = [locate(x + u * (radius + .0015 * math.sin(i * 2.3 + seed)), height,
                     z + v * (radius + .0019 * math.cos(i * 1.6 + row * .27 - seed)))
              for row, (height, radius) in enumerate(profile) for i, (u, v) in enumerate(section)]
    last = (len(profile) - 1) * width
    faces = [tuple(range(width)), tuple(reversed(range(last, last + width)))]
    for row in range(len(profile) - 1):
        first, second = row * width, (row + 1) * width
        for i in range(width):
            j = (i + 1) % width
            faces.append((first + i, second + i, second + j, first + j))
    pier = mesh.mesh_object('Chisel-dressed granite pier in the pierced shrine', points, faces, material, 'niche')
    profile_uv(pier, width, len(profile), {0, 1}, 1)
    pier['weather_stone'] = pier['moss_edge'] = True


def pierced_lamp_shrine(anchor, stone, ledge, iron, contacts):
    locate = frame(anchor[0], anchor[1], anchor[2])
    mesh.box('Broad foundation of the freestanding stone lamp shrine', (.67, .209, .57),
             locate(0, -.897, 0), stone[4], .041, region='niche')
    mesh.lathe('Worn octagonal stem of pierced stone lamp shrine', [(0, 0), (.208, 0), (.201, .06),
               (.137, .123), (.112, .283), (.123, .548), (.203, .743), (.218, .806), (0, .806)],
               locate(0, -.892, 0), stone[2], 8, 'niche')
    shelf = mesh.box('Single hewn wick shelf', (.552, .092, .469), locate(0, -.046, 0), ledge, .024, region='niche')
    for side in (-1, 1):
        for row in (-1, 1):
            carved_shrine_pier(locate, side * .211, row * .177, ledge, side * 1.7 + row * 3.2)
    mesh.box('Weathered stone lintel around the open crown', (.551, .069, .472), locate(0, .337, 0),
             stone[2], .026, region='niche')
    mesh.lathe('Rain-worn shallow stone canopy over the pierced lamp', [(0, 0), (.257, 0), (.277, .044),
               (.255, .065), (.197, .087), (.132, .130), (.057, .153), (0, .165)],
               locate(0, .349, 0), stone[3], 12, 'niche')
    mesh.beam('Old iron peg for wishes below the centre seat', locate(-.078, -.081, .208),
              locate(-.078, -.081, .244), .005, iron, .004, 'niche')
    with contacts.group('Spent wax fused to the wick shelf', [shelf]):
        spent_wax_on_sill(locate, iron)
    wax = candle_wax('Wax of the two remaining short candles', '#a29476', .46)
    for a, c, h, radius in ((-.143, -.105, .026, .014), (.139, -.081, .019, .012)):
        stub = mesh.lathe('Earlier candle still burning on the outer sill', [(0, 0), (radius * 1.33, 0),
                          (radius * 1.26, .0007), (radius, .005), (radius * .95, h * .87),
                          (radius * .89, h), (radius * .71, h * .98), (radius * .58, h * .93),
                          (radius * .33, h * .88), (0, h * .88)], locate(a, .0002, c), wax, 28, 'niche')
        for face in stub.data.polygons:
            face.use_smooth = True
        mesh.beam('Black wick of an earlier wish', locate(a, h * .9, c), locate(a + .001, h + .005, c),
                  .0011, iron, .0009, 'niche')
        small_flame('Short earlier wish still burning on the outer sill', locate(a + .001, h + .005, c), .017, 'niche')


def build_tea_shoulder(anchor, stone, wood, tiles, clay, iron, ledge, contacts):
    repair = mesh.material('Small unglazed replacement tiles on old roofs', '#a7a395', 'grey_roof_tiles', .73)
    earth_shrine(stone, wood, tiles, repair, clay, iron, contacts)
    tea_pavilion(stone, wood, tiles, repair, clay, iron, contacts)
    spring_basin(stone, wood)
    pierced_lamp_shrine(anchor, stone, ledge, iron, contacts)
