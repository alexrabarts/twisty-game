// The reader of the game's modelled files (glTF binary built by the Blender
// scripts in tools/blender into assets/): the bikes and the rider
// (js/bikemodels.js), the cars, the world's houses, trees and animals, and the
// hill ride's models all come through loadModel.
//
// The files are plain glTF binary with WebP textures, read by the small
// reader below rather than three's GLTFLoader: in r150 that loader is an ES
// module importing 'three' by bare name, which this script-tag page cannot
// resolve without an import map and a second copy of three.
const SceneAssets = (() => {
  // Downloads are shared by every reader of a file
  const downloads = new Map();

  function fetchBytes(url) {
    if (!downloads.has(url)) {
      downloads.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return response.arrayBuffer();
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
    // One three texture per glTF texture and colour space: a detailed bike's maps serve all its materials, and a
    // texture of its own for each would upload the same map to the GPU once per material
    const made = new Map();
    const texture = (ref, srgb) => {
      if (!ref) return null;
      const key = `${ref.index}:${srgb}`;
      if (!made.has(key)) made.set(key, fresh(ref, srgb));
      return made.get(key);
    };
    const fresh = (ref, srgb) => {
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
    // A node with children (a detailed bike's `lod0` and `lod1`) is a group of
    // its own: its children's meshes and places, read by name. The flat maps
    // above hold every node too, where a name met twice keeps the last.
    const groups = new Map();
    const owner = new Map();
    (json.nodes || []).forEach((node) => {
      if (!node.children) return;
      groups.set(node.name, { meshes: new Map(), places: new Map(), at: new THREE.Vector3().fromArray(node.translation || [0, 0, 0]) });
      for (const child of node.children) owner.set(child, groups.get(node.name));
    });
    (json.nodes || []).forEach((node, index) => {
      // One scale for all three axes is the unit of positions stored as whole
      // numbers (tools/blender/bike_kit.py, pack_colours); it is worked into them here
      const unit = node.scale ? node.scale[0] : 1;
      const even = !node.scale || (unit > 0 && node.scale[1] === unit && node.scale[2] === unit);
      if (node.rotation || node.matrix || !even) throw new Error(`${url}: node ${node.name} is turned or unevenly scaled, which is not read`);
      const place = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
      places.set(node.name, place);
      const group = owner.get(index);
      if (group) group.places.set(node.name, place.clone().add(group.at));
      if (node.mesh === undefined) return;
      const parts = json.meshes[node.mesh].primitives.map((primitive) => {
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
        if (!geometry.attributes.normal) kitSurface(geometry, materials[primitive.material].name);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return { geometry, material: materials[primitive.material] };
      });
      meshes.set(node.name, parts);
      if (group) group.meshes.set(node.name, parts);
    });
    return { meshes, places, groups };
  }

  // A file from the village kit (tools/blender/village_kit.py: houses, props,
  // the stone bridge) carries no normals, because every face is flat, and
  // sRGB colours. Every model leaves here lit and in the shader's colour
  // space, whoever draws it: the faces' own normals are worked out, and the
  // colours become linear 16-bit shares (a float colour would be decoded again,
  // js/graphics.js fixColorSpaces), window glass dark by day. The stored sRGB
  // bytes stay on userData.srgb, where a window's number can be read.
  function kitSurface(geometry, kind) {
    // Faces of a kit model share no corner across a crease, so these are their own normals
    geometry.computeVertexNormals();
    // A corner only a zero-area face uses (lamp_post has 8) gets no direction from it; it draws nothing, but
    // a zero normal is NaN once the shader normalises it
    const normal = geometry.attributes.normal;
    for (let i = 0; i < normal.count; i++) {
      if (Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) < 0.5) normal.setXYZ(i, 0, 1, 0);
    }
    const stored = geometry.attributes.color;
    if (!stored) return;
    const scale = stored.array instanceof Uint16Array ? 65535 : stored.array instanceof Uint8Array ? 255 : 1;
    const colour = (i, c) => stored.array[i * stored.itemSize + c] / scale;
    const linear = new Uint16Array(stored.count * 3);
    for (let i = 0; i < stored.count; i++) {
      // Glass carries its window's number in red and its shading in green
      const rgb = kind === "glass" ? DAY_GLASS.map((v) => v * (0.6 + 0.4 * colour(i, 1))) : [0, 1, 2].map((c) => decode(colour(i, c)));
      for (let c = 0; c < 3; c++) linear[i * 3 + c] = Math.round(Math.min(1, rgb[c]) * 65535);
    }
    geometry.userData.srgb = stored;
    geometry.setAttribute("color", new THREE.BufferAttribute(linear, 3, true));
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

  // An sRGB value as the shader's linear one
  const decode = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  // Window glass by day: dark, a little blue from the sky in it (linear)
  const DAY_GLASS = [0.035, 0.045, 0.06];

  return { loadModel };
})();
