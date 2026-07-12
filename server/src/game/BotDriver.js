import { ROOM_STATUS } from '../rooms/Room.js';
import { splinePoint, splineTangent } from './tracks.js';
import { getCarStats } from './carCatalog.js';
import { BotPhysics } from './BotPhysics.js';
import { findBarrierHit } from './trackBarriers.js';

const BOT_NAMES = ['Ace', 'Blitz', 'Nova', 'Rex', 'Viper', 'Zara', 'Bolt', 'Dash'];
const BOT_SKILL = [0.55, 0.65, 0.72, 0.78, 0.85, 0.92];
const CAR_RADIUS = 1.05;
const CRASH_COOLDOWN = 0.45;

/**
 * AI driver — spline racing line + per-car physics, damage, and boost.
 */
export class BotDriver {
  constructor(player, track) {
    this.player = player;
    this.track = track;
    this.skill = BOT_SKILL[Math.floor(Math.random() * BOT_SKILL.length)];
    this.t = 0;
    this.lateral = 0;
    this._checkpointCooldown = 0;
    this._barrierCooldown = 0;
    this._crashCooldowns = new Map();
    this._wreckTimer = 0;
    this._syncCarStats();
  }

  static randomName(used) {
    const pool = BOT_NAMES.filter((n) => !used.has(n));
    const name = pool[Math.floor(Math.random() * pool.length)] ?? `Bot ${used.size + 1}`;
    used.add(name);
    return name;
  }

  _syncCarStats() {
    const stats = getCarStats(this.player.carModel);
    this.physics = new BotPhysics(stats);
    this.maxSpeedFactor = 0.94 + this.skill * 0.06;
  }

  /** Align spline position with the assigned grid slot at race start. */
  resetForRace(spawnSlot, track) {
    this.track = track;
    this._syncCarStats();
    this.physics.reset();
    const row = Math.floor(spawnSlot / 2);
    const distBack = 8 + row * 9;
    this.t = track.closed === false
      ? Math.max(0, (track.startT ?? 0) - distBack / track.length)
      : 1 - distBack / track.length;
    if (track.closed !== false) this.t = ((this.t % 1) + 1) % 1;
    const col = spawnSlot % 2 === 0 ? -1 : 1;
    this.lateral = col * track.roadWidth * 0.18;
    this._checkpointCooldown = 0;
    this._barrierCooldown = 0;
    this._wreckTimer = 0;
    this._crashCooldowns.clear();
    this._applySplineState(0);
  }

  update(dt, room) {
    if (room.status !== ROOM_STATUS.RACING) return;
    const progress = this.player.progress;
    if (!progress || progress.finished) return;

    if (this._wreckTimer > 0) {
      this._wreckTimer -= dt;
      this.physics.speed = 0;
      this._applySplineState(0);
      if (this._wreckTimer <= 0) this._respawn(room);
      return;
    }

    if (this.physics.health <= 0) {
      this._wreckTimer = 0.85;
      return;
    }

    this._drive(dt, room);
    this._checkBarrier(room);
    this._checkCarCollisions(room);
  }

  _drive(dt, room) {
    const track = room.track;
    const progress = this.player.progress;
    if (!this.player.state) return;

    const corner = this._cornerSeverity(track, this.physics.speed);
    const maxSpd = this.physics._tuning.maxSpeed * this.maxSpeedFactor;
    const target = maxSpd * (0.88 + (1 - corner) * 0.12);
    const throttle = corner < 0.25 ? 1 : 0.65 + (1 - corner) * 0.35;

    if (corner < 0.18 && this.physics.speed > maxSpd * 0.55 && Math.random() < 0.02) {
      this.physics.tryActivateBoost();
    }

    const speed = this.physics.step(dt, target, throttle);
    const advance = (speed * dt) / Math.max(track.length, 1);
    this.t += advance;
    this.t = track.closed === false
      ? Math.min(this.t, 1)
      : ((this.t % 1) + 1) % 1;

    this._applySplineState(speed);
    this._tryCheckpoint(dt, room, track, progress);
  }

