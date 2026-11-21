"""Bind authored valley trees to optional native crown upgrades."""

from hashlib import sha256
import json
import math


NATIVE_MOUNTS_FIELD = 'one_light_pine_native_mounts'
VALLEY_NODES = {
    'Layered ridge pine 4': 'PineRidgeNative',
    'Back ridge pine 5': 'PineYoungNative',
    'Layered ridge pine 1': 'PineShoulderNative',
    # Three more relief crowns that draw larger than 270 px on the walk. They reuse the same two
    # native models, so the runtime must place one instance per mount rather than one per model.
    'Layered ridge pine 12': 'PineRidgeNative',
    'Layered ridge pine 10': 'PineRidgeNative',
    'Back ridge pine 3': 'PineRidgeNative',
}
SHARED_PROTOTYPES = {'PineShoulderNative': 'PineRidgeNative'}
# Three crowns added after the first visual pass. Their relief was a soft 160-vertex blob, so they now
# take a native model like the approved three. Only these take a per-tree jitter: the approved trees
# keep the transform their review signed off, and every consumer reads one transform, so the fallback
# crown and the native instance always agree and nothing pops when the detail model arrives.
JITTERED_LABELS = {'Layered ridge pine 12', 'Layered ridge pine 10', 'Back ridge pine 3'}


def jitter(label):
    """A stable yaw offset and scale for one tree, seeded from its authored label.

    A hash keeps it identical on every load and on both clients; random numbers would make the walk
    look different each time it is entered.
    """
    seed = 2166136261
    for character in label:
        seed = ((seed ^ ord(character)) * 16777619) & 0xffffffff
    first = (seed % 1000003) / 1000003
    second = (((seed >> 11) ^ (seed >> 3)) % 1000003) / 1000003
    return math.radians((first * 2 - 1) * 12), .85 + second * .30


def has_verified_native_receipt(path, verified_sha):
    """Read the same bytes already accepted by the native impostor verifier."""
    receipt = path.read_bytes()
    if sha256(receipt).hexdigest() != verified_sha:
        raise ValueError('Pine impostor receipt changed after verification.')
    return bool(json.loads(receipt).get('nativeSource'))


def private_material(obj, name, node, role):
    # The packer deduplicates by properties, so a distinct name alone is not
    # enough. Keep every shader, texture and UV while distinguishing this slot.
    materials = obj.data.materials
    if len(materials) != 1 or materials[0] is None:
        raise ValueError(f'{obj.name} needs one material for its Pine native upgrade.')
    material = materials[0].copy()
    material.name = name
    if material.name != name:
        raise ValueError(f'Pine Valley material name is already taken: {name}')
    material['one_light_pine_native_mount'] = f'{node}:{role}'
    materials[0] = material
    return material.name


def add_native_mount(mounts, label, trunk, camera, views, proxy, stem):
    """Record metres in glTF Y-up at the authored root, with a +Y yaw delta."""
    node = VALLEY_NODES[label]
    if label in mounts:
        raise ValueError(f'Duplicate Pine native mount: {label}')
    root = trunk[0]
    position = list(root)
    height = trunk[-1].y - root.y
    if not all(math.isfinite(component) for component in (*position, height)) or height <= 0:
        raise ValueError(f'Invalid Pine native mount dimensions: {node}')
    camera_azimuth = math.degrees(math.atan2(camera.x - root.x, camera.z - root.z))
    # Use the same nearest azimuth, tie order and sign as relief_crown. The
    # native model scales uniformly from its root to this centreline height.
    view = min(views, key=lambda row: abs(math.remainder(camera_azimuth - row['azimuthDegrees'], 360.)))
    yaw = math.radians(math.remainder(camera_azimuth - view['azimuthDegrees'], 360.))
    # One model may back several trees, so every material and mount is named by its own label. The
    # node stays a field: the runtime picks the model from it and finds this tree's fallback meshes
    # by the two private material names.
    if label in JITTERED_LABELS:
        yaw_offset, scale = jitter(label)
        yaw += yaw_offset
        height *= scale
    mounts[label] = {
        'node': node, 'label': label, 'position': position, 'height': height, 'yawRadians': yaw,
        'proxyMaterial': private_material(proxy, f'Depth-reconstructed pine crown {label}', label, 'proxy'),
        'stemMaterial': private_material(stem, f'Knotted pine bark {label}', label, 'stem'),
    }
    if node in SHARED_PROTOTYPES:
        mounts[label]['prototype'] = SHARED_PROTOTYPES[node]


def serialize_native_mounts(mounts):
    if set(mounts) != set(VALLEY_NODES):
        raise ValueError('All authored Pine native mounts must exist.')
    return json.dumps([mounts[label] for label in VALLEY_NODES], separators=(',', ':'), allow_nan=False)
