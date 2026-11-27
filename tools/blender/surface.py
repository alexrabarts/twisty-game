# Layered surfaces for the kit models (the model-build skill, section 2): each layer a named step that can be
# switched off and compared, worked into what a model file carries. The bike files carry no maps (README, Format),
# so on them the layers go into the vertex colours, over the baked occlusion, and the bump into the normals:
#
#   tone       base colour varies: two tones of the finish mixed by a large noise, with a slight warm or cool shift
#   speckle    a mid-scale noise held to a narrow band about 1 (low to high), multiplied in
#   cavity     creases and inside corners darkened from the mesh's curvature, over the baked occlusion
#   bump       the normals turned by a large and a fine noise (the fine well under the large)
#   roughness  roughness varies: needs a map (a material has one roughness per draw call), so it is refused on vertex
#              colours rather than left to do nothing
#   wear       exposed edges (convex curvature) lightened on paint and plastic, brightened on metal
#   dirt       a dusty tint low down, broken up by noise
#
# A vertex colour is at most 1, so a layer can only lighten a finish that has room: `headroom` raises each finish's
# colour in the file by up to that factor (never past white) and the vertex colours come down by the same factor, so
# the mean is the finish as written and wear can lighten an edge.
#
# The maths here are plain Python (tested by tools/blender/test_surface.py with no Blender); `apply` writes them into
# Blender meshes. A level of a bike calls it after the occlusion bake (bikes/_kit_E.py, EKit(surface=...)).
# TWISTY_SURFACE switches steps for a variant build without editing a script: "tone,cavity,wear" (only these),
# "-speckle" (all but this), and "wear.amount=0.2" settings, the parts joined with ";".
import math
import os

STEPS = ("tone", "speckle", "cavity", "bump", "roughness", "wear", "dirt")
# Steps a vertex-colour target cannot carry
NEEDS_MAP = ("roughness",)
DEFAULTS = {
    "tone": {"scale": 0.45, "amount": 0.07, "shift": 0.025},
    "speckle": {"scale": 0.06, "low": 0.9, "high": 1.08},
    "cavity": {"amount": 0.45, "start": 0.08},
    "bump": {"large": 0.3, "large_angle": 0.06, "fine": 0.04, "fine_angle": 0.02},
    "roughness": {"scale": 0.3, "amount": 0.15},
    "wear": {"amount": 0.16, "start": 0.12, "full": 0.45},
    "dirt": {"height": 0.42, "amount": 0.3, "colour": (0.78, 0.7, 0.6), "scale": 0.2},
}
# How a finish wears: paint and plastic go pale at the edges, metal goes bright, rubber and cloth hardly change; a lit
# part, a glass and a mark laid on top (a scuff, tape) take no layer
KINDS = ("paint", "plastic", "metal", "rubber", "none")
WEAR = {"paint": 1.0, "plastic": 0.8, "metal": 1.4, "rubber": 0.25}
DIRT = {"paint": 1.0, "plastic": 1.0, "metal": 0.8, "rubber": 0.5}
UNLAYERED = ("headlight", "brake", "signal", "dash", "glass", "reflector", "visor", "tape")


def kind_of(name, roughness, metalness):
    """A finish's kind from its material name and values."""
    if name in UNLAYERED or name.startswith("scuff"):
        return "none"
    if metalness >= 0.5 and not name.startswith("paint"):
        return "metal"
    if name.startswith("paint"):
        return "paint"
    if roughness >= 0.85:
        return "rubber"
    return "plastic"


def config(steps=None, env=None, **settings):
    """The steps switched on (all but `roughness` when `steps` is None) with their settings: DEFAULTS, then
    `settings` ({step: {key: value}}), then TWISTY_SURFACE (or `env`)."""
    on = [s for s in STEPS if s not in NEEDS_MAP] if steps is None else list(steps)
    for step in on:
        if step not in STEPS:
            raise ValueError(f"no surface step {step} (the steps: {', '.join(STEPS)})")
    values = {step: dict(DEFAULTS[step]) for step in STEPS}
    for step, override in settings.items():
        if step not in STEPS:
            raise ValueError(f"no surface step {step}")
        values[step].update(override)
    text = os.environ.get("TWISTY_SURFACE", "") if env is None else env
    for part in [p.strip() for p in text.split(";") if p.strip()]:
        if "=" in part:
            key, raw = part.split("=", 1)
            step, name = key.split(".", 1)
            if step not in STEPS or name not in values[step]:
                raise ValueError(f"TWISTY_SURFACE: no setting {key}")
            values[step][name] = float(raw)
        elif all(word.startswith("-") for word in part.split(",")):
            for word in part.split(","):
                if word[1:] not in STEPS:
                    raise ValueError(f"TWISTY_SURFACE: no step {word[1:]}")
                on = [s for s in on if s != word[1:]]
        else:
            on = [w.strip() for w in part.split(",")]
            for step in on:
                if step not in STEPS:
                    raise ValueError(f"TWISTY_SURFACE: no step {step}")
    return {"on": tuple(on), "values": values}


