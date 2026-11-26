# The hill ride's horse and cart (js/hill/horse.js, js/hill/day.js): a heavy cart horse in its harness between the
# shafts of a two-wheeled village cart, a carter on the seat. The horse is bay with a black mane and tail, white
# feathers over its hooves and a white blaze; its harness is black leather with brass: a deep collar and hames, a cart
# saddle on its back, a belly band, the breeching round its quarters, a bridle with blinkers, the traces back to the
# cart. The cart: a plank bed on two big wooden wheels with twelve spokes and iron tyres, shafts forward to the saddle,
# a load of milk churns and sacks. No name, mark or lettering anywhere.
#
# Every part the game moves is a node of its own, built at rest hanging from its pivot: the head (at the poll), the
# neck (at its root), each ear, the tail (at the dock), and each leg in three (the forearm or the gaskin from the elbow
# or the stifle, the cannon from the knee or the hock, the pastern and hoof from the fetlock). The cart's bed (at the
# axle), each wheel (at its hub) and the carter (at his seat) are nodes too. The game poses them (HillHorse).
#
# Written in the game's axes (x across, y up, z forward, metres, ground at y = 0), the horse facing +z, its right as
# +x, which the kit mirrors on export (tools/blender/bikes/_kit_E.py). Deterministic: the same file on every build.
#   blender --background --factory-startup --python tools/blender/hill_horse.py
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "bikes"))
import _kit_E as E  # noqa: E402
import common  # noqa: E402

E.far.bike = lambda path: None

OUT = os.path.join(common.ASSETS, "hill", "horse.glb")

# The horse's joints at rest (game axes; x is the right legs' side). A heavy horse of about 1.7 m at the withers
FORE_Z, HIND_Z = 0.55, -0.62
FORE_X, HIND_X = 0.21, 0.22
ELBOW_Y, KNEE_Y, FORE_FET_Y = 1.04, 0.56, 0.2
STIFLE = (0.25, 1.1, -0.5)
HOCK_Y, HOCK_BACK, HIND_FET_Y = 0.64, 0.14, 0.2
POLL = (0, 2.02, 1.3)
NECK_ROOT = (0, 1.5, 0.72)
DOCK = (0, 1.52, -0.9)
EAR = (0.07, 2.1, 1.27)
# The cart: the axle, the wheels' radius and track, the bed, the seat
AXLE = (0, 0.62, -2.45)
WHEEL_R, TRACK = 0.62, 0.78
BED = (-3.35, -1.55, 0.95, 0.66)  # z from, z to, the bed's floor height, its half width
SEAT = (0, 1.3, -1.72)

COLOURS = {"paint": 0x2A2420, "paint_dark": 0x1A1614, "accent": 0xE8E0C8, "rim": 0x2A2622, "trim": 0x1A1614, "seat": 0x5A3A22,
           "plastic": 0xE8E0C8}
EXTRA = {
    "bay": (0x5E3C24, 0.75, 0.0),
    "bay_dark": (0x3E2818, 0.8, 0.0),
    "mane": (0x1C1814, 0.9, 0.0),
    "white": (0xE8E2D6, 0.9, 0.0),
    "hoof": (0x2E2822, 0.7, 0.0),
    "muzzle": (0x2A221C, 0.8, 0.0),
    "eye": (0x0E0C0A, 0.3, 0.0),
    "leather": (0x1E1A16, 0.6, 0.0),
    "collar": (0x3A2A1E, 0.7, 0.0),
    "brass": (0xB8963E, 0.35, 0.8),
    "hames": (0x7A6232, 0.45, 0.6),
    "iron": (0x3A3A3C, 0.55, 0.6),
    "wood": (0x7A5E40, 0.85, 0.0),
    "wood_dark": (0x5A4430, 0.85, 0.0),
    "churn": (0xA8AAAC, 0.4, 0.7),
    "sack": (0xBCAE8E, 0.95, 0.0),
    "coat": (0x3C3A34, 0.95, 0.0),
    "trousers": (0x4A4238, 0.95, 0.0),
    "hat": (0x26221E, 0.8, 0.0),
    "skin": (0xD8A888, 0.7, 0.0),
    "boot": (0x1E1A16, 0.6, 0.0),
}


