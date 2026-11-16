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
export const ready = scene.then(s => s.ready);
export const setOffer = (shape: Shape | null) => { void scene.then(s => s.setOffer(shape)); };
export const setLevel = (level: number) => { void scene.then(s => s.setLevel(level)); };
export const setPhase = (phase: string) => { void scene.then(s => s.setPhase(phase)); };
export const setPowerSaver = (on: boolean) => { void scene.then(s => s.setPowerSaver(on)); };
export const previewPlace = (id: PlaceId) => scene.then(s => s.previewPlace(id));
export const travel = (id: PlaceId) => scene.then(s => s.travel(id));
export const toHall = () => scene.then(s => s.toHall());
export const closeUp = () => scene.then(s => s.closeUp());
export const backToChoose = () => scene.then(s => s.backToChoose());
export const ignite = () => scene.then(s => s.ignite());
export const snuff = (done = false) => scene.then(s => s.snuff(done));
export const skip = () => { void scene.then(s => s.skip()); };
