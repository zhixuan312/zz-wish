import type { Shape } from '../../../shared/rules.ts';
import type { PlaceId } from '../../../shared/places.ts';
export type ScenePhase = 'wish' | 'place' | 'travel' | 'candle' | 'burning' | 'result';
export type PlaceLoadProgress = { loadedBytes: number; totalBytes: number; ratio: number | null; stage: 'loading' | 'preparing' | 'ready' | 'error' };
export type LampThumbnailOptions = { state: 'unlit' | 'burning' | 'went_out' | 'burned_down'; remaining: number; width: number; height: number };
export type IgnitionOptions = { onCatch?: () => void; remainingFuel?: () => number };
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
export function snuff(done?: boolean, remaining?: number): Promise<void>;

// The visitor's own finished lamps for the current place. The engine stores them;
// a court draws them only once it defines nook.pastLampSlots.
export type OwnPastLamp = { shape: Shape | null; color: number | null; remaining: number; status: string | null };
export function setOwnPastLamps(list: readonly OwnPastLamp[]): number;
export function ownPastLampCount(): number;

export function setPhase(phase: ScenePhase): void;
export function setPowerSaver(on: boolean): void;
