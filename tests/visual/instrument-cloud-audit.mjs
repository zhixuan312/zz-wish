// Frozen-only, read-only runtime metadata. No material, light or camera changes.
import {readFile,writeFile}from'node:fs/promises';
import {resolve,join}from'node:path';
import{createHash}from'node:crypto';
const root=resolve(process.argv[2]??'');if(!root.startsWith('/tmp/'))throw new Error('Pass an instrumented frozen /tmp root.');
const file=join(root,'web/src/engine/scene.js'),original=await readFile(file,'utf8');
if(!original.includes('window.__captureSnapshot=')||original.includes('window.__captureCloudRuntime='))throw new Error('Expected a fresh standard capture instrumented scene.');
const source=original.replace('window.__captureSnapshot=',`window.__captureCloudRuntime=()=>{
  const clouds=[];place?.G.traverse(object=>{if(object.userData.cloudVolume)clouds.push({volume:object.userData.cloudVolume,buffer:object.material?.userData.cloudRadianceBuffer??null,matrixWorld:object.matrixWorld.toArray()});});
  const cover=place?.cover,gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
  return {clouds,localProbe:cover?.localProbe??null,coverPower:cover?.power??null,actualPointWatts:cover?.light?cover.light.intensity*4*Math.PI:null,pointWorld:cover?.light?.getWorldPosition(new THREE.Vector3()).toArray()??null,actualCamera:{position:camera.position.toArray(),matrixWorld:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),fov:camera.fov},gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
};
window.__captureSnapshot=`);
await writeFile(file,source);const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await writeFile(join(root,'visual-cloud-audit-instrumentation.json'),JSON.stringify({root,sceneBeforeSha256:sha(original),sceneAfterSha256:sha(source),scope:'Read-only metadata for actual Cloud buffer, probe, power, camera and GPU.'},null,2)+'\n');
console.log('CLOUD_AUDIT_INSTRUMENTED',root);
