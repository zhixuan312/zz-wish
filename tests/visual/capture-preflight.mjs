import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function readCaptureManifest(sourceRoot, { requireFinalBanks = false } = {}) {
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'web/public/places/snow-roof/manifest.json'), 'utf8'));
  if (requireFinalBanks) {
    const regions = Object.entries(manifest.lightmaps ?? {});
    const missing = regions.flatMap(([region, maps]) => ['night', 'dusk', 'day', 'lamp']
      .filter(pass => !maps?.[pass]?.uri).map(pass => `${region}/${pass}`));
    if (manifest.partialPreview || !regions.length || missing.length) {
      throw new Error(`Final-bank capture requires a complete manifest before launching Chrome. partialPreview=${!!manifest.partialPreview}; missing=${missing.join(', ') || 'none'}.`);
    }
  }
  return manifest;
}

export async function assertServedSnapshot(page, fingerprint) {
  const actual = await page.evaluate(() => window.__captureSnapshot ?? null);
  const expected = fingerprint.instrumentation;
  const manifestSha = fingerprint.files.find(file => file.path === 'web/public/places/snow-roof/manifest.json')?.sha256;
  if (!actual || !expected || resolve(actual.root) !== resolve(fingerprint.root)
    || actual.originalSceneSha256 !== expected.originalSceneSha256
    || !manifestSha || actual.snowManifestSha256 !== manifestSha
    || actual.snowManifestSha256 !== expected.snowManifestSha256) {
    throw new Error(`The served Vite snapshot does not match SOURCE_ROOT. Expected ${fingerprint.root}; browser identity=${JSON.stringify(actual)}. No evidence from this page is accepted.`);
  }
  return actual;
}
