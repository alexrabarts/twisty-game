# The alpine marmot of the high pastures: one stocky rodent about half a metre long, in three poses, each a node of
# its own (the game swaps the node to change the pose; there is no rig to drive):
#   marmot_walk  on all fours, the head low
#   marmot_sit   sitting upright on its haunches, the lookout pose
#   marmot_run   stretched out at a run
# Low and round, short legs, small round ears, a blunt muzzle; grizzled grey on the head, shoulders and back, sandy
# buff on the flanks, chest and belly, a dark muzzle and crown, a short bushy tail going black toward its tip. The
# colours were read from the owner's photos (kept out of the repository). No texture: the colour is in the vertex
# colours, ambient occlusion baked in on top, as for the trees.
#
# Shapes are written in the game's axes (x across, y up, z forward, metres), each pose standing on y = 0 with its
# origin under the middle of its body, facing +z.
#   blender --background --factory-startup --python tools/blender/marmot.py
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from bike_kit import B, render  # noqa: E402
from tree_kit import linear, mix, srgb  # noqa: E402

OUT = os.path.join(common.ASSETS, "animals", "marmot.glb")
# The photos' colours as albedo: a sunlit photo reads the coat brighter than the game's land palette reads the grass
# beside it, so the coat is taken at this share; at 0.55 (the grass's own share) the animals read as dark blots on the
# summit's pale grass, where the photos show them lighter than their ground
EXPOSURE = 0.8
# Each pose at most this many triangles: a colony is a handful of animals, but a window may hold several colonies
BUDGET = 320

# sRGB, from the photos
BACK = srgb(0x7A756A)
BACK_DARK = srgb(0x5E5A52)
BUFF = srgb(0xC2A874)
BUFF_DEEP = srgb(0xA88E5E)
HEAD = srgb(0x6F6B62)
CROWN = srgb(0x45423D)
MUZZLE = srgb(0x3D3A36)
CHEEK = srgb(0xB9AA88)
TAIL = srgb(0x5A5248)
TAIL_TIP = srgb(0x2E2C29)
PAW = srgb(0x8C7550)
EAR = srgb(0x6A5E4E)


class Shape:
    """One pose: triangles with an sRGB colour per point, each part's faces turned out from its own axis."""

    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.colours = []

    def part(self, rings, colour, axis):
        """A closed tube through `rings` (lists of points, all the same length), capped at both ends with a pole at
        each ring's centre. `colour(point)` gives a point's colour; faces turn out from the polyline `axis`."""
        base = len(self.verts)
        sides = len(rings[0])
        points = [p for ring in rings for p in ring]
        heads = [sum(rings[0], Vector()) / sides, sum(rings[-1], Vector()) / sides]
        points += heads
        faces = []
        for i in range(len(rings) - 1):
            for k in range(sides):
                a, b = i * sides + k, i * sides + (k + 1) % sides
                c, d = a + sides, b + sides
                faces += [(a, b, d), (a, d, c)]
        first, last = len(points) - 2, len(points) - 1
        for k in range(sides):
            faces.append((first, (k + 1) % sides, k))
            faces.append((last, (len(rings) - 1) * sides + k, (len(rings) - 1) * sides + (k + 1) % sides))
        for face in faces:
            a, b, c = (points[i] for i in face)
            normal = (b - a).cross(c - a)
            centre = (a + b + c) / 3
            if normal.dot(centre - nearest(axis, centre)) < 0:
                face = (face[0], face[2], face[1])
            self.faces.append(tuple(base + i for i in face))
        self.verts += points
        self.colours += [colour(p) for p in points]

    def triangles(self):
        return len(self.faces)


def nearest(polyline, point):
    best, gap = polyline[0], math.inf
    for a, b in zip(polyline, polyline[1:]):
        ab = b - a
        t = max(0.0, min(1.0, (point - a).dot(ab) / max(ab.length_squared, 1e-12)))
        q = a + ab * t
        if (point - q).length < gap:
            best, gap = q, (point - q).length
    return best


def frame(direction):
    """Unit axes (along, up, across) for a tube running along `direction` in the game's vertical plane."""
    along = direction.normalized()
    across = Vector((1, 0, 0))
    up = across.cross(along).normalized()
    if up.y < 0:
        up = -up
    return along, up, across


def ring(centre, along, height, width, sides, squash_low=1.0):
    """A ring round `centre` square to `along`: `height` up, `width` across; the lower half flattened by squash_low."""
    _, up, across = frame(along)
    out = []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        v = math.cos(a)
        out.append(centre + up * (height * v * (squash_low if v < 0 else 1.0)) + across * (width * math.sin(a)))
    return out


def grizzle(point, colour, amount=0.08):
    """The grizzled coat: a fine noise in brightness so no two hairs of grey read as one flat paint."""
    n = noise.noise(Vector(point) * 38.0)
    return [max(0.0, min(1.0, c * (1.0 + amount * n))) for c in colour]


