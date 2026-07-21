import * as THREE from 'three';
import { createCar, disposeCar, applyCarColor, spinWheels } from './CarFactory.js';
import { getCarStats } from './carCatalog.js';
import { performanceConfig } from './PerformanceConfig.js';

const TRAFFIC_MODELS = ['sedan', 'taxi', 'van', 'truck', 'suv'];
const TRAFFIC_COLORS = [0xd8d8d8, 0x4f6fd8, 0xf3b300, 0x7a7a7a, 0x3f7a3f, 0x8b4545, 0x2f2f2f, 0xc0c8d0];
const CAR_RADIUS = 1.05;
const HIT_COOLDOWN_MS = 500;

const _point = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _normal = new THREE.Vector3();

/**
 * Base traffic vehicle — position along spline, lane offset, speed, collision data.
 */
export class AbstractTrafficVehicle {
  constructor({ id, modelId, t, lane, speed, direction, color }) {
    if (new.target === AbstractTrafficVehicle) {
      throw new Error('AbstractTrafficVehicle cannot be instantiated directly');
    }
    this.id = id;
    this.modelId = modelId;
    this.t = t;
    this.lane = lane;
    this.speed = speed;
    this.direction = direction;
    this.color = color;
    this.mesh = null;
    this.weight = 80;
  }

  /** @returns {{ x: number, z: number, heading: number }} */
  getPose(curve, trackDef) {
    const laneCount = Math.max(1, trackDef.laneCount || 1);
    const laneWidth = trackDef.roadWidth / laneCount;
    const halfW = trackDef.roadWidth / 2;
    const laneOffset = -halfW + laneWidth * (this.lane + 0.5);

    curve.getPointAt(this.t, _point);
    curve.getTangentAt(this.t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();

    return {
      x: _point.x + _normal.x * laneOffset,
      z: _point.z + _normal.z * laneOffset,
      heading: Math.atan2(_tangent.x * this.direction, _tangent.z * this.direction),
    };
  }

  update(dt, curve, trackDef) {
    const trackLength = trackDef.length || 1200;
    const closed = trackDef.closed !== false;
    this.t += (this.speed * dt / trackLength) * this.direction;
    if (closed) {
      if (this.t >= 1) this.t -= 1;
      if (this.t < 0) this.t += 1;
    } else {
      if (this.t >= 1) {
        this.t = 1;
        this.direction = -1;
      } else if (this.t <= 0) {
        this.t = 0;
        this.direction = 1;
      }
    }
  }

  applyTransform(curve, trackDef) {
    if (!this.mesh) return;
    const pose = this.getPose(curve, trackDef);
    this.mesh.position.set(pose.x, 0, pose.z);
    this.mesh.rotation.y = pose.heading;

    const wheels = this.mesh.userData.wheels ?? [];
    spinWheels(wheels, this.speed * this.direction);
  }
}

class SedanTrafficVehicle extends AbstractTrafficVehicle {
  constructor(opts) {
    super(opts);
    this.weight = getCarStats('sedan').weight;
  }
}

class TaxiTrafficVehicle extends AbstractTrafficVehicle {
  constructor(opts) {
    super(opts);
    this.weight = getCarStats('taxi').weight;
  }
}

class VanTrafficVehicle extends AbstractTrafficVehicle {
  constructor(opts) {
    super(opts);
    this.weight = getCarStats('van').weight;
  }
}

class TruckTrafficVehicle extends AbstractTrafficVehicle {
  constructor(opts) {
    super(opts);
    this.weight = getCarStats('truck').weight;
  }
}

class SuvTrafficVehicle extends AbstractTrafficVehicle {
  constructor(opts) {
    super(opts);
    this.weight = getCarStats('suv').weight;
  }
}

const TRAFFIC_CLASS_BY_MODEL = {
  sedan: SedanTrafficVehicle,
  taxi: TaxiTrafficVehicle,
  van: VanTrafficVehicle,
  truck: TruckTrafficVehicle,
  suv: SuvTrafficVehicle,
};

function randomTrackT() {
  let t = Math.random();
  // Keep traffic away from the start/finish line.
  if (t < 0.04 || t > 0.96) t = 0.08 + Math.random() * 0.84;
  return t;
}

function randomTrafficProfile(index, trackDef) {
  const laneCount = Math.max(1, trackDef.laneCount || 1);
  const modelId = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)];
  return {
    id: `traffic-${index}`,
    modelId,
    t: randomTrackT(),
    lane: Math.floor(Math.random() * laneCount),
    speed: 7 + Math.random() * 16,
    direction: 1,
    color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
  };
}

