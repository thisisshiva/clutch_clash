import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_CAR_ID, getCarDef, CAR_CATALOG } from './carCatalog.js';

const loader = new GLTFLoader();
/** @type {Map<string, THREE.Group>} */
const templateCache = new Map();
/** @type {Map<string, THREE.Group>} */
const coloredTemplateCache = new Map();
const loadPromises = new Map();

const PAINT_SKIP = /wheel|tire|tyre|glass|window|light|lamp|chrome|rim|under|shadow/i;
const NON_ROLLING_WHEEL = /spare|extra|holder|carrier|cover|decoration|detail/i;

function meshContextNames(mesh) {
  let names = (mesh.name || '').toLowerCase();
  let parent = mesh.parent;
  while (parent) {
    names += ` ${(parent.name || '').toLowerCase()}`;
    parent = parent.parent;
  }
  return names;
}

function isDriveWheel(mesh) {
  const name = (mesh.name || '').toLowerCase();
  const context = meshContextNames(mesh);
  if (NON_ROLLING_WHEEL.test(context)) return false;
  // Kenney SUV spare tire mounted on the rear door.
  if (name === 'wheel-back') return false;
  return /wheel|tire|tyre|rim/.test(name);
}

function findWheels(root) {
  const wheels = [];
  const seen = new Set();
  root.traverse((child) => {
    if (!child.isMesh || !isDriveWheel(child) || seen.has(child.uuid)) return;
    seen.add(child.uuid);
    wheels.push(child);
  });
  return wheels;
}

/** Spin road wheels and steer only the front axle. */
export function spinWheels(wheels, speed, steerVisual = 0) {
  const spin = speed * 0.06;
  for (const wheel of wheels) {
    wheel.rotation.x += spin;
    if (/front/i.test(wheel.name || '')) {
      wheel.rotation.y = steerVisual;
    }
  }
}

function shouldPaint(mesh, mat) {
  const labels = `${mesh.name || ''} ${mat?.name || ''}`.toLowerCase();
  if (PAINT_SKIP.test(labels)) return false;
  if (mat?.transparent && mat.opacity < 0.45) return false;
  return true;
}

function paintMaterial(mat, tint) {
  const m = mat.clone();
  m.map = null;
  m.alphaMap = null;
  m.emissiveMap = null;
  if (m.color) m.color.copy(tint);
  if ('metalness' in m) m.metalness = 0.38;
  if ('roughness' in m) m.roughness = 0.42;
  m.userData = { ...(m.userData || {}), isPaint: true };
  m.needsUpdate = true;
  return m;
}

function paintMaterialPreserve(mat, tint, strength) {
  const m = mat.clone();
  if (m.color) m.color.lerp(tint, strength);
  m.userData = { ...(m.userData || {}), isPaint: true };
  m.needsUpdate = true;
  return m;
}

/** Apply a solid team color to all paintable body meshes. */
export function applyCarColor(car, color, { preserveTextures = false, strength = 0.3 } = {}) {
  const tint = new THREE.Color(color ?? 0xffffff);
  car.traverse((child) => {
    if (!child.isMesh) return;
    const paint = (mat) => {
      if (!shouldPaint(child, mat)) return mat.clone();
      return preserveTextures
        ? paintMaterialPreserve(mat, tint, strength)
        : paintMaterial(mat, tint);
    };
    if (Array.isArray(child.material)) {
      child.material = child.material.map(paint);
    } else if (child.material) {
      child.material = paint(child.material);
    }
  });
  car.userData.color = color;
  car.userData.baseColor = new THREE.Color(color);
}

/** Darken / desaturate paint as the car takes damage. */
export function applyDamageWear(car, healthRatio) {
  const base = car.userData.baseColor;
  if (!base) return;
  const wear = 1 - healthRatio;
  const scratch = new THREE.Color(0x333333);
  car.traverse((child) => {
    if (!child.isMesh || !child.material?.color) return;
    if (/wheel|tire|tyre|glass|window|light|lamp|chrome|rim/i.test(child.name || '')) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat.color || !mat.userData?.isPaint) continue;
      mat.color.copy(base).lerp(scratch, wear * 0.55);
    }
  });
}

function fitModel(model, def) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const length = Math.max(size.x, size.z);
  const scale = (def.targetLength ?? 4.2) / Math.max(length, 0.001);
  model.scale.setScalar(scale);

  const fitted = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  fitted.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitted.min.y;
}

async function loadTemplate(carId) {
  const id = getCarDef(carId).id;
  if (templateCache.has(id)) return templateCache.get(id);
  if (loadPromises.has(id)) return loadPromises.get(id);

  const promise = (async () => {
    const def = getCarDef(id);
    const gltf = await loader.loadAsync(def.file);
    const model = gltf.scene;
    model.rotation.y = def.rotY ?? 0;
    fitModel(model, def);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const wrapper = new THREE.Group();
    wrapper.add(model);
    templateCache.set(id, wrapper);
    loadPromises.delete(id);
    return wrapper;
  })();

  loadPromises.set(id, promise);
  return promise;
}

async function getColoredTemplate(carId, color) {
  const def = getCarDef(carId);
  const tint = new THREE.Color(color ?? def.defaultColor);
  const key = `${def.id}-${tint.getHexString()}`;
  if (coloredTemplateCache.has(key)) return coloredTemplateCache.get(key);

  const template = await loadTemplate(def.id);
  const painted = template.clone(true);
  applyCarColor(painted, tint);
  painted.userData.wheels = findWheels(painted);
  painted.userData.carModelId = def.id;
  coloredTemplateCache.set(key, painted);
  return painted;
}

