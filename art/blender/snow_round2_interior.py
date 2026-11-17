"""Source18 -> Round2 interior layer; no save, render, bake or global RNG use.

Keeps the47 semantic contact IDs. Mesh replacements retain object names so
support ownership, source helpers and diagnostic camera registries still work.
"""
import hashlib
import json
import math
from pathlib import Path
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

from resting_contacts import RestingContacts, engine
from snow_lightmap_charts import source_uv, tube_coordinates

ROOT = Path(__file__).resolve().parents[2]


def _height(registry, x, z, supports):
    tree, _ = registry.support(supports)
    hit, _, _, _ = tree.ray_cast(Vector((x, -z, 50)), Vector((0, 0, -1)), 100)
    if hit is None:
        raise RuntimeError('No evaluated support at the requested bearing')
    return float(hit.z)


def _mesh(obj, vertices, faces, material, chart=None):
    old = obj.data
    mesh = bpy.data.meshes.new(obj.name + ' Round2')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    obj.data = mesh; obj.matrix_world = Matrix.Identity(4)
    mesh.materials.append(material)
    uv = mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        face.use_smooth = True
        axes = [i for i in range(3) if i != max(range(3), key=lambda j: abs(face.normal[j]))]
        for li in face.loop_indices:
            p = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = (p[axes[0]] / .27, p[axes[1]] / .27)
    if chart:
        source_uv(obj, [[chart(face.index, mesh.loops[li].vertex_index) for li in face.loop_indices]
                        for face in mesh.polygons], 'Round2 connected physical-scale prop charts')
    else:
        source_uv(obj, [[tuple(uv.data[li].uv) for li in face.loop_indices] for face in mesh.polygons],
                  'Round2 physical-scale prop charts')
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def _tube(points, radii, radial=8, closed=False):
    points = [Vector(p) for p in points]
    vertices, faces, previous = [], [], None
    for j, point in enumerate(points):
        tangent = (points[(j + 1) % len(points)] - points[(j - 1) % len(points)] if closed
                   else points[min(j + 1, len(points) - 1)] - points[max(0, j - 1)]).normalized()
        reference = Vector((0, 1, 0)) if abs(tangent.y) < .95 else Vector((1, 0, 0))
        across = tangent.cross(reference).normalized() if previous is None else previous - tangent * previous.dot(tangent)
        if across.length < 1e-6:
            across = tangent.cross(reference)
        across.normalize(); previous = across
        other = tangent.cross(across).normalized()
        for k in range(radial):
            angle = k / radial * math.tau
            vertices.append(tuple(point + radii[j] * (across * math.cos(angle) + other * math.sin(angle))))
    for j in range(len(points) if closed else len(points) - 1):
        for k in range(radial):
            a = j * radial + k; b = j * radial + (k + 1) % radial
            c = ((j + 1) % len(points)) * radial + (k + 1) % radial
            d = ((j + 1) % len(points)) * radial + k
            faces.append((a, b, c, d))
    if not closed:
        faces.extend([tuple(reversed(range(radial))), tuple((len(points) - 1) * radial + k for k in range(radial))])
    return vertices, faces


def _replace_tube(obj, points, radii, material, radial=8, closed=False):
    vertices, faces = _tube(points, radii, radial, closed)
    coordinates = tube_coordinates([(p[0], p[2], -p[1]) for p in points], radii, radial, closed)
    _mesh(obj, vertices, faces, material)
    # Recaculated winding may reverse a face; key each analytical UV by vertex.
    lookup = [{vi: uv for vi, uv in zip(face, coords)} for face, coords in zip(faces, coordinates)]
    source_uv(obj, [[lookup[face.index][obj.data.loops[li].vertex_index] for li in face.loop_indices]
                    for face in obj.data.polygons], 'Continuous transported tube body/caps; physical-scale')
    return obj


