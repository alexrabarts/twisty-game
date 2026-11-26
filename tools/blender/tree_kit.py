# Modelling kit for the trees and bushes (tree_*.py). A plant is one mesh with
# no texture: its shape is geometry and its colour is in the vertex colours
# (bark, the green climbing from a dark underside to a light crown, snow), with
# ambient occlusion baked in on top. A tiling leaf or bark photo would show
# its repeat across a forest of a thousand copies; a handful of shapes, each
# turned, scaled and tinted per tree by the game, does not.
#
# Shapes are written in the game's axes (x across, y up, z forward, metres).
# The game plants a tree with its origin 0.6 m under the ground whatever its
# scale (js/environment.js, createForest), so the ground cuts a model between
# y = 0.4 and y = 1.1: the trunk is a plain taper through that range and
# nothing else reaches below y = 1.15.
import math
import os
import random

import bpy
from mathutils import Vector, noise

import common
from bike_kit import B, render, rgb

# The most triangles one plant may have. A forest leg draws up to 1,200 trees
# in one view and once more for the shadow map, inside a leg budget of 450,000
# triangles (tools/terrain-check.mjs), and the scenery besides the trees takes
# up to 110,000 of it.
TREE_BUDGET = 220
BUSH_BUDGET = 80
# How far the baked occlusion looks: a crown shades its own underside and trunk
REACH = 3.0


def srgb(value):
    """An sRGB hex as three floats, still sRGB: colours are mixed as the game mixes its own."""
    return [((value >> shift) & 255) / 255 for shift in (16, 8, 0)]


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def linear(colour):
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in colour]


def game(v):
    """A Blender vector as a point in the game's axes (the inverse of B)."""
    return (v[0], v[2], -v[1])


class Plant:
    def __init__(self, name, seed):
        self.name = name
        self.rand = random.Random(seed)
        self.verts = []
        self.faces = []
        self.colours = []

    def add(self, verts, faces, colours, facing=None, axis=(0.0, 0.0)):
        """Triangles with an sRGB colour per point. `facing` turns each face up, down or out from the vertical line at `axis`."""
        base = len(self.verts)
        for face in faces:
            a, b, c = (Vector(verts[i]) for i in face)
            normal = (b - a).cross(c - a)
            centre = (a + b + c) / 3
            want = {"up": Vector((0, 1, 0)), "down": Vector((0, -1, 0)), "out": Vector((centre.x - axis[0], 0, centre.z - axis[1]))}.get(facing)
            if want is not None and normal.dot(want) < 0:
                face = (face[0], face[2], face[1])
            self.faces.append(tuple(base + i for i in face))
        self.verts += [tuple(v) for v in verts]
        self.colours += [list(c) for c in colours]

    def trunk(self, spine, sides, low, high, twist=0.0):
        """A tapered trunk or limb through `spine`, points of (x, y, z, radius): open at both ends, which the ground and the crown hide."""
        verts = []
        colours = []
        first, last = spine[0][1], spine[-1][1]
        for ring, (x, y, z, radius) in enumerate(spine):
            for side in range(sides):
                angle = twist + ring * 0.35 + side * 2 * math.pi / sides
                # A little out of round, so the bark is not a turned post
                r = radius * (0.9 + 0.2 * self.rand.random())
                verts.append((x + r * math.cos(angle), y, z + r * math.sin(angle)))
                colours.append(mix(low, high, (y - first) / max(1e-6, last - first) + 0.2 * (self.rand.random() - 0.5)))
        faces = []
        for ring in range(len(spine) - 1):
            for side in range(sides):
                a = ring * sides + side
                b = ring * sides + (side + 1) % sides
                faces += [(a, b, a + sides), (b, b + sides, a + sides)]
        centre = spine[len(spine) // 2]
        self.add(verts, faces, colours, facing="out", axis=(centre[0], centre[2]))

    def crown(self, lobes, triangles, colour, rough=0.3, voxel=0.2, grain=1.4):
        """A leafy mass: `lobes` of (x, y, z, radius, squash) melted into one skin, roughened and cut down to `triangles`.

        `colour(point, normal)` gives each point its sRGB colour. No face is spent inside the mass.
        """
        parts = []
        for x, y, z, radius, squash in lobes:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius, location=B((x, y, z)))
            lobe = bpy.context.active_object
            lobe.scale = (1, 1, squash)
            parts.append(lobe)
        common.select_only(parts, parts[0])
        bpy.ops.object.transform_apply(scale=True)
        if len(parts) > 1:
            bpy.ops.object.join()
        mass = bpy.context.view_layer.objects.active
        skin = mass.modifiers.new("skin", "REMESH")
        skin.mode = "VOXEL"
        skin.voxel_size = voxel
        common.apply_modifiers(mass)
        texture = bpy.data.textures.new(f"{self.name}-leaves", "CLOUDS")
        texture.noise_scale = grain
        texture.noise_depth = 1
        rough_up = mass.modifiers.new("rough", "DISPLACE")
        rough_up.texture = texture
        rough_up.texture_coords = "GLOBAL"
        rough_up.strength = rough
        rough_up.mid_level = 0.5
        common.apply_modifiers(mass)
        count = sum(len(p.vertices) - 2 for p in mass.data.polygons)
        cut = mass.modifiers.new("cut", "DECIMATE")
        cut.ratio = triangles / count
        common.apply_modifiers(mass)
        mass.modifiers.new("tidy", "TRIANGULATE")
        common.apply_modifiers(mass)
        mesh = mass.data
        verts = [game(v.co) for v in mesh.vertices]
        normals = [game(v.normal) for v in mesh.vertices]
        faces = [tuple(p.vertices) for p in mesh.polygons]
        self.add(verts, faces, [colour(p, n) for p, n in zip(verts, normals)])
        bpy.data.objects.remove(mass)
        bpy.data.textures.remove(texture)

    def clump(self, centre, radius, colour, squash=0.8, rough=0.28, detail=0, stretch=0.15):
        """One clump of leaves or needles: an icosahedron (20 faces, 80 with `detail` 1) knocked out of round.

        Clumps stand apart, so a crown made of them has a broken outline with sky and branches between them.
        `colour(point, normal)` gives each point its sRGB colour, with `normal` the way the point looks out.
        """
        rand = self.rand
        verts, faces = icosahedron(detail)
        # A turn of its own and a stretch along one side, so no two clumps are the same ball
        turn = rand.random() * 2 * math.pi
        cos, sin = math.cos(turn), math.sin(turn)
        long = 1 + stretch * (rand.random() - 0.3)
        offset = Vector((rand.random() * 50, rand.random() * 50, rand.random() * 50))
        points = []
        normals = []
        for x, y, z in verts:
            bump = 1 + rough * (noise.noise(Vector((x, y, z)) * 1.7 + offset) + 0.5 * (rand.random() - 0.5))
            px, pz = x * long, z
            px, pz = px * cos - pz * sin, px * sin + pz * cos
            normals.append((x, y, z))
            points.append((centre[0] + px * radius * bump, centre[1] + y * radius * squash * bump, centre[2] + pz * radius * bump))
        out = []
        for face in faces:
            a, b, c = (Vector(points[i]) for i in face)
            mid = (a + b + c) / 3 - Vector(centre)
            out.append(face if (b - a).cross(c - a).dot(mid) >= 0 else (face[0], face[2], face[1]))
        self.add(points, out, [colour(p, n) for p, n in zip(points, normals)])

    def triangles(self):
        return len(self.faces)


