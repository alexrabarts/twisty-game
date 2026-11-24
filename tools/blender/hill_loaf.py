# The hill ride's last picture (js/hill/ride.js): a plain crusty loaf on a bread board, with a knife beside it. A long
# loaf with a rounded top, its crust darker on top, four diagonal cuts opened in baking to show the pale crumb, on a
# board of oiled wood. No mark, stamp, name or wordmark on the loaf, the board or the knife.
#
# Written in the game's axes (x across, y up, z along the loaf, metres, the board on y = 0), as the bike kit takes them.
#   blender --background --factory-startup --python tools/blender/hill_loaf.py
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "bikes"))
import _kit_E as E  # noqa: E402
import common  # noqa: E402

E.far.bike = lambda path: None

OUT = os.path.join(common.ASSETS, "hill", "loaf.glb")
COLOURS = {"paint": 0x8a6038, "trim": 0x2a2420}
EXTRA = {
    "crust": (0xa86630, 0.75, 0.0),
    "crust_top": (0x7e461c, 0.7, 0.0),
    "crumb": (0xead6a8, 0.9, 0.0),
    "board": (0x6e4a2c, 0.6, 0.0),
    "blade": (0xa4a8ac, 0.35, 0.6),
    "handle": (0x4a3020, 0.6, 0.0),
}
TOP = 0.035


def draw(k):
    k.begin("board")
    k.box((0.56, TOP, 0.36), (0, TOP / 2, 0), "board", bevel=0.01)
    k.begin("loaf", (0, TOP, 0))
    # The loaf: rounded ends, a domed top, a flat foot; the top darker than the sides
    sections = []
    for i, z in enumerate((-0.17, -0.15, -0.11, 0.0, 0.11, 0.15, 0.17)):
        end = abs(z) / 0.17
        w = 0.105 * math.sqrt(max(0.05, 1 - end ** 6))
        h = 0.125 * math.sqrt(max(0.08, 1 - end ** 4))
        sections.append((z, TOP, TOP + max(0.02, h), max(0.01, w), 2.2, 6))
    k.loft(sections, lambda u, up, side: "crust_top" if up > 0.55 else "crust", ring=24, steps=3)
    # Four cuts across the top, opened in baking: pale crumb in each
    for i in range(4):
        z = -0.105 + i * 0.07
        # Each cut a thin pale strip lying in the crust, its ends sunk under it
        top = TOP + 0.125 * math.sqrt(max(0.08, 1 - (abs(z) / 0.17) ** 4)) - 0.006
        k.box((0.11, 0.006, 0.014), (0.0, top, z), "crumb", rot=(0.0, 0.55, 0), bevel=0.003)
    k.begin("knife", (0.21, TOP, 0))
    k.box((0.012, 0.004, 0.2), (0.2, TOP + 0.003, 0.02), "blade", rot=(0, 0.25, 0), bevel=0.001)
    k.box((0.022, 0.018, 0.11), (0.23, TOP + 0.01, -0.13), "handle", rot=(0, 0.25, 0), bevel=0.006)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    k = E.EKit(seed=401, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"centre": (0, TOP, 0)})
    E.previews(k, "hill_loaf", height=0.1, reach=0.12)


build()
