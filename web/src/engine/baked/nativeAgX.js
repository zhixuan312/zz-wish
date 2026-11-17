/**
 * Production view: Blender 5.3 AgX / None / sRGB, linear Rec.709 input.
 * Exact optimized OCIO chain and native 57^3 LUT, no resampling.
 * Output is LINEAR display sRGB. Follow with OutputPass doing sRGB OETF ONLY.
 * Scene values already include the manifest radiometric multiplier (40 for Snow17).
 * cameraExposureEV is residual camera exposure; do not multiply by 40 here.
 * Resource is lazy, shared by URL+content identity, reference counted, GPU-free until used.
 */
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export const NATIVE_AGX = Object.freeze({
  "edge": 57,
  "integerCount": 555579,
  "assetBytes": 396098,
  "assetSha256": "b9eb1e7da41183f169323cfdb60525f15149dd07b070ffdce175d15596849fd3",
  "decodedBytes": 1666737,
  "decodedSha256": "dadf20eb6187caf0b8e07febbe9a99e3151d5826df5758353b2d7a5cd8a130c0",
  "nativeFloat32RGBSha256": "cb92475f7c9feb46b589847f26c9ce068c89f1d0a2f7a88aecd0857b42c7fe5f",
  "nativeRGBSha256": "cb92475f7c9feb46b589847f26c9ce068c89f1d0a2f7a88aecd0857b42c7fe5f",
  "declaredPrecision": "float32 exact native LUT",
  "gpuRGBA32FBytes": 2963088,
  "sourceConfigSha256": "066a440ed1c02551fa3cacbb3af5d22d2efde7e4da5f2c14dffcca00c47751a0",
  "sourceLutSha256": "e707a36f3e90ee79bc342332febf91334c02ce3974cac700ece00ca9d4507491",
  "sourceGeneratedShaderSha256": "bd358f4584c8e57cb0b07fdbde77b1540ba305a6ddb34541455a843e9d9556d2"
});
export const NATIVE_AGX_F16 = Object.freeze({
  "edge": 57,
  "integerCount": 555579,
  "assetBytes": 116705,
  "assetSha256": "bc942c1862956cb48aed8c259d2e410518a10c4b26775a27c3b326d539244463",
  "decodedBytes": 1111158,
  "decodedSha256": "a78e822f6698a8cbc8969e9fa51d661f8b04641f6f717948f72a073dbe836703",
  "nativeRGBSha256": "0af4abfe1372ab918471829aeae211a8f99ef0411b02beca107f4a441c3559a0",
  "gpuRGBA16FBytes": 1481544,
  "declaredPrecision": "Each native LUT Float32 texel rounded once to IEEE754 Float16 nearest-even; no resampling; same57^3/tetrahedral/matrix/shaper"
});
export const NATIVE_AGX_GLSL = String.raw`
// Declaration of all textures

uniform sampler3D nativeAgX_lut3d_0Sampler;

// Declaration of the OCIO shader function

vec4 nativeAgXView(vec4 inPixel)
{
  vec4 outColor = inPixel;

  // Add Matrix processing

  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(0.55937113331007726, 0.076220705483506221, 0.065526711778770175, 0., 0.30478334662300893, 0.78797177010284647, 0.16454675460372412, 0., 0.13584556048047711, 0.1358074661747215, 0.76992650165037446, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }

  // Add Log processing

  {
    outColor.rgb = max( vec3(1.17549435e-38, 1.17549435e-38, 1.17549435e-38), outColor.rgb);
    outColor.rgb = log2(outColor.rgb);
  }

  // Add Matrix processing

  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    res = vec4(0.0400000028, 0.0400000028, 0.0400000028, 1.) * res;
    res = vec4(0.498957247, 0.498957247, 0.498957247, 0.) + res;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }

  // Add LUT 3D processing for nativeAgX_lut3d_0

  {
    vec3 coords = outColor.rgb * vec3(56., 56., 56.);
    vec3 baseInd = floor(coords);
    vec3 frac = coords - baseInd;
    vec3 f1, f4;
    baseInd = ( baseInd.zyx + vec3(0.5, 0.5, 0.5) ) / vec3(57., 57., 57.);
    vec3 v1 = texture(nativeAgX_lut3d_0Sampler, baseInd).rgb;
    vec3 nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.0175438598);
    vec3 v4 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
    if (frac.r >= frac.g)
    {
      if (frac.g >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0175438598);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0175438598, 0.0175438598);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        vec3 f3 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0., 0.0175438598);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0., 0.0175438598);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.r, 1. - frac.r, 1. - frac.r);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        vec3 f3 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0.0175438598, 0., 0.);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0., 0.0175438598);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.g, frac.g, frac.g);
        vec3 f2 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        vec3 f3 = vec3(frac.r - frac.g, frac.r - frac.g, frac.r - frac.g);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    else
    {
      if (frac.g <= frac.b)
      {
        nextInd = baseInd + vec3(0.0175438598, 0., 0.);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.b, 1. - frac.b, 1. - frac.b);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.b - frac.g, frac.b - frac.g, frac.b - frac.g);
        vec3 f3 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else if (frac.r >= frac.b)
      {
        nextInd = baseInd + vec3(0., 0.0175438598, 0.);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0., 0.0175438598, 0.0175438598);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.b, frac.b, frac.b);
        vec3 f2 = vec3(frac.g - frac.r, frac.g - frac.r, frac.g - frac.r);
        vec3 f3 = vec3(frac.r - frac.b, frac.r - frac.b, frac.r - frac.b);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
      else
      {
        nextInd = baseInd + vec3(0., 0.0175438598, 0.);
        vec3 v2 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        nextInd = baseInd + vec3(0.0175438598, 0.0175438598, 0.);
        vec3 v3 = texture(nativeAgX_lut3d_0Sampler, nextInd).rgb;
        f1 = vec3(1. - frac.g, 1. - frac.g, 1. - frac.g);
        f4 = vec3(frac.r, frac.r, frac.r);
        vec3 f2 = vec3(frac.g - frac.b, frac.g - frac.b, frac.g - frac.b);
        vec3 f3 = vec3(frac.b - frac.r, frac.b - frac.r, frac.b - frac.r);
        outColor.rgb = (f2 * v2) + (f3 * v3);
      }
    }
    outColor.rgb = outColor.rgb + (f1 * v1) + (f4 * v4);
  }

  // Add Gamma 'basicFwd' processing

  {
    vec4 gamma = vec4(2.3999999999999999, 2.3999999999999999, 2.3999999999999999, 1.);
    vec4 res = pow( max( vec4(0., 0., 0., 0.), outColor ), gamma );
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }

  return outColor;
}
`;

