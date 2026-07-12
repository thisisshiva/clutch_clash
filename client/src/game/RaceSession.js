import * as THREE from 'three';
import { createCar, disposeCar, applyDamageWear, spinWheels } from './CarFactory.js';
import { CarPhysics } from './CarPhysics.js';
import { TrackBuilder } from './TrackBuilder.js';
import { applyTrackEnvironment } from './TrackEnvironment.js';
import { CheckpointSystem } from './CheckpointSystem.js';
import { EngineSound } from '../voice/SpatialAudio.js';
import { CrashEffect } from './CrashEffect.js';
import { DamageVfx, WRECK_DURATION } from './DamageVfx.js';
import { BoostVfx } from './BoostVfx.js';
import { TrafficManager } from './TrafficManager.js';
import { getCarStats, getCarDef } from './carCatalog.js';
import { socketClient } from '../net/SocketClient.js';
import { AutopilotDriver } from './AutopilotDriver.js';
import { TireTrail } from './TireTrail.js';

const NET_SEND_HZ = 20;
const CAR_RADIUS = 1.05;
const CRASH_COOLDOWN_MS = 450;
const DAMAGE_SHAKE_DURATION = 2.0;

/** Press C to cycle through these camera modes. */
const CAMERA_MODES = [
  { id: 'chase', label: 'Chase', kind: 'chase', distance: 13, height: 6, lookAt: 1.4, fov: 70, lerp: 5, speedPull: 1.5, speedFov: 14 },
  { id: 'close', label: 'Close', kind: 'chase', distance: 7, height: 3.2, lookAt: 0.95, fov: 58, lerp: 7, speedPull: 0.9, speedFov: 8 },
  { id: 'cinematic', label: 'Cinematic', kind: 'chase', distance: 19, height: 9, lookAt: 1.2, fov: 62, lerp: 4, speedPull: 2.2, speedFov: 16 },
  { id: 'side', label: 'Side', kind: 'side', distance: 8, height: 3.6, lateral: 6.5, lookAt: 1.0, fov: 60, lerp: 6, speedPull: 1.0, speedFov: 10 },
];

/** Auto-cycled cinematic presets for theater mode (slow lerp = long glide). */
const THEATER_CAMERA_MODES = [
  { id: 'low', label: 'Low', kind: 'chase', distance: 8.5, height: 1.45, lookAt: 1.6, fov: 74, lerp: 0.7, speedPull: 0.5, speedFov: 8 },
  { id: 'side', label: 'Side', kind: 'side', distance: 11, height: 3.4, lateral: 10, lookAt: 1.05, fov: 54, lerp: 0.6, speedPull: 1.1, speedFov: 5 },
  { id: 'aerial', label: 'Aerial', kind: 'chase', distance: 26, height: 22, lookAt: 0.55, fov: 48, lerp: 0.5, speedPull: 2.4, speedFov: 3 },
  { id: 'orbit', label: 'Orbit', kind: 'orbit', distance: 14, height: 6, lookAt: 1.2, fov: 56, lerp: 0.5, orbitSpeed: 0.16, speedFov: 4 },
  { id: 'hero', label: 'Hero', kind: 'chase', distance: 15, height: 5.2, lookAt: 1.15, fov: 56, lerp: 0.65, speedPull: 1.6, speedFov: 6 },
];

/**
 * One race on one track: local car + physics + checkpoints + chase camera +
 * network state publishing + engine audio. Remote cars are handled by
 * RemotePlayers (shared with the lobby), this class only drives the update loop.
 */
export class RaceSession {
  static async create(engine, input, trackDef, carModelId, stateSync, getPlayers, options = {}) {
    const session = new RaceSession(engine, input, trackDef, carModelId, stateSync, getPlayers, options);
    const def = getCarDef(carModelId);
    session.car = await createCar(carModelId, def.defaultColor, { preserveTextures: true });
    engine.scene.add(session.car);
    session.boostVfx = new BoostVfx(session.car, def.defaultColor);
    if (!options.theaterMode) await session._initTraffic();
    session.damageVfx = new DamageVfx(session.car);
    session.physics.reset(session._spawn.position, session._spawn.heading);
    session._applyTransform();
    session._snapCamera();
    return session;
  }

