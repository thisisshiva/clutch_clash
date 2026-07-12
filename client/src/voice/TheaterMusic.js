/**
 * Soft looping background music for theater mode.
 * Uses a plain HTMLAudioElement so it stays non-spatial ("speaker" bed).
 */
export class TheaterMusic {
  /**
   * @param {string} [src]
   * @param {{ volume?: number, fadeMs?: number }} [opts]
   */
  constructor(src = '/audio/bring-it-together.mp3', opts = {}) {
    this.src = src;
    this.targetVolume = opts.volume ?? 0.18;
    this.fadeMs = opts.fadeMs ?? 1600;
    this._audio = null;
    this._fadeTimer = null;
  }

  async start() {
    this.stop(true);
    const audio = new Audio(this.src);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this._audio = audio;

    try {
      await audio.play();
    } catch (err) {
      console.warn('Theater music could not start (autoplay blocked?).', err);
      return;
    }
    this._fadeTo(this.targetVolume);
  }

  /** @param {boolean} [immediate] */
  stop(immediate = false) {
    const audio = this._audio;
    if (!audio) return;

    if (immediate) {
      this._clearFade();
      audio.pause();
      audio.src = '';
      this._audio = null;
      return;
    }

    this._fadeTo(0, () => {
      audio.pause();
      audio.src = '';
      if (this._audio === audio) this._audio = null;
    });
  }

  _clearFade() {
    if (this._fadeTimer != null) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  _fadeTo(target, onDone) {
    const audio = this._audio;
    if (!audio) {
      onDone?.();
      return;
    }
    this._clearFade();
    const start = audio.volume;
    const steps = Math.max(8, Math.round(this.fadeMs / 40));
    let i = 0;
    this._fadeTimer = setInterval(() => {
      i += 1;
      const t = Math.min(1, i / steps);
      audio.volume = start + (target - start) * t;
      if (t >= 1) {
        this._clearFade();
        audio.volume = target;
        onDone?.();
      }
    }, 40);
  }
}
