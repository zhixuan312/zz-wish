"""Read-only field contract and actual density-DAG extraction from saved source."""
import argparse, hashlib, json, runpy, sys
from pathlib import Path
import bpy

parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source=args.source.resolve();out=args.out.resolve()
if out.exists():raise RuntimeError('New output directory required')
out.mkdir(parents=True)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=digest(source)
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
contract=json.loads(scene['cloud_cliff_live_clouds'])
if contract['version']!=7:raise RuntimeError('This prototype requires the actual child-bank plus near-wisp source contract')
record={'source':{'path':str(source),'sha256':before},'contract':contract,
        'contractTextSha256':hashlib.sha256(scene['cloud_cliff_live_clouds'].encode()).hexdigest(),
        'views':json.loads(scene['cloud_cliff_cover_views']),
        'scriptSha256':digest(Path(__file__)),'readOnly':True,'renderBakeGpuJobs':0}
(out/'field.json').write_text(json.dumps(record,indent=2)+'\n')
graph_recipe=Path(__file__).resolve().parents[2]/'tests/visual/dump-cloud-native-graph.py'
sys.argv=[str(graph_recipe),'--','--source',str(source),'--out',str(out/'native-graph.json')]
runpy.run_path(str(graph_recipe),run_name='__main__')
if digest(source)!=before:raise RuntimeError('Source changed during read-only extraction')
print('CLOUD_SAVED_FIELD_EXPORTED',before,str(out),digest(out/'field.json'),digest(out/'native-graph.json'))
