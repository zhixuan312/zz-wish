#!/usr/bin/env node
/** Decoder-only equality proof permitting only a fresh TEXCOORD_1 allocation. */
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '/tmp/one-light-gltf-tools/node_modules/@gltf-transform/extensions/dist/index.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),opt={};
for(let i=2;i<process.argv.length;i+=2)opt[process.argv[i]]=resolve(root,process.argv[i+1]);
for(const k of ['--before','--after','--out'])if(!opt[k])throw Error('Explicit --before --after --out required');
if(!opt['--out'].startsWith(root+'/art/build/')||await access(opt['--out']).then(()=>true,()=>false))throw Error('New ignored report required');
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m);};
const aBytes=await readFile(opt['--before']),bBytes=await readFile(opt['--after']),io=new NodeIO().registerExtensions(ALL_EXTENSIONS),a=await io.read(opt['--before']),b=await io.read(opt['--after']);
const json=x=>JSON.parse(x.subarray(20,20+x.readUInt32LE(12)).toString());
same(json(aBytes).materials,json(bBytes).materials,'Physical material definitions changed');
same(a.getRoot().listTextures().map(t=>sha(t.getImage())).sort(),b.getRoot().listTextures().map(t=>sha(t.getImage())).sort(),'Embedded source image payloads changed');
function nodes(doc){return new Map(doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>[n.getExtras().lightmap_region,n]));}
function signature(p){const semantics=p.listSemantics().filter(n=>n!=='TEXCOORD_1').sort(),attrs=semantics.map(s=>p.getAttribute(s)),header=attrs.map((v,i)=>[semantics[i],v.getType(),v.getComponentType(),v.getNormalized()]),idx=p.getIndices().getArray(),rows=[];
 for(let i=0;i<idx.length;i+=3){const corners=[0,1,2].map(c=>Buffer.concat(attrs.map(a=>{const v=a.getArray(),size=a.getElementSize()*v.BYTES_PER_ELEMENT;return Buffer.from(v.buffer,v.byteOffset+idx[i+c]*size,size);})));const cyclic=[0,1,2].map(c=>Buffer.concat([corners[c],corners[(c+1)%3],corners[(c+2)%3]]));cyclic.sort(Buffer.compare);rows.push(cyclic[0]);}rows.sort(Buffer.compare);return{sha256:sha(Buffer.concat([Buffer.from(JSON.stringify(header)),...rows])),triangles:rows.length};}
const regions={},an=nodes(a),bn=nodes(b);
same([...an.keys()].sort(),[...bn.keys()].sort(),'Region population changed');
for(const[region,n]of an){const m=bn.get(region);same(n.getWorldMatrix(),m.getWorldMatrix(),'World transforms changed');const ap=n.getMesh().listPrimitives(),bp=m.getMesh().listPrimitives();if(ap.length!==bp.length)throw Error('Material primitive population changed');let triangles=0;
 for(let i=0;i<ap.length;i++){const x=signature(ap[i]),y=signature(bp[i]);same(x,y,'Actual non-lightmap triangle/corner/winding data changed: '+region+'/'+i);triangles+=x.triangles;}regions[region]={triangles,primitives:ap.length,actualPositionNormalUV0TintOptionalAttributesAndWindingByteExact:true};}
const fields=extras=>Object.fromEntries(Object.entries(extras).filter(([k])=>k.startsWith('static_')||k==='one_light_lamp_basis'||k==='one_light_source_binding'));
same(a.getRoot().listScenes().map(s=>fields(s.getExtras())),b.getRoot().listScenes().map(s=>fields(s.getExtras())),'Source binding or live runtime anchor/config changed');
if(sha(await readFile(opt['--before']))!==sha(aBytes)||sha(await readFile(opt['--after']))!==sha(bBytes))throw Error('Frozen actual input changed');
const report={scope:'Independent actual raw triangle/corner equality, allowing only TEXCOORD_1 storage and nonphysical preparation/proof metadata changes. No source/render/bake/encoder edits. Does not approve new GI quality or reuse old maps.',before:{path:relative(root,opt['--before']),sha256:sha(aBytes)},after:{path:relative(root,opt['--after']),sha256:sha(bBytes)},regions,allActualPositionNormalUV0TintOptionalAttributeBytesAndCyclicWindingExact:true,worldTransformsMaterialsOriginalImagesRuntimeAnchorsAndSourceBindingExact:true,cyclesRenderBakeEncoderGpuJobs:0,scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),passed:true};
await writeFile(opt['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log('LIGHTMAP_REALLOCATION_EXACT_PASS',JSON.stringify({report:relative(root,opt['--out']),sha256:sha(await readFile(opt['--out']))}));
