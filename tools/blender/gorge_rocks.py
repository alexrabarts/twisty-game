# Five sculpted rock variants for the gorge, sharing one texture atlas:
# a high-poly sculpt per variant (cut faces, voxel remesh, layered
# displacement, a photo-scanned rock texture projected onto it) is baked onto
# a low-poly mesh of under a thousand triangles: base colour, tangent-space
# normal, and ambient occlusion with roughness packed into one ORM map.
#
# Each variant is centred on its origin with a mean vertex radius of 1, so the
# game scales it by the radius the procedural rock it replaces was given.
#   blender --background --factory-startup --python tools/blender/gorge_rocks.py
import math
import os
import random
import sys

import bpy
import numpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, apply_modifiers, export_glb, load_image, new_image, polyhaven, reset, select_only, triplanar  # noqa: E402

OUT = os.path.join(ASSETS, "gorge", "rocks.glb")
ATLAS = 1024
# The canyon's own rock (warm grey sandstone) under a photo-scanned boulder surface
SOURCE = "rock_boulder_dry"

# name, stretch (x, y, z in Blender, z up), flat cuts, cut depth range, voronoi strength, triangles
VARIANTS = [
    ("rock_round", (1.15, 1.0, 0.82), 3, (0.55, 0.75), 0.14, 900),
    ("rock_block", (1.2, 0.95, 0.85), 6, (0.45, 0.65), 0.08, 800),
    ("rock_slab", (1.35, 1.1, 0.6), 4, (0.4, 0.6), 0.1, 700),
    ("rock_wedge", (1.0, 1.25, 0.9), 5, (0.35, 0.6), 0.12, 800),
    ("rock_lump", (1.05, 0.95, 1.0), 4, (0.5, 0.7), 0.18, 900),
]
# Faces meeting at more than this keep a hard edge: the fractures stay crisp
SHARP = math.radians(48)


def noise_texture(name, kind, size, **settings):
    texture = bpy.data.textures.new(name, kind)
    texture.noise_scale = size
    for key, value in settings.items():
        setattr(texture, key, value)
    return texture


def sculpt(name, stretch, cuts, depth, voronoi):
    """The high-poly rock: a stretched sphere with flat fractures, remeshed and weathered."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.0)
    rock = bpy.context.active_object
    rock.name = f"{name}_high"
    rock.scale = stretch
    select_only([rock])
    bpy.ops.object.transform_apply(scale=True)

    # Fractures: big cubes whose near face slices a flat off the rock
    for n in range(cuts):
        direction = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.6, 1))).normalized()
        bpy.ops.mesh.primitive_cube_add(size=4.0)
        cutter = bpy.context.active_object
        cutter.rotation_mode = "QUATERNION"
        cutter.rotation_quaternion = direction.to_track_quat("Z", "Y")
        cutter.location = direction * (2.0 + random.uniform(*depth))
        boolean = rock.modifiers.new(f"cut{n}", "BOOLEAN")
        boolean.operation = "DIFFERENCE"
        boolean.object = cutter
        apply_modifiers(rock)
        bpy.data.objects.remove(cutter)

    # Even topology for the displacement, then weathering at three scales
    rock.data.remesh_voxel_size = 0.03
    select_only([rock])
    bpy.ops.object.voxel_remesh()
    offset = Vector((random.uniform(-50, 50), random.uniform(-50, 50), random.uniform(-50, 50)))
    rock.location = offset
    layers = [
        (noise_texture(f"{name}_cells", "VORONOI", 0.55, distance_metric="DISTANCE"), voronoi),
        (noise_texture(f"{name}_lumps", "CLOUDS", 0.35, noise_depth=2), 0.07),
        (noise_texture(f"{name}_grit", "CLOUDS", 0.06, noise_depth=1), 0.012),
    ]
    for texture, strength in layers:
        displace = rock.modifiers.new(texture.name, "DISPLACE")
        displace.texture = texture
        displace.texture_coords = "GLOBAL"
        displace.strength = strength
        displace.mid_level = 0.5
    apply_modifiers(rock)
    rock.location = (0, 0, 0)
    bpy.ops.object.shade_smooth()
    # The boolean leaves an empty material slot behind, which would bake as plain grey
    rock.data.materials.clear()
    return rock


def retopo(high, triangles):
    """The game mesh: the sculpt decimated to `triangles`, smooth shaded."""
    low = high.copy()
    low.data = high.data.copy()
    low.name = high.name.replace("_high", "")
    bpy.context.collection.objects.link(low)
    decimate = low.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = triangles / (len(high.data.polygons) * 2)
    low.modifiers.new("triangulate", "TRIANGULATE")
    apply_modifiers(low)
    select_only([low])
    bpy.ops.object.shade_smooth_by_angle(angle=SHARP)
    return low


def normalise(high, low):
    """Centre both meshes on the low mesh's bounds and scale it to a mean radius of 1."""
    points = [v.co.copy() for v in low.data.vertices]
    lo =Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    centre = (lo + hi) / 2
    radius = sum((p - centre).length for p in points) / len(points)
    for obj in (high, low):
        for v in obj.data.vertices:
            v.co = (v.co - centre) / radius


