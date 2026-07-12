import * as THREE from 'three';

const PARTICLE_COUNT = 40;

function tagBoostVfx(obj) {
  obj.userData.isBoostVfx = true;
  return obj;
}

/**
 * Rear boost exhaust — twin energy cones + streak particles behind the car.
 */
export class BoostVfx {
  constructor(car, accentColor = 0x00c2ff) {
    this.car = car;
    this.accent = new THREE.Color(accentColor);
    this.time = 0;
    this.intensity = 0;

    this.group = tagBoostVfx(new THREE.Group());
    this.group.position.set(0, 0.38, -1.9);
    car.add(this.group);

    const coneGeo = new THREE.ConeGeometry(0.24, 1.1, 10, 1, true);
    coneGeo.rotateX(-Math.PI / 2);
    this._coneGeo = coneGeo;

    this.flames = [];
    for (const x of [-0.38, 0.38]) {
      const glow = tagBoostVfx(new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: this.accent,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ));
      glow.position.set(x, 0, 0);
      glow.scale.set(1.35, 1.6, 1.35);

      const core = tagBoostVfx(new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ));
      core.position.set(x, 0, 0.12);
      core.scale.set(0.55, 0.9, 0.55);

      this.group.add(glow);
      this.group.add(core);
      this.flames.push({ glow, core });
    }

    const ring = tagBoostVfx(new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.62, 24),
      new THREE.MeshBasicMaterial({
        color: this.accent,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.02, 0.05);
    this.ring = ring;
    this.group.add(ring);

    const streakGeo = new THREE.PlaneGeometry(0.12, 0.75);
    this._streakGeo = streakGeo;
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const hue = i % 3 === 0 ? 0xffffff : this.accent;
      const mesh = tagBoostVfx(new THREE.Mesh(
        streakGeo,
        new THREE.MeshBasicMaterial({
          color: hue,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ));
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        life: 0,
        maxLife: 0.22 + Math.random() * 0.18,
        offset: new THREE.Vector3(),
        speed: 8 + Math.random() * 10,
      });
    }
  }

  update(dt, { active = false, boostRatio = 0, speedRatio = 0, throttle = 0 } = {}) {
    const wantsBoost = active && throttle > 0.05;
    const target = wantsBoost ? 0.55 + boostRatio * 0.45 + speedRatio * 0.25 : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 10);
    this.time += dt;

    if (this.intensity < 0.02) {
      this._hideAll();
      return;
    }

    const pulse = 0.82 + Math.sin(this.time * 28) * 0.18;
    const power = this.intensity * pulse;

    for (const { glow, core } of this.flames) {
      const flicker = 0.9 + Math.sin(this.time * 36 + glow.position.x * 8) * 0.1;
      glow.material.opacity = power * 0.55 * flicker;
      glow.scale.set(1.2 + power * 0.5, 1.4 + power * 0.9, 1.2 + power * 0.5);
      core.material.opacity = power * 0.85;
      core.scale.set(0.45 + power * 0.25, 0.75 + power * 0.55, 0.45 + power * 0.25);
    }

    this.ring.material.opacity = power * 0.42;
    this.ring.scale.setScalar(0.85 + power * 0.55 + Math.sin(this.time * 22) * 0.08);

    this._emitParticles(dt, power, speedRatio);
  }

  _emitParticles(dt, power, speedRatio) {
    let spawned = 0;
    const spawnBudget = Math.floor(4 + power * 10 + speedRatio * 6);

    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        const t = Math.max(0, p.life / p.maxLife);
        p.mesh.position.copy(p.offset);
        p.mesh.position.z += (1 - t) * p.speed * 0.08;
        p.mesh.material.opacity = t * power * 0.9;
        p.mesh.scale.set(0.35 + t * 0.8, 0.8 + t * 1.6, 1);
        if (p.life <= 0) p.mesh.visible = false;
        continue;
      }

      if (spawned >= spawnBudget) continue;
      spawned++;

      p.maxLife = 0.16 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.speed = 7 + Math.random() * 12 + speedRatio * 8;
      p.offset.set(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.18,
        Math.random() * 0.15,
      );
      p.mesh.position.copy(p.offset);
      p.mesh.rotation.set(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.25,
      );
      p.mesh.visible = true;
    }
  }

  _hideAll() {
    for (const { glow, core } of this.flames) {
      glow.material.opacity = 0;
      core.material.opacity = 0;
    }
    this.ring.material.opacity = 0;
    for (const p of this.particles) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }

  dispose() {
    this.car.remove(this.group);
    for (const { glow, core } of this.flames) {
      glow.material.dispose();
      core.material.dispose();
    }
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    for (const p of this.particles) p.mesh.material.dispose();
    this._coneGeo.dispose();
    this._streakGeo.dispose();
  }
}
