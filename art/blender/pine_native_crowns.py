"""Select and measure the pinned Poly Haven Pine Sapling Medium LOD0 crowns."""

from hashlib import file_digest, sha256
import math
from pathlib import Path
import re
from statistics import median

ASSET = 'pine_sapling_medium'
ASSET_URL = 'https://polyhaven.com/a/pine_sapling_medium'
NATIVE_FILENAME = 'pine_sapling_medium_1k.blend'
NATIVE_URL = 'https://dl.polyhaven.org/file/ph-assets/Models/blend/1k/pine_sapling_medium/' + NATIVE_FILENAME
NATIVE_BYTES = 200355596
NATIVE_MD5 = '597b4b8f29bc3c0baf9a7e05399b3fa7'
NATIVE_SHA256 = '2878214412c985b91ff9cde7c6c3756cdb4bbc59864d39df33ac7f0bfffb4c96'
OBJECTS = {'ridge': 'pine_sapling_medium_b_LOD0', 'young': 'pine_sapling_medium_c_LOD0'}
TREE_OBJECT = re.compile(r'pine_sapling_medium_[abc]_LOD[012](?:\.\d+)?')
TEXTURES = {
    'bark_diff': (5568559, '63688d7bcdd5ff5500f12bde192b197a'),
    'bark_disp': (1633203, 'a085234cf5c6697b53187347dafad026'),
    'bark_nor_gl': (5640903, 'a0e2bfeda173e20c494d79c6125effa5'),
    'bark_rough': (2488380, 'dca69b84d7846af93fbb31d0c1dafd2e'),
    'twig_alpha': (351928, '641911a5a3f543911dad04ebb26e7bca'),
    'twig_diff': (3208228, 'a4fa4a55aab9231915a4023ea9841577'),
    'twig_mask': (226541, '8a2b451afa2ef9f5c548ae9772ffbcf0'),
    'twig_nor_gl': (3021524, '1c437201b679e4b5e6a10af8e9b9b523'),
    'twig_rough': (1342516, '8ef8f0d1cbd36b1e4578eb729fa6f0b7'),
}


def digest(path, algorithm):
    with path.open('rb') as stream:
        return file_digest(stream, algorithm).hexdigest()


def file_evidence(name, size, md5):
    return {'file': name, 'bytes': size, 'md5': md5}


def asset_provenance():
    return {
        'asset': ASSET,
        'page': ASSET_URL,
        'api': 'https://api.polyhaven.com/files/' + ASSET,
        'license': 'CC0-1.0',
        'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'authors': ['Rico Cilliers', 'Rob Tuytel'],
        'blend': {**file_evidence(NATIVE_FILENAME, NATIVE_BYTES, NATIVE_MD5),
                  'url': NATIVE_URL, 'sha256': NATIVE_SHA256},
        'textures': [file_evidence(f'{ASSET}_{key}_1k.png', *value) for key, value in TEXTURES.items()],
    }


def verify_file(path, evidence):
    if not path.is_file() or path.stat().st_size != evidence['bytes'] or digest(path, 'md5') != evidence['md5']:
        raise ValueError(f'Poly Haven file does not match its official size and MD5: {path.name}')


def verify_source(path):
    evidence = asset_provenance()
    if path.name != NATIVE_FILENAME:
        raise ValueError(f'Expected the official {NATIVE_FILENAME}')
    verify_file(path, evidence['blend'])
    if digest(path, 'sha256') != NATIVE_SHA256:
        raise ValueError('Poly Haven Blender source differs from the pinned SHA-256.')
    for texture in evidence['textures']:
        verify_file(path.parent / 'textures' / texture['file'], texture)
    return evidence


def loader_hash():
    return sha256(Path(__file__).read_bytes()).hexdigest()


def load_tree(scene, path, profile):
    import bpy

    name = OBJECTS[profile]
    with bpy.data.libraries.load(str(path), link=False) as (catalog, selected):
        if name not in catalog.objects:
            raise ValueError(f'Native Blender source is missing {name}.')
        selected.objects = [name]
    tree, = selected.objects
    variants = {obj.name for obj in bpy.data.objects if TREE_OBJECT.fullmatch(obj.name)}
    if tree is None or tree.name != name or variants != {name}:
        raise ValueError(f'Expected to append only {name}. Found {sorted(variants)}')
    scene.collection.objects.link(tree)

    for image in bpy.data.images:
        if image.source != 'FILE':
            continue
        file = Path(image.filepath).name
        match = next((key for key in TEXTURES if file == f'{ASSET}_{key}_1k.png'), None)
        if match is None:
            if image.users:
                raise ValueError('Unexpected native tree image ' + file)
            continue
        # The Blender append may remap the original relative file path.
        # Explicitly bind the official copy that passed the checksum check.
        if image.packed_file is None:
            image.filepath = str(path.parent / 'textures' / file)
    bpy.context.view_layer.update()
    return tree