/**
 * Spawns and updates AI traffic on multi-lane highways.
 */
export class TrafficManager {
  constructor(scene, track, trackDef) {
    this.scene = scene;
    this.track = track;
    this.trackDef = trackDef;
    this.vehicles = [];
    this._hitCooldowns = new Map();
    this._trackLength = trackDef.length || 1200;
    /** @type {Array<{ mesh: THREE.Group, vehicle: AbstractTrafficVehicle | null, modelId: string, color: number }>} */
    this._meshPool = [];
    /** @type {Map<string, number>} */
    this._assignments = new Map();
    this._playerX = 0;
    this._playerZ = 0;
  }

  static supportsTrack(trackDef) {
    if (
      trackDef.id === 'road-to-heaven'
      || trackDef.id === 'road-to-heaven-snow'
      || trackDef.id === 'north-path'
      || trackDef.id === 'chapmans-peak'
      || trackDef.id === 'black-hole'
      || trackDef.id === 'road-to-endless'
      || trackDef.id === 'city-road-2d'
      || trackDef.kind === '2d'
      || trackDef.id === 'mt-fuji-dawn'
      || trackDef.id === 'mt-fuji-day'
      || trackDef.id === 'mt-fuji-night'
      || trackDef.id === 'mt-fuji-autumn'
    ) return true;
    return trackDef.id === 'mega-straight' && (trackDef.laneCount || 1) > 1;
  }

  static spawnCount(trackDef) {
    if (
      trackDef.id === 'road-to-heaven'
      || trackDef.id === 'road-to-heaven-snow'
      || trackDef.id === 'north-path'
      || trackDef.id === 'chapmans-peak'
      || trackDef.id === 'black-hole'
      || trackDef.id === 'road-to-endless'
      || trackDef.id === 'city-road-2d'
      || trackDef.kind === '2d'
      || trackDef.id === 'mt-fuji-dawn'
      || trackDef.id === 'mt-fuji-day'
      || trackDef.id === 'mt-fuji-night'
      || trackDef.id === 'mt-fuji-autumn'
    ) {
      return Math.min(trackDef.trafficCount ?? 8, performanceConfig.trafficMeshes);
    }
    if (trackDef.id === 'mega-straight') {
      return performanceConfig.trafficLogic;
    }
    return 0;
  }

  async spawn(logicCount = TrafficManager.spawnCount(this.trackDef)) {
    const curve = this.track.curve;

    for (let i = 0; i < logicCount; i++) {
      const profile = randomTrafficProfile(i, this.trackDef);
      const VehicleClass = TRAFFIC_CLASS_BY_MODEL[profile.modelId] ?? SedanTrafficVehicle;
      this.vehicles.push(new VehicleClass(profile));
    }

    const meshCount = Math.min(logicCount, performanceConfig.trafficMeshes);
    const tasks = [];
    for (let i = 0; i < meshCount; i++) {
      const vehicle = this.vehicles[i];
      tasks.push(this._createPoolMesh(vehicle));
    }
    await Promise.all(tasks);
    this._assignVisibleMeshes();
  }

  async _createPoolMesh(vehicle) {
    const mesh = await createCar(vehicle.modelId, vehicle.color, { copyPaint: true });
    mesh.scale.multiplyScalar(0.94 + Math.random() * 0.08);
    mesh.userData.isTraffic = true;
    mesh.visible = false;
    this.scene.add(mesh);
    this._meshPool.push({
      mesh,
      vehicle: null,
      modelId: vehicle.modelId,
      color: vehicle.color,
    });
  }

  _releaseSlot(slot) {
    if (slot.vehicle) slot.vehicle.mesh = null;
    slot.vehicle = null;
    slot.mesh.visible = false;
  }

