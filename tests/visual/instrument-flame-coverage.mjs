// Isolated four-sample pixel coverage study. Geometry/radiance remain unchanged.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const root=process.env.SOURCE_ROOT;
if(!root?.startsWith('/tmp/'))throw Error('Isolated snapshot required');
const path=join(root,'web/src/engine/scene.js'),before=await readFile(path,'utf8'),sha=b=>createHash('sha256').update(b).digest('hex');
const begin=before.indexOf('const flameFS = `'),end=before.indexOf('`;',begin);
if(begin<0||end<0||before.includes('__captureFlameCoverage'))throw Error('Exact unmodified flame shader required');
let shader=before.slice(begin,end);
shader=shader.replace('uniform float uTime;', 'uniform float uCoverageAA; uniform float uTime;');
shader=shader.replace('void main(){','vec4 flameAt(vec2 sampleUv){\n  if(sampleUv.x<0.||sampleUv.x>1.||sampleUv.y<=0.||sampleUv.y>=1.)return vec4(0.);');
shader=shader.replace('float y = vUv.y; float x = (vUv.x - .5) * 2.;','float y = sampleUv.y; float x = (sampleUv.x - .5) * 2.;');
shader=shader.replace('gl_FragColor = vec4(', 'return vec4(');
shader+=`
void main(){
  vec2 dx=dFdx(vUv),dy=dFdy(vUv);
  if(uCoverageAA<.5){gl_FragColor=flameAt(vUv);return;}
  vec4 a=flameAt(vUv+.25*(dx+dy));
  vec4 b=flameAt(vUv+.25*(dx-dy));
  vec4 c=flameAt(vUv+.25*(-dx+dy));
  vec4 d=flameAt(vUv-.25*(dx+dy));
  float alpha=.25*(a.a+b.a+c.a+d.a);
  vec3 premultiplied=.25*(a.rgb*a.a+b.rgb*b.a+c.rgb*c.a+d.rgb*d.a);
  gl_FragColor=vec4(alpha>0.?premultiplied/alpha:vec3(0.),alpha);
}
`;
if(shader.includes('gl_FragColor = vec4(')||!shader.includes('return vec4(col *'))throw Error('Exact SDF return transformation failed');
let after=before.slice(0,begin)+shader+before.slice(end);
after=after.replace('uniforms: { uTime: { value: 0 },','uniforms: { uCoverageAA: { value: 0 }, uTime: { value: 0 },');
const hook=`
window.__captureFlameCoverage=(enabled)=>{
 const f=place?.cover?.f;if(!f)throw Error('No actual cover flame');
 if(enabled!==undefined)f.fm.uniforms.uCoverageAA.value=enabled?1:0;
 return{samples:f.fm.uniforms.uCoverageAA.value?4:1,scale:f.fm.uniforms.uScale.value,power:f.fm.uniforms.uPower.value,depthTest:f.flame.material.depthTest,world:f.flame.getWorldPosition(V3()).toArray(),integration:'Four fixed quarter-pixel offsets using actual UV derivatives, alpha-weighted linear radiance; unchanged SDF/size/power/light.'};
};
`;
after=after.replace('\nfunction resize() {','\n'+hook+'\nfunction resize() {').replace(/window\.__captureSnapshot=(\{[^\n]+\});/,(_,json)=>'window.__captureSnapshot='+JSON.stringify({...JSON.parse(json),root})+';');
await writeFile(path,after);
const instrumentationPath=join(root,'visual-instrumentation.json'),instrumentation=JSON.parse(await readFile(instrumentationPath));
instrumentation.target=root;instrumentation.instrumentedSceneSha256=sha(after);instrumentation.flameCoverage={beforeSha256:sha(before),shaderSha256:sha(shader),fixedSamples:4,noGeometryLightPowerSeedTimeOrDepthChange:true};
await writeFile(instrumentationPath,JSON.stringify(instrumentation,null,2)+'\n');
console.log('FLAME_COVERAGE_INSTRUMENTED',root,sha(after));
