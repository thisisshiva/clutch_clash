import * as THREE from 'three';
import { createCar, disposeCar, applyDamageWear, spinWheels } from './CarFactory.js';
import { DamageVfx, WRECK_DURATION } from './DamageVfx.js';
import { getCarStats, getCarDef } from './carCatalog.js';

/**
 * Manages remote players' car meshes + floating name labels, driven by
 * interpolated network state (StateSync).
 */
export class RemotePlayers {
  constructor(scene, stateSync) {
    this.scene = scene;
    this.stateSync = stateSync;
    /** @type {Map<string, {car:THREE.Group, label:THREE.Sprite, name:string, carModel:string, color:number, damageVfx:DamageVfx, maxHealth:number, lastHealth:number|null}>} */
    this.entries = new Map();
  }

  /** Reconcile against the authoritative room player list. */
  async syncPlayers(players, localId) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === localId) continue;
      seen.add(p.id);
      const existing = this.entries.get(p.id);
      if (!existing || existing.carModel !== p.carModel) {
        if (existing) this._removeEntry(p.id);
        const def = getCarDef(p.carModel);
        const car = await createCar(p.carModel, def.defaultColor, { preserveTextures: true });
        const label = makeNameLabel(p.name);
        label.position.y = 2.6;
        car.add(label);
        car.visible = false;
        this.scene.add(car);
        const maxHealth = getCarStats(p.carModel).health;
        const damageVfx = new DamageVfx(car);
        this.entries.set(p.id, {
          car, label, name: p.name, carModel: p.carModel, color: p.color,
          damageVfx, maxHealth, lastHealth: null,
        });
      } else {
        if (existing.name !== p.name) {
        existing.name = p.name;
        existing.label.material.map?.dispose();
        existing.label.material.dispose();
        carRemoveLabel(existing.car, existing.label);
        const label = makeNameLabel(p.name);
        label.position.y = 2.6;
        existing.car.add(label);
        existing.label = label;
        }
      }
    }
    for (const [id] of this.entries) {
      if (!seen.has(id)) this._removeEntry(id);
    }
  }

  update(dt = 1 / 60) {
    for (const [id, entry] of this.entries) {
      const state = this.stateSync.sample(id);
      if (!state) continue;
      entry.car.visible = true;
      entry.car.position.set(state.p[0], state.p[1], state.p[2]);
      entry.car.rotation.y = state.r;
      const wheelSpin = state.s * 0.05;
      spinWheels(entry.car.userData.wheels ?? [], wheelSpin);

      if (state.h != null && entry.maxHealth > 0) {
        const ratio = Math.max(0, Math.min(1, state.h / entry.maxHealth));
        if (entry.lastHealth != null && entry.lastHealth > 0 && ratio <= 0) {
          entry.damageVfx.triggerWreckFlash(WRECK_DURATION);
        }
        entry.lastHealth = ratio;
        entry.damageVfx.update(dt, ratio, state.s ?? 0);
        applyDamageWear(entry.car, ratio);
      }
    }
  }

  getCar(id) {
    return this.entries.get(id)?.car ?? null;
  }

  clear() {
    for (const id of [...this.entries.keys()]) this._removeEntry(id);
  }

  _removeEntry(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.damageVfx?.dispose();
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    carRemoveLabel(entry.car, entry.label);
    disposeCar(entry.car);
    this.entries.delete(id);
    this.stateSync.remove(id);
  }
}

function carRemoveLabel(car, label) {
  car.remove(label);
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
