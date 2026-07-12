import { createRegularCarProfiles } from './vehicleClasses.js';
const BASE = import.meta.env.BASE_URL;

/** Playable car definitions — Kenney Car Kit (CC0). */
export const CAR_CATALOG = [
  {
    id: 'race',
    name: 'Pro Racer',
    file: `${BASE}models/cars/race.glb`,
    preview: `${BASE}img/cars/race.png`,
    defaultColor: 0xe10600,
    targetLength: 4.4,
    tintStrength: 0.3,
    stats: { speed: 95, power: 88, health: 72, grip: 90, weight: 68, boost: 85 },
    engine: { osc1: 'sawtooth', osc2: 'square', baseHz: 44, pitchRange: 140, osc2Ratio: 1.55, volume: 0.18, filterHz: 900 },
  },
  {
    id: 'race-future',
    name: 'Neon GT',
    file: `${BASE}models/cars/race-future.glb`,
    preview: `${BASE}img/cars/race-future.png`,
    defaultColor: 0x00c2ff,
    targetLength: 4.4,
    tintStrength: 0.28,
    stats: { speed: 98, power: 82, health: 65, grip: 86, weight: 62, boost: 95 },
    engine: { osc1: 'square', osc2: 'sine', baseHz: 52, pitchRange: 155, osc2Ratio: 2.1, volume: 0.16, filterHz: 1200 },
  },
  {
    id: 'hatchback-sports',
    name: 'Hot Hatch',
    file: `${BASE}models/cars/hatchback-sports.glb`,
    preview: `${BASE}img/cars/hatchback-sports.png`,
    defaultColor: 0xffb800,
    targetLength: 4.2,
    tintStrength: 0.35,
    stats: { speed: 82, power: 92, health: 78, grip: 88, weight: 72, boost: 80 },
    engine: { osc1: 'triangle', osc2: 'sawtooth', baseHz: 40, pitchRange: 125, osc2Ratio: 1.4, volume: 0.17, filterHz: 780 },
  },
  {
    id: 'sedan-sports',
    name: 'Sport Sedan',
    file: `${BASE}models/cars/sedan-sports.glb`,
    preview: `${BASE}img/cars/sedan-sports.png`,
    defaultColor: 0x0090ff,
    targetLength: 4.5,
    tintStrength: 0.32,
    stats: { speed: 86, power: 85, health: 85, grip: 84, weight: 80, boost: 75 },
    engine: { osc1: 'sawtooth', osc2: 'triangle', baseHz: 38, pitchRange: 118, osc2Ratio: 1.35, volume: 0.15, filterHz: 720 },
  },
  {
    id: 'kart-ooli',
    name: 'Go Kart',
    file: `${BASE}models/cars/kart-ooli.glb`,
    preview: `${BASE}img/cars/kart-ooli.png`,
    defaultColor: 0x00d26a,
    targetLength: 2.8,
    tintStrength: 0.4,
    stats: { speed: 74, power: 78, health: 55, grip: 95, weight: 45, boost: 88 },
    engine: { osc1: 'square', osc2: 'square', baseHz: 68, pitchRange: 175, osc2Ratio: 1.8, volume: 0.14, filterHz: 1400 },
  },
  {
    id: 'police',
    name: 'Interceptor',
    file: `${BASE}models/cars/police.glb`,
    preview: `${BASE}img/cars/police.png`,
    defaultColor: 0x2244aa,
    targetLength: 4.6,
    tintStrength: 0.22,
    stats: { speed: 80, power: 80, health: 95, grip: 78, weight: 92, boost: 70 },
    engine: { osc1: 'sawtooth', osc2: 'sawtooth', baseHz: 32, pitchRange: 95, osc2Ratio: 1.25, volume: 0.2, filterHz: 550 },
  },
  ...createRegularCarProfiles(BASE).map((car) => car.toCatalogEntry()),
];

export const DEFAULT_CAR_ID = 'race';
export const HOME_CAR_IDS = ['race', 'race-future', 'hatchback-sports', 'sedan-sports', 'police', 'suv'];

export const STAT_LABELS = [
  { key: 'speed', label: 'Speed' },
  { key: 'power', label: 'Power' },
  { key: 'health', label: 'Health' },
  { key: 'grip', label: 'Grip' },
  { key: 'weight', label: 'Weight' },
  { key: 'boost', label: 'Boost' },
];

const byId = new Map(CAR_CATALOG.map((c) => [c.id, c]));

export function getCarDef(carId) {
  return byId.get(carId) ?? byId.get(DEFAULT_CAR_ID);
}

export function getCarStats(carId) {
  return { ...getCarDef(carId).stats };
}

export function isValidCarId(carId) {
  return byId.has(carId);
}
