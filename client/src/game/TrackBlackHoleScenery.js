import * as THREE from 'three';
import { performanceTier } from './PerformanceConfig.js';
import { curveFrameAt, openCurveTRange } from './spline.js';

/**
 * Theater art brief: brand/thumbnails/black-hole-bg.png
 * Procedural stand-in until dedicated hole/nebula/asteroid assets arrive.
 * (Heavy PNG plate removed — it spiked load time.)
 */

const DENSITY = {
  low: { stars: 120, beacons: 48, debris: 90, heroRocks: 24, nebula: 3, lanternLights: 12 },
  medium: { stars: 180, beacons: 64, debris: 140, heroRocks: 36, nebula: 4, lanternLights: 16 },
  high: { stars: 240, beacons: 80, debris: 180, heroRocks: 48, nebula: 5, lanternLights: 20 },
}[performanceTier];

function rngJitter(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function buildRibbon(curve, samples, halfW, side, extent, trackDef, {
  widthSegments = 4,
  innerPadding = 0.2,
  height = 0,
  outerY = -2,
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
      const y = THREE.MathUtils.lerp(height, outerY, across ** 1.05);
      positions.push(
        point.x + normal.x * offset,
        y,
        point.z + normal.z * offset,
      );
      uvs.push(across, (t * 40) % 1);
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

function addStarfield(group, curve, trackDef, rng) {
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
    const dist = 140 + rng() * 1600;
    positions[i * 3] = point.x + normal.x * side * dist + (rng() - 0.5) * 240;
    positions[i * 3 + 1] = -30 + rng() * 400;
    positions[i * 3 + 2] = point.z + normal.z * side * dist + (rng() - 0.5) * 240;
    color.setHSL(0.72 + rng() * 0.1, 0.12 + rng() * 0.2, 0.78 + rng() * 0.2);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    }),
  ));
}

/**
 * Face-on accretion (RingGeometry) — torus was reading as thin purple rings edge-on.
 * + world-space pink/orange key light so asteroids/road get the thumbnail lighting.
 */
