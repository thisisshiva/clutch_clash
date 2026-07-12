import { splinePoint, splineTangent } from './tracks.js';

const BARRIER_CACHE = new Map();

/** Barrier posts matching client TrackBuilder layout. */
export function getTrackBarriers(trackDef) {
  if (BARRIER_CACHE.has(trackDef.id)) return BARRIER_CACHE.get(trackDef.id);

  const barriers = [];
  const segments = 420;
  const halfW = trackDef.roadWidth / 2;
  const postEvery = 6;
  const closed = trackDef.closed !== false;

  for (let i = 0; i < segments; i += postEvery) {
    const t = i / segments;
    const pos = splinePoint(trackDef.controlPoints, t, closed);
    const [tx, tz] = splineTangent(trackDef.controlPoints, t, closed);
    const nx = tz;
    const nz = -tx;
    for (const side of [1, -1]) {
      barriers.push({
        x: pos[0] + nx * (halfW + 1.2) * side,
        z: pos[2] + nz * (halfW + 1.2) * side,
        r: 0.35,
      });
    }
  }

  for (const cp of trackDef.checkpoints) {
    const gateHalf = trackDef.roadWidth / 2 + 1.2;
    const [px, , pz] = cp.position;
    const rotY = Math.atan2(cp.tangent[0], cp.tangent[1]);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (const side of [1, -1]) {
      const lx = side * gateHalf;
      barriers.push({ x: px + lx * cos, z: pz - lx * sin, r: 0.45 });
    }
  }

  BARRIER_CACHE.set(trackDef.id, barriers);
  return barriers;
}

const CAR_RADIUS = 1.05;

export function findBarrierHit(barriers, x, z) {
  for (const b of barriers) {
    const dist = Math.hypot(x - b.x, z - b.z);
    if (dist < b.r + CAR_RADIUS) return b;
  }
  return null;
}