class HorseKit(E.EKit):
    # A horse is round all over: its shapes are shaded smooth unless an edge turns sharper than `SMOOTH` degrees
    SMOOTH = 80

    def loft(self, sections, mat, **kw):
        kw.setdefault("sharp", self.SMOOTH)
        return super().loft(sections, mat, **kw)

    def tube(self, points, radius, mat, **kw):
        kw.setdefault("sharp", self.SMOOTH)
        return super().tube(points, radius, mat, **kw)

    def lathe(self, profile, at, mat, **kw):
        kw.setdefault("sharp", self.SMOOTH)
        return super().lathe(profile, at, mat, **kw)


def body(k):
    # The trunk: the quarters, the barrel and the chest in one lofted shape along z, deep and round as a heavy horse's
    k.begin("body", (0, 1.3, 0))
    # (a section: z, its bottom and top, its half width, the roundness of its top and bottom, where it is widest)
    k.loft([(-1.0, 1.25, 1.5, 0.1, 2.2, 2.2, 0.55),
            (-0.94, 1.02, 1.6, 0.25, 2.3, 2.1, 0.6),
            (-0.78, 0.94, 1.67, 0.34, 2.4, 2.1, 0.62),
            (-0.55, 0.92, 1.66, 0.37, 2.4, 2.3, 0.6),
            (-0.3, 0.9, 1.62, 0.38, 2.3, 2.5, 0.52),
            (0.0, 0.88, 1.62, 0.39, 2.3, 2.6, 0.5),
            (0.3, 0.9, 1.68, 0.38, 2.3, 2.5, 0.5),
            (0.55, 0.94, 1.74, 0.35, 2.3, 2.3, 0.48),
            (0.74, 1.0, 1.7, 0.3, 2.3, 2.2, 0.45),
            (0.88, 1.08, 1.58, 0.24, 2.3, 2.2, 0.42),
            (0.95, 1.16, 1.46, 0.16, 2.2, 2.2, 0.45)], "bay", ring=28, steps=4)
    # The harness. The cart saddle across the back, its pad and the brass terrets on it
    k.loft([(-0.08, 1.58, 1.76, 0.3, 2.4, 2.0), (0.08, 1.6, 1.78, 0.3, 2.4, 2.0), (0.2, 1.6, 1.76, 0.28, 2.4, 2.0)], "leather", ring=14, steps=1)
    for side in (-1, 1):
        k.lathe([(0, -0.012), (0.03, -0.012), (0.03, 0.012), (0, 0.012)], (side * 0.12, 1.82, 0.06), "brass", axis="x", seg=10)
        # The belly band down the sides and under, and the tugs that hold the shafts
        k.tube([(side * 0.31, 1.62, 0.06), (side * 0.37, 1.3, 0.06), (side * 0.36, 1.05, 0.06), (side * 0.2, 0.9, 0.06)], 0.025, "leather", seg=6)
        k.box((0.06, 0.12, 0.14), (side * 0.4, 1.2, 0.06), "leather", bevel=0.01)
        # The breeching: round the quarters from the saddle, and the strap along the side to it
        k.tube([(side * 0.18, 1.64, -0.1), (side * 0.32, 1.55, -0.5), (side * 0.3, 1.25, -0.88), (side * 0.12, 1.15, -1.0)], 0.022, "leather", seg=6)
        k.tube([(side * 0.34, 1.3, -0.8), (side * 0.37, 1.22, -0.4), (side * 0.39, 1.2, 0.0)], 0.02, "leather", seg=6)
        # The traces back from the hames to the cart, in chain
        k.tube([(side * 0.3, 1.32, 0.78), (side * 0.38, 1.25, 0.2), (side * 0.42, 1.12, -0.6), (side * 0.46, 1.0, -1.45)], 0.016, "iron", seg=5)
    k.tube([(-0.12, 1.15, -1.0), (0, 1.12, -1.02), (0.12, 1.15, -1.0)], 0.024, "leather", seg=6)
    # The collar: a deep padded ring round the root of the neck, with the brass-capped hames on its front
    k.lathe([(0.21 + 0.075 * math.cos(a), 0.06 * math.sin(a)) for a in [i * math.pi / 6 for i in range(13)]], (0, 1.45, 0.84), "collar",
            to=(0, 1.45 + 0.6, 0.84 + 0.38), seg=22)
    for side in (-1, 1):
        k.tube([(side * 0.2, 1.24, 0.98), (side * 0.27, 1.46, 1.0), (side * 0.23, 1.7, 1.08), (side * 0.1, 1.86, 1.12)], 0.016, "hames", seg=6)


