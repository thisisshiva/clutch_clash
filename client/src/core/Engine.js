import * as THREE from 'three';
import { performanceConfig } from '../game/PerformanceConfig.js';
import { BackgroundTicker } from './BackgroundTicker.js';

/**
 * Owns the renderer, scene graph, camera and the render loop.
 * Game code registers per-frame callbacks via onUpdate().
 */
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Required so theater recording can drawImage the WebGL canvas.
      // Without this the buffer is cleared after present → black video.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ecbff);
    this.scene.fog = new THREE.Fog(0xa6d8ff, 2200, 20000);

    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.5, 16000
    );
    this.camera.position.set(0, 8, -14);

    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    this._updateCallbacks = new Set();
    this._clock = new THREE.Clock();
    this._running = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this._setupEnvironment();
  }

  _setupEnvironment() {
    const ambient = new THREE.HemisphereLight(0xbfe3ff, 0x6aa05d, 1.12);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff8ee, 2.4);
    sun.position.set(120, 180, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(performanceConfig.shadowMapSize, performanceConfig.shadowMapSize);
    sun.shadow.camera.left = -2800;
    sun.shadow.camera.right = 2800;
    sun.shadow.camera.top = 2800;
    sun.shadow.camera.bottom = -2800;
    sun.shadow.camera.far = 9000;
    // Reduce black shimmer/flicker from long-range shadow acne.
    sun.shadow.bias = -0.00008;
    sun.shadow.normalBias = 0.045;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xd8eeff, 0.85);
    fill.position.set(-90, 70, -110);
    this.scene.add(fill);

    const moon = new THREE.DirectionalLight(0xc8d8ff, 0);
    moon.position.set(-90, 140, 70);
    this.scene.add(moon);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20000, 20000),
      new THREE.MeshStandardMaterial({ color: 0x5daa5d, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this._env = { ambient, sun, fill, moon, ground };
    this.clearTrackEnvironment = null;
  }

  onUpdate(fn) {
    this._updateCallbacks.add(fn);
    return () => this._updateCallbacks.delete(fn);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  _frame() {
    const dt = Math.min(this._clock.getDelta(), 1 / 20);
    for (const fn of this._updateCallbacks) fn(dt);
    if (this._overrideRender) this._overrideRender(this.renderer, this);
    else this.renderer.render(this.scene, this.camera);
    // Capture immediately after present so MediaRecorder never sees a cleared buffer.
    this._afterRender?.();
  }

  /** When set, replaces the default scene/camera WebGL present (used by 2D roads). */
  setOverrideRender(fn) {
    this._overrideRender = typeof fn === 'function' ? fn : null;
  }

  /** Optional hook run after each WebGL present (used by TheaterRecorder). */
  setAfterRender(fn) {
    this._afterRender = typeof fn === 'function' ? fn : null;
  }

  resize() {
    if (this._theaterCapture) {
      this.camera.aspect = this._theaterCapture.width / this._theaterCapture.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this._theaterCapture.width, this._theaterCapture.height, false);
      return;
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Lock the WebGL buffer to a fixed capture size (CSS canvas still fills the
   * window). Stable frames + known resolution for theater recording.
   */
  beginTheaterCapture({ width = 1920, height = 1080 } = {}) {
    if (this._theaterCapture) return;
    this._theaterCapture = {
      width,
      height,
      pixelRatio: this.renderer.getPixelRatio(),
    };
    this.renderer.setPixelRatio(1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);

    // rAF pauses in hidden tabs; hand rendering to a worker ticker so the
    // recording keeps advancing when the user switches tabs/apps.
    this._onVisibility = () => this._syncBackgroundLoop();
    document.addEventListener('visibilitychange', this._onVisibility);
    this._syncBackgroundLoop();
  }

  endTheaterCapture() {
    if (!this._theaterCapture) return;
    if (this._onVisibility) {
      document.removeEventListener('visibilitychange', this._onVisibility);
      this._onVisibility = null;
    }
    this._bgTicker?.stop();
    this._bgTicker = null;
    const saved = this._theaterCapture.pixelRatio;
    this._theaterCapture = null;
    this.renderer.setPixelRatio(Math.min(saved || window.devicePixelRatio || 1, 2));
    this.resize();
  }

  _syncBackgroundLoop() {
    const needsTicker = document.hidden && this._theaterCapture && this._running;
    if (needsTicker && !this._bgTicker) {
      this._bgTicker = new BackgroundTicker(30);
      this._bgTicker.start(() => {
        if (this._running && document.hidden) this._frame();
      });
    } else if (!needsTicker && this._bgTicker) {
      this._bgTicker.stop();
      this._bgTicker = null;
    }
  }

  /** Recursively dispose an object's geometries/materials and remove it. */
  disposeObject(obj) {
    obj.traverse((child) => {
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m) continue;
        for (const value of Object.values(m)) value?.isTexture && value.dispose();
        m.dispose?.();
      }
    });
    obj.parent?.remove(obj);
  }
}
