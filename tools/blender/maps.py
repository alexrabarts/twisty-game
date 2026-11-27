# Baked texture maps for the detailed bikes (the owner, 2026-11-27: "allow baked texture maps for the detailed bikes").
# One atlas per bike: lod0 unwrapped into it, lod1 sharing it at one value per finish (drawn beyond 30 m), and the surface
# layers of surface.py baked into three maps of SIZE px, written as WebP into the file:
#
#   colour     a multiplier over each finish's own colour: tone, speckle, cavity, wear and dirt. The finish keeps its
#              colour in the material (baseColorFactor, raised by its lift so that wear can lighten an edge), so the
#              game's repaint and its crash and wheelie tints, which set the material's colour, still show through
#   normal     the two-scale bump, in tangent space (three works the tangents out from screen derivatives)
#   orm        occlusion (red: the part's own creases, from an ambient occlusion node that sees only the part),
#              roughness (green) and metalness (blue), as glTF packs them; both factors are 1
#
# The layers are shader nodes baked by Cycles at texel scale, so they no longer depend on how dense the mesh is (the
# vertex colours, surface.surface, did). The occlusion between parts stays in the vertex colours (bike_kit occlude).
# Each map's material keeps its finish in `extras` ({lift, roughness, metalness}), which far.py reads back: the far
# files carry no maps.
#
# Why WebP: js/sceneassets.js, the one reader, decodes a glTF's images with the browser (createImageBitmap) and reads
# EXT_texture_webp; three r150 needs no loader for it, and at the same quality WebP is about a third of PNG and smaller
# than JPEG for maps of noise. KTX2 or Basis would need three's module loaders, which this page cannot import.
import json
import math
import os
import struct

import bpy
import numpy as np

import common
import surface

SIZE = 1024
QUALITY = {"colour": 80, "normal": 82, "orm": 80}
# Finishes that keep no maps: what the game lights or sees through
LIT = ("headlight", "brake", "signal", "dash", "glass", "reflector", "visor")
# Finishes whose colour the game sets itself
REPAINTED = ("paint",)
MARGIN_PX = 4
SAMPLES = 32
# Islands smaller than this (m2: a spoke's face, a bolt) are not worth atlas room: each finish's small islands share a
# block BLOCK_PX square on the bottom row
SMALL_M2 = 0.0012
BLOCK_PX = 16


