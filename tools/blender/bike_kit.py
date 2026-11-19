# Modelling kit for the bikes and the rider (bike_*.py, rider.py). Shapes are
# written in the game's own axes (x across, y up, z forward, metres, ground at
# y = 0) and converted on the way into Blender, so a script reads against the
# numbers in js/vehicle.js. A model is a set of named nodes; each node becomes
# one mesh in the .glb, with a primitive per material, a translation (its
# pivot) and ambient occlusion baked into its vertex colours.
import json
import math
import os
import struct

import bmesh
import bpy
from mathutils import Matrix, Vector

import common

# Preview colours and surface values by material name. The game replaces the
# palette ones per character (js/bikemodels.js); the rest it uses as written.
MATERIALS = {
    "paint": (0xCC1111, 0.14, 0.68),
    "paint_dark": (0x3D0505, 0.32, 0.6),
    "accent": (0xFFFFFF, 0.18, 0.75),
    "chrome": (0xE4E6EA, 0.05, 1.0),
    "steel": (0x9AA0A6, 0.42, 0.95),
    "steel_dark": (0x55585E, 0.55, 0.9),
    "dark_metal": (0x17171C, 0.45, 0.75),
    "carbon": (0x121317, 0.35, 0.55),
    "rubber": (0x161616, 0.96, 0.0),
    "seat": (0x141418, 0.92, 0.0),
    "plastic": (0xE9E9EA, 0.5, 0.08),
    "trim": (0x1C1E22, 0.7, 0.3),
    "plate": (0xF5F5F0, 0.55, 0.05),
    "glass": (0x18242F, 0.04, 0.25),
    "headlight": (0xFFFFFF, 0.05, 0.3),
    "dash": (0x0C1016, 0.2, 0.2),
    "vent": (0x0A0A0C, 0.9, 0.1),
    "caliper": (0xC42020, 0.38, 0.55),
    "rim": (0xB6B9BF, 0.22, 0.92),
    "disc": (0xB9BCC2, 0.32, 1.0),
    "fork_gold": (0xB8923E, 0.3, 0.85),
    "copper": (0xA8643A, 0.32, 0.9),
    "spring": (0xC42020, 0.4, 0.5),
    "signal": (0xD88A1A, 0.2, 0.0),
    "luggage": (0x33373D, 0.5, 0.65),
    "pillion": (0x3C3F46, 0.85, 0.0),
    "reflector": (0xA01010, 0.3, 0.0),
    "brake": (0xC40B0B, 0.15, 0.2),
    "suit": (0x16161C, 0.85, 0.0),
    "suit_accent": (0xCC1111, 0.6, 0.15),
    "glove": (0x101014, 0.9, 0.0),
    "helmet": (0xF0F0F2, 0.12, 0.35),
    "helmet_accent": (0xCC1111, 0.2, 0.4),
    "visor": (0x0E1218, 0.06, 0.45),
    # The rider's gear that a character may colour apart from the suit
    "pants": (0x16161C, 0.85, 0.0),
    "pants_accent": (0xCC1111, 0.6, 0.15),
    "boot": (0x101014, 0.9, 0.0),
    "boot_accent": (0xCC1111, 0.6, 0.15),
    "helmet_trim": (0xB8693A, 0.2, 0.45),
    "backpack": (0x18191C, 0.8, 0.05),
}
# In a low-detail model the finishes that read alike from a distance are one
LOW = {"chrome": "steel", "fork_gold": "steel", "disc": "steel", "rim": "steel", "steel_dark": "dark_metal", "caliper": "dark_metal", "spring": "dark_metal",
       "vent": "dark_metal", "dash": "dark_metal", "carbon": "dark_metal", "plate": "dark_metal", "signal": "dark_metal"}
EMISSIVE = {"headlight": (0xFFFFEE, 0.85), "dash": (0x3FA8D6, 0.65), "signal": (0x9A5500, 0.4), "reflector": (0x550000, 0.5)}


def B(p):
    """A point in the game's axes as a Blender vector (Z up, -Y forward)."""
    return Vector((p[0], -p[2], p[1]))


