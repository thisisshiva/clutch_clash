/** Server-side car id whitelist (mirrors client carCatalog). */
export const CAR_IDS = [
  'race',
  'race-future',
  'hatchback-sports',
  'sedan-sports',
  'kart-ooli',
  'police',
];

export const DEFAULT_CAR_ID = 'race';

const valid = new Set(CAR_IDS);

export function isValidCarId(carId) {
  return valid.has(carId);
}

export function normalizeCarId(carId) {
  return isValidCarId(carId) ? carId : DEFAULT_CAR_ID;
}