  _bindSlot(slot, vehicle) {
    slot.vehicle = vehicle;
    vehicle.mesh = slot.mesh;
    slot.mesh.visible = true;

    if (slot.modelId !== vehicle.modelId || slot.color !== vehicle.color) {
      applyCarColor(slot.mesh, vehicle.color);
      slot.modelId = vehicle.modelId;
      slot.color = vehicle.color;
    }
  }

  _pickBestSlot(freeSlots, vehicle) {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < freeSlots.length; i++) {
      const slot = freeSlots[i].slot;
      let score = 0;
      if (slot.modelId !== vehicle.modelId) score += 10;
      if (slot.color !== vehicle.color) score += 1;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  setPlayerPosition(x, z) {
    this._playerX = x;
    this._playerZ = z;
  }

  _assignVisibleMeshes() {
    const radius = performanceConfig.trafficVisibleRadius;
    const leaveRadius = radius * 1.2;
    const maxMeshes = this._meshPool.length;

    for (const [vehicleId, slotIdx] of [...this._assignments]) {
      const vehicle = this.vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) {
        this._releaseSlot(this._meshPool[slotIdx]);
        this._assignments.delete(vehicleId);
        continue;
      }
      const pose = vehicle.getPose(this.track.curve, this.trackDef);
      const dist = Math.hypot(pose.x - this._playerX, pose.z - this._playerZ);
      if (dist > leaveRadius) {
        this._releaseSlot(this._meshPool[slotIdx]);
        this._assignments.delete(vehicleId);
      }
    }

    const assignedIds = new Set(this._assignments.keys());
    const candidates = this.vehicles
      .filter((vehicle) => !assignedIds.has(vehicle.id))
      .map((vehicle) => {
        const pose = vehicle.getPose(this.track.curve, this.trackDef);
        return {
          vehicle,
          dist: Math.hypot(pose.x - this._playerX, pose.z - this._playerZ),
        };
      })
      .sort((a, b) => a.dist - b.dist || a.vehicle.id.localeCompare(b.vehicle.id));

    const freeSlots = this._meshPool
      .map((slot, idx) => ({ slot, idx }))
      .filter(({ slot }) => !slot.vehicle);

    for (const { vehicle, dist } of candidates) {
      if (this._assignments.size >= maxMeshes) break;
      if (dist > radius && this._assignments.size > 0) continue;

      const pick = this._pickBestSlot(freeSlots, vehicle);
      const { slot, idx } = freeSlots.splice(pick, 1)[0];
      this._bindSlot(slot, vehicle);
      this._assignments.set(vehicle.id, idx);
    }

    for (const slot of this._meshPool) {
      if (!slot.vehicle) slot.mesh.visible = false;
    }
  }

  update(dt) {
    const curve = this.track.curve;
    for (const vehicle of this.vehicles) {
      vehicle.update(dt, curve, this.trackDef);
    }
    this._assignVisibleMeshes();
    for (const vehicle of this.vehicles) {
      vehicle.applyTransform(curve, this.trackDef);
    }
  }

  /**
   * @returns {number|null} collision intensity, or null if no hit
   */
  checkPlayerCollision(playerPhysics, px, pz) {
    const now = performance.now();

    for (const vehicle of this.vehicles) {
      const last = this._hitCooldowns.get(vehicle.id) ?? 0;
      if (now - last < HIT_COOLDOWN_MS) continue;

      const pose = vehicle.getPose(this.track.curve, this.trackDef);
      const dx = px - pose.x;
      const dz = pz - pose.z;
      if (Math.hypot(dx, dz) >= CAR_RADIUS * 2) continue;

      const trafficSpeedSigned = vehicle.speed * vehicle.direction;
      const intensity = playerPhysics.hitCar(trafficSpeedSigned, vehicle.weight, pose.heading);
      if (intensity === 0) continue;

      this._hitCooldowns.set(vehicle.id, now);
      return intensity;
    }
    return null;
  }

  dispose() {
    for (const slot of this._meshPool) {
      disposeCar(slot.mesh, { keepAssets: true });
    }
    this._meshPool = [];
    this.vehicles = [];
    this._assignments.clear();
    this._hitCooldowns.clear();
  }
}
