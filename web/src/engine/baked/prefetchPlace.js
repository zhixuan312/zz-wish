import * as THREE from 'three';
import { sha256 } from './sha256.js';
import { readPineBackdrop, readPineWalkLightmaps, readPineWaxNormal } from './pineManifest.js';
import { readSnowCourtBackdrop, readSnowCourtWalkLightmaps } from './snowCourtManifest.js';

// FileLoader and KTX2Loader consume these same verified ArrayBuffers, so typing
// a wish can download the next court without constructing or showing its scene.
THREE.Cache.enabled = true;
const manifests = new Map();
const places = new Map();
const fileRequests = new Map();
const verifiedFiles = new Map();
let zstdReady;

async function unpackZstd(bytes, decodedBytes) {
  if (!zstdReady) zstdReady = import('three/examples/jsm/libs/zstddec.module.js').then(async ({ ZSTDDecoder }) => {
    const decoder = new ZSTDDecoder(); await decoder.init(); return decoder;
  }).catch(error => { zstdReady = null; throw error; });
  return (await zstdReady).decode(bytes, decodedBytes);
}

export function bakedAssetUrl(id, file) {
  return `/places/${id}/${file.uri}${file.sha256 ? `?v=${file.sha256}` : ''}`;
}

export function readBakedManifest(id) {
  if (!manifests.has(id)) {
    const request = fetch(`/places/${id}/manifest.json`, { cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) throw new Error(`Cannot load ${id} (${response.status})`);
        const manifest = await response.json();
        if (!manifest.scene || !Array.isArray(manifest.files)) throw new Error(`Invalid ${id} manifest`);
        return manifest;
      })
      .catch(error => { manifests.delete(id); throw error; });
    manifests.set(id, request);
  }
  return manifests.get(id);
}

async function downloadFile(id, file, received) {
  const url = bakedAssetUrl(id, file);
  const identity=JSON.stringify([file.bytes,file.sha256,file.encoding??null,file.decodedBytes??null,file.decodedSha256??null]);
  const cached = THREE.Cache.get(url);
  if(cached&&verifiedFiles.get(url)===identity){received(file.bytes);return;}
  if(cached)THREE.Cache.remove(url);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Cannot load ${file.uri} (${response.status})`);
  let bytes;
  if (response.body) {
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); length += value.byteLength; received(value.byteLength);
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    received(bytes.byteLength);
  }
  if (bytes.byteLength !== file.bytes) throw new Error(`Incomplete ${file.uri}`);
  const actual = await sha256(bytes);
  if (actual !== file.sha256) throw new Error(`Changed ${file.uri}; please try again`);
  if(file.encoding){
    if(!['gzip','zstd'].includes(file.encoding)||!Number.isSafeInteger(file.decodedBytes)||file.decodedBytes<=0||!file.decodedSha256)throw new Error(`Invalid compressed asset ${file.uri}`);
    if(file.encoding==='zstd')bytes=await unpackZstd(bytes,file.decodedBytes);
    else {
      if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot unpack the court assets.');
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if(bytes.byteLength!==file.decodedBytes||await sha256(bytes)!==file.decodedSha256)throw new Error(`Changed decoded ${file.uri}; please try again`);
  }
  const buffer=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.slice().buffer;
  THREE.Cache.add(url, buffer);
  verifiedFiles.set(url,identity);
}

async function download(id,file,received){
  const url=bakedAssetUrl(id,file);
  if(fileRequests.has(url)){await fileRequests.get(url);received(file.bytes);return;}
  const request=downloadFile(id,file,received);fileRequests.set(url,request);
  try{await request;}finally{fileRequests.delete(url);}
}

export async function readBakedAsset(id,file){
  try{
    await download(id,file,()=>{});
    return THREE.Cache.get(bakedAssetUrl(id,file));
  }catch(error){manifests.delete(id);places.delete(id);throw error;}
}

export function prefetchBakedPlace(id, onProgress) {
  let entry = places.get(id);
  if (!entry) {
    entry = { listeners: new Set(), progress: { loadedBytes: 0, totalBytes: 0, ratio: null, stage: 'loading' } };
    const update = patch => {
      Object.assign(entry.progress, patch);
      for (const listener of entry.listeners) listener({ ...entry.progress });
    };
    entry.promise = (async () => {
      const manifest = await readBakedManifest(id);
      const snowCourt = id === 'snow-roof' && manifest.snowCourt?.revision === 'winter-pass-v1';
      const backdrop = snowCourt ? readSnowCourtBackdrop(manifest)
        : id === 'pine-gate' ? readPineBackdrop(manifest) : null;
      const lateFiles = new Set(Object.values(backdrop?.walk?.files ?? {}));
      if (snowCourt) {
        for (const tier of [backdrop?.night, backdrop?.high]) {
          for (const file of Object.values(tier?.files ?? {})) lateFiles.add(file);
        }
      }
      // Trees declared in the walk tier are needed by every device before the crest, so they are
      // fetched with the walk stream rather than after entry.
      const walkTrees = backdrop?.treesInWalk ? backdrop.walk?.trees : null;
      if (!walkTrees && backdrop?.high?.trees) lateFiles.add(backdrop.high.trees);
      const walkLightmaps = id === 'pine-gate' ? readPineWalkLightmaps(manifest)
        : snowCourt ? readSnowCourtWalkLightmaps(manifest) : null;
      for (const region of Object.values(walkLightmaps ?? {})) {
        for (const { full } of Object.values(region)) lateFiles.add(full);
      }
      const files = manifest.files.filter(file => !lateFiles.has(file) && /\.(?:glb(?:\.(?:gz|gzip|zstd))?|ktx2)$/.test(file.uri));
      if (snowCourt || id === 'pine-gate') {
        const waxNormal = id === 'pine-gate' ? readPineWaxNormal(manifest) : null;
        files.push(...Object.values(backdrop?.files ?? {}));
        if (walkTrees && !files.some(file => file.uri === walkTrees.uri)) files.push(walkTrees);
        if (waxNormal) files.push(waxNormal);
      }
      const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
      update({ totalBytes, ratio: 0 });
      let next = 0;
      const received = count => {
        const loadedBytes = entry.progress.loadedBytes + count;
        update({ loadedBytes, ratio: totalBytes ? Math.min(1, loadedBytes / totalBytes) : 1 });
      };
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
        while (next < files.length) await download(id, files[next++], received);
      }));
      update({ loadedBytes: totalBytes, ratio: 1, stage: 'ready' });
    })().catch(error => {
      update({ stage: 'error' }); places.delete(id); manifests.delete(id); throw error;
    });
    places.set(id, entry);
  }
  if (onProgress) { entry.listeners.add(onProgress); onProgress({ ...entry.progress }); }
  return entry.promise.finally(() => { if (onProgress) entry.listeners.delete(onProgress); });
}
