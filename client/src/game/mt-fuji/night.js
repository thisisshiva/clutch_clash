import { buildAnimeFujiWorld } from './animeWorld.js';

/** Moonlit anime night — indigo sky, bright snow cap, starfield. */
export function buildMtFujiNightScenery(curve, trackDef, rng) {
  return buildAnimeFujiWorld(curve, trackDef, rng, {
    id: 'night',
    backdrop: 'backdrop-night.png',
    skyGradient: [
      [0, 0x02040c],
      [0.4, 0x0a1838],
      [0.7, 0x1a3060],
      [1, 0x243858],
    ],
    mistColor: 0x1a2838,
    fogColor: 0x152438,
    groundColor: 0x141c28,
    groundTint: 0x2a3848,
    bermColor: 0x1c2834,
    hillColor: 0x101820,
    clutterColor: 0x0c141c,
    mistOpacity: 0.4,
    leafColors: [0x1a2830, 0x243840, 0x152028, 0x2a4050, 0x1c3038],
    trunkColor: 0x1a1410,
    pineRatio: 0.8,
    forestOutward: 120,
    stars: true,
  });
}
