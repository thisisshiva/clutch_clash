/** Car stats — mirrors client carCatalog.js (keep in sync). */
import { createRegularServerCars } from './vehicleClasses.js';

export const CAR_CATALOG = [
  { id: 'race', stats: { speed: 95, power: 88, health: 72, grip: 90, weight: 68, boost: 85 } },
  { id: 'race-future', stats: { speed: 98, power: 82, health: 65, grip: 86, weight: 62, boost: 95 } },
  { id: 'hatchback-sports', stats: { speed: 82, power: 92, health: 78, grip: 88, weight: 72, boost: 80 } },
  { id: 'sedan-sports', stats: { speed: 86, power: 85, health: 85, grip: 84, weight: 80, boost: 75 } },
  { id: 'kart-ooli', stats: { speed: 74, power: 78, health: 55, grip: 95, weight: 45, boost: 88 } },
  { id: 'police', stats: { speed: 80, power: 80, health: 95, grip: 78, weight: 92, boost: 70 } },
  ...createRegularServerCars().map((car) => car.toCatalogEntry()),
];

const byId = new Map(CAR_CATALOG.map((c) => [c.id, c]));

export function getCarStats(carId) {
  return { ...(byId.get(carId)?.stats ?? byId.get('race').stats) };
}
