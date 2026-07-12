import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { performanceTier } from './PerformanceConfig.js';

const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _normal = new THREE.Vector3();
const loader = new GLTFLoader();
const modelCache = new Map();
const ASSET_ROOT = '/models/scenery';

const DENSITY = {
  low: { clouds: 10, birds: 8, lights: 12, poles: 5, windmills: 1 },
  medium: { clouds: 18, birds: 15, lights: 28, poles: 9, windmills: 2 },
  high: { clouds: 28, birds: 24, lights: 48, poles: 16, windmills: 3 },
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
  const point = curve.getPointAt((t % 1 + 1) % 1);
  const tangent = curve.getTangentAt((t % 1 + 1) % 1).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return {
    position: point.addScaledVector(normal, side * outward).setY(height),
    heading: Math.atan2(tangent.x, tangent.z),
  };
}

/** Golden gravel embankment texture (the causeway berm in the reference). */
function makeSandTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c49a5a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4200; i++) {
    const dark = Math.random() > 0.5;
    ctx.fillStyle = dark
      ? `rgba(122, 92, 52, ${0.1 + Math.random() * 0.22})`
      : `rgba(235, 202, 138, ${0.12 + Math.random() * 0.25})`;
    const radius = 0.4 + Math.random() * 2;
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius);
  }

  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(105, 78, 44, ${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 30, size * 0.7, y + (Math.random() - 0.5) * 30, size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Ribbon UVs run 0..1 across and 0..80 along, so keep u untiled to avoid
  // squashing the grain into streaks; v tiles every ~5m of road.
  tex.repeat.set(1, 25);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** White salt crust texture for the shoreline strips. */
function makeSaltTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f4ee';
  ctx.fillRect(0, 0, size, size);

  const cells = 18;
  const cell = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const jitter = (Math.random() - 0.5) * cell * 0.35;
      ctx.strokeStyle = `rgba(163, 160, 152, ${0.22 + Math.random() * 0.26})`;
      ctx.lineWidth = 0.8 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x * cell + jitter, y * cell + jitter);
      ctx.lineTo((x + 1) * cell + jitter, y * cell - jitter * 0.4);
      ctx.lineTo((x + 1) * cell - jitter, (y + 1) * cell + jitter);
      ctx.lineTo(x * cell - jitter, (y + 1) * cell - jitter);
      ctx.closePath();
      ctx.stroke();
      if (Math.random() > 0.35) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.14 + Math.random() * 0.28})`;
        ctx.fill();
      }
    }
  }

  for (let i = 0; i < 5200; i++) {
    const bright = Math.random() > 0.18;
    ctx.fillStyle = bright
      ? `rgba(255, 255, 253, ${0.3 + Math.random() * 0.45})`
      : `rgba(184, 181, 172, ${0.08 + Math.random() * 0.12})`;
    const radius = 0.3 + Math.random() * 1.4;
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 25);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Water gradient across the ribbon width: milky white at the shore (u=0)
 * fading into open water (u=1), with foam streaks near the shore.
 * `milky` renders the white-sea variant used on the left side.
 */
function makeWaterTexture(milky = false) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  if (milky) {
    gradient.addColorStop(0, '#f6fbf9');
    gradient.addColorStop(0.15, '#eaf4f1');
    gradient.addColorStop(0.4, '#d3e8e6');
    gradient.addColorStop(0.75, '#b5d8da');
    gradient.addColorStop(1, '#a2ccd2');
  } else {
    gradient.addColorStop(0, '#e9f4f2');
    gradient.addColorStop(0.12, '#cfe8e8');
    gradient.addColorStop(0.35, '#a3d0da');
    gradient.addColorStop(0.7, '#7fb9cd');
    gradient.addColorStop(1, '#6cabc4');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Foam streaks running along the shore, denser near the edge.
  const streaks = milky ? 130 : 70;
  for (let i = 0; i < streaks; i++) {
    const x = Math.random() ** (milky ? 1.4 : 2) * size * (milky ? 0.95 : 0.7);
    ctx.strokeStyle = `rgba(255, 255, 252, ${0.06 + (1 - x / size) * 0.22 * Math.random()})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    for (let y = -10; y <= size + 10; y += 14) {
      const waveX = x + Math.sin(y * 0.05 + i) * (3 + Math.random() * 3);
      if (y === -10) ctx.moveTo(waveX, y);
      else ctx.lineTo(waveX, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildSideRibbon(curve, samples, halfW, side, extent, {
  widthSegments = 1,
  height = 0,
  innerPadding = 0.35,
  undulation = 0,
  innerNoise = 0,
  outerNoise = 0,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const baseInnerOff = halfW + innerPadding;
  const baseOuterOff = halfW + extent;
  const rowSize = widthSegments + 1;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    const edgeWave = Math.sin(t * Math.PI * 37) * 0.65 + Math.sin(t * Math.PI * 103) * 0.35;
    const innerOff = baseInnerOff + edgeWave * innerNoise;
    const outerOff = baseOuterOff + edgeWave * outerNoise;

    for (let w = 0; w <= widthSegments; w++) {
      const across = w / widthSegments;
      const offset = THREE.MathUtils.lerp(innerOff, outerOff, across) * side;
      const x = _point.x + _normal.x * offset;
      const z = _point.z + _normal.z * offset;
      const y = height + undulation * (
        Math.sin(x * 0.021 + z * 0.013)
        + Math.sin(x * 0.047 - z * 0.019) * 0.45
      );
      positions.push(x, y, z);
      uvs.push(across, t * 80);
    }
    if (i < samples) {
      for (let w = 0; w < widthSegments; w++) {
        const a = i * rowSize + w;
        // Winding depends on which side of the road the ribbon extends to,
        // so flip it for +side to keep faces pointing up.
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

let glowTexture;

function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 232, 170, 0.9)');
  gradient.addColorStop(0.38, 'rgba(255, 205, 120, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 190, 100, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

function addLampGlow(post, withLight) {
  const footing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.92 }),
  );
  footing.position.y = 0.15;
  footing.castShadow = performanceTier === 'high';
  post.add(footing);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: 0xfff0c8,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  glow.position.set(0, 6.25, 0);
  glow.scale.set(1.1, 1.1, 1);
  post.add(glow);

  if (withLight) {
    const light = new THREE.PointLight(0xffe0a0, 0.6, 30, 2);
    light.position.set(0, 6.1, 0);
    post.add(light);
  }
}

async function addClouds(group, curve, rng, animation) {
  const jobs = Array.from({ length: DENSITY.clouds }, async (_, i) => {
    const broad = i % 3 !== 0;
    const cloud = await makeAsset(broad ? 'cloud-bank.glb' : 'cloud.glb', 55 + rng() * 90, {
      grounded: false,
    });
    // Shades of white: mostly bright, some slightly grey/blue undersides.
    const whiteness = 0.55 + rng() * 0.35;
    const shade = 0.93 + rng() * 0.07;
    cloud.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const whiten = (material) => {
        const clone = material.clone();
        if (clone.color) {
          clone.color.lerp(new THREE.Color(0xffffff), whiteness);
          clone.color.multiplyScalar(shade);
        }
        if ('roughness' in clone) clone.roughness = 0.96;
        return clone;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(whiten)
        : whiten(child.material);
    });
    const pose = trackPose(curve, (i + 0.4) / DENSITY.clouds, i % 2 ? 1 : -1, 40 + rng() * 260, 62 + rng() * 75);
    cloud.position.copy(pose.position);
    cloud.rotation.y = rng() * Math.PI * 2;
    if (!addWhenReady(group, cloud)) return;
    animation.clouds.push({
      object: cloud,
      originX: cloud.position.x,
      originZ: cloud.position.z,
      phase: rng() * Math.PI * 2,
      amplitude: 55 + rng() * 85,
      speed: 0.025 + rng() * 0.035,
    });
  });
  await Promise.all(jobs);
}

async function addBirds(group, curve, rng, animation) {
  const files = ['flying-gull.glb', 'sparrow.glb', 'parrot.glb'];
  const jobs = Array.from({ length: DENSITY.birds }, async (_, i) => {
    const bird = await makeAsset(files[i % files.length], 3.2 + rng() * 2.4, { grounded: false });
    const side = i % 2 === 0 ? -1 : 1;
    const pose = trackPose(curve, (i + 0.25) / DENSITY.birds, side, 18 + rng() * 95, 18 + rng() * 30);
    bird.position.copy(pose.position);
    bird.rotation.y = pose.heading + rng() * 0.8 - 0.4;
    if (!addWhenReady(group, bird)) return;
    animation.birds.push({
      object: bird,
      center: bird.position.clone(),
      phase: rng() * Math.PI * 2,
      radius: 14 + rng() * 18,
      speed: 0.6 + rng() * 0.55,
    });
  });
  await Promise.all(jobs);
}

async function addRoadsideProps(group, curve, halfW, rng, animation) {
  const jobs = [];
  for (let i = 0; i < DENSITY.lights; i++) {
    jobs.push((async () => {
      const post = await makeAsset('light-post.glb', 7.2);
      const side = i % 2 ? 1 : -1;
      const pose = trackPose(curve, (i + 0.15) / DENSITY.lights, side, halfW + 3.2, -0.06);
      post.position.copy(pose.position);
      post.rotation.y = pose.heading + (side > 0 ? Math.PI : 0);
      addLampGlow(post, performanceTier !== 'low' && i % 7 === 0);
      addWhenReady(group, post);
    })());
  }

  for (let i = 0; i < DENSITY.poles; i++) {
    jobs.push((async () => {
      const pole = await makeAsset('telephone-pole.glb', 10);
      const pose = trackPose(curve, (i + 0.45) / DENSITY.poles, -1, halfW + 5.5, -0.06);
      pole.position.copy(pose.position);
      pole.rotation.y = pose.heading;
      addWhenReady(group, pole);
    })());
  }

  for (let i = 0; i < Math.ceil(DENSITY.poles * 0.8); i++) {
    jobs.push((async () => {
      const rock = await makeAsset(i % 3 === 0 ? 'rock-large.glb' : 'rock.glb', 1.2 + rng() * 2.4);
      const side = i % 2 ? 1 : -1;
      const pose = trackPose(curve, 0.08 + rng() * 0.84, side, halfW + 4 + rng() * 7, -0.05);
      rock.position.copy(pose.position);
      rock.rotation.y = rng() * Math.PI * 2;
      addWhenReady(group, rock);
    })());
  }

  jobs.push((async () => {
    const sign = await makeAsset('wooden-sign.glb', 4.8);
    const pose = trackPose(curve, 0.025, -1, halfW + 5, -0.05);
    sign.position.copy(pose.position);
    sign.rotation.y = pose.heading + Math.PI / 2;
    addWhenReady(group, sign);
  })());

  // Windmills stand on small sandy islets out in the shallow water.
  const islandGeo = new THREE.CircleGeometry(14, 24);
  const islandMat = new THREE.MeshStandardMaterial({ color: 0xc9a05e, roughness: 1 });
  for (let i = 0; i < DENSITY.windmills; i++) {
    jobs.push((async () => {
      const windmill = await makeAsset('windmill.glb', 18 + rng() * 7);
      const side = i % 2 ? 1 : -1;
      const pose = trackPose(curve, 0.18 + (i + 0.5) / DENSITY.windmills * 0.66, side, halfW + 55 + rng() * 60, -0.04);
      windmill.position.copy(pose.position);
      windmill.rotation.y = pose.heading + Math.PI / 2;
      if (!addWhenReady(group, windmill)) return;

      const island = new THREE.Mesh(islandGeo, islandMat);
      island.rotation.x = -Math.PI / 2;
      island.position.set(pose.position.x, 0.02, pose.position.z);
      group.add(island);

      const model = windmill.children[0];
      const rotor = new THREE.Group();
      model.add(rotor);
      ['Cylinder003', 'Cylinder004', 'Cylinder005'].forEach((name) => {
        const blade = model.getObjectByName(name);
        if (blade) rotor.attach(blade);
      });
      animation.rotors.push(rotor);
    })());
  }

  jobs.push((async () => {
    const sun = await makeAsset('sun.glb', 46, { grounded: false });
    sun.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const lightMaterial = (material) => {
        const clone = material.clone();
        clone.color?.setHex(0xffedb8);
        if (clone.emissive) {
          clone.emissive.setHex(0xffce70);
          clone.emissiveIntensity = 2.2;
        }
        clone.toneMapped = false;
        return clone;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(lightMaterial)
        : lightMaterial(child.material);
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(150, 150, 1);
    sun.add(halo);
    const pose = trackPose(curve, 0.32, -1, 700, 130);
    sun.position.copy(pose.position);
    if (!addWhenReady(group, sun)) return;
    animation.sun = sun;
  })());

  await Promise.all(jobs);
}

/**
 * Scatter debris along the road borders so the causeway edge reads as a
 * used, crumbling road instead of clean flat bands: pebbles and grit on the
 * embankment plus dark wear patches bleeding off the asphalt edge.
 */
function addShoulderClutter(group, curve, halfW, rng) {
  const pebbleCount = { low: 400, medium: 900, high: 1600 }[performanceTier];
  const patchCount = { low: 90, medium: 180, high: 300 }[performanceTier];
  const pebbleColors = [0x9c8a6b, 0xb7a884, 0x8f8376, 0xcfc5b0, 0x7a6f5d];

  const pebbleGeo = new THREE.IcosahedronGeometry(0.22, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  const patchGeo = new THREE.PlaneGeometry(1, 1);
  const patchMat = new THREE.MeshBasicMaterial({
    color: 0x4d4a43,
    transparent: true,
    opacity: 0.38,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, patchCount);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();

  for (let i = 0; i < pebbleCount; i++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    // Denser close to the road, thinning out across the berm.
    const outward = halfW + 0.5 + rng() ** 1.6 * 5.5;
    pos.set(
      _point.x + _normal.x * outward * side,
      0.02,
      _point.z + _normal.z * outward * side,
    );
    euler.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
    quat.setFromEuler(euler);
    const s = 0.25 + rng() * 1.1;
    scale.set(s, s * 0.45, s * (0.7 + rng() * 0.6));
    m.compose(pos, quat, scale);
    pebbles.setMatrixAt(i, m);
    color.setHex(pebbleColors[i % pebbleColors.length]);
    color.multiplyScalar(0.9 + rng() * 0.2);
    pebbles.setColorAt(i, color);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.castShadow = performanceTier === 'high';
  group.add(pebbles);

  for (let i = 0; i < patchCount; i++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    // Straddle the asphalt edge so the border looks chewed up.
    const outward = halfW - 0.4 + rng() * 1.6;
    pos.set(
      _point.x + _normal.x * outward * side,
      0.018,
      _point.z + _normal.z * outward * side,
    );
    euler.set(-Math.PI / 2, 0, -Math.atan2(_tangent.x, _tangent.z) + (rng() - 0.5) * 0.3);
    quat.setFromEuler(euler);
    scale.set(0.6 + rng() * 1.6, 1.6 + rng() * 5.5, 1);
    m.compose(pos, quat, scale);
    patches.setMatrixAt(i, m);
  }
  patches.instanceMatrix.needsUpdate = true;
  group.add(patches);
}

/**
 * Rolling foam ridges on the white sea (left side): long thin white strips
 * that drift toward the shore, fading in far out and dissolving at the edge.
 */
function addFoamWaves(group, curve, halfW, rng, animation) {
  const count = { low: 14, medium: 24, high: 36 }[performanceTier];
  const foamGeo = new THREE.PlaneGeometry(1, 1);
  const _foamPoint = new THREE.Vector3();
  const _foamTangent = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const strip = new THREE.Mesh(foamGeo, material);
    strip.rotation.x = -Math.PI / 2;
    strip.renderOrder = 2;

    const t = (i + rng()) / count;
    curve.getPointAt(t, _foamPoint);
    curve.getTangentAt(t, _foamTangent).normalize();

    group.add(strip);
    animation.foam.push({
      mesh: strip,
      baseX: _foamPoint.x,
      baseZ: _foamPoint.z,
      normalX: _foamTangent.z,
      normalZ: -_foamTangent.x,
      heading: Math.atan2(_foamTangent.x, _foamTangent.z),
      length: 70 + rng() * 90,
      width: 1.4 + rng() * 1.6,
      minOut: halfW + 11,
      maxOut: halfW + 55 + rng() * 60,
      phase: rng(),
      speed: 0.05 + rng() * 0.06,
    });
  }
}

async function populateScenery(group, curve, halfW, rng, animation) {
  try {
    await Promise.all([
      addClouds(group, curve, rng, animation),
      addBirds(group, curve, rng, animation),
      addRoadsideProps(group, curve, halfW, rng, animation),
    ]);
  } catch (error) {
    console.warn('Some Road to Heaven scenery assets could not be loaded.', error);
  }
}

/**
 * Kutch causeway scenery matching the real Road to Heaven: shallow water on
 * BOTH sides, golden gravel embankments flanking the road, and irregular
 * white salt crust along each shoreline.
 */
export function buildRannHeavenScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'rann-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(320, Math.min(900, Math.round((trackDef.length || 10000) / 12)));
  const extent = trackDef.closed === false ? 5000 : 260;
  const animation = {
    elapsed: 0,
    clouds: [],
    birds: [],
    waters: [],
    foam: [],
    rotors: [],
    sun: null,
  };

  const sandTex = makeSandTexture();
  const saltTex = makeSaltTexture();
  // Left side (+1) is a milky white sea; right side keeps the soft blue.
  const waterTexBySide = { 1: makeWaterTexture(true), '-1': makeWaterTexture(false) };
  animation.waterTextures = [waterTexBySide[1], waterTexBySide[-1]];

  const bermMat = new THREE.MeshStandardMaterial({
    map: sandTex,
    color: 0xd9b273,
    roughness: 1,
  });
  const crustMat = new THREE.MeshStandardMaterial({
    map: saltTex,
    color: 0xffffff,
    roughness: 1,
  });
  const waterMatBySide = {
    1: new THREE.MeshStandardMaterial({
      map: waterTexBySide[1],
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.02,
      transparent: true,
      opacity: 0.97,
    }),
    '-1': new THREE.MeshStandardMaterial({
      map: waterTexBySide[-1],
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.05,
      transparent: true,
      opacity: 0.96,
    }),
  };

  for (const side of [1, -1]) {
    // Golden gravel embankment right against the road.
    const berm = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, 6.5, {
        innerPadding: 2.4,
        height: -0.01,
        widthSegments: 4,
        undulation: 0.14,
        outerNoise: 0.5,
      }),
      bermMat,
    );
    berm.receiveShadow = true;
    group.add(berm);

    // Irregular white salt crust where the embankment meets the water.
    const crust = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, 13.5, {
        innerPadding: 6.2,
        height: -0.07,
        widthSegments: 3,
        undulation: 0.05,
        innerNoise: 0.5,
        outerNoise: 1.7,
      }),
      crustMat,
    );
    crust.receiveShadow = true;
    group.add(crust);

    // Shallow water stretching to the horizon.
    const water = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, extent, {
        widthSegments: performanceTier === 'low' ? 5 : 8,
        height: -0.3,
        innerPadding: side > 0 ? 9.5 : 11.5,
        innerNoise: 1.7,
      }),
      waterMatBySide[side],
    );
    water.receiveShadow = true;
    group.add(water);
    // The white sea on the left gets visibly bigger swells.
    animation.waters.push({ mesh: water, baseY: -0.3, amp: side > 0 ? 2.4 : 1 });
  }

  addShoulderClutter(group, curve, halfW, rng);
  addFoamWaves(group, curve, halfW, rng, animation);
  populateScenery(group, curve, halfW, rng, animation);

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
        bird.center.y + Math.sin(angle * 2.1) * 2.8,
        bird.center.z + Math.sin(angle) * bird.radius,
      );
      bird.object.rotation.y = -angle + Math.PI / 2;
      bird.object.rotation.x = Math.sin(time * 8.5 + bird.phase) * 0.16;
      bird.object.rotation.z = Math.sin(angle * 2.4) * 0.28;
      const flap = Math.sin(time * 10.5 + bird.phase);
      bird.object.scale.set(1 - Math.abs(flap) * 0.04, 1 + flap * 0.12, 1);
    }
    for (const texture of animation.waterTextures ?? []) {
      texture.offset.y = time * 0.012;
    }
    for (const { mesh, baseY, amp = 1 } of animation.waters) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(
          i,
          baseY
            + (Math.sin(x * 0.035 + time * 0.75) * 0.035
              + Math.sin(z * 0.055 - time * 1.15) * 0.025
              + Math.sin((x + z) * 0.012 + time * 0.5) * 0.02) * amp,
        );
      }
      positions.needsUpdate = true;
    }
    for (const foam of animation.foam) {
      const progress = (time * foam.speed + foam.phase) % 1;
      const outward = foam.maxOut - progress * (foam.maxOut - foam.minOut);
      foam.mesh.position.set(
        foam.baseX + foam.normalX * outward,
        -0.05,
        foam.baseZ + foam.normalZ * outward,
      );
      foam.mesh.rotation.z = -foam.heading;
      foam.mesh.scale.set(foam.width * (1 - progress * 0.35), foam.length, 1);
      foam.mesh.material.opacity = Math.sin(Math.PI * progress) ** 0.8 * 0.55;
    }
    for (const rotor of animation.rotors) rotor.rotation.z += dt * 0.65;
    if (animation.sun) animation.sun.rotation.y += dt * 0.035;
  };
  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
    modelCache.clear();
  };

  return group;
}
