"""Render the fictional winter pass as three linear, straight-alpha Cycles plates.

Run `python3 art/blender/snow_court_backdrop.py --inspect` for geometry evidence.
Use the shared GPU lease before invoking the Blender rendering entry point.
"""

from argparse import ArgumentParser
from array import array
from hashlib import sha256
import gzip
import json
import math
import os
from pathlib import Path
import random
from shutil import copyfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pine_valley_backdrop as plates
from pine_valley_crowns import PROFILES
from pine_valley_terrain import Batch, ROOT, lerp, smooth

PROJECTION = ROOT / 'shared/snow-court-backdrop.json'
SITE = ROOT / 'shared/snow-roof-court-site.json'
TILE_SHA = 'c878cd7ebf7b60e148e5441e22f314c034d3c410dff3b97194d0b9ce1fb4b477'
TILE_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/skadi/N33/N33E107.hgt.gz'
TILE_SIDE = 3601
PEAK_ROW, PEAK_COLUMN, PEAK_ELEVATION = 161, 2749, 3753
LAYER_NAMES = ('far', 'mid', 'cloud')
SUMMIT_COLUMN_METRES = .86
SUMMIT_ROW_METRES = .31
SUMMIT_CREASE_DEGREES = 43.
REAR_CREASE_DEGREES = 54.
REAR_ROWS = (813, 1154)
REAR_COLUMNS = (2088, 2800)
REAR_EAST_OFFSET = 121.
REAR_RELIEF_SCALE = .203


def read_tile(path):
    source = path.read_bytes()
    if sha256(source).hexdigest() != TILE_SHA:
        raise ValueError('The Snow Roof N33E107 SRTM tile does not match the pinned compressed source.')
    elevation = array('h', gzip.decompress(source))
    if sys.byteorder == 'little':
        elevation.byteswap()
    if len(elevation) != TILE_SIDE ** 2 or elevation[PEAK_ROW * TILE_SIDE + PEAK_COLUMN] != PEAK_ELEVATION:
        raise ValueError('Unexpected dimensions or peak sample in the SRTM tile.')
    return elevation


def sampled_range(start, stop, stride, required):
    return sorted({*range(start, stop, stride), stop, *required})


def summit_columns():
    return sampled_range(1880, 3592, 3, range(2370, 3131))


def summit_northing(row):
    offset = PEAK_ROW - row
    # Restore the longitudinal scale around the headwall. Use a smooth,
    # positive spacing through the apron.
    return offset * SUMMIT_ROW_METRES + 65. * math.tanh(offset / 100.)


def survey_location(peak, row, col):
    east = (col - PEAK_COLUMN) * SUMMIT_COLUMN_METRES
    north = summit_northing(row)
    # View the watershed obliquely and keep its distant ends in the aperture.
    return peak[0] + east + .18 * north, -peak[2] + north - 34. * math.tanh(east / 170.)


def measured_section(elevation, row, col, height, span):
    north = max(0, row - span)
    south = row + span
    west = max(0, col - span)
    east = min(TILE_SIDE - 1, col + span)
    west_height = elevation[row * TILE_SIDE + west]
    east_height = elevation[row * TILE_SIDE + east]
    north_height = elevation[north * TILE_SIDE + col]
    south_height = elevation[south * TILE_SIDE + col]
    across = lerp(west_height, east_height, (col - west) / (east - west))
    along = lerp(north_height, south_height, (row - north) / (south - north))
    cross_grade = (east_height - west_height) / ((east - west) * SUMMIT_COLUMN_METRES)
    depth_grade = (north_height - south_height) / (summit_northing(north) - summit_northing(south))
    return cross_grade, depth_grade, across - height, along - height


