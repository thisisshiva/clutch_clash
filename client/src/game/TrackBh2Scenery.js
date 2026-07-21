import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { performanceTier } from './PerformanceConfig.js';
import { curveFrameAt } from './spline.js';
import holeUrl from '../../../brand/thumbnails/black-hole-only.png';
import envUrl from '../../../brand/thumbnails/black-hole-bg.png';

/**
 * bh-2 — simple art setup:
 * 1) environment image wrapped 360°
 * 2) one black-hole image at the destination (gentle spin)
 */

const ASSET_ROOT = '/models/scenery';
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

const DENSITY = {
  low: { asteroids: 32, beacons: 40 },
  medium: { asteroids: 52, beacons: 56 },
  high: { asteroids: 76, beacons: 72 },
}[performanceTier];

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function loadTemplate(file) {
  if (!modelCache.has(file)) {
    modelCache.set(file, gltfLoader.loadAsync(`${ASSET_ROOT}/${file}`).then(({ scene }) => scene));
  }
  return modelCache.get(file);
}

function cloneModel(template) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = true;
    if (!child.material) return;
    const wasArray = Array.isArray(child.material);
    const mats = wasArray ? child.material : [child.material];
    const next = mats.map((m) => {
      const cloned = m.clone();
      cloned.flatShading = true;
      cloned.roughness = Math.min(0.9, cloned.roughness ?? 0.85);
      cloned.metalness = Math.min(0.12, cloned.metalness ?? 0.04);
      if (cloned.emissive) cloned.emissiveIntensity = Math.min(cloned.emissiveIntensity ?? 0, 0.12);
      cloned.needsUpdate = true;
      return cloned;
    });
    child.material = wasArray ? next : next[0];
  });
  return clone;
}

async function makeAsteroid(file, targetSize) {
  const model = cloneModel(await loadTemplate(file));
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  model.scale.setScalar(targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001));
  const box = new THREE.Box3().setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

async function makeProp(file, targetSize) {
  const template = await loadTemplate(file);
  const model = template.clone(true);
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = true;
  });
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  model.scale.setScalar(targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001));
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

/**
 * Full original painting as a single 360 sky wrap.
 * Soft-extends edges + soft-darkens only the painted hole (no road punch, no tiling seam).
 */
function loadEnvironmentTexture() {
  return loadTexture(envUrl).then((tex) => {
    const img = tex.image;
    const srcW = img.width;
    const srcH = img.height;
    // Taller canvas so poles fade into void instead of hard-cutting the art.
    const padY = Math.round(srcH * 0.22);
    const w = srcW;
    const h = srcH + padY * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Fill with deep space, then paint source in the middle band.
    ctx.fillStyle = '#06020e';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, padY);

    // Soft-bleed top/bottom rows into the padded void (kills hard horizontal section).
    const bleed = Math.round(srcH * 0.12);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < bleed; i++) {
      const t = i / bleed;
      ctx.globalAlpha = (1 - t) * 0.85;
      // top bleed upward
      ctx.drawImage(img, 0, 0, srcW, 2, 0, padY - i, w, 2);
      // bottom bleed downward
      ctx.drawImage(img, 0, srcH - 2, srcW, 2, 0, padY + srcH + i, w, 2);
    }
    ctx.globalAlpha = 1;

    // Soft left/right wrap blend so the sphere seam is less obvious.
    const seam = Math.round(srcW * 0.04);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < seam; i++) {
      const a = (1 - i / seam) * 0.5;
      ctx.globalAlpha = a;
      ctx.drawImage(img, srcW - 1 - i, 0, 1, srcH, i, padY, 1, srcH);
      ctx.drawImage(img, i, 0, 1, srcH, w - 1 - i, padY, 1, srcH);
    }
    ctx.globalAlpha = 1;

    // Soft-darken painted hole only (one spinning plate remains the hole).
    const hx = w * 0.735;
    const hy = padY + srcH * 0.255;
    const r = Math.min(srcW, srcH) * 0.22;
    const g = ctx.createRadialGradient(hx, hy, r * 0.5, hx, hy, r);
    g.addColorStop(0, 'rgba(6, 2, 14, 1)');
    g.addColorStop(0.7, 'rgba(6, 2, 14, 0.75)');
    g.addColorStop(1, 'rgba(6, 2, 14, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();

    const out = new THREE.CanvasTexture(canvas);
    out.colorSpace = THREE.SRGBColorSpace;
    out.anisotropy = tex.anisotropy;
    out.wrapS = THREE.RepeatWrapping;
    out.wrapT = THREE.ClampToEdgeWrapping;
    out.repeat.set(1, 1);
    tex.dispose();
    return out;
  });
}

