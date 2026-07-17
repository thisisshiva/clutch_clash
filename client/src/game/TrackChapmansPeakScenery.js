import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHAPMANS_PEAK_SUN } from './TrackEnvironment.js';
import { performanceTier } from './PerformanceConfig.js';
import { curveFrameAt, openCurveTRange } from './spline.js';

const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _normal = new THREE.Vector3();
const loader = new GLTFLoader();
const modelCache = new Map();
const ASSET_ROOT = '/models/scenery';

// Side convention (travel heads +z): +1 = left of travel = cliff face,
// -1 = right of travel = drop to the Atlantic. Matches the real drive.
const CLIFF_SIDE = 1;
const OCEAN_SIDE = -1;
const WATER_Y = -16;

/** Main cliff face cross-section, shared by the ribbon mesh and prop placement. */
const CLIFF_PARAMS = {
  extent: 48,
  innerPadding: 0.08,
  innerY: 0.01,
  outerY: 62,
  profilePower: 1.35,
  edgeNoise: 6,
  heightNoise: 7,
};

/** Height on the cliff profile at normalized depth `across` (0 = road edge, 1 = far). */
function cliffHeightAt(across, x = 0, z = 0) {
  const shaped = across ** CLIFF_PARAMS.profilePower;
  const jag = CLIFF_PARAMS.heightNoise * across * (
    Math.sin(x * 0.09 + z * 0.07) * 0.6
    + Math.sin(x * 0.021 - z * 0.033) * 0.4
  );
  return THREE.MathUtils.lerp(CLIFF_PARAMS.innerY, CLIFF_PARAMS.outerY, shaped) + jag;
}

const DENSITY = {
  low: { clouds: 8, birds: 7, rocks: 14, shrubs: 280, wallPosts: 900 },
  medium: { clouds: 14, birds: 13, rocks: 26, shrubs: 520, wallPosts: 1900 },
  high: { clouds: 22, birds: 20, rocks: 40, shrubs: 900, wallPosts: 3400 },
}[performanceTier];

function loadTemplate(file) {
  if (!modelCache.has(file)) {
    modelCache.set(file, loader.loadAsync(`${ASSET_ROOT}/${file}`).then(({ scene }) => scene));
  }
  return modelCache.get(file);
}

function cloneModel(template) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = performanceTier === 'high';
    child.receiveShadow = true;
  });
  return clone;
}

async function makeAsset(file, targetSize, { grounded = true } = {}) {
  const model = cloneModel(await loadTemplate(file));
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
  model.scale.setScalar(scale);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= grounded ? box.min.y : center.y;

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

function trackPose(curve, t, side, outward, height = 0) {
  const clamped = Math.max(0, Math.min(1, t));
  const point = curve.getPointAt(clamped);
  const tangent = curve.getTangentAt(clamped).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return {
    position: point.addScaledVector(normal, side * outward).setY(height),
    heading: Math.atan2(tangent.x, tangent.z),
  };
}

function addWhenReady(group, asset) {
  if (group.userData.disposed) {
    asset.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose());
    });
    return false;
  }
  group.add(asset);
  return true;
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

