// Unactivated shader plan for the CPU-proven XYZ optical-depth prefix.
// This is an axis component, not complete directional lighting: a caller may
// not expose its textures as a finished cloud-light volume without SUN/phase
// and opaque-visibility gates. No renderer or public descriptor imports it.
import { Vector3 } from 'three';
const literal=n=>Number.isInteger(n)?`${n}.0`:String(Math.fround(n));
const vec=a=>`vec3(${a.map(literal).join(',')})`;
export function cloudLightPrefixAxisPlan({contract,fieldGLSL,dimensions=[128,64,192]}){
  if(contract?.version!==7||typeof fieldGLSL!=='string'||!fieldGLSL.includes('float field(vec3 p)')||dimensions.length!==3||dimensions.some(n=>!Number.isInteger(n)||n<8||n>256))throw new Error('Actual source7 density shader and bounded explicit grid required');
  if(/illuminationTransmission|worldTransmission/.test(fieldGLSL))throw new Error('Light marching must not enter the density update pass');
  const [nx,ny,nz]=dimensions,lower=Math.round(ny*.25),split=-88,b=contract.bounds;
  const dx=(b.max[0]-b.min[0])/nx,dz=(b.max[2]-b.min[2])/nz,dyLow=(split-b.min[1])/lower,dyHigh=(b.max[1]-split)/(ny-lower);
  const columns=2**Math.ceil(Math.log2(Math.sqrt(nz))),rows=Math.ceil(nz/columns),tile=[nx+2,ny+2],width=tile[0]*columns,height=tile[1]*rows;
  const common=`precision highp float;precision highp int;
    out vec4 pc_fragColor;
    const ivec3 gridSize=ivec3(${dimensions.join(',')});
    const ivec2 tileSize=ivec2(${tile.join(',')});
    const int atlasColumns=${columns};
    ivec3 cloudPrefixIndex(){
      ivec2 pixel=ivec2(gl_FragCoord.xy),tile=pixel/tileSize;
      return ivec3(clamp(pixel-tile*tileSize-ivec2(1),ivec2(0),gridSize.xy-1),tile.x+tile.y*atlasColumns);
    }
    ivec2 cloudPrefixPixel(ivec3 at){return ivec2(at.z%atlasColumns,at.z/atlasColumns)*tileSize+at.xy+ivec2(1);}
    float cloudPrefixY(int y){return y<${lower}?${literal(b.min[1])}+(float(y)+.5)*${literal(dyLow)}:${literal(split)}+(float(y-${lower})+.5)*${literal(dyHigh)};}
    vec3 cloudPrefixCell(ivec3 at){return vec3(${literal(dx)},at.y<${lower}?${literal(dyLow)}:${literal(dyHigh)},${literal(dz)});}
    vec3 cloudPrefixWorld(ivec3 at){return vec3(${literal(b.min[0])}+(float(at.x)+.5)*${literal(dx)},cloudPrefixY(at.y),${literal(b.min[2])}+(float(at.z)+.5)*${literal(dz)});}
  `;
  const initialize=`${common}
    ${fieldGLSL}
    void main(){ivec3 at=cloudPrefixIndex();if(at.z>=gridSize.z){pc_fragColor=vec4(0.);return;}
      float rho=field(cloudPrefixWorld(at));pc_fragColor=vec4(rho*cloudPrefixCell(at),rho);
    }`;
  const scan=`${common}
    uniform highp sampler2D uCloudPrefixPrevious;
    uniform int uCloudPrefixStride;
    void main(){ivec3 at=cloudPrefixIndex();if(at.z>=gridSize.z){pc_fragColor=vec4(0.);return;}
      vec4 current=texelFetch(uCloudPrefixPrevious,cloudPrefixPixel(at),0);
      vec3 add=vec3(0.);
      if(at.x>=uCloudPrefixStride)add.x=texelFetch(uCloudPrefixPrevious,cloudPrefixPixel(at-ivec3(uCloudPrefixStride,0,0)),0).x;
      if(at.y>=uCloudPrefixStride)add.y=texelFetch(uCloudPrefixPrevious,cloudPrefixPixel(at-ivec3(0,uCloudPrefixStride,0)),0).y;
      if(at.z>=uCloudPrefixStride)add.z=texelFetch(uCloudPrefixPrevious,cloudPrefixPixel(at-ivec3(0,0,uCloudPrefixStride)),0).z;
      pc_fragColor=vec4(current.xyz+add,current.w);
    }`;
  const derive=`${common}
    uniform highp sampler2D uCloudPrefixComplete;
    uniform int uCloudPrefixOutput;
    void main(){ivec3 at=cloudPrefixIndex();if(at.z>=gridSize.z){pc_fragColor=vec4(1.);return;}
      vec4 current=texelFetch(uCloudPrefixComplete,cloudPrefixPixel(at),0);
      vec3 end=vec3(texelFetch(uCloudPrefixComplete,cloudPrefixPixel(ivec3(gridSize.x-1,at.yz)),0).x,
        texelFetch(uCloudPrefixComplete,cloudPrefixPixel(ivec3(at.x,gridSize.y-1,at.z)),0).y,
        texelFetch(uCloudPrefixComplete,cloudPrefixPixel(ivec3(at.xy,gridSize.z-1)),0).z);
      vec3 own=.5*current.w*cloudPrefixCell(at),negative=exp(-max(vec3(0.),current.xyz-own)),positive=exp(-max(vec3(0.),end-current.xyz+own));
      // B.z is deliberately absent: the axis-only target is not a finished
      // source lighting cache and must never be passed to the main renderer.
      pc_fragColor=uCloudPrefixOutput==0?vec4(positive.x,negative.x,positive.y,negative.y):vec4(positive.z,negative.z,0.,0.);
    }`;
  const strides=[];for(let stride=1;stride<Math.max(...dimensions);stride*=2)strides.push(stride);
  const pixels=width*height;
  return{initialize,scan,derive,grid:{dimensions,worldBounds:structuredClone(b),lowerCount:lower,splitY:split,atlas:{width,height,columns,rows,tile,gutterPixels:1}},
    passes:[{role:'initialize',type:'FLOAT32'},...strides.map(stride=>({role:'scan',stride,type:'FLOAT32'})),{role:'derive-axis-A',type:'UNORM8'},{role:'derive-axis-B-incomplete',type:'UNORM8'}],
    metadata:{version:1,status:'UNACTIVATED AXIS COMPONENT ONLY',sourceContractVersion:7,sourcePhase:'One frozen phase time for initialization; no per-scan phase changes',
      prefixStorage:'RGBA32F pingpong; no HALF line-end cancellation',depthBuffer:false,samples:0,prefixFilter:'NEAREST texelFetch',completedAxisFilter:'LINEAR within tiles, explicit adjacent-Z interpolation required',
      atlasBytes:{prefixPingpong:pixels*16*2,doubleBufferedAxisT8:pixels*4*4},
      cpuProof:'scripts/prototype-cloud-light-prefix.mjs, actual source19-prefix128-near-control:9,437,184 node values checked',
      incomplete:['Actual source SUN prefix/oriented-grid output','Near1m actual grid with phase-matched boundary transport','Actual opaque-light visibility','Frozen batch time/completed-buffer swap/crossfade policy','GPU typed/rounding/texture correctness and actual bounded timings'],
      noFinishedVolume:true}};
}