function addAccretionDisk(group, curve, trackDef, animation) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const { point, tangent, normal } = curveFrameAt(curve, 0.58, closed, trackLength);
  const ahead = tangent.clone().normalize();
  const right = normal.clone().multiplyScalar(-1);

  const holePos = new THREE.Vector3(
    point.x + ahead.x * 240 + right.x * 70,
    145,
    point.z + ahead.z * 240 + right.z * 70,
  );
  // From hole toward the approach (camera side).
  const towardRoad = new THREE.Vector3(
    point.x - ahead.x * 400,
    20,
    point.z - ahead.z * 400,
  ).sub(holePos).normalize();

  const root = new THREE.Group();
  root.position.copy(holePos);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardRoad);

  // Soft purple shells behind the hot face (secondary only).
  for (let i = 0; i < DENSITY.nebula; i++) {
    const t = i / Math.max(1, DENSITY.nebula - 1);
    const funnel = new THREE.Mesh(
      new THREE.RingGeometry(280 + i * 90, 360 + i * 100, 48),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x4a1878 : 0x6a28a0,
        transparent: true,
        opacity: 0.1 - t * 0.01,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    funnel.position.z = -30 - i * 40;
    root.add(funnel);
    animation[`nebula${i}`] = funnel;
  }

  // Hot face hierarchy — thick flat rings like the thumbnail temperature.
  const outerGlow = new THREE.Mesh(
    new THREE.RingGeometry(250, 420, 64),
    new THREE.MeshBasicMaterial({
      color: 0xff38a0,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  root.add(outerGlow);

  const pink = new THREE.Mesh(
    new THREE.RingGeometry(200, 300, 64),
    new THREE.MeshBasicMaterial({
      color: 0xff50c0,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  root.add(pink);

  const disk = new THREE.Mesh(
    new THREE.RingGeometry(175, 250, 64),
    new THREE.MeshBasicMaterial({
      color: 0xff7a18,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  root.add(disk);

  const hot = new THREE.Mesh(
    new THREE.RingGeometry(168, 188, 64),
    new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  root.add(hot);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(172, 64),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.DoubleSide }),
  );
  core.position.z = 2;
  core.renderOrder = 4;
  root.add(core);

  group.add(root);

  // World-space key lights (not only local) so the whole causeway gets pink/orange rim.
  const holeLight = new THREE.PointLight(0xff6820, 14, 6500, 0.85);
  holeLight.position.copy(holePos).add(towardRoad.clone().multiplyScalar(80));
  group.add(holeLight);

  const pinkLight = new THREE.PointLight(0xff48b0, 7, 5000, 1.0);
  pinkLight.position.copy(holePos).add(new THREE.Vector3(0, 120, 0));
  group.add(pinkLight);

  const key = new THREE.DirectionalLight(0xff70a0, 0.85);
  key.position.copy(holePos);
  key.target.position.copy(point);
  group.add(key);
  group.add(key.target);

  animation.disk = disk;
  animation.innerDisk = hot;
  animation.pinkRing = pink;
  animation.outerGlow = outerGlow;
  animation.holeRoot = root;
}

/** Thumbnail lantern: curb pedestal + post + cyan cube + soft halo + road spill. */
function addCyanLanterns(group, curve, halfW, trackDef) {
  const count = DENSITY.beacons;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;

  const baseGeo = new THREE.BoxGeometry(1.15, 0.28, 1.15);
  const postGeo = new THREE.BoxGeometry(0.28, 0.75, 0.28);
  const cubeGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
  const haloGeo = new THREE.SphereGeometry(0.85, 8, 6);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x16141e,
    roughness: 0.94,
    flatShading: true,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x0e0c14,
    roughness: 0.9,
    flatShading: true,
  });
  const cubeMat = new THREE.MeshBasicMaterial({ color: 0x2af0ff, fog: false });
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x2ad8ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const bases = new THREE.InstancedMesh(baseGeo, baseMat, count * 2);
  const posts = new THREE.InstancedMesh(postGeo, postMat, count * 2);
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, count * 2);
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, count * 2);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let idx = 0;
  const lightBudget = DENSITY.lanternLights;
  let lightsLeft = lightBudget;

  for (let i = 0; i < count; i++) {
    const t = 0.02 + (i / count) * 0.9;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);

    for (const side of [1, -1]) {
      const lx = point.x + normal.x * (halfW + 1.35) * side;
      const lz = point.z + normal.z * (halfW + 1.35) * side;

      pos.set(lx, 0.45, lz);
      m.compose(pos, quat, scale);
      bases.setMatrixAt(idx, m);

      pos.set(lx, 0.95, lz);
      m.compose(pos, quat, scale);
      posts.setMatrixAt(idx, m);

      pos.set(lx, 1.55, lz);
      m.compose(pos, quat, scale);
      cubes.setMatrixAt(idx, m);
      halos.setMatrixAt(idx, m);

      // Cap real lights — dozens of PointLights were killing load/FPS.
      if (lightsLeft > 0 && i % Math.max(1, Math.floor(count / lightBudget)) === 0 && side === 1) {
        const light = new THREE.PointLight(0x2ad8ff, 2.4, 28, 1.8);
        light.position.set(lx, 1.7, lz);
        group.add(light);
        lightsLeft -= 1;
      }
      idx += 1;
    }
  }

  bases.count = idx;
  posts.count = idx;
  cubes.count = idx;
  halos.count = idx;
  bases.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  cubes.instanceMatrix.needsUpdate = true;
  halos.instanceMatrix.needsUpdate = true;
  group.add(bases);
  group.add(posts);
  group.add(cubes);
  group.add(halos);
}

/** Left-heavy rocks — low emissive so pink/cyan lights actually shade them. */
function addAsteroids(group, curve, halfW, trackDef, rng, animation) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const geos = [
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.OctahedronGeometry(1, 0),
  ];

  const mats = [
    new THREE.MeshStandardMaterial({
      color: 0x3a2858,
      emissive: 0x2a1048,
      emissiveIntensity: 0.18,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x2a1c40,
      emissive: 0x1a0830,
      emissiveIntensity: 0.14,
      roughness: 0.7,
      metalness: 0.04,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x4a3470,
      emissive: 0x301050,
      emissiveIntensity: 0.16,
      roughness: 0.58,
      metalness: 0.06,
      flatShading: true,
    }),
  ];

  const count = DENSITY.debris;
  const mesh = new THREE.InstancedMesh(geos[0], mats[0], count);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const floaters = [];

  for (let i = 0; i < count; i++) {
    const t = 0.02 + rng() * 0.85;
    const { point, normal, tangent } = curveFrameAt(curve, t, closed, trackLength);
    const side = rng() < 0.82 ? 1 : -1;
    const outward = halfW + 14 + rng() * 90;
    const along = (rng() - 0.5) * 36;
    pos.set(
      point.x + normal.x * outward * side + tangent.x * along,
      -2 + rng() * 48,
      point.z + normal.z * outward * side + tangent.z * along,
    );
    euler.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    quat.setFromEuler(euler);
    const s = 4 + rng() * 14;
    scale.set(s, s * (0.55 + rng() * 0.55), s * (0.65 + rng() * 0.5));
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
    floaters.push({
      index: i,
      origin: pos.clone(),
      phase: rng() * Math.PI * 2,
      amp: 0.8 + rng() * 2.2,
      spin: 0.035 + rng() * 0.14,
      scale: scale.clone(),
    });
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  animation.debris = { mesh, floaters, m, pos, quat, scale, euler };

  for (let i = 0; i < DENSITY.heroRocks; i++) {
    const t = 0.08 + (i / DENSITY.heroRocks) * 0.7;
    const { point, normal } = curveFrameAt(curve, t, closed, trackLength);
    const side = i % 5 === 0 ? -1 : 1;
    const rock = new THREE.Mesh(geos[i % geos.length], mats[i % mats.length]);
    const s = 16 + rng() * 48;
    rock.scale.set(s, s * (0.45 + rng() * 0.55), s * (0.55 + rng() * 0.5));
    rock.position.set(
      point.x + normal.x * (halfW + 28 + rng() * 150) * side,
      6 + rng() * 65,
      point.z + (rng() - 0.5) * 70,
    );
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(rock);
  }
}

/**
 * Black Hole theater map — locked to brand/thumbnails/black-hole-bg.png.
 */
export function buildBlackHoleScenery(curve, trackDef, rng) {
  const group = new THREE.Group();
  group.name = 'black-hole-scenery';
  const halfW = trackDef.roadWidth / 2;
  const samples = Math.max(240, Math.min(640, Math.round((trackDef.length || 8000) / 16)));
  const animation = {
    elapsed: 0,
    disk: null,
    innerDisk: null,
    pinkRing: null,
    outerGlow: null,
    holeRoot: null,
    debris: null,
  };

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(4500, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0x140828,
      side: THREE.BackSide,
      fog: false,
      transparent: true,
      opacity: 0.55,
    }),
  );
  sky.position.y = 180;
  group.add(sky);

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x101018,
    roughness: 0.96,
    flatShading: true,
  });
  const curbTopMat = new THREE.MeshStandardMaterial({
    color: 0x181820,
    roughness: 0.9,
    flatShading: true,
  });
  for (const side of [1, -1]) {
    group.add(new THREE.Mesh(
      buildRibbon(curve, samples, halfW, side, 1.55, trackDef, {
        widthSegments: 2,
        innerPadding: 0.02,
        height: 0.55,
        outerY: 0.15,
      }),
      curbMat,
    ));
    group.add(new THREE.Mesh(
      buildRibbon(curve, samples, halfW, side, 1.55, trackDef, {
        widthSegments: 1,
        innerPadding: 0.05,
        height: 0.62,
        outerY: 0.62,
      }),
      curbTopMat,
    ));
  }

  addStarfield(group, curve, trackDef, rng);
  addAccretionDisk(group, curve, trackDef, animation);
  addCyanLanterns(group, curve, halfW, trackDef);
  addAsteroids(group, curve, halfW, trackDef, rng, animation);

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;
    // Slow drift — thumbnail swirl, not a spinning top.
    if (animation.disk) animation.disk.rotation.z = time * 0.012;
    if (animation.innerDisk) animation.innerDisk.rotation.z = time * 0.018;
    if (animation.pinkRing) animation.pinkRing.rotation.z = -time * 0.01;
    if (animation.outerGlow) animation.outerGlow.rotation.z = time * 0.006;
    for (let i = 0; i < DENSITY.nebula; i++) {
      const n = animation[`nebula${i}`];
      if (n) n.rotation.z += dt * (0.006 + i * 0.002) * (i % 2 ? 1 : -1);
    }
    if (animation.debris) {
      const { mesh, floaters, m, pos, quat, scale, euler } = animation.debris;
      for (const f of floaters) {
        pos.copy(f.origin);
        pos.y += Math.sin(time * 0.45 + f.phase) * f.amp;
        euler.set(time * f.spin, time * f.spin * 0.7 + f.phase, time * f.spin * 0.25);
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
