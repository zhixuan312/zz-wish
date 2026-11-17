"""Reproduce Snow's UV-only priority preparation in an isolated code snapshot.

Never renders, bakes, encodes delivery images, alters the source/reference, or
writes public assets. Run all strict actual mapping/contact/normal/UV/FACE gates
after this command. Native baking remains a separately authorized operation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
for name in ['source','hidden-proof','out']:
    parser.add_argument('--'+name,type=Path,required=True)
parser.add_argument('--canonical-reference',type=Path)
parser.add_argument('--fresh-source',action='store_true',help='Prepare the actual authored source directly; never restores any earlier mesh data')
parser.add_argument('--hall-size',type=int,default=1536)
parser.add_argument('--court-size',type=int,default=1536)
parser.add_argument('--refine-underside',action='store_true')
parser.add_argument('--baker',type=Path,default=ROOT/'art/blender/bake_export.py')
parser.add_argument('--packer',type=Path,default=ROOT/'scripts/pack-blender-assets.mjs')
parser.add_argument('--tools',type=Path,default=Path('/tmp/one-light-gltf-tools'))
parser.add_argument('--blender',default=shutil.which('blender'))
parser.add_argument('--snapshot-only',action='store_true',help='Write the exact scoped preparation recipe without executing Blender')
args=parser.parse_args()
for name in ['source','canonical_reference','hidden_proof','out','baker','packer','tools']:
    if getattr(args,name) is not None:
        setattr(args,name,getattr(args,name).resolve())
if args.fresh_source == bool(args.canonical_reference):
    raise RuntimeError('Choose either --fresh-source or an explicit --canonical-reference')
if args.out.exists() or not args.out.is_relative_to(ROOT/'art/build'):
    raise RuntimeError('A new ignored art/build output is required')
if not args.blender:
    raise RuntimeError('Explicit Blender executable required')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
inputs={name:{'path':str(getattr(args,name)),'sha256':sha(getattr(args,name))}for name in ['source','canonical_reference','hidden_proof','baker','packer']if getattr(args,name) is not None}
proof=json.loads(args.hidden_proof.read_text())
if proof['sourceSha256']!=inputs['source']['sha256']:
    raise RuntimeError('Actual source-bound hidden proof required')
args.out.mkdir(parents=True)
snapshot=args.out/'recipe-code'
(snapshot/'art/blender').mkdir(parents=True)
(snapshot/'scripts').mkdir()
for source in (ROOT/'art/blender').glob('*.py'):
    shutil.copy2(source,snapshot/'art/blender'/source.name)
shutil.copy2(args.baker,snapshot/'art/blender/bake_export.py')
shutil.copy2(args.packer,snapshot/'scripts/pack-blender-assets.mjs')
shutil.copy2(ROOT/'scripts/uv-density-search.mjs',snapshot/'scripts/uv-density-search.mjs')
(snapshot/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
baker=snapshot/'art/blender/bake_export.py'
text=baker.read_text()
if 'v != 1536'not in text and 'v not in (1328, 1408, 1536)'not in text:
    raise RuntimeError('The explicitly reviewed 1536 atlas allowance must already exist')
marker='        input_path.write_text(json.dumps(unwrap_input))'
allocation="""        priority_spec = importlib.util.spec_from_file_location('priority_lightmap_allocation', Path(__file__).with_name('priority_lightmap_allocation.py'))
        priority_module = importlib.util.module_from_spec(priority_spec); priority_spec.loader.exec_module(priority_module)
        join_spec = importlib.util.spec_from_file_location('join_tube_lightmap_charts', Path(__file__).with_name('join_tube_lightmap_charts.py'))
        join_module = importlib.util.module_from_spec(join_spec); join_spec.loader.exec_module(join_module)
        tube_join = join_module.join_tube_charts(unwrap_input, region, normal_audit['sources'])
        (output_dir / (region+'-tube-join.json')).write_text(json.dumps(tube_join,indent=2)+'\\n')
        allocation = priority_module.apply_priority_allocation(unwrap_input, region, normal_audit['sources'])
        (output_dir / (region+'-priority-allocation.json')).write_text(json.dumps(allocation,indent=2)+'\\n')
"""
if args.refine_underside:
    allocation += """        if region == 'hall':
            refine_spec = importlib.util.spec_from_file_location('refine_underside_lightmap', Path(__file__).with_name('refine_underside_lightmap.py'))
            refine_module = importlib.util.module_from_spec(refine_spec); refine_spec.loader.exec_module(refine_module)
            refinement = refine_module.refine(unwrap_input, normal_audit['sources'], .05, 1.075, 1.03)
            (output_dir / (region+'-underside-refinement.json')).write_text(json.dumps(refinement,indent=2)+'\\n')
