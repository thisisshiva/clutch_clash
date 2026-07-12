import * as THREE from 'three';

const DEFAULT_ENGINE = {
  osc1: 'sawtooth',
  osc2: 'square',
  baseHz: 42,
  pitchRange: 130,
  osc2Ratio: 1.5,
  volume: 0.16,
  filterHz: 900,
};

/**
 * Procedural engine audio — profile per car model.
 */
export class EngineSound {
  /**
   * @param {THREE.AudioListener} listener
   * @param {object} [profile]
   */
  constructor(listener, profile = DEFAULT_ENGINE) {
    this.profile = { ...DEFAULT_ENGINE, ...profile };
    this.ctx = listener.context;
    this.audio = new THREE.Audio(listener);

    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = this.profile.osc1;
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = this.profile.osc2;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = this.profile.filterHz;

    this.osc1.connect(this.gain);
    this.osc2.connect(this.gain);
    this.gain.connect(this.filter);

    this.audio.setNodeSource(this.filter);
    this.audio.setVolume(0.35);

    this.osc1.start();
    this.osc2.start();
    this._disposed = false;
  }

  /** @param {number} speedRatio 0..1 of max speed */
  update(speedRatio) {
    if (this._disposed) return;
    const p = this.profile;
    const rpm = p.baseHz + speedRatio * p.pitchRange;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(rpm, t, 0.05);
    this.osc2.frequency.setTargetAtTime(rpm * p.osc2Ratio + 5, t, 0.05);
    this.gain.gain.setTargetAtTime(0.04 + speedRatio * p.volume, t, 0.08);
    this.filter.frequency.setTargetAtTime(
      p.filterHz + speedRatio * 400,
      t,
      0.1,
    );
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    try {
      this.osc1.stop();
      this.osc2.stop();
    } catch { /* already stopped */ }
    this.audio.disconnect();
  }
}

export function attachVoice(listener, car, stream) {
  const audio = new THREE.PositionalAudio(listener);

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
