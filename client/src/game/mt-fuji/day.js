import { buildAnimeFujiWorld } from './animeWorld.js';

/**
 * Sakura — true 360° sky sphere (no flat card / no vertical seam).
 * Fuji stays locked ahead of the camera as the destination.
 * openHorizon keeps green terrain short so the painted mountain isn't buried.
 */
export function buildMtFujiDayScenery(curve, trackDef, rng) {
  return buildAnimeFujiWorld(curve, trackDef, rng, {
    id: 'day',
    skybox360: true,
    lockSkyYaw: true,
    horizonLock: false,
    openHorizon: true,
    skipClutter: true,
    backdrop: 'sakura-equirect-360.png',
    skyPitch: -0.48,
    skyGradient: [
      [0, 0x4a98d0],
      [0.4, 0x7ec4e8],
      [0.7, 0xc8e8f8],
      [1, 0xeef6fc],
    ],
    mistColor: 0x7aaa78,
    fogColor: 0xd8e8f0,
    groundColor: 0x6a9a68,
    groundTint: 0x88b078,
    groundRadius: 420,
    bermColor: 0x7aaa70,
    hillColor: 0x5a8a58,
    clutterColor: 0x4a7a48,
    mistOpacity: 0,
    mapleFile: 'maple-trees.glb',
    pineFile: 'pine-tree-snow.glb',
    forestOutward: 120,
    forestDensity: 1,
    petals: 0xffb0c8,
    petalScale: 0.55,
  });
}
