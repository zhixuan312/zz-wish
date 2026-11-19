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
AIR_EXTINCTION = .00061
AIR_DEPTH_GRADIENT = .00000165
AIR_NEAR_METRES = 19.
AIR_SCATTER_RGB = (.060, .101, .167)
RIPPLES = ((.0026, .43, .21, .978), (.0011, .219, -.42, .908))
WIND_SLOPES = (.28, .42)
CLOUD_LAYERS = ((29., 36., 47., 58., 14., 31., -14., -10.2, -6.6, -5.3, .155),
                (39., 47., 57., 70., 18., 33., -8.6, -6.4, -4.3, -3.4, .208))
UPPER_MIST_BOUNDS = (-173., 168., 72., 232., 25., 51.)


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
    if batch.moisture:
        if len(batch.moisture) != len(batch.points):
            raise ValueError(f'{name} has partial bank moisture attributes.')
        damp = data.attributes.new('paddyMoisture', 'FLOAT', 'POINT')
        damp.data.foreach_set('value', batch.moisture)
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

    def surface(self, color, roughness, *, ior=1.45, specular=.5, transmission=0., bump=None, air=None):
        node = self.nodes.new('ShaderNodeBsdfPrincipled')
        for name, value in (('Base Color', color), ('Roughness', roughness), ('IOR', ior),
                            ('Specular IOR Level', specular), ('Transmission Weight', transmission)):
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
    # to opaque camera and specular reflection hits. Alpha remains a record
    # of actual terrain/crown coverage, and diffuse transport is untouched.
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

    primary = path.outputs['Is Camera Ray']
    mirror = math_node('MULTIPLY', path.outputs['Is Reflection Ray'], path.outputs['Is Glossy Ray'])
    distant = math_node('ADD', math_node('MULTIPLY', primary, gaze.outputs['View Distance']),
                        math_node('MULTIPLY', mirror, path.outputs['Ray Length']))
    length = math_node('MAXIMUM', math_node('SUBTRACT', distant, AIR_NEAR_METRES), 0.)
    extinction = math_node('ADD', AIR_EXTINCTION, math_node('MULTIPLY', AIR_DEPTH_GRADIENT, length))
    transmittance = math_node('EXPONENT', math_node('MULTIPLY', length, math_node('MULTIPLY', extinction, -1.)), 0.)
    directly_seen = math_node('SUBTRACT', 1., transmittance)

    scatter = nodes.new('ShaderNodeEmission')
    scatter.inputs['Color'].default_value = (*AIR_SCATTER_RGB, 1.)
    mixer = nodes.new('ShaderNodeMixShader')
    links.new(directly_seen, mixer.inputs[0])
    links.new(surface.outputs['Surface'], mixer.inputs[1])
    links.new(scatter.outputs[0], mixer.inputs[2])
    links.new(mixer.outputs[0], output.inputs['Surface'])
    return tree


def water_ripples(water, position):
    axes = water.xyz(position)
    variation = water.noise(position, (.91, 1.08, .4), detail=2.)
    phases = []
    for amplitude, wavelength, across, along in RIPPLES:
        direction = water.math('ADD', water.product(axes['X'], across), water.product(axes['Y'], along))
        phase = water.math('ADD', water.product(direction, math.tau / wavelength), water.product(variation, 4.1))
        phases.append(water.product(water.math('SINE', phase), amplitude))
    return water.math('ADD', *phases), variation


PADDY_AOVS = ('PaddySurface', 'PaddyWindWeight', 'PaddyBund', 'PaddySilt')


def paddy_aov(shader, name, value):
    output = shader.nodes.new('ShaderNodeOutputAOV')
    output.aov_name = name
    shader.input(output.inputs['Value'], value)


