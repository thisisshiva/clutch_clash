import * as THREE from 'three';
import { performanceTier } from './PerformanceConfig.js';
import { curveFrameAt, openCurveTRange } from './spline.js';

const DENSITY = {
  low: { dunes: 40, posts: 80, mirages: 4, heat: 12 },
  medium: { dunes: 70, posts: 140, mirages: 6, heat: 18 },
  high: { dunes: 110, posts: 220, mirages: 8, heat: 28 },
}[performanceTier];

function makeSandTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#d4b07a');
  grad.addColorStop(0.4, '#c9a56c');
  grad.addColorStop(0.75, '#b8925c');
  grad.addColorStop(1, '#a88250');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3500; i++) {
    const bright = Math.random() > 0.5;
    ctx.fillStyle = bright
      ? `rgba(245, 220, 170, ${0.06 + Math.random() * 0.14})`
      : `rgba(140, 100, 55, ${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 2.2, 0.6 + Math.random() * 2);
  }

  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = `rgba(150, 110, 60, ${0.04 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.35, y + (Math.random() - 0.5) * 24, size * 0.7, y + (Math.random() - 0.5) * 24, size, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 30);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
  g.addColorStop(0, 'rgba(255, 245, 210, 1)');
  g.addColorStop(0.25, 'rgba(255, 210, 130, 0.55)');
  g.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRibbon(curve, samples, halfW, side, extent, trackDef, {
  widthSegments = 4,
  innerPadding = 0.15,
  height = -0.02,
  outerY = -0.08,
  undulation = 0,
} = {}) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 12000;
  const runout = closed ? null : openCurveTRange(trackLength, 200);
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
      const x = point.x + normal.x * offset;
      const z = point.z + normal.z * offset;
      const wave = undulation * across * (
        Math.sin(x * 0.012 + z * 0.009) * 0.6
        + Math.sin(x * 0.03 - z * 0.02) * 0.4
      );
      const y = THREE.MathUtils.lerp(height, outerY, across ** 0.9) + wave;
      positions.push(x, y, z);
      uvs.push(across, (t * 50) % 1);
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

function addMilePosts(group, curve, halfW, trackDef, rng) {
  const count = DENSITY.posts;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 12000;
  const geo = new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.92 });
  const mesh = new THREE.InstancedMesh(geo, mat, count * 2);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  let idx = 0;

  for (let i = 0; i < count; i++) {
    const t = 0.02 + (i / count) * 0.96;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    for (const side of [1, -1]) {
      if (rng() < 0.18) continue;
      pos.set(
        point.x + normal.x * (halfW + 2.4 + rng() * 0.6) * side,
        1.05,
        point.z + normal.z * (halfW + 2.4 + rng() * 0.6) * side,
      );
      m.setPosition(pos);
      mesh.setMatrixAt(idx++, m);
    }
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'endless-mile-posts';
  group.add(mesh);
}

function addDuneMounds(group, curve, halfW, trackDef, rng) {
  const count = DENSITY.dunes;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 12000;
  const geo = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a86a, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = rng();
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const side = rng() > 0.5 ? 1 : -1;
    const outward = halfW + 28 + rng() * 180;
    pos.set(
      point.x + normal.x * outward * side,
      -0.2,
      point.z + normal.z * outward * side,
    );
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const s = 4 + rng() * 14;
    scale.set(s * (0.8 + rng() * 0.6), s * (0.25 + rng() * 0.35), s * (0.7 + rng() * 0.5));
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.name = 'endless-dunes';
  group.add(mesh);
}

function addMirageSprites(group, curve, trackDef, rng, animation) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 12000;
  const glow = getGlowTexture();

  for (let i = 0; i < DENSITY.mirages; i++) {
    const t = 0.15 + (i / DENSITY.mirages) * 0.7;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const side = i % 2 ? 1 : -1;
    const mirage = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow,
      color: 0xffe0a8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    mirage.position.set(
      point.x + normal.x * (120 + rng() * 200) * side,
      4 + rng() * 8,
      point.z + normal.z * (40 + rng() * 60) * side,
    );
    mirage.scale.set(80 + rng() * 60, 18 + rng() * 14, 1);
    group.add(mirage);
    animation.mirages.push({
      object: mirage,
      phase: rng() * Math.PI * 2,
      baseOpacity: 0.14 + rng() * 0.12,
    });
  }
}

function addHorizonSun(group, curve, trackDef) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 12000;
  const { point } = curveFrameAt(curve, 0.98, closed, trackLength);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: 0xffd090,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sun.position.set(point.x + 80, 42, point.z + 320);
  sun.scale.set(160, 160, 1);
  group.add(sun);
}

/**
 * Road to Endless: bleached desert highway vanishing into heat haze —
 * dunes, mile posts, and a sun that never quite arrives.
 */
export function buildEndlessScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'endless-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(360, Math.min(1000, Math.round((trackDef.length || 12000) / 12)));
  const extent = trackDef.closed === false ? 5500 : 400;
  const animation = {
    elapsed: 0,
    mirages: [],
  };

  const sandMat = new THREE.MeshStandardMaterial({
    map: makeSandTexture(),
    color: 0xffffff,
    roughness: 1,
  });
  const farSandMat = new THREE.MeshStandardMaterial({
    color: 0xc4a878,
    roughness: 1,
  });

  for (const side of [1, -1]) {
    const near = new THREE.Mesh(
      buildRibbon(curve, samples, halfW, side, 18, trackDef, {
        widthSegments: 4,
        innerPadding: 0.12,
        height: -0.01,
        outerY: -0.15,
        undulation: 0.35,
      }),
      sandMat,
    );
    near.receiveShadow = true;
    group.add(near);

    const far = new THREE.Mesh(
      buildRibbon(curve, Math.round(samples * 0.7), halfW, side, extent, trackDef, {
        widthSegments: performanceTier === 'low' ? 3 : 5,
        innerPadding: 16,
        height: -0.12,
        outerY: -0.4,
        undulation: 1.8,
      }),
      farSandMat,
    );
    far.receiveShadow = true;
    group.add(far);
  }

  addDuneMounds(group, curve, halfW, trackDef, rng);
  addMilePosts(group, curve, halfW, trackDef, rng);
  addMirageSprites(group, curve, trackDef, rng, animation);
  addHorizonSun(group, curve, trackDef);

  // Soft vanishing-point haze planes far ahead along the track.
  for (let i = 0; i < DENSITY.heat; i++) {
    const t = 0.2 + (i / DENSITY.heat) * 0.75;
    const { point } = curveFrameAt(curve, t, false, trackDef.length || 12000);
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(90 + rng() * 40, 10 + rng() * 6),
      new THREE.MeshBasicMaterial({
        color: 0xf0e0c0,
        transparent: true,
        opacity: 0.06 + rng() * 0.06,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    haze.position.set(point.x, 3 + rng() * 4, point.z);
    haze.rotation.y = rng() * 0.4 - 0.2;
    group.add(haze);
    animation.mirages.push({
      object: haze,
      phase: rng() * Math.PI * 2,
      baseOpacity: haze.material.opacity,
    });
  }

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;
    for (const m of animation.mirages) {
      const pulse = m.baseOpacity * (0.75 + Math.sin(time * 0.9 + m.phase) * 0.35);
      if (m.object.material) m.object.material.opacity = Math.max(0.02, pulse);
    }
  };

  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
  };

  return group;
}