def islands(mesh, uv):
    """The faces of a mesh in UV islands (faces that share an edge with the same UVs on both sides), as lists of
    face indices."""
    parent = list(range(len(mesh.polygons)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    edges = {}
    for poly in mesh.polygons:
        for k in poly.loop_indices:
            loop = mesh.loops[k]
            nxt = mesh.loops[poly.loop_indices[(list(poly.loop_indices).index(k) + 1) % poly.loop_total]]
            key = tuple(sorted((loop.vertex_index, nxt.vertex_index)))
            here = (tuple(round(c, 5) for c in uv[k].uv), tuple(round(c, 5) for c in uv[nxt.index].uv))
            if key in edges:
                other, there = edges[key]
                if {here[0], here[1]} == {there[0], there[1]}:
                    parent[find(poly.index)] = find(other)
            else:
                edges[key] = (poly.index, here)
    out = {}
    for poly in mesh.polygons:
        out.setdefault(find(poly.index), []).append(poly.index)
    return list(out.values())


def unwrap(objects, low=()):
    """One UV atlas over every object. Smart project; then every face of `low` (lod1) at its finish's block; the small
    islands (under SMALL_M2, and every lit finish's) each squeezed into its finish's own block on the bottom row, as
    their maps are near one value; the rest packed above that row."""
    for obj in objects:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
    common.select_only(objects)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(80), island_margin=0.001, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    blocks, small, points = {}, [], []
    for obj in objects:
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        names = [m.name if m else "" for m in mesh.materials]
        if obj in low:
            # lod1 is drawn beyond 30 m: each finish one value, its block's middle, so no UV seam splits a vertex
            for poly in mesh.polygons:
                poly.select = False
                name = names[poly.material_index] if names else ""
                blocks.setdefault(name, len(blocks))
                points.append((obj, poly.index, name))
            continue
        for poly in mesh.polygons:
            poly.select = True
        for faces in islands(mesh, uv):
            area = sum(mesh.polygons[f].area for f in faces)
            name = names[mesh.polygons[faces[0]].material_index] if names else ""
            if area < SMALL_M2 or name in LIT:
                blocks.setdefault(name, len(blocks))
                small.append((obj, faces, name))
                for f in faces:
                    mesh.polygons[f].select = False
    scene = bpy.context.scene
    scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method="ADD", margin=MARGIN_PX / SIZE, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    band = BLOCK_PX / SIZE
    if len(blocks) * BLOCK_PX > SIZE:
        raise SystemExit(f"maps: {len(blocks)} finishes of small parts do not fit in one row of blocks")
    squeezed = {(id(obj), f) for obj, faces, _ in small for f in faces} | {(id(obj), f) for obj, f, _ in points}
    for obj in objects:
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        for poly in mesh.polygons:
            if (id(obj), poly.index) in squeezed:
                continue
            for k in poly.loop_indices:
                u, v = uv[k].uv
                uv[k].uv = (u, band + (1 - band) * v)
    inner = (BLOCK_PX - 4) / SIZE
    for obj, faces, name in small:
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        loops = [k for f in faces for k in mesh.polygons[f].loop_indices]
        us = [uv[k].uv[0] for k in loops]
        vs = [uv[k].uv[1] for k in loops]
        span = max(max(us) - min(us), max(vs) - min(vs), 1e-9)
        u0, v0 = (blocks[name] * BLOCK_PX + 2) / SIZE, 2 / SIZE
        for k in loops:
            u, v = uv[k].uv
            uv[k].uv = (u0 + (u - min(us)) / span * inner, v0 + (v - min(vs)) / span * inner)
    for obj, f, name in points:
        uv = obj.data.uv_layers.active.data
        middle = ((blocks[name] + 0.5) * BLOCK_PX / SIZE, BLOCK_PX / 2 / SIZE)
        for k in obj.data.polygons[f].loop_indices:
            uv[k].uv = middle
    return blocks


class Nodes:
    """Shader-node arithmetic in a material's tree: each method takes sockets or numbers and returns a socket."""

    def __init__(self, tree):
        self.tree = tree
        self.made = []

    def node(self, kind, **props):
        n = self.tree.nodes.new(kind)
        for key, value in props.items():
            setattr(n, key, value)
        self.made.append(n)
        return n

    def put(self, socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            self.tree.links.new(value, socket)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node("ShaderNodeMath", operation=op, use_clamp=clamp)
        self.put(n.inputs[0], a)
        self.put(n.inputs[1], b)
        return n.outputs[0]

    def mul(self, a, b):
        return self.math("MULTIPLY", a, b)

    def add(self, a, b):
        return self.math("ADD", a, b)

    def lerp(self, a, b, t):
        """a + (b - a) t"""
        return self.add(a, self.mul(self.math("SUBTRACT", b, a), t))

    def position(self):
        return self.node("ShaderNodeNewGeometry").outputs["Position"]

    def noise(self, scale_m, seed, detail=2.0):
        """Noise 0..1 over world position, features about `scale_m` metres across, offset by `seed`."""
        offset = self.node("ShaderNodeVectorMath", operation="ADD")
        self.tree.links.new(self.position(), offset.inputs[0])
        offset.inputs[1].default_value = (seed * 17.13, seed * 7.31, seed * 3.77)
        n = self.node("ShaderNodeTexNoise", noise_dimensions="3D")
        self.tree.links.new(offset.outputs[0], n.inputs["Vector"])
        n.inputs["Scale"].default_value = 1.0 / scale_m
        n.inputs["Detail"].default_value = detail
        return n.outputs["Fac"]

    def occlusion(self, distance, inside=False):
        n = self.node("ShaderNodeAmbientOcclusion", inside=inside, only_local=True, samples=32)
        n.inputs["Distance"].default_value = distance
        return n.outputs["AO"]

    def height(self):
        """The game's up (Blender's z) at the shading point."""
        split = self.node("ShaderNodeSeparateXYZ")
        self.tree.links.new(self.position(), split.inputs[0])
        return split.outputs["Z"]

    def smooth(self, value, start, full):
        n = self.node("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self.put(n.inputs["Value"], value)
        n.inputs["From Min"].default_value = start
        n.inputs["From Max"].default_value = full
        n.inputs["To Min"].default_value = 0.0
        n.inputs["To Max"].default_value = 1.0
        return n.outputs["Result"]

    def rgb(self, r, g, b):
        n = self.node("ShaderNodeCombineColor", mode="RGB")
        self.put(n.inputs[0], r)
        self.put(n.inputs[1], g)
        self.put(n.inputs[2], b)
        return n.outputs[0]

    def clear(self):
        for n in self.made:
            self.tree.nodes.remove(n)
        self.made = []


def layer_nodes(nodes, cfg, kind, finish, lift, seed):
    """The layers of surface.py for one finish as nodes: (colour multiplier (r, g, b sockets), roughness, ao, normal)."""
    on, v = cfg["on"], cfg["values"]
    rough0, metal0 = finish[1], finish[2]
    ao = nodes.occlusion(0.03)
    if kind == "none":
        return (1.0 / lift, 1.0 / lift, 1.0 / lift), rough0, ao, None
    lum, warm = 1.0, 0.0
    if "tone" in on:
        lum = nodes.add(1.0 - v["tone"]["amount"], nodes.mul(nodes.noise(v["tone"]["scale"], seed + 1), 2 * v["tone"]["amount"]))
        warm = nodes.mul(nodes.math("SUBTRACT", nodes.noise(v["tone"]["scale"] * 1.7, seed + 2), 0.5), 2 * v["tone"]["shift"])
    if "speckle" in on:
        s = v["speckle"]
        lum = nodes.mul(lum, nodes.add(s["low"], nodes.mul(nodes.noise(s["scale"], seed + 3, detail=0.0), s["high"] - s["low"])))
    if "cavity" in on:
        c = v["cavity"]
        lum = nodes.mul(lum, nodes.math("SUBTRACT", 1.0, nodes.mul(nodes.math("SUBTRACT", 1.0, ao), c["amount"] * 1.6), clamp=True))
    edge = 0.0
    if "wear" in on and kind in surface.WEAR:
        w = v["wear"]
        inside = nodes.occlusion(0.012, inside=True)
        edge = nodes.mul(nodes.smooth(nodes.math("SUBTRACT", 1.0, inside), 0.15, 0.6), nodes.add(0.6, nodes.mul(nodes.noise(0.05, seed + 4), 0.8)))
        lum = nodes.mul(lum, nodes.add(1.0, nodes.mul(edge, w["amount"] * surface.WEAR[kind])))
    r, g, b = nodes.add(lum, warm), lum, nodes.math("SUBTRACT", lum, warm)
    if "dirt" in on and kind in surface.DIRT:
        d = v["dirt"]
        low = nodes.smooth(nodes.math("SUBTRACT", d["height"], nodes.height()), 0.0, d["height"] * 0.8)
        k = nodes.mul(nodes.mul(low, d["amount"] * surface.DIRT[kind]), nodes.add(0.4, nodes.mul(nodes.noise(d["scale"], seed + 5), 0.6)))
        r, g, b = (nodes.mul(ch, nodes.lerp(1.0, tint, k)) for ch, tint in zip((r, g, b), d["colour"]))
    colour = tuple(nodes.math("DIVIDE", ch, lift, clamp=True) for ch in (r, g, b))
    rough = rough0
    if "roughness" in on:
        q = v["roughness"]
        rough = nodes.mul(rough0, nodes.add(1.0 - q["amount"], nodes.mul(nodes.noise(q["scale"], seed + 6), 2 * q["amount"])))
        # rough in the creases, smoother on the edges hands, boots and tyres polish
        rough = nodes.add(rough, nodes.mul(nodes.math("SUBTRACT", 1.0, ao), 0.25))
        if edge != 0.0:
            rough = nodes.math("SUBTRACT", rough, nodes.mul(edge, 0.2))
        rough = nodes.math("MAXIMUM", nodes.math("MINIMUM", rough, 1.0), 0.04)
    normal = None
    if "bump" in on:
        bv = v["bump"]
        large = nodes.node("ShaderNodeBump")
        # (a noise of 0..1 over about half its scale: the distance that gives the slope `large_angle`)
        large.inputs["Strength"].default_value = 1.0
        large.inputs["Distance"].default_value = bv["large_angle"] * bv["large"] / 2
        nodes.tree.links.new(nodes.noise(bv["large"], seed + 10), large.inputs["Height"])
        fine = nodes.node("ShaderNodeBump")
        fine.inputs["Strength"].default_value = 1.0
        fine.inputs["Distance"].default_value = bv["fine_angle"] * bv["fine"] / 2
        nodes.tree.links.new(nodes.noise(bv["fine"], seed + 20, detail=1.0), fine.inputs["Height"])
        nodes.tree.links.new(large.outputs["Normal"], fine.inputs["Normal"])
        normal = fine.outputs["Normal"]
    return colour, rough, ao, normal


def bake(objects, cfg, colours, seed=0, headroom=1.15, size=SIZE, blocks=None):
    """Bakes the maps of every object into arrays (size x size x 4, 0..1, rows from the bottom); returns
    ({colour, normal, orm}, {material name: extras})."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.bake.target = "IMAGE_TEXTURES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.render.bake.margin = MARGIN_PX
    scene.render.bake.margin_type = "EXTEND"
    targets = {}
    for name in ("colour", "rough", "metal", "ao", "normal"):
        image = bpy.data.images.new(f"bake_{name}", size, size, alpha=True, float_buffer=True)
        image.generated_color = (0, 0, 0, 0)
        image.colorspace_settings.name = "Non-Color"
        targets[name] = image
    materials = {}
    for obj in objects:
        for m in obj.data.materials:
            if m is not None:
                materials[m.name] = m
    plans, extras = {}, {}
    for name, m in materials.items():
        tree = m.node_tree
        nodes = Nodes(tree)
        finish = colours.get(name.split(".")[0], (0xFFFFFF, 0.5, 0.0))
        kind = "none" if name in LIT else surface.kind_of(name, finish[1], finish[2])
        # The game sets `paint` to the entry's colour for its crash and wheelie tints (BIKE_MODELS paint): it keeps
        # its colour as written, so its edges cannot lighten
        lift = surface.lift(surface._linear(finish[0]), headroom) if kind != "none" and name not in REPAINTED else 1.0
        colour, rough, ao, normal = layer_nodes(nodes, cfg, kind, finish, lift, seed)
        image = nodes.node("ShaderNodeTexImage")
        tree.nodes.active = image
        emit = nodes.node("ShaderNodeEmission")
        out = tree.nodes["Material Output"]
        bsdf = tree.nodes["Principled BSDF"]
        plans[name] = {"nodes": nodes, "image": image, "emit": emit, "out": out, "bsdf": bsdf, "colour": colour, "rough": rough, "metal": finish[2],
                       "ao": ao, "normal": normal}
        extras[name] = {"lift": round(lift, 5), "roughness": finish[1], "metalness": finish[2], "maps": name not in LIT}
    common.select_only(objects)

    def emit_pass(key, make):
        for plan in plans.values():
            plan["image"].image = targets[key]
            n = plan["nodes"]
            value = make(plan)
            plan["emit"].inputs["Strength"].default_value = 1.0
            if isinstance(value, tuple):
                n.tree.links.new(n.rgb(*value), plan["emit"].inputs["Color"])
            elif isinstance(value, (int, float)):
                plan["emit"].inputs["Color"].default_value = (value, value, value, 1.0)
            else:
                n.tree.links.new(n.rgb(value, value, value), plan["emit"].inputs["Color"])
            n.tree.links.new(plan["emit"].outputs[0], plan["out"].inputs["Surface"])
        bpy.ops.object.bake(type="EMIT", margin=MARGIN_PX, use_clear=True)

    emit_pass("colour", lambda p: p["colour"])
    emit_pass("rough", lambda p: p["rough"])
    emit_pass("metal", lambda p: p["metal"])
    emit_pass("ao", lambda p: p["ao"])
    for plan in plans.values():
        plan["image"].image = targets["normal"]
        n = plan["nodes"]
        n.tree.links.new(plan["bsdf"].outputs[0], plan["out"].inputs["Surface"])
        if plan["normal"] is not None:
            n.tree.links.new(plan["normal"], plan["bsdf"].inputs["Normal"])
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=MARGIN_PX, use_clear=True)

    arrays = {}
    for key, image in targets.items():
        values = np.empty(size * size * 4, dtype=np.float32)
        image.pixels.foreach_get(values)
        arrays[key] = values.reshape(size, size, 4)
    # Back to the plain finish for the export: the maps go into the file afterwards (attach)
    for plan in plans.values():
        for link in list(plan["bsdf"].inputs["Normal"].links):
            plan["nodes"].tree.links.remove(link)
        plan["nodes"].tree.links.new(plan["bsdf"].outputs[0], plan["out"].inputs["Surface"])
        plan["nodes"].clear()
    for image in targets.values():
        bpy.data.images.remove(image)
    # A block that no small island filled (a finish only lod1 draws) takes its finish's plain values
    for name, k in (blocks or {}).items():
        x0, x1 = k * BLOCK_PX, (k + 1) * BLOCK_PX
        if arrays["colour"][:BLOCK_PX, x0:x1, 3].max() > 0:
            continue
        extra = extras.get(name, {"lift": 1.0, "roughness": 0.5, "metalness": 0.0})
        arrays["colour"][:BLOCK_PX, x0:x1] = (1 / extra["lift"], 1 / extra["lift"], 1 / extra["lift"], 1)
        arrays["rough"][:BLOCK_PX, x0:x1] = (extra["roughness"],) * 3 + (1,)
        arrays["metal"][:BLOCK_PX, x0:x1] = (extra["metalness"],) * 3 + (1,)
        arrays["ao"][:BLOCK_PX, x0:x1] = (1, 1, 1, 1)
        arrays["normal"][:BLOCK_PX, x0:x1] = (0.5, 0.5, 1, 1)
    # A light blur takes the sampling noise out of the occlusion, which made the maps dear to store
    for key in ("ao", "colour", "rough"):
        a = arrays[key]
        arrays[key] = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    orm = np.stack([arrays["ao"][..., 0], arrays["rough"][..., 0], arrays["metal"][..., 0], np.ones((size, size), np.float32)], axis=-1)
    colour = arrays["colour"].copy()
    colour[..., 3] = 1.0
    # The base colour map is read as sRGB: encode it
    colour[..., :3] = np.where(colour[..., :3] <= 0.0031308, colour[..., :3] * 12.92, 1.055 * np.power(np.clip(colour[..., :3], 0, 1), 1 / 2.4) - 0.055)
    return {"colour": colour, "normal": arrays["normal"], "orm": orm}, extras


def webp(array, path, quality):
    """An array (rows from the bottom, 0..1) as WebP, written as is (no colour transform)."""
    size = array.shape[0]
    image = bpy.data.images.new(os.path.basename(path), size, size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(np.clip(array, 0, 1).astype(np.float32).ravel())
    common.save_webp(image, path, quality=quality)
    bpy.data.images.remove(image)
    return open(path, "rb").read()


def attach(path, files, extras):
    """Puts the WebP maps into the glTF binary at `path` and gives every material that takes maps its textures, both
    factors 1 and its finish in `extras`; a lit finish keeps none."""
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    blob = bytearray(data[20 + length + 8:])
    index = {}
    doc.setdefault("images", [])
    doc.setdefault("textures", [])
    doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
    for key in ("colour", "normal", "orm"):
        blob += b"\0" * (-len(blob) % 4)
        doc["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(files[key])})
        blob += files[key]
        doc["images"].append({"bufferView": len(doc["bufferViews"]) - 1, "mimeType": "image/webp"})
        doc["textures"].append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": len(doc["images"]) - 1}}})
        index[key] = len(doc["textures"]) - 1
    blob += b"\0" * (-len(blob) % 4)
    for material in doc["materials"]:
        extra = extras.get(material["name"])
        if not extra or not extra["maps"]:
            continue
        pbr = material.setdefault("pbrMetallicRoughness", {})
        factor = pbr.get("baseColorFactor", [1, 1, 1, 1])
        pbr["baseColorFactor"] = [min(1.0, c * extra["lift"]) for c in factor[:3]] + factor[3:]
        pbr["baseColorTexture"] = {"index": index["colour"]}
        pbr["metallicRoughnessTexture"] = {"index": index["orm"]}
        pbr["roughnessFactor"] = 1.0
        pbr["metallicFactor"] = 1.0
        material["normalTexture"] = {"index": index["normal"]}
        material["occlusionTexture"] = {"index": index["orm"]}
        material["extras"] = {"lift": extra["lift"], "roughness": extra["roughness"], "metalness": extra["metalness"]}
    for key in ("extensionsUsed", "extensionsRequired"):
        doc[key] = sorted(set(doc.get(key, [])) | {"EXT_texture_webp"})
    doc["buffers"] = [{"byteLength": len(blob)}]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(blob))
    out += struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    open(path, "wb").write(out)
    return len(out)


def plain(material):
    """A material of a file with maps as its plain finish (for the far files): no textures, the finish's own colour,
    roughness and metalness from its extras."""
    extra = material.get("extras") or {}
    pbr = dict(material.get("pbrMetallicRoughness", {}))
    out = {k: v for k, v in material.items() if k not in ("normalTexture", "occlusionTexture", "extras")}
    if "lift" in extra:
        pbr["baseColorFactor"] = [c / extra["lift"] for c in pbr.get("baseColorFactor", [1, 1, 1, 1])[:3]] + pbr.get("baseColorFactor", [1, 1, 1, 1])[3:]
        pbr["roughnessFactor"] = extra["roughness"]
        pbr["metallicFactor"] = extra["metalness"]
    pbr.pop("baseColorTexture", None)
    pbr.pop("metallicRoughnessTexture", None)
    out["pbrMetallicRoughness"] = pbr
    return out
