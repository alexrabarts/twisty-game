# The far levels, made from the finished files by one rule each, so a new bike
# or a new cut of the rider gets its own with no code:
#   assets/bikes/far/<id>.glb   a detailed bike as the touring crew ride it
#                               (js/bikemodels.js, crew), from the `lod1` of
#                               assets/bikes/detail/<id>.glb
#   assets/bikes/rider_far.glb  every node of assets/bikes/rider.glb again,
#                               light, for the crew and for a rider far away
# A bike script calls bike() when it has written its file, and rider.py calls
# rider(). Run alone, this makes them all from the files as they stand:
#   blender --background --factory-startup --python tools/blender/far.py
#
# A far bike has the nodes body (with the forks, the bar and the headlight
# folded in), wheel_front and wheel_rear (each with its disc), brake_light,
# luggage where the bike carries any, and the marks grip, peg and seat. It
# keeps its detail file's handedness (BIKE_MODELS `mirror`).
#   1. Parts no longer than DROP_M are left out (bolts, levers, cables),
#      unless they are lit.
#   2. Each tyre is turned again from its own profile, so it stays round; a
#      tyre cut down by collapsing edges wobbles as it spins.
#   3. Materials of one colour count as one. A node keeps its paint, its
#      lit and its see-through materials and its largest other colours,
#      MATERIALS at most; each of the rest takes the kept material nearest
#      in colour. Each material is a draw call.
#   4. What is left is cut down by collapsing edges, by one share for the
#      whole bike, to BIKE_TARGET triangles. The occlusion of each new corner
#      is that of the nearest old one.
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

DETAIL = os.path.join(common.ASSETS, "bikes", "detail")
FAR = os.path.join(common.ASSETS, "bikes", "far")
RIDER = os.path.join(common.ASSETS, "bikes", "rider.glb")
RIDER_FAR = os.path.join(common.ASSETS, "bikes", "rider_far.glb")

# Five of the crew, each with a light rider, are in the window's 450 000 triangles with everything else: at this
# budget the five cost about 3 000 more than five of the procedural bikes they stand in for (world-budget)
BIKE_BUDGET = 2300
BIKE_TARGET = 2050
BIKE_BYTES = 72 * 1024
DROP_M = 0.1
MATERIALS = 8
# Never merged into another, and never dropped for their size
LIT = ("headlight", "brake", "brake_light")
OWN = LIT + ("paint", "glass")
# What each node of a far bike is made of
FOLD = {
    "body": ("body", "fork_left", "fork_right", "handlebar", "headlight"),
    "wheel_front": ("wheel_front", "disc_front"),
    "wheel_rear": ("wheel_rear", "disc_rear"),
    "brake_light": ("brake_light",),
    "luggage": ("luggage",),
}
WHEELS = ("wheel_front", "wheel_rear")
TYRE_SEGMENTS = 16
TYRE_STATIONS = 3

# The share of a rider node's triangles its far twin keeps, and the fewest a node is cut to
RIDER_SHARE = 0.2
RIDER_LEAST = 24
# A rider in any outfit, seated, at most; the file with every cut
RIDER_BUDGET = 1500
RIDER_BYTES = 176 * 1024
# A mark laid on a jacket or a helmet is an open sheet 3 mm proud of it. The shell under it moves as it is cut
# down, so the mark stands this much further out, or the shell would bury it.
MARK_LIFT_M = 0.006

UNIT = 0.0005
SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
FORMATS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}


def read(path):
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length]), data[20 + length + 8:]


def values(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    width = SIZES[accessor["type"]]
    code = FORMATS[accessor["componentType"]]
    stride = view.get("byteStride", width * struct.calcsize("<" + code))
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from(f"<{width}{code}", binary, start + i * stride) for i in range(accessor["count"])]


# A node of a file as triangles in the file's own axes: [(material, [three (point, shade)])], with the node's place
def triangles(doc, binary, node, at=(0.0, 0.0, 0.0)):
    unit = node.get("scale", [1.0])[0]
    place = [a + b for a, b in zip(at, node.get("translation", (0.0, 0.0, 0.0)))]
    out = []
    for prim in doc["meshes"][node["mesh"]]["primitives"]:
        points = [tuple(c * unit + p for c, p in zip(v, place)) for v in values(doc, binary, prim["attributes"]["POSITION"])]
        if "COLOR_0" in prim["attributes"]:
            accessor = doc["accessors"][prim["attributes"]["COLOR_0"]]
            scale = {5126: 1.0, 5123: 65535.0, 5121: 255.0}[accessor["componentType"]]
            shades = [v[0] / scale for v in values(doc, binary, prim["attributes"]["COLOR_0"])]
        else:
            shades = [1.0] * len(points)
        index = [v[0] for v in values(doc, binary, prim["indices"])] if "indices" in prim else list(range(len(points)))
        name = doc["materials"][prim["material"]]["name"]
        for i in range(0, len(index), 3):
            out.append((name, [(points[j], shades[j]) for j in index[i:i + 3]]))
    return out, place


