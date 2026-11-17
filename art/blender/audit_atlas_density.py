"""Read-only actual chart attribution and world/UV pitch, including held cameras."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--manifest', type=Path, required=True)
parser.add_argument('--normal-audit', type=Path, required=True)
parser.add_argument('--cameras', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
inputs = {k:{'path':str(getattr(args,k)),'sha256':sha(getattr(args,k))} for k in ['prepared','manifest','normal_audit','cameras']}
if args.out.exists() or not args.out.resolve().is_relative_to(ROOT/'art/build'):
    raise RuntimeError('New ignored report required')
manifest = json.loads(args.manifest.read_text())
audit = json.loads(args.normal_audit.read_text())
owner_names = {(v['region'],v['owner']):name for name,v in audit['sources'].items()}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
regions = {}


def weighted_percentiles(values, weights):
    good = np.isfinite(values)&(values>0)&(weights>0)
    if not np.any(good):
        return None
    values,weights = values[good],weights[good]
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    result = {f'p{q}':float(values[order][min(np.searchsorted(cumulative,cumulative[-1]*q/100),len(order)-1)]) for q in [10,50,90,99]}
    result['worldAreaSquareMetres'] = float(weights.sum())
    return result


def category(name, material, center):
    lower = name.lower()
    if 'column' in lower:
        return 'columns'
    if any(s in lower for s in ['beam','bracket','brace','purlin','rafter','tenon']):
        return 'beams-and-brackets'
    if any(s in lower for s in ['paving','polished','step','threshold','floor']):
        return 'floor-and-steps'
    if 'Continuous snowfield' in name:
        x,z=float(center[0]),-float(center[1])
        if abs(x)<.65 and 3<=z<=44.5:
            return 'footprint-track'
        if 9.5<=abs(x)<=13.2 and -10.5<=z<=19:
            return 'snow-wall-contact-band'
        return 'outer-snow-field'
    return 'other'


report = {'scope':'Read-only actual per-source-owner chart counts and singular-value world/UV pitch. Area-weighted whole-surface metrics and coarse first-hit visible camera samples are separate. No visual, GI-quality or minimum-contact-shadow PASS is inferred.',
          'inputs':inputs,'regions':{},'cameras':{},'cyclesRenderBakeGpuJobs':0}
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.get('one_light_static') or obj.get('one_light_dynamic'):
        continue
    region = obj['lightmap_region']
    resolution = manifest['bake']['resolutionByRegion'][region]
    mesh = obj.data
    if any(len(p.vertices)!=3 for p in mesh.polygons):
        raise RuntimeError('Actual triangulated receiver required')
    points = np.empty((len(mesh.vertices),3),dtype=np.float64)
    mesh.vertices.foreach_get('co',points.ravel())
    matrix = np.array(obj.matrix_world)
    points = points@matrix[:3,:3].T+matrix[:3,3]
    indices = np.empty(len(mesh.loops),dtype=np.int32)
    mesh.loops.foreach_get('vertex_index',indices)
    corners = points[indices.reshape(-1,3)]
    uv = mesh.uv_layers['Lightmap']
    texels = np.empty((len(mesh.loops),2),dtype=np.float64)
    uv.data.foreach_get('uv',texels.ravel())
    texels = texels.reshape(-1,3,2)*resolution
    e1,e2 = corners[:,1]-corners[:,0],corners[:,2]-corners[:,0]
    length = np.linalg.norm(e1,axis=1)
    area = np.linalg.norm(np.cross(e1,e2),axis=1)*.5
    proj = np.divide(np.sum(e1*e2,axis=1),length,out=np.zeros_like(length),where=length>1e-20)
    height = np.sqrt(np.maximum(0,np.sum(e2*e2,axis=1)-proj*proj))
    u1,u2 = texels[:,1]-texels[:,0],texels[:,2]-texels[:,0]
    j1 = np.divide(u1,length[:,None],out=np.zeros_like(u1),where=length[:,None]>1e-20)
    j2 = np.divide(u2-j1*proj[:,None],height[:,None],out=np.zeros_like(u2),where=height[:,None]>1e-20)
    singular = np.linalg.svd(np.stack((j1,j2),axis=2),compute_uv=False)
    worst_pitch = np.divide(1,singular[:,1],out=np.full_like(length,np.inf),where=singular[:,1]>1e-12)
    best_pitch = np.divide(1,singular[:,0],out=np.full_like(length,np.inf),where=singular[:,0]>1e-12)
    owners = np.empty(len(mesh.polygons),dtype=np.int32)
    mesh.attributes['one_light_source_chart_owner'].data.foreach_get('value',owners)
    charts = np.empty(len(mesh.polygons),dtype=np.int32)
    mesh.attributes['one_light_uv_chart'].data.foreach_get('value',charts)
    hidden = np.zeros(len(mesh.polygons),dtype=bool)
    if mesh.attributes.get('one_light_uv_excluded'):
        mesh.attributes['one_light_uv_excluded'].data.foreach_get('value',hidden)
    materials = np.empty(len(mesh.polygons),dtype=np.int32)
    mesh.polygons.foreach_get('material_index',materials)
    names = [owner_names[(region,int(owner))] for owner in owners]
    categories = np.array([category(name,mesh.materials[int(mi)].name,center) for name,mi,center in zip(names,materials,corners.mean(axis=1))])
    rows = []
    for owner in np.unique(owners):
        mask = (owners==owner)&~hidden
        rows.append({'object':owner_names[(region,int(owner))],'owner':int(owner),'charts':len(np.unique(charts[mask])),
                     'nonhiddenTriangles':int(mask.sum()),'worldAreaSquareMetres':float(area[mask].sum()),
                     'worstAxisMetresPerTexelAreaWeighted':weighted_percentiles(worst_pitch[mask],area[mask]),
                     'bestAxisMetresPerTexelAreaWeighted':weighted_percentiles(best_pitch[mask],area[mask])})
    rows.sort(key=lambda r:r['charts'],reverse=True)
    report['regions'][region]={'resolution':resolution,'totalUniqueCharts':len(np.unique(charts[~hidden])),'topChartOwners':rows[:35],
                               'categories':{name:{'worstAxisMetresPerTexelAreaWeighted':weighted_percentiles(worst_pitch[(categories==name)&~hidden],area[(categories==name)&~hidden]),'bestAxisMetresPerTexelAreaWeighted':weighted_percentiles(best_pitch[(categories==name)&~hidden],area[(categories==name)&~hidden]),'triangles':int(np.count_nonzero((categories==name)&~hidden))} for name in sorted(set(categories))}}
    regions[region]={'pitch':worst_pitch,'area':area,'owner':owners,'names':names,'category':categories,'object':obj.name}
graph = bpy.context.evaluated_depsgraph_get()
conversion = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
for camera in json.loads(args.cameras.read_text())['cameras']:
    matrix = conversion@Matrix([camera['worldMatrix'][i:i+4] for i in range(0,16,4)]).transposed()
    origin,rotation = matrix.translation,matrix.to_3x3()
    p = camera['projectionMatrix']
    samples = defaultdict(list)
    for row in range(60):
        for col in range(96):
            direction = (rotation@Vector(((2*(col+.5)/96-1)/p[0],(2*(row+.5)/60-1)/p[5],-1))).normalized()
            hit,location,normal,face,obj,_ = bpy.context.scene.ray_cast(graph,origin,direction)
            if not hit or obj.type!='MESH' or obj.get('lightmap_region') not in regions:
                continue
            region = obj['lightmap_region']
            data = regions[region]
            pitch = float(data['pitch'][face])
            samples[(region,str(data['category'][face]))].append(pitch)
    report['cameras'][camera['viewport']+'/'+camera['name']] = {region+'/'+cat:{'sampledVisiblePixels':len(values),'worstAxisMetresPerTexelPixelWeighted':weighted_percentiles(np.asarray(values),np.ones(len(values)))} for (region,cat),values in samples.items()}
for key,entry in inputs.items():
    if sha(getattr(args,key))!=entry['sha256']:
        raise RuntimeError('Frozen input changed')
report['scriptSha256'] = sha(Path(__file__))
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('ATLAS_DENSITY_READY',str(args.out),sha(args.out),flush=True)
