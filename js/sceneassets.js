// Modelled scenery for the legs that have it: rocks, tunnel portals and the
// rock face's texture, built by the Blender scripts in tools/blender into
// assets/. Environment calls SceneAssets.dress() at the end of every build.
// The bikes and the rider (js/bikemodels.js) and the trees and bushes
// (js/treemodels.js) come through the same reader.
// The leg starts with its procedural dressing; when the files arrive the
// tagged procedural meshes (userData.dressing) are swapped for the models at
// the same places and sizes. Nothing here touches the ground, the physics or
// the solid obstacles, and a file that fails to load leaves its part as it was.
//
// The files are plain glTF binary with WebP textures, read by the small
// reader below rather than three's GLTFLoader: in r150 that loader is an ES
// module importing 'three' by bare name, which this script-tag page cannot
// resolve without an import map and a second copy of three.
const SceneAssets = (() => {
  // Per leg index. `cell` is the side in metres of the square that groups the
  // rock instances of one variant into one mesh, so far groups can be culled.
  const LEGS = {
    3: {
      rocks: "assets/gorge/rocks.glb",
      portal: "assets/gorge/portal.glb",
      // The tunnel opening the portal was modelled for (tools/blender/gorge_portal.py)
      opening: { halfWidth: 11, ceiling: 7.5 },
      // The face's detail (tools/blender/rockface_detail.py): `tile` is the
      // side in metres one copy covers, `tint` the stone that the face's
      // vertex colours shade. Any leg with a rock face can name the same files.
      rockFace: { map: "assets/rockface/detail.webp", normalMap: "assets/rockface/normal.webp", tile: 12, tint: 0xcbb8a6 },
      // The baked rocks are a light grey; this brings them to the face's stone
      rockTint: 0xb9a592,
      cell: 400,
    },
    6: {
      // Night-ride's village (tools/blender/village_houses.py, village_props.py)
      village: { houses: "assets/village/houses.glb", props: "assets/village/props.glb" },
    },
  };

  // Downloads are shared by every build of a leg (menu preview, ride, restart)
  const downloads = new Map();
  const bytes = new Map();

  function fetchBytes(url) {
    if (!downloads.has(url)) {
      downloads.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.arrayBuffer();
      }).then((buffer) => {
        bytes.set(url, buffer.byteLength);
        return buffer;
      }).catch((error) => {
        downloads.delete(url);
        throw error;
      }));
    }
    return downloads.get(url);
  }

  // Decoded as stored: normal and packed maps must not be colour-converted
  async function decodeImage(blob) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      } catch (error) {
        console.warn("SceneAssets: createImageBitmap failed, using an image element", error);
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  // A glTF binary as { meshes: name -> [{ geometry, material }], places: name
  // -> Vector3 }, one mesh entry per primitive (per material), in the shape
  // the Blender exporter writes: one node per mesh, no interleaving. A node
  // may carry a translation (its place: a part's pivot, or a bare named
  // point) and one scale for all its axes, never a rotation. Vertex colours (COLOR_0) are read as
  // the baked occlusion they hold and switch the material to use them.
  async function parseGlb(buffer, url) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${url}: not a glTF binary`);
    let json = null;
    let bin = null;
    for (let at = 12; at < buffer.byteLength;) {
      const length = view.getUint32(at, true);
      const type = view.getUint32(at + 4, true);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, length)));
      if (type === 0x004e4942) bin = at + 8;
      at += 8 + length;
    }
    if (!json || bin === null) throw new Error(`${url}: no JSON or binary chunk`);

    const slice = (index) => {
      const bufferView = json.bufferViews[index];
      return { offset: bin + (bufferView.byteOffset || 0), length: bufferView.byteLength, stride: bufferView.byteStride || 0 };
    };
    const accessor = (index) => {
      const def = json.accessors[index];
      const type = COMPONENTS[def.componentType];
      const { offset, stride } = slice(def.bufferView);
      const size = SIZES[def.type];
      const count = def.count * size;
      const start = offset + (def.byteOffset || 0);
      const packed = size * type.BYTES_PER_ELEMENT;
      // Copied out, so the geometry does not pin the whole file
      let array;
      if (!stride || stride === packed) {
        array = new type(buffer.slice(start, start + count * type.BYTES_PER_ELEMENT));
      } else {
        // One attribute padded out to its stride (byte normals, four bytes
        // apiece); a view that interleaves several attributes is not read
        if (stride < packed || stride % type.BYTES_PER_ELEMENT) throw new Error(`${url}: a stride of ${stride} is not read`);
        const padded = new type(buffer.slice(start, start + (def.count - 1) * stride + packed));
        const step = stride / type.BYTES_PER_ELEMENT;
        array = new type(count);
        for (let i = 0; i < def.count; i++) for (let c = 0; c < size; c++) array[i * size + c] = padded[i * step + c];
      }
      return new THREE.BufferAttribute(array, size, !!def.normalized);
    };
    const images = await Promise.all((json.images || []).map((def) => {
      const { offset, length } = slice(def.bufferView);
      return decodeImage(new Blob([new Uint8Array(buffer, offset, length)], { type: def.mimeType }));
    }));
    const texture = (ref, srgb) => {
      if (!ref) return null;
      const def = json.textures[ref.index];
      const source = def.extensions?.EXT_texture_webp?.source ?? def.source;
      const map = new THREE.Texture(images[source]);
      map.flipY = false;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = 2;
      if (srgb) map.encoding = THREE.sRGBEncoding;
      map.needsUpdate = true;
      return map;
    };
    const materials = (json.materials || []).map((def) => {
      const pbr = def.pbrMetallicRoughness || {};
      const packed = texture(pbr.metallicRoughnessTexture, false);
      const occlusion = def.occlusionTexture && pbr.metallicRoughnessTexture && def.occlusionTexture.index === pbr.metallicRoughnessTexture.index
        ? packed
        : texture(def.occlusionTexture, false);
      const material = new THREE.MeshStandardMaterial({
        name: def.name,
        color: new THREE.Color().fromArray(pbr.baseColorFactor || [1, 1, 1]),
        map: texture(pbr.baseColorTexture, true),
        normalMap: texture(def.normalTexture, false),
        roughnessMap: packed,
        metalnessMap: packed,
        aoMap: occlusion,
        roughness: pbr.roughnessFactor ?? 1,
        metalness: pbr.metallicFactor ?? 1,
        side: def.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      });
      // Tangents come from screen derivatives, which see glTF's v axis flipped
      if (material.normalMap) material.normalScale.set(1, -1);
      return material;
    });
    const meshes = new Map();
    const places = new Map();
    for (const node of json.nodes || []) {
      // One scale for all three axes is the unit of positions stored as whole
      // numbers (tools/blender/bike_kit.py, pack_colours); it is worked into them here
      const unit = node.scale ? node.scale[0] : 1;
      const even = !node.scale || (unit > 0 && node.scale[1] === unit && node.scale[2] === unit);
      if (node.rotation || node.matrix || !even) throw new Error(`${url}: node ${node.name} is turned or unevenly scaled, which is not read`);
      places.set(node.name, new THREE.Vector3().fromArray(node.translation || [0, 0, 0]));
      if (node.mesh === undefined) continue;
      meshes.set(node.name, json.meshes[node.mesh].primitives.map((primitive) => {
        const geometry = new THREE.BufferGeometry();
        const stored = accessor(primitive.attributes.POSITION);
        geometry.setAttribute("position", node.scale ? new THREE.BufferAttribute(Float32Array.from(stored.array, (value) => value * unit), 3) : stored);
        if (primitive.attributes.NORMAL !== undefined) geometry.setAttribute("normal", accessor(primitive.attributes.NORMAL));
        if (primitive.attributes.TEXCOORD_0 !== undefined) {
          geometry.setAttribute("uv", accessor(primitive.attributes.TEXCOORD_0));
          // three r150 reads the occlusion map through a second UV set
          geometry.setAttribute("uv2", geometry.attributes.uv);
        }
        if (primitive.attributes.COLOR_0 !== undefined) {
          geometry.setAttribute("color", accessor(primitive.attributes.COLOR_0));
          materials[primitive.material].vertexColors = true;
        }
        if (primitive.indices !== undefined) geometry.setIndex(accessor(primitive.indices));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return { geometry, material: materials[primitive.material] };
      }));
    }
    return { meshes, places };
  }

  const models = new Map();
  function loadModel(url) {
    if (!models.has(url)) {
      models.set(url, fetchBytes(url).then((buffer) => parseGlb(buffer, url)).catch((error) => {
        models.delete(url);
        throw error;
      }));
    }
    return models.get(url);
  }

  const pictures = new Map();
  function loadImage(url) {
    if (!pictures.has(url)) {
      pictures.set(url, fetchBytes(url).then((buffer) => decodeImage(new Blob([buffer], { type: "image/webp" }))).catch((error) => {
        pictures.delete(url);
        throw error;
      }));
    }
    return pictures.get(url);
  }

  // Integer hash of a position: which variant a rock gets, the same on every build
  function pick(x, z, count) {
    let h = Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(z * 16), 19349663);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h ^ (h >>> 15)) >>> 0) % count;
  }

  // Whether `object` still hangs in the scene of `env` (a leg torn down
  // before its files arrived must not get scenery added to the next leg)
  function attached(object, env) {
    for (let node = object; node; node = node.parent) if (node === env.scene) return true;
    return false;
  }

  function tagged(env, kinds) {
    const found = [];
    env.scene.traverse((object) => {
      if (object.isMesh && object.userData.dressing && kinds.includes(object.userData.dressing.kind)) found.push(object);
    });
    return found;
  }

  function discard(mesh) {
    mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }

  // Each procedural rock becomes one instance of a variant, with the rock's
  // own position, rotation and scale times the radius it was built with (a
  // variant has a mean radius of 1). Instances are grouped by variant and by
  // map cell, each group one InstancedMesh whose bounding sphere covers its
  // instances, so three's frustum culling drops groups out of view.
  function dressRocks(env, model, spec) {
    const variants = [...model.meshes.values()].map((parts) => parts[0]);
    const rocks = tagged(env, ["rock", "debris"]);
    if (!rocks.length || !rocks.every((rock) => attached(rock, env))) return { rocks: 0 };
    const groups = new Map();
    const matrix = new THREE.Matrix4();
    const radius = new THREE.Matrix4();
    let held = 0;
    for (const rock of rocks) {
      rock.updateWorldMatrix(true, false);
      const r = rock.userData.dressing.radius;
      matrix.copy(rock.matrixWorld).multiply(radius.makeScale(r, r, r));
      const at = new THREE.Vector3().setFromMatrixPosition(matrix);
      const variant = pick(at.x, at.z, variants.length);
      // A variant is not the procedural rock's shape: on a face it may stand
      // out where the procedural one did not, so it is sunk until the drawn
      // ground holds it, and left out where nothing does
      const hold = env.holdRock(matrix, variants[variant].geometry, rock.userData.seat);
      if (!hold) continue;
      matrix.copy(hold);
      held++;
      const key = `${variant}:${Math.floor(at.x / spec.cell)}:${Math.floor(at.z / spec.cell)}`;
      if (!groups.has(key)) groups.set(key, { variant, matrices: [], small: true });
      const group = groups.get(key);
      group.matrices.push(matrix.clone());
      // A rock too small to cast a visible shadow (as setupPerformanceCulling rules)
      if (matrix.getMaxScaleOnAxis() * variants[variant].geometry.boundingSphere.radius >= 1.2) group.small = false;
    }

    const material = variants[0].material.clone();
    material.color.set(spec.rockTint);
    const root = new THREE.Group();
    root.name = "modelled-rocks";
    const scale = new THREE.Vector3();
    for (const { variant, matrices, small } of groups.values()) {
      const source = variants[variant].geometry;
      // A geometry of its own (sharing the vertex data) to carry this group's bounds
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(source.index);
      const centre = new THREE.Vector3();
      matrices.forEach((m) => centre.add(scale.setFromMatrixPosition(m)));
      centre.divideScalar(matrices.length);
      let reach = 0;
      matrices.forEach((m) => {
        reach = Math.max(reach, scale.setFromMatrixPosition(m).distanceTo(centre) + m.getMaxScaleOnAxis() * source.boundingSphere.radius);
      });
      geometry.boundingSphere = new THREE.Sphere(centre, reach);
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, n) => mesh.setMatrixAt(n, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !small;
      mesh.receiveShadow = true;
      mesh.userData.skipCulling = true;
      mesh.userData.modelled = "rocks";
      root.add(mesh);
    }
    const violations = checkGrounding(env, groups, variants);
    rocks.forEach(discard);
    env.scene.add(root);
    return { rocks: rocks.length, placed: held, meshes: groups.size, violations };
  }

  // Each instance against the drawn ground (Terrain.clearance, the ribbon's
  // own triangles, folds of a leaning wall included), on its exact vertices:
  // its lowest point may stand at most 0.75 over the ground under it, and an
  // instance with no vertex clear of the ground is buried, which hides it,
  // and is counted too.
  function checkGrounding(env, groups, variants) {
    const violations = [];
    const point = new THREE.Vector3();
    const last = env.roadPath.length - 1;
    const clear = (p) => Terrain.clearance(env.terrain, env.terrainGeometry, p.x, p.y, p.z, 0, last);
    for (const { variant, matrices } of groups.values()) {
      const positions = variants[variant].geometry.attributes.position;
      for (const m of matrices) {
        const lowest = new THREE.Vector3(0, Infinity, 0);
        let shows = false;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(m);
          if (point.y < lowest.y) lowest.copy(point);
          if (!shows && clear(point) > 0.02) shows = true;
        }
        const hang = clear(lowest);
        if (hang > 0.75) {
          violations.push({ kind: "floating", x: lowest.x, z: lowest.z, delta: hang });
          console.warn(`⚠️ Floating object: modelled rock bottom y=${lowest.y.toFixed(2)} hovers ${hang.toFixed(2)} above the drawn ground at (${lowest.x.toFixed(1)}, ${lowest.z.toFixed(1)})`);
        } else if (!shows) {
          violations.push({ kind: "buried", x: lowest.x, z: lowest.z, delta: 0 });
        }
      }
    }
    if (violations.some((v) => v.kind === "floating")) console.error("❌ FLOATING OBJECTS DETECTED: modelled rocks hover above the terrain (see warnings above)");
    return violations;
  }

  // The modelled portal stands where each procedural one did, its own +Z
  // facing out of the tunnel along the road and its opening scaled to the
  // tunnel's. A wing wall runs along each side that goes on as a rock wall;
  // a side that drops away gets none.
  function dressPortals(env, model, opening) {
    const arch = model.meshes.get("portal_arch");
    const wing = model.meshes.get("portal_wing");
    if (!arch || !wing) throw new Error("portal.glb lacks portal_arch or portal_wing");
    const portals = tagged(env, ["portal"]);
    if (!portals.length || !portals.every((portal) => attached(portal, env))) return { portals: 0 };
    let count = 0;
    for (const portal of portals) {
      const spec = portal.userData.dressing;
      const group = new THREE.Group();
      group.name = "modelled-portals";
      for (const end of spec.ends) {
        const frame = new THREE.Group();
        frame.position.set(end.point.x, end.point.y, end.point.z);
        frame.rotation.y = end.point.heading + (end.facing > 0 ? 0 : Math.PI);
        frame.scale.set(spec.halfWidth / opening.halfWidth, spec.ceiling / opening.ceiling, 1);
        arch.forEach(({ geometry, material }) => frame.add(new THREE.Mesh(geometry, material)));
        // Local +X is the road's right when the portal faces along the road
        for (const [sign, wall] of [[-1, end.walls.left], [1, end.walls.right]]) {
          if (!wall) continue;
          const side = new THREE.Group();
          wing.forEach(({ geometry, material }) => side.add(new THREE.Mesh(geometry, material)));
          side.scale.x = sign * end.facing;
          frame.add(side);
        }
        frame.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.userData.modelled = "portal";
        });
        group.add(frame);
        count++;
      }
      portal.parent.add(group);
      discard(portal);
    }
    return { portals: count };
  }

  // The stone bridge of a converted leg (tools/blender/bridge_stone.py): one
  // node, bridge_span, modelled in the bridge's own frame (x across, y up from
  // the deck, z along) for a road 20 m wide and a span `MODEL_LENGTH` long; it
  // is stretched along the road to the span's own length. The water stays.
  const BRIDGE = { node: "bridge_span", length: 60, halfWidth: 10.9 };
  function dressBridge(env, model) {
    const span = model.meshes.get(BRIDGE.node);
    if (!span) throw new Error(`bridge.glb lacks ${BRIDGE.node}`);
    const old = tagged(env, ["bridge"]);
    if (!old.length || !old.every((mesh) => attached(mesh, env))) return { bridges: 0 };
    let bridges = 0;
    for (const group of new Set(old.map((mesh) => mesh.parent))) {
      const plan = group.userData.bridge;
      const frame = new THREE.Group();
      frame.name = "modelled-bridge";
      frame.scale.set(plan.inner / BRIDGE.halfWidth, 1, plan.length / BRIDGE.length);
      span.forEach(({ geometry, material }) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.modelled = "bridge";
        frame.add(mesh);
      });
      group.add(frame);
      old.filter((mesh) => mesh.parent === group).forEach(discard);
      bridges++;
    }
    return { bridges };
  }

  // The village's look. The models carry their colours in their vertices
  // (every board, stone and roof slab a face of its own shade, so nothing
  // tiles); the game adds what differs from house to house and what is lit.
  const VILLAGE = {
    // Limewash over the plaster, and paint on the shutters
    washes: [0xe4d8c2, 0xd8c4a2, 0xece6d8, 0xd6b898, 0xe0ccb8, 0xccd2c0],
    accents: [0x3f6a3a, 0x8a2e26, 0x3d5478, 0x7a6438, 0x355f58],
    // A window is lit or dark for the night. Lit glass and lamp glass are
    // brighter than the night's bloom threshold (js/graphics.js, 1.8), by
    // little: a window reads as lit, and has no halo over the street. These
    // are the shader's own values, not sRGB, and far from white: the tone
    // map takes a bright colour most of the way to white.
    lit: 0.6,
    glass: [[1.0, 0.27, 0.045], [1.0, 0.27, 0.045], [1.0, 0.36, 0.08], [1.0, 0.19, 0.025], [1.0, 0.22, 0.03]],
    glassGain: 2.4,
    dark: [0.006, 0.008, 0.012],
    lampGain: 2.7,
    // The most a vertex of the shining mesh can hold: its colours are stored as shares of this
    shine: 4,
    // Lamplight on the walls. There is no light in it: each vertex takes
    // what the lamps near it would give, and the material glows by that much.
    glow: 0xffb469,
    glowStrength: 1.6,
    lampReach: 6.5,
    lanternReach: 2.2,
    // Metres of garden wall one section is modelled for, and the order the sections come in
    section: 3,
    walls: ["wall_pier", "wall_plain", "wall_gate", "wall_plain", "wall_pier", "wall_trough", "wall_plain"],
  };

  // An sRGB value as the shader's linear one, and an sRGB hex as linear r, g, b
  const decode = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const decodeHex = (hex) => ({ r: decode(((hex >> 16) & 255) / 255), g: decode(((hex >> 8) & 255) / 255), b: decode((hex & 255) / 255) });

  // A number in 0..1 from two whole numbers, the same on every build
  function chance(a, b) {
    let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  // Every model of a village in the order it is laid: for each plot its
  // house then its lamp post, then the garden walls from each house to the
  // next on its side. Each item: the model's parts, its matrix from the set
  // piece's centre `origin`, its tint (seed, wash, accent, shade), the lamp
  // it adds (if any) and what it counts as (houses, lamps, walls). Which
  // house, its wash and its shutters come from a hash of the plot, not
  // rand(): no two neighbours and no two houses facing each other are the same.
  function villageLayout(env, plan, origin, houses, props) {
    const variants = [...houses.meshes.keys()].filter((name) => name.startsWith("house_")).sort();
    const post = props.meshes.get("lamp_post");
    const up = new THREE.Vector3(0, 1, 0);
    const turn = new THREE.Quaternion();
    // The frame of a plot on one side of the road at `at` (a road point, or
    // a place between two): x along the house fronts, z away from the road
    const frame = (at, sign, lateral, stretch = 1, flip = false) => {
      turn.setFromAxisAngle(up, at.heading + sign * Math.PI / 2);
      return new THREE.Matrix4().compose(new THREE.Vector3(...env.piecePoint(at, sign * lateral, 0, origin)), turn, new THREE.Vector3(flip ? -stretch : stretch, 1, 1));
    };
    const items = [];
    const sides = { [-1]: [], [1]: [] };
    plan.plots.forEach((plot) => {
      const row = sides[plot.sign];
      const name = variants[(row.length + (plot.sign > 0 ? Math.ceil(variants.length / 2) : 0)) % variants.length];
      const at = env.roadPath[plot.segment];
      const flip = chance(plot.segment, plot.sign + 5) < 0.5;
      items.push({
        kind: "houses", name, parts: houses.meshes.get(name), matrix: frame(at, plot.sign, plan.front, 1, flip),
        tint: {
          seed: plot.segment * 2 + (plot.sign > 0 ? 1 : 0),
          wash: decodeHex(VILLAGE.washes[Math.floor(chance(plot.segment, plot.sign + 11) * VILLAGE.washes.length)]),
          accent: decodeHex(VILLAGE.accents[Math.floor(chance(plot.segment, plot.sign + 23) * VILLAGE.accents.length)]),
        },
      });
      row.push({ at, half: houses.places.get(`${name}:right`).x });
      const lamp = frame(at, plot.sign, plan.lampLine);
      items.push({ kind: "lamps", name: "lamp_post", parts: post, matrix: lamp, tint: {}, light: { at: props.places.get("lamp_post:light").clone().applyMatrix4(frame(at, plot.sign, plan.lampLine)), reach: VILLAGE.lampReach } });
    });
    // Garden wall from each house to the next on its side, in whole sections
    const length = props.places.get("wall_plain:end").x;
    for (const sign of [-1, 1]) {
      sides[sign].forEach((house, n) => {
        const next = sides[sign][n + 1];
        if (!next) return;
        const along = (p, d) => ({ x: p.x + Math.sin(p.heading) * d, y: p.y, z: p.z + Math.cos(p.heading) * d, heading: p.heading });
        const from = along(house.at, house.half);
        const to = along(next.at, -next.half);
        const gap = Math.hypot(to.x - from.x, to.z - from.z);
        if (gap < 0.5) return;
        const sections = Math.max(1, Math.round(gap / length));
        for (let k = 0; k < sections; k++) {
          // A section's own x runs along the road on the left and against it on the right
          const t = (sign < 0 ? k : sections - k) / sections;
          const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t, heading: house.at.heading };
          const name = VILLAGE.walls[(n * 3 + k + (sign > 0 ? 4 : 0)) % VILLAGE.walls.length];
          items.push({ kind: "walls", name, parts: props.meshes.get(name), matrix: frame(at, sign, plan.front, gap / (sections * length)), tint: { shade: 0.9 + 0.16 * chance(n * 16 + k, sign + 3) } });
        }
      });
    }
    return items;
  }

  // The village's houses, garden walls and lamp posts in place of the
  // procedural ones, at the same plots. Everything opaque is one mesh and
  // everything that shines another, both standing at the set piece's centre
  // as the meshes they replace did (culling reads a mesh's origin). The
  // light pools on the road stay as built.
  function dressVillage(env, [houses, props]) {
    const old = tagged(env, ["village"]);
    if (!old.length || !old.every((mesh) => attached(mesh, env))) return { houses: 0 };
    const variants = [...houses.meshes.keys()].filter((name) => name.startsWith("house_")).sort();
    const post = props.meshes.get("lamp_post");
    if (!variants.length || !post || !VILLAGE.walls.every((name) => props.meshes.has(name))) throw new Error("the village files lack a house, a wall section or the lamp post");
    const started = performance.now();
    const count = { houses: 0, walls: 0, lamps: 0, lit: 0, meshes: 0, triangles: 0 };
    for (const group of new Set(old.map((mesh) => mesh.parent))) {
      const plan = group.userData.village;
      const origin = old.find((mesh) => mesh.parent === group).position.clone();
      const solid = { position: [], color: [], index: [] };
      const shine = { position: [], color: [], index: [] };
      const lights = [];
      const point = new THREE.Vector3();

      // One model into the two meshes, placed by `matrix`. `seed` settles
      // which of its windows are lit; `wash`, `accent` and `shade` tint it.
      const add = (parts, matrix, { seed = 0, wash = null, accent = null, shade = 1 } = {}) => {
        const mirrored = matrix.determinant() < 0;
        for (const { geometry, material } of parts) {
          const position = geometry.attributes.position;
          const color = geometry.attributes.color;
          const kind = material.name;
          const lamp = kind === "lamp";
          const tint = kind === "wall" ? wash : kind === "shutter" ? accent : null;
          const colour = (i, c) => color.array[i * color.itemSize + c] / 255;
          // The files' colours are sRGB (tools/blender/village_kit.py); the shader's are linear
          const linear = (i, c) => decode(colour(i, c));
          // Every corner of a window's glass carries the window's number
          const windows = new Map();
          const window = (i) => {
            const number = Math.round(colour(i, 0) * 255);
            if (!windows.has(number)) {
              const lit = chance(seed, number) < VILLAGE.lit;
              windows.set(number, { lit, glass: VILLAGE.glass[Math.floor(chance(number, seed) * VILLAGE.glass.length)], level: 0.84 + 0.2 * chance(seed + 7, number) });
              if (lit) count.lit++;
            }
            return windows.get(number);
          };
          // A vertex goes into a mesh once, however many triangles share it.
          // Colours are stored as 16-bit shares of 1 (see `build` below).
          const share = (value) => Math.round(Math.min(1, value) * 65535);
          const into = (target, fourth) => {
            const placed = new Int32Array(position.count).fill(-1);
            return (i, r, g, b) => {
              if (placed[i] < 0) {
                point.fromBufferAttribute(position, i).applyMatrix4(matrix);
                placed[i] = target.position.length / 3;
                target.position.push(point.x, point.y, point.z);
                target.color.push(share(r), share(g), share(b), fourth);
              }
              return placed[i];
            };
          };
          // The walls' fourth share is their lamplight, worked out once they are all in
          const toSolid = into(solid, 0);
          const toShine = into(shine, 65535);
          const cluster = [];
          const index = geometry.index.array;
          for (let t = 0; t < index.length; t += 3) {
            const corners = mirrored ? [index[t], index[t + 2], index[t + 1]] : [index[t], index[t + 1], index[t + 2]];
            const pane = kind === "glass" ? window(corners[0]) : null;
            for (const i of corners) {
              if (lamp) {
                const k = VILLAGE.lampGain / VILLAGE.shine;
                shine.index.push(toShine(i, colour(i, 0) * k, colour(i, 1) * k, colour(i, 2) * k));
                cluster.push(i);
              } else if (pane && pane.lit) {
                const k = colour(i, 1) * pane.level * VILLAGE.glassGain / VILLAGE.shine;
                shine.index.push(toShine(i, pane.glass[0] * k, pane.glass[1] * k, pane.glass[2] * k));
              } else if (pane) {
                const k = 0.5 + 0.5 * colour(i, 1);
                solid.index.push(toSolid(i, VILLAGE.dark[0] * k, VILLAGE.dark[1] * k, VILLAGE.dark[2] * k));
              } else {
                solid.index.push(toSolid(i, linear(i, 0) * shade * (tint ? tint.r : 1), linear(i, 1) * shade * (tint ? tint.g : 1), linear(i, 2) * shade * (tint ? tint.b : 1)));
              }
            }
          }
          // A house's own lanterns light the wall beside them: one light for each knot of lamp glass
          const knots = [];
          for (const i of new Set(cluster)) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            const knot = knots.find((k) => k.at.distanceTo(point) < 0.9);
            if (knot) {
              knot.sum.add(point);
              knot.n++;
            } else {
              knots.push({ at: point.clone(), sum: point.clone(), n: 1 });
            }
          }
          knots.forEach((k) => lights.push({ at: k.sum.divideScalar(k.n), reach: VILLAGE.lanternReach }));
        }
      };
      villageLayout(env, plan, origin, houses, props).forEach((item) => {
        add(item.parts, item.matrix, item.tint);
        if (item.light) lights.push(item.light);
        count[item.kind]++;
      });

      const build = ({ position, color, index }) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
        // Not floats: the game takes a float colour for sRGB and decodes it
        // (js/graphics.js, fixColorSpaces), and these are decoded already
        geometry.setAttribute("color", new THREE.BufferAttribute(new Uint16Array(color), 4, true));
        geometry.setIndex(index);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return geometry;
      };
      const walls = build(solid);
      // Every face is flat and shares no corner with the next, so these are the faces' own normals
      walls.computeVertexNormals();
      lamplight(walls, lights);
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, emissive: VILLAGE.glow, emissiveIntensity: VILLAGE.glowStrength });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = swap(shader.fragmentShader, "#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb * vColor.a;");
      };
      const body = new THREE.Mesh(walls, material);
      body.castShadow = true;
      body.receiveShadow = true;
      const glass = new THREE.Mesh(build(shine), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setScalar(VILLAGE.shine) }));
      for (const mesh of [body, glass]) {
        mesh.position.copy(origin);
        mesh.name = "modelled-village";
        mesh.userData.modelled = "village";
        group.add(mesh);
        count.meshes++;
        count.triangles += mesh.geometry.index.count / 3;
      }
      old.filter((mesh) => mesh.parent === group).forEach((mesh) => {
        discard(mesh);
        mesh.material.dispose();
      });
    }
    // The merge runs on the main thread, once a build
    count.ms = Math.round(performance.now() - started);
    return count;
  }

  // A village in daylight on a converted leg (js/course.js names its files
  // with `instanced: true`). Merged as night-ride's is, a 22-segment village
  // is about 230000 triangles held as 18 MB of vertices, over the drawn
  // window's 12 MB. Here each model is held once and drawn as instances:
  // one InstancedMesh for each model, each tint kind (plaster takes the
  // plot's wash, shutters its paint, the rest neither) and each handedness
  // (a mirrored house turns its faces inside out, so it draws its back
  // faces). Its windows are dark glass and its lanterns unlit, with no
  // baked lamplight: the leg rides it at golden hour. Same plots, houses,
  // washes, walls and lamp posts as the merged village (villageLayout).
  function dressVillageInstanced(env, [houses, props]) {
    const old = tagged(env, ["village"]);
    if (!old.length || !old.every((mesh) => attached(mesh, env))) return { houses: 0 };
    const variants = [...houses.meshes.keys()].filter((name) => name.startsWith("house_"));
    if (!variants.length || !props.meshes.get("lamp_post") || !VILLAGE.walls.every((name) => props.meshes.has(name))) throw new Error("the village files lack a house, a wall section or the lamp post");
    const started = performance.now();
    const count = { houses: 0, walls: 0, lamps: 0, lit: 0, meshes: 0, triangles: 0 };
    for (const group of new Set(old.map((mesh) => mesh.parent))) {
      const origin = old.find((mesh) => mesh.parent === group).position.clone();
      const items = villageLayout(env, group.userData.village, origin, houses, props);
      items.forEach((item) => { count[item.kind]++; });
      instanceModels(items, origin).forEach((mesh) => {
        mesh.name = "modelled-village";
        mesh.userData.modelled = "village";
        group.add(mesh);
        count.meshes++;
        count.triangles += (mesh.geometry.index.count / 3) * mesh.count;
      });
      old.filter((mesh) => mesh.parent === group).forEach((mesh) => {
        discard(mesh);
        mesh.material.dispose();
      });
    }
    count.ms = Math.round(performance.now() - started);
    return count;
  }

  // The daylight geometry of one tint kind of a model: linear colours as
  // 16-bit shares (a float colour would be decoded again, js/graphics.js
  // fixColorSpaces), window glass dark, the faces' own normals. Kept per
  // model, so every build and every instance shares it.
  const daylight = new WeakMap();
  const TINTS = { wall: "wash", shutter: "accent" };
  function daylightParts(parts) {
    if (daylight.has(parts)) return daylight.get(parts);
    const kinds = new Map();
    for (const { geometry, material } of parts) {
      const tint = TINTS[material.name] || "plain";
      if (!kinds.has(tint)) kinds.set(tint, []);
      kinds.get(tint).push({ geometry, kind: material.name });
    }
    const out = [...kinds.entries()].map(([tint, list]) => {
      const position = [];
      const color = [];
      const index = [];
      list.forEach(({ geometry, kind }) => {
        const base = position.length / 3;
        const source = geometry.attributes.color;
        const colour = (i, c) => source.array[i * source.itemSize + c] / 255;
        for (let i = 0; i < geometry.attributes.position.count; i++) {
          position.push(geometry.attributes.position.getX(i), geometry.attributes.position.getY(i), geometry.attributes.position.getZ(i));
          // Glass carries its window's number in red and its shading in green
          const rgb = kind === "glass" ? DAY_GLASS.map((v) => v * (0.6 + 0.4 * colour(i, 1))) : [0, 1, 2].map((c) => decode(colour(i, c)));
          color.push(...rgb.map((v) => Math.round(Math.min(1, v) * 65535)));
        }
        geometry.index.array.forEach((i) => index.push(base + i));
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(new Uint16Array(color), 3, true));
      geometry.setIndex(index);
      // Faces of a model share no corner across a crease, so these are their own normals
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return { tint, geometry };
    });
    daylight.set(parts, out);
    return out;
  }
  // Window glass by day: dark, a little blue from the sky in it (linear)
  const DAY_GLASS = [0.035, 0.045, 0.06];

  // Laid models (villageLayout's items) as InstancedMeshes standing at
  // `origin`, one per model, tint kind and handedness. Instance colours carry
  // the wash, the paint or the shade.
  const DAY_MATERIALS = {};
  function instanceModels(items, origin) {
    const groups = new Map();
    items.forEach((item) => {
      const key = `${item.name}|${item.matrix.determinant() < 0 ? "mirror" : "plain"}`;
      if (!groups.has(key)) groups.set(key, { parts: item.parts, mirrored: item.matrix.determinant() < 0, items: [] });
      groups.get(key).items.push(item);
    });
    const meshes = [];
    const white = { r: 1, g: 1, b: 1 };
    const colour = new THREE.Color();
    for (const { parts, mirrored, items: placed } of groups.values()) {
      const side = mirrored ? THREE.BackSide : THREE.FrontSide;
      if (!DAY_MATERIALS[side]) DAY_MATERIALS[side] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side });
      for (const { tint, geometry } of daylightParts(parts)) {
        const mesh = new THREE.InstancedMesh(geometry, DAY_MATERIALS[side], placed.length);
        placed.forEach((item, n) => {
          mesh.setMatrixAt(n, item.matrix);
          const shade = item.tint.shade ?? 1;
          const by = (tint === "wash" && item.tint.wash) || (tint === "accent" && item.tint.accent) || white;
          // Instance colours are linear, as the vertex colours they multiply
          colour.setRGB(by.r * shade, by.g * shade, by.b * shade);
          mesh.setColorAt(n, colour);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.position.copy(origin);
        // The instances spread over the piece: three r150 culls an instanced mesh by its one model's sphere
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      }
    }
    return meshes;
  }

  // The farmstead of a converted leg's meadow (Environment's farmstead
  // landmark): its house and barn, tagged with the model each becomes, take
  // that model at the box's place, front to the road; the shed stays a box
  function dressFarmstead(env, [houses]) {
    const old = tagged(env, ["farmstead"]);
    if (!old.length || !old.every((mesh) => attached(mesh, env))) return { buildings: 0 };
    let buildings = 0;
    const up = new THREE.Vector3(0, 1, 0);
    for (const mesh of old) {
      const { model, sign, heading, wash, accent } = mesh.userData.dressing;
      const parts = houses.meshes.get(model);
      if (!parts) throw new Error(`the village files lack ${model}`);
      const box = new THREE.Box3();
      parts.forEach(({ geometry }) => box.union(geometry.boundingBox));
      const centre = box.getCenter(new THREE.Vector3());
      // The model's centre on the box's centre; its x along the road, z away from it
      const turn = new THREE.Quaternion().setFromAxisAngle(up, heading + sign * Math.PI / 2);
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), turn, new THREE.Vector3(1, 1, 1))
        .multiply(new THREE.Matrix4().makeTranslation(-centre.x, 0, -centre.z));
      const item = { name: model, parts, matrix, tint: { wash: decodeHex(wash), accent: decodeHex(accent) } };
      instanceModels([item], mesh.position).forEach((built) => {
        built.name = `modelled-${model}`;
        built.userData.modelled = "farmstead";
        mesh.parent.add(built);
      });
      discard(mesh);
      buildings++;
    }
    return { buildings };
  }

  // How much lamplight each vertex of the village takes, into the alpha of
  // its colour: what faces a lamp and is near it takes most. A lamp's `reach`
  // is the distance at which its light has fallen to a quarter.
  function lamplight(geometry, lights) {
    const position = geometry.attributes.position.array;
    const normal = geometry.attributes.normal.array;
    const color = geometry.attributes.color.array;
    for (let i = 0; i < position.length; i += 3) {
      let sum = 0;
      for (const { at, reach } of lights) {
        const x = at.x - position[i];
        const y = at.y - position[i + 1];
        const z = at.z - position[i + 2];
        const square = x * x + y * y + z * z;
        if (square > reach * reach * 16) continue;
        const distance = Math.max(Math.sqrt(square), 1e-3);
        // Wrapped a little round the edge, as light off the road and the other walls would be
        const facing = Math.max(0, ((x * normal[i] + y * normal[i + 1] + z * normal[i + 2]) / distance + 0.25) / 1.25);
        const near = square / (reach * reach);
        sum += facing / ((1 + near) * (1 + near));
      }
      color[(i / 3) * 4 + 3] = Math.round(Math.min(1, sum) * 65535);
    }
  }

  // The ribbon's own UVs are the column along the road (u) and the height
  // above the road (v), 16 m to a unit. The shader below reads the detail by
  // world height and a level distance, so the UVs become the two level
  // distances a vertex has, in metres: u along the road's edge to its column,
  // v out from that edge along its column. A wall runs with the road and takes
  // u; a spur's flank and end face cross it, u barely changes over them, and
  // they take v. Ground columns (uv 0, 0 throughout, coloured by vertex) keep
  // theirs and are marked as no rock.
  function faceUVs(geometry) {
    const rows = Terrain.ROWS + 1;
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const columns = position.count / rows;
    const ground = Array.from({ length: columns }, (_, column) => {
      for (let j = 0; j < rows; j++) if (uv.getX(column * rows + j) !== 0 || uv.getY(column * rows + j) !== 0) return false;
      return true;
    });
    const run = (a, b) => Math.hypot(position.getX(b) - position.getX(a), position.getZ(b) - position.getZ(a));
    const rock = new Float32Array(position.count);
    let along = 0;
    for (let column = 0; column < columns; column++) {
      const first = column * rows;
      if (column > 0) along += run(first - rows, first);
      if (ground[column]) continue;
      let out = 0;
      for (let j = 0; j < rows; j++) {
        if (j > 0) out += run(first + j - 1, first + j);
        uv.setXY(first + j, along, out);
        rock[first + j] = 1;
      }
    }
    uv.needsUpdate = true;
    geometry.setAttribute("rock", new THREE.BufferAttribute(rock, 1));
  }

  // The detail texture is not laid on the face as a wallpaper: a tile that
  // comes round every few metres shows as a pattern down a whole canyon, and
  // the further off the wall the plainer the pattern. The face's own vertex
  // colours (strata bands, gullies, stains) stay the look at a distance, and
  // the texture is detail on them near the camera:
  // - the tile holds only grain and a few fractures, read at (a level
  //   distance, world height) so its grain lies level on a leaning wall and
  //   round a spur;
  // - the face is cut into irregular patches by a noise that also climbs
  //   steadily along and up the wall, each patch reading the tile at its own
  //   shift, blended into the next (two reads of each map). A patch number
  //   never comes back, so no stretch of wall is a copy of another;
  // - the bedding planes are not in the tile but drawn from world height
  //   (BED), so beds are of any thickness, level everywhere, and open and
  //   close along the wall. A tile's beds came out as even courses, and with
  //   its joints as a built wall;
  // - all of it is faint from the saddle and plain only close up (FADE), so
  //   the facets and the vertex colours stay what the wall is. The same tile
  //   is read again several times larger (COARSE) and comes in with distance;
  // - a near-level facet (a ledge, a spur's crown) is read in plan and takes
  //   no bedding planes: height does not change across it.
  const FADE = { from: 5, to: 45, far: 0.2 };
  const COARSE = { scale: 0.23, strength: 0.5, from: 25, to: 140 };
  // Bedding planes: one may lie in each `pitch` metres of height, and about a
  // third do, so beds run from thin ledges to massive faces several metres thick
  const BED = { pitch: 0.9, dark: 0.4, shadow: 0.18, lift: 0.06, relief: 0.5 };
  // The share of a facet's normal that points up, from which it counts as level (26 degrees of slope)
  const LEVEL = 0.9;
  const ROCK_PARS = /* glsl */ `
    uniform vec3 rockTint;
    uniform float rockTile;
    varying vec3 vRockAt;
    varying float vRock;
    vec3 rockBump;
    float rockLedge;
    vec2 rockUv;

    float rockHash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    float rockNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(rockHash(i), rockHash(i + vec2(1.0, 0.0)), f.x), mix(rockHash(i + vec2(0.0, 1.0)), rockHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    vec2 rockShift(float n) {
      return vec2(rockHash(vec2(n, 17.0)), rockHash(vec2(n, 59.0)));
    }
    // Two places to read the tile for the point \`at\` (in tiles), one for the
    // patch it is in and one for the next; returns how far it is into the next
    float rockPatches(vec2 at, out vec2 a, out vec2 b) {
      float n = rockNoise(at * 0.8 + 90.0) * 5.0 + dot(at, vec2(0.29, 0.21));
      // The image's first row is its top: v runs down the wall
      vec2 base = vec2(at.x, -at.y);
      a = base + rockShift(floor(n + 0.5));
      b = base + rockShift(floor(n));
      float edge = fract(n);
      return min(edge, 1.0 - edge) * 2.0;
    }
    // Where the two reads differ the blend is sharper, so a crack is not ghosted
    float rockMix(float a, float b, float edge) {
      return smoothstep(0.3, 0.7, edge - 0.4 * (a - b));
    }
    // three's perturbNormal2Arb, on the coordinates the detail is read at
    vec3 rockPerturb(vec3 eye, vec3 N, vec3 mapN, float faceDirection) {
      vec3 q0 = dFdx(eye);
      vec3 q1 = dFdy(eye);
      vec2 st0 = dFdx(rockUv);
      vec2 st1 = dFdy(rockUv);
      vec3 q1perp = cross(q1, N);
      vec3 q0perp = cross(N, q0);
      vec3 T = q1perp * st0.x + q0perp * st1.x;
      vec3 B = q1perp * st0.y + q0perp * st1.y;
      float det = max(dot(T, T), dot(B, B));
      float scale = (det == 0.0) ? 0.0 : faceDirection * inversesqrt(det);
      return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
    }
  `;
  const ROCK_MAP = /* glsl */ `
    vec3 rockFacet = cross(dFdx(vRockAt), dFdy(vRockAt));
    float rockLevel = step(${LEVEL}, abs(rockFacet.y) / max(length(rockFacet), 1e-6));
    // Level metres (along the road, out from it) and world height. A facet
    // takes whichever level distance changes faster over it, and height; a
    // level facet takes both level distances, its plan.
    float rockOut = step(length(vec2(dFdx(vUv.x), dFdy(vUv.x))), 0.8 * length(vec2(dFdx(vUv.y), dFdy(vUv.y))));
    vec2 rockMetres = mix(vec2(mix(vUv.x, vUv.y, rockOut), vRockAt.y), vUv, rockLevel);
    float rockBroad = rockNoise(rockMetres * vec2(0.021, 0.034));
    float rockMid = rockNoise(rockMetres * vec2(0.09, 0.19) + 40.0);
    rockUv = rockMetres / rockTile;
    float rockRange = length(vViewPosition);

    vec2 rockA;
    vec2 rockB;
    float rockEdge = rockPatches(rockUv, rockA, rockB);
    float rockDetailA = texture2D(map, rockA).r;
    float rockDetailB = texture2D(map, rockB).r;
    float rockBlend = rockMix(rockDetailA, rockDetailB, rockEdge);
    float rockClose = 1.0 - smoothstep(${FADE.from.toFixed(1)}, ${FADE.to.toFixed(1)}, rockRange);
    float rockNear = mix(${FADE.far.toFixed(2)}, 1.0, rockClose) * vRock;
    // The texture's neutral grey is 0.5 (tools/blender/rockface_detail.py)
    float rockDetail = mix(1.0, mix(rockDetailA, rockDetailB, rockBlend) * 2.0, rockNear);
    rockBump = mix(vec3(0.5, 0.5, 1.0), mix(texture2D(normalMap, rockA).xyz, texture2D(normalMap, rockB).xyz, rockBlend), rockNear);

    // The same tile several times larger, coming in as the fine detail goes
    vec2 rockC;
    vec2 rockD;
    float rockFarEdge = rockPatches(rockUv * ${COARSE.scale} + 7.0, rockC, rockD);
    float rockCoarseC = texture2D(map, rockC).r;
    float rockCoarseD = texture2D(map, rockD).r;
    float rockCoarse = mix(rockCoarseC, rockCoarseD, rockMix(rockCoarseC, rockCoarseD, rockFarEdge)) * 2.0 - 1.0;
    rockDetail *= 1.0 + rockCoarse * ${COARSE.strength} * smoothstep(${COARSE.from.toFixed(1)}, ${COARSE.to.toFixed(1)}, rockRange) * vRock;

    // Bedding planes, from world height: the tile has none, so no two beds
    // need be the same thickness. Each cell of height holds one plane at its
    // own level, open along some stretches of the wall and closed along others.
    float rockHeight = (rockMetres.y + (rockBroad - 0.5) * 2.5 + (rockMid - 0.5) * 0.6) / ${BED.pitch};
    float rockCell = floor(rockHeight);
    // Metres above the cell's plane
    float rockPlane = (fract(rockHeight) - 0.15 - 0.7 * rockHash(vec2(rockCell, 3.0))) * ${BED.pitch};
    float rockOpen = smoothstep(0.72, 0.9, rockHash(vec2(rockCell, 11.0)) * 0.55 + rockNoise(vec2(rockMetres.x * 0.045 + rockCell * 7.31, rockCell * 0.37)) * 0.75);
    rockOpen *= (1.0 - rockLevel) * vRock * mix(0.45, 1.0, rockClose);
    // Never thinner than a pixel, or a far wall would shimmer
    float rockWidth = max(0.03, 1.2 * fwidth(rockMetres.y));
    float rockCrack = 1.0 - smoothstep(0.0, rockWidth, abs(rockPlane));
    // The bed above overhangs a little: a soft shadow under the plane
    float rockShadow = step(rockPlane, 0.0) * (1.0 - smoothstep(0.0, 0.45, -rockPlane));
    // and the bed above it a shade lighter at its foot
    float rockLift = step(0.0, rockPlane) * (1.0 - smoothstep(0.0, 1.2, rockPlane));
    rockDetail *= 1.0 - rockOpen * (${BED.dark} * rockCrack + ${BED.shadow} * rockShadow - ${BED.lift} * rockLift);
    rockLedge = -sign(rockPlane) * rockOpen * rockClose * ${BED.relief} * (1.0 - smoothstep(0.0, 0.12, abs(rockPlane)));

    // Broad bands a few metres deep, swelling and pinching along the wall
    float rockBed = (rockMetres.y + (rockBroad - 0.5) * 3.0 + (rockMid - 0.5) * 0.8) / 3.4;
    float rockBand = mix(rockHash(vec2(floor(rockBed), 7.0)), rockHash(vec2(floor(rockBed) + 1.0, 7.0)), smoothstep(0.3, 0.7, fract(rockBed)));
    rockBand = mix(rockBand, 0.5, rockLevel);
    vec3 rockStone = rockTint * mix(vec3(1.04, 1.0, 0.95), vec3(0.97, 1.0, 1.04), rockBroad) * (0.88 + 0.1 * rockMid + 0.14 * rockBand);
    diffuseColor.rgb *= mix(vec3(1.0), rockStone, vRock) * rockDetail;
  `;
  const ROCK_NORMAL = /* glsl */ `
    vec3 mapN = rockBump * 2.0 - 1.0;
    mapN.xy *= normalScale;
    mapN.y += rockLedge;
    normal = rockPerturb(-vViewPosition, normal, mapN, faceDirection);
  `;

  function swap(source, chunk, code) {
    if (!source.includes(chunk)) throw new Error(`rock face shader: no ${chunk} to replace`);
    return source.replace(chunk, code);
  }

  function rockShader(shader, spec) {
    shader.uniforms.rockTint = { value: new THREE.Color(spec.tint) };
    shader.uniforms.rockTile = { value: spec.tile };
    shader.vertexShader = swap(shader.vertexShader, "#include <common>", "#include <common>\nattribute float rock;\nvarying vec3 vRockAt;\nvarying float vRock;");
    shader.vertexShader = swap(shader.vertexShader, "#include <project_vertex>", "#include <project_vertex>\nvRockAt = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRock = rock;");
    shader.fragmentShader = swap(shader.fragmentShader, "#include <normalmap_pars_fragment>", `#include <normalmap_pars_fragment>\n${ROCK_PARS}`);
    shader.fragmentShader = swap(shader.fragmentShader, "#include <map_fragment>", ROCK_MAP);
    shader.fragmentShader = swap(shader.fragmentShader, "#include <normal_fragment_maps>", ROCK_NORMAL);
  }

  // The rock face keeps its shape and vertex colours; the detail texture and
  // its normal map are worked into them by the shader above
  function dressRockFace(env, [map, normalMap], spec) {
    const ribbons = [];
    env.scene.traverse((object) => {
      if (object.isMesh && object.userData.part === "ground" && object.material.map && object.material.vertexColors && object.geometry.attributes.uv) ribbons.push(object);
    });
    if (!ribbons.length || !ribbons.every((ribbon) => attached(ribbon, env))) return { ribbons: 0 };
    const texture = (image, srgb) => {
      const out = new THREE.Texture(image);
      out.wrapS = out.wrapT = THREE.RepeatWrapping;
      // A decoded bitmap is never flipped on upload; an image element would be
      out.flipY = false;
      out.anisotropy = 4;
      if (srgb) out.encoding = THREE.sRGBEncoding;
      out.needsUpdate = true;
      return out;
    };
    // One upload of each map for both sides
    const detail = texture(map, true);
    const bumps = texture(normalMap, false);
    for (const ribbon of ribbons) {
      const material = ribbon.material;
      const old = material.map;
      faceUVs(ribbon.geometry);
      material.map = detail;
      material.normalMap = bumps;
      material.normalScale.set(spec.relief ?? 0.35, spec.relief ?? 0.35);
      material.onBeforeCompile = (shader) => rockShader(shader, spec);
      material.customProgramCacheKey = () => `rock-face-${spec.tile}-${spec.tint}`;
      material.userData.modelled = "rockFace";
      material.needsUpdate = true;
      old.dispose();
    }
    return { ribbons: ribbons.length };
  }

  // Starts the downloads for a leg and swaps its dressing when they arrive.
  // Resolves to what was swapped, per part, and the leg's asset bytes.
  function dress(env) {
    // The trees and bushes of any leg that has them (js/treemodels.js)
    const plants = typeof TreeModels !== "undefined" ? TreeModels.dress(env) : null;
    // A converted leg names its files in its course (js/course.js, `assets`)
    const course = typeof env.course === "function" ? env.course() : null;
    const own = course && course.assets ? course.assets : null;
    if (!LEGS[env.legIndex] && !own && !plants) return null;
    const spec = { ...(LEGS[env.legIndex] || {}), ...(own || {}) };
    const started = performance.now();
    const part = (name, load, apply) => load().then((asset) => apply(asset)).catch((error) => {
      console.error(`SceneAssets: ${name} for leg ${env.legIndex} kept its procedural meshes:`, error);
      return { error: String(error.message || error) };
    });
    // A leg names the parts it has; one it does not name is left as built
    const parts = {
      rocks: spec.rocks ? part("rocks", () => loadModel(spec.rocks), (model) => dressRocks(env, model, spec)) : { rocks: 0 },
      portals: spec.portal ? part("portals", () => loadModel(spec.portal), (model) => dressPortals(env, model, spec.opening)) : { portals: 0 },
      rockFace: spec.rockFace ? part("rock face", () => Promise.all([loadImage(spec.rockFace.map), loadImage(spec.rockFace.normalMap)]), (images) => dressRockFace(env, images, spec.rockFace)) : { ribbons: 0 },
      village: spec.village ? part("village", () => Promise.all([loadModel(spec.village.houses), loadModel(spec.village.props)]), (models) => (spec.village.instanced ? dressVillageInstanced : dressVillage)(env, models)) : { houses: 0 },
      farmstead: spec.village && spec.village.instanced ? part("farmstead", () => Promise.all([loadModel(spec.village.houses)]), (models) => dressFarmstead(env, models)) : { buildings: 0 },
      bridge: spec.bridge ? part("bridge", () => loadModel(spec.bridge), (model) => dressBridge(env, model)) : { bridges: 0 },
    };
    return Promise.all([...Object.values(parts), plants]).then(([rocks, portals, rockFace, village, farmstead, bridge, trees]) => ({
      rocks,
      portals,
      rockFace,
      village,
      // A converted leg's own parts, and the files it asked for
      ...(own && { bridge, farmstead, files: [...files(env.legIndex, spec), ...(trees ? trees.files : [])] }),
      ...(trees && { trees }),
      violations: rocks.violations || [],
      bytes: [...files(env.legIndex, spec), ...(trees ? trees.files : [])].reduce((sum, url) => sum + (bytes.get(url) || 0), 0),
      ms: Math.round(performance.now() - started),
    }));
  }

  function files(legIndex, spec = LEGS[legIndex]) {
    return spec ? [spec.rocks, spec.portal, spec.rockFace?.map, spec.rockFace?.normalMap, spec.village?.houses, spec.village?.props, spec.bridge].filter(Boolean) : [];
  }

  return { dress, files, loadModel, LEGS, VILLAGE };
})();
