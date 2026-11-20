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
import snow_court_use as everyday
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
        'tile': mesh.material('Repaired northern grey roof tile', '#727579', 'grey_roof_tiles', .78),
        'paper': mesh.material('Warm oiled window paper', '#dfc597', rough=.8, emission=.18),
        'bronze': mesh.material('Dull old lamp bronze', '#735438', rough=.63, metal=.71),
        'ash': mesh.material('Char and burned wick', '#272822', rough=.96),
        'oil': mesh.material('Dark clear seed oil', '#6b4628', rough=.22, metal=.03),
        'figure': mesh.material('Aged cast bronze of the small seated figure', '#8b7453', rough=.66, metal=.27),
        'glow': mesh.material('Thin gauze over low flame', '#b97c69', rough=.86, emission=.04),
        'bamboo': mesh.material('Split bamboo beneath faded linen', '#9a7350', rough=.94),
        'red_faded': mesh.material('Faded dusty rose gauze', '#b38c82', rough=.94),
        'red_dust': mesh.material('Pink-white sun-faded gauze', '#c1a9a0', rough=.96),
        'red_old': mesh.material('Faded iron-red gauze', '#92655b', rough=.92),
        'new_gauze': mesh.material('Dry clean red gauze available at the guest table', '#a64433', rough=.83),
        'tag': mesh.material('Unvarnished wooden wish tag', '#bba17c', 'weathered_planks', .88),
        'rope': mesh.material('Rough suspension cord', '#8a7962', rough=.98),
    }
    mesh.vertex_tint_shader(materials['red'])
    materials['red']['one_light_painted_timber'] = True
    mesh.painted_timber_finish(materials['red'])
    mesh.weather_plaster(materials['plaster'])
    return materials


def gauze_maps(materials):
    """Use the same licensed linen study already used by the visitor shade."""
    linen = ROOT / 'web/public/places/snow-roof'
    for material in materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        for filename, socket in (('gauze-weave.webp', 'Base Color'),
                                 ('gauze-normal.webp', 'Normal'),
                                 ('gauze-roughness.webp', 'Roughness')):
            texture = nodes.new('ShaderNodeTexImage')
            texture.image = bpy.data.images.load(str(linen / filename), check_existing=True)
            texture.label = 'Photographed rough linen, Poly Haven CC0'
            if socket == 'Base Color':
                multiply = nodes.new('ShaderNodeMix')
                multiply.data_type = 'RGBA'
                multiply.blend_type = 'MULTIPLY'
                multiply.inputs[0].default_value = 1
                multiply.inputs[7].default_value = bsdf.inputs[socket].default_value
                links.new(texture.outputs['Color'], multiply.inputs[6])
                links.new(multiply.outputs[2], bsdf.inputs[socket])
            elif socket == 'Normal':
                texture.image.colorspace_settings.name = 'Non-Color'
                normal = nodes.new('ShaderNodeNormalMap')
                normal.inputs['Strength'].default_value = .59
                links.new(texture.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs['Normal'], bsdf.inputs[socket])
            else:
                texture.image.colorspace_settings.name = 'Non-Color'
                links.new(texture.outputs['Color'], bsdf.inputs[socket])


def author_court_cap_charts(objects):
    """Give every disconnected clay cap its own metric lightmap strip."""
    coping = {'Snow on grey court coping', 'Gate-side grey coping', 'Rear wall snowcap'}
    for obj in objects:
        name = obj.name.split('.', 1)[0]
        if name in coping:
            samples = 7
        elif name.endswith(' overlapping half-round ridge caps'):
            samples = 9
        else:
            continue
        # Each individual cap has two identical curved cross-sections.
        # Measure along the curve rather than flattening it onto the snow.
        vertices = obj.data.vertices
        stride = samples * 2
        if len(vertices) % stride:
            raise RuntimeError('Unexpected Snow Court cap topology: ' + obj.name)
        coordinates = []
        for start in range(0, len(vertices), stride):
            along = (vertices[start + samples].co - vertices[start].co).length
            across = [0.]
            for index in range(start + 1, start + samples):
                across.append(across[-1] + (vertices[index].co - vertices[index - 1].co).length)
            coordinates.extend((end, distance) for end in (0., along) for distance in across)
        mesh.source_uv(obj, [[coordinates[index] for index in face.vertices] for face in obj.data.polygons],
                       'Individual clay cap strips with measured length and arc.')


