import * as THREE from 'three';
import { createCar, disposeCar } from './CarFactory.js';

/**
 * Manages remote players' car meshes + floating name labels, driven by
 * interpolated network state (StateSync).
 */
export class RemotePlayers {
  constructor(scene, stateSync) {
    this.scene = scene;
    this.stateSync = stateSync;
    /** @type {Map<string, {car:THREE.Group, label:THREE.Sprite, name:string}>} */
    this.entries = new Map();
  }

  /** Reconcile against the authoritative room player list. */
  syncPlayers(players, localId) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === localId) continue;
      seen.add(p.id);
      if (!this.entries.has(p.id)) {
        const car = createCar(p.color);
        const label = makeNameLabel(p.name);
        label.position.y = 2.6;
        car.add(label);
        car.visible = false;
        this.scene.add(car);
        this.entries.set(p.id, { car, label, name: p.name });
      }
    }
    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        entry.label.material.map?.dispose();
        entry.label.material.dispose();
        disposeCar(entry.car);
        this.entries.delete(id);
        this.stateSync.remove(id);
      }
    }
  }

  update() {
    for (const [id, entry] of this.entries) {
      const state = this.stateSync.sample(id);
      if (!state) continue;
      entry.car.visible = true;
      entry.car.position.set(state.p[0], state.p[1], state.p[2]);
      entry.car.rotation.y = state.r;
      const wheelSpin = state.s * 0.05;
      for (const wheel of entry.car.userData.wheels) wheel.rotation.x += wheelSpin;
    }
  }

  getCar(id) {
    return this.entries.get(id)?.car ?? null;
  }

  clear() {
    for (const [id, entry] of this.entries) {
      entry.label.material.map?.dispose();
      entry.label.material.dispose();
      disposeCar(entry.car);
      this.stateSync.remove(id);
    }
    this.entries.clear();
  }
}

function makeNameLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = Math.min(ctx.measureText(name).width + 30, 250);
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  sprite.scale.set(4, 1, 1);
  return sprite;
}
