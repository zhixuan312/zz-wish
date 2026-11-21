"""Export two rooted, live-PBR Poly Haven LOD2 pines for desktop Pine Gate.

The delivery is pine-native-trees.glb plus its provenance JSON. The node
and mesh names are PineRidgeNative and PineYoungNative. Both have an
identity node transform and a measured, unscaled root at their local origin.
"""

from argparse import ArgumentParser
from array import array
from hashlib import sha256
import json
import math
from pathlib import Path
from statistics import median
import struct
import subprocess
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pine_native_crowns import (
    ASSET, MATERIAL_PREFIXES, TREE_OBJECT, UV_ATTRIBUTE, digest, loader_hash, material_mapping,
    texture_evidence, verify_source,
)

MESHES = {
    'PineRidgeNative': (f'{ASSET}_b_LOD2', 82466, (8794, 93669, 2387)),
    'PineYoungNative': (f'{ASSET}_c_LOD2', 66254, (6756, 75083, 2387)),
}
ROLES = (f'{ASSET}_bark', f'{ASSET}_twig', f'{ASSET}_dead_branches')
OUTPUT_MATERIALS = dict(zip(ROLES, ('PineNativeBark', 'PineNativeNeedles', 'PineNativeDeadwood')))
FOLIAGE_TINT = (.27, .48, .34, 1.)
ALPHA_CUTOFF = .5
GLB_NAME = 'pine-native-trees.glb'
RECEIPT_NAME = 'pine-native-trees.json'

# Preserve prepared POSITION arrays exactly. In particular, mesh quantization
# must not move the served node's local origin into a scale/translation.
MESHOPT = """
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [modules, input, output, tintJson, toktxPath, ktxScratch] = process.argv.slice(1);
const dependency = async name => {
    const base = join(modules, 'node_modules', name);
    const info = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
    return import(pathToFileURL(join(base, info.module ?? info.main)).href);
};
const [{ NodeIO }, { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu }, { reorder, quantize },
    { MeshoptDecoder, MeshoptEncoder }] = await Promise.all([
    dependency('@gltf-transform/core'), dependency('@gltf-transform/extensions'),
    dependency('@gltf-transform/functions'), dependency('meshoptimizer'),
]);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(input);
const positions = scene => scene.getRoot().listMeshes().flatMap(mesh =>
    mesh.listPrimitives().map(primitive => {
        const a = primitive.getAttribute('POSITION');
        const xyz = a.getArray();
        if (!(xyz instanceof Float32Array) || a.getNormalized()) throw Error('Expected float32 positions.');
        return createHash('sha256').update(Buffer.from(xyz.buffer, xyz.byteOffset, xyz.byteLength)).digest('hex');
    }));
const needles = doc.getRoot().listMaterials().filter(material => material.getName() === 'PineNativeNeedles');
if (needles.length !== 1) throw Error('Expected one shared native needle material.');
needles[0].setBaseColorFactor(JSON.parse(tintJson));
await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
const before = JSON.stringify(positions(doc));
const ownership = scene => JSON.stringify(scene.getRoot().listNodes().map(node => [node.getName(), node.getMatrix()]));
const roots = ownership(doc);
await doc.transform(quantize({
    pattern: /^(NORMAL|TANGENT|TEXCOORD)(_[0-9]+)?$/,
    quantizeNormal: 12, quantizeTexcoord: 16,
}));
if (JSON.stringify(positions(doc)) !== before || ownership(doc) !== roots)
    throw Error('Non-position quantization moved a tree.');
doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
// Textures travel as KTX2 rather than PNG: the PNG set dominated the payload, and a phone must load
// this model in the walk tier. Normals go to UASTC, everything else to ETC1S; the needle colour keeps
// its alpha, which the foliage cutout needs.
const { spawnSync } = await import('node:child_process');
const { existsSync } = await import('node:fs');
// The transfer function follows the role the texture has in the material, not its filename. Only a
// colour texture is sRGB: three.js decodes anything the DFD marks sRGB, so marking a normal or a
// roughness map sRGB would bend the normals and darken the roughness.
const colourTextures = new Set();
const nonColourTextures = new Set();
for (const material of doc.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    if (base) colourTextures.add(base);
    const emissive = material.getEmissiveTexture();
    if (emissive) colourTextures.add(emissive);
    for (const slot of [material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture()]) {
        if (slot) nonColourTextures.add(slot);
    }
}
for (const texture of doc.getRoot().listTextures()) {
    if (!texture.getMimeType().includes('png')) continue;
    const name = texture.getName() ?? '';
    const source = join(ktxScratch, 'in.png'), target = join(ktxScratch, 'out.ktx2');
    await writeFile(source, texture.getImage());
    if (existsSync(target)) await (await import('node:fs/promises')).rm(target);
    const normal = /nor_gl/.test(name);
    const srgb = colourTextures.has(texture) && !nonColourTextures.has(texture);
    // The source PNGs carry an ICC profile, which toktx refuses, so the transfer curve is stated
    // explicitly instead of being read from the file.
    const oetf = srgb ? 'srgb' : 'linear';
    const args = normal
        ? ['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--assign_oetf', oetf, target, source]
        : ['--t2', '--encode', 'etc1s', '--clevel', '4', '--qlevel', '255', '--assign_oetf', oetf, target, source];
    const run = spawnSync(toktxPath, args, { encoding: 'utf8' });
    if (!existsSync(target)) {
        throw Error('toktx produced no texture for ' + name + ': ' + String(run.stderr).slice(0, 400));
    }
    texture.setImage(await readFile(target)).setMimeType('image/ktx2');
}
// KTX2 images reach three.js only through KHR_texture_basisu: GLTFLoader routes an image to its
// KTX2Loader solely when the texture declares this extension. Without it the loader hands the
// image/ktx2 bytes to the plain ImageLoader, every texture rejects, and the material falls back to
// its base colour factor: white bark and a flat green card for the foliage.
// The extension writes the per-texture declaration itself: on write it moves each KTX2 texture's
// source into extensions.KHR_texture_basisu. Registering it required is the whole change.
doc.createExtension(KHRTextureBasisu).setRequired(true);
const bytes = await io.writeBinary(doc);
const replay = await io.readBinary(bytes);
if (JSON.stringify(positions(replay)) !== before || ownership(replay) !== roots)
    throw Error('Meshopt roundtrip changed rooted positions.');
if (replay.getRoot().listTextures().some(texture => !texture.getMimeType().includes('ktx2')))
    throw Error('Every native texture must be KTX2.');
if (!replay.getRoot().listExtensionsUsed().some(extension => extension.extensionName === 'KHR_texture_basisu'))
    throw Error('KTX2 textures must declare KHR_texture_basisu or three.js cannot decode them.');
await writeFile(output, bytes);
"""