  constructor(engine, input, trackDef, carModelId, stateSync, getPlayers, options = {}) {
    this.engine = engine;
    this.input = input;
    this.trackDef = trackDef;
    this.stateSync = stateSync;
    this.getPlayers = getPlayers;
    this.carStats = getCarStats(carModelId);
    this.carDef = getCarDef(carModelId);
    this.theaterMode = !!options.theaterMode;

    this._clearEnvironment = applyTrackEnvironment(engine, trackDef.atmosphere, trackDef.length);
    this.track = new TrackBuilder(trackDef, { showGates: !this.theaterMode });
    engine.scene.add(this.track.group);

    this.car = null;
    this.damageVfx = null;
    this.boostVfx = null;
    this.physics = new CarPhysics(this.carStats);
    this.checkpoints = new CheckpointSystem(trackDef);

    this.controlsEnabled = false;
    this.finished = false;
    this.totalLaps = trackDef.laps;
    this.lap = 1;
    this.cpDone = 0;

    this.engineSound = null;
    this._netAccumulator = 0;
    this._camPos = new THREE.Vector3();
    this._camFollowCar = new THREE.Vector3();
    this._lookAtPos = new THREE.Vector3();
    this._spawn = { position: trackDef.spawnPoints[0].position, heading: trackDef.spawnPoints[0].heading };
    this._crashCooldowns = new Map();
    this._barrierCooldown = 0;
    this._crashEffects = [];
    this._wrecking = false;
    this._wreckTimer = 0;
    this._camShake = 0;
    this._cameraModes = this.theaterMode ? THEATER_CAMERA_MODES : CAMERA_MODES;
    this._cameraMode = this.theaterMode ? 0 : 0;
    this._defaultFov = engine.camera.fov;
    this._targetFov = this._cameraModes[0].fov;
    this._traffic = null;
    this._damageShakeTime = 0;
    this._damageShakeStrength = 0;
    this._autopilot = this.theaterMode ? new AutopilotDriver(trackDef) : null;
    this._tireTrail = null;
    this._cameraCycleTimer = 0;
    this._cameraCycleInterval = 14;
    this._orbitAngle = 0;
    this._theaterDriving = false;
    /** @type {'hold'|'reveal'|'flow'} hold=Low through intro; reveal=map orbit; flow=cycle */
    this._theaterCamPhase = 'hold';
    this._theaterRevealTimer = 0;
    this._theaterRevealDuration = 11;
    this._mapOrbitAngle = 0;
    this._revealOrbit = { distance: 32, height: 14, lookAt: 1.2, speed: 0.28, fov: 52 };

    this.onCheckpointPass = null;
    this.onBarrierHit = null;
    this.onCarCrash = null;
    this.onHealthDepleted = null;
    this.onCameraChange = null;
    this.onTheaterExit = null;

    this.checkpoints.onPass = (index) => this.onCheckpointPass?.(index);
  }

  setSpawn(position, heading) {
    this._spawn = { position, heading };
    this.physics.reset(position, heading);
    this._applyTransform();
    this._snapCamera();
  }

  enableControls() {
    this.controlsEnabled = true;
    if (!this.engineSound) {
      this.engine.listener.context.resume();
      this.engineSound = new EngineSound(this.engine.listener, this.carDef.engine);
    }
  }

  /** Begin autopilot during the intro while holding the Low camera. */
  startTheaterDrive() {
    if (!this.theaterMode) return;
    this._theaterDriving = true;
    this._theaterCamPhase = 'hold';
    this._cameraMode = 0;
    this._targetFov = this._cameraModes[0].fov;
    this._cameraCycleTimer = 0;
    this._autopilot?.start();
    if (!this._tireTrail) {
      this._tireTrail = new TireTrail(this.engine.scene);
    }
  }