def courtyard(site, materials):
    court = site['court']
    left, right, back, front, y = (court[k] for k in ('west', 'east', 'rear', 'front', 'level'))
    mesh.REGION = 'court'
    floor = mesh.box('Packed ground below the winter court', (right - left, .48, front - back),
                     (0, y - .24, (back + front) / 2), materials['granite'], .012)
    ground = everyday.swept_ground(mesh, site, materials)
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


def gate_foothill(site, stone, snow):
    mesh.REGION = 'gate'
    edge = site['court']['front']
    level = site['court']['level']
    across = (-22, -14, -10, -8, -6, -4, -2.8, -1.7, -1, 0, 1, 1.7, 2.8, 4, 6, 8, 10, 14, 22)
    depths = [edge - .22 + (14.35 - edge + .22) * i / 22 for i in range(23)]
    vertices, faces = [], []
    for row, z in enumerate(depths):
        climb = (14.35 - z) / (14.35 - edge + .22)
        for col, x in enumerate(across):
            flank = min(1., max(0., (abs(x) - 1.7) / 1.1))
            flank *= flank
            relief = .033 * math.sin(x * 1.82 + z * 1.1) * math.sin(math.pi * climb)
            y = 1.18 + (level - 1.193) * climb * flank + relief * flank
            if z < 12.41:
                y += (level - 1.25) * min(1., (12.41 - z) / 2.2) * (1 - flank)
            vertices.append((x - .22 * (1 - climb), y, z))
            if row and col:
                i = len(vertices) - 1
                faces.append((i - len(across) - 1, i - 1, i, i - len(across)))
    slope = mesh.mesh_object('Snow shoulder carries the gate and court masonry', vertices, faces, snow)
    mesh.source_uv(slope, [[(vertices[i][0], vertices[i][2]) for i in face] for face in faces],
                   'Connected foothill cut in world metres.')
    for face in slope.data.polygons:
        face.use_smooth = True
    for x in (-6.20, 6.20):
        mesh.box('Buried granite footing beneath the gate-side wall', (7.25, .48, .55),
                 (x, level - .233, edge), stone, .018)


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
        mesh.lathe(f'Meniscus within {name}', [(0, .064), (.086, .064), (.095, .070), (.097, .071)],
                   position, material['oil'], 24)
        wick = mesh.lathe(f'{name} charred cotton wick', [(.007, 0), (.008, .028), (.004, .046), (0, .049)],
                         (x, y + .056, z), material['ash'], 9)
        if storm:
            glass = mesh.material('Thin pale storm lamp glass', '#e9ddc9', rough=.16)
            optical = glass.node_tree.nodes.get('Principled BSDF')
            optical.inputs['IOR'].default_value = 1.48
            optical.inputs['Transmission Weight'].default_value = .94
            mesh.lathe('Hand-blown windscreen around the veranda flame', [
                (.101, .110), (.103, .146), (.101, .230), (.095, .247),
                (.093, .247), (.099, .230), (.101, .146), (.099, .110), (.101, .110),
            ], position, glass, 22)
            mesh.lathe('Storm lantern separate chimney rim and vent', [
                (.105, .074), (.102, .105), (.103, .119), (.119, .116), (.124, .101), (.121, .080), (.105, .074),
            ], position, material['bronze'], 20)
            for u in (-.078, .078):
                for v in (-.078, .078):
                    mesh.beam('Storm lantern plain frame', (x + u, y + .072, z + v),
                              (x + u, y + .261, z + v), .006, material['bronze'], .006)
            mesh.lathe('Storm lantern hammered cap', [(.126, .24), (.127, .265), (.061, .309), (.008, .31), (0, .317)],
                       position, material['bronze'], 16)
            mesh.curved_tube('Bent lifting handle over storm lamp', [
                (x - .076, y + .269, z), (x - .066, y + .324, z), (x, y + .352, z),
                (x + .066, y + .321, z), (x + .076, y + .268, z),
            ], [.0048] * 5, material['bronze'], 7)
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


