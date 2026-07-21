import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { performanceTier } from '../PerformanceConfig.js';

export const _point = new THREE.Vector3();
export const _tangent = new THREE.Vector3();
export const _normal = new THREE.Vector3();

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const modelCache = new Map();
const textureCache = new Map();
const imageCache = new Map();
const ASSET_ROOT = '/models/scenery';
const IMG_ROOT = '/img/mt-fuji';
/** Bump when replacing backdrop files so browsers don't keep stale images. */
const IMG_VERSION = '10';

export const DENSITY = {
  low: { trees: 36, petals: 28, stars: 28, clutter: 120 },
  medium: { trees: 56, petals: 48, stars: 48, clutter: 220 },
  high: { trees: 80, petals: 70, stars: 72, clutter: 360 },
}[performanceTier];

export function loadTexture(file) {
  if (!textureCache.has(file)) {
    textureCache.set(
      file,
      textureLoader.loadAsync(`${IMG_ROOT}/${file}?v=${IMG_VERSION}`).then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
      }),
    );
  }
  return textureCache.get(file);
}

function loadImage(file) {
  if (!imageCache.has(file)) {
    imageCache.set(
      file,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `${IMG_ROOT}/${file}?v=${IMG_VERSION}`;
      }),
    );
  }
  return imageCache.get(file);
}

export function loadTemplate(file) {
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
  });
  return clone;
}

export async function makeAsset(file, targetSize, { grounded = true } = {}) {
  const model = cloneModel(await loadTemplate(file));
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
  model.scale.setScalar(scale);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= grounded ? box.min.y : center.y;

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}

export function trackPose(curve, t, side, outward, height = 0) {
  const clamped = Math.max(0, Math.min(1, t));
  const point = curve.getPointAt(clamped);
  const tangent = curve.getTangentAt(clamped).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  return {
    position: point.addScaledVector(normal, side * outward).setY(height),
    heading: Math.atan2(tangent.x, tangent.z),
    tangent: tangent.clone(),
    normal: normal.clone(),
  };
}

export function addWhenReady(group, asset) {
  if (group.userData.disposed) {
    asset.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material?.dispose());
    });
    return false;
  }
  group.add(asset);
  return true;
}

