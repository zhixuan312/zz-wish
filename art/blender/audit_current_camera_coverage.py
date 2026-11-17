"""Read-only native-texel coverage at explicit current product camera matrices."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
import bake_export as baker

parser=argparse.ArgumentParser(description=__doc__)
for name in ['prepared','charts','cameras','out']:parser.add_argument('--'+name,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={name:{'path':str(path),'sha256':sha(path)} for name,path in [('prepared',args.prepared),('cameras',args.cameras)]}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene=bpy.context.scene;conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
for old in list(scene.objects):
    if old.type=='CAMERA':bpy.data.objects.remove(old,do_unlink=True)
for row in json.loads(args.cameras.read_text())['cameras']:
    projection=row['projectionMatrix'];world=row['worldMatrix']
    data=bpy.data.cameras.new('Current');data.sensor_fit='VERTICAL';data.sensor_height=24;data.lens=12*projection[5]
    camera=bpy.data.objects.new('Reference_Current_'+row['viewport']+'_'+row['name'],data);scene.collection.objects.link(camera)
    camera.matrix_world=conversion@Matrix([world[i:i+4] for i in range(0,16,4)]).transposed()
    camera['cover_viewport']=json.dumps([row['width'],row['height']])
regions={obj['lightmap_region']:obj for obj in scene.objects if obj.type=='MESH' and obj.get('one_light_static')}
masks={};charts={};cache_inputs={}
for region in regions:
    path=args.charts/(region+'-coverage.npz');cache_inputs[region]={'path':str(path),'sha256':sha(path)}
    with np.load(path,allow_pickle=False) as cache:masks[region]=cache['labels'].copy();charts[region]=cache['charts'].copy()
coverage=baker.camera_visible_coverage(scene,regions,charts,masks)
passed=all(row['provenOccludedVisiblePixels']==0 and row['sampledVisiblePixels']==row['representedVisiblePixels'] for row in coverage.values())
report={'scope':'Coarse first-hit visible chart coverage at current explicit product/diagnostic cameras. No render, bake, source/prepared save or per-pixel visual claim.','inputs':inputs,'chartCaches':cache_inputs,'coverage':coverage,'passed':passed,'samplesPerCamera':[96,60],'scriptSha256':sha(Path(__file__))}
for name,path in [('prepared',args.prepared),('cameras',args.cameras)]:
    if sha(path)!=inputs[name]['sha256']:raise RuntimeError('Frozen input changed')
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('CURRENT_CAMERA_COVERAGE',passed,str(args.out),sha(args.out),flush=True)
if not passed:raise RuntimeError('A current sampled visible chart lacks native coverage')
