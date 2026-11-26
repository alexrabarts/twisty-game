// The Blender-made traffic cars (tools/blender/car_*.py, built into
// assets/cars) in place of the car Car.createCarModel builds from primitives
// (js/traffic.js). Car builds its procedural model first and then calls
// CarModels.dress(): with the file already in, the swap is immediate;
// otherwise it happens when the file arrives, or the next time the car wraps
// round the leg if it is on the road by then. A file that fails leaves the
// procedural car.
//
// The swap keeps what Car drives: the four wheels it spins on the same hubs,
// the painted body it flashes on a collision, and the four indicators it
// blinks and lights under braking, each on a material of its own. Where the
// car is, how fast it goes and what it hits read none of this.
const CarModels = (() => {
  const CARS = {
    hatchback: "assets/cars/hatchback.glb",
    van: "assets/cars/van.glb",
  };
  // The colours of Traffic.getRandomCarColor that are a van; the rest are
  // hatchbacks. The colour picks the body, so no random number is drawn for it.
  const VANS = new Set([0xf5f5f5, 0x606060, 0x1a3a6b, 0x1b4d1b]);
  // A model stands on y = 0; a car's origin is at the height of its hubs
  const HUB = 0.32;
  // Glow of the lamps, which the reader does not take from the file
  const GLOW = { headlight: [0xffffee, 0.8], taillight: [0xff0000, 0.3] };
  const INDICATORS = { leftFrontIndicator: "indicator_fl", rightFrontIndicator: "indicator_fr", leftRearIndicator: "indicator_rl", rightRearIndicator: "indicator_rr" };

  // Parsed files, once they are in
  const arrived = new Map();
  // Finishes every car shares; the paint, the roof and the indicators are a car's own
  const shared = new Map();

  function load(url) {
    return SceneAssets.loadModel(url).then((model) => {
      arrived.set(url, model);
      return model;
    });
  }

  function preload() {
    return Promise.all(Object.values(CARS).map((url) => load(url).catch((error) => {
      console.error(`CarModels: ${url} did not load; its cars keep the procedural model:`, error);
      return null;
    })));
  }

  // three takes the id of every object it makes from Math.random. A swap
  // makes a few dozen, and must not move the numbers the game itself draws
  // next (the crew's speeds, under a seeded generator), so three draws from
  // this one while a swap runs.
  let state = 0x2f6e2b1;
  const ids = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function apart(work) {
    const random = Math.random;
    Math.random = ids;
    try {
      return work();
    } finally {
      Math.random = random;
    }
  }

  const kind = (car) => (VANS.has(car.color) ? "van" : "hatchback");

  // A node of a model as one object at the node's place
  function part(model, name, finish, parent) {
    const primitives = model.meshes.get(name);
    if (!primitives) throw new Error(`model lacks the part ${name}`);
    const meshes = primitives.map(({ geometry, material }) => {
      const mesh = new THREE.Mesh(geometry, finish(material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    });
    const object = meshes.length === 1 ? meshes[0] : new THREE.Group().add(...meshes);
    object.name = name;
    object.position.copy(model.places.get(name));
    parent.add(object);
    return object;
  }

  function swap(car, model) {
    const group = car.carGroup;
    // The procedural body's own material, so the collision flash still finds it
    const paint = car.body.material;
    const roof = new THREE.MeshStandardMaterial({ name: "paint_roof", color: car.roofColor === undefined ? car.color : car.roofColor, roughness: 0.25, metalness: 0.7, vertexColors: true });
    const finish = (source) => {
      if (source.name === "paint") return paint;
      if (source.name === "paint_roof") return roof;
      if (!shared.has(source.name)) {
        const material = source.clone();
        if (GLOW[source.name]) {
          material.emissive.setHex(GLOW[source.name][0]);
          material.emissiveIntensity = GLOW[source.name][1];
        }
        // The baked occlusion rides in the vertex colours
        material.vertexColors = true;
        shared.set(source.name, material);
      }
      return shared.get(source.name);
    };

    // Built whole before anything is removed: a model that lacks a part
    // throws here and the procedural car stays as it was
    const fresh = new THREE.Group();
    fresh.name = "carModel";
    fresh.position.y = -HUB;
    const shell = part(model, "body", finish, fresh);
    part(model, "headlights", finish, fresh);
    part(model, "taillights", finish, fresh);
    let body = null;
    shell.traverse((object) => {
      if (!body && object.isMesh && object.material === paint) body = object;
    });
    if (!body) throw new Error("car body has no painted part");
    const lamps = {};
    for (const [field, name] of Object.entries(INDICATORS)) {
      const was = car[field].material;
      lamps[field] = part(model, name, (source) => {
        const material = source.clone();
        material.vertexColors = true;
        // It carries on from the blink or the braking it was in
        material.emissive.copy(was.emissive);
        material.emissiveIntensity = was.emissiveIntensity;
        return material;
      }, fresh);
    }
    // One wheel in the file, facing the car's left; the right-hand pair are
    // turned about inside the hub group Car spins
    const wheels = car.wheels.map((old) => {
      const hub = new THREE.Group();
      hub.position.copy(old.position);
      hub.rotation.copy(old.rotation);
      const wheel = part(model, "wheel", finish, hub);
      wheel.position.set(0, 0, 0);
      if (old.position.x < 0) wheel.rotation.y = Math.PI;
      return hub;
    });

    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        if (object.material !== paint) object.material.dispose();
      });
    }
    paint.vertexColors = true;
    paint.needsUpdate = true;
    group.add(fresh, ...wheels);
    Object.assign(car, lamps, { body, wheels, cabin: null, kind: kind(car), modelled: true });
  }

  // Swaps the car's procedural model for the modelled one. Returns true if
  // it did so at once, otherwise a promise of whether it did in the end
  // (false: the file failed, the car was removed first, or the swap is held
  // until the car next wraps round the leg, out of sight).
  function dress(car) {
    const url = CARS[kind(car)];
    const attempt = () => {
      try {
        apart(() => swap(car, arrived.get(url)));
        return true;
      } catch (error) {
        console.error(`CarModels: a ${kind(car)} keeps its procedural model:`, error);
        return false;
      }
    };
    if (arrived.has(url)) return attempt();
    return load(url).then(() => {
      if (!car.carGroup.parent) return false;
      // update() has run: the car is on the road and may be in view
      if (car.wheelRotation) {
        car.modelWaiting = attempt;
        return false;
      }
      return attempt();
    }).catch((error) => {
      console.error(`CarModels: a ${kind(car)} keeps its procedural model:`, error);
      return false;
    });
  }

  return { dress, preload, kind, CARS, VANS, HUB };
})();

// In the page the downloads start with the menu; a test loads what it needs
if (typeof window !== "undefined" && typeof fetch === "function") CarModels.preload();
