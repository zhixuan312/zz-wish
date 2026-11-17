import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Install before navigation. Recording does not prevent the product's native
// context-loss behavior or manufacture a recovery.
export function installCaptureGpuGuard() {
  window.__captureGpuEvents = [];
  for (const type of ['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']) {
    window.addEventListener(type, event => {
      const now = window.__captureNativeNow ?? performance.now.bind(performance);
      window.__captureGpuEvents.push({ type, at: now(), canvas: event.target?.id ?? null, message: event.statusMessage ?? null });
    }, { capture: true, passive: true });
  }
}

export async function assertCaptureGpuHealthy(page) {
  const health = await page.evaluate(() => {
    const renderer = window.__renderer, context = renderer?.getContext();
    return { available: !!context, lost: context?.isContextLost() ?? null, events: window.__captureGpuEvents ?? [] };
  });
  if (!health.available || health.lost || health.events.length) throw new Error(`GPU capture rejected: ${JSON.stringify(health)}`);
  return health;
}

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
  await assertCaptureGpuHealthy(page);
  const actual = await page.evaluate(() => window.__captureSnapshot ?? null);
  const expected = fingerprint.instrumentation;
  const manifestSha = fingerprint.files.find(file => file.path === 'web/public/places/snow-roof/manifest.json')?.sha256;
  const coverManifestSha = fingerprint.files.find(file => file.path === 'web/public/places/cloud-cliff/manifest.json')?.sha256;
  if (!actual || !expected || resolve(actual.root) !== resolve(fingerprint.root)
    || actual.originalSceneSha256 !== expected.originalSceneSha256
    || !manifestSha || actual.snowManifestSha256 !== manifestSha
    || actual.snowManifestSha256 !== expected.snowManifestSha256
    || (coverManifestSha && (actual.coverManifestSha256 !== coverManifestSha || expected.coverManifestSha256 !== coverManifestSha))) {
    throw new Error(`The served Vite snapshot does not match SOURCE_ROOT. Expected ${fingerprint.root}; browser identity=${JSON.stringify(actual)}. No evidence from this page is accepted.`);
  }
  return actual;
}