def summit_fields(elevation, row, col, height, vertical):
    # A narrow DEM cut is only sharpened when the same feature is present
    # at a wider sampling span. This limits amplification of one-post noise.
    cross, depth, transverse_cut, fall_cut = measured_section(elevation, row, col, height, 3)
    _, _, transverse_bank, fall_bank = measured_section(elevation, row, col, height, 8)
    _, _, transverse_bowl, fall_bowl = measured_section(elevation, row, col, height, 15)
    cut = max(min(transverse_cut, transverse_bank), min(fall_cut, fall_bank), 0.) * vertical
    spur = max(min(-transverse_cut, -transverse_bank), min(-fall_cut, -fall_bank), 0.) * vertical
    cirque = smooth(.25, 3.5, transverse_bowl * vertical) * smooth(-.85, 2.1, fall_bowl * vertical)
    cross_grade, depth_grade = cross * vertical, depth * vertical
    up = 1. / math.hypot(cross_grade, depth_grade, 1.)
    ledge = smooth(.49, .94, up)
    lee = smooth(.73, -.84, .87 * cross_grade + .36 * depth_grade)
    gully = smooth(.10, 1.18, cut)
    crest = smooth(.10, 1.30, spur)
    wall = smooth(.68, .26, up)
    # Winter cover connects across the slopes below the wind-scoured ridge.
    # Concave lee slopes hold deeper snow, including gullies through steep rock.
    retention = min(1., .56 * up + .18 * ledge + .21 * gully + .18 * cirque + .15 * lee)
    # Preserve the surveyed summit, taper out below the mountain's rock
    # belts, and constrain the adjustment to a few metres in scene space.
    exposure = smooth(1450., 2200., height) * (1. - smooth(3720., PEAK_ELEVATION, height))
    relief = (min(spur * 1.18, 2.45) - min(cut * 1.03, 2.3)) * exposure
    return relief, (retention, gully, cirque, wall, crest)


def mountain(elevation, peak, projection_origin):
    # Keep the approved SRTM peak and framing. Sample the headwall densely
    # enough to keep small spurs, then carry its near apron down to the valley
    # below the visible crop instead of ending the mesh across a high slope.
    columns = summit_columns()
    rows = sampled_range(0, 590, 2, (*range(98, 361), 591))
    rows = sorted({*rows, *sampled_range(592, 815, 4, ())}, reverse=True)
    vertical = peak[1] / (PEAK_ELEVATION - 1080)
    points = []
    fields = {'snow_retention': [], 'measured_gully': [], 'measured_cirque': [],
              'measured_wall': [], 'measured_spur': []}
    edges = [smooth(columns[0], columns[0] + 100, col)
             * smooth(columns[-1], columns[-1] - 100, col) for col in columns]
    _, eye_y, eye_z = projection_origin
    for row in rows:
        apron = 1. - smooth(591, 815, row)
        old_depth = -peak[2] + (PEAK_ROW - row) * SUMMIT_ROW_METRES
        for col, edge in zip(columns, edges):
            x, depth = survey_location(peak, row, col)
            height = elevation[row * TILE_SIDE + col]
            relief, surface = summit_fields(elevation, row, col, height, vertical)
            scaled_height = lerp(-28., (height - 1080) * vertical + relief, edge * apron)
            # Restore most of the approved vertical angle after spreading
            # out the very shallow depth of the old DEM view.
            height_scale = lerp(1., (depth + eye_z) / (old_depth + eye_z), .76)
            height = eye_y + (scaled_height - eye_y) * height_scale
            # Separate the headwalls on either side of the surveyed crown.
            # Work on the upper relief only, leaving the crown and apron fixed.
            east = x - peak[0]
            shoulder = smooth(9., 135., -east) * 58. + smooth(10., 100., east) * 56.
            height -= shoulder * smooth(32., 175., height)
            points.append((x, depth, height))
            for values, value in zip(fields.values(), surface, strict=True):
                values.append(value)
    return surface_grid(points, len(columns), follow_relief=True), fields


def rear_ridge(elevation):
    # This separate surveyed watershed rises through the right-hand saddle.
    # Its visible crest is set by the samples, including several abrupt spurs.
    first_row, last_row = REAR_ROWS
    first_col, last_col = REAR_COLUMNS
    columns = sampled_range(first_col, last_col, 4, ())
    rows = sampled_range(first_row, last_row, 4, ())[::-1]
    points = []
    for row in rows:
        for col in columns:
            east = (col - 2305) * 1.13
            north = (985 - row) * 1.03
            depth = 727. + north - .10 * east
            side = smooth(first_col, first_col + 67, col) * smooth(last_col, last_col - 67, col)
            apron = smooth(last_row, last_row - 64, row) * smooth(first_row, first_row + 54, row)
            height = elevation[row * TILE_SIDE + col]
            points.append((REAR_EAST_OFFSET + east + .10 * north, depth,
                           lerp(-36., (height - 1470) * REAR_RELIEF_SCALE, side * apron)))
    return surface_grid(points, len(columns), follow_relief=True)


