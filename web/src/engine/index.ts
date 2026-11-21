// The UI talks only to this small, asynchronous facade. Loading the scene cannot
// hold up the wish form, and the engine never receives product records or wishes.
import type { Shape } from '../../../shared/rules.ts';
import type { PlaceId } from '../../../shared/places.ts';
import type { ScenePhase, PlaceLoadProgress, LampThumbnailOptions, IgnitionOptions, TravelAudioListener } from './scene.js';
export type { ScenePhase, PlaceLoadProgress, LampThumbnailOptions } from './scene.js';
type Scene = typeof import('./scene.js');
let resolveScene: (scene: Scene) => void;
let rejectScene: (error: unknown) => void;
const scene = new Promise<Scene>((resolve, reject) => { resolveScene = resolve; rejectScene = reject; });
let started = false;
export function boot() {
  if (!started) {
    started = true;
    // Module import/evaluation failures remain distinct from a retryable asset
    // startup. Do not create duplicate engine modules/WebGL contexts to retry.
    void import('./scene.js').then(resolveScene, rejectScene);
  }
  void initialize().catch(() => {});
}
let resolveReady: () => void;
// A failed cover attempt must not permanently reject main.tsx's readiness wait.
// Operations reject their own failed attempts; this barrier resolves on success.
export const ready = new Promise<void>(resolve => { resolveReady = resolve; });
let initializing: Promise<Scene> | null = null;
let initializedScene: Scene | null = null;
const requested: { phase?: ScenePhase; powerSaver?: boolean; offer?: Shape | null; level?: number } = {};

function initialize(): Promise<Scene> {
  if (initializedScene) return Promise.resolve(initializedScene);
  if (initializing) return initializing;
  const attempt = scene.then(async s => {
    await s.ensureReady();
    // Replay each latest requested value once; stale queued setter values must
    // not overwrite newer choices after a slow or previously failed startup.
    if (requested.phase !== undefined) s.setPhase(requested.phase);
    if (requested.powerSaver !== undefined) s.setPowerSaver(requested.powerSaver);
    if (requested.offer !== undefined) s.setOffer(requested.offer);
    if (requested.level !== undefined) s.setLevel(requested.level);
    initializedScene = s; resolveReady(); return s;
  });
  initializing = attempt;
  void attempt.catch(() => { if (initializing === attempt) initializing = null; });
  return attempt;
}

function updateState(apply: (scene: Scene) => void) {
  if (initializedScene) {
    // These methods intentionally return void to React effects/event handlers.
    // Startup errors are surfaced by awaited preparation, not unhandled tasks.
    try { apply(initializedScene); } catch { /* Preserve the latest request. */ }
  } else void initialize().catch(() => {});
}
export const setOffer = (shape: Shape | null) => { requested.offer = shape; updateState(s => s.setOffer(shape)); };
export const setLevel = (level: number) => { requested.level = level; updateState(s => s.setLevel(level)); };
export const setPhase = (phase: ScenePhase) => { requested.phase = phase; updateState(s => s.setPhase(phase)); };
export const setPowerSaver = (on: boolean) => { requested.powerSaver = on; updateState(s => s.setPowerSaver(on)); };
export const previewPlace = (id: PlaceId) => initialize().then(s => s.previewPlace(id));
export const prefetchPlace = async (
  id: PlaceId, onProgress?: (progress: PlaceLoadProgress) => void, shouldWarm?: () => Promise<boolean>,
) => {
  let progress: PlaceLoadProgress = { loadedBytes: 0, totalBytes: 0, ratio: null, stage: 'preparing' };
  // Pine Gate prepares with its current ambient look and the lamp pass. The
  // loader verifies every bank as it is needed, including later time-of-day changes.
  if (id === 'pine-gate') onProgress?.(progress);
  else {
    const { prefetchBakedPlace } = await import('./baked/prefetchPlace.js');
    await prefetchBakedPlace(id, value => {
      progress = { ...value, stage: value.stage === 'ready' ? 'preparing' : value.stage };
      onProgress?.(progress);
    });
  }
  try {
    if (shouldWarm && !await shouldWarm()) return false;
    const s = await initialize();
    await s.preparePlace(id);
    onProgress?.({ ...progress, stage: 'ready', ratio: 1 });
    return true;
  } catch (error) {
    onProgress?.({ ...progress, stage: 'error' });
    throw error;
  }
};
export const renderLampThumbnail = (shape: Shape, options: LampThumbnailOptions) => initialize().then(s => s.renderLampThumbnail(shape, options));
export const travel = (id: PlaceId, listener?: TravelAudioListener) => initialize().then(s => s.travel(id, listener));
export const toCover = () => initialize().then(s => s.toCover());
export const ignite = (options: IgnitionOptions = {}) => initialize().then(s => s.ignite(options));
export const snuff = (done = false, remaining?: number, gust = false) => initialize().then(s => s.snuff(done, remaining, gust));
export { isLeavingGust } from './places/pine-gust.ts';
export const skip = () => { void initialize().then(s => s.skip()).catch(() => {}); };
// The visitor's own past lamps: stored for the active place, drawn only where a
// court defines past lamp slots.
export const setOwnPastLamps = (list: Parameters<Scene['setOwnPastLamps']>[0]) =>
  initialize().then(s => s.setOwnPastLamps(list));

import { dayPart } from '../../../shared/dayPart.ts';
import { layersFor, recordedLayersFor } from './places/pine-ambience.ts';

export { layersFor, recordedLayersFor, nextDelay, LEVELS, RECORDED } from './places/pine-ambience.ts';
export { createRecordedSounds } from './places/pine-recorded-sounds.ts';
export { PART_LIGHT, PART_ORDER, PART_START, lightAt, partProgress } from './places/pine-day-parts.ts';
export type { RecordedSounds } from './places/pine-recorded-sounds.ts';

/** One call for the UI: which layers this part of day enables, and which of them are recorded. */
export function ambienceFor(date: Date) {
  const part = dayPart(date);
  return { part, layers: [...layersFor(part)], recorded: recordedLayersFor(part) };
}
