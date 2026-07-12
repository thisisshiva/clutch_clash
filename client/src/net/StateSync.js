/**
 * Snapshot interpolation for remote players. We render remote cars ~100ms in
 * the past and interpolate between the two snapshots surrounding that time,
 * which hides network jitter at 20Hz server ticks.
 */

const INTERP_DELAY_MS = 100;
const BUFFER_MAX = 20;

export class StateSync {
  constructor() {
    /** @type {Map<string, Array<{t:number, p:number[], r:number, s:number}>>} */
    this.buffers = new Map();
    this._clockOffset = 0; // serverTime - clientTime estimate
  }

  ingest(snapshot) {
    const now = Date.now();
    // Simple clock offset smoothing.
    const offset = snapshot.t - now;
    this._clockOffset = this._clockOffset === 0
      ? offset
      : this._clockOffset * 0.9 + offset * 0.1;

    for (const [id, state] of Object.entries(snapshot.players)) {
      let buf = this.buffers.get(id);
      if (!buf) {
        buf = [];
        this.buffers.set(id, buf);
      }
      buf.push({ t: snapshot.t, p: state.p, r: state.r, s: state.s, h: state.h });
      if (buf.length > BUFFER_MAX) buf.shift();
    }
  }

  remove(id) {
    this.buffers.delete(id);
  }

  clear() {
    this.buffers.clear();
    this._clockOffset = 0;
  }

  /**
   * Interpolated state for a player at render time, or null if no data.
   * @returns {{p:number[], r:number, s:number}|null}
   */
  sample(id) {
    const buf = this.buffers.get(id);
    if (!buf || buf.length === 0) return null;

    const renderTime = Date.now() + this._clockOffset - INTERP_DELAY_MS;

    if (buf.length === 1 || renderTime <= buf[0].t) return buf[0];
    const last = buf[buf.length - 1];
    if (renderTime >= last.t) return last;

    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (renderTime >= a.t && renderTime <= b.t) {
        const u = (renderTime - a.t) / Math.max(b.t - a.t, 1);
        return {
          p: [
            a.p[0] + (b.p[0] - a.p[0]) * u,
            a.p[1] + (b.p[1] - a.p[1]) * u,
            a.p[2] + (b.p[2] - a.p[2]) * u,
          ],
          r: lerpAngle(a.r, b.r, u),
          s: a.s + (b.s - a.s) * u,
          h: a.h != null && b.h != null ? a.h + (b.h - a.h) * u : (b.h ?? a.h),
        };
      }
    }
    return last;
  }
}

function lerpAngle(a, b, u) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}
