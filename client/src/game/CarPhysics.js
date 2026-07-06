/**
 * Arcade car physics - kinematic bicycle-ish model on the XZ plane.
 * Tuned for fun: strong grip, light drift with handbrake, off-track slowdown.
 */

const TUNING = {
  maxSpeed: 58,          // m/s (~209 km/h)
  maxReverse: -12,
  engineAccel: 26,
  brakeAccel: 46,
  drag: 0.55,            // quadratic-ish damping factor
  rollingResistance: 2.2,
  steerSpeed: 2.4,       // rad/s at low speed
  steerLimitAtSpeed: 0.42, // steering authority falloff at top speed
  grip: 7.0,             // lateral velocity kill rate
  handbrakeGrip: 1.6,
  offTrackFriction: 14,
  offTrackMaxSpeed: 18,
};

export class CarPhysics {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.heading = 0;          // rotation around Y; forward = (sin, cos)
    this.velocity = { x: 0, z: 0 };
    this.speed = 0;            // signed forward speed (for HUD/audio)
    this.steerVisual = 0;      // smoothed steer for wheel visuals
  }

  reset(position, heading) {
    this.position.x = position[0];
    this.position.y = position[1] ?? 0;
    this.position.z = position[2];
    this.heading = heading;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.speed = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {{throttle:number, steer:number, handbrake:boolean}} input
   * @param {boolean} onTrack
   */
  step(dt, input, onTrack) {
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);

    // Decompose velocity into forward/lateral components.
    let vFwd = this.velocity.x * fwdX + this.velocity.z * fwdZ;
    let vLat = this.velocity.x * fwdZ - this.velocity.z * fwdX;

    // Engine / brake.
    if (input.throttle > 0) {
      vFwd += TUNING.engineAccel * input.throttle * dt;
    } else if (input.throttle < 0) {
      const decel = vFwd > 0.5 ? TUNING.brakeAccel : TUNING.engineAccel * 0.5;
      vFwd += decel * input.throttle * dt;
    }

    // Resistance.
    vFwd -= (TUNING.rollingResistance + Math.abs(vFwd) * TUNING.drag) * Math.sign(vFwd) * dt;
    if (!onTrack) {
      vFwd -= TUNING.offTrackFriction * Math.sign(vFwd) * dt;
      const cap = TUNING.offTrackMaxSpeed;
      vFwd = Math.max(-cap, Math.min(cap, vFwd));
    }
    vFwd = Math.max(TUNING.maxReverse, Math.min(TUNING.maxSpeed, vFwd));
    if (Math.abs(vFwd) < 0.05 && input.throttle === 0) vFwd = 0;

    // Steering - authority shrinks with speed so top speed feels stable.
    const speedRatio = Math.min(Math.abs(vFwd) / TUNING.maxSpeed, 1);
    const authority = 1 - (1 - TUNING.steerLimitAtSpeed) * speedRatio;
    const steerAmount = input.steer * TUNING.steerSpeed * authority;
    // Only steer while moving; reverse flips steering like a real car.
    const moveFactor = Math.min(Math.abs(vFwd) / 6, 1) * Math.sign(vFwd || 1);
    this.heading += steerAmount * moveFactor * dt;

    // Lateral grip - bleed sideways velocity (less with handbrake = drift).
    const grip = input.handbrake ? TUNING.handbrakeGrip : TUNING.grip;
    vLat *= Math.max(0, 1 - grip * dt);
    if (input.handbrake) {
      vFwd -= TUNING.brakeAccel * 0.35 * Math.sign(vFwd) * dt;
    }

    // Recompose and integrate.
    const nFwdX = Math.sin(this.heading);
    const nFwdZ = Math.cos(this.heading);
    this.velocity.x = nFwdX * vFwd + nFwdZ * vLat;
    this.velocity.z = nFwdZ * vFwd - nFwdX * vLat;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.speed = vFwd;

    // Smooth steering value for front wheel visuals.
    this.steerVisual += (input.steer * 0.45 - this.steerVisual) * Math.min(dt * 10, 1);
  }

  get speedKmh() {
    return Math.abs(Math.round(this.speed * 3.6));
  }
}
