"""Author the small, inhabited winter-pass court for the Snow Roof rebuild."""

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import snow_roof as mesh
import pine_valley_backdrop as plates
from resting_contacts import RestingContacts, engine
from snow_court_approach import build_approach
from snow_court_backdrop import look_transport

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'shared/snow-roof-court-site.json'
PROJECTION = ROOT / 'shared/snow-court-backdrop.json'


def palette():
    materials = {
        'snow': mesh.material('Wind-packed winter snow', '#e2ebf3', 'snow_004', .93),
        'granite': mesh.material('Grey pass granite', '#aeb1b0', 'stone_pavers', .76),
        'plaster': mesh.material('Limewash on the old shelter walls', '#cabdac', 'white_plaster_rough_01', .96),
        'brick': mesh.material('Winter-darkened masonry', '#686a65', 'dark_brick_wall', .89),
        'red': mesh.material('Worn iron-oxide temple paint', '#81392f', rough=.77),
        'wood': mesh.material('Old structural timber', '#8d7863', 'weathered_planks', .83),
        'bark': mesh.material('Weathered brown winter pine bark', '#6b5648', 'weathered_planks', .88),
        'needle': mesh.material('Winter pine needles', '#344943', rough=.86),
        'tile': mesh.material('Repaired northern grey roof tile', '#727579', 'grey_roof_tiles', .78),
        'paper': mesh.material('Warm oiled window paper', '#dfc597', rough=.8, emission=.18),
        'bronze': mesh.material('Dull old lamp bronze', '#735438', rough=.63, metal=.71),
        'ash': mesh.material('Char and burned wick', '#272822', rough=.96),
        'glow': mesh.material('Thin gauze over low flame', '#d55a36', rough=.74, emission=.8),
        'red_faded': mesh.material('Faded dull red gauze', '#995249', rough=.91),
        'red_dust': mesh.material('Darker dusty gauze', '#753e38', rough=.94),
        'tag': mesh.material('Unvarnished wooden wish tag', '#bba17c', 'weathered_planks', .88),
        'rope': mesh.material('Rough suspension cord', '#8a7962', rough=.98),
    }
    mesh.vertex_tint_shader(materials['red'])
    materials['red']['one_light_painted_timber'] = True
    mesh.painted_timber_finish(materials['red'])
    mesh.weather_plaster(materials['plaster'])
    return materials


def path_distance(x, z, line):
    distance = math.inf
    for (a, b), (c, d) in zip(line, line[1:]):
        span = (c - a) ** 2 + (d - b) ** 2
        fraction = max(0., min(1., ((x - a) * (c - a) + (z - b) * (d - b)) / span))
        distance = min(distance, math.hypot(x - (a + (c - a) * fraction), z - (b + (d - b) * fraction)))
    return distance


