import * as THREE from 'three';
import {
  DENSITY,
  makeAsset,
  trackPose,
  addWhenReady,
  createAnimeSkyShell,
  createFullSkybox,
  createGradientSkySphere,
  createDestinationBackdrop,
  createHorizonFuji,
  createAnimeGround,
  createRoadTerrain,
  addGroundClutter,
  createDriftingPetals,
  attachLifecycle,
} from './shared.js';
import { addFujiForest } from './forest.js';

/**
 * Anime Mt Fuji world.
 * Sakura: camera-locked Fuji horizon + meadow ground + dense spring forest.
 */
export function buildAnimeFujiWorld(curve, trackDef, rng, variant) {
  const group = new THREE.Group();
  group.name = `mt-fuji-${variant.id}-scenery`;

  const animation = {
    elapsed: 0,
    petals: [],
    stars: [],
    group,
    skyShell: null,
    ground: null,
    horizonFuji: null,
    horizonDistance: variant.horizonDistance ?? 2400,
    horizonLift: variant.horizonLift ?? 520,
    lockSkyYaw: !!variant.lockSkyYaw,
  };

  const ground = createAnimeGround(
    variant.groundColor ?? variant.mistColor,
    variant.fogColor ?? variant.mistColor,
    variant.groundTint ?? variant.fogColor,
    {
      radius: variant.groundRadius ?? 900,
      openHorizon: !!variant.openHorizon,
    },
  );
  group.add(ground);
  animation.ground = ground;

  group.add(createRoadTerrain(curve, trackDef, {
    berm: variant.bermColor ?? variant.mistColor,
    hill: variant.hillColor ?? variant.groundColor,
    mist: variant.mistColor,
    mistOpacity: variant.mistOpacity ?? 0,
    openHorizon: !!variant.openHorizon,
  }));

  if (!variant.skipClutter) {
    addGroundClutter(
      group,
      curve,
      trackDef.roadWidth / 2,
      rng,
      variant.clutterColor ?? variant.hillColor ?? variant.groundColor,
    );
  }

  if (variant.petals) {
    createDriftingPetals(curve, DENSITY.petals * (variant.petalScale ?? 1), variant.petals, animation);
  }

  populateAsync(group, curve, trackDef, rng, animation, variant);
  attachLifecycle(group, animation);
  return group;
}

async function populateAsync(group, curve, trackDef, rng, animation, variant) {
  const jobs = [];

  jobs.push((async () => {
    try {
      if (variant.horizonLock) {
        const sky = createGradientSkySphere(variant.skyGradient);
        if (addWhenReady(group, sky)) animation.skyShell = sky;
        const fuji = await createHorizonFuji(variant.backdrop, {
          width: variant.horizonWidth ?? 7800,
          height: variant.horizonHeight ?? 3800,
        });
        if (addWhenReady(group, fuji)) animation.horizonFuji = fuji;
      } else if (variant.skybox360) {
        const sky = await createFullSkybox(curve, variant.backdrop, {
          pitch: variant.skyPitch ?? -0.28,
        });
        if (addWhenReady(group, sky)) animation.skyShell = sky;
      } else if (variant.destinationMode) {
        const sky = createGradientSkySphere(variant.skyGradient);
        if (addWhenReady(group, sky)) animation.skyShell = sky;
        const dest = await createDestinationBackdrop(curve, variant.backdrop, variant.destinationOpts);
        addWhenReady(group, dest);
      } else {
        const sky = await createAnimeSkyShell(
          curve,
          variant.backdrop,
          variant.skyGradient,
          variant.groundColor ?? variant.mistColor,
        );
        if (addWhenReady(group, sky)) animation.skyShell = sky;
      }
    } catch (err) {
      console.warn('Mt Fuji anime sky failed to load.', err);
    }
  })());

  jobs.push(addFujiForest(group, curve, trackDef, rng, {
    mapleFile: variant.mapleFile ?? 'maple-trees.glb',
    pineFile: variant.pineFile ?? 'pine-tree-snow.glb',
    density: variant.forestDensity ?? 1,
    maxOutward: variant.forestOutward ?? 140,
  }));

  if (variant.stars) {
    for (let i = 0; i < DENSITY.stars; i++) {
      jobs.push((async () => {
        const star = await makeAsset('star.glb', 1.6 + rng() * 3, { grounded: false });
        const pose = trackPose(
          curve,
          rng(),
          rng() > 0.5 ? 1 : -1,
          30 + rng() * 90,
          35 + rng() * 100,
        );
        star.position.copy(pose.position);
        if (addWhenReady(group, star)) {
          animation.stars.push({
            object: star,
            baseScale: 1,
            phase: rng() * Math.PI * 2,
            speed: 0.5 + rng() * 1.5,
          });
        }
      })());
    }
  }

  try {
    await Promise.all(jobs);
  } catch (err) {
    console.warn('Some Mt Fuji anime props could not load.', err);
  }
}
