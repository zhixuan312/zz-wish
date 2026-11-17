"""Source/prepared world corner mapping gate; no native jobs or model writes."""
import argparse
from collections import defaultdict
from hashlib import sha256
import json
from pathlib import Path
import sys

import bpy
from mathutils.kdtree import KDTree

parser=argparse.ArgumentParser(description=__doc__)
for flag in ['source','prepared','manifest','out']:parser.add_argument('--'+flag,type=Path,required=True)
parser.add_argument('--normal-tolerance',type=float,default=.000001)
parser.add_argument('--diagnostic-only',action='store_true',help='Do not bind a candidate without actual UV preparation to the manifest receiver fingerprints.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
digest=lambda p:sha256(p.read_bytes()).hexdigest()
initial={name:{'path':str(path.resolve()),'sha256':digest(path)} for name,path in [('source',args.source),('prepared',args.prepared),('manifest',args.manifest)]}


def records(path):
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()));graph=bpy.context.evaluated_depsgraph_get();result=defaultdict(set)
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH' or not obj.get('one_light_static') or obj.get('one_light_dynamic'):continue
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);uv=mesh.uv_layers['UVMap'];tint=mesh.color_attributes.get('SurfaceTint');normal_matrix=evaluated.matrix_world.to_3x3().inverted().transposed()
        for face in mesh.polygons:
            material=mesh.materials[face.material_index].name
            for li in face.loop_indices:
                vi=mesh.loops[li].vertex_index;position=evaluated.matrix_world@mesh.vertices[vi].co
                normal=(normal_matrix@mesh.corner_normals[li].vector).normalized()
                color=tuple(tint.data[li if tint.domain=='CORNER' else vi].color) if tint else (1,1,1,1)
                result[material].add(tuple(position)+tuple(uv.data[li].uv)+tuple(normal)+color)
        evaluated.to_mesh_clear()
    return result


def compare(before,after):
    exact=len(before&after);missing=before-after
    if not missing:return {'exactUniqueCorners':exact,'toleranceMatchedCorners':0,'failedCorners':0,'maximumPositionErrorMetres':0,'maximumUV0Error':0,'maximumWorldNormalError':0,'maximumTintError':0}
    targets=list(after);tree=KDTree(len(targets))
    for i,row in enumerate(targets):tree.insert(row[:3],i)
    tree.balance();errors=[0.,0.,0.,0.];failed=[]
    for row in missing:
        possible=[]
        for position,index,distance in tree.find_range(row[:3],.000005):
            other=targets[index];d=[distance,max(abs(a-b) for a,b in zip(row[3:5],other[3:5])),max(abs(a-b) for a,b in zip(row[5:8],other[5:8])),max(abs(a-b) for a,b in zip(row[8:],other[8:]))]
            if all(value<=limit for value,limit in zip(d,[.000005,.000001,.000001,.000001])):possible.append(d)
        if not possible:
            if len(failed)<10:failed.append(list(row))
            continue
        for k,value in enumerate(min(possible)):errors[k]=max(errors[k],value)
    # Count failures independently from the capped evidence sample.
    matched=0;uv_matched=0;normal_failures=0;measured=[0.,0.,0.,0.]
    for row in missing:
        candidates=[]
        for _,index,distance in tree.find_range(row[:3],.000005):
            other=targets[index];d=[distance,max(abs(a-b) for a,b in zip(row[3:5],other[3:5])),max(abs(a-b) for a,b in zip(row[5:8],other[5:8])),max(abs(a-b) for a,b in zip(row[8:],other[8:]))]
            if d[1]<=.000001 and d[3]<=.000001:candidates.append(d)
        if not candidates:continue
        uv_matched+=1;best=min(candidates,key=lambda d:(d[2],d[1],d[3],d[0]))
        for k,value in enumerate(best):measured[k]=max(measured[k],value)
        if best[2]<=args.normal_tolerance:matched+=1
        else:normal_failures+=1
    return {'exactUniqueCorners':exact,'toleranceMatchedCorners':matched,'positionUVTintMatchedCorners':uv_matched,'normalLimitFailedCorners':normal_failures,'failedCorners':len(missing)-matched,'failureExamples':failed,'maximumPositionErrorMetres':measured[0],'maximumUV0Error':measured[1],'maximumWorldNormalError':measured[2],'maximumTintError':measured[3]}


source=records(args.source);prepared=records(args.prepared);rows=[]
for name in sorted(set(source)|set(prepared)):
    forward=compare(source[name],prepared[name]);reverse=compare(prepared[name],source[name])
    rows.append({'material':name,'sourceUniqueCorners':len(source[name]),'preparedUniqueCorners':len(prepared[name]),'sourceToPrepared':forward,'preparedToSource':reverse,'passed':not forward['failedCorners'] and not reverse['failedCorners']})
manifest=json.loads(args.manifest.read_text());generated=manifest['bake']['generatedCoordinates']
if any(row.get('required') is not False for row in generated['receivers'].values()):raise RuntimeError('Explicit-image-UV proof cannot cover implicit Generated inputs.')
passed=all(row['passed'] for row in rows)
report={'sourceBlendSha256':initial['source']['sha256'],'preparedBlendSha256':initial['prepared']['sha256'],'mappingPolicy':generated['policy'],'generatedReceivers':generated['receivers'],'geometryFingerprint':None if args.diagnostic_only else manifest['geometryFingerprint'],'receiverProfiles':{} if args.diagnostic_only else manifest['bake']['receiverProfiles'],'diagnosticOnlyNoUVPreparationClaim':args.diagnostic_only,
        'sourceMaterialUVTintNormalCorrespondencePassed':passed,'passed':passed,'materials':rows,'inputs':initial,
        'numericLimits':{'worldPositionMetres':.000005,'materialUV0':.000001,'worldNormalComponent':args.normal_tolerance,'linearSurfaceTintComponent':.000001},
        'scope':'Every unique evaluated material/world-position/UV0/world-normal/tint source corner matches prepared and vice versa. Exact tuples first; only measured Float32 transform/evaluation rounding uses explicit micrometre-level bounds. Does not assert identical quad interpolation or render pixels. Actual prepared/raw resting-contact replay remains separate and literal.','requiresRootNativeVisualReview':True,'renderBakeEncoderGpuJobs':0,'sourceOrModelModified':False,'scriptSha256':digest(Path(__file__))}
for name,path in [('source',args.source),('prepared',args.prepared),('manifest',args.manifest)]:
    if digest(path)!=initial[name]['sha256']:raise RuntimeError('Frozen mapping input changed.')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('PREPARED_MAPPING_PROOF',passed,str(args.out),digest(args.out),flush=True)
if not passed:raise RuntimeError('Actual prepared corner mapping failed.')