def courtyard(site, materials):
    court = site['court']
    left, right, back, front, y = (court[k] for k in ('west', 'east', 'rear', 'front', 'level'))
    mesh.REGION = 'court'
    floor = mesh.box('Packed ground below the winter court', (right - left, .48, front - back),
                     (0, y - .24, (back + front) / 2), materials['granite'], .012)
    path = site['sweptPath']
    vertices, faces, exposed_faces = [], [], []
    x_count, z_count = 70, 79
    for row in range(z_count + 1):
        z = back + (front + .08 - back) * row / z_count
        for col in range(x_count + 1):
            x = left + (right - left) * col / x_count
            distance = path_distance(x, z, path)
            rim = max(0., min(1., (distance - .61 - .09 * math.sin(z * 1.45)) / .68))
            rim = rim * rim * (3. - 2. * rim)
            drift = (.068 + .037 * math.sin(1.88 * x + 1.45 * z) * math.cos(z * .91)
                     + .22 * math.exp(-((abs(x) - 9.1) / .91) ** 2))
            relief = y + .006 + drift * rim
            for i in range(24):
                fz = 8.93 - i * .47
                fx = -.54 + .48 * math.sin(fz * .27) + (-.095 if i % 2 else .095)
                print_shape = ((x - fx) / .16) ** 2 + ((z - fz) / .205) ** 2
                if print_shape < 1:
                    relief -= .020 * (1 - print_shape) ** 1.55 * (.48 + .32 * math.cos(i * 1.8))
            vertices.append((x, relief, z))
            if col and row:
                i = len(vertices) - 1
                if distance < .43:
                    exposed_faces.append(len(faces))
                faces.append((i - x_count - 2, i - 1, i, i - x_count - 1))
    ground = mesh.mesh_object('One snow surface with a narrow swept passage', vertices, faces, materials['snow'])
    ground.data.materials.append(materials['granite'])
    mesh.grid_uv(ground, x_count + 1, right - left, front + .08 - back)
    mesh.uv_world(ground, 1.46)
    for face in ground.data.polygons:
        face.use_smooth = True
    for i in exposed_faces:
        ground.data.polygons[i].material_index = 1
    for wall_x in (left, right):
        mesh.box('Modest limewashed court side wall', (.41, 1.62, front - back),
                 (wall_x, y + .79, (front + back) / 2), materials['plaster'], .019)
        mesh.wall_coping('Snow on grey court coping', front - back, (wall_x, y + 1.61, (front + back) / 2),
                         .43, materials['tile'], materials['snow'], turn=True, seed=731 + int(wall_x))
    for wall_x in (-6.20, 6.20):
        mesh.box('Wall beside the old gate', (7.25, 1.62, .42), (wall_x, y + .79, front),
                 materials['plaster'], .019)
        mesh.wall_coping('Gate-side grey coping', 7.25, (wall_x, y + 1.61, front),
                         .44, materials['tile'], materials['snow'], seed=124 + int(wall_x))
    mesh.box('Snow Roof rear windbreak', (right - left, 1.62, .42), (0, y + .79, back),
             materials['plaster'], .019)
    mesh.wall_coping('Rear wall snowcap', right - left, (0, y + 1.61, back), .42,
                     materials['tile'], materials['snow'], seed=275)
    return floor, ground


