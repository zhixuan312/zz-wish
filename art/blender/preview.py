"""Reproducible low-sample Cycles Metal GPU previews, without changing the source blend."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--scene', default=str(ROOT / 'art/build/snow-roof.blend'))
parser.add_argument('--cameras', default='Reference_walk-3,Reference_outside')
parser.add_argument('--output', default=str(ROOT / 'art/build/snow-roof-preview'))
parser.add_argument('--samples', type=int, default=8)
parser.add_argument('--width', type=int, default=720)
parser.add_argument('--height', type=int, default=450)
parser.add_argument('--hide-roof-snow', action='store_true', help='Construction diagnostic only; transient visibility, never saved to blend.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL'
prefs.get_devices()
metal_devices=[]
for device in prefs.devices:
    device.use=device.type=='METAL'
    if device.use:metal_devices.append(device.name)
if not metal_devices:raise RuntimeError('No Metal GPU available; previews require the M1 Metal device.')
scene.cycles.device='GPU'
scene.cycles.denoiser='OPENIMAGEDENOISE'
if hasattr(scene.cycles,'denoising_use_gpu'):scene.cycles.denoising_use_gpu=True
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 2
scene.cycles.transparent_max_bounces = 6
scene.cycles.use_denoising = True
scene.render.threads_mode = 'AUTO'
scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
metadata = {'scene': str(Path(args.scene).resolve()), 'blendSha256': hashlib.sha256(Path(args.scene).read_bytes()).hexdigest(), 'sourceSha256': hashlib.sha256((ROOT/'art/blender/snow_roof.py').read_bytes()).hexdigest(), 'device': 'METAL', 'devices': metal_devices, 'denoiser': 'OPENIMAGEDENOISE', 'samples': args.samples,
            'size': [args.width, args.height], 'maxBounces': 4, 'cameras': [], 'constructionDiagnostic': args.hide_roof_snow, 'hiddenRoofSnow': []}
hidden_roof_snow=[]
if args.hide_roof_snow:
    metadata['diagnosticNote']='Only roof snow temporarily hidden to inspect tile-course construction. Lighting and geometry unchanged; final deep-snow scene is retained in the unsaved source blend.'
    for obj in scene.objects:
        if 'curved settled snow cap' in obj.name or 'settled roof snow' in obj.name:
            hidden_roof_snow.append((obj,obj.hide_render));obj.hide_render=True;metadata['hiddenRoofSnow'].append(obj.name)
for name in args.cameras.split(','):
    camera = bpy.data.objects.get(name)
    inspection_poses = {
        'BeamJoineryDetail': ((.2,3.6,-.2),(1.6,4.85,-2.18)),
        'TileCourseDetail': ((1.0,6.35,5.8),(0.0,5.58,3.95)),
        'StepEdgeDetail': ((1.3,.85,6.6),(.15,.45,5.15)),
        'StepWearDetail': ((-.3,.64,5.93),(-.2,.4,5.2)),
        'ClutterDetail': ((2.4,1.85,-.8),(0,1.2,-4.75)),
    }
    if camera is None and name in inspection_poses:
        location,target=inspection_poses[name]
        data=bpy.data.cameras.new(name);data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=41.848973326090906
        camera=bpy.data.objects.new(name,data);scene.collection.objects.link(camera)
        camera.location=Vector((location[0],-location[2],location[1]))
        target=Vector((target[0],-target[2],target[1]))
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    if camera is None or camera.type != 'CAMERA':
        raise ValueError('Missing camera: ' + name)
    scene.camera = camera
    path = output / (name + '.png')
    scene.render.filepath = str(path)
    print('ONE_LIGHT_PREVIEW_START', name, 'METAL', metal_devices, flush=True)
    bpy.ops.render.render(write_still=True)
    metadata['cameras'].append({'name': name, 'path': str(path), 'position': list(camera.location),
                                'rotationEuler': list(camera.rotation_euler), 'lens': camera.data.lens,
                                'sensorFit': camera.data.sensor_fit, 'sensorHeight': camera.data.sensor_height})
    print('ONE_LIGHT_PREVIEW_READY', str(path), flush=True)
for obj,hidden in hidden_roof_snow:
    obj.hide_render=hidden
(output / 'preview.json').write_text(json.dumps(metadata, indent=2) + '\n')
