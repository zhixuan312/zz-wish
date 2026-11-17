"""Read-only contact-camera ID/frustum and new gauze-proxy obstruction audit.

This is CPU geometry evidence only. It cannot certify rendered contact visibility,
UI clearance, material readability or shadows. Product cameras are never changed.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parser=argparse.ArgumentParser(description=__doc__)
for key in ['source','source-audit','registry','out']:
    parser.add_argument('--'+key,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
inputs={key:{'path':str(getattr(args,key)),'sha256':sha(getattr(args,key))} for key in ['source','source_audit','registry']}
if args.out.exists():raise RuntimeError('New ignored proof output required')
audit=json.loads(args.source_audit.read_text());views=json.loads(args.registry.read_text())
if audit['source']['sha256']!=inputs['source']['sha256'] or not audit['contactAudit']['passed']:
    raise RuntimeError('Actual passing source replay required')
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
graph=bpy.context.evaluated_depsgraph_get();groups={row['name']:row for row in audit['contactAudit']['groups']}
points={}
def engine(p):return [float(p.x),float(p.z),float(-p.y)]
for name,group in groups.items():
    values=[]
    for member in group['members']:
        obj=bpy.data.objects[member]
        if obj.type!='MESH':continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
        values.extend(engine(evaluated.matrix_world@v.co) for v in mesh.vertices)
        evaluated.to_mesh_clear()
    points[name]=np.asarray(values,dtype=np.float64)
proxy_points=[];proxy_polys=[];proxy_owner=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.get('one_light_transport_proxy'):continue
    evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph)
    offset=len(proxy_points);proxy_points.extend(Vector(engine(evaluated.matrix_world@v.co)) for v in mesh.vertices)
    for face in mesh.polygons:
        proxy_polys.append([offset+v for v in face.vertices]);proxy_owner.append({'object':obj.name,'role':obj.get('transport_role')})
    evaluated.to_mesh_clear()
proxy_tree=BVHTree.FromPolygons(proxy_points,proxy_polys,all_triangles=False)
covered=set();unknown=set();rows=[]
for view in views:
    ids=view.get('groupIds',[]);covered.update(ids);unknown.update(set(ids)-set(groups))
    for viewport,width,height in [('desktop-en',1440,900),('phone-zh',390,844)]:
        pose={**view,**(view.get('phone',{}) if viewport=='phone-zh' else {})}
        eye=np.asarray(pose['position'],dtype=np.float64);look=np.asarray(pose['look'],dtype=np.float64)
        forward=look-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
        tan_y=math.tan(math.radians(pose['fov'])/2);tan_x=tan_y*width/height
        def projection(values):
            delta=values-eye;z=delta@forward;x=(delta@right)/(z*tan_x);y=(delta@up)/(z*tan_y)
            return x,y,z
        for name in ids:
            if name not in groups:continue
            x,y,z=projection(points[name]);inside=(z>0)&(abs(x)<=1)&(abs(y)<=1);padded=(z>0)&(abs(x)<=.9)&(abs(y)<=.9)
            final=groups[name]['final'];target=final.get('contact',{}).get('pointEngine')
            if target is None:
                target=np.mean([m['wallPointEngine'] for m in final['mounts']],axis=0).tolist()
            tx,ty,tz=projection(np.asarray([target]));ray=Vector(target)-Vector(eye);distance=ray.length
            hit,normal,index,hit_distance=proxy_tree.ray_cast(Vector(eye),ray.normalized(),max(0,distance-.002))
            center=np.mean(points[name],axis=0);extent=np.max(points[name],axis=0)-np.min(points[name],axis=0)
            rows.append({'view':view['name'],'viewport':viewport,'group':name,'mode':groups[name]['mode'],
                'position':pose['position'],'look':pose['look'],'fov':pose['fov'],'vertices':len(x),
                'groupVertexFractionInFrustum':float(np.mean(inside)),'groupVertexFractionInPaddedFrustum':float(np.mean(padded)),
                'groupProjectedXRange':[float(np.min(x)),float(np.max(x))],'groupProjectedYRange':[float(np.min(y)),float(np.max(y))],
                'actualBearingTargetEngine':target,'bearingTargetNdc':[float(tx[0]),float(ty[0]),float(tz[0])],
                'bearingTargetInFrustum':bool(tz[0]>0 and abs(tx[0])<=1 and abs(ty[0])<=1),
                'newActualGauzeProxyBetweenEyeAndBearing':hit is not None,
                'proxyObstruction':{'owner':proxy_owner[index],'pointEngine':list(hit),'distance':hit_distance} if hit is not None else None,
                'actualGroupCenterEngine':center.tolist(),'actualGroupExtentMetres':extent.tolist()})
missing=sorted(set(groups)-covered)
report={'scope':__doc__,'inputs':inputs,'registeredGroups':len(groups),'configuredViews':len(views),
    'allGroupIdsCovered':not missing and not unknown,'uncoveredGroupIds':missing,'unknownGroupIds':sorted(unknown),
    'poseGroupViewportRows':rows,'groupsWithNoConfiguredInFrustumBearingByViewport':{
        viewport:sorted(name for name in groups if not any(r['group']==name and r['viewport']==viewport and r['bearingTargetInFrustum'] for r in rows)) for viewport in ['desktop-en','phone-zh']},
    'newGauzeProxyObstructedRows':[{'view':r['view'],'viewport':r['viewport'],'group':r['group'],'hit':r['proxyObstruction']} for r in rows if r['newActualGauzeProxyBetweenEyeAndBearing']],
    'sourceMetadataAndModelUnchanged':True,'oldArchitectureOcclusionOrVisualFramingNotCertified':True,
    'renderBakeEncoderGpuJobs':0,'scriptSha256':sha(__file__)}
for key,row in inputs.items():
    if sha(getattr(args,key))!=row['sha256']:raise RuntimeError('Immutable input changed')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('CONTACT_CAMERA_REGISTRY_AUDIT',str(args.out),sha(args.out),'groups',len(groups),'views',len(views),'missing',missing,'newProxyHits',len(report['newGauzeProxyObstructedRows']),flush=True)