def source_objects(path):
    import bpy

    names = tuple(spec[0] for spec in MESHES.values())
    with bpy.data.libraries.load(str(path), link=False) as (catalog, result):
        if not set(names).issubset(catalog.objects):
            raise ValueError('The verified Poly Haven file lacks the B/C LOD2 variants.')
        result.objects = list(names)
    objects = {tree.name: tree for tree in result.objects if tree is not None}
    actual = {obj.name for obj in bpy.data.objects if TREE_OBJECT.fullmatch(obj.name)}
    if set(objects) != set(names) or actual != set(names):
        raise ValueError(f'Expected only native B/C LOD2 objects, found {sorted(actual)}')
    return objects


def uv_coordinates(mesh, slots):
    from mathutils import Euler, Matrix, Vector

    native = mesh.attributes.get(UV_ATTRIBUTE)
    corner_count = len(mesh.loops)
    if (native is None or native.data_type != 'FLOAT_VECTOR' or native.domain != 'CORNER'
            or len(native.data) != corner_count):
        raise ValueError('The native tree lost its official corner UV vectors.')
    raw = array('f', [0.]) * (corner_count * 3)
    native.data.foreach_get('vector', raw)
    mapped = array('f', [0.]) * (corner_count * 2)
    transforms = {index: material_mapping(material) for index, material in slots.items()}
    matrices = {}
    for index, transform in transforms.items():
        if transform['vectorType'] != 'POINT':
            raise ValueError('The pinned native material requires a point coordinate transform.')
        matrices[index] = (Matrix.Translation(Vector(transform['location']))
                           @ Euler(transform['rotation'], 'XYZ').to_matrix().to_4x4()
                           @ Matrix.Diagonal((*transform['scale'], 1.)))
    for polygon in mesh.polygons:
        matrix = matrices[polygon.material_index]
        for corner in polygon.loop_indices:
            offset = corner * 3
            uv = matrix @ Vector((raw[offset], raw[offset + 1], raw[offset + 2]))
            if not math.isfinite(uv.x) or not math.isfinite(uv.y):
                raise ValueError('The native coordinate transform returned a nonfinite value.')
            mapped[corner * 2], mapped[corner * 2 + 1] = uv.x, uv.y
    layer = mesh.uv_layers.new(name='MaterialUV', do_init=False)
    layer.uv.foreach_set('vector', mapped)
    layer.active_render = True
    mesh.uv_layers.active_index = len(mesh.uv_layers) - 1
    return {'sourceName': UV_ATTRIBUTE, 'sourceDataType': 'FLOAT_VECTOR', 'sourceDomain': 'CORNER',
            'targetName': layer.name, 'targetDataType': 'FLOAT2', 'corners': corner_count,
            'materialTransforms': {slots[slot].name: transform for slot, transform in transforms.items()}}


