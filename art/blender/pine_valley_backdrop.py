"""Author and render the Pine Gate SRTM valley as projection-matched Cycles plates.

Preview under Blender 5.3:
  blender -b -t 6 --python-exit-code 1 --python art/blender/pine_valley_backdrop.py -- \
    --out art/build/pine-gate/valley-preview --width 1600 --samples 8 --device METAL

Rendering is local. The only terrain input is the pinned derived USGS SRTM grid.
"""

from argparse import ArgumentParser
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import sys
from time import monotonic

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_valley_exr import straighten
from pine_valley_terrain import (
    Batch, ELEVATION_SHA256, FAR_START, Landscape, ROOT, drainage, forest_points, paddies,
)

PROJECTION = ROOT / 'shared/pine-gate-backdrop.json'
DAYLIGHT = ROOT / 'shared/pine-gate-daylight.json'
LAYERS = ('far', 'mid', 'cloud')


def mesh(collection, name, batch, materials=(), smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(batch.points, [], batch.faces)
    data.update()
    for material in materials:
        data.materials.append(material)
    if smooth:
        for face in data.polygons:
            face.use_smooth = True
    if batch.normals:
        data.normals_split_custom_set_from_vertices(batch.normals)
    if batch.masks:
        if len(batch.masks) != len(batch.points):
            raise ValueError(f'{name} has partial soil grading attributes.')
        mask = data.attributes.new('cultivated', 'FLOAT', 'POINT')
        mask.data.foreach_set('value', batch.masks)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


class Shader:
    def __init__(self, name):
        self.material = bpy.data.materials.new(name)
        self.material.use_nodes = True
        tree = self.material.node_tree
        tree.nodes.clear()
        self.nodes, self.links = tree.nodes, tree.links
        self.output = self.nodes.new('ShaderNodeOutputMaterial')

    def input(self, target, value):
        if isinstance(value, bpy.types.NodeSocket):
            self.links.new(value, target)
        else:
            target.default_value = value

    def math(self, operation, *values):
        node = self.nodes.new('ShaderNodeMath')
        node.operation = operation
        for target, value in zip(node.inputs, values):
            self.input(target, value)
        return node.outputs[0]

    def product(self, *values):
        result, *others = values
        for value in others:
            result = self.math('MULTIPLY', result, value)
        return result

    def between(self, value, a, b, low=0., high=1., smooth=True):
        node = self.nodes.new('ShaderNodeMapRange')
        node.clamp = True
        node.interpolation_type = 'SMOOTHSTEP' if smooth else 'LINEAR'
        for target, setting in zip(node.inputs, (value, a, b, low, high)):
            self.input(target, setting)
        return node.outputs[0]

    def noise(self, vector, stretch, scale=1., detail=3., roughness=.59):
        mapping = self.nodes.new('ShaderNodeVectorMath')
        mapping.operation = 'MULTIPLY'
        self.input(mapping.inputs[0], vector)
        mapping.inputs[1].default_value = stretch
        node = self.nodes.new('ShaderNodeTexNoise')
        self.links.new(mapping.outputs['Vector'], node.inputs['Vector'])
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = roughness
        return node.outputs['Fac']

    def blend(self, a, b, factor):
        node = self.nodes.new('ShaderNodeMixRGB')
        for target, value in zip(node.inputs, (factor, a, b)):
            self.input(target, value)
        return node.outputs[0]

    def xyz(self, socket):
        node = self.nodes.new('ShaderNodeSeparateXYZ')
        self.links.new(socket, node.inputs[0])
        return node.outputs

    def coordinate(self):
        return self.nodes.new('ShaderNodeTexCoord').outputs['Object']

    def surface(self, color, roughness, *, ior=1.45, transmission=0., bump=None):
        node = self.nodes.new('ShaderNodeBsdfPrincipled')
        for name, value in (('Base Color', color), ('Roughness', roughness),
                            ('IOR', ior), ('Transmission Weight', transmission)):
            self.input(node.inputs[name], value)
        if bump:
            noise, strength, distance = bump
            relief = self.nodes.new('ShaderNodeBump')
            self.input(relief.inputs['Height'], noise)
            relief.inputs['Strength'].default_value = strength
            relief.inputs['Distance'].default_value = distance
            self.links.new(relief.outputs['Normal'], node.inputs['Normal'])
        self.links.new(node.outputs[0], self.output.inputs['Surface'])
        return self.material

    def volume(self, color, density, anisotropy):
        node = self.nodes.new('ShaderNodeVolumeScatter')
        self.input(node.inputs['Color'], color)
        self.input(node.inputs['Density'], density)
        node.inputs['Anisotropy'].default_value = anisotropy
        self.links.new(node.outputs[0], self.output.inputs['Volume'])
        return self.material


def materials():
    ground = Shader('SRTM ground, exposed slate and damp paddy soil')
    position = ground.coordinate()
    band = ground.noise(position, (.27, .27, .19))
    grain = ground.noise(position, (3.6, 3.6, 4.2), detail=2.)
    geology = ground.nodes.new('ShaderNodeNewGeometry').outputs['Normal']
    moving = ground.math('ADD', ground.xyz(geology)['Z'], ground.product(band, .19))
    slate = ground.blend((.070, .062, .056, 1.), (.157, .139, .121, 1.), band)
    brush = ground.blend((.030, .062, .025, 1.), (.104, .141, .057, 1.), band)
    hillside = ground.blend(slate, brush, ground.between(moving, .55, .94))
    soil = ground.blend((.091, .074, .044, 1.), (.146, .155, .064, 1.), band)
    cultivated = ground.nodes.new('ShaderNodeAttribute')
    cultivated.attribute_name = 'cultivated'
    result = {
        'ground': ground.surface(ground.blend(hillside, soil, cultivated.outputs['Fac']), .82,
                                  bump=(grain, .34, .17)),
    }

    leaf = Shader('Pine needles with individual crown variation')
    instance = leaf.nodes.new('ShaderNodeObjectInfo').outputs['Random']
    grain = leaf.noise(leaf.coordinate(), (23., 23., 32.), detail=2.)
    tint = leaf.math('ADD', leaf.product(instance, .65), leaf.product(grain, .35))
    pigment = leaf.blend((.036, .064, .023, 1.), (.096, .162, .052, 1.), tint)
    result['pine'] = leaf.surface(pigment, .77, bump=(grain, .18, .06))
    result['bark'] = Shader('Weathered pine bark').surface((.075, .048, .028, 1.), .87)
    seedling = Shader('Translucent green rice shoots')
    result['rice'] = seedling.surface((.084, .19, .046, 1.), .54)

    water = Shader('Flooded paddies, reflected atmosphere and silt')
    water_pos = water.coordinate()
    ripples = water.noise(water_pos, (.85, 3.7, 3.3), detail=2.)
    shallow = water.blend((.126, .145, .080, 1.), (.241, .218, .122, 1.),
                          water.noise(water_pos, (.30, .45, .30)))
    result['water'] = water.surface(shallow, water.between(ripples, .22, .82, .044, .097),
                                    ior=1.333, transmission=.92, bump=(ripples, .20, .021))

    flow = Shader('Broken falling water and pale aeration')
    p = flow.coordinate()
    air = flow.noise(p, (11., 11., 2.4), detail=3.)
    thin = flow.noise(p, (15., 15., .83), detail=2.)
    foam = flow.between(flow.math('ADD', air, flow.product(thin, .3)), .54, .81)
    falling = flow.blend((.084, .140, .139, 1.), (.64, .73, .72, 1.), foam)
    result['fall'] = flow.surface(falling, .245, ior=1.333, transmission=.46,
                                   bump=(thin, .25, .018))
    creek = Shader('Shadowed run of water over dark stone')
    result['creek'] = creek.surface((.063, .096, .088, 1.), .30, ior=1.333, transmission=.63)
    return result


def ring_solid(batch, rings, sides, rng, material_index, face_materials):
    first = len(batch.points)
    for x, depth, height, rx, ry in rings:
        for i in range(sides):
            angle = math.tau * i / sides
            wobble = rng.uniform(.83, 1.14)
            batch.points.append((x + math.cos(angle) * rx * wobble,
                                 depth + math.sin(angle) * ry * wobble, height))
    start = first + (len(rings) - 1) * sides
    batch.faces.append(tuple(first + i for i in reversed(range(sides))))
    batch.faces.append(tuple(start + i for i in range(sides)))
    face_materials.extend([material_index, material_index])
    for j in range(len(rings) - 1):
        for i in range(sides):
            a = first + j * sides + i
            b = first + j * sides + (i + 1) % sides
            batch.faces.append((a, b, b + sides, a + sides))
            face_materials.append(material_index)


def crown_library(collection, surface, far):
    library = bpy.data.collections.new('Far crown variants' if far else 'Mid crown variants')
    collection.children.link(library)
    for index, profile in enumerate(((.35, .29, .73), (.39, .36, .59), (.32, .31, .81))):
        rng = random.Random(904 + index * 13 + far)
        half, lower, taper = profile
        batch, indices = Batch(), []
        lean_x, lean_y = rng.uniform(-.078, .078), rng.uniform(-.069, .069)
        ring_solid(batch, [(lean_x * t, lean_y * t, t, r, r)
                           for t, r in ((-.028, .037), (.19, .024), (.57, .016), (.93, .006))],
                   6 if far else 8, rng, 1, indices)
        for layer in range(5 if far else 7):
            z = lower + (1. - lower) * layer / (5 if far else 7)
            breadth = half * (1. - z) ** taper
            rotation = rng.uniform(0., math.tau)
            for arm in range(3 if far else 4):
                angle = rotation + arm * math.tau / (3 if far else 4)
                x, y = math.cos(angle) * breadth, math.sin(angle) * breadth
                lift = rng.uniform(-.026, .038)
                r = breadth * rng.uniform(.63, .93)
                rings = [(lean_x * z + x * u, lean_y * z + y * u, z + offset + lift,
                          r * radius, r * radius * rng.uniform(.79, 1.09))
                         for u, offset, radius in ((1.13, -.055, .07), (.93, -.012, 1.0),
                                                   (.83, .028, .81), (.48, .110, .075))]
                ring_solid(batch, rings, 5 if far else 7, rng, 0, indices)
        ring_solid(batch, [(lean_x * t, lean_y * t, t, r, r) for t, r in
                           ((.77, .069), (.86, .14), (.96, .065), (1.02, .008))],
                   6, rng, 0, indices)
        model = mesh(library, f'Tapered pine crown {index + 1}', batch,
                     (surface['pine'], surface['bark']), smooth=True)
        # Source meshes stay evaluable but stand behind the projection camera.
        model.location = (0., -2600. - 12. * index, 0.)
        for face, material in zip(model.data.polygons, indices):
            face.material_index = material
    return library


def forest(collection, library, batches):
    tree = bpy.data.node_groups.new(f'{collection.name} pine forest instances', 'GeometryNodeTree')
    tree.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    tree.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    group_in = tree.nodes.new('NodeGroupInput')
    group_out = tree.nodes.new('NodeGroupOutput')
    wood = tree.nodes.new('GeometryNodeCollectionInfo')
    wood.inputs['Collection'].default_value = library
    wood.inputs['Separate Children'].default_value = True
    wood.inputs['Reset Children'].default_value = True
    instance = tree.nodes.new('GeometryNodeInstanceOnPoints')
    instance.inputs['Pick Instance'].default_value = True
    tree.links.new(group_in.outputs['Geometry'], instance.inputs['Points'])
    tree.links.new(wood.outputs[0], instance.inputs['Instance'])
    tree.links.new(instance.outputs['Instances'], group_out.inputs['Geometry'])
    for data_type, name, socket in (('FLOAT_VECTOR', 'tree_scale', 'Scale'),
                                    ('FLOAT_VECTOR', 'tree_euler', 'Rotation'),
                                    ('INT', 'tree_variant', 'Instance Index')):
        attr = tree.nodes.new('GeometryNodeInputNamedAttribute')
        attr.data_type = data_type
        attr.inputs['Name'].default_value = name
        result = attr.outputs['Attribute']
        if socket == 'Rotation':
            euler = tree.nodes.new('FunctionNodeEulerToRotation')
            tree.links.new(result, euler.inputs[0])
            result = euler.outputs[0]
        tree.links.new(result, instance.inputs[socket])

    points, scales, rotations, indices = [], [], [], []
    for kind, (batch, scale, euler) in enumerate(batches):
        points.extend(batch)
        scales.extend(v for row in scale for v in row)
        rotations.extend(v for row in euler for v in row)
        indices.extend([kind] * len(batch))
    field = mesh(collection, f'{len(points):,} grounded pine placements', Batch(points))
    for name, data_type, item, values in (('tree_scale', 'FLOAT_VECTOR', 'vector', scales),
                                          ('tree_euler', 'FLOAT_VECTOR', 'vector', rotations),
                                          ('tree_variant', 'INT', 'value', indices)):
        attr = field.data.attributes.new(name, data_type, 'POINT')
        attr.data.foreach_set(item, values)
    modifier = field.modifiers.new('Instance fully three-dimensional crowns', 'NODES')
    modifier.node_group = tree
    return field


def box(collection, name, x0, x1, d0, d1, h0, h1, mat):
    points = [(x, d, h) for h in (h0, h1) for x, d in ((x0, d0), (x1, d0), (x1, d1), (x0, d1))]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return mesh(collection, name, Batch(points, faces), [mat])


def cloud_sea(collection):
    shader = Shader('Sunlit vapor, full volumetric extinction')
    point = shader.coordinate()
    axes = shader.xyz(point)
    x, depth, y = axes['X'], axes['Y'], axes['Z']
    broad = shader.noise(point, (.031, .105, .102), detail=4.)
    roll = shader.noise(point, (.083, .17, .23), detail=3.)
    breakup = shader.noise(point, (.20, .32, .43), detail=3.)
    curl = shader.math('ADD', broad, shader.product(roll, .31))
    shape = shader.between(shader.math('ADD', curl, shader.product(breakup, .15)), .56, .89)
    window = shader.between(shader.math('ABSOLUTE', shader.math('SUBTRACT', x, 5.)), 8., 39.)
    high = shader.math('ADD', shader.between(broad, .22, .81, -13., -4.7), shader.product(window, 3.2))
    distance_below_top = shader.math('SUBTRACT', high, y)
    crown = shader.between(distance_below_top, 0., 3.8)
    lower = shader.between(y, -28., -17.)
    front = shader.between(depth, 37., 56.)
    rear = shader.between(depth, 83., 69.)
    density = shader.product(shape, crown, lower, front, rear, .49)
    mat = shader.volume((.94, .952, .975, 1.), density, .38)
    box(collection, 'Foreground cloud sea, broken crowns and valley gaps', -270., 270., 36., 84., -29., .5, mat)


def thin_air(collection, start, end, density):
    haze = Shader('Aerial perspective ' + collection.name)
    atmosphere = haze.volume((.64, .77, .955, 1.), density, .19)
    box(collection, 'Air between the measured ridges', -840., 840., start, end, -82., 153., atmosphere)


def plunge_spray(collection, end):
    x, depth, y = end
    mist = Shader('Aerated spray at the measured waterfall landing')
    point = mist.coordinate()
    coords = mist.xyz(point)
    total = 0.
    for name, center, radius in (('X', x, 1.17), ('Y', depth, 1.64), ('Z', y + .43, .93)):
        offset = mist.math('SUBTRACT', coords[name], center)
        norm = mist.math('DIVIDE', offset, radius)
        total = mist.math('ADD', total, mist.product(norm, norm))
    noise = mist.noise(point, (2., 2., 2.9), detail=2.)
    soft = mist.between(mist.math('SUBTRACT', 1., total), 0., .71)
    material = mist.volume((.94, .96, .98, 1.), mist.product(soft, noise, .48), .21)
    box(collection, 'Falling water spray', x - 1.21, x + 1.21, depth - 1.68, depth + 1.68,
        y - .55, y + 1.4, material)


def set_world(scene, daylight, pre_exposure):
    world = bpy.data.worlds.new('Pine Gate midday atmosphere')
    world.use_nodes = True
    scene.world = world
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = True
    for attribute, key in (('sun_elevation', 'solarElevationDegrees'),
                            ('sun_rotation', 'solarAzimuthDegrees'), ('sun_size', 'solarDiameterDegrees')):
        setattr(sky, attribute, math.radians(daylight[key]))
    for attribute, key in (('sun_intensity', 'solarIntensity'), ('altitude', 'altitudeMetres'),
                            ('air_density', 'airDensity'), ('aerosol_density', 'aerosolDensity'),
                            ('ozone_density', 'ozoneDensity')):
        setattr(sky, attribute, daylight[key])
    background = world.node_tree.nodes.get('Background')
    background.inputs['Strength'].default_value = daylight['atmosphereStrength'] / pre_exposure
    world.node_tree.links.new(sky.outputs['Color'], background.inputs['Color'])
    return background.inputs['Strength'].default_value


def projection_camera(scene, projection):
    data = bpy.data.cameras.new('Pine Gate fixed valley plate projection')
    data.type = 'PERSP'
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 24.
    data.lens = data.sensor_height * .5 / math.tan(math.radians(projection['verticalFov']) * .5)
    data.clip_end = 2000.
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)

    def coordinates(x, y, z):
        return Vector((x, -z, y))

    camera.location = coordinates(*projection['position'])
    camera.rotation_euler = coordinates(*projection['direction']).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera


