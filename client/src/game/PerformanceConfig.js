/**
 * Scales heavy world content (trees, traffic meshes) by device capability.
 * Logic entities (traffic positions, collisions) can stay high; only visuals scale down.
 */
function detectTier() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile || mem < 4 || cores < 4) return 'low';
  if (mem < 8 || cores < 6) return 'medium';
  return 'high';
}

const TIERS = {
  low: {
    treeMultiplier: 0.12,
    trafficLogic: 36,
    trafficMeshes: 18,
    trafficVisibleRadius: 180,
    castTreeShadows: false,
    shadowMapSize: 1024,
  },
  medium: {
    treeMultiplier: 0.35,
    trafficLogic: 96,
    trafficMeshes: 40,
    trafficVisibleRadius: 240,
    castTreeShadows: false,
    shadowMapSize: 1536,
  },
  high: {
    treeMultiplier: 1,
    trafficLogic: 504,
    trafficMeshes: 72,
    trafficVisibleRadius: 320,
    castTreeShadows: true,
    shadowMapSize: 2048,
  },
};

const tier = detectTier();

export const performanceConfig = TIERS[tier];
export const performanceTier = tier;

export function scaleTreeCount(baseCount) {
  return Math.max(40, Math.round(baseCount * performanceConfig.treeMultiplier));
}
