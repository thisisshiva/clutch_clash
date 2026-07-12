/** Client-side Catmull-Rom helpers (matches server tracks.js). */

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

export function sampleTrackLoop(controlPoints, samples = 120, closed = true) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const p = splinePoint(controlPoints, i / samples, closed);
    pts.push({ x: p[0], z: p[2] });
  }
  return pts;
}

/** Evenly spaced samples along the loop by arc length (accurate for long highways). */
export function sampleTrackLoopArcLength(controlPoints, samples = 200, closed = true) {
  const fineSteps = Math.max(samples * 10, 600);
  const fine = [];
  let total = 0;
  let prev = splinePoint(controlPoints, 0, closed);
  fine.push({ t: 0, x: prev[0], z: prev[2] });

  for (let i = 1; i <= fineSteps; i++) {
    const t = i / fineSteps;
    const cur = splinePoint(controlPoints, t, closed);
    const seg = Math.hypot(cur[0] - prev[0], cur[2] - prev[2]);
    total += seg;
    fine.push({ t, x: cur[0], z: cur[2], seg, total });
    prev = cur;
  }

  const pts = [{ x: fine[0].x, z: fine[0].z }];
  const step = total / samples;
  let target = step;
  let fi = 1;

  while (pts.length < samples && fi < fine.length) {
    const a = fine[fi - 1];
    const b = fine[fi];
    if (b.total >= target) {
      const segLen = b.seg || 1e-6;
      const alpha = 1 - (b.total - target) / segLen;
      pts.push({
        x: a.x + (b.x - a.x) * alpha,
        z: a.z + (b.z - a.z) * alpha,
      });
      target += step;
    } else {
      fi++;
    }
  }

  if (closed) pts.push({ x: pts[0].x, z: pts[0].z });
  else pts.push({ x: fine[fine.length - 1].x, z: fine[fine.length - 1].z });
  return pts;
}

export function trackBounds(controlPoints, padding = 20) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of controlPoints) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX: minX - padding, maxX: maxX + padding, minZ: minZ - padding, maxZ: maxZ + padding };
}

export function trackBoundsFromPoints(points, padding = 20) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - padding, maxX: maxX + padding, minZ: minZ - padding, maxZ: maxZ + padding };
}
