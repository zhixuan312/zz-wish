"""Read-only serialization of actual saved Cloud density nodes; no render."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source_sha=hashlib.sha256(args.source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
material=bpy.data.materials['Cloud eroded layered banks and lower water-droplet haze']
volume=next(node for node in material.node_tree.nodes if node.bl_idname=='ShaderNodeVolumePrincipled')
root=volume.inputs['Density'].links[0].from_socket
nodes=[]
def visit(node):
    if node in nodes:return
    for socket in node.inputs:
        if socket.is_linked:visit(socket.links[0].from_node)
    nodes.append(node)
visit(root.node)
def default(socket):
    value=getattr(socket,'default_value',None)
    if value is None:return None
    return value if isinstance(value,(int,float,bool,str))else list(value)
rows=[]
for node in nodes:
    row={'id':len(rows),'name':node.name,'label':node.label,'type':node.bl_idname}
    for field in ['operation','interpolation_type','clamp','use_clamp','data_type']:
        if hasattr(node,field):row[field]=getattr(node,field)
    row['inputs']=[{'name':s.name,'value':default(s),'link':[nodes.index(s.links[0].from_node),list(s.links[0].from_node.outputs).index(s.links[0].from_socket)]if s.is_linked else None}for s in node.inputs]
    row['outputs']=[s.name for s in node.outputs]
    rows.append(row)
record={'source':{'path':str(args.source.resolve()),'sha256':source_sha},'material':material.name,'nodes':rows,'densityRoot':[nodes.index(root.node),list(root.node.outputs).index(root)],'sourceModified':hashlib.sha256(args.source.read_bytes()).hexdigest()!=source_sha,'gpuRenderBakeJobs':0}
if record['sourceModified']:raise RuntimeError('Source changed during read-only graph extraction.')
args.out.parent.mkdir(parents=True,exist_ok=True)
args.out.write_text(json.dumps(record,indent=2)+'\n')
print('ACTUAL_CLOUD_NATIVE_GRAPH',len(rows),str(args.out),hashlib.sha256(args.out.read_bytes()).hexdigest())
