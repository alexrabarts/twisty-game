# Helpers for the detailed bikes of group E (bike13_panigale.py,
# bike14_forza.py, bike15_crf250.py), on top of the shared kit (bike_kit.py, bike_parts.py),
# which this file does not change. Started from group D's helpers.
#
# A detailed bike file holds the bike twice, as two node groups: `lod0` (the
# hero model, at most 40,000 triangles) and `lod1` (for distance, at most
# 10,000). Inside each group the nodes carry the same names as a game bike
# file (body, wheel_front, wheel_rear, disc_front, disc_rear, fork_left,
# fork_right, handlebar, brake_light, headlight, and the bare points grip,
# peg and seat), so the game can swap one group for the other. The groups
# sit at the origin with no transform, so a node's translation is its pivot
# in the bike's axes, as in a game bike file. lod1's nodes come first in the
# node list and lod0's last, so a reader that keys nodes by name alone
# (js/sceneassets.js today) ends up with the detailed model.
#
# Shapes are written in the game's axes (x across, y up, z forward, metres,
# ground at y = 0), at the real bike's size, with the wheelbase centred on
# z = 0. The game's axes are right-handed, so +x is the rider's LEFT (B() in
# bike_kit.py turns them into Blender's without a mirror). A bike script
# writes the rider's right as +x, as the older bike scripts read, and the
# kit mirrors the finished shapes, so the drive, the silencer and the
# brake pedal land on the side the real bike carries them. The bare points
# (grip, peg, seat) keep +x, as the game reads both sides from them.
import json
import math
import os
import shutil
import struct
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import common  # noqa: E402
from bike_kit import Kit, B, render, pack_colours  # noqa: E402
import far  # noqa: E402
import surface  # noqa: E402
import maps  # noqa: E402

# TWISTY_BIKE_DIR builds a variant elsewhere (a model-build round), its far file in a `far` folder beside it
OUT_DIR = os.environ.get("TWISTY_BIKE_DIR") or os.path.join(common.ASSETS, "bikes", "detail")
LODS = ("lod0", "lod1")
BUDGET = {"lod0": 40000, "lod1": 10000}
FILE_BUDGET = int(1.2 * 1024 * 1024)
# Positions are stored as whole half-millimetres in signed shorts (bike_kit.pack_colours)
UNIT = 0.0005
# Nodes that turn in the game: nothing else may shade them in the bake
ALONE = ("wheel_front", "wheel_rear", "disc_front", "disc_rear")
# In the distant model, finishes that read alike from afar become one. The
# rims, the gold forks and the calipers stay: they are how a bike is known.
LOW = {"chrome": "steel", "disc": "steel", "steel_dark": "dark_metal", "spring": "dark_metal", "vent": "dark_metal", "dash": "dark_metal",
       "carbon": "dark_metal", "signal": "dark_metal"}
# Nodes the distant model keeps whole, however small their shapes
KEEP = ("brake_light", "headlight", "wheel_front", "wheel_rear", "disc_front", "disc_rear")


def along(a, b, t):
    return tuple(p + (q - p) * t for p, q in zip(a, b))


