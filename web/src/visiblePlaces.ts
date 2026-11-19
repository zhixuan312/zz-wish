// The current experience opens these courts. The full catalog and server remain available.
import { placeById, type PlaceId } from '../../shared/places.ts';

export const VISIBLE_PLACE_IDS = ['snow-roof', 'pine-gate'] as const satisfies readonly PlaceId[];
export const VISIBLE_PLACES = VISIBLE_PLACE_IDS.map((id) => placeById(id)!);
export const DEFAULT_PLACE = VISIBLE_PLACES[0];
export const isVisiblePlace = (id: string) => VISIBLE_PLACE_IDS.some((visible) => visible === id);
export const visiblePlaceById = (id: string) => isVisiblePlace(id) ? placeById(id) : undefined;
