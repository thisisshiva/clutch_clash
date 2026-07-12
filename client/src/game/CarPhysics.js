/**
 * Arcade car physics — stats-driven kinematic model on the XZ plane.
 */

const BASE = {
  maxSpeed: 58,
  maxReverse: -12,
  engineAccel: 26,
  brakeAccel: 46,
  drag: 0.55,
  rollingResistance: 2.2,
  steerSpeed: 2.4,
  steerLimitAtSpeed: 0.42,
  grip: 7.0,
  handbrakeGrip: 1.6,
  offTrackFriction: 14,
  offTrackMaxSpeed: 18,
  offTrackMaxReverse: 8.3,
};

const BOOST_DURATION = 5;
const BOOST_COOLDOWN = 10;
const STAT_SCALE = 1 / 80;
const DAMAGE_SPIN_THRESHOLD = 0.18;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function headingDeltaAbs(a, b) {
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(d);
}

export class CarPhysics {
  /**
   * @param {{ speed:number, power:number, health:number, grip:number, weight:number, boost:number }} stats
   */
  constructor(stats) {
    this.stats = stats;
    this.position = { x: 0, y: 0, z: 0 };
    this.heading = 0;
    this.velocity = { x: 0, z: 0 };
    this.speed = 0;
    this.steerVisual = 0;

    this.maxHealth = stats.health;
    this.health = stats.health;

    this.boostActive = false;
    this.boostTimeLeft = 0;
    this.boostCooldown = 0;

    this._tuning = this._buildTuning(stats);
  }

  _buildTuning(stats) {
    return {
      maxSpeed: BASE.maxSpeed * (0.75 + stats.speed * STAT_SCALE * 0.35),
      maxReverse: BASE.maxReverse,
      engineAccel: BASE.engineAccel * (0.7 + stats.power * STAT_SCALE * 0.45),
      brakeAccel: BASE.brakeAccel,
      drag: BASE.drag,
      rollingResistance: BASE.rollingResistance,
      steerSpeed: BASE.steerSpeed * (0.8 + stats.grip * STAT_SCALE * 0.35),
      steerLimitAtSpeed: BASE.steerLimitAtSpeed,
      grip: BASE.grip * (0.75 + stats.grip * STAT_SCALE * 0.4),
      handbrakeGrip: BASE.handbrakeGrip,
      offTrackFriction: BASE.offTrackFriction,
      offTrackMaxSpeed: BASE.offTrackMaxSpeed,
      offTrackMaxReverse: BASE.offTrackMaxReverse,
      boostMultiplier: 1.2 + stats.boost * STAT_SCALE * 0.55,
      weight: stats.weight,
    };
  }

  reset(position, heading) {
    this.position.x = position[0];
    this.position.y = position[1] ?? 0;
    this.position.z = position[2];
    this.heading = heading;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.speed = 0;
    this.health = this.maxHealth;
    this.boostActive = false;
    this.boostTimeLeft = 0;
    this.boostCooldown = 0;
  }

  tryActivateBoost() {
    if (this.boostActive || this.boostCooldown > 0) return false;
    this.boostActive = true;
    this.boostTimeLeft = BOOST_DURATION;
    return true;
  }

  get boostRatio() {
    if (!this.boostActive) return 0;
    return this.boostTimeLeft / BOOST_DURATION;
  }

  get boostCooldownRatio() {
    if (this.boostCooldown <= 0) return 0;
    return this.boostCooldown / BOOST_COOLDOWN;
  }

  get healthRatio() {
    return this.health / this.maxHealth;
  }

  /** Scrape a barrier — bleed speed and nudge away from the pole. */
  hitBarrier(barrierX, barrierZ) {
    const spd = Math.abs(this.speed);
    const normalX = this.position.x - barrierX;
    const normalZ = this.position.z - barrierZ;
    const normalLen = Math.hypot(normalX, normalZ) || 1;
    const nx = normalX / normalLen;
    const nz = normalZ / normalLen;

    const vLen = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const vx = this.velocity.x / vLen;
    const vz = this.velocity.z / vLen;
    // 1.0 -> direct head-first hit into pole normal, 0 -> glancing scrape.
    const headOnFactor = clamp01(-(vx * nx + vz * nz));
    const loss = Math.min(0.78, 0.18 + spd / 110 + headOnFactor * 0.42);

    this.speed *= 1 - loss;
    this.velocity.x *= 1 - loss;
    this.velocity.z *= 1 - loss;

    const push = 0.35 + loss * 0.25;
    this.position.x += nx * push;
    this.position.z += nz * push;

    if (spd > 10) {
      const barrierDamage = Math.round((0.6 + headOnFactor * 1.2) * (1 + spd * 0.045));
      this.health = Math.max(0, this.health - barrierDamage);
    }

    return loss;
  }