class NativeSurface:
    def __init__(self, obj, angle_axes):
        import bpy
        from mathutils import Matrix, Vector
        from mathutils.bvhtree import BVHTree

        graph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.data
        if obj.type != 'MESH' or mesh is None:
            raise ValueError(f'{obj.name} did not evaluate to an LOD0 mesh.')
        world = evaluated.matrix_world.copy()
        slots = [material.name.lower() if material else '' for material in mesh.materials]
        bark_slots = {i for i, name in enumerate(slots) if 'bark' in name or 'dead_branch' in name}
        foliage_slots = {i for i, name in enumerate(slots) if 'twig' in name or 'needle' in name}
        if not bark_slots or not foliage_slots:
            raise ValueError(f'{obj.name} requires measured bark and needle slots: {slots}')

        # Count the actual triangulated polygons without building a Python
        # triangle list for the million-triangle crown.
        bark_vertices, used_slots = set(), set()
        counts = {'bark': 0, 'foliage': 0}
        for polygon in mesh.polygons:
            triangle_count = len(polygon.vertices) - 2
            used_slots.add(polygon.material_index)
            if polygon.material_index in bark_slots:
                bark_vertices.update(polygon.vertices)
                counts['bark'] += triangle_count
            elif polygon.material_index in foliage_slots:
                counts['foliage'] += triangle_count
            else:
                raise ValueError(f'{obj.name} has faces in an unexpected native material slot.')
        if counts['bark'] < 3000 or counts['foliage'] < 1_000_000:
            raise ValueError(f'{obj.name} is below the expected opaque LOD0 geometry: {counts}')

        roots = [world @ mesh.vertices[i].co for i in bark_vertices]
        bottom = min(p.z for p in roots)
        foot = [p for p in roots if p.z <= bottom + .025]
        mount = Vector((median(p.x for p in foot), median(p.y for p in foot), bottom))
        normalized = Matrix.Translation(-mount) @ world
        # Cache the BVH before mutating the object's scene transform. Its
        # vertices remain in native object space for all orthographic rays.
        self.tree = BVHTree.FromObject(obj, graph)
        self.world = normalized
        self.inverse = normalized.inverted()
        self.angle_bounds = {angle: [math.inf, -math.inf] for angle in angle_axes}
        crown_floor, canopy_top = math.inf, -math.inf
        for vertex in mesh.vertices:
            point = normalized @ vertex.co
            if vertex.index not in bark_vertices:
                crown_floor = min(crown_floor, point.z)
            canopy_top = max(canopy_top, point.z)
        if not 0. < canopy_top or not 0. < crown_floor < canopy_top:
            raise ValueError(f'Invalid measured crown bounds for {obj.name}.')
        self.crown_floor = max(0., crown_floor - .012 * canopy_top)
        self.height = canopy_top
        for vertex in mesh.vertices:
            point = normalized @ vertex.co
            if point.z < self.crown_floor:
                continue
            engine = Vector((point.x, point.z, -point.y))
            for angle, right in angle_axes.items():
                x = engine.dot(right)
                bounds = self.angle_bounds[angle]
                bounds[0] = min(bounds[0], x)
                bounds[1] = max(bounds[1], x)
        self.materials = tuple(mesh.materials[i] for i in sorted(used_slots))
        obj.matrix_world = normalized
        self.evidence = {
            'object': obj.name, 'lod': 0, 'mountBlenderMetres': list(mount),
            'crownCutMetres': self.crown_floor, 'heightMetres': self.height,
            'triangles': counts,
        }

    def ray_cast(self, origin, direction):
        point, normal, index, _ = self.tree.ray_cast(self.inverse @ origin,
                                                    (self.inverse.to_3x3() @ direction).normalized())
        if point is None:
            return None, None, None, None
        world = self.world @ point
        return world, normal, index, (world - origin).dot(direction)
