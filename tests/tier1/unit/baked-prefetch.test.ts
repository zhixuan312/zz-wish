import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync, zstdCompressSync } from 'node:zlib';

const nativeFetch = globalThis.fetch;

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test('retry reads a fresh manifest after a deployment changes an asset', async () => {
  const bytes = new TextEncoder().encode('new scene bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let manifestRequests = 0;
  const request = vi.fn(async (url: string) => {
    if (url.endsWith('/manifest.json')) {
      manifestRequests++;
      return Response.json({ scene: 'test.glb', files: [{ uri: 'test.glb', bytes: bytes.length, sha256: manifestRequests === 1 ? '0'.repeat(64) : sha256 }] });
    }
    return new Response(bytes);
  });
  vi.stubGlobal('fetch', request);
  const { prefetchBakedPlace } = await import('../../../web/src/engine/baked/prefetchPlace.js');
  await expect(prefetchBakedPlace('retry-regression')).rejects.toThrow('Changed test.glb');
  const stages: string[] = [];
  await prefetchBakedPlace('retry-regression', progress => stages.push(progress.stage));
  expect(manifestRequests).toBe(2);
  expect(stages.at(-1)).toBe('ready');
});

test('gzip models are verified in both encoded and decoded forms before Three receives them', async () => {
  const source=new TextEncoder().encode('glTF genuine original geometry bytes'),encoded=gzipSync(source);
  const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
  const file={uri:'court.glb.gzip',bytes:encoded.length,sha256:digest(encoded),encoding:'gzip' as const,decodedBytes:source.length,decodedSha256:digest(source)};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/manifest.json')?Response.json({scene:file.uri,files:[file]}):new Response(encoded)));
  const {prefetchBakedPlace,readBakedAsset}=await import('../../../web/src/engine/baked/prefetchPlace.js');
  const progress:number[]=[];
  await prefetchBakedPlace('gzip-valid',p=>progress.push(p.loadedBytes));
  const buffer=await readBakedAsset('gzip-valid',file);
  expect(new Uint8Array(buffer)).toEqual(source);
  expect(progress.at(-1)).toBe(encoded.length);
});

test('a valid gzip checksum cannot conceal the wrong decoded model', async () => {
  const source=new TextEncoder().encode('different model'),encoded=gzipSync(source),sha256=createHash('sha256').update(encoded).digest('hex');
  const file={uri:'court.glb.gzip',bytes:encoded.length,sha256,encoding:'gzip' as const,decodedBytes:source.length,decodedSha256:'0'.repeat(64)};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/manifest.json')?Response.json({scene:file.uri,files:[file]}):new Response(encoded)));
  const {prefetchBakedPlace}=await import('../../../web/src/engine/baked/prefetchPlace.js');
  await expect(prefetchBakedPlace('gzip-wrong-decoded')).rejects.toThrow('Changed decoded court.glb.gzip');
});

test('Zstd models use the actual Three WASM decoder and verify both byte streams', async () => {
  const source=new TextEncoder().encode('glTF original F32 geometry and source anchors'),encoded=zstdCompressSync(source),digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  const file={uri:'court.glb.zstd',bytes:encoded.length,sha256:digest(encoded),encoding:'zstd' as const,decodedBytes:source.length,decodedSha256:digest(source)};
  const request=vi.fn(async(url:string)=>url.startsWith('data:application/wasm')?nativeFetch(url):url.endsWith('/manifest.json')?Response.json({scene:file.uri,files:[file]}):new Response(encoded));vi.stubGlobal('fetch',request);
  const {prefetchBakedPlace,readBakedAsset}=await import('../../../web/src/engine/baked/prefetchPlace.js');
  const progress:number[]=[];await prefetchBakedPlace('zstd-valid',p=>progress.push(p.loadedBytes));
  const decoded=await readBakedAsset('zstd-valid',file);
  expect(decoded.byteLength).toBe(source.length);expect(new Uint8Array(decoded)).toEqual(source);
  expect(progress.at(-1)).toBe(encoded.length);expect(request.mock.calls.filter(([url])=>url.startsWith('/places/'))).toHaveLength(2);
});

test('a valid Zstd payload cannot conceal the wrong decoded checksum', async () => {
  const source=new TextEncoder().encode('A different glTF model'),encoded=zstdCompressSync(source),digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  const file={uri:'court.glb.zstd',bytes:encoded.length,sha256:digest(encoded),encoding:'zstd',decodedBytes:source.length,decodedSha256:'0'.repeat(64)};
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.startsWith('data:application/wasm')?nativeFetch(url):url.endsWith('/manifest.json')?Response.json({scene:file.uri,files:[file]}):new Response(encoded)));
  const {prefetchBakedPlace}=await import('../../../web/src/engine/baked/prefetchPlace.js');
  await expect(prefetchBakedPlace('zstd-wrong-decoded')).rejects.toThrow('Changed decoded court.glb.zstd');
});

test('a direct cover-asset failure also refreshes its manifest on retry', async () => {
  const source=new TextEncoder().encode('cover model'),encoded=gzipSync(source),digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  let requests=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/manifest.json'))return Response.json({scene:'cover.glb.gzip',files:[{uri:'cover.glb.gzip',bytes:encoded.length,sha256:digest(encoded),encoding:'gzip',decodedBytes:source.length,decodedSha256:++requests===1?'0'.repeat(64):digest(source)}]});
    return new Response(encoded);
  }));
  const {readBakedManifest,readBakedAsset}=await import('../../../web/src/engine/baked/prefetchPlace.js');
  await expect(readBakedAsset('direct-retry',(await readBakedManifest('direct-retry')).files[0])).rejects.toThrow('Changed decoded');
  const buffer=await readBakedAsset('direct-retry',(await readBakedManifest('direct-retry')).files[0]);
  expect(new Uint8Array(buffer)).toEqual(source);expect(requests).toBe(2);
});