const resources = new Map();
let zstdReady;
async function defaultDecodeZstd(bytes, decodedBytes) {
  zstdReady ??= import('three/examples/jsm/libs/zstddec.module.js').then(async ({ ZSTDDecoder }) => {
    const decoder = new ZSTDDecoder(); await decoder.init(); return decoder;
  }).catch(error => { zstdReady = null; throw error; });
  return (await zstdReady).decode(bytes, decodedBytes);
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Input is the decompressed byte-planar data, not the Zstd stream. */
export function decodeNativeAgXData(bytes) {
  const count = NATIVE_AGX.integerCount;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== count * 3) throw new Error('Invalid native AgX LUT length');
  const rgb = new Float32Array(count), previous = [0, 0, 0], difference = [0, 0, 0];
  for (let n = 0; n < count; n++) {
    const zig = bytes[n] | bytes[n + count] << 8 | bytes[n + 2 * count] << 16;
    const channel = n % 3;
    difference[channel] = (difference[channel] + ((zig >>> 1) ^ -(zig & 1))) & 0xffffff;
    const value = previous[channel] = (previous[channel] + difference[channel]) & 0xffffff;
    if (value > 10000000) throw new Error('Invalid native AgX LUT integer');
    rgb[n] = value / 10000000;
  }
  return rgb;
}

/** Same native samples rounded once to F16, then losslessly decoded as F16 bit words. */
export function decodeNativeAgXHalfData(bytes) {
  const count = NATIVE_AGX_F16.integerCount;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== count * 2) throw new Error('Invalid native AgX F16 LUT length');
  const rgb = new Uint16Array(count), previous = [0, 0, 0], difference = [0, 0, 0];
  for (let n = 0; n < count; n++) {
    const zig = bytes[n] | bytes[n + count] << 8, channel = n % 3;
    difference[channel] = (difference[channel] + ((zig >>> 1) ^ -(zig & 1))) & 65535;
    rgb[n] = previous[channel] = (previous[channel] + difference[channel]) & 65535;
  }
  return rgb;
}

