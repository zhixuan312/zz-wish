"""Reproducible low-sample Cycles Metal GPU previews, without changing the source blend."""
import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--scene', default=str(ROOT / 'art/build/snow-roof.blend'))
parser.add_argument('--cameras', default='Reference_walk-3,Reference_outside')
parser.add_argument('--camera-poses', type=Path, help='Optional measured world Y-up camera definitions; unsaved preview-only cameras.')
parser.add_argument('--output', default=str(ROOT / 'art/build/snow-roof-preview'))
parser.add_argument('--samples', type=int, default=8)
parser.add_argument('--integrator', choices=['bake','legacy'], default='bake', help='Match the actual fixed-sample bake by default. Legacy reproduces the earlier adaptive low-bounce preview only, not a bake comparison.')
parser.add_argument('--lamp-watts', type=float, help='Unsaved lamp-power proposal, explicitly reported as a preview override.')
parser.add_argument('--width', type=int, default=720)
parser.add_argument('--height', type=int, default=450)
parser.add_argument('--look', choices=['authored','night','dusk','day'], default='authored')
parser.add_argument('--fixture-factor', type=float, help='Preview-only day fixture/emission override; canonical bake presets are unchanged.')
parser.add_argument('--view-transform', help='Explicit preview colour-management restoration for prepared scenes; recorded in metadata.')
parser.add_argument('--hide-roof-snow', action='store_true', help='Construction diagnostic only; transient visibility, never saved to blend.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))
scene = bpy.context.scene
source_view = json.loads(scene.get('one_light_source_view_settings', '{}'))
for name, value in source_view.items():
    setattr(scene.view_settings, name, value)
if args.view_transform:
    scene.view_settings.view_transform = args.view_transform
preview_overrides = {}
if args.fixture_factor is not None and (args.look != 'day' or not 0 <= args.fixture_factor <= 1):
    raise ValueError('--fixture-factor is a day-only preview override in [0,1].')
spec=importlib.util.spec_from_file_location('one_light_bake',ROOT/'art/blender/bake_export.py')
baker=importlib.util.module_from_spec(spec);spec.loader.exec_module(baker)
if args.look!='authored':
    if args.fixture_factor is not None:
        baker.PRESETS['day'] = {**baker.PRESETS['day'], 'fixtures': args.fixture_factor}
        preview_overrides['fixtures'] = args.fixture_factor
    baker.configure_light_pass(scene,args.look,baker.snapshot_lighting(scene))
preview_view = {name:getattr(scene.view_settings,name) for name in ['view_transform','look','exposure','gamma']}
legacy_adaptive = scene.cycles.use_adaptive_sampling
baker.configure_cycles(scene,SimpleNamespace(samples=args.samples,device='METAL',skip_bake=False,export_only=False))
for name,value in preview_view.items():
    setattr(scene.view_settings,name,value)
prefs=bpy.context.preferences.addons['cycles'].preferences
metal_devices=[device.name for device in prefs.devices if device.use and device.type=='METAL']
if not metal_devices:raise RuntimeError('No Metal GPU available; previews require the M1 Metal device.')
scene.cycles.device='GPU'
scene.cycles.denoiser='OPENIMAGEDENOISE'
if hasattr(scene.cycles,'denoising_use_gpu'):scene.cycles.denoising_use_gpu=True
if args.integrator=='legacy':
    scene.cycles.use_adaptive_sampling=legacy_adaptive
    scene.cycles.max_bounces=4
    scene.cycles.diffuse_bounces=2
    scene.cycles.glossy_bounces=2
    scene.cycles.transmission_bounces=2
    scene.cycles.transparent_max_bounces=6
scene.cycles.use_denoising = True
scene.render.threads_mode = 'AUTO'
scene.render.resolution_x, scene.render.resolution_y = args.width, args.height
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)
metadata = {'scene': str(Path(args.scene).resolve()), 'blendSha256': hashlib.sha256(Path(args.scene).read_bytes()).hexdigest(), 'sourceSha256': hashlib.sha256((ROOT/'art/blender/snow_roof.py').read_bytes()).hexdigest(), 'device': 'METAL', 'devices': metal_devices, 'denoiser': 'OPENIMAGEDENOISE', 'samples': args.samples,
            'size': [args.width, args.height], 'colourManagement':{name:getattr(scene.view_settings,name) for name in ['view_transform','look','exposure','gamma']}, 'look':args.look, 'previewOnlyOverrides':preview_overrides, 'lightingCandidate':bool(preview_overrides), 'appliedPreset':dict(baker.PRESETS[args.look]) if args.look!='authored' else None, 'maxBounces':scene.cycles.max_bounces,'integratorRecipe':args.integrator,'integrator':baker.cycles_integrator_settings(scene),'sampleBudgetMeaning':'Configured fixed budget with adaptive stopping disabled' if args.integrator=='bake' else 'Historical adaptive maximum; not an integrator-matched bake reference','bakerSha256':hashlib.sha256((ROOT/'art/blender/bake_export.py').read_bytes()).hexdigest(),'previewScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'cameras': [], 'constructionDiagnostic': args.hide_roof_snow, 'hiddenRoofSnow': []}
if args.camera_poses:
    camera_bytes = args.camera_poses.resolve().read_bytes()
    poses = json.loads(camera_bytes)
    metadata['cameraPoses'] = {'path': str(args.camera_poses.resolve()), 'sha256': hashlib.sha256(camera_bytes).hexdigest(), 'scope': 'Unsaved measured world Y-up projections only.'}
    for name, pose in poses.items():
        if bpy.data.objects.get(name):
            raise ValueError('Preview pose must use a new camera name: ' + name)
        data = bpy.data.cameras.new(name)
        data.sensor_fit = 'VERTICAL'
        data.sensor_height = 24
        import math
        data.lens = 12 / math.tan(math.radians(pose['fov']) / 2)
        camera = bpy.data.objects.new(name, data)
        scene.collection.objects.link(camera)
        position, look = pose['position'], pose['look']
        camera.location = Vector((position[0], -position[2], position[1]))
        target = Vector((look[0], -look[2], look[1]))
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
if args.lamp_watts is not None:
    if args.lamp_watts <= 0:
        raise ValueError('Positive preview lamp wattage required')
    candidates = [o for o in scene.objects if o.type == 'LIGHT' and o.get('bake_role') == 'lamp']
    if len(candidates) != 1:
        raise ValueError('Exactly one authored visitor lamp required')
    candidates[0].data.energy = args.lamp_watts
    preview_overrides['lampWatts'] = args.lamp_watts
    metadata['lightingCandidate'] = True
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
        'StepSnowDetail': ((0,1.72,8.5),(0,.62,4.9)),
        'StepBanksWide': ((0,1.72,10.2),(0,.65,5.1)),
        'StepBankDetail': ((3.0,1.25,7.35),(1.25,.45,5.25)),
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