def _material(name, rgb, roughness=.9, photo=None):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear(); output = nodes.new('ShaderNodeOutputMaterial'); shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = tuple(rgb) + (1,)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Specular IOR Level'].default_value = .18
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    if photo:
        texture = nodes.new('ShaderNodeTexImage'); texture.image = photo
        uv = nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        mix = nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1; mix.inputs[7].default_value = tuple(rgb) + (1,)
        links.new(texture.outputs['Color'], mix.inputs[6]); links.new(mix.outputs[2], shader.inputs['Base Color'])
    material['one_light_basecolor_linear'] = list(rgb) + [1]
    material['one_light_export_basecolor_factor'] = list(rgb) + [1]
    return material


def _linen_photo():
    spec = json.loads((ROOT / 'web/src/engine/baked/visitor-fabric.json').read_text())
    source = ROOT / 'web/public' / spec['maps']['weave']['path'].lstrip('/')
    if hashlib.sha256(source.read_bytes()).hexdigest() != spec['maps']['weave']['sha256']:
        raise RuntimeError('Licensed linen source changed')
    folder = ROOT / 'art/build/snow-roof-round2/materials'; folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'cushion-rough-linen-128.png'
    if not path.exists():
        image = bpy.data.images.load(str(source), check_existing=True).copy()
        image.scale(128, 128); image.file_format = 'PNG'; image.filepath_raw = str(path); image.save()
        bpy.data.images.remove(image)
    image = bpy.data.images.load(str(path), check_existing=True); image.colorspace_settings.name = 'sRGB'
    return image, spec


def _settle(registry, entry):
    registry.support_cache.clear()
    members = [bpy.data.objects[name] for name in entry['members']]
    supports = [bpy.data.objects[name] for name in entry['supports']]
    measured = registry.measure(members, supports)
    bearing = measured['contact']['pointEngine']
    surface = _height(registry, bearing[0], bearing[2], supports)
    delta = max(surface - bearing[1] + .00025,
                -registry.PENETRATION_LIMIT - measured['worstPenetrationContact']['gapMetres'] + .00025)
    registry.shift(members, delta)
    entry['round2CorrectionEngine'] = [0, delta, 0]
    registry.support_cache.clear()


def _remove(registry, obj):
    for entry in registry.entries:
        entry['members'] = [name for name in entry['members'] if name != obj.name]
        if obj.name in entry['supports']:
            raise RuntimeError('Do not remove a registered support')
    bpy.data.objects.remove(obj, do_unlink=True)


def apply_pool(scene):
    point = next(obj for obj in scene.objects if obj.type == 'LIGHT' and obj.get('bake_role') == 'lamp')
    point.data.energy = .8; point.data.shadow_soft_size = .03
    basis = json.loads(scene['one_light_lamp_basis'])
    basis.update(watts=float(point.data.energy), pointRadiusMetres=float(point.data.shadow_soft_size))
    scene['one_light_lamp_basis'] = json.dumps(basis)
    transport = json.loads(scene['one_light_gauze_transport']); transport['basis'] = basis
    scene['one_light_gauze_transport'] = json.dumps(transport)
    names = ['Dark hall paving 0 hall-only albedo', 'Dark hall paving 1 hall-only albedo',
             'Dark hall paving 2 hall-only albedo', 'Walk-polished worn dark stone']
    for name in names:
        material = bpy.data.materials[name]; shader = material.node_tree.nodes.get('Principled BSDF')
        mix = shader.inputs['Base Color'].links[0].from_node
        color = mix.inputs[7]; rgb = [value * 1.8 for value in list(color.default_value)[:3]]
        color.default_value = rgb + [1]
        material['one_light_basecolor_linear'] = rgb + [1]; material['one_light_export_basecolor_factor'] = rgb + [1]
        next(node for node in material.node_tree.nodes if node.type == 'NORMAL_MAP').inputs['Strength'].default_value = 0
    return {'watts': .8, 'radiusMetres': .03, 'floorAlbedoGainFromSource18': 1.8, 'floorNormalStrength': 0,
            'clothWeightsAndExposureUnchanged': True}