def prepare_mesh(source, name, scene, materials):
    import bmesh
    import bpy
    from mathutils import Matrix, Vector

    source_name, vertex_count, expected_triangles = MESHES[name]
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(graph)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=graph)
    world = evaluated.matrix_world.copy()
    names = {i: material.name for i, material in enumerate(mesh.materials) if material}
    used = {face.material_index for face in mesh.polygons}
    if source.name != source_name or not used <= names.keys() or {names[i] for i in used} != set(ROLES):
        raise ValueError(f'{source.name} lost a verified source material.')
    slots = {i: mesh.materials[i] for i in used}
    counts = dict.fromkeys(ROLES, 0)
    roots = set()
    for polygon in mesh.polygons:
        name_at_face = names[polygon.material_index]
        counts[name_at_face] += len(polygon.vertices) - 2
        if name_at_face == ROLES[0]:
            roots.update(polygon.vertices)
    if len(mesh.vertices) != vertex_count or tuple(counts[role] for role in ROLES) != expected_triangles:
        raise ValueError(f'{source_name} differs from the verified LOD2 topology: {len(mesh.vertices)}, {counts}')
    if world.to_3x3().determinant() <= 0.:
        raise ValueError('Unexpected reflected native pine transform.')

    bark = [world @ mesh.vertices[i].co for i in roots]
    bottom = min(v.z for v in bark)
    footprint = [v for v in bark if v.z <= bottom + .025]
    mount = Vector((median(v.x for v in footprint), median(v.y for v in footprint), bottom))
    mesh.transform(Matrix.Translation(-mount) @ world)
    mesh.update()
    if abs(min(mesh.vertices[i].co.z for i in roots)) > 1e-5:
        raise ValueError('The prepared mesh lost its original bark contact plane.')
    height = max(v.co.z for v in mesh.vertices)
    if height <= 0.:
        raise ValueError('Invalid rooted native tree height.')
    uv = uv_coordinates(mesh, slots)
    material_indices = {role: i for i, role in enumerate(ROLES)}
    face_indices = array('i', (material_indices[names[face.material_index]] for face in mesh.polygons))
    mesh.materials.clear()
    for role in ROLES:
        mesh.materials.append(materials[role])
    mesh.polygons.foreach_set('material_index', face_indices)

    # The scanned assets include deadwood below the standing trunk's root. Cut
    # those buried portions at the root plane before mounting on the ridge.
    crop = bmesh.new()
    try:
        crop.from_mesh(mesh)
        bmesh.ops.bisect_plane(crop, geom=[*crop.verts, *crop.edges, *crop.faces], dist=.000001,
                              plane_co=(0., 0., 0.), plane_no=(0., 0., 1.), clear_inner=True)
        crop.to_mesh(mesh)
    finally:
        crop.free()
    mesh.update()
    clipped_counts = dict.fromkeys(ROLES, 0)
    for polygon in mesh.polygons:
        clipped_counts[ROLES[polygon.material_index]] += len(polygon.vertices) - 2
    if any(clipped_counts[role] != counts[role] for role in ROLES[:2]) or clipped_counts[ROLES[2]] >= counts[ROLES[2]]:
        raise ValueError('Root cut must preserve the bark and foliage and remove buried deadwood.')

    mesh.name = name
    tree = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(tree)
    tree['native_source'] = source_name
    tree['native_height_metres'] = height
    tree['root_local_metres'] = [0., 0., 0.]
    return tree, {'sourceObject': source_name, 'sourceVertices': vertex_count, 'sourceTriangles': counts,
                  'rootClippedTriangles': clipped_counts,
                  'sourceObjectMatrixBlender': [list(row) for row in world],
                  'sourceMountBlenderMetres': list(mount), 'localRootMetres': [0., 0., 0.],
                  'heightMetres': height, 'stem': 'complete', 'uv': uv}


