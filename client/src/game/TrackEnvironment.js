import * as THREE from 'three';

const GRASS = 0x5daa5d;

const DAY = {
  background: 0x8ecbff,
  fogColor: 0xa6d8ff,
  fogNear: 2200,
  fogFar: 20000,
  exposure: 1.38,
  hemisphere: { sky: 0xbfe3ff, ground: 0x6aa05d, intensity: 1.12 },
  sun: { color: 0xfff8ee, intensity: 2.4, position: [120, 180, 80] },
  fill: { color: 0xd8eeff, intensity: 0.85, position: [-90, 70, -110] },
  moon: { color: 0xc8d8ff, intensity: 0, position: [-90, 140, 70] },
  ground: { color: GRASS, roughness: 0.95 },
  clouds: true,
};

const RAIN_EVENING = {
  background: 0x2d3a52,
  fogColor: 0x3a4558,
  fogNear: 160,
  fogFar: 680,
  exposure: 1.25,
  hemisphere: { sky: 0x6a78a0, ground: 0x3a4a3a, intensity: 0.9 },
  sun: { color: 0xff7744, intensity: 0.35, position: [160, 30, -80] },
  fill: { color: 0x8899bb, intensity: 0.55, position: [-100, 45, 90] },
  moon: { color: 0xd8e8ff, intensity: 1.6, position: [-80, 150, 90] },
  ground: { color: 0x3d5a3d, roughness: 0.98 },
  rain: true,
};

const RANN_HEAVEN = {
  background: 0xa9cde8,
  fogColor: 0xdcebf2,
  fogNear: 480,
  fogFar: 11000,
  exposure: 1.26,
  hemisphere: { sky: 0xeef6ff, ground: 0xdfe6e3, intensity: 1.02 },
  sun: { color: 0xfff6e6, intensity: 2.55, position: [140, 230, -120] },
  fill: { color: 0xdcecfa, intensity: 0.5, position: [-80, 70, 100] },
  moon: { color: 0xc8d8ff, intensity: 0, position: [-90, 140, 70] },
  ground: { color: 0xe2e8e6, roughness: 0.98 },
  splitTerrain: true,
  clouds: false,
};

const SNOW_HEAVEN = {
  background: 0x0c1a2e,
  fogColor: 0x1a3048,
  fogNear: 280,
  fogFar: 9000,
  exposure: 1.05,
  hemisphere: { sky: 0x6a90c0, ground: 0x2a3a48, intensity: 0.55 },
  sun: { color: 0xa8c4e8, intensity: 0.15, position: [80, 40, -60] },
  fill: { color: 0x6a88b0, intensity: 0.35, position: [-70, 50, 90] },
  moon: { color: 0xe8f0ff, intensity: 2.4, position: [-90, 180, 60] },
  ground: { color: 0xd8e6f0, roughness: 0.98 },
  splitTerrain: true,
  clouds: false,
  snow: true,
};

/** Canadian dawn — indigo sky warming to amber, cool fog, soft gold sun. */
const NORTH_PATH_DAWN = {
  background: 0x7aa8c8,
  fogColor: 0xb8cfe0,
  fogNear: 420,
  fogFar: 10000,
  exposure: 1.18,
  hemisphere: { sky: 0xd4e8f5, ground: 0x6a7a68, intensity: 0.92 },
  sun: { color: 0xffd9a0, intensity: 2.15, position: [100, 55, -160] },
  fill: { color: 0xc8daf0, intensity: 0.55, position: [-90, 60, 80] },
  moon: { color: 0xc8d8ff, intensity: 0, position: [-90, 140, 70] },
  ground: { color: 0x8a9a7e, roughness: 0.97 },
  splitTerrain: true,
  clouds: false,
};

/** Cape Town golden hour — low warm sun over the ocean, bluer haze so the sea reads. */
export const CHAPMANS_PEAK_SUN = [180, 52, 90];

const CHAPMANS_PEAK = {
  background: 0xd8b890,
  fogColor: 0xc8b4a4,
  fogNear: 1800,
  fogFar: 10000,
  exposure: 1.28,
  hemisphere: { sky: 0xf2dcc4, ground: 0x7a6450, intensity: 0.88 },
  sun: { color: 0xffc98a, intensity: 2.65, position: CHAPMANS_PEAK_SUN },
  fill: { color: 0xb8c8dc, intensity: 0.28, position: [140, 70, -90] },
  moon: { color: 0xc8d8ff, intensity: 0, position: [-90, 140, 70] },
  ground: { color: 0x8a7a5e, roughness: 0.97 },
  splitTerrain: true,
  clouds: true,
};

