import * as THREE from 'three';
import { buildTrackAtmosphere } from './TrackAtmosphere.js';
import { performanceTier } from './PerformanceConfig.js';

/**
 * Factory - turns a track definition (spline control points + checkpoints)
 * into renderable meshes: road ribbon, edge lines, barriers, start gantry
 * and checkpoint arches. Also exposes fast on-track / progress queries.
 */
export class TrackBuilder {
  /**
   * @param {object} trackDef
   * @param {{ showGates?: boolean }} [options]
   */
  constructor(trackDef, options = {}) {
    this.def = trackDef;
    this.showGates = options.showGates !== false;
    this.curve = new THREE.CatmullRomCurve3(
      trackDef.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      trackDef.closed !== false, 'catmullrom', 0.5
    );
    this.group = new THREE.Group();
    // Sampled centerline for nearest-point queries (on-track detection).
    const sampleCount = Math.max(600, Math.min(2600, Math.round((trackDef.length || 1200) / 6)));
    this._samples = this.curve.getSpacedPoints(sampleCount);
    /** @type {Array<{x:number, z:number, r:number}>} */
    this.barriers = [];
    this._build();
  }

  _build() {
    const { def } = this;
    const segments = Math.max(420, Math.min(2200, Math.round((def.length || 1200) / 5)));
    const halfW = def.roadWidth / 2;

    // --- Road ribbon --------------------------------------------------------
    const positions = [];
    const uvs = [];
    const indices = [];
    const frames = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const normal = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      frames.push({ p, normal, tangent: tan.clone().normalize() });
      positions.push(
        p.x + normal.x * halfW, 0.01, p.z + normal.z * halfW,
        p.x - normal.x * halfW, 0.01, p.z - normal.z * halfW
      );
      uvs.push(0, t * 60, 1, t * 60);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();
    const isWet = def.atmosphere === 'rain-evening';
    const isCauseway = def.atmosphere === 'rann-heaven' || def.atmosphere === 'snow-heaven'
      || def.noBarriers;
    const isSnow = def.atmosphere === 'snow-heaven';
    const road = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({
        map: isSnow ? makeSnowyRoadTexture() : isCauseway ? makeDustyRoadTexture() : null,
        color: isWet ? 0x3a3e48 : isSnow ? 0xffffff : isCauseway ? 0xffffff : 0x5a5a64,
        roughness: isWet ? 0.35 : isSnow ? 0.92 : isCauseway ? 0.97 : 0.88,
        metalness: isWet ? 0.12 : isSnow ? 0.02 : 0,
      })
    );
    road.receiveShadow = true;
    this.group.add(road);

    if (isCauseway) this._addCausewayShoulders(frames, halfW, isSnow);
    if (isSnow) this._addRoadSnowDrops(frames, halfW);

    this._addRoadStripes(frames, halfW, def.laneCount || 1);

    if (!isCauseway) {
      this._addBarrierPosts(frames, halfW, segments, def);
    }

    const startColor = isSnow ? 0xb8d4ff : isCauseway ? 0xf0f4ff : 0xff2244;
    if (this.showGates) {
      this._addGate(this.def.checkpoints[0], startColor, true);
      for (let i = 1; i < this.def.checkpoints.length; i++) {
        this._addGate(this.def.checkpoints[i], 0x22ddff, false);
      }
    }

