/**
 * Records theater mode (composited WebGL + intro overlay + music)
 * via MediaRecorder and passes the finished video to the upload hook.
 *
 * Captures at a fixed 1920x1080 buffer. Frames are sampled immediately
 * after each WebGL present (via Engine.setAfterRender) so we never copy
 * a cleared drawing buffer — which previously produced black gameplay
 * with only the 2D intro text visible.
 */
export class TheaterRecorder {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => (HTMLAudioElement|null|undefined)} getAudioEl
   * @param {{
   *   onComplete?: (filename: string, blob: Blob) => void,
   *   getOverlayCanvas?: () => (HTMLCanvasElement|null|undefined),
   *   engine?: { setAfterRender?: (fn: (() => void)|null) => void },
   * }} [hooks]
   */
  constructor(canvas, getAudioEl, hooks = {}) {
    this.canvas = canvas;
    this.getAudioEl = getAudioEl;
    this.getOverlayCanvas = hooks.getOverlayCanvas;
    this.onComplete = hooks.onComplete;
    this.engine = hooks.engine;
    this._recorder = null;
    this._chunks = [];
    this._timer = null;
    this._videoStream = null;
    this._composite = null;
    this._compositeCtx = null;
    this._stopped = true;
    this._filename = 'theater.webm';
    this._width = 1920;
    this._height = 1080;
  }

  get recording() {
    return !this._stopped;
  }

  /**
   * @param {{ durationMs?: number, filename?: string, width?: number, height?: number }} [opts]
   * @returns {Promise<boolean>} whether recording started
   */
  async start({
    durationMs = 60_000,
    filename = 'theater.webm',
    width = 1920,
    height = 1080,
  } = {}) {
    this.stop(true);
    this._filename = filename;
    this._width = Math.max(2, width & ~1);
    this._height = Math.max(2, height & ~1);
    this._chunks = [];
    this._stopped = false;

    if (typeof MediaRecorder === 'undefined') {
      console.warn('Theater recording is not supported in this browser.');
      this._stopped = true;
      return false;
    }

    const composite = document.createElement('canvas');
    composite.width = this._width;
    composite.height = this._height;
    const ctx = composite.getContext('2d', { alpha: false });
    this._composite = composite;
    this._compositeCtx = ctx;

    // Seed one frame immediately, then keep sampling after each engine render.
    this._pumpFrame();
    this.engine?.setAfterRender?.(() => this._pumpFrame());

    let videoStream;
    try {
      videoStream = composite.captureStream(30);
    } catch (err) {
      console.warn('Could not capture canvas for theater recording.', err);
      this._stopPump();
      this._stopped = true;
      return false;
    }
    this._videoStream = videoStream;

    const tracks = [...videoStream.getVideoTracks()];
    const audioEl = this.getAudioEl?.();
    if (audioEl) {
      try {
        const audioStream = typeof audioEl.captureStream === 'function'
          ? audioEl.captureStream()
          : null;
        if (audioStream) tracks.push(...audioStream.getAudioTracks());
      } catch (err) {
        console.warn('Theater recording will continue without audio.', err);
      }
    }

    const combined = new MediaStream(tracks);
    const mimeType = pickMimeType();
    const bits = 14_000_000;
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: bits })
        : new MediaRecorder(combined, { videoBitsPerSecond: bits });
    } catch (err) {
      console.warn('Could not start MediaRecorder.', err);
      this._teardownStreams();
      this._stopPump();
      this._stopped = true;
      return false;
    }

    this._recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) this._chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      console.warn('Theater recorder error.', event.error || event);
    };

    recorder.onstop = () => {
      this._finishRecording();
      this._teardownStreams();
      this._stopPump();
      this._recorder = null;
      this._stopped = true;
    };

    recorder.start(1000);
    this._timer = setTimeout(() => this.stop(), durationMs);
    return true;
  }

  /**
   * @param {boolean} [discard] if true, drop chunks
   */
  stop(discard = false) {
    if (this._timer != null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const recorder = this._recorder;
    if (!recorder) {
      this._stopPump();
      this._stopped = true;
      return;
    }
    if (discard) {
      this._chunks = [];
      recorder.onstop = () => {
        this._teardownStreams();
        this._stopPump();
        this._recorder = null;
        this._stopped = true;
      };
    }
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        this._teardownStreams();
        this._stopPump();
        this._recorder = null;
        this._stopped = true;
      }
    }
  }

  _pumpFrame() {
    if (this._stopped || !this._compositeCtx) return;
    const src = this.canvas;
    if (!src.width || !src.height) return;
    const out = this._composite;
    this._compositeCtx.fillStyle = '#000';
    this._compositeCtx.fillRect(0, 0, out.width, out.height);
    // Cover-fit the game canvas into the fixed capture frame.
    const scale = Math.max(out.width / src.width, out.height / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    this._compositeCtx.drawImage(src, (out.width - dw) * 0.5, (out.height - dh) * 0.5, dw, dh);
    const overlay = this.getOverlayCanvas?.();
    if (overlay && overlay.width && overlay.height) {
      this._compositeCtx.drawImage(overlay, 0, 0, out.width, out.height);
    }
  }

  _finishRecording() {
    if (!this._chunks.length) return;
    const type = this._chunks[0]?.type || 'video/webm';
    const blob = new Blob(this._chunks, { type });
    this._chunks = [];
    this.onComplete?.(this._filename, blob);
  }

  _stopPump() {
    this.engine?.setAfterRender?.(null);
    this._composite = null;
    this._compositeCtx = null;
  }

  _teardownStreams() {
    if (this._videoStream) {
      for (const track of this._videoStream.getTracks()) track.stop();
      this._videoStream = null;
    }
  }
}

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}
