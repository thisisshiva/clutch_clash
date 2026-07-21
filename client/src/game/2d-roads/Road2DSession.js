import * as THREE from 'three';
import { socketClient } from '../../net/SocketClient.js';
import { MovingPicture } from './MovingPicture.js';
import { get2dRoadConfig } from './configs.js';

const NET_SEND_HZ = 20;
const MAX_SPEED = 420;
const ACCEL = 160;
const DECEL = 90;

/**
 * 2D Roads session — side-scroll city moving picture.
 * Background (and road) scroll; car stays framed with a light bob.
 */
export class Road2DSession {
  static async create(engine, input, trackDef, carModelId, stateSync, getPlayers, options = {}) {
    const session = new Road2DSession(engine, input, trackDef, carModelId, stateSync, getPlayers, options);
    await session._init();
    return session;
  }

  constructor(engine, input, trackDef, carModelId, stateSync, getPlayers, options = {}) {
    this.engine = engine;
    this.input = input;
    this.trackDef = trackDef;
    this.stateSync = stateSync;
    this.getPlayers = getPlayers;
    this.theaterMode = !!options.theaterMode;

    this.controlsEnabled = false;
    this.finished = false;
    this.totalLaps = trackDef.laps ?? 1;
    this.lap = 1;
    this.cpDone = 0;

    this.speed = 0;
    this.distance = 0;
    this._netAccumulator = 0;
    this._theaterDriving = false;
    this.onTheaterExit = null;
    this.onCameraChange = null;
    this.onCheckpoint = null;
    this.onCheckpointPass = null;
    this.onFinish = null;
    this.onHealthDepleted = null;
    this.onBarrierHit = null;

    this.physics = {
      position: { x: 0, y: 0, z: 0 },
      heading: 0,
      speed: 0,
      health: 100,
      speedKmh: 0,
      healthRatio: 1,
      boostRatio: 0,
      boostCooldownRatio: 0,
    };
    this.checkpoints = {
      nextIndex: 0,
      update: () => {},
      getRespawnPoint: () => ({ position: [0, 0, 0], heading: 0 }),
    };

    this._picture = null;
    this._texture = null;
    this._hudScene = null;
    this._hudCam = null;
    this._quad = null;
    this._onResize = null;
    this._trackLength = Math.max(4000, trackDef.length || 7000);
    this._cpStep = this._trackLength / Math.max(2, (trackDef.checkpointCount || 6));
    this._nextCpAt = this._cpStep;
    this._paused = false;
    this._onVisibility = null;
  }

  async _init() {
    this._picture = new MovingPicture(get2dRoadConfig(this.trackDef));
    await this._picture.load();

    const size = this._resolveSize();
    this._picture.resize(size.w, size.h);

    this._texture = new THREE.CanvasTexture(this._picture.canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.minFilter = THREE.LinearFilter;
    this._texture.magFilter = THREE.LinearFilter;

    this._hudScene = new THREE.Scene();
    this._hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this._texture, depthTest: false, depthWrite: false }),
    );
    this._hudScene.add(this._quad);

    this.engine.setOverrideRender((renderer) => {
      renderer.render(this._hudScene, this._hudCam);
    });

    this._onResize = () => {
      const s = this._resolveSize();
      if (s.w === this._picture.width && s.h === this._picture.height) return;
      this._picture.resize(s.w, s.h);
      this._texture.needsUpdate = true;
    };
    window.addEventListener('resize', this._onResize);

    // Tab switch: pause sim + discard clock spike so scroll doesn't jump/flicker.
    this._onVisibility = () => {
      if (document.hidden) {
        this._paused = true;
        return;
      }
      this.engine._clock?.getDelta?.();
      this._paused = false;
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    this._picture.render({ dt: 0.016, speed: 0 });
    this._texture.needsUpdate = true;
  }

  _resolveSize() {
    const cap = this.engine._theaterCapture;
    if (cap) return { w: cap.width, h: cap.height };
    return {
      w: this.engine.canvas?.clientWidth || window.innerWidth,
      h: this.engine.canvas?.clientHeight || window.innerHeight,
    };
  }

  setSpawn() {
    this.speed = 0;
    this.distance = 0;
  }

  enableControls() {
    this.controlsEnabled = true;
  }

  startTheaterDrive() {
    if (!this.theaterMode) return;
    this._theaterDriving = true;
    this.controlsEnabled = true;
    this.onCameraChange?.('City Roll');
  }

  beginTheaterCameraFlow() {
    this.onCameraChange?.('Moving Picture');
  }

  respawn() {
    this.speed = Math.min(this.speed, 120);
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

  update(dt) {
    if (this.theaterMode) {
      if (this.input.consume('Escape') || this.input.consume('KeyQ')) {
        this.onTheaterExit?.();
        return;
      }
    }

    // Theater recording may keep ticking while hidden; race mode should freeze.
    if (this._paused && !this.theaterMode) return;

    const step = Math.min(Math.max(dt, 0), 1 / 30);

    let throttle = 0;
    if (this.theaterMode && this._theaterDriving) {
      throttle = 0.7;
    } else if (this.controlsEnabled && !this.finished) {
      throttle = Math.max(0, this.input.throttle);
      if (this.input.consume('KeyR')) this.respawn();
    }

    if (throttle > 0) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * throttle * step);
    else this.speed = Math.max(0, this.speed - DECEL * step);

    this.distance += this.speed * step;

    if (!this.theaterMode && this.controlsEnabled && !this.finished) {
      if (this.distance >= this._trackLength) {
        this.distance -= this._trackLength;
        this.lap += 1;
        this.cpDone = 0;
        this._nextCpAt = this._cpStep;
        if (this.lap > this.totalLaps) {
          this.finished = true;
          this.onFinish?.();
        }
      }
      while (this.distance >= this._nextCpAt && this.cpDone < this.trackDef.checkpointCount - 1) {
        this.cpDone += 1;
        this._nextCpAt += this._cpStep;
        this.onCheckpointPass?.(this.cpDone);
        this.onCheckpoint?.({ index: this.cpDone, lap: this.lap, finished: false });
      }
    }

    this.physics.speed = this.speed * 0.1;
    this.physics.speedKmh = Math.round(this.speed * 0.55);
    this.physics.position.z = this.distance;
    this.physics.position.x = 0;

    if (this.engine._theaterCapture) {
      const s = this._resolveSize();
      if (this._picture.width !== s.w || this._picture.height !== s.h) {
        this._picture.resize(s.w, s.h);
      }
    }

    this._picture.render({ dt: step, speed: this.speed });
    this._texture.needsUpdate = true;

    if (!this.theaterMode && this.controlsEnabled) {
      this._netAccumulator += step;
      if (this._netAccumulator >= 1 / NET_SEND_HZ) {
        this._netAccumulator = 0;
        socketClient.emit('player:state', {
          p: [0, 0, this.distance],
          r: 0,
          s: this.physics.speed,
          h: 100,
        });
      }
    }
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this._onVisibility) {
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._onVisibility = null;
    }
    this.engine.setOverrideRender(null);
    this._texture?.dispose();
    this._quad?.geometry?.dispose();
    this._quad?.material?.dispose();
    this._hudScene = null;
    this._hudCam = null;
    this._quad = null;
    this._texture = null;
    this._picture = null;
  }
}
