import * as THREE from 'three';
import { performanceTier } from './PerformanceConfig.js';
import { curveFrameAt, openCurveTRange } from './spline.js';

const VOID_Y = -2.4;

const DENSITY = {
  low: { stars: 180, rings: 3, beacons: 40, debris: 60 },
  medium: { stars: 320, rings: 4, beacons: 70, debris: 110 },
  high: { stars: 520, rings: 5, beacons: 110, debris: 180 },
}[performanceTier];

function makeVoidTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#0a0614');
  grad.addColorStop(0.35, '#120828');
  grad.addColorStop(0.7, '#080414');
  grad.addColorStop(1, '#030208');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 80}, ${20 + Math.random() * 40}, ${90 + Math.random() * 100}, ${0.04 + Math.random() * 0.1})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 20 + Math.random() * 80, 2 + Math.random() * 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNeonRoadAccentTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#06040c';
  ctx.fillRect(0, 0, size, size);
  // Soft violet edge lines — muted so car lights stay the hero.
  ctx.fillStyle = 'rgba(140, 100, 200, 0.28)';
  ctx.fillRect(0, 0, 10, size);
  ctx.fillStyle = 'rgba(70, 120, 200, 0.22)';
  ctx.fillRect(size - 10, 0, 10, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRibbon(curve, samples, halfW, side, extent, trackDef, {
  widthSegments = 4,
  innerPadding = 0.2,
  height = VOID_Y,
  outerY = VOID_Y,
} = {}) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const runout = closed ? null : openCurveTRange(trackLength, 160);
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowSize = widthSegments + 1;

  for (let i = 0; i <= samples; i++) {
    const t = closed
      ? i / samples
      : runout.start + (i / samples) * (runout.end - runout.start);
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    for (let w = 0; w <= widthSegments; w++) {
      const across = w / widthSegments;
      const offset = (halfW + innerPadding + across * (extent - innerPadding)) * side;
      const y = THREE.MathUtils.lerp(height, outerY, across ** 1.1);
      positions.push(
        point.x + normal.x * offset,
        y,
        point.z + normal.z * offset,
      );
      uvs.push(across, (t * 60) % 1);
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

function addStarfield(group, curve, trackDef, rng, animation) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const count = DENSITY.stars;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const t = rng();
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const side = rng() > 0.5 ? 1 : -1;
    const dist = 40 + rng() * 900;
    positions[i * 3] = point.x + normal.x * side * dist + (rng() - 0.5) * 80;
    positions[i * 3 + 1] = 20 + rng() * 220;
    positions[i * 3 + 2] = point.z + normal.z * side * dist + (rng() - 0.5) * 80;
    color.setHSL(0.7 + rng() * 0.2, 0.4 + rng() * 0.5, 0.55 + rng() * 0.4);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  stars.name = 'black-hole-stars';
  group.add(stars);
  animation.stars = stars;
}

function addAccretionDisk(group, curve, trackDef, animation) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const { point } = curveFrameAt(curve, 0.97, closed, trackLength);

  const disk = new THREE.Mesh(
    new THREE.RingGeometry(28, 160, 64, 1),
    new THREE.MeshBasicMaterial({
      color: 0xc090d8,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  disk.position.set(point.x, 18, point.z + 40);
  disk.rotation.x = Math.PI / 2.4;
  group.add(disk);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(22, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  core.position.copy(disk.position);
  group.add(core);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xb090d0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  glow.position.copy(disk.position);
  glow.scale.set(220, 220, 1);
  group.add(glow);

  animation.disk = disk;
  animation.horizonGlow = glow;
}

function addNeonBeacons(group, curve, halfW, trackDef, rng) {
  const count = DENSITY.beacons;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const geo = new THREE.BoxGeometry(0.18, 1.6, 0.18);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x120818,
    emissive: 0x6a58a0,
    emissiveIntensity: 0.55,
    roughness: 0.55,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count * 2);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  let idx = 0;

  for (let i = 0; i < count; i++) {
    const t = 0.02 + (i / count) * 0.96;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    for (const side of [1, -1]) {
      pos.set(
        point.x + normal.x * (halfW + 1.1) * side,
        0.8,
        point.z + normal.z * (halfW + 1.1) * side,
      );
      m.setPosition(pos);
      mesh.setMatrixAt(idx++, m);
    }
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'black-hole-beacons';
  group.add(mesh);
}

function addDebris(group, curve, halfW, trackDef, rng, animation) {
  const count = DENSITY.debris;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const geo = new THREE.TetrahedronGeometry(0.55, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a2038,
    emissive: 0x331144,
    emissiveIntensity: 0.35,
    roughness: 0.85,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const floaters = [];

  for (let i = 0; i < count; i++) {
    const t = rng();
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const side = rng() > 0.5 ? 1 : -1;
    const outward = halfW + 8 + rng() * 55;
    const y = 1.5 + rng() * 18;
    pos.set(
      point.x + normal.x * outward * side,
      y,
      point.z + normal.z * outward * side,
    );
    euler.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    quat.setFromEuler(euler);
    const s = 0.4 + rng() * 1.6;
    scale.set(s, s * (0.6 + rng()), s);
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
    floaters.push({
      index: i,
      origin: pos.clone(),
      phase: rng() * Math.PI * 2,
      amp: 0.4 + rng() * 1.2,
      spin: 0.2 + rng() * 0.6,
      quat: quat.clone(),
      scale: scale.clone(),
    });
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  animation.debris = { mesh, floaters, m, pos, quat, scale, euler };
}

/**
 * Black Hole: neon causeway spiraling through a cosmic void toward an
 * accretion disk and event horizon.
 */
export function buildBlackHoleScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'black-hole-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(320, Math.min(900, Math.round((trackDef.length || 8000) / 12)));
  const extent = trackDef.closed === false ? 4200 : 320;
  const animation = {
    elapsed: 0,
    stars: null,
    disk: null,
    horizonGlow: null,
    debris: null,
  };

  const voidMat = new THREE.MeshStandardMaterial({
    map: makeVoidTexture(),
    color: 0xffffff,
    roughness: 1,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    map: makeNeonRoadAccentTexture(),
    color: 0xffffff,
    roughness: 0.85,
    emissive: 0x0a0814,
    emissiveIntensity: 0.15,
  });

  for (const side of [1, -1]) {
    const voidPlane = new THREE.Mesh(
      buildRibbon(curve, samples, halfW, side, extent, trackDef, {
        widthSegments: performanceTier === 'low' ? 3 : 5,
        innerPadding: 1.6,
        height: VOID_Y,
        outerY: VOID_Y - 1.5,
      }),
      voidMat,
    );
    voidPlane.receiveShadow = true;
    group.add(voidPlane);

    const accent = new THREE.Mesh(
      buildRibbon(curve, samples, halfW, side, 2.2, trackDef, {
        widthSegments: 2,
        innerPadding: 0.05,
        height: 0.02,
        outerY: -0.2,
      }),
      accentMat,
    );
    accent.receiveShadow = true;
    group.add(accent);
  }

  addStarfield(group, curve, trackDef, rng, animation);
  addAccretionDisk(group, curve, trackDef, animation);
  addNeonBeacons(group, curve, halfW, trackDef, rng);
  addDebris(group, curve, halfW, trackDef, rng, animation);

  // Soft accretion rings floating beside the approach.
  for (let i = 0; i < DENSITY.rings; i++) {
    const t = 0.55 + i * 0.08;
    const { point, normal } = curveFrameAt(curve, t, false, trackDef.length || 8000);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(18 + i * 8, 0.35, 8, 48),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xa888d0 : 0x6688b8,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.position.set(
      point.x + normal.x * (60 + i * 25) * (i % 2 ? 1 : -1),
      12 + i * 4,
      point.z,
    );
    ring.rotation.x = Math.PI / 2.2;
    ring.rotation.z = i * 0.3;
    group.add(ring);
    animation[`ring${i}`] = ring;
  }

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;
    if (animation.disk) animation.disk.rotation.z = time * 0.18;
    if (animation.horizonGlow) {
      const pulse = 0.28 + Math.sin(time * 1.4) * 0.08;
      animation.horizonGlow.material.opacity = pulse;
    }
    if (animation.stars) {
      animation.stars.material.opacity = 0.75 + Math.sin(time * 0.7) * 0.15;
    }
    for (let i = 0; i < DENSITY.rings; i++) {
      const ring = animation[`ring${i}`];
      if (ring) ring.rotation.z += dt * (0.15 + i * 0.05);
    }
    if (animation.debris) {
      const { mesh, floaters, m, pos, quat, scale, euler } = animation.debris;
      for (const f of floaters) {
        pos.copy(f.origin);
        pos.y += Math.sin(time * 0.8 + f.phase) * f.amp;
        euler.set(time * f.spin, time * f.spin * 0.7 + f.phase, 0);
        quat.setFromEuler(euler);
        scale.copy(f.scale);
        m.compose(pos, quat, scale);
        mesh.setMatrixAt(f.index, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
  };

  return group;
}