export function buildSideRibbon(curve, samples, halfW, side, extent, {
  widthSegments = 1,
  height = 0,
  innerPadding = 0.35,
  undulation = 0,
  innerNoise = 0,
  outerNoise = 0,
  heightFn = null,
} = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const baseInnerOff = halfW + innerPadding;
  const baseOuterOff = halfW + extent;
  const rowSize = widthSegments + 1;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    curve.getPointAt(t, _point);
    curve.getTangentAt(t, _tangent).normalize();
    _normal.set(_tangent.z, 0, -_tangent.x).normalize();
    const edgeWave = Math.sin(t * Math.PI * 37) * 0.65 + Math.sin(t * Math.PI * 103) * 0.35;
    const innerOff = baseInnerOff + edgeWave * innerNoise;
    const outerOff = baseOuterOff + edgeWave * outerNoise;

    for (let w = 0; w <= widthSegments; w++) {
      const across = w / widthSegments;
      const offset = THREE.MathUtils.lerp(innerOff, outerOff, across) * side;
      const x = _point.x + _normal.x * offset;
      const z = _point.z + _normal.z * offset;
      const y = heightFn
        ? heightFn(across, x, z, t)
        : height + undulation * (
          Math.sin(x * 0.021 + z * 0.013)
          + Math.sin(x * 0.047 - z * 0.019) * 0.45
        );
      positions.push(x, y, z);
      uvs.push(across, t * 80);
    }
    if (i < samples) {
      for (let w = 0; w < widthSegments; w++) {
        const a = i * rowSize + w;
        if (side > 0) {
          indices.push(a, a + rowSize, a + 1, a + 1, a + rowSize, a + rowSize + 1);
        } else {
          indices.push(a, a + 1, a + rowSize, a + 1, a + rowSize + 1, a + rowSize);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/**
 * Equirectangular sky texture for a full sphere:
 * zenith → horizon painting → ground haze. No open top.
 */
async function buildEquirectSkyTexture(file, skyGradient, groundHex) {
  const img = await loadImage(file);
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // v=0 bottom (nadir), v=1 top (zenith) — matches Three.js SphereGeometry UVs.
  const sky = ctx.createLinearGradient(0, H, 0, 0);
  for (const [stop, hex] of skyGradient) {
    sky.addColorStop(stop, hexCss(hex));
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Soft ground wash at the very bottom so nadir isn't empty.
  const gr = (groundHex >> 16) & 255;
  const gg = (groundHex >> 8) & 255;
  const gb = groundHex & 255;
  const gw = ctx.createLinearGradient(0, H, 0, H * 0.55);
  gw.addColorStop(0, `rgba(${gr},${gg},${gb},0.95)`);
  gw.addColorStop(0.7, `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = gw;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // Painting on the forward horizon band (~40% of yaw, mid elevation).
  const bandW = Math.floor(W * 0.48);
  const bandX = Math.floor((W - bandW) / 2);
  const bandH = Math.floor(H * 0.52);
  const bandY = Math.floor(H * 0.22);

  ctx.drawImage(img, bandX, bandY, bandW, bandH);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  const featherX = Math.floor(bandW * 0.2);
  const leftFade = ctx.createLinearGradient(bandX, 0, bandX + featherX, 0);
  leftFade.addColorStop(0, 'rgba(0,0,0,1)');
  leftFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leftFade;
  ctx.fillRect(bandX, bandY, featherX, bandH);

  const rightFade = ctx.createLinearGradient(bandX + bandW - featherX, 0, bandX + bandW, 0);
  rightFade.addColorStop(0, 'rgba(0,0,0,0)');
  rightFade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = rightFade;
  ctx.fillRect(bandX + bandW - featherX, bandY, featherX, bandH);

  const featherY = Math.floor(bandH * 0.2);
  const topFade = ctx.createLinearGradient(0, bandY, 0, bandY + featherY);
  topFade.addColorStop(0, 'rgba(0,0,0,1)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(bandX, bandY, bandW, featherY);

  const botFade = ctx.createLinearGradient(0, bandY + bandH - featherY, 0, bandY + bandH);
  botFade.addColorStop(0, 'rgba(0,0,0,0)');
  botFade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = botFade;
  ctx.fillRect(bandX, bandY + bandH - featherY, bandW, featherY);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a true 2:1 equirectangular skybox from a panoramic anime plate.
 * Full wrap — no floating card, no hard vertical edge.
 */
async function buildFullSkyboxTexture(file) {
  const img = await loadImage(file);
  // 2048×1024 is enough for a sky sphere and much cheaper on VRAM/FPS.
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const probe = document.createElement('canvas');
  probe.width = Math.max(1, img.naturalWidth || img.width);
  probe.height = Math.max(1, img.naturalHeight || img.height);
  const pctx = probe.getContext('2d');
  pctx.drawImage(img, 0, 0);
  const topPx = pctx.getImageData(Math.floor(probe.width * 0.5), 2, 1, 1).data;
  const botPx = pctx.getImageData(Math.floor(probe.width * 0.5), probe.height - 3, 1, 1).data;
  const midPx = pctx.getImageData(2, Math.floor(probe.height * 0.4), 1, 1).data;
  const skyTop = `rgb(${topPx[0]},${topPx[1]},${topPx[2]})`;
  const skyBot = `rgb(${botPx[0]},${botPx[1]},${botPx[2]})`;
  const skyMid = `rgb(${midPx[0]},${midPx[1]},${midPx[2]})`;

  const fill = ctx.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, skyTop);
  fill.addColorStop(0.45, skyMid);
  fill.addColorStop(1, skyBot);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, W, H);

  // Equirect: y=0 zenith, y=H/2 horizon. Shift panorama UP so Fuji clears terrain.
  const drawH = Math.floor(H * 0.78);
  const drawY = Math.floor(H * -0.1);
  ctx.drawImage(img, 0, drawY, W, drawH);

  // Soft poles so zenith/nadir don't look cropped.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const topFade = ctx.createLinearGradient(0, 0, 0, H * 0.05);
  topFade.addColorStop(0, 'rgba(0,0,0,1)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, W, H * 0.05);

  // Fade only the far nadir — keep Fuji's base near the horizon.
  const botFade = ctx.createLinearGradient(0, H * 0.78, 0, H);
  botFade.addColorStop(0, 'rgba(0,0,0,0)');
  botFade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = botFade;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Blend the 0°/360° seam.
  const seam = 40;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(canvas, W - seam, 0, seam, H, 0, 0, seam, H);
  ctx.drawImage(canvas, 0, 0, seam, H, W - seam, 0, seam, H);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Camera-locked 360° sky sphere.
 * Yaw tracks the camera so Fuji stays ahead; pitch lifts the mountain above terrain.
 */
export async function createFullSkybox(curve, file, { pitch = -0.28 } = {}) {
  const tex = await buildFullSkyboxTexture(file);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 16),
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  shell.name = 'mt-fuji-skybox-360';
  shell.renderOrder = -20;
  shell.frustumCulled = false;
  shell.rotation.x = pitch;

  const group = new THREE.Group();
  group.name = 'mt-fuji-sky';
  group.add(shell);
  group.userData.skyMesh = shell;
  const tangent = curve.getTangentAt(0.5).normalize();
  group.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI;
  return group;
}

/** Soft full sky sphere — gradient only, no painting seams / white voids. */
export function createGradientSkySphere(skyGradient) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 512, 0, 0);
  for (const [stop, hex] of skyGradient) {
    sky.addColorStop(stop, hexCss(hex));
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 8, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(5200, 48, 24),
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  shell.name = 'mt-fuji-gradient-sky';
  shell.renderOrder = -20;
  shell.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'mt-fuji-sky';
  group.add(shell);
  return group;
}

/**
 * Soft-edged Fuji plate — NO circular vignette.
 * Intended to be camera-locked so Fuji stays the destination ahead.
 */
export async function createHorizonFuji(file, {
  width = 7200,
  height = 3600,
} = {}) {
  const img = await loadImage(file);
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);

  // Soft rectangular edge fade only (no radial blob).
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.06, 'rgba(0,0,0,1)');
  fade.addColorStop(0.94, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'destination-in';
  const vfade = ctx.createLinearGradient(0, 0, 0, H);
  vfade.addColorStop(0, 'rgba(0,0,0,0)');
  vfade.addColorStop(0.08, 'rgba(0,0,0,1)');
  vfade.addColorStop(0.88, 'rgba(0,0,0,1)');
  vfade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vfade;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'mt-fuji-horizon';
  mesh.renderOrder = -15;
  mesh.frustumCulled = false;
  return mesh;
}

/** @deprecated use createHorizonFuji — kept for older variants */
export async function createDestinationBackdrop(curve, file, opts = {}) {
  const mesh = await createHorizonFuji(file, opts);
  const end = curve.getPointAt(1);
  const tangent = curve.getTangentAt(0.97).normalize();
  const ahead = opts.ahead ?? 2400;
  const lift = opts.lift ?? 900;
  mesh.position.set(
    end.x + tangent.x * ahead,
    lift,
    end.z + tangent.z * ahead,
  );
  mesh.lookAt(end.x - tangent.x * 200, lift, end.z - tangent.z * 200);
  return mesh;
}

/** Full camera-locked sky sphere — covers zenith, horizon, and nadir. */
export async function createAnimeSkyShell(curve, file, skyGradient, groundHex) {
  const tex = await buildEquirectSkyTexture(file, skyGradient, groundHex);
  const radius = 4800;
  const geo = new THREE.SphereGeometry(radius, 64, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(geo, mat);
  shell.name = 'mt-fuji-sky-sphere';
  shell.renderOrder = -20;
  shell.frustumCulled = false;

  const tangent = curve.getTangentAt(0.85).normalize();
  shell.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI;

  const group = new THREE.Group();
  group.name = 'mt-fuji-sky';
  group.add(shell);
  return group;
}

function makeGroundTexture(baseHex, tintHex) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexCss(baseHex);
  ctx.fillRect(0, 0, size, size);

  const tr = (tintHex >> 16) & 255;
  const tg = (tintHex >> 8) & 255;
  const tb = tintHex & 255;

  // Soft meadow patches — avoid flat neon slab look.
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (Math.random() > 0.55) {
      g.addColorStop(0, 'rgba(255, 200, 220, 0.14)');
      g.addColorStop(1, 'rgba(255, 200, 220, 0)');
    } else {
      g.addColorStop(0, `rgba(${tr},${tg},${tb},0.25)`);
      g.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 9000; i++) {
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    ctx.fillStyle = Math.random() > 0.7 ? '#f5c4d4' : '#ffffff';
    const r = 0.4 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft anime meadow — kept SMALL so it doesn't bury the skybox Fuji. */
export function createAnimeGround(color, fogColor, tintColor, {
  radius = 900,
  openHorizon = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'mt-fuji-ground';

  const tex = makeGroundTexture(color, tintColor ?? fogColor);
  const meadowR = openHorizon ? Math.min(radius, 420) : radius;
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(meadowR, openHorizon ? 36 : 48),
    new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffffff,
      fog: true,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  group.add(ground);

  if (!openHorizon) {
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(650, 1400, 48),
      new THREE.MeshBasicMaterial({
        color: fogColor,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.25;
    group.add(rim);
  }

  return group;
}

/** Rolling embankments + soft hills along the road. */
export function createRoadTerrain(curve, trackDef, colors) {
  const group = new THREE.Group();
  const halfW = trackDef.roadWidth / 2;
  const openHorizon = !!colors.openHorizon;
  const samples = openHorizon
    ? Math.max(160, Math.min(320, Math.round((trackDef.length || 8000) / 28)))
    : Math.max(260, Math.min(760, Math.round((trackDef.length || 8000) / 14)));
  const hillExtent = openHorizon ? 64 : 680;
  const hillPeak = openHorizon ? 2 : 16;
  const mistExtent = openHorizon ? 0 : 1600;

  const bermMat = new THREE.MeshStandardMaterial({
    color: colors.berm,
    roughness: 0.98,
    metalness: 0,
  });
  const hillMat = new THREE.MeshStandardMaterial({
    color: colors.hill,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  for (const side of [1, -1]) {
    const berm = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, 22, {
        innerPadding: 1.1,
        height: -0.02,
        widthSegments: 3,
        undulation: 0.25,
        outerNoise: 1.6,
      }),
      bermMat,
    );
    berm.receiveShadow = true;
    group.add(berm);

    const hills = new THREE.Mesh(
      buildSideRibbon(curve, samples, halfW, side, hillExtent, {
        innerPadding: 16,
        widthSegments: performanceTier === 'low' || openHorizon ? 4 : 7,
        heightFn: (across, x, z, t) => {
          const roll = openHorizon
            ? Math.sin(x * 0.01 + z * 0.008) * 0.5
            : Math.sin(x * 0.008 + z * 0.006 + t * 12) * 9
              + Math.sin(x * 0.02 - z * 0.015) * 5;
          return 0.15 + across ** 1.05 * (hillPeak + roll) * (0.6 + (1 - t) * 0.4);
        },
      }),
      hillMat,
    );
    hills.receiveShadow = true;
    group.add(hills);

    if (mistExtent > 0 && (colors.mistOpacity ?? 0) > 0.01) {
      const mistMat = new THREE.MeshBasicMaterial({
        color: colors.mist,
        transparent: true,
        opacity: colors.mistOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mist = new THREE.Mesh(
        buildSideRibbon(curve, samples, halfW, side, mistExtent, {
          innerPadding: 40,
          widthSegments: 4,
          heightFn: (across) => 2 + across * 55,
        }),
        mistMat,
      );
      mist.renderOrder = -4;
      group.add(mist);
    }
  }
  return group;
}

/** Small rocks / tufts so the roadside isn't a blank slab. */
export function addGroundClutter(group, curve, halfW, rng, color) {
  const count = DENSITY.clutter;
  const geo = new THREE.ConeGeometry(0.35, 0.7, 5);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < count; i++) {
    const t = rng();
    const side = rng() > 0.5 ? 1 : -1;
    const pose = trackPose(curve, t, side, halfW + 2 + rng() ** 1.4 * 28);
    pos.copy(pose.position);
    pos.y = 0.05;
    euler.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
    quat.setFromEuler(euler);
    const s = 0.35 + rng() * 1.4;
    scale.set(s * (0.6 + rng()), s, s * (0.6 + rng()));
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function makePetalTexture(hex) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hexCss(hex);
  ctx.beginPath();
  ctx.ellipse(32, 32, 18, 10, -0.4, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDriftingPetals(curve, count, colorHex, animation) {
  const mat = new THREE.SpriteMaterial({
    map: makePetalTexture(colorHex),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  for (let i = 0; i < count; i++) {
    const sprite = new THREE.Sprite(mat);
    const pose = trackPose(
      curve,
      Math.random(),
      Math.random() > 0.5 ? 1 : -1,
      6 + Math.random() * 28,
      2 + Math.random() * 14,
    );
    sprite.position.copy(pose.position);
    sprite.scale.setScalar(0.6 + Math.random() * 1.1);
    animation.group.add(sprite);
    animation.petals.push({
      object: sprite,
      origin: sprite.position.clone(),
      phase: Math.random() * Math.PI * 2,
      drift: 3 + Math.random() * 6,
      fall: 1.5 + Math.random() * 3,
      spin: 0.5 + Math.random(),
    });
  }
}

function findSceneCamera(from) {
  let node = from;
  while (node?.parent) node = node.parent;
  if (!node) return null;
  let camera = null;
  node.traverse((child) => {
    if (child.isPerspectiveCamera) camera = child;
  });
  return camera;
}

export function clearCaches() {
  modelCache.clear();
  textureCache.clear();
  imageCache.clear();
}

export function attachLifecycle(group, animation) {
  const _fwd = new THREE.Vector3();

  group.userData.update = (dt) => {
    animation.elapsed += dt;
    const time = animation.elapsed;

    const cam = findSceneCamera(group);
    if (cam && animation.skyShell) {
      animation.skyShell.position.copy(cam.position);
      // Keep panorama center (Fuji) locked ahead of the camera — true destination.
      if (animation.lockSkyYaw) {
        cam.getWorldDirection(_fwd);
        _fwd.y = 0;
        if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
        _fwd.normalize();
        animation.skyShell.rotation.y = Math.atan2(_fwd.x, _fwd.z) + Math.PI;
      }
    }
    if (cam && animation.ground) {
      animation.ground.position.x = cam.position.x;
      animation.ground.position.z = cam.position.z;
    }
    if (cam && animation.horizonFuji) {
      cam.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();
      const dist = animation.horizonDistance ?? 2400;
      const lift = animation.horizonLift ?? 520;
      animation.horizonFuji.position.set(
        cam.position.x + _fwd.x * dist,
        cam.position.y * 0.15 + lift,
        cam.position.z + _fwd.z * dist,
      );
      animation.horizonFuji.lookAt(cam.position.x, lift, cam.position.z);
    }

    for (const petal of animation.petals ?? []) {
      const drift = time * 0.4 + petal.phase;
      petal.object.position.set(
        petal.origin.x + Math.sin(drift) * petal.drift,
        petal.origin.y - ((time * petal.fall + petal.phase * 2) % 18),
        petal.origin.z + Math.cos(drift * 0.8) * petal.drift * 0.6,
      );
      if (petal.object.position.y < petal.origin.y - 16) {
        petal.object.position.y = petal.origin.y + 5;
      }
      petal.object.material.rotation = time * petal.spin;
    }

    for (const star of animation.stars ?? []) {
      const pulse = 0.7 + Math.sin(time * star.speed + star.phase) * 0.3;
      star.object.scale.setScalar(star.baseScale * pulse);
    }
  };

  group.userData.dispose = () => {
    group.userData.disposed = true;
    group.userData.update = null;
    clearCaches();
  };
}