def outbuildings(site, m, court, ground, contact):
    mesh.REGION = 'court'
    for room in [*site['rooms'], {**site['kitchen'], 'name': 'Leeward kitchen', 'kitchen': True}]:
        left, right, back, front = (room[key] for key in ('west', 'east', 'rear', 'front'))
        width, depth = right - left, front - back
        x, z = (left + right) / 2, (front + back) / 2
        y, eave = court['level'], 4.02 if room.get('kitchen') else 4.19
        label = room['name']
        mesh.box(label + ' masonry foundation', (width + .10, .24, depth + .08), (x, y + .05, z), m['brick'], .025)
        facing = -1 if x > 0 else 1
        inner, outer = (left, right) if facing == -1 else (right, left)
        mesh.box(label + ' outer side enclosure', (.19, eave - y, depth),
                 (outer, (eave + y) / 2, z), m['plaster'], .018)
        aperture_z = z + (.43 if room.get('kitchen') else .34)
        opening, low, high, frame = everyday.side_aperture(
            mesh, label, inner, aperture_z, back, front, y, eave, facing, m['wood'], m['plaster'])
        if room.get('boarded'):
            everyday.winter_boards(mesh, label + ' court-side opening', frame, aperture_z,
                                   opening, low, high, True, m)
        else:
            everyday.warm_side_window(mesh, area, label, frame, aperture_z, opening, low, high,
                                      facing, m['wood'], m['paper'])
        mesh.box(label + ' rear wall', (width, eave - y, .19), (x, (eave + y) / 2, back), m['plaster'], .014)
        for px in (left + .19, right - .19):
            mesh.box(label + ' front post', (.25, eave - y, .23), (px, (eave + y) / 2, front), m['wood'], .018)
        mesh.box(label + ' sill beneath the front screen', (width, .72, .19), (x, y + .36, front), m['plaster'], .020)
        mesh.box(label + ' carrying lintel', (width, .25, .24), (x, eave - .16, front), m['red'], .015)
        if room.get('boarded'):
            everyday.winter_boards(mesh, label + ' front opening', front, x,
                                   width - .47, y + .72, eave - .28, False, m)
        else:
            mesh.window(label + ' paper screen', x, y + 1.48, front, width - .5, 1.46, m['wood'], m['paper'])
        mesh.tiled_roof(label, x, eave, z, width + .55, depth / 2 + .35, .79, m['tile'], m['wood'], m['snow'], 'court')
        everyday.replace_roof_tiles(mesh, label, inner - .10 * facing, front + .35)
        if room.get('kitchen'):
            # The working stove flue comes through the court-facing roof
            # slope. The nearer ridge otherwise hides the stack and smoke.
            cx, cz = right - .81, front - .90
            rim = eave + 1.37
            lower, upper = eave - .18, rim - .09
            shaft_height, shaft_mid = upper - lower, (lower + upper) / 2
            for side in (-1, 1):
                mesh.box('Masonry cheek beneath the open kitchen flue', (.135, shaft_height, .39),
                         (cx + side * .154, shaft_mid, cz), m['brick'], .016)
                mesh.box('Masonry end beneath the open kitchen flue', (.174, shaft_height, .126),
                         (cx, shaft_mid, cz + side * .131), m['brick'], .016)
                mesh.box('Granite cap at the sides of the flue opening', (.159, .134, .51),
                         (cx + side * .191, rim - .067, cz), m['granite'], .014)
                mesh.box('Granite cap at the ends of the flue opening', (.23, .134, .146),
                         (cx, rim - .067, cz + side * .181), m['granite'], .013)
            # Preserve a visibly open bore so the smoke begins within the
            # masonry cap. The windblown snow only clings on its leeward edge.
            mesh.snow_coping('Small leeward frost ledge on the flue cap', .42, .085, .034,
                            (cx - .214, rim - .006, cz - .019), m['snow'], turn=True, seed=73)
            everyday.firewood_stack(mesh, site, room, ground, contact, m)
            area('Snow light reflected toward the split fuel under the kitchen eave',
                 (right + 1.08, y + 1.17, front + 1.27), (right + .02, y + .49, front + .19),
                 9.8, '#d9e1e7', .92)
            bpy.context.scene['snow_court_smoke_engine'] = json.dumps([cx, rim + .006, cz])