# Triangles as one welded shape: points, their shades, faces (three point numbers) and each face's material
class Shape:
    def __init__(self, tris):
        self.points, self.shades, self.faces, self.names = [], [], [], []
        seen = {}
        for name, corners in tris:
            face = []
            for point, shade in corners:
                key = tuple(round(c / 0.0001) for c in point)
                if key not in seen:
                    seen[key] = len(self.points)
                    self.points.append(point)
                    self.shades.append(shade)
                else:
                    self.shades[seen[key]] = min(self.shades[seen[key]], shade)
                face.append(seen[key])
            if len(set(face)) == 3:
                self.faces.append(tuple(face))
                self.names.append(name)

    # The number of the connected part each face belongs to
    def islands(self):
        parent = list(range(len(self.points)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for a, b, c in self.faces:
            ra, rb, rc = find(a), find(b), find(c)
            parent[rb] = ra
            parent[find(rc)] = ra
        return [find(face[0]) for face in self.faces]

    def keep(self, wanted):
        tris = [(name, [(self.points[i], self.shades[i]) for i in face]) for face, name, yes in zip(self.faces, self.names, wanted) if yes]
        return Shape(tris)

    def area(self, face):
        a, b, c = (Vector(self.points[i]) for i in face)
        return (b - a).cross(c - a).length / 2

    def tris(self):
        return [(name, [(self.points[i], self.shades[i]) for i in face]) for face, name in zip(self.faces, self.names)]


# Rule 1: the shape without its small parts
def without_small(shape, limit=DROP_M):
    island = shape.islands()
    box = {}
    lit = set()
    for face, name, part in zip(shape.faces, shape.names, island):
        lo, hi = box.setdefault(part, ([math.inf] * 3, [-math.inf] * 3))
        for i in face:
            for axis in range(3):
                lo[axis] = min(lo[axis], shape.points[i][axis])
                hi[axis] = max(hi[axis], shape.points[i][axis])
        if name in LIT:
            lit.add(part)
    small = {part for part, (lo, hi) in box.items() if max(h - l for l, h in zip(lo, hi)) < limit and part not in lit}
    return shape.keep([part not in small for part in island])


# Rule 3: each face's material after the small ones are merged into the kept one nearest in colour. Materials of one
# colour (within SAME_COLOUR, as metal or not) count as one first: a bike's several near-blacks (frame, trim, rubber,
# casing) took four of the six places by area and left out its white plate, white panels, chrome and gold, which
# then took black (the owner: "check the low quality models match the high quality ones")
SAME_COLOUR = 0.012


def merged(shape, colours, most=MATERIALS):
    area = {}
    for face, name in zip(shape.faces, shape.names):
        area[name] = area.get(name, 0.0) + shape.area(face)

    def apart(a, b):
        return sum((p - q) ** 2 for p, q in zip(colours[a][:3], colours[b][:3])) + 0.25 * (colours[a][3] - colours[b][3]) ** 2

    # One colour's materials, each led by its largest (a lit, paint or glass material leads its own)
    lead = {}
    for name in sorted(area, key=lambda name: (name not in OWN, -area[name], name)):
        if name in OWN:
            lead[name] = name
            continue
        same = next((other for other in sorted(set(lead.values())) if other not in LIT and other != "glass" and apart(name, other) < SAME_COLOUR), None)
        lead[name] = same or name
    total = {}
    for name, a in area.items():
        total[lead[name]] = total.get(lead[name], 0.0) + a
    ranked = sorted(total, key=lambda name: (-total[name], name))
    kept = [name for name in ranked if name in OWN]
    for name in ranked:
        if len(kept) >= most:
            break
        if name not in kept:
            kept.append(name)
    plain = [name for name in kept if name not in LIT and name != "glass"] or kept

    def nearest(name):
        return min(plain, key=lambda other: (apart(name, other), other))

    swap = {name: lead[name] if lead[name] in kept else nearest(name) for name in area}
    return [swap[name] for name in shape.names]


# Rule 2: a wheel's tyre turned again from its profile. The tyre is the material of the wheel's outermost point;
# the wheel turns about x through `axle` (y, z). Returns the new tyre's triangles and the wheel's other faces.
def tyre(shape, axle):
    def radius(point):
        return math.hypot(point[1] - axle[0], point[2] - axle[1])

    reach = [max(radius(shape.points[i]) for i in face) for face in shape.faces]
    rubber = shape.names[max(range(len(reach)), key=lambda n: (reach[n], -n))]
    on = sorted({i for face, name in zip(shape.faces, shape.names) if name == rubber for i in face})
    xs = [shape.points[i][0] for i in on]
    x0, x1 = min(xs), max(xs)
    bead = min(radius(shape.points[i]) for i in on)
    step = (x1 - x0) / (TYRE_STATIONS - 1)
    # The bead sits flush with the side, so each sidewall is a flat ring facing out along the axle: a bead set in
    # tilted it towards the axle, and on a tall narrow tyre most of the tyre then faced into the wheel
    profile = [(x0, bead)]
    for n in range(TYRE_STATIONS):
        x = x0 + step * n
        near = [radius(shape.points[i]) for i in on if abs(shape.points[i][0] - x) <= step / 2]
        profile.append((x, max(near) if near else bead))
    profile.append((x1, bead))
    count = len(profile)
    points = []
    for s in range(TYRE_SEGMENTS):
        t = 2 * math.pi * s / TYRE_SEGMENTS
        points += [(x, axle[0] + r * math.cos(t), axle[1] + r * math.sin(t)) for x, r in profile]
    # The profile runs +x along the tread and the segments turn the right way about +x, so a face wound
    # n, m then the next segment would face the axle: the tread is wound the other way round, to face out
    tris = []
    for s in range(TYRE_SEGMENTS):
        a, b = s * count, ((s + 1) % TYRE_SEGMENTS) * count
        for n in range(count):
            m = (n + 1) % count
            for face in ((a + n, b + m, a + m), (a + n, b + n, b + m)):
                tris.append((rubber, [(points[i], 1.0) for i in face]))
    rest = shape.keep([name != rubber for name in shape.names])
    return tris, rest, shape.keep([name == rubber for name in shape.names])


# Rule 4: the shape cut down to `share` of its triangles by collapsing edges. Returns triangles whose corners
# carry a normal: [(material, [three (point, normal, shade)])]. `source` gives the occlusion (the shape itself
# when left out); `sharp` is the angle in degrees over which an edge stays hard.
def cut(shape, share, names=None, source=None, sharp=60, outward=None):
    names = names or shape.names
    if not shape.faces:
        return []
    order = sorted(set(names))
    mesh = bpy.data.meshes.new("far")
    mesh.from_pydata(shape.points, [], shape.faces)
    mesh.polygons.foreach_set("material_index", [order.index(name) for name in names])
    for name in order:
        mesh.materials.append(bpy.data.materials.get(f"far:{name}") or bpy.data.materials.new(f"far:{name}"))
    mesh.update()
    obj = bpy.data.objects.new("far", mesh)
    bpy.context.scene.collection.objects.link(obj)
    if share < 1:
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = share
        modifier.use_collapse_triangulate = True
        common.apply_modifiers(obj)
    mesh = obj.data
    mesh.validate()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.set_sharp_from_angle(angle=math.radians(sharp))
    mesh.calc_loop_triangles()
    from_shape = source or shape
    tree = kdtree.KDTree(len(from_shape.points))
    for i, point in enumerate(from_shape.points):
        tree.insert(point, i)
    tree.balance()
    normals = mesh.corner_normals
    out = []
    for tri in mesh.loop_triangles:
        corners = []
        for loop, vertex in zip(tri.loops, tri.vertices):
            point = tuple(mesh.vertices[vertex].co)
            normal = tuple(normals[loop].vector)
            if outward and sum(n * (p - o) for n, p, o in zip(normal, point, outward)) < 0:
                normal = tuple(-n for n in normal)
            corners.append((point, normal, from_shape.shades[tree.find(point)[1]]))
        out.append((order[tri.material_index], corners))
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    return out


# Writes nodes as one flat file: {name: (place, triangles with normals)} and bare marks {name: place}. Positions
# are whole UNITs in signed shorts about the node's place, normals and occlusion bytes (bike_kit.pack_colours).
def write(path, nodes, marks, materials):
    # One view for each kind of data, which every accessor reads from its own offset: a view apiece was a third of
    # the rider's file in JSON
    blobs = {"position": bytearray(), "normal": bytearray(), "colour": bytearray(), "index": bytearray()}
    order = list(blobs)
    accessors, meshes, listed, used = [], [], [], []

    def add(kind, blob, **accessor):
        at = len(blobs[kind])
        blobs[kind] += blob + b"\0" * (-len(blob) % 4)
        accessors.append({"bufferView": order.index(kind), "byteOffset": at, **accessor})
        return len(accessors) - 1

    for name in sorted(nodes):
        place, tris = nodes[name]
        # A node's primitives read one set of corners, each through its own index
        seen = {}
        index = {}
        for material, corners in tris:
            for point, normal, shade in corners:
                whole = tuple(round((c - p) / UNIT) for c, p in zip(point, place))
                if max(abs(c) for c in whole) > 32767:
                    raise SystemExit(f"{path}: {name} has a point further from its place than {32767 * UNIT} m")
                packed = tuple(max(-127, min(127, round(c * 127))) for c in normal)
                key = (whole, packed, max(0, min(255, round(shade * 255))))
                index.setdefault(material, []).append(seen.setdefault(key, len(seen)))
        keys = list(seen)
        wholes = [key[0] for key in keys]
        attributes = {
            "POSITION": add("position", b"".join(struct.pack("<3hxx", *w) for w in wholes), componentType=5122, count=len(keys), type="VEC3",
                            min=[min(w[c] for w in wholes) for c in range(3)], max=[max(w[c] for w in wholes) for c in range(3)]),
            "NORMAL": add("normal", b"".join(struct.pack("<3bx", *key[1]) for key in keys), componentType=5120, normalized=True, count=len(keys), type="VEC3"),
            "COLOR_0": add("colour", b"".join(struct.pack("<4B", key[2], key[2], key[2], 255) for key in keys), componentType=5121, normalized=True, count=len(keys), type="VEC4"),
        }
        code, kind = ("H", 5123) if len(keys) < 65536 else ("I", 5125)
        prims = []
        for material in sorted(index):
            if material not in used:
                used.append(material)
            indices = add("index", struct.pack(f"<{len(index[material])}{code}", *index[material]), componentType=kind, count=len(index[material]), type="SCALAR")
            prims.append({"attributes": attributes, "indices": indices, "material": used.index(material)})
        meshes.append({"name": name, "primitives": prims})
        listed.append({"name": name, "mesh": len(meshes) - 1, "translation": [float(f"{c:.7g}") for c in place], "scale": [UNIT] * 3})
    for name in sorted(marks):
        listed.append({"name": name, "translation": [float(f"{c:.7g}") for c in marks[name]]})
    views, offset = [], 0
    for kind, stride in (("position", 8), ("normal", 4), ("colour", None), ("index", None)):
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blobs[kind]), **({"byteStride": stride} if stride else {})})
        offset += len(blobs[kind])
    doc = {"asset": {"generator": "twisty tools/blender/far.py", "version": "2.0"}, "scene": 0, "scenes": [{"name": "Scene", "nodes": list(range(len(listed)))}],
           "nodes": listed, "materials": [materials[name] for name in used], "meshes": meshes, "accessors": accessors, "bufferViews": views,
           "buffers": [{"byteLength": offset}], "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"]}
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    body = b"".join(bytes(blobs[kind]) for kind in order)
    blob = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body))
    blob += struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(body), 0x004E4942) + body
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(blob)
    return len(blob)


