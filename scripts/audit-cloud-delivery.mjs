// Independent CPU decode: actual main/HERO payloads, cyclic winding, materials,
// UVs/tints and anchors. Derivatives are decoded audit inputs, never source F32.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.env.CLOUD_ROOT || 'art/build/cloud-cliff-round1');
const out = resolve(process.env.CLOUD_OUT || join(root, 'independent-delivery')),production=resolve(process.env.CLOUD_PRODUCTION||join(root,'production')),delivery=resolve(process.env.CLOUD_DELIVERY||join(root,'delivery')); await mkdir(out, { recursive: true });
const tools = process.env.ONE_LIGHT_GLTF_TOOLS || '/tmp/one-light-gltf-tools';
const load = (name, file = 'dist/index.js') => import(pathToFileURL(join(tools,'node_modules',name,file)).href);
const { NodeIO } = await load('@gltf-transform/core'), { ALL_EXTENSIONS } = await load('@gltf-transform/extensions'), { dequantize } = await load('@gltf-transform/functions'), { MeshoptDecoder } = await load('meshoptimizer','index.js');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), inputs = new Map();
const frozen = async path => { const bytes = await readFile(path); inputs.set(path,sha(bytes)); return bytes; };
const jsonGlb = bytes => JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const stable = value => JSON.stringify(value, (_,v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
const point = (m,p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const normal=(m,p)=>{const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],bc=cross(b,c),ca=cross(c,a),ab=cross(a,b),det=a.reduce((sum,n,i)=>sum+n*bc[i],0),v=[0,1,2].map(i=>(bc[i]*p[0]+ca[i]*p[1]+ab[i]*p[2])/det),length=Math.hypot(...v);return v.map(n=>n/length);};
const pointKey = p => { const bytes=Buffer.allocUnsafe(12);p.forEach((v,i)=>bytes.writeFloatLE(v===0?0:v,i*4));return bytes.toString('hex'); };
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));
const value = (accessor,index) => accessor?.getElement(index,[]) ?? null;
const attributeError = (left,right) => left && right && left.length === right.length ? Math.max(...left.map((v,i)=>Math.abs(v-right[i]))) : left === right ? 0 : Infinity;
const materialState = (json,index) => {
  const texture = index => {
    const row=json.textures[index],image=json.images[row.source??row.extensions?.KHR_texture_basisu?.source??row.extensions?.EXT_texture_webp?.source??row.extensions?.EXT_texture_avif?.source],sampler=json.samplers?.[row.sampler]??{};
    return { imageName:image.name, sampler:{wrapS:sampler.wrapS??10497,wrapT:sampler.wrapT??10497,minFilter:sampler.minFilter??9987,magFilter:sampler.magFilter??9729} };
  };
  const visit = (object, path='') => Object.fromEntries(Object.entries(object).filter(([key])=>!(path===''&&key==='name')).map(([key,v])=>[key,key==='index'&&/Texture$/.test(path)?texture(v):v&&typeof v==='object'&&!Array.isArray(v)?visit(v,key):v]));
  return visit(json.materials[index]);
};
const sourceAudit=JSON.parse(await frozen(resolve(process.env.CLOUD_SOURCE_AUDIT||join(root,'cloud-cliff-source-v11.audit.json'))));
const manifestPath=join(delivery,'manifest.json'),manifest=JSON.parse(await frozen(manifestPath));
const sourcePath=resolve(sourceAudit.source.path);if(sha(await frozen(sourcePath))!==sourceAudit.source.sha256)throw Error('Source binding changed.');
const report={version:2,createdAt:new Date().toISOString(),source:sourceAudit.source,manifestSha256:inputs.get(manifestPath),method:'Independent NodeIO/Meshopt decode of actual files; compare all world triangles by cyclic corner order without winding reversal. Main authored positions are exact F32. HERO corners associate to nearest actual raw positions under an explicit decoded quantization bound; contact guards remain 2 mm/5 mm. Standard NORMAL is inverse-transpose transformed and compared on those same corners; delivered codec error is measured separately from the source/raw1e−6 gate.',files:[],checks:[],noBrowserRenderBakeOrGpu:true};
for(const kind of ['main','hero']){
  const rawPath=join(production,kind==='main'?'cloud-cliff.raw.glb':'cloud-cliff-storm.raw.glb'),candidatePath=join(delivery,kind==='main'?'cloud-cliff.glb':'cloud-cliff-storm.glb');
  const rawBytes=await frozen(rawPath),candidateBytes=await frozen(candidatePath),rawJson=jsonGlb(rawBytes),candidateJson=jsonGlb(candidateBytes);
  const [raw,candidate]=await Promise.all([io.read(rawPath),io.read(candidatePath)]);
  const sourceNodes=new Map(raw.getRoot().listNodes().map(node=>[node.getName(),node]));
  const meshRows=[],sourceExtras=raw.getRoot().listScenes().map(scene=>scene.getExtras()),candidateExtras=candidate.getRoot().listScenes().map(scene=>scene.getExtras());
  const extrasExact=stable(sourceExtras)===stable(candidateExtras);
  const materialPairs=[];
  const materialSignature=(doc,json,material)=>{const index=doc.getRoot().listMaterials().indexOf(material);return sha(stable(materialState(json,index)));};
  let totalTriangles=0,maximumWorldError=0,maximumQuantizationBound=0;
  for(const node of candidate.getRoot().listNodes()){
    const mesh=node.getMesh();if(!mesh)continue;const other=sourceNodes.get(node.getName());if(!other?.getMesh())throw Error('Missing source mesh '+node.getName());
    const rawWorld=other.getWorldMatrix(),world=node.getWorldMatrix(),sourceTriangles=new Map(),sourceVertices=[];
    for(const primitive of other.getMesh().listPrimitives()){
      const pos=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray(),mat=materialSignature(raw,rawJson,primitive.getMaterial());
      const vertices=Array.from({length:pos.getCount()},(_,i)=>({p:point(rawWorld,value(pos,i)),attrs:Object.fromEntries(primitive.listSemantics().filter(s=>s!=='POSITION').map(s=>[s,s==='NORMAL'?normal(rawWorld,value(primitive.getAttribute(s),i)):value(primitive.getAttribute(s),i)]))}));
      sourceVertices.push(...vertices.map(v=>v.p));
      for(let i=0;i<indices.length;i+=3){const rows=[0,1,2].map(k=>vertices[indices[i+k]]),keys=rows.map(v=>pointKey(v.p)),cycles=[0,1,2].map(k=>[0,1,2].map(j=>keys[(j+k)%3]).join(''));let rotation=0;for(let k=1;k<3;k++)if(cycles[k]<cycles[rotation])rotation=k;
        const ordered=[0,1,2].map(k=>rows[(k+rotation)%3]),key=mat+ordered.map(v=>pointKey(v.p)).join('');const list=sourceTriangles.get(key)||[];list.push(ordered);sourceTriangles.set(key,list);
      }
    }
    let triangles=0,unmatched=0,maxPosition=0,formats=[],maxQuantBound=0;const errors={};
    for(const primitive of mesh.listPrimitives()){
      const pos=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray(),mat=materialSignature(candidate,candidateJson,primitive.getMaterial());
      const materialMatches=other.getMesh().listPrimitives().some(p=>materialSignature(raw,rawJson,p.getMaterial())===mat);materialPairs.push({node:node.getName(),candidate:primitive.getMaterial().getName(),sourceStructuralMaterialMatch:materialMatches});
      formats.push({type:pos.getComponentType(),normalized:pos.getNormalized(),vertices:pos.getCount()});
      const normalAccessor=primitive.getAttribute('NORMAL');formats.at(-1).normal={type:normalAccessor?.getComponentType(),normalized:normalAccessor?.getNormalized(),vertices:normalAccessor?.getCount()};
      const denominator=pos.getNormalized()?({5120:127,5121:255,5122:32767,5123:65535}[pos.getComponentType()]):null;
      const bound=denominator?Math.hypot(...[0,1,2].map(i=>Math.hypot(world[i*4],world[i*4+1],world[i*4+2])/(2*denominator)))+0.000002:0;
      maxQuantBound=Math.max(maxQuantBound,bound);
      const vertices=Array.from({length:pos.getCount()},(_,i)=>{
        const p=point(world,value(pos,i));let key=pointKey(p),error=0;
        if(kind==='hero'&&denominator){
          let nearest=null,best=Infinity;for(const raw of sourceVertices){const d=distance(p,raw);if(d<best){best=d;nearest=raw;}}
          error=best;if(best>bound)throw Error(`HERO decoded vertex exceeds its actual affine quantization bound: ${node.getName()} ${best}>${bound}`);key=pointKey(nearest);
        }
        maxPosition=Math.max(maxPosition,error);
        return {key,attrs:Object.fromEntries(primitive.listSemantics().filter(s=>s!=='POSITION').map(s=>[s,s==='NORMAL'?normal(world,value(primitive.getAttribute(s),i)):value(primitive.getAttribute(s),i)]))};
      });
      for(let i=0;i<indices.length;i+=3){triangles++;const rows=[0,1,2].map(k=>vertices[indices[i+k]]),cycles=[0,1,2].map(k=>[0,1,2].map(j=>rows[(j+k)%3].key).join(''));let rotation=0;for(let k=1;k<3;k++)if(cycles[k]<cycles[rotation])rotation=k;
        const ordered=[0,1,2].map(k=>rows[(k+rotation)%3]),key=mat+ordered.map(v=>v.key).join(''),possibles=sourceTriangles.get(key);
        if(!possibles?.length){unmatched++;continue;}
        let selected=0,best=Infinity;
        for(let j=0;j<possibles.length;j++){let score=0;for(let k=0;k<3;k++)for(const semantic of Object.keys(ordered[k].attrs))score=Math.max(score,attributeError(ordered[k].attrs[semantic],possibles[j][k].attrs[semantic]));if(score<best){best=score;selected=j;}}
        const paired=possibles.splice(selected,1)[0];for(let k=0;k<3;k++)for(const semantic of Object.keys(ordered[k].attrs))errors[semantic]=Math.max(errors[semantic]||0,attributeError(ordered[k].attrs[semantic],paired[k].attrs[semantic]));
      }
    }
    const remaining=[...sourceTriangles.values()].reduce((sum,list)=>sum+list.length,0);
    meshRows.push({name:node.getName(),triangles,unmatched,remainingSourceTriangles:remaining,positionFormats:formats,maximumWorldPositionErrorMetres:maxPosition,affineQuantizationEuclideanBoundMetres:maxQuantBound,maximumCornerAttributeErrors:errors,sourceRawWorld:rawWorld,decodedCandidateWorld:world});
    totalTriangles+=triangles;maximumWorldError=Math.max(maximumWorldError,maxPosition);maximumQuantizationBound=Math.max(maximumQuantizationBound,maxQuantBound);
  }
  const anchorNodes=sourceAudit.heroes.flatMap(hero=>[hero.rootObject,hero.pointObject]).map(name=>{const a=sourceNodes.get(name),b=candidate.getRoot().listNodes().find(n=>n.getName()===name);return {name,sourcePresent:!!a,deliveredPresent:!!b,sourceWorld:a?.getWorldMatrix()??null,candidateWorld:b?.getWorldMatrix()??null,exact:!!a&&!!b&&stable(a.getWorldMatrix())===stable(b.getWorldMatrix())};});
  const checks={sceneExtrasExact:extrasExact,allTrianglesAndCyclicWindingMatched:meshRows.every(m=>!m.unmatched&&!m.remainingSourceTriangles),allMaterialGraphsAndAssignmentsPreserved:materialPairs.every(m=>m.sourceStructuralMaterialMatch),mainPositionsAreGenuineFloat32:kind!=='main'||meshRows.every(m=>m.positionFormats.every(f=>f.type===5126&&!f.normalized)),uv0WithinOne16bitStep:meshRows.every(m=>(m.maximumCornerAttributeErrors.TEXCOORD_0??0)<=1/65535+1e-7),tintsWithinOne8bitStep:meshRows.every(m=>Object.entries(m.maximumCornerAttributeErrors).filter(([s])=>s.startsWith('COLOR')).every(([,v])=>v<=1/255+1e-7)),presentAuthoredAnchorNodesExact:anchorNodes.filter(row=>row.sourcePresent).every(row=>row.exact)};
  if(process.env.REQUIRE_F32_NORMALS==='1')checks.standardNormalsGenuineFloat32AndWithinSourceGate=meshRows.every(m=>m.positionFormats.every(f=>f.normal?.type===5126&&!f.normal.normalized)&&(m.maximumCornerAttributeErrors.NORMAL??Infinity)<=.000001);
  report.files.push({kind,raw:{path:rawPath,sha256:sha(rawBytes)},candidate:{path:candidatePath,sha256:sha(candidateBytes)},totalTriangles,maximumWorldErrorMetres:maximumWorldError,maximumAffineQuantizationBoundMetres:maximumQuantizationBound,materialPairs,anchorNodes,meshes:meshRows,checks});
  // This conversion exists solely to replay actual decoded triangles in Blender.
  // It does not turn the original quantized HERO into authored source FLOAT32.
  await candidate.transform(dequantize());candidate.disposeExtension('EXT_meshopt_compression');
  const derivative=join(out,`decoded-${kind}-audit.glb`),bytes=await io.writeBinary(candidate);await writeFile(derivative,bytes);
  report.files.at(-1).decodedAuditDerivative={path:derivative,sha256:sha(bytes),purpose:'Meshopt decoded and normalized integer attributes converted to float for audit parser compatibility. Original node affine transforms retained. This is not a genuine-source-F32 claim.'};
  console.log('CLOUD_DECODED',kind,JSON.stringify({triangles:totalTriangles,maximumWorldError,maximumQuantizationBound,checks}));
}
for(const [path,hash] of inputs)if(sha(await readFile(path))!==hash)throw Error('Frozen input changed: '+path);
report.inputs=[...inputs].map(([path,sha256])=>({path,sha256}));report.passed=report.files.every(file=>Object.values(file.checks).every(Boolean));
report.manifestFiles=await Promise.all(manifest.files.map(async file=>{const bytes=await frozen(join(delivery,file.uri));return{uri:file.uri,bytes:bytes.length,declaredBytes:file.bytes,sha256:sha(bytes),declaredSha256:file.sha256,passed:bytes.length===file.bytes&&sha(bytes)===file.sha256};}));
report.passed&&=report.manifestFiles.every(file=>file.passed);
await writeFile(join(out,'decoded-stream-proof.json'),JSON.stringify(report,null,2)+'\n');
if(!report.passed)throw Error('Decoded delivery proof failed; inspect decoded-stream-proof.json.');