def neck(k):
    # The neck from its root to the poll: deep at the root, the crest arched, the mane along it and the forelock
    k.begin("neck", NECK_ROOT)
    k.loft([(0.6, 1.14, 1.74, 0.25, 2.3, 2.3, 0.55), (0.8, 1.24, 1.86, 0.23, 2.3, 2.3, 0.55), (0.98, 1.42, 1.99, 0.19, 2.3, 2.3, 0.55),
            (1.16, 1.64, 2.1, 0.15, 2.3, 2.3, 0.55), (1.3, 1.82, 2.13, 0.11, 2.3, 2.3, 0.5)], "bay", ring=20, steps=3)
    k.loft([(0.66, 1.68, 1.82, 0.035, 2.0, 2.0), (0.86, 1.8, 1.95, 0.04, 2.0, 2.0), (1.05, 1.94, 2.05, 0.035, 2.0, 2.0),
            (1.25, 2.04, 2.13, 0.03, 2.0, 2.0)], "mane", ring=8, steps=2)
    # The mane falling to the right
    k.sheet(lambda u, v: (0.03 + 0.08 * v, 1.8 + 0.3 * u - 0.15 * v, 0.7 + 0.58 * u - 0.02 * v), "mane", nu=5, nv=2, thick=0.02)


def head(k):
    # The head from the poll to the muzzle, long and Roman-nosed as a heavy horse's, the blaze down its front, the
    # nostrils and the eyes, and the bridle on it: the brow band, the nose band, the cheek straps, the blinkers, the bit
    k.begin("head", POLL)
    px, py, pz = POLL
    k.loft([(pz - 0.06, py - 0.12, py + 0.08, 0.1, 2.4, 2.4), (pz + 0.06, py - 0.2, py + 0.05, 0.12, 2.4, 2.6),
            (pz + 0.2, py - 0.32, py - 0.05, 0.1, 2.4, 2.4), (pz + 0.34, py - 0.44, py - 0.18, 0.085, 2.4, 2.2),
            (pz + 0.46, py - 0.56, py - 0.3, 0.08, 2.4, 2.2), (pz + 0.53, py - 0.62, py - 0.38, 0.075, 2.6, 2.4),
            (pz + 0.57, py - 0.6, py - 0.44, 0.05, 2.2, 2.2)], "bay", ring=16, steps=3)
    k.loft([(pz + 0.48, py - 0.62, py - 0.36, 0.078, 2.6, 2.4), (pz + 0.58, py - 0.6, py - 0.43, 0.05, 2.2, 2.2)], "muzzle", ring=12, steps=1)
    # The blaze: a white strip down the face
    k.sheet(lambda u, v: ((v - 0.5) * (0.07 - 0.03 * u), py + 0.0 - 0.36 * u + 0.004 + 0.012 * (1 - abs(v - 0.5) * 2), pz + 0.09 + 0.38 * u + 0.022),
            "white", nu=5, nv=2, thick=0.006)
    for side in (-1, 1):
        # The eye, the blinker beside it, the cheek strap and the nostril
        k.lathe([(0, -0.02), (0.022, -0.01), (0.022, 0.01), (0, 0.02)], (side * 0.105, py - 0.1, pz + 0.12), "eye", axis="x", seg=8)
        k.box((0.012, 0.09, 0.11), (side * 0.13, py - 0.09, pz + 0.11), "leather", rot=(0, side * 0.15, 0), bevel=0.01)
        k.tube([(side * 0.1, py + 0.02, pz - 0.02), (side * 0.11, py - 0.2, pz + 0.18), (side * 0.085, py - 0.48, pz + 0.44)], 0.012, "leather", seg=5)
        k.lathe([(0, -0.012), (0.018, -0.006), (0.018, 0.006), (0, 0.012)], (side * 0.045, py - 0.52, pz + 0.585), "mane", axis="z", seg=8)
        k.lathe([(0, -0.008), (0.02, -0.008), (0.02, 0.008), (0, 0.008)], (side * 0.085, py - 0.5, pz + 0.46), "brass", axis="x", seg=8)
    k.lathe([(0.105, -0.012), (0.115, 0.0), (0.105, 0.012)], (0, py - 0.0, pz + 0.04), "leather", axis="z", rot=(0.2, 0, 0), seg=14)
    k.lathe([(0.088, -0.012), (0.096, 0.0), (0.088, 0.012)], (0, py - 0.42, pz + 0.4), "leather", axis="z", rot=(0.6, 0, 0), seg=14)
    # The forelock
    k.sheet(lambda u, v: ((v - 0.5) * 0.08, py + 0.06 - 0.14 * u, pz + 0.02 + 0.06 * u + 0.02), "mane", nu=3, nv=2, thick=0.015)