/** Cosmic void — deep indigo, soft violet rim (not hot neon pink). */
const BLACK_HOLE = {
  background: 0x050810,
  fogColor: 0x0a0c18,
  fogNear: 500,
  fogFar: 5600,
  exposure: 0.98,
  hemisphere: { sky: 0x1c1830, ground: 0x080610, intensity: 0.42 },
  sun: { color: 0xb8a0d8, intensity: 1.15, position: [40, 30, 200] },
  fill: { color: 0x4a5a88, intensity: 0.35, position: [-120, 50, -80] },
  moon: { color: 0x6a7aaa, intensity: 0.45, position: [-60, 120, 40] },
  ground: { color: 0x050508, roughness: 1 },
  splitTerrain: true,
  clouds: false,
};

/** Infinite desert highway — bleached sky, soft heat haze, endless flat. */
const ENDLESS_DESERT = {
  background: 0xe8d4b0,
  fogColor: 0xe2d0b4,
  fogNear: 900,
  fogFar: 14000,
  exposure: 1.32,
  hemisphere: { sky: 0xf5e6c8, ground: 0xc4a878, intensity: 1.05 },
  sun: { color: 0xffe8b0, intensity: 2.7, position: [60, 28, 180] },
  fill: { color: 0xd8c8a8, intensity: 0.4, position: [-100, 40, -60] },
  moon: { color: 0xc8d8ff, intensity: 0, position: [-90, 140, 70] },
  ground: { color: 0xc9ae7a, roughness: 0.98 },
  splitTerrain: true,
  clouds: true,
};

const PRESETS = {
  day: DAY,
  'rain-evening': RAIN_EVENING,
  'rann-heaven': RANN_HEAVEN,
  'snow-heaven': SNOW_HEAVEN,
  'north-path-dawn': NORTH_PATH_DAWN,
  'chapmans-peak': CHAPMANS_PEAK,
  'black-hole': BLACK_HOLE,
  'endless-desert': ENDLESS_DESERT,
};

function resizeGround(env, trackLength = 0) {
  const size = Math.max(12000, Math.ceil((trackLength + 4000) / 1000) * 1000);
  env.ground.geometry.dispose();
  env.ground.geometry = new THREE.PlaneGeometry(size, size);
}

function applyPreset(engine, preset, trackLength = 0) {
  const { scene, renderer } = engine;
  const env = engine._env;

  scene.background.setHex(preset.background);
  scene.fog.color.setHex(preset.fogColor);
  scene.fog.near = preset.fogNear;
  scene.fog.far = preset.fogFar;
  renderer.toneMappingExposure = preset.exposure;

  env.ambient.color.setHex(preset.hemisphere.sky);
  env.ambient.groundColor.setHex(preset.hemisphere.ground);
  env.ambient.intensity = preset.hemisphere.intensity;

  env.sun.color.setHex(preset.sun.color);
  env.sun.intensity = preset.sun.intensity;
  env.sun.position.set(...preset.sun.position);

  env.fill.color.setHex(preset.fill.color);
  env.fill.intensity = preset.fill.intensity;
  env.fill.position.set(...preset.fill.position);

  if (env.moon && preset.moon) {
    env.moon.color.setHex(preset.moon.color);
    env.moon.intensity = preset.moon.intensity;
    env.moon.position.set(...preset.moon.position);
  }

  env.ground.material.color.setHex(preset.ground.color);
  env.ground.material.roughness = preset.ground.roughness;
  env.ground.visible = !preset.splitTerrain;

  if (trackLength > 0) resizeGround(env, trackLength);

  const camFar = Math.min(22000, Math.max(7000, trackLength + 5000));
  engine.camera.far = camFar;
  engine.camera.near = 0.5;
  engine.camera.updateProjectionMatrix();

  const shadowHalf = Math.min(3200, Math.max(900, trackLength * 0.22));
  env.sun.shadow.camera.left = -shadowHalf;
  env.sun.shadow.camera.right = shadowHalf;
  env.sun.shadow.camera.top = shadowHalf;
  env.sun.shadow.camera.bottom = -shadowHalf;
  env.sun.shadow.camera.far = Math.min(9000, camFar * 0.72);
  env.sun.shadow.camera.updateProjectionMatrix();
}