/** Sunlit sandstone cliff: warm orange strata with darker seams and shadow. */
function makeCliffTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#8a5a34');
  base.addColorStop(0.35, '#b0703c');
  base.addColorStop(0.7, '#c98a48');
  base.addColorStop(1, '#a86e3e');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Horizontal rock strata bands.
  for (let i = 0; i < 34; i++) {
    const y = Math.random() * size;
    const h = 2 + Math.random() * 9;
    ctx.fillStyle = Math.random() > 0.5
      ? `rgba(74, 46, 26, ${0.1 + Math.random() * 0.22})`
      : `rgba(235, 178, 110, ${0.08 + Math.random() * 0.18})`;
    ctx.fillRect(0, y, size, h);
  }

  // Vertical cracks removed — they mapped to visible ribs on the cliff ribbon.

  // Speckled grit.
  for (let i = 0; i < 3200; i++) {
    const bright = Math.random() > 0.5;
    ctx.fillStyle = bright
      ? `rgba(238, 190, 130, ${0.08 + Math.random() * 0.2})`
      : `rgba(66, 42, 24, ${0.08 + Math.random() * 0.2})`;
    const radius = 0.4 + Math.random() * 1.9;
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark rocky rubble at the road edge before the water drops away. */
function makeShoreRockTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#5a5048');
  grad.addColorStop(0.45, '#4a443c');
  grad.addColorStop(1, '#3a3834');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = Math.random() > 0.5
      ? `rgba(36, 32, 28, ${0.12 + Math.random() * 0.2})`
      : `rgba(120, 108, 92, ${0.08 + Math.random() * 0.16})`;
    const w = 2 + Math.random() * 12;
    const h = 2 + Math.random() * 8;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Atlantic at golden hour — deep navy offshore, sun-warmed teal near shore.
 */
function makeOceanTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, '#4aabb8');
  gradient.addColorStop(0.06, '#2e8aa4');
  gradient.addColorStop(0.16, '#1e6f94');
  gradient.addColorStop(0.32, '#155a82');
  gradient.addColorStop(0.55, '#0e4870');
  gradient.addColorStop(0.78, '#083858');
  gradient.addColorStop(1, '#052840');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Subtle chop variation so flat shading doesn't read as a single fill.
  for (let i = 0; i < 180; i++) {
    const x = size * 0.1 + Math.random() * size * 0.9;
    ctx.fillStyle = Math.random() > 0.5
      ? `rgba(20, 90, 130, ${0.04 + Math.random() * 0.08})`
      : `rgba(60, 150, 180, ${0.03 + Math.random() * 0.07})`;
    const w = 8 + Math.random() * 40;
    const h = 2 + Math.random() * 8;
    ctx.fillRect(x, Math.random() * size, w, h);
  }

  // Warm sunset glints on the open water.
  for (let i = 0; i < 520; i++) {
    const x = size * 0.14 + Math.random() * size * 0.86;
    ctx.fillStyle = `rgba(255, 200, 130, ${0.04 + Math.random() * 0.14})`;
    ctx.fillRect(x, Math.random() * size, 1 + Math.random() * 3, 0.4 + Math.random() * 1.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let glowTexture;

function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255, 250, 235, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 225, 160, 0.9)');
  gradient.addColorStop(0.38, 'rgba(255, 190, 110, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

// ---------------------------------------------------------------------------
// Terrain ribbons
// ---------------------------------------------------------------------------

/**
 * Ribbon following the curve on one side, with a cross-section height profile:
 * y interpolates innerY -> outerY using `profilePower` easing, plus jagged
 * noise so cliff tops and shorelines read as natural rock.
 */
function buildProfiledRibbon(curve, samples, halfW, side, extent, trackDef, {
  widthSegments = 6,
  innerPadding = 0.35,
  innerY = 0,
  outerY = 0,
  profilePower = 1,
  edgeNoise = 0,
  heightNoise = 0,
  uvMode = 'default',
} = {}) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const runout = closed ? null : openCurveTRange(trackLength, 160);
  const positions = [];
  const uvs = [];
  const indices = [];
  const baseInnerOff = halfW + innerPadding;
  const baseOuterOff = halfW + extent;
  const rowSize = widthSegments + 1;

  for (let i = 0; i <= samples; i++) {
    const t = closed
      ? i / samples
      : runout.start + (i / samples) * (runout.end - runout.start);
    const { point, tangent, normal } = curveFrameAt(curve, t, closed, trackLength);
    const wave = Math.sin(t * Math.PI * 41) * 0.6 + Math.sin(t * Math.PI * 97) * 0.4;

    for (let w = 0; w <= widthSegments; w++) {
      const across = w / widthSegments;
      const offset = THREE.MathUtils.lerp(
        baseInnerOff,
        baseOuterOff + wave * edgeNoise,
        across,
      ) * side;
      const x = point.x + normal.x * offset;
      const z = point.z + normal.z * offset;
      const shaped = across ** profilePower;
      const jag = heightNoise * across * (
        Math.sin(x * 0.09 + z * 0.07) * 0.6
        + Math.sin(x * 0.021 - z * 0.033) * 0.4
      );
      positions.push(x, THREE.MathUtils.lerp(innerY, outerY, shaped) + jag, z);
      if (uvMode === 'cliff') {
        uvs.push((t * 60) % 10, THREE.MathUtils.clamp(shaped + jag * 0.008, 0, 1));
      } else {
        uvs.push(across, (t * 80) % 12);
      }
    }
    if (i < samples) {
      for (let w = 0; w < widthSegments; w++) {
        const a = i * rowSize + w;
        if (side > 0) {
          indices.push(a, a + rowSize, a + 1, a + 1, a + rowSize, a + rowSize + 1);
        } else {
          indices.push(a, a + 1, a + rowSize, a + 1, a + rowSize + 1, a + rowSize);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Narrow rocky shoulder dropping from the road edge to the water plane.
 */
function buildShoreRibbon(curve, samples, halfW, trackDef, {
  shoreWidth = 5,
  shoreSegments = 3,
} = {}) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const runout = closed ? null : openCurveTRange(trackLength, 160);
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowSize = shoreSegments + 1;
  const innerOff = halfW + 0.06;

  for (let i = 0; i <= samples; i++) {
    const t = closed
      ? i / samples
      : runout.start + (i / samples) * (runout.end - runout.start);
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);

    for (let w = 0; w <= shoreSegments; w++) {
      const shoreT = w / shoreSegments;
      const offset = (innerOff + shoreWidth * shoreT) * OCEAN_SIDE;
      const y = THREE.MathUtils.lerp(0.01, WATER_Y, shoreT ** 0.42);
      positions.push(
        point.x + normal.x * offset,
        y,
        point.z + normal.z * offset,
      );
      uvs.push(shoreT, (t * 40) % 1);
    }

    if (i < samples) {
      for (let w = 0; w < shoreSegments; w++) {
        const a = i * rowSize + w;
        indices.push(a, a + 1, a + rowSize, a + 1, a + rowSize + 1, a + rowSize);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Flat open ocean beyond the rocky shore shelf. */
function buildWaterRibbon(curve, samples, halfW, trackDef, {
  shoreWidth = 5,
  oceanExtent = 5000,
  oceanSegments = performanceTier === 'low' ? 4 : 7,
} = {}) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const runout = closed ? null : openCurveTRange(trackLength, 160);
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowSize = oceanSegments + 1;
  const innerOff = halfW + 0.06 + shoreWidth;

  for (let i = 0; i <= samples; i++) {
    const t = closed
      ? i / samples
      : runout.start + (i / samples) * (runout.end - runout.start);
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);

    for (let w = 0; w <= oceanSegments; w++) {
      const oceanT = w / oceanSegments;
      const offset = (innerOff + oceanExtent * oceanT) * OCEAN_SIDE;
      positions.push(
        point.x + normal.x * offset,
        WATER_Y,
        point.z + normal.z * offset,
      );
      uvs.push(0.12 + oceanT * 0.88, (t * 48) % 1);
    }

    if (i < samples) {
      for (let w = 0; w < oceanSegments; w++) {
        const a = i * rowSize + w;
        indices.push(a, a + 1, a + rowSize, a + 1, a + rowSize + 1, a + rowSize);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** The iconic low sandstone wall guarding the ocean edge of the road. */
function addStoneWall(group, curve, halfW, rng) {
  const count = DENSITY.wallPosts;
  const blockGeo = new THREE.BoxGeometry(1.7, 0.6, 0.42);
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });
  const wall = new THREE.InstancedMesh(blockGeo, blockMat, count);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  const tones = [0xc7a97c, 0xb99a6d, 0xd2b489, 0xab8f66];

  for (let i = 0; i < count; i++) {
    const t = i / count;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    const outward = halfW + 0.95 + (rng() - 0.5) * 0.1;
    const blockH = 0.6 * (0.9 + rng() * 0.25);
    pos.set(
      _point.x + _normal.x * outward * OCEAN_SIDE,
      0.02 + blockH * 0.5 + (rng() - 0.5) * 0.02,
      _point.z + _normal.z * outward * OCEAN_SIDE,
    );
    euler.set(0, Math.atan2(_tangent.x, _tangent.z) + (rng() - 0.5) * 0.05, 0);
    quat.setFromEuler(euler);
    scale.set(0.92 + rng() * 0.16, blockH / 0.6, 1);
    m.compose(pos, quat, scale);
    wall.setMatrixAt(i, m);
    color.setHex(tones[i % tones.length]);
    color.multiplyScalar(0.92 + rng() * 0.16);
    wall.setColorAt(i, color);
  }
  wall.instanceMatrix.needsUpdate = true;
  if (wall.instanceColor) wall.instanceColor.needsUpdate = true;
  wall.castShadow = performanceTier !== 'low';
  wall.receiveShadow = true;
  wall.name = 'chapmans-stone-wall';
  group.add(wall);
}

/** Dark green fynbos scattered across the lower cliff face. */
function addShrubs(group, curve, halfW, rng, trackDef) {
  const count = DENSITY.shrubs;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const shrubGeo = new THREE.SphereGeometry(1, 7, 5);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, count);
  const tones = [0x4a6338, 0x5a7442, 0x3d5530, 0x6b7f4a, 0x8a7a4e];

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  let placed = 0;
  const placedPos = [];
  const minDistSq = 2.4 * 2.4;
  for (let attempt = 0; attempt < count * 18 && placed < count; attempt++) {
    const t = 0.03 + rng() * 0.94;
    const across = 0.22 + rng() ** 0.65 * 0.72;
    const outward = CLIFF_PARAMS.innerPadding + across * CLIFF_PARAMS.extent;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const y = cliffHeightAt(across, point.x, point.z);
    if (y < 0.8 || y > 22) continue;

    pos.set(
      point.x + normal.x * (halfW + outward) * CLIFF_SIDE,
      y + 0.12,
      point.z + normal.z * (halfW + outward) * CLIFF_SIDE,
    );
    let tooClose = false;
    for (const prev of placedPos) {
      const dx = pos.x - prev.x;
      const dz = pos.z - prev.z;
      if (dx * dx + dz * dz < minDistSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    placedPos.push(pos.clone());
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    const s = 0.35 + rng() * 0.85;
    scale.set(s * (0.8 + rng() * 0.5), s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.5));
    m.compose(pos, quat, scale);
    shrubs.setMatrixAt(placed, m);
    color.setHex(tones[placed % tones.length]);
    color.multiplyScalar(0.85 + rng() * 0.3);
    shrubs.setColorAt(placed, color);
    placed++;
  }
  shrubs.count = placed;
  shrubs.instanceMatrix.needsUpdate = true;
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
  shrubs.name = 'chapmans-fynbos';
  group.add(shrubs);
}

// ---------------------------------------------------------------------------
// Async GLB props
// ---------------------------------------------------------------------------

async function addClouds(group, curve, rng, animation, trackDef) {
  const jobs = Array.from({ length: DENSITY.clouds }, async (_, i) => {
    const cloud = await makeAsset('cloud.glb', 70 + rng() * 60, { grounded: false });
    cloud.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshBasicMaterial({
        color: 0xfff6ee,
        transparent: true,
        opacity: 0.82 + rng() * 0.12,
        depthWrite: false,
      });
    });
    const t = 0.08 + (i / DENSITY.clouds) * 0.84;
    const pose = trackPose(
      curve, t, OCEAN_SIDE, 280 + rng() * 520, 130 + rng() * 70,
    );
    cloud.position.copy(pose.position);
    cloud.rotation.y = rng() * Math.PI * 2;
    if (!addWhenReady(group, cloud)) return;
    animation.clouds.push({
      object: cloud,
      originX: cloud.position.x,
      originZ: cloud.position.z,
      phase: rng() * Math.PI * 2,
      amplitude: 30 + rng() * 50,
      speed: 0.015 + rng() * 0.02,
    });
  });
  await Promise.all(jobs);
}

async function addBirds(group, curve, rng, animation) {
  const jobs = Array.from({ length: DENSITY.birds }, async (_, i) => {
    const bird = await makeAsset('flying-gull.glb', 3 + rng() * 2.2, { grounded: false });
    const side = i % 3 === 0 ? CLIFF_SIDE : OCEAN_SIDE;
    // Cliff-side gulls ride thermals above the rock face; ocean gulls skim low.
    const pose = trackPose(
      curve,
      (i + 0.25) / DENSITY.birds,
      side,
      side === OCEAN_SIDE ? 20 + rng() * 110 : 14 + rng() * 40,
      side === OCEAN_SIDE ? 10 + rng() * 26 : 55 + rng() * 30,
    );
    bird.position.copy(pose.position);
    bird.rotation.y = pose.heading + rng() * 0.8 - 0.4;
    if (!addWhenReady(group, bird)) return;
    animation.birds.push({
      object: bird,
      center: bird.position.clone(),
      phase: rng() * Math.PI * 2,
      radius: 12 + rng() * 20,
      speed: 0.5 + rng() * 0.55,
    });
  });
  await Promise.all(jobs);
}

async function addHeadlands(group, curve, rng) {
  // Distant peaks at each end — bases sit in the water or on the coastal shelf.
  const placements = [
    { t: 0.995, side: OCEAN_SIDE, outward: 380, size: 620, baseY: WATER_Y - 1 },
    { t: 0.01, side: OCEAN_SIDE, outward: 450, size: 580, baseY: WATER_Y - 1 },
  ];
  const jobs = placements.map(async ({ t, side, outward, size, baseY }, i) => {
    const mountain = await makeAsset('mountain.glb', size);
    mountain.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const hazy = (material) => {
        const clone = material.clone();
        clone.color?.lerp(new THREE.Color(0x7a8a98), 0.35);
        if ('roughness' in clone) clone.roughness = 1;
        return clone;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(hazy)
        : hazy(child.material);
    });
    const pose = trackPose(curve, t, side, outward, baseY);
    mountain.position.copy(pose.position);
    mountain.rotation.y = rng() * Math.PI * 2 + i;
    addWhenReady(group, mountain);
  });
  await Promise.all(jobs);
}

async function addRocks(group, curve, halfW, rng, trackDef) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const jobs = [];
  for (let i = 0; i < DENSITY.rocks; i++) {
    jobs.push((async () => {
      const rock = await makeAsset(i % 3 === 0 ? 'rock-large.glb' : 'rock.glb', 1.2 + rng() * 2.8);
      const t = 0.04 + rng() * 0.92;
      const across = 0.04 + rng() ** 1.4 * 0.22;
      const outward = CLIFF_PARAMS.innerPadding + across * CLIFF_PARAMS.extent;
      const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
      const y = cliffHeightAt(across, point.x, point.z);
      if (y > 2.2) return;
      rock.position.set(
        point.x + normal.x * (halfW + outward) * CLIFF_SIDE,
        y - 0.05,
        point.z + normal.z * (halfW + outward) * CLIFF_SIDE,
      );
      rock.rotation.y = rng() * Math.PI * 2;
      addWhenReady(group, rock);
    })());
  }
  await Promise.all(jobs);
}

function addHorizonSun(group, curve, trackDef) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const { point } = curveFrameAt(curve, 0.42, closed, trackLength);
  const sunDir = new THREE.Vector3(...CHAPMANS_PEAK_SUN).normalize();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: 0xffe8b8,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sun.position.copy(point).addScaledVector(sunDir, 460);
  sun.scale.set(110, 110, 1);
  group.add(sun);
}

async function populateScenery(group, curve, halfW, rng, animation, trackDef) {
  try {
    await Promise.all([
      addClouds(group, curve, rng, animation, trackDef),
      addBirds(group, curve, rng, animation),
      addHeadlands(group, curve, rng),
      addRocks(group, curve, halfW, rng, trackDef),
    ]);
    addHorizonSun(group, curve, trackDef);
  } catch (error) {
    console.warn("Some Chapman's Peak scenery assets could not be loaded.", error);
  }
}

/**
 * Chapman's Peak Drive: sunlit sandstone cliffs towering over the left of the
 * road, a low stone wall on the right, and a rocky drop into an animated
 * golden-hour Atlantic stretching to the horizon.
 */
export function buildChapmansPeakScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'chapmans-peak-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(320, Math.min(900, Math.round((trackDef.length || 8000) / 12)));
  const animation = {
    elapsed: 0,
    clouds: [],
    birds: [],
    water: null,
    waterTexture: null,
  };

  const cliffMat = new THREE.MeshStandardMaterial({
    map: makeCliffTexture(),
    color: 0xffffff,
    roughness: 0.98,
  });
  const waterTex = makeOceanTexture();
  animation.waterTexture = waterTex;
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0.14,
  });

  // Main cliff face rising steeply from the road edge.
  const cliffGeo = buildProfiledRibbon(curve, samples, halfW, CLIFF_SIDE, CLIFF_PARAMS.extent, trackDef, {
    widthSegments: 7,
    innerPadding: CLIFF_PARAMS.innerPadding,
    innerY: CLIFF_PARAMS.innerY,
    outerY: CLIFF_PARAMS.outerY,
    profilePower: CLIFF_PARAMS.profilePower,
    edgeNoise: CLIFF_PARAMS.edgeNoise,
    heightNoise: CLIFF_PARAMS.heightNoise,
    uvMode: 'cliff',
  });
  const cliff = new THREE.Mesh(cliffGeo, cliffMat);
  cliff.receiveShadow = true;
  cliff.castShadow = performanceTier !== 'low';
  group.add(cliff);

  const shoreMat = new THREE.MeshStandardMaterial({
    map: makeShoreRockTexture(),
    color: 0xffffff,
    roughness: 1,
  });
  const shore = new THREE.Mesh(buildShoreRibbon(curve, samples, halfW, trackDef), shoreMat);
  shore.receiveShadow = true;
  group.add(shore);

  const waterGeo = buildWaterRibbon(curve, samples, halfW, trackDef);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  group.add(water);

  const baseHeights = waterGeo.attributes.position.array.slice();
  animation.water = { mesh: water, baseHeights };

  addStoneWall(group, curve, halfW, rng);
  addShrubs(group, curve, halfW, rng, trackDef);
  populateScenery(group, curve, halfW, rng, animation, trackDef);

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;

    for (const cloud of animation.clouds) {
      const drift = time * cloud.speed + cloud.phase;
      cloud.object.position.x = cloud.originX + Math.sin(drift) * cloud.amplitude;
      cloud.object.position.z = cloud.originZ + Math.sin(drift * 0.47) * cloud.amplitude * 0.2;
    }
    for (const bird of animation.birds) {
      const angle = bird.phase + time * bird.speed;
      bird.object.position.set(
        bird.center.x + Math.cos(angle) * bird.radius,
        bird.center.y + Math.sin(angle * 2.1) * 2.6,
        bird.center.z + Math.sin(angle) * bird.radius,
      );
      bird.object.rotation.y = -angle + Math.PI / 2;
      bird.object.rotation.x = Math.sin(time * 8.5 + bird.phase) * 0.16;
      bird.object.rotation.z = Math.sin(angle * 2.4) * 0.28;
      const flap = Math.sin(time * 10.5 + bird.phase);
      bird.object.scale.set(1 - Math.abs(flap) * 0.04, 1 + flap * 0.12, 1);
    }
    if (animation.waterTexture) {
      animation.waterTexture.offset.y = time * 0.01;
    }
    if (animation.water) {
      const { mesh, baseHeights } = animation.water;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const baseY = baseHeights[i * 3 + 1];
        if (baseY > WATER_Y + 0.5) continue;
        positions.setY(
          i,
          baseY
            + Math.sin(x * 0.03 + time * 0.7) * 0.35
            + Math.sin(z * 0.045 - time * 1.05) * 0.25
            + Math.sin((x + z) * 0.011 + time * 0.45) * 0.2,
        );
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  };
  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
    modelCache.clear();
  };

  return group;
}
