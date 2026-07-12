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
  low: { pines: 28, dead: 10, stars: 40, flakes: 18 },
  medium: { pines: 48, dead: 18, stars: 70, flakes: 32 },
  high: { pines: 72, dead: 28, stars: 110, flakes: 48 },
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

function makeSnowTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef5fb';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5200; i++) {
    const bright = Math.random() > 0.35;
    ctx.fillStyle = bright
      ? `rgba(255, 255, 255, ${0.25 + Math.random() * 0.45})`
      : `rgba(170, 190, 210, ${0.08 + Math.random() * 0.18})`;
    const r = 0.4 + Math.random() * 2.2;
    ctx.fillRect(Math.random() * size, Math.random() * size, r, r);
  }

  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(150, 175, 200, ${0.04 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      size * 0.3, y + (Math.random() - 0.5) * 24,
      size * 0.7, y + (Math.random() - 0.5) * 24,
      size, y,
    );
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 25);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dark night water with cool moonlit shoreline. */
function makeNightWaterTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, 0);
  gradient.addColorStop(0, '#c8e4f0');
  gradient.addColorStop(0.18, '#7eb0c8');
  gradient.addColorStop(0.45, '#3a6a88');
  gradient.addColorStop(0.8, '#1e3f5c');
  gradient.addColorStop(1, '#132838');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const x = Math.random() ** 2 * size * 0.75;
    ctx.strokeStyle = `rgba(220, 240, 255, ${0.05 + (1 - x / size) * 0.2 * Math.random()})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    for (let y = -10; y <= size + 10; y += 14) {
      const waveX = x + Math.sin(y * 0.05 + i) * (2 + Math.random() * 3);
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
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.15, 'rgba(210, 230, 255, 0.85)');
  gradient.addColorStop(0.4, 'rgba(140, 180, 255, 0.28)');
  gradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

function addSnowClutter(group, curve, halfW, rng) {
  const count = { low: 500, medium: 1100, high: 1800 }[performanceTier];
  const geo = new THREE.IcosahedronGeometry(0.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  const colors = [0xffffff, 0xe8f0f8, 0xd4e2f0, 0xc8d8e8];

  for (let i = 0; i < count; i++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    const outward = halfW + 0.4 + rng() ** 1.5 * 6;
    pos.set(
      _point.x + _normal.x * outward * side,
      0.03,
      _point.z + _normal.z * outward * side,
    );
    euler.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
    quat.setFromEuler(euler);
    const s = 0.2 + rng() * 1.0;
    scale.set(s, s * 0.35, s * (0.7 + rng() * 0.5));
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
    color.setHex(colors[i % colors.length]);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

async function addTrees(group, curve, halfW, rng) {
  const jobs = [];

  for (let i = 0; i < DENSITY.pines; i++) {
    jobs.push((async () => {
      const tree = await makeAsset('pine-tree-snow.glb', 9 + rng() * 10);
      const side = i % 2 ? 1 : -1;
      const pose = trackPose(
        curve,
        0.04 + (i + 0.3) / DENSITY.pines * 0.92,
        side,
        halfW + 10 + rng() * 55,
        -0.04,
      );
      tree.position.copy(pose.position);
      tree.rotation.y = rng() * Math.PI * 2;
      tree.scale.multiplyScalar(0.85 + rng() * 0.4);
      addWhenReady(group, tree);
    })());
  }

  for (let i = 0; i < DENSITY.dead; i++) {
    jobs.push((async () => {
      const tree = await makeAsset('dead-trees-snow.glb', 7 + rng() * 8);
      const side = i % 2 ? -1 : 1;
      const pose = trackPose(
        curve,
        0.08 + (i + 0.5) / DENSITY.dead * 0.84,
        side,
        halfW + 18 + rng() * 70,
        -0.04,
      );
      tree.position.copy(pose.position);
      tree.rotation.y = rng() * Math.PI * 2;
      addWhenReady(group, tree);
    })());
  }

  await Promise.all(jobs);
}

async function addSkyProps(group, curve, rng, animation) {
  const jobs = [];

  jobs.push((async () => {
    const moon = await makeAsset('moon.glb', 55, { grounded: false });
    moon.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const lighten = (material) => {
        const clone = material.clone();
        clone.color?.setHex(0xf4f8ff);
        if (clone.emissive) {
          clone.emissive.setHex(0xd8e8ff);
          clone.emissiveIntensity = 1.4;
        }
        clone.toneMapped = false;
        return clone;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(lighten)
        : lighten(child.material);
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    halo.scale.set(180, 180, 1);
    moon.add(halo);
    const pose = trackPose(curve, 0.45, -1, 520, 220);
    moon.position.copy(pose.position);
    if (!addWhenReady(group, moon)) return;
    animation.moon = moon;
  })());

  for (let i = 0; i < DENSITY.stars; i++) {
    jobs.push((async () => {
      const star = await makeAsset('star.glb', 2.2 + rng() * 4.5, { grounded: false });
      star.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const glow = (material) => {
          const clone = material.clone();
          clone.color?.setHex(0xffffff);
          if (clone.emissive) {
            clone.emissive.setHex(0xe8f0ff);
            clone.emissiveIntensity = 2.5;
          }
          clone.toneMapped = false;
          return clone;
        };
        child.material = Array.isArray(child.material)
          ? child.material.map(glow)
          : glow(child.material);
      });
      const side = rng() > 0.5 ? 1 : -1;
      const pose = trackPose(
        curve,
        rng(),
        side,
        80 + rng() * 900,
        90 + rng() * 220,
      );
      star.position.copy(pose.position);
      star.rotation.y = rng() * Math.PI * 2;
      if (!addWhenReady(group, star)) return;
      animation.stars.push({
        object: star,
        phase: rng() * Math.PI * 2,
        speed: 0.8 + rng() * 1.6,
        baseScale: star.scale.x,
      });
    })());
  }

  for (let i = 0; i < DENSITY.flakes; i++) {
    jobs.push((async () => {
      const flake = await makeAsset('snowflake.glb', 0.22 + rng() * 0.28, { grounded: false });
      flake.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const icy = (material) => {
          const clone = material.clone();
          clone.color?.setHex(0xe8f4ff);
          clone.transparent = true;
          clone.opacity = 0.75;
          clone.depthWrite = false;
          return clone;
        };
        child.material = Array.isArray(child.material)
          ? child.material.map(icy)
          : icy(child.material);
      });
      const side = i % 2 ? 1 : -1;
      const pose = trackPose(
        curve,
        (i + 0.2) / DENSITY.flakes,
        side,
        8 + rng() * 40,
        6 + rng() * 28,
      );
      flake.position.copy(pose.position);
      if (!addWhenReady(group, flake)) return;
      animation.flakes.push({
        object: flake,
        origin: flake.position.clone(),
        phase: rng() * Math.PI * 2,
        drift: 4 + rng() * 8,
        fall: 3 + rng() * 5,
        spin: 0.4 + rng() * 1.2,
      });
    })());
  }

  await Promise.all(jobs);
}

async function populateScenery(group, curve, halfW, rng, animation) {
  try {
    await Promise.all([
      addTrees(group, curve, halfW, rng),
      addSkyProps(group, curve, rng, animation),
    ]);
  } catch (error) {
    console.warn('Some Frozen Heaven scenery assets could not be loaded.', error);
  }
}

/**
 * Night snow causeway: iced water flats, snow berms, pines, moon and stars.
 * Same open-spline layout as Road to Heaven.
 */
export function buildSnowHeavenScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'snow-heaven-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(320, Math.min(900, Math.round((trackDef.length || 10000) / 12)));
  const extent = trackDef.closed === false ? 5000 : 260;
  const animation = {
    elapsed: 0,
    waters: [],
    stars: [],
    flakes: [],
    moon: null,
  };

  const snowTex = makeSnowTexture();
  const waterTex = makeNightWaterTexture();
  animation.waterTextures = [waterTex];

  const bermMat = new THREE.MeshStandardMaterial({
    map: snowTex,
    color: 0xffffff,
    roughness: 0.95,
  });
  const shoreMat = new THREE.MeshStandardMaterial({
    color: 0xd8e8f4,
    roughness: 0.88,
    metalness: 0.08,
  });
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.94,
  });

  for (const side of [1, -1]) {
    const berm = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, 7.5, {
        innerPadding: 2.4,
        height: -0.01,
        widthSegments: 4,
        undulation: 0.18,
        outerNoise: 0.6,
      }),
      bermMat,
    );
    berm.receiveShadow = true;
    group.add(berm);

    const shore = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, 14, {
        innerPadding: 7,
        height: -0.08,
        widthSegments: 3,
        undulation: 0.04,
        innerNoise: 0.4,
        outerNoise: 1.4,
      }),
      shoreMat,
    );
    shore.receiveShadow = true;
    group.add(shore);

    const water = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, extent, {
        widthSegments: performanceTier === 'low' ? 4 : 7,
        height: -0.32,
        innerPadding: 11,
        innerNoise: 1.5,
      }),
      waterMat,
    );
    water.receiveShadow = true;
    group.add(water);
    animation.waters.push({ mesh: water, baseY: -0.32, amp: 0.7 });
  }

  addSnowClutter(group, curve, halfW, rng);
  populateScenery(group, curve, halfW, rng, animation);

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;

    for (const texture of animation.waterTextures ?? []) {
      texture.offset.y = time * 0.008;
    }
    for (const { mesh, baseY, amp = 1 } of animation.waters) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(
          i,
          baseY
            + (Math.sin(x * 0.03 + time * 0.45) * 0.028
              + Math.sin(z * 0.05 - time * 0.7) * 0.02) * amp,
        );
      }
      positions.needsUpdate = true;
    }
    for (const star of animation.stars) {
      const pulse = 0.75 + Math.sin(time * star.speed + star.phase) * 0.35;
      star.object.scale.setScalar(star.baseScale * pulse);
    }
    for (const flake of animation.flakes) {
      const drift = time * 0.35 + flake.phase;
      flake.object.position.set(
        flake.origin.x + Math.sin(drift) * flake.drift,
        flake.origin.y - ((time * flake.fall + flake.phase * 3) % 22),
        flake.origin.z + Math.cos(drift * 0.7) * flake.drift * 0.5,
      );
      if (flake.object.position.y < flake.origin.y - 20) {
        flake.object.position.y = flake.origin.y + 4;
      }
      flake.object.rotation.y += dt * flake.spin;
      flake.object.rotation.z += dt * flake.spin * 0.6;
    }
    if (animation.moon) animation.moon.rotation.y += dt * 0.02;
  };

  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
    modelCache.clear();
  };

  return group;
}
