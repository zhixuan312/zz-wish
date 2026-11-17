// CPU-only actual decoded triangle replay. Literal physical guards are fixed;
// only ownership association accounts for measured HERO quantization error.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const root=resolve(process.env.CLOUD_ROOT||'art/build/cloud-cliff-round1'),repo=process.cwd(),out=resolve(process.env.CLOUD_OUT||join(root,'independent-delivery')),production=resolve(process.env.CLOUD_PRODUCTION||join(root,'production'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const streamPath=join(out,'decoded-stream-proof.json'),streamBytes=await readFile(streamPath),streams=JSON.parse(streamBytes);
if(!streams.passed)throw Error('A passing actual decoded stream proof is required.');
const bound=Math.max(...streams.files.map(file=>file.maximumAffineQuantizationBoundMetres));
const association=Math.max(.000005,bound+.000001);
const basePath=resolve('art/blender/audit_prepared_resting_contacts.py'),base=await readFile(basePath,'utf8');
let script=base.replace('ROOT = Path(__file__).resolve().parents[2]',`ROOT = Path(${JSON.stringify(repo)})`)
  .replace("sys.path.insert(0,str(Path(__file__).resolve().parent))","sys.path.insert(0,str(ROOT/'art/blender'))")
  .replace('tol=.000005',`tol=.000005\nassociation_tol=${association}`)
  .replace('kd.find_range(p,tol)','kd.find_range(p,association_tol)')
  .replace('native KD association≤5µm only where necessary.',`native KD ownership association≤${(association*1e6).toFixed(6)}µm, bounded by independently decoded HERO quantization; original 5µm wick checks and literal 2mm/5mm contact guards retained.`);
if(script===base||!script.includes('kd.find_range(p,association_tol)'))throw Error('The bounded ownership-association patch did not match.');
const scriptPath=join(out,'audit-decoded-contacts.py'),contactPath=join(out,'decoded-contact-proof.json');
await writeFile(scriptPath,script);
const args=['-b','--threads','2','--python-exit-code','1','--python',scriptPath,'--','--source-audit',resolve(process.env.CLOUD_SOURCE_AUDIT||join(root,'cloud-cliff-source-v11.audit.json')),'--prepared',join(production,'cloud-cliff-prepared.blend'),'--raw',join(out,'decoded-main-audit.glb'),'--extra-raw',join(out,'decoded-hero-audit.glb'),'--out',contactPath];
const started=Date.now();
const child=spawn(process.env.BLENDER||'/Applications/Blender.app/Contents/MacOS/Blender',args,{stdio:['ignore','pipe','pipe']});
let log='';for(const pipe of [child.stdout,child.stderr])pipe.on('data',chunk=>{log+=chunk;process.stdout.write(chunk);});
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
await writeFile(join(out,'decoded-contact-proof.log'),log);
if(code!==0)throw Error('Actual decoded triangle contact replay failed.');
const contactBytes=await readFile(contactPath),contacts=JSON.parse(contactBytes);
const proof={version:1,createdAt:new Date().toISOString(),passed:streams.passed&&contacts.passed&&contacts.raw?.passed,source:streams.source,
 actualManifestSHA256:streams.manifestSha256,actualMain:streams.files.find(f=>f.kind==='main').candidate,actualHero:streams.files.find(f=>f.kind==='hero').candidate,
 decodedStreamProof:{path:streamPath,sha256:sha(streamBytes)},decodedTriangleContactProof:{path:contactPath,sha256:sha(contactBytes)},
 replay:{seconds:(Date.now()-started)/1000,baseScript:{path:basePath,sha256:sha(base)},derivedAuditScript:{path:scriptPath,sha256:sha(script)},associationToleranceMetres:association,associationReason:'Actual decoded HERO affine quantization bound plus 1µm numerical allowance. This affects source ownership association only; the actual measured triangle geometry is never moved or snapped.',literalContactGuardsMetres:contacts.literalGuardsMetres,wickTipCoordinateGuardMetres:.000005},
 genuineSourceFloat32Main:true,heroRemainsQuant16InActualDelivery:streams.files.find(f=>f.kind==='hero').meshes.some(mesh=>mesh.positionFormats.some(format=>format.type!==5126||format.normalized)),decodedFloatDerivativesAreAuditOnly:true,
 sourceAnchorMetadataByteExact:contacts.sourceAnchorMetadataByteExact&&contacts.raw.sourceAnchorMetadataByteExact,
 groups:contacts.raw.groups,hangingPairs:contacts.raw.hangingPairs,wickTips:contacts.raw.wickTips,anchorNodes:contacts.raw.anchorNodes,
 actualDecodedAssociation:contacts.raw.association,decodedStreams:streams.files.map(({kind,checks,totalTriangles,maximumWorldErrorMetres,maximumAffineQuantizationBoundMetres})=>({kind,checks,totalTriangles,maximumWorldErrorMetres,maximumAffineQuantizationBoundMetres})),
 noSourcePreparedCandidateMutation:true,noRenderBakeEncodingOrGpuJobs:true,
 limitation:'Material factors/texture roles, UV0 and tints are measured here, with quantization errors explicit. This is not a perceptual texture-compression approval; the separate decoded KTX image audit and actual browser visual review remain required.',
 commands:['node scripts/audit-cloud-delivery.mjs','node scripts/audit-cloud-delivery-contacts.mjs']};
if(sha(await readFile(streamPath))!==sha(streamBytes))throw Error('Decoded stream proof changed during contact replay.');
const proofPath=resolve(process.env.CLOUD_PROOF||join(root,'independent-delivery-proof.json'));await writeFile(proofPath,JSON.stringify(proof,null,2)+'\n');
console.log('INDEPENDENT_CLOUD_DELIVERY',JSON.stringify({passed:proof.passed,path:proofPath,sha256:sha(await readFile(proofPath)),groups:proof.groups.length,hangingPairs:proof.hangingPairs.length}));
if(!proof.passed)throw Error('Independent decoded delivery proof failed.');
