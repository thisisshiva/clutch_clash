/**
 * Fixed-rate ticker driven by a Web Worker.
 *
 * requestAnimationFrame stops and main-thread timers get heavily throttled
 * when the tab is hidden, but worker message events keep firing — so this
 * keeps theater rendering/recording alive while the user switches tabs.
 */
export class BackgroundTicker {
  constructor(fps = 30) {
    this._interval = Math.max(4, Math.round(1000 / fps));
    this._worker = null;
    this._url = null;
    this._callback = null;
  }

  get running() {
    return !!this._worker;
  }

  start(callback) {
    this.stop();
    this._callback = callback;
    const src =
      'let id=null;' +
      'onmessage=(e)=>{' +
      "if(e.data&&e.data.cmd==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),e.data.interval);}" +
      'else{clearInterval(id);id=null;}' +
      '};';
    this._url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    this._worker = new Worker(this._url);
    this._worker.onmessage = () => this._callback?.();
    this._worker.postMessage({ cmd: 'start', interval: this._interval });
  }

  stop() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    if (this._url) {
      URL.revokeObjectURL(this._url);
      this._url = null;
    }
    this._callback = null;
  }
}