def ears(k):
    for side, tag in ((1, "r"), (-1, "l")):
        x, y, z = side * EAR[0], EAR[1], EAR[2]
        k.begin(f"ear_{tag}", (x, y, z))
        k.loft([(y, z - 0.03, z + 0.03, 0.035, 2.2, 2.2), (y + 0.07, z - 0.025, z + 0.03, 0.028, 2.2, 2.2),
                (y + 0.13, z - 0.005, z + 0.01, 0.006, 2.0, 2.0)], "bay", axis="y", ring=8, steps=1)


def tail(k):
    k.begin("tail", DOCK)
    x, y, z = DOCK
    k.tube([(0, y, z), (0, y - 0.12, z - 0.1), (0, y - 0.4, z - 0.14), (0, y - 0.75, z - 0.12)], [0.06, 0.07, 0.1, 0.06], "mane", seg=10)
    k.tube([(0, y - 0.3, z - 0.15), (0.02, y - 0.6, z - 0.16), (0.03, y - 0.85, z - 0.1)], [0.07, 0.08, 0.03], "mane", seg=8)


def legs(k):
    # Each leg in three nodes, hanging straight down from its pivot. A heavy horse's legs: flat broad cannons, big
    # round knees and hocks, the fetlocks under long white feathers, broad hooves
    for side, tag in ((1, "r"), (-1, "l")):
        for end, z, x, top, joint, fet in (("fore", FORE_Z, FORE_X, ELBOW_Y, KNEE_Y, FORE_FET_Y), ("hind", HIND_Z, HIND_X, STIFLE[1], HOCK_Y, HIND_FET_Y)):
            x *= side
            k.begin(f"{end}_{tag}_upper", (x, top, z))
            # (the top of the forearm or the gaskin runs up into the body, thick with muscle, and tapers to the joint)
            if end == "fore":
                k.tube([(x * 0.9, top + 0.22, z + 0.03), (x, top, z), (x, top - 0.18, z), (x, joint + 0.09, z)], [0.15, 0.13, 0.095, 0.068], "bay", seg=14)
            else:
                k.tube([(x * 0.85, top + 0.22, z + 0.05), (x, top, z), (x, top - 0.16, z - 0.02), (x, joint + 0.09, z)], [0.17, 0.14, 0.1, 0.07], "bay", seg=14)
            k.begin(f"{end}_{tag}_lower", (x, joint, z))
            # The knee or the hock, then the cannon down to the fetlock, the feather over its lower part
            k.lathe([(0, -0.07), (0.068, -0.05), (0.078, 0.0), (0.072, 0.05), (0.06, 0.08), (0, 0.1)], (x, joint, z), "bay", seg=14)
            k.tube([(x, joint + 0.02, z), (x, (joint + fet) / 2, z - 0.005), (x, fet + 0.04, z)], [0.066, 0.052, 0.058], "bay_dark", seg=12)
            # The fetlock joint round at the cannon's foot
            k.lathe([(0, -0.05), (0.062, -0.03), (0.066, 0.02), (0.05, 0.05), (0, 0.06)], (x, fet, z - 0.01), "bay_dark", seg=12)
            k.lathe([(0.052, 0.17), (0.075, 0.06), (0.1, -0.03), (0.0, -0.04)], (x, fet, z), "white", seg=12)
            k.begin(f"{end}_{tag}_hoof", (x, fet, z))
            # The pastern down and a little forward, the feather round it, the hoof broad and flat
            k.tube([(x, fet, z), (x, 0.07, z + 0.05)], [0.055, 0.06], "white", seg=10)
            k.lathe([(0.1, 0.0), (0.105, 0.04), (0.095, 0.08), (0.075, 0.1), (0.0, 0.1)], (x, 0.0, z + 0.06), "hoof", seg=14)
            k.lathe([(0.08, -0.02), (0.11, 0.06), (0.085, 0.16), (0, 0.17)], (x, 0.06, z + 0.05), "white", seg=12)


