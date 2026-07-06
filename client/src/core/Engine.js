import * as THREE from 'three';

/**
 * Owns the renderer, scene graph, camera and the render loop.
 * Game code registers per-frame callbacks via onUpdate().
 */
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1026);
    this.scene.fog = new THREE.Fog(0x0b1026, 250, 700);

    this.camera = new THREE.PerspectiveCamera(
      70, window.innerWidth / window.innerHeight, 0.1, 1200
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
    const ambient = new THREE.HemisphereLight(0x8899ff, 0x223311, 0.7);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.6);
    sun.position.set(120, 180, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -400;
    sun.shadow.camera.right = 400;
    sun.shadow.camera.top = 400;
    sun.shadow.camera.bottom = -400;
    sun.shadow.camera.far = 600;
    this.scene.add(sun);

    // Ground plane (grass).
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: 0x1c3a1c, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Star field for night-race vibes.
    const starCount = 600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.7);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xbbccff, size: 1.6, sizeAttenuation: false })
    );
    this.scene.add(this.stars);
  }

  onUpdate(fn) {
    this._updateCallbacks.add(fn);
    return () => this._updateCallbacks.delete(fn);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this._clock.getDelta(), 1 / 20);
      for (const fn of this._updateCallbacks) fn(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
