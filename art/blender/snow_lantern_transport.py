"""Actual runtime lantern geometry as a non-exported Cycles transport filter.

The imported proxy exists only in lamp lightmap passes. No substitute shell,
emission body or guessed suspension height is generated. Native authored-scene
previews may show the nonemissive diffuse/translucent photographic fabric.
"""
from array import array
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import subprocess

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

POLICY = 'actual-indexed-gauze-candle-filter-v1'
TAG = 'one_light_transport_proxy'
PASS = 'one_light_transport_pass'
META = 'one_light_gauze_transport'
ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def blender(point):
    return Vector((point[0], -point[2], point[1]))


def engine(point):
    return [float(point.x), float(point.z), float(-point.y)]


def field(collection, prop, width, kind='f'):
    data = array(kind, [0]) * (len(collection) * width)
    collection.foreach_get(prop, data)
    return data.tobytes()


def proxy_profiles(scene):
    """Bind actual proxy arrays compactly; never put vertex arrays in metadata."""
    profiles = []
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in sorted((obj for obj in scene.objects if obj.get(TAG)), key=lambda o: o.name):
        if (obj.type != 'MESH' or obj.get(PASS) != 'lamp' or not obj.get('one_light_export_excluded')
                or obj.get('one_light_static') or obj.get('one_light_dynamic') or not obj.visible_shadow):
            raise RuntimeError('Transport proxy must be a lamp-only, non-exported auxiliary mesh: ' + obj.name)
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        fields = {'positions': field(mesh.vertices, 'co', 3),
                  'loopIndices': field(mesh.loops, 'vertex_index', 1, 'i'),
                  'polygonStarts': field(mesh.polygons, 'loop_start', 1, 'i'),
                  'polygonTotals': field(mesh.polygons, 'loop_total', 1, 'i'),
                  'materialIndices': field(mesh.polygons, 'material_index', 1, 'i'),
                  'cornerNormals': field(mesh.corner_normals, 'vector', 3)}
        fields.update({'uv:' + layer.name: field(layer.data, 'uv', 2) for layer in mesh.uv_layers})
        hashes = {name: hashlib.sha256(value).hexdigest() for name, value in fields.items()}
        mesh.calc_loop_triangles()
        row = {'name': obj.name, 'role': obj['transport_role'], 'pass': 'lamp',
               'vertices': len(mesh.vertices), 'triangles': len(mesh.loop_triangles),
               'worldMatrix': [list(row) for row in obj.matrix_world],
               'materials': [material.name if material else None for material in mesh.materials],
               'fields': hashes}
        row['geometrySha256'] = hashlib.sha256(json.dumps(row, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        profiles.append(row)
        evaluated.to_mesh_clear()
    return profiles


def configure_proxy_pass(scene, name):
    for obj in scene.objects:
        if obj.get(TAG):
            if obj.get(PASS) != 'lamp':
                raise RuntimeError('Unsupported transport-proxy pass policy')
            obj.hide_render = name != 'lamp'


def architecture_bvh(scene):
    """Actual evaluated architectural triangles, with explicit hit ownership."""
    vertices, triangles, owners = [], [], []
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in scene.objects:
        if (obj.type != 'MESH' or not obj.get('one_light_static') or obj.get(TAG)
                or obj.name == 'Visitor lantern suspension'):
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        mesh.calc_loop_triangles()
        offset = len(vertices)
        vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        for triangle in mesh.loop_triangles:
            triangles.append(tuple(offset + index for index in triangle.vertices))
            owners.append({'object': obj.name, 'polygon': triangle.polygon_index,
                           'material': mesh.materials[mesh.polygons[triangle.polygon_index].material_index].name})
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True), owners


def upward_support(tree, owners, attachment):
    origin = blender(attachment)
    hit, normal, triangle, distance = tree.ray_cast(origin, Vector((0, 0, 1)), 30.)
    if hit is None or normal.z > -.5:
        raise RuntimeError('No actual downward-facing architectural underside above the suspension')
    return {'pointEngine': engine(hit), 'normalEngine': engine(normal),
            'distanceMetres': float(distance), 'triangle': triangle, **owners[triangle],
            'rayOriginEngine': attachment, 'rayDirectionEngine': [0, 1, 0]}


def certify_body_clearance(tree, objects, minimum=1.2):
    """Lipschitz distance bounds cover whole triangles, with virtual subdivision."""
    minimum_lower = math.inf
    closest = None
    samples = 0

    def visit(points, name, depth=0):
        nonlocal minimum_lower, closest, samples
        center = sum(points, Vector()) / 3
        hit, normal, index, distance = tree.find_nearest(center)
        if hit is None:
            raise RuntimeError('No architecture in body-clearance BVH')
        samples += 1
        radius = max((point - center).length for point in points)
        lower = float(distance - radius)
        if distance < minimum:
            raise RuntimeError(f'Actual lantern body is only {distance:.6f}m from architecture: {name}')
        if lower >= minimum:
            if lower < minimum_lower:
                minimum_lower = lower
                closest = {'proxyObject': name, 'triangleCenterEngine': engine(center),
                           'nearestArchitecturePointEngine': engine(hit),
                           'nearestArchitectureTriangle': index, 'centerDistanceMetres': float(distance),
                           'triangleRadiusMetres': radius}
            return
        if depth >= 6:
            raise RuntimeError('Cannot conservatively certify1.2m whole-triangle body clearance')
        a, b, c = points
        ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        for child in [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]:
            visit(child, name, depth + 1)

    for obj in objects:
        if obj.get('transport_main_suspension'):
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        for triangle in mesh.loop_triangles:
            visit(tuple(points[index] for index in triangle.vertices), obj.name)
    return {'passed': True, 'minimumRequiredMetres': minimum,
            'certifiedWholeTriangleLowerBoundMetres': minimum_lower,
            'closestBound': closest, 'virtualTriangleSamples': samples,
            'method': 'Distance-to-opaque-architecture is1-Lipschitz: actual BVH center distance minus triangle radius bounds every point. Ambiguous triangles subdivide virtually; actual geometry is unchanged.'}


def rgba_mix(nodes, links, a, b):
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.
    for socket, value in [(mix.inputs[6], a), (mix.inputs[7], b)]:
        if isinstance(value, tuple):
            socket.default_value = value
        else:
            links.new(value, socket)
    return mix.outputs[2]


def photo_cloth_material(cloth, fabric_descriptor):
    material = bpy.data.materials.new('Visitor transport nonemissive photographic red gauze')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    uv = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (1.28, .96, 1)
    links.new(uv.outputs['UV'], mapping.inputs[0])
    textures = {}
    for role, data in fabric_descriptor['maps'].items():
        path = ROOT / 'web/public' / data['path'].lstrip('/')
        if sha(path) != data['sha256']:
            raise RuntimeError('Actual photographed fabric map differs: ' + role)
        image = bpy.data.images.load(str(path), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if role == 'weave' else 'Non-Color'
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'REPEAT'
        links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        textures[role] = texture
    luminance = nodes.new('ShaderNodeVectorMath')
    luminance.operation = 'DOT_PRODUCT'
    luminance.inputs[1].default_value = (.2126, .7152, .0722)
    links.new(textures['weave'].outputs['Color'], luminance.inputs[0])
    divide = nodes.new('ShaderNodeMath'); divide.operation = 'DIVIDE'
    divide.inputs[1].default_value = fabric_descriptor['meanLinearLuminance']
    links.new(luminance.outputs['Value'], divide.inputs[0])
    low = nodes.new('ShaderNodeMath'); low.operation = 'MAXIMUM'; low.inputs[1].default_value = .66
    links.new(divide.outputs[0], low.inputs[0])
    high = nodes.new('ShaderNodeMath'); high.operation = 'MINIMUM'; high.inputs[1].default_value = 1.24
    links.new(low.outputs[0], high.inputs[0])
    color = rgba_mix(nodes, links, tuple(cloth['linearRGB']) + (1.,), high.outputs[0])
    normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .38
    links.new(textures['normal'].outputs['Color'], normal.inputs['Color'])
    diffuse = nodes.new('ShaderNodeBsdfDiffuse')
    translucent = nodes.new('ShaderNodeBsdfTranslucent')
    for shader in [diffuse, translucent]:
        links.new(color, shader.inputs['Color'])
        links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    links.new(textures['roughness'].outputs['Color'], diffuse.inputs['Roughness'])
    cloth_mix = nodes.new('ShaderNodeMixShader'); cloth_mix.inputs[0].default_value = .65
    links.new(diffuse.outputs[0], cloth_mix.inputs[1]); links.new(translucent.outputs[0], cloth_mix.inputs[2])
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    transparent.inputs['Color'].default_value = tuple(cloth['shadowTransmissionLinearRGB']) + (1.,)
    light_path = nodes.new('ShaderNodeLightPath')
    shadow_mix = nodes.new('ShaderNodeMixShader')
    links.new(light_path.outputs['Is Shadow Ray'], shadow_mix.inputs[0])
    links.new(cloth_mix.outputs[0], shadow_mix.inputs[1]); links.new(transparent.outputs[0], shadow_mix.inputs[2])
    links.new(shadow_mix.outputs[0], output.inputs['Surface'])
    material['one_light_transport_material'] = POLICY
    material['shadow_throughput_linear'] = cloth['shadowTransmissionLinearRGB']
    return material


def opaque_material(role):
    colors = {'wick': (.006, .005, .004), 'clay-cup': (.045, .024, .012),
              'bamboo-rib': (.075, .035, .014), 'cord': (.065, .042, .022)}
    color = colors.get(role, (.10, .018, .009))
    if role == 'ceiling-hanger-extension':
        srgb = [int('746041'[i:i+2], 16)/255 for i in (0, 2, 4)]
        color = [value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4 for value in srgb]
    material = bpy.data.materials.new('Visitor transport opaque ' + role)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .5 if role == 'ceiling-hanger-extension' else .85
    shader.inputs['Metallic'].default_value = .7 if role == 'ceiling-hanger-extension' else 0
    return material


def actual_runtime_hanger(attachment, support, basis):
    """Use the installed actual THREE constructor, including its indexed caps."""
    script = """import {CylinderGeometry} from './node_modules/three/build/three.module.js';
const g=new CylinderGeometry(1,1,1,8);
process.stdout.write(JSON.stringify({positions:Array.from(g.attributes.position.array),
normals:Array.from(g.attributes.normal.array),uvs:Array.from(g.attributes.uv.array),
indices:Array.from(g.index.array)}));"""
    data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
    unit_sha = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    top = support['pointEngine'][1] + .001
    length = top - attachment[1]
    if length <= 0:
        raise RuntimeError('Actual ceiling hanger has nonpositive length')
    center = (top + attachment[1]) / 2
    for i in range(0, len(data['positions']), 3):
        data['positions'][i] = data['positions'][i]*.0025 + attachment[0]-basis[0]
        data['positions'][i+1] = data['positions'][i+1]*length + center-basis[1]
        data['positions'][i+2] = data['positions'][i+2]*.0025 + attachment[2]-basis[2]
    data.update({'name': 'Actual ceiling hanger extension', 'role': 'ceiling-hanger-extension', 'castShadow': True})
    return data, {'constructor': 'THREE.CylinderGeometry(1,1,1,8)', 'unitGeometrySha256': unit_sha,
        'constructorSourceSha256': sha(ROOT/'node_modules/three/src/geometries/CylinderGeometry.js'),
        'radiusMetres': .0025, 'lengthMetres': length, 'bottomEngine': attachment,
        'topEngine': [attachment[0], top, attachment[2]], 'cssHex': '#746041',
        'metalness': .7, 'roughness': .5, 'topEmbeddingMetres': .001}


def apply_transport(scene, geometry_path, basis, expected_sha256, *, watts=2., radius=.004,
                    minimum_clearance=1.2):
    geometry_path = Path(geometry_path)
    if sha(geometry_path) != expected_sha256:
        raise RuntimeError('Actual runtime indexed-geometry file changed')
    data = json.loads(geometry_path.read_text())
    if any(obj.get(TAG) for obj in scene.objects):
        raise RuntimeError('Do not duplicate an existing transport proxy')
    cloth = data['cloth']
    color = cloth['linearRGB']
    css = cloth['cssHex'].lstrip('#')
    srgb = [int(css[i:i+2], 16)/255 for i in (0, 2, 4)]
    linear = [value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4 for value in srgb]
    if len(css) != 6 or max(abs(a-b) for a, b in zip(linear, color)) > 1e-10:
        raise RuntimeError('Cloth linear RGB differs from its actual selected CSS colour')
    expected_throughput = [.22 * value / max(color) for value in color]
    if max(abs(a-b) for a, b in zip(expected_throughput, cloth['shadowTransmissionLinearRGB'])) > 1e-10:
        raise RuntimeError('Cloth throughput is not the actual normalized selected linear colour')
    if not math.isfinite(watts) or watts <= 0 or radius != .004:
        raise RuntimeError('The picture-selected candle needs positive power and the actual4mm source radius')
    basis = list(map(float, basis))
    attachment = [a+b for a, b in zip(basis, data['suspensionTopRelativeToPoint'])]
    tree, owners = architecture_bvh(scene)
    support = upward_support(tree, owners, attachment)
    extension, extension_metadata = actual_runtime_hanger(attachment, support, basis)
    parts = data['parts'] + [extension]
    collection = bpy.data.collections.new('VISITOR_LANTERN_TRANSPORT_ONLY')
    scene.collection.children.link(collection)
    descriptor_path = ROOT / 'web/src/engine/baked/visitor-fabric.json'
    descriptor = json.loads(descriptor_path.read_text())
    materials = {'gauze': photo_cloth_material(cloth, descriptor)}
    objects = []
    main_cords = []
    import_proofs = []
    for part_index, part in enumerate(parts):
        role = part['role']
        positions, normals, indices = part['positions'], part['normals'], part['indices']
        if (len(positions) % 3 or len(normals) != len(positions) or len(indices) % 3
                or any(not math.isfinite(value) for value in positions + normals)
                or any(not isinstance(index, int) or index < 0 or index >= len(positions)//3 for index in indices)):
            raise RuntimeError('Invalid actual indexed geometry: ' + part['name'])
        points = [positions[i:i+3] for i in range(0, len(positions), 3)]
        directions = [normals[i:i+3] for i in range(0, len(normals), 3)]
        low, high = min(p[1] for p in points), max(p[1] for p in points)
        main = role == 'cord' and abs(high-data['suspensionTopRelativeToPoint'][1]) < 1e-6
        if main:
            main_cords.append(part_index)
        world_engine = [[p[k]+basis[k] for k in range(3)] for p in points]
        world = [blender(point) for point in world_engine]
        mesh = bpy.data.meshes.new('Transport indexed runtime ' + str(part_index))
        mesh.from_pydata(world, [], [indices[i:i+3] for i in range(0, len(indices), 3)])
        normal_attribute = mesh.attributes.new(name='custom_normal', type='FLOAT_VECTOR', domain='CORNER')
        normal_attribute.data.foreach_set('vector', array('f', [component for loop in mesh.loops
            for component in blender(directions[loop.vertex_index]).normalized()]))
        if len(part['uvs']) != len(points)*2:
            raise RuntimeError('Actual part UV count differs')
        uv = mesh.uv_layers.new(name='UVMap')
        uv.data.foreach_set('uv', array('f', [value for loop in mesh.loops
            for value in part['uvs'][loop.vertex_index*2:loop.vertex_index*2+2]]))
        obj = bpy.data.objects.new(part['name'], mesh)
        collection.objects.link(obj)
        obj[TAG] = True; obj[PASS] = 'lamp'; obj['one_light_export_excluded'] = True
        obj['transport_role'] = role; obj['transport_part_index'] = part_index
        obj['transport_main_suspension'] = role == 'ceiling-hanger-extension'
        obj['transport_original_short_cord'] = main
        obj.visible_shadow = True
        material = materials.get(role)
        if material is None:
            material = materials[role] = opaque_material(role)
        mesh.materials.append(material)
        mesh.update()
        maximum_position = max(abs(engine(vertex.co)[k] - expected[k])
                               for vertex, expected in zip(mesh.vertices, world_engine) for k in range(3))
        unit_directions = []
        for direction in directions:
            length = math.sqrt(sum(value*value for value in direction))
            if length < 1e-12:
                unit_directions.append(None)
            else:
                unit_directions.append([value/length for value in direction])
        zero_normal_vertices = {i for i, direction in enumerate(unit_directions) if direction is None}
        degenerate_incident = set()
        for triangle in range(len(indices)//3):
            ids = indices[triangle*3:triangle*3+3]
            if not zero_normal_vertices.intersection(ids):
                continue
            a, b, c = [points[index] for index in ids]
            u, v = [b[k]-a[k] for k in range(3)], [c[k]-a[k] for k in range(3)]
            cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
            if any(value != 0 for value in cross):
                raise RuntimeError('A nondegenerate runtime triangle has an undefined zero normal')
            degenerate_incident.add(triangle)
        maximum_normal = max(abs(engine(mesh.corner_normals[loop.index].vector)[k] -
            unit_directions[loop.vertex_index][k]) for loop in mesh.loops
            if unit_directions[loop.vertex_index] is not None for k in range(3))
        maximum_uv = max(abs(uv.data[loop.index].uv[k] - part['uvs'][loop.vertex_index*2+k])
                         for loop in mesh.loops for k in range(2))
        topology_exact = all(list(face.vertices) == indices[i*3:i*3+3] for i, face in enumerate(mesh.polygons))
        if maximum_position > 1e-6 or maximum_normal > 1e-6 or maximum_uv > 1e-6 or not topology_exact:
            raise RuntimeError('Actual indexed runtime import correspondence failed: ' + part['name'])
        import_proofs.append({'part': part['name'], 'role': role, 'vertices': len(points),
            'triangles': len(indices)//3, 'indexedTopologyExact': topology_exact,
            'maximumPositionComponentErrorMetres': maximum_position,
            'maximumWorldNormalComponentError': maximum_normal, 'maximumUVComponentError': maximum_uv,
            'zeroNormalVerticesOnlyOnExactlyDegenerateTriangles': len(zero_normal_vertices),
            'exactlyDegenerateIncidentTriangles': len(degenerate_incident),
            'originalRuntimeShortCordPreserved': main,
            'actualRuntimeCylinderExtension': role == 'ceiling-hanger-extension'})
        objects.append(obj)
    if len(main_cords) != 1:
        raise RuntimeError('Exactly one actual upper suspension cord is required')
    roles = Counter(part['role'] for part in parts)
    triangle_count = sum(len(part['indices'])//3 for part in parts)
    for role, count in {'gauze': 1, 'top-annulus': 1, 'top-supported-hub': 1,
                        'top-load-bearing-spoke': 4, 'bottom-ring': 1,
                        'cup-bearing-spoke': 3, 'clay-cup': 1, 'wick': 1}.items():
        if roles[role] != count:
            raise RuntimeError('Actual runtime structural-role inventory differs: ' + role)
    clearance = certify_body_clearance(tree, objects, minimum_clearance)
    clearance['closestBound']['architectureOwner'] = owners[clearance['closestBound']['nearestArchitectureTriangle']]
    obsolete = bpy.data.objects.get('Visitor lantern suspension')
    removed = obsolete.name if obsolete else None
    removed_stats = None
    if obsolete:
        obsolete.data.calc_loop_triangles()
        points = [obsolete.matrix_world @ vertex.co for vertex in obsolete.data.vertices]
        area = sum((points[t.vertices[1]]-points[t.vertices[0]]).cross(
            points[t.vertices[2]]-points[t.vertices[0]]).length*.5 for t in obsolete.data.loop_triangles)
        removed_stats = {'object': obsolete.name, 'region': obsolete.get('lightmap_region', obsolete.get('region')),
                         'objects': 1, 'vertices': len(obsolete.data.vertices),
                         'triangles': len(obsolete.data.loop_triangles), 'worldAreaM2': area}
        bpy.data.objects.remove(obsolete, do_unlink=True)
    point = bpy.data.objects['Visitor flame bake basis']
    source_color = list(point.data.color)
    point.location = blender(basis); point.data.energy = watts; point.data.shadow_soft_size = radius
    anchor = bpy.data.objects['Visitor_Lamp_Anchor']; anchor.location = blender(attachment)
    bpy.context.view_layer.update()
    actual_attachment = engine(anchor.matrix_world.translation)
    scene['visitor_lamp_anchor'] = actual_attachment
    lamp_basis = {'position': engine(point.matrix_world.translation), 'watts': float(point.data.energy),
                  'linearColor': source_color, 'pointRadiusMetres': float(point.data.shadow_soft_size),
                  'sourceObject': point.name, 'bodySuspensionTopEngine': actual_attachment,
                  'ceilingAttachmentEngine': support['pointEngine']}
    lamp_basis['transport'] = {'type': 'actual-gauze', 'version': 1,
        'geometrySha256': data['geometrySha256'], 'geometryFileSha256': expected_sha256,
        'clothShadowTransmissionLinearRGB': cloth['shadowTransmissionLinearRGB'],
        'clothCSSHex': cloth['cssHex'], 'formula': 'linearCSS*.22/max(linearCSS)',
        'proposalStatus': 'finite-candle-picture-candidate-not-optically-approved',
        'sourceRuntime': data['source']}
    if scene.get('one_light_camera_pre_exposure'):
        lamp_basis['cameraPreExposure'] = float(scene['one_light_camera_pre_exposure'])
        lamp_basis['transport']['cameraPreExposure'] = lamp_basis['cameraPreExposure']
    if scene.get('one_light_lamp_pass_quantity'):
        lamp_basis['transport']['quantity'] = scene['one_light_lamp_pass_quantity']
    scene['one_light_lamp_basis'] = json.dumps(lamp_basis)
    if scene.get('source_geometry_budget'):
        budget = json.loads(scene['source_geometry_budget'])
        if removed_stats:
            region = budget['regions'][removed_stats['region']]
            for key in ['objects', 'vertices', 'triangles', 'worldAreaM2']:
                region[key] -= removed_stats[key]
            budget['totalObjects'] -= 1; budget['totalTriangles'] -= removed_stats['triangles']
            budget['largestContributors'] = [row for row in budget['largestContributors'] if row['object'] != removed]
        budget['auxiliaryTransport'] = {'objects': len(objects), 'triangles': triangle_count, 'exportExcluded': True}
        scene['source_geometry_budget'] = json.dumps(budget)
    if scene.get('architecture_bounds_engine'):
        bounds = json.loads(scene['architecture_bounds_engine'])
        bounds['visitorLampAttachment'] = actual_attachment
        bounds['visitorFlameBasis'] = lamp_basis['position']
        bounds['visitorLanternCeilingAttachment'] = support['pointEngine']
        values = bounds.get('evaluatedObjects')
        if isinstance(values, dict):
            values.pop(removed, None)
        elif isinstance(values, list):
            bounds['evaluatedObjects'] = [row for row in values if row.get('object', row.get('name')) != removed]
        scene['architecture_bounds_engine'] = json.dumps(bounds)
    profiles = proxy_profiles(scene)
    geometry_digest = hashlib.sha256(json.dumps(profiles, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    main_cord = next(obj for obj in objects if obj.get('transport_main_suspension'))
    cord_points = [engine(main_cord.matrix_world @ vertex.co) for vertex in main_cord.data.vertices]
    actual_cord_top = max(point[1] for point in cord_points)
    compact = {'policy': POLICY, 'sourceGeometryFileSha256': expected_sha256,
               'runtimeGeometrySha256': data['geometrySha256'], 'actualProxyGeometrySha256': geometry_digest,
               'moduleSha256': sha(__file__), 'parts': len(objects), 'triangles': triangle_count,
               'originalRuntimeParts': len(data['parts']), 'originalRuntimeTriangles': data['triangles'],
               'actualRuntimeCeilingExtension': extension_metadata,
               'roleCounts': dict(roles), 'cloth': cloth, 'clothPhotoDescriptorSha256': sha(descriptor_path),
               'basis': lamp_basis, 'suspension': support, 'supportEmbeddingMetres': .001,
               'requestedPointEngine': basis,
               'actualCordTopYEngine': actual_cord_top,
               'actualCordEmbeddingMetres': actual_cord_top - support['pointEngine'][1],
               'runtimeImportProof': {'parts': len(import_proofs),
                   'allIndexedTopologyExact': all(row['indexedTopologyExact'] for row in import_proofs),
                   'maximumPositionComponentErrorMetres': max(row['maximumPositionComponentErrorMetres'] for row in import_proofs),
                   'maximumWorldNormalComponentError': max(row['maximumWorldNormalComponentError'] for row in import_proofs),
                   'maximumUVComponentError': max(row['maximumUVComponentError'] for row in import_proofs),
                   'zeroNormalVerticesOnlyOnExactlyDegenerateTriangles': sum(row['zeroNormalVerticesOnlyOnExactlyDegenerateTriangles'] for row in import_proofs),
                   'exactlyDegenerateIncidentTriangles': sum(row['exactlyDegenerateIncidentTriangles'] for row in import_proofs),
                   'nondegenerateNormalComponentLimit': 1e-6,
                   'perPartProofSha256': hashlib.sha256(json.dumps(import_proofs, sort_keys=True, separators=(',', ':')).encode()).hexdigest()},
               'originalRuntimeSuspensionTopRelativeToPoint': data['suspensionTopRelativeToPoint'],
               'bodyClearance': clearance, 'removedObsoleteStaticSuspension': removed,
               'removedStaticGeometryStats': removed_stats,
               'visibility': {'night': False, 'dusk': False, 'day': False, 'lamp': True,
                              'authoredFullScenePreviewDefault': True},
               'exportExcluded': True, 'emissionNodes': 0}
    scene[META] = json.dumps(compact, separators=(',', ':'))
    fields = json.loads(scene['one_light_anchor_fields'])
    if META not in fields:
        fields.append(META)
    scene['one_light_anchor_fields'] = json.dumps(fields)
    return compact
