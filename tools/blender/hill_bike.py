# The hill ride's bicycle and its rider (js/hill/): a heavy black delivery bicycle of the old trade kind and a boy in a
# flat cap riding it, by the owner's key frames: two 26 inch wheels, a big square wicker basket of plain loaves on a
# carrier fixed to the frame ahead of the bars, its top a little under the grips, a long frame with a blank plate in
# its main triangle, north-road bars swept back, rod brakes, a sprung leather saddle, full black mudguards and a
# closed chain case. No maker's name, badge or wordmark anywhere; the plate is blank, the loaves plain.
#
# The boy who rides it is the game's own (js/hill/boy.js); here only his rig: an empty node at each of his joints
# (RIG), which the game poses: on the pedals, or straight out to the sides on the way down the hill, or on foot beside
# it. No lamp and no reflector: the bicycle is of a time before them. The cranks and the pedals are nodes, turned by
# the game; the wheels spin on their axles.
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
    "loaf": (0x8C5A36, 0.85, 0.0),
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


# The boy is drawn by the game (js/hill/boy.js: one skinned body built from code); this file carries his rig only,
# as empty nodes at his joints, in the game's axes (his left +x): the hips, each hip, knee and ankle, each shoulder
# and elbow, the neck's foot, and the apron's waist and the foot of its upper part. The game hangs each limb's bone
# on its node and poses them (js/hill/rider.js)
APRON_UPPER = 0.4
WAIST = (0, HIP[1] + 0.1, HIP[2] + 0.1)
RIG = {
    "boy": (0, HIP[1], HIP[2]),
    "head": (0, NECK[1] - 0.04, NECK[2]),
    "apron_long": WAIST,
    "apron_hem": (0, WAIST[1] - APRON_UPPER, WAIST[2]),
}
for _side, _tag in ((1, "l"), (-1, "r")):
    RIG[f"thigh_{_tag}"] = (_side * HIP[0], HIP[1], HIP[2])
    RIG[f"shin_{_tag}"] = (_side * HIP[0], HIP[1] - THIGH, HIP[2])
    RIG[f"foot_{_tag}"] = (_side * HIP[0], HIP[1] - THIGH - SHIN, HIP[2])
    RIG[f"upperarm_{_tag}"] = (_side * SHOULDER[0], SHOULDER[1], SHOULDER[2])
    RIG[f"forearm_{_tag}"] = (_side * SHOULDER[0], SHOULDER[1] - UPPER_ARM, SHOULDER[2])


def draw(k):
    wheels(k)
    frame(k)
    front(k)
    drive(k)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    k = E.EKit(seed=301, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "seat": SADDLE, "hip": HIP, "bb": BB, **RIG})
    E.previews(k, "hill_bicycle", height=0.8, reach=0.85)


build()
