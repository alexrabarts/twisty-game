# The rock face's detail texture: the grain of a rock surface and a few
# fractures, generated from seeded noise, as a grey detail map and an OpenGL
# normal map that tile both ways. It holds no beds and no blocks: the game
# draws the bedding planes from world height (js/sceneassets.js, BED), reads
# this at shifting offsets and multiplies it into the face's own vertex
# colours, so it carries no colour and no feature that stands out from the
# rest (a photo's one odd block shows every time it comes round).
#   blender --background --factory-startup --python tools/blender/rockface_detail.py
import os
import sys

import numpy

sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, new_image, reset, save_webp  # noqa: E402

SIZE = 1024
# The stored grey that leaves the face's colour as it is; the game divides by it
NEUTRAL = 0.5
# Slope of the relief in the normal map, in texels of height per texel
RELIEF = 5.0


def noise(rng, low, high, stretch=1.0):
    """Tileable noise in -1 to 1: white noise kept between `low` and `high` cycles a tile, `stretch` times longer along x."""
    spectrum = numpy.fft.fft2(rng.standard_normal((SIZE, SIZE)))
    fy = numpy.fft.fftfreq(SIZE, 1 / SIZE)[:, None]
    fx = numpy.fft.fftfreq(SIZE, 1 / SIZE)[None, :] * stretch
    f = numpy.hypot(fx, fy)
    keep = (f >= low) & (f <= high)
    field = numpy.fft.ifft2(spectrum * keep / numpy.maximum(f, 1) ** 1.2).real
    return field / numpy.abs(field).max()


def smooth(edge0, edge1, x):
    t = numpy.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


# Fracture sets as (turns, rise, wander): a line crosses the tile `turns`
# times across and `rise` times up, whole numbers so it tiles. Two sets stand
# near upright (the joints), two run at a slant.
FRACTURES = ((1, 0, 0.05), (2, 1, 0.03), (-1, 2, 0.03), (1, -3, 0.02))


def build():
    rng = numpy.random.default_rng(7)
    y, x = numpy.mgrid[0:SIZE, 0:SIZE] / SIZE
    # Each fracture is open for about a third of its length and wanders, so
    # the joints are few, broken and never a grid
    fracture = numpy.ones((SIZE, SIZE))
    for turns, rise, wander in FRACTURES:
        line = numpy.abs((x * turns + y * rise + rng.uniform() + wander * noise(rng, 1, 6) + 0.006 * noise(rng, 8, 30)) % 1.0 - 0.5) / numpy.hypot(turns, rise)
        fracture *= 1 - (1 - smooth(0.0, 0.0028, line)) * smooth(0.15, 0.5, noise(rng, 1, 4))

    rough = noise(rng, 20, 220)
    lumps = noise(rng, 2, 10)
    # Laminations: short level dashes, in drifts
    phase = y * 40 + 0.4 * noise(rng, 2, 8, stretch=0.4)
    lines = smooth(0.92, 1.0, numpy.sin(phase * 2 * numpy.pi)) * smooth(0.15, 0.5, noise(rng, 4, 24, stretch=0.2)) * smooth(-0.2, 0.4, noise(rng, 1, 3))
    height = 0.5 + 0.12 * lumps + 0.06 * rough - 0.05 * lines - 0.5 * (1 - fracture)

    detail = 1 + 0.1 * lumps + 0.09 * rough - 0.16 * lines - 0.45 * (1 - fracture)
    detail = numpy.clip(detail, 0.2, 1.6)
    detail *= 1 / detail.mean()

    # Central differences, wrapped, so the normal map tiles as the height does
    dx = (numpy.roll(height, -1, axis=1) - numpy.roll(height, 1, axis=1)) * 0.5 * RELIEF * SIZE / 256
    dy = (numpy.roll(height, -1, axis=0) - numpy.roll(height, 1, axis=0)) * 0.5 * RELIEF * SIZE / 256
    normal = numpy.dstack([-dx, -dy, numpy.ones_like(dx)])
    normal /= numpy.linalg.norm(normal, axis=2, keepdims=True)
    return detail, normal


def rgba(rgb):
    out = numpy.ones((SIZE, SIZE, 4), dtype=numpy.float32)
    out[..., :3] = rgb
    return out.ravel()


def main():
    reset(seed=0)
    detail, normal = build()
    # Stored sRGB-encoded: the game's colour maps are decoded on the way in
    linear = numpy.clip(detail * NEUTRAL, 0, 1)
    encoded = numpy.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)
    grey = new_image("rockface_detail", SIZE)
    grey.pixels.foreach_set(rgba(encoded[..., None].repeat(3, axis=2)))
    bumps = new_image("rockface_normal", SIZE, "Non-Color")
    bumps.pixels.foreach_set(rgba(normal * 0.5 + 0.5))
    out = os.path.join(ASSETS, "rockface")
    sizes = {
        "detail.webp": save_webp(grey, os.path.join(out, "detail.webp"), quality=78),
        "normal.webp": save_webp(bumps, os.path.join(out, "normal.webp"), quality=82),
    }
    print(f"wrote {sizes}", flush=True)


main()