  _cornerSeverity(track, speed) {
    const lookDist = 22 + speed * 0.2;
    const step = lookDist / Math.max(track.length, 1);
    const closed = track.closed !== false;
    const [tx0, tz0] = splineTangent(track.controlPoints, this.t, closed);
    let severity = 0;
    for (let i = 1; i <= 4; i++) {
      const [tx1, tz1] = splineTangent(track.controlPoints, this.t + step * (i / 4), closed);
      const dot = Math.min(1, Math.max(-1, tx0 * tx1 + tz0 * tz1));
      severity = Math.max(severity, Math.min(1, Math.acos(dot) / (Math.PI / 3.2)));
    }
    return severity;
  }

  _applySplineState(speed) {
    const track = this.track;
    const closed = track.closed !== false;
    const pos = splinePoint(track.controlPoints, this.t, closed);
    const [tx, tz] = splineTangent(track.controlPoints, this.t, closed);
    const nx = tz;
    const nz = -tx;

    const p = this.player.state.p;
    p[0] = pos[0] + nx * this.lateral;
    p[1] = 0;
    p[2] = pos[2] + nz * this.lateral;
    this.player.state.r = Math.atan2(tx, tz);
    this.player.state.s = speed;
    this.player.state.h = this.physics.health;
  }

  _checkBarrier(room) {
    if (this._barrierCooldown > 0) {
      this._barrierCooldown -= 1 / 20;
      return;
    }
    const hit = findBarrierHit(room.barriers, this.player.state.p[0], this.player.state.p[2]);
    if (!hit) return;
    this.physics.hitBarrier(hit.x, hit.z, this.player.state.p);
    this._barrierCooldown = 0.25;
    room._needsBroadcast = true;
  }

  _checkCarCollisions(room) {
    const px = this.player.state.p[0];
    const pz = this.player.state.p[2];
    const now = Date.now() / 1000;

    for (const other of room.players.values()) {
      if (other.id === this.player.id || !other.state) continue;

      const last = this._crashCooldowns.get(other.id) ?? 0;
      if (now - last < CRASH_COOLDOWN) continue;

      const dx = px - other.state.p[0];
      const dz = pz - other.state.p[2];
      if (Math.hypot(dx, dz) >= CAR_RADIUS * 2) continue;

      const otherStats = getCarStats(other.carModel);
      const impact = this.physics.hitCar(other.state.s ?? 0, otherStats.weight);
      if (impact === 0) continue;

      this._crashCooldowns.set(other.id, now);
      room._needsBroadcast = true;
    }
  }

  _respawn(room) {
    const progress = this.player.progress;
    const cpIdx = Math.max(0, (progress.nextCheckpoint || 1) - 1);
    const gate = room.track.checkpoints[cpIdx] ?? room.track.checkpoints[0];
    this.t = gate.t - 0.008;
    if (this.t < 0) this.t = room.track.closed === false ? 0 : this.t + 1;
    this.physics.reset();
    this._applySplineState(0);
    room._needsBroadcast = true;
  }

  _tryCheckpoint(dt, room, track, progress) {
    if (this._checkpointCooldown > 0) {
      this._checkpointCooldown -= dt;
      return;
    }
    const gate = track.checkpoints[progress.nextCheckpoint];
    if (!gate || !room.race) return;

    const px = this.player.state.p[0];
    const pz = this.player.state.p[2];
    const dist = Math.hypot(px - gate.position[0], pz - gate.position[2]);
    if (dist > track.roadWidth * 0.95) return;

    const res = room.race.handleCheckpoint(this.player.id, progress.nextCheckpoint);
    if (res?.ok) {
      this._checkpointCooldown = 1.2;
      room._needsBroadcast = true;
    }
  }
}