/** SUN component on a genuine oriented source grid, matching the CPU control. */
export function cloudLightPrefixSunPlan({contract,fieldGLSL,direction,dimensions=[128,64,192],queryBounds=contract?.bounds}){
  if(contract?.version!==7||typeof fieldGLSL!=='string'||!Array.isArray(direction)||direction.length!==3||direction.some(v=>!Number.isFinite(v))||Math.hypot(...direction)<.999||dimensions.length!==3||dimensions.some(n=>!Number.isInteger(n)||n<8||n>256))throw new Error('Actual source7/SUN direction and bounded grid required');
  const D=new Vector3(...direction).normalize(),U=new Vector3().crossVectors(D,Math.abs(D.y)<.99?new Vector3(0,1,0):new Vector3(1,0,0)).normalize(),V=new Vector3().crossVectors(D,U).normalize(),basis=[U,V,D].map(v=>v.toArray()),corners=[];
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)corners.push([x,y,z].map((v,k)=>queryBounds[v?'max':'min'][k]));
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),bounds={min:basis.map(d=>Math.min(...corners.map(p=>dot(p,d)))),max:basis.map(d=>Math.max(...corners.map(p=>dot(p,d))))};
  const [nx,ny,nz]=dimensions,spacing=dimensions.map((n,i)=>(bounds.max[i]-bounds.min[i])/n),columns=2**Math.ceil(Math.log2(Math.sqrt(nz))),rows=Math.ceil(nz/columns),tile=[nx+2,ny+2],width=tile[0]*columns,height=tile[1]*rows;
  const common=`precision highp float;precision highp int;
    out vec4 pc_fragColor;
    const ivec3 sunGrid=ivec3(${dimensions.join(',')});
    const ivec2 sunTile=ivec2(${tile.join(',')});
    const int sunColumns=${columns};
    ivec3 cloudSunIndex(){ivec2 p=ivec2(gl_FragCoord.xy),t=p/sunTile;return ivec3(clamp(p-t*sunTile-ivec2(1),ivec2(0),sunGrid.xy-1),t.x+t.y*sunColumns);}
    ivec2 cloudSunPixel(ivec3 p){return ivec2(p.z%sunColumns,p.z/sunColumns)*sunTile+p.xy+ivec2(1);}
    vec3 cloudSunWorld(ivec3 at){vec3 p=${vec(bounds.min)}+(vec3(at)+.5)*${vec(spacing)};return ${vec(basis[0])}*p.x+${vec(basis[1])}*p.y+${vec(basis[2])}*p.z;}
  `;
  const initialize=`${common}${fieldGLSL}
    void main(){ivec3 at=cloudSunIndex();if(at.z>=sunGrid.z){pc_fragColor=vec4(0.);return;}float own=field(cloudSunWorld(at))*${literal(spacing[2])};pc_fragColor=vec4(own,0.,0.,own);}`;
  const scan=`${common}
    uniform highp sampler2D uCloudSunPrefixPrevious;uniform int uCloudSunPrefixStride;
    void main(){ivec3 at=cloudSunIndex();if(at.z>=sunGrid.z){pc_fragColor=vec4(0.);return;}
      vec4 current=texelFetch(uCloudSunPrefixPrevious,cloudSunPixel(at),0);float next=0.;
      if(at.z+uCloudSunPrefixStride<sunGrid.z)next=texelFetch(uCloudSunPrefixPrevious,cloudSunPixel(at+ivec3(0,0,uCloudSunPrefixStride)),0).r;
      pc_fragColor=vec4(min(16.,current.r+next),0.,0.,current.a);
    }`;
  const derive=`${common}
    uniform highp sampler2D uCloudSunPrefixComplete;
    void main(){ivec3 at=cloudSunIndex();if(at.z>=sunGrid.z){pc_fragColor=vec4(1.);return;}vec4 p=texelFetch(uCloudSunPrefixComplete,cloudSunPixel(at),0);pc_fragColor=vec4(exp(-max(0.,p.r-.5*p.a)),0.,0.,1.);}`;
  const samplerGLSL=`
    uniform sampler2D uCloudSunTransmission;
    vec2 cloudSunAtlasUv(vec2 xy,float z){vec2 tile=vec2(mod(z,${literal(columns)}),floor(z/${literal(columns)}));return (tile*vec2(${tile.map(literal).join(',')})+xy+1.5)/vec2(${literal(width)},${literal(height)});}
    float cloudSunTransmission(vec3 world){
      vec3 p=vec3(dot(world,${vec(basis[0])}),dot(world,${vec(basis[1])}),dot(world,${vec(basis[2])}));
      vec3 q=clamp((p-${vec(bounds.min)})/${vec(spacing)}-.5,vec3(0.),${vec(dimensions.map(n=>n-1))});float z=floor(q.z);
      return mix(texture(uCloudSunTransmission,cloudSunAtlasUv(q.xy,z)).r,texture(uCloudSunTransmission,cloudSunAtlasUv(q.xy,min(z+1.,${literal(nz-1)}))).r,q.z-z);
    }`;
  const strides=[];for(let stride=1;stride<nz;stride*=2)strides.push(stride);
  const fullWorld=JSON.stringify(queryBounds)===JSON.stringify(contract.bounds),pixels=width*height;
  return{initialize,scan,derive,samplerGLSL,grid:{dimensions,basisWorldRows:basis,orientedBounds:bounds,spacingMetres:spacing,queryBounds:structuredClone(queryBounds),atlas:{width,height,columns,rows,tile,gutterPixels:1}},
    passes:[{role:'initialize-SUN',type:'HALF16'},...strides.map(stride=>({role:'scan-SUN',stride,type:'HALF16'})),{role:'derive-SUN',type:'UNORM8'}],
    metadata:{version:1,status:'UNACTIVATED SUN COMPONENT ONLY',sourceContractVersion:7,sourcePhase:'Identical frozen phase time as XYZ initialization',
      prefixStorage:'Direct positive-SUN RGBA16F; no lineend subtraction, opticaldepth clipped16',prefixFilter:'NEAREST texelFetch',samples:0,depthBuffer:false,
      atlasBytes:{halfPrefixPingpong:pixels*8*2,scalarTRgba8:pixels*4},fullSourceBoundsCovered:fullWorld,boundaryTransmissionRequired:!fullWorld,
      cpuProof:'scripts/prototype-cloud-sun-prefix.mjs:1,572,864 source-grid node values, directHALF maximumT storageerror.001406; spatialerror separate',
      incomplete:['Actual near-refinement/boundary transmission','Opaque-light visibility','Completed XYZ/SUN phase scheduling/swap/crossfade','Actual GPU typed-data/timing/optical gates'],noFinishedVolume:true}};
}
