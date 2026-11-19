"""Render the layered forest framing Pine Gate's fixed uphill approach."""

from argparse import ArgumentParser
import json
import math
from pathlib import Path
import random
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import monotonic
from types import SimpleNamespace

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bake_export import configure_cycles
from encode_pine_backdrop import digest, dilate_rgb, encode_scanlines, write_rgba_png
from pine_gate import PRE_EXPOSURE, daylight_world, terrain_height, watercourse_at
from pine_native_crowns import verify_source
from pine_valley_exr import straighten
from snow_roof import color, point


STATIONS = (29., 23., 17., 11.7, 8.4)
# The middle canopy still fills the first uphill view after the near plane fades.
DETAIL_PLATE_WIDTH = {17.: 1764}
PLATE_WIDTH = 18.
PLATE_HEIGHT = 14.
CENTER_Y = 6.9
SOURCE_VARIANTS = ('pine_sapling_medium_b_LOD0', 'pine_sapling_medium_c_LOD0')


def tree_prototypes(source):
    with bpy.data.libraries.load(str(source), link=False) as (catalog, selected):
        if not all(name in catalog.objects for name in SOURCE_VARIANTS):
            raise ValueError('The pinned forest assets must supply both native pine variants.')
        selected.objects = list(SOURCE_VARIANTS)
    for image in bpy.data.images:
        local = source.parent / 'textures' / Path(image.filepath).name
        if not image.packed_file and local.is_file():
            image.filepath = str(local)
    set_forest_needle_pigment(bpy.data.materials['pine_sapling_medium_twig'])
    return [(tree, min(point[2] for point in tree.bound_box), max(point[2] for point in tree.bound_box))
            for tree in selected.objects]