def paddy_glass(air, audit=False):
    water = Shader('Clear flooded beds with Fresnel wind-wave reflections')
    wave, gusts = water_ripples(water, water.coordinate())
    geom = water.nodes.new('ShaderNodeNewGeometry')
    bump = water.nodes.new('ShaderNodeBump')
    water.input(bump.inputs['Height'], wave)
    bump.inputs['Distance'].default_value = 1.
    bump.inputs['Strength'].default_value = .87
    calm_normal = bump.outputs['Normal']
    roughness = water.between(gusts, .26, .75, .034, .082)
    slope = water.between(gusts, .30, .73, *WIND_SLOPES)
    crest_share = water.between(gusts, .20, .80, .38, .71)

    def vector(operation, a, b):
        math_node = water.nodes.new('ShaderNodeVectorMath')
        math_node.operation = operation
        water.input(math_node.inputs[0], a)
        if operation == 'SCALE':
            water.input(math_node.inputs['Scale'], b)
        elif b is not None:
            water.input(math_node.inputs[1], b)
        return math_node.outputs['Value' if operation == 'DOT_PRODUCT' else 'Vector']

    def glass(normal):
        node = water.nodes.new('ShaderNodeBsdfGlass')
        node.inputs['IOR'].default_value = 1.333
        node.inputs['Color'].default_value = (.94, .97, .974, 1.)
        water.input(node.inputs['Normal'], normal)
        water.input(node.inputs['Roughness'], roughness)
        return node.outputs[0]

    def area(normal):
        return water.math('MAXIMUM', 0., vector('DOT_PRODUCT', normal, geom.outputs['Incoming']))

    def mix(a, b, fraction):
        node = water.nodes.new('ShaderNodeMixShader')
        for socket, value in zip(node.inputs, (fraction, a, b)):
            water.input(socket, value)
        return node.outputs[0]

    # The short waves occupy both signs of slope. Each visible facet is
    # weighted by projected area, so the windward faces dominate at grazing
    # incidence. The wider lobes survive pixel filtering at valley distance.
    ripple = vector('SCALE', (-.21, -.978, 0.), slope)
    positive = vector('NORMALIZE', vector('ADD', calm_normal, ripple), None)
    negative = vector('NORMALIZE', vector('SUBTRACT', calm_normal, ripple), None)
    front, back = area(positive), area(negative)
    pair_area = water.math('ADD', front, back)
    back_fraction = water.math('DIVIDE', back, water.math('MAXIMUM', .0001, pair_area))
    wind_pair = mix(glass(positive), glass(negative), back_fraction)
    wind_area = water.product(pair_area, crest_share, .5)
    calm_area = water.product(area(calm_normal), water.math('SUBTRACT', 1., crest_share))
    seen = water.math('ADD', wind_area, calm_area)
    weight = water.math('DIVIDE', wind_area, water.math('MAXIMUM', .0001, seen))
    surface = mix(glass(calm_normal), wind_pair, weight)
    # The view to the water travels through the same distance of air as the
    # terraces and trees. Light transmitted through the water can still reach silt.
    water.material.cycles.emission_sampling = 'NONE'
    aerial = water.nodes.new('ShaderNodeGroup')
    aerial.node_tree = air
    water.links.new(surface, aerial.inputs['Surface'])
    water.links.new(aerial.outputs['Surface'], water.output.inputs['Surface'])
    if audit:
        paddy_aov(water, 'PaddySurface', 1.)
        paddy_aov(water, 'PaddyWindWeight', weight)
    return water.material


