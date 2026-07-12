/**
 * Records theater mode (composited WebGL + intro overlay + music)
 * via MediaRecorder and triggers a browser download when finished.
 */
export class TheaterRecorder {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => (HTMLAudioElement|null|undefined)} getAudioEl
   * @param {{
   *   onComplete?: (filename: string) => void,
   *   getOverlayCanvas?: () => (HTMLCanvasElement|null|undefined),
   * }} [hooks]
   */
  constructor(canvas, getAudioEl, hooks = {}) {
    this.canvas = canvas;
    this.getAudioEl = getAudioEl;
    this.getOverlayCanvas = hooks.getOverlayCanvas;
    this.onComplete = hooks.onComplete;
    this._recorder = null;
    this._chunks = [];
    this._timer = null;
    this._videoStream = null;
    this._composite = null;
    this._compositeCtx = null;
    this._raf = 0;
    this._stopped = true;
    this._filename = 'theater.webm';
  }

  get recording() {
    return !this._stopped;
  }

  /**
   * @param {{ durationMs?: number, filename?: string }} [opts]
   * @returns {Promise<boolean>} whether recording started
   */
  async start({ durationMs = 60_000, filename = 'theater.webm' } = {}) {
    this.stop(true);
    this._filename = filename;
    this._chunks = [];
    this._stopped = false;

    if (typeof MediaRecorder === 'undefined') {
      console.warn('Theater recording is not supported in this browser.');
      this._stopped = true;
      return false;
    }

    const composite = document.createElement('canvas');
    composite.width = this.canvas.width || 1280;
    composite.height = this.canvas.height || 720;
    const ctx = composite.getContext('2d');
    this._composite = composite;
    this._compositeCtx = ctx;

    const pump = () => {
      if (this._stopped || !this._compositeCtx) return;
      const src = this.canvas;
      const out = this._composite;
      if (out.width !== src.width || out.height !== src.height) {
        out.width = src.width || out.width;
        out.height = src.height || out.height;
      }
      this._compositeCtx.drawImage(src, 0, 0, out.width, out.height);
      const overlay = this.getOverlayCanvas?.();
      if (overlay && overlay.width && overlay.height) {
        this._compositeCtx.drawImage(overlay, 0, 0, out.width, out.height);
      }
      this._raf = requestAnimationFrame(pump);
    };
    this._raf = requestAnimationFrame(pump);

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
    let recorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 })
        : new MediaRecorder(combined, { videoBitsPerSecond: 6_000_000 });
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
      this._finishDownload();
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
   * @param {boolean} [discard] if true, drop chunks and do not download
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

  _finishDownload() {
    if (!this._chunks.length) return;
    const type = this._chunks[0]?.type || 'video/webm';
    const blob = new Blob(this._chunks, { type });
    this._chunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this._filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    this.onComplete?.(this._filename);
  }

  _stopPump() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
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
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}
