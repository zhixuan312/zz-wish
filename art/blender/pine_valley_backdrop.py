"""Author and render the Pine Gate SRTM valley as projection-matched Cycles plates.

Preview under Blender 5.3:
  blender -b -t 6 --python-exit-code 1 --python art/blender/pine_valley_backdrop.py -- \
    --out art/build/pine-gate/valley-preview --width 1600 --samples 8 --device METAL

Rendering is local. The only terrain input is the pinned derived USGS SRTM grid.
"""

from argparse import ArgumentParser
from hashlib import file_digest, sha256
import json
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from time import monotonic

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_valley_crowns import PROFILES, crown_mesh
from pine_valley_exr import straighten
from pine_valley_terrain import (
    Batch, ELEVATION_SHA256, FAR_START, Landscape, ROOT, drainage, forest_points, paddies,
)

PROJECTION = ROOT / 'shared/pine-gate-backdrop.json'
DAYLIGHT = ROOT / 'shared/pine-gate-daylight.json'
LAYERS = ('far', 'mid', 'cloud')
AIR_EXTINCTION = .00152
AIR_NEAR_METRES = 22.
AIR_SCATTER_RGB = (.092, .132, .193)


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

    def surface(self, color, roughness, *, ior=1.45, transmission=0., bump=None, air=None):
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
        surface = node.outputs[0]
        if air is not None:
            self.material.cycles.emission_sampling = 'NONE'
            aerial = self.nodes.new('ShaderNodeGroup')
            aerial.node_tree = air
            self.links.new(surface, aerial.inputs['Surface'])
            surface = aerial.outputs['Surface']
        self.links.new(surface, self.output.inputs['Surface'])
        return self.material

    def volume(self, color, density, anisotropy):
        node = self.nodes.new('ShaderNodeVolumeScatter')
        self.input(node.inputs['Color'], color)
        self.input(node.inputs['Density'], density)
        node.inputs['Anisotropy'].default_value = anisotropy
        self.links.new(node.outputs[0], self.output.inputs['Volume'])
        return self.material


def air_perspective():
    # Apply L = surface * exp(-sigma*d) + air * (1 - exp(-sigma*d))
    # to opaque camera hits. The resulting RGB has atmospheric depth but
    # the film records only actual terrain/crown coverage in alpha.
    tree = bpy.data.node_groups.new('Deterministic spectral aerial perspective', 'ShaderNodeTree')
    for direction in ('INPUT', 'OUTPUT'):
        tree.interface.new_socket(name='Surface', in_out=direction, socket_type='NodeSocketShader')
    nodes, links = tree.nodes, tree.links
    surface = nodes.new('NodeGroupInput')
    output = nodes.new('NodeGroupOutput')
    gaze = nodes.new('ShaderNodeCameraData')
    path = nodes.new('ShaderNodeLightPath')

    def math_node(operation, a, b):
        node = nodes.new('ShaderNodeMath')
        node.operation = operation
        for index, value in enumerate((a, b)):
            if isinstance(value, bpy.types.NodeSocket):
                links.new(value, node.inputs[index])
            else:
                node.inputs[index].default_value = value
        return node.outputs[0]

    extent = math_node('SUBTRACT', gaze.outputs['View Distance'], AIR_NEAR_METRES)
    length = math_node('MAXIMUM', extent, 0.)
    depth = math_node('MULTIPLY', length, -AIR_EXTINCTION)
    transmittance = math_node('EXPONENT', depth, 0.)
    fraction = math_node('SUBTRACT', 1., transmittance)
    directly_seen = math_node('MULTIPLY', fraction, path.outputs['Is Camera Ray'])

    scatter = nodes.new('ShaderNodeEmission')
    scatter.inputs['Color'].default_value = (*AIR_SCATTER_RGB, 1.)
    mixer = nodes.new('ShaderNodeMixShader')
    links.new(directly_seen, mixer.inputs[0])
    links.new(surface.outputs['Surface'], mixer.inputs[1])
    links.new(scatter.outputs[0], mixer.inputs[2])
    links.new(mixer.outputs[0], output.inputs['Surface'])
    return tree


