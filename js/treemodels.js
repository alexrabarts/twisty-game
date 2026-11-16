// The Blender-made trees and bushes (tools/blender/tree_*.py, built into
// assets/trees) in place of the ones Environment builds from primitives.
// SceneAssets.dress() calls TreeModels.dress() at the end of every build: the
// leg starts with its procedural forest, and when the files arrive each
// instance is drawn as one of a few modelled shapes instead.
//
// Nothing about where a tree stands changes. Every instance keeps the matrix
// and the tint createForest gave it, so the solid trunks in
// environment.boulders stay where the drawn trunks are; an instance only
// moves from the one procedural mesh of its kind to the mesh of the shape a
// hash of its position picks. A file that fails leaves its kind as it was.
const TreeModels = (() => {
  const FILES = {
    conifer: "assets/trees/conifer.glb",
    broadleaf: "assets/trees/broadleaf.glb",
    bush: "assets/trees/bush.glb",
  };
  // The shapes of a kind, by node name, and the share of the instances each
  // takes. A snowed-in leg uses the node of the same name with `_snow` added.
  const SHAPES = {
    conifer: { conifer_spruce: 0.45, conifer_fir: 0.33, conifer_pine: 0.22 },
    broadleaf: { broadleaf_oak: 0.4, broadleaf_beech: 0.28, broadleaf_ash: 0.32 },
    bush: { bush_round: 0.55, bush_low: 0.45 },
  };
  // High-pass keeps its procedural trees: the frozen golden binds the leg's
  // mesh and triangle counts and every mesh's vertices (tests/golden,
  // .agent/system/world.md "Golden bindings"), as it keeps its rocks.
  const KEPT = new Set([4]);
  // The two greens Environment gives its roadside bushes, as tints of the
  // modelled bush's own colours: the darker one and the lighter one
  const BUSH_TONES = [0xbcd2c2, 0xffffff];

  // A position as a number from 0 to 1, the same on every build
  function spread(x, z, salt) {
    let h = Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(z * 16), 19349663) ^ Math.imul(salt, 83492791);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  // The shapes of a kind in a file, each with the share it takes
  function shapes(model, kind, snowy) {
    return Object.entries(SHAPES[kind]).map(([name, share]) => {
      const node = snowy ? `${name}_snow` : name;
      const primitives = model.meshes.get(node);
      if (!primitives) throw new Error(`${FILES[kind]} lacks the shape ${node}`);
      return { name: node, share, geometry: primitives[0].geometry };
    });
  }

  function choose(list, at) {
    let sum = 0;
    for (let n = 0; n < list.length; n++) {
      sum += list[n].share;
      if (at < sum) return n;
    }
    return list.length - 1;
  }

  function tagged(env) {
    const found = { conifer: [], broadleaf: [], bush: [] };
    env.scene.traverse((object) => {
      const plant = object.isMesh && object.userData.plant;
      if (plant && found[plant.kind]) found[plant.kind].push(object);
    });
    return found;
  }

  function attached(object, env) {
    for (let node = object; node; node = node.parent) if (node === env.scene) return true;
    return false;
  }

  // One build's copy of a shape: a leg that is torn down frees its own
  // buffers and leaves the parsed file to the next build
  const copy = (geometry) => geometry.clone();

  function material(kind) {
    return new THREE.MeshStandardMaterial({
      name: `modelled-${kind}`,
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.5,
      // A conifer's boughs are open skirts, seen from under as well
      side: kind === "conifer" ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  // The one instanced mesh of a kind becomes one per shape, each instance
  // with the matrix and the tint it had
  function dressForest(env, forest, model) {
    const { kind, snowy } = forest.userData.plant;
    const list = shapes(model, kind, snowy);
    const groups = list.map(() => []);
    const matrix = new THREE.Matrix4();
    for (let n = 0; n < forest.count; n++) {
      forest.getMatrixAt(n, matrix);
      groups[choose(list, spread(matrix.elements[12], matrix.elements[14], 1))].push(n);
    }
    const shared = material(kind);
    const tint = new THREE.Color();
    const made = [];
    groups.forEach((instances, shape) => {
      if (!instances.length) return;
      const mesh = new THREE.InstancedMesh(copy(list[shape].geometry), shared, instances.length);
      instances.forEach((from, to) => {
        forest.getMatrixAt(from, matrix);
        mesh.setMatrixAt(to, matrix);
        forest.getColorAt(from, tint);
        mesh.setColorAt(to, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.name = forest.name;
      mesh.castShadow = forest.castShadow;
      mesh.receiveShadow = forest.receiveShadow;
      // As the procedural mesh: it spans the leg, so its bounds say nothing
      mesh.frustumCulled = false;
      mesh.userData.skipCulling = true;
      mesh.userData.modelled = "trees";
      mesh.userData.shape = list[shape].name;
      forest.parent.add(mesh);
      made.push(mesh);
    });
    forest.parent.remove(forest);
    forest.geometry.dispose();
    return { trees: forest.count, meshes: made.length, old: forest.material };
  }

  // A bush stays the mesh it was, seated where it was, with a modelled shape
  // turned its own way round
  function dressBushes(env, bushes, model) {
    const snowy = bushes.some((bush) => bush.userData.plant.snowy);
    const list = shapes(model, "bush", snowy).map((shape) => ({ ...shape, geometry: copy(shape.geometry) }));
    const tones = new Map();
    const old = new Set();
    for (const bush of bushes) {
      // The snow is in the shape's colours, which a tint would green
      const tone = snowy ? 1 : bush.userData.plant.tone;
      if (!tones.has(tone)) {
        const made = material("bush");
        made.color.setHex(BUSH_TONES[tone]);
        tones.set(tone, made);
      }
      old.add(bush.geometry).add(bush.material);
      bush.geometry = list[choose(list, spread(bush.position.x, bush.position.z, 2))].geometry;
      bush.material = tones.get(tone);
      bush.rotation.y = spread(bush.position.x, bush.position.z, 3) * Math.PI * 2;
      bush.userData.modelled = "trees";
    }
    old.forEach((resource) => resource.dispose());
    return { bushes: bushes.length };
  }

  // Starts the downloads for the plants a leg has and swaps them when they
  // arrive. Null for a leg with none to swap; otherwise resolves to what was
  // swapped. Rejects only if every file failed.
  function dress(env) {
    if (KEPT.has(env.legIndex)) return null;
    const found = tagged(env);
    const kinds = Object.keys(found).filter((kind) => found[kind].length);
    if (!kinds.length) return null;
    const started = performance.now();
    const out = { trees: 0, bushes: 0, meshes: 0, errors: [], files: kinds.map((kind) => FILES[kind]) };
    const retired = new Set();
    return Promise.all(kinds.map((kind) => SceneAssets.loadModel(FILES[kind]).then((model) => {
      const plants = found[kind];
      if (!plants.every((plant) => attached(plant, env))) return;
      if (kind === "bush") {
        out.bushes += dressBushes(env, plants, model).bushes;
        return;
      }
      for (const forest of plants) {
        const swapped = dressForest(env, forest, model);
        out.trees += swapped.trees;
        out.meshes += swapped.meshes;
        retired.add(swapped.old);
      }
    }).catch((error) => {
      console.error(`TreeModels: the ${kind} of leg ${env.legIndex} kept its procedural shape:`, error);
      out.errors.push(`${kind}: ${error.message || error}`);
    }))).then(() => {
      // The two procedural meshes share a material: it goes when neither is left
      const kept = new Set();
      env.scene.traverse((object) => {
        if (object.isMesh) kept.add(object.material);
      });
      retired.forEach((old) => {
        if (!kept.has(old)) old.dispose();
      });
      out.ms = Math.round(performance.now() - started);
      return out;
    });
  }

  return { dress, FILES, SHAPES, KEPT };
})();
