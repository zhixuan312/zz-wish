// Browser-only, read-only delivery diagnostics. Call outside timed render windows.
import * as THREE from 'three';

const passes = ['night', 'dusk', 'day', 'lamp'];
const namesFor = (value, suffix) => Object.entries(THREE)
  .filter(([name, item]) => item === value && name.endsWith(suffix)).map(([name]) => name);
const dimensions = image => image ? {
  width: image.width ?? image.videoWidth ?? image.naturalWidth ?? null,
  height: image.height ?? image.videoHeight ?? image.naturalHeight ?? null,
  depth: image.depth ?? null,
} : null;
const jsonCopy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));

export function collectDeliveryInfo({ renderer, place }) {
  const baked = place?.baked, manifest = baked?.manifest;
  if (!baked || !manifest) return { available: false, place: place?.id ?? null };
  const gl = renderer.getContext(), textures = new Map(), samplers = new Map();
  const materialReferences = new Map(), regions = new Set();
  let meshCount = 0, compiledMaterialCount = 0, uncompiledMaterialCount = 0;

  const textureInfo = texture => {
    if (!texture?.isTexture) return null;
    if (textures.has(texture.uuid)) return texture.uuid;
    const properties = renderer.properties.get(texture), image = texture.image;
    const webglHandle = properties.__webglTexture;
    const validHandle = webglHandle ? gl.isTexture(webglHandle) : false;
    const size = dimensions(image), mipmaps = texture.mipmaps ?? [];
    textures.set(texture.uuid, {
      uuid: texture.uuid, name: texture.name || null, image: size,
      isCompressedTexture: !!texture.isCompressedTexture, isDataTexture: !!texture.isDataTexture,
      isOnePixelDataTexture: !!texture.isDataTexture && size?.width === 1 && size?.height === 1,
      format: { value: texture.format, threeNames: namesFor(texture.format, 'Format'), source: 'Actual Three texture format after loader/transcoder selection; not a GPU storage query.' },
      type: { value: texture.type, threeNames: namesFor(texture.type, 'Type') },
      declaredInternalFormat: texture.internalFormat ?? null,
      queriedStorageInternalFormat: null,
      storageFormatNote: 'WebGL does not expose getTexLevelParameter. No uploaded storage internal format or level dimensions are claimed as queried.',
      mipmaps: mipmaps.map((mip, index) => ({ level: index, ...dimensions(mip), bytes: mip.data?.byteLength ?? null })),
      mipCount: mipmaps.length, generateMipmaps: texture.generateMipmaps,
      minFilter: texture.minFilter, magFilter: texture.magFilter, anisotropy: texture.anisotropy,
      channel: texture.channel, colorSpace: texture.colorSpace, flipY: texture.flipY,
      version: texture.version, sourceVersion: texture.source?.version ?? null,
      upload: {
        webglHandlePresent: !!webglHandle, webglHandleIsTexture: validHandle,
        initialized: properties.__webglInit === true, uploadedVersion: properties.__version ?? null,
        versionMatches: validHandle && properties.__version === texture.version,
        evidence: 'Three renderer texture properties plus gl.isTexture(handle), without changing GL bindings or uploading textures.',
      },
    });
    return texture.uuid;
  };
  const visitMaterial = (material, object, region) => {
    const firstVisit = !materialReferences.has(material.uuid);
    if (firstVisit) materialReferences.set(material.uuid, { material: material.uuid, name: material.name || null, maps: {}, meshes: 0 });
    const references = materialReferences.get(material.uuid); references.meshes++;
    if (firstVisit) for (const [slot, value] of Object.entries(material)) {
      if (value?.isTexture) references.maps[slot] = textureInfo(value);
    }
    const uniforms = renderer.properties.get(material).uniforms;
    if (firstVisit) {
      if (uniforms?.uBakedNight) compiledMaterialCount++; else uncompiledMaterialCount++;
    }
    for (const pass of passes) {
      const uniform = 'uBaked' + pass[0].toUpperCase() + pass.slice(1);
      const texture = uniforms?.[uniform]?.value;
      const uuid = textureInfo(texture), key = `${region}/${pass}/${uuid ?? 'uncompiled'}`;
      if (!samplers.has(key)) samplers.set(key, { region, pass, uniform, texture: uuid, meshCount: 0, exampleMeshes: [], materialIds: new Set() });
      const entry = samplers.get(key); entry.meshCount++; entry.materialIds.add(material.uuid);
      if (entry.exampleMeshes.length < 4) entry.exampleMeshes.push(object.name || object.uuid);
    }
  };
  baked.group.traverse(object => {
    if (!object.isMesh) return;
    meshCount++;
    const region = object.userData.lightmap_region ?? object.userData.region ?? object.parent?.userData.lightmap_region ?? 'unknown';
    regions.add(region);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) visitMaterial(material, object, region);
  });
  const samplerEntries = [...samplers.values()].map(entry => ({ ...entry, materialIds: [...entry.materialIds] }));
  const bankReferences = Object.fromEntries(passes.map(pass => {
    const entries = samplerEntries.filter(entry => entry.pass === pass);
    const refs = entries.map(entry => textures.get(entry.texture));
    return [pass, {
      regions: entries.length,
      nonPlaceholderSamplerReferences: refs.filter(texture => texture && !texture.isOnePixelDataTexture).length,
      placeholderSamplerReferences: refs.filter(texture => texture?.isOnePixelDataTexture).length,
      uncompiledSamplerReferences: refs.filter(texture => !texture).length,
      uploadedNonPlaceholderReferences: refs.filter(texture => texture && !texture.isOnePixelDataTexture && texture.upload.webglHandleIsTexture).length,
    }];
  }));
  return {
    available: true, place: place.id, capturedAtMs: performance.now(), manifestUri: `/places/${place.id}/manifest.json`,
    partialPreview: !!manifest.partialPreview, scene: manifest.scene,
    materialProfile: manifest.compression?.materialProfile ?? null,
    lightmapCodec: manifest.compression?.lightmapCodec ?? null,
    profileNote: 'Manifest-declared values only. An absent profile is null; viewport size does not imply profile selection.',
    compression: jsonCopy(manifest.compression), bakeSampling: jsonCopy(manifest.bake?.sampling),
    lightmaps: jsonCopy(manifest.lightmaps), lightingState: baked.lightingState?.() ?? null,
    meshCount, regions: [...regions], compiledMaterialCount, uncompiledMaterialCount,
    bankReferences, shaderSamplerReferences: samplerEntries,
    materialReferences: [...materialReferences.values()], textures: [...textures.values()],
    textureDimensionsNote: 'Image/mipmap dimensions and compressed bytes describe the actual loaded Three textures. Upload handles confirm allocation presence, not a queried storage format or physical-device benchmark.',
    samplerNote: 'References are the actual compiled material uniform values. They are not a claim about the last compositor pass\'s global GL texture-unit bindings. Inactive banks should reference the one-pixel placeholder.',
  };
}
