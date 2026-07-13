/**
 * Track definitions - single source of truth for both server (checkpoint
 * validation, spawn points) and client (fetched via GET /api/tracks).
 *
 * Tracks use uniform Catmull-Rom splines (tension 0.5), matching THREE's
 * CatmullRomCurve3. Most are loops; point-to-point tracks set closed=false.
 */

const CIRCLE_RADIUS = 95;
const CIRCLE_POINTS = 14;

/** Compact oval circuit — good starter track. */
const SPRINT_CONTROL_POINTS = Array.from({ length: CIRCLE_POINTS }, (_, i) => {
  const a = (i / CIRCLE_POINTS) * Math.PI * 2;
  return [
    Math.round(Math.sin(a) * CIRCLE_RADIUS),
    0,
    Math.round(Math.cos(a) * CIRCLE_RADIUS),
  ];
});

/** Long straights with gentle curves — stadium loop (8 control points, no infield cut-through). */
const HIGHWAY_CONTROL_POINTS = [
  [0, 0, -270],
  [-210, 0, -270],
  [-210, 0, 0],
  [-210, 0, 270],
  [0, 0, 270],
  [210, 0, 270],
  [210, 0, 0],
  [210, 0, -270],
];

/** 10km+ capsule highway: two very long straights with gentle rounded ends. */
const MEGA_STRAIGHT_CONTROL_POINTS = [
  [0, 0, -2600],
  [260, 0, -2580],
  [430, 0, -2350],
  [430, 0, -900],
  [430, 0, 900],
  [430, 0, 2350],
  [260, 0, 2580],
  [0, 0, 2600],
  [-260, 0, 2580],
  [-430, 0, 2350],
  [-430, 0, 900],
  [-430, 0, -900],
  [-430, 0, -2350],
  [-260, 0, -2580],
];

/** 10 km point-to-point Kutch causeway. */
const ROAD_TO_HEAVEN_CONTROL_POINTS = [
  [0, 0, -5100],
  [0, 0, -2575],
  [0, 0, -50],
  [0, 0, 2475],
  [0, 0, 5000],
];

const TRACK_DEFS = [
  {
    id: 'sprint',
    name: 'Sprint Circuit',
    description: 'Tight circular loop — learn the basics',
    atmosphere: 'day',
    checkpointCount: 3,
    laps: 3,
    roadWidth: 16,
    controlPoints: SPRINT_CONTROL_POINTS,
  },
  {
    id: 'highway',
    name: 'Highway Run',
    description: 'Long straights with a few sweeping curves',
    atmosphere: 'day',
    checkpointCount: 5,
    laps: 2,
    roadWidth: 18,
    controlPoints: HIGHWAY_CONTROL_POINTS,
  },
  {
    id: 'highway-rain',
    name: 'Twilight Rain',
    description: 'Same highway layout — rainy evening run',
    atmosphere: 'rain-evening',
    checkpointCount: 5,
    laps: 2,
    roadWidth: 18,
    controlPoints: HIGHWAY_CONTROL_POINTS,
  },
  {
    id: 'mega-straight',
    name: 'Mega Straight',
    description: 'Ultra-long 3-lane highway loop (12km+)',
    atmosphere: 'day',
    checkpointCount: 12,
    laps: 1,
    laneCount: 3,
    roadWidth: 24,
    controlPoints: MEGA_STRAIGHT_CONTROL_POINTS,
  },
  {
    id: 'road-to-heaven',
    name: 'Road to Heaven',
    description: 'Kutch causeway — blue water on one side, white salt desert on the other',
    atmosphere: 'rann-heaven',
    closed: false,
    startT: 0.01,
    checkpointCount: 6,
    laps: 1,
    laneCount: 2,
    roadWidth: 13,
    trafficCount: 8,
    noBarriers: true,
    controlPoints: ROAD_TO_HEAVEN_CONTROL_POINTS,
  },
  {
    id: 'road-to-heaven-snow',
    name: 'Frozen Heaven',
    description: 'Night causeway through snow and ice — same long run under moon and stars',
    atmosphere: 'snow-heaven',
    closed: false,
    startT: 0.01,
    checkpointCount: 6,
    laps: 1,
    laneCount: 2,
    roadWidth: 13,
    trafficCount: 8,
    noBarriers: true,
    controlPoints: ROAD_TO_HEAVEN_CONTROL_POINTS,
  },
  {
    id: 'north-path',
    name: 'Come to Canada',
    description: 'Frozen Heaven skies — GetNorthPath brand run along the causeway',
    atmosphere: 'snow-heaven',
    closed: false,
    startT: 0.01,
    checkpointCount: 6,
    laps: 1,
    laneCount: 2,
    roadWidth: 13,
    trafficCount: 8,
    noBarriers: true,
    controlPoints: ROAD_TO_HEAVEN_CONTROL_POINTS,
  },
];

