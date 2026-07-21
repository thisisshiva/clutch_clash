import { buildAnimeFujiWorld } from './animeWorld.js';

/** Autumn foliage — warm sky, crimson trees, painted Fuji. */
export function buildMtFujiAutumnScenery(curve, trackDef, rng) {
  return buildAnimeFujiWorld(curve, trackDef, rng, {
    id: 'autumn',
    backdrop: 'backdrop-autumn.png',
    skyGradient: [
      [0, 0x3a6898],
      [0.35, 0x78a8c8],
      [0.6, 0xf0a868],
      [1, 0xffd0a0],
    ],
    mistColor: 0xc88858,
    fogColor: 0xe0b080,
    groundColor: 0x7a4830,
    groundTint: 0xb86840,
    bermColor: 0x9a5838,
    hillColor: 0x6a3828,
    clutterColor: 0x5a3020,
    mistOpacity: 0.3,
    leafColors: [0xc84820, 0xe06828, 0xd04018, 0xf09030, 0xa83820, 0xe87838],
    trunkColor: 0x4a2818,
    pineRatio: 0.2,
    forestOutward: 120,
    petals: 0xff8030,
  });
}