function createRain(scene) {
  const count = 4500;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const spread = 360;
  const height = 95;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
    speeds[i] = 28 + Math.random() * 22;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const rain = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xaac8ee,
      size: 0.35,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  rain.frustumCulled = false;
  rain.name = 'track-rain';
  scene.add(rain);

  return { mesh: rain, speeds, spread, height };
}

function createSnow(scene) {
  const count = 3200;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const spread = 280;
  const height = 70;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
    speeds[i] = 4 + Math.random() * 7;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const snow = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe8f4ff,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  snow.frustumCulled = false;
  snow.name = 'track-snow';
  scene.add(snow);

  return { mesh: snow, speeds, spread, height, drift: true };
}

function createCloudLayer(scene, trackLength) {
  const group = new THREE.Group();
  group.name = 'track-clouds';
  const cloudCount = Math.max(22, Math.min(56, Math.round((trackLength || 6000) / 320)));
  const range = Math.max(2800, Math.min(12000, (trackLength || 6000) * 0.65));

  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(30 + Math.random() * 42, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2 + Math.random() * 0.16,
        depthWrite: false,
      }),
    );
    cloud.position.set(
      (Math.random() - 0.5) * range * 2,
      220 + Math.random() * 180,
      (Math.random() - 0.5) * range * 2,
    );
    cloud.scale.set(1.8 + Math.random() * 2.4, 0.55 + Math.random() * 0.45, 1.6 + Math.random() * 2.3);
    group.add(cloud);
  }

  scene.add(group);
  return group;
}

function updateRain(rain, camera, dt) {
  rain.mesh.position.copy(camera.position);
  const pos = rain.mesh.geometry.attributes.position;
  const arr = pos.array;

  for (let i = 0; i < rain.speeds.length; i++) {
    arr[i * 3 + 1] -= rain.speeds[i] * dt;
    if (rain.drift) {
      arr[i * 3] += Math.sin(arr[i * 3 + 1] * 0.08 + i) * dt * 1.8;
    }
    if (arr[i * 3 + 1] < 0) {
      arr[i * 3] = (Math.random() - 0.5) * rain.spread * 2;
      arr[i * 3 + 1] = rain.height + Math.random() * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * rain.spread * 2;
    }
  }
  pos.needsUpdate = true;
}

/**
 * Apply sky, fog, lighting and optional rain for a track atmosphere preset.
 * @returns {() => void} cleanup
 */
export function applyTrackEnvironment(engine, atmosphere = 'day', trackLength = 0) {
  engine.clearTrackEnvironment?.();

  const preset = PRESETS[atmosphere] ?? PRESETS.day;
  applyPreset(engine, preset, trackLength);

  let rain = null;
  let clouds = null;
  let offUpdate = null;
  if (preset.rain) {
    rain = createRain(engine.scene);
    offUpdate = engine.onUpdate((dt) => updateRain(rain, engine.camera, dt));
  }
  if (preset.snow) {
    rain = createSnow(engine.scene);
    offUpdate = engine.onUpdate((dt) => updateRain(rain, engine.camera, dt));
  }
  if (preset.clouds) {
    clouds = createCloudLayer(engine.scene, trackLength);
    const offClouds = engine.onUpdate((dt) => {
      for (const cloud of clouds.children) {
        cloud.position.x += dt * 2.2;
        if (cloud.position.x > 12000) cloud.position.x = -12000;
      }
    });
    offUpdate = offUpdate
      ? () => { offUpdate(); offClouds(); }
      : offClouds;
  }

  engine.clearTrackEnvironment = () => {
    offUpdate?.();
    if (rain) {
      rain.mesh.geometry.dispose();
      rain.mesh.material.dispose();
      engine.scene.remove(rain.mesh);
    }
    if (clouds) {
      for (const c of clouds.children) {
        c.geometry?.dispose?.();
        c.material?.dispose?.();
      }
      engine.scene.remove(clouds);
    }
    applyPreset(engine, PRESETS.day, 0);
    engine.clearTrackEnvironment = null;
  };

  return engine.clearTrackEnvironment;
}
