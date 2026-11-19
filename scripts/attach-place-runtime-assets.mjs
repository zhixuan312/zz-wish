// Extend a finished baked delivery with verified runtime-owned visual assets.
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
const directory=resolve(option('--out')??''),posters=option('--posters'),fabric=option('--fabric'),nativeView=option('--native-view');
if(!option('--out')||(!posters&&!fabric&&!nativeView))throw new Error('Use --out DELIVERY with --posters ENCODED_POSTER_DIR, --fabric VISITOR_FABRIC_JSON and/or --native-view PROVENANCE_JSON.');
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifestPath=join(directory,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(manifest.partialPreview)throw new Error('Runtime assets may only finalize a complete baked delivery.');
if(manifest.bake?.integrator?.use_adaptive_sampling!==false||manifest.bake.integrator.use_animated_seed!==false)throw Error('Final runtime assets require fingerprinted fixed sampling; legacy adaptive maxima are not final-quality approval');
const regions=Object.values(manifest.lightmaps??{}),expectedRegions={'cloud-cliff':3,'snow-roof':4,'pine-gate':3}[manifest.place];
if(regions.length!==expectedRegions||!expectedRegions)throw new Error('Unexpected final lightmap regions.');
for(const looks of regions)for(const look of ['night','dusk','day','lamp']){
  const map=looks[look];
  if(!map||map.samples<64||map.bakeDevice!=='METAL'||map.denoiseDevice!=='METAL')throw new Error(`Final ${look} map requires a full-quality Metal bake and Metal denoising.`);
  if(map.mipLevels!==3||map.gutterPixels<8||map.maxLod!==2||!manifest.files.some(file=>file.uri===map.uri&&file.bytes===map.bytes))throw new Error(`Incomplete final ${look} map or chart protection.`);
}
if(manifest.bake?.lampPassQuantity==='indirect-diffuse-radiance-per-unit-albedo'){
 const exposure=manifest.bake.cameraPreExposure;
 if(!Number.isFinite(exposure)||exposure<=0||Math.abs(manifest.bake.threeLightMapIrradianceMultiplier-Math.PI*exposure)>1e-10)throw Error('Final source camera normalization is incomplete');
 for(const looks of regions)if(JSON.stringify(looks.lamp.passFilter)!==JSON.stringify(['INDIRECT'])||looks.lamp.quantity!==manifest.bake.lampPassQuantity||looks.lamp.cameraPreExposure!==exposure)throw Error('Final lamp map must retain actual indirect-only provenance');
}
const additions=[];
async function verifyFile(file,source){
  if(file.uri!==basename(file.uri))throw new Error('Runtime asset must be a local delivery file.');
  const bytes=await readFile(source);
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new Error(`Changed runtime asset: ${file.uri}`);
  const target=join(directory,file.uri);if(resolve(source)!==target)await copyFile(source,target);
  additions.push({...file});
}
if(posters){
  const source=resolve(posters),receipt=JSON.parse(await readFile(join(source,'posters.json'),'utf8'));
  if(receipt.partialPreview||Object.keys(receipt.posters).length!==3)throw new Error('Incomplete runtime poster receipt.');
  const bakeSource=manifest.bake?.sourceBlendSha256??manifest.bake?.source?.sha256??manifest.source?.sha256;
  if(bakeSource&&receipt.sourceBlendSha256!==bakeSource)throw new Error('Posters and baked scene have different authored sources.');
  for(const file of receipt.files)await verifyFile(file,join(source,file.uri));
  const receiptBytes=await readFile(join(source,'posters.json'));
  await verifyFile({uri:'posters.json',bytes:receiptBytes.length,sha256:hash(receiptBytes),role:'runtime-poster-provenance'},join(source,'posters.json'));
  manifest.posters=receipt.posters;manifest.posterSource={sourceBlendSha256:receipt.sourceBlendSha256,streamedManifestSha256:receipt.streamedManifestSha256,sourceFingerprintSha256:receipt.sourceFingerprintSha256};
}
if(fabric){
  const spec=JSON.parse(await readFile(resolve(fabric),'utf8'));
  for(const [role,map] of Object.entries(spec.maps)){
    const uri=basename(map.path);
    await verifyFile({uri,bytes:map.bytes,sha256:map.sha256,role:'visitor-fabric-'+role},resolve('web/public'+map.path));
  }
  manifest.visitorFabric={sourceAsset:spec.sourceAsset,license:spec.license,provenance:spec.provenance,totalBytes:spec.totalBytes};
}
if(nativeView){
  const provenance=JSON.parse(await readFile(resolve(nativeView),'utf8')),file=provenance.delivered;
  if(!file?.path?.startsWith('web/public/color/')||!file.url?.startsWith('/color/')||file.sha256!=='bc942c1862956cb48aed8c259d2e410518a10c4b26775a27c3b326d539244463')throw Error('Expected the verified native57³ Float16 AgX asset');
  const bytes=await readFile(resolve(file.path));
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Changed shared native view asset');
  const asset={url:file.url,bytes:file.bytes,sha256:file.sha256,role:'native-AgX-None-sRGB-view'};
  manifest.sharedVisualAssets=[...(manifest.sharedVisualAssets??[]).filter(item=>item.role!==asset.role),asset];
  manifest.nativeView={view:'AgX',look:'None',display:'sRGB',lut:asset.url,precision:'native57³ samples rounded once to Float16; tetrahedral interpolation',provenance:'docs/licenses/native-agx.json',cameraPreExposure:manifest.bake?.cameraPreExposure??1,residualCameraExposureEV:manifest.bake?.residualCameraExposureEV??0};
}
for(const file of manifest.sharedVisualAssets??[]){
  if(!file.url?.startsWith('/color/')||file.url.includes('..'))throw Error('Invalid shared visual asset');
  const bytes=await readFile(resolve('web/public'+file.url));
  if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Changed shared visual asset '+file.url);
}
const replaced=new Set(additions.map(file=>file.uri));
manifest.files=[...manifest.files.filter(file=>!replaced.has(file.uri)),...additions];
for(const file of manifest.files){const bytes=await readFile(join(directory,file.uri));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new Error(`Stale baked/runtime file: ${file.uri}`);}
const declared=new Set(['manifest.json',...manifest.files.map(file=>file.uri)]);
const unexpected=(await readdir(directory)).filter(name=>!declared.has(name));
if(unexpected.length)throw new Error(`Uncounted files remain in delivery: ${unexpected.join(', ')}`);
manifest.payloadBytes=manifest.files.reduce((sum,file)=>sum+file.bytes,0);
manifest.sharedVisualBytes=(manifest.sharedVisualAssets??[]).reduce((sum,file)=>sum+file.bytes,0);
// Formatting is not part of the runtime contract; all provenance stays intact.
let serialized;
for(let pass=0;pass<8;pass++){
  manifest.totalBytes=manifest.payloadBytes;
  serialized=JSON.stringify(manifest)+'\n';
  const size=Buffer.byteLength(serialized);
  if(manifest.manifestBytes===size&&manifest.completePackageBytes===manifest.payloadBytes+size+manifest.sharedVisualBytes)break;
  manifest.manifestBytes=size;manifest.completePackageBytes=manifest.payloadBytes+size+manifest.sharedVisualBytes;
}
serialized=JSON.stringify(manifest)+'\n';
if(manifest.manifestBytes!==Buffer.byteLength(serialized)||manifest.completePackageBytes!==manifest.payloadBytes+Buffer.byteLength(serialized)+manifest.sharedVisualBytes)throw new Error('Manifest byte-count fixed point did not settle.');
const cap={'cloud-cliff':10_000_000,'snow-roof':15_000_000,'pine-gate':15_000_000}[manifest.place];
if(!cap||manifest.completePackageBytes>cap)throw new Error(`Complete ${manifest.place} package ${manifest.completePackageBytes}B exceeds its budget.`);
await writeFile(manifestPath,serialized);
console.log(JSON.stringify({place:manifest.place,files:manifest.files.length,payloadBytes:manifest.payloadBytes,manifestBytes:manifest.manifestBytes,sharedVisualBytes:manifest.sharedVisualBytes,completePackageBytes:manifest.completePackageBytes,manifestSha256:hash(Buffer.from(serialized))}));