def materials(air):
    ground = Shader('Forest litter, understory, exposed stone and paddy soil')
    position = ground.coordinate()
    grove = ground.noise(position, (.046, .052, .035), detail=3.)
    bracken = ground.noise(position, (.61, .52, .42), detail=3.)
    grain = ground.noise(position, (5.8, 5.4, 5.2), detail=2.)
    geology = ground.nodes.new('ShaderNodeNewGeometry').outputs['Normal']
    normal = ground.xyz(geology)['Z']
    exposure = ground.math('SUBTRACT', 1., ground.between(normal, .20, .76))
    cracks = ground.noise(position, (.37, .42, 1.26), detail=3.)

    mottled = ground.math('ADD', ground.product(grove, .59), ground.product(bracken, .41))
    cover = ground.between(mottled, .24, .76)
    litter = ground.blend((.030, .042, .019, 1.), (.063, .066, .031, 1.), grain)
    brush = ground.blend((.026, .064, .027, 1.), (.080, .123, .049, 1.), groove)
    hillside = ground.blend(litter, brush, cover)
    stone = ground.blend((.068, .064, .052, 1.), (.114, .109, .087, 1.), cracks)
    rock = ground.product(exposure, ground.between(cracks, .56, .79),
                          ground.math('SUBTRACT', 1., ground.product(cover, .47)))
    hillside = ground.blend(hillside, stone, rock)

    soil = ground.blend((.091, .074, .044, 1.), (.146, .155, .064, 1.), bracken)
    cultivated = ground.nodes.new('ShaderNodeAttribute')
    cultivated.attribute_name = 'cultivated'
    surface = ground.blend(hillside, soil, cultivated.outputs['Fac'])
    relief = ground.math('ADD', ground.product(bracken, .75), ground.product(grain, .25))
    result = {'ground': ground.surface(surface, .85, bump=(relief, .47, .16), air=air)}

    leaf = Shader('Pine fascicles and fresh needle tips')
    instance = leaf.nodes.new('ShaderNodeObjectInfo').outputs['Random']
    grain = leaf.noise(leaf.coordinate(), (17., 19., 16.), detail=2.)
    tint = leaf.math('ADD', leaf.product(instance, .57), leaf.product(grain, .43))
    pigment = leaf.blend((.016, .044, .023, 1.), (.082, .137, .047, 1.), tint)
    result['pine'] = leaf.surface(pigment, .78, air=air)
    result['bark'] = Shader('Weathered pine bark').surface((.067, .044, .029, 1.), .9, air=air)
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


def crown_library(collection, surface, far):
    library = bpy.data.collections.new('Far crown variants' if far else 'Mid crown variants')
    collection.children.link(library)
    for index, _ in enumerate(PROFILES):
        batch, indices = crown_mesh(index, far)
        model = mesh(library, f'Branching pine crown {index + 1}', batch,
                     (surface['pine'], surface['bark']))
        # Source meshes stay evaluable but stand behind the projection camera.
        model.location = (0., -2600. - 12. * index, 0.)
        for face, material in zip(model.data.polygons, indices):
            face.material_index = material
            face.use_smooth = material == 1
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
    surface = materials(air_perspective())
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
    cloud_sea(layers['cloud'])
    return layers, occluders


def digest(path):
    with path.open('rb') as handle:
        return file_digest(handle, 'sha256').hexdigest()


def prepare_plates(out, resume, recipe):
    report = out / 'render.json'
    plates = {}
    if report.exists():
        if not resume:
            raise ValueError('Use --resume to add layers to this render directory.')
        previous = json.loads(report.read_text())
        known = previous.pop('plates')
        if json.dumps(previous, sort_keys=True) != json.dumps(recipe, sort_keys=True):
            raise ValueError('Resume requires the exact original source, projection, and Cycles settings.')
        for name, evidence in known.items():
            if name not in (*LAYERS, 'composite') or evidence['file'] != f'{name}.exr':
                raise ValueError(f'Invalid layer entry {name}.')
            target = out / evidence['file']
            if not target.exists():
                # The earlier job may have stopped after recording the digest
                # and before making the completed EXR visible.
                continue
            if target.stat().st_size != evidence['bytes'] or digest(target) != evidence['sha256']:
                raise ValueError(f'Existing layer {name} differs from the recorded EXR.')
            plates[name] = evidence
    for name in (*LAYERS, 'composite'):
        if (out / f'{name}.exr').exists() and name not in plates:
            raise ValueError(f'Unrecorded layer {name}. Use a fresh --out directory.')
    return plates