def _hash(ix, iy, iz, seed):
    n = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144665) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def noise(p, scale, seed=0):
    """Smooth value noise in 0..1 at point `p` (metres), features about `scale` metres across."""
    x, y, z = (c / scale for c in p)
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    sx, sy, sz = (t * t * (3 - 2 * t) for t in (fx, fy, fz))
    total = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (sx if dx else 1 - sx) * (sy if dy else 1 - sy) * (sz if dz else 1 - sz)
                total += w * _hash(ix + dx, iy + dy, iz + dz, seed)
    return total


def fbm(p, scale, seed=0, octaves=3):
    """Noise of several octaves, 0..1, the coarsest at `scale`."""
    total, weight, amp = 0.0, 0.0, 1.0
    for k in range(octaves):
        total += amp * noise(p, scale / (2 ** k), seed + 17 * k)
        weight += amp
        amp *= 0.5
    return total / weight


def convexity(points, normals, neighbours):
    """Per point: how far its neighbours fall away behind its tangent plane (convex edge, > 0) or rise in front of it
    (crease or inside corner, < 0), as the mean of the sine of the angle to each, -1..1."""
    out = []
    for i, around in enumerate(neighbours):
        if not around:
            out.append(0.0)
            continue
        p, n = points[i], normals[i]
        total = 0.0
        for j in around:
            d = [points[j][k] - p[k] for k in range(3)]
            length = math.sqrt(sum(c * c for c in d)) or 1.0
            total -= sum(n[k] * d[k] for k in range(3)) / length
        out.append(total / len(around))
    return out


def ramp(value, start, full):
    """0 below `start`, 1 from `full`, smooth between."""
    if full <= start:
        return 1.0 if value >= start else 0.0
    t = min(1.0, max(0.0, (value - start) / (full - start)))
    return t * t * (3 - 2 * t)


def layer(point, normal, shade, convex, kind, cfg, seed=0):
    """One point's colour multiplier (r, g, b) over its finish, its occlusion `shade` included, and the turn of its
    normal as (dx, dy, dz) to add before normalising."""
    on, values = cfg["on"], cfg["values"]
    for step in on:
        if step in NEEDS_MAP:
            raise ValueError(f"surface step {step} needs a map, and this target carries vertex colours only")
    rgb = [shade, shade, shade]
    turn = (0.0, 0.0, 0.0)
    if kind == "none":
        return tuple(rgb), turn
    if "tone" in on:
        v = values["tone"]
        n = fbm(point, v["scale"], seed + 1) * 2 - 1
        warm = (fbm(point, v["scale"] * 1.7, seed + 2) * 2 - 1) * v["shift"]
        rgb = [rgb[0] * (1 + v["amount"] * n + warm), rgb[1] * (1 + v["amount"] * n), rgb[2] * (1 + v["amount"] * n - warm)]
    if "speckle" in on:
        v = values["speckle"]
        s = v["low"] + (v["high"] - v["low"]) * noise(point, v["scale"], seed + 3)
        rgb = [c * s for c in rgb]
    if "cavity" in on:
        v = values["cavity"]
        dark = 1 - v["amount"] * ramp(-convex, v["start"], 0.6)
        rgb = [c * dark for c in rgb]
    if "wear" in on and kind in WEAR:
        v = values["wear"]
        edge = ramp(convex, v["start"], v["full"]) * WEAR[kind] * (0.6 + 0.8 * noise(point, 0.05, seed + 4))
        rgb = [c * (1 + v["amount"] * edge) for c in rgb]
    if "dirt" in on and kind in DIRT:
        v = values["dirt"]
        low = ramp(v["height"] - point[1], 0.0, v["height"] * 0.8) * DIRT[kind]
        k = v["amount"] * low * (0.4 + 0.6 * fbm(point, v["scale"], seed + 5))
        rgb = [c * (1 - k + k * d) for c, d in zip(rgb, v["colour"])]
    if "bump" in on:
        v = values["bump"]
        turn = tuple(v["large_angle"] * (noise(point, v["large"], seed + 10 + a) * 2 - 1) + v["fine_angle"] * (noise(point, v["fine"], seed + 20 + a) * 2 - 1)
                     for a in range(3))
        # Only the part across the normal turns it
        along = sum(t * c for t, c in zip(turn, normal))
        turn = tuple(t - along * c for t, c in zip(turn, normal))
    return tuple(rgb), turn