function addEnvironmentWrap(group, holePos) {
  loadEnvironmentTexture().then((tex) => {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(5000, 64, 40),
      new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    sky.renderOrder = -50;
    // Aim the painting's hole region toward the destination.
    if (holePos) {
      sky.rotation.y = Math.atan2(holePos.x, holePos.z) + Math.PI;
    }
    group.add(sky);
  }).catch((err) => console.warn('BH-2 environment wrap failed', err));
}

function addHolePlate(root, animation) {
  const spin = new THREE.Group();
  root.add(spin);
  animation.holeSpin = spin;

  loadTexture(holeUrl).then((tex) => {
    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(520, 64),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      }),
    );
    plate.position.z = -4;
    plate.renderOrder = -8;
    spin.add(plate);

    const haze = new THREE.Mesh(
      new THREE.CircleGeometry(580, 64),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    haze.position.z = -18;
    haze.renderOrder = -9;
    spin.add(haze);
  }).catch((err) => console.warn('BH-2 hole plate failed', err));
}

let cyanGlowTex = null;
function getCyanGlowTexture() {
  if (cyanGlowTex) return cyanGlowTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(220,255,255,1)');
  g.addColorStop(0.2, 'rgba(80,230,255,0.85)');
  g.addColorStop(0.55, 'rgba(40,180,255,0.25)');
  g.addColorStop(1, 'rgba(0,40,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  cyanGlowTex = new THREE.CanvasTexture(canvas);
  cyanGlowTex.colorSpace = THREE.SRGBColorSpace;
  return cyanGlowTex;
}

function addCyanStreetGlow(post, withLight) {
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({
      color: 0x2af0ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.06;
  post.add(pad);

  const padGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getCyanGlowTexture(),
    color: 0x7af0ff,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  padGlow.position.set(0, 0.35, 0);
  padGlow.scale.set(2.4, 2.4, 1);
  post.add(padGlow);

  const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getCyanGlowTexture(),
    color: 0xaaffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  headGlow.position.set(0, 5.8, 0);
  headGlow.scale.set(1.6, 1.6, 1);
  post.add(headGlow);

  if (withLight) {
    const light = new THREE.PointLight(0x2ad8ff, 2.2, 28, 1.8);
    light.position.set(0, 5.6, 0);
    post.add(light);
  }
}

async function addStreetLights(group, curve, trackDef) {
  const count = DENSITY.beacons;
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const halfW = (trackDef.roadWidth || 14) / 2;
  // Flush to road edge (shared curveFrameAt vectors are mutated by other async scenery).
  const edge = halfW + 0.55;

  for (let i = 0; i < count; i++) {
    const t = 0.02 + (i / count) * 0.88;
    const frame = curveFrameAt(curve, t, closed, trackLength);
    const px = frame.point.x;
    const pz = frame.point.z;
    const nx = frame.normal.x;
    const nz = frame.normal.z;
    const tx = frame.tangent.x;
    const tz = frame.tangent.z;
    for (const side of [1, -1]) {
      let post;
      try {
        post = await makeProp('light-post.glb', 5.4);
      } catch {
        continue;
      }
      post.position.set(
        px + nx * edge * side,
        0,
        pz + nz * edge * side,
      );
      post.rotation.y = Math.atan2(tx, tz) + (side > 0 ? Math.PI : 0);
      addCyanStreetGlow(post, i % 4 === 0);
      group.add(post);
    }
  }
}

async function addAsteroids(group, curve, trackDef, holePos) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const halfW = (trackDef.roadWidth || 14) / 2;
  const files = ['asteroid-toastie.glb', 'asteroid-poly.glb'];
  const floaters = [];

  for (let i = 0; i < DENSITY.asteroids; i++) {
    const file = files[i % 2];
    const t = 0.03 + (i / DENSITY.asteroids) * 0.78;
    const frame = curveFrameAt(curve, t, closed, trackLength);
    const px = frame.point.x;
    const pz = frame.point.z;
    const nx = frame.normal.x;
    const nz = frame.normal.z;
    const tx = frame.tangent.x;
    const tz = frame.tangent.z;
    const side = i % 5 === 0 ? -1 : 1;
    const outward = halfW + 20 + (i % 8) * 18;
    let rock;
    try {
      rock = await makeAsteroid(file, 7 + (i % 10) * 3.2);
    } catch {
      continue;
    }
    const along = ((i * 41) % 40) - 20;
    rock.position.set(
      px + nx * outward * side + tx * along,
      3 + (i % 9) * 3.2,
      pz + nz * outward * side + tz * along,
    );
    rock.rotation.set(i * 0.6, i * 1.05, i * 0.35);
    group.add(rock);
    floaters.push({
      obj: rock,
      origin: rock.position.clone(),
      phase: i * 0.85,
      amp: 0.7 + (i % 4) * 0.35,
      spin: 0.07 + (i % 3) * 0.03,
    });
  }

  for (let i = 0; i < 12; i++) {
    let rock;
    try {
      rock = await makeAsteroid(files[i % 2], 26 + i * 5);
    } catch {
      continue;
    }
    const frame = curveFrameAt(curve, 0.32 + i * 0.02, closed, trackLength);
    const nx = frame.normal.x;
    const nz = frame.normal.z;
    const side = i % 3 === 0 ? -1 : 1;
    rock.position.set(
      holePos.x + nx * side * (70 + i * 22),
      8 + i * 7,
      holePos.z - 30 - i * 18,
    );
    rock.rotation.set(i, i * 0.4, i * 0.2);
    group.add(rock);
  }

  return floaters;
}

function addLighting(group, holePos, towardRoad) {
  const key = new THREE.PointLight(0xff9050, 10, 3800, 0.85);
  key.position.copy(holePos).add(towardRoad.clone().multiplyScalar(40));
  group.add(key);

  const pink = new THREE.PointLight(0xff60b8, 5.5, 3000, 1.0);
  pink.position.copy(holePos).add(new THREE.Vector3(0, 100, 0));
  group.add(pink);

  const violet = new THREE.PointLight(0x8050c8, 4, 2800, 1.1);
  violet.position.copy(holePos).add(towardRoad.clone().multiplyScalar(-80));
  group.add(violet);

  const fill = new THREE.HemisphereLight(0x2a1848, 0x040208, 0.35);
  group.add(fill);
}

function addDestination(group, curve, trackDef, animation, holePos, towardRoad) {
  const root = new THREE.Group();
  root.position.copy(holePos);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardRoad);
  root.scale.setScalar(1.4);

  addHolePlate(root, animation);
  group.add(root);

  addLighting(group, holePos, towardRoad);
  addStreetLights(group, curve, trackDef).catch((err) => console.warn('BH-2 lights failed', err));
  animation.holePos = holePos;

  addAsteroids(group, curve, trackDef, holePos).then((floaters) => {
    animation.floaters = floaters;
  }).catch((err) => console.warn('BH-2 asteroids failed', err));
}

function destinationPose(curve, trackDef) {
  const closed = trackDef.closed !== false;
  const trackLength = trackDef.length || 8000;
  const frame = curveFrameAt(curve, 0.34, closed, trackLength);
  const ahead = frame.tangent.clone().normalize();
  const point = frame.point.clone();

  const holePos = new THREE.Vector3(
    point.x + ahead.x * 60,
    58,
    point.z + ahead.z * 60,
  );
  const towardRoad = new THREE.Vector3(
    point.x - ahead.x * 140,
    12,
    point.z - ahead.z * 140,
  ).sub(holePos).normalize();

  return { holePos, towardRoad };
}

export function buildBh2Scenery(curve, trackDef) {
  const group = new THREE.Group();
  group.name = 'bh-2-scenery';
  const animation = {
    elapsed: 0,
    holeSpin: null,
    floaters: [],
  };

  const { holePos, towardRoad } = destinationPose(curve, trackDef);
  addEnvironmentWrap(group, holePos);
  addDestination(group, curve, trackDef, animation, holePos, towardRoad);

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    if (animation.holeSpin) animation.holeSpin.rotation.z = animation.elapsed * 0.045;
    for (const f of animation.floaters) {
      f.obj.position.y = f.origin.y + Math.sin(animation.elapsed * 0.4 + f.phase) * f.amp;
      f.obj.rotation.y += dt * f.spin;
      f.obj.rotation.x += dt * f.spin * 0.3;
    }
  };

  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
  };

  return group;
}