class EKit(Kit):
    """The shared kit, building one bike at two levels of detail into one scene."""

    def __init__(self, seed, colours, cull=0.09, extra=None, layers=None, headroom=1.0, maps=None):
        super().__init__(seed=seed, colours=colours)
        # The surface layers baked into texture maps (maps.py; a surface.config with the steps to bake), or None for
        # a file with no maps. TWISTY_MAPS=0 builds without them, for a comparison
        self.maps = maps if os.environ.get("TWISTY_MAPS", "1") != "0" else None
        # The surface layers worked over the occlusion (surface.config), or None for the occlusion alone; `headroom`
        # is how far a finish may be raised so wear can lighten it (surface.py)
        # (TWISTY_SURFACE and TWISTY_HEADROOM set them for a variant build of any bike of this kit)
        if layers is None and os.environ.get("TWISTY_SURFACE"):
            layers = surface.config()
        self.layers = layers
        self.headroom = float(os.environ.get("TWISTY_HEADROOM") or headroom)
        self.seed = seed
        # Finishes the shared kit has no name for, as (colour, roughness,
        # metalness); the game's palette holds none of these names, so each
        # keeps the colour written here
        for name, value in (extra or {}).items():
            self.colours[name] = value
        self.lod = "lod0"
        # Shapes smaller than this (metres, longest side) are left out of the distant model
        self.cull = cull
        # Set while drawing something the distant model must keep whatever its size
        self.keep = False

    def level(self, lod):
        self.lod = lod
        self.low = lod != "lod0"

    def begin(self, node, pivot=(0, 0, 0)):
        super().begin(f"{self.lod}_{node}", pivot)

    # In the distant model every turned, swept and lofted shape has fewer
    # segments round it and fewer steps along it
    def lathe(self, profile, at, mat, seg=16, **kw):
        return super().lathe(profile, at, mat, seg=max(6, seg // 2) if self.low else seg, **kw)

    def tube(self, points, radius, mat, seg=8, smooth=1, **kw):
        if self.low:
            seg, smooth = max(4, round(seg * 0.6)), max(1, smooth - 1)
        return super().tube(points, radius, mat, seg=seg, smooth=smooth, **kw)

    def loft(self, sections, mat, ring=14, steps=3, **kw):
        if self.low:
            ring, steps = max(8, (round(ring * 0.6) // 2) * 2), max(1, steps - 1)
        return super().loft(sections, mat, ring=ring, steps=steps, **kw)

    def sheet(self, fn, mat, nu=8, nv=6, **kw):
        if self.low:
            nu, nv = max(2, nu // 2), max(1, nv // 2)
        return super().sheet(fn, mat, nu=nu, nv=nv, **kw)

    # The kit turns every distant wheel into a plain cast one; a spoked or
    # coloured wheel is how a bike is known, so the distant model keeps its
    # style and colour and only loses segments (the caller passes `seg`)
    def wheel(self, *args, **kw):
        low = self.low
        self.low = False
        try:
            return super().wheel(*args, **kw)
        finally:
            self.low = low

    def emit(self, verts, faces, mat, **kw):
        if not self.low:
            return super().emit(verts, faces, mat, **kw)
        base = self.node.split("_", 1)[1]
        spans = [max(v[axis] for v in verts) - min(v[axis] for v in verts) for axis in range(3)]
        named = mat if isinstance(mat, str) else None
        if max(spans) < self.cull and not self.keep and base not in KEEP and named != "caliper":
            return None
        if isinstance(mat, list):
            mat = [LOW.get(name, name) for name in mat]
        elif callable(mat):
            mat = (lambda pick: lambda centre: LOW.get(pick(centre), pick(centre)))(mat)
        else:
            mat = LOW.get(mat, mat)
        # The kit's own low-detail rules are replaced by the ones above
        self.low = False
        try:
            return super().emit(verts, faces, mat, **kw)
        finally:
            self.low = True

    # Joins each node's shapes per level, moves them onto their pivots, bakes
    # the occlusion one level at a time, groups each level under its own
    # node and writes the file
    def finish_lods(self, path, anchors):
        joined = {}
        for key, shapes in self.nodes.items():
            common.select_only(shapes, shapes[0])
            if len(shapes) > 1:
                bpy.ops.object.join()
            obj = bpy.context.view_layer.objects.active
            obj.name = key
            obj.data.name = key
            # Mirrored across x: the rider's right as written goes to -x
            obj.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
            obj.data.flip_normals()
            px, py, pz = self.pivots[key]
            pivot = Vector(B((-px, py, pz)))
            obj.data.transform(Matrix.Translation(-pivot))
            obj.location = pivot
            joined[key] = obj
        for lod in LODS:
            mine = {key: obj for key, obj in joined.items() if key.startswith(lod + "_")}
            self.occlude_level(mine, joined)
            if self.layers:
                surface.apply(list(mine.values()), self.layers, self.colours, seed=self.seed, headroom=self.headroom)
        baked = None
        if self.maps:
            blocks = maps.unwrap(list(joined.values()), [obj for key, obj in joined.items() if key.startswith("lod1_")])
            baked = maps.bake(list(joined.values()), self.maps, self.colours, seed=self.seed, headroom=self.headroom, blocks=blocks)
        groups = {}
        marks = []
        for lod in LODS:
            group = bpy.data.objects.new(lod, None)
            self.scene.collection.objects.link(group)
            groups[lod] = group
            for key, obj in joined.items():
                if key.startswith(lod + "_"):
                    obj.parent = group
            for name, at in anchors.items():
                mark = bpy.data.objects.new(f"{lod}_{name}", None)
                mark.location = B(at)
                self.scene.collection.objects.link(mark)
                mark.parent = group
                marks.append(mark)
        common.export_glb(path, list(joined.values()) + marks + list(groups.values()), colours=True, texcoords=bool(baked))
        pack_colours(path, unit=UNIT)
        size = rename_nodes(path)
        if baked:
            arrays, extras = baked
            # (each map is written out once to be encoded, outside the repository: TWISTY_MAPS_DIR keeps them to look at)
            folder = os.environ.get("TWISTY_MAPS_DIR") or tempfile.mkdtemp(prefix="twisty-maps-")
            files = {key: maps.webp(arrays[key], os.path.join(folder, f"{os.path.splitext(os.path.basename(path))[0]}-{key}.webp"), maps.QUALITY[key]) for key in arrays}
            if not os.environ.get("TWISTY_MAPS_DIR"):
                shutil.rmtree(folder)
            size = maps.attach(path, files, extras)
            print(f"{os.path.basename(path)}: maps " + ", ".join(f"{key} {len(blob)} bytes" for key, blob in files.items()))
        counts = {lod: {} for lod in LODS}
        for key, obj in joined.items():
            lod, name = key.split("_", 1)
            counts[lod][name] = self.triangles([obj])
        totals = {lod: sum(c.values()) for lod, c in counts.items()}
        print(f"{os.path.basename(path)}: {size} bytes; " + "; ".join(f"{lod} {totals[lod]} triangles {counts[lod]}" for lod in LODS))
        for lod in LODS:
            if totals[lod] > BUDGET[lod]:
                raise SystemExit(f"{path}: {lod} has {totals[lod]} triangles, over its budget of {BUDGET[lod]}")
        if size > FILE_BUDGET:
            raise SystemExit(f"{path}: {size} bytes is over the budget of {FILE_BUDGET}")
        # The bike as the touring crew ride it, from the file just written (far.py)
        far.bike(path)
        self.joined = joined
        self.totals = totals
        return joined

    # The kit's occlusion bake, with the other level hidden
    def occlude_level(self, mine, everything):
        world = bpy.data.worlds.new("bake")
        world.light_settings.distance = 0.22
        self.scene.world = world
        self.scene.render.bake.target = "VERTEX_COLORS"
        for key, obj in mine.items():
            attribute = obj.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
            obj.data.color_attributes.active_color = attribute
            obj.data.color_attributes.render_color_index = 0
            alone = key.split("_", 1)[1] in ALONE
            for other in everything.values():
                other.hide_render = other is not obj and (other not in mine.values() or alone)
            common.select_only([obj])
            bpy.ops.object.bake(type="AO")
            values = [0.0] * (len(obj.data.vertices) * 4)
            attribute.data.foreach_get("color", values)
            for i in range(0, len(values), 4):
                shade = 0.3 + 0.7 * min(1.0, values[i] * 1.15) ** 1.3
                values[i:i + 4] = (shade, shade, shade, 1.0)
            attribute.data.foreach_set("color", values)
        for obj in everything.values():
            obj.hide_render = False

    def show(self, lod):
        for key, obj in self.joined.items():
            obj.hide_render = not key.startswith(lod + "_")


def order_lods(doc):
    """Moves lod1's group and its children before lod0's in the node list (and the scene), remapping every index."""
    nodes = doc["nodes"]
    names = [n["name"] for n in nodes]
    groups = {lod: names.index(lod) for lod in LODS}
    owner = {}
    for lod, g in groups.items():
        owner[g] = lod
        for child in nodes[g].get("children", []):
            owner[child] = lod
    rank = {"lod1": 0, "lod0": 1}
    order = sorted(range(len(nodes)), key=lambda i: (rank.get(owner.get(i), 2), i))
    new = {old: n for n, old in enumerate(order)}
    doc["nodes"] = [nodes[i] for i in order]
    for node in doc["nodes"]:
        if "children" in node:
            node["children"] = [new[c] for c in node["children"]]
    for scene in doc.get("scenes", []):
        scene["nodes"] = sorted((new[c] for c in scene["nodes"]))


def rename_nodes(path):
    """Strips the level prefix off every node name ("lod1_wheel_front" becomes "wheel_front") and checks no node is turned."""
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    rest = data[20 + length:]
    for node in doc["nodes"]:
        for lod in LODS:
            if node["name"].startswith(lod + "_"):
                node["name"] = node["name"][len(lod) + 1:]
        if "rotation" in node or "matrix" in node:
            raise SystemExit(f"{path}: node {node['name']} is turned")
    order_lods(doc)
    for mesh in doc.get("meshes", []):
        for lod in LODS:
            if mesh.get("name", "").startswith(lod + "_"):
                mesh["name"] = mesh["name"][len(lod) + 1:]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + len(rest))
    out += struct.pack("<II", len(text), 0x4E4F534A) + text + rest
    open(path, "wb").write(out)
    return len(out)


def caliper(k, disc, radius, angle, size=(0.05, 0.06, 0.11), mat="caliper", pistons=True):
    """A caliper straddling a disc at `disc` (its centre on the axle), at `angle` from straight ahead up over the top."""
    x, y, z = disc
    r = radius * 0.86
    at = (x, y + math.sin(angle) * r, z + math.cos(angle) * r)
    roll = math.pi / 2 - angle
    k.box(size, at, mat, rot=(roll, 0, 0), bevel=0.012)
    if pistons and not k.low:
        # Piston bulges on the outer face, along the rim
        for t in (-0.28, 0.28):
            tz = math.cos(angle + math.pi / 2) * size[2] * t
            ty = math.sin(angle + math.pi / 2) * size[2] * t
            out = 1 if x > 0 else -1
            k.cylinder(0.019, 0.012, (x + out * (size[0] / 2 + 0.004), at[1] + ty, at[2] + tz), mat, axis="x", seg=10)


def usd_fork(k, side, axle, top, outer_r, inner_r, outer_mat, inner_mat="chrome", lug_mat="dark_metal", split=0.42, cap_mat="dark_metal",
             disc=None, caliper_angle=math.radians(205), caliper_size=(0.05, 0.06, 0.11), x=0.1, guard=None, adjuster=None):
    """One upside-down fork leg from the axle lug to above the top yoke; `disc` is (x, radius) of the disc it brakes."""
    a = (side * x, axle[0], axle[1])
    b = (side * x, top[0], top[1])
    # Axle lug and the caliper mount behind it
    k.box((outer_r * 2.5, 0.075, 0.07), along(a, b, 0.01), lug_mat, bevel=0.012)
    k.rod(along(a, b, 0.03), along(a, b, split + 0.04), inner_r, inner_mat, seg=14)
    # Dust seal and the fat outer tube, its foot a shade wider
    k.rod(along(a, b, split - 0.01), along(a, b, split + 0.03), outer_r * 1.08, "dark_metal", seg=14)
    k.rod(along(a, b, split + 0.03), b, outer_r, outer_mat, seg=16)
    k.rod(b, along(a, b, 1.03), outer_r * 0.86, cap_mat, seg=12)
    if adjuster:
        k.cylinder(outer_r * 0.5, 0.012, along(a, b, 1.04), adjuster, rot=tilt(a, b), seg=10)
    if guard:
        # A shield on the outer side of the slider
        out = Vector((side * inner_r * 0.9, 0, 0))
        k.rod(tuple(Vector(along(a, b, 0.05)) + out), tuple(Vector(along(a, b, split - 0.02)) + out), inner_r * 1.35, guard, seg=8)
    if disc:
        dx, dr = disc
        # Bracket from the lug to the caliper, then the caliper on the disc
        ca = caliper_angle
        cr = dr * 0.86
        cat = (side * dx, axle[0] + math.sin(ca) * cr, axle[1] + math.cos(ca) * cr)
        k.beam((side * (x - 0.005), axle[0] + 0.01, axle[1] - 0.02), (side * (dx + 0.03), cat[1], cat[2]), (0.02, 0.03), lug_mat, bevel=0.004)
        caliper(k, (side * dx, axle[0], axle[1]), dr, ca, size=caliper_size)


def tilt(a, b):
    """The Euler (x only) that stands a part along the line a-b in the bike's side plane."""
    return (math.atan2(b[2] - a[2], b[1] - a[1]), 0, 0)


def yokes(k, x, axle, top, width, mat="dark_metal", lower=0.78):
    """Top and bottom yokes and the stem between the fork legs, as part of the body."""
    lean = math.atan2(axle[1] - top[1], top[0] - axle[0])
    for t, deep, h in ((1.0, 0.035, 0.08), (lower, 0.045, 0.09)):
        y, z = axle[0] + (top[0] - axle[0]) * t, axle[1] + (top[1] - axle[1]) * t
        k.box((x * 2 + width, deep, h), (0, y, z - 0.025), mat, rot=(lean, 0, 0), bevel=0.012)
    k.rod((-x - 0.012, axle[0], axle[1]), (x + 0.012, axle[0], axle[1]), 0.012, "steel", seg=8)


def lever_set(k, grip, side, root_x, bent=None):
    """Grip, bar-end weight, lever, perch and switch block on a straight bar. `bent` names the
    finish of a lever's tip that a fall has snapped short and kinked."""
    g = Vector((side * grip[0], grip[1], grip[2]))
    out = Vector((side, 0, 0))
    ahead = Vector((0, -0.2, 1)).normalized()
    k.rod(g - out * 0.065, g + out * 0.06, 0.018, "rubber", seg=10)
    k.rod(g + out * 0.06, g + out * 0.08, 0.02, "steel_dark", seg=10)
    k.box((0.045, 0.04, 0.05), g - out * 0.095, "dark_metal", bevel=0.008)
    if bent:
        knee = g + out * 0.005 + ahead * 0.062
        k.rod(g - out * 0.11 + ahead * 0.035, knee, 0.006, "steel", seg=5)
        keep, k.keep = k.keep, True
        k.rod(knee, knee + out * 0.02 + ahead * 0.03 + Vector((0, 0.014, 0)), 0.0065, bent, seg=5)
        k.keep = keep
    else:
        k.rod(g - out * 0.11 + ahead * 0.035, g + out * 0.05 + ahead * 0.07, 0.006, "steel", seg=5)
    if side > 0:
        # Front brake master cylinder and its reservoir
        k.cylinder(0.016, 0.05, g - out * 0.135 + Vector((0, 0.005, 0.02)), "dark_metal", axis="x", seg=8)
        k.box((0.04, 0.03, 0.03), g - out * 0.15 + Vector((0, 0.045, 0.0)), "steel_dark", bevel=0.006)


def mirror(k, root, head, size=(0.06, 0.042), mat="dark_metal", shape="rect"):
    """A mirror on a stalk each side: `root` and `head` for the right side."""
    for side in (-1, 1):
        a = Vector((side * root[0], root[1], root[2]))
        b = Vector((side * head[0], head[1], head[2]))
        k.tube([a, a.lerp(b, 0.55) + Vector((0, 0.02, 0)), b], 0.007, mat, seg=5, smooth=2)
        w, h = size
        c = b + Vector((side * w * 0.3, 0, 0))
        round_ = 2.4 if shape == "rect" else 2.0
        k.loft([(c.z - 0.016, c.y - h * 0.5, c.y + h * 0.5, w * 0.5, round_, round_, 0.5, 1, 1, c.x),
                (c.z - 0.008, c.y - h, c.y + h, w, 3.2, 3.2, 0.5, 1, 1, c.x),
                (c.z + 0.006, c.y - h * 0.95, c.y + h * 0.95, w * 0.95, 3.2, 3.2, 0.5, 1, 1, c.x),
                (c.z + 0.008, c.y - h * 0.9, c.y + h * 0.9, w * 0.9, 3.2, 3.2, 0.5, 1, 1, c.x)], mat, ring=12, steps=1)
        k.box((w * 1.75, h * 1.75, 0.004), (c.x, c.y, c.z - 0.0165), "chrome", bevel=0)


def indicator(k, root, tip, mat="signal", stalk="dark_metal", radius=0.012):
    k.rod(root, along(root, tip, 0.65), radius * 0.55, stalk, seg=6)
    k.rod(along(root, tip, 0.6), tip, radius, mat, seg=8, top=radius * 0.8)


def plate(k, centre, size=(0.2, 0.15), lean=0.25):
    """A blank number plate facing back, leaning back at the top by `lean`."""
    k.box((size[0], size[1], 0.006), centre, "plate", rot=(lean, 0, 0), bevel=0)


def previews(k, name, height=0.7, reach=1.0, extra=None):
    """With TWISTY_PREVIEW set to a directory, renders the finished model there: both sides,
    the front and rear three-quarters, and the distant model. TWISTY_QUICK=1 renders two views only;
    TWISTY_VIEWS=<names with commas> renders those views of the near model only (and the distant model with `lod1` among them)."""
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    os.makedirs(out, exist_ok=True)
    d = 4.9 * reach
    # Named by the rider's side: the rider's right is -x in the game's axes
    views = {
        "right": ((-d, height + 0.05, 0.0), (0, height, 0.0)),
        "left": ((d, height + 0.05, 0.0), (0, height, 0.0)),
        "front-right": ((-d * 0.55, 1.45, d * 0.72), (0, height - 0.05, 0.05)),
        "front-left": ((d * 0.55, 1.45, d * 0.72), (0, height - 0.05, 0.05)),
        "rear-right": ((-d * 0.55, 1.6, -d * 0.72), (0, height - 0.05, -0.05)),
        "rear-left": ((d * 0.55, 1.6, -d * 0.72), (0, height - 0.05, -0.05)),
        "front": ((0.0, height + 0.25, d * 0.9), (0, height, 0.0)),
    }
    # For the look only (the file is written): the screen as clear plastic, as the game draws it
    glass = bpy.data.materials.get("glass")
    if glass:
        shader = glass.node_tree.nodes["Principled BSDF"]
        shader.inputs["Alpha"].default_value = 0.3
    views.update(extra or {})
    quick = os.environ.get("TWISTY_QUICK")
    only = [name for name in os.environ.get("TWISTY_VIEWS", "").split(",") if name]
    k.show("lod0")
    for view, (eye, target) in views.items():
        if only and view not in only:
            continue
        if quick and view not in ("right", "front-left", "front"):
            continue
        render(k.scene, os.path.join(out, f"{name}-lod0-{view}.png"), eye, target, size=(960, 645) if quick else (1280, 860), lens=50)
    if quick or (only and "lod1" not in only):
        return
    k.show("lod1")
    for view in ("right", "front-left"):
        eye, target = views[view]
        render(k.scene, os.path.join(out, f"{name}-lod1-{view}.png"), eye, target, size=(1280, 860), lens=50)
    k.show("lod0")


def wheel(k, centre, radius, width, rim, spokes="wire", count=32, hub=0.055, seg=None, pair=False, sweep=0.0, rim_mat="rim", spoke_mat=None, tread=True,
          hub_width=None, blade=1.0, knobs=0.0):
    """A road wheel spinning on x: tyre, rim, and either `count` wire spokes laced to the rim's shoulders or `count` cast blades.
    `knobs` (metres) cuts a block tread that deep between staggered knobs, on finer segments, for a dual-purpose or
    off-road tyre: the knobs' tops stay at `radius`, so the wheel stands where it stood.

    Built at full shape in the distant model too (fewer segments only), since
    the wheel is how a bike is known: a spoked wheel stays spoked."""
    low = k.low
    k.low = False
    try:
        cx, cy, cz = centre
        seg = seg or (24 if low else (96 if knobs else 48))
        tube = rim + 0.4 * (radius - rim)
        steps = 6 if low else 10
        profile = [(rim - 0.004, -0.34 * width), (rim + 0.012, -0.41 * width)]
        for j in range(steps + 1):
            a = math.radians(-90 + 180 * j / steps)
            profile.append((tube + (radius - tube) * math.cos(a), math.sin(a) * width / 2))
        profile += [(rim + 0.012, 0.41 * width), (rim - 0.004, 0.34 * width)]

        def groove(i, j):
            row = j - 2
            if knobs and tread and not low:
                # Blocks two segments long with gaps two long, each pair of rows shifted half a block from the next;
                # the bead rows and the outermost shoulder rows stay whole
                if row < 1 or row > steps - 1:
                    return 0.0
                shift = 0 if (row // 2) % 2 == 0 else 2
                return 0.0 if (i + shift) % 4 in (0, 1) else -knobs
            if not tread or low or row < 2 or row > steps - 2 or row == steps // 2:
                return 0.0
            lean = row if row < steps // 2 else steps - row
            return -0.006 if (i + lean) % 6 in (0, 1) else 0.0

        k.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=25 if knobs and not low else 50)
        w = width
        barrel = [(rim + 0.006, -0.4 * w), (rim + 0.007, -0.45 * w), (rim - 0.02, -0.42 * w), (rim - 0.03, -0.18 * w),
                  (rim - 0.03, 0.18 * w), (rim - 0.02, 0.42 * w), (rim + 0.007, 0.45 * w), (rim + 0.006, 0.4 * w)]
        k.lathe(barrel, centre, rim_mat, axis="x", seg=seg, sharp=40)
        inner = rim - 0.028
        if spokes == "wire":
            # Hub with a flange each side, spokes from the flanges out to the
            # rim's shoulders, crossing each other
            k.lathe([(0, -0.065), (0.03, -0.065), (0.03, -0.05), (hub, -0.045), (hub, -0.03), (0.034, -0.025), (0.034, 0.025), (hub, 0.03), (hub, 0.045),
                     (0.03, 0.05), (0.03, 0.065), (0, 0.065)], centre, "dark_metal", axis="x", seg=16 if low else 24)
            n = count // 2 if low else count
            for i in range(n):
                side = 1 if i % 2 else -1
                a = 2 * math.pi * i / n
                b = a + (0.55 if (i // 2) % 2 else -0.55)
                start = (cx + side * 0.04, cy + math.cos(a) * hub * 0.85, cz + math.sin(a) * hub * 0.85)
                end = (cx + side * 0.36 * w, cy + math.cos(b) * (rim - 0.012), cz + math.sin(b) * (rim - 0.012))
                k.tube([start, end], 0.0026, spoke_mat or "chrome", seg=3 if low else 4, cap=False)
            return
        # Cast: `count` blades (or pairs) from the hub to the rim, swept by `sweep` radians
        hw = hub_width if hub_width else width * 0.4
        k.lathe([(0, -hw), (hub, -hw), (hub * 1.2, -0.015), (hub * 1.2, 0.015), (hub, hw), (0, hw)],
                centre, rim_mat, axis="x", seg=12 if low else 20)
        for i in range(count):
            base = 2 * math.pi * i / count
            for off in ((-0.07, 0.07) if pair else (0.0,)):
                a0, a1 = base + off * 0.5, base + off + sweep
                ends = ((a0, hub * 1.05, 0.016 * blade, 0.022), (a1, inner + 0.006, 0.01 * blade, 0.012 * blade))
                verts = []
                for a, r, half, deep in ends:
                    out = Vector((0, math.cos(a), math.sin(a)))
                    tang = Vector((0, -math.sin(a), math.cos(a)))
                    for dx in (-deep, deep):
                        for dt in (-half, half):
                            verts.append(Vector(centre) + out * r + tang * dt + Vector((dx, 0, 0)))
                faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
                k.emit(verts, faces, spoke_mat or rim_mat, bevel=0 if low else 0.004)
    finally:
        k.low = low


def panel(k, outline, x, thick, mat, toe=0.0, about=None, **kw):
    """Kit.panel turned by `toe` about its own middle, not about z = 0, so it stays at `x` where it is drawn.
    A graphic or a mark laid on a turned panel passes the panel's middle as `about`, so it lies on the panel's plane:
    turned about its own middle, it stood off a toed panel by the toe times the distance between the two middles."""
    mid = sum(z for z, _ in outline) / len(outline) if about is None else about
    return k.panel(outline, x - mid * math.sin(toe), thick, mat, toe=toe, **kw)


def _resample(points, n):
    """`n` + 1 points spaced evenly by length along a polyline of (z, y) points."""
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    total = lengths[-1] or 1.0
    out = []
    j = 0
    for i in range(n + 1):
        want = total * i / n
        while j < len(points) - 2 and lengths[j + 1] < want:
            j += 1
        span = (lengths[j + 1] - lengths[j]) or 1.0
        t = min(1.0, max(0.0, (want - lengths[j]) / span))
        out.append(tuple(p + (q - p) * t for p, q in zip(points[j], points[j + 1])))
    return out


def coons(k, top, bottom, front, rear, xfn, mat, nu=12, nv=8, thick=0.01, smooth=4, **kw):
    """A panel filling a side-view outline of four edges, each a list of (z, y) points: `top` and
    `bottom` run front to rear, `front` and `rear` top to bottom, and they meet at the corners.
    `xfn(s, t, z, y)` gives the panel's distance across (s along 0..1 front to rear, t down
    0..1 top to bottom); a negative x draws the panel on the other side."""
    from bike_kit import spline
    edges = [_resample(spline(edge, smooth), n) for edge, n in ((top, nu), (bottom, nu), (front, nv), (rear, nv))]
    T, Bo, F, R = edges

    def at(u, v):
        i, j = round(u * nu), round(v * nv)
        p = []
        for c in range(2):
            p.append((1 - v) * T[i][c] + v * Bo[i][c] + (1 - u) * F[j][c] + u * R[j][c]
                     - ((1 - u) * (1 - v) * T[0][c] + u * (1 - v) * T[-1][c] + (1 - u) * v * Bo[0][c] + u * v * Bo[-1][c]))
        z, y = p
        return (xfn(u, v, z, y), y, z)

    return k.sheet(at, mat, nu=nu, nv=nv, thick=thick, **kw)


def band(k, top, bottom, f, side, mat, nu=12, nv=1, lift=0.008, thick=0.004, **kw):
    """A thin strip lying on a side panel whose distance across is `f(z, y)`: between a `top` and a
    `bottom` edge of (z, y) points, both front to rear, its middle `lift` off the panel's middle
    (clear of a panel up to twice (lift - thick / 2) thick)."""
    front = [top[0], bottom[0]]
    rear = [top[-1], bottom[-1]]
    return coons(k, top, bottom, front, rear, lambda u, v, z, y: side * (f(z, y) + lift), mat, nu=nu, nv=nv, thick=thick, smooth=2, **kw)


def smooth(points, steps=8):
    """A curve through 3D knots as a polyline, knot i at index i * steps, so that a piece cut
    between two knots (`piece`) lies exactly on the whole curve: two panels that share a feature
    line share its points."""
    from bike_kit import spline
    return spline([tuple(p) for p in points], steps)


def piece(curve, first, last, steps=8):
    """The part of a `smooth` curve from knot `first` to knot `last`."""
    return curve[first * steps:last * steps + 1]


def _on(line, t):
    """The point a share `t` of the way along a polyline, by length."""
    lengths = [0.0]
    for a, b in zip(line, line[1:]):
        lengths.append(lengths[-1] + math.dist(a, b))
    total = lengths[-1]
    if total < 1e-9:
        return Vector(line[0])
    want = total * min(1.0, max(0.0, t))
    for j in range(len(line) - 1):
        if lengths[j + 1] >= want:
            span = (lengths[j + 1] - lengths[j]) or 1.0
            return Vector(line[j]).lerp(Vector(line[j + 1]), (want - lengths[j]) / span)
    return Vector(line[-1])


class Patch:
    """A panel between four feature lines in space (polylines of (x, y, z) points): `top` and
    `bottom` run front to rear, `front` and `rear` top to bottom, and they meet at the corners.
    An edge may be one point twice, for a three-sided panel. `bulge` swells its middle along `way`.
    Drawn on the +x side as written; `skin` draws either side."""

    def __init__(self, top, bottom, front, rear, bulge=0.0, way=(1, 0, 0), out=(1.0, 0.4, 0.8)):
        self.edges = (top, bottom, front, rear)
        self.corners = [Vector(p) for p in (top[0], top[-1], bottom[0], bottom[-1])]
        self.bulge, self.way, self.out = bulge, Vector(way), Vector(out)

    def point(self, u, v):
        top, bottom, front, rear = self.edges
        a, b, c, d = self.corners
        p = (1 - v) * _on(top, u) + v * _on(bottom, u) + (1 - u) * _on(front, v) + u * _on(rear, v)
        p -= (1 - u) * (1 - v) * a + u * (1 - v) * b + (1 - u) * v * c + u * v * d
        return p + self.way * (self.bulge * 16 * u * (1 - u) * v * (1 - v))

    def normal(self, u, v):
        e = 0.01
        u0, v0 = min(max(u, e), 1 - e), min(max(v, e), 1 - e)
        n = (self.point(u0 + e, v0) - self.point(u0 - e, v0)).cross(self.point(u0, v0 + e) - self.point(u0, v0 - e))
        if n.length < 1e-12:
            return self.out.normalized()
        n.normalize()
        return n if n.dot(self.out) >= 0 else -n

    def at(self, u, v, lift=0.0):
        p = self.point(u, v)
        return p + self.normal(u, v) * lift if lift else p


class Strip:
    """A part of a patch between two lines drawn in the patch's own (u, v): a lamp, a blade or a
    slot that lies on the panel and follows its shape."""

    def __init__(self, patch, top, bottom):
        self.patch, self.top, self.bottom = patch, [tuple(p) + (0.0,) for p in top], [tuple(p) + (0.0,) for p in bottom]

    def at(self, u, v, lift=0.0):
        a, b = _on(self.top, u), _on(self.bottom, u)
        return self.patch.at(a.x + (b.x - a.x) * v, a.y + (b.y - a.y) * v, lift)


def skin(k, patch, mat, side=1, nu=8, nv=4, thick=0.008, lift=0.0, **kw):
    """Draws a `Patch` or a `Strip` as a sheet, `lift` off the panel along its normal, on the side `side`."""
    def at(u, v):
        p = patch.at(u, v, lift)
        return (side * p.x, p.y, p.z)

    return k.sheet(at, mat, nu=nu, nv=nv, thick=thick, **kw)
