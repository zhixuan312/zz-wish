"""Rebind immutable evaluated source/normal snapshots to the certified 2K mesh.

Never re-evaluate source construction modifiers. The original source→prepared
certificate remains a required input; this independently checks its stored full
source POSITION/UV0/rendered-tint snapshot and frozen source CORNER normal arrays.
Fresh Bevel re-evaluation failures are retained separately, never relabeled PASS.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

parser=argparse.ArgumentParser(description=__doc__)
for k in ['source','source-snapshot','material-audit','prepared','original-mapping','normal-audit','out']:
    parser.add_argument('--'+k,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={k:{'path':str(getattr(args,k)),'sha256':sha(getattr(args,k))}for k in ['source','source_snapshot','material_audit','prepared','original_mapping','normal_audit']}
mapping=json.loads(args.original_mapping.read_text())
material_audit=json.loads(args.material_audit.read_text())
normal_audit=json.loads(args.normal_audit.read_text())
if not mapping['passed'] or mapping['sourceBlendSha256']!=sha(args.source) or mapping['preparedBlendSha256']!=sha(args.prepared) or material_audit['source']['sha256']!=sha(args.source) or material_audit['rawProbe']['sha256']!=sha(args.source_snapshot):
    raise RuntimeError('Original passing certificate and actual immutable source snapshots required')
data=args.source_snapshot.read_bytes();n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);binary=data[28+n:]
def accessor(index):
    a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
    code,maximum={5126:('f',1),5121:('B',255),5123:('H',65535),5125:('I',1)}[a['componentType']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    size=struct.calcsize('<'+code*width);stride=view.get('byteStride',size);offset=view.get('byteOffset',0)+a.get('byteOffset',0)
    return [tuple(v/maximum if a.get('normalized')else v for v in struct.unpack_from('<'+code*width,binary,offset+i*stride))for i in range(a['count'])]
parents={c:i for i,n in enumerate(doc['nodes'])for c in n.get('children',[])}
def matrix(index):
    n=doc['nodes'][index]
    if 'matrix'in n:m=Matrix([n['matrix'][i:i+4]for i in range(0,16,4)]).transposed()
    else:
        q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(n.get('scale',[1,1,1])))
    return matrix(parents[index])@m if index in parents else m
source=defaultdict(set)
for i,node in enumerate(doc['nodes']):
    if 'mesh'not in node:continue
    world=matrix(i)
    for p in doc['meshes'][node['mesh']]['primitives']:
        name=doc['materials'][p['material']]['name'];a=p['attributes'];pos=accessor(a['POSITION']);uv=accessor(a['TEXCOORD_0']);tint=accessor(a['COLOR_0'])if'COLOR_0'in a else [(1,1,1,1)]*len(pos)
        for j,point in enumerate(pos):
            c=tint[j];c=tuple(c)+(1,)if len(c)==3 else c
            source[name].add(tuple(world@Vector(point))+tuple(uv[j])+tuple(c))
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
binding=json.loads(bpy.context.scene['one_light_source_binding'])
transfer=json.loads(bpy.context.scene['one_light_normal_transfer'])
if binding['sha256']!=sha(args.source)or transfer['auditSha256']!=sha(args.normal_audit):
    raise RuntimeError('Prepared source/frozen normal snapshot binding differs')
prepared=defaultdict(set);source_normals=defaultdict(dict);normal_max=0.
owner_names={(r['region'],r['owner']):name for name,r in normal_audit['sources'].items()}
for obj in bpy.context.scene.objects:
    if obj.type!='MESH'or not obj.get('one_light_static')or obj.get('one_light_dynamic'):continue
    mesh=obj.data;world=obj.matrix_world;normal_matrix=world.to_3x3().inverted().transposed();uv=mesh.uv_layers['UVMap'];tint=mesh.color_attributes.get('SurfaceTint');region=obj['lightmap_region'];frozen=mesh.attributes['one_light_source_world_normal'];refs=mesh.attributes['one_light_source_normal_loop'];owners=mesh.attributes['one_light_source_chart_owner']
    for face in mesh.polygons:
        material=mesh.materials[face.material_index].name;owner=owners.data[face.index].value
        for li in face.loop_indices:
            p=world@mesh.vertices[mesh.loops[li].vertex_index].co;c=tuple(tint.data[li].color)if tint else(1,1,1,1)
            # glTF stores V=1-BlenderV. Compare actual coordinates in the same
            # exported convention, rather than mistaking that basis change for
            # a UV mismatch.
            prepared[material].add((p.x,p.z,-p.y)+(float(uv.data[li].uv.x),1.-float(uv.data[li].uv.y))+c)
            target=tuple(frozen.data[li].vector);reference=refs.data[li].value
            previous=source_normals[(region,owner)].setdefault(reference,target)
            if previous!=target:raise RuntimeError('Duplicated original source normal loop has inconsistent data')
            actual=(normal_matrix@mesh.corner_normals[li].vector).normalized()
            normal_max=max(normal_max,max(abs(a-b)for a,b in zip(actual,target)))
normal_rows=[]
for key,rows in source_normals.items():
    name=owner_names[key];record=normal_audit['sources'][name]
    if set(rows)!=set(range(record['loops'])):raise RuntimeError('Incomplete stored source normal array: '+name)
    payload=b''.join(struct.pack('<fff',*rows[i])for i in range(record['loops']))
    if hashlib.sha256(payload).hexdigest()!=record['worldCornerNormalSha256']:raise RuntimeError('Original source normal-array digest differs: '+name)
    normal_rows.append({'object':name,'loops':record['loops'],'actualStoredSourceNormalSha256':record['worldCornerNormalSha256']})
def compare(a,b):
    exact=len(a&b);missing=a-b;targets=list(b);tree=KDTree(len(targets))
    for i,row in enumerate(targets):tree.insert(row[:3],i)
    tree.balance();failed=[];maxima=[0.,0.,0.]
    for row in missing:
        matches=[]
        for _,index,distance in tree.find_range(row[:3],.000005):
            other=targets[index];error=[distance,max(abs(x-y)for x,y in zip(row[3:5],other[3:5])),max(abs(x-y)for x,y in zip(row[5:],other[5:]))]
            if error[1]<=1e-6 and error[2]<=1e-6:matches.append(error)
        if not matches:
            failed.append(row)
        else:
            for k,e in enumerate(min(matches)):maxima[k]=max(maxima[k],e)
    return {'exactCorners':exact,'toleranceMatchedCorners':len(missing)-len(failed),'failedCorners':len(failed),'failureExamples':failed[:5],'maximumPositionMetres':maxima[0],'maximumUV0':maxima[1],'maximumTint':maxima[2]}
rows=[]
for name in sorted(set(source)|set(prepared)):
    forward,reverse=compare(source[name],prepared[name]),compare(prepared[name],source[name])
    rows.append({'material':name,'sourceSnapshotToCertifiedPrepared':forward,'certifiedPreparedToSourceSnapshot':reverse,'passed':not forward['failedCorners']and not reverse['failedCorners']})
passed=all(r['passed']for r in rows)and normal_max<=1e-6
report={'scope':__doc__,'inputs':inputs,'sourceSnapshotNormals':'The old material GLB has default-four-decimal NORMAL and is NOT presented as a1e-6 normal reference. Full actual original source-world CORNER normal arrays are independently reconstructed by source-owner/original-loop provenance and SHA-checked below.',
        'originalCertifiedMappingSha256':sha(args.original_mapping),'materials':rows,'storedSourceNormalArrays':normal_rows,'maximumFrozenSourceToActualPreparedWorldNormalError':normal_max,'numericLimits':{'worldPositionMetres':.000005,'materialUV0':.000001,'worldNormalComponent':.000001,'linearSurfaceTintComponent':.000001},'freshReevaluationPassClaimed':False,'renderBakeGpuJobs':0,'scriptSha256':sha(Path(__file__)),'passed':passed}
for k,record in inputs.items():
    if sha(getattr(args,k))!=record['sha256']:raise RuntimeError('Immutable input changed')
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('CERTIFIED_SOURCE_SNAPSHOT_REBOUND',passed,sha(args.out),flush=True)
if not passed:raise RuntimeError('Stored actual source snapshot correspondence failed; no tolerance waiver')
