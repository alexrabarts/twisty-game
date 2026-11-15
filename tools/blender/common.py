# Shared helpers for the asset scripts. Run each script with
#   blender --background --factory-startup --python tools/blender/<script>.py
# Every script is deterministic: fixed seeds, fixed sources, no clock.
import hashlib
import json
import os
import random
import sys
import urllib.request

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
# Downloads are cached outside the repo; only the processed output is committed
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "twisty-blender")


def reset(seed):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(seed)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    return scene


def polyhaven(asset, kind, size="1k", fmt="jpg"):
    """Path of a cached Poly Haven texture map (CC0). `kind` is the API's key: Diffuse, nor_gl, Rough, AO, arm."""
    os.makedirs(CACHE, exist_ok=True)
    # The API refuses requests without a user agent of their own
    fetch = lambda url: urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "twisty-game-asset-pipeline"}))
    with fetch(f"https://api.polyhaven.com/files/{asset}") as response:
        files = json.load(response)
    entry = files[kind][size][fmt]
    path = os.path.join(CACHE, os.path.basename(entry["url"]))
    if not os.path.exists(path) or hashlib.md5(open(path, "rb").read()).hexdigest() != entry["md5"]:
        with fetch(entry["url"]) as response, open(path, "wb") as out:
            out.write(response.read())
    digest = hashlib.md5(open(path, "rb").read()).hexdigest()
    if digest != entry["md5"]:
        sys.exit(f"{path}: md5 {digest} is not the API's {entry['md5']}")
    return path


def load_image(path, colorspace="sRGB"):
    image = bpy.data.images.load(path, check_existing=True)
    image.colorspace_settings.name = colorspace
    return image


def new_image(name, size, colorspace="sRGB", alpha=False):
    image = bpy.data.images.new(name, size, size, alpha=alpha, float_buffer=False)
    image.colorspace_settings.name = colorspace
    return image


def save_webp(image, path, quality=82, size=None):
    """Write an image's pixels as lossy WebP (no view transform), scaled in place to `size` square when given."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if size and (image.size[0] != size or image.size[1] != size):
        image.scale(size, size)
    image.file_format = "WEBP"
    image.save(filepath=path, quality=quality, save_copy=True)
    return os.path.getsize(path)


def select_only(objects, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]


def apply_modifiers(obj):
    select_only([obj])
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_glb(path, objects, quality=82, colours=False, texcoords=True):
    """Export `objects` as glTF binary with WebP textures and no extras; `colours` adds each mesh's active vertex colours."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_image_format="WEBP",
        export_image_quality=quality,
        export_texcoords=texcoords,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE" if colours else "NONE",
        export_all_vertex_colors=False,
        export_yup=True,
        export_apply=True,
        export_extras=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    return os.path.getsize(path)


def triplanar(nodes, links, image, scale, blend=0.3):
    """An image node box-projected in object space, for baking a texture onto a shape with no UVs of its own."""
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.projection = "BOX"
    texture.projection_blend = blend
    links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    return texture
