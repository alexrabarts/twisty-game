# The gorge's rock face texture: a tileable photo-scanned rock wall (CC0,
# Poly Haven) as WebP colour and OpenGL normal maps. The face keeps its own
# UVs (16 m to a unit, js/environment.js) and vertex colours; the game repeats
# this texture over them (js/sceneassets.js, rockFace.repeat).
#   blender --background --factory-startup --python tools/blender/gorge_rockface.py
import os
import sys

import numpy

sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, load_image, polyhaven, reset, save_webp  # noqa: E402

# Layered sandstone: the strata run along the road, as the face's own colour bands do
SOURCE = "cliff_side"
SIZE = 1024
# The scan is a sunlit orange; the gorge's rock is a cooler grey under fog.
# The face's vertex colours (0.4 to 1) multiply the texture, so it is lifted
# to a mean as light as the procedural rock texture it replaces.
GREY = 0.55
MEAN = 0.62


def cool(image):
    pixels = numpy.array(image.pixels[:], dtype=numpy.float32).reshape(-1, 4)
    luma = pixels[:, :3] @ numpy.array([0.2126, 0.7152, 0.0722], dtype=numpy.float32)
    pixels[:, :3] = pixels[:, :3] * (1 - GREY) + luma[:, None] * GREY
    pixels[:, :3] = numpy.clip(pixels[:, :3] * (MEAN / luma.mean()), 0, 1)
    image.pixels.foreach_set(pixels.ravel())
    image.update()


def main():
    reset(seed=0)
    albedo = load_image(polyhaven(SOURCE, "Diffuse"))
    cool(albedo)
    normal = load_image(polyhaven(SOURCE, "nor_gl"), "Non-Color")
    out = os.path.join(ASSETS, "gorge")
    sizes = {
        "rockface_albedo.webp": save_webp(albedo, os.path.join(out, "rockface_albedo.webp"), quality=80, size=SIZE),
        "rockface_normal.webp": save_webp(normal, os.path.join(out, "rockface_normal.webp"), quality=85, size=SIZE),
    }
    print(f"wrote {sizes}", flush=True)


main()
