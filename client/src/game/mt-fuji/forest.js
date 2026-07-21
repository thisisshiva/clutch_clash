import * as THREE from 'three';
import { performanceTier } from '../PerformanceConfig.js';
import { makeAsset, trackPose, addWhenReady } from './shared.js';

/** Keep GLB tree counts modest — hundreds of unique meshes destroy FPS. */
const TREE_COUNTS = {
  low: { maple: 22, pine: 12 },
  medium: { maple: 40, pine: 20 },
  high: { maple: 64, pine: 32 },
};

const SPRING_CANOPY = [
  0xf7b7d2, 0xf4c4da, 0xe8a0c0, 0xffd6e8, 0xd4e8c8, 0xb8d4a8,
];

function isLikelyTrunk(mat) {
  const name = `${mat?.name || ''}`.toLowerCase();
  if (/trunk|bark|wood|stem|branch/.test(name)) return true;
  if (!mat?.color) return false;
  const c = mat.color;
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return max < 0.45 && (c.r - c.g) > -0.05 && (c.r - c.b) > -0.02 && (max - min) < 0.2;
}

/** Shared materials so clones don't explode material count. */
function buildSpringMaterialPool() {
  return SPRING_CANOPY.map((hex) => new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: true,
  }));
}

function paintSpringCanopyShared(root, rng, pool) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const next = mats.map((mat) => {
      if (isLikelyTrunk(mat)) return mat;
      return pool[Math.floor(rng() * pool.length)];
    });
    obj.material = Array.isArray(obj.material) ? next : next[0];
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

function stripShadows(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
  });
}

export async function addFujiForest(group, curve, trackDef, rng, {
  mapleFile = 'maple-trees.glb',
  pineFile = 'pine-tree-snow.glb',
  density = 1,
  maxOutward = 140,
} = {}) {
  const halfW = trackDef.roadWidth / 2;
  const minOutward = halfW + 16;
  const counts = TREE_COUNTS[performanceTier] || TREE_COUNTS.high;
  const mapleCount = Math.max(10, Math.round(counts.maple * density));
  const pineCount = Math.max(6, Math.round(counts.pine * density));
  const canopyPool = buildSpringMaterialPool();

  let mapleTpl;
  let pineTpl;
  try {
    // Unit-size templates; each clone gets its own world scale.
    mapleTpl = await makeAsset(mapleFile, 1);
    pineTpl = await makeAsset(pineFile, 1);
  } catch (err) {
    console.warn('Mt Fuji forest assets failed to load.', err);
    return;
  }

  for (let i = 0; i < mapleCount; i++) {
    const tree = mapleTpl.clone(true);
    paintSpringCanopyShared(tree, rng, canopyPool);
    const t = 0.02 + (i / mapleCount) * 0.88;
    const side = i % 2 === 0 ? 1 : -1;
    const band = i % 3;
    const outward = band === 0
      ? minOutward + rng() * 18
      : band === 1
        ? minOutward + 20 + rng() * 36
        : minOutward + 48 + rng() * Math.max(20, maxOutward - 50);
    const pose = trackPose(curve, Math.min(0.9, t), side, outward);
    tree.position.copy(pose.position);
    tree.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.05);
    tree.scale.setScalar(10 + rng() * 12);
    addWhenReady(group, tree);
  }

  for (let i = 0; i < pineCount; i++) {
    const tree = pineTpl.clone(true);
    stripShadows(tree);
    const t = 0.03 + (i / pineCount) * 0.86;
    const side = i % 2 === 0 ? -1 : 1;
    const outward = minOutward + 26 + rng() * Math.max(24, maxOutward - 30);
    const pose = trackPose(curve, Math.min(0.9, t), side, outward);
    tree.position.copy(pose.position);
    tree.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.04);
    tree.scale.setScalar(12 + rng() * 14);
    addWhenReady(group, tree);
  }
}
