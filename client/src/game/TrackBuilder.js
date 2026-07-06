import * as THREE from 'three';

/**
 * Factory - turns a track definition (spline control points + checkpoints)
 * into renderable meshes: road ribbon, edge lines, barriers, start gantry
 * and checkpoint arches. Also exposes fast on-track / progress queries.
 */
export class TrackBuilder {
  constructor(trackDef) {
    this.def = trackDef;
    this.curve = new THREE.CatmullRomCurve3(
      trackDef.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true, 'catmullrom', 0.5
    );
    this.group = new THREE.Group();
    // Sampled centerline for nearest-point queries (on-track detection).
    this._samples = this.curve.getSpacedPoints(600);
    this._build();
  }

  _build() {
    const { def } = this;
    const segments = 420;
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
      frames.push({ p, normal });
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
    const road = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({ color: 0x2e2e34, roughness: 0.95 })
    );
    road.receiveShadow = true;
    this.group.add(road);

    // --- Edge lines ---------------------------------------------------------
    for (const side of [1, -1]) {
      const pts = frames.map(({ p, normal }) =>
        new THREE.Vector3(
          p.x + normal.x * (halfW - 0.35) * side, 0.03,
          p.z + normal.z * (halfW - 0.35) * side
        )
      );
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: side > 0 ? 0xffffff : 0xffcc00 })
      ));
    }

    // --- Barriers (instanced posts) ------------------------------------------
    const postGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xd23c3c, roughness: 0.7 });
    const postEvery = 6;
    const postCount = Math.floor(segments / postEvery) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    const m = new THREE.Matrix4();
    let idx = 0;
    for (let i = 0; i < segments; i += postEvery) {
      const { p, normal } = frames[i];
      for (const side of [1, -1]) {
        m.setPosition(
          p.x + normal.x * (halfW + 1.2) * side, 0.5,
          p.z + normal.z * (halfW + 1.2) * side
        );
        posts.setMatrixAt(idx++, m);
      }
    }
    posts.castShadow = true;
    this.group.add(posts);

    // --- Start/finish gantry --------------------------------------------------
    this._addGate(this.def.checkpoints[0], 0xff2244, true);
    for (let i = 1; i < this.def.checkpoints.length; i++) {
      this._addGate(this.def.checkpoints[i], 0x22ddff, false);
    }
  }

  _addGate(checkpoint, color, isStart) {
    const halfW = this.def.roadWidth / 2 + 1.2;
    const [px, , pz] = checkpoint.position;
    const [tx, tz] = checkpoint.tangent;
    const gate = new THREE.Group();
    gate.position.set(px, 0, pz);
    gate.rotation.y = Math.atan2(tx, tz);

    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.28, 6, 10);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.6 });
    for (const side of [1, -1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * halfW, 3, 0);
      pillar.castShadow = true;
      gate.add(pillar);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2 + 0.6, 0.7, 0.7),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: isStart ? 0.9 : 0.55,
      })
    );
    beam.position.y = 6;
    gate.add(beam);

    if (isStart) {
      // Checkered strip on the road.
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(this.def.roadWidth, 2.4),
        new THREE.MeshBasicMaterial({ map: makeCheckerTexture() })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = -Math.atan2(tx, tz);
      strip.position.set(px, 0.02, pz);
      this.group.add(strip);
    }

    this.group.add(gate);
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
