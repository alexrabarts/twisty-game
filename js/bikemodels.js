// The Blender-made bikes and rider (tools/blender/bike_*.py and rider.py,
// built into assets/bikes) in place of the parts Vehicle builds from
// primitives. Vehicle.createMesh builds its procedural model first and then
// calls BikeModels.dress(): with the files already in, the swap is immediate;
// otherwise it happens when they arrive, or at the next reset if the bike is
// being ridden by then. A file that fails leaves the procedural model.
//
// The swap keeps Vehicle's contract: the same named parts on the same pivots
// (wheels, discs, forks, bar, lights, rider and limbs), the same paint
// material on this.frame for the crash and wheelie tints, and the rider posed
// from the same numbers. Physics, handling and the camera read none of it.
const BikeModels = (() => {
  // The file of each kind of bike (Vehicle.BIKES)
  const MODELS = {
    sport: "assets/bikes/sport.glb",
    adventure: "assets/bikes/adventure.glb",
    scooter: "assets/bikes/scooter.glb",
    dirt: "assets/bikes/dirt.glb",
    naked: "assets/bikes/naked.glb",
  };
  // The file each character's bike is read from, by character id
  const BIKES = Object.fromEntries(CHARACTERS.map((character) => [character.id, MODELS[Vehicle.bikeOf(character)]]));
  const RIDER = "assets/bikes/rider.glb";
  // The sport bike at a fifth of the detail, for the touring crew (js/traffic.js)
  const CREW = "assets/bikes/crew.glb";
  // How a crew rider sits it: the tuck Vehicle.buildSportBike gives its rider
  const CREW_POSE = { y: 1.06, z: -0.08, torsoLean: 0.72, style: "race", elbowOut: 0.05, kneeOut: 0.06 };
  // Joint to joint, as tools/blender/rider.py models each limb
  const LENGTHS = { upper_arm: 0.31, forearm: 0.3, thigh: 0.42, shin: 0.42 };
  // Glow of the lit materials, which the reader does not take from the file
  const GLOW = { signal: [0x9a5500, 0.4], reflector: [0x550000, 0.5] };

  // Parsed files, once they are in
  const arrived = new Map();

  function load(url) {
    return SceneAssets.loadModel(url).then((model) => {
      arrived.set(url, model);
      return model;
    });
  }

  function file(vehicle) {
    return MODELS[vehicle.bike] || MODELS.sport;
  }

  // Starts every download, so a ride or the rider select finds them in
  function preload() {
    return Promise.all([RIDER, CREW, ...Object.values(MODELS)].map((url) => load(url).catch((error) => {
      console.error(`BikeModels: ${url} did not load; its bike keeps the procedural model:`, error);
      return null;
    })));
  }

  const camel = (name) => name.replace(/_(.)/g, (match, letter) => letter.toUpperCase());

  // One material per name for one bike. The character's paint, its dark shade
  // and its accent are the palette's own (so Vehicle's tints still reach
  // them); the palette's other finishes are used where a name matches, and
  // anything else is the file's colour.
  function finishes(vehicle) {
    const palette = vehicle.palette;
    const made = new Map();
    return (source) => {
      const name = source.name;
      if (!made.has(name)) {
        let material = name === "seat" ? palette.leather : palette[camel(name)];
        if (!material || !material.isMaterial) {
          material = source.clone();
          if (GLOW[name]) {
            material.emissive.setHex(GLOW[name][0]);
            material.emissiveIntensity = GLOW[name][1];
          }
        }
        // The baked occlusion rides in the vertex colours
        material.vertexColors = true;
        material.needsUpdate = true;
        made.set(name, material);
      }
      return made.get(name);
    };
  }

  // A node of a model as one object at the node's place: the mesh itself
  // when it has one material, a group of meshes when it has several
  function part(model, name, finish, parent) {
    const primitives = model.meshes.get(name);
    if (!primitives) throw new Error(`model lacks the part ${name}`);
    const meshes = primitives.map(({ geometry, material }) => {
      const mesh = new THREE.Mesh(geometry, finish(material));
      mesh.castShadow = !mesh.material.transparent;
      mesh.receiveShadow = true;
      return mesh;
    });
    const object = meshes.length === 1 ? meshes[0] : new THREE.Group().add(...meshes);
    object.name = name;
    object.position.copy(model.places.get(name));
    parent.add(object);
    return object;
  }

  const meshOf = (object, material) => {
    let found = null;
    object.traverse((o) => {
      if (!found && o.isMesh && o.material === material) found = o;
    });
    return found;
  };

  // A limb between two joints: its length along the line, its outer side
  // (the elbow, the kneecap) turned toward `out`
  function limb(model, name, finish, parent, from, to, out) {
    const object = part(model, name, finish, parent);
    const along = new THREE.Vector3().subVectors(to, from);
    const length = along.length();
    along.normalize();
    const front = out.clone().addScaledVector(along, -out.dot(along));
    if (front.lengthSq() < 1e-8) front.set(0, 0, 1).addScaledVector(along, -along.z);
    front.normalize();
    const across = new THREE.Vector3().crossVectors(along, front);
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, front));
    object.position.addVectors(from, to).multiplyScalar(0.5);
    object.scale.y = length / LENGTHS[name];
    return object;
  }

  // Where the elbow or knee of a two-part limb lies: the parts keep their
  // modelled lengths `a` and `b`, and the joint stands off the line between
  // the ends toward `toward`. A reach longer than the limb leaves it all but
  // straight, both parts stretched alike to span it.
  function joint(from, to, a, b, toward) {
    const line = new THREE.Vector3().subVectors(to, from);
    const reach = line.length();
    const stretch = Math.max(1, reach / ((a + b) * 0.995));
    a *= stretch;
    b *= stretch;
    line.normalize();
    const along = (a * a - b * b + reach * reach) / (2 * reach);
    const off = Math.sqrt(Math.max(0, a * a - along * along));
    const bend = toward.clone().addScaledVector(line, -toward.dot(line)).normalize();
    return from.clone().addScaledVector(line, along).addScaledVector(bend, off);
  }

  // The rider, seated where Vehicle.buildVariantRider seats its capsules:
  // the same torso lean, hands on the bike's grips and feet on its pegs (the
  // model's own marks). Elbows and knees fall where limbs of a fixed length
  // put them, rather than midway, so an arm or a leg is not shrunk to fit.
  function seat(spec, bike, model) {
    const colour = (hex, roughness, metalness, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, vertexColors: true, ...extra });
    // Gear a spec leaves out takes the colour that part had before it was
    // a material of its own (Vehicle.buildVariantRider)
    const glove = spec.gloveColor ?? 0x101014;
    const wear = {
      suit: colour(spec.suitColor, 0.85, 0),
      suit_accent: colour(spec.suitAccent, 0.6, 0.15),
      glove: colour(glove, 0.9, 0),
      pants: colour(spec.pantsColor ?? spec.suitColor, 0.85, 0),
      pants_accent: colour(spec.pantsAccent ?? spec.suitAccent, 0.6, 0.15),
      boot: colour(spec.bootColor ?? glove, 0.9, 0),
      boot_accent: colour(spec.bootAccent ?? spec.suitAccent, 0.6, 0.15),
      helmet: colour(spec.helmetColor, 0.12, 0.35, { envMapIntensity: 1.8 }),
      helmet_accent: colour(spec.helmetAccent, 0.2, 0.4),
      helmet_trim: colour(spec.helmetTrim ?? spec.helmetAccent, 0.2, 0.45),
      backpack: colour(spec.backpackColor ?? spec.suitColor, 0.8, 0.05),
      visor: colour(0x0e1218, 0.06, 0.45, { envMapIntensity: 2.0 }),
    };
    const finish = (source) => wear[source.name] || wear.suit;

    const rider = new THREE.Group();
    rider.name = "rider";
    const lean = spec.torsoLean;
    const up = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
    const ahead = new THREE.Vector3(0, -Math.sin(lean), Math.cos(lean));
    const torso = part(model, "torso", finish, rider);
    torso.rotation.x = lean;
    if (spec.style === "race") part(model, "hump", finish, rider).rotation.x = lean;
    if (spec.backpackColor != null) part(model, "backpack", finish, rider).rotation.x = lean;

    // The head looks up the road rather than down the tank
    const head = new THREE.Group();
    head.name = "head";
    head.position.copy(up).multiplyScalar(0.375).addScaledVector(ahead, 0.03);
    head.rotation.x = lean * 0.45;
    rider.add(head);
    const helmet = part(model, spec.helmetStyle ? `helmet_${spec.helmetStyle}` : "helmet", finish, head);
    if (spec.style === "mx" || spec.style === "adv") part(model, "peak", finish, head);

    const base = new THREE.Vector3(0, spec.y, spec.z);
    const grip = bike.places.get("grip");
    const peg = bike.places.get("peg");
    if (!grip || !peg) throw new Error("bike lacks its grip or peg mark");
    const limbs = {};
    for (const side of [-1, 1]) {
      const shoulder = up.clone().multiplyScalar(0.165).setX(side * 0.172);
      const hand = new THREE.Vector3(side * grip.x, grip.y, grip.z).sub(base);
      const elbow = joint(shoulder, hand, LENGTHS.upper_arm, LENGTHS.forearm, new THREE.Vector3(side * (0.5 + spec.elbowOut * 4), -0.7, -0.3));
      const bend = elbow.clone().sub(shoulder.clone().add(hand).multiplyScalar(0.5)).normalize();
      const upper = limb(model, "upper_arm", finish, rider, shoulder, elbow, bend);
      const lower = limb(model, "forearm", finish, rider, elbow, hand, bend);
      const glove = part(model, "glove", finish, rider);
      glove.position.copy(hand);

      // The boot stands on the peg; the shin comes down into its ankle
      const sole = new THREE.Vector3(side * peg.x, peg.y + 0.05, peg.z).sub(base);
      const ankle = sole.clone().add(new THREE.Vector3(0, 0.062, -0.022));
      const hip = up.clone().multiplyScalar(-0.17).setX(side * 0.09);
      const knee = joint(hip, ankle, LENGTHS.thigh, LENGTHS.shin, new THREE.Vector3(side * (0.06 + spec.kneeOut * 2), 0.3, 1));
      const fold = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5)).normalize();
      const thigh = limb(model, "thigh", finish, rider, hip, knee, fold);
      limb(model, "shin", finish, rider, knee, ankle, fold);
      const boot = part(model, "boot", finish, rider);
      boot.position.copy(sole);
      boot.rotation.x = 0.1;

      limbs[side] = { upper, lower, thigh };
    }
    return { rider, helmet, visor: meshOf(helmet, wear.visor), limbs };
  }

  // Puts the modelled bike and rider in the vehicle's group in place of
  // everything the procedural builder put there
  function swap(vehicle, bike, riderModel) {
    const group = vehicle.group;
    const palette = vehicle.palette;
    const before = [...group.children];
    const kept = new Set(Object.values(palette).filter((value) => value && value.isMaterial));
    const finish = finishes(vehicle);

    // Built whole before anything is removed: a model that lacks a part
    // throws here and the procedural bike stays as it was
    const fresh = new THREE.Group();
    const body = part(bike, "body", finish, fresh);
    const built = {
      rearWheel: part(bike, "wheel_rear", finish, fresh),
      frontWheel: part(bike, "wheel_front", finish, fresh),
      rearDisc: part(bike, "disc_rear", finish, fresh),
      frontDisc: part(bike, "disc_front", finish, fresh),
      leftFork: part(bike, "fork_left", finish, fresh),
      rightFork: part(bike, "fork_right", finish, fresh),
      handlebar: part(bike, "handlebar", finish, fresh),
    };
    // The dirt bike carries no headlight, modelled or procedural
    if (bike.meshes.has("headlight")) built.headlight = part(bike, "headlight", finish, fresh);
    // The lens Vehicle.updateMesh lights under braking, on a material of its own
    const lens = new THREE.MeshStandardMaterial({ color: 0xc40b0b, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.15, metalness: 0.2, vertexColors: true });
    built.brakeLight = part(bike, "brake_light", () => lens, fresh);
    const frame = meshOf(body, palette.paint);
    if (!frame) throw new Error("bike body has no painted part");
    const seated = seat(vehicle.riderSpec, bike, riderModel);

    // The new parts carry on from where the old ones were in their motion
    seated.rider.position.copy(vehicle.rider.position);
    seated.rider.rotation.copy(vehicle.rider.rotation);
    built.rearWheel.rotation.copy(vehicle.rearWheel.rotation);
    built.frontWheel.rotation.copy(vehicle.frontWheel.rotation);
    // Only the spin: the procedural disc is a cylinder stood on its side by a
    // quarter turn about z, which would lay the modelled disc flat
    built.rearDisc.rotation.x = vehicle.rearDisc.rotation.x;
    built.frontDisc.rotation.x = vehicle.frontDisc.rotation.x;
    // The rider select may have put a flat material on every part by now
    const lit = vehicle.brakeLight.material;
    if (lit.emissive) {
      lens.emissive.copy(lit.emissive);
      lens.emissiveIntensity = lit.emissiveIntensity;
    }

    for (const child of before) {
      group.remove(child);
      child.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        if (!kept.has(object.material)) object.material.dispose();
      });
    }
    group.add(...fresh.children, seated.rider);

    Object.assign(vehicle, built, {
      frame,
      fuelTank: frame,
      rider: seated.rider,
      helmet: seated.helmet,
      visor: seated.visor,
      leftArm: seated.limbs[-1].upper,
      rightArm: seated.limbs[1].upper,
      leftForearm: seated.limbs[-1].lower,
      rightForearm: seated.limbs[1].lower,
      leftLeg: seated.limbs[-1].thigh,
      rightLeg: seated.limbs[1].thigh,
      modelled: true,
    });
    if (vehicle.onModel) vehicle.onModel(vehicle);
  }

  // Swaps the vehicle's procedural model for the modelled one. Returns true
  // if it did so at once, otherwise a promise of whether it did in the end
  // (false: a file failed, the vehicle was torn down first, or the swap is
  // held for the next reset because the bike is being ridden).
  function dress(vehicle) {
    const url = file(vehicle);
    const attempt = () => {
      try {
        swap(vehicle, arrived.get(url), arrived.get(RIDER));
        return true;
      } catch (error) {
        console.error(`BikeModels: ${vehicle.character.id} keeps its procedural model:`, error);
        return false;
      }
    };
    if (arrived.has(url) && arrived.has(RIDER)) return attempt();
    return Promise.all([load(url), load(RIDER)]).then(() => {
      if (!vehicle.group.parent) return false;
      // update() has run: the bike is on the road in front of the player
      if (vehicle.prevRenderPos) {
        vehicle.modelWaiting = attempt;
        return false;
      }
      return attempt();
    }).catch((error) => {
      console.error(`BikeModels: ${vehicle.character.id} keeps its procedural model:`, error);
      return false;
    });
  }

  // Finishes every crew bike shares; only its paint and its rider's kit are its own
  const shared = new Map();

  // A touring-crew rider's bike (AIMotorcycle) as the low-detail sport bike
  // in its own colour, with the modelled rider in its own kit. It keeps what
  // AIMotorcycle drives: the wheels it spins, the frame it flashes on a
  // collision and the lens it lights under braking. Geometry is shared by
  // the whole crew. Only at once, or before the bike first moves: a bike on
  // the road keeps the model it has until Traffic rebuilds the crew.
  function crew(bike) {
    const attempt = () => {
      try {
        const model = arrived.get(CREW);
        const group = bike.bikeGroup;
        const paint = bike.frame.material.clone();
        paint.color.setHex(bike.color);
        paint.vertexColors = true;
        const finish = (source) => {
          if (source.name === "paint") return paint;
          if (!shared.has(source.name)) {
            const material = source.clone();
            if (source.name === "paint_dark") material.color.setHex(0x16161a);
            if (source.name === "glass") Object.assign(material, { transparent: true, opacity: 0.32 });
            if (source.name === "headlight") Object.assign(material, { emissive: new THREE.Color(0xffffee), emissiveIntensity: 0.85 });
            material.vertexColors = true;
            shared.set(source.name, material);
          }
          return shared.get(source.name);
        };
        const fresh = new THREE.Group();
        const body = part(model, "body", finish, fresh);
        const rearWheel = part(model, "wheel_rear", finish, fresh);
        const frontWheel = part(model, "wheel_front", finish, fresh);
        const lens = bike.brakeLight.material.clone();
        lens.vertexColors = true;
        const brakeLight = part(model, "brake_light", () => lens, fresh);
        const frame = meshOf(body, paint);
        if (!frame) throw new Error("crew bike has no painted part");
        const spec = { ...CREW_POSE, suitColor: bike.suitColor, suitAccent: bike.color, helmetColor: bike.helmetColor, helmetAccent: bike.color };
        const seated = seat(spec, model, arrived.get(RIDER));
        seated.rider.position.set(0, spec.y, spec.z);
        rearWheel.rotation.copy(bike.rearWheel.rotation);
        frontWheel.rotation.copy(bike.frontWheel.rotation);

        for (const child of [...group.children]) {
          group.remove(child);
          child.traverse((object) => {
            if (!object.isMesh) return;
            object.geometry.dispose();
            object.material.dispose();
          });
        }
        group.add(...fresh.children, seated.rider);
        Object.assign(bike, { frame, rearWheel, frontWheel, brakeLight, rider: seated.rider, helmet: seated.helmet, visor: seated.visor, modelled: true });
        return true;
      } catch (error) {
        console.error(`BikeModels: ${bike.riderName} keeps the procedural bike:`, error);
        return false;
      }
    };
    if (arrived.has(CREW) && arrived.has(RIDER)) return attempt();
    return Promise.all([load(CREW), load(RIDER)]).then(() => {
      if (!bike.bikeGroup.parent || bike.wheelRotation) return false;
      return attempt();
    }).catch((error) => {
      console.error(`BikeModels: ${bike.riderName} keeps the procedural bike:`, error);
      return false;
    });
  }

  return { dress, crew, preload, file, MODELS, BIKES, RIDER, CREW, LENGTHS };
})();

// In the page the downloads start with the menu; a test loads what it needs
if (typeof window !== "undefined" && typeof fetch === "function") BikeModels.preload();