def earlier_lantern(x, z, y, top, index, m, fixtures, lit=False):
    frame = m['wood']
    faded = m['glow' if lit else ('red_dust', 'red_faded', 'red_old')[index % 3]]
    radius = .112 + .018 * math.sin(index * 2.3)
    height = .324 + .046 * math.cos(index * 1.43)
    phase = .17 * math.sin(index * 2.51)
    rows, segments, ribs = 11, 36, 9

    def cloth_point(u, v, inset=0.):
        angle = phase + math.tau * u
        middle = math.sin(math.pi * v)
        fullness = .70 + (.30 + .028 * math.cos(index * 2.6)) * middle
        seam = (.0038 + .0019 * math.cos(angle * 3. - index)) * math.cos(ribs * (angle - phase))
        folds = .0042 * math.sin(angle * 3. + v * 5. + index) * middle
        width = radius * fullness + seam * middle + folds - inset
        sag = .012 * math.sin(angle * 2. + index) * middle
        edge = .0045 * math.sin(angle * 5. + index) * (1. - middle) if not inset else 0.
        return (x + width * math.cos(angle) + sag, y + v * height + edge, z + width * math.sin(angle))

    points = [cloth_point(col / segments, row / rows)
              for row in range(rows + 1) for col in range(segments)]
    faces, chart, fabric = [], [], []
    tear = (22 + 5 * index) % segments
    tear_row = 2 + index % 4
    worn_edge = index % 4 == 1
    circumference = math.tau * radius
    for row in range(rows):
        for col in range(segments):
            split = row in (tear_row, tear_row + 1) and col == tear
            lost_edge = row == 0 and (col - tear) % segments < 2
            if not lit and ((index % 3 == 0 and split) or (worn_edge and lost_edge)):
                continue
            right = (col + 1) % segments
            faces.append((row * segments + col, (row + 1) * segments + col,
                          (row + 1) * segments + right, row * segments + right))
            uv = [(u / segments * circumference, v / rows * height)
                  for u, v in ((col, row), (col, row + 1), (col + 1, row + 1), (col + 1, row))]
            chart.append(uv)
            fabric.append([(u / .158, v / .158) for u, v in uv])
    shade = mesh.mesh_object('Worn gauze around bowed bamboo', points, faces, faded)
    mesh.source_uv(shade, chart, 'Unrolled metre-scale cloth with a seam and intermittent damage.')
    surface = shade.data.uv_layers['UVMap'].data
    ageing = shade.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
    shade.data.color_attributes.active_color = ageing
    dye = tuple(faded['one_light_vertex_base_tint'])
    for polygon, uv in zip(shade.data.polygons, fabric):
        polygon.use_smooth = True
        for loop, coordinate in zip(polygon.loop_indices, uv):
            surface[loop].uv = coordinate
            vertex = shade.data.loops[loop].vertex_index
            u, v = vertex % segments / segments, vertex // segments / rows
            fade = (.18 + .15 * math.cos(u * math.tau - index * 1.7)) * (1. - .48 * v)
            dirt = .10 * math.sin(u * math.tau * 3. + 2.4 * v + index) ** 2 + .15 * v ** 5
            age = 1. - dirt * (.35 if lit else 1.)
            ageing.data[loop].color = (*(age * (d + (white - d) * fade) for d, white in
                                         zip(dye, (.61, .51, .43))), 1.)
    mesh.beam('Old taut lamp cord', (x, y + height, z), (x + .012, top, z), .005, m['rope'], .005)
    for ring_height in (0, height):
        mesh.lathe('Worn wooden lantern ring', [(radius * .72, ring_height - .013),
                   (radius * .73, ring_height + .009), (radius * .67, ring_height + .009),
                   (radius * .66, ring_height - .013), (radius * .72, ring_height - .013)],
                   (x, y, z), frame, 20)
        mesh.beam('Slender hardwood bar supporting the hanging lantern', (x - radius * .70, y + ring_height, z),
                  (x + radius * .70, y + ring_height, z), .007, frame, .006)
    for rib in range(ribs):
        profile = [cloth_point(rib / ribs, level, .0048) for level in (0, .20, .41, .62, .82, 1)]
        mesh.curved_tube('Fine bowed bamboo beneath the gauze', profile, [.0019] * len(profile), m['bamboo'], 5)
    for end in (-1, 1):
        mesh.beam('Tied end of the tag string', (x + end * .011, y - .007, z),
                  (x + .032 + end * .007, y - .066, z + .02), .0018, m['rope'], .0015)
    mesh.box('Weathered wooden wish tag', (.053, .125, .008), (x + .032, y - .123, z + .02),
             m['tag'], .002, .15 * math.cos(index * 1.7))
    mesh.lathe('Old soot-darkened cup inside the gauze', [
        (0, .006), (.042, .006), (.055, .033), (.048, .040), (.039, .024), (0, .023),
    ], (x, y, z), m['bronze'], 15)
    if lit:
        wick = mesh.lathe('Low wick in an earlier wish lantern', [(.005, 0), (.007, .012), (0, .020)],
                         (x, y + .023, z), m['ash'], 9)
        source = mesh.light('Soft bounce from an earlier glowing wish', (x, y + .066, z), .17, '#ffad67', .043)
        fixtures.append((f'Earlier red wish {index}', 'hall', wick, source, True, 'gauze shade'))