function makeTexture(rgb, precision) {
  const half = precision === 'float16';
  const rgba = half ? new Uint16Array(NATIVE_AGX.edge ** 3 * 4) : new Float32Array(NATIVE_AGX.edge ** 3 * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = half ? 0x3c00 : 1;
  }
  const texture = new THREE.Data3DTexture(rgba, NATIVE_AGX.edge, NATIVE_AGX.edge, NATIVE_AGX.edge);
  texture.name = 'Blender53-native-AgX-57-tetrahedral';
  texture.type = half ? THREE.HalfFloatType : THREE.FloatType; texture.format = THREE.RGBAFormat; texture.internalFormat = half ? 'RGBA16F' : 'RGBA32F';
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false;
  texture.unpackAlignment = 1; texture.flipY = false; texture.needsUpdate = true;
  return texture;
}

/** Each successful caller owns one lease and must release it exactly once. */
export async function acquireNativeAgX({ url, fetcher = fetch, decodeZstd = defaultDecodeZstd, precision = 'float32' } = {}) {
  if (!url) throw new Error('Native AgX LUT URL is required');
  if (!['float32', 'float16'].includes(precision)) throw new Error('Invalid native AgX precision');
  const metadata = precision === 'float16' ? NATIVE_AGX_F16 : NATIVE_AGX;
  const key = `${url}|${metadata.assetSha256}`;
  let entry = resources.get(key);
  if (!entry) {
    entry = { references: 0, texture: null, promise: null };
    entry.promise = (async () => {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`Cannot load native AgX LUT (${response.status})`);
      const compressed = new Uint8Array(await response.arrayBuffer());
      if (compressed.byteLength !== metadata.assetBytes || await sha256(compressed) !== metadata.assetSha256) throw new Error('Changed native AgX LUT');
      const bytes = await decodeZstd(compressed, metadata.decodedBytes);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== metadata.decodedBytes || await sha256(bytes) !== metadata.decodedSha256) throw new Error('Changed decoded native AgX LUT');
      const rgb = precision === 'float16' ? decodeNativeAgXHalfData(bytes) : decodeNativeAgXData(bytes);
      if (await sha256(rgb) !== metadata.nativeRGBSha256) throw new Error('Changed reconstructed native AgX LUT');
      entry.texture = makeTexture(rgb, precision);
      return entry.texture;
    })().catch(error => { if (resources.get(key) === entry) resources.delete(key); throw error; });
    resources.set(key, entry);
  }
  entry.references++;
  try {
    const texture = await entry.promise;
    let released = false;
    return {
      texture, metadata,
      release() {
        if (released) return;
        released = true;
        if (--entry.references === 0) {
          entry.texture?.dispose(); entry.texture = null;
          if (resources.get(key) === entry) resources.delete(key);
        }
      }
    };
  } catch (error) {
    entry.references--;
    throw error;
  }
}

/** Takes ownership of one lease. Place after HDR/bloom and before an OETF-only OutputPass. */
export class NativeAgXPass extends Pass {
  constructor(lease, { cameraExposureEV = 0 } = {}) {
    super();
    if (!lease?.texture || typeof lease.release !== 'function') throw new Error('Native AgX resource lease required');
    this.name = 'Blender53NativeAgXPass';
    this.lease = lease; this.disposed = false;
    this.uniforms = {
      tDiffuse: { value: null }, cameraExposureEV: { value: cameraExposureEV },
      nativeAgX_lut3d_0Sampler: { value: lease.texture }
    };
    this.material = new THREE.RawShaderMaterial({
      name: this.name, glslVersion: THREE.GLSL3, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: `precision highp float;
        in vec3 position; in vec2 uv; out vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `precision highp float; precision highp sampler2D; precision highp sampler3D;
        uniform sampler2D tDiffuse; uniform float cameraExposureEV;
        in vec2 vUv; out vec4 fragColor;
        ${NATIVE_AGX_GLSL}
        void main() {
          vec4 sceneColor = texture(tDiffuse, vUv);
          sceneColor.rgb *= exp2(cameraExposureEV);
          fragColor = nativeAgXView(sceneColor);
        }`
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.frustumCulled = false;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, writeBuffer, readBuffer) {
    if (this.disposed) throw new Error('Disposed native AgX pass');
    if (!renderer.capabilities.isWebGL2) throw new Error('Native AgX requires WebGL2');
    if (this.renderToScreen) throw new Error('Native AgX outputs linear RGB; an OETF-only OutputPass must follow');
    if (!Number.isFinite(this.uniforms.cameraExposureEV.value)) throw new Error('Invalid native AgX camera exposure');
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    renderer.render(this.mesh, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.geometry.dispose(); this.material.dispose(); this.lease.release();
    this.uniforms.tDiffuse.value = null; this.uniforms.nativeAgX_lut3d_0Sampler.value = null;
  }
}
