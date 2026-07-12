/**
 * Client-side checkpoint tracking: detects gate crossings (plane crossing
 * near the gate), remembers the last checkpoint for respawn, and notifies
 * listeners so the network layer can report to the server for validation.
 */
export class CheckpointSystem {
  constructor(trackDef) {
    this.def = trackDef;
    this.nextIndex = 0;
    this.lap = 1;
    this.lastPassed = null; // { position, heading } for respawn
    this.onPass = null;     // (index) => void
    this._prevSide = null;
  }

  reset() {
    this.nextIndex = 0;
    this.lap = 1;
    this.lastPassed = null;
    this._prevSide = null;
  }

  /** Call every frame with the car's position. */
  update(x, z) {
    const gate = this.def.checkpoints[this.nextIndex];
    const [gx, , gz] = gate.position;
    const [tx, tz] = gate.tangent;

    const dx = x - gx;
    const dz = z - gz;
    const lateral = Math.abs(dx * tz - dz * tx);
    const along = dx * tx + dz * tz; // signed distance along travel direction

    const nearGate = lateral < this.def.roadWidth / 2 + 2 && Math.abs(along) < 8;
    if (!nearGate) {
      this._prevSide = null;
      return;
    }

    const side = Math.sign(along);
    if (this._prevSide === -1 && side >= 0) {
      this._crossed(gate);
    }
    this._prevSide = side;
  }

  _crossed(gate) {
    this.lastPassed = {
      position: [...gate.position],
      heading: gate.heading,
      index: gate.index,
    };
    const passedIndex = this.nextIndex;
    this.nextIndex = (this.nextIndex + 1) % this.def.checkpointCount;
    this._prevSide = null;
    this.onPass?.(passedIndex);
  }

  /** Where to respawn: last passed gate, or track spawn if none yet. */
  getRespawnPoint(fallbackSpawn) {
    if (this.lastPassed) {
      return { position: this.lastPassed.position, heading: this.lastPassed.heading };
    }
    return fallbackSpawn;
  }
}