def pbr_materials(path, size):
    import bpy

    images = {}
    evidence = {}
    for prefix in sorted(set(MATERIAL_PREFIXES.values())):
        kinds = ('diff', 'rough', 'nor_gl', 'alpha') if prefix == 'twig' else ('diff', 'rough', 'nor_gl')
        for kind in kinds:
            key = f'{prefix}_{kind}'
            official = texture_evidence(key)
            source = path.parent / 'textures' / official['file']
            image = bpy.data.images.load(str(source), check_existing=False)
            image.colorspace_settings.name = 'sRGB' if kind == 'diff' else 'Non-Color'
            image.alpha_mode = 'NONE'
            original = list(image.size)
            if original != [1024, 1024] or not len(image.pixels):
                raise ValueError('Official source texture is unavailable: ' + source.name)
            if size != original[0]:
                image.scale(size, size)
            image.name = f'{ASSET}_{key}_{size}'
            image.pack()
            images[key] = image
            evidence[key] = {**official, 'sourceDimensions': original, 'preparedDimensions': list(image.size),
                             'colorSpace': image.colorspace_settings.name}
    materials = {}
    for role, prefix in MATERIAL_PREFIXES.items():
        foliage = prefix == 'twig'
        material = bpy.data.materials.new(OUTPUT_MATERIALS[role])
        material.use_nodes = True
        material.use_backface_culling = not foliage
        nodes, links = material.node_tree.nodes, material.node_tree.links
        principled = nodes.get('Principled BSDF')
        principled.inputs['Metallic'].default_value = 0.
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'MaterialUV'

        def texture(kind):
            node = nodes.new('ShaderNodeTexImage')
            node.image = images[f'{prefix}_{kind}']
            links.new(uv.outputs['UV'], node.inputs['Vector'])
            return node

        links.new(texture('diff').outputs['Color'], principled.inputs['Base Color'])
        roughness = nodes.new('ShaderNodeSeparateColor')
        roughness.mode = 'RGB'
        links.new(texture('rough').outputs['Color'], roughness.inputs['Color'])
        links.new(roughness.outputs['Green'], principled.inputs['Roughness'])
        normal = nodes.new('ShaderNodeNormalMap')
        normal.space = 'TANGENT'
        normal.uv_map = uv.uv_map
        links.new(texture('nor_gl').outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], principled.inputs['Normal'])
        if foliage:
            cut = nodes.new('ShaderNodeMath')
            cut.operation = 'ROUND'
            links.new(texture('alpha').outputs['Color'], cut.inputs[0])
            links.new(cut.outputs[0], principled.inputs['Alpha'])
        materials[role] = material
    return materials, evidence


def glb_json(path):
    with path.open('rb') as stream:
        magic, version, total = struct.unpack('<4sII', stream.read(12))
        length, kind = struct.unpack('<I4s', stream.read(8))
        if magic != b'glTF' or version != 2 or total != path.stat().st_size or kind != b'JSON':
            raise ValueError('Export is not a verifiable GLB.')
        return json.loads(stream.read(length))


