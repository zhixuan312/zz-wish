import type { Shape } from '../../../shared/rules.ts';
import type { PlaceId } from '../../../shared/places.ts';
export type ScenePhase = 'wish' | 'place' | 'travel' | 'candle' | 'burning' | 'result';
export type PlaceLoadProgress = { loadedBytes: number; totalBytes: number; ratio: number | null; stage: 'loading' | 'preparing' | 'ready' | 'error' };
export type LampThumbnailOptions = { state: 'unlit' | 'burning' | 'went_out' | 'burned_down'; remaining: number; width: number; height: number };
export type IgnitionOptions = { onCatch?: () => void; remainingFuel?: () => number; onTaperLit?: () => void };
export const ready: Promise<void>;
export function ensureReady(): Promise<void>;
export function setOffer(shape: Shape | null): void;
export function setLevel(remaining: number): void;
export function previewPlace(id: PlaceId): Promise<void>;
export function preparePlace(id: PlaceId): Promise<unknown>;
export function toCover(): Promise<void>;
export function travel(id: PlaceId): Promise<void>;
export function skip(): void;
export function ignite(options?: IgnitionOptions): Promise<void>;
export function renderLampThumbnail(shape: Shape, options: LampThumbnailOptions): Promise<string>;
export function snuff(done?: boolean, remaining?: number, gust?: boolean): Promise<void>;

// A court opts into drawing its visitor's finished lamps with nook.pastLampSlots.
export type OwnPastLamp = { id: string; shape: Shape; remaining: number; status: 'went_out' | 'burned_down' | 'ended_unexpectedly' };
export function setOwnPastLamps(id: PlaceId, list: readonly OwnPastLamp[]): void;

export function setPhase(phase: ScenePhase): void;
export function setPowerSaver(on: boolean): void;