def body(shape, hip, pitch, length, high, wide, stretch=1.0):
    """The trunk from the haunches at `hip` forward by `length`, tilted up by `pitch` (radians); returns where the
    neck ends and the spine's direction."""
    along = Vector((0, math.sin(pitch), math.cos(pitch)))
    _, up, _ = frame(along)
    rings, axis = [], []
    # Fat at the hips and belly, narrowing into the neck; the lower half flatter (it sits low on the ground)
    profile = [(0.0, 0.55), (0.14, 0.94), (0.42, 1.0), (0.72, 0.9), (0.93, 0.64), (1.0, 0.5)]
    for t, r in profile:
        centre = hip + along * (length * stretch * t)
        rings.append(ring(centre, along, high * r, wide * r, 8, squash_low=0.82))
        axis.append(centre)

    def colour(p):
        # The back is grey, the flanks and belly buff: by how far the point faces up from the spine
        q = nearest(axis, p)
        facing = (p - q).normalized().dot(up)
        t = max(0.0, min(1.0, (p - hip).dot(along) / (length * stretch)))
        back = mix(BACK, BACK_DARK, max(0.0, t - 0.55) * 1.6)
        side = mix(BUFF, BUFF_DEEP, 0.35 + 0.3 * math.sin(t * 6.0))
        return grizzle(p, mix(side, back, max(0.0, min(1.0, (facing + 0.3) / 0.45))))
    shape.part(rings, colour, axis)
    return hip + along * (length * stretch), along


def head(shape, neck, along, size=1.0):
    """The head: a blunt rounded box ending in a dark muzzle, with two small round ears."""
    look = along.normalized()
    _, up, across = frame(look)
    centre = neck + look * (0.03 * size) - along.normalized() * (0.015 * size)
    profile = [(-0.055, 0.6, 0.62), (-0.015, 1.0, 1.0), (0.03, 0.88, 0.84), (0.065, 0.52, 0.48)]
    rings, axis = [], []
    for d, rh, rw in profile:
        c = centre + look * (d * size)
        rings.append(ring(c, look, 0.05 * size * rh, 0.052 * size * rw, 7, squash_low=0.85))
        axis.append(c)

    def colour(p):
        d = (p - centre).dot(look) / size
        h = (p - centre).dot(up) / size
        if d > 0.04:
            return MUZZLE
        if h > 0.03 and d > -0.04:
            return CROWN
        if h < -0.015 and d > 0.0:
            return CHEEK
        return grizzle(p, HEAD)
    shape.part(rings, colour, axis)
    for side in (-1, 1):
        base = centre - look * (0.025 * size) + up * (0.043 * size) + across * (side * 0.032 * size)
        ear = [ring(base + up * (0.014 * size * i), up, 0.012 * size * (1 - 0.3 * i), 0.016 * size * (1 - 0.35 * i), 3) for i in range(2)]
        shape.part(ear, lambda p: EAR, [base, base + up * 0.014 * size])


def leg(shape, top, foot, thick):
    """A short leg from `top` (inside the body) to the paw at `foot`."""
    along = foot - top
    rings = [ring(top + along * t, along, thick * r, thick * r, 4) for t, r in ((0.0, 1.0), (1.0, 0.72))]
    shape.part(rings, lambda p: PAW if (p - top).dot(along.normalized()) > along.length * 0.55 else BUFF_DEEP, [top, foot])


def tail(shape, root, direction, length, curl=0.0):
    """The short bushy tail, darker toward its tip."""
    points, rings = [], []
    d = direction.normalized()
    for i in range(4):
        t = i / 3
        bend = Vector((0, curl * t * t, 0))
        p = root + d * (length * t) + bend * length
        points.append(p)
    for i, p in enumerate(points):
        nxt = points[min(i + 1, 3)] - points[max(i - 1, 0)]
        r = 0.028 * (0.75 + 0.5 * math.sin(math.pi * min(0.95, 0.15 + i / 3)))
        rings.append(ring(p, nxt, r, r * 0.9, 5))
    shape.part(rings, lambda p: mix(TAIL, TAIL_TIP, max(0.0, (p - root).dot(d) / length - 0.35) * 1.5), points)


def walk():
    shape = Shape("marmot_walk")
    # Low on its short legs, the belly a hand over the ground
    hip = Vector((0, 0.1, -0.15))
    neck, along = body(shape, hip, math.radians(6), 0.3, 0.095, 0.11)
    head(shape, neck, Vector((0, -0.2, 1)), size=1.25)
    for side in (-1, 1):
        leg(shape, hip + Vector((side * 0.07, -0.03, 0.05)), Vector((side * 0.075, 0.0, -0.08)), 0.028)
        leg(shape, neck + Vector((side * 0.05, -0.05, -0.05)), Vector((side * 0.055, 0.0, 0.11)), 0.024)
    tail(shape, hip + Vector((0, 0.01, 0.03)), Vector((0, 0.2, -1)), 0.19, curl=0.2)
    return shape


