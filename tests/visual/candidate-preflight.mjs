// CPU-only provenance gate for material-profile comparison. No browser is launched.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintCaptureSource } from './capture-source-fingerprint.mjs';
import { readCaptureManifest } from './capture-preflight.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const productFiles = fingerprint => fingerprint.files
  .filter(file => file.path.startsWith('web/src/') || file.path.startsWith('shared/'))
  .map(file => file.path === 'web/src/engine/scene.js'
    ? { ...file, sha256: fingerprint.instrumentation?.originalSceneSha256 ?? file.sha256 } : file);
function sceneGraph(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Candidate is not a glTF 2 binary with a JSON first chunk.');
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  return { scene: document.scene, scenes: document.scenes, nodes: document.nodes };
}
export async function inspectCandidatePair(candidates) {
  const entries = [];
  for (const candidate of candidates) {
    const manifest = await readCaptureManifest(candidate.source, { requireFinalBanks: true });
    const fingerprint = await fingerprintCaptureSource(candidate.source);
    if (!fingerprint.instrumentation?.deliveryHelperSha256) throw new Error(`Instrument the frozen ${candidate.name} source before comparison.`);
    const manifestSha = fingerprint.files.find(file => file.path === 'web/public/places/snow-roof/manifest.json')?.sha256;
    if (!manifestSha || fingerprint.instrumentation.deliveryPending || fingerprint.instrumentation.snowManifestSha256 !== manifestSha) throw new Error(`Finalize ${candidate.name} instrumentation after installing the complete candidate manifest.`);
    if (manifest.compression?.materialProfile !== candidate.name) throw new Error(`${candidate.name} manifest does not explicitly identify that material profile.`);
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error(`${candidate.name} manifest has no delivery integrity file list.`);
    for (const item of manifest.files) {
      const path = `web/public/places/snow-roof/${item.uri}`;
      const actual = fingerprint.files.find(file => file.path === path);
      if (!actual || actual.sha256 !== item.sha256 || (await stat(join(candidate.source, path))).size !== item.bytes) throw new Error(`${candidate.name} delivery integrity failed for ${item.uri}.`);
    }
    const receipt = JSON.parse(await readFile(candidate.receipt, 'utf8'));
    const scenePath = `web/public/places/snow-roof/${manifest.scene}`;
    const scene = fingerprint.files.find(file => file.path === scenePath);
    if (!scene || scene.sha256 !== receipt.output.sha256) throw new Error(`${candidate.name} GLB does not match its optimization receipt.`);
    if (!receipt.invariants?.retainedTriangleAttributesBitExact || !receipt.invariants.triangleHashes?.length) throw new Error(`${candidate.name} receipt lacks the preserved-attribute proof.`);
    const lightmaps = Object.entries(manifest.lightmaps).flatMap(([region, maps]) => Object.entries(maps).map(([pass, item]) => {
      const file = fingerprint.files.find(file => file.path === `web/public/places/snow-roof/${item.uri}`);
      if (!file) throw new Error(`Missing actual ${candidate.name} lightmap ${region}/${pass}.`);
      return { region, pass, uri: item.uri, sha256: file.sha256, scale: item.scale ?? 1, logRange: item.logRange ?? null, logGain: item.logGain ?? null, encoding: item.encoding ?? null };
    }));
    entries.push({ ...candidate, manifest, fingerprint, receipt, productSourceSha256: digest(productFiles(fingerprint)),
      graphSha256: digest(sceneGraph(await readFile(join(candidate.source, scenePath)))),
      lightmaps, lightmapPayloadSha256: digest(lightmaps), triangleAttributesSha256: digest(receipt.invariants.triangleHashes) });
  }
  const [a, b] = entries;
  const proof = JSON.parse(await readFile(join(a.source, 'web/public/places/snow-roof/geometry-equivalence.json'), 'utf8'));
  const proofHashes = [proof.inputs?.left?.sha256, proof.inputs?.right?.sha256];
  const checks = {
    productSourceIdentical: a.productSourceSha256 === b.productSourceSha256,
    sceneGraphIdentical: a.graphSha256 === b.graphSha256,
    lightmapPayloadsAndDecodeParametersIdentical: a.lightmapPayloadSha256 === b.lightmapPayloadSha256,
    retainedTriangleAttributeProofIdentical: a.triangleAttributesSha256 === b.triangleAttributesSha256,
    sourceBlendIdentical: a.receipt.inputs.sourceBlend.sha256 === b.receipt.inputs.sourceBlend.sha256,
    lampBasisIdentical: digest(a.manifest.lampBasis) === digest(b.manifest.lampBasis),
    finalCrossProfileProofMatchesActualGLBs: proofHashes.includes(a.receipt.output.sha256) && proofHashes.includes(b.receipt.output.sha256)
      && proof.positionsNormalsUV0UV1AllColorsAndWindingExactlyEqual === true && proof.sourceSceneProofMetadataExactlyEqual === true,
  };
  if (Object.values(checks).some(value => !value)) throw new Error(`A/B isolation failed before browser launch: ${JSON.stringify(checks)}`);
  return { entries, checks, geometryEvidence: `Both actual GLBs match their optimization receipt hashes. The receipts contain identical ${a.receipt.invariants.triangleHashes.length}-entry triangle-attribute proofs; this driver compares those proofs and actual GLB scene graphs, rather than claiming a fresh Blender or independent triangle decode audit.` };
}
