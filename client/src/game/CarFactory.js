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
  car.parent?.remove(car);
  if (keepAssets) return;
  car.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat.dispose?.();
    }
  });
}
