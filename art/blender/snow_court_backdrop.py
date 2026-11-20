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


def snow_retention(elevation, row, col, height, vertical):
    # Measure both across and down the fall line. Concave chutes retain snow
    # that the winter wind strips from neighboring convex ridges.
    span = 7
    north = max(0, row - span)
    south = row + span
    west_height = elevation[row * TILE_SIDE + col - span]
    east_height = elevation[row * TILE_SIDE + col + span]
    north_height = elevation[north * TILE_SIDE + col]
    south_height = elevation[south * TILE_SIDE + col]
    cross_grade = (east_height - west_height) * vertical / (2 * span * SUMMIT_COLUMN_METRES)
    depth_grade = (north_height - south_height) * vertical / ((south - north) * SUMMIT_ROW_METRES)
    up = 1. / math.hypot(cross_grade, depth_grade, 1.)
    across = .5 * (west_height + east_height)
    along = lerp(north_height, south_height, (row - north) / (south - north))
    hollow = (.60 * across + .40 * along - height) * vertical
    ledge = smooth(.23, .84, up)
    basin = smooth(-.55, 1.85, hollow)
    lee = smooth(.75, -.58, cross_grade)
    return .53 * ledge + .35 * basin + .12 * lee


def mountain(elevation, peak):
    # Keep the approved SRTM peak and framing. Sample the headwall densely
    # enough to keep small spurs, then carry its near apron down to the valley
    # below the visible crop instead of ending the mesh across a high slope.
    columns = sampled_range(1880, 3592, 2, (PEAK_COLUMN,))
    rows = sampled_range(0, 590, 2, (PEAK_ROW, 591))
    rows = sorted({*rows, *sampled_range(592, 815, 4, ())}, reverse=True)
    vertical = peak[1] / (PEAK_ELEVATION - 1080)
    points, retention = [], []
    edges = [smooth(columns[0], columns[0] + 100, col)
             * smooth(columns[-1], columns[-1] - 100, col) for col in columns]
    for row in rows:
        depth = -peak[2] + (PEAK_ROW - row) * SUMMIT_ROW_METRES
        apron = 1. - smooth(591, 815, row)
        for col, edge in zip(columns, edges):
            x = peak[0] + (col - PEAK_COLUMN) * SUMMIT_COLUMN_METRES
            height = elevation[row * TILE_SIDE + col]
            points.append((x, depth, lerp(-28., (height - 1080) * vertical, edge * apron)))
            retention.append(snow_retention(elevation, row, col, height, vertical))
    return surface_grid(points, len(columns)), retention


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