def materials(air, audit_paddy=False):
    ground = Shader('Shaded pine groves, continuous understory and paddy soil')
    position = ground.coordinate()
    grove = ground.noise(position, (.061, .071, .055), detail=3.)
    fern = ground.noise(position, (.41, .48, .38), detail=3.)
    grain = ground.noise(position, (3.4, 3.1, 2.3), detail=2.)
    geology = ground.nodes.new('ShaderNodeNewGeometry').outputs['Normal']
    normal = ground.xyz(geology)['Z']
    exposure = ground.math('SUBTRACT', 1., ground.between(normal, .19, .66))
    cracks = ground.noise(position, (.38, .47, 1.31), detail=2.)

    # A low mat of fern and mixed sapling crowns joins the larger trees.
    branches = ground.nodes.new('ShaderNodeTexVoronoi')
    branches.inputs['Scale'].default_value = 1.32
    branches.inputs['Randomness'].default_value = 1.
    ground.input(branches.inputs['Vector'], position)
    crown = ground.between(branches.outputs['Distance'], .07, .78, 1., 0.)
    mottled = ground.math('ADD', ground.product(fern, .58), ground.product(grove, .42))
    cover = ground.between(mottled, .26, .81)
    litter = ground.blend((.007, .012, .007, 1.), (.020, .031, .014, 1.), grain)
    brush = ground.blend((.012, .032, .016, 1.), (.026, .064, .023, 1.), grove)
    canopy_shade = ground.math('ADD', ground.product(cover, .72), ground.product(crown, .28))
    hillside = ground.blend(litter, brush, canopy_shade)
    stone = ground.blend((.035, .039, .033, 1.), (.073, .068, .052, 1.), cracks)
    rock = ground.product(exposure, ground.between(cracks, .59, .83),
                          ground.math('SUBTRACT', 1., ground.product(cover, .47)))
    hillside = ground.blend(hillside, stone, rock)

    crest_grass = ground.blend((.013, .024, .012, 1.), (.038, .061, .026, 1.), fern)
    damp_soil = ground.blend((.007, .010, .006, 1.), (.021, .027, .016, 1.), grain)
    moisture = ground.nodes.new('ShaderNodeAttribute')
    moisture.attribute_name = 'paddyMoisture'
    wet = ground.product(moisture.outputs['Fac'], ground.between(fern, .22, .78, .61, .96))
    # Spring irrigation darkens the entire bank, with a deeper wet margin at the pool.
    soil_saturation = ground.between(wet, 0., 1., .46, 1., smooth=False)
    soil = ground.blend(crest_grass, damp_soil, soil_saturation)
    cultivated = ground.nodes.new('ShaderNodeAttribute')
    cultivated.attribute_name = 'cultivated'
    soil_mask = cultivated.outputs['Fac']
    surface = ground.blend(hillside, soil, soil_mask)
    forest_relief = ground.math('ADD', ground.math('ADD', ground.product(fern, .21), ground.product(crown, .60)),
                                  ground.product(grain, .19))
    relief = ground.math('ADD', ground.product(forest_relief, ground.math('SUBTRACT', 1., soil_mask)),
                         ground.product(grain, soil_mask))
    bank_wetness = ground.product(soil_mask, wet)
    roughness = ground.between(bank_wetness, 0., 1., .88, .68, smooth=False)
    result = {'ground': ground.surface(surface, roughness, specular=.26, bump=(relief, .52, .19), air=air)}

    sediment = Shader('Waterlogged silt beneath the rice beds')
    silt = sediment.noise(sediment.coordinate(), (2.6, 2.2, 2.))
    mud = sediment.blend((.009, .013, .010, 1.), (.026, .029, .021, 1.), silt)
    result['silt'] = sediment.surface(mud, .88, specular=.22, bump=(silt, .19, .022), air=air)

    leaf = Shader('Pine fascicles and fresh needle tips')
    instance = leaf.nodes.new('ShaderNodeObjectInfo').outputs['Random']
    grain = leaf.noise(leaf.coordinate(), (17., 19., 16.), detail=2.)
    tint = leaf.math('ADD', leaf.product(instance, .57), leaf.product(grain, .43))
    pigment = leaf.blend((.012, .030, .015, 1.), (.055, .097, .033, 1.), tint)
    result['pine'] = leaf.surface(pigment, .82, specular=.25, air=air)
    result['bark'] = Shader('Weathered pine bark').surface((.067, .044, .029, 1.), .9, air=air)
    seedling = Shader('Translucent green rice shoots')
    result['rice'] = seedling.surface((.084, .19, .046, 1.), .54)

    result['water'] = paddy_glass(air, audit_paddy)
    if audit_paddy:
        paddy_aov(ground, 'PaddyBund', soil_mask)
        paddy_aov(sediment, 'PaddySilt', 1.)

    flow = Shader('Broken falling water and pale aeration')
    p = flow.coordinate()
    air = flow.noise(p, (11., 11., 2.4), detail=3.)
    thin = flow.noise(p, (15., 15., .83), detail=2.)
    foam = flow.between(flow.math('ADD', air, flow.product(thin, .3)), .54, .81)
    falling = flow.blend((.084, .140, .139, 1.), (.64, .73, .72, 1.), foam)
    result['fall'] = flow.surface(falling, .245, ior=1.333, transmission=.46,
                                   bump=(thin, .25, .018))
    creek = Shader('Shallow stream, wet rock and broken highlights')
    disturbance = creek.noise(creek.coordinate(), (7.1, 12., 3.8), detail=2.)
    pool = creek.blend((.049, .085, .076, 1.), (.29, .37, .33, 1.), creek.between(disturbance, .57, .83))
    result['creek'] = creek.surface(pool, .31, ior=1.333, transmission=.40, bump=(disturbance, .18, .012))
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
    shader = Shader('Sunlit cloud banks in the open valley throat')
    point = shader.coordinate()
    axes = shader.xyz(point)
    x, depth, y = axes['X'], axes['Y'], axes['Z']
    billows = shader.noise(point, (.095, .13, .21), detail=4.)
    veins = shader.noise(point, (.053, .117, .44), detail=3.)
    fine = shader.noise(point, (.26, .30, .38), detail=3.)
    body = shader.math('ADD', shader.product(billows, .68), shader.product(fine, .32))
    head = shader.math('ADD', shader.product(billows, .48), shader.product(veins, .52))
    wisps = shader.between(head, .32, .77, .35, 1.)
    masses = []
    for near, rise, crest_d, far, cx, half, lo, base, opaque_top, top, extinction in CLOUD_LAYERS:
        reach = shader.product(shader.between(depth, near, rise), shader.between(depth, far, crest_d))
        crown_height = shader.between(body, .27, .8, opaque_top - .65, top + .29)
        upper = shader.between(shader.math('SUBTRACT', crown_height, y), 0., 2.2)
        lower = shader.between(y, lo, base)
        drift = shader.math('ADD', cx, shader.product(shader.math('SUBTRACT', depth, rise), .185))
        across = shader.math('ABSOLUTE', shader.math('SUBTRACT', x, drift))
        edges = shader.between(across, half, half * .36)
        masses.append(shader.product(reach, upper, lower, edges, wisps, extinction))
    density = shader.math('ADD', *masses)
    mat = shader.volume((.93, .949, .985, 1.), density, .32)
    box(collection, 'Staggered fog banks clearing the native ridges', -40., 73., 28.5, 71., -14.5, -2.5, mat)


