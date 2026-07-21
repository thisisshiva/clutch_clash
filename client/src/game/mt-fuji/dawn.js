import { buildAnimeFujiWorld } from './animeWorld.js';

/** Shinkai-style sunrise — violet Fuji, gold-to-cyan sky. */
export function buildMtFujiDawnScenery(curve, trackDef, rng) {
  return buildAnimeFujiWorld(curve, trackDef, rng, {
    id: 'dawn',
    backdrop: 'backdrop-dawn.png',
    skyGradient: [
      [0, 0x2a1848],
      [0.3, 0x5a4a98],
      [0.5, 0xc878a0],
      [0.7, 0xf0a878],
      [1, 0xffd8b0],
    ],
    mistColor: 0xc89888,
    fogColor: 0xd8a898,
    groundColor: 0x6a5048,
    groundTint: 0xb88878,
    bermColor: 0x8a6860,
    hillColor: 0x5a4858,
    clutterColor: 0x4a3848,
    mistOpacity: 0.3,
    leafColors: [0x2a3a38, 0x3a4a40, 0x1a2a30, 0x4a3a48, 0x2a4850],
    trunkColor: 0x3a2820,
    pineRatio: 0.7,
    forestOutward: 120,
  });
}