def surface_grid(points, width):
    faces = []
    for row in range(len(points) // width - 1):
        start = row * width
        for col in range(width - 1):
            a = start + col
            faces.extend(((a, a + 1, a + width + 1), (a, a + width + 1, a + width)))
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
    shader = plates.Shader('Fractured summit rock with snow in sheltered chutes')
    point = shader.coordinate()
    position = shader.xyz(point)
    x, depth, height = (position[axis] for axis in ('X', 'Y', 'Z'))
    shape = shader.noise(point, (.057, .081, .062), detail=2.2)
    grain = shader.noise(point, (.84, .91, .93), detail=2.6)
    fine = shader.noise(point, (2.42, 2.56, 2.86), detail=1.4)

    # Warp the strata through the larger weathering pattern so individual
    # fracture seams follow different inclinations and do not form stripes.
    axes = shader.nodes.new('ShaderNodeCombineXYZ')
    shader.input(axes.inputs['X'], x)
    shader.input(axes.inputs['Y'], depth)
    dip = shader.math('ADD', shader.product(x, .26), shader.product(depth, -.17))
    shader.input(axes.inputs['Z'], shader.math('ADD', height, shader.math('ADD', dip, shader.product(shape, 9.))))
    strata = shader.noise(axes.outputs['Vector'], (.085, .175, .48), detail=2.2, roughness=.68)
    fissures = shader.between(strata, .39, .54)
    slab = shader.blend((.065, .070, .075, 1.), (.235, .219, .205, 1.), fissures)
    talus = shader.blend((.093, .096, .10, 1.), (.172, .164, .148, 1.), grain)
    rock = shader.blend(slab, talus, shader.between(shape, .39, .64, .17, .64))

    map_node = shader.nodes.new('ShaderNodeAttribute')
    map_node.attribute_name = 'snow_retention'
    accumulation = map_node.outputs['Fac']
    normal = shader.xyz(shader.nodes.new('ShaderNodeNewGeometry').outputs['Normal'])['Z']
    texture = shader.math('ADD', shader.between(shape, .23, .77, -.115, .115),
                          shader.between(grain, .25, .77, -.067, .071))
    fragments = shader.math('ADD', accumulation, texture)
    # Sparse snow feathers onto lower ledges and stays in deeper high chutes.
    # Nearly vertical faces keep an exposed rock core even above the snowline.
    altitude = shader.math('ADD', height, shader.between(shape, .26, .72, -13., 15.))
    snowline = shader.between(altitude, 17., 84.)
    snow = shader.product(shader.between(fragments, .36, .59), snowline,
                          shader.between(normal, .15, .43, .06, 1.))
    powder = shader.blend((.60, .65, .72, 1.), (.86, .88, .89, 1.), grain)

    # Use rough diffuse faces rather than lobe highlights on each terrain fold.
    rock_relief = shader.math('ADD', shader.product(strata, .61), shader.product(grain, .39))
    relief = shader.blend(rock_relief, shader.product(fine, .28), snow)
    return shader.surface(shader.blend(rock, powder, snow), .94, specular=.22,
                          bump=(relief, .31, .24), air=air)


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


def describe(far, retention, mid, stands, projection, target):
    summit = max(far.points, key=lambda p: p[2])
    expected = (target[0], -target[2], target[1])
    if math.dist(summit, expected) > 1e-8:
        raise ValueError(f'The highest retained source sample missed its sightline: {summit}.')
    px, py, pz = projection['position']
    azimuth = math.degrees(math.atan2(summit[0] - px, summit[1] + pz))
    altitude = math.degrees(math.atan2(summit[2] - py, math.hypot(summit[0] - px, summit[1] + pz)))
    center = math.degrees(math.atan2(projection['direction'][1], -projection['direction'][2]))
    mid_height = max(p[2] for p in mid.points)
    if mid_height >= target[1] * .25 or abs(altitude - center) + 2. > projection['verticalFov'] * .5:
        raise ValueError('The middle ridge or frame no longer clears the hero peak.')
    apron_depth = far.points[0][1]
    apron = [point[2] for point in far.points if point[1] == apron_depth]
    snow_range = [min(retention), max(retention)]
    if max(apron) >= 0. or len(retention) != len(far.points) or not (0. <= snow_range[0] < snow_range[1] <= 1.):
        raise ValueError('The near summit apron or its snow-retention coverage is invalid.')
    return {'inputSummit': {'sourceRow': PEAK_ROW, 'sourceColumn': PEAK_COLUMN,
                            'sourceElevationMetres': PEAK_ELEVATION},
            'summitEngine': [summit[0], summit[2], -summit[1]],
            'summitBearingDegrees': [azimuth, altitude], 'midMaximumY': mid_height,
            'farApron': {'nearDepthMetres': apron_depth, 'maximumEdgeHeightMetres': max(apron)},
            'snowRetentionRange': snow_range,
            'triangles': {'far': len(far.faces), 'mid': len(mid.faces)},
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
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if options.width < 32 or options.samples < 1 or (not options.inspect and not options.out):
        parser.error('Choose a render destination, positive samples, and a width of at least 32.')
    options.cloud_samples = options.samples
    options.no_denoise = False
    return options


def main():
    options = arguments()
    projection = json.loads(PROJECTION.read_text())
    site = json.loads(SITE.read_text())
    peak = site['peak']
    elevation = read_tile(options.dem)
    far, retention = mountain(elevation, peak['bearingTarget'])
    mid = pass_flank(elevation, peak['nearRidgeDepth'])
    stands = pines(mid)
    proof = describe(far, retention, mid, stands, projection, peak['bearingTarget'])
    width = options.width
    if (width * projection['height']) % projection['width']:
        raise ValueError('The requested resolution must preserve the projection aspect ratio.')
    height = width * projection['height'] // projection['width']
    light_source = projection['light'][options.lighting]
    light = look_transport(light_source)
    recipe = {'width': width, 'height': height, 'projection': projection,
              'projectionSha256': plates.digest(PROJECTION), 'siteSha256': plates.digest(SITE),
              'terrainSource': TILE_URL, 'terrainSha256': TILE_SHA,
              'sources': {'author': plates.digest(Path(__file__).resolve()),
                          'renderHelpers': plates.digest(Path(plates.__file__).resolve())},
              'geometry': proof, 'lighting': options.lighting, 'lightTransport': light,
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
    plates.set_world(scene, light, projection['preExposure'],
                     f"Snow Court {'lunar' if options.lighting == 'night' else 'solar'} winter sky")
    plates.projection_camera(scene, projection)
    scene.camera.name = 'Snow Court reference projection'
    scene.camera.data.name = scene.camera.name
    layers = {name: bpy.data.collections.new(f'Snow Court {name} plate') for name in LAYER_NAMES}
    for collection in layers.values():
        scene.collection.children.link(collection)
    air = plates.air_perspective(light_source['airRadiance'])
    summit = plates.mesh(layers['far'], 'SRTM summit and connected winter cirques', far,
                         [summit_material(air)], smooth=True)
    summit.data.attributes.new('snow_retention', 'FLOAT', 'POINT').data.foreach_set('value', retention)
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