  /**
   * Car-to-car crash — damage scales with relative speed, angle and mass transfer.
   * @returns {number} impact severity 0–1 for VFX
   */
  hitCar(otherSpeed, otherWeight, otherHeading = this.heading + Math.PI) {
    const relSpeed = Math.abs(this.speed - otherSpeed);
    const closing = Math.min(1, (Math.abs(this.speed) + Math.abs(otherSpeed)) / 95);
    const impact = Math.min(1, relSpeed / 55 + closing * 0.45);
    if (impact < 0.08) return 0;

    const angle = headingDeltaAbs(this.heading, otherHeading);
    const headOnFactor = clamp01((angle - 1.7) / (Math.PI - 1.7)); // starts increasing near ~97 deg+
    const sideFactor = clamp01(1 - Math.abs(angle - Math.PI / 2) / (Math.PI / 2));
    const angleImpact = 0.65 + headOnFactor * 0.75 + sideFactor * 0.18;

    const myWeight = this._tuning.weight;
    const weightRatio = otherWeight / Math.max(myWeight + otherWeight, 1);
    const loss = impact * angleImpact * (0.24 + weightRatio * 0.46);

    this.speed *= Math.max(0.15, 1 - loss);
    this.velocity.x *= Math.max(0.15, 1 - loss);
    this.velocity.z *= Math.max(0.15, 1 - loss);

    // Touching another car (side/brush) is lighter; true head-on is much heavier.
    const damage = Math.round(impact * angleImpact * (7 + 15 * weightRatio));
    this.health = Math.max(0, this.health - damage);
    return impact;
  }

  /**
   * @param {number} dt seconds
   * @param {{throttle:number, steer:number, handbrake:boolean, boost:boolean}} input
   * @param {boolean} onTrack
   */
  step(dt, input, onTrack) {
    if (input.boost) this.tryActivateBoost();

    if (this.boostActive) {
      this.boostTimeLeft -= dt;
      if (this.boostTimeLeft <= 0) {
        this.boostActive = false;
        this.boostTimeLeft = 0;
        this.boostCooldown = BOOST_COOLDOWN;
      }
    } else if (this.boostCooldown > 0) {
      this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    }

    const T = this._tuning;
    const healthRatio = this.healthRatio;
    const damageRatio = 1 - healthRatio;
    const damageSpeedMul = 1 - Math.min(0.62, damageRatio * 0.68);
    const damageAccelMul = 1 - Math.min(0.55, damageRatio * 0.58);
    const damageGripPenalty = 1 - Math.min(0.42, damageRatio * 0.5);
    const boostMul = this.boostActive ? T.boostMultiplier : 1;
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);

    let vFwd = this.velocity.x * fwdX + this.velocity.z * fwdZ;
    let vLat = this.velocity.x * fwdZ - this.velocity.z * fwdX;

    if (input.throttle > 0) {
      vFwd += T.engineAccel * damageAccelMul * boostMul * input.throttle * dt;
    } else if (input.throttle < 0) {
      const decel = vFwd > 0.5 ? T.brakeAccel : T.engineAccel * 0.5 * damageAccelMul;
      vFwd += decel * input.throttle * dt;
    }

    vFwd -= (T.rollingResistance + Math.abs(vFwd) * T.drag) * Math.sign(vFwd || 1) * dt;
    if (!onTrack) {
      // Grass drags the car, but the engine can still push it in reverse:
      // only oppose reverse motion while coasting/braking, not when actively reversing.
      const friction = T.offTrackFriction * dt;
      if (vFwd > 0) vFwd = Math.max(0, vFwd - friction);
      else if (vFwd < 0 && input.throttle >= 0) vFwd = Math.min(0, vFwd + friction);
      vFwd = Math.max(-T.offTrackMaxReverse, Math.min(T.offTrackMaxSpeed, vFwd));
    }

    const maxSpd = T.maxSpeed * boostMul * damageSpeedMul;
    vFwd = Math.max(T.maxReverse, Math.min(maxSpd, vFwd));
    if (Math.abs(vFwd) < 0.05 && input.throttle === 0) vFwd = 0;

    const speedRatio = Math.min(Math.abs(vFwd) / maxSpd, 1);
    const authority = 1 - (1 - T.steerLimitAtSpeed) * speedRatio;
    const steerAmount = input.steer * T.steerSpeed * authority;
    const moveFactor = Math.min(Math.abs(vFwd) / 6, 1) * Math.sign(vFwd || 1);
    this.heading += steerAmount * moveFactor * dt;

    const grip = (input.handbrake ? T.handbrakeGrip : T.grip) * damageGripPenalty;
    vLat *= Math.max(0, 1 - grip * dt);
    if (input.handbrake) {
      vFwd -= T.brakeAccel * 0.35 * Math.sign(vFwd || 1) * dt;
    }

    const nFwdX = Math.sin(this.heading);
    const nFwdZ = Math.cos(this.heading);
    this.velocity.x = nFwdX * vFwd + nFwdZ * vLat;
    this.velocity.z = nFwdZ * vFwd - nFwdX * vLat;

    // Moderate/high damage destabilizes car orientation and path.
    if (healthRatio < 0.5) {
      const unstable = (0.5 - healthRatio) / 0.5;
      const wobble = Math.sin(performance.now() * 0.008 + this.position.x * 0.03) * unstable;
      this.heading += wobble * dt * 0.28;
      this.velocity.x += -nFwdZ * unstable * 0.12 * dt;
      this.velocity.z += nFwdX * unstable * 0.12 * dt;
    }

    // Critical damage: car starts to rotate/spin out aggressively.
    if (healthRatio < DAMAGE_SPIN_THRESHOLD && Math.abs(vFwd) > 5) {
      const spin = (DAMAGE_SPIN_THRESHOLD - healthRatio) / DAMAGE_SPIN_THRESHOLD;
      this.heading += Math.sign(vFwd || 1) * spin * dt * 2.4;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.speed = vFwd;

    this.steerVisual += (input.steer * 0.45 - this.steerVisual) * Math.min(dt * 10, 1);
  }

  get speedKmh() {
    return Math.abs(Math.round(this.speed * 3.6));
  }
}
