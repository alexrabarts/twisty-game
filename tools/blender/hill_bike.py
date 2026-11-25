# The hill ride's bicycle and its rider (js/hill/): a heavy black delivery bicycle of the old trade kind and a boy in a
# flat cap riding it, by the owner's key frames: two 26 inch wheels, a big square wicker basket of plain loaves on a
# carrier fixed to the frame ahead of the bars, its top a little under the grips, a long frame with a blank plate in
# its main triangle, north-road bars swept back, rod brakes, a sprung leather saddle, full black mudguards and a
# closed chain case. No maker's name, badge or wordmark anywhere; the plate is blank, the loaves plain.
#
# The boy is in a dark flat cap, a grey knitted jumper under a dark scarf, a long grey-cream apron (a node of its own,
# in a shape for the saddle and one for on foot), dark breeches to below the knee and black boots to the middle of the
# calf. No lamp and no reflector: the bicycle is of a time before them. His legs are nodes of
# their own (thigh, shin and foot each side), each built hanging straight down from its pivot (hip, knee, ankle), so
# the game poses them: on the pedals, or straight out to the sides on the way down the hill. The cranks and the pedals
# are nodes too, turned by the game; the wheels spin on their axles.
#
# Written in the game's axes (x across, y up, z forward, metres, ground at y = 0) with the rider's right as +x, which
# the kit mirrors on export (tools/blender/bikes/_kit_E.py). Deterministic: the same file on every build.
#   blender --background --factory-startup --python tools/blender/hill_bike.py
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "bikes"))
import _kit_E as E  # noqa: E402
import common  # noqa: E402

# The game's bikes get a light far file of their own; this one is only ever seen close
E.far.bike = lambda path: None

OUT = os.path.join(common.ASSETS, "hill", "bicycle.glb")
FRONT, REAR = (0, 0.33, 0.58), (0, 0.33, -0.57)
FRONT_R, REAR_R = 0.33, 0.33
BB = (0, 0.28, 0.0)
CRANK = 0.17
# The fork from the front axle up to the crown, raked back 20 degrees, then the head tube
RAKE = math.radians(20)
CROWN = (FRONT[1] + 0.4 * math.cos(RAKE), FRONT[2] - 0.4 * math.sin(RAKE))
HEAD_TOP = (CROWN[0] + 0.2 * math.cos(RAKE), CROWN[1] - 0.2 * math.sin(RAKE))
SADDLE = (0, 0.95, -0.2)
GRIP = (0.27, 1.02, 0.2)
# The rider's joints at rest: the hips on the saddle, the knees straight under them, the ankles at the bottom
HIP = (0.09, 1.02, -0.2)
THIGH, SHIN = 0.45, 0.45
SHOULDER = (0.17, 1.45, -0.1)
UPPER_ARM, FOREARM = 0.32, 0.31
NECK = (0, 1.52, -0.07)
HEAD = (0, 1.64, -0.05)

COLOURS = {"paint": 0x0E0E10, "paint_dark": 0x060607, "accent": 0xE8E0C8, "rim": 0xB8BBC0, "trim": 0x121214, "seat": 0x5A3A22,
           "plastic": 0xE8E0C8}
EXTRA = {
    # The frame plate, cream and blank
    "plate_cream": (0xE6DCC0, 0.6, 0.0),
    "wicker": (0xA89A80, 0.9, 0.0),
    "wicker_dark": (0x786A54, 0.9, 0.0),
    "skin": (0xE2B596, 0.7, 0.0),
    "cap": (0x3A3530, 0.95, 0.0),
    "jumper": (0x7E7A72, 0.95, 0.0),
    "scarf": (0x2A2826, 0.95, 0.0),
    "apron": (0xB4AC9C, 0.9, 0.0),
    "shorts": (0x34322F, 0.95, 0.0),
    "sock": (0x26241F, 0.95, 0.0),
    "loaf": (0x8C5A36, 0.85, 0.0),
    "boot": (0x1E1C1A, 0.55, 0.0),
    "sole": (0x121110, 0.8, 0.0),
    "hair": (0x5A3A20, 0.9, 0.0),
    "leather": (0x5A3A22, 0.7, 0.0),
}


def wheels(k):
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.045, FRONT_R - 0.035, spokes="wire", count=32, hub=0.03, tread=False)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.045, REAR_R - 0.035, spokes="wire", count=36, hub=0.03, tread=False)


