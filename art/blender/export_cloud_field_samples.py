"""Read actual saved native density nodes on CPU. No Cycles/encoder jobs."""
import argparse
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys
import bpy

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.source=a.source.resolve();a.output=a.output.resolve()
if a.output.exists():raise RuntimeError('Use a fresh proof output')
before=sha256(a.source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(a.source));scene=bpy.context.scene
spec=importlib.util.spec_from_file_location('saved_cloud_node_audit',ROOT/'art/blender/audit_cloud_morphology.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
contract=json.loads(scene['cloud_cliff_live_clouds']);cloud=next(o for o in scene.objects if o.get('density_contract_sha256'))
points=[]
for bank in contract['banks']:
    c=bank['centre'];r=bank['radii'];points.append(list(c))
    for axis in range(3):
        for amount in [-.95,-.65,-.3,.3,.65,.95]:
            q=list(c);q[axis]+=r[axis]*amount;points.append(q)
    for sx in [-.5,.5]:
        for sy in [-.5,.5]:
            for sz in [-.5,.5]:points.append([c[0]+r[0]*sx,c[1]+r[1]*sy,c[2]+r[2]*sz])
seed=348991
def uniform():
    global seed
    seed=(1664525*seed+1013904223)%4294967296
    return seed/4294967296
lo=contract['bounds']['min'];hi=contract['bounds']['max']
for _ in range(640):points.append([lo[0]+uniform()*(hi[0]-lo[0]),-85+uniform()*86,lo[2]+uniform()*(hi[2]-lo[2])])
for _ in range(128):points.append([lo[0]+uniform()*(hi[0]-lo[0]),lo[1]+uniform()*180,lo[2]+uniform()*(hi[2]-lo[2])])
for box in contract['expandedBankBounds']:
    for sx in [0,1]:
        for sy in [0,1]:
            for sz in [0,1]:points.append([box['max' if s else 'min'][i] for i,s in enumerate([sx,sy,sz])])
points.extend([[4.5,1.5,0],[4.5,1.792562,0],[5.2,1.85,4.7],[5.2,1.8,4.8],[-490,1,-1570],[810,-311,430]])
samples=[{'p':point,'density':audit.node_density(cloud.data.materials[0],point)} for point in points]
if sha256(a.source.read_bytes()).hexdigest()!=before:raise RuntimeError('Immutable source changed')
report={'source':{'path':str(a.source),'sha256':before},'contract':contract,'nativeTime':0,'samples':samples,
        'limit':1e-6,'renderBakeEncoderJobs':0,
        'method':'Actual saved Blender Math/VectorMath/MapRange density DAG evaluated on CPU, with saved float32 socket constants. This is not Metal readback or a GPU equality claim.',
        'auditorSha256':sha256((ROOT/'art/blender/audit_cloud_morphology.py').read_bytes()).hexdigest(),
        'scriptSha256':sha256(Path(__file__).read_bytes()).hexdigest()}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n')
print('CLOUD_SAVED_NODE_SAMPLES_READY',len(samples),str(a.output),flush=True)