def statue(x, y, z, m, contacts, platform):
    bronze = m['figure']
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
            mesh.curved_tube('Lowered lid in the worn face', [
                (x + side * .032, y + 1.022, z + .145), (x + side * .055, y + 1.016, z + .139),
                (x + side * .079, y + 1.019, z + .126),
            ], [.0042, .0055, .0034], bronze, 6)
        mesh.curved_tube('Simple low nose relief', [(x, y + 1.039, z + .143),
                         (x, y + .993, z + .158), (x, y + .978, z + .146)],
                         [.013, .016, .014], bronze, 8)
        mesh.curved_tube('Barely raised mouth in the cast face', [
            (x - .026, y + .954, z + .134), (x, y + .950, z + .142), (x + .026, y + .954, z + .134),
        ], [.005, .008, .005], bronze, 7)
        mesh.curved_tube('Hands resting together over the robe', [(x - .084, y + .422, z + .206),
                         (x - .025, y + .407, z + .246), (x + .030, y + .414, z + .245),
                         (x + .082, y + .424, z + .209)], [.042, .031, .029, .040], bronze, 8)
        mesh.curved_tube('Fold along the plain robe', [(x - .154, y + .819, z + .103),
                         (x - .081, y + .706, z + .17), (x + .127, y + .535, z + .13)],
                         [.009, .010, .008], m['tag'], 8)


def waiting_lanterns(table, top, m, contact):
    for index, (x, z, radius, height) in enumerate((
        (-2.80, -5.48, .108, .292), (-2.37, -5.48, .144, .378),
    ), start=1):
        with contact.group(f'Unlit spare gauze frame {index} set on the table', [table]):
            mesh.lathe('Unlit guest shade with a clean open throat', [
                (radius * .68, .008), (radius * .91, height * .24), (radius, height * .50),
                (radius * .91, height * .76), (radius * .68, height - .006),
            ], (x, top, z), m['new_gauze'], 24)
            for lift in (0, height - .013):
                mesh.lathe('Clean birch ring on the spare frame', [
                    (radius * .64, lift), (radius * .75, lift), (radius * .73, lift + .013),
                    (radius * .66, lift + .013), (radius * .64, lift),
                ], (x, top, z), m['tag'], 24)
            for rib in range(8):
                angle = math.tau * rib / 8
                rib_path = [(x + radius * width * math.cos(angle), top + height * level,
                             z + radius * width * math.sin(angle))
                            for width, level in ((.70, .02), (.93, .25), (1., .5), (.93, .75), (.70, .98))]
                mesh.curved_tube('Light birch rib of the unlit table shade', rib_path, [.0026] * 5, m['tag'], 5)
    with contact.group('Two unlit oil cups on the guest table', [table]):
        for x, z, width in ((-1.88, -5.58, .058), (-1.87, -5.28, .076)):
            mesh.lathe('Separate shallow oil cup beside the waiting shades', [
                (0, 0), (width * .87, 0), (width, .039), (width * .89, .045),
                (width * .72, .017), (0, .017),
            ], (x, top, z), m['bronze'], 20)


def longitudinal_beam(name, sizes, at, material, offset):
    beam = mesh.box(name, sizes, at, material, .019)
    # The scan contains separate nailed boards. Use the face of a single
    # board along the timber axis so its joints and spalled knots do not
    # repeat across the beam as dark seams and pale geometric marks.
    uv = beam.data.uv_layers['UVMap'].data
    for polygon in beam.data.polygons:
        face_axis = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
        along = 0 if face_axis else 1
        cross = 3 - face_axis - along
        for loop in polygon.loop_indices:
            point = beam.data.vertices[beam.data.loops[loop].vertex_index].co
            uv[loop].uv = (.442 + point[cross] * .16, point[along] / 3.40 + offset)
    return beam


def hall_paper_and_lattice(x, y, front, m):
    width, height = 2.61, 1.58
    center = y + 1.51
    mesh.window('Deep paper lattice at the hall front', x, center, front - .042,
                width, height, m['wood'], m['paper'])
    inner = front - .196
    for side in (-1, 1):
        mesh.box('Interior frame around the oiled paper', (.073, height + .11, .055),
                 (x + side * (width / 2 + .019), center, inner), m['wood'], .008)
        mesh.box('Interior paper sill and upper rail', (width + .11, .070, .058),
                 (x, center + side * (height / 2 + .015), inner), m['wood'], .008)
    for i in range(1, int(width / .16)):
        inset = i * width / int(width / .16) - width / 2
        mesh.box('Hand-cut inner upright of the paper lattice', (.023, height, .038),
                 (x + inset, center, inner), m['wood'], .003)
    for i in range(1, int(height / .22)):
        inset = i * height / int(height / .22) - height / 2
        mesh.box('Hand-cut inner crossbar of the paper lattice', (width, .022, .039),
                 (x, center + inset, inner - .004), m['wood'], .003)