def verify_glb(path, prepared):
    data = glb_json(path)
    if 'EXT_meshopt_compression' not in data.get('extensionsRequired', []):
        raise ValueError('Native delivery requires Meshopt compression.')
    # three.js reaches a KTX2 image only through this extension: GLTFLoader picks its KTX2Loader by
    # the texture's declared extension, never by the image mime type. A KTX2 texture without it loads
    # as a plain image, fails, and the material silently falls back to its base colour factor.
    if 'KHR_texture_basisu' not in data.get('extensionsRequired', []):
        raise ValueError('Native delivery requires KHR_texture_basisu for its KTX2 textures.')
    def image_of(texture_index):
        # KHR_texture_basisu moves the image index into the texture's extension; a fallback texture keeps
        # a plain source. Both shapes name the same image, so resolve either.
        texture = data['textures'][texture_index]
        declared = (texture.get('extensions') or {}).get('KHR_texture_basisu')
        return data['images'][(declared or texture)['source']]

    for texture in data.get('textures', []):
        # With the extension written, the image index lives inside the declaration, not on the texture.
        declared = (texture.get('extensions') or {}).get('KHR_texture_basisu')
        if not declared:
            raise ValueError('Every native KTX2 texture must declare KHR_texture_basisu.')
        if 'source' in texture:
            raise ValueError('A KHR_texture_basisu texture must not keep a plain source index.')
        image = data['images'][declared['source']]
        if image.get('mimeType') != 'image/ktx2':
            raise ValueError('KHR_texture_basisu is declared on a texture that is not KTX2.')
    scene = data['scenes'][data['scene']]
    if len(data['meshes']) != len(MESHES) or len(data['nodes']) != len(MESHES) or len(scene['nodes']) != len(MESHES):
        raise ValueError('Native delivery must contain exactly two reusable trees.')
    if not data.get('images') or any(image.get('uri') or image.get('bufferView') is None for image in data['images']):
        raise ValueError('All native PBR texture images must be embedded in the GLB.')
    roles = set(OUTPUT_MATERIALS.values())
    if {m['name'] for m in data['materials']} != roles or len(data['materials']) != len(roles):
        raise ValueError('Native delivery has unexpected materials.')
    mats = {m['name']: m for m in data['materials']}
    for role, material in mats.items():
        pbr = material['pbrMetallicRoughness']
        if (not pbr.get('baseColorTexture') or not pbr.get('metallicRoughnessTexture')
                or not material.get('normalTexture') or pbr.get('metallicFactor', 1.) != 0.):
            raise ValueError(f'Missing official PBR maps in {role}.')
        tint = tuple(pbr.get('baseColorFactor', (1., 1., 1., 1.)))
        foliage = role == OUTPUT_MATERIALS[ROLES[1]]
        expected_tint = FOLIAGE_TINT if foliage else (1., 1., 1., 1.)
        if not all(abs(a - b) < 1e-6 for a, b in zip(tint, expected_tint)):
            raise ValueError(f'Source albedo tint changed for {role}.')
        if foliage:
            if (material.get('alphaMode') != 'MASK' or abs(material.get('alphaCutoff', .5) - ALPHA_CUTOFF) > 1e-6
                    or not material.get('doubleSided')):
                raise ValueError('LOD2 needles lost their double-sided official alpha cutout.')
            image = image_of(pbr['baseColorTexture']['index'])
            if image.get('mimeType') != 'image/ktx2':
                raise ValueError('Native needle color and opacity must ship as one KTX2 image.')
            view = data['bufferViews'][image['bufferView']]
            with path.open('rb') as source:
                source.seek(12)
                json_bytes, = struct.unpack('<I', source.read(4))
                source.seek(28 + json_bytes + view.get('byteOffset', 0))
                header = source.read(64)
            if not header.startswith(b'\xabKTX 20\xbb\r\n\x1a\n'):
                raise ValueError('The exported needle texture is not a KTX2 container.')
            # The data format descriptor is at the byte offset the KTX2 index names, and its length
            # states how many channel descriptions it carries. A four-channel RGBA source encodes to
            # a 60-byte descriptor; a three-channel one to 44. The cutout needs the former.
            with path.open('rb') as source:
                source.seek(28 + json_bytes + view.get('byteOffset', 0))
                index = source.read(8)
            descriptor_offset, descriptor_length = struct.unpack('<II', index)
            if descriptor_offset <= 0 or descriptor_length < 60:
                raise ValueError('The needle KTX2 lost its alpha channel.')

    # Every texture's transfer function must match its role: three.js decodes anything the data
    # format descriptor marks sRGB, so a normal or roughness map marked sRGB would be bent or
    # darkened on the GPU. The descriptor's transfer function sits 14 bytes into the DFD.
    TRANSFER = {'linear': 1, 'srgb': 2}
    colour_by_material = {}
    for material in data['materials']:
        pbr = material.get('pbrMetallicRoughness', {})
        colour_by_material[material['name']] = {
            'baseColor': pbr.get('baseColorTexture', {}).get('index'),
            'normal': material.get('normalTexture', {}).get('index'),
            'rough': pbr.get('metallicRoughnessTexture', {}).get('index'),
            'occlusion': material.get('occlusionTexture', {}).get('index'),
        }
    def expect_transfer(material, slot):
        roles = colour_by_material[material]
        texture_index = roles[slot]
        if texture_index is None:
            return None
        image = image_of(texture_index)
        if image.get('mimeType') != 'image/ktx2':
            raise ValueError(f'{material} {slot} is not KTX2.')
        view = data['bufferViews'][image['bufferView']]
        if 'byteOffset' not in view or 'byteLength' not in view:
            raise ValueError(f'{material} {slot} has no embedded image view.')
        with path.open('rb') as source:
            header = source.read(12)
            if len(header) != 12:
                raise ValueError(f'{material} {slot} is not a GLB.')
            # The JSON chunk header follows the 12-byte file header.
            source.seek(12)
            json_length, json_kind = struct.unpack('<I4s', source.read(8))
            if json_kind != b'JSON':
                raise ValueError(f'{material} {slot} has no JSON chunk.')
            # GLB: 12-byte header, a JSON chunk header, the JSON, then the BIN chunk header.
            binary_start = 12 + 8 + json_length + 8
            image_start = binary_start + view['byteOffset']
            if image_start + 16 > path.stat().st_size or view['byteLength'] < 16:
                raise ValueError(f'{material} {slot} image view is out of range: start={image_start} '
                                 f'len={view["byteLength"]} size={path.stat().st_size} json={json_length} '
                                 f'binary={binary_start}')
            source.seek(image_start)
            header = source.read(64)
            if not header.startswith(b'\xabKTX 20\xbb\r\n\x1a\n'):
                raise ValueError(f'{material} {slot} is not a KTX2 image.')
            descriptor_offset = struct.unpack_from('<I', header, 48)[0]
            source.seek(image_start + descriptor_offset + 14)
            actual = struct.unpack('B', source.read(1))[0]
        wanted = TRANSFER['srgb'] if slot == 'baseColor' else TRANSFER['linear']
        if actual != wanted:
            raise ValueError(f'{material} {slot} transfer function is {actual}, expected {wanted}.')

    for material in colour_by_material:
        for slot in ('baseColor', 'normal', 'rough', 'occlusion'):
            expect_transfer(material, slot)

    result = {}
    for index in scene['nodes']:
        node = data['nodes'][index]
        name = node['name']
        mesh = data['meshes'][node['mesh']]
        if mesh['name'] != name or name not in prepared or node.get('children'):
            raise ValueError('Unexpected reusable native tree identity.')
        if (any(node.get('translation', [])) or node.get('matrix')
                or node.get('rotation', [0., 0., 0., 1.]) != [0., 0., 0., 1.]
                or node.get('scale', [1., 1., 1.]) != [1., 1., 1.]):
            raise ValueError(f'{name} gained a node transform.')
        verts, triangles = 0, 0
        lower_y, upper_y = math.inf, -math.inf
        if len(mesh['primitives']) != len(ROLES):
            raise ValueError(f'{name} lost one of the three PBR primitives.')
        for primitive in mesh['primitives']:
            attributes = primitive['attributes']
            if not {'POSITION', 'NORMAL', 'TEXCOORD_0'} <= attributes.keys() or primitive.get('mode', 4) != 4:
                raise ValueError(f'{name} lost an authored material vertex stream.')
            position = data['accessors'][attributes['POSITION']]
            view = data['bufferViews'][position['bufferView']]
            if (position['componentType'] != 5126 or position.get('normalized')
                    or 'EXT_meshopt_compression' not in view.get('extensions', {})):
                raise ValueError(f'{name} changed to a quantized or uncompressed position stream.')
            verts += position['count']
            triangles += data['accessors'][primitive['indices']]['count'] // 3
            lower_y = min(lower_y, position['min'][1])
            upper_y = max(upper_y, position['max'][1])
        if triangles != sum(prepared[name]['rootClippedTriangles'].values()):
            raise ValueError(f'{name} changed the root-clipped native triangles.')
        if abs(upper_y - prepared[name]['heightMetres']) > 1e-4:
            raise ValueError(f'{name} changed its upright measured height.')
        if abs(lower_y) > .005:
            raise ValueError(f'{name} has geometry more than 5 mm from its measured root plane.')
        result[name] = {**prepared[name], 'exportedVertices': verts, 'exportedTriangles': triangles,
                        'assetYUpHeightMetres': upper_y, 'assetLowestYMetres': lower_y}
    if result.keys() != MESHES.keys():
        raise ValueError('One of the two native pines is absent from the scene.')
    return result


