import type { Shape } from '../../../shared/rules.ts';
import type { PlaceId } from '../../../shared/places.ts';
export type ScenePhase = 'wish' | 'place' | 'travel' | 'candle' | 'confirm' | 'burning' | 'result';
export const ready: Promise<void>;
export function setOffer(shape: Shape | null): void;
export function setLevel(remaining: number): void;
export function previewPlace(id: PlaceId): Promise<void>;
export function toCover(): Promise<void>;
export function travel(id: PlaceId): Promise<void>;
export function skip(): void;
export function closeUp(): Promise<void>;
export function backToChoose(): Promise<void>;
export function ignite(): Promise<void>;
export function snuff(done?: boolean): Promise<void>;

export function setPhase(phase: ScenePhase): void;
export function setPowerSaver(on: boolean): void;