def upper_hillside_mist(collection):
    # Wind shears the upper vapor into a broad low stratus band. Its outer
    # wisps continue across the ridges, and water sees part of it at grazing
    # incidence from the slope below.
    cloud = Shader('Wind-sheared mist above the opposite hillside')
    point = cloud.coordinate()
    axes = cloud.xyz(point)
    x, downrange, height = axes['X'], axes['Y'], axes['Z']
    drift = cloud.product(x, .23)
    width_noise = cloud.noise(point, (.031, .035, .13), detail=3.)
    crown = cloud.noise(point, (.057, .098, .19), detail=4.)
    fringe = cloud.noise(point, (.087, .128, .44), detail=2.)
    centreline = cloud.math('ADD', cloud.math('ADD', 145., drift),
                            cloud.between(width_noise, .18, .82, -9., 13.))
    distance = cloud.math('ABSOLUTE', cloud.math('SUBTRACT', downrange, centreline))
    reach = cloud.between(distance, 28., 7.)
    lateral = cloud.product(cloud.between(x, -173., -127.), cloud.between(x, 168., 125.))
    base = cloud.math('ADD', cloud.math('ADD', 31., cloud.product(x, .021)),
                      cloud.between(width_noise, .23, .81, -.8, 3.8))
    ceiling = cloud.math('ADD', base, cloud.between(crown, .25, .79, 2.4, 10.5))
    lower = cloud.between(cloud.math('SUBTRACT', height, base), 0., 3.)
    upper = cloud.between(cloud.math('SUBTRACT', ceiling, height), 0., 4.)
    texture = cloud.product(cloud.between(crown, .28, .68, .16, 1.),
                            cloud.between(fringe, .25, .72, .38, 1.))
    density = cloud.product(reach, lateral, lower, upper, texture, .29)
    material = cloud.volume((.969, .978, .994, 1.), density, .23)
    box(collection, 'Sunlit hillside vapor and its paddy reflections', *UPPER_MIST_BOUNDS, material)


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


def build(scene, land, fields, river, forests, audit_paddy=False):
    layers = {name: bpy.data.collections.new(name) for name in LAYERS}
    for collection in layers.values():
        scene.collection.children.link(collection)
    library = bpy.data.collections.new('Pine crown prototypes outside camera range')
    scene.collection.children.link(library)
    surface = materials(air_perspective(), audit_paddy)
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
    banks = mesh(middle, 'Joined soil contours and raised bunds', earth, [surface['ground'], surface['silt']])
    for index in earth.sediment_faces:
        banks.data.polygons[index].material_index = 1
    occluders = (*occluders, banks)
    mesh(middle, 'Fourteen horizontal flooded rice beds', water, [surface['water']])
    mesh(middle, 'Sparse late-spring rice shoots', rice, [surface['rice']])
    creek, falls, end, _ = river
    mesh(middle, 'D8 drainage on the measured valley floor', creek, [surface['creek']], smooth=True)
    mesh(middle, 'Free-falling sheet behind exposed terrain', falls, [surface['fall']], smooth=True)
    plunge_spray(middle, end)
    cloud_sea(layers['cloud'])
    upper_hillside_mist(layers['cloud'])
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


