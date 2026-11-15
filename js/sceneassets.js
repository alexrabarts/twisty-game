// Modelled scenery for the legs that have it: rocks, tunnel portals and the
// rock face's texture, built by the Blender scripts in tools/blender into
// assets/. Environment calls SceneAssets.dress() at the end of every build.
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

  const COMPONENTS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  // A glTF binary as { meshes: name -> [{ geometry, material }] }, one entry
  // per primitive (per material), in the shape the Blender exporter writes:
  // one node per mesh, no node transforms, no interleaving.
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
      if (bufferView.byteStride) throw new Error(`${url}: interleaved buffer views are not read`);
      return { offset: bin + (bufferView.byteOffset || 0), length: bufferView.byteLength };
    };
    const accessor = (index) => {
      const def = json.accessors[index];
      const type = COMPONENTS[def.componentType];
      const { offset } = slice(def.bufferView);
      const count = def.count * SIZES[def.type];
      // Copied out, so the geometry does not pin the whole file
      const array = new type(buffer.slice(offset + (def.byteOffset || 0), offset + (def.byteOffset || 0) + count * type.BYTES_PER_ELEMENT));
      return new THREE.BufferAttribute(array, SIZES[def.type], !!def.normalized);
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
    for (const node of json.nodes || []) {
      if (node.mesh === undefined) continue;
      meshes.set(node.name, json.meshes[node.mesh].primitives.map((primitive) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", accessor(primitive.attributes.POSITION));
        if (primitive.attributes.NORMAL !== undefined) geometry.setAttribute("normal", accessor(primitive.attributes.NORMAL));
        if (primitive.attributes.TEXCOORD_0 !== undefined) {
          geometry.setAttribute("uv", accessor(primitive.attributes.TEXCOORD_0));
          // three r150 reads the occlusion map through a second UV set
          geometry.setAttribute("uv2", geometry.attributes.uv);
        }
        if (primitive.indices !== undefined) geometry.setIndex(accessor(primitive.indices));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return { geometry, material: materials[primitive.material] };
      }));
    }
    return { meshes };
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
  // - it is read at (a level distance, world height), so its beds lie level
  //   on a leaning wall and round a spur, and a slow noise lifts and drops
  //   them a little so they are not ruled lines;
  // - the face is cut into irregular patches by a noise that also climbs
  //   steadily along and up the wall, each patch reading the tile at its own
  //   shift, blended into the next (two reads of each map). A patch number
  //   never comes back, so no stretch of wall is a copy of another. Shifts are
  //   whole beds upward (BEDS), so beds run on from patch to patch;
  // - its strength falls with distance (FADE), and slower noises vary the
  //   stone's brightness and warmth over tens of metres and band it in beds
  //   a few metres thick;
  // - the same tile is read again several times larger (COARSE) and comes in
  //   as the fine detail goes, so a far wall has broad beds and no grain;
  // - a near-level facet (a ledge, a spur's crown) is read in plan: height
  //   does not change across it, so the beds would smear.
  const BEDS = 8;
  const FADE = { from: 12, to: 150, far: 0.25 };
  const COARSE = { scale: 0.23, strength: 0.9, from: 25, to: 140 };
  // The share of a facet's normal that points up, from which it counts as level (26 degrees of slope)
  const LEVEL = 0.9;
  const ROCK_PARS = /* glsl */ `
    uniform vec3 rockTint;
    uniform float rockTile;
    varying vec3 vRockAt;
    varying float vRock;
    vec3 rockBump;
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
      return vec2(rockHash(vec2(n, 17.0)), floor(rockHash(vec2(n, 59.0)) * ${BEDS}.0) / ${BEDS}.0);
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
    rockUv = vec2(rockMetres.x, rockMetres.y + (rockMid - 0.5) * 1.4) / rockTile;
    float rockRange = length(vViewPosition);

    vec2 rockA;
    vec2 rockB;
    float rockEdge = rockPatches(rockUv, rockA, rockB);
    float rockDetailA = texture2D(map, rockA).r;
    float rockDetailB = texture2D(map, rockB).r;
    float rockBlend = rockMix(rockDetailA, rockDetailB, rockEdge);
    float rockNear = mix(${FADE.far.toFixed(2)}, 1.0, 1.0 - smoothstep(${FADE.from.toFixed(1)}, ${FADE.to.toFixed(1)}, rockRange)) * vRock;
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

    // Thick beds a few metres deep, swelling and pinching along the wall
    float rockBed = (rockMetres.y + (rockBroad - 0.5) * 9.0 + (rockMid - 0.5) * 1.6) / 2.7;
    float rockBand = mix(rockHash(vec2(floor(rockBed), 7.0)), rockHash(vec2(floor(rockBed) + 1.0, 7.0)), smoothstep(0.42, 0.58, fract(rockBed)));
    rockBand = mix(rockBand, 0.5, rockLevel);
    vec3 rockStone = rockTint * mix(vec3(1.05, 1.0, 0.94), vec3(0.96, 1.0, 1.05), rockBroad) * (0.82 + 0.14 * rockMid + 0.24 * rockBand);
    diffuseColor.rgb *= mix(vec3(1.0), rockStone, vRock) * rockDetail;
  `;
  const ROCK_NORMAL = /* glsl */ `
    vec3 mapN = rockBump * 2.0 - 1.0;
    mapN.xy *= normalScale;
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
      material.normalScale.set(spec.relief ?? 0.5, spec.relief ?? 0.5);
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
    const spec = LEGS[env.legIndex];
    if (!spec) return null;
    const started = performance.now();
    const part = (name, load, apply) => load().then((asset) => apply(asset)).catch((error) => {
      console.error(`SceneAssets: ${name} for leg ${env.legIndex} kept its procedural meshes:`, error);
      return { error: String(error.message || error) };
    });
    const parts = {
      rocks: part("rocks", () => loadModel(spec.rocks), (model) => dressRocks(env, model, spec)),
      portals: part("portals", () => loadModel(spec.portal), (model) => dressPortals(env, model, spec.opening)),
      rockFace: part("rock face", () => Promise.all([loadImage(spec.rockFace.map), loadImage(spec.rockFace.normalMap)]), (images) => dressRockFace(env, images, spec.rockFace)),
    };
    return Promise.all(Object.values(parts)).then(([rocks, portals, rockFace]) => ({
      rocks,
      portals,
      rockFace,
      violations: rocks.violations || [],
      bytes: files(env.legIndex).reduce((sum, url) => sum + (bytes.get(url) || 0), 0),
      ms: Math.round(performance.now() - started),
    }));
  }

  function files(legIndex) {
    const spec = LEGS[legIndex];
    return spec ? [spec.rocks, spec.portal, spec.rockFace.map, spec.rockFace.normalMap] : [];
  }

  return { dress, files, LEGS };
})();