def rgb(value):
    """An sRGB hex as the linear colour Blender's nodes take."""
    out = []
    for shift in (16, 8, 0):
        c = ((value >> shift) & 255) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def euler(rx=0.0, ry=0.0, rz=0.0):
    """three.js's default XYZ Euler as a matrix in the game's axes."""
    return Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rz, 4, "Z")


def spline(points, steps):
    """Catmull-Rom through tuples of numbers, `steps` pieces to a span."""
    if steps <= 1 or len(points) < 3:
        return [tuple(p) for p in points]
    out = []
    last = len(points) - 1
    for i in range(last):
        p0, p1, p2, p3 = points[max(i - 1, 0)], points[i], points[i + 1], points[min(i + 2, last)]
        for n in range(steps):
            t = n / steps
            out.append(tuple(
                0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3)
                for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(points[-1]))
    return out


# The way a folded side stand points from its hinge, in the bike's axes (x
# toward the stand's own side, y up, z forward): back along the bike, a little
# down and a little out
STAND_UP = (0.07, -0.33, -0.94)


# Where the end of a side stand is when it is folded: as far from `pivot` as
# its `foot` on the ground is, along STAND_UP on the stand's own side
def stand_up(pivot, foot):
    length = (Vector(foot) - Vector(pivot)).length
    side = -1 if pivot[0] < 0 else 1
    way = Vector((side * STAND_UP[0], STAND_UP[1], STAND_UP[2])).normalized()
    return tuple(Vector(pivot) + way * length)


