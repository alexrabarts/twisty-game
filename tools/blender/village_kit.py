# Modelling kit for the village (village_houses.py, village_props.py). A
# model is built from flat faces, each with its own colour: every plank, roof
# slab and stone is a face of its own shade, so a wall has grain without a
# texture that could repeat. Shapes are written in a plot's own axes (x along
# the road, y up, z away from the road, metres, the house front on z = 0 and
# the pavement on y = 0). Blender bakes ambient occlusion into the vertex
# colours and writes the file.
#
# Colours are sRGB, as the game writes its own (0xb9a58a is that colour on
# the screen), and stay sRGB in the file: the game decodes them. That is not
# glTF's rule for COLOR_0 (linear), and it is deliberate: a byte of linear
# colour has too few steps in the dark browns a village is made of.
#
# A face carries a tag, which becomes its material in the file. The game
# (js/sceneassets.js) reads the tags, not the materials' values:
#   body     colours as written
#   wall     a light plaster, which the game tints with the house's wash
#   shutter  a light paint, which the game tints with the house's accent
#   glass    a window pane: red is the window's number in its house (over
#            255), green how bright that corner is when the window is lit
#   lamp     a lamp's glass, always lit: its colour times the game's gain
import math
import os
import random

import bpy
from mathutils import Vector

import common
from bike_kit import pack_colours

TAGS = ("body", "wall", "shutter", "glass", "lamp")
UP = Vector((0, 1, 0))