  /**
   * After 3-2-1: car-focused rotating reveal, then the normal theater camera flow
   * (Side → Aerial → Orbit → Hero → Low…).
   */
  beginTheaterCameraFlow() {
    if (!this.theaterMode) return;
    const px = this.physics.position.x;
    const pz = this.physics.position.z;
    const dx = this._camPos.x - px;
    const dz = this._camPos.z - pz;
    const speed = this._revealOrbit.speed;
    this._mapOrbitAngle = Math.atan2(dx, dz) / Math.max(speed, 0.01);
    this._theaterRevealTimer = 0;
    this._theaterCamPhase = 'reveal';
    this._targetFov = this._revealOrbit.fov;
    this.onCameraChange?.('Map');
  }

  _beginTheaterFlowCycle() {
    this._theaterCamPhase = 'flow';
    // Skip Low — already used for the intro; start the aesthetic cycle at Side.
    this._cameraMode = 1 % this._cameraModes.length;
    this._cameraCycleTimer = 0;
    const preset = this._cameraPreset();
    this._targetFov = preset.fov;
    if (preset.kind === 'orbit') {
      const dx = this._camPos.x - this.physics.position.x;
      const dz = this._camPos.z - this.physics.position.z;
      const speed = preset.orbitSpeed ?? 0.2;
      this._orbitAngle = Math.atan2(dx, dz) / Math.max(speed, 0.01);
    }
    this.onCameraChange?.(preset.label);
  }

  respawn() {
    const point = this.checkpoints.getRespawnPoint(this._spawn);
    this.physics.reset(point.position, point.heading);
    this._applyTransform();
    this._snapCamera();
  }

  update(dt) {
    this.track.update(dt);

    if (this.theaterMode) {
      this._updateTheater(dt);
      return;
    }

    const controls = this.controlsEnabled && !this.finished
      ? {
          throttle: this.input.throttle,
          steer: this.input.steer,
          handbrake: this.input.handbrake,
          boost: this.input.consumeBoost(),
        }
      : { throttle: 0, steer: 0, handbrake: false, boost: false };

    if (this.controlsEnabled && this.input.consume('KeyR')) this.respawn();
    if (this.controlsEnabled && this.input.consume('KeyC')) this._toggleCamera();

    if (this._wrecking) {
      this._updateWreck(dt);
      return;
    }

    const onTrack = this.track.isOnTrack(this.physics.position.x, this.physics.position.z);
    this.physics.step(dt, controls, onTrack);

    if (this._barrierCooldown > 0) this._barrierCooldown -= dt;

    if (this.controlsEnabled && !this.finished) {
      this._checkBarrierCollision();
      this._checkCarCollisions();
      this._checkTrafficCollisions();
    }

    if (this.physics.health <= 0 && this.controlsEnabled && !this.finished) {
      this._startWreck();
      return;
    }

    this._applyTransform();
    this._updateDamageVisuals(dt);
    this._updateBoostVfx(dt, controls.throttle);
    this._updateCrashEffects(dt);
    this._traffic?.setPlayerPosition(this.physics.position.x, this.physics.position.z);
    this._traffic?.update(dt);

    if (this.controlsEnabled && !this.finished) {
      this.checkpoints.update(this.physics.position.x, this.physics.position.z);
    }

    if (this._damageShakeTime > 0) {
      this._damageShakeTime = Math.max(0, this._damageShakeTime - dt);
    }

    this._updateCamera(dt);
    const maxSpd = 58 * (0.75 + this.carStats.speed / 80 * 0.35);
    this.engineSound?.update(Math.abs(this.physics.speed) / maxSpd);

    this._netAccumulator += dt;
    if (this._netAccumulator >= 1 / NET_SEND_HZ) {
      this._netAccumulator = 0;
      socketClient.emit('player:state', {
        p: [this.physics.position.x, this.physics.position.y, this.physics.position.z],
        r: this.physics.heading,
        s: this.physics.speed,
        h: this.physics.health,
      });
    }
  }

