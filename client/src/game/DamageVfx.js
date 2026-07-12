import * as THREE from 'three';

const SMOKE_EMITTERS = [
  [-0.8, 0.5, 0.8], [0.8, 0.5, 0.8],
  [0, 0.75, 0], [-0.7, 0.4, -0.6], [0.7, 0.4, -0.6],
];

const SMOKE_THRESHOLD = 0.5;
const WRECK_DURATION = 1.15;

function tagVfx(obj) {
  obj.userData.isDamageVfx = true;
  return obj;
}

/**
 * Damage visuals: smoke below 50% HP, engine glow when critical, wreck blast.
 */
export class DamageVfx {
  constructor(car) {
    this.car = car;
    this.particles = [];
    const geo = new THREE.SphereGeometry(0.14, 5, 5);

    for (let i = 0; i < 48; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0,
      });
      const mesh = tagVfx(new THREE.Mesh(geo, mat));
      mesh.visible = false;
      car.add(mesh);
      this.particles.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    this.glow = tagVfx(new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x553322, transparent: true, opacity: 0 }),
    ));
    this.glow.position.set(0, 0.5, -0.7);
    this.glow.visible = false;
    car.add(this.glow);

    this.shockwave = tagVfx(new THREE.Mesh(
      new THREE.RingGeometry(0.4, 1.1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xfff0cc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ));
    this.shockwave.rotation.x = -Math.PI / 2;
    this.shockwave.position.y = 0.35;
    this.shockwave.visible = false;
    car.add(this.shockwave);

    this.fireCore = tagVfx(new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ));
    this.fireCore.position.y = 0.85;
    this.fireCore.visible = false;
    car.add(this.fireCore);

    this.flashShell = tagVfx(new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 2.0, 2.4),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ));
    this.flashShell.position.y = 0.9;
    this.flashShell.visible = false;
    car.add(this.flashShell);

    this.blastSparks = [];
    const sparkGeo = new THREE.SphereGeometry(0.09, 4, 4);
    for (let i = 0; i < 36; i++) {
      const colors = [0xffee44, 0xff8800, 0xff3300, 0xffffff];
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0,
      });
      const mesh = tagVfx(new THREE.Mesh(sparkGeo, mat));
      mesh.visible = false;
      car.add(mesh);
      this.blastSparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
    }

    this.debris = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x333338 : 0x555560,
        roughness: 0.9,
        metalness: 0.2,
        transparent: true,
        opacity: 1,
      });
      const mesh = tagVfx(new THREE.Mesh(
        new THREE.BoxGeometry(0.22 + Math.random() * 0.2, 0.1, 0.14),
        mat,
      ));
      mesh.visible = false;
      car.add(mesh);
      this.debris.push({ mesh, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }

    this._wreckTimer = 0;
    this._wreckElapsed = 0;
    this._carDim = 1;
  }

  triggerWreckFlash(duration = WRECK_DURATION) {
    this._wreckTimer = duration;
    this._wreckElapsed = 0;
    this.shockwave.visible = true;
    this.shockwave.scale.setScalar(0.6);
    this.shockwave.material.opacity = 1;
    this.fireCore.visible = true;
    this.fireCore.scale.setScalar(0.4);
    this.fireCore.material.opacity = 1;
    this.flashShell.visible = true;
    this.flashShell.material.color.setHex(0xffffff);
    this.flashShell.material.opacity = 1;

    for (const s of this.blastSparks) {
      s.life = 0.45 + Math.random() * 0.45;
      s.mesh.visible = true;
      s.mesh.position.set(
        (Math.random() - 0.5) * 1.2,
        0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.2,
      );
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.8);
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      s.vel.set(Math.cos(angle) * speed, 3 + Math.random() * 5, Math.sin(angle) * speed);
    }

    for (const d of this.debris) {
      d.life = 0.7 + Math.random() * 0.5;
      d.mesh.visible = true;
      d.mesh.position.set(
        (Math.random() - 0.5) * 1.6,
        0.4 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.6,
      );
      d.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      d.vel.set(Math.cos(angle) * speed, 2 + Math.random() * 4, Math.sin(angle) * speed);
      d.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    }

    for (let i = 0; i < 16; i++) {
      const e = SMOKE_EMITTERS[i % SMOKE_EMITTERS.length];
      this._spawnSmoke(e[0], e[1], e[2], 1);
    }
  }

  clearWreckFlash() {
    this._wreckTimer = 0;
    this._wreckElapsed = 0;
    this._carDim = 1;
    this.shockwave.visible = false;
    this.fireCore.visible = false;
    this.flashShell.visible = false;
    this.shockwave.material.opacity = 0;
    this.fireCore.material.opacity = 0;
    this.flashShell.material.opacity = 0;
    for (const s of this.blastSparks) {
      s.life = 0;
      s.mesh.visible = false;
    }
    for (const d of this.debris) {
      d.life = 0;
      d.mesh.visible = false;
    }
    this.car.rotation.x = 0;
    this.car.rotation.z = 0;
    this.car.position.y = 0;
    this._setCarDim(1);
  }

  update(dt, healthRatio, speed) {
    const hp = Math.max(0, Math.min(1, healthRatio));
    const dmg = 1 - hp;

    if (this._wreckTimer <= 0) {
      this._updateSmoke(dt, hp);
      this._updateGlow(hp);
      this._updateShake(dmg, speed);
    }
    this._updateWreckBlast(dt);
    this._updateParticles(dt);
    this._updateBlastSparks(dt);
    this._updateDebris(dt);
  }

  _updateSmoke(dt, healthRatio) {
    if (healthRatio >= SMOKE_THRESHOLD) return;

    const severity = 1 - healthRatio / SMOKE_THRESHOLD;
    const rate = 3 + severity * 14;
    const count = severity > 0.6 ? 2 : 1;

    for (let n = 0; n < count; n++) {
      if (Math.random() < rate * dt) {
        const e = SMOKE_EMITTERS[Math.floor(Math.random() * SMOKE_EMITTERS.length)];
        this._spawnSmoke(e[0], e[1], e[2], severity);
      }
    }
  }

  _updateGlow(hp) {
    if (hp > 0.3 && hp < SMOKE_THRESHOLD) {
      this.glow.visible = true;
      const t = 1 - hp / SMOKE_THRESHOLD;
      const flicker = 0.55 + 0.45 * Math.sin(performance.now() * 0.018);
      this.glow.material.opacity = t * 0.28 * flicker;
      this.glow.scale.setScalar(0.7 + t * 0.9);
    } else {
      this.glow.visible = false;
    }
  }

  _updateShake(dmg, speed) {
    if (dmg > 0.25 && Math.abs(speed) > 5) {
      const shake = dmg * 0.018 * Math.sin(performance.now() * 0.04);
      this.car.rotation.z = shake;
      this.car.position.y = shake * 0.5;
    } else if (this._wreckTimer <= 0) {
      this.car.rotation.z *= 0.85;
      if (Math.abs(this.car.position.y) < 0.01) this.car.position.y = 0;
    }
  }

  _updateWreckBlast(dt) {
    if (this._wreckTimer <= 0) return;

    this._wreckTimer -= dt;
    this._wreckElapsed += dt;
    const e = this._wreckElapsed;
    const fade = Math.max(0, 1 - e / WRECK_DURATION);

    const waveScale = 0.6 + e * 16;
    this.shockwave.scale.setScalar(waveScale);
    this.shockwave.material.opacity = fade * 0.9;

    if (e < 0.55) {
      const fireT = e / 0.55;
      const scale = 0.4 + fireT * 5.5;
      this.fireCore.scale.setScalar(scale);
      this.fireCore.material.opacity = (1 - fireT) * 0.95;
      this.fireCore.material.color.setHex(fireT < 0.35 ? 0xffffff : fireT < 0.65 ? 0xffaa00 : 0xff3300);
    } else {
      this.fireCore.material.opacity = 0;
    }

    if (e < 0.1) {
      this.flashShell.material.color.setHex(0xffffff);
      this.flashShell.material.opacity = 1 - e / 0.1;
    } else if (e < 0.35) {
      this.flashShell.material.color.setHex(0xff4400);
      this.flashShell.material.opacity = (1 - (e - 0.1) / 0.25) * 0.55;
    } else {
      this.flashShell.material.opacity = 0;
    }

    const tumble = fade * fade;
    this.car.rotation.x = Math.sin(e * 20) * 0.4 * tumble;
    this.car.rotation.z = Math.cos(e * 16) * 0.3 * tumble;
    this.car.position.y = Math.abs(Math.sin(e * 24)) * 0.35 * tumble;

    this._carDim = e < 0.08 ? 1 : e < 0.25 ? 0.25 : e < 0.55 ? 0.25 + ((e - 0.25) / 0.3) * 0.55 : 0.8 + fade * 0.2;
    this._setCarDim(this._carDim);

    if (e < 0.7 && Math.random() < 18 * dt) {
      const pt = SMOKE_EMITTERS[Math.floor(Math.random() * SMOKE_EMITTERS.length)];
      this._spawnSmoke(pt[0], pt[1], pt[2], 1);
    }

    if (this._wreckTimer <= 0) this.clearWreckFlash();
  }

  _setCarDim(alpha) {
    this.car.traverse((child) => {
      if (!child.isMesh || child.userData.isDamageVfx) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat.userData?.isPaint || mat.color) {
          if (mat.userData._wreckBaseOpacity == null) {
            mat.userData._wreckBaseOpacity = mat.opacity ?? 1;
          }
          mat.transparent = true;
          mat.opacity = mat.userData._wreckBaseOpacity * alpha;
        }
      }
    });
  }

  _updateBlastSparks(dt) {
    for (const s of this.blastSparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.material.opacity = Math.min(1, s.life * 2.2);
      s.mesh.scale.multiplyScalar(1 - dt * 0.4);
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  _updateDebris(dt) {
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= 10 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      const mats = Array.isArray(d.mesh.material) ? d.mesh.material : [d.mesh.material];
      for (const mat of mats) mat.opacity = Math.min(1, d.life * 1.5);
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y += dt * 0.35;
      p.mesh.scale.multiplyScalar(1 + dt * 1.4);
      p.mesh.material.opacity = Math.min(0.7, p.life * 0.55);
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  _spawnSmoke(x, y, z, severity) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      p.life = 0.8 + Math.random() * 1;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(0.5 + severity * 0.7);
      p.mesh.material.color.setHex(severity > 0.55 ? 0x1a1a1a : 0x555555);
      p.vel.set(
        (Math.random() - 0.5) * 1.2,
        1.2 + Math.random() * 2 + severity,
        (Math.random() - 0.5) * 1.2,
      );
      return;
    }
  }

  dispose() {
    for (const p of this.particles) p.mesh.material.dispose();
    for (const s of this.blastSparks) s.mesh.material.dispose();
    for (const d of this.debris) d.mesh.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
    this.shockwave.geometry.dispose();
    this.shockwave.material.dispose();
    this.fireCore.geometry.dispose();
    this.fireCore.material.dispose();
    this.flashShell.geometry.dispose();
    this.flashShell.material.dispose();
    this.car.remove(this.glow);
    this.car.remove(this.shockwave);
    this.car.remove(this.fireCore);
    this.car.remove(this.flashShell);
  }
}

export { WRECK_DURATION };
