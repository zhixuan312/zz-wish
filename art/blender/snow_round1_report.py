"""Read frozen Snow source metadata and emit camera/metric handoff, CPU only."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--blend',type=Path,required=True)
parser.add_argument('--out-dir',type=Path,required=True)
parser.add_argument('--source-audit',type=Path,help='Use the actual fresh source contact replay rather than embedded historical measurements')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
args.out_dir=args.out_dir.resolve()
if not args.out_dir.is_relative_to(ROOT/'art/build') or args.out_dir.exists():raise RuntimeError('New art/build handoff directory required')
args.out_dir.mkdir(parents=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();source_sha=sha(args.blend)
bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()));scene=bpy.context.scene
audit=json.loads(scene['resting_contact_audit']);graph=bpy.context.evaluated_depsgraph_get()
if args.source_audit:
    actual=json.loads(args.source_audit.read_text())
    if actual['source']['sha256']!=source_sha or not actual['contactAudit']['passed']:
        raise RuntimeError('Fresh source contact audit binding differs')
    audit=actual['contactAudit']
rows=[];cameras=[];group_ids=[]
for group in audit['groups']:
    name=group['name'];points=[]
    for member in group['members']:
        obj=bpy.data.objects[member]
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh()
        points.extend(evaluated.matrix_world@v.co for v in mesh.vertices);evaluated.to_mesh_clear()
    minimum=[min(p[k] for p in points) for k in range(3)];maximum=[max(p[k] for p in points) for k in range(3)]
    center=[(minimum[0]+maximum[0])/2,(minimum[2]+maximum[2])/2,-(minimum[1]+maximum[1])/2]
    final=group['final'];gap=final.get('contact',{}).get('gapMetres');penetration=final.get('maximumPenetrationMetres')
    rows.append({'name':name,'mode':group['mode'],'passed':final['passed'],'gapMetres':gap,'maximumPenetrationMetres':penetration,'contact':final.get('contact'),'lowestSetGapRangeMetres':final.get('lowestSetGapRangeMetres'),'boundsEngine':{'min':[minimum[0],minimum[2],-maximum[1]],'max':[maximum[0],maximum[2],-minimum[1]]}})
    if group['mode']!='resting':continue
    contact=final['contact']['pointEngine'];width=maximum[0]-minimum[0];distance=max(.78,width*.93)
    position=[center[0]+min(.28,distance*.15),contact[1]+min(.8,.27+width*.16),center[2]+distance]
    look=[center[0],contact[1]+.09,center[2]]
    phone_distance=max(distance*1.22,width*1.50)
    phone={'position':[center[0]+min(.20,phone_distance*.12),contact[1]+min(.85,.30+width*.17),center[2]+phone_distance],'look':look,'fov':76}
    unique_name=re.sub(r'(?<=\s)-(?=\d)','minus-',name.lower())
    cameras.append({'name':'contact-'+re.sub('[^a-z0-9]+','-',unique_name).strip('-'),'position':position,'look':look,'fov':38,'phone':phone,'groupIds':[name],'role':'resting-contact'})
    group_ids.append(name)
# Real scene diagnostic poses; product cameras are left to runtime/capture.
cameras.extend([
 {'name':'screen-left-bearing','position':[-2.8,1.12,-5.45],'look':[-1.5,1.30,-6.31],'fov':50,'phone':{'position':[-2.9,1.10,-4.1],'look':[-1.5,1.30,-6.31],'fov':82},'groupIds':['wall-mounted screen bearing rail','mounted screen leaf 0','screen edge molding -2.34'],'role':'resting-contact'},
 {'name':'screen-right-bearing','position':[2.8,1.12,-5.45],'look':[1.5,1.30,-6.31],'fov':50,'phone':{'position':[2.9,1.10,-4.1],'look':[1.5,1.30,-6.31],'fov':82},'groupIds':['wall-mounted screen bearing rail','mounted screen leaf 2','screen edge molding 2.34'],'role':'resting-contact'},
 {'name':'continuous-step-snow','position':[2.6,1.20,8.2],'look':[1.3,.48,5.1],'fov':42,'phone':{'position':[2.9,1.35,9.4],'look':[1.1,.48,5.1],'fov':64},'role':'snow-contact'},
 {'name':'wall-base-snow','position':[9.7,1.25,14.0],'look':[11.95,.55,12.7],'fov':42,'phone':{'position':[8.9,1.3,14.4],'look':[11.95,.60,12.7],'fov':66},'role':'snow-contact'},
 {'name':'doorway-built-frame','position':[.8,1.85,7.4],'look':[0,2.35,2.2],'fov':44,'phone':{'position':[.8,2.0,9.4],'look':[0,2.35,2.2],'fov':70},'role':'doorway'},
 {'name':'painted-beams-and-brackets','position':[-1.0,2.45,-1.6],'look':[-2.7,4.65,1.0],'fov':45,'phone':{'position':[-.2,2.5,-2.3],'look':[-2.7,4.65,1.0],'fov':70},'role':'architecture'},
])
covered={name for view in cameras for name in view.get('groupIds',[])}
if covered!={g['name'] for g in audit['groups']}:raise RuntimeError('Close-up registry coverage differs')
if len({view['name'] for view in cameras})!=len(cameras):raise RuntimeError('Close-up screenshot names must be unique')
report={'source':{'path':str(args.blend),'sha256':source_sha},'geometry':json.loads(scene['source_geometry_budget']),'bounds':json.loads(scene['architecture_bounds_engine']),'fixtures':json.loads(scene['static_lamp_wicks_engine']),'incenseSmoke':json.loads(scene['static_incense_smoke_engine']),'incenseSmokeConfig':json.loads(scene['static_incense_smoke_config']),'dustConfig':json.loads(scene['static_dust_config']),'materialDelivery':json.loads(scene['source_material_delivery']),'authoredNightLighting':json.loads(scene['authored_night_lighting']),'contactGroups':rows,'contactPassed':audit['passed'],'allGroupIdsHaveConfiguredCloseups':True,'visualFramingStillNeedsActualCapture':True,'noRenderBakeGpuJobs':True,'sourceAuthoringSha256':json.loads(scene.get('source_authoring_sha256','{}'))}
(args.out_dir/'scene-report.json').write_text(json.dumps(report,indent=2)+'\n');(args.out_dir/'closeups.json').write_text(json.dumps(cameras,indent=2)+'\n')
if sha(args.blend)!=source_sha:raise RuntimeError('Source changed during report')
print('SNOW_SOURCE_HANDOFF_READY',json.dumps({'report':str(args.out_dir/'scene-report.json'),'sourceSha256':source_sha,'triangles':report['geometry']['totalTriangles'],'objects':report['geometry']['totalObjects'],'groups':len(rows),'closeups':len(cameras)}),flush=True)