def set_device(scene, backend):
    if backend == 'CPU':
        scene.cycles.device = 'CPU'
        return ['CPU']
    preferences = bpy.context.preferences.addons['cycles'].preferences
    preferences.compute_device_type = backend
    preferences.refresh_devices()
    chosen = [device.name for device in preferences.devices if device.type == backend]
    if not chosen:
        raise RuntimeError(f'No Cycles {backend} device is available.')
    for device in preferences.devices:
        device.use = device.type == backend
    scene.cycles.device = 'GPU'
    return chosen


def configure(scene, options, width, height):
    scene.render.engine = 'CYCLES'
    scene.render.film_transparent = True
    scene.render.use_persistent_data = False
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1.
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.exposure = 0.
    scene.view_settings.gamma = 1.
    image = scene.render.image_settings
    image.file_format = 'OPEN_EXR'
    image.color_depth = '32'
    image.color_mode = 'RGBA'
    image.exr_codec = 'NONE'
    image.color_management = 'OVERRIDE'
    image.linear_colorspace_settings.name = 'Linear Rec.709'
    scene.cycles.samples = options.samples
    scene.cycles.seed = 1307
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = not options.no_denoise
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.volume_bounces = 2
    scene.cycles.volume_max_steps = 320
    scene.cycles.volume_step_rate = 1.
    return set_device(scene, options.device)


