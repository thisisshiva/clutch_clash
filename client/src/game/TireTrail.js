import * as THREE from 'three';

const MAX_POINTS = 72;
const WHEEL_HALF = 0.92;
const SAMPLE_SPACING = 0.7;
const TRAIL_WIDTH = 0.14;
const MIN_SPEED = 5;
const FADE_TIME = 4.2;

const trailMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uColor: { value: new THREE.Color(0xb8c4d0) },
  },
  vertexShader: /* glsl */ `
    attribute float aAlpha;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      if (vAlpha < 0.004) discard;
      gl_FragColor = vec4(uColor, vAlpha);
    }
  `,
});

function createRibbon() {
  const positions = new Float32Array(MAX_POINTS * 2 * 3);
  const alphas = new Float32Array(MAX_POINTS * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));

  const indices = new Uint16Array((MAX_POINTS - 1) * 6);
  let ii = 0;
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2;
    indices[ii++] = a;
    indices[ii++] = a + 1;
    indices[ii++] = a + 2;
    indices[ii++] = a + 1;
    indices[ii++] = a + 3;
    indices[ii++] = a + 2;
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setDrawRange(0, 0);

  const mesh = new THREE.Mesh(geo, trailMaterial.clone());
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'tire-trail';
  return { mesh, positions, alphas, points: [] };
}

/**
 * Soft tire lines left behind a moving car (theater mode).
 */
export class TireTrail {
  constructor(scene) {
    this.scene = scene;
    this._accum = 0;
    this._lastX = null;
    this._lastZ = null;
    this.left = createRibbon();
    this.right = createRibbon();
    scene.add(this.left.mesh);
    scene.add(this.right.mesh);
  }

  /**
   * @param {number} dt
   * @param {{ x:number, y?:number, z:number }} position
   * @param {number} heading
   * @param {number} speed
   */
  update(dt, position, heading, speed) {
    const spd = Math.abs(speed);
    if (spd < MIN_SPEED) {
      this._ageAndRebuild(dt);
      return;
    }

    if (this._lastX == null) {
      this._lastX = position.x;
      this._lastZ = position.z;
      this._pushSample(position, heading);
      return;
    }

    const dx = position.x - this._lastX;
    const dz = position.z - this._lastZ;
    this._accum += Math.hypot(dx, dz);
    this._lastX = position.x;
    this._lastZ = position.z;

    while (this._accum >= SAMPLE_SPACING) {
      this._accum -= SAMPLE_SPACING;
      this._pushSample(position, heading);
    }

    this._ageAndRebuild(dt);
  }

  _ageAndRebuild(dt) {
    for (const track of [this.left, this.right]) {
      for (const p of track.points) p.age += dt;
      while (track.points.length && track.points[0].age > FADE_TIME) track.points.shift();
      this._rebuild(track);
    }
  }

  _pushSample(position, heading) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const rightX = cos;
    const rightZ = -sin;

    this._addPoint(this.left, {
      x: position.x - rightX * WHEEL_HALF,
      z: position.z - rightZ * WHEEL_HALF,
      hx: rightX,
      hz: rightZ,
    });
    this._addPoint(this.right, {
      x: position.x + rightX * WHEEL_HALF,
      z: position.z + rightZ * WHEEL_HALF,
      hx: rightX,
      hz: rightZ,
    });
  }

  _addPoint(track, point) {
    track.points.push({ ...point, age: 0 });
    if (track.points.length > MAX_POINTS) track.points.shift();
  }

  _rebuild(track) {
    const pts = track.points;
    const n = pts.length;
    if (n < 2) {
      track.mesh.geometry.setDrawRange(0, 0);
      return;
    }

    const { positions, alphas } = track;
    const halfW = TRAIL_WIDTH * 0.5;
    let vi = 0;
    let ai = 0;

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const fade = Math.max(0, 1 - p.age / FADE_TIME);
      const tipFade = Math.min(1, (i / (n - 1)) * 2.5);
      // Soft pale line — low peak alpha so it never reads as a heavy skid.
      const a = fade * fade * tipFade * 0.2;

      positions[vi++] = p.x - p.hx * halfW;
      positions[vi++] = 0.028;
      positions[vi++] = p.z - p.hz * halfW;
      alphas[ai++] = a;

      positions[vi++] = p.x + p.hx * halfW;
      positions[vi++] = 0.028;
      positions[vi++] = p.z + p.hz * halfW;
      alphas[ai++] = a;
    }

    track.mesh.geometry.attributes.position.needsUpdate = true;
    track.mesh.geometry.attributes.aAlpha.needsUpdate = true;
    track.mesh.geometry.setDrawRange(0, (n - 1) * 6);
  }

  dispose() {
    for (const track of [this.left, this.right]) {
      this.scene.remove(track.mesh);
      track.mesh.geometry.dispose();
      track.mesh.material.dispose();
    }
  }
}
