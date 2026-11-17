import type { PlaceLoadProgress } from '../scene.js';
export type BakedFile = { uri: string; bytes: number; sha256: string; encoding?: 'gzip' | 'zstd'; decodedBytes?: number; decodedSha256?: string };
export function bakedAssetUrl(id: string, file: BakedFile): string;
export function readBakedManifest(id: string): Promise<{ scene: string; files: BakedFile[]; [key: string]: unknown }>;
export function readBakedAsset(id: string, file: BakedFile): Promise<ArrayBuffer>;
export function prefetchBakedPlace(id: string, onProgress?: (progress: PlaceLoadProgress) => void): Promise<void>;