def frame(k):
    k.begin("body")
    seat_top = (SADDLE[1] - 0.06, SADDLE[2] + 0.02)
    head_low = CROWN
    # The tubes: seat tube, a long top tube, the down tube, the stays to the rear axle
    k.tube([(0, BB[1], BB[2]), (0, seat_top[0], seat_top[1])], 0.016, "paint", seg=10)
    k.tube([(0, seat_top[0] - 0.04, seat_top[1] + 0.01), (0, HEAD_TOP[0] - 0.04, HEAD_TOP[1] + 0.015)], 0.016, "paint", seg=10)
    k.tube([(0, BB[1], BB[2]), (0, head_low[0] + 0.03, head_low[1] - 0.01)], 0.019, "paint", seg=10)
    k.tube([(0, head_low[0], head_low[1]), (0, HEAD_TOP[0], HEAD_TOP[1])], 0.021, "paint", seg=10)
    for side in (-1, 1):
        k.tube([(side * 0.02, BB[1], BB[2]), (side * 0.06, REAR[1], REAR[2])], 0.01, "paint", seg=8)
        k.tube([(side * 0.02, seat_top[0] - 0.02, seat_top[1]), (side * 0.06, REAR[1], REAR[2])], 0.009, "paint", seg=8)
    # The blank plate in the main triangle, cream in a black rim
    k.begin("plate")
    k.keep = True
    E.panel(k, [(0.0, 0.43), (0.32, 0.66), (0.31, 0.79), (-0.11, 0.8), (-0.045, 0.5)], 0, 0.008, "plate_cream", bevel=0.003)
    E.panel(k, [(-0.01, 0.41), (0.34, 0.65), (0.33, 0.81), (-0.13, 0.82), (-0.06, 0.49)], 0, 0.005, "trim", bevel=0)
    k.keep = False
    k.begin("body")
    # The bottom bracket shell and the closed chain case on the right, round to the rear hub
    k.cylinder(0.025, 0.08, BB, "paint", axis="x", seg=14)
    E.panel(k, [(0.13, 0.28), (0.1, 0.4), (-0.3, 0.42), (-0.62, 0.38), (-0.66, 0.3), (-0.62, 0.25), (-0.3, 0.2), (0.0, 0.14), (0.1, 0.18)], 0.075, 0.03,
            "paint", bevel=0.008)
    # Mudguards, black, close round both wheels
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.06, math.radians(-10), math.radians(200), "paint", crown=0.012, nu=12)
    # The saddle: sprung leather on two coil springs, on its pillar
    k.tube([(0, seat_top[0], seat_top[1]), (0, SADDLE[1] - 0.04, SADDLE[2])], 0.012, "steel", seg=8)
    k.loft([(SADDLE[2] + 0.13, SADDLE[1] - 0.01, SADDLE[1] + 0.02, 0.025), (SADDLE[2] + 0.04, SADDLE[1] - 0.02, SADDLE[1] + 0.03, 0.06, 3, 3),
            (SADDLE[2] - 0.06, SADDLE[1] - 0.025, SADDLE[1] + 0.035, 0.1, 3, 3), (SADDLE[2] - 0.11, SADDLE[1] - 0.02, SADDLE[1] + 0.03, 0.095)], "leather", ring=12, steps=2)
    for side in (-1, 1):
        k.tube([(side * 0.06, SADDLE[1] - 0.025, SADDLE[2] - 0.08), (side * 0.06, SADDLE[1] - 0.09, SADDLE[2] - 0.07)], 0.014, "steel_dark", seg=8)