def main():
    import bpy

    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--source-blend', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--gltf-tools', type=Path, required=True, help='Prefix containing the installed glTF-Transform tools.')
    parser.add_argument('--texture-size', type=int, choices=(384, 512, 768, 1024), default=512)
    parser.add_argument('--max-bytes', type=int, default=8_000_000)
    parser.add_argument('--toktx', type=Path, required=True, help='ktx2 encoder binary, to ship textures compressed.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if args.max_bytes < 1:
        parser.error('A positive package budget is required.')
    source, output, tools = (p.resolve() for p in (args.source_blend, args.output, args.gltf_tools))
    provenance = verify_source(source)
    output.mkdir(parents=True, exist_ok=True)
    destination, receipt = output / GLB_NAME, output / RECEIPT_NAME
    if destination.exists() or receipt.exists():
        raise ValueError('Use a fresh directory for native runtime tree delivery.')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    originals = source_objects(source)
    for tree in originals.values():
        scene.collection.objects.link(tree)
    bpy.context.view_layer.update()
    materials, maps = pbr_materials(source, args.texture_size)
    prepared, trees = {}, []
    for name, (source_name, _, _) in MESHES.items():
        tree, prepared[name] = prepare_mesh(originals[source_name], name, scene, materials)
        trees.append(tree)
    for tree in originals.values():
        scene.collection.objects.unlink(tree)
    bpy.context.view_layer.update()
    for tree in trees:
        tree.select_set(True)
    if {obj.name for obj in bpy.context.selected_objects} != MESHES.keys():
        raise RuntimeError('Native export selection contains more than the two prepared trees.')

    with TemporaryDirectory(prefix='.pine-native-', dir=output) as scratch:
        raw = Path(scratch) / 'prepared.glb'
        packed = Path(scratch) / GLB_NAME
        operation = bpy.ops.export_scene.gltf(
            filepath=str(raw), export_format='GLB', use_selection=True, export_texcoords=True,
            export_normals=True, export_tangents=False, export_attributes=False, export_materials='EXPORT',
            export_extras=True, export_yup=True, export_cameras=False, export_lights=False,
        )
        if 'FINISHED' not in operation:
            raise RuntimeError('Blender did not finish the native tree export.')
        subprocess.run(['node', '--input-type=module', '-e', MESHOPT, str(tools), str(raw), str(packed),
                        json.dumps(FOLIAGE_TINT), str(args.toktx), str(scratch)], check=True)
        trees = verify_glb(packed, prepared)
        byte_count = packed.stat().st_size
        if byte_count > args.max_bytes:
            raise ValueError(f'Native tree delivery {byte_count} bytes exceeds {args.max_bytes}.')
        evidence = {
            'version': 1, 'file': {'uri': GLB_NAME, 'sha256': digest(packed, 'sha256'), 'bytes': byte_count},
            'source': provenance, 'sourceLod': 2, 'blender': bpy.app.version_string,
            'exporterSha256': sha256(Path(__file__).read_bytes()).hexdigest(), 'sourceLoaderSha256': loader_hash(),
            'geometryCodec': 'EXT_meshopt_compression', 'positionStream': 'Lossless FLOAT32',
            'textureSize': args.texture_size, 'textures': maps, 'foliageBaseColorFactor': FOLIAGE_TINT,
            'foliageAlphaMode': 'MASK', 'foliageAlphaCutoff': ALPHA_CUTOFF, 'lighting': 'live PBR',
            'trees': trees,
        }
        (Path(scratch) / RECEIPT_NAME).write_text(json.dumps(evidence, indent=2) + '\n')
        packed.replace(destination)
        (Path(scratch) / RECEIPT_NAME).replace(receipt)
    print('PINE_NATIVE_RUNTIME', destination, byte_count, flush=True)


if __name__ == '__main__':
    main()
