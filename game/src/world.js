import * as THREE from 'three';
import { PALETTE } from './palette.js';

/** Builds the compact, original Foundry arena and its movement collision data. */
export function buildWorld(scene = new THREE.Scene()) {
  const objects = [];
  const colliders = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 34, 78);

  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 0.94 }),
    concrete: new THREE.MeshStandardMaterial({ color: PALETTE.concrete, roughness: 0.88 }),
    shadow: new THREE.MeshStandardMaterial({ color: PALETTE.concreteShadow, roughness: 0.92 }),
    metal: new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.66, metalness: 0.28 }),
    rust: new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.28, metalness: 0.12 }),
    vanguard: new THREE.MeshStandardMaterial({ color: PALETTE.vanguard, roughness: 0.55, emissive: PALETTE.vanguard, emissiveIntensity: 0.12 }),
    outriders: new THREE.MeshStandardMaterial({ color: PALETTE.outriders, roughness: 0.55, emissive: PALETTE.outriders, emissiveIntensity: 0.12 }),
  };

  function addBox(name, x, y, z, width, height, depth, material, solid = true) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.castShadow = height > 0.25;
    mesh.receiveShadow = true;
    scene.add(mesh);
    objects.push(mesh);
    if (solid) {
      const half = new THREE.Vector3(width / 2, height / 2, depth / 2);
      colliders.push({
        min: new THREE.Vector3(x, y, z).sub(half),
        max: new THREE.Vector3(x, y, z).add(half),
      });
    }
    return mesh;
  }

  function addRamp(name, x, z, length, width, height, rotationY, material) {
    // A shallow solid wedge represented by a sloped box; its collider covers the ramp volume.
    const ramp = addBox(name, x, height / 2, z, width, height, length, material);
    ramp.rotation.y = rotationY;
    ramp.rotation.x = -0.11;
    const collider = colliders[colliders.length - 1];
    const reach = Math.max(length, width) / 2;
    collider.min.set(x - reach, 0, z - reach);
    collider.max.set(x + reach, height + 0.35, z + reach);
    return ramp;
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 44), materials.ground);
  floor.name = 'Foundry ground';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.045;
  floor.receiveShadow = true;
  scene.add(floor);
  objects.push(floor);

  // Outer shell keeps the combat space readable while leaving the upper arena open.
  addBox('north perimeter', 0, 2, -19, 40, 4, 1, materials.shadow);
  addBox('south perimeter', 0, 2, 19, 40, 4, 1, materials.shadow);
  addBox('west perimeter', -19.5, 2, 0, 1, 4, 38, materials.shadow);
  addBox('east perimeter', 19.5, 2, 0, 1, 4, 38, materials.shadow);

  // Central casting court and offset industrial lanes.
  addBox('west furnace block', -7.4, 2, -1.2, 5.5, 4, 8.5, materials.concrete);
  addBox('east furnace block', 7.3, 2.2, 0.6, 6.2, 4.4, 7.6, materials.concrete);
  addBox('court divider west', -3.6, 1.1, -2.5, 1, 2.2, 7, materials.metal);
  addBox('court divider east', 4.2, 1.2, 3, 1, 2.4, 6.8, materials.shadow);
  addBox('casting pit rim north', 0, 0.55, -5.6, 5.4, 1.1, 0.55, materials.rust);
  addBox('casting pit rim south', 0, 0.55, -9.1, 5.4, 1.1, 0.55, materials.rust);
  addBox('casting pit rim west', -2.45, 0.55, -7.35, 0.5, 1.1, 3.2, materials.rust);
  addBox('casting pit rim east', 2.45, 0.55, -7.35, 0.5, 1.1, 3.2, materials.rust);

  // Raised service walks and their access ramps.
  addBox('west service deck', -13, 1.1, 7.3, 5.2, 0.35, 7.4, materials.metal);
  addBox('east service deck', 13, 1.1, -7.5, 5.2, 0.35, 7.4, materials.metal);
  addRamp('west access ramp', -13, 1.35, 4.5, 3.2, 1.05, 0, materials.concrete);
  addRamp('east access ramp', 13, -1.55, 4.5, 3.2, 1.05, 0, materials.concrete);

  // Lane cover and shipping crates break long sight lines without sealing routes.
  [
    [-15, 0.72, -11, 2.2, 1.44, 1.6, materials.rust], [-12, 0.72, -12.3, 2.1, 1.44, 1.7, materials.metal],
    [15, 0.72, 11, 2.2, 1.44, 1.6, materials.rust], [12, 0.72, 12.3, 2.1, 1.44, 1.7, materials.metal],
    [-5.7, 0.65, 8.6, 2.4, 1.3, 1.2, materials.concrete], [5.3, 0.65, -11.5, 2.2, 1.3, 1.2, materials.concrete],
    [-6.5, 0.65, -13.8, 2.2, 1.3, 1.2, materials.rust], [6.4, 0.65, 9.5, 2.2, 1.3, 1.2, materials.rust],
  ].forEach(([x, y, z, w, h, d, material], i) => addBox(`cover crate ${i + 1}`, x, y, z, w, h, d, material));

  // Distinctive site markers sit above walkable ground and share the map palette.
  addBox('site A plinth', -13.8, 0.18, -3.6, 4.2, 0.36, 4.2, materials.shadow, false);
  addBox('site A marker', -13.8, 0.42, -3.6, 1.25, 0.12, 1.25, materials.outriders, false);
  addBox('site B plinth', 13.2, 0.18, 3.6, 4.2, 0.36, 4.2, materials.shadow, false);
  addBox('site B marker', 13.2, 0.42, 3.6, 1.25, 0.12, 1.25, materials.vanguard, false);

  // Colored foundry vents add navigation landmarks to each end of the central court.
  addBox('amber vent stack', -7.1, 1.75, -12.3, 1.15, 3.5, 1.15, materials.rust);
  addBox('teal vent stack', 7.2, 1.75, 12.2, 1.15, 3.5, 1.15, materials.glass);

  const hemisphere = new THREE.HemisphereLight(PALETTE.haze, PALETTE.concreteShadow, 1.45);
  hemisphere.name = 'Foundry sky fill';
  scene.add(hemisphere);
  objects.push(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe2bd, 2.25);
  sun.name = 'Foundry sun';
  sun.position.set(-13, 23, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 65;
  sun.shadow.bias = -0.00035;
  scene.add(sun);
  objects.push(sun);

  const objectiveZones = {
    A: { min: new THREE.Vector3(-16.4, 0, -5.7), max: new THREE.Vector3(-11.2, 2.4, -1.5) },
    B: { min: new THREE.Vector3(11.8, 0, 1.5), max: new THREE.Vector3(17, 2.4, 5.7) },
  };
  const spawns = {
    A: [new THREE.Vector3(-2.2, 0, 14), new THREE.Vector3(0, 0, 14), new THREE.Vector3(2.2, 0, 14), new THREE.Vector3(4.4, 0, 14)],
    B: [new THREE.Vector3(-2.2, 0, -14), new THREE.Vector3(0, 0, -14), new THREE.Vector3(2.2, 0, -14), new THREE.Vector3(4.4, 0, -14)],
  };

  return { scene, objects, colliders, spawns, objectiveZones };
}

export function aabbIntersects(a, b) {
  return a.min.x <= b.max.x && a.max.x >= b.min.x
    && a.min.y <= b.max.y && a.max.y >= b.min.y
    && a.min.z <= b.max.z && a.max.z >= b.min.z;
}

export function intersectsAnyAabb(aabb, colliders) {
  return colliders.some((collider) => aabbIntersects(aabb, collider));
}
