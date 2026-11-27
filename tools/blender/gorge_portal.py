# The gorge's tunnel portal: a masonry headwall round the tunnel opening with
# a ring of dressed voussoirs and a keystone, plinths, a string course, a
# cornice and parapet, and buttress piers that run down into the rock; and a
# wing wall that retains the canyon wall beside the road on one side (the
# game mirrors it for the other side, and leaves it off a side that drops).
#
# Modelled in metres for the gorge's tunnels: the road is 20 m wide, the
# lining's half-ellipse 11 m across each way and 7.5 m high (Environment
# .buildTunnel). Blender X is across the road (+X right as the portal faces
# out), Z up, and -Y out of the tunnel: in glTF the portal faces +Z.
#   blender --background --factory-startup --python tools/blender/gorge_portal.py
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, export_glb, load_image, polyhaven, reset  # noqa: E402

OUT = os.path.join(ASSETS, "gorge", "portal.glb")
# A hand's width inside the lining (11 x 7.5), so the reveal hides its edge
OPENING = (10.85, 7.4)
FRONT, BACK = -0.3, 1.2
TOP = 10.2
# Masonry infill and dressed stone, with each one's real size in metres per texture tile
MASONRY = ("rough_block_wall", 3.0)
DRESSED = ("rock_boulder_dry", 1.8)
# How far a dressed stone stands into the infill it meets (its face out of every face of the infill), and how far
# behind the infill's back the stones' backs run, past the 5 cm the coplanar check reads (tools/model-stats.mjs)
SINK = 0.08
DEEP = 0.12


def ellipse(t, grow=0.0):
    return Vector((math.cos(t) * (OPENING[0] + grow), 0.0, math.sin(t) * (OPENING[1] + grow)))


def prism(bm, outline, front, back):
    """A flat outline in the XZ plane (counter-clockwise seen from -Y), extruded from y=front to y=back."""
    near = [bm.verts.new((p.x, front, p.z)) for p in outline]
    far = [bm.verts.new((p.x, back, p.z)) for p in outline]
    faces = [bm.faces.new(list(reversed(far))), bm.faces.new(near)]
    for n in range(len(outline)):
        m = (n + 1) % len(outline)
        faces.append(bm.faces.new((near[n], far[n], far[m], near[m])))
    return faces


def block(bm, x0, x1, z0, z1, front, back):
    return prism(bm, [Vector((x0, 0, z0)), Vector((x1, 0, z0)), Vector((x1, 0, z1)), Vector((x0, 0, z1))], front, back)


def chamfer(bm, faces, width):
    """Bevel every edge of `faces` (one stone each), so the stones catch the light."""
    edges = list({edge for face in faces for edge in face.edges})
    bmesh.ops.bevel(bm, geom=edges, offset=width, segments=1, affect="EDGES", profile=0.5)


def box_uv(bm, tile):
    """World-scale UVs: each face takes the two axes across its normal, `tile` metres to a unit."""
    layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        axis = max(range(3), key=lambda k: abs(n[k]))
        for loop in face.loops:
            co = loop.vert.co
            u, v = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][axis]
            loop[layer].uv = (u / tile, v / tile)