def front(k):
    k.begin("body")
    # The basket's carrier, fixed to the frame at the head tube, its stays down to the front axle
    k.tube([(0, HEAD_TOP[0] - 0.12, HEAD_TOP[1] + 0.03), (0, 0.64, 0.45)], 0.012, "paint", seg=8)
    for side in (-1, 1):
        k.tube([(side * 0.2, 0.64, 0.46), (side * 0.05, FRONT[1], FRONT[2] - 0.01)], 0.009, "paint", seg=6)
        k.tube([(side * 0.2, 0.64, 0.98), (side * 0.05, FRONT[1], FRONT[2] + 0.02)], 0.009, "paint", seg=6)
    k.box((0.44, 0.012, 0.54), (0, 0.64, 0.72), "paint", bevel=0.003)
    # The big square wicker basket, as the stills have it: a deep willow basket, longer than it is wide, its walls
    # flared a little to a thick rolled rim, a stake up each corner, and a bentwood handle arching low over the loaves
    # from the front rim to the back. Its weave is the game's (js/hill/rider.js lays HillTextures' wicker on the
    # willow finishes), so the walls are plain here, with no bands that would read as slats
    k.begin("basket")
    k.keep = True
    z0, z1, lo, hi, half = 0.4, 1.06, 0.655, 0.95, 0.26
    flare = 0.025
    mid = (z0 + z1) / 2
    k.box((half * 2, 0.02, z1 - z0), (0, lo, mid), "wicker_dark", bevel=0.006)
    # Each wall leans out by `flare` from its foot to the rim
    lean = math.atan2(flare, hi - lo)
    for z, sign in ((z0, -1), (z1, 1)):
        k.box((half * 2 + flare, hi - lo, 0.02), (0, (lo + hi) / 2, z + sign * flare / 2), "wicker", rot=(sign * lean, 0, 0), bevel=0.004)
    for side in (-1, 1):
        k.box((0.02, hi - lo, z1 - z0 + flare), (side * (half + flare / 2), (lo + hi) / 2, mid), "wicker", rot=(0, 0, -side * lean), bevel=0.004)
    hx, z0r, z1r = half + flare, z0 - flare, z1 + flare
    k.tube([(-hx, hi, z0r), (hx, hi, z0r), (hx, hi, z1r), (-hx, hi, z1r), (-hx, hi, z0r)], 0.017, "wicker", seg=8)
    k.tube([(-half, lo + 0.01, z0), (half, lo + 0.01, z0), (half, lo + 0.01, z1), (-half, lo + 0.01, z1), (-half, lo + 0.01, z0)], 0.011, "wicker_dark", seg=6)
    for sx in (-1, 1):
        for zz, sz in ((z0, -1), (z1, 1)):
            k.tube([(sx * half, lo, zz), (sx * hx, hi, zz + sz * flare)], 0.012, "wicker_dark", seg=6)
    # The handle: a bentwood hoop from the front rim to the back, low over the middle of the loaves
    span = (z1 - z0) * 0.62
    loop = [(0, hi + 0.2 * math.sin(math.pi * i / 12), mid - span / 2 * math.cos(math.pi * i / 12)) for i in range(13)]
    k.tube(loop, 0.014, "wicker", seg=8)
    # Plain tin loaves laid along the basket, four across and three deep: straight sides, a domed crown over the rim
    for x in (-0.18, -0.06, 0.06, 0.18):
        for z in (z0 + 0.02, z0 + 0.235, z0 + 0.45):
            # A section is (z, bottom, top, half width, top and bottom roundness, middle, top and bottom narrowing, centre x)
            k.loft([(z, hi - 0.09, hi + 0.035, 0.045, 2.6, 6, 0.55, 1, 1, x), (z + 0.02, hi - 0.09, hi + 0.06, 0.055, 2.6, 6, 0.55, 1, 1, x),
                    (z + 0.17, hi - 0.09, hi + 0.06, 0.055, 2.6, 6, 0.55, 1, 1, x), (z + 0.19, hi - 0.09, hi + 0.035, 0.045, 2.6, 6, 0.55, 1, 1, x)], "loaf",
                   ring=12, steps=2)
    k.keep = False

    # The fork, the front mudguard, the stem and the bars turn with the steering about the head tube: a node of their
    # own, its pivot at the fork crown (the game turns it, and hangs the front wheel on it)
    k.begin("steer", (0, CROWN[0], CROWN[1]))
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.03, 0.06, math.radians(-40), math.radians(140), "paint", crown=0.012, nu=10)
    for side in (-1, 1):
        k.tube([(side * 0.045, FRONT[1], FRONT[2]), (side * 0.03, CROWN[0], CROWN[1])], 0.011, "paint", seg=8)
    k.rod((-0.05, FRONT[1], FRONT[2]), (0.05, FRONT[1], FRONT[2]), 0.007, "steel", seg=6)
    # Stem and north-road bars swept back to the grips
    stem = (HEAD_TOP[0] + 0.1, HEAD_TOP[1] - 0.03)
    k.tube([(0, HEAD_TOP[0], HEAD_TOP[1]), (0, stem[0], stem[1])], 0.012, "chrome", seg=8)
    for side in (-1, 1):
        k.tube([(0, stem[0], stem[1]), (side * 0.12, stem[0] + 0.01, stem[1] - 0.02), (side * 0.25, GRIP[1] + 0.01, GRIP[2] + 0.06),
                (side * (GRIP[0] + 0.04), GRIP[1], GRIP[2] - 0.02)], 0.011, "chrome", seg=8, smooth=2)
        k.cylinder(0.016, 0.1, (side * (GRIP[0] + 0.01), GRIP[1], GRIP[2]), "rubber", axis="x", seg=10)
        # The rod brake's lever under the bar, its rod down the head tube to the stirrup
        k.box((0.012, 0.01, 0.12), (side * (GRIP[0] - 0.02), GRIP[1] - 0.03, GRIP[2] + 0.06), "chrome", bevel=0.002)
        k.tube([(side * 0.1, stem[0] - 0.01, stem[1]), (side * 0.03, CROWN[0] + 0.04, CROWN[1] + 0.02)], 0.004, "chrome", seg=4)
    # The bell on the bar; no lamp on the basket (the stills have none)
    k.lathe([(0, 0), (0.028, 0.0), (0.03, 0.012), (0.02, 0.025), (0, 0.028)], (-0.18, GRIP[1] + 0.02, GRIP[2] + 0.06), "chrome", seg=12)
    k.begin("body")


