// Capture-only shader-pixel coverage experiment on an existing isolated C fork.
import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{join}from'node:path';
const root=process.env.SOURCE_ROOT;if(!root?.startsWith('/tmp/'))throw Error('Use a frozen /tmp clone.');
const path=join(root,'web/src/engine/baked/visitorShadow.js'),old=await readFile(path,'utf8');
if(old.includes('shadowPixelDx'))throw Error('AA hook already installed.');
const derivatives=`
  // Derivatives precede all fragment-varying exits. Preserve the source disk;
  // integrate its visibility over the actual shader pixel parallelogram too.
  float footprintDistance=max(length(shadowCoord.xyz),.000001);
  vec3 footprintDirection=shadowCoord.xyz/footprintDistance;
  vec3 shadowPixelDx=dFdx(footprintDirection),shadowPixelDy=dFdy(footprintDirection);
  float footprintDepth=(footprintDistance-shadowCameraNear)/(shadowCameraFar-shadowCameraNear)+shadowBias;
  float shadowDepthDx=dFdx(footprintDepth),shadowDepthDy=dFdy(footprintDepth);
  float pixelHalf=step(1.5,uVisitorOpticalNear)*.5*max(length(shadowPixelDx+shadowPixelDy),length(shadowPixelDx-shadowPixelDy));
`;
const reverse=i=>Number.parseInt(i.toString(2).padStart(5,'0').split('').reverse().join(''),2),pixel=[];
const taps=Array.from({length:32},(_,i)=>{
 const r=Math.sqrt((i+.5)/32),angle=i*2.399963229728653,x=r*Math.cos(angle),y=r*Math.sin(angle),px=((i*13)%32+.5)/32-.5,py=(reverse(i)+.5)/32-.5;pixel.push([px,py]);
 return`visibility+=texture2DCompare(shadowMap,cubeToUV(normalize(direction+(tangent*${x.toFixed(9)}+bitangent*${y.toFixed(9)})*filterAngle+shadowPixelDx*${px.toFixed(9)}+shadowPixelDy*${py.toFixed(9)}),texelY),receiverDepth+shadowDepthDx*${px.toFixed(9)}+shadowDepthDy*${py.toFixed(9)});`;
}).join('\n');
let edited=old.replace('float shadowCameraFar){\n','float shadowCameraFar){\n'+derivatives)
 .replace('float searchAngle=max(footprint,uVisitorSourceRadius*max(0.,receiverDistance-provisional)/(receiverDistance*provisional));','float searchAngle=max(footprint,uVisitorSourceRadius*max(0.,receiverDistance-provisional)/(receiverDistance*provisional))+pixelHalf;')
 .replace('if(blockers.y<.5){visitorFiniteShadowCache=1.;return 1.;}','bool hasBlocker=blockers.y>=.5;\n  if(!hasBlocker&&uVisitorOpticalNear<1.5){visitorFiniteShadowCache=1.;return 1.;}')
 .replace('float blockerDistance=max(minimumBlocker,blockers.x/blockers.y);','float blockerDistance=max(minimumBlocker,blockers.x/max(1.,blockers.y));')
 .replace('float physicalAngle=uVisitorSourceRadius*max(0.,receiverDistance-blockerDistance)/(blockerDistance*receiverDistance);','float physicalAngle=hasBlocker?uVisitorSourceRadius*max(0.,receiverDistance-blockerDistance)/(blockerDistance*receiverDistance):0.;')
 .replace('if(physicalAngle<=footprint){','if(uVisitorOpticalNear<1.5&&physicalAngle<=footprint){')
 .replace('  if(uVisitorOpticalNear>.5){\nvisibility+=','  if(uVisitorOpticalNear>1.5){\n'+taps+'\nvisitorFiniteShadowCache=visibility/32.;}\nelse if(uVisitorOpticalNear>.5){\nvisibility+=')
 .replace('uniforms.uVisitorOpticalNear.value=enabled?1:0;','uniforms.uVisitorOpticalNear.value=Number(enabled)||0;state.metadata.screenFootprint=Number(enabled)>1?"32 stratified pixel parallelogram samples with radial-depth derivatives":"none";')
 .replace("'-visitor-capture-shadow-b4-f12-or32-near-v1'","'-visitor-capture-shadow-b4-f32-pixel-aa-v1'");
if(!edited.includes(derivatives)||!edited.includes(taps)||edited===old)throw Error('Actual C helper anchors changed.');
await writeFile(path+'.pre-aa',old);await writeFile(path,edited);
const scenePath=join(root,'web/src/engine/scene.js'),scene=await readFile(scenePath,'utf8');
const sceneEdited=scene.replace("'normal','bias-zero'","'normal','pixel-aa','bias-zero'")
 .replace("mode==='bias-small'||mode==='near32'","mode==='bias-small'||mode==='near32'||mode==='pixel-aa'")
 .replace("if(mode==='near32'){","if(mode==='near32'||mode==='pixel-aa'){")
 .replace('visitorShadow.setOpticalDiagnostic(true);',"visitorShadow.setOpticalDiagnostic(mode==='pixel-aa'?2:1);")
 .replace(/window\.__captureSnapshot=(\{[^\n]+\});/,(_,json)=>'window.__captureSnapshot='+JSON.stringify({...JSON.parse(json),root})+';');
await writeFile(scenePath,sceneEdited);
const metadataPath=join(root,'visual-instrumentation.json'),metadata=JSON.parse(await readFile(metadataPath));metadata.target=root;metadata.instrumentedSceneSha256=createHash('sha256').update(sceneEdited).digest('hex');
metadata.gauzePixelAA={helperSha256:createHash('sha256').update(edited).digest('hex'),beforeSha256:createHash('sha256').update(old).digest('hex'),samples:32,maximumDepthFetches:36,temporalRandomness:false,extraRenderTargets:0,pixelOffsets:pixel};await writeFile(metadataPath,JSON.stringify(metadata,null,2)+'\n');
console.log('SHADOW_PIXEL_AA_READY',root,metadata.gauzePixelAA.helperSha256);
