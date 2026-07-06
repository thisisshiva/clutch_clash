import * as THREE from 'three';

// Shared geometries - built once, reused for every car (local + remote).
let shared = null;

function getSharedGeometries() {
  if (shared) return shared;
  shared = {
    body: new THREE.BoxGeometry(1.5, 0.42, 4.4),
    nose: new THREE.BoxGeometry(0.7, 0.3, 1.4),
    cockpit: new THREE.CapsuleGeometry(0.34, 0.9, 4, 8),
    frontWing: new THREE.BoxGeometry(2.2, 0.1, 0.55),
    rearWing: new THREE.BoxGeometry(2.0, 0.1, 0.5),
    wingPole: new THREE.BoxGeometry(0.12, 0.5, 0.12),
    wheel: new THREE.CylinderGeometry(0.44, 0.44, 0.42, 18),
    halo: new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI),
    tyreMat: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    darkMat: new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6 }),
  };
  return shared;
}

/**
 * Factory - builds a low-poly F1-style car from primitive meshes.
 * Returns a THREE.Group whose forward direction is +Z.
 */
export function createCar(color) {
  const g = getSharedGeometries();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, metalness: 0.35,
  });

  const car = new THREE.Group();

  const body = new THREE.Mesh(g.body, bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  car.add(body);

  const nose = new THREE.Mesh(g.nose, bodyMat);
  nose.position.set(0, 0.4, 2.6);
  nose.castShadow = true;
  car.add(nose);

  const cockpit = new THREE.Mesh(g.cockpit, g.darkMat);
  cockpit.rotation.x = Math.PI / 2;
  cockpit.position.set(0, 0.78, -0.2);
  cockpit.castShadow = true;
  car.add(cockpit);

  const halo = new THREE.Mesh(g.halo, g.darkMat);
  halo.position.set(0, 0.85, 0.25);
  car.add(halo);

  const frontWing = new THREE.Mesh(g.frontWing, bodyMat);
  frontWing.position.set(0, 0.28, 3.15);
  frontWing.castShadow = true;
  car.add(frontWing);

  const rearWing = new THREE.Mesh(g.rearWing, bodyMat);
  rearWing.position.set(0, 1.0, -2.15);
  rearWing.castShadow = true;
  car.add(rearWing);

  for (const x of [-0.55, 0.55]) {
    const pole = new THREE.Mesh(g.wingPole, g.darkMat);
    pole.position.set(x, 0.72, -2.15);
    car.add(pole);
  }

  car.userData.wheels = [];
  const wheelSlots = [
    [-1.0, 1.55], [1.0, 1.55],   // front
    [-1.05, -1.7], [1.05, -1.7], // rear
  ];
  for (const [x, z] of wheelSlots) {
    const wheel = new THREE.Mesh(g.wheel, g.tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.44, z);
    wheel.castShadow = true;
    car.add(wheel);
    car.userData.wheels.push(wheel);
  }

  car.userData.bodyMaterial = bodyMat;
  return car;
}

/** Dispose only per-car resources (shared geometries stay cached). */
export function disposeCar(car) {
  car.userData.bodyMaterial?.dispose();
  car.parent?.remove(car);
}
