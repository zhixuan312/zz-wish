"""Read-only projected open-edge metrics. No Cycles, raster image or source edit."""
import argparse, hashlib, json, math, sys
from collections import defaultdict
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
source=Path(bpy.data.filepath);digest=lambda b:hashlib.sha256(b).hexdigest();before=digest(source.read_bytes())
if bpy.context.scene.get('place_id')!='cloud-cliff':raise RuntimeError('Actual authored Cloud scene required')
proof_path=Path('art/build/cloud-cliff-round1/cloud-post-medium-proof.json');proof=json.loads(proof_path.read_text());proof['sourceViews']=json.loads(bpy.context.scene['cloud_cliff_cover_views']);graph=bpy.context.evaluated_depsgraph_get()
def project(point,view):
    origin=Vector(view['position']);forward=(Vector(view['target'])-origin).normalized();right=forward.cross(Vector((0,1,0))).normalized();up=right.cross(forward);delta=Vector(point)-origin;depth=delta.dot(forward)
    if depth<=0:return None
    scale=view['size'][1]/(2*math.tan(math.radians(view['fov'])/2))
    return [view['size'][0]/2+delta.dot(right)*scale/depth,view['size'][1]/2-delta.dot(up)*scale/depth]
def line_distance(point,a,b):
    d=[b[i]-a[i] for i in range(2)];den=sum(x*x for x in d)
    if den==0:return math.dist(point,a)
    t=max(0,min(1,sum((point[i]-a[i])*d[i] for i in range(2))/den));return math.dist(point,[a[i]+t*d[i] for i in range(2)])
def simplify(ids,points,tolerance=.75):
    if len(ids)<3:return ids
    a,b=points[ids[0]],points[ids[-1]];dist=[line_distance(points[i],a,b) for i in ids[1:-1]];maximum=max(dist,default=0)
    if maximum<=tolerance:return [ids[0],ids[-1]]
    split=1+dist.index(maximum);return simplify(ids[:split+1],points,tolerance)[:-1]+simplify(ids[split:],points,tolerance)
def chains(edges):
    adjacency=defaultdict(list);remaining=set(tuple(sorted(e)) for e in edges)
    for a,b in remaining:adjacency[a].append(b);adjacency[b].append(a)
    paths=[]
    while remaining:
        first=next((a for a in adjacency if len(adjacency[a])!=2 and any(tuple(sorted((a,b))) in remaining for b in adjacency[a])),next(iter(remaining))[0]);path=[first];current=first
        while True:
            options=[n for n in adjacency[current] if tuple(sorted((current,n))) in remaining]
            if not options:break
            nxt=options[0];remaining.remove(tuple(sorted((current,nxt))));path.append(nxt);current=nxt
            if current==first or len(adjacency[current])!=2:break
        paths.append(path)
    return paths
rows=[]
for obj in bpy.data.objects:
    if obj.type!='MESH' or not obj.name.startswith('Far photographic rock massif'):continue
    ev=obj.evaluated_get(graph);mesh=ev.to_mesh();positions=[]
    for v in mesh.vertices:
        q=ev.matrix_world@v.co;positions.append([q.x,q.z,-q.y])
    lo=min(p[1] for p in positions);hi=max(p[1] for p in positions);height=hi-lo;counts=defaultdict(int)
    for face in mesh.polygons:
        ids=list(face.vertices)
        for a,b in zip(ids,ids[1:]+ids[:1]):counts[tuple(sorted((a,b)))]+=1
    boundary=[e for e,n in counts.items() if n==1];row={'object':obj.name,'vertices':len(positions),'polygons':len(mesh.polygons),'worldY':[lo,hi],'openBoundaryEdges':len(boundary),'sourceCapScope':json.loads(obj.get('scan_cap_scope','null')),'views':{}}
    for name,view in proof['sourceViews'].items():
        view={**view,'target':view.get('target',view.get('look')),'size':view.get('size',view.get('viewport'))}
        projected=[project(p,view) for p in positions];metrics={}
        for label,selected in [('top',[e for e in boundary if min(positions[i][1] for i in e)>=lo+height*.70]),('bottom',[e for e in boundary if max(positions[i][1] for i in e)<=lo+height*.08]),('side',[e for e in boundary if max(positions[i][1] for i in e)>lo+height*.08 and min(positions[i][1] for i in e)<lo+height*.70])]:
            paths=chains(selected);spans=[]
            for ids in paths:
                if any(projected[i] is None for i in ids):continue
                reduced=simplify(ids,projected)
                for a,b in zip(reduced,reduced[1:]):
                    length=math.dist(projected[a],projected[b]);delta=[projected[b][i]-projected[a][i] for i in range(2)];angle=math.degrees(math.atan2(abs(delta[1]),abs(delta[0])))
                    if length>=8:spans.append({'screenLengthCss':length,'angleFromHorizontalDegrees':angle,'worldLengthMetres':math.dist(positions[a],positions[b]),'worldEndpoints':[positions[a],positions[b]],'screenEndpoints':[projected[a],projected[b]]})
            flat=[s for s in spans if (s['angleFromHorizontalDegrees']>=78 if label=='side' else s['angleFromHorizontalDegrees']<=12)]
            metrics[label]={'selectedEdges':len(selected),'chains':len(paths),'rdpToleranceCss':.75,'maximumStraightSpanCss':max((s['screenLengthCss'] for s in spans),default=0),'maximumNearAxisSpanCss':max((s['screenLengthCss'] for s in flat),default=0),'longestPotentialCuts':sorted(flat,key=lambda s:s['screenLengthCss'],reverse=True)[:3]}
        row['views'][name]=metrics
    rows.append(row);ev.to_mesh_clear()
if digest(source.read_bytes())!=before:raise RuntimeError('Source changed')
report={'version':1,'source':{'path':str(source),'sha256':before},'cameraProof':{'path':str(proof_path),'sha256':digest(proof_path.read_bytes())},'scope':'Source-bound TOP/SIDE/BOTTOM open boundary edge chains projected with actual authored camera math; simplified to .75CSSpixel. No raster/render, visibility or occlusion inference. Potential crop spans can be hidden behind another real massif. No source or mesh changes.','rows':rows,'renderBakeGpuJobs':False,'sourceUnchanged':True}
out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
if out.exists():raise RuntimeError('Fresh report required')
out.write_text(json.dumps(report,indent=2)+'\n');print('SCAN_BOUNDARY_AUDIT',str(out),digest(out.read_bytes()),len(rows))
