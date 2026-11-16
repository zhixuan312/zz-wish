"""Low-sample Metal/OIDN source previews at exact held Three.js camera matrices.

No authored scene is saved or changed. Run after exclusive GPU handoff only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_export as baker

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, required=True)
parser.add_argument('--camera-index', type=Path, required=True)
parser.add_argument('--names', default='low-altar-edge,burning,burnFar')
parser.add_argument('--viewports', default='desktop-en,phone-zh')
parser.add_argument('--desktop-contact-details', action='store_true', help='Add the three held desktop foot/burner closeups after both low overviews.')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--samples', type=int, default=8)
parser.add_argument('--look', choices=['night', 'dusk', 'day'], default='night')
parser.add_argument('--visitor', choices=['on', 'off'], default='on')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
source_sha = sha(args.scene)
if not args.output.resolve().is_relative_to(ROOT / 'art/build'):
    raise RuntimeError('Native previews must use a separate ignored art/build directory.')
if (args.output / 'preview.json').exists():
    raise RuntimeError('Existing preview evidence is immutable; select a new output directory.')
index = json.loads(args.camera_index.read_text())
names, viewports = args.names.split(','), args.viewports.split(',')
details = ['altar-left-contact', 'altar-burner-contact', 'altar-right-contact'] if args.desktop_contact_details else []
cameras = [c for c in index['cameras'] if (c['name'] in names and c['viewport'] in viewports)
           or (c['name'] in details and c['viewport'] == 'desktop-en')]
if len(cameras) != len(names) * len(viewports) + len(details):
    raise RuntimeError('Expected exactly one camera for every requested name and viewport.')
order = ['low-altar-edge', *details, *[name for name in names if name != 'low-altar-edge']]
cameras.sort(key=lambda camera: (order.index(camera['name']), viewports.index(camera['viewport'])))
bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve()))
scene = bpy.context.scene
view = json.loads(scene.get('one_light_source_view_settings', '{}'))
for key, value in view.items():
    setattr(scene.view_settings, key, value)
snapshot = baker.snapshot_lighting(scene)
baker.configure_light_pass(scene, args.look, snapshot)
if args.visitor == 'on':
    for obj, energy, colour in snapshot[0]:
        if obj.get('bake_role') == 'lamp':
            obj.data.energy, obj.data.color = energy, colour
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
devices = []
for device in prefs.devices:
    device.use = device.type == 'METAL'
    if device.use:
        devices.append(device.name)
if not devices:
    raise RuntimeError('Metal GPU unavailable; CPU Cycles fallback is forbidden.')
scene.cycles.device = 'GPU'
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 2
scene.cycles.transparent_max_bounces = 6
scene.cycles.use_denoising = True
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
if not hasattr(scene.cycles, 'denoising_use_gpu'):
    raise RuntimeError('Explicit GPU OIDN setting unavailable in this Blender.')
scene.cycles.denoising_use_gpu = True
scene.render.threads_mode = 'AUTO'
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
conversion = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
report = {'source': str(args.scene.resolve()), 'sourceBlendSha256': source_sha,
          'cameraIndex': {'path': str(args.camera_index.resolve()), 'sha256': sha(args.camera_index)},
          'device': 'METAL', 'devices': devices, 'denoiser': 'OPENIMAGEDENOISE',
          'denoisingUseGPU': True, 'threads': 'AUTO', 'samples': args.samples,
          'look': args.look, 'visitorBasis': args.visitor, 'images': [],
          'lighting': baker.lighting_metadata(baker.snapshot_lighting(scene)),
          'sourceSceneExtras': {key: scene[key] for key in scene.keys() if key.startswith('static_')}}
for held in cameras:
    world = held.get('worldMatrix', held.get('world'))
    projection = held.get('projectionMatrix', held.get('projection'))
    if any(abs(projection[i]) > 1e-9 for i in [8, 9]):
        raise RuntimeError('Off-axis projection requires explicit validation before use.')
    width, height = held['width'], held['height']
    data = bpy.data.cameras.new('Held_' + held['viewport'] + '_' + held['name'])
    data.sensor_fit, data.sensor_height = 'VERTICAL', 24
    data.lens = 12 * projection[5]
    data.clip_start = projection[14] / (projection[10] - 1)
    data.clip_end = projection[14] / (projection[10] + 1)
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    camera.matrix_world = conversion @ Matrix([world[i:i+4] for i in range(0, 16, 4)]).transposed()
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = width, height
    calculated = camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(), x=width, y=height)
    target = Matrix([projection[i:i+4] for i in range(0, 16, 4)]).transposed()
    error = max(abs(calculated[i][j] - target[i][j]) for i in range(4) for j in range(4))
    if error > 2e-5:
        raise RuntimeError('Held projection mismatch: ' + str(error))
    output = args.output / held['viewport'] / (held['name'] + '.png')
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise RuntimeError('Existing held still refused: ' + str(output))
    scene.render.filepath = str(output)
    print('HELD_PREVIEW_START', held['viewport'], held['name'], flush=True)
    bpy.ops.render.render(write_still=True)
    report['images'].append({'path': str(output), 'sha256': sha(output), 'camera': held,
                             'maximumProjectionElementError': error,
                             'worldBlender': [list(row) for row in camera.matrix_world]})
    (args.output / 'preview-in-progress.json').write_text(json.dumps(report, indent=2) + '\n')
    print('HELD_PREVIEW_READY', str(output), flush=True)
if sha(args.scene) != source_sha:
    raise RuntimeError('Authored source changed while native previews ran.')
report['sourceByteUnchanged'] = True
report['scriptSha256'] = sha(__file__)
(args.output / 'preview.json').write_text(json.dumps(report, indent=2) + '\n')