def render_paddy_transport(scene, layers, pools, options, metadata):
    from bpy_extras.object_utils import world_to_camera_view

    target = options.out / 'paddy-transport.exr'
    receipt = options.out / 'paddy-audit.json'
    if any(path.exists() for path in (target, receipt, options.out / 'render.json')):
        raise ValueError('Use a fresh output directory for paddy transport diagnostics.')

    for name, collection in layers.items():
        for obj in collection.objects:
            obj.visible_camera = name == 'mid'
    view = bpy.context.view_layer
    view.name = 'Paddy'
    for name in PADDY_AOVS:
        aov = view.aovs.add()
        aov.name, aov.type = name, 'VALUE'
    for transport in ('diffuse', 'glossy', 'transmission'):
        for channel in ('direct', 'indirect', 'color'):
            setattr(view, f'use_pass_{transport}_{channel}', True)
    view.use_pass_position = True
    view.use_pass_normal = True

    bpy.context.view_layer.update()
    points = [world_to_camera_view(scene, scene.camera, Vector(point)) for point in pools.points]
    width, height = metadata['width'], metadata['height']
    pad = max(12, round(width * .004))
    x0 = max(0, math.floor(min(point.x for point in points) * width) - pad)
    x1 = min(width, math.ceil(max(point.x for point in points) * width) + pad)
    y0 = max(0, math.floor(min(point.y for point in points) * height) - pad)
    y1 = min(height, math.ceil(max(point.y for point in points) * height) + pad)

    render = scene.render
    render.use_border = True
    render.use_crop_to_border = True
    render.border_min_x, render.border_max_x = x0 / width, x1 / width
    render.border_min_y, render.border_max_y = y0 / height, y1 / height
    render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
    render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    render.image_settings.color_depth = '32'
    render.image_settings.use_exr_interleave = True
    render.image_settings.exr_codec = 'NONE'
    render.filepath = str(target)
    start = monotonic()
    if 'FINISHED' not in bpy.ops.render.render(write_still=True):
        raise RuntimeError('Paddy transport diagnostic did not finish.')
    audit = {**metadata, 'file': target.name, 'sha256': digest(target),
             'seconds': round(monotonic() - start, 3),
             'cropPixelsBottomLeft': [x0, y0, x1, y1], 'aovs': PADDY_AOVS,
             'transport': 'Each RGB closure contribution is (Direct + Indirect) * Color.'}
    receipt.write_text(json.dumps(audit, indent=2) + '\n')


def parse_args():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--width', type=int)
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--device', choices=('CPU', 'METAL', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI'), default='CPU')
    parser.add_argument('--layers', nargs='+', choices=(*LAYERS, 'composite'), default=LAYERS)
    parser.add_argument('--no-denoise', action='store_true')
    parser.add_argument('--resume', action='store_true', help='Verify the original recipe and add missing plates.')
    parser.add_argument('--paddy-audit', action='store_true', help='Render a cropped multilayer EXR of paddy transport.')
    parser.add_argument('--save-blend', type=Path)
    parser.add_argument('--inspect', action='store_true', help='Check source geometry using standard Python; no render.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    if not args.inspect and (args.out is None or args.samples < 1):
        parser.error('Rendering requires --out and positive --samples.')
    if args.paddy_audit and (args.resume or args.save_blend):
        parser.error('--paddy-audit requires a fresh render directory.')
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
        'atmosphere': {'model': 'Beer-Lambert aerial perspective at opaque camera and reflection hits',
                       'rawLinearRec709Airlight': AIR_SCATTER_RGB, 'extinctionPerMetre': AIR_EXTINCTION,
                       'depthGradient': AIR_DEPTH_GRADIENT, 'clearNearMetres': AIR_NEAR_METRES},
        'paddyWindFaceSlopeRange': WIND_SLOPES,
        'paddyRippleTrains': [{'amplitudeMetres': a, 'wavelengthMetres': length,
                               'windDirection': [x, depth]} for a, length, x, depth in RIPPLES],
        'cloudDownrangeBands': [[band[0], band[3]] for band in CLOUD_LAYERS],
        'upperMistBoundsMetres': UPPER_MIST_BOUNDS,
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
    layers, occluders = build(scene, land, fields, river, forests, audit_paddy=options.paddy_audit)
    if options.paddy_audit:
        render_paddy_transport(scene, layers, fields[1], options, metadata)
        return
    if options.save_blend:
        options.save_blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(options.save_blend.resolve()))
    render(scene, layers, occluders, options, metadata)


if __name__ == '__main__':
    main()
