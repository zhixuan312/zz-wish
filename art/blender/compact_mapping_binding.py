"""Small native mapping binding pointing to immutable full measured evidence.

Only the proof representation is compacted. No source/receiver/runtime data,
measurement, threshold, original certificate or fresh failure is modified.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--proof',type=Path,required=True)
parser.add_argument('--out',type=Path,required=True)
args=parser.parse_args()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=json.loads(args.proof.read_text())
if (proof.get('passed') and proof.get('sourceMaterialUVTintNormalCorrespondencePassed')
        and proof.get('diagnosticOnlyNoUVPreparationClaim') is False
        and not proof.get('proofMode') and proof.get('materials')):
    if args.out.exists():raise RuntimeError('A new compact direct-proof output is required')
    for row in proof['inputs'].values():
        if sha(Path(row['path']))!=row['sha256']:raise RuntimeError('Actual direct evidence input changed')
    if not all(row['passed'] for row in proof['materials']):raise RuntimeError('Actual per-material mapping failure')
    fields=['sourceBlendSha256','preparedBlendSha256','mappingPolicy','generatedReceivers',
            'geometryFingerprint','receiverProfiles','sourceMaterialUVTintNormalCorrespondencePassed',
            'diagnosticOnlyNoUVPreparationClaim','passed','numericLimits','requiresRootNativeVisualReview',
            'sourceOrModelModified']
    result={key:proof[key] for key in fields}
    result.update({'scope':__doc__,'proofMode':'direct-frozen-authored-source-to-prepared',
        'fullMeasuredDirectEvidence':{'path':str(args.proof),'sha256':sha(args.proof),'bytes':args.proof.stat().st_size},
        'materialSummary':{'materials':len(proof['materials']),'allPassed':True,
            'originalMaterialMeasurementsSha256':hashlib.sha256(json.dumps(proof['materials'],separators=(',',':')).encode()).hexdigest()},
        'renderBakeEncoderGpuJobs':0,'generatorSha256':sha(Path(__file__))})
    args.out.write_text(json.dumps(result,indent=2)+'\n')
    print('COMPACT_DIRECT_MAPPING_BINDING_READY',sha(args.out),args.out.stat().st_size,flush=True)
    sys.exit(0)
if args.out.exists()or not proof.get('passed')or proof.get('proofMode')!='transitive-original-certified-evaluated-dataset'or proof.get('freshSourceModifierReevaluationPassed')is not False:
    raise RuntimeError('Actual scoped transitive certificate and a new output are required')
for row in proof['inputs'].values():
    if sha(Path(row['path']))!=row['sha256']:raise RuntimeError('Full evidence input changed')
fields=['proofMode','sourceBlendSha256','preparedBlendSha256','mappingPolicy','generatedReceivers','geometryFingerprint','receiverProfiles','sourceMaterialUVTintNormalCorrespondencePassed','diagnosticOnlyNoUVPreparationClaim','passed','numericLimits','freshSourceModifierReevaluationPassed','freshFailurePreserved','originalCertifiedSourceToReferenceProof','fullOriginalEvaluatedReferenceDataset','actualCanonicalNonUV1DataByteExactToCertifiedReference','allRuntimeAnchorConfigFieldsByteValueExact','originalNormalArrays','sourceUV0StreamInterpretation','requiresRootNativeVisualReview','sourceOrModelModified']
result={k:proof[k]for k in fields}
rows=proof['originalPerSourceStreams']
result.update({'scope':__doc__,'fullMeasuredTransitiveEvidence':{'path':str(args.proof),'sha256':sha(args.proof),'bytes':args.proof.stat().st_size},
               'ownerStreamSummary':{'owners':len(rows),'directSealedUnmodifiedSourceUV0HashMatches':sum(r['directSealedUnmodifiedSourceUV0HashMatched']for r in rows),'modifiedOwnersUsingOriginalCertifiedRegionUV0Fingerprints':sum(not r['directSealedUnmodifiedSourceUV0HashMatched']for r in rows),'originalOwnerStreamListSha256':hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest()},
               'renderBakeEncoderGpuJobs':0,'generatorSha256':sha(Path(__file__))})
args.out.write_text(json.dumps(result,indent=2)+'\n')
print('COMPACT_MAPPING_BINDING_READY',sha(args.out),args.out.stat().st_size,flush=True)
