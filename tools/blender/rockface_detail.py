# The rock face's detail texture: bedded, jointed rock generated from seeded
# noise, as a grey detail map and an OpenGL normal map that tile both ways.
# The game does not lay it as a wallpaper: js/sceneassets.js samples it at
# shifting offsets in world space and multiplies it into the face's own vertex
# colours, so it carries no colour and no feature that stands out from the
# rest (a photo's one odd block shows every time it comes round).
#   blender --background --factory-startup --python tools/blender/rockface_detail.py
import os
import sys

import numpy

sys.path.insert(0, os.path.dirname(__file__))
from common import ASSETS, new_image, reset, save_webp  # noqa: E402

SIZE = 1024
# Beds to a tile, all one pitch: the game shifts the texture by whole beds, so
# the bedding planes of two shifted patches meet (js/sceneassets.js, BEDS)
BEDS = 8
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


def joints(rng):
    """Where the joints cross one bed, as fractions of the tile, and how open each is: blocks 0.12 to 0.45 of it long."""
    out = []
    at = rng.uniform(0, 0.15)
    while at < 0.9:
        out.append(at)
        at += rng.uniform(0.12, 0.45)
    return numpy.array(out), rng.uniform(0.25, 1.0, len(out))


def build():
    rng = numpy.random.default_rng(7)
    y, x = numpy.mgrid[0:SIZE, 0:SIZE] / SIZE
    # Bedding planes wander slowly, so beds swell and pinch along their length
    warp = 0.22 * noise(rng, 1, 3, stretch=0.6) + 0.035 * noise(rng, 5, 20, stretch=0.6)
    s = y * BEDS + warp
    bed = numpy.floor(s).astype(int) % BEDS
    t = s - numpy.floor(s)

    # A joint leans and wanders as it crosses its bed
    along = (x + 0.006 * noise(rng, 3, 14) + (t - 0.5) * 0.1 * noise(rng, 1, 5)) % 1.0
    block = numpy.zeros((SIZE, SIZE), dtype=int)
    gap = numpy.ones((SIZE, SIZE))
    width = numpy.ones((SIZE, SIZE))
    across = numpy.zeros((SIZE, SIZE))
    count = 0
    for b in range(BEDS):
        cuts, opening = joints(rng)
        inside = bed == b
        index = (numpy.searchsorted(cuts, along[inside], side="right") - 1) % len(cuts)
        near = numpy.abs(along[inside][:, None] - cuts[None, :])
        near = numpy.minimum(near, 1 - near)
        block[inside] = count + index
        gap[inside] = near.min(axis=1)
        width[inside] = opening[near.argmin(axis=1)]
        # Position across the block, -0.5 to 0.5, for its tilt
        length = numpy.diff(numpy.append(cuts, cuts[0] + 1))[index]
        across[inside] = ((along[inside] - cuts[index]) % 1.0) / length - 0.5
        count += len(cuts)

    # Each block is a flat facet: how far it stands out, which way it tilts, its shade
    proud = 0.75 + rng.uniform(-0.25, 0.25, count)[block]
    tilt = rng.uniform(-0.3, 0.3, count)[block] * across + rng.uniform(-0.25, 0.25, count)[block] * (t - 0.5)
    shade = rng.uniform(-1, 1, count)[block]
    # A bedding plane opens and closes along its length: a ledge here, a hairline there
    # (closed for a stretch, two beds read as one thick one)
    parting = smooth(-0.25, 0.35, noise(rng, 1, 6, stretch=0.35))
    # Fractures that cut across the beds at a slant, each open for part of its
    # length. Whole numbers of turns a tile, so they tile.
    fracture = numpy.ones((SIZE, SIZE))
    for turns, rise in ((1, 2), (-1, 3), (2, -3)):
        offset = rng.uniform()
        line = numpy.abs((x * turns + y * rise + offset + 0.02 * noise(rng, 2, 10)) % 1.0 - 0.5) / numpy.hypot(turns, rise)
        fracture *= 1 - (1 - smooth(0.0, 0.003, line)) * 0.8 * smooth(0.1, 0.6, noise(rng, 1, 5))
    # A joint is a narrow crack, a bedding plane an undercut ledge; both have hard edges
    joint = (1 - (1 - smooth(0.0, 0.004, gap)) * width) * fracture
    ledge = 1 - (1 - smooth(0.0, 0.05, t) * smooth(0.0, 0.1, 1 - t)) * (0.2 + 0.8 * parting)
    rough = noise(rng, 20, 220)
    lumps = noise(rng, 3, 12)
    height = (proud + tilt) * (0.25 + 0.75 * ledge) * (0.4 + 0.6 * joint) + 0.04 * lumps + 0.025 * rough

    # Laminations inside a bed: short level dashes
    phase = s * 5 + 0.25 * noise(rng, 2, 8, stretch=0.4)
    lines = smooth(0.9, 1.0, numpy.sin(phase * 2 * numpy.pi)) * smooth(0.1, 0.45, noise(rng, 4, 24, stretch=0.2))
    height -= 0.05 * lines

    # Grey detail: the cracks and the undersides dark, the top edge of a ledge
    # a little light, each block a little off its neighbours
    under = 1 - smooth(0.0, 0.045, t)
    rim = smooth(0.82, 0.93, t) * (1 - smooth(0.95, 1.0, t))
    crack = (1 - joint) * 0.6 + (under * 0.6 - rim * 0.06) * (0.2 + 0.8 * parting)
    detail = 1 + 0.1 * shade + 0.05 * lumps + 0.05 * rough - 0.2 * lines - numpy.clip(crack, -0.2, 0.75)
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