def build(scene, land, fields, river, forests):
    layers = {name: bpy.data.collections.new(name) for name in LAYERS}
    for collection in layers.values():
        scene.collection.children.link(collection)
    library = bpy.data.collections.new('Pine crown prototypes outside camera range')
    scene.collection.children.link(library)
    surface = materials()
    occluders = ()
    for name in ('far', 'mid'):
        far = name == 'far'
        collection = layers[name]
        terrain = mesh(collection, 'Far SRTM mountains' if far else 'Middle SRTM hills and river valley',
                       land.terrain(far), [surface['ground']], smooth=True)
        trees = forest(collection, crown_library(library, surface, far), forests[name])
        if not far:
            occluders = (terrain, trees)

    earth, water, rice, _ = fields
    middle = layers['mid']
    mesh(middle, 'Joined soil contours and raised bunds', earth, [surface['ground']])
    mesh(middle, 'Fourteen horizontal flooded rice beds', water, [surface['water']])
    mesh(middle, 'Sparse late-spring rice shoots', rice, [surface['rice']])
    creek, falls, end, _ = river
    mesh(middle, 'D8 drainage on the measured valley floor', creek, [surface['creek']], smooth=True)
    mesh(middle, 'Free-falling sheet behind exposed terrain', falls, [surface['fall']], smooth=True)
    plunge_spray(middle, end)
    thin_air(middle, 128., FAR_START, .0010)
    thin_air(layers['far'], FAR_START, 940., .00145)
    cloud_sea(layers['cloud'])
    return layers, occluders