  _updateTheater(dt) {
    if (this.input.consume('Escape') || this.input.consume('KeyQ')) {
      this.onTheaterExit?.();
      return;
    }

    if (this._theaterDriving) {
      this._autopilot?.update(dt, this.physics);
      if (this._theaterCamPhase === 'reveal') {
        this._theaterRevealTimer += dt;
        if (this._theaterRevealTimer >= this._theaterRevealDuration) {
          this._beginTheaterFlowCycle();
        }
      } else if (this._theaterCamPhase === 'flow') {
        this._cameraCycleTimer += dt;
        if (this._cameraCycleTimer >= this._cameraCycleInterval) {
          this._cameraCycleTimer = 0;
          this._toggleCamera();
        }
      }
    }

    this._orbitAngle += dt;
    this._applyTransform();
    this._tireTrail?.update(
      dt,
      this.physics.position,
      this.physics.heading,
      this.physics.speed,
    );
    this._updateBoostVfx(dt, this._theaterDriving ? 0.55 : 0);
    this._updateCamera(dt);
  }

  _checkBarrierCollision() {
    if (this._barrierCooldown > 0) return;

    const hit = this.track.checkBarrierHit(this.physics.position.x, this.physics.position.z, CAR_RADIUS);
    if (!hit) return;

    const intensity = this.physics.hitBarrier(hit.x, hit.z);
    this._barrierCooldown = 0.25;
    if (intensity > 0.2) {
      this._spawnCrashEffect(hit.x, hit.z, 0.25 + intensity * 0.45);
    }
    this._triggerDamageShake(0.3 + intensity * 0.45);
    this.onBarrierHit?.(intensity);
  }

  _checkCarCollisions() {
    const now = performance.now();
    const px = this.physics.position.x;
    const pz = this.physics.position.z;

    for (const player of this.getPlayers()) {
      if (player.id === socketClient.id) continue;
      const state = this.stateSync.sample(player.id);
      if (!state) continue;

      const lastHit = this._crashCooldowns.get(player.id) ?? 0;
      if (now - lastHit < CRASH_COOLDOWN_MS) continue;

      const ox = state.p[0];
      const oz = state.p[2];
      const dx = px - ox;
      const dz = pz - oz;
      const dist = Math.hypot(dx, dz);
      if (dist >= CAR_RADIUS * 2) continue;

      const otherStats = getCarStats(player.carModel);
      const intensity = this.physics.hitCar(state.s, otherStats.weight, state.r);
      if (intensity === 0) continue;

      this._crashCooldowns.set(player.id, now);
      const mx = (px + ox) / 2;
      const mz = (pz + oz) / 2;
      this._spawnCrashEffect(mx, mz, 0.5 + intensity * 0.5);
      this._triggerDamageShake(0.45 + intensity * 0.55);
      this.onCarCrash?.();
    }
  }

  _checkTrafficCollisions() {
    if (!this._traffic) return;
    const intensity = this._traffic.checkPlayerCollision(
      this.physics,
      this.physics.position.x,
      this.physics.position.z,
    );
    if (!intensity) return;
    this._spawnCrashEffect(this.physics.position.x, this.physics.position.z, 0.45 + intensity * 0.5);
    this._camShake = Math.max(this._camShake, intensity * 0.35);
    this._triggerDamageShake(0.4 + intensity * 0.5);
    this.onCarCrash?.();
  }

  _triggerDamageShake(strength) {
    this._damageShakeTime = DAMAGE_SHAKE_DURATION;
    this._damageShakeStrength = Math.max(this._damageShakeStrength, Math.min(1, strength));
  }

  _updateBoostVfx(dt, throttle) {
    if (!this.boostVfx) return;
    const maxSpd = 58 * (0.75 + this.carStats.speed / 80 * 0.35);
    this.boostVfx.update(dt, {
      active: this.physics.boostActive,
      boostRatio: this.physics.boostRatio,
      speedRatio: Math.min(Math.abs(this.physics.speed) / Math.max(maxSpd, 1), 1),
      throttle,
    });
  }

  _updateDamageVisuals(dt) {
    const ratio = this.physics.healthRatio;
    this.damageVfx?.update(dt, ratio, this.physics.speed);
    if (this.car) applyDamageWear(this.car, ratio);
  }