def cart(k):
    # The bed: a plank floor on two side beams, low boards round it, the front board and the seat, the shafts forward
    k.begin("cart_bed", AXLE)
    z0, z1, floor, half = BED
    k.box((half * 2, 0.06, z1 - z0), (0, floor, (z0 + z1) / 2), "wood", bevel=0.01)
    for side in (-1, 1):
        k.box((0.08, 0.1, z1 - z0 + 0.2), (side * (half - 0.04), floor - 0.07, (z0 + z1) / 2), "wood_dark", bevel=0.01)
        for i in range(2):
            k.box((0.035, 0.12, z1 - z0), (side * half, floor + 0.1 + i * 0.14, (z0 + z1) / 2), "wood", bevel=0.008)
        for z in (z0 + 0.05, (z0 + z1) / 2, z1 - 0.05):
            k.box((0.05, 0.34, 0.05), (side * half, floor + 0.15, z), "wood_dark", bevel=0.008)
        # The shafts: from under the bed forward to the horse's tugs, curving up and out a little
        k.tube([(side * 0.46, floor - 0.08, z0 + 0.3), (side * 0.46, floor - 0.06, z1), (side * 0.44, 1.05, z1 + 0.9), (side * 0.42, 1.2, 0.06),
                (side * 0.4, 1.24, 0.55)], [0.04, 0.04, 0.036, 0.032, 0.028], "wood_dark", seg=8)
        k.lathe([(0.032, -0.03), (0.036, 0.0), (0.032, 0.03)], (side * 0.4, 1.24, 0.5), "iron", axis="z", seg=8)
    for i in range(2):
        k.box((half * 2, 0.12, 0.035), (0, floor + 0.1 + i * 0.14, z0), "wood", bevel=0.008)
        k.box((half * 2, 0.12, 0.035), (0, floor + 0.1 + i * 0.14, z1), "wood", bevel=0.008)
    # The axle tree under the bed and the springs
    k.box((TRACK * 2 + 0.1, 0.08, 0.1), (0, AXLE[1], AXLE[2]), "wood_dark", bevel=0.01)
    for side in (-1, 1):
        for j in range(3):
            k.box((0.06, 0.016, 0.7 - j * 0.16), (side * (half - 0.1), AXLE[1] + 0.06 + j * 0.018, AXLE[2]), "iron", bevel=0.004)
    # The seat on its irons at the front
    k.box((1.0, 0.06, 0.32), (SEAT[0], SEAT[1] - 0.05, SEAT[2]), "wood", bevel=0.01)
    for side in (-1, 1):
        k.tube([(side * 0.42, floor, SEAT[2] - 0.12), (side * 0.42, SEAT[1] - 0.08, SEAT[2])], 0.018, "iron", seg=6)
    # The load: three milk churns, two sacks and a crate
    for i, (x, z) in enumerate(((-0.35, -2.55), (0.0, -2.62), (0.35, -2.5))):
        k.lathe([(0, 0), (0.15, 0.0), (0.16, 0.03), (0.16, 0.42), (0.11, 0.52), (0.08, 0.56), (0.09, 0.62), (0.0, 0.63)], (x, floor + 0.03, z), "churn", seg=16)
    for x, z, turn in ((-0.25, -3.05, 0.2), (0.22, -3.0, -0.3)):
        k.loft([(z - 0.3, floor + 0.03, floor + 0.26, 0.2, 2.6, 2.0), (z, floor + 0.03, floor + 0.3, 0.23, 2.8, 2.0), (z + 0.3, floor + 0.03, floor + 0.24, 0.18, 2.6, 2.0)],
               "sack", ring=12, steps=2)
    k.box((0.45, 0.3, 0.4), (0.15, floor + 0.18, -1.95), "wood_dark", bevel=0.01)