def sit():
    shape = Shape("marmot_sit")
    # Sat back on its haunches, the trunk near upright and its rump on the ground, the forepaws at its chest
    hip = Vector((0, 0.07, -0.03))
    neck, along = body(shape, hip, math.radians(68), 0.3, 0.1, 0.115)
    head(shape, neck, Vector((0, 0.1, 1)), size=1.25)
    for side in (-1, 1):
        leg(shape, hip + Vector((side * 0.075, -0.02, 0.06)), Vector((side * 0.08, 0.0, 0.11)), 0.03)
        chest = hip + along * 0.22
        leg(shape, chest + Vector((side * 0.045, 0.0, 0.06)), chest + Vector((side * 0.05, -0.05, 0.1)), 0.018)
    tail(shape, hip + Vector((0, -0.01, 0.0)), Vector((0, -0.35, -1)), 0.2, curl=0.05)
    return shape


def run():
    shape = Shape("marmot_run")
    # Stretched out, the hind legs thrust back and the forelegs reaching forward
    hip = Vector((0, 0.11, -0.19))
    neck, along = body(shape, hip, math.radians(-3), 0.3, 0.088, 0.1, stretch=1.18)
    head(shape, neck, Vector((0, -0.08, 1)), size=1.2)
    for side in (-1, 1):
        leg(shape, hip + Vector((side * 0.065, -0.03, 0.03)), Vector((side * 0.07, 0.0, -0.18)), 0.025)
        leg(shape, neck + Vector((side * 0.05, -0.05, -0.04)), Vector((side * 0.055, 0.0, 0.2)), 0.021)
    tail(shape, hip + Vector((0, 0.01, 0.03)), Vector((0, 0.08, -1)), 0.2)
    return shape


def finish(scene, shapes):
    material = bpy.data.materials.new("marmot")
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.95
    shader.inputs["Metallic"].default_value = 0.0
    tint = material.node_tree.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "colour"
    material.node_tree.links.new(tint.outputs["Color"], shader.inputs["Base Color"])
    world = bpy.data.worlds.new("bake")
    world.light_settings.distance = 0.3
    scene.world = world
    scene.cycles.samples = 64
    scene.render.bake.target = "VERTEX_COLORS"
    objects = []
    for shape in shapes:
        if shape.triangles() > BUDGET:
            raise SystemExit(f"{shape.name}: {shape.triangles()} triangles is over the budget of {BUDGET}")
        mesh = bpy.data.meshes.new(shape.name)
        mesh.from_pydata([B(v) for v in shape.verts], [], shape.faces)
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.materials.append(material)
        obj = bpy.data.objects.new(shape.name, mesh)
        scene.collection.objects.link(obj)
        objects.append(obj)
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
        for i, colour in enumerate(shape.colours):
            shade = 0.55 + 0.45 * min(1.0, values[i * 4] * 1.15)
            values[i * 4:i * 4 + 4] = [c * shade for c in linear([v * EXPOSURE for v in colour])] + [1.0]
        attribute.data.foreach_set("color", values)
    for obj in objects:
        obj.hide_render = False
    size = common.export_glb(OUT, objects, colours=True, texcoords=False)
    print(f"marmot.glb: {size} bytes", {s.name: s.triangles() for s in shapes})
    out = os.environ.get("TWISTY_PREVIEW")
    if out:
        # Side by side across the view, each seen from its side, front, back and above
        for n, obj in enumerate(objects):
            obj.location = B(((n - 1) * 0.7, 0, 0))
        for obj in objects:
            obj.rotation_euler = (0, 0, math.radians(90))
        render(scene, os.path.join(out, "marmot-side.png"), (0, 0.35, 2.6), (0, 0.14, 0), size=(1400, 500), lens=55)
        for obj in objects:
            obj.rotation_euler = (0, 0, 0)
        render(scene, os.path.join(out, "marmot-front.png"), (0, 0.35, 2.6), (0, 0.14, 0), size=(1400, 500), lens=55)
        for obj in objects:
            obj.rotation_euler = (0, 0, math.radians(180))
        render(scene, os.path.join(out, "marmot-back.png"), (0, 0.35, 2.6), (0, 0.14, 0), size=(1400, 500), lens=55)
        for obj in objects:
            obj.rotation_euler = (0, 0, math.radians(45))
        render(scene, os.path.join(out, "marmot-above.png"), (0, 1.3, 1.9), (0, 0.1, 0), size=(1400, 500), lens=50)


random.seed(31)
finish(common.reset(31), [walk(), sit(), run()])
