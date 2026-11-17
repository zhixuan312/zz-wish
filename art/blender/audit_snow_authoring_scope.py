"""Read-only bounded Source13 geometry/material-UV/normal/lighting scope proof."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before',type=Path,required=True)
parser.add_argument('--after',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--allow-lamp-radius-metadata',action='store_true',help='Root-approved measured pointRadiusMetres addition only; actual light data must remain unchanged.')
parser.add_argument('--tree-only',action='store_true',help='Reject any non-tree geometry/UV/normal/tint/inventory change, including otherwise authorized source13 families.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def f32(values):return struct.pack('<'+'f'*len(values),*(0 if v==0 else v for v in values))
def digest(rows):return hashlib.sha256(b''.join(sorted(rows))).hexdigest()
def engine(p):return [float(p.x),float(p.z),float(-p.y)]
def snapshot(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    scene=bpy.context.scene;graph=bpy.context.evaluated_depsgraph_get();objects={}
    groups=json.loads(scene['resting_contact_groups'])
    members={name for group in groups for name in group['members']}
    for obj in bpy.data.collections['STATIC'].objects:
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
        normal_matrix=evaluated.matrix_world.to_3x3().inverted().transposed()
        positions=[evaluated.matrix_world@v.co for v in mesh.vertices];uv=mesh.uv_layers['UVMap'].data
        normals=defaultdict(list);uvs=defaultdict(list);tints=defaultdict(list);tint=mesh.color_attributes.get('SurfaceTint')
        for polygon in mesh.polygons:
            for li in polygon.loop_indices:
                vi=mesh.loops[li].vertex_index;key=f32(positions[vi]);normal=(normal_matrix@mesh.corner_normals[li].vector).normalized()
                normals[key].append(tuple(normal));uvs[key].append(tuple(uv[li].uv))
                if tint:tints[key].append(tuple(tint.data[li].color))
        objects[obj.name]={'positions':digest(f32(p) for p in positions),'normals':{k:sorted(v) for k,v in normals.items()},
                           'uv0':{k:sorted(v) for k,v in uvs.items()},'tint':{k:sorted(v) for k,v in tints.items()},
                           'materials':[m.name for m in mesh.materials],
                           'paint':any(m.get('one_light_painted_timber') for m in mesh.materials),
                           'plaster':any(m.get('one_light_base_weathering') for m in mesh.materials),
                           'bounds':{'min':[min(engine(p)[k] for p in positions) for k in range(3)],'max':[max(engine(p)[k] for p in positions) for k in range(3)]}}
        evaluated.to_mesh_clear()
    fields=json.loads(scene['one_light_anchor_fields'])
    lights={o.name:{'matrix':[list(row) for row in o.matrix_world],'watts':o.data.energy,'linearColor':list(o.data.color),
                    'size':o.data.shadow_soft_size if o.data.type=='POINT' else o.data.angle,'role':o.get('bake_role')}
            for o in scene.objects if o.type=='LIGHT'}
    background=scene.world.node_tree.nodes['Background']
    lighting={'lights':lights,'worldRGBA':list(background.inputs['Color'].default_value),'worldStrength':background.inputs['Strength'].default_value,
              'view':{k:getattr(scene.view_settings,k) for k in ['view_transform','look','exposure','gamma']}}
    return objects,lighting,{k:scene[k] for k in fields},members,json.loads(scene['source_geometry_budget'])

def maximum(a,b):
    if set(a)!=set(b) or any(len(a[k])!=len(b[k]) for k in a):return None
    error=0
    for key,rows in a.items():
        remaining=list(b[key])
        for row in rows:
            index=min(range(len(remaining)),key=lambda i:max(abs(x-y) for x,y in zip(row,remaining[i])))
            target=remaining.pop(index);error=max(error,max(abs(x-y) for x,y in zip(row,target)))
    return error

before_hash,after_hash=sha(args.before),sha(args.after)
before,light_before,anchors_before,members_before,geometry_before=snapshot(args.before)
after,light_after,anchors_after,members_after,geometry_after=snapshot(args.after)
anchor_compatible=anchors_before==anchors_after;radius_addition=None
if args.allow_lamp_radius_metadata:
    old=json.loads(anchors_before['one_light_lamp_basis']);new=json.loads(anchors_after['one_light_lamp_basis'])
    radius=new.pop('pointRadiusMetres',None);expected=light_after['lights']['Visitor flame bake basis']['size']
    normalized=dict(anchors_after);normalized['one_light_lamp_basis']=anchors_before['one_light_lamp_basis']
    anchor_compatible=old==new and radius==expected and normalized==anchors_before
    radius_addition={'field':'one_light_lamp_basis.pointRadiusMetres','actualSourceLightRadius':expected,'metadataRadius':radius,'passed':anchor_compatible}
allowed_geometry=('Winter tree ','Continuous snowfield ','Court front wall','Court side wall','Court back wall',
                  'Front wall base stone','Side wall base stone','Back wall base stone',
                  'Front wall exposed irregular','Side wall exposed irregular','Back wall exposed irregular','Gate exposed irregular',
                  'Red door plank','Door rear batten','Worn bronze door stud','Forged door hinge strap','Door ring backplate','Forged door pull ring',
                  'Door jamb fixed hinge','Door hinge full','Door fixed jamb hinge','Door hinge plate to','Door leaf revolving hinge')
def authorized(name):return name.startswith(allowed_geometry) or 'curved settled snow cap' in name
added=sorted(set(after)-set(before));removed=sorted(set(before)-set(after));changed=[];violations=[];prop_errors=[]
max_normal=max_uv=max_tint=0
for name in sorted(set(before)&set(after)):
    a,b=before[name],after[name];geometry=a['positions']!=b['positions']
    normal=maximum(a['normals'],b['normals']);uv=maximum(a['uv0'],b['uv0']);tint=maximum(a['tint'],b['tint'])
    if normal is not None and not geometry:max_normal=max(max_normal,normal)
    if uv is not None and not geometry and not b['paint']:max_uv=max(max_uv,uv)
    if tint is not None and not geometry and not (b['paint'] or b['plaster']):max_tint=max(max_tint,tint)
    row={'name':name,'geometryChanged':geometry,'maximumNormalComponentError':normal,'maximumUV0Error':uv,'maximumTintError':tint,
         'paintUVAndTintChangeAuthorized':b['paint'],'plasterTintChangeAuthorized':b['plaster'],'materialsChanged':a['materials']!=b['materials']}
    if geometry or normal is None or uv is None or tint is None or max(normal or 0,uv or 0,tint or 0)>1e-6:changed.append(row)
    if geometry and not authorized(name):violations.append(row)
    if not geometry and ((normal is None or normal>1e-6) or (not b['paint'] and (uv is None or uv>1e-6)) or (not (b['paint'] or b['plaster']) and (tint is None or tint>1e-6))):violations.append(row)
    if name in members_before and (geometry or normal is None or normal>1e-6 or uv is None or uv>1e-6 or tint is None or tint>1e-6):prop_errors.append(row)
    if args.tree_only and not name.startswith('Winter tree ') and (geometry or normal is None or normal>1e-6 or uv is None or uv>1e-6 or tint is None or tint>1e-6 or a['materials']!=b['materials']):violations.append(row)
for name in added+removed:
    if not authorized(name):violations.append({'name':name,'inventoryChange':'added' if name in added else 'removed'})
    if args.tree_only and not name.startswith('Winter tree '):violations.append({'name':name,'treeOnlyInventoryViolation':True})
door_names=[name for name in after if name.startswith(('Red door plank','Door rear batten','Worn bronze door stud','Forged door hinge strap','Door ring backplate','Forged door pull ring','Door leaf revolving hinge'))]
door_bounds={name:after[name]['bounds'] for name in door_names}
minimum_abs_x=min(min(abs(b['min'][0]),abs(b['max'][0])) for b in door_bounds.values())
minimum_z=min(b['min'][2] for b in door_bounds.values())
planks=[after[n]['bounds'] for n in door_names if n.startswith('Red door plank')]
door={'objects':len(door_names),'bounds':door_bounds,'minimumAbsoluteLeafXMetres':minimum_abs_x,'minimumLeafZMetres':minimum_z,
      'walkingOpeningWidthMetres':3.10,'walkingOpeningX':[-1.55,1.55],'outerJambFaceZ':2.41,
      'plankBottomY':min(b['min'][1] for b in planks),'plankTopY':max(b['max'][1] for b in planks),'thresholdTopY':.65,
      'allLeavesOutsideWalkingOpening':minimum_abs_x>1.55,'allLeavesBeyondOuterJambFace':minimum_z>2.41}
report={'scope':'Actual evaluated Source12→Source13 comparison. Geometry changes authorized only for exterior trees/walls/masonry/roof snow/stair drift and outward doors; paint material UV/tint plus plaster weathering are explicit. No source mutation/render/bake.',
        'inputs':{'before':{'path':str(args.before),'sha256':before_hash},'after':{'path':str(args.after),'sha256':after_hash}},
        'treeOnlyRevisionRequired':args.tree_only,
        'addedObjects':added,'removedObjects':removed,'changedObjects':changed,'outOfScope':violations,
        'registeredPropMeshes':len(members_before),'registeredPropMembershipExact':members_before==members_after,'registeredPropGeometryUVNormalTintViolations':prop_errors,
        'lightingWorldExposureByteValueExact':light_before==light_after,'allRuntimeAnchorConfigFieldsByteValueExact':anchors_before==anchors_after,
        'allExistingRuntimeAnchorConfigFieldsExact':anchor_compatible,'authorizedMeasuredRadiusMetadataAddition':radius_addition,
        'unchangedGeometryMaximumNormalComponentError':max_normal,'unchangedNonPaintMaximumUV0Error':max_uv,'unchangedNonPaintNonPlasterMaximumTintError':max_tint,
        'geometryBefore':geometry_before,'geometryAfter':geometry_after,'doorClearance':door,
        'scriptSha256':sha(Path(__file__))}
report['passed']=not violations and not prop_errors and members_before==members_after and light_before==light_after and anchor_compatible and door['allLeavesOutsideWalkingOpening'] and door['allLeavesBeyondOuterJambFace'] and door['plankBottomY']>.65 and door['plankTopY']<4.11
if sha(args.before)!=before_hash or sha(args.after)!=after_hash:raise RuntimeError('Frozen source file changed')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE13_SCOPE',json.dumps({'passed':report['passed'],'path':str(args.out),'sha256':sha(args.out),'outOfScope':len(violations),'propViolations':len(prop_errors),'maxNormalError':max_normal,'doorClearWidth':minimum_abs_x*2,'triangles':geometry_after['totalTriangles']}),flush=True)
if not report['passed']:raise RuntimeError('Actual scope/door gate requires review')
