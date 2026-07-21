import * as THREE from 'three';
import { performanceConfig, scaleTreeCount } from './PerformanceConfig.js';
import { buildRannHeavenScenery } from './TrackRannScenery.js';
import { buildSnowHeavenScenery } from './TrackSnowHeavenScenery.js';
import { addNorthPathBrandMonument } from './TrackNorthPathScenery.js';
import { buildChapmansPeakScenery } from './TrackChapmansPeakScenery.js';
import { buildBlackHoleScenery } from './TrackBlackHoleScenery.js';
import { buildEndlessScenery } from './TrackEndlessScenery.js';
import {
  buildMtFujiDawnScenery,
  buildMtFujiDayScenery,
  buildMtFujiNightScenery,
  buildMtFujiAutumnScenery,
} from './mt-fuji/index.js';

const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _right = new THREE.Vector3();

const BILLBOARD_TEXTS = [
  'CLUTCH CLASH',
  'NOS BOOST',
  'DRIFT ZONE',
  'RACE DAY',
  'FULL SEND',
  'PIT LANE',
];

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _sample = new THREE.Vector3();

function nearestCurveDistance(curve, x, z, samples = 96) {
  let best = Infinity;
  for (let i = 0; i <= samples; i++) {
    curve.getPointAt(i / samples, _sample);
    const d = Math.hypot(_sample.x - x, _sample.z - z);
    if (d < best) best = d;
  }
  return best;
}

function curveSideOffset(curve, t, roadHalfWidth, side, outward) {
  curve.getPointAt(t, _point);
  curve.getTangentAt(t, _tangent).normalize();
  _right.crossVectors(_tangent, new THREE.Vector3(0, 1, 0)).normalize();
  const dist = roadHalfWidth + outward;
  return {
    x: _point.x + _right.x * dist * side,
    z: _point.z + _right.z * dist * side,
    heading: Math.atan2(_tangent.x, _tangent.z),
    side,
  };
}