def mesh_object(name, bm, material, tile):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uv(bm, tile)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def material(name, source, colour_size, normal_size):
    """A stone surface from a Poly Haven scan, its maps scaled to the sizes the portal needs."""
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.92
    colour = nodes.new("ShaderNodeTexImage")
    colour.image = load_image(polyhaven(source, "Diffuse"))
    colour.image.scale(colour_size, colour_size)
    links.new(colour.outputs["Color"], shader.inputs["Base Color"])
    bumps = nodes.new("ShaderNodeTexImage")
    bumps.image = load_image(polyhaven(source, "nor_gl"), "Non-Color")
    bumps.image.scale(normal_size, normal_size)
    normal = nodes.new("ShaderNodeNormalMap")
    links.new(bumps.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    return mat


def headwall(masonry):
    """The infill: one slab round the opening, the road's gap cut down through it."""
    bm = bmesh.new()
    steps = 48
    arch = [ellipse(math.pi - math.pi * k / steps) for k in range(steps + 1)]
    outline = [Vector((-14.2, 0, -8)), Vector((-OPENING[0], 0, -8)), Vector((-OPENING[0], 0, 0))]
    outline += arch[1:-1]
    # (its top SINK up inside the cornice: no face of the two in one plane, graphics.md "No two materials fight")
    outline += [Vector((OPENING[0], 0, 0)), Vector((OPENING[0], 0, -8)), Vector((14.2, 0, -8)), Vector((14.2, 0, TOP + SINK)), Vector((-14.2, 0, TOP + SINK))]
    # The outline above runs clockwise seen from -Y
    prism(bm, list(reversed(outline)), FRONT, BACK)
    # The parapet's infill over the cornice
    block(bm, -14.2, 14.2, TOP + 0.55 - SINK, TOP + 1.35 + SINK, -0.2, 0.5)
    return mesh_object("portal_masonry", bm, masonry, MASONRY[1])


def stones(dressed):
    """Everything cut and dressed: voussoirs, keystone, plinths, string course, cornice, coping, piers."""
    bm = bmesh.new()
    pieces = []
    count = 23
    gap = 0.012
    for k in range(count):
        t0 = math.pi * k / count + gap
        t1 = math.pi * (k + 1) / count - gap
        key = k == count // 2
        depth = 1.55 if key else 1.05
        proud = -0.75 if key else -0.5
        # (its soffit a hand inside the opening and its back deep in the rock: neither in a face of the infill)
        quad = [ellipse(t1, -SINK), ellipse(t0, -SINK), ellipse(t0, depth), ellipse(t1, depth)]
        pieces.append(prism(bm, quad, proud, BACK + DEEP))
    for side in (-1, 1):
        x0, x1 = sorted((side * (OPENING[0] - SINK), side * (OPENING[0] + 1.6)))
        pieces.append(block(bm, x0, x1, -1.2, 0.35, -0.75, BACK + DEEP))
        # Buttress piers at the outer edges, founded deep in the rock
        x0, x1 = sorted((side * 14.0, side * 15.7))
        pieces.append(block(bm, x0, x1, -9, TOP, -0.85, BACK + 0.1))
        pieces.append(block(bm, *sorted((side * 13.85, side * 15.85)), TOP, TOP + 1.7, -0.95, BACK + 0.15))
    pieces.append(block(bm, -14.0, 14.0, 8.95, 9.3, -0.5, BACK + DEEP))
    pieces.append(block(bm, -15.9, 15.9, TOP, TOP + 0.55, -0.85, BACK + 0.2))
    pieces.append(block(bm, -14.3, 14.3, TOP + 1.35, TOP + 1.6, -0.35, 0.6))
    for faces in pieces:
        chamfer(bm, faces, 0.06)
    return mesh_object("portal_dressed", bm, dressed, DRESSED[1])


def wing(masonry, dressed):
    """A retaining wall on the +X side, standing 1.15 m past the road edge and stepping down away from the portal."""
    reach = 11.0
    inner, outer = 11.15, 12.8
    rise, fall = 8.9, 2.4
    bm = bmesh.new()
    # The wall as a side profile in the YZ plane, extruded across X
    profile = [(FRONT + 0.1, -1.5), (-reach, -1.5), (-reach, fall), (FRONT + 0.1, rise)]
    near = [bm.verts.new((inner, y, z)) for y, z in profile]
    far = [bm.verts.new((outer, y, z)) for y, z in profile]
    bm.faces.new(near)
    bm.faces.new(list(reversed(far)))
    for n in range(4):
        m = (n + 1) % 4
        bm.faces.new((near[m], near[n], far[n], far[m]))
    body = mesh_object("portal_wing_masonry", bm, masonry, MASONRY[1])

    bm = bmesh.new()
    # Coping along the sloping top, in short stones, and a pier at the far end
    stones_along = 9
    for k in range(stones_along):
        # (the first stone's end stands proud of the wall's end face)
        y0 = FRONT + 0.1 - (reach + FRONT + 0.1) * k / stones_along + (SINK if k == 0 else 0)
        y1 = FRONT + 0.1 - (reach + FRONT + 0.1) * (k + 1) / stones_along - 0.03
        z0 = rise + (fall - rise) * (k / stones_along)
        z1 = rise + (fall - rise) * ((k + 1) / stones_along)
        outline = [(y0, z0 - 0.15), (y1, z1 - 0.15), (y1, z1 + 0.35), (y0, z0 + 0.35)]
        a = [bm.verts.new((inner - 0.15, y, z)) for y, z in outline]
        b = [bm.verts.new((outer + 0.1, y, z)) for y, z in outline]
        faces = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
        for n in range(4):
            m = (n + 1) % 4
            faces.append(bm.faces.new((a[m], a[n], b[n], b[m])))
        chamfer(bm, faces, 0.04)
    end = prism(bm, [Vector((inner - 0.25, 0, -1.5)), Vector((outer + 0.2, 0, -1.5)), Vector((outer + 0.2, 0, fall + 0.9)), Vector((inner - 0.25, 0, fall + 0.9))], -reach - 0.6, -reach + 0.6)
    chamfer(bm, end, 0.05)
    coping = mesh_object("portal_wing_dressed", bm, dressed, DRESSED[1])
    return body, coping


def join(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    joined.data.name = name
    return joined


def main():
    reset(seed=0)
    masonry = material("portal_masonry", MASONRY[0], 1024, 512)
    dressed = material("portal_dressed", DRESSED[0], 512, 512)
    arch = join("portal_arch", [headwall(masonry), stones(dressed)])
    wing_wall = join("portal_wing", list(wing(masonry, dressed)))
    size = export_glb(OUT, [arch, wing_wall], quality=78)
    print(f"wrote {OUT}: {size} bytes, triangles {[(o.name, sum(len(p.vertices) - 2 for p in o.data.polygons)) for o in (arch, wing_wall)]}", flush=True)


main()