def hexc(value):
    """A colour from its sRGB hex, as the game writes one."""
    return ((value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(colour, k):
    return tuple(min(1.0, c * k) for c in colour)


def B(p):
    """A point in the plot's axes as a Blender vector (Z up)."""
    return Vector((p[0], -p[2], p[1]))


def value_noise(seed):
    """Smooth noise in 0..1 over space, the same for a seed on every run."""
    def corner(ix, iy, iz):
        h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144665) & 0xFFFFFFFF
        h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
        return ((h ^ (h >> 16)) & 0xFFFF) / 0xFFFF

    def noise(p, size=1.0):
        x, y, z = (c / size for c in p)
        ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
        fx, fy, fz = x - ix, y - iy, z - iz
        fx, fy, fz = (f * f * (3 - 2 * f) for f in (fx, fy, fz))
        out = 0.0
        for dx, wx in ((0, 1 - fx), (1, fx)):
            for dy, wy in ((0, 1 - fy), (1, fy)):
                for dz, wz in ((0, 1 - fz), (1, fz)):
                    out += wx * wy * wz * corner(ix + dx, iy + dy, iz + dz)
        return out

    return noise


class Frame:
    """A wall's plane: `s` runs along it, y is up, `d` is out of it."""

    def __init__(self, origin, along, out):
        self.origin = Vector(origin)
        self.along = Vector(along).normalized()
        self.out = Vector(out).normalized()

    def p(self, s, y, d=0.0):
        return self.origin + self.along * s + UP * y + self.out * d


class Shape:
    """The faces of one node of a file."""

    def __init__(self, name, seed):
        self.name = name
        self.rng = random.Random(seed)
        self.noise = value_noise(seed)
        self.verts = []
        self.colours = []
        self.faces = []
        self.tags = []
        self.anchors = {}
        self.windows = 0

    def jitter(self, colour, amount=0.08, warm=0.0):
        """`colour` a little lighter or darker, and a little warmer or cooler."""
        k = 1 + self.rng.uniform(-amount, amount)
        w = self.rng.uniform(-warm, warm)
        return (min(1, colour[0] * k * (1 + w)), min(1, colour[1] * k), min(1, colour[2] * k * (1 - w)))

    def face(self, points, colour, out, tag="body"):
        """A flat face seen from the side `out` points to. `colour` is one colour or one per point."""
        points = [Vector(p) for p in points]
        colours = list(colour) if isinstance(colour[0], (tuple, list)) else [colour] * len(points)
        normal = (points[1] - points[0]).cross(points[2] - points[0])
        if normal.dot(Vector(out)) < 0:
            points.reverse()
            colours.reverse()
        base = len(self.verts)
        self.verts += points
        self.colours += [tuple(c) for c in colours]
        self.faces.append(tuple(range(base, base + len(points))))
        self.tags.append(tag)

    def box(self, lo, hi, colour, tag="body", skip=(), vary=0.0):
        """A box between two corners. `skip` names the faces to leave out: -x +x -y +y -z +z."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        sides = {
            "-x": ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
            "+x": ([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)], (1, 0, 0)),
            "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            "+y": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            "-z": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
            "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        }
        for name, (points, out) in sides.items():
            if name not in skip:
                self.face(points, self.jitter(colour, vary) if vary else colour, out, tag)

    def fbox(self, frame, s, y, d, colour, tag="body", skip=(), vary=0.0):
        """A box on a wall: `s`, `y` and `d` are each a (from, to). `skip` names faces: left right bottom top back front."""
        corners = lambda a, b, c: frame.p(s[a], y[b], d[c])
        sides = {
            "left": ([corners(0, 0, 0), corners(0, 0, 1), corners(0, 1, 1), corners(0, 1, 0)], -frame.along),
            "right": ([corners(1, 0, 0), corners(1, 0, 1), corners(1, 1, 1), corners(1, 1, 0)], frame.along),
            "bottom": ([corners(0, 0, 0), corners(1, 0, 0), corners(1, 0, 1), corners(0, 0, 1)], -UP),
            "top": ([corners(0, 1, 0), corners(1, 1, 0), corners(1, 1, 1), corners(0, 1, 1)], UP),
            "back": ([corners(0, 0, 0), corners(1, 0, 0), corners(1, 1, 0), corners(0, 1, 0)], -frame.out),
            "front": ([corners(0, 0, 1), corners(1, 0, 1), corners(1, 1, 1), corners(0, 1, 1)], frame.out),
        }
        for name, (points, out) in sides.items():
            if name not in skip:
                self.face(points, self.jitter(colour, vary) if vary else colour, out, tag)

    def beam(self, a, b, size, colour, tag="body", vary=0.0, ends=True):
        """A bar of the given cross-section (across, deep) from a to b."""
        a, b = Vector(a), Vector(b)
        along = (b - a).normalized()
        across = UP.cross(along)
        across = across.normalized() if across.length > 1e-4 else Vector((1, 0, 0))
        deep = along.cross(across)
        hx, hy = size[0] / 2, size[1] / 2
        ring = lambda at: [at + across * x + deep * y for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
        r0, r1 = ring(a), ring(b)
        tint = self.jitter(colour, vary) if vary else colour
        for n, out in enumerate((-deep, across, deep, -across)):
            m = (n + 1) % 4
            self.face([r0[n], r0[m], r1[m], r1[n]], tint, out, tag)
        if ends:
            self.face(r0, tint, -along, tag)
            self.face(r1, tint, along, tag)

    def region(self, frame, s0, s1, y0, top, colour, tag="body", d=0.0, cell=1.4, breaks=(), rows=None, bottom=None):
        """A wall from y0 up to the line top(s), in columns. `colour` is a
        function of a point for a smooth wash, or of (column, row, centre) for
        a face of its own colour when `rows` is given (None: one face a column)."""
        cuts = sorted({s0, s1, *(b for b in breaks if s0 < b < s1)})
        columns = []
        for a, b in zip(cuts, cuts[1:]):
            count = max(1, math.ceil((b - a) / cell - 1e-6))
            columns += [(a + (b - a) * n / count, a + (b - a) * (n + 1) / count) for n in range(count)]
        low = bottom or (lambda s: y0)
        for index, (a, b) in enumerate(columns):
            height = max(top(a) - low(a), top(b) - low(b))
            if height <= 1e-4:
                continue
            count = rows(index) if callable(rows) else rows or max(1, math.ceil(height / cell - 1e-6))
            for row in range(count):
                t0, t1 = row / count, (row + 1) / count
                at = lambda s, t: frame.p(s, low(s) + (top(s) - low(s)) * t, d)
                points = [at(a, t0), at(b, t0), at(b, t1), at(a, t1)]
                if (points[3] - points[0]).length < 1e-4:
                    points = points[:3]
                elif (points[2] - points[1]).length < 1e-4:
                    points = [points[0], points[1], points[3]]
                if rows is None:
                    self.face(points, [colour(p) for p in points], frame.out, tag)
                else:
                    centre = sum(points, Vector()) / len(points)
                    tint = colour(index, row, centre)
                    # A touch darker at the foot, as a board or a stone weathers
                    self.face(points, [scale(tint, 0.9 if p.y < centre.y else 1.04) for p in points], frame.out, tag)

    def courses(self, frame, s0, s1, y0, y1, colour, d=0.0, course=0.34, stone=(0.35, 0.8), vary=0.14, tag="body"):
        """Masonry: courses of stones of uneven length, each its own shade."""
        count = max(1, round((y1 - y0) / course))
        for row in range(count):
            a = y0 + (y1 - y0) * row / count
            b = y0 + (y1 - y0) * (row + 1) / count
            s = s0
            while s < s1 - 1e-6:
                e = min(s1, s + self.rng.uniform(*stone))
                if s1 - e < stone[0] * 0.6:
                    e = s1
                tint = self.jitter(colour, vary, 0.03)
                self.face([frame.p(s, a, d), frame.p(e, a, d), frame.p(e, b, d), frame.p(s, b, d)],
                          [scale(tint, 0.86), scale(tint, 0.86), scale(tint, 1.05), scale(tint, 1.05)], frame.out, tag)
                s = e

    def slab(self, eave, along, rise, length, run, colour, thick=0.16, tile=(0.62, 0.48), soffit=None, vary=0.16, plain=False):
        """A roof slope from the point `eave`: `along` is the eave's direction,
        `rise` the unit vector up the slope, `length` and `run` its size.
        The top is slabs of stone in courses, each its own shade; the
        underside is boards. A `plain` slope is one nobody sees from the road:
        its slabs are three times the size."""
        if plain:
            tile = (tile[0] * 3, tile[1] * 3)
        eave, along, rise = Vector(eave), Vector(along).normalized(), Vector(rise).normalized()
        normal = along.cross(rise)
        if normal.y < 0:
            normal = -normal
        courses = max(1, round(run / tile[1]))
        step = run / courses
        for row in range(courses):
            s = -self.rng.uniform(0, tile[0])
            while s < length - 1e-6:
                e = s + tile[0] * self.rng.uniform(0.8, 1.25)
                a, b = max(0.0, s), min(length, e)
                if length - b < tile[0] * 0.3:
                    b = length
                    e = length
                tint = self.jitter(colour, vary, 0.04)
                # Moss and damp gather toward the eave
                tint = scale(tint, 0.82 + 0.22 * (row / max(1, courses - 1)))
                p = lambda u, v: eave + along * u + rise * v
                self.face([p(a, row * step), p(b, row * step), p(b, (row + 1) * step), p(a, (row + 1) * step)],
                          [scale(tint, 0.74), scale(tint, 0.74), scale(tint, 1.08), scale(tint, 1.08)], normal)
                s = e
        under = soffit or hexc(0x5A4130)
        low = eave - normal * thick
        boards = max(1, round(length / 1.2))
        for n in range(boards):
            a, b = length * n / boards, length * (n + 1) / boards
            halves = max(1, round(run / 1.6))
            for h in range(halves):
                r0, r1 = run * h / halves, run * (h + 1) / halves
                self.face([low + along * a + rise * r0, low + along * b + rise * r0, low + along * b + rise * r1, low + along * a + rise * r1],
                          self.jitter(under, 0.06), -normal)
        fascia = scale(under, 0.8)
        corners = [eave, eave + along * length, eave + along * length + rise * run, eave + rise * run]
        outs = [-rise, along, rise, -along]
        for n in range(4):
            a, b = corners[n], corners[(n + 1) % 4]
            self.face([a, b, b - normal * thick, a - normal * thick], fascia, outs[n])

    def tube(self, a, b, r0, r1, colour, sides=8, tag="body"):
        """A tapered round bar from a to b."""
        a, b = Vector(a), Vector(b)
        along = (b - a).normalized()
        across = along.cross(UP)
        across = across.normalized() if across.length > 1e-4 else Vector((1, 0, 0))
        deep = along.cross(across)
        ring = lambda at, r: [at + (across * math.cos(t) + deep * math.sin(t)) * r for t in (2 * math.pi * n / sides for n in range(sides))]
        low, high = ring(a, r0), ring(b, r1)
        for n in range(sides):
            m = (n + 1) % sides
            out = (low[n] + low[m]) / 2 - a
            self.face([low[n], low[m], high[m], high[n]], colour, out, tag)

    def anchor(self, name, at):
        self.anchors[name] = tuple(at)

    def quads(self):
        return len(self.faces)


def build(shape, scene, material):
    mesh = bpy.data.meshes.new(shape.name)
    mesh.from_pydata([B(v) for v in shape.verts], [], shape.faces)
    used = [tag for tag in TAGS if tag in shape.tags]
    for tag in used:
        mesh.materials.append(material(tag))
    mesh.polygons.foreach_set("material_index", [used.index(tag) for tag in shape.tags])
    mesh.polygons.foreach_set("use_smooth", [False] * len(mesh.polygons))
    mesh.update()
    obj = bpy.data.objects.new(shape.name, mesh)
    scene.collection.objects.link(obj)
    return obj


def occlude(scene, shapes, objects, reach, floor):
    """Ambient occlusion into the vertex colours, times each face's colour. Glass and lamps keep what they carry."""
    world = bpy.data.worlds.new("bake")
    world.light_settings.distance = reach
    scene.world = world
    scene.render.bake.target = "VERTEX_COLORS"
    ground = None
    if floor:
        mesh = bpy.data.meshes.new("bake-floor")
        mesh.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new("bake-floor", mesh)
        scene.collection.objects.link(ground)
    for shape, obj in zip(shapes, objects):
        attribute = obj.data.color_attributes.new("colour", "FLOAT_COLOR", "POINT")
        obj.data.color_attributes.active_color = attribute
        obj.data.color_attributes.render_color_index = 0
        for other in objects:
            other.hide_render = other is not obj
        common.select_only([obj])
        bpy.ops.object.bake(type="AO")
        values = [0.0] * (len(obj.data.vertices) * 4)
        attribute.data.foreach_get("color", values)
        raw = {index for face, tag in zip(shape.faces, shape.tags) if tag in ("glass", "lamp") for index in face}
        for i, colour in enumerate(shape.colours):
            shade = 1.0 if i in raw else 0.42 + 0.58 * min(1.0, values[i * 4] * 1.1) ** 1.2
            values[i * 4:i * 4 + 4] = (colour[0] * shade, colour[1] * shade, colour[2] * shade, 1.0)
        attribute.data.foreach_set("color", values)
    for obj in objects:
        obj.hide_render = False
    if ground:
        bpy.data.objects.remove(ground)


def finish(path, shapes, seed, budget, reach=1.6, floor=True):
    """Bakes and writes `shapes` as the nodes of one file, each under `budget` triangles."""
    scene = bpy.context.scene
    materials = {}

    def material(tag):
        if tag not in materials:
            mat = bpy.data.materials.new(tag)
            mat.use_nodes = True
            shader = mat.node_tree.nodes["Principled BSDF"]
            shader.inputs["Roughness"].default_value = 0.92
            shader.inputs["Metallic"].default_value = 0.0
            colour = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            colour.layer_name = "colour"
            mat.node_tree.links.new(colour.outputs["Color"], shader.inputs["Base Color"])
            materials[tag] = mat
        return materials[tag]

    objects = [build(shape, scene, material) for shape in shapes]
    occlude(scene, shapes, objects, reach, floor)
    marks = []
    for shape in shapes:
        for name, at in shape.anchors.items():
            mark = bpy.data.objects.new(f"{shape.name}:{name}", None)
            mark.location = B(at)
            scene.collection.objects.link(mark)
            marks.append(mark)
    # The exporter must not see the colour node, or it would write a texture slot
    for mat in materials.values():
        shader = mat.node_tree.nodes["Principled BSDF"]
        for link in list(shader.inputs["Base Color"].links):
            mat.node_tree.links.remove(link)
        shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
    # Every face is flat, so the game works the normals out and the file carries none
    common.export_glb(path, objects + marks, colours=True, texcoords=False, normals=False)
    size = pack_colours(path, unit=0.001)
    counts = {shape.name: sum(len(face) - 2 for face in shape.faces) for shape in shapes}
    print(f"{os.path.basename(path)}: {sum(counts.values())} triangles, {size} bytes", counts)
    for name, count in counts.items():
        if count > budget:
            raise SystemExit(f"{path}: {name} has {count} triangles, over the budget of {budget}")
    preview = os.environ.get("TWISTY_PREVIEW")
    if preview:
        from bike_kit import render
        for mat in materials.values():
            shader = mat.node_tree.nodes["Principled BSDF"]
            colour = mat.node_tree.nodes["Color Attribute"] if "Color Attribute" in mat.node_tree.nodes else mat.node_tree.nodes.new("ShaderNodeVertexColor")
            colour.layer_name = "colour"
            mat.node_tree.links.new(colour.outputs["Color"], shader.inputs["Base Color"])
        os.makedirs(preview, exist_ok=True)
        for obj in objects:
            for other in objects:
                other.hide_render = other is not obj
            render(scene, os.path.join(preview, f"{obj.name}-front.png"), (9, 7, -22), (0, 5, 4), lens=40)
            render(scene, os.path.join(preview, f"{obj.name}-side.png"), (-24, 12, -10), (0, 5, 4), lens=40)
    return size