def drive(k):
    # The cranks turn about the bottom bracket; the chainring is under the case
    k.begin("cranks", BB)
    k.disc((0.06, BB[1], BB[2]), 0.1, arms=5, thick=0.004)
    for side in (-1, 1):
        k.box((0.012, 0.022, CRANK + 0.02), (side * 0.085, BB[1] - side * CRANK / 2, BB[2]), "chrome", bevel=0.004)
    k.rod((-0.09, BB[1], BB[2]), (0.09, BB[1], BB[2]), 0.01, "steel", seg=8)
    # Each pedal keeps level as the cranks turn
    for side, name in ((1, "pedal_r"), (-1, "pedal_l")):
        at = (side * 0.13, BB[1] - side * CRANK, BB[2])
        k.begin(name, at)
        k.box((0.09, 0.022, 0.07), at, "rubber", bevel=0.004)
        k.rod((side * 0.085, at[1], at[2]), (side * 0.175, at[1], at[2]), 0.005, "steel", seg=6)


def boy(k):
    # The body: shorts, jumper, arms to the grips, the head under a flat cap. Pivot at the middle of the hips
    k.begin("boy", (0, HIP[1], HIP[2]))
    hx, hy, hz = 0, HIP[1], HIP[2]
    k.loft([(hz - 0.12, hy - 0.06, hy + 0.08, 0.13, 2.6, 2.6), (hz, hy - 0.08, hy + 0.1, 0.16, 2.6, 2.6), (hz + 0.1, hy - 0.06, hy + 0.08, 0.13, 2.6, 2.6)],
           "shorts", ring=14, steps=2)
    # The jumper, leaning forward a little, from the waist to the shoulders
    k.loft([(hy + 0.04, hz - 0.11, hz + 0.1, 0.15, 2.4, 2.4), (hy + 0.2, hz - 0.1, hz + 0.1, 0.16, 2.4, 2.4), (hy + 0.36, hz - 0.06, hz + 0.12, 0.18, 2.4, 2.4),
            (SHOULDER[1] + 0.01, SHOULDER[2] - 0.08, SHOULDER[2] + 0.08, 0.17, 2.2, 2.2), (SHOULDER[1] + 0.05, SHOULDER[2] - 0.05, SHOULDER[2] + 0.05, 0.08)],
           "jumper", axis="y", ring=16, steps=2)
    # A dark scarf crossed at the neck, its ends hanging down his front, and the apron's band round the waist
    k.loft([(NECK[1] - 0.09, NECK[2] - 0.07, NECK[2] + 0.08, 0.1, 2.4, 2.4), (NECK[1] - 0.02, NECK[2] - 0.06, NECK[2] + 0.07, 0.075, 2.4, 2.4)], "scarf", axis="y",
           ring=12, steps=1)
    k.box((0.11, 0.18, 0.02), (0, SHOULDER[1] - 0.1, SHOULDER[2] + 0.095), "scarf", rot=(0.25, 0, 0), bevel=0.008)
    k.box((0.07, 0.3, 0.018), (0.04, SHOULDER[1] - 0.3, SHOULDER[2] + 0.11), "scarf", rot=(0.15, 0, 0.08), bevel=0.006)
    k.loft([(hy + 0.08, hz - 0.13, hz + 0.12, 0.165, 2.4, 2.4), (hy + 0.12, hz - 0.13, hz + 0.12, 0.165, 2.4, 2.4)], "apron", axis="y", ring=14, steps=1)

    # The apron, long and grey-cream, a node of its own in two shapes the game shows one at a time: on the saddle it
    # lies over the lap and hangs past the saddle's nose; on foot it hangs from the waist to the middle of the shins,
    # wider at the hem. Each built from its pivot at the middle of the waist's front; the game hangs the long one
    # straight down whatever his bend, just clear of the knee ahead
    waist = (0, hy + 0.1, hz + 0.1)
    k.begin("apron", waist)

    def lap(u, v):
        across = (v - 0.5) * 2
        if u < 0.5:
            t = u / 0.5
            return (across * (0.17 + 0.03 * t), hy + 0.1 - 0.02 * t, hz + 0.1 + 0.16 * t)
        t = (u - 0.5) / 0.5
        return (across * (0.2 + 0.02 * t), hy + 0.08 - 0.2 * t, hz + 0.26 + 0.03 * t)

    k.sheet(lap, "apron", nu=6, nv=6, thick=0.008)
    k.begin("apron_long", waist)

    def hang(u, v):
        across = (v - 0.5) * 2
        # (curved a little round him, the sides back)
        wide = 0.18 + 0.06 * u
        return (across * wide, waist[1] - 0.62 * u, waist[2] + 0.02 - 0.06 * across * across)

    k.sheet(hang, "apron", nu=8, nv=6, thick=0.008)
    k.begin("boy", (0, HIP[1], HIP[2]))

    # Neck, head, ears, hair at the back, the flat cap with its peak: a node of its own, its pivot at the foot of the
    # neck, so the game can lift his head while he bends over the bars on foot
    k.begin("head", (0, NECK[1] - 0.04, NECK[2]))
    k.tube([(0, NECK[1] - 0.04, NECK[2]), (0, HEAD[1] - 0.06, HEAD[2])], 0.04, "skin", seg=10)
    k.lathe([(0, -0.1), (0.05, -0.095), (0.085, -0.06), (0.095, 0.0), (0.09, 0.05), (0.06, 0.09), (0, 0.1)], HEAD, "skin", seg=16)
    for side in (-1, 1):
        k.lathe([(0, -0.02), (0.018, -0.012), (0.02, 0.012), (0, 0.02)], (side * 0.093, HEAD[1], HEAD[2] - 0.005), "skin", axis="x", seg=8)
    # A plain nose; no other feature (the face is no one's)
    k.loft([(HEAD[2] + 0.085, HEAD[1] - 0.04, HEAD[1] + 0.01, 0.016, 2.4, 2.4, 0.3), (HEAD[2] + 0.108, HEAD[1] - 0.035, HEAD[1] - 0.005, 0.012, 2.4, 2.4, 0.3)], "skin",
           ring=8, steps=1)
    k.loft([(HEAD[2] - 0.1, HEAD[1] - 0.05, HEAD[1] + 0.06, 0.088, 2.4, 2.4), (HEAD[2] - 0.07, HEAD[1] - 0.07, HEAD[1] + 0.08, 0.09, 2.4, 2.4)], "hair",
           ring=12, steps=1)
    # The cap: a soft crown pulled forward over the brow, and the short peak
    k.loft([(HEAD[2] - 0.11, HEAD[1] + 0.03, HEAD[1] + 0.09, 0.085, 2.4, 2.4), (HEAD[2] - 0.02, HEAD[1] + 0.04, HEAD[1] + 0.115, 0.105, 2.6, 2.4),
            (HEAD[2] + 0.07, HEAD[1] + 0.035, HEAD[1] + 0.1, 0.1, 2.6, 2.4), (HEAD[2] + 0.1, HEAD[1] + 0.035, HEAD[1] + 0.07, 0.07)], "cap", ring=16, steps=2)

    def peak(u, v):
        across = (v - 0.5) * 2
        return (across * (0.085 - 0.02 * u), HEAD[1] + 0.045 - 0.025 * u - 0.01 * across * across, HEAD[2] + 0.085 + 0.06 * u)

    k.sheet(peak, "cap", nu=3, nv=6, thick=0.008)

    # The arms, each segment hanging straight down from its pivot (shoulder, elbow), the hand at the forearm's end: the
    # game puts the hands on the grips as the bars turn
    for side, tag in ((1, "r"), (-1, "l")):
        x, top = side * SHOULDER[0], SHOULDER[1]
        k.begin(f"upperarm_{tag}", (x, top, SHOULDER[2]))
        k.tube([(x, top, SHOULDER[2]), (x, top - UPPER_ARM, SHOULDER[2])], 0.042, "jumper", seg=10)
        elbow = top - UPPER_ARM
        k.begin(f"forearm_{tag}", (x, elbow, SHOULDER[2]))
        k.tube([(x, elbow, SHOULDER[2]), (x, elbow - FOREARM + 0.04, SHOULDER[2])], 0.036, "jumper", seg=10)
        k.lathe([(0, -0.035), (0.03, -0.03), (0.035, 0.0), (0.03, 0.03), (0, 0.035)], (x, elbow - FOREARM, SHOULDER[2]), "skin", axis="x", seg=10)
    k.begin("boy", (0, HIP[1], HIP[2]))

    # The legs, each segment hanging straight down from its pivot: the game poses them
    for side, tag in ((1, "r"), (-1, "l")):
        x = side * HIP[0]
        k.begin(f"thigh_{tag}", (x, HIP[1], HIP[2]))
        k.tube([(x, HIP[1], HIP[2]), (x, HIP[1] - 0.2, HIP[2])], 0.072, "shorts", seg=12)
        k.tube([(x, HIP[1] - 0.2, HIP[2]), (x, HIP[1] - THIGH, HIP[2])], 0.056, "shorts", seg=10)
        knee = HIP[1] - THIGH
        k.begin(f"shin_{tag}", (x, knee, HIP[2]))
        k.lathe([(0, 0.0), (0.054, 0.005), (0.056, 0.03), (0.0, 0.035)], (x, knee - 0.035, HIP[2]), "shorts", seg=10)
        k.tube([(x, knee - 0.02, HIP[2]), (x, knee - 0.12, HIP[2])], 0.05, "shorts", seg=10)
        k.tube([(x, knee - 0.12, HIP[2]), (x, knee - 0.2, HIP[2])], 0.043, "sock", seg=10)
        k.box((0.1, 0.03, 0.1), (x, knee - 0.12, HIP[2]), "sock", bevel=0.012)
        # The boot's leg to the middle of the calf
        k.lathe([(0.0, -0.01), (0.044, -0.005), (0.047, 0.06), (0.05, 0.16), (0.055, SHIN - 0.2), (0.058, SHIN - 0.19), (0.0, SHIN - 0.19)],
                (x, knee - SHIN, HIP[2]), "boot", seg=12)
        ankle = knee - SHIN
        k.begin(f"foot_{tag}", (x, ankle, HIP[2]))
        # A black leather boot as the stills have it: a rounded toe cap, the instep rising to the ankle, the heel's
        # back round behind the ankle and up round it (so the boot's leg on the shin meets it whatever the foot's turn),
        # on a sole and a low heel of darker leather. Its sole is the ground under the ankle (ANKLE_ON_PEDAL)
        z, sole = HIP[2], ankle - 0.065
        k.loft([(z - 0.075, sole + 0.02, ankle + 0.07, 0.036, 2.6, 4, 0.3), (z - 0.05, sole + 0.012, ankle + 0.085, 0.045, 2.6, 4, 0.3),
                (z + 0.0, sole + 0.012, ankle + 0.075, 0.048, 2.6, 4, 0.3), (z + 0.06, sole + 0.012, ankle + 0.025, 0.049, 2.6, 4, 0.3),
                (z + 0.12, sole + 0.012, ankle - 0.012, 0.046, 2.2, 4, 0.3), (z + 0.165, sole + 0.014, ankle - 0.03, 0.038, 2.2, 4, 0.3),
                (z + 0.19, sole + 0.02, ankle - 0.042, 0.022, 2.2, 3, 0.3)], "boot", ring=14, steps=2)
        k.box((0.096, 0.014, 0.25), (x, sole + 0.007, z + 0.055), "sole", bevel=0.005)
        k.box((0.08, 0.02, 0.06), (x, sole + 0.012, z - 0.05), "sole", bevel=0.004)


def draw(k):
    wheels(k)
    frame(k)
    front(k)
    drive(k)
    boy(k)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    k = E.EKit(seed=301, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "seat": SADDLE, "hip": HIP, "bb": BB})
    E.previews(k, "hill_bicycle", height=0.8, reach=0.85)


build()