  _startWreck() {
    this._wrecking = true;
    this._wreckTimer = WRECK_DURATION;
    this._camShake = 0.65;
    this.physics.speed = 0;
    this.physics.velocity.x = 0;
    this.physics.velocity.z = 0;
    this.damageVfx?.triggerWreckFlash(this._wreckTimer);
    this._spawnCrashEffect(this.physics.position.x, this.physics.position.z, 1.5);
    this.onHealthDepleted?.();
  }

  _updateWreck(dt) {
    this._wreckTimer -= dt;
    this._applyTransform();
    this.damageVfx?.update(dt, 0, 0);
    this._updateCrashEffects(dt);
    this._updateCamera(dt);

    if (this._wreckTimer <= 0) {
      this._wrecking = false;
      this.damageVfx?.clearWreckFlash();
      this.respawn();
    }
  }

  _spawnCrashEffect(x, z, intensity) {
    const fx = new CrashEffect(this.engine.scene, x, z, intensity);
    this._crashEffects.push(fx);
  }

  _updateCrashEffects(dt) {
    this._crashEffects = this._crashEffects.filter((fx) => {
      fx.update(dt);
      return fx.alive;
    });
  }

  _applyTransform() {
    if (!this.car) return;
    const shakeRatio = this._damageShakeTime > 0
      ? this._damageShakeTime / DAMAGE_SHAKE_DURATION
      : 0;
    const shakeStrength = this._damageShakeStrength * shakeRatio;
    this.car.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    this.car.rotation.y = this.physics.heading;

    if (shakeStrength > 0.01) {
      const t = performance.now() * 0.004;
      const yawTwist = Math.sin(t + this.physics.position.x * 0.01) * shakeStrength * 0.22;
      const rollTwist = Math.sin(t * 1.5 + this.physics.position.z * 0.01) * shakeStrength * 0.28;
      const pitchTwist = Math.cos(t * 1.2) * shakeStrength * 0.12;
      this.car.rotation.y += yawTwist;
      this.car.rotation.z = rollTwist;
      this.car.rotation.x = pitchTwist;
      this.car.position.y += Math.sin(t * 4) * shakeStrength * 0.12;
    } else {
      this.car.rotation.z = 0;
      this.car.rotation.x = 0;
      this._damageShakeStrength = 0;
    }

    const wheels = this.car.userData.wheels ?? [];
    spinWheels(wheels, this.physics.speed, this.physics.steerVisual);
  }

  _toggleCamera() {
    this._cameraMode = (this._cameraMode + 1) % this._cameraModes.length;
    const preset = this._cameraPreset();
    this._targetFov = preset.fov;
    // Seed orbit from the current camera so it doesn't jump to a random side.
    if (preset.kind === 'orbit') {
      const dx = this._camPos.x - this.physics.position.x;
      const dz = this._camPos.z - this.physics.position.z;
      const speed = preset.orbitSpeed ?? 0.2;
      this._orbitAngle = Math.atan2(dx, dz) / Math.max(speed, 0.01);
    }
    this.onCameraChange?.(preset.label);
  }

  _cameraPreset() {
    return this._cameraModes[this._cameraMode];
  }

  _cameraLookAtTarget(preset) {
    const h = this.physics.heading;
    const px = this.car.position.x;
    const py = this.car.position.y;
    const pz = this.car.position.z;
    let ahead = 0;
    if (this.theaterMode) {
      if (preset.kind === 'lead') ahead = -1.2;
      else if (preset.kind === 'chase' && preset.height > 12) ahead = 6;
      else ahead = 2.4;
    }
    return new THREE.Vector3(
      px + Math.sin(h) * ahead,
      py + preset.lookAt,
      pz + Math.cos(h) * ahead,
    );
  }