def set_forest_needle_pigment(material):
    """Cool the old-growth needles while retaining the scanned stem and cone colors."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    scans = {Path(node.image.filepath).name: node.outputs['Color'] for node in nodes
             if node.type == 'TEX_IMAGE' and node.image}
    diffuse = scans['pine_sapling_medium_twig_diff_1k.png']
    needle_only = scans['pine_sapling_medium_twig_mask_1k.png']
    # The native mask identifies the chlorophyll-bearing surfaces. Feed the
    # same pigment to the diffuse and backlit parts of the scanned shader.
    receivers = [link.to_socket for link in diffuse.links]
    pigment = nodes.new('ShaderNodeMixRGB')
    pigment.label = 'Cool mature Masson pine pigment'
    pigment.blend_type = 'MULTIPLY'
    pigment.inputs[2].default_value = (.58, .83, .91, 1.)
    links.new(needle_only, pigment.inputs[0])
    links.new(diffuse, pigment.inputs[1])
    for receiver in receivers:
        links.new(pigment.outputs[0], receiver)


def forest_trees(layer, station, index, prototypes, rng):
    for side in (-1, 1):
        # Nearby trees leave a passage between their trunks. Irregular rows
        # of smaller trees close gaps behind the middle forest canopy.
        for column, offset in enumerate((2.9, 4.0, 5.6, 6.8, 8.0, 9.5)):
            prototype, foot, top = prototypes[(column + index + (side > 0)) % len(prototypes)]
            x = side * (offset + rng.uniform(-.20, .31))
            z = station + rng.uniform(-1.65, .15)
            height = rng.uniform(6.2, 10.0) * (1.12 if column in (1, 4) else .89)
            canopy_gate = column == 0 and station <= 17.
            if canopy_gate:
                # A pair of older low boughs crosses above the route just
                # behind the last shoulder. Both trunks remain off the tread.
                x = side * (2.24 + rng.uniform(-.10, .18))
                height = rng.uniform(5.9, 7.1)
            scale = height / (top - foot)
            tree = prototype.copy()
            tree.name = f'Forest slice {index + 1} pine {side:+} {column + 1}'
            tree.location = point((x, terrain_height(x, station) - foot * scale - .12, z))
            across = 1.68 if canopy_gate else 1.
            tree.scale = (scale * across * rng.uniform(.88, 1.24), scale * rng.uniform(.86, 1.31), scale)
            tree.rotation_euler = (0., 0., rng.uniform(-math.pi, math.pi))
            layer.objects.link(tree)


def leaf_material(name, hex_color, roughness):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color(hex_color)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = material.diffuse_color
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Subsurface Weight'].default_value = .11
    shader.inputs['Subsurface Radius'].default_value = (.03, .06, .02)
    return material


def understory_materials():
    return [leaf_material(name, tint, roughness) for name, tint, roughness in (
        ('Mature shaded fern', '#455532', .47),
        ('Fern pinnae in open gaps', '#6c7945', .43),
        ('New fern growth', '#788752', .46),
        ('Forest edge shrub leaves', '#4f5536', .40),
    )]


def forest_undergrowth(layer, station, index, materials, rng):
    points, faces, slots = [], [], []

    def leaf(root, tip, half_width, material):
        direction = tip - root
        side = Vector((-direction.z, 0., direction.x)).normalized() * half_width
        middle = root.lerp(tip, .52) + Vector((0., .21 * half_width, 0.))
        rib = middle + Vector((0., .23 * half_width, 0.))
        start = len(points)
        points.extend(point(v) for v in (root, middle - side, tip, middle + side, rib))
        faces.extend((start + a, start + b, start + 4) for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)))
        slots.extend([material] * 4)

    for side in (-1, 1):
        for bush in range(25):
            x = side * rng.uniform(2.63, 8.)
            z = station + rng.uniform(-.95, -.05)
            creek, _, creek_width = watercourse_at(station)
            if abs(x - creek) < creek_width + .28:
                continue
            ground = terrain_height(x, station) - rng.uniform(.04, .22)
            origin = Vector((x, ground, z))
            size = rng.uniform(.48, 1.14) * (1.10 if abs(x) < 3.3 else 1.)
            phase = rng.uniform(-math.pi, math.pi)
            material = rng.choices((0, 1, 2), (7, 4, 1))[0]
            for limb in range(rng.randint(5, 8)):
                angle = limb * 2.39996 + phase + rng.uniform(-.16, .19)
                axis = Vector((math.cos(angle), 0., math.sin(angle)))
                lateral = Vector((-axis.z, 0., axis.x))
                length = size * rng.uniform(.61, 1.11)
                rise = size * rng.uniform(.42, .96)
                for vein in range(3, 15):
                    t = vein / 15.
                    spine = origin + axis * (length * t) + Vector((0., math.sin(t * 2.3) * rise, 0.))
                    width = (.15 * length + .016) * math.sin(math.pi * t) ** .74
                    for flank in (-1, 1):
                        shape = lateral * (width * flank) + axis * (.40 * width)
                        tip = spine + shape + Vector((0., -.19 * width, 0.))
                        leaf(spine, tip, width * rng.uniform(.19, .29), material)
                leaf(origin + axis * (.89 * length) + Vector((0., .83 * rise, 0.)),
                     origin + axis * length + Vector((0., .71 * rise, 0.)), .016, material)
        for shrub in range(17):
            x = side * rng.uniform(2.8, 8.7)
            z = station + rng.uniform(-1.48, -.47)
            base = terrain_height(x, station) - .08
            height = rng.uniform(.39, 1.14)
            for _ in range(35):
                angle = rng.uniform(0., math.tau)
                spread = rng.uniform(.06, .73) * height
                root = Vector((x + math.cos(angle) * spread, base + rng.uniform(.38, 1.) * height,
                               z + math.sin(angle) * spread))
                tip = root + Vector((math.cos(angle) * .17, rng.uniform(-.055, .064),
                                     math.sin(angle) * .17)) * height
                leaf(root, tip, .038 * height, 3)

    data = bpy.data.meshes.new(f'Forest slice {index + 1} fern pinnae and wild leaves')
    data.from_pydata(points, [], faces)
    for material in materials:
        data.materials.append(material)
    data.polygons.foreach_set('material_index', slots)
    data.update()
    obj = bpy.data.objects.new(data.name, data)
    layer.objects.link(obj)


def plate_height(width):
    height = width * PLATE_HEIGHT / PLATE_WIDTH
    if width < 360 or not height.is_integer():
        raise ValueError('Choose a width with an exact 18:14 raster and at least 360 pixels.')
    return int(height)


def render_plates(options):
    source = verify_source(options.pines)
    scene = bpy.context.scene
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    ortho = bpy.data.cameras.new('Pine approach orthographic layer camera')
    ortho.type = 'ORTHO'
    ortho.ortho_scale = PLATE_WIDTH
    camera = bpy.data.objects.new(ortho.name, ortho)
    scene.collection.objects.link(camera)
    camera.rotation_euler = point((0, 0, -1)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    vertical = plate_height(options.width)
    configure_cycles(scene, SimpleNamespace(samples=options.samples, device='METAL',
                                            skip_bake=False, export_only=False))
    scene.render.film_transparent = True
    scene.render.resolution_percentage = 100
    scene.render.use_persistent_data = False
    image = scene.render.image_settings
    image.file_format, image.color_mode, image.color_depth, image.exr_codec = 'OPEN_EXR', 'RGBA', '32', 'NONE'
    image.color_management = 'OVERRIDE'
    image.linear_colorspace_settings.name = 'Linear Rec.709'
    scene.cycles.use_denoising = True
    scene.cycles.denoising_use_gpu = True
    # Subpixel separations in the native needle silhouettes survive better
    # with a ray reconstruction footprint close to one native plate pixel.
    scene.cycles.filter_width = 1.125
    scene.world = daylight_world()
    prototypes = tree_prototypes(options.pines)
    foliage = understory_materials()
    descriptor = {'width': options.width, 'height': vertical, 'centerY': CENTER_Y,
                  'widthMetres': PLATE_WIDTH, 'heightMetres': PLATE_HEIGHT, 'layers': []}
    output = options.out
    output.mkdir(parents=True, exist_ok=False)
    report = {'format': 'Pine approach forest layers', 'descriptor': descriptor, 'files': [],
              'source': source, 'samples': options.samples, 'device': 'METAL', 'denoiser': 'Metal OIDN',
              'encoding': 'log2-8-8', 'alpha': 'straight', 'webpQuality': options.quality,
              'preExposure': PRE_EXPOSURE, 'pixelFilterWidth': scene.cycles.filter_width}
    for index, station in enumerate(STATIONS):
        if station > options.nearest:
            continue
        rng = random.Random(6143 + 107 * index)
        layer = bpy.data.collections.new(f'Forest approach depth {station:g} m')
        scene.collection.children.link(layer)
        forest_trees(layer, station, index, prototypes, rng)
        forest_undergrowth(layer, station, index, foliage, rng)
        camera.location = point((0., CENTER_Y, station + 22.))
        camera.data.clip_end = 36.
        width = max(options.width, DETAIL_PLATE_WIDTH.get(station, options.width))
        height = plate_height(width)
        scene.render.resolution_x, scene.render.resolution_y = width, height
        master = output / f'pine-approach-{index + 1}.exr'
        scene.render.filepath = str(master)
        started = monotonic()
        bpy.ops.render.render(write_still=True)
        alpha = straighten(master, width, height)
        if alpha['coveredPixels'] == 0:
            raise RuntimeError(f'No opaque forest was rendered in layer {index + 1}.')
        rgba, clipped, _ = encode_scanlines(master, width, height, PRE_EXPOSURE)
        dilate_rgb(rgba)
        plate = output / f'pine-approach-{index + 1}.webp'
        with TemporaryDirectory(dir=output, prefix='encode-') as scratch:
            png = Path(scratch) / 'scanline.png'
            write_rgba_png(png, rgba)
            subprocess.run(['cwebp', '-quiet', '-q', str(options.quality), '-alpha_q', '100',
                            '-exact', '-m', '4', str(png), '-o', str(plate)], check=True)
        descriptor['layers'].append({'z': station, 'uri': plate.name, 'width': width, 'height': height})
        report['files'].append({'uri': plate.name, 'bytes': plate.stat().st_size, 'sha256': digest(plate),
                                'masterSha256': digest(master), 'seconds': round(monotonic() - started, 2),
                                'clippedRadiancePixels': clipped, **alpha})
        print('PINE_APPROACH_PLATE', json.dumps(report['files'][-1]), flush=True)
        for obj in list(layer.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(layer)
    (output / 'forest.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--pines', type=Path, required=True)
    parser.add_argument('--width', type=int, default=1008)
    parser.add_argument('--samples', type=int, default=8)
    parser.add_argument('--quality', type=int, default=76)
    parser.add_argument('--nearest', type=float, default=29.)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    render_plates(options)
