"""Bake tangent normals from the Pine Gate wax sculpts onto their UV surfaces."""

import argparse
from hashlib import sha256
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np


SIZE = 512
PILLAR_HEIGHT = .053
PILLAR_RADIUS = .0146
SPILL_WIDTH = .034

# Irregular flows start at distinct faults in the rim. Their lengths are
# set in metres so the sculpt can be assessed against the actual candle.
RUNNELS = (
    (64, .022, .092, .00068, -.23),
    (111, .011, .066, .00036, .32),
    (213, .034, .114, .00044, -.15),
    (284, .016, .077, .00050, .21),
)


def saturate(value):
    return max(0., min(1., value))


def soften(value):
    value = saturate(value)
    return value * value * (3. - 2. * value)


def signed_angle(a, b):
    return (a - b + math.pi) % math.tau - math.pi


def pillar_sculpt(angle, fraction):
    down = (1 - fraction) * PILLAR_HEIGHT
    # Small compression marks from pouring and releasing a split mould.
    ripple = .000057 * math.sin(angle * 9 + .8 * math.sin(angle * 5 + fraction * 5))
    ripple *= math.sin(.24 + fraction * 8.7 + .53 * math.sin(angle * 3 + fraction * 7))
    for degrees, length, spread, thickness, bend in RUNNELS:
        along = down / length
        if along >= 1:
            continue
        centre = math.radians(degrees) + bend * along ** 1.7 + .030 * math.sin(along * 8)
        distance = signed_angle(angle, centre)
        bead = math.exp(-((along - .82) / .105) ** 2)
        width = spread * (.66 + .53 * bead + .26 * (1 - along))
        channel = math.exp(-(distance / width) ** 2)
        ridge = math.exp(-((abs(distance) - width * .60) / (width * .24)) ** 2)
        tail = 1 - soften((along - .86) / .14)
        ripple += thickness * channel * tail * (.28 + .54 * bead + .40 * math.exp(-along * 6))
        ripple -= thickness * .09 * ridge * tail
    return ripple


def old_spill_sculpt(u, v):
    x, z = (u - .5) * SPILL_WIDTH, (v - .5) * SPILL_WIDTH
    # Successive deposits reach different edges and have rounded menisci.
    thickness = .000015 * math.sin(x * 3229 + math.sin(z * 1491)) * math.sin(z * 3559 - x * 997)
    for cx, cz, rx, rz, height, skew in (
        (-.0056, .0024, .0102, .0069, .00034, .16),
        (.0054, -.0025, .0090, .0066, .00042, -.21),
        (.0034, .0068, .0071, .0052, .00027, .38),
        (-.0082, -.0068, .0068, .0070, .00022, -.28),
    ):
        ax, az = x - cx, z - cz
        rho = math.hypot((ax + az * skew) / rx, az / rz)
        rho += .057 * math.sin(math.atan2(az, ax) * 3 + skew * 9)
        interior = 1 - soften((rho - .72) / .26)
        meniscus = math.exp(-((rho - .81) / .083) ** 2)
        thickness += height * (interior * .72 + meniscus * .28)
    return thickness


def object_with_uv(name, points, faces, corners):
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(points, [], faces)
    geometry.update()
    object_ = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(object_)
    uv = geometry.uv_layers.new(name='UVMap')
    for face, texels in zip(geometry.polygons, corners, strict=True):
        face.use_smooth = True
        for index, texel in zip(face.loop_indices, texels, strict=True):
            uv.data[index].uv = texel
    return object_


def pillar(name, rings, sectors, sculpt=False):
    points, faces, corners = [], [], []
    for row in range(rings + 1):
        fraction = row / rings
        for col in range(sectors):
            angle = math.pi - math.tau * col / sectors
            radius = PILLAR_RADIUS * (1 - .023 * fraction + .013 * math.sin(fraction * math.pi))
            if sculpt:
                radius += pillar_sculpt(angle, fraction)
            points.append((radius * math.cos(angle), -radius * math.sin(angle), fraction * PILLAR_HEIGHT))
    for row in range(rings):
        for col in range(sectors):
            low, high = row * sectors, (row + 1) * sectors
            following = (col + 1) % sectors
            faces.append((low + col, low + following, high + following, high + col))
            u, u1, v, v1 = col / sectors, (col + 1) / sectors, row / rings, (row + 1) / rings
            corners.append(((u, v), (u1, v), (u1, v1), (u, v1)))
    return object_with_uv(name, points, faces, corners)


def spill(name, cuts, sculpt=False):
    points, faces, corners = [], [], []
    stride = cuts + 1
    for row in range(stride):
        for col in range(stride):
            u, v = col / cuts, row / cuts
            z = old_spill_sculpt(u, v) if sculpt else 0.
            points.append(((u - .5) * SPILL_WIDTH, (v - .5) * SPILL_WIDTH, z))
            if row < cuts and col < cuts:
                i = row * stride + col
                faces.append((i, i + 1, i + stride + 1, i + stride))
                corners.append(((u, v), ((col + 1) / cuts, v),
                                ((col + 1) / cuts, (row + 1) / cuts), (u, (row + 1) / cuts)))
    return object_with_uv(name, points, faces, corners)


def normal_bake(source, target, output, cage):
    image = bpy.data.images.new(output.stem, width=SIZE, height=SIZE, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    material = bpy.data.materials.new(f'{target.name} bake receiver')
    material.use_nodes = True
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    material.node_tree.nodes.active = texture
    target.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True,
                        cage_extrusion=cage, max_ray_distance=cage * 2, margin=12)

    data = np.empty(SIZE * SIZE * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    rgb = data.reshape((-1, 4))[:, :3]
    tangent = rgb[:, :2] * 2 - 1
    variation = float(np.percentile(np.linalg.norm(tangent, axis=1), 95))
    if np.any(~np.isfinite(rgb)) or float(np.percentile(rgb[:, 2], 1)) < .55 or variation < .025:
        raise RuntimeError(f'{output.name}: expected a finite tangent normal bake, got p95 tangent {variation:.4f}')
    image.filepath_raw = str(output)
    image.file_format = 'PNG'
    image.save()
    return {'uri': output.name, 'sha256': sha256(output.read_bytes()).hexdigest(),
            'bytes': output.stat().st_size, 'width': SIZE, 'height': SIZE,
            'normalSpace': 'tangent', 'tangentMagnitudeP95': variation,
            'highPolygons': len(source.data.polygons), 'lowPolygons': len(target.data.polygons)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--device', choices=('CPU', 'METAL'), default='CPU')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    if args.device == 'METAL':
        preferences = bpy.context.preferences.addons['cycles'].preferences
        preferences.compute_device_type = 'METAL'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'METAL'
        if not any(device.use for device in preferences.devices):
            raise RuntimeError('Cycles Metal device required for this bake.')
        scene.cycles.device = 'GPU'
    data = {
        'pillar': normal_bake(pillar('High sculpted pillar', 244, 384, True),
                             pillar('Low pillar receiver', 46, 96), output / 'pine-wax-sculpt.png', .00145),
        'oldSpill': normal_bake(spill('Sculpted successive wax spills', 224, True),
                               spill('Low old wax receiver', 14), output / 'pine-old-wax-normal.png', .0018),
    }
    receipt = {'device': args.device, 'sceneLinear': True, 'normalMaps': data,
               'sourceSha256': sha256(Path(__file__).read_bytes()).hexdigest()}
    (output / 'wax-sculpt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print('PINE_WAX_NORMAL_BAKE', json.dumps(receipt), flush=True)


if __name__ == '__main__':
    main()
