/**
 * Track definitions - single source of truth for both server (checkpoint
 * validation, spawn points) and client (fetched via GET /api/tracks).
 *
 * A track is a closed uniform Catmull-Rom spline (tension 0.5), which matches
 * THREE.CatmullRomCurve3 with curveType 'catmullrom', tension 0.5, closed=true
 * exactly, so server and client agree on all world positions.
 */

const TRACK_DEFS = [
  {
    id: 'sprint',
    name: 'Sprint Circuit',
    description: 'Short fast loop - 3 checkpoints, 3 laps',
    checkpointCount: 3,
    laps: 3,
    roadWidth: 16,
    controlPoints: [
      [0, 0, -80], [120, 0, -80], [165, 0, -25], [160, 0, 60], [95, 0, 110],
      [-45, 0, 110], [-140, 0, 60], [-165, 0, -20], [-100, 0, -80],
    ],
  },
  {
    id: 'grand',
    name: 'Grand Loop',
    description: 'Technical circuit with S-curves - 5 checkpoints, 2 laps',
    checkpointCount: 5,
    laps: 2,
    roadWidth: 15,
    controlPoints: [
      [0, 0, -150], [150, 0, -150], [220, 0, -60], [180, 0, 40], [240, 0, 130],
      [150, 0, 210], [20, 0, 180], [-60, 0, 240], [-180, 0, 200], [-240, 0, 90],
      [-180, 0, -20], [-220, 0, -120], [-120, 0, -180],
    ],
  },
  {
    id: 'endurance',
    name: 'Endurance Ring',
    description: 'Longest and toughest - 10 checkpoints, 2 laps',
    checkpointCount: 10,
    laps: 2,
    roadWidth: 14,
    controlPoints: [
      [0, 0, -260], [180, 0, -270], [300, 0, -200], [330, 0, -70], [260, 0, 20],
      [320, 0, 120], [280, 0, 240], [150, 0, 300], [30, 0, 250], [-80, 0, 310],
      [-200, 0, 280], [-290, 0, 180], [-250, 0, 70], [-320, 0, -30], [-280, 0, -150],
      [-150, 0, -210], [-60, 0, -160], [60, 0, -200],
    ],
  },
];

const MAX_PLAYERS = 8;

/** Evaluate closed uniform Catmull-Rom spline (tension 0.5) at t in [0,1). */
export function splinePoint(points, t) {
  const n = points.length;
  const p = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(p) % n;
  const u = p - Math.floor(p);
  const p0 = points[(i - 1 + n) % n];
  const p1 = points[i];
  const p2 = points[(i + 1) % n];
  const p3 = points[(i + 2) % n];
  const u2 = u * u;
  const u3 = u2 * u;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (
      2 * p1[k] +
      (-p0[k] + p2[k]) * u +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3
    );
  }
  return out;
}

/** Normalized XZ tangent of the spline at t. */
export function splineTangent(points, t) {
  const eps = 0.0005;
  const a = splinePoint(points, t - eps);
  const b = splinePoint(points, t + eps);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

function measureLength(points, samples = 512) {
  let length = 0;
  let prev = splinePoint(points, 0);
  for (let i = 1; i <= samples; i++) {
    const cur = splinePoint(points, i / samples);
    length += Math.hypot(cur[0] - prev[0], cur[2] - prev[2]);
    prev = cur;
  }
  return length;
}

/**
 * Grid spawn slots behind the start line: two columns, rows going backwards
 * along the track. Car heading convention: forward = (sin(ry), cos(ry)) in XZ.
 */
function buildSpawnPoints(def, length) {
  const spawns = [];
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    const row = Math.floor(slot / 2);
    const col = slot % 2 === 0 ? -1 : 1;
    const distBack = 8 + row * 9;
    const t = 1 - distBack / length;
    const pos = splinePoint(def.controlPoints, t);
    const [tx, tz] = splineTangent(def.controlPoints, t);
    // Perpendicular (right of travel direction) in XZ.
    const nx = tz;
    const nz = -tx;
    const lateral = col * def.roadWidth * 0.22;
    spawns.push({
      position: [pos[0] + nx * lateral, 0, pos[2] + nz * lateral],
      heading: Math.atan2(tx, tz),
    });
  }
  return spawns;
}

function enrich(def) {
  const length = measureLength(def.controlPoints);
  const checkpoints = [];
  for (let i = 0; i < def.checkpointCount; i++) {
    const t = i / def.checkpointCount;
    const position = splinePoint(def.controlPoints, t);
    const [tx, tz] = splineTangent(def.controlPoints, t);
    checkpoints.push({
      index: i,
      t,
      position,
      tangent: [tx, tz],
      heading: Math.atan2(tx, tz),
    });
  }
  return {
    ...def,
    length: Math.round(length),
    maxPlayers: MAX_PLAYERS,
    checkpoints,
    spawnPoints: buildSpawnPoints(def, length),
  };
}

const ENRICHED = new Map(TRACK_DEFS.map((def) => [def.id, enrich(def)]));

export function getTrackList() {
  return [...ENRICHED.values()].map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    checkpointCount: t.checkpointCount,
    laps: t.laps,
    length: t.length,
  }));
}

export function getTrack(id) {
  return ENRICHED.get(id) || null;
}

export function getAllTracks() {
  return [...ENRICHED.values()];
}

export const DEFAULT_TRACK_ID = TRACK_DEFS[0].id;
