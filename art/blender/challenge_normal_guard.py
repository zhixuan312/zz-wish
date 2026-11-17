"""Exercise the actual pre-bake normal gate without rendering or baking."""
import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys
import bpy
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from bake_export import receiver_profile, source_binding, validate_prepared_normal_audit

parser=argparse.ArgumentParser(description=__doc__)
for key in ['prepared','mapping','out']:parser.add_argument('--'+key,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
digest=lambda path:sha256(path.read_bytes()).hexdigest()
inputs={name:{'path':str(path),'sha256':digest(path)} for name,path in [('prepared',args.prepared),('mapping',args.mapping)]}
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene=bpy.context.scene;binding=source_binding(scene,True)
regions={obj['lightmap_region']:obj for obj in scene.objects if obj.type=='MESH' and obj.get('one_light_static') and not obj.get('one_light_dynamic')}
profiles={region:receiver_profile(obj) for region,obj in sorted(regions.items())}
transfer=json.loads(scene['one_light_normal_transfer']);proof=json.loads(args.mapping.read_text())
rows=[]
def run(name,expected,transfer_value=transfer,proof_value=proof,profile_value=profiles):
    try:
        validate_prepared_normal_audit(scene,binding,profile_value,transfer_value,proof_value)
        accepted=True;error=None
    except RuntimeError as exception:
        accepted=False;error=str(exception)
    if accepted!=expected:raise RuntimeError('Normal guard challenge failed: '+name)
    rows.append({'case':name,'expectedAccepted':expected,'actualAccepted':accepted,'message':error})
run('actual current source/receiver proof',True)
run('missing mapping proof',False,proof_value=None)
for name,key,value in [('failed proof','passed',False),('failed source normal correspondence','sourceMaterialUVTintNormalCorrespondencePassed',False),('wrong source','sourceBlendSha256','0'*64),('diagnostic without UV binding','diagnosticOnlyNoUVPreparationClaim',True),('missing receiver bindings','receiverProfiles',{})]:
    bad=deepcopy(proof);bad[key]=value;run(name,False,proof_value=bad)
first=next(iter(profiles))
for field in ['receiverFingerprint','lightmapUVFingerprint']:
    bad=deepcopy(proof);bad['receiverProfiles'][first][field]='0'*64;run('stale '+field,False,proof_value=bad)
for field in ['sourceWorldNormalSha256','sourceLoopReferenceSha256']:
    bad=deepcopy(transfer);bad['receivers'][first][field]='0'*64;run('wrong actual '+field,False,transfer_value=bad)
run('missing transfer',False,transfer_value=None)
bad=deepcopy(transfer);bad['receivers'].pop(first);run('missing transfer receiver',False,transfer_value=bad)
policy=scene['one_light_normal_transfer_policy'];scene['one_light_normal_transfer_policy']='legacy-implicit-normals'
run('legacy preparation policy',False);scene['one_light_normal_transfer_policy']=policy
obj=regions[first];custom=obj.data.attributes['custom_normal'];original=Vector(custom.data[0].vector)
custom.data[0].vector=original+Vector((.013,.007,.019));obj.data.update()
changed={region:receiver_profile(value) for region,value in sorted(regions.items())}
if changed[first]['fieldSha256']['cornerNormals']==profiles[first]['fieldSha256']['cornerNormals']:raise RuntimeError('Actual normal mutation did not alter corner fingerprint')
run('actual normal mutation cannot reuse proof/GI key',False,profile_value=changed)
custom.data[0].vector=original;obj.data.update()
restored={region:receiver_profile(value) for region,value in sorted(regions.items())}
if restored!=profiles:raise RuntimeError('In-memory normal challenge was not exactly restored')
scene['one_light_unrelated_guard_note']='Metadata-only edit'
run('unrelated metadata does not change receiver identity',True)
del scene['one_light_unrelated_guard_note']
for name,path in [('prepared',args.prepared),('mapping',args.mapping)]:
    if digest(path)!=inputs[name]['sha256']:raise RuntimeError('Immutable gate input changed: '+name)
report={'passed':True,'cases':rows,'inputs':inputs,'sourceBlendSha256':binding['sha256'],'normalTransferPolicy':policy,'receiverFingerprints':{name:value['receiverFingerprint'] for name,value in profiles.items()},'actualCornerNormalMutationInvalidatesFingerprint':True,'allInMemoryNormalsExactlyRestored':True,'immutableFilesUnchanged':True,'cyclesRenderBakeGpuJobs':0,'validatorScriptSha256':digest(Path(__file__).with_name('bake_export.py')),'generatorSha256':digest(Path(__file__))}
args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n')
print('NORMAL_GUARD_CHALLENGE_PASS',len(rows),str(args.out),digest(args.out),flush=True)