  _updateCamera(dt) {
    const cam = this.engine.camera;
    const preset = this._cameraPreset();
    const maxSpd = 58 * (0.75 + this.carStats.speed / 80 * 0.35);
    const speedRatio = Math.min(Math.abs(this.physics.speed) / Math.max(maxSpd, 1), 1);

    if (this.theaterMode && this._theaterCamPhase === 'reveal') {
      this._updateMapRevealCamera(dt);
      return;
    }

    const target = this._cameraTarget(preset, speedRatio);
    const lookTarget = this._cameraLookAtTarget(preset);
    const lerpSpeed = preset.lerp ?? 5;

    if (this.theaterMode) {
      const cx = this.physics.position.x;
      const cy = this.physics.position.y;
      const cz = this.physics.position.z;
      const dx = cx - this._camFollowCar.x;
      const dy = cy - this._camFollowCar.y;
      const dz = cz - this._camFollowCar.z;
      // Inherit car motion so framing stays locked while angles ease.
      this._camPos.x += dx;
      this._camPos.y += dy;
      this._camPos.z += dz;
      this._lookAtPos.x += dx;
      this._lookAtPos.y += dy;
      this._lookAtPos.z += dz;
      this._camFollowCar.set(cx, cy, cz);

      const blend = 1 - Math.exp(-lerpSpeed * dt);
      this._camPos.lerp(target, blend);
      this._lookAtPos.lerp(lookTarget, blend);

      // Lift the path if a long cut would pass through the car (prevents flicker).
      const toCarX = cx - this._camPos.x;
      const toCarZ = cz - this._camPos.z;
      const planar = Math.hypot(toCarX, toCarZ);
      if (planar < 7) {
        this._camPos.y = Math.max(this._camPos.y, cy + 7 + (7 - planar) * 0.8);
      }
    } else {
      this._camPos.lerp(target, Math.min(dt * lerpSpeed, 1));
      this._lookAtPos.copy(lookTarget);
    }

    if (this._camShake > 0) {
      this._camShake = Math.max(0, this._camShake - dt * 1.8);
      const s = this._camShake;
      this._camPos.x += (Math.random() - 0.5) * s * 2.2;
      this._camPos.y += (Math.random() - 0.5) * s * 1.4;
      this._camPos.z += (Math.random() - 0.5) * s * 2.2;
    }

    cam.position.copy(this._camPos);
    cam.lookAt(this._lookAtPos.x, this._lookAtPos.y, this._lookAtPos.z);

    const speedFovBoost = preset.speedFov ?? 10;
    const boostFov = this.physics.boostActive ? Math.min(8, speedFovBoost * 0.55) : 0;
    this._targetFov = preset.fov + speedRatio * speedFovBoost + boostFov;
    if (Math.abs(cam.fov - this._targetFov) > 0.05) {
      const fovBlend = this.theaterMode
        ? (1 - Math.exp(-1.1 * dt))
        : Math.min(dt * 6, 1);
      cam.fov += (this._targetFov - cam.fov) * fovBlend;
      cam.updateProjectionMatrix();
    }
  }

  /** Elevated orbit around the car — landscape reads, car stays clearly framed. */
  _updateMapRevealCamera(dt) {
    const cam = this.engine.camera;
    const r = this._revealOrbit;
    const px = this.physics.position.x;
    const py = this.physics.position.y;
    const pz = this.physics.position.z;
    this._mapOrbitAngle += dt;

    const angle = this._mapOrbitAngle * r.speed;
    const target = new THREE.Vector3(
      px + Math.sin(angle) * r.distance,
      py + r.height,
      pz + Math.cos(angle) * r.distance,
    );
    const lookTarget = new THREE.Vector3(px, py + r.lookAt, pz);

    // Keep framing locked to the moving car while easing into the orbit.
    const dx = px - this._camFollowCar.x;
    const dy = py - this._camFollowCar.y;
    const dz = pz - this._camFollowCar.z;
    this._camPos.x += dx;
    this._camPos.y += dy;
    this._camPos.z += dz;
    this._lookAtPos.x += dx;
    this._lookAtPos.y += dy;
    this._lookAtPos.z += dz;
    this._camFollowCar.set(px, py, pz);

    const blend = 1 - Math.exp(-0.7 * dt);
    this._camPos.lerp(target, blend);
    this._lookAtPos.lerp(lookTarget, blend);

    cam.position.copy(this._camPos);
    cam.lookAt(this._lookAtPos.x, this._lookAtPos.y, this._lookAtPos.z);

    this._targetFov = r.fov;
    if (Math.abs(cam.fov - this._targetFov) > 0.05) {
      cam.fov += (this._targetFov - cam.fov) * (1 - Math.exp(-1.0 * dt));
      cam.updateProjectionMatrix();
    }
  }