const MAX_PLAYERS = 8;

/** Evaluate uniform Catmull-Rom spline (tension 0.5) at t in [0,1]. */
export function splinePoint(points, t, closed = true) {
  const n = points.length;
  const normalizedT = closed ? (((t % 1) + 1) % 1) : Math.max(0, Math.min(1, t));
  const p = normalizedT * (closed ? n : n - 1);
  const i = closed ? Math.floor(p) % n : Math.min(Math.floor(p), n - 2);
  const u = !closed && normalizedT === 1 ? 1 : p - Math.floor(p);
  const p1 = points[i];
  const p2 = points[closed ? (i + 1) % n : i + 1];
  const p0 = closed
    ? points[(i - 1 + n) % n]
    : i > 0 ? points[i - 1] : p1.map((value, k) => value * 2 - p2[k]);
  const p3 = closed
    ? points[(i + 2) % n]
    : i + 2 < n ? points[i + 2] : p2.map((value, k) => value * 2 - p1[k]);
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
export function splineTangent(points, t, closed = true) {
  const eps = 0.0005;
  const a = splinePoint(points, t - eps, closed);
  const b = splinePoint(points, t + eps, closed);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

function measureLength(points, closed = true, samples = 512) {
  let length = 0;
  let prev = splinePoint(points, 0, closed);
  for (let i = 1; i <= samples; i++) {
    const cur = splinePoint(points, i / samples, closed);
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
  const closed = def.closed !== false;
  const startT = closed ? 0 : (def.startT ?? 0);
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    const row = Math.floor(slot / 2);
    const col = slot % 2 === 0 ? -1 : 1;
    const distBack = 8 + row * 9;
    const t = closed ? 1 - distBack / length : startT;
    const pos = splinePoint(def.controlPoints, t, closed);
    const [tx, tz] = splineTangent(def.controlPoints, t, closed);
    if (!closed) {
      pos[0] -= tx * distBack;
      pos[2] -= tz * distBack;
    }
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
  const closed = def.closed !== false;
  const length = measureLength(def.controlPoints, closed);
  const startT = closed ? 0 : (def.startT ?? 0);
  const checkpoints = [];
  for (let i = 0; i < def.checkpointCount; i++) {
    const t = closed
      ? i / def.checkpointCount
      : startT + (1 - startT) * i / (def.checkpointCount - 1);
    const position = splinePoint(def.controlPoints, t, closed);
    const [tx, tz] = splineTangent(def.controlPoints, t, closed);
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
    atmosphere: def.atmosphere || 'day',
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
    atmosphere: t.atmosphere,
    laneCount: t.laneCount || 1,
    checkpointCount: t.checkpointCount,
    laps: t.laps,
    length: t.length,
    trafficCount: t.trafficCount,
  }));
}

export function getTrack(id) {
  return ENRICHED.get(id) || null;
}

export function getAllTracks() {
  return [...ENRICHED.values()];
}

export const DEFAULT_TRACK_ID = TRACK_DEFS[0].id;
