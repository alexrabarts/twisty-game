# Modelling kit for the traffic cars (car_*.py), on top of the bikes' kit. A
# car body is one closed shell skinned over cross-sections that a few side-view
# and plan-view lines define, with the wheel arches cut into its lower edge.
# Lamps, seams and trims are thin patches laid on that same surface.
#
# Axes are the game's (x across with +x the car's left, y up, z forward,
# metres) with the ground at y = 0. js/traffic.js puts a car's origin at hub
# height, so js/carmodels.js lowers the model by the wheel radius.
import math
import os

import bpy
from mathutils import Matrix, Vector

import bike_kit
import common
from bike_kit import B, Kit, pack_colours, render

# The game gives `paint` and `paint_roof` each car's own colours and lights
# `headlight`, `taillight` and `indicator` itself (js/carmodels.js)
bike_kit.MATERIALS.update({
    "paint_roof": (0xF5F5F5, 0.25, 0.7),
    "taillight": (0xCC0000, 0.1, 0.2),
    "indicator": (0xFF8800, 0.3, 0.2),
    "cabin": (0x0A141E, 0.08, 0.6),
})

HUB = 0.32


def interp(knots, z):
    """A line through (z, value) knots, level past its ends."""
    if z <= knots[0][0]:
        return knots[0][1]
    for (z0, v0), (z1, v1) in zip(knots, knots[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return knots[-1][1]


def clamp(value, lo=0.0, hi=1.0):
    return max(lo, min(hi, value))


class CarKit(Kit):
    def __init__(self, seed, colours=None):
        super().__init__(seed=seed, colours=colours)
        self.laid = set()

    # A shape that lies on the body rather than being part of it: it must not
    # shade the panel under it when the occlusion is baked
    def lay(self, obj):
        if obj is not None:
            self.laid.add(obj.name)
        return obj

    # A road wheel about `centre`, turning on x, its face toward +x. Each of
    # `spokes` is a dark opening in the dish.
    def road_wheel(self, centre, radius=HUB, width=0.21, rim=0.215, spokes=5, seg=16, face="rim", gap=0.085):
        cx, cy, cz = centre
        half = width / 2
        tyre = [(rim + 0.004, -half * 0.82), (radius - 0.028, -half), (radius, -half * 0.62), (radius, half * 0.62), (radius - 0.028, half), (rim + 0.004, half * 0.82)]
        self.lathe(tyre, centre, "rubber", axis="x", seg=seg, sharp=50)
        dish = [(0, half * 0.5), (rim * 0.3, half * 0.5), (rim * 0.86, half * 0.62), (rim + 0.006, half * 0.86), (rim + 0.006, half * 0.2)]
        self.lathe(dish, centre, face, axis="x", seg=seg, sharp=40)
        self.lathe([(0, -half * 0.8), (rim + 0.006, -half * 0.8), (rim + 0.006, half * 0.2)], centre, "vent", axis="x", seg=seg, sharp=40)
        for i in range(spokes):
            a = 2 * math.pi * (i + 0.5) / spokes
            r = rim * 0.6
            self.box((0.02, gap, gap * 0.8), (cx + half * 0.56, cy + math.cos(a) * r, cz + math.sin(a) * r), "vent", rot=(a, 0, 0), bevel=0)
        self.cylinder(rim * 0.2, 0.02, (cx + half * 0.52, cy, cz), "chrome", axis="x", seg=8)

    def finish(self, path, budget=None, alone=()):
        solid, laid = {}, {}
        for name, parts in self.nodes.items():
            pivot = Vector(B(self.pivots[name]))
            for group, store in (([p for p in parts if p.name not in self.laid], solid), ([p for p in parts if p.name in self.laid], laid)):
                if not group:
                    continue
                common.select_only(group, group[0])
                if len(group) > 1:
                    bpy.ops.object.join()
                obj = bpy.context.view_layer.objects.active
                obj.data.transform(Matrix.Translation(-pivot))
                obj.location = pivot
                store[name] = obj
        self.occlude_car(solid, laid, alone)
        joined = {}
        for name in self.nodes:
            group = [store[name] for store in (solid, laid) if name in store]
            common.select_only(group, group[0])
            if len(group) > 1:
                bpy.ops.object.join()
            obj = bpy.context.view_layer.objects.active
            obj.name = name
            obj.data.name = name
            joined[name] = obj
        common.export_glb(path, list(joined.values()), colours=True, texcoords=False)
        size = pack_colours(path)
        counts = {name: self.triangles([obj]) for name, obj in joined.items()}
        total = sum(counts.values())
        print(f"{os.path.basename(path)}: {total} triangles, {size} bytes", counts)
        if budget and total > budget:
            raise SystemExit(f"{path}: {total} triangles is over the budget of {budget}")
        self.joined = joined
        return joined

    # The kit's occlusion bake, with every laid patch out of the way of the
    # others. Nodes named in `alone` turn in the game: nothing may shade them.
    def occlude_car(self, solid, laid, alone):
        world = bpy.data.worlds.new("bake")
        world.light_settings.distance = 0.3
        self.scene.world = world
        self.scene.render.bake.target = "VERTEX_COLORS"
        everything = [(name, obj, False) for name, obj in solid.items()] + [(name, obj, True) for name, obj in laid.items()]
        for name, obj, _ in everything:
            attribute = obj.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
            obj.data.color_attributes.active_color = attribute
            obj.data.color_attributes.render_color_index = 0
            for _, other, patch in everything:
                other.hide_render = other is not obj and (patch or name in alone)
            common.select_only([obj])
            bpy.ops.object.bake(type="AO")
            values = [0.0] * (len(obj.data.vertices) * 4)
            attribute.data.foreach_get("color", values)
            for i in range(0, len(values), 4):
                shade = 0.35 + 0.65 * min(1.0, values[i] * 1.15) ** 1.3
                values[i:i + 4] = (shade, shade, shade, 1.0)
            attribute.data.foreach_set("color", values)
        for _, obj, _ in everything:
            obj.hide_render = False


# A car body. `top`, `belt`, `lo` and `width` are lines of (z, value) knots
# from the tail to the nose: the silhouette, the line under the windows, the
# lower edge, and the half-width in plan. `roof` is the roof's height and
# `roof_half` its half-width; `arches` are the z of each axle and the radius
# cut round it.
#
# A cross-section is eleven points up one side, numbered from the middle of
# the floor (0) by the sill (2), the widest point (4), the shoulder (5), the
# belt (6), the top of the side glass (7) and the roof edge (8) to the middle
# of the roof (10). Where there is no cabin the upper points close up into
# the edge of the bonnet. A place on the body is (z, s) with s that number.
class Body:
    ROWS = 11

    def __init__(self, kit, top, belt, lo, width, roof, roof_half, arches, crown=0.02, also=()):
        self.kit, self.top, self.belt, self.lo, self.width = kit, top, belt, lo, width
        self.roof, self.roof_half, self.arches, self.crown = roof, roof_half, arches, crown
        zs = {z for line in (top, belt, lo, width) for z, _ in line if top[0][0] <= z <= top[-1][0]} | set(also)
        for axle, radius in arches:
            for n in range(7):
                zs.add(round(axle + radius * math.cos(math.pi * n / 6), 4))
            zs |= {round(axle - radius - 0.012, 4), round(axle + radius + 0.012, 4)}
        self.stations = sorted(zs)

    def arch(self, z):
        for axle, radius in self.arches:
            if abs(z - axle) <= radius + 1e-6:
                return HUB + math.sqrt(max(0.0, radius * radius - (z - axle) ** 2))
        return 0.0

    def ring(self, z):
        w = interp(self.width, z)
        sill = interp(self.lo, z)
        lo = max(sill, self.arch(z))
        top = interp(self.top, z)
        belt = min(interp(self.belt, z), top - 0.02)
        g = clamp((top - belt) / (self.roof - interp(self.belt, z)))
        h = belt - sill
        mix = lambda a, b: a + (b - a) * g
        w7, y7 = mix(w * 0.9, self.roof_half + 0.045), top - mix(0.012, 0.075)
        w8, y8 = mix(w * 0.8, self.roof_half - 0.03), top - mix(0.004, 0.018)
        return [
            (0.0, lo + 0.03),
            (w * 0.8, lo + 0.01),
            (w * 0.95, lo + 0.02),
            (w * 0.99, max(sill + 0.15 * h, lo + 0.035)),
            (w, max(sill + 0.45 * h, lo + 0.06)),
            (w * 0.985, max(sill + 0.82 * h, lo + 0.09)),
            (w * 0.955, max(belt, lo + 0.11)),
            (w7, max(y7, lo + 0.12)),
            (w8, max(y8, lo + 0.125)),
            (w8 * 0.5, top + self.crown * 0.7),
            (0.0, top + self.crown),
        ]

    def point(self, z, s, side=1, lift=0.0):
        ring = self.ring(z)
        i = min(int(s), self.ROWS - 2)
        t = s - i
        x = ring[i][0] + (ring[i + 1][0] - ring[i][0]) * t
        y = ring[i][1] + (ring[i + 1][1] - ring[i][1]) * t
        at = Vector((side * x, y, z))
        if lift:
            at += self.normal(z, s, side) * lift
        return at

    def normal(self, z, s, side=1):
        ds, dz = 0.05, 0.004
        z = clamp(z, self.stations[0] + dz, self.stations[-1] - dz)
        s = clamp(s, ds, self.ROWS - 1 - ds)
        n = (self.point(z, s + ds, side) - self.point(z, s - ds, side)).cross(self.point(z + dz, s, side) - self.point(z - dz, s, side))
        n.normalize()
        return n if n.dot(self.point(z, s, side) - Vector((0, 0.7, z))) >= 0 else -n

    # The whole shell. `mat(z, row)` names the finish of the panel between
    # points `row` and `row + 1` at z; the two end faces are paint.
    def shell(self, mat, ends="paint", sharp=38):
        count = 2 * self.ROWS - 2
        verts, faces, names = [], [], []
        for z in self.stations:
            ring = self.ring(z)
            verts += [(x, y, z) for x, y in ring] + [(-x, y, z) for x, y in ring[-2:0:-1]]
        for i in range(len(self.stations) - 1):
            mid = (self.stations[i] + self.stations[i + 1]) / 2
            for k in range(count):
                a, b = i * count + k, i * count + (k + 1) % count
                faces.append((a, b, b + count, a + count))
                names.append(mat(mid, k if k < self.ROWS - 1 else count - 1 - k))
        faces += [tuple(range(count)), tuple(range(len(verts) - count, len(verts)))]
        names += [ends, ends]
        return self.kit.emit(verts, faces, names, sharp=sharp)

    # A thin patch on the body from z0 to z1 and from s0 to s1, on one side or
    # both. It follows the shell's own panels, so it sits on them exactly.
    def patch(self, z0, z1, s0, s1, mat, sides=(-1, 1), lift=0.004, thick=0.012):
        zs = [z0] + [z for z in self.stations if z0 + 1e-4 < z < z1 - 1e-4] + [z1]
        rows = [s0] + [float(n) for n in range(int(math.ceil(s0 + 1e-4)), int(math.ceil(s1 - 1e-4)))] + [s1]
        made = []
        for side in sides:
            verts = [self.point(z, s, side, lift + thick / 2) for z in zs for s in rows]
            faces = []
            for i in range(len(zs) - 1):
                for j in range(len(rows) - 1):
                    a = i * len(rows) + j
                    faces.append((a, a + 1, a + len(rows) + 1, a + len(rows)))
            made.append(self.kit.lay(self.kit.emit(verts, faces, mat, solid=thick, sharp=60)))
        return made

    # A flat plate on the nose (end 1) or the tail (end -1), `out` proud of it
    def plate(self, end, centre, size, mat, out=0.006, thick=0.012):
        z = (self.stations[-1] if end > 0 else self.stations[0]) + end * (out + thick / 2)
        return self.kit.lay(self.kit.box((size[0], size[1], thick), (centre[0], centre[1], z), mat, bevel=0))


# Renders the finished model with TWISTY_PREVIEW set to a directory
def preview(k, name, height=0.75):
    out = os.environ.get("TWISTY_PREVIEW")
    if not out:
        return
    views = {"side": ((9.5, 1.3, 0.0), (0, height, 0.0)), "front": ((4.6, 2.4, 6.6), (0, height, 0.0)), "rear": ((-4.6, 2.4, -6.6), (0, height, 0.0))}
    for view, (eye, target) in views.items():
        render(k.scene, os.path.join(out, f"{name}-{view}.png"), eye, target, lens=62)