def bake_material(image_albedo, image_disp, image_rough, tint):
    """The sculpt's surface: the scanned rock box-projected, its height as bump, tinted per variant."""
    material = bpy.data.materials.new("bake_source")
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    albedo = triplanar(nodes, links, image_albedo, 0.55)
    tinted = nodes.new("ShaderNodeMix")
    tinted.data_type = "RGBA"
    tinted.blend_type = "MULTIPLY"
    tinted.inputs["Factor"].default_value = 1.0
    # The mix node has a float, a vector and a colour socket under each name
    colour = lambda sockets, name: next(s for s in sockets if s.name == name and s.type == "RGBA")
    links.new(albedo.outputs["Color"], colour(tinted.inputs, "A"))
    colour(tinted.inputs, "B").default_value = (*tint, 1.0)
    links.new(colour(tinted.outputs, "Result"), shader.inputs["Base Color"])
    rough = triplanar(nodes, links, image_rough, 0.55)
    links.new(rough.outputs["Color"], shader.inputs["Roughness"])
    height = triplanar(nodes, links, image_disp, 0.55)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 1.0
    bump.inputs["Distance"].default_value = 0.08
    links.new(height.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def gltf_output_group():
    """The node group the glTF exporter reads ambient occlusion from."""
    group = bpy.data.node_groups.get("glTF Material Output")
    if group:
        return group
    group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def game_material(albedo, normal, orm):
    material = bpy.data.materials.new("gorge_rock")
    material.use_backface_culling = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    base = nodes.new("ShaderNodeTexImage")
    base.image = albedo
    links.new(base.outputs["Color"], shader.inputs["Base Color"])
    bumps = nodes.new("ShaderNodeTexImage")
    bumps.image = normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(bumps.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    packed = nodes.new("ShaderNodeTexImage")
    packed.image = orm
    channels = nodes.new("ShaderNodeSeparateColor")
    links.new(packed.outputs["Color"], channels.inputs["Color"])
    links.new(channels.outputs["Green"], shader.inputs["Roughness"])
    links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
    output = nodes.new("ShaderNodeGroup")
    output.node_tree = gltf_output_group()
    links.new(channels.outputs["Red"], output.inputs["Occlusion"])
    return material


def main():
    scene = reset(seed=4)
    scene.cycles.samples = 48
    source = {
        "albedo": load_image(polyhaven(SOURCE, "Diffuse")),
        "disp": load_image(polyhaven(SOURCE, "Displacement"), "Non-Color"),
        "rough": load_image(polyhaven(SOURCE, "Rough"), "Non-Color"),
    }
    targets = {
        "albedo": new_image("gorge_rock_albedo", ATLAS),
        "normal": new_image("gorge_rock_normal", ATLAS, "Non-Color"),
        "ao": new_image("gorge_rock_ao", ATLAS, "Non-Color"),
        "rough": new_image("gorge_rock_rough", ATLAS, "Non-Color"),
    }

    pairs = []
    for n, (name, stretch, cuts, depth, voronoi, triangles) in enumerate(VARIANTS):
        high = sculpt(name, stretch, cuts, depth, voronoi)
        low = retopo(high, triangles)
        normalise(high, low)
        tint = [random.uniform(0.92, 1.0), random.uniform(0.9, 0.97), random.uniform(0.86, 0.94)]
        high.data.materials.append(bake_material(source["albedo"], source["disp"], source["rough"], tint))
        pairs.append((high, low))

    # One atlas for all five: unwrap together so the islands share the square
    lows = [low for _, low in pairs]
    select_only(lows)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.006, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Bake each pair alone, side by side so no ray reaches a neighbour's sculpt
    bake_target = bpy.data.materials.new("bake_target")
    target_node = bake_target.node_tree.nodes.new("ShaderNodeTexImage")
    bake_target.node_tree.nodes.active = target_node
    for n, (high, low) in enumerate(pairs):
        high.location.x = low.location.x = n * 6.0
        low.data.materials.clear()
        low.data.materials.append(bake_target)
    passes = [
        ("albedo", "DIFFUSE", {"pass_filter": {"COLOR"}}),
        ("normal", "NORMAL", {"normal_space": "TANGENT"}),
        ("ao", "AO", {}),
        ("rough", "ROUGHNESS", {}),
    ]
    for key, kind, options in passes:
        target_node.image = targets[key]
        for n, (high, low) in enumerate(pairs):
            select_only([high, low], active=low)
            bpy.ops.object.bake(
                type=kind,
                use_selected_to_active=True,
                cage_extrusion=0.06,
                max_ray_distance=0.25,
                margin=6,
                use_clear=(n == 0),
                **options,
            )
        pixels = numpy.array(targets[key].pixels[:]).reshape(-1, 4)
        print(f"baked {key}: mean {pixels[:, :3].mean(axis=0)}, std {pixels[:, :3].std(axis=0)}", flush=True)

    # Ambient occlusion and roughness share one map: three reads AO from red, roughness from green
    size = ATLAS // 2
    orm = new_image("gorge_rock_orm", size, "Non-Color")
    channels = []
    for key in ("ao", "rough"):
        # A copy of a baked image regenerates it blank, so halve the pixels here
        red = numpy.array(targets[key].pixels[:]).reshape(ATLAS, ATLAS, 4)[:, :, 0]
        channels.append(red.reshape(size, 2, size, 2).mean(axis=(1, 3)).ravel())
    pixels = numpy.stack([channels[0], channels[1], numpy.zeros_like(channels[0]), numpy.ones_like(channels[0])], axis=1)
    orm.pixels.foreach_set(pixels.ravel().astype(numpy.float32))
    orm.update()
    for image in (targets["albedo"], targets["normal"], orm):
        image.pack()

    material = game_material(targets["albedo"], targets["normal"], orm)
    for high, low in pairs:
        bpy.data.objects.remove(high)
        low.location = (0, 0, 0)
        low.data.materials.clear()
        low.data.materials.append(material)
    size = export_glb(OUT, lows)
    triangles = {low.name: len(low.data.polygons) for low in lows}
    print(f"wrote {OUT}: {size} bytes, triangles {triangles}", flush=True)


main()
