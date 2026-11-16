// The UI talks only to this small, asynchronous facade. Loading the scene cannot
// hold up the wish form, and the engine never receives product records or wishes.
import type { Shape } from '../../../shared/rules.ts';
import type { PlaceId } from '../../../shared/places.ts';
type Scene = typeof import('./scene.js');
let resolveScene: (scene: Scene) => void;
let rejectScene: (error: unknown) => void;
const scene = new Promise<Scene>((resolve, reject) => { resolveScene = resolve; rejectScene = reject; });
let started = false;
export function boot() {
  if (started) return; started = true;
  void import('./scene.js').then(resolveScene, rejectScene);
}
const initialized = scene.then(async s => { await s.ready; return s; });
export const ready = initialized.then(() => {});
export const setOffer = (shape: Shape | null) => { void initialized.then(s => s.setOffer(shape)); };
export const setLevel = (level: number) => { void initialized.then(s => s.setLevel(level)); };
export const setPhase = (phase: string) => { void initialized.then(s => s.setPhase(phase)); };
export const setPowerSaver = (on: boolean) => { void initialized.then(s => s.setPowerSaver(on)); };
export const previewPlace = (id: PlaceId) => initialized.then(s => s.previewPlace(id));
export const travel = (id: PlaceId) => initialized.then(s => s.travel(id));
export const toHall = () => initialized.then(s => s.toHall());
export const closeUp = () => initialized.then(s => s.closeUp());
export const backToChoose = () => initialized.then(s => s.backToChoose());
export const ignite = () => initialized.then(s => s.ignite());
export const snuff = (done = false) => initialized.then(s => s.snuff(done));
export const skip = () => { void initialized.then(s => s.skip()); };