class Kit:
    # `low` builds the wheels and discs with a fraction of their detail, for a
    # model seen from a distance
    def __init__(self, seed=7, colours=None, low=False):
        self.low = low
        self.scene = common.reset(seed)
        self.scene.cycles.samples = 48
        self.materials = {}
        self.nodes = {}
        self.pivots = {}
        self.node = None
        self.colours = dict(MATERIALS)
        for name, value in (colours or {}).items():
            self.colours[name] = (value,) + MATERIALS[name][1:]

    def material(self, name):
        if name not in self.materials:
            colour, roughness, metalness = self.colours[name]
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            shader = mat.node_tree.nodes["Principled BSDF"]
            shader.inputs["Base Color"].default_value = (*rgb(colour), 1)
            shader.inputs["Roughness"].default_value = roughness
            shader.inputs["Metallic"].default_value = metalness
            if name in EMISSIVE:
                shader.inputs["Emission Color"].default_value = (*rgb(EMISSIVE[name][0]), 1)
                shader.inputs["Emission Strength"].default_value = EMISSIVE[name][1]
            self.materials[name] = mat
        return self.materials[name]

    def begin(self, node, pivot=(0, 0, 0)):
        """Shapes made from here on belong to `node`, whose origin in the game is `pivot`."""
        self.node = node
        self.nodes.setdefault(node, [])
        self.pivots[node] = pivot

    def emit(self, verts, faces, mat, sharp=35, bevel=0.0, segments=1, solid=0.0, flat=False, weld=True):
        """A mesh from points in the game's axes. `mat` is a name, a name per face, or a function of a face's centre giving one."""
        if self.low:
            # Nothing smaller than a hand shows, and a part may not cost a material of its own
            spans = [max(v[axis] for v in verts) - min(v[axis] for v in verts) for axis in range(3)]
            if max(spans) < 0.13 and self.node not in ("brake_light", "wheel_front", "wheel_rear"):
                return None
            if isinstance(mat, list):
                mat = [LOW.get(name, name) for name in mat]
            elif callable(mat):
                mat = (lambda pick: lambda centre: LOW.get(pick(centre), pick(centre)))(mat)
            else:
                mat = LOW.get(mat, mat)
        bm = bmesh.new()
        made = [bm.verts.new(B(v)) for v in verts]
        names = []
        slot = bm.faces.layers.int.new("slot")
        for n, face in enumerate(faces):
            if len(set(face)) >= 3:
                try:
                    built = bm.faces.new([made[i] for i in face])
                except ValueError:
                    continue
                if isinstance(mat, list):
                    if mat[n] not in names:
                        names.append(mat[n])
                    built[slot] = names.index(mat[n])
        if weld:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if isinstance(mat, list):
            for face in bm.faces:
                face.material_index = face[slot]
        elif callable(mat):
            for face in bm.faces:
                c = face.calc_center_median()
                name = mat(Vector((c.x, c.z, -c.y)))
                if name not in names:
                    names.append(name)
                face.material_index = names.index(name)
        else:
            names = [mat]
        mesh = bpy.data.meshes.new(self.node)
        bm.to_mesh(mesh)
        bm.free()
        for name in names:
            mesh.materials.append(self.material(name))
        obj = bpy.data.objects.new(self.node, mesh)
        self.scene.collection.objects.link(obj)
        if solid:
            modifier = obj.modifiers.new("solid", "SOLIDIFY")
            modifier.thickness = solid
            modifier.offset = 0
        if bevel:
            modifier = obj.modifiers.new("bevel", "BEVEL")
            modifier.width = bevel
            modifier.segments = segments
            modifier.limit_method = "ANGLE"
            modifier.angle_limit = math.radians(30)
        if obj.modifiers:
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            baked = bpy.data.meshes.new_from_object(evaluated)
            obj.modifiers.clear()
            obj.data = baked
            bpy.data.meshes.remove(mesh)
            mesh = baked
        mesh.polygons.foreach_set("use_smooth", [not flat] * len(mesh.polygons))
        if not flat:
            mesh.set_sharp_from_angle(angle=math.radians(sharp))
        self.nodes[self.node].append(obj)
        return obj

    # A box of the given size about `at`, turned by a three.js Euler
    def box(self, size, at, mat, rot=(0, 0, 0), bevel=0.006, **kw):
        sx, sy, sz = (s / 2 for s in size)
        turn = Matrix.Translation(at) @ euler(*rot)
        verts = [turn @ Vector((x, y, z)) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        return self.emit(verts, faces, mat, bevel=bevel, **kw)

    # A bar of the given cross-section (across, deep) from a to b
    def beam(self, a, b, size, mat, bevel=0.005, **kw):
        a, b = Vector(a), Vector(b)
        along = (b - a).normalized()
        # "across" stays level, so a sloping bar does not roll
        across = Vector((0, 1, 0)).cross(along)
        across = across.normalized() if across.length > 1e-4 else Vector((1, 0, 0))
        deep = along.cross(across)
        turn = Matrix.Translation((a + b) / 2) @ Matrix((across, deep, along)).transposed().to_4x4()
        sx, sy, sz = size[0] / 2, size[1] / 2, (b - a).length / 2
        verts = [turn @ Vector((x, y, z)) for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        return self.emit(verts, faces, mat, bevel=bevel, **kw)

    # A surface of revolution from (radius, height) pairs about a local Y
    # axis, placed by `at` and `rot`; `axis` "x" or "z" lays the axis down,
    # and `to` aims it from `at` at a point instead
    def lathe(self, profile, at, mat, axis="y", rot=(0, 0, 0), to=None, seg=16, arc=(0, 2 * math.pi), ripple=None, **kw):
        lay = {"y": Matrix.Identity(4), "x": Matrix.Rotation(-math.pi / 2, 4, "Z"), "z": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        turn = Matrix.Translation(at) @ euler(*rot) @ lay
        if to is not None:
            turn = Matrix.Translation(at) @ Vector((0, 1, 0)).rotation_difference((Vector(to) - Vector(at)).normalized()).to_matrix().to_4x4()
        full = abs(arc[1] - arc[0] - 2 * math.pi) < 1e-6
        count = seg if full else seg + 1
        verts = []
        for i in range(count):
            a = arc[0] + (arc[1] - arc[0]) * i / seg
            for j, (r, h) in enumerate(profile):
                if ripple:
                    r += ripple(i, j)
                verts.append(turn @ Vector((math.cos(a) * r, h, math.sin(a) * r)))
        rows = len(profile)
        faces = []
        for i in range(seg):
            a, b = i * rows, ((i + 1) % count) * rows
            for j in range(rows - 1):
                faces.append((a + j, a + j + 1, b + j + 1, b + j))
        return self.emit(verts, faces, mat, **kw)

    # A round bar from a to b, with a second radius at b if it tapers
    def rod(self, a, b, radius, mat, seg=10, top=None, **kw):
        length = (Vector(b) - Vector(a)).length
        top = radius if top is None else top
        return self.lathe([(0, 0), (radius, 0), (top, length), (0, length)], a, mat, to=b, seg=seg, **kw)

    # A side stand, folded up: every bike is drawn as it is ridden, and a stand
    # left down pointed at the road through every bend. `pivot` is where it
    # hinges on the frame and `foot` where its foot stands on the ground when
    # it is down (what a script knows about its bike); the same leg is drawn
    # swung back along the bike, a little down and out, as STAND_UP says.
    # `pad` adds the foot's pad at its end
    def side_stand(self, pivot, foot, radius, mat, seg=6, pad=False):
        end = stand_up(pivot, foot)
        self.rod(pivot, end, radius, mat, seg=seg)
        if pad:
            back = tuple(e + (e - p) * -0.12 for p, e in zip(pivot, end))
            self.rod(back, end, radius * 1.9, mat, seg=seg)
        return end

    def cylinder(self, radius, length, at, mat, axis="y", rot=(0, 0, 0), seg=12, top=None, **kw):
        top = radius if top is None else top
        return self.lathe([(0, -length / 2), (radius, -length / 2), (top, length / 2), (0, length / 2)], at, mat, axis=axis, rot=rot, seg=seg, **kw)

    # A tube swept through points, with a radius or one radius per point
    def tube(self, points, radius, mat, seg=8, smooth=1, cap=True, **kw):
        radii = radius if isinstance(radius, (list, tuple)) else [radius] * len(points)
        path = spline([tuple(p) + (r,) for p, r in zip(points, radii)], smooth)
        centres = [Vector(p[:3]) for p in path]
        normal = None
        verts = []
        for i, c in enumerate(centres):
            ahead = (centres[min(i + 1, len(centres) - 1)] - centres[max(i - 1, 0)]).normalized()
            if normal is None:
                normal = ahead.orthogonal().normalized()
            else:
                normal = (normal - ahead * normal.dot(ahead)).normalized()
            side = ahead.cross(normal)
            for k in range(seg):
                a = 2 * math.pi * k / seg
                verts.append(c + (normal * math.cos(a) + side * math.sin(a)) * path[i][3])
        faces = []
        for i in range(len(centres) - 1):
            for k in range(seg):
                a, b = i * seg + k, i * seg + (k + 1) % seg
                faces.append((a, b, b + seg, a + seg))
        if cap:
            faces.append(tuple(range(seg)))
            faces.append(tuple(range(len(verts) - seg, len(verts))))
        return self.emit(verts, faces, mat, **kw)

    # A body skinned over cross-sections along an axis. A section is
    # (s, lo, hi, w) with optional shape values after it: s is the place on the
    # axis, lo and hi the section's extent across it, w its half-width.
    #   axis "z": s along the bike, lo..hi in height, w across
    #   axis "y": s in height, lo..hi along the bike, w across
    # `mat` may be a function of (u, up, side): how far along, and where round
    # the section, a face lies. Shape values: nt, nb (roundness of the upper and lower half, 2 round,
    # higher squarer), mid (where between lo and hi it is widest), wt, wb (how
    # much narrower it gets toward hi and lo), c (offset across).
    def loft(self, sections, mat, axis="z", ring=14, steps=3, **kw):
        defaults = (2.4, 2.4, 0.5, 1.0, 1.0, 0.0)
        full = [tuple(s) + defaults[len(s) - 4:] for s in sections]
        verts = []
        for s, lo, hi, w, nt, nb, mid, wt, wb, c in spline(full, steps):
            centre = lo + (hi - lo) * mid
            for k in range(ring):
                t = 2 * math.pi * (k + 0.5) / ring
                cs, sn = math.cos(t), math.sin(t)
                n, h, narrow = (nt, hi - centre, wt) if sn >= 0 else (nb, centre - lo, wb)
                px = math.copysign(abs(cs) ** (2 / n), cs)
                py = math.copysign(abs(sn) ** (2 / n), sn)
                x = c + max(w, 1e-4) * px * (1 - (1 - narrow) * abs(py))
                a = centre + h * py
                verts.append((x, a, s) if axis == "z" else (x, s, a))
        count = len(verts) // ring
        faces = []
        names = []
        # A material function takes (u along the loft 0..1, up -1..1, side -1..1) of a face
        pick = mat if callable(mat) else (lambda u, up, side: mat)
        for i in range(count - 1):
            for k in range(ring):
                a, b = i * ring + k, i * ring + (k + 1) % ring
                faces.append((a, b, b + ring, a + ring))
                t = 2 * math.pi * (k + 1) / ring
                names.append(pick((i + 0.5) / (count - 1), math.sin(t), math.cos(t)))
        faces.append(tuple(range(ring)))
        faces.append(tuple(range(len(verts) - ring, len(verts))))
        names += [pick(0.0, 0.0, 0.0), pick(1.0, 0.0, 0.0)]
        return self.emit(verts, faces, names, **kw)

    # A sheet over fn(u, v) -> point for u, v in 0..1, given a thickness
    def sheet(self, fn, mat, nu=8, nv=6, thick=0.012, **kw):
        verts = [fn(i / nu, j / nv) for i in range(nu + 1) for j in range(nv + 1)]
        faces = []
        for i in range(nu):
            for j in range(nv):
                a = i * (nv + 1) + j
                faces.append((a, a + 1, a + nv + 2, a + nv + 1))
        return self.emit(verts, faces, mat, solid=thick, **kw)

    # A plate cut to a side-view outline of (z, y) points, `thick` across x
    def panel(self, outline, x, thick, mat, toe=0.0, bevel=0.006, **kw):
        turn = Matrix.Translation((x, 0, 0)) @ Matrix.Rotation(toe, 4, "Y")
        n = len(outline)
        verts = [turn @ Vector((side * thick / 2, y, z)) for side in (-1, 1) for z, y in outline]
        faces = [tuple(range(n)), tuple(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, j + n, i + n))
        return self.emit(verts, faces, mat, bevel=bevel, **kw)

    # A mudguard: an arc of a sheet about a wheel centre, crowned across
    def guard(self, centre, radius, width, start, end, mat, crown=0.03, nu=10, nv=4, thick=0.01, flare=0.0):
        def at(u, v):
            a = start + (end - start) * u
            across = (v - 0.5) * 2
            r = radius - crown * across * across + flare * u
            return (across * width / 2, centre[0] + math.sin(a) * r, centre[1] + math.cos(a) * r)
        return self.sheet(at, mat, nu=nu, nv=nv, thick=thick)

    # A wheel about `centre`, spinning on x: tyre, rim, spokes and hub
    def wheel(self, centre, radius, width, rim, style="alloy", tread="road", seg=32, spokes=5, hub=0.05):
        cx, cy, cz = centre
        if self.low:
            seg, tread = 16, "slick"
        tube = rim + 0.4 * (radius - rim)
        profile = [(rim - 0.004, -0.34 * width), (rim + 0.012, -0.4 * width)]
        steps = 4 if self.low else 8
        for j in range(steps + 1):
            a = math.radians(-90 + 180 * j / steps)
            profile.append((tube + (radius - tube) * math.cos(a), math.sin(a) * width / 2))
        profile += [(rim + 0.012, 0.4 * width), (rim - 0.004, 0.34 * width)]
        if self.low:
            profile = profile[1:-1]

        def groove(i, j):
            # Slanted cuts that meet at the crown; none on the walls
            row = j - 2
            if tread != "road" or row < 1 or row > steps - 1 or row == steps // 2:
                return 0.0
            lean = row if row < steps // 2 else steps - row
            return -0.007 if (i + lean) % 4 == 0 else 0.0

        self.lathe(profile, centre, "rubber", axis="x", seg=seg, ripple=groove, sharp=50)
        if tread == "knobby":
            rows = [(-0.3, 0), (0.0, 1), (0.3, 0)] if width > 0.14 else [(-0.26, 0), (0.26, 1)]
            count = 16
            for across, offset in rows:
                r = radius - (0.012 if across else 0.002)
                for i in range(count):
                    a = 2 * math.pi * (i + offset * 0.5) / count
                    at = (cx + across * width, cy + math.cos(a) * r, cz + math.sin(a) * r)
                    # Smooth all over: a block this small does not need its own corners
                    self.box((width * 0.26, 0.03, 0.05), at, "rubber", rot=(-a, 0, 0), bevel=0, sharp=180)
        # Rim: two lips and a dropped barrel
        w = width
        barrel = [(rim + 0.006, -0.4 * w), (rim + 0.006, -0.44 * w), (rim - 0.024, -0.4 * w), (rim - 0.034, -0.16 * w),
                  (rim - 0.034, 0.16 * w), (rim - 0.024, 0.4 * w), (rim + 0.006, 0.44 * w), (rim + 0.006, 0.4 * w)]
        self.lathe(barrel[1:-1] if self.low else barrel, centre, "rim", axis="x", seg=12 if self.low else 24, sharp=40)
        inner = rim - 0.03
        if self.low:
            style = "cast"
        if style == "wire":
            count = 24
            for i in range(count):
                side = 1 if i % 2 else -1
                a = 2 * math.pi * i / count
                b = a + (0.5 if (i // 2) % 2 else -0.5)
                self.tube([(cx + side * 0.035, cy + math.cos(a) * hub * 0.9, cz + math.sin(a) * hub * 0.9),
                           (cx + side * 0.008, cy + math.cos(b) * inner, cz + math.sin(b) * inner)], 0.0035, "chrome", seg=3, cap=False)
            self.lathe([(0, -0.055), (hub, -0.055), (hub, -0.035), (hub * 0.55, -0.028), (hub * 0.55, 0.028), (hub, 0.035), (hub, 0.055), (0, 0.055)],
                       centre, "rim", axis="x", seg=12)
        else:
            # Cast spokes. "alloy": twin blades that leave the hub together
            # and reach the rim apart; "cast": one broad swept blade each
            twin = style == "alloy"
            for i in range(spokes):
                base = 2 * math.pi * i / spokes
                for side in ((-1, 1) if twin else (0,)):
                    a0 = base + side * 0.05
                    a1 = base + side * 0.19 + (0.12 if twin else 0.25)
                    ends = ((a0, hub * 0.8, 0.02 if twin else 0.045, 0.02), (a1, inner + 0.006, 0.012 if twin else 0.03, 0.013 if twin else 0.02))
                    verts = []
                    for a, r, half, deep in ends:
                        out = Vector((0, math.cos(a), math.sin(a)))
                        along = Vector((0, -math.sin(a), math.cos(a)))
                        for dx in (-deep, deep):
                            for dt in (-half, half):
                                verts.append(Vector(centre) + out * r + along * dt + Vector((dx, 0, 0)))
                    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
                    self.emit(verts, faces, "rim", bevel=0.004)
            self.lathe([(0, -width * 0.42), (hub, -width * 0.42), (hub * 1.25, -0.012), (hub * 1.25, 0.012), (hub, width * 0.42), (0, width * 0.42)],
                       centre, "rim", axis="x", seg=8 if self.low else 14)

    # A brake disc about `centre` on x: a waved ring on a spoked carrier
    def disc(self, centre, radius, arms=5, thick=0.006):
        cx, cy, cz = centre
        inner = radius * 0.66
        seg = 12 if self.low else 24
        arms = 0 if self.low else arms
        verts = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            outer = radius - (0.006 if i % 3 == 0 else 0)
            for r in (inner, outer):
                for dx in (-thick / 2, thick / 2):
                    verts.append((cx + dx, cy + math.cos(a) * r, cz + math.sin(a) * r))
        faces = []
        for i in range(seg):
            a, b = i * 4, ((i + 1) % seg) * 4
            faces += [(a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)]
        self.emit(verts, faces, "disc", sharp=30)
        for i in range(arms):
            a = 2 * math.pi * (i + 0.5) / arms
            mid = (inner + radius * 0.3) / 2
            self.box((thick * 1.6, inner - radius * 0.26, 0.022), (cx, cy + math.cos(a) * mid, cz + math.sin(a) * mid), "dark_metal", rot=(a, 0, 0), bevel=0)
        self.lathe([(0, -thick), (radius * 0.32, -thick), (radius * 0.32, thick), (0, thick)], centre, "dark_metal", axis="x", seg=14)

    def triangles(self, objects):
        return sum(len(p.vertices) - 2 for obj in objects for p in obj.data.polygons)

    # Joins each node's shapes, moves them onto their pivot, bakes the
    # occlusion and writes the file. `anchors` are bare named points.
    # `fold` names nodes to make part of the body instead, and `decimate` the
    # share of the body's triangles to keep (both for a low-detail model).
    def finish(self, path, anchors=None, budget=None, alone=(), fold=(), decimate=None):
        joined = {}
        for name in fold:
            if name in self.nodes:
                self.nodes["body"] += self.nodes.pop(name)
        for name, parts in self.nodes.items():
            common.select_only(parts, parts[0])
            if len(parts) > 1:
                bpy.ops.object.join()
            obj = bpy.context.view_layer.objects.active
            obj.name = name
            obj.data.name = name
            if decimate and name == "body":
                modifier = obj.modifiers.new("decimate", "DECIMATE")
                modifier.ratio = decimate
                common.apply_modifiers(obj)
                obj.data.validate()
                obj.data.set_sharp_from_angle(angle=math.radians(62))
            pivot = Vector(B(self.pivots[name]))
            obj.data.transform(Matrix.Translation(-pivot))
            obj.location = pivot
            joined[name] = obj
        self.occlude(joined, alone)
        marks = []
        for name, at in (anchors or {}).items():
            mark = bpy.data.objects.new(name, None)
            mark.location = B(at)
            self.scene.collection.objects.link(mark)
            marks.append(mark)
        size = common.export_glb(path, list(joined.values()) + marks, colours=True, texcoords=False)
        size = pack_colours(path)
        counts = {name: self.triangles([obj]) for name, obj in joined.items()}
        total = sum(counts.values())
        print(f"{os.path.basename(path)}: {total} triangles, {size} bytes", counts)
        if budget and total > budget:
            raise SystemExit(f"{path}: {total} triangles is over the budget of {budget}")
        self.joined = joined
        return joined

    # Ambient occlusion into each node's vertex colours, over a short reach
    # so it marks the joins and hollows rather than the whole underside.
    # Nodes named in `alone` turn in the game: nothing else may shade them.
    def occlude(self, joined, alone=()):
        world = bpy.data.worlds.new("bake")
        world.light_settings.distance = 0.22
        self.scene.world = world
        self.scene.render.bake.target = "VERTEX_COLORS"
        for name, obj in joined.items():
            attribute = obj.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
            obj.data.color_attributes.active_color = attribute
            obj.data.color_attributes.render_color_index = 0
            for other in joined.values():
                other.hide_render = name in alone and other is not obj
            common.select_only([obj])
            bpy.ops.object.bake(type="AO")
            values = [0.0] * (len(obj.data.vertices) * 4)
            attribute.data.foreach_get("color", values)
            for i in range(0, len(values), 4):
                shade = 0.3 + 0.7 * min(1.0, values[i] * 1.15) ** 1.3
                values[i:i + 4] = (shade, shade, shade, 1.0)
            attribute.data.foreach_set("color", values)
        for obj in joined.values():
            obj.hide_render = False


# The exporter writes normals as floats and vertex colours as floats or
# shorts; a byte each is all they need, and it takes a third off the file.
# Rewrites it with COLOR_0 as normalised unsigned bytes and NORMAL as
# normalised signed bytes (KHR_mesh_quantization), each padded to four.
# With `unit` (metres), POSITION becomes whole units in signed shorts padded
# to eight bytes, and each mesh node takes the unit as its scale: a model
# within 32 m of its origin, to a millimetre, in two thirds of the bytes.
def pack_colours(path, unit=None):
    data = open(path, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    start = 20 + length + 8
    views = doc["bufferViews"]
    sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    formats = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    colours = {p["attributes"]["COLOR_0"] for m in doc["meshes"] for p in m["primitives"] if "COLOR_0" in p["attributes"]}
    normals = {p["attributes"]["NORMAL"] for m in doc["meshes"] for p in m["primitives"] if "NORMAL" in p["attributes"]}
    positions = {p["attributes"]["POSITION"] for m in doc["meshes"] for p in m["primitives"]} if unit else set()
    chunks = []
    offset = 0

    def add(blob):
        nonlocal offset
        blob += b"\0" * (-len(blob) % 4)
        chunks.append(blob)
        offset += len(blob)
        return {"buffer": 0, "byteOffset": offset - len(blob), "byteLength": len(blob)}

    fresh = []
    for index, accessor in enumerate(doc["accessors"]):
        view = views[accessor["bufferView"]]
        at = start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        count = accessor["count"] * sizes[accessor["type"]]
        code = formats[accessor["componentType"]]
        values = struct.unpack_from(f"<{count}{code}", data, at)
        if index in colours:
            scale = {5126: 1.0, 5123: 65535.0, 5121: 255.0}[accessor["componentType"]]
            width = sizes[accessor["type"]]
            out = bytearray()
            for i in range(accessor["count"]):
                r, g, b = values[i * width:i * width + 3]
                out += bytes(max(0, min(255, round(c / scale * 255))) for c in (r, g, b)) + b"\xff"
            accessor.update(componentType=5121, normalized=True, type="VEC4")
            accessor.pop("min", None)
            accessor.pop("max", None)
            blob = bytes(out)
        elif index in positions:
            whole = [round(v / unit) for v in values]
            if max(abs(v) for v in whole) > 32767:
                raise SystemExit(f"{path}: a position is further from the origin than {32767 * unit} m")
            out = bytearray()
            for i in range(accessor["count"]):
                out += struct.pack("<3hxx", *whole[i * 3:i * 3 + 3])
            accessor.update(componentType=5122, min=[min(whole[c::3]) for c in range(3)], max=[max(whole[c::3]) for c in range(3)])
            blob = bytes(out)
        elif index in normals and accessor["componentType"] == 5126:
            out = bytearray()
            for i in range(accessor["count"]):
                out += struct.pack("<3bx", *(max(-127, min(127, round(c * 127))) for c in values[i * 3:i * 3 + 3]))
            accessor.update(componentType=5120, normalized=True)
            blob = bytes(out)
        else:
            blob = struct.pack(f"<{count}{code}", *values)
        fresh.append(add(blob))
        if index in normals and accessor["componentType"] == 5120:
            fresh[-1]["byteStride"] = 4
        if index in positions:
            fresh[-1]["byteStride"] = 8
        accessor["bufferView"] = len(fresh) - 1
        accessor.pop("byteOffset", None)
    for image in doc.get("images", []):
        view = views[image["bufferView"]]
        at = start + view.get("byteOffset", 0)
        fresh.append(add(data[at:at + view["byteLength"]]))
        image["bufferView"] = len(fresh) - 1
    doc["bufferViews"] = fresh
    # Seven figures is all a float32 holds; the exporter writes seventeen

    def trim(value):
        if isinstance(value, float):
            return float(f"{value:.7g}")
        if isinstance(value, list):
            return [trim(v) for v in value]
        if isinstance(value, dict):
            return {key: trim(v) for key, v in value.items()}
        return value

    doc = trim(doc)
    if unit:
        for node in doc["nodes"]:
            if "mesh" in node:
                node["scale"] = [unit] * 3
    if normals or positions:
        for key in ("extensionsUsed", "extensionsRequired"):
            doc[key] = sorted(set(doc.get(key, [])) | {"KHR_mesh_quantization"})
    doc["buffers"] = [{"byteLength": offset}]
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    body = b"".join(chunks)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body))
    out += struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(body), 0x004E4942) + body
    open(path, "wb").write(out)
    return len(out)


# A look at what a script made, for iterating on it: a quick render from a
# camera at `eye` (game axes) looking at `target`.
def render(scene, path, eye, target, size=(960, 640), lens=70):
    if "preview-sun" not in bpy.data.objects:
        world = scene.world or bpy.data.worlds.new("preview")
        scene.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
        sun = bpy.data.objects.new("preview-sun", bpy.data.lights.new("preview-sun", "SUN"))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), 0, math.radians(35))
        scene.collection.objects.link(sun)
        floor = bpy.data.meshes.new("preview-floor")
        floor.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new("preview-floor", floor)
        mat = bpy.data.materials.new("preview-floor")
        mat.use_nodes = True
        mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.12, 0.13, 0.15, 1)
        floor.materials.append(mat)
        scene.collection.objects.link(ground)
        camera = bpy.data.objects.new("preview-camera", bpy.data.cameras.new("preview-camera"))
        scene.collection.objects.link(camera)
        scene.camera = camera
    camera = scene.camera
    camera.data.lens = lens
    camera.location = B(eye)
    camera.rotation_euler = (Vector(B(target)) - Vector(B(eye))).to_track_quat("-Z", "Y").to_euler()
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