def render(scene, layers, occluders, options, metadata):
    report = options.out / 'render.json'
    pending = options.out / '.render.pending.json'
    plates = prepare_plates(options.out, options.resume, metadata)

    def save_metadata():
        pending.write_text(json.dumps({**metadata, 'plates': plates}, indent=2) + '\n')
        pending.replace(report)

    save_metadata()
    for plate in options.layers:
        if plate in plates:
            print(f'Verified existing {plate}.exr. Skipping render.', flush=True)
            continue
        for name, collection in layers.items():
            for obj in collection.objects:
                # Keep physical lighting and glossy reflections across the
                # plates. The cloud capture uses mid terrain and forest as
                # holdouts wherever those surfaces stand in front of vapor.
                holdout = plate == 'cloud' and obj in occluders
                obj.is_holdout = holdout
                obj.visible_camera = holdout or name == plate or plate == 'composite'

        with TemporaryDirectory(dir=options.out, prefix=f'.{plate}-') as scratch:
            temporary = Path(scratch) / 'premultiplied.exr'
            scene.render.filepath = str(temporary)
            start = monotonic()
            if 'FINISHED' not in bpy.ops.render.render(write_still=True):
                raise RuntimeError(f'Cycles did not finish plate {plate}.')
            stats = straighten(temporary, metadata['width'], metadata['height'])
            target = options.out / f'{plate}.exr'
            plates[plate] = {'file': target.name, 'bytes': temporary.stat().st_size,
                             'sha256': digest(temporary), 'seconds': round(monotonic() - start, 3), **stats}
            save_metadata()
            target.hardlink_to(temporary)


def parse_args():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--width', type=int)
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--device', choices=('CPU', 'METAL', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI'), default='CPU')
    parser.add_argument('--layers', nargs='+', choices=(*LAYERS, 'composite'), default=LAYERS)
    parser.add_argument('--no-denoise', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Verify the original recipe and add missing plates.')
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
        'denoise': not options.no_denoise, 'requestedDevice': options.device,
        'alpha': 'straight', 'colorSpace': 'scene-linear Rec.709', 'exposureAppliedStops': 0.,
        'runtimePreExposureMultiplier': projection['preExposure'],
        'previewExposureStops': math.log2(projection['preExposure']),
        'solarConfiguration': daylight,
        'worldStrength': daylight['atmosphereStrength'] / projection['preExposure'],
        'terrainSource': 'USGS SRTM N23E102 Skadi, 204 x 175 quantised elevation grid',
        'terrainSha256': ELEVATION_SHA256,
        'projectionSha256': digest(PROJECTION),
        'solarSha256': digest(DAYLIGHT),
        'sourceSha256': {name: sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                         for name in ('pine_valley_backdrop.py', 'pine_valley_terrain.py', 'pine_valley_exr.py',
                                      'pine_valley_crowns.py')},
        'terrainSplitDownrangeMetres': FAR_START,
        'atmosphere': {'model': 'camera-hit Beer-Lambert aerial perspective',
                       'rawLinearRec709Airlight': AIR_SCATTER_RGB, 'extinctionPerMetre': AIR_EXTINCTION,
                       'clearNearMetres': AIR_NEAR_METRES},
        'cameraVisibility': {'far': 'opaque SRTM ridges and geometrical pine crown coverage',
                             'mid': 'middle ridge, fields, and waterfall',
                             'cloud': 'cloud sea with opaque middle terrain and forest as camera holdouts'},
        'forestInstances': {name: [len(batch[0]) for batch in batches] for name, batches in forests.items()},
        'terraces': fields[-1], 'waterfall': river[-1],
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
    metadata['blenderBuildHash'] = bpy.app.build_hash.decode('ascii')
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
