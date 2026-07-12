import * as THREE from 'three';

const SPARK_COUNT = 16;
const SPARK_GEO = new THREE.SphereGeometry(0.12, 6, 6);

/**
 * Short-lived spark burst at a collision point.
 */
export class CrashEffect {
  constructor(scene, x, z, intensity = 1) {
    this.scene = scene;
    this.alive = true;
    this.life = 0.45 + intensity * 0.2;

    this.group = new THREE.Group();
    this.group.position.set(x, 0.6, z);
    this.sparks = [];

    for (let i = 0; i < SPARK_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(SPARK_GEO, mat);
      const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (3 + Math.random() * 5) * intensity;
      this.sparks.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 4,
        vz: Math.sin(angle) * speed,
      });
      this.group.add(mesh);
    }

    scene.add(this.group);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dispose();
      return;
    }

    const fade = this.life / 0.65;
    for (const s of this.sparks) {
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = fade * 0.95;
      s.mesh.scale.setScalar(0.5 + fade * 0.8);
    }
  }

  dispose() {
    this.alive = false;
    for (const s of this.sparks) s.mesh.material.dispose();
    this.scene.remove(this.group);
  }
}