    this.group.add(buildTrackAtmosphere(this.curve, def));
  }

  _addBarrierPosts(frames, halfW, segments, def) {
    const postGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xff5555, roughness: 0.65 });
    const postEvery = def.length > 9000 ? 2 : def.length > 3000 ? 4 : 6;
    const postCount = Math.floor(segments / postEvery) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < segments; i += postEvery) {
      const { p, normal } = frames[i];
      for (const side of [1, -1]) {
        const bx = p.x + normal.x * (halfW + 1.2) * side;
        const bz = p.z + normal.z * (halfW + 1.2) * side;
        this.barriers.push({ x: bx, z: bz, r: 0.35 });
        m.setPosition(bx, 0.5, bz);
        posts.setMatrixAt(idx++, m);
      }
    }
    posts.castShadow = true;
    this.group.add(posts);
  }

  _addCausewayShoulders(frames, halfW, isSnow = false) {
    const bermMat = new THREE.MeshStandardMaterial({
      map: isSnow ? makeSnowShoulderTexture() : makeGravelShoulderTexture(),
      roughness: 1,
    });
    const positions = [];
    const uvs = [];
    const indices = [];
    const shoulderWidth = 2.6;
    // Roughly square texture tiles ~4m long.
    const vScale = (this.def.length || 10000) / 4;

    for (const side of [1, -1]) {
      const base = positions.length / 3;
      frames.forEach(({ p, normal }, i) => {
        for (const offset of [halfW, halfW + shoulderWidth]) {
          positions.push(
            p.x + normal.x * offset * side,
            0.004,
            p.z + normal.z * offset * side,
          );
        }
        const v = (i / frames.length) * vScale;
        uvs.push(0, v, 1, v);
      });

      for (let i = 0; i < frames.length - 1; i++) {
        const a = base + i * 2;
        // Mirror the winding per side so both faces point up.
        if (side > 0) {
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        } else {
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const shoulders = new THREE.Mesh(geometry, bermMat);
    shoulders.receiveShadow = true;
    shoulders.name = 'continuous-causeway-shoulders';
    this.group.add(shoulders);
  }

  /** Soft snow drifts and drop patches sitting on the asphalt. */
  _addRoadSnowDrops(frames, halfW) {
    const patchCount = {
      low: Math.min(220, Math.round(frames.length * 0.08)),
      medium: Math.min(420, Math.round(frames.length * 0.14)),
      high: Math.min(700, Math.round(frames.length * 0.22)),
    }[performanceTier];

    const geo = new THREE.CircleGeometry(1, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, patchCount);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const color = new THREE.Color();

    for (let i = 0; i < patchCount; i++) {
      const frame = frames[Math.floor(Math.random() * frames.length)];
      const { p, normal, tangent } = frame;
      // Mostly along the road edges — keep the center mostly clear asphalt.
      const edgeBias = Math.sign(Math.random() - 0.5) * (0.55 + Math.random() ** 0.7 * 0.45);
      const lateral = edgeBias * (halfW - 0.35);
      pos.set(
        p.x + normal.x * lateral + (Math.random() - 0.5) * 0.5,
        0.022,
        p.z + normal.z * lateral + (Math.random() - 0.5) * 0.5,
      );
      euler.set(-Math.PI / 2, 0, -Math.atan2(tangent.x, tangent.z) + (Math.random() - 0.5) * 0.8);
      quat.setFromEuler(euler);
      const s = 0.12 + Math.random() * 0.45;
      scale.set(s * (0.7 + Math.random() * 0.7), s * (0.5 + Math.random() * 0.7), 1);
      m.compose(pos, quat, scale);
      mesh.setMatrixAt(i, m);
      const brightness = 0.9 + Math.random() * 0.1;
      color.setRGB(brightness, brightness, Math.min(1, brightness + 0.02));
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'road-snow-drops';
    this.group.add(mesh);
  }

  _addGate(checkpoint, color, isStart) {
    const halfW = this.def.roadWidth / 2 + 1.2;
    const isCausewayStart = isStart && (
      this.def.id === 'road-to-heaven' || this.def.id === 'road-to-heaven-snow'
    );
    const gateLabel = this.def.id === 'road-to-heaven-snow'
      ? 'FROZEN HEAVEN'
      : 'ROAD TO HEAVEN';
    const [px, , pz] = checkpoint.position;
    const [tx, tz] = checkpoint.tangent;
    const rotY = Math.atan2(tx, tz);
    const gate = new THREE.Group();
    gate.position.set(px, 0, pz);
    gate.rotation.y = rotY;

    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.28, 6, 10);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x6a6a78, roughness: 0.55 });
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    for (const side of [1, -1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * halfW, 3, 0);
      pillar.castShadow = true;
      gate.add(pillar);
      const lx = side * halfW;
      this.barriers.push({
        x: px + lx * cos,
        z: pz - lx * sin,
        r: 0.45,
      });
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2 + 0.6, 0.7, 0.7),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: isStart ? 0.9 : 0.55,
      })
    );
    beam.position.y = 6;
    gate.add(beam);

    if (isCausewayStart) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(halfW * 1.75, 0.62),
        new THREE.MeshBasicMaterial({
          map: makeGateTexture(gateLabel),
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 6, -0.36);
      gate.add(sign);
    }

    if (isStart) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(this.def.roadWidth, isCausewayStart ? 0.45 : 2.4),
        new THREE.MeshBasicMaterial({
          map: isCausewayStart ? null : makeCheckerTexture(),
          color: isCausewayStart ? 0xe3ded1 : 0xffffff,
          transparent: isCausewayStart,
          opacity: isCausewayStart ? 0.78 : 1,
        }),
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.02, 0);
      gate.add(strip);
    }

    this.group.add(gate);
  }

  /** Dashed lane stripes + solid edge markings along the road surface. */
  _addRoadStripes(frames, halfW, laneCount) {
    const laneWidth = this.def.roadWidth / laneCount;
    const isCauseway = this.def.atmosphere === 'rann-heaven'
      || this.def.atmosphere === 'snow-heaven'
      || this.def.noBarriers;
    const stripeColor = isCauseway ? 0xe0ddd3 : 0xf4f4f4;
    const stripeOpacity = isCauseway ? 0.72 : 1;
    const dashMat = new THREE.MeshBasicMaterial({
      color: stripeColor,
      transparent: isCauseway,
      opacity: stripeOpacity,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const edgeWhiteMat = new THREE.MeshBasicMaterial({
      color: stripeColor,
      transparent: isCauseway,
      opacity: stripeOpacity,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const edgeYellowMat = new THREE.MeshBasicMaterial({
      color: isCauseway ? stripeColor : 0xffcc00,
      transparent: isCauseway,
      opacity: stripeOpacity,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const dashGeo = new THREE.PlaneGeometry(0.2, 3.2);
    const edgeGeo = new THREE.PlaneGeometry(0.28, 2.4);

    const laneOffsets = laneCount > 1
      ? Array.from({ length: laneCount - 1 }, (_, i) => -halfW + laneWidth * (i + 1))
      : [0];

    const dashStep = this.def.length > 6000 ? 5 : 4;
    const dashLen = 3;
    let dashCount = 0;
    for (let i = 0; i < frames.length; i += dashStep) {
      dashCount += Math.min(dashLen, frames.length - i) * laneOffsets.length;
    }

    const edgeStep = 2;
    const edgeCount = Math.ceil(frames.length / edgeStep);

    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, Math.max(1, dashCount));
    const edgeWhite = new THREE.InstancedMesh(edgeGeo, edgeWhiteMat, Math.max(1, edgeCount));
    const edgeYellow = new THREE.InstancedMesh(edgeGeo, edgeYellowMat, Math.max(1, edgeCount));
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const basisX = new THREE.Vector3();
    const basisY = new THREE.Vector3();
    const basisZ = new THREE.Vector3(0, 1, 0);
    const stripeHalfW = 0.14;
    const edgeInset = halfW - stripeHalfW - 0.12;

    const placeStripe = (p, normal, tangent, lateral, y) => {
      pos.set(p.x + normal.x * lateral, y, p.z + normal.z * lateral);
      basisX.set(normal.x, 0, normal.z);
      basisY.set(-tangent.x, 0, -tangent.z);
      m.makeBasis(basisX, basisY, basisZ);
      m.setPosition(pos.x, pos.y, pos.z);
    };

    let dashIdx = 0;
    for (const lateral of laneOffsets) {
      for (let i = 0; i < frames.length; i += dashStep) {
        for (let d = 0; d < dashLen; d++) {
          const idx = i + d;
          if (idx >= frames.length) break;
          const { p, normal, tangent } = frames[idx];
          placeStripe(p, normal, tangent, lateral, 0.028);
          dashes.setMatrixAt(dashIdx++, m);
        }
      }
    }
    dashes.count = dashIdx;

    let whiteIdx = 0;
    let yellowIdx = 0;
    for (let i = 0; i < frames.length; i += edgeStep) {
      const { p, normal, tangent } = frames[i];
      placeStripe(p, normal, tangent, edgeInset, 0.03);
      edgeWhite.setMatrixAt(whiteIdx++, m);
      placeStripe(p, normal, tangent, -edgeInset, 0.03);
      edgeYellow.setMatrixAt(yellowIdx++, m);
    }
    edgeWhite.count = whiteIdx;
    edgeYellow.count = yellowIdx;
    edgeWhite.instanceMatrix.needsUpdate = true;
    edgeYellow.instanceMatrix.needsUpdate = true;
    dashes.instanceMatrix.needsUpdate = true;

    const stripeGroup = new THREE.Group();
    stripeGroup.name = 'road-stripes';
    stripeGroup.add(dashes);
    stripeGroup.add(edgeWhite);
    stripeGroup.add(edgeYellow);
    this.group.add(stripeGroup);
  }

  /** Distance from the track centerline (nearest of 600 samples). */
  distanceFromCenter(x, z) {
    let best = Infinity;
    for (const s of this._samples) {
      const dx = s.x - x;
      const dz = s.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  isOnTrack(x, z) {
    return this.distanceFromCenter(x, z) <= this.def.roadWidth / 2 + 0.8;
  }

  /** Advance animated scenery attached to this track. */
  update(dt) {
    this.group.traverse((object) => object.userData.update?.(dt));
  }

  /** Stop pending/active scenery work before the track is removed. */
  dispose() {
    this.group.traverse((object) => object.userData.dispose?.());
  }

  /** Nearest barrier pole within car radius, or null. */
  checkBarrierHit(x, z, carRadius = 1.05) {
    for (const b of this.barriers) {
      const dx = x - b.x;
      const dz = z - b.z;
      const hitDist = carRadius + b.r;
      if (dx * dx + dz * dz < hitDist * hitDist) {
        return b;
      }
    }
    return null;
  }
}

function makeGateTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#8b5b2c');
  gradient.addColorStop(0.5, '#d39a4a');
  gradient.addColorStop(1, '#8b5b2c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255, 238, 199, 0.72)';
  ctx.lineWidth = 8;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = '#fff3da';
  ctx.font = '700 62px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let gravelShoulderTexture;
let snowShoulderTexture;

/** Gravel shoulder: worn dark dirt near the asphalt fading into golden grit. */
function makeGravelShoulderTexture() {
  if (gravelShoulderTexture) return gravelShoulderTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const across = ctx.createLinearGradient(0, 0, size, 0);
  across.addColorStop(0, '#6e6354');
  across.addColorStop(0.25, '#8f7c5e');
  across.addColorStop(0.6, '#b3925d');
  across.addColorStop(1, '#c09a5f');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * size;
    const dark = Math.random() > 0.5;
    const nearRoad = 1 - x / size;
    ctx.fillStyle = dark
      ? `rgba(74, 64, 50, ${0.08 + Math.random() * 0.2 + nearRoad * 0.1})`
      : `rgba(226, 196, 138, ${0.08 + Math.random() * 0.22})`;
    const radius = 0.5 + Math.random() * 2.2;
    ctx.fillRect(x, Math.random() * size, radius, radius);
  }

  // Cracked, crumbling asphalt bleed along the inner edge.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(66, 62, 56, ${0.2 + Math.random() * 0.3})`;
    const w = 4 + Math.random() * 18;
    const h = 5 + Math.random() * 16;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size * 0.2, Math.random() * size, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  gravelShoulderTexture = new THREE.CanvasTexture(canvas);
  gravelShoulderTexture.wrapS = THREE.ClampToEdgeWrapping;
  gravelShoulderTexture.wrapT = THREE.RepeatWrapping;
  gravelShoulderTexture.colorSpace = THREE.SRGBColorSpace;
  return gravelShoulderTexture;
}

function makeSnowShoulderTexture() {
  if (snowShoulderTexture) return snowShoulderTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const across = ctx.createLinearGradient(0, 0, size, 0);
  across.addColorStop(0, '#9aa8b8');
  across.addColorStop(0.3, '#d0dce8');
  across.addColorStop(0.7, '#eef4fa');
  across.addColorStop(1, '#ffffff');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.4
      ? `rgba(255, 255, 255, ${0.15 + Math.random() * 0.35})`
      : `rgba(150, 170, 190, ${0.08 + Math.random() * 0.15})`;
    const radius = 0.4 + Math.random() * 2;
    ctx.fillRect(x, Math.random() * size, radius, radius);
  }

  snowShoulderTexture = new THREE.CanvasTexture(canvas);
  snowShoulderTexture.wrapS = THREE.ClampToEdgeWrapping;
  snowShoulderTexture.wrapT = THREE.RepeatWrapping;
  snowShoulderTexture.colorSpace = THREE.SRGBColorSpace;
  return snowShoulderTexture;
}

function makeSnowyRoadTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Cold asphalt base — mostly visible.
  ctx.fillStyle = '#525860';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2200; i++) {
    const tone = 62 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${tone}, ${tone + 2}, ${tone + 6}, ${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 0.5 + Math.random() * 2, 0.5 + Math.random() * 2);
  }

  // Light frost dusting — sparse.
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rx = 6 + Math.random() * 22;
    const ry = 3 + Math.random() * 10;
    ctx.fillStyle = `rgba(245, 250, 255, ${0.04 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sparse snow drops, mostly near the road edges.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const edge = Math.min(x, size - x) / (size * 0.5);
    const edgeBoost = 1 - edge;
    if (Math.random() > 0.2 + edgeBoost * 0.55) continue;
    const r = 0.5 + Math.random() * 2.2 + edgeBoost * 1.2;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + Math.random() * 0.35 + edgeBoost * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.45 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft tire clearings down the lanes.
  for (const laneX of [size * 0.28, size * 0.72]) {
    ctx.strokeStyle = 'rgba(70, 78, 88, 0.22)';
    ctx.lineWidth = 12 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(laneX + (Math.random() - 0.5) * 8, 0);
    for (let y = 0; y <= size; y += 24) {
      ctx.lineTo(laneX + Math.sin(y * 0.04) * 5 + (Math.random() - 0.5) * 3, y);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeDustyRoadTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#575550';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i++) {
    const tone = 68 + Math.floor(Math.random() * 48);
    const alpha = 0.05 + Math.random() * 0.12;
    ctx.fillStyle = `rgba(${tone}, ${tone - 2}, ${tone - 7}, ${alpha})`;
    const radius = 0.5 + Math.random() * 2.2;
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius);
  }

  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = `rgba(42, 39, 34, ${0.05 + Math.random() * 0.09})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (Math.random() - 0.5) * 80,
      y + 30 + Math.random() * 90,
      x + (Math.random() - 0.5) * 100,
      y + 100 + Math.random() * 150,
      x + (Math.random() - 0.5) * 120,
      y + 180 + Math.random() * 220,
    );
    ctx.stroke();
  }

  const edgeDust = ctx.createLinearGradient(0, 0, size, 0);
  edgeDust.addColorStop(0, 'rgba(196, 164, 110, 0.3)');
  edgeDust.addColorStop(0.12, 'rgba(150, 128, 96, 0.07)');
  edgeDust.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  edgeDust.addColorStop(0.88, 'rgba(150, 128, 96, 0.07)');
  edgeDust.addColorStop(1, 'rgba(196, 164, 110, 0.3)');
  ctx.fillStyle = edgeDust;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeCheckerTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#eee';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}
