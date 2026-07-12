/** Keyboard input mapped to driving controls. */
export class Input {
  constructor() {
    this.keys = new Set();
    this._down = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._up = (e) => this.keys.delete(e.code);
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
  }

  get throttle() {
    let t = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) t += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) t -= 1;
    return t;
  }

  get steer() {
    let s = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s += 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s -= 1;
    return s;
  }

  get handbrake() {
    return this.keys.has('Space');
  }

  get boost() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeBoost() {
    return this.consume('ShiftLeft') || this.consume('ShiftRight');
  }

  /** One-shot key check with consume semantics. */
  consume(code) {
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
  }
}
