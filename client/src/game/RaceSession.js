import * as THREE from 'three';
import { createCar, disposeCar } from './CarFactory.js';
import { CarPhysics } from './CarPhysics.js';
import { TrackBuilder } from './TrackBuilder.js';
import { CheckpointSystem } from './CheckpointSystem.js';
import { EngineSound } from '../voice/SpatialAudio.js';
import { socketClient } from '../net/SocketClient.js';

const NET_SEND_HZ = 20;
const CAM_DISTANCE = 13;
const CAM_HEIGHT = 6;

/**
 * One race on one track: local car + physics + checkpoints + chase camera +
 * network state publishing + engine audio. Remote cars are handled by
 * RemotePlayers (shared with the lobby), this class only drives the update loop.
 */
export class RaceSession {
  /**
   * @param {import('../core/Engine.js').Engine} engine
   * @param {import('../core/Input.js').Input} input
   * @param {object} trackDef full track definition from server
   * @param {number} carColor
   */
  constructor(engine, input, trackDef, carColor) {
    this.engine = engine;
    this.input = input;
    this.trackDef = trackDef;

    this.track = new TrackBuilder(trackDef);
    engine.scene.add(this.track.group);

    this.car = createCar(carColor);
    engine.scene.add(this.car);

    this.physics = new CarPhysics();
    this.checkpoints = new CheckpointSystem(trackDef);

    this.controlsEnabled = false;
    this.finished = false;
    this.totalLaps = trackDef.laps;
    this.lap = 1;
    this.cpDone = 0;

    this.engineSound = null;
    this._netAccumulator = 0;
    this._camPos = new THREE.Vector3();
    this._spawn = { position: trackDef.spawnPoints[0].position, heading: trackDef.spawnPoints[0].heading };

    /** Called when local car crosses a gate; wire to network. */
    this.onCheckpointPass = null;

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
      this.engineSound = new EngineSound(this.engine.listener, null);
    }
  }

  respawn() {
    const point = this.checkpoints.getRespawnPoint(this._spawn);
    this.physics.reset(point.position, point.heading);
    this._applyTransform();
    this._snapCamera();
  }

  /** Per-frame update; call from the engine loop. */
  update(dt) {
    const controls = this.controlsEnabled && !this.finished
      ? { throttle: this.input.throttle, steer: this.input.steer, handbrake: this.input.handbrake }
      : { throttle: 0, steer: 0, handbrake: false };

    if (this.controlsEnabled && this.input.consume('KeyR')) this.respawn();

    const onTrack = this.track.isOnTrack(this.physics.position.x, this.physics.position.z);
    this.physics.step(dt, controls, onTrack);
    this._applyTransform();

    if (this.controlsEnabled && !this.finished) {
      this.checkpoints.update(this.physics.position.x, this.physics.position.z);
    }

    this._updateCamera(dt);
    this.engineSound?.update(Math.abs(this.physics.speed) / 58);

    // Publish state at fixed rate.
    this._netAccumulator += dt;
    if (this._netAccumulator >= 1 / NET_SEND_HZ) {
      this._netAccumulator = 0;
      socketClient.emit('player:state', {
        p: [this.physics.position.x, this.physics.position.y, this.physics.position.z],
        r: this.physics.heading,
        s: this.physics.speed,
      });
    }
  }

  _applyTransform() {
    this.car.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    this.car.rotation.y = this.physics.heading;

    const wheels = this.car.userData.wheels;
    const spin = this.physics.speed * 0.06;
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x += spin;
      if (i < 2) wheels[i].rotation.y = this.physics.steerVisual; // front wheels steer
    }
  }

  _updateCamera(dt) {
    const cam = this.engine.camera;
    const target = this._cameraTarget();
    this._camPos.lerp(target, Math.min(dt * 5, 1));
    cam.position.copy(this._camPos);
    cam.lookAt(this.car.position.x, this.car.position.y + 1.4, this.car.position.z);
  }

  _cameraTarget() {
    const h = this.physics.heading;
    return new THREE.Vector3(
      this.physics.position.x - Math.sin(h) * CAM_DISTANCE,
      this.physics.position.y + CAM_HEIGHT,
      this.physics.position.z - Math.cos(h) * CAM_DISTANCE,
    );
  }

  _snapCamera() {
    this._camPos.copy(this._cameraTarget());
    this.engine.camera.position.copy(this._camPos);
  }

  /** Server confirmed a checkpoint pass - update HUD counters. */
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
    this.engineSound?.dispose();
    disposeCar(this.car);
    this.engine.disposeObject(this.track.group);
  }
}