"""
allocation = '        import importlib.util as uv_import_util\n' + allocation.replace('importlib.util.', 'uv_import_util.')
if text.count(marker)!=1 or text.count('        before = receiver_profile(obj)')!=1:
    raise RuntimeError('Frozen baker preparation patch signatures changed')
text=text.replace(marker,allocation+marker).replace('        before = receiver_profile(obj)',"        if target_resolution in (1328, 1408, 1536):\n            command.append('--maximize-uv-density')\n        before = receiver_profile(obj)")
baker.write_text(text)
packer=snapshot/'scripts/pack-blender-assets.mjs'
text=packer.read_text()
signature='xatlas-topology-v3-chartids;resolution=${resolution};padding=8;iterations=2'
marker='  const mesh = atlas.getMesh(0), result = new Uint32Array(mesh.indexCount); mesh.getIndexArray(result);'
if text.count(signature)!=1 or text.count(marker)!=1:
    raise RuntimeError('Frozen packer patch signatures changed')
text="import { maximizeUvDensity } from './uv-density-search.mjs';\n"+text
text=text.replace(signature,signature+"${args.includes('--maximize-uv-density')?';maximize=true':''}")
text=text.replace(marker,"  const densitySearch = args.includes('--maximize-uv-density') ? maximizeUvDensity(atlas, resolution, packOptions, attempts) : [];\n  console.log('XATLAS_DENSITY_SEARCH', densitySearch);\n"+marker)
text=text.replace('texelsPerUnit: atlas.texelsPerUnit, attempts }','texelsPerUnit: atlas.texelsPerUnit, attempts, densitySearch }')
packer.write_text(text)
layout=args.out/'layout'
candidate=args.out/'canonical'
sizes=f'altar=1024,hall={args.hall_size},court={args.court_size},gate=1024'
commands=[
    [args.blender,'--background',str(args.source),'--python-exit-code','1','--python',str(baker),'--','--out',str(layout),'--skip-bake','--samples','8','--device','METAL','--oidn-device','METAL','--region-resolutions',sizes,'--hidden-faces',str(args.hidden_proof)]]
if not args.fresh_source:
    commands.extend([
    [args.blender,'--background','--python-exit-code','1','--python',str(ROOT/'art/blender/preserve_prepared_geometry.py'),'--','--geometry',str(args.canonical_reference),'--layout',str(layout/'snow-roof-prepared.blend'),'--out',str(candidate/'input.blend'),'--report',str(candidate/'canonical-mesh-receipt.json')],
    [args.blender,'--background',str(candidate/'input.blend'),'--python-exit-code','1','--python',str(baker),'--','--out',str(candidate),'--export-only','--resume','--skip-bake','--samples','8','--device','METAL','--oidn-device','METAL','--region-resolutions',sizes,'--hidden-faces',str(args.hidden_proof)]])
recipe={'scope':__doc__,'inputs':inputs,'driverSha256':sha(Path(__file__)),'freshAuthoredSourceNoCanonicalRestoration':args.fresh_source,'refineUnderside':args.refine_underside,
        'resolutionByRegion':{'altar':1024,'hall':args.hall_size,'court':args.court_size,'gate':1024},'commands':commands,
        'snapshotFiles':[{'path':str(path.relative_to(ROOT)),'sha256':sha(path)}for path in sorted(snapshot.rglob('*'))if path.is_file()and not path.is_relative_to(snapshot/'node_modules')],
        'sourceHelpers':[{ 'path':str(path.relative_to(ROOT)),'sha256':sha(path)}for path in [ROOT/'art/blender/priority_lightmap_allocation.py',ROOT/'art/blender/join_tube_lightmap_charts.py',ROOT/'art/blender/refine_underside_lightmap.py',ROOT/'art/blender/preserve_prepared_geometry.py',ROOT/'scripts/uv-density-search.mjs']],
        'noSharedSourceMutation':True,'requiresAllActualProofAndNativeVisualGates':True,'nativeBakeAuthorizedByThisDriver':False}
receipt=args.out/'preparation-recipe.json'
receipt.write_text(json.dumps(recipe,indent=2)+'\n')
if args.snapshot_only:
    print('PRIORITY_RECIPE_ONLY_READY',sha(receipt));sys.exit(0)
env=os.environ.copy();env['ONE_LIGHT_GLTF_TOOLS']=str(args.tools)
for index,command in enumerate(commands):
    with (args.out/f'cpu-stage-{index+1}.log').open('w')as log:
        subprocess.run(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
for name,record in inputs.items():
    if sha(getattr(args,name))!=record['sha256']:raise RuntimeError('Actual frozen input changed')
print('PRIORITY_CPU_PREPARATION_READY',str(layout if args.fresh_source else candidate),'recipeSHA',sha(receipt),flush=True)