  _cameraTarget(preset = this._cameraPreset(), speedRatio = 0) {
    const h = this.physics.heading;
    const px = this.physics.position.x;
    const py = this.physics.position.y;
    const pz = this.physics.position.z;
    const sin = Math.sin(h);
    const cos = Math.cos(h);
    const rightX = cos;
    const rightZ = -sin;

    if (preset.kind === 'orbit') {
      const dist = preset.distance ?? 13;
      const angle = this._orbitAngle * (preset.orbitSpeed ?? 0.2);
      return new THREE.Vector3(
        px + Math.sin(angle) * dist,
        py + preset.height,
        pz + Math.cos(angle) * dist,
      );
    }

    if (preset.kind === 'lead') {
      const dist = Math.max(6, (preset.distance ?? 14) - speedRatio * (preset.speedPull ?? 1));
      return new THREE.Vector3(
        px + sin * dist,
        py + preset.height,
        pz + cos * dist,
      );
    }

    if (preset.kind === 'side') {
      const dist = Math.max(4, (preset.distance ?? 8) - speedRatio * (preset.speedPull ?? 1));
      const lateral = preset.lateral ?? 6;
      return new THREE.Vector3(
        px - sin * dist * 0.35 + rightX * lateral,
        py + preset.height,
        pz - cos * dist * 0.35 + rightZ * lateral,
      );
    }

    const dist = Math.max(3.8, preset.distance - speedRatio * (preset.speedPull ?? 1.5));
    const height = Math.max(1.8, preset.height - speedRatio * (preset.speedPull ?? 1.5) * 0.35);
    return new THREE.Vector3(px - sin * dist, py + height, pz - cos * dist);
  }

  _snapCamera() {
    this._camFollowCar.set(
      this.physics.position.x,
      this.physics.position.y,
      this.physics.position.z,
    );
    this._camPos.copy(this._cameraTarget());
    this._lookAtPos.copy(this._cameraLookAtTarget(this._cameraPreset()));
    const cam = this.engine.camera;
    cam.position.copy(this._camPos);
    cam.lookAt(this._lookAtPos.x, this._lookAtPos.y, this._lookAtPos.z);
    cam.fov = this._targetFov;
    cam.updateProjectionMatrix();
  }

  async _initTraffic() {
    if (!TrafficManager.supportsTrack(this.trackDef)) return;
    this._traffic = new TrafficManager(this.engine.scene, this.track, this.trackDef);
    await this._traffic.spawn();
  }

  applyServerProgress({ lap, finished }) {
    if (finished) {
      this.finished = true;
      this.lap = this.totalLaps;
      return;
    }
    if (lap != null) {
      if (lap > this.lap) this.cpDone = 0;
      this.lap = lap;
    }
    this.cpDone = Math.min(this.cpDone + 1, this.trackDef.checkpointCount);
  }

  dispose() {
    this._autopilot?.stop();
    this._autopilot = null;
    this._tireTrail?.dispose();
    this._tireTrail = null;
    this.engineSound?.dispose();
    this.damageVfx?.dispose();
    this.boostVfx?.dispose();
    for (const fx of this._crashEffects) fx.dispose();
    this._crashEffects = [];
    if (this.car) disposeCar(this.car);
    this._traffic?.dispose();
    this._traffic = null;
    this.track.dispose();
    this.engine.disposeObject(this.track.group);
    this._clearEnvironment?.();
    this._clearEnvironment = null;
    this.engine.camera.fov = this._defaultFov;
    this.engine.camera.updateProjectionMatrix();
  }
}
