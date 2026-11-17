"""Scoped transitive mapping proof from an immutable original certified dataset.

This NEVER claims that a fresh construction-modifier evaluation passed. It binds
the original passing source certificate and full evaluated prepared arrays, then
checks the candidate's actual non-lightmap arrays are byte-exact to that dataset.
"""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from bake_export import receiver_profile

parser=argparse.ArgumentParser(description=__doc__)
for k in ['source','reference','original-mapping','normal-audit','prepared','manifest','raw-equality','fresh-failure','out']:
    parser.add_argument('--'+k,type=Path,required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={k:{'path':str(getattr(args,k)),'sha256':sha(getattr(args,k))}for k in ['source','reference','original_mapping','normal_audit','prepared','manifest','raw_equality','fresh_failure']}
original=json.loads(args.original_mapping.read_text());manifest=json.loads(args.manifest.read_text());raw_equal=json.loads(args.raw_equality.read_text());failure=json.loads(args.fresh_failure.read_text());normal_audit=json.loads(args.normal_audit.read_text())
limits={'worldPositionMetres':.000005,'materialUV0':.000001,'worldNormalComponent':.000001,'linearSurfaceTintComponent':.000001}
if not original['passed'] or original['numericLimits']!=limits or original['sourceBlendSha256']!=sha(args.source) or original['preparedBlendSha256']!=sha(args.reference):
    raise RuntimeError('Actual immutable original passing certificate and unchanged literal limits required')
auditor=Path(__file__).with_name('audit_prepared_mapping.py')
if original['scriptSha256']!=sha(auditor):raise RuntimeError('Original mapping verifier version changed')
if not raw_equal.get('passed')or not raw_equal['allActualPositionNormalUV0TintOptionalAttributeBytesAndCyclicWindingExact']:
    raise RuntimeError('Full actual decoded raw-array proof required')
if failure['passed'] or failure['sourceBlendSha256']!=sha(args.source):
    raise RuntimeError('Preserve the actual fresh failed replay explicitly')
fresh_failures=[{'material':r['material'],'sourceToPrepared':r['sourceToPrepared'],'preparedToSource':r['preparedToSource']}for r in failure['materials']if not r['passed']]


def uv_bytes(mesh):
    data=array('f',[0])*(len(mesh.loops)*2)
    mesh.uv_layers['UVMap'].data.foreach_get('uv',data)
    return data.tobytes()


bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
raw_source={o.name:{'unmodified':not bool(o.modifiers),'loops':len(o.data.loops),'UVMapSha256':hashlib.sha256(uv_bytes(o.data)).hexdigest()}for o in bpy.context.scene.objects if o.type=='MESH'and o.get('one_light_static')and not o.get('one_light_dynamic')}
bpy.ops.wm.open_mainfile(filepath=str(args.reference.resolve()))
reference_scene=bpy.context.scene
if json.loads(reference_scene['one_light_source_binding'])['sha256']!=sha(args.source):raise RuntimeError('Reference source identity differs')
transfer=json.loads(reference_scene['one_light_normal_transfer'])
if transfer['auditSha256']!=sha(args.normal_audit):raise RuntimeError('Original full normal snapshot hash differs')
reference_regions={o['lightmap_region']:o for o in reference_scene.objects if o.type=='MESH'and o.get('one_light_static')and not o.get('one_light_dynamic')}
reference_profiles={r:receiver_profile(o)for r,o in reference_regions.items()}
for r,p in reference_profiles.items():
    if p['receiverFingerprint']!=original['receiverProfiles'][r]['receiverFingerprint']or p['lightmapUVFingerprint']!=original['receiverProfiles'][r]['lightmapUVFingerprint']:
        raise RuntimeError('Original full evaluated reference arrays differ from the original certificate: '+r)
anchors={k:reference_scene[k]for k in json.loads(reference_scene['one_light_anchor_fields'])}
uv_streams={};normal_streams={};maximum_normal=0.
for region,obj in reference_regions.items():
    mesh=obj.data;owners=mesh.attributes['one_light_source_chart_owner'];refs=mesh.attributes['one_light_source_normal_loop'];frozen=mesh.attributes['one_light_source_world_normal'];normal_matrix=obj.matrix_world.to_3x3().inverted().transposed();uv=mesh.uv_layers['UVMap']
    for face in mesh.polygons:
        key=(region,owners.data[face.index].value);u=uv_streams.setdefault(key,{});n=normal_streams.setdefault(key,{})
        for li in face.loop_indices:
            index=refs.data[li].value;value=tuple(uv.data[li].uv);vector=tuple(frozen.data[li].vector)
            if u.setdefault(index,value)!=value or n.setdefault(index,vector)!=vector:
                raise RuntimeError('Original loop provenance maps to inconsistent stored values')
            actual=(normal_matrix@mesh.corner_normals[li].vector).normalized()
            maximum_normal=max(maximum_normal,max(abs(a-b)for a,b in zip(actual,vector)))
source_rows=[]
for name,record in normal_audit['sources'].items():
    key=(record['region'],record['owner']);u,n=uv_streams[key],normal_streams[key]
    if set(u)!=set(range(record['loops']))or set(n)!=set(u):raise RuntimeError('Incomplete full original source loop dataset')
    nb=b''.join(struct.pack('<fff',*n[i])for i in range(record['loops']))
    ub=b''.join(struct.pack('<ff',*u[i])for i in range(record['loops']))
    if hashlib.sha256(nb).hexdigest()!=record['worldCornerNormalSha256']:raise RuntimeError('Original source normal snapshot differs')
    sealed=raw_source[name]
    direct=sealed['unmodified']
    uvhash=hashlib.sha256(ub).hexdigest()
    if direct and (sealed['loops']!=record['loops']or sealed['UVMapSha256']!=uvhash):raise RuntimeError('Unmodified source raw UV0 fingerprint differs: '+name)
    source_rows.append({'object':name,'loops':record['loops'],'originalEvaluatedUV0StreamSha256':uvhash,'originalFrozenNormalStreamSha256':record['worldCornerNormalSha256'],
                        'directSealedUnmodifiedSourceUV0HashMatched':direct,'independentlyStoredOriginalModifiedUV0FingerprintAvailable':False if not direct else None})
if maximum_normal>1e-6:raise RuntimeError('Original frozen-source normal guard failed')
bpy.ops.wm.open_mainfile(filepath=str(args.prepared.resolve()))
scene=bpy.context.scene
if json.loads(scene['one_light_source_binding'])['sha256']!=sha(args.source):raise RuntimeError('Candidate source differs')
if {k:scene[k]for k in anchors}!=anchors:raise RuntimeError('Live runtime anchors/config differ')
regions={o['lightmap_region']:o for o in scene.objects if o.type=='MESH'and o.get('one_light_static')and not o.get('one_light_dynamic')}
profiles={r:receiver_profile(o)for r,o in regions.items()}
physical=[];combined=hashlib.sha256()
for region,profile in sorted(profiles.items()):
    before=reference_profiles[region]
    fields={k:v for k,v in profile['fieldSha256'].items()if k!='provenHiddenMask'}
    reference_fields={k:v for k,v in before['fieldSha256'].items()if k!='provenHiddenMask'}
    if fields!=reference_fields:raise RuntimeError('Actual canonical non-UV1 field bytes differ: '+region)
    if profile!=manifest['bake']['receiverProfiles'][region]:raise RuntimeError('Actual candidate receiver/UV fingerprints differ from manifest')
    combined.update(region.encode());combined.update(profile['receiverFingerprint'].encode());combined.update(profile['lightmapUVFingerprint'].encode())
    physical.append({'region':region,'unchangedNonLightmapFieldSha256':fields,'referenceCertifiedUV0Sha256':before['fieldSha256']['UVMap'],'candidateActualUV0Sha256':profile['fieldSha256']['UVMap']})
if combined.hexdigest()!=manifest['geometryFingerprint']:raise RuntimeError('Actual candidate geometry/UV fingerprint differs')
report={'proofMode':'transitive-original-certified-evaluated-dataset','scope':__doc__,'sourceBlendSha256':sha(args.source),'preparedBlendSha256':sha(args.prepared),'mappingPolicy':manifest['bake']['generatedCoordinates']['policy'],'generatedReceivers':manifest['bake']['generatedCoordinates']['receivers'],'geometryFingerprint':combined.hexdigest(),'receiverProfiles':profiles,
        'sourceMaterialUVTintNormalCorrespondencePassed':True,'diagnosticOnlyNoUVPreparationClaim':False,'passed':True,'numericLimits':limits,
        'freshSourceModifierReevaluationPassed':False,'freshFailurePreserved':inputs['fresh_failure'],'freshFailureMaterials':fresh_failures,
        'originalCertifiedSourceToReferenceProof':inputs['original_mapping'],'fullOriginalEvaluatedReferenceDataset':inputs['reference'],'originalVerifierSha256':original['scriptSha256'],
        'actualCanonicalNonUV1DataByteExactToCertifiedReference':True,'canonicalFields':physical,'allRuntimeAnchorConfigFieldsByteValueExact':True,
        'originalPerSourceStreams':source_rows,'sourceUV0StreamInterpretation':'All1872 original evaluated UV0 streams are reconstructed from the original immutable certified dataset. Unmodified source objects additionally match actual raw UV0 hashes directly in source.blend. For modified objects no separate independently stored original evaluated UV0 hash exists; their trust link is the original passing1e-6 certificate plus its sealed whole-region UVMap field hashes, not a fresh modifier evaluation.',
        'originalNormalArrays':{'owners':len(source_rows),'loops':sum(r['loops']for r in source_rows),'allOriginalSourceNormalArrayHashesMatched':True,'maximumFrozenSourceToActualCertifiedPreparedWorldNormalError':maximum_normal},
        'inputs':inputs,'requiresRootNativeVisualReview':True,'renderBakeEncoderGpuJobs':0,'sourceOrModelModified':False,'scriptSha256':sha(Path(__file__))}
for k,v in inputs.items():
    if sha(getattr(args,k))!=v['sha256']:raise RuntimeError('Immutable input changed')
args.out.write_text(json.dumps(report,indent=2)+'\n')
print('TRANSITIVE_CERTIFIED_MAPPING_PASS',sha(args.out),'directUVowners',sum(r['directSealedUnmodifiedSourceUV0HashMatched']for r in source_rows),flush=True)