/** Preload all car models (call during boot). */
export function preloadCars() {
  return Promise.all(CAR_CATALOG.map((c) => loadTemplate(c.id)));
}

/**
 * Build a car mesh from a Kenney GLB model.
 * Returns a THREE.Group whose forward direction is +Z.
 */
export async function createCar(carModelId, color, { copyPaint = false, preserveTextures = false } = {}) {
  const def = getCarDef(carModelId ?? DEFAULT_CAR_ID);
  const tint = color ?? def.defaultColor;

  if (preserveTextures) {
    const template = await loadTemplate(def.id);
    const car = template.clone(true);
    applyCarColor(car, tint, { preserveTextures: true, strength: def.tintStrength ?? 0.3 });
    car.userData.wheels = findWheels(car);
    car.userData.carModelId = def.id;
    car.userData.color = tint;
    car.userData.baseColor = new THREE.Color(tint);
    return car;
  }

  const template = await getColoredTemplate(def.id, tint);
  const car = template.clone();
  if (copyPaint) applyCarColor(car, tint);
  car.userData.wheels = findWheels(car);
  car.userData.carModelId = def.id;
  car.userData.color = tint;
  car.userData.baseColor = new THREE.Color(tint);
  return car;
}

/** Dispose a car instance. Set keepAssets when the mesh shares cached materials. */
export function disposeCar(car, { keepAssets = false } = {}) {
  detachCarHeadlights(car);
  car.parent?.remove(car);
  if (keepAssets) return;
  car.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat.dispose?.();
    }
  });
}

/**
 * Soft falloff texture for volumetric headlight cones.
 */
function makeBeamFalloffTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Night-driving lights for dark atmospheres (Black Hole):
 * cool soft headlights ahead, muted crimson taillights behind.
 */
export function attachCarHeadlights(car, {
  color = 0xd8e6ff,
  intensity = 7,
  distance = 72,
  tailColor = 0xb02030,
} = {}) {
  detachCarHeadlights(car);

  const box = localBoundingBox(car);
  const frontZ = box.max.z;
  const rearZ = box.min.z;
  const halfW = Math.max(0.45, Math.min(0.95, (box.max.x - box.min.x) * 0.28));
  const lampY = THREE.MathUtils.clamp(box.min.y + (box.max.y - box.min.y) * 0.28, 0.35, 0.85);
  const frontLampZ = frontZ - 0.08;
  const rearLampZ = rearZ + 0.08;

  const group = new THREE.Group();
  group.name = 'car-lights';

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xf4f8ff,
    emissive: new THREE.Color(color),
    emissiveIntensity: 2.4,
    roughness: 0.25,
    metalness: 0.05,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x881018,
    emissive: new THREE.Color(tailColor),
    emissiveIntensity: 1.8,
    roughness: 0.4,
    metalness: 0.05,
  });
  const lampGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const tailGeo = new THREE.BoxGeometry(0.2, 0.08, 0.05);
  const beamMat = new THREE.MeshBasicMaterial({
    map: makeBeamFalloffTexture(),
    color,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const up = new THREE.Vector3(0, 1, 0);
  const beamDir = new THREE.Vector3();
  const beamFrom = new THREE.Vector3();
  const beamTo = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  for (const side of [-1, 1]) {
    const lx = side * halfW;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(lx, lampY, frontLampZ);
    group.add(lamp);

    beamFrom.set(lx * 0.85, lampY + 0.02, frontLampZ);
    beamTo.set(lx * 0.25, 0.02, frontLampZ + 28);
    beamDir.subVectors(beamTo, beamFrom).normalize();

    const beam = new THREE.SpotLight(color, intensity, distance, Math.PI / 6.2, 0.65, 1.15);
    beam.position.copy(beamFrom);
    beam.target.position.copy(beamTo);
    beam.castShadow = false;
    group.add(beam);
    group.add(beam.target);

    const coneLen = 18;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, coneLen, 20, 1, true), beamMat);
    quat.setFromUnitVectors(up, beamDir.clone().negate());
    cone.quaternion.copy(quat);
    cone.position.copy(beamFrom).addScaledVector(beamDir, coneLen * 0.5);
    group.add(cone);

    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(side * halfW * 0.95, lampY + 0.05, rearLampZ);
    group.add(tail);

    const tailLight = new THREE.PointLight(tailColor, 0.55, 4.5, 2.2);
    tailLight.position.set(side * halfW * 0.9, lampY, rearLampZ - 0.1);
    group.add(tailLight);
  }

  const brake = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.05, 0.05, 0.04),
    tailMat,
  );
  brake.position.set(0, lampY + 0.32, rearLampZ);
  group.add(brake);

  car.add(group);
  car.userData.headlights = group;
  return group;
}

/** Axis-aligned bounds of `root` in its local space. */
function localBoundingBox(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const temp = new THREE.Box3();
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    temp.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld).applyMatrix4(inv);
    box.union(temp);
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(1, 1.2, 2));
  return box;
}

export function detachCarHeadlights(car) {
  const group = car?.userData?.headlights;
  if (!group) return;
  group.traverse((child) => {
    if (child.isLight) return;
    child.geometry?.dispose?.();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) mat?.dispose?.();
  });
  group.parent?.remove(group);
  car.userData.headlights = null;
}
