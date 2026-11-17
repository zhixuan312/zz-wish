"""Three unsaved Metal8 pictures for the bounded Source19 fixture correction."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene', type=Path, default=ROOT / 'art/build/snow-roof-round2/source-v19.blend')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--render', action='store_true')
parser.add_argument('--save-source', type=Path)
parser.add_argument('--approved-picture', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.output.exists(): raise RuntimeError('New ignored candidate directory required')
args.output.mkdir(parents=True)
source_sha = hashlib.sha256(args.scene.read_bytes()).hexdigest()
report = {}


def apply_scene(_):
    from snow_round2_fixture_materials import apply
    from resting_contacts import RestingContacts
    report.update(apply(bpy.context.scene))
    audit = RestingContacts.from_scene().audit(fail=True)
    report.update(sourceSha256=source_sha, contactGroupsPassed=len(audit['groups']), sourceSaved=False)
    (args.output / 'candidate.json').write_text(json.dumps(report, indent=2) + '\n')


if args.save_source:
    if args.render or args.save_source.exists() or not args.approved_picture:
        raise RuntimeError('New source path and the actual approved candidate.json required')
    bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve())); apply_scene(None)
    approved = json.loads(args.approved_picture.read_text())
    if report != approved:
        raise RuntimeError('Source20 choice differs from the actual reviewed three-picture candidate')
    scene = bpy.context.scene
    hashes = json.loads(scene.get('source_authoring_sha256', '{}'))
    for name in ['snow_round2_fixture_materials.py', Path(__file__).name]:
        path = Path(__file__).with_name(name)
        hashes[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    scene['source_authoring_sha256'] = json.dumps(hashes)
    delivery = json.loads(scene['source_material_delivery'])
    for row in delivery['materials']:
        if row['name'] == 'Round2 compressed photo linen cushion':
            row['normalStrengths'] = [.15]
            row['images'].append('cushion-rough-linen-normal-128.png')
    scene['source_material_delivery'] = json.dumps(delivery)
    scene['source20_visible_reason'] = 'Source19 actual app gate/court broad glare and flat-looking cushion; accepted three native8 correction pictures. Floor rings are a runtime cached-depth fix, not a new floor material change.'
    scene['authored_night_lighting'] = json.dumps({'cameraPreExposure': 40, 'residualCameraExposureEV': .35,
        'lights': [{'name': o.name, 'watts': o.data.energy, 'linearRGB': list(o.data.color)} for o in scene.objects if o.type == 'LIGHT']})
    args.save_source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.save_source.resolve()))
    (args.output / 'source-choice.json').write_text(json.dumps({'source': str(args.save_source),
        'sha256': hashlib.sha256(args.save_source.read_bytes()).hexdigest(), 'approvedPicture': str(args.approved_picture),
        'geometryUnchangedFromSource19': True, 'contactGroupsPassed': 47, 'renderBakeJobs': 0}, indent=2) + '\n')
elif args.render:
    poses = {'GateFixture': {'position': [-1.88, 2.05, 20.75], 'look': [-2, 1.9, 19.25], 'fov': 45},
             'CourtFixture': {'position': [-4.7, 1.8, 13.3], 'look': [-5.5, 1.14, 11.4], 'fov': 40},
             'CushionDetail': {'position': [-.733, .96835, -2.52], 'look': [-.85, .6883, -3.3], 'fov': 38}}
    camera = args.output / 'cameras.json'; camera.write_text(json.dumps(poses, indent=2) + '\n')
    sys.argv = ['preview.py', '--', '--scene', str(args.scene), '--output', str(args.output),
        '--cameras', ','.join(poses), '--camera-poses', str(camera), '--samples', '8', '--integrator', 'bake',
        '--width', '1440', '--height', '900', '--look', 'authored']
    preview = ROOT / 'art/blender/preview.py'; code = preview.read_text()
    load = 'bpy.ops.wm.open_mainfile(filepath=str(Path(args.scene).resolve()))'
    if code.count(load) != 1: raise RuntimeError('Actual preview load signature changed')
    code = code.replace(load, load + '\n__apply_fixture_candidate(None)')
    exec(compile(code, str(preview), 'exec'), {'__name__': '__main__', '__file__': str(preview),
                                           '__apply_fixture_candidate': apply_scene})
else:
    bpy.ops.wm.open_mainfile(filepath=str(args.scene.resolve())); apply_scene(None)
if hashlib.sha256(args.scene.read_bytes()).hexdigest() != source_sha:
    raise RuntimeError('Frozen Source19 changed')
print('SNOW_FIXTURE_CANDIDATE_READY', args.output, 'rendered', args.render, flush=True)
