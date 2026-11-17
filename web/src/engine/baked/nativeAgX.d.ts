import type { BufferGeometry, Data3DTexture, Mesh, OrthographicCamera, RawShaderMaterial, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export type NativeAgXPrecision = 'float32' | 'float16';
export interface NativeAgXMetadata {
  readonly edge: number;
  readonly integerCount: number;
  readonly assetBytes: number;
  readonly assetSha256: string;
  readonly decodedBytes: number;
  readonly decodedSha256: string;
  readonly nativeRGBSha256: string;
  readonly declaredPrecision: string;
}
export const NATIVE_AGX: Readonly<NativeAgXMetadata & {
  nativeFloat32RGBSha256: string;
  gpuRGBA32FBytes: number;
  sourceConfigSha256: string;
  sourceLutSha256: string;
  sourceGeneratedShaderSha256: string;
}>;
export const NATIVE_AGX_F16: Readonly<NativeAgXMetadata & { gpuRGBA16FBytes: number }>;
export const NATIVE_AGX_GLSL: string;
export interface NativeAgXLease {
  texture: Data3DTexture;
  metadata: NativeAgXMetadata;
  release(): void;
}
export interface NativeAgXOptions {
  url: string;
  precision?: NativeAgXPrecision;
  fetcher?: (url: string) => Promise<Response>;
  decodeZstd?: (bytes: Uint8Array, decodedBytes: number) => Uint8Array | Promise<Uint8Array>;
}
export function decodeNativeAgXData(bytes: Uint8Array): Float32Array;
export function decodeNativeAgXHalfData(bytes: Uint8Array): Uint16Array;
export function acquireNativeAgX(options: NativeAgXOptions): Promise<NativeAgXLease>;
/** Takes ownership of one lease; outputs linear display sRGB before an OETF-only OutputPass. */
export class NativeAgXPass extends Pass {
  constructor(lease: NativeAgXLease, options?: { cameraExposureEV?: number });
  name: string;
  lease: NativeAgXLease;
  disposed: boolean;
  uniforms: {
    tDiffuse: { value: Texture | null };
    cameraExposureEV: { value: number };
    nativeAgX_lut3d_0Sampler: { value: Data3DTexture | null };
  };
  material: RawShaderMaterial;
  mesh: Mesh<BufferGeometry, RawShaderMaterial>;
  camera: OrthographicCamera;
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void;
  dispose(): void;
}
