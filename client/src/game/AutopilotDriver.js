import { splinePoint, splineTangent } from './spline.js';

/**
 * Client autopilot for theater mode — cruises the track spline at a scenic pace.
 */
export class AutopilotDriver {
  constructor(trackDef) {
    this.trackDef = trackDef;
    this.t = trackDef.startT ?? 0;
    this.lateral = 0;
    this.speed = 0;
    this.active = false;
    this.cruiseSpeed = 38;
    this.direction = 1;
  }

  start() {
    this.active = true;
    this.t = this.trackDef.startT ?? (this.trackDef.closed === false ? 0.01 : 0);
    this.speed = 0;
    this.direction = 1;
  }

  stop() {
    this.active = false;
  }

  /** Write pose into CarPhysics for visuals / camera / engine audio. */
  update(dt, physics) {
    if (!this.active) return;

    const track = this.trackDef;
    const closed = track.closed !== false;
    const accel = 12;
    if (this.speed < this.cruiseSpeed) {
      this.speed = Math.min(this.cruiseSpeed, this.speed + accel * dt);
    }

    this.t += ((this.speed * dt) / Math.max(track.length, 1)) * this.direction;
    if (closed) {
      this.t = ((this.t % 1) + 1) % 1;
    } else {
      const startT = track.startT ?? 0.01;
      const endT = 0.985;
      if (this.t >= endT) {
        this.t = endT;
        if (this.direction !== -1) this.onDirectionChange?.(-1);
        this.direction = -1;
      } else if (this.t <= startT) {
        this.t = startT;
        if (this.direction !== 1) this.onDirectionChange?.(1);
        this.direction = 1;
      }
    }

    const pos = splinePoint(track.controlPoints, this.t, closed);
    const [tx, tz] = splineTangent(track.controlPoints, this.t, closed);
    const heading = Math.atan2(tx * this.direction, tz * this.direction);
    const nx = tz;
    const nz = -tx;

    physics.position.x = pos[0] + nx * this.lateral;
    physics.position.y = 0;
    physics.position.z = pos[2] + nz * this.lateral;
    physics.heading = heading;
    physics.speed = this.speed;
    physics.velocity.x = Math.sin(heading) * this.speed;
    physics.velocity.z = Math.cos(heading) * this.speed;
    physics.steer = 0;
    physics.steerVisual += (0 - physics.steerVisual) * Math.min(1, dt * 5);
  }
}