def scripture_shelf(front, y, m, contact):
    x, z = -2.14, front - .35
    board_y = y + .44
    board = mesh.box('Low scripture ledge below the paper window', (1.01, .062, .34),
                     (x, board_y, z), m['wood'], .012)
    for side in (-1, 1):
        mesh.box('Pegged timber support beneath the scripture shelf', (.072, .24, .31),
                 (x + side * .37, y + .303, z + .017), m['wood'], .009)
    pages = mesh.material('Worn edges of the folded scripture paper', '#a68d65', rough=.94)
    cloth = mesh.material('Dark indigo covers of the wrapped scriptures', '#50514e', rough=.94)
    for index, (dx, width, height, twist) in enumerate(((-.29, .25, .066, -.047), (-.005, .22, .043, .052),
                                                          (.26, .248, .082, -.018))):
        base = board_y + .031
        with contact.group(f'Wrapped scripture copy {index + 1} on the interior ledge', [board]):
            mesh.box('Bound pages resting on the shelf', (width, height, .155),
                     (x + dx, base + height * .50, z), pages, .001, twist)
            mesh.box('Folded cloth fits the top of the scripture', (width + .010, .009, .164),
                     (x + dx, base + height + .0035, z), cloth, .001, twist)
            mesh.box('Folded cloth along the spine', (width, height - .001, .014),
                     (x + dx, base + height * .50, z + .078), cloth, .001, twist)


