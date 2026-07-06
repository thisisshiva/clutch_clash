import * as THREE from 'three';

/**
 * Spatial audio helpers built on THREE.PositionalAudio:
 * - attachVoice(): pipes a remote WebRTC MediaStream onto a car so voice
 *   volume falls off with distance (proximity voice).
 * - EngineSound: procedural engine hum (oscillators, no audio files) that
 *   tracks car speed; positional for remote cars, plain for the local car.
 */

export function attachVoice(listener, car, stream) {
  const audio = new THREE.PositionalAudio(listener);

  // Chrome quirk: a remote WebRTC stream must be attached to a muted
  // HTMLAudioElement before WebAudio can consume it.
  const el = document.createElement('audio');
  el.srcObject = stream;
  el.muted = true;
  el.play().catch(() => {});

  const source = listener.context.createMediaStreamSource(stream);
  audio.setNodeSource(source);
  audio.setRefDistance(12);
  audio.setMaxDistance(160);
  audio.setRolloffFactor(1.6);
  audio.setDistanceModel('inverse');
  car.add(audio);

  return () => {
    audio.disconnect();
    car.remove(audio);
    el.srcObject = null;
  };
}

export class EngineSound {
  /**
   * @param {THREE.AudioListener} listener
   * @param {THREE.Object3D|null} car positional if a car is given, global otherwise
   */
  constructor(listener, car = null) {
    this.ctx = listener.context;
    this.audio = car ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);

    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'square';

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;

    this.osc1.connect(this.gain);
    this.osc2.connect(this.gain);
    this.gain.connect(filter);

    this.audio.setNodeSource(filter);
    if (car) {
      this.audio.setRefDistance(10);
      this.audio.setRolloffFactor(1.4);
      car.add(this.audio);
    }
    this.audio.setVolume(car ? 0.9 : 0.35);

    this.osc1.start();
    this.osc2.start();
    this._disposed = false;
  }

  /** @param {number} speedRatio 0..1 of max speed */
  update(speedRatio) {
    if (this._disposed) return;
    const rpm = 40 + speedRatio * 130;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(rpm, t, 0.05);
    this.osc2.frequency.setTargetAtTime(rpm * 1.5 + 6, t, 0.05);
    this.gain.gain.setTargetAtTime(0.05 + speedRatio * 0.16, t, 0.08);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    try {
      this.osc1.stop();
      this.osc2.stop();
    } catch { /* already stopped */ }
    this.audio.disconnect();
    this.audio.parent?.remove(this.audio);
  }
}