def apply(scene):
    if scene.get('one_light_round2_interior'):
        raise RuntimeError('Round2 layer must be applied once to frozen Source18')
    registry = RestingContacts.from_scene(); ids = [entry['name'] for entry in registry.entries]
    report = {'pool': apply_pool(scene), 'handles': [], 'cushions': [], 'newImages': []}
    entries = {entry['name']: entry for entry in registry.entries}
    body = bpy.data.objects['Brass incense burner with rolled lip']
    points = [p for _, _, p in registry.vertices([body])]
    cx = (min(p.x for p in points) + max(p.x for p in points)) / 2
    cy = (min(p.y for p in points) + max(p.y for p in points)) / 2
    origin = max(p.z for p in points) - .298
    handles = sorted([bpy.data.objects[name] for name in entries['altar burner assembly']['members']
                      if name.startswith('Brass burner raised ring handle')], key=lambda obj: obj.name)
    for obj, side in zip(handles, [-1, 1]):
        path = []
        for j in range(21):
            t = j / 20
            x = .182 * (1 - t) + .157 * t + .116 * math.sin(math.pi * t)
            z = .270 * (1 - t) + .156 * t
            path.append((cx + side * x, cy, origin + z))
        _replace_tube(obj, path, [.013 + .005 * abs(2 * j / 20 - 1) ** 4 for j in range(21)], obj.data.materials[0])
        report['handles'].append({'object': obj.name, 'continuousFrames': True, 'endsEmbeddedInBowlWall': True})
    ash = bpy.data.objects[entries['burner ash']['members'][0]]
    ash_material = _material('Round2 soft grey incense ash', (.30, .285, .26), 1)
    vertices = [(cx, cy, origin + .246)]; rings = 5; segments = 32
    for row in range(1, rings + 1):
        r = .145 * row / rings
        for col in range(segments):
            a = col / segments * math.tau
            h = origin + .236 + .010 * (1 - (r / .145) ** 2) + .0018 * math.sin(a * 5 + row * .8) + .0011 * math.cos(a * 11 - row)
            vertices.append((cx + r * math.cos(a), cy + r * math.sin(a), h))
    faces = [(0, 1 + col, 1 + (col + 1) % segments) for col in range(segments)]
    for row in range(rings - 1):
        for col in range(segments):
            a = 1 + row * segments + col; b = 1 + row * segments + (col + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    bottom = len(vertices)
    for x, y, z in vertices.copy():
        vertices.append((x, y, _height(registry, x, -y, [body]) + .0003))
    for face in faces.copy(): faces.append(tuple(reversed([i + bottom for i in face])))
    edge = [1 + (rings - 1) * segments + col for col in range(segments)]
    for a, b in zip(edge, edge[1:] + edge[:1]): faces.append((a, a + bottom, b + bottom, b))
    top_faces = segments * rings
    def ash_chart(face, vi):
        p = vertices[vi]
        if face < top_faces * 2:
            return (p[0] - cx + (.35 if face >= top_faces else 0), p[1] - cy)
        column = (vi % bottom - edge[0]) % segments
        if face - top_faces * 2 == segments - 1 and column == 0: column = segments
        return (.75 + column / segments * math.tau * .145, .045 if vi < bottom else 0)
    _mesh(ash, vertices, faces, ash_material, ash_chart)
    _settle(registry, entries['burner ash'])
    report['ash'] = {'object': ash.name, 'closedShallowUnevenMound': True, 'topNormalsOutward': True}
    # Actual shorter, spent pieces stay in their original semantic IDs.
    for i in range(9):
        entry = entries['charred incense ' + str(i)]; obj = bpy.data.objects[entry['members'][0]]
        p = sum((p for _, _, p in registry.vertices([obj])), Vector()) / len(obj.data.vertices)
        a = i * 2.39; length = .006 + (i % 4) * .003
        base = _height(registry, p.x, -p.y, [ash]) + .0015
        _replace_tube(obj, [(p.x, p.y, base), (p.x + math.cos(a) * length, p.y + math.sin(a) * length, base + .001)], [.0014, .001], obj.data.materials[0], 6)
        _settle(registry, entry)
    lengths = [.168, .237, .272, .202]; leans = [( .011, -.005), (-.008, .014), (.018, .008), (-.013, -.009)]
    for i in range(4):
        entry = entries['smouldering incense ' + str(i)]; obj = bpy.data.objects[entry['members'][0]]
        old = [p for _, _, p in registry.vertices([obj])]; low = min(p.z for p in old)
        base_points = [p for p in old if p.z < low + .003]; start = sum(base_points, Vector()) / len(base_points)
        start.z = _height(registry, start.x, -start.y, [ash]) + .0003
        tip = start + Vector((leans[i][0], leans[i][1], lengths[i]))
        _replace_tube(obj, [tuple(start), tuple(tip)], [.00165, .00135], obj.data.materials[0], 6)
        _settle(registry, entry)
    linen, spec = _linen_photo()
    cloth = _material('Round2 compressed photo linen cushion', (.48, .35, .20), .98, linen)
    cloth['source_asset'] = spec['sourceAsset']; cloth['source_license'] = spec['license']
    cloth['source_provenance'] = spec['provenance']; cloth['photo_derivative'] = '128px from actual licensed visitor linen weave; no new photographic source'
    seam_material = _material('Round2 sewn cushion seam', (.075, .052, .029), .99)
    report['newImages'].append({'file': linen.filepath, 'width': 128, 'height': 128, 'source': spec['sourceAsset']})
    for side in [-1, 1]:
        entry = entries['kneeling cushion ' + str(side)]
        obj = next(bpy.data.objects[name] for name in entry['members'] if name.startswith('Soft sewn kneeling cushion'))
        old = [p for _, _, p in registry.vertices([obj])]
        x0 = (min(p.x for p in old) + max(p.x for p in old)) / 2; y0 = (min(p.y for p in old) + max(p.y for p in old)) / 2
        supports = [bpy.data.objects[name] for name in entry['supports']]
        nx, ny = 20, 14; w, d = .62, .46; vertices = []; thickness = []
        center_height = _height(registry, x0, -y0, supports)
        for j in range(ny + 1):
            v = j / ny * 2 - 1
            for i in range(nx + 1):
                u = i / nx * 2 - 1
                x = x0 + .5 * w * u * (1 - .13 * abs(v) ** 8)
                y = y0 + .5 * d * v * (1 - .13 * abs(u) ** 8)
                try: z = _height(registry, x, -y, supports)
                except RuntimeError: z = center_height  # Cloth bridges a real mortar gap; placement still uses an actual bearing ray.
                q = max(abs(u), abs(v))
                h = .024 + .078 * max(0, 1 - q ** 6) ** .60 - .018 * math.exp(-((u + .12) / .45) ** 2 - ((v - .10) / .48) ** 2)
                h += .0022 * math.sin(21 * u + side) * math.exp(-((1 - abs(v)) / .18) ** 2)
                vertices.append((x, y, z + .0003)); thickness.append(max(.022, h))
        count = len(vertices); vertices.extend((x, y, z + h) for (x, y, z), h in zip(vertices.copy(), thickness))
        faces = []
        for j in range(ny):
            for i in range(nx):
                a = j * (nx + 1) + i; quad = (a, a + 1, a + nx + 2, a + nx + 1)
                faces.extend([tuple(reversed(quad)), tuple(k + count for k in quad)])
        boundary = list(range(nx + 1)) + [j * (nx + 1) + nx for j in range(1, ny + 1)] + [ny * (nx + 1) + i for i in range(nx - 1, -1, -1)] + [j * (nx + 1) for j in range(ny - 1, 0, -1)]
        rings_ids = [boundary]; seam_path = []
        for t in [.32, .72]:
            ids_ring = []
            for k in boundary:
                x, y, z = vertices[k]; direction = Vector((x - x0, y - y0, 0)).normalized()
                p = Vector((x, y, z + thickness[k] * t)) + direction * .0045
                ids_ring.append(len(vertices)); vertices.append(tuple(p))
                if t == .32: seam_path.append(tuple(p + direction * .0008))
            rings_ids.append(ids_ring)
        rings_ids.append([k + count for k in boundary])
        for lower, upper in zip(rings_ids, rings_ids[1:]):
            for i in range(len(boundary)):
                j = (i + 1) % len(boundary); faces.append((lower[i], lower[j], upper[j], upper[i]))
        boundary_columns = {vi: i for i, vi in enumerate(boundary)}
        def cushion_chart(face, vi):
            p = vertices[vi]
            if face < nx * ny * 2:
                return (p[0] - x0 + (w + .05 if face % 2 else 0), p[1] - y0)
            if vi < count: column, level = boundary_columns[vi], 0
            elif vi < count * 2: column, level = boundary_columns[vi - count], 3
            else: level, column = divmod(vi - count * 2, len(boundary)); level += 1
            if (face - nx * ny * 2) % len(boundary) == len(boundary) - 1 and column == 0: column = len(boundary)
            return (2 * (w + .05) + column / len(boundary) * 2 * (w + d), [0, .0077, .0173, .024][level])
        _mesh(obj, vertices, faces, cloth, cushion_chart)
        piping = sorted([bpy.data.objects[name] for name in entry['members'] if name.startswith('Cushion sewn edge piping')], key=lambda value: value.name)
        seam = piping[0]
        _replace_tube(seam, seam_path, [.0015] * len(seam_path), seam_material, 4, True)
        for excess in piping[1:]: _remove(registry, excess)
        _settle(registry, entry)
        report['cushions'].append({'object': obj.name, 'compressedCentreAndGatheredSides': True, 'continuousSeam': seam.name})
    ceramic = _material('Round2 worn warm-grey ceramic bowls', (.27, .255, .215), .72)
    for i in range(3):
        for name in entries['stacked bowl ' + str(i)]['members']:
            obj = bpy.data.objects[name]
            if obj.type == 'MESH': obj.data.materials.clear(); obj.data.materials.append(ceramic)
    wood_photo = bpy.data.images.load(str(ROOT / 'web/public/materials/scans/weathered_planks/diffuse.jpg'), check_existing=True)
    wood_photo.colorspace_settings.name = 'sRGB'
    bamboo = _material('Round2 broom worn honey bamboo', (.72, .53, .28), .89, wood_photo)
    straw = _material('Round2 naturally pale broom straw', (.48, .34, .16), .98)
    for name in entries['leaning broom']['members']:
        obj = bpy.data.objects[name]
        if obj.type == 'MESH':
            obj.data.materials.clear(); obj.data.materials.append(bamboo if name.startswith('Broom handle') else straw)
    registry.support_cache.clear()
    audit = registry.audit(fail=True)
    if [entry['name'] for entry in registry.entries] != ids or len(ids) != 47:
        raise RuntimeError('Round2 must preserve every semantic contact ID')
    tips = json.loads(scene['static_incense_tips_engine'])
    for row in tips:
        points = [p for _, _, p in registry.vertices([bpy.data.objects[row['object']]])]
        high = max(p.z for p in points); crown = [p for p in points if abs(p.z - high) < 1e-6]
        row['tipEngine'] = engine(sum(crown, Vector()) / len(crown))
    scene['static_incense_tips_engine'] = json.dumps(tips)
    smoke = sum((Vector(row['tipEngine']) for row in tips), Vector()) / len(tips); smoke.y += .006
    scene['static_incense_smoke_engine'] = json.dumps(list(smoke))
    scene['static_incense_smoke_source'] = json.dumps({'method': 'Actual evaluated varied incense crowns +6mmY', 'objects': [row['object'] for row in tips]})
    if scene.get('static_incense_smoke_config'):
        config = json.loads(scene['static_incense_smoke_config'])
        config.update(anchor=list(smoke), sourceObjects=[row['object'] for row in tips])
        scene['static_incense_smoke_config'] = json.dumps(config)
    report.update({'contactGroups': 47, 'allLiteralContactsPassed': audit['passed'], 'incenseTips': tips,
                   'smokeEngine': list(smoke), 'noExtraLights': True, 'sourceSaved': False})
    scene['one_light_round2_interior'] = json.dumps(report)
    return report