def wheels(k):
    # A wooden wheel: the nave, twelve spokes, the felloes and the iron tyre; each its own node at its hub
    for side, tag in ((1, "r"), (-1, "l")):
        x = side * TRACK
        k.begin(f"wheel_{tag}", (x, AXLE[1], AXLE[2]))
        k.lathe([(0.0, -0.1), (0.07, -0.1), (0.09, -0.05), (0.095, 0.03), (0.07, 0.08), (0.0, 0.08)], (x, AXLE[1], AXLE[2]), "wood_dark", axis="x", seg=14)
        k.lathe([(0.0, -0.12), (0.03, -0.12), (0.03, -0.09), (0.0, -0.09)], (x, AXLE[1], AXLE[2]), "iron", axis="x", seg=10)
        for i in range(12):
            a = 2 * math.pi * i / 12
            inner = (x, AXLE[1] + math.cos(a) * 0.09, AXLE[2] + math.sin(a) * 0.09)
            outer = (x, AXLE[1] + math.cos(a) * (WHEEL_R - 0.07), AXLE[2] + math.sin(a) * (WHEEL_R - 0.07))
            k.tube([inner, outer], [0.024, 0.018], "wood", seg=6)
        k.lathe([(WHEEL_R - 0.085, -0.035), (WHEEL_R - 0.02, -0.035), (WHEEL_R - 0.02, 0.035), (WHEEL_R - 0.085, 0.035)], (x, AXLE[1], AXLE[2]), "wood", axis="x", seg=36)
        k.lathe([(WHEEL_R - 0.022, -0.038), (WHEEL_R, -0.036), (WHEEL_R, 0.036), (WHEEL_R - 0.022, 0.038)], (x, AXLE[1], AXLE[2]), "iron", axis="x", seg=36)


def carter(k):
    # The carter on the seat: a man in a dark coat and a hat, leaning forward a little, the reins in both hands
    k.begin("driver", SEAT)
    x, y, z = SEAT
    k.loft([(y - 0.02, z - 0.14, z + 0.12, 0.19, 2.4, 2.4), (y + 0.2, z - 0.12, z + 0.12, 0.2, 2.4, 2.4), (y + 0.45, z - 0.08, z + 0.14, 0.21, 2.4, 2.4),
            (y + 0.58, z - 0.06, z + 0.12, 0.18, 2.2, 2.2), (y + 0.63, z - 0.03, z + 0.07, 0.07)], "coat", axis="y", ring=14, steps=2)
    for side in (-1, 1):
        k.tube([(side * 0.1, y + 0.02, z), (side * 0.11, y + 0.04, z + 0.42), (side * 0.11, y - 0.4, z + 0.5)], 0.065, "trousers", seg=8)
        k.loft([(z + 0.42, y - 0.48, y - 0.38, 0.055, 2.2, 2.2), (z + 0.62, y - 0.48, y - 0.4, 0.05, 2.2, 2.2)], "boot", ring=8, steps=1)
        k.tube([(side * 0.2, y + 0.52, z + 0.02), (side * 0.22, y + 0.3, z + 0.15), (side * 0.14, y + 0.25, z + 0.42)], 0.05, "coat", seg=8)
        k.lathe([(0, -0.03), (0.035, -0.02), (0.035, 0.02), (0, 0.03)], (side * 0.12, y + 0.25, z + 0.46), "skin", axis="z", seg=8)
        # The reins from the hands forward to the bit, over the horse's back
        k.tube([(side * 0.12, y + 0.25, z + 0.48), (side * 0.2, 1.7, -0.3), (side * 0.12, 1.84, 0.06), (side * 0.12, 1.9, 0.95), (side * 0.085, 1.52, 1.76)],
               0.007, "leather", seg=4, smooth=2)
    k.tube([(0, y + 0.6, z + 0.02), (0, y + 0.68, z + 0.03)], 0.05, "skin", seg=8)
    k.loft([(y + 0.66, z - 0.08, z + 0.13, 0.08, 2.2, 2.2), (y + 0.76, z - 0.09, z + 0.12, 0.09, 2.4, 2.2), (y + 0.84, z - 0.07, z + 0.1, 0.075, 2.2, 2.2)],
           "skin", axis="y", ring=12, steps=1)
    k.lathe([(0.0, 0.0), (0.16, 0.0), (0.16, 0.015), (0.1, 0.02), (0.095, 0.11), (0.0, 0.12)], (0, y + 0.8, z + 0.01), "hat", seg=16)


def draw(k):
    body(k)
    neck(k)
    head(k)
    ears(k)
    tail(k)
    legs(k)
    cart(k)
    wheels(k)
    carter(k)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    k = HorseKit(seed=307, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"tug": (0.4, 1.2, 0.06), "seat": SEAT})
    E.previews(k, "hill_horse", height=1.2, reach=3.4)


build()