def pass_flank(elevation, near_depth):
    columns = sampled_range(2010, 3530, 6, ())
    rows = sampled_range(455, 1030, 6, ())[::-1]
    points = []
    for row in rows:
        depth = near_depth + (790 - row) * .195
        turn = 5.5 * math.sin((row - 560) * .0093)
        for col in columns:
            x = (col - PEAK_COLUMN) * .31 + turn
            elevation_height = (elevation[row * TILE_SIDE + col] - 1730) * .033
            shoulder = smooth(9., 78., abs(x - turn))
            # Lower both ends of this inner crop beneath the pass and the
            # distant base. The central swale follows a separate drainage cut.
            grade = smooth(rows[0], rows[0] - 115, row) * smooth(rows[-1], rows[-1] + 110, row)
            height = lerp(-36., -22. + elevation_height + 8.9 * shoulder, grade)
            points.append((x, depth, height))
    return surface_grid(points, len(columns))


def surface_grid(points, width, follow_relief=False):
    faces = []
    for row in range(len(points) // width - 1):
        start = row * width
        for col in range(width - 1):
            a = start + col
            b, c, d = a + 1, a + width + 1, a + width
            # Avoid a uniform diagonal across the stronger elevation break.
            if follow_relief and abs(points[a][2] - points[c][2]) > abs(points[b][2] - points[d][2]):
                faces.extend(((a, b, d), (b, c, d)))
            else:
                faces.extend(((a, b, c), (a, c, d)))
    return Batch(points, faces)


def pines(flank):
    batches = [([], [], []) for _ in PROFILES]
    rng = random.Random(56129)
    normals = [0.] * len(flank.points)
    for a, b, c in flank.faces:
        pa, pb, pc = flank.points[a], flank.points[b], flank.points[c]
        u = tuple(x - y for x, y in zip(pb, pa))
        v = tuple(x - y for x, y in zip(pc, pa))
        normal = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        for index in (a, b, c):
            normals[index] = max(normals[index], normal[2] / max(.0001, math.hypot(*normal)))
    for (x, depth, y), up in zip(flank.points, normals):
        # Keep the steep rock bands and the drainage floor bare. Every tree
        # starts at its exact triangulated SRTM receiver vertex.
        if abs(x) > 180. or depth < 31. or y < -30. or up < .59:
            continue
        grove = .56 + .29 * math.sin(x * .086 + math.sin(depth * .10) * 1.5) * math.sin(depth * .159)
        if rng.random() > grove:
            continue
        kind = rng.randrange(len(PROFILES))
        roots, scales, rotation = batches[kind]
        height = rng.uniform(2.0, 5.3) * (.8 + .2 * up)
        width = height * rng.uniform(.61, .99)
        roots.append((x, depth, y - .055))
        scales.append((width, width * rng.uniform(.76, 1.08), height))
        rotation.append((rng.uniform(-.08, .08), rng.uniform(-.09, .09), rng.uniform(0., math.tau)))
    return batches


def hillside_material(air):
    shader = plates.Shader('Broken winter snow on the lower valley slopes')
    point = shader.coordinate()
    normal = shader.xyz(shader.nodes.new('ShaderNodeNewGeometry').outputs['Normal'])['Z']
    band = shader.noise(point, (.17, .11, .31), detail=3.8, roughness=.65)
    stone_grain = shader.noise(point, (2.1, 2.3, 3.8), detail=3.4)
    ledges = shader.between(shader.math('ADD', normal, shader.product(band, .2)), .30, .87)
    snowline = shader.between(band, .21, .61)
    snow_on_slope = shader.product(ledges, snowline)
    light_rock = (.14, .151, .152, 1.)
    rock = shader.blend((.058, .071, .084, 1.), light_rock, band)
    powder = shader.blend((.65, .71, .80, 1.), (.91, .93, .96, 1.), stone_grain)
    return shader.surface(shader.blend(rock, powder, snow_on_slope), .93,
                          bump=(stone_grain, .27, .055), air=air)


def summit_material(air):
    shader = plates.Shader('Snowfields interrupted by exposed summit ribs and cliffs')
    point = shader.coordinate()
    height = shader.xyz(point)['Z']
    snow_grain = shader.noise(point, (.88, .88, .88), detail=2.6)
    # Leave cliffs, crests and fractures to the surveyed geometry. The
    # isotropic detail is only weathering within each outcrop and talus grain.
    weathering = shader.noise(point, (.31, .31, .31), detail=2.2, roughness=.61)
    grains = shader.noise(point, (1.12, 1.12, 1.12), detail=2.2)

    def terrain_attribute(name):
        node = shader.nodes.new('ShaderNodeAttribute')
        node.attribute_name = name
        return node.outputs['Fac']

    wall = terrain_attribute('measured_wall')
    cirque = terrain_attribute('measured_cirque')
    gully = terrain_attribute('measured_gully')
    crest = terrain_attribute('measured_spur')
    rock_block = shader.blend((.158, .151, .140, 1.), (.205, .192, .169, 1.),
                              shader.between(weathering, .25, .76))
    talus = shader.blend((.092, .102, .112, 1.), (.128, .130, .124, 1.),
                         shader.between(grains, .26, .77))
    ledges = shader.math('MAXIMUM', wall, shader.product(crest, .53))
    rock = shader.blend(talus, rock_block, shader.between(ledges, .08, .85, .09, .90))
    hollow = shader.math('MAXIMUM', gully, shader.product(cirque, .48))
    rock = shader.blend(rock, (.048, .059, .072, 1.), shader.between(hollow, .34, .95, 0., .46))

    accumulation = terrain_attribute('snow_retention')
    normal = shader.xyz(shader.nodes.new('ShaderNodeNewGeometry').outputs['Normal'])['Z']
    drifts = shader.noise(point, (.095, .076, .062), detail=2.5, roughness=.67)
    snowline = shader.between(shader.math('ADD', height, shader.between(drifts, .22, .79, -16., 14.)), 43., 108.)
    pockets = shader.math('ADD', accumulation, shader.between(drifts, .25, .77, -.10, .11))
    wind_scour = shader.product(shader.between(crest, .37, .90), .19)
    settled = shader.product(shader.between(shader.math('SUBTRACT', pockets, wind_scour), .29, .59),
                             shader.between(normal, .27, .65))
    chute = shader.product(shader.between(hollow, .24, .85), shader.between(normal, .19, .51))
    snow = shader.product(shader.math('MAXIMUM', settled, chute), snowline)
    powder = shader.blend((.72, .78, .84, 1.), (.95, .96, .98, 1.),
                          shader.between(snow_grain, .23, .79, .31, .79))

    relief = shader.blend(grains, shader.product(snow_grain, .28), snow)
    return shader.surface(shader.blend(rock, powder, snow), .93, specular=.18,
                          bump=(relief, .19, .055), air=air)


def rear_material(air):
    shader = plates.Shader('Cold distant ridge, limestone and connected snowfields')
    normal = shader.xyz(shader.nodes.new('ShaderNodeNewGeometry').outputs['Normal'])['Z']
    height = shader.xyz(shader.coordinate())['Z']
    grains = shader.noise(shader.coordinate(), (.118, .16, .12), detail=2.2)
    snow = shader.product(shader.between(normal, .30, .75),
                          shader.between(shader.math('ADD', height, shader.product(grains, 16.)), 77., 153.))
    rock = shader.blend((.096, .098, .105, 1.), (.171, .177, .168, 1.), grains)
    return shader.surface(shader.blend(rock, (.83, .89, .96, 1.), snow), .94, specular=.12, air=air)


def forest_materials(air):
    foliage = plates.Shader('Frost in dark winter pine crowns')
    point = foliage.coordinate()
    branch_grain = foliage.noise(point, (.85, .91, 2.3), detail=3.)
    normal_z = foliage.xyz(foliage.nodes.new('ShaderNodeNewGeometry').outputs['Normal'])['Z']
    rime = foliage.product(foliage.between(normal_z, .49, .91),
                           foliage.between(branch_grain, .47, .73, 0., .73))
    needles = foliage.blend((.023, .048, .036, 1.), (.056, .087, .056, 1.), branch_grain)
    snowy_crown = foliage.surface(foliage.blend(needles, (.55, .66, .70, 1.), rime), .91, air=air)
    bark = plates.Shader('Distant pine bark under snow')
    return {'pine': snowy_crown, 'pineMid': snowy_crown,
            'bark': bark.surface((.065, .054, .040, 1.), .93, air=air)}


def high_haze(collection):
    shader = plates.Shader('Sparse ice haze drawn rightward over the winter valley')
    point = shader.coordinate()
    axes = shader.xyz(point)
    x, depth, height = axes['X'], axes['Y'], axes['Z']
    knots = shader.noise(point, (.028, .075, .23), detail=2.4)
    wisps = shader.noise(point, (.064, .085, .34), detail=2.)
    width = shader.between(knots, .32, .72, 3., 11.5)
    center = shader.math('ADD', shader.math('ADD', 32., shader.product(x, .044)),
                         shader.between(wisps, .22, .77, -4., 6.))
    vertical = shader.between(shader.math('DIVIDE', shader.math('ABSOLUTE',
                              shader.math('SUBTRACT', height, center)), width), 1., .25)
    reach = shader.product(shader.between(depth, 130., 180.), shader.between(depth, 235., 186.),
                           shader.between(x, -200., -67.), shader.between(x, 214., 72.))
    density = shader.product(vertical, reach, shader.between(knots, .27, .79, .09, 1.), .0095)
    volume = shader.volume((.97, .978, 1., 1.), density, .22)
    plates.box(collection, 'Thin wind-sheared ice haze below the summit', -202., 216.,
               128., 237., 12., 57., volume)


def look_transport(source):
    x, y, z = source['directionEngine']
    # Invert the same Cycles sky direction convention as Pine Gate.
    return {'solarElevationDegrees': math.degrees(math.atan2(y, math.hypot(x, z))),
            'solarAzimuthDegrees': math.degrees(math.atan2(x, -z)) % 360.,
            'solarDiameterDegrees': source['discDegrees'], 'solarIntensity': source['discIntensity'],
            'atmosphereStrength': source['skyStrength'], 'altitudeMetres': 1700.,
            'airDensity': .89, 'aerosolDensity': .55, 'ozoneDensity': 1.}


def describe(far, rear, fields, mid, stands, projection, target):
    expected = (target[0], -target[2], target[1])
    summit = min(far.points, key=lambda p: math.dist(p, expected))
    if math.dist(summit, expected) > 1e-8:
        raise ValueError(f'The highest retained source sample missed its sightline: {summit}.')
    px, py, pz = projection['position']
    azimuth = math.degrees(math.atan2(summit[0] - px, summit[1] + pz))
    altitude = math.degrees(math.atan2(summit[2] - py, math.hypot(summit[0] - px, summit[1] + pz)))
    center = math.degrees(math.atan2(projection['direction'][1], -projection['direction'][2]))
    mid_height = max(p[2] for p in mid.points)
    if mid_height >= target[1] * .25 or abs(altitude - center) + 2. > projection['verticalFov'] * .5:
        raise ValueError('The middle ridge or frame no longer clears the hero peak.')
    apron = far.points[:len(summit_columns())]
    apron_height = max(point[2] for point in apron)
    rear_crest = [point[1] for point in rear.points if point[2] >= 50.]
    near_crest = [point[1] for point in far.points if point[2] >= 50.]
    ranges = {name: [min(values), max(values)] for name, values in fields.items()}
    if apron_height >= 0. or any(len(values) != len(far.points) for values in fields.values()):
        raise ValueError('The near summit apron or its surface fields are incomplete.')
    if any(not (0. <= low < high <= 1.) for low, high in ranges.values()):
        raise ValueError('The summit surface field coverage is invalid.')
    if not rear_crest or min(rear_crest) <= max(near_crest):
        raise ValueError('The principal and rear crest intervals must remain separate above the basal slopes.')
    return {'inputSummit': {'sourceRow': PEAK_ROW, 'sourceColumn': PEAK_COLUMN,
                            'sourceElevationMetres': PEAK_ELEVATION},
            'summitEngine': [summit[0], summit[2], -summit[1]],
            'summitBearingDegrees': [azimuth, altitude], 'midMaximumY': mid_height,
            'farApron': {'nearDepthMetres': min(point[1] for point in apron), 'maximumEdgeHeightMetres': apron_height},
            'rearRidge': {'sourceRows': list(REAR_ROWS), 'sourceColumns': list(REAR_COLUMNS),
                          'eastOffsetMetres': REAR_EAST_OFFSET, 'reliefScale': REAR_RELIEF_SCALE,
                          'nearestCrestDepthMetres': min(rear_crest), 'primaryCrestFarDepthMetres': max(near_crest)},
            'snowRetentionRange': ranges['snow_retention'],
            'measuredGullyRange': ranges['measured_gully'],
            'measuredCirqueRange': ranges['measured_cirque'],
            'exposedWallRange': ranges['measured_wall'],
            'measuredSpurRange': ranges['measured_spur'],
            'summitCreaseDegrees': SUMMIT_CREASE_DEGREES,
            'triangles': {'far': len(far.faces), 'rear': len(rear.faces), 'mid': len(mid.faces)},
            'rootedPines': sum(len(batch[0]) for batch in stands),
            'treeGroundOffsetMetres': -.055}


def arguments():
    parser = ArgumentParser(description=__doc__)
    fallback = Path(os.environ.get('TMPDIR', '/tmp')) / 'snow-p1-dem/N33E107.hgt.gz'
    parser.add_argument('--dem', type=Path, default=fallback)
    parser.add_argument('--lighting', choices=('day', 'night'), default='day')
    parser.add_argument('--device', choices=('METAL', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI'), default='METAL')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--width', type=int, default=8192)
    parser.add_argument('--samples', type=int, default=8)
    parser.add_argument('--layers', choices=LAYER_NAMES, nargs='+', default=LAYER_NAMES)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--retain-mid-cloud-from', type=Path,
                        help='Copy verified mid and cloud EXRs for a far-only revision at the same render settings.')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if options.width < 32 or options.samples < 1 or (not options.inspect and not options.out):
        parser.error('Choose a render destination, positive samples, and a width of at least 32.')
    if options.retain_mid_cloud_from and options.layers != ['far']:
        parser.error('Select only --layers far when retaining mid and cloud from a previous render.')
    options.cloud_samples = options.samples
    options.no_denoise = False
    return options


def retain_mid_cloud(source, target, recipe, resume):
    # Keep the accepted mid distance and haze pixel-identical during an isolated
    # summit revision. Record the earlier receipt instead of claiming a rebake.
    receipt = source / 'render.json'
    previous = json.loads(receipt.read_text())
    previous.pop('plates')
    common = ('width', 'height', 'projectionSha256', 'siteSha256', 'terrainSha256', 'lighting',
              'lightTransport', 'samples', 'cloudSamples', 'denoise', 'alpha', 'colorSpace',
              'exposureAppliedStops', 'runtimePreExposureMultiplier', 'blenderVersion')
    if any(previous[key] != recipe[key] for key in common):
        raise ValueError('Retained Snow Court layers must share the projection, transport, and render settings.')
    if previous['sources']['renderHelpers'] != recipe['sources']['renderHelpers']:
        raise ValueError('Retained Snow Court layers must use the same render helpers.')
    verified = plates.prepare_plates(source, True, previous)
    retained = {name: verified[name] for name in ('mid', 'cloud')}
    recipe['retainedLayers'] = {'names': list(retained), 'renderSha256': plates.digest(receipt),
                                'sourceSha256': previous['sources']['author']}
    if resume:
        saved = plates.prepare_plates(target, True, recipe)
        if any(saved.get(name) != spec for name, spec in retained.items()):
            raise ValueError('Resume requires both retained Snow Court EXRs to match the approved source receipt.')
        return
    target.mkdir(parents=True, exist_ok=False)
    for spec in retained.values():
        output = target / spec['file']
        copyfile(source / spec['file'], output)
        if plates.digest(output) != spec['sha256']:
            raise ValueError(f"Copied EXR differs from its receipt: {spec['file']}.")
    (target / 'render.json').write_text(json.dumps({**recipe, 'plates': retained}, indent=2) + '\n')


def main():
    options = arguments()
    projection = json.loads(PROJECTION.read_text())
    site = json.loads(SITE.read_text())
    peak = site['peak']
    elevation = read_tile(options.dem)
    far, fields = mountain(elevation, peak['bearingTarget'], projection['position'])
    rear = rear_ridge(elevation)
    mid = pass_flank(elevation, peak['nearRidgeDepth'])
    stands = pines(mid)
    proof = describe(far, rear, fields, mid, stands, projection, peak['bearingTarget'])
    width = options.width
    if (width * projection['height']) % projection['width']:
        raise ValueError('The requested resolution must preserve the projection aspect ratio.')
    height = width * projection['height'] // projection['width']
    light_source = projection['light'][options.lighting]
    light = look_transport(light_source)
    airlight = light_source['airRadiance']
    # Preserve blue distance haze without a neutral veil over the exposed
    # ridges. The near flank still uses its own shorter optical path.
    summit_airlight = [channel * .55 for channel in airlight] if options.lighting == 'day' else airlight
    recipe = {'width': width, 'height': height, 'projection': projection,
              'projectionSha256': plates.digest(PROJECTION), 'siteSha256': plates.digest(SITE),
              'terrainSource': TILE_URL, 'terrainSha256': TILE_SHA,
              'sources': {'author': plates.digest(Path(__file__).resolve()),
                          'renderHelpers': plates.digest(Path(plates.__file__).resolve())},
              'geometry': proof, 'lighting': options.lighting, 'lightTransport': light,
              'summitAirRadiance': summit_airlight,
              'samples': options.samples, 'cloudSamples': options.samples, 'denoise': True,
              'alpha': 'straight', 'colorSpace': 'scene-linear Rec.709', 'exposureAppliedStops': 0,
              'runtimePreExposureMultiplier': projection['preExposure'], 'requestedDevice': options.device}
    if options.inspect:
        print(json.dumps(recipe, indent=2))
        return

    import bpy
    from mathutils import Vector
    # Bind the common renderer to Blender only after the CPU inspection path.
    plates.bpy = bpy
    plates.Vector = Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    recipe['devices'] = plates.configure(scene, options, width, height)
    recipe['blenderVersion'] = bpy.app.version_string
    if options.retain_mid_cloud_from:
        retain_mid_cloud(options.retain_mid_cloud_from, options.out, recipe, options.resume)
        options.resume = True
    plates.set_world(scene, light, projection['preExposure'],
                     f"Snow Court {'lunar' if options.lighting == 'night' else 'solar'} winter sky")
    plates.projection_camera(scene, projection)
    scene.camera.name = 'Snow Court reference projection'
    scene.camera.data.name = scene.camera.name
    layers = {name: bpy.data.collections.new(f'Snow Court {name} plate') for name in LAYER_NAMES}
    for collection in layers.values():
        scene.collection.children.link(collection)
    air = plates.air_perspective(airlight)
    summit_air = plates.air_perspective(summit_airlight) if summit_airlight != airlight else air
    summit = plates.mesh(layers['far'], 'SRTM summit and connected winter cirques', far,
                         [summit_material(summit_air)], smooth=True)
    summit.data.set_sharp_from_angle(angle=math.radians(SUMMIT_CREASE_DEGREES))
    for name, values in fields.items():
        summit.data.attributes.new(name, 'FLOAT', 'POINT').data.foreach_set('value', values)
    distant = plates.mesh(layers['far'], 'Separate surveyed watershed beyond Snow Court', rear,
                          [rear_material(air)], smooth=True)
    distant.data.set_sharp_from_angle(angle=math.radians(REAR_CREASE_DEGREES))
    inner = plates.mesh(layers['mid'], 'Grounded descending pass flank', mid,
                        [hillside_material(air)], smooth=True)
    prototypes = bpy.data.collections.new('Winter pine instance templates')
    scene.collection.children.link(prototypes)
    library = plates.crown_library(prototypes, forest_materials(air), far=True)
    woods = plates.forest(layers['mid'], library, stands)
    high_haze(layers['cloud'])
    options.out.mkdir(parents=True, exist_ok=True)
    plates.render(scene, layers, (inner, woods), options, recipe)


if __name__ == '__main__':
    main()