def icosahedron(detail=0):
    """The unit icosahedron, its faces split `detail` times: (points, faces)."""
    t = (1 + 5 ** 0.5) / 2
    raw = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    verts = [tuple(c / math.sqrt(1 + t * t) for c in v) for v in raw]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
             (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(detail):
        cache = {}

        def middle(i, j):
            key = (min(i, j), max(i, j))
            if key not in cache:
                m = [(verts[i][k] + verts[j][k]) / 2 for k in range(3)]
                n = math.sqrt(sum(c * c for c in m))
                verts.append(tuple(c / n for c in m))
                cache[key] = len(verts) - 1
            return cache[key]
        split = []
        for a, b, c in faces:
            ab, bc, ca = middle(a, b), middle(b, c), middle(c, a)
            split += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = split
    return verts, faces


def patches(point, scale=0.45):
    """A slow noise over a plant, -1 to 1: where its green runs yellow or blue."""
    return noise.noise(Vector(point) * scale)


def finish(scene, plants, path, budget):
    """Bakes the occlusion into each plant's colours and writes them all to one file, a node per plant."""
    material = bpy.data.materials.new("plant")
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.92
    shader.inputs["Metallic"].default_value = 0.0
    tint = material.node_tree.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "colour"
    material.node_tree.links.new(tint.outputs["Color"], shader.inputs["Base Color"])
    world = bpy.data.worlds.new("bake")
    world.light_settings.distance = REACH
    scene.world = world
    scene.cycles.samples = 96
    scene.render.bake.target = "VERTEX_COLORS"

    objects = []
    for plant in plants:
        # One budget for every plant of the file, or a budget by plant
        most = budget(plant) if callable(budget) else budget
        if plant.triangles() > most:
            raise SystemExit(f"{plant.name}: {plant.triangles()} triangles is over the budget of {most}")
        mesh = bpy.data.meshes.new(plant.name)
        mesh.from_pydata([B(v) for v in plant.verts], [], plant.faces)
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.materials.append(material)
        obj = bpy.data.objects.new(plant.name, mesh)
        scene.collection.objects.link(obj)
        objects.append(obj)

    for plant, obj in zip(plants, objects):
        attribute = obj.data.color_attributes.new("colour", "FLOAT_COLOR", "POINT")
        obj.data.color_attributes.active_color = attribute
        obj.data.color_attributes.render_color_index = 0
        # Each plant is baked alone: the game stands them apart
        for other in objects:
            other.hide_render = other is not obj
        common.select_only([obj])
        bpy.ops.object.bake(type="AO")
        values = [0.0] * (len(obj.data.vertices) * 4)
        attribute.data.foreach_get("color", values)
        for i, colour in enumerate(plant.colours):
            shade = 0.42 + 0.58 * min(1.0, values[i * 4] * 1.2) ** 1.2
            values[i * 4:i * 4 + 4] = [c * shade for c in linear(colour)] + [1.0]
        attribute.data.foreach_set("color", values)
    for obj in objects:
        obj.hide_render = False

    size = common.export_glb(path, objects, colours=True, texcoords=False)
    counts = {plant.name: plant.triangles() for plant in plants}
    print(f"{os.path.basename(path)}: {sum(counts.values())} triangles, {size} bytes", counts)
    preview(scene, objects, os.path.splitext(os.path.basename(path))[0])
    return objects


def preview(scene, objects, name):
    """With TWISTY_PREVIEW=<directory>: the plants of one file in a row, from the height of a rider's eye and from above."""
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    gap = 8.0
    for n, obj in enumerate(objects):
        obj.location = B(((n - (len(objects) - 1) / 2) * gap, -0.6, 0))
    span = len(objects) * gap
    render(scene, os.path.join(out, f"{name}-road.png"), (0, 1.6, span * 1.1 + 5), (0, 4.6, 0), size=(1600, 560), lens=38)
    render(scene, os.path.join(out, f"{name}-above.png"), (span * 0.25, 16, span * 1.0 + 5), (0, 3.5, 0), size=(1600, 560), lens=38)