def lift(colour, headroom):
    """The factor a finish's linear colour (r, g, b) is raised by in the file: up to `headroom`, never past 1."""
    most = max(colour) or 1.0
    return max(1.0, min(headroom, 1.0 / most))


def surface(points, normals, shades, neighbours, kinds, cfg, seed=0, lifts=None):
    """Every point's stored colour (r, g, b, 1), each at most 1, and its turned normal. `kinds` and `lifts` are per
    point (the finish of the first face that uses it, and that finish's lift)."""
    convex = convexity(points, normals, neighbours) if ({"cavity", "wear"} & set(cfg["on"])) else [0.0] * len(points)
    colours, turned = [], []
    for i, p in enumerate(points):
        rgb, turn = layer(p, normals[i], shades[i], convex[i], kinds[i], cfg, seed)
        f = lifts[i] if lifts else 1.0
        colours.append(tuple(min(1.0, max(0.0, c / f)) for c in rgb) + (1.0,))
        n = [normals[i][k] + turn[k] for k in range(3)]
        length = math.sqrt(sum(c * c for c in n)) or 1.0
        turned.append(tuple(c / length for c in n))
    return colours, turned


def apply(objects, cfg, colours, seed=0, headroom=1.0, attribute="ao"):
    """Works the layers into Blender mesh objects whose occlusion is baked in the colour attribute `attribute`
    (grey). `colours` maps each material name to (colour, roughness, metalness) as the kit holds them; each finish
    is raised by its lift (headroom) once, in its material, however many objects use it."""
    import bpy  # noqa: F401  (Blender only)

    if not cfg["on"]:
        return
    for obj in objects:
        mesh = obj.data
        points = [tuple(obj.location + v.co) for v in mesh.vertices]
        # Blender's axes to the game's (x across, y up, z forward)
        points = [(p[0], p[2], -p[1]) for p in points]
        normals = [(v.normal[0], v.normal[2], -v.normal[1]) for v in mesh.vertices]
        values = [0.0] * (len(mesh.vertices) * 4)
        mesh.color_attributes[attribute].data.foreach_get("color", values)
        shades = values[0::4]
        neighbours = [[] for _ in mesh.vertices]
        for edge in mesh.edges:
            a, b = edge.vertices
            neighbours[a].append(b)
            neighbours[b].append(a)
        names = [m.name if m else "" for m in mesh.materials]
        first = [None] * len(mesh.vertices)
        for poly in mesh.polygons:
            for v in poly.vertices:
                if first[v] is None:
                    first[v] = names[poly.material_index] if names else ""
        finish = {name: colours.get(name.split(".")[0], (0xFFFFFF, 0.5, 0.0)) for name in set(names)}
        kinds_of = {name: kind_of(name.split(".")[0], value[1], value[2]) for name, value in finish.items()}
        linear = {name: _linear(value[0]) for name, value in finish.items()}
        lifts_of = {name: (lift(linear[name], headroom) if kinds_of[name] != "none" else 1.0) for name in finish}
        kinds = [kinds_of.get(n, "none") for n in first]
        lifts = [lifts_of.get(n, 1.0) for n in first]
        stored, turned = surface(points, normals, shades, neighbours, kinds, cfg, seed, lifts)
        flat = [c for colour in stored for c in colour]
        mesh.color_attributes[attribute].data.foreach_set("color", flat)
        if "bump" in cfg["on"]:
            corners = [tuple(c.vector) for c in mesh.corner_normals]
            custom = []
            for loop in mesh.loops:
                base = corners[loop.index]
                t = turned[loop.vertex_index]
                n0 = normals[loop.vertex_index]
                # The vertex's turn, in Blender's axes, laid on the corner's own normal (a sharp edge keeps its split)
                d = (t[0] - n0[0], -(t[2] - n0[2]), t[1] - n0[1])
                n = [base[k] + d[k] for k in range(3)]
                length = math.sqrt(sum(c * c for c in n)) or 1.0
                custom.append(tuple(c / length for c in n))
            mesh.normals_split_custom_set(custom)
        for material in mesh.materials:
            # (a finish two levels share is raised once: the mark stays on the material)
            if material is None or "surface_lift" in material:
                continue
            f = lifts_of.get(material.name, 1.0)
            material["surface_lift"] = f
            if f != 1.0:
                shader = material.node_tree.nodes["Principled BSDF"]
                base = shader.inputs["Base Color"].default_value
                shader.inputs["Base Color"].default_value = (base[0] * f, base[1] * f, base[2] * f, base[3])


def _linear(value):
    """A 0xRRGGBB sRGB colour as linear (r, g, b)."""
    out = []
    for shift in (16, 8, 0):
        c = ((value >> shift) & 255) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)
