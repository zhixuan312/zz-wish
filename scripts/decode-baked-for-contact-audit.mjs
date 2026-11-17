#!/usr/bin/env node
/** Decoder-only staging copy for the independent evaluated-contact auditor. */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),opt={};
for(let i=0;i<args.length;i+=2){if(!['--input','--output','--receipt','--tools'].includes(args[i])||!args[i+1])throw Error('Explicit input/output/receipt required');opt[args[i]]=resolve(args[i+1]);}
if(!opt['--input']||!opt['--output']||!opt['--receipt'])throw Error('Explicit input/output/receipt required');
for(const key of ['--output','--receipt']){const p=relative(resolve(root,'art/build'),opt[key]);if(isAbsolute(p)||p==='..'||p.startsWith('../')||await access(opt[key]).then(()=>true,()=>false))throw Error('New ignored art/build output required');}
const sha=x=>createHash('sha256').update(x).digest('hex'),prefix=opt['--tools']??'/tmp/one-light-gltf-tools';
const module=async name=>import(pathToFileURL(resolve(prefix,'node_modules',name)).href);
const [{NodeIO},{ALL_EXTENSIONS},{MeshoptDecoder}]=await Promise.all([module('@gltf-transform/core/dist/index.js'),module('@gltf-transform/extensions/dist/index.js'),module('meshoptimizer/meshopt_decoder.mjs')]);
await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
function signature(doc){return doc.getRoot().listMeshes().map(mesh=>mesh.listPrimitives().map(p=>({mode:p.getMode(),semantics:p.listSemantics().sort().map(s=>{const a=p.getAttribute(s),v=a.getArray();return[s,a.getComponentType(),a.getType(),a.getNormalized(),sha(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))];}),indices:(()=>{const a=p.getIndices().getArray();return sha(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));})()})));}
const input=await readFile(opt['--input']),before=sha(input),doc=await io.read(opt['--input']),streams=signature(doc),extras=doc.getRoot().listScenes().map(s=>s.getExtras());
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())if(p.getAttribute('POSITION').getComponentType()!==5126||p.getAttribute('POSITION').getNormalized())throw Error('Only genuine F32 input can be replayed by this decoder recipe');
for(const extension of doc.getRoot().listExtensionsUsed())if(extension.extensionName==='EXT_meshopt_compression')extension.dispose();
await mkdir(dirname(opt['--output']),{recursive:true});await io.write(opt['--output'],doc);
const decoded=await io.read(opt['--output']);
if(JSON.stringify(signature(decoded))!==JSON.stringify(streams)||JSON.stringify(decoded.getRoot().listScenes().map(s=>s.getExtras()))!==JSON.stringify(extras))throw Error('Decoder staging changed actual arrays or source scene extras');
if(sha(await readFile(opt['--input']))!==before)throw Error('Frozen input changed');
const output=await readFile(opt['--output']);const receipt={scope:'Decoder-only uncompressed audit copy, not a delivery encoder or source-F32 fabrication. Exact actual typed arrays and indices retain their original data types/normalization.',input:{path:relative(root,opt['--input']),sha256:before,bytes:input.length},output:{path:relative(root,opt['--output']),sha256:sha(output),bytes:output.length},everyActualAttributeAndIndexArrayByteExact:true,sourceSceneExtrasByteValueExact:true,encodersUsed:0,quantizationPasses:0,renderBakeGpuJobs:0,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url)))};
await mkdir(dirname(opt['--receipt']),{recursive:true});await writeFile(opt['--receipt'],JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('DECODED_CONTACT_AUDIT_COPY',JSON.stringify(receipt));