def area(name, location, target, energy, tint, size):
    lamp = bpy.data.lights.new(name, 'AREA')
    lamp.energy = energy
    lamp.color = mesh.linear_light_color(tint)[:3]
    lamp.shape = 'DISK'
    lamp.size = size
    obj = bpy.data.objects.new(name, lamp)
    bpy.data.collections['LIGHTS'].objects.link(obj)
    obj.location = mesh.point(location)
    obj.rotation_euler = (mesh.point(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj['bake_role'] = 'fixture'
    return obj


def oil_lamp(name, position, material, contacts, support, zone, fixtures, watts=.61, storm=False):
    x, y, z = position
    with contacts.group(name, [support]):
        mesh.lathe(f'{name} real oil cup', [(0, 0), (.092, 0), (.119, .041), (.124, .087),
                   (.113, .098), (.104, .076), (.082, .052), (0, .052)], position, material['bronze'], 20)
        wick = mesh.lathe(f'{name} charred cotton wick', [(.007, 0), (.008, .028), (.004, .046), (0, .049)],
                         (x, y + .056, z), material['ash'], 9)
        if storm:
            for u in (-.078, .078):
                for v in (-.078, .078):
                    mesh.beam('Storm lantern plain frame', (x + u, y + .072, z + v),
                              (x + u, y + .261, z + v), .006, material['bronze'], .006)
            mesh.lathe('Storm lantern hammered cap', [(.126, .24), (.127, .265), (.061, .309), (.008, .31), (0, .317)],
                       position, material['bronze'], 16)
        source = mesh.light(f'{name} lamp light', (x, y + .14, z), watts, '#ffc27a', .032)
    fixtures.append((name, zone, wick, source, True, 'plain oil cup' if not storm else 'storm lantern'))


def gate(site, m, contacts, fixtures):
    mesh.REGION = 'gate'
    config = site['gate']
    _, y, z = config['center']
    width, depth, eave = config['width'], config['depth'], config['eave']
    half_open = config['clearWidth'] / 2
    stone = m['granite']
    mesh.box('Full bearing stone under the gate', (width, .30, depth + .42), (0, y - .13, z), stone, .025)
    mesh.box('Granite apron between the snow road and the stair foot',
             (3.36, .21, .62), (0, 1.074, 14.12), stone, .012)
    mesh.box('Continuous bedding beneath the granite gate stairs',
             (3.32, .19, 1.93), (0, 1.029, 13.29), stone, .012)
    for index in range(4):
        top = y - (3 - index) * .113
        height = top - 1.08
        mesh.worn_step('Worn granite gate tread', 3.28, height, .434, (0, top - height / 2, 13.67 - .391 * index), stone)
    for side in (-1, 1):
        px = side * (width / 2 + half_open) / 2
        for pz in (z - .95, z + .95):
            mesh.box('Stone shoe beneath the gate frame', (.53, .30, .49), (px, y + .13, pz), stone, .019)
            mesh.lathe('Gate load-bearing red post', [(.144, 0), (.148, .09), (.143, 1.21), (.126, eave - y - .18)],
                       (px, y + .28, pz), m['red'], 20)
        mesh.box('Limewashed side bay of the shelter gate', (width / 2 - half_open - .22, 1.92, depth - .20),
                 (px, y + 1.23, z), m['plaster'], .021)
        for index in range(9):
            mesh.box('Old gate door frame boards folded along the pier', (.080, 1.93, .11),
                     (side * (half_open + .055), y + 1.01, z - .71 + index * .16), m['wood'], .008)
        lx, wick_y, lz = site['gateLights'][(side + 1) // 2]
        shelf = mesh.box('Shallow granite sill for a gate oil light', (.42, .112, .46),
                         (lx, wick_y - .165, lz), stone, .018)
        mesh.box('Pillar beneath the gate lamp shelf', (.32, 1.09, .32), (lx, wick_y - .739, lz - .02), m['brick'], .015)
        oil_lamp(f'Gate {"west" if side < 0 else "east"} oil lamp', (lx, wick_y - .109, lz), m, contacts, shelf, 'gate', fixtures, 1.27)
    for zz in (z - 1.13, z + 1.13):
        mesh.box('Low transverse gate lintel', (width + .12, .242, .234), (0, eave - .295, zz), m['red'], .023)
    mesh.box('Underside boards within the gate shadow', (width, .12, depth), (0, eave - .12, z), m['wood'], .015)
    mesh.tiled_roof('Winter pass gate', 0, eave, z, width + .73, depth / 2 + .46, .89,
                    m['tile'], m['wood'], m['snow'], 'gate')


def outbuildings(site, m, court):
    mesh.REGION = 'court'
    for room in [*site['rooms'], {**site['kitchen'], 'name': 'Leeward kitchen', 'kitchen': True}]:
        left, right, back, front = (room[key] for key in ('west', 'east', 'rear', 'front'))
        width, depth = right - left, front - back
        x, z = (left + right) / 2, (front + back) / 2
        y, eave = court['level'], 4.02 if room.get('kitchen') else 4.19
        label = room['name']
        mesh.box(label + ' masonry foundation', (width + .10, .24, depth + .08), (x, y + .05, z), m['brick'], .025)
        for side in (left, right):
            mesh.box(label + ' side enclosure', (.19, eave - y, depth), (side, (eave + y) / 2, z),
                     m['plaster'], .018)
        mesh.box(label + ' rear wall', (width, eave - y, .19), (x, (eave + y) / 2, back), m['plaster'], .014)
        for px in (left + .19, right - .19):
            mesh.box(label + ' front post', (.25, eave - y, .23), (px, (eave + y) / 2, front), m['wood'], .018)
        mesh.box(label + ' sill beneath the front screen', (width, .72, .19), (x, y + .36, front), m['plaster'], .020)
        mesh.box(label + ' carrying lintel', (width, .25, .24), (x, eave - .16, front), m['red'], .015)
        if room.get('boarded'):
            for i in range(17):
                px = left + .28 + .181 * i
                mesh.box('Uneven boards winter-closing the west room', (.172, 1.54, .072),
                         (px, y + 1.46 + .024 * math.sin(i * 1.8), front), m['wood'], .009)
            for yy in (y + 1.15, y + 1.83):
                mesh.box('Old bracing across the winter boards', (width - .32, .097, .066), (x, yy, front + .065), m['wood'], .008)
        else:
            mesh.window(label + ' paper screen', x, y + 1.48, front, width - .5, 1.46, m['wood'], m['paper'])
        mesh.tiled_roof(label, x, eave, z, width + .55, depth / 2 + .35, .79, m['tile'], m['wood'], m['snow'], 'court')
        if room.get('kitchen'):
            mesh.box('Masonry kitchen chimney', (.43, .98, .38), (left + .63, eave + .58, z + .2), m['brick'], .028)
            mesh.box('Chimney top slab', (.54, .11, .49), (left + .63, eave + 1.10, z + .2), m['granite'], .013)
            for row in range(3):
                for i in range(8):
                    px = x - .69 + .196 * i + .057 * row
                    yy = y + .24 + .149 * row
                    mesh.beam('Split firewood stacked under cover', (px, yy, front - .57),
                              (px + .047, yy + .014, front + .218), .073, m['wood'], .059)


def earlier_lantern(x, z, y, top, index, m, fixtures):
    frame = m['wood']
    fade = m['glow'] if index in (1, 5) else m['red_faded' if index % 3 else 'red_dust']
    radius = .173 + .014 * math.sin(index * 2.3)
    mesh.beam('Old taut lamp cord', (x, y + .49, z), (x + .012, top, z), .005, m['rope'], .005)
    mesh.lathe('Aged red gauze around bent ribs', [(radius * r, bend) for r, bend in
               ((.71, 0), (.88, .11), (1., .24), (.93, .376), (.66, .485))], (x, y, z), fade, 20)
    for height in (0, .485):
        mesh.lathe('Worn wooden lantern ring', [(radius * .72, height - .013), (radius * .73, height + .009),
                   (radius * .67, height + .009), (radius * .66, height - .013), (radius * .72, height - .013)],
                   (x, y, z), frame, 20)
    for rib in range(9):
        turn = math.tau * rib / 9
        profile = [(x + r * radius * math.cos(turn), y + hh, z + r * radius * math.sin(turn))
                   for r, hh in ((.72, .005), (.96, .14), (1.006, .24), (.94, .375), (.67, .48))]
        mesh.curved_tube('Fine bowed rib of an earlier wish lantern', profile, [.003] * len(profile), frame, 5)
    mesh.beam('Thin string holding the earlier wish tag', (x + .018, y - .007, z), (x + .043, y - .084, z + .011),
              .0024, m['rope'], .0022)
    mesh.box('Unlettered wooden wish tag', (.048, .119, .010), (x + .043, y - .137, z + .012),
             m['tag'], 0., .08 * math.cos(index * 1.7))
    if index in (1, 5):
        wick = mesh.lathe('Low wick in an earlier wish lantern', [(.005, 0), (.007, .022), (0, .030)],
                         (x, y + .083, z), m['ash'], 9)
        source = mesh.light('Soft bounce from an earlier glowing wish', (x, y + .116, z), .17, '#ffad67', .043)
        fixtures.append((f'Earlier red wish {index}', 'hall', wick, source, True, 'gauze shade'))


def statue(x, y, z, m, contacts, platform):
    bronze = m['bronze']
    with contacts.group('Generic seated Buddha and lotus support', [platform]):
        mesh.lathe('Seated figure low lotus plinth', [(0, 0), (.41, 0), (.45, .079), (.49, .135),
                   (.42, .19), (0, .19)], (x, y, z), bronze, 30)
        mesh.lathe('Cross-legged seated silhouette', [(0, .18), (.40, .18), (.44, .218), (.39, .299), (.29, .345),
                   (.19, .392), (.166, .54), (.219, .75), (.181, .864), (.105, .895), (0, .899)],
                   (x, y, z), bronze, 28)
        mesh.lathe('Quiet rounded head and hair knot', [(0, .837), (.094, .856), (.135, .924), (.148, 1.03),
                   (.128, 1.112), (.095, 1.145), (.047, 1.167), (.040, 1.221), (0, 1.241)],
                   (x, y, z), bronze, 24)
        for side in (-1, 1):
            mesh.curved_tube('Elongated ear on the seated form',
                             [(x + side * .139, y + .991, z), (x + side * .155, y + .953, z + .012),
                              (x + side * .137, y + .909, z + .014)], [.024, .022, .015], bronze, 8)
            mesh.curved_tube('Resting forearm of the seated image', [(x + side * .197, y + .716, z + .019),
                             (x + side * .19, y + .50, z + .134), (x + side * .078, y + .421, z + .218)],
                             [.071, .063, .045], bronze, 10)
        mesh.curved_tube('Fold along the plain robe', [(x - .154, y + .819, z + .103),
                         (x - .081, y + .706, z + .17), (x + .127, y + .535, z + .13)],
                         [.009, .010, .008], m['tag'], 8)


def hall(site, m, contact, fixtures):
    mesh.REGION = 'hall'
    cfg = site['hall']
    left, right, back, front, y, eave = (cfg[k] for k in ('west', 'east', 'rear', 'front', 'floor', 'eave'))
    span, depth, z = right - left, front - back, .5 * (front + back)
    wall_height = eave - y
    mesh.box('Stone platform carries the hall timber frame', (span + .21, .36, depth + .47),
             (0, y - .187, z + .14), m['granite'], .023)
    for j in range(11):
        for i in range(12):
            px = left + (i + .5) * span / 12
            pz = back + (j + .5) * depth / 11
            mesh.irregular_paver('Worn hall floor stone', px, pz, span / 12 - .008, depth / 11 - .008,
                                 y + .007 * math.sin(i * 2.3 + j * .77), m['granite'])
    for side in (-1, 1):
        mesh.box('Limewashed side wall inside the hall', (.21, wall_height, depth), (side * right, y + wall_height / 2, z),
                 m['plaster'], .019)
        for zz in (back + .32, front - .30):
            mesh.lathe('Painted hall post on a granite shoe', [(.132, 0), (.145, .10), (.126, wall_height)],
                       (side * (right - .17), y, zz), m['red'], 22)
        px = side * 2.75
        mesh.box('Hall front sill below the lattice', (2.72, .66, .225), (px, y + .32, front), m['plaster'], .016)
        mesh.window('Deep paper lattice at the hall front', px, y + 1.51, front - .042, 2.61, 1.58, m['wood'], m['paper'])
        mesh.box('Front beam above the paper', (2.72, .46, .21), (px, y + 2.56, front), m['red'], .022)
    mesh.box('Subdued rear wall behind the Buddha', (span, wall_height, .22), (0, y + wall_height / 2, back),
             m['plaster'], .021)
    mesh.box('Two solid lintels support the half-open doors', (2.61, .27, .24), (0, eave - .17, front), m['red'], .021)
    for side in (-1, 1):
        x = side * 1.26
        mesh.box('Main doorway jamb with stone threshold', (.19, 2.51, .25), (x, y + 1.25, front), m['red'], .015)
        if side < 0:
            for board in range(6):
                mesh.box('Half-open left hall door boards', (.154, 2.17, .075),
                         (x + .038 + .138 * board, y + 1.17, front + .052 + board * .028), m['red'], .006, -.14)
        else:
            for board in range(6):
                mesh.box('Hall door folded open against the jamb', (.153, 2.17, .075),
                         (x - .036, y + 1.17, front - board * .133), m['red'], .007, math.pi / 2)
    for index in range(2):
        step = y - (1 - index) * .165
        height = step - 1.60
        mesh.worn_step('Rounded short steps from court into hall', 2.61, height,
                       .368, (0, step - height / 2, front + .62 - index * .33), m['granite'])
    mesh.box('Plain room ceiling below the cold roof', (span, .085, depth), (0, eave + .008, z), m['plaster'], .012)
    for zz in (-9.3, -7.46, -6.21, -4.66):
        mesh.box('Old transverse beams carry the winter lanterns', (span, .242, .193),
                 (0, eave - .27, zz), m['wood'], .019)
    mesh.tiled_roof('Temple main hall', 0, eave, z, span + .97, depth / 2 + .64, 1.64,
                    m['tile'], m['wood'], m['snow'], 'hall')
    for px in (-3.41, 3.41):
        mesh.lathe('Slim front veranda post', [(.116, 0), (.124, .09), (.117, 1.1), (.104, 2.68)],
                   (px, y - .11, front + .52), m['red'], 20)
    for index, (px, pz) in enumerate(((-2.2, -6.21), (-1.16, -6.21), (1.10, -6.21), (2.05, -6.21),
                                      (-1.96, -4.68), (.61, -4.74), (2.3, -4.75), (2.8, -7.42))):
        earlier_lantern(px, pz, 3.20 + .066 * math.sin(index * 1.82), 4.47, index, m, fixtures)
    xcord, ycord, zcord = site['visitorCord']
    mesh.beam('One empty cord hanging from the centre beam', (xcord, ycord - .274, zcord),
              (xcord, ycord + .048, zcord), .006, m['rope'], .006)
    for x in (-2.8, 2.8):
        area('Paper lattice softly admits the open-snow sky', (x, y + 1.68, front - .16),
             (x * .6, y + .55, front - 2.0), 2.76, '#e5d9bd', 1.13)
    area('Warm veranda lamp reflects from the pale hall ceiling', (1.6, y + 1.44, front - 2.21),
         (0, y + 3.05, front - 3.4), 1.35, '#ffdcac', 1.16)
    # The kit and practical lamp share the guest-scale height rather than altar height.
    table = mesh.box('Table where visitors find frames and separate oil cups', (1.53, .10, .69),
                     (-2.35, y + .679, -5.42), m['wood'], .018)
    for px in (-2.97, -1.75):
        for pz in (-5.65, -5.19):
            mesh.box('Table leg with visible square joinery', (.098, .65, .091), (px, y + .322, pz), m['wood'], .009)
    with contact.group('Waiting oil cup on visitor table', [table]):
        mesh.lathe('Unlit plain cup beside the waiting frames', [(0, 0), (.075, 0), (.084, .040),
                   (.071, .047), (.059, .013), (0, .012)], (-2.56, y + .729, -5.52), m['bronze'], 20)
    veranda = mesh.box('Veranda storm lantern stone shelf', (.45, .13, .57),
                      (3.05, y + .7, front + .36), m['granite'], .020)
    mesh.box('Old masonry stand below the storm lamp', (.35, .69, .34), (3.05, y + .318, front + .36), m['brick'], .018)
    oil_lamp('Veranda everyday storm lantern', (3.05, y + .765, front + .36), m, contact, veranda, 'court', fixtures, .7, True)
    mesh.beam('Broom left against the hall front', (-3.49, y - .215, front + .52),
              (-3.62, y + 1.07, front + .17), .015, m['wood'], .012)
    for i in range(15):
        width = (i - 7) * .013
        mesh.beam('Split grass broom fibre', (-3.49 + width, y - .264, front + .55 + .04 * math.sin(i)),
                  (-3.49 + width * .2, y - .057, front + .48), .004, m['rope'], .003)
    mesh.REGION = 'altar'
    plinth = mesh.box('Low stone altar supports the seated figure', (2.09, .52, .93),
                     (0, y + .260, back + .87), m['granite'], .027)
    statue(0, y + .52, back + .91, m, contact, plinth)
    oil_lamp('Altar ordinary oil lamp', (.70, y + .52, back + 1.12), m, contact, plinth, 'hall', fixtures, .68)


def reference_camera(name, position, look, fov):
    data = bpy.data.cameras.new(name)
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 24
    data.lens = 12 / math.tan(math.radians(fov) / 2)
    obj = bpy.data.objects.new(name, data)
    bpy.data.collections['CAMERAS'].objects.link(obj)
    obj.location = mesh.point(position)
    obj.rotation_euler = (mesh.point(look) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    obj['cover_viewport'] = '[1440, 900]'
    return obj


def painted_fixture_data(fixtures, contact):
    rows = []
    for name, zone, wick, source, lit, kind in fixtures:
        points = [point for _, _, point in contact.vertices([wick])]
        height = max(point.z for point in points)
        crown = [point for point in points if abs(point.z - height) <= .000001]
        tip = sum(crown, Vector()) / len(crown)
        rows.append({
            'name': name, 'zone': zone, 'kind': kind, 'lit': lit, 'wickTip': list(engine(tip)),
            'wickObject': wick.name, 'pointLightObject': source.name,
            'pointLight': list(engine(source.matrix_world.translation)),
            'watts': float(source.data.energy), 'linearColor': list(source.data.color),
        })
    return rows


def build(site, projection):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for name in ('STATIC', 'LIGHTS', 'RUNTIME', 'CAMERAS'):
        scene.collection.children.link(bpy.data.collections.new(name))
    mesh.STATIC = bpy.data.collections['STATIC']
    mesh.RNG = random.Random(60211)
    contact = RestingContacts(height_query=mesh.resting_contact_height)
    mesh.CONTACTS = contact
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.render.resolution_x, scene.render.resolution_y = 1440, 900
    scene.render.resolution_percentage = 100
    pre_exposure = projection['preExposure']
    plates.bpy = bpy
    plates.set_world(scene, look_transport(projection['light']['day']), pre_exposure, 'Clear winter midday over the sheltered court')
    daylight = scene.world
    plates.set_world(scene, look_transport(projection['light']['night']), pre_exposure, 'Clear moonlit winter pass')
    scene['one_light_ambient_worlds'] = json.dumps({'day': daylight.name})
    m = palette()
    build_approach(site, m)
    courtyard(site, m)
    fixtures = []
    gate(site, m, contact, fixtures)
    outbuildings(site, m, site['court'])
    hall(site, m, contact, fixtures)
    basis = [site['visitorCord'][0], 3.54, site['visitorCord'][2]]
    source = mesh.light('Measured visitor wick transport basis', basis, .33, '#ffc583', .027, role='lamp')
    scene['place_id'] = scene['one_light_place'] = 'snow-roof'
    scene['snow_court_revision'] = site['revision']
    scene['lightmap_resolutions'] = json.dumps({'gate': 1024, 'court': 1024, 'hall': 1024, 'altar': 512})
    scene['one_light_camera_far'] = 880
    scene['one_light_camera_pre_exposure'] = pre_exposure
    scene['one_light_lamp_pass_quantity'] = 'indirect-diffuse-radiance-per-unit-albedo'
    scene['one_light_lamp_anchor'] = json.dumps(basis)
    scene['one_light_lamp_basis'] = json.dumps({'position': basis, 'watts': source.data.energy,
        'linearColor': list(source.data.color), 'pointRadiusMetres': source.data.shadow_soft_size,
        'sourceObject': source.name})
    scene['one_light_anchor_fields'] = json.dumps(['snow_court_revision', 'snow_court_fixtures_engine',
                                                   'one_light_lamp_basis'])
    scene.camera = reference_camera('Reference_SnowCourtEntrance', **{
        'position': site['walk'][0]['position'], 'look': site['walk'][0]['look'], 'fov': site['walk'][0]['fov'],
    })
    for frame in site['keyFrames']:
        pose = next(p for p in site['walk'] if p['time'] == frame['time'])
        reference_camera('Reference_' + frame['name'], pose['position'], pose['look'], pose['fov'])
    for name, view in site['views'].items():
        reference_camera('Reference_' + name, view['position'], view['look'], view['fov'])
    bpy.context.view_layer.update()
    scene['snow_court_fixtures_engine'] = json.dumps(painted_fixture_data(fixtures, contact))
    mesh.apply_surface_tints()
    scene['source_lightmap_charts'] = json.dumps(mesh.complete_source_charts(list(mesh.STATIC.objects)))
    return contact.audit(fail=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    site, projection = (json.loads(path.read_text()) for path in (SITE, PROJECTION))
    contact = build(site, projection)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    sources = (Path(__file__), Path(__file__).with_name('snow_court_approach.py'), SITE, PROJECTION)
    scene['source_authoring_sha256'] = json.dumps({
        str(path.resolve().relative_to(ROOT)): sha256(path.read_bytes()).hexdigest() for path in sources
    })
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    output.with_suffix('.audit.json').write_text(json.dumps(contact, indent=2) + '\n')
    print('SNOW_COURT_SOURCE', output, 'objects', len(mesh.STATIC.objects),
          'resting groups', len(contact['groups']), 'fixtures', len(json.loads(scene['snow_court_fixtures_engine'])))


if __name__ == '__main__':
    main()
