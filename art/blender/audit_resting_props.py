"""Read-only evaluated resting-prop audit, anchor proof and tolerance challenges.

blender --background --python-exit-code 1 --python art/blender/audit_resting_props.py -- \
  --blend art/build/snow-roof-resting-contacts.blend --challenge \
  --legacy art/build/snow-roof-stair-banks-grain.blend \
  --out art/build/snow-roof-resting-contacts.audit.json

No render, bake, encoding or saved model mutation occurs. Challenge translations
only affect the loaded unsaved scene, and every matrix is restored exactly.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from resting_contacts import RestingContacts, engine


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def static_snapshot():
    result = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.data.collections['STATIC'].objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        h = hashlib.sha256()
        coords = array('f', [0]) * (len(mesh.vertices) * 3)
        mesh.vertices.foreach_get('co', coords)
        loops = array('i', [0]) * len(mesh.loops)
        mesh.loops.foreach_get('vertex_index', loops)
        starts = array('i', [0]) * len(mesh.polygons)
        totals = array('i', [0]) * len(mesh.polygons)
        mesh.polygons.foreach_get('loop_start', starts)
        mesh.polygons.foreach_get('loop_total', totals)
        for value in [coords, loops, starts, totals]:
            h.update(value.tobytes())
        h.update(array('f', [v for row in obj.matrix_world for v in row]).tobytes())
        uv = mesh.uv_layers.get('UVMap')
        if uv:
            values = array('f', [0]) * (len(mesh.loops) * 2)
            uv.data.foreach_get('uv', values)
            h.update(values.tobytes())
        h.update(json.dumps([m.name if m else None for m in mesh.materials]).encode())
        result[obj.name] = {'sha256': h.hexdigest(), 'vertices': len(mesh.vertices),
                            'polygons': len(mesh.polygons)}
        evaluated.to_mesh_clear()
    return result


def light_snapshot():
    return {obj.name: {'positionEngine': engine(obj.matrix_world.translation),
                       'rotation': list(obj.rotation_euler), 'energy': obj.data.energy,
                       'color': list(obj.data.color), 'type': obj.data.type,
                       'softSize': obj.data.shadow_soft_size if obj.data.type == 'POINT' else obj.data.angle,
                       'role': obj.get('bake_role')}
            for obj in bpy.context.scene.objects if obj.type == 'LIGHT'}


def crown(registry, obj):
    points = [p for _, _, p in registry.vertices([obj])]
    highest = max(p.z for p in points)
    top = [p for p in points if abs(p.z - highest) < .000001]
    return sum(points, Vector()) / len(points), sum(top, Vector()) / len(top)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--legacy', type=Path)
parser.add_argument('--challenge', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
args.blend = args.blend.resolve()
args.out = args.out.resolve()
if not args.out.is_relative_to(ROOT) or args.out.exists():
    raise RuntimeError('New repository audit output required')
source_hash = sha(args.blend)
bpy.ops.wm.open_mainfile(filepath=str(args.blend))
registry = RestingContacts.from_scene()
audit = registry.audit(fail=True, write_metadata=False)
source_scripts=[ROOT/'art/blender/snow_roof.py',ROOT/'art/blender/resting_contacts.py',Path(__file__).resolve()]
source_scripts.extend(ROOT/p for p in json.loads(bpy.context.scene.get('source_authoring_helpers','[]')))
report = {'source': {'path': str(args.blend.relative_to(ROOT)), 'sha256': source_hash},
          'sourceScripts': {str(p.relative_to(ROOT)): sha(p) for p in set(source_scripts)},
          'contactAudit': audit, 'renderBakeEncoderGpuJobs': 0,
          'savedModelMutations': False}
prefixes = ['Scanned console altar', 'Turned altar side lamp pedestal', 'Scanned screen leaf',
            'Gilded screen edge molding', 'Other altar lamp', 'Brass incense burner',
            'Brass burner foot', 'Ash mound', 'Charred incense', 'Smouldering incense',
            'Soft sewn kneeling cushion', 'Cushion sewn edge piping', 'Broom handle',
            'Broom straw', 'Stacked plain bowls', 'Gate shelf lamp',
            'Wall-fastened screen bearing rail', 'Screen rail wall fastener','Court stone lantern','Court lantern oil cup','Court incense','Court spent incense','Offering']
members = {name for entry in registry.entries for name in entry['members']}
candidates = [obj.name for obj in bpy.context.scene.objects
              if obj.name in members or any(obj.name.startswith(prefix) for prefix in prefixes)]
unowned = sorted(set(candidates) - members)
if unowned:
    raise RuntimeError('Unregistered resting prop inventory: ' + json.dumps(unowned))
report['inventory'] = {'candidateObjects': len(candidates), 'registeredGroups': len(registry.entries),
                       'unregisteredCandidates': unowned,
                       'classification': json.loads(bpy.context.scene['resting_prop_inventory'])}
report['wicks'] = json.loads(bpy.context.scene['static_lamp_wicks_engine'])
report['incenseTips'] = json.loads(bpy.context.scene['static_incense_tips_engine'])
report['incenseSmokeEngine'] = json.loads(bpy.context.scene['static_incense_smoke_engine'])
report['anchorMetadataFields']=json.loads(bpy.context.scene.get('one_light_anchor_fields',json.dumps(['static_lamp_wicks_engine','static_incense_tips_engine','static_incense_smoke_engine','static_incense_smoke_source'])))
report['anchorMetadata']={field:bpy.context.scene[field] for field in report['anchorMetadataFields']}
for row in report['wicks']:
    center, tip = crown(registry, bpy.data.objects[row['wickObject']])
    actual_light = engine(bpy.data.objects[row['pointLightObject']].matrix_world.translation)
    for label, actual in [('wickCenter', engine(center)), ('wickTip', engine(tip)),
                          ('flameAnchor', engine(tip + Vector((0, 0, .003)))), ('pointLight', actual_light)]:
        if max(abs(a-b) for a,b in zip(actual,row[label])) > .000001:
            raise RuntimeError('Source anchor differs from actual evaluated geometry: '+row['name']+'/'+label)
    actual_watts=float(bpy.data.objects[row['pointLightObject']].data.energy)
    if 'linearColor' in row and max(abs(a-b) for a,b in zip(row['linearColor'],bpy.data.objects[row['pointLightObject']].data.color))>.000001:
        raise RuntimeError('Static fixture linear RGB metadata differs from actual source')
    if abs(actual_watts-row.get('actualWatts',8))>.000001 or (row.get('lit') is False and actual_watts!=0):
        raise RuntimeError('Static fixture energy/state metadata differs from actual source')
for row in report['incenseTips']:
    _, tip = crown(registry, bpy.data.objects[row['object']])
    if max(abs(a-b) for a,b in zip(engine(tip),row['tipEngine'])) > .000001:
        raise RuntimeError('Incense tip metadata differs from actual evaluated geometry')
smoke = sum((Vector(row['tipEngine']) for row in report['incenseTips']), Vector()) / len(report['incenseTips'])
smoke.y += .006
if max(abs(a-b) for a,b in zip(smoke,report['incenseSmokeEngine'])) > .000001:
    raise RuntimeError('Smoke anchor differs from actual tips')
report['anchorCorrespondencePassed'] = True
if args.challenge:
    target = next(entry for entry in registry.entries if entry['name'] == 'altar -0.95')
    objects = [bpy.data.objects[name] for name in target['members']]
    original = {obj: obj.matrix_world.copy() for obj in objects}
    challenges = []
    for delta in [.003, -.006]:
        for obj, matrix in original.items():
            obj.matrix_world = matrix
        registry.shift(objects, delta)
        tested = registry.audit(fail=False, write_metadata=False)
        row = next(group for group in tested['groups'] if group['name'] == target['name'])
        measured = row['final']
        caught = (measured['contact']['gapMetres'] > registry.GAP_LIMIT if delta > 0
                  else measured['maximumPenetrationMetres'] > registry.PENETRATION_LIMIT)
        if tested['passed'] or not caught:
            raise RuntimeError('Requested tolerance challenge failed to trigger')
        challenges.append({'group': target['name'], 'unsavedTranslationEngine': [0,delta,0],
                           'caught': True, 'measurement': measured})
    for obj, matrix in original.items():
        obj.matrix_world = matrix
    registry.audit(fail=True, write_metadata=False)
    report['toleranceChallenges'] = challenges
    report['challengeMatricesRestoredExact'] = all(obj.matrix_world == matrix for obj,matrix in original.items())
new_snapshot = static_snapshot()
new_lights = light_snapshot()
report['staticMeshCount'] = len(new_snapshot)
if args.legacy:
    args.legacy = args.legacy.resolve()
    legacy_hash = sha(args.legacy)
    bpy.ops.wm.open_mainfile(filepath=str(args.legacy))
    legacy_registry = RestingContacts()
    console = [obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith('Scanned console altar')]
    baselines = []
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or not obj.name.startswith('Other altar lamp bronze foot'):
            continue
        points = legacy_registry.vertices([obj])
        mean_x = sum(p.x for _,_,p in points)/len(points)
        if abs(abs(mean_x)-.95) < .001:
            baselines.append({'object':obj.name, 'xEngine':mean_x,
                              'measurement':legacy_registry.measure([obj],console)})
    report['legacy'] = {'path':str(args.legacy.relative_to(ROOT)), 'sha256':legacy_hash,
                         'innerLampSanity':baselines}
    old_snapshot = static_snapshot()
    changed = sorted(name for name in set(new_snapshot)&set(old_snapshot)
                     if new_snapshot[name]!=old_snapshot[name])
    report['geometryComparison'] = {'newMeshCount':len(new_snapshot), 'legacyMeshCount':len(old_snapshot),
                                    'added':sorted(set(new_snapshot)-set(old_snapshot)),
                                    'removed':sorted(set(old_snapshot)-set(new_snapshot)),
                                    'changed':changed, 'unchanged':len(set(new_snapshot)&set(old_snapshot))-len(changed),
                                    'changedOutsideRegisteredProps':sorted(set(changed)-members),
                                    'method':'Actual evaluated mesh vertex/topology/UV0/material-name bytes and world matrix; no bounding proxy.'}
    old_lights = light_snapshot()
    report['lights'] = {'before':old_lights, 'after':new_lights,
                        'changed':[name for name in set(old_lights)&set(new_lights) if old_lights[name]!=new_lights[name]],
                        'added':sorted(set(new_lights)-set(old_lights)), 'removed':sorted(set(old_lights)-set(new_lights))}
    if sha(args.legacy)!=legacy_hash:
        raise RuntimeError('Legacy source file changed')
if sha(args.blend)!=source_hash:
    raise RuntimeError('Audited source file changed')
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('RESTING_CONTACT_AUDIT_PASS',json.dumps({'source':report['source'],'out':str(args.out),
      'sha256':sha(args.out),'groups':len(audit['groups']),'wicks':report['wicks'],
      'incenseSmokeEngine':report['incenseSmokeEngine'],
      'comparison':report.get('geometryComparison')}),flush=True)