def scene():
    if bpy.context.scene is None or not bpy.data.scenes:
        common.reset(1)


# The far file of the detailed bike at `path` (its `lod1`), written beside the detail folder
def bike(path):
    scene()
    name = os.path.splitext(os.path.basename(path))[0]
    doc, binary = read(path)
    group = next(node for node in doc["nodes"] if node["name"] == "lod1")
    at = group.get("translation", (0.0, 0.0, 0.0))
    children = {doc["nodes"][i]["name"]: doc["nodes"][i] for i in group["children"]}
    materials = {m["name"]: m for m in doc["materials"]}
    colours = {n: tuple(m.get("pbrMetallicRoughness", {}).get("baseColorFactor", (1, 1, 1, 1))[:3]) + (m.get("pbrMetallicRoughness", {}).get("metallicFactor", 1.0),)
               for n, m in materials.items()}
    marks = {n: [a + b for a, b in zip(at, node.get("translation", (0, 0, 0)))] for n, node in children.items() if "mesh" not in node}
    shapes, places, fixed = {}, {}, {}
    for target, sources in FOLD.items():
        if target not in children:
            if target == "luggage":
                continue
            raise SystemExit(f"{path}: lod1 has no {target}")
        tris = []
        for source in sources:
            if source in children:
                got, place = triangles(doc, binary, children[source], at)
                tris += got
                if source == target:
                    places[target] = place
        shape = Shape(tris)
        if target in WHEELS:
            # The axle is the middle of the wheel's own node, the tyre and rim without the disc
            own = Shape(triangles(doc, binary, children[target], at)[0])
            ys, zs = [p[1] for p in own.points], [p[2] for p in own.points]
            axle = ((min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
            turned, shape, old = tyre(shape, axle)
            fixed[target] = cut(Shape(turned), 1, source=old, sharp=40)
        if target != "brake_light":
            shape = without_small(shape)
        shapes[target] = shape
    held = sum(len(tris) for tris in fixed.values()) + len(shapes["brake_light"].faces)
    loose = sum(len(shape.faces) for name, shape in shapes.items() if name != "brake_light")
    share = min(1.0, (BIKE_TARGET - held) / max(1, loose))
    nodes = {}
    for target, shape in shapes.items():
        tris = cut(shape, 1.0 if target == "brake_light" else share, names=merged(shape, colours))
        nodes[target] = (places[target], tris + fixed.get(target, []))
    out = os.path.join(FAR, f"{name}.glb")
    size = write(out, nodes, marks, materials)
    counts = {n: len(tris) for n, (_, tris) in nodes.items()}
    total = sum(counts.values())
    print(f"far/{name}.glb: {total} triangles, {size} bytes", counts)
    if total > BIKE_BUDGET:
        raise SystemExit(f"{out}: {total} triangles is over the budget of {BIKE_BUDGET}")
    if size > BIKE_BYTES:
        raise SystemExit(f"{out}: {size} bytes is over the budget of {BIKE_BYTES}")
    return out


# An open sheet (a mark laid on a shell) has an edge only one face uses
def lifted(shape, lift=MARK_LIFT_M):
    island = shape.islands()
    uses = {}
    for face in shape.faces:
        for a, b in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            uses[(min(a, b), max(a, b))] = uses.get((min(a, b), max(a, b)), 0) + 1
    edge_of = {}
    for face, part in zip(shape.faces, island):
        for a, b in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            if uses[(min(a, b), max(a, b))] == 1:
                edge_of[part] = True
    normal = [Vector((0, 0, 0)) for _ in shape.points]
    for face, part in zip(shape.faces, island):
        if part not in edge_of:
            continue
        a, b, c = (Vector(shape.points[i]) for i in face)
        n = (b - a).cross(c - a)
        for i in face:
            normal[i] += n
    for i, n in enumerate(normal):
        if n.length > 0:
            shape.points[i] = tuple(Vector(shape.points[i]) + n.normalized() * lift)
    return shape


# Every node of the rider again, light, in a file of its own with the same names
def rider(path=RIDER, out=RIDER_FAR):
    scene()
    doc, binary = read(path)
    materials = {m["name"]: m for m in doc["materials"]}
    nodes, marks, counts = {}, {}, {}
    for node in doc["nodes"]:
        if "mesh" not in node:
            marks[node["name"]] = node.get("translation", [0.0, 0.0, 0.0])
            continue
        tris, place = triangles(doc, binary, node)
        source = Shape(tris)
        shape = lifted(Shape(tris))
        share = max(RIDER_SHARE, min(1.0, RIDER_LEAST / max(1, len(shape.faces))))
        nodes[node["name"]] = (place, cut(shape, share, source=source, sharp=100))
        counts[node["name"]] = len(nodes[node["name"]][1])
    size = write(out, nodes, marks, materials)

    def most(base):
        return max(n for name, n in counts.items() if name == base or name.startswith(base + "_"))

    pairs = sum(most(name) for name in ("upper_arm", "forearm", "thigh", "shin", "glove", "boot"))
    seated = most("torso") + counts["hump"] + counts["peak"] + counts["backpack"] + counts["neck"] + most("back") + most("helmet") + 2 * pairs
    print(f"rider_far.glb: seated at most {seated} triangles; {sum(counts.values())} in the file of {size} bytes", counts)
    if seated > RIDER_BUDGET:
        raise SystemExit(f"{out}: a seated rider of {seated} triangles is over the budget of {RIDER_BUDGET}")
    if size > RIDER_BYTES:
        raise SystemExit(f"{out}: {size} bytes is over the budget of {RIDER_BYTES}")
    return out


if __name__ == "__main__":
    common.reset(1)
    only = os.environ.get("TWISTY_FAR")
    for file in sorted(os.listdir(DETAIL)):
        if file.endswith(".glb") and (not only or only in file):
            bike(os.path.join(DETAIL, file))
    if not only or only == "rider":
        rider()