def render(scene, layers, occluders, options, metadata):
    report = options.out / 'render.json'

    def save_metadata():
        report.write_text(json.dumps(metadata, indent=2) + '\n')

    save_metadata()
    for plate in options.layers:
        for name, collection in layers.items():
            for obj in collection.objects:
                # Keep physical lighting and glossy reflections across the
                # plates. In the cloud render, solid mid hills also stop rays
                # from incorrectly showing vapor behind a nearer ridge.
                holdout = plate == 'cloud' and obj in occluders
                obj.is_holdout = holdout
                obj.visible_camera = holdout or name == plate or plate == 'composite'
        temporary = options.out / f'.{plate}.premultiplied.exr'
        scene.render.filepath = str(temporary)
        start = monotonic()
        if 'FINISHED' not in bpy.ops.render.render(write_still=True):
            raise RuntimeError(f'Cycles did not finish plate {plate}.')
        stats = straighten(temporary, metadata['width'], metadata['height'])
        target = options.out / f'{plate}.exr'
        temporary.replace(target)
        metadata['plates'][plate] = {'file': target.name, 'bytes': target.stat().st_size,
                                     'seconds': round(monotonic() - start, 3), **stats}
        save_metadata()


def parse_args():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--width', type=int)
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--device', choices=('CPU', 'METAL', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI'), default='CPU')
    parser.add_argument('--layers', nargs='+', choices=(*LAYERS, 'composite'), default=LAYERS)
    parser.add_argument('--no-denoise', action='store_true')
    parser.add_argument('--save-blend', type=Path)
    parser.add_argument('--inspect', action='store_true', help='Check source geometry using standard Python; no render.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    if not args.inspect and (args.out is None or args.samples < 1):
        parser.error('Rendering requires --out and positive --samples.')
    return args


def main():
    options = parse_args()
    projection, daylight = (json.loads(path.read_text()) for path in (PROJECTION, DAYLIGHT))
    width = options.width or projection['width']
    if width < 2 or width * projection['height'] % projection['width']:
        raise ValueError('Plate dimensions must preserve the projection aspect ratio.')
    height = width * projection['height'] // projection['width']
    land = Landscape()
    fields, river = paddies(land), drainage(land)
    forests = {name: forest_points(land, name == 'far') for name in ('far', 'mid')}
    metadata = {
        'projection': projection, 'width': width, 'height': height, 'samples': options.samples,
        'alpha': 'straight', 'colorSpace': 'scene-linear Rec.709', 'exposureAppliedStops': 0.,
        'runtimePreExposureMultiplier': projection['preExposure'],
        'previewExposureStops': math.log2(projection['preExposure']),
        'solarConfiguration': daylight,
        'worldStrength': daylight['atmosphereStrength'] / projection['preExposure'],
        'terrainSource': 'USGS SRTM N23E102 Skadi, 204 x 175 quantised elevation grid',
        'terrainSha256': ELEVATION_SHA256,
        'projectionSha256': sha256(PROJECTION.read_bytes()).hexdigest(),
        'sourceSha256': {name: sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                         for name in ('pine_valley_backdrop.py', 'pine_valley_terrain.py', 'pine_valley_exr.py')},
        'terrainSplitDownrangeMetres': FAR_START,
        'cameraVisibility': {'far': 'far ridge and its aerial haze', 'mid': 'middle ridge, fields, and waterfall',
                             'cloud': 'cloud sea with opaque middle terrain and forest as camera holdouts'},
        'forestInstances': {name: [len(batch[0]) for batch in batches] for name, batches in forests.items()},
        'terraces': fields[-1], 'waterfall': river[-1], 'plates': {},
    }
    print(json.dumps(metadata, indent=2), flush=True)
    if options.inspect:
        return

    global bpy, Vector
    import bpy
    from mathutils import Vector

    options.out = options.out.resolve()
    options.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    metadata['blender'] = bpy.app.version_string
    metadata['devices'] = configure(scene, options, width, height)
    metadata['worldStrength'] = set_world(scene, daylight, projection['preExposure'])
    projection_camera(scene, projection)
    layers, occluders = build(scene, land, fields, river, forests)
    if options.save_blend:
        options.save_blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(options.save_blend.resolve()))
    render(scene, layers, occluders, options, metadata)


if __name__ == '__main__':
    main()
