import * as THREE from 'three';

const LEAF_URL = '/img/maple-leaf.webp';
let leafImagePromise;

function loadLeafImage() {
  if (!leafImagePromise) {
    leafImagePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        const fallback = new Image();
        fallback.onload = () => resolve(fallback);
        fallback.onerror = () => resolve(null);
        fallback.src = '/img/maple-leaf.jpg';
      };
      img.src = LEAF_URL;
    });
  }
  return leafImagePromise;
}

/**
 * GetNorthPath wordmark: maple leaf + Fraunces/Georgia serif label.
 * @param {'gate'|'sign'|'monument'|'intro'} variant
 */
export async function makeNorthPathWordmarkTexture(variant = 'sign') {
  const leaf = await loadLeafImage();
  try {
    if (document.fonts?.load) {
      await document.fonts.load('600 48px Fraunces');
    }
  } catch {
    // Fall back to Georgia if Fraunces is unavailable.
  }

  const sizes = {
    gate: { w: 1280, h: 160, leaf: 88, font: 58, layout: 'row' },
    sign: { w: 768, h: 192, leaf: 72, font: 48, layout: 'row' },
    monument: { w: 2048, h: 560, leaf: 240, font: 168, layout: 'row' },
    intro: { w: 1400, h: 360, leaf: 160, font: 110, layout: 'row' },
  };
  const cfg = sizes[variant] || sizes.sign;
  const stacked = cfg.layout === 'stack';
  const darkPanel = stacked || variant === 'gate' || variant === 'monument' || variant === 'intro';
  const canvas = document.createElement('canvas');
  canvas.width = cfg.w;
  canvas.height = cfg.h;
  const ctx = canvas.getContext('2d');

  if (darkPanel) {
    const gradient = stacked
      ? ctx.createLinearGradient(0, 0, 0, canvas.height)
      : ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#122038');
    gradient.addColorStop(0.5, '#1c3358');
    gradient.addColorStop(1, '#122038');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(220, 80, 70, 0.75)';
    ctx.lineWidth = variant === 'monument' ? 16 : 6;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  } else {
    ctx.fillStyle = '#f7f4ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a2a44';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.strokeStyle = 'rgba(200, 60, 55, 0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  }

  const leafSize = cfg.leaf;
  if (stacked) {
    const leafX = canvas.width * 0.5;
    const leafY = canvas.height * 0.28;
    if (leaf) {
      ctx.drawImage(leaf, leafX - leafSize / 2, leafY - leafSize / 2, leafSize, leafSize);
    } else {
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.moveTo(leafX, leafY - leafSize * 0.4);
      ctx.quadraticCurveTo(leafX + leafSize * 0.45, leafY, leafX, leafY + leafSize * 0.4);
      ctx.quadraticCurveTo(leafX - leafSize * 0.45, leafY, leafX, leafY - leafSize * 0.4);
      ctx.fill();
    }
    ctx.fillStyle = '#f7f4ee';
    ctx.font = `600 ${cfg.font}px Fraunces, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GetNorth', canvas.width * 0.5, canvas.height * 0.58);
    ctx.fillText('Path', canvas.width * 0.5, canvas.height * 0.58 + cfg.font * 1.15);
  } else {
    const midY = canvas.height / 2;
    const leafX = canvas.width * 0.18;
    const textX = canvas.width * 0.30;
    if (leaf) {
      ctx.drawImage(leaf, leafX - leafSize / 2, midY - leafSize / 2, leafSize, leafSize);
    } else {
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.moveTo(leafX, midY - leafSize * 0.4);
      ctx.quadraticCurveTo(leafX + leafSize * 0.45, midY, leafX, midY + leafSize * 0.4);
      ctx.quadraticCurveTo(leafX - leafSize * 0.45, midY, leafX, midY - leafSize * 0.4);
      ctx.fill();
    }
    ctx.fillStyle = darkPanel ? '#f7f4ee' : '#1a2a44';
    ctx.font = `600 ${cfg.font}px Fraunces, Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('GetNorthPath', textX, midY + 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** HTML canvas for the theater intro (same brand mark, no Three.js). */
export async function makeNorthPathIntroLogoCanvas() {
  const leaf = await loadLeafImage();
  try {
    if (document.fonts?.load) await document.fonts.load('600 110px Fraunces');
  } catch { /* Georgia fallback */ }

  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const midY = canvas.height / 2;
  const leafSize = 150;
  const leafX = 280;
  if (leaf) {
    ctx.drawImage(leaf, leafX - leafSize / 2, midY - leafSize / 2, leafSize, leafSize);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 110px Fraunces, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(200, 60, 55, 0.45)';
  ctx.shadowBlur = 28;
  ctx.fillText('GetNorthPath', 400, midY + 4);
  return canvas;
}

/**
 * Four huge horizon brand marks (ahead / behind / left / right).
 * Elevated in the sky band, far past the driveable route, horizontal text
 * facing the track so the chase camera can read them.
 * @param {THREE.Group} group
 * @param {THREE.Curve} curve
 * @param {number} halfW
 */
export async function addNorthPathBrandMonument(group, curve, halfW) {
  const texture = await makeNorthPathWordmarkTexture('monument');
  if (group.userData.disposed) {
    texture.dispose();
    return;
  }

  const start = curve.getPointAt(0.02);
  const end = curve.getPointAt(0.98);
  const mid = curve.getPointAt(0.5);
  const tangent = end.clone().sub(start).setY(0).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();

  // Past open ends / far off sides — car never reaches; still inside camera far.
  const beyond = 2400;
  const lateral = Math.max(2800, halfW + 2700);
  const skyY = 220;

  /** @type {{ pos: THREE.Vector3, faceDir: THREE.Vector3 }[]} */
  const placements = [
    {
      pos: end.clone().addScaledVector(tangent, beyond).setY(skyY),
      faceDir: tangent.clone().negate(),
    },
    {
      pos: start.clone().addScaledVector(tangent, -beyond).setY(skyY),
      faceDir: tangent.clone(),
    },
    // Same facing as the ahead mark so chase-cam text stays upright (not sideways).
    {
      pos: mid.clone().addScaledVector(normal, lateral).setY(skyY),
      faceDir: tangent.clone().negate(),
    },
    {
      pos: mid.clone().addScaledVector(normal, -lateral).setY(skyY),
      faceDir: tangent.clone().negate(),
    },
  ];

  const signW = 2800;
  const signH = 760;
  const poleH = skyY + signH * 0.15;
  const poleR = 22;

  for (const { pos, faceDir } of placements) {
    const tower = new THREE.Group();

    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(poleR * 0.45, poleR * 0.7, poleH, 10),
      new THREE.MeshBasicMaterial({ color: 0x10141c, fog: false }),
    );
    stick.position.y = poleH * 0.5 - skyY;
    tower.add(stick);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signH),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    board.position.y = 0;
    tower.add(board);

    tower.position.copy(pos);

    const dir = faceDir.clone().setY(0).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    tower.rotation.set(0, yaw, 0);

    group.add(tower);
  }
}
