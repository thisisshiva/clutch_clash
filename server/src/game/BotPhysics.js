const BASE = {
  maxSpeed: 58,
  engineAccel: 26,
  drag: 0.55,
  rollingResistance: 2.2,
};

const BOOST_DURATION = 5;
const BOOST_COOLDOWN = 10;
const STAT_SCALE = 1 / 80;

/**
 * Lightweight physics for server-side bots — mirrors client CarPhysics tuning.
 */
export class BotPhysics {
  constructor(stats) {
    this.stats = stats;
    this.maxHealth = stats.health;
    this.health = stats.health;
    this.speed = 0;
    this.boostActive = false;
    this.boostTimeLeft = 0;
    this.boostCooldown = 0;
    this._tuning = this._buildTuning(stats);
  }

  _buildTuning(stats) {
    return {
      maxSpeed: BASE.maxSpeed * (0.75 + stats.speed * STAT_SCALE * 0.35),
      engineAccel: BASE.engineAccel * (0.7 + stats.power * STAT_SCALE * 0.45),
      drag: BASE.drag,
      rollingResistance: BASE.rollingResistance,
      boostMultiplier: 1.2 + stats.boost * STAT_SCALE * 0.55,
      weight: stats.weight,
    };
  }

  reset() {
    this.health = this.maxHealth;
    this.speed = 0;
    this.boostActive = false;
    this.boostTimeLeft = 0;
    this.boostCooldown = 0;
  }

  get healthRatio() {
    return this.health / this.maxHealth;
  }

  tryActivateBoost() {
    if (this.boostActive || this.boostCooldown > 0) return false;
    this.boostActive = true;
    this.boostTimeLeft = BOOST_DURATION;
    return true;
  }

  /** Accelerate / brake toward a target speed using this car's stats. */
  step(dt, targetSpeed, throttle) {
    if (this.boostActive) {
      this.boostTimeLeft -= dt;
      if (this.boostTimeLeft <= 0) {
        this.boostActive = false;
        this.boostCooldown = BOOST_COOLDOWN;
      }
    } else if (this.boostCooldown > 0) {
      this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    }

    const T = this._tuning;
    const boostMul = this.boostActive ? T.boostMultiplier : 1;
    const maxSpd = T.maxSpeed * boostMul;
    const aim = Math.min(targetSpeed, maxSpd);

    if (this.speed < aim) {
      this.speed += T.engineAccel * boostMul * throttle * dt;
    } else if (this.speed > aim) {
      this.speed -= T.engineAccel * 0.85 * dt;
    }

    this.speed -= (T.rollingResistance + Math.abs(this.speed) * T.drag)
      * Math.sign(this.speed || 1) * dt;
    this.speed = Math.max(0, Math.min(maxSpd, this.speed));
    return this.speed;
  }

  hitBarrier(barrierX, barrierZ, pos) {
    const spd = Math.abs(this.speed);
    const loss = Math.min(0.72, 0.28 + spd / 85);
    this.speed *= 1 - loss;

    const dx = pos[0] - barrierX;
    const dz = pos[2] - barrierZ;
    const dist = Math.hypot(dx, dz) || 1;
    const push = 0.35 + loss * 0.25;
    pos[0] += (dx / dist) * push;
    pos[2] += (dz / dist) * push;

    if (spd > 10) {
      this.health = Math.max(0, this.health - Math.round(1 + spd * 0.06));
    }
    return loss;
  }

  hitCar(otherSpeed, otherWeight) {
    const impact = Math.min(1, (Math.abs(this.speed) + Math.abs(otherSpeed)) / 70);
    if (impact < 0.08) return 0;

    const weightRatio = otherWeight / Math.max(this._tuning.weight + otherWeight, 1);
    const loss = impact * (0.35 + weightRatio * 0.4);
    this.speed *= Math.max(0.15, 1 - loss);
    this.health = Math.max(0, this.health - Math.round(impact * 14 * weightRatio));
    return impact;
  }
}