function makeBillboardTexture(text, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, `hsl(${hue}, 78%, 42%)`);
  grad.addColorStop(1, `hsl(${hue + 18}, 82%, 28%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addTrees(group, curve, roadHalfWidth, rng, count) {
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  trunks.castShadow = performanceConfig.castTreeShadows;

  const leafColors = [0x3d8a45, 0x4a9e52, 0x2f7a38, 0x5aad5f];
  const coneGeo = new THREE.ConeGeometry(1.5, 3.2, 7);
  const sphereGeo = new THREE.SphereGeometry(1.35, 8, 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const coneLeaves = new THREE.InstancedMesh(coneGeo, leafMat, count);
  const sphereLeaves = new THREE.InstancedMesh(sphereGeo, leafMat, count);
  coneLeaves.castShadow = performanceConfig.castTreeShadows;
  sphereLeaves.castShadow = performanceConfig.castTreeShadows;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const color = new THREE.Color();
  const minClearance = roadHalfWidth + 7;

  let placed = 0;
  let coneIdx = 0;
  let sphereIdx = 0;
  for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    const outward = 5 + rng() * 11;
    const spot = curveSideOffset(curve, t, roadHalfWidth, side, outward);
    if (nearestCurveDistance(curve, spot.x, spot.z) < minClearance) continue;

    const scale = 0.75 + rng() * 0.9;

    p.set(spot.x, 1.2 * scale, spot.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.set(scale, scale, scale);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);

    p.set(spot.x, 3.1 * scale, spot.z);
    m.compose(p, q, s);
    color.setHex(leafColors[placed % leafColors.length]);
    if (placed % 2 === 0) {
      coneLeaves.setMatrixAt(coneIdx, m);
      coneLeaves.setColorAt(coneIdx, color);
      coneIdx++;
    } else {
      sphereLeaves.setMatrixAt(sphereIdx, m);
      sphereLeaves.setColorAt(sphereIdx, color);
      sphereIdx++;
    }

    placed++;
  }
  trunks.count = placed;
  coneLeaves.count = coneIdx;
  sphereLeaves.count = sphereIdx;
  coneLeaves.instanceMatrix.needsUpdate = true;
  sphereLeaves.instanceMatrix.needsUpdate = true;
  if (coneLeaves.instanceColor) coneLeaves.instanceColor.needsUpdate = true;
  if (sphereLeaves.instanceColor) sphereLeaves.instanceColor.needsUpdate = true;
  group.add(trunks);
  group.add(coneLeaves);
  group.add(sphereLeaves);
}

function addGrandstand(group, curve, roadHalfWidth, t, side) {
  const spot = curveSideOffset(curve, t, roadHalfWidth, side, 14);
  if (nearestCurveDistance(curve, spot.x, spot.z) < roadHalfWidth + 12) return;
  const stand = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.35, roughness: 0.5 });

  for (let row = 0; row < 6; row++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 1.1), seatMat);
    bench.position.set(0, 0.45 + row * 0.5, -row * 0.85);
    bench.castShadow = true;
    stand.add(bench);
  }

  const back = new THREE.Mesh(new THREE.BoxGeometry(14, 3.6, 0.35), seatMat);
  back.position.set(0, 1.8, -5.2);
  back.castShadow = true;
  stand.add(back);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.15, 0.15), railMat);
  rail.position.set(0, 3.5, -0.2);
  stand.add(rail);

  for (let i = 0; i < 4; i++) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 0.9),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe10600 : 0x00c2ff }),
    );
    banner.position.set(-5 + i * 3.3, 2.8, 0.55);
    stand.add(banner);
  }

  stand.position.set(spot.x, 0, spot.z);
  stand.rotation.y = spot.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  group.add(stand);
}

function addBillboard(group, curve, roadHalfWidth, t, side, text, hue) {
  const spot = curveSideOffset(curve, t, roadHalfWidth, side, 12);
  if (nearestCurveDistance(curve, spot.x, spot.z) < roadHalfWidth + 8) return;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 5.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x555c68, metalness: 0.5, roughness: 0.45 }),
  );
  pole.position.set(spot.x, 2.6, spot.z);
  pole.castShadow = true;
  group.add(pole);

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 2.8),
    new THREE.MeshBasicMaterial({ map: makeBillboardTexture(text, hue), transparent: false }),
  );
  board.position.set(spot.x, 4.8, spot.z);
  board.rotation.y = spot.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  group.add(board);
}

function addTrackLights(group, curve, roadHalfWidth, count, evening = false) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.55, roughness: 0.4 });
  const glow = evening ? 0xffaa55 : 0xffcc66;
  const glowIntensity = evening ? 1.1 : 0.35;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const side = i % 2 === 0 ? 1 : -1;
    const spot = curveSideOffset(curve, t, roadHalfWidth, side, 3.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 6), poleMat);
    pole.position.set(spot.x, 2.25, spot.z);
    pole.castShadow = true;
    group.add(pole);

    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.35),
      new THREE.MeshStandardMaterial({
        color: 0x222831,
        emissive: glow,
        emissiveIntensity: glowIntensity,
      }),
    );
    fixture.position.set(spot.x, 4.5, spot.z);
    group.add(fixture);

    if (evening) {
      const light = new THREE.PointLight(0xffaa66, 0.45, 28, 2);
      light.position.set(spot.x, 4.2, spot.z);
      group.add(light);
    }
  }
}

function addSpeedMarkers(group, curve, roadHalfWidth, count = 320) {
  const markerGeo = new THREE.BoxGeometry(0.14, 1.35, 0.14);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7 });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, count * 2);
  const m = new THREE.Matrix4();
  let idx = 0;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = curveSideOffset(curve, t, roadHalfWidth, 1, 1.9);
    m.setPosition(p.x, 0.72, p.z);
    markers.setMatrixAt(idx++, m);

    const n = curveSideOffset(curve, t, roadHalfWidth, -1, 1.9);
    m.setPosition(n.x, 0.72, n.z);
    markers.setMatrixAt(idx++, m);
  }
  markers.count = idx;
  group.add(markers);
}

/**
 * Scatter trees, grandstands, billboards and lights around a track spline.
 */
export function buildTrackAtmosphere(curve, trackDef) {
  const group = new THREE.Group();
  group.name = 'track-atmosphere';
  const evening = trackDef.atmosphere === 'rain-evening';
  const rng = mulberry32(hashSeed(trackDef.id));
  const halfW = trackDef.roadWidth / 2;

  if (trackDef.id === 'road-to-heaven') {
    group.add(buildRannHeavenScenery(curve, trackDef, rng));
    if (!trackDef.theaterMode) {
      addBillboard(group, curve, halfW, 0.42, 1, 'ROAD TO HEAVEN', 200);
    }
    return group;
  }

  if (trackDef.id === 'road-to-heaven-snow') {
    group.add(buildSnowHeavenScenery(curve, trackDef, rng));
    if (!trackDef.theaterMode) {
      addBillboard(group, curve, halfW, 0.42, 1, 'FROZEN HEAVEN', 80);
    }
    return group;
  }

  if (trackDef.id === 'chapmans-peak') {
    group.add(buildChapmansPeakScenery(curve, trackDef, rng));
    return group;
  }

  if (trackDef.id === 'black-hole') {
    group.add(buildBlackHoleScenery(curve, trackDef, rng));
    return group;
  }

  if (trackDef.id === 'road-to-endless') {
    group.add(buildEndlessScenery(curve, trackDef, rng));
    if (!trackDef.theaterMode) {
      addBillboard(group, curve, halfW, 0.35, 1, 'ROAD TO ENDLESS', 28);
    }
    return group;
  }

  if (trackDef.id === 'north-path') {
    // Same Frozen Heaven world for now; brand monument is the differentiator.
    const snow = buildSnowHeavenScenery(curve, trackDef, rng);
    group.add(snow);
    addNorthPathBrandMonument(group, curve, halfW).catch((err) => {
      console.warn('North Path brand monument could not load.', err);
    });
    return group;
  }

  if (trackDef.id === 'mt-fuji-dawn') {
    group.add(buildMtFujiDawnScenery(curve, trackDef, rng));
    return group;
  }

  if (trackDef.id === 'mt-fuji-day') {
    group.add(buildMtFujiDayScenery(curve, trackDef, rng));
    return group;
  }

  if (trackDef.id === 'mt-fuji-night') {
    group.add(buildMtFujiNightScenery(curve, trackDef, rng));
    return group;
  }

  if (trackDef.id === 'mt-fuji-autumn') {
    group.add(buildMtFujiAutumnScenery(curve, trackDef, rng));
    return group;
  }

  const treeCount = scaleTreeCount(
    Math.min(22000, Math.max(7000, Math.round(trackDef.length / 3.6 * 100))),
  );
  addTrees(group, curve, halfW, rng, treeCount);

  addGrandstand(group, curve, halfW, 0.02, 1);
  addGrandstand(group, curve, halfW, 0.48, -1);
  if (trackDef.checkpointCount >= 5) {
    addGrandstand(group, curve, halfW, 0.74, 1);
  }

  const billboards = 6 + Math.floor(trackDef.checkpointCount / 2);
  for (let i = 0; i < billboards; i++) {
    const t = (i + 0.5) / billboards;
    const side = i % 2 === 0 ? 1 : -1;
    const text = BILLBOARD_TEXTS[i % BILLBOARD_TEXTS.length];
    addBillboard(group, curve, halfW, t, side, text, evening ? 12 + i * 8 : 350 + i * 22);
  }

  const lightCount = evening ? 28 : 18;
  addTrackLights(group, curve, halfW, lightCount, evening);

  if (trackDef.id === 'mega-straight') {
    addSpeedMarkers(group, curve, halfW, 520);
  }

  return group;
}