def bedded_hall_paver(x, z, width, depth, height, material):
    import bmesh

    paver = mesh.irregular_paver('Worn hall floor stone', x, z, width, depth, height, material)
    # The lowest bevel ring sits inside the solid platform, whose top is
    # seven millimetres below the nominal floor. Keep the whole exposed
    # upper nosing and top while removing the enclosed slab underneath.
    data = paver.data
    geometry = bmesh.new()
    geometry.from_mesh(data)
    buried = [vertex for vertex in geometry.verts if vertex.co.z < height - .07]
    bmesh.ops.delete(geometry, geom=buried, context='VERTS')
    geometry.to_mesh(data)
    geometry.free()
    data.update()
    charts = [[(data.vertices[index].co.x - x, -data.vertices[index].co.y - z)
               for index in polygon.vertices] for polygon in data.polygons]
    mesh.source_uv(paver, charts, 'One planar chart for the full exposed upper paver and bevel.')
    return paver


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
            bedded_hall_paver(px, pz, span / 12 - .008, depth / 11 - .008,
                              y + .007 * math.sin(i * 2.3 + j * .77), m['granite'])
    for side in (-1, 1):
        mesh.box('Limewashed side wall inside the hall', (.21, wall_height, depth), (side * right, y + wall_height / 2, z),
                 m['plaster'], .019)
        for zz in (back + .32, front - .30):
            mesh.lathe('Painted hall post on a granite shoe', [(.132, 0), (.145, .10), (.126, wall_height)],
                       (side * (right - .17), y, zz), m['red'], 22)
        px = side * 2.75
        mesh.box('Hall front sill below the lattice', (2.72, .66, .225), (px, y + .32, front), m['plaster'], .016)
        hall_paper_and_lattice(px, y, front, m)
        mesh.box('Low timber apron below the paper lattice', (2.66, .087, .091),
                 (px, y + .542, front - .175), m['wood'], .010)
        for zz in (back + 1.83, front - 1.98):
            mesh.box('Old exposed timber on the side limewash', (.15, wall_height - .17, .127),
                     (side * (right - .144), y + wall_height / 2, zz), m['wood'], .011)
        mesh.box('Front beam above the paper', (2.72, .46, .21), (px, y + 2.56, front), m['red'], .022)
    scripture_shelf(front, y, m, contact)
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
    for index, zz in enumerate((-9.3, -7.46, -6.21, -5.44, -4.66)):
        longitudinal_beam('Old transverse beams carry the winter lanterns', (span, .242, .193),
                          (0, eave - .27, zz), m['wood'], index * .239)
    mesh.tiled_roof('Temple main hall', 0, eave, z, span + .97, depth / 2 + .64, 1.64,
                    m['tile'], m['wood'], m['snow'], 'hall')
    for px in (-3.41, 3.41):
        mesh.lathe('Slim front veranda post', [(.116, 0), (.124, .09), (.117, 1.1), (.104, 2.68)],
                   (px, y - .11, front + .52), m['red'], 20)
    # Stagger the three working rows under their beams. Both lower rows
    # leave the central sightline and the visitor's reach unobstructed.
    wishes = (
        (-6.21, ((-1.48, 3.42), (-.59, 3.26), (.58, 3.39), (1.53, 3.29))),
        (-5.44, ((-1.72, 3.58), (-.78, 3.77), (.71, 3.73), (1.65, 3.62))),
        (-4.66, ((-2.61, 3.22), (-1.49, 3.12), (-.62, 3.18),
                 (.43, 3.14), (1.39, 3.25), (2.55, 3.13))),
    )
    index = 0
    for pz, lamps in wishes:
        for px, py in lamps:
            earlier_lantern(px, pz, py, 4.449, index, m, fixtures, index in (6, 10))
            index += 1
    xcord, ycord, zcord = site['visitorCord']
    free = mesh.material('Light worn hemp of the waiting suspension', '#b0a084', rough=.96)
    mesh.beam('One empty cord from the centre beam', (xcord, ycord - .247, zcord),
              (xcord, ycord + .048, zcord), .005, free, .004)
    loop = [(xcord + .019 * math.sin(angle), ycord - .269 + .025 * math.cos(angle), zcord)
            for angle in (0, .63, 1.26, 1.88, 2.51, 3.14, 3.77, 4.40, 5.03, 5.65)]
    mesh.curved_tube('Empty tied loop for the visitor lantern', loop, [.0036] * len(loop), free, 6, closed=True)
    for x in (-2.8, 2.8):
        area('Paper lattice softly admits the open-snow sky', (x, y + 1.68, front - .16),
             (x * .53, y + .54, front - 2.7), 20.0, '#dbdfdf', 1.48)
        area('Snow bounce from below the lattice onto the aged hall beam', (x, y + .62, front - .15),
             (x * .63, y + 2.61, front - 1.43), 13.8, '#e8dac4', 1.14)
    area('Warm veranda lamp reflects from the pale hall ceiling', (1.6, y + 1.44, front - 2.21),
         (0, y + 3.05, front - 3.4), 7.8, '#ffdcac', 1.36)
    area('Warm reflected light beneath the lantern beam', (-1.21, y + 1.82, -6.72),
         (-2.76, y + 1.24, -5.22), 4.1, '#f0c99c', 1.3)
    area('Pale courtyard snow reflects through the half-open doorway', (.29, y + .22, front + .39),
         (.06, y + 2.4, front - 2.26), 14.2, '#ccd8e1', .88)
    for x, watts in ((-1.81, 20.4), (1.74, 17.5)):
        area('Broad paper and floor bounce meets the inner face of the beam', (x, y + 1.62, front - 3.49),
             (x * .78, y + 2.29, front - .18), watts, '#dfc09a', 1.26)
    # The kit and practical lamp share the guest-scale height rather than altar height.
    table = mesh.box('Table where visitors find frames and separate oil cups', (1.53, .10, .69),
                     (-2.35, y + .679, -5.42), m['wood'], .018)
    for px in (-2.97, -1.75):
        for pz in (-5.65, -5.19):
            mesh.box('Table leg with visible square joinery', (.098, .65, .091), (px, y + .322, pz), m['wood'], .009)
    waiting_lanterns(table, y + .729, m, contact)
    veranda = mesh.box('Veranda storm lantern stone shelf', (.45, .13, .57),
                      (3.05, y + .7, front + .36), m['granite'], .020)
    mesh.box('Old masonry stand below the storm lamp', (.35, .69, .34), (3.05, y + .318, front + .36), m['brick'], .018)
    oil_lamp('Veranda everyday storm lantern', (3.05, y + .765, front + .36), m, contact, veranda, 'court', fixtures, .7, True)
    mesh.REGION = 'altar'
    plinth = mesh.box('Low stone altar supports the seated figure', (2.09, .52, .93),
                     (0, y + .260, back + .87), m['granite'], .027)
    statue(0, y + .52, back + .91, m, contact, plinth)
    oil_lamp('Altar ordinary oil lamp', (.70, y + .52, back + 1.12), m, contact, plinth, 'hall', fixtures, .68)
    area('Warm reflected light on the seated figure and worn plinth', (1.20, y + .99, back + 2.11),
         (0, y + 1.19, back + .91), 5.4, '#e2c69b', .73)


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
    daylight.use_fake_user = True
    plates.set_world(scene, look_transport(projection['light']['night']), pre_exposure, 'Clear moonlit winter pass')
    scene['one_light_ambient_worlds'] = json.dumps({'day': daylight.name})
    m = palette()
    gauze_maps(m[key] for key in ('glow', 'red_faded', 'red_dust', 'red_old', 'new_gauze'))
    for key in ('glow', 'red_faded', 'red_dust', 'red_old'):
        mesh.vertex_tint_shader(m[key])
        # The loom wear is authored per lantern instead of by the generic pass.
        del m[key]['one_light_surface_tint']
    foliage = build_approach(site, m)
    _, court_surface = courtyard(site, m)
    gate_foothill(site, m['granite'], m['snow'])
    fixtures = []
    gate(site, m, contact, fixtures)
    outbuildings(site, m, site['court'], court_surface, contact)
    court_floor = site['court']['level']
    area('Blue snow bounce lights the winter-closed boards', (-3.82, court_floor + .42, -.54),
         (-5.30, court_floor + 1.28, -1.31), 13.6, '#cad4df', 1.32)
    area('Even snow bounce beneath the west room front eave', (-7.09, court_floor + .32, 3.11),
         (-7.30, court_floor + 1.14, 1.46), 9.1, '#d4dce2', 1.57)
    everyday.broom(mesh, site, court_surface, contact, m)
    hall(site, m, contact, fixtures)
    author_court_cap_charts(mesh.STATIC.objects)
    basis = [site['visitorCord'][0], 3.54, site['visitorCord'][2]]
    source = mesh.light('Measured visitor wick transport basis', basis, .80, '#ffad68', .027, role='lamp')
    scene['place_id'] = scene['one_light_place'] = 'snow-roof'
    scene['snow_court_revision'] = site['revision']
    scene['lightmap_resolutions'] = json.dumps({'gate': 2048, 'court': 1024, 'hall': 1024, 'altar': 512})
    scene['one_light_camera_far'] = 880
    scene['one_light_camera_pre_exposure'] = pre_exposure
    scene['one_light_lamp_pass_quantity'] = 'indirect-diffuse-radiance-per-unit-albedo'
    scene['one_light_lamp_anchor'] = json.dumps(basis)
    scene['one_light_lamp_basis'] = json.dumps({'position': basis, 'watts': source.data.energy,
        'linearColor': list(source.data.color), 'pointRadiusMetres': source.data.shadow_soft_size,
        'sourceObject': source.name})
    scene['one_light_anchor_fields'] = json.dumps(['snow_court_revision', 'snow_court_fixtures_engine', 'snow_court_smoke_engine',
                                                   'one_light_lamp_basis', 'snow_court_needles_sha256'])
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
    return contact.audit(fail=True), foliage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    site, projection = (json.loads(path.read_text()) for path in (SITE, PROJECTION))
    contact, foliage = build(site, projection)
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    sources = (Path(__file__), Path(everyday.__file__), Path(__file__).with_name('snow_court_approach.py'),
               Path(__file__).with_name('snow_court_backdrop.py'), SITE, PROJECTION)
    scene['source_authoring_sha256'] = json.dumps({
        str(path.resolve().relative_to(ROOT)): sha256(path.read_bytes()).hexdigest() for path in sources
    })
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = foliage
    foliage.select_set(True)
    needles = output.with_name('snow-court-needles.glb')
    bpy.ops.export_scene.gltf(filepath=str(needles), export_format='GLB', use_selection=True,
                              export_extras=True, export_yup=True, export_cameras=False, export_lights=False)
    scene['snow_court_needles_sha256'] = sha256(needles.read_bytes()).hexdigest()
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    fixtures = json.loads(scene['snow_court_fixtures_engine'])
    fields = json.loads(scene['one_light_anchor_fields'])
    receipt = {
        'source': {'path': str(output.relative_to(ROOT)), 'sha256': sha256(output.read_bytes()).hexdigest()},
        'contactAudit': contact,
        'anchorMetadataFields': fields,
        'anchorMetadata': {name: scene[name] for name in fields},
        'wicks': fixtures,
    }
    output.with_suffix('.audit.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('SNOW_COURT_SOURCE', output, 'objects', len(mesh.STATIC.objects),
          'resting groups', len(contact['groups']), 'fixtures', len(fixtures))


if __name__ == '__main__':
    main()
