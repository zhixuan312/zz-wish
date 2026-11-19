"""Bind the two authored valley trees to optional native crown upgrades."""

from hashlib import sha256
import json
import math


NATIVE_MOUNTS_FIELD = 'one_light_pine_native_mounts'
VALLEY_NODES = {
    'Layered ridge pine 4': 'PineRidgeNative',
    'Back ridge pine 5': 'PineYoungNative',
}


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
    if node in mounts:
        raise ValueError(f'Duplicate Pine native mount: {node}')
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
    mounts[node] = {
        'node': node, 'position': position, 'height': height, 'yawRadians': yaw,
        # Keep the prefix used to retain the original crown texture dimensions.
        'proxyMaterial': private_material(proxy, f'Depth-reconstructed pine crown {node}', node, 'proxy'),
        'stemMaterial': private_material(stem, f'Knotted pine bark {node}', node, 'stem'),
    }


def serialize_native_mounts(mounts):
    if set(mounts) != set(VALLEY_NODES.values()):
        raise ValueError('Both authored Pine native mounts must exist.')
    return json.dumps([mounts[node] for node in VALLEY_NODES.values()], separators=(',', ':'), allow_nan=False)
