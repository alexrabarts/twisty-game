// The Blender-made bikes and rider (tools/blender/bike_*.py, rider.py and
// tools/blender/bikes, built into assets/bikes and assets/bikes/detail) in
// place of the parts Vehicle builds from primitives. Vehicle.createMesh
// builds its procedural model first, which stands in while the file loads,
// and then calls BikeModels.dress(): with the files already in, the swap is
// immediate; otherwise it happens when they arrive, or at the next reset if
// the bike is being ridden by then. A file that fails leaves the procedural
// model. Only the files of a bike that is shown are fetched: nothing loads
// with the menu, and the rider select fetches the bike it shows.
//
// The swap keeps Vehicle's contract: the same named parts (wheels, discs,
// forks, bar, lights, rider and limbs), the same paint material on
// this.frame for the crash and wheelie tints, and the rider seated from the
// bike's own grip, peg and seat marks. A detailed bike brings its own axles
// (vehicle.axles), which the wheel spin and the wheelie pivot read, its own
// colours and its own luggage. Physics, handling and the camera read none of it.
const BikeModels = (() => {
  // The file of each procedural kind of bike (Vehicle.BIKES). These were
  // written with +x on the rider's right, so they are mirrored like the
  // procedural bike (Vehicle.mirrorParts).
  const MODELS = {
    sport: "assets/bikes/sport.glb",
    adventure: "assets/bikes/adventure.glb",
    scooter: "assets/bikes/scooter.glb",
    dirt: "assets/bikes/dirt.glb",
    naked: "assets/bikes/naked.glb",
  };
  const KINDS = Object.fromEntries(Object.entries(MODELS).map(([id, file]) => [id, { id, file, mirror: true }]));
  // The file each character's first bike is read from, by character id
  const BIKES = Object.fromEntries(CHARACTERS.map((character) => [character.id, entry(Vehicle.bikeOf(character)).file]));
  const RIDER = "assets/bikes/rider.glb";
  // The sport bike at a fifth of the detail, for the touring crew (js/traffic.js)
  const CREW = "assets/bikes/crew.glb";
  // How a crew rider sits it: the tuck Vehicle.buildSportBike gives its rider
  const CREW_POSE = { y: 1.06, z: -0.08, torsoLean: 0.72, style: "race", elbowOut: 0.05, kneeOut: 0.06 };
  // Joint to joint, as tools/blender/rider.py models each limb
  const LENGTHS = { upper_arm: 0.31, forearm: 0.3, thigh: 0.42, shin: 0.42 };
  // Glow of the lit materials, which the reader does not take from the file
  const GLOW = { signal: [0x9a5500, 0.4], reflector: [0x550000, 0.5] };
  // A detailed bike's own colour on these, and the lighting of the palette's
  // material of that name (the lit lens, the see-through screen, the dash)
  const LIT = ["headlight", "glass", "dash"];
  // Beyond this many metres from the camera a detailed bike draws its lod1
  const FAR = 30;
  // Where the hip sits over a seat mark (the top of the seat): the pelvis
  // and the seat's padding under it
  const HIP = 0.12;

  // What is known of a bike, by BIKE_MODELS id or kind
  function entry(id) {
    return BIKE_MODELS[id] || KINDS[id] || KINDS.sport;
  }

  // Parsed files, once they are in and made ready (prepare)
  const arrived = new Map();

  function load(url) {
    return SceneAssets.loadModel(url).then((model) => {
      if (!arrived.has(url)) arrived.set(url, url === RIDER ? model : prepare(model, url));
      return arrived.get(url);
    });
  }

  function file(vehicle) {
    return entry(vehicle.model || vehicle.bike).file;
  }

  // Starts the downloads a ride needs: the rider, the crew's bike and each
  // character's first bike, or the bikes named. The menu calls none of it.
  function preload(ids = CHARACTERS.map((character) => Vehicle.bikeOf(character))) {
    const urls = new Set([RIDER, CREW, ...ids.map((id) => entry(id).file)]);
    return Promise.all([...urls].map((url) => load(url).catch((error) => {
      console.error(`BikeModels: ${url} did not load; its bike keeps the procedural model:`, error);
      return null;
    })));
  }

  // A bike file as its levels of detail ([lod0, lod1], or the file alone
  // when it has no groups), each { meshes, places }, done once per file and
  // in place: mirrored where its entry says so, and each wheel's pivot moved
  // onto its axle (the middle of its tyre), where a file put it elsewhere
  function prepare(model, url) {
    const known = [...Object.values(BIKE_MODELS), ...Object.values(KINDS), { file: CREW, mirror: true }].find((bike) => bike.file === url);
    const levels = model.groups && model.groups.has("lod0") ? ["lod0", "lod1"].filter((name) => model.groups.has(name)).map((name) => model.groups.get(name)) : [model];
    for (const level of levels) {
      if (known && known.mirror) mirror(level);
      for (const name of ["wheel_rear", "wheel_front"]) centre(level, name);
    }
    return { levels, url };
  }

  // A level's geometry and places mirrored across x, its triangles turned
  // back to face outward
  function mirror(level) {
    const done = new Set();
    for (const primitives of level.meshes.values()) {
      for (const { geometry } of primitives) {
        if (done.has(geometry)) continue;
        done.add(geometry);
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) position.setX(i, -position.getX(i));
        const normal = geometry.attributes.normal;
        if (normal) {
          const array = normal.array;
          const limit = array instanceof Int8Array ? 127 : array instanceof Int16Array ? 32767 : Infinity;
          for (let i = 0; i < normal.count; i++) array[i * normal.itemSize] = Math.min(limit, -array[i * normal.itemSize]);
        }
        const index = geometry.index;
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            const b = index.getX(i + 1);
            index.setX(i + 1, index.getX(i + 2));
            index.setX(i + 2, b);
          }
        } else {
          for (const attribute of Object.values(geometry.attributes)) {
            const size = attribute.itemSize;
            const array = attribute.array;
            for (let i = 0; i < attribute.count; i += 3) {
              for (let c = 0; c < size; c++) {
                const t = array[(i + 1) * size + c];
                array[(i + 1) * size + c] = array[(i + 2) * size + c];
                array[(i + 2) * size + c] = t;
              }
            }
          }
        }
        position.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      }
    }
    for (const place of level.places.values()) place.x = -place.x;
  }

  // The wheel's pivot onto the middle of its tyre, its geometry moved the other way
  function centre(level, name) {
    const primitives = level.meshes.get(name);
    if (!primitives) return;
    const place = level.places.get(name);
    const box = new THREE.Box3();
    for (const { geometry } of primitives) box.union(geometry.boundingBox);
    const mid = box.getCenter(new THREE.Vector3());
    if (Math.abs(mid.y) < 1e-4 && Math.abs(mid.z) < 1e-4) return;
    for (const { geometry } of primitives) {
      geometry.translate(0, -mid.y, -mid.z);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
    place.y += mid.y;
    place.z += mid.z;
  }

  // A wheel's axle and radius, [y, z, radius], from the drawn level
  function axle(level, name) {
    const box = new THREE.Box3();
    for (const { geometry } of level.meshes.get(name)) box.union(geometry.boundingBox);
    const place = level.places.get(name);
    return [place.y, place.z, (box.max.y - box.min.y) / 2];
  }

  const camel = (name) => name.replace(/_(.)/g, (match, letter) => letter.toUpperCase());

  // One material per name for one bike. On a procedural kind's file the
  // character's paint, its dark shade and its accent are the palette's own
  // (so Vehicle's tints still reach them); the palette's other finishes are
  // used where a name matches, and anything else is the file's colour. A
  // detailed bike keeps every colour of its file, in materials of its own
  // (its paint is the one the tints reach), lit as the palette lights the
  // headlight, the screen and the dash.
  function finishes(vehicle, keep) {
    const palette = vehicle.palette;
    const made = new Map();
    return (source) => {
      const name = source.name;
      if (!made.has(name)) {
        let material = keep ? null : name === "seat" ? palette.leather : palette[camel(name)];
        if (!material || !material.isMaterial) {
          material = source.clone();
          const lit = keep && LIT.includes(name) ? palette[name] : null;
          if (lit) {
            material.emissive.copy(lit.emissive);
            material.emissiveIntensity = lit.emissiveIntensity;
            material.transparent = lit.transparent;
            material.opacity = lit.opacity;
            material.side = lit.side;
          }
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

  // A node of one level as one object at the node's place: the mesh itself
  // when it has one material, a group of meshes when it has several
  function node(level, name, finish) {
    const primitives = level.meshes.get(name);
    if (!primitives) throw new Error(`model lacks the part ${name}`);
    const meshes = primitives.map(({ geometry, material }) => {
      const mesh = new THREE.Mesh(geometry, finish(material));
      mesh.castShadow = !mesh.material.transparent;
      mesh.receiveShadow = true;
      return mesh;
    });
    const object = meshes.length === 1 ? meshes[0] : new THREE.Group().add(...meshes);
    object.name = name;
    object.position.copy(level.places.get(name));
    return object;
  }

  // A part of a bike file in `parent`: its first level alone, or every level
  // under one THREE.LOD (which the renderer switches by the distance to the
  // camera) at the first level's place. `single` keeps the first level
  // alone, for a part whose material Vehicle reads off it (the brake lens).
  function part(model, name, finish, parent, single = false) {
    const levels = model.levels || [model];
    const near = node(levels[0], name, finish);
    let object = near;
    if (!single && levels.length > 1 && levels[1].meshes.has(name)) {
      object = new THREE.LOD();
      object.name = name;
      object.position.copy(near.position);
      near.position.set(0, 0, 0);
      const far = node(levels[1], name, finish);
      far.position.sub(object.position);
      object.addLevel(near, 0);
      object.addLevel(far, FAR);
    }
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

  const joint = Vehicle.joint;

  // The rider, seated where Vehicle.buildVariantRider seats its capsules:
  // the same torso lean, hands on the bike's grips and feet on its pegs (the
  // model's own marks). Elbows and knees fall where limbs of a fixed length
  // put them, rather than midway, so an arm or a leg is not shrunk to fit.
  function seat(spec, bike, model) {
    const level = bike.levels ? bike.levels[0] : bike;
    const colour = (hex, roughness, metalness, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, vertexColors: true, ...extra });
    // Gear a spec leaves out takes the colour that part had before it was
    // a material of its own (Vehicle.buildVariantRider)
    const glove = spec.gloveColor ?? 0x101014;
    const pantsAccent = spec.pantsAccent ?? spec.suitAccent;
    const visor = spec.visorColor ?? 0x0e1218;
    const wear = {
      suit: colour(spec.suitColor, spec.suitRoughness ?? 0.85, 0),
      suit_accent: colour(spec.suitAccent, 0.6, 0.15),
      suit_trim: colour(spec.suitTrim ?? spec.suitAccent, 0.6, 0.15),
      suit_patch: colour(spec.suitPatch ?? spec.suitAccent, 0.6, 0.15),
      glove: colour(glove, 0.9, 0),
      glove_accent: colour(spec.gloveAccent ?? glove, 0.8, 0.05),
      pants: colour(spec.pantsColor ?? spec.suitColor, 0.85, 0),
      pants_accent: colour(pantsAccent, 0.6, 0.15),
      pants_trim: colour(spec.pantsTrim ?? pantsAccent, 0.6, 0.15),
      boot: colour(spec.bootColor ?? glove, 0.9, 0),
      boot_accent: colour(spec.bootAccent ?? spec.suitAccent, 0.6, 0.15),
      sole: colour(0x0c0c0e, 0.9, 0),
      helmet: colour(spec.helmetColor, spec.helmetRoughness ?? 0.12, 0.35, { envMapIntensity: 1.8 }),
      helmet_accent: colour(spec.helmetAccent, 0.2, 0.4),
      helmet_trim: colour(spec.helmetTrim ?? spec.helmetAccent, 0.2, 0.45),
      backpack: colour(spec.backpackColor ?? spec.suitColor, 0.8, 0.05),
      neck: colour(spec.neckColor ?? spec.suitColor, 0.95, 0),
      visor: colour(visor, 0.06, 0.45, { envMapIntensity: 2.0 }),
      visor_accent: colour(spec.visorAccent ?? visor, 0.06, 0.45, { envMapIntensity: 2.0 }),
    };
    const finish = (source) => wear[source.name] || wear.suit;
    // A part in the cut the outfit names (`<part>_<style>`), under the part's
    // plain name, which is what the rest of the game finds it by
    const worn = (name, style, parent) => {
      const object = part(model, style ? `${name}_${style}` : name, finish, parent);
      object.name = name;
      return object;
    };
    // The rider's size against the model's. The hip stays on the seat: the
    // torso grows up from it, and the shoulders and the head go with it.
    const tall = (spec.build && spec.build.height) || 1;
    const wide = (spec.build && spec.build.width) || 1;
    const girth = 1 + (wide - 1) * 0.6;
    const rise = 0.17 * (tall - 1);

    const rider = new THREE.Group();
    rider.name = "rider";
    // A limb between two joints: its length along the line, its outer side
    // (the elbow, the kneecap) turned toward `out`
    const limb = (name, style, from, to, out) => {
      const object = worn(name, style, rider);
      const along = new THREE.Vector3().subVectors(to, from);
      const length = along.length();
      along.normalize();
      const front = out.clone().addScaledVector(along, -out.dot(along));
      if (front.lengthSq() < 1e-8) front.set(0, 0, 1).addScaledVector(along, -along.z);
      front.normalize();
      const across = new THREE.Vector3().crossVectors(along, front);
      object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, front));
      object.position.addVectors(from, to).multiplyScalar(0.5);
      object.scale.set(girth, length / LENGTHS[name], girth);
      return object;
    };
    const lean = spec.torsoLean;
    const up = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
    const ahead = new THREE.Vector3(0, -Math.sin(lean), Math.cos(lean));
    const onTorso = (object) => {
      object.rotation.x = lean;
      object.scale.set(wide, tall, 1 + (wide - 1) * 0.5);
      object.position.copy(up).multiplyScalar(rise);
    };
    onTorso(worn("torso", spec.torsoStyle, rider));
    if (spec.style === "race") onTorso(part(model, "hump", finish, rider));
    if (spec.backpackColor != null) onTorso(part(model, "backpack", finish, rider));
    if (spec.neckColor != null) onTorso(part(model, "neck", finish, rider));
    // A mark on the back of the jacket, for a kit that names one
    if (spec.backStyle) {
      const back = part(model, `back_${spec.backStyle}`, finish, rider);
      back.name = "back";
      onTorso(back);
    }

    // The head looks up the road rather than down the tank
    const head = new THREE.Group();
    head.name = "head";
    head.position.copy(up).multiplyScalar(0.375 * tall + rise).addScaledVector(ahead, 0.03);
    head.rotation.x = lean * 0.45;
    rider.add(head);
    const helmet = worn("helmet", spec.helmetStyle, head);
    if (spec.style === "mx" || spec.style === "adv") part(model, "peak", finish, head);

    const base = new THREE.Vector3(0, spec.y, spec.z);
    const grip = level.places.get("grip");
    const peg = level.places.get("peg");
    if (!grip || !peg) throw new Error("bike lacks its grip or peg mark");
    const limbs = {};
    const arms = {};
    const legs = {};
    for (const side of [-1, 1]) {
      const shoulder = up.clone().multiplyScalar(0.165 * tall + rise).setX(side * 0.172 * wide);
      // A mirrored file has its marks on the other side: either side will do
      const hand = new THREE.Vector3(side * Math.abs(grip.x), grip.y, grip.z).sub(base);
      const elbow = joint(shoulder, hand, LENGTHS.upper_arm * tall, LENGTHS.forearm * tall, new THREE.Vector3(side * (0.5 + spec.elbowOut * 4), -0.7, -0.3));
      const bend = elbow.clone().sub(shoulder.clone().add(hand).multiplyScalar(0.5)).normalize();
      const upper = limb("upper_arm", spec.upperArmStyle, shoulder, elbow, bend);
      const lower = limb("forearm", spec.forearmStyle, elbow, hand, bend);
      const glove = worn("glove", spec.gloveStyle, rider);
      glove.position.copy(hand);
      arms[side] = Vehicle.rigLimb({ root: shoulder, mid: elbow, end: hand, pieces: [[upper, "root", "mid"], [lower, "mid", "end"]], carried: { end: [glove] } });

      // The boot stands on the peg; the shin comes down into its ankle
      const sole = new THREE.Vector3(side * Math.abs(peg.x), peg.y + 0.05, peg.z).sub(base);
      const ankle = sole.clone().add(new THREE.Vector3(0, 0.062, -0.022));
      const hip = up.clone().multiplyScalar(-0.17).setX(side * 0.09 * wide);
      const knee = joint(hip, ankle, LENGTHS.thigh * tall, LENGTHS.shin * tall, new THREE.Vector3(side * (0.06 + spec.kneeOut * 2), 0.3, 1));
      const fold = knee.clone().sub(hip.clone().add(ankle).multiplyScalar(0.5)).normalize();
      const thigh = limb("thigh", spec.thighStyle, hip, knee, fold);
      const shin = limb("shin", spec.shinStyle, knee, ankle, fold);
      const boot = worn("boot", spec.bootStyle, rider);
      boot.position.copy(sole);
      boot.rotation.x = 0.1;

      limbs[side] = { upper, lower, thigh };
      legs[side] = Vehicle.rigLimb({ rider, root: hip, mid: knee, end: ankle, pieces: [[thigh, "root", "mid"], [shin, "mid", "end"]], carried: { end: [boot] } });
    }
    if (spec.scarf != null) {
      const scarf = Vehicle.buildScarf(spec.scarf, lean, 0.27 * tall + rise);
      scarf.traverse((o) => {
        if (!o.isMesh) return;
        // Unshaded occlusion, as the rider's own parts carry baked
        const count = o.geometry.attributes.position.count;
        o.geometry.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(count * 3).fill(255), 3, true));
        o.material.vertexColors = true;
      });
      rider.add(scarf);
    }
    return { rider, helmet, visor: meshOf(helmet, wear.visor), limbs, arms, legs };
  }

  // A detailed bike's rider: the character's spec in the bike's own pose,
  // the hip set on the seat (the file's seat mark, or the entry's), the
  // hands and feet on its grips and pegs as for every bike
  function pose(vehicle, bike) {
    const known = BIKE_MODELS[vehicle.model];
    if (!known) return vehicle.riderSpec;
    const spec = { ...vehicle.riderSpec, ...known.pose };
    const level = bike.levels[0];
    const mark = level.places.get("seat");
    const [top, back] = mark ? [mark.y, mark.z] : known.seat;
    if (top === undefined) throw new Error(`${vehicle.model} has no seat mark and no seat in its entry`);
    const lean = spec.torsoLean;
    spec.y = top + HIP + Math.cos(lean) * 0.17;
    spec.z = back + Math.sin(lean) * 0.17;
    const base = new THREE.Vector3(0, spec.y, spec.z);
    spec.hand = level.places.get("grip").clone().sub(base).toArray();
    spec.foot = level.places.get("peg").clone().sub(base).toArray();
    return spec;
  }

  // Puts the modelled bike and rider in the vehicle's group in place of
  // everything the procedural builder put there
  function swap(vehicle, bike, riderModel) {
    const group = vehicle.group;
    const palette = vehicle.palette;
    const known = entry(vehicle.model || vehicle.bike);
    const keep = !!known.keepFileColours;
    const level = bike.levels[0];
    const before = [...group.children];
    const kept = new Set(Object.values(palette).filter((value) => value && value.isMaterial));
    const finish = finishes(vehicle, keep);

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
    if (level.meshes.has("headlight")) built.headlight = part(bike, "headlight", finish, fresh);
    // Luggage is drawn on the bikes whose entry shows it, and can be hidden
    if (level.meshes.has("luggage")) {
      built.luggage = part(bike, "luggage", finish, fresh);
      built.luggage.visible = !!known.luggage;
    }
    // The lens Vehicle.updateMesh lights under braking, on a material of its own
    const lens = new THREE.MeshStandardMaterial({ color: 0xc40b0b, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.15, metalness: 0.2, vertexColors: true });
    built.brakeLight = part(bike, "brake_light", () => lens, fresh, true);
    const painted = level.meshes.get("body").find((primitive) => primitive.material.name === "paint");
    const paint = keep ? painted && finish(painted.material) : palette.paint;
    const frame = paint && meshOf(body, paint);
    if (!frame) throw new Error("bike body has no painted part");
    const spec = pose(vehicle, bike);
    const seated = seat(spec, bike, riderModel);
    // A detailed bike turns on its own axles; a procedural kind's file was
    // made to the procedural bike's
    const axles = BIKE_MODELS[vehicle.model] ? { rear: axle(level, "wheel_rear"), front: axle(level, "wheel_front") } : vehicle.axles;

    // The new parts carry on from where the old ones were in their motion;
    // a detailed bike's rider sits where its own seat puts him
    const base = new THREE.Vector3(0, spec.y, spec.z);
    seated.rider.position.copy(vehicle.rider.position).add(base).sub(vehicle.riderBasePos || base);
    seated.rider.rotation.copy(vehicle.rider.rotation);
    // The front end's steer and spin are put back by Vehicle.steerFront from
    // the parts' rest pose (Vehicle.rigSteering, below)
    built.rearWheel.rotation.copy(vehicle.rearWheel.rotation);
    // Only the spin: the procedural disc is a cylinder stood on its side by a
    // quarter turn about z, which would lay the modelled disc flat
    built.rearDisc.rotation.x = vehicle.rearDisc.rotation.x;
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

    if (keep) {
      // The file's paint is the bike's colour from here on: the tints work
      // from it and a reset restores it
      palette.paint = paint;
      vehicle.bikeColor = `0x${paint.color.getHexString()}`;
      vehicle.baseColorRGB = { r: paint.color.r, g: paint.color.g, b: paint.color.b };
    }
    if (vehicle.riderBasePos) vehicle.riderBasePos.copy(base);
    Object.assign(vehicle, built, {
      frame,
      fuelTank: frame,
      axles,
      riderSpec: spec,
      rider: seated.rider,
      helmet: seated.helmet,
      visor: seated.visor,
      // +x is the rider's left (Vehicle.LEFT)
      leftArm: seated.limbs[1].upper,
      rightArm: seated.limbs[-1].upper,
      leftForearm: seated.limbs[1].lower,
      rightForearm: seated.limbs[-1].lower,
      leftLeg: seated.limbs[1].thigh,
      rightLeg: seated.limbs[-1].thigh,
      arms: seated.arms,
      legs: seated.legs,
      footPlaced: false,
      modelled: true,
    });
    vehicle.rigSteering();
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

  return { dress, crew, preload, file, entry, MODELS, BIKES, RIDER, CREW, LENGTHS, FAR };
})();
