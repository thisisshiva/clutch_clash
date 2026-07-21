import { CITY_NIGHT_MOVING } from './cityNight.js';
import { MT_FUJI_2D, MT_FUJI_2D_DAWN } from './mtFuji.js';

const BY_TRACK_ID = {
  'city-road-2d': CITY_NIGHT_MOVING,
  'mt-fuji-2d': MT_FUJI_2D,
  'mt-fuji-2d-dawn': MT_FUJI_2D_DAWN,
};

/** Resolve moving-picture config for a 2D track. */
export function get2dRoadConfig(trackDef) {
  return BY_TRACK_ID[trackDef?.id] ?? CITY_NIGHT_MOVING;
}
