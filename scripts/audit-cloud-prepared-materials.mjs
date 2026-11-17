// Compare actual raw source and prepared PBR graphs/images; CPU only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const source=get('--source'),main=get('--main'),hero=get('--hero'),out=get('--out');
if(!source||!main||!hero||!out||fs.existsSync(out))throw new Error('Required source/main/hero and fresh --out');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=[];
function load(file){const bytes=fs.readFileSync(file);files.push({path:path.resolve(file),sha256:sha(bytes),bytes:bytes.length});
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid raw GLB');
  let json,bin;for(let offset=12;offset<bytes.length;){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),value=bytes.subarray(offset+8,offset+8+size);if(type===0x4e4f534a)json=JSON.parse(value);if(type===0x004e4942)bin=value;offset+=size+8;}
  return {json,bin};
}
function state(doc,material){
  const texture=index=>{const t=doc.json.textures[index],image=doc.json.images[t.source??t.extensions?.EXT_texture_webp?.source??t.extensions?.KHR_texture_basisu?.source],view=doc.json.bufferViews[image.bufferView];if(!view)throw Error('Expected embedded actual raw image');return {imageSha256:sha(doc.bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)),mimeType:image.mimeType,sampler:doc.json.samplers?.[t.sampler]??{}};};
  const visit=(object,at='')=>Array.isArray(object)?object.map(v=>typeof v==='object'&&v!==null?visit(v):v):Object.fromEntries(Object.entries(object).filter(([key])=>!(at===''&&key==='name')).map(([key,value])=>[key,key==='index'&&/Texture$/.test(at)?texture(value):value&&typeof value==='object'?visit(value,key):value]));
  return visit(material);
}
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const baseline=load(source),reference=new Map(baseline.json.materials.map(m=>[m.name,canonical(state(baseline,m))])),rows=[];
for(const [kind,file]of[['main',main],['hero',hero]]){
  const doc=load(file);
  for(const m of doc.json.materials){const actual=canonical(state(doc,m));if(reference.get(m.name)!==actual)throw Error('Actual PBR material/image/sampler changed: '+m.name);rows.push({kind,material:m.name,actualPbrImageStateSha256:sha(actual),exact:true});}
}
const report={passed:true,files,materials:rows,scope:'Actual source combined raw vs actual prepared static/HERO raw. Every material scalar, extension, extras, texture coordinate/transform, sampler and encoded embedded image payload is identical. Source/prepared corner mapping, raw NORMAL and physical-contact receipts are separate.',nativeGpuEncoderJobs:0};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,materials:rows.length,path:out,sha256:sha(fs.readFileSync(out))}));
