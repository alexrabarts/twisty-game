# The rider, as rigid segments the game poses itself (js/bikemodels.js): a
# jacketed torso, a full-face helmet with a visor, shaped arms and legs with
# armour at the elbows and knees, gloved fists and boots. Every node is
# modelled about its own origin:
#   torso        upright along y, centred where Vehicle.buildVariantRider
#                centres its torso; the game leans it
#   helmet       about the head's centre, facing +z; peak is the off-road
#                peak that goes with it, hump the racing back hump of the torso
#   upper_arm, forearm, thigh, shin
#                along y from the near joint (-y) to the far one (+y), LENGTHS
#                long, with +z the outside of the bend (elbow, kneecap); the
#                game stretches them to the joints of each bike's pose
#   glove        a fist about the grip, knuckles toward +z
#   boot         about the point of the sole on the peg, toe toward +z
#   blender --background --factory-startup --python tools/blender/rider.py
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit  # noqa: E402
from common import ASSETS  # noqa: E402

OUT = os.path.join(ASSETS, "bikes", "rider.glb")
# Joint to joint, as modelled; js/bikemodels.js scales each to the pose
LENGTHS = {"upper_arm": 0.31, "forearm": 0.3, "thigh": 0.42, "shin": 0.42}


# A limb along y: (t, radius, bulge) rows from the near joint (t = 0) to the
# far one (t = 1), closed by a ball at each end. bulge pushes the +z side out.
def limb(k, name, rows, mat, ring=8):
    length = LENGTHS[name]
    first, last = rows[0][1], rows[-1][1]
    sections = [(-length / 2 - first * 0.85, -first * 0.3, first * 0.3, first * 0.3), (-length / 2 - first * 0.5, -first * 0.8, first * 0.8, first * 0.8)]
    for t, radius, bulge in rows:
        sections.append((-length / 2 + t * length, -radius, radius + bulge, radius, 2.2, 2.2, radius / (2 * radius + bulge)))
    sections += [(length / 2 + last * 0.5, -last * 0.8, last * 0.8, last * 0.8), (length / 2 + last * 0.85, -last * 0.3, last * 0.3, last * 0.3)]
    k.begin(name)
    k.loft(sections, mat, axis="y", ring=ring, steps=1, sharp=80)


def build():
    k = Kit(seed=23)

    # Jacket: wide at the shoulders, drawn in at the waist, a collar on top
    def jacket(u, up, side):
        if 0.19 < u < 0.26:
            return "glove"
        if up > 0.55 and 0.42 < u < 0.72:
            return "suit_accent"
        # A yoke across the shoulders, which is what the chase camera sees
        if up < -0.3 and 0.62 < u < 0.74:
            return "suit_accent"
        return "suit"

    k.begin("torso")
    k.loft([
        (-0.27, -0.07, 0.07, 0.08),
        (-0.23, -0.115, 0.115, 0.15, 2.6, 2.6),
        (-0.15, -0.11, 0.105, 0.15, 2.6, 2.6),
        (-0.08, -0.1, 0.1, 0.14, 2.6, 2.6),
        (0.03, -0.105, 0.118, 0.165, 2.6, 2.6),
        (0.13, -0.11, 0.122, 0.19, 2.8, 2.6),
        (0.19, -0.1, 0.1, 0.185, 2.6, 2.6),
        (0.235, -0.075, 0.07, 0.1, 2.4, 2.4),
        (0.27, -0.055, 0.05, 0.058),
        (0.3, -0.05, 0.045, 0.052),
    ], jacket, axis="y", ring=16, steps=2, sharp=80)

    k.begin("hump")
    k.loft([(0.0, -0.13, -0.08, 0.025), (0.06, -0.15, -0.08, 0.05, 2.4, 2.4), (0.15, -0.16, -0.08, 0.058, 2.4, 2.4), (0.21, -0.14, -0.07, 0.045), (0.24, -0.11, -0.06, 0.02)],
           "suit", axis="y", ring=10, steps=2, sharp=80)

    # Helmet: an egg, longer than it is wide, with a chin bar, the visor
    # across the eye port, a stripe over the crown and a lip at the back
    def shell(u, up, side):
        if u < 0.07:
            return "glove"
        if up > 0.35 and 0.3 < u < 0.64:
            return "visor"
        if abs(side) < 0.25 and u > 0.3:
            return "helmet_accent"
        return "helmet"

    k.begin("helmet")
    k.loft([
        (-0.148, -0.08, 0.1, 0.08, 2.4, 2.2),
        (-0.125, -0.108, 0.14, 0.106, 2.4, 2.2),
        (-0.075, -0.128, 0.158, 0.124, 2.3, 2.1),
        (-0.01, -0.14, 0.152, 0.131, 2.2, 2.1),
        (0.05, -0.14, 0.132, 0.129, 2.1, 2.1),
        (0.1, -0.12, 0.098, 0.11, 2.0, 2.0),
        (0.132, -0.08, 0.055, 0.072, 2.0, 2.0),
        (0.146, -0.03, 0.018, 0.028),
    ], shell, axis="y", ring=16, steps=3, sharp=80)
    k.box((0.07, 0.022, 0.02), (0, -0.098, 0.146), "visor", rot=(0.25, 0, 0), bevel=0.006)
    for side in (-1, 1):
        k.box((0.03, 0.012, 0.045), (side * 0.05, 0.128, 0.03), "visor", rot=(0.35, 0, 0), bevel=0.004)
        k.cylinder(0.017, 0.012, (side * 0.129, -0.012, 0.03), "glove", axis="x", seg=8)
    k.loft([(-0.06, -0.165, -0.13, 0.05), (-0.005, -0.172, -0.13, 0.075, 2.4, 2.4), (0.05, -0.16, -0.125, 0.06), (0.075, -0.145, -0.115, 0.03)],
           "helmet_accent", axis="y", ring=8, steps=1)

    def peak(u, v):
        across = (v - 0.5) * 2
        return (across * (0.105 - 0.035 * u), 0.092 - 0.03 * u - 0.02 * across * across, 0.07 + 0.2 * u)

    k.begin("peak")
    k.sheet(peak, "helmet_accent", nu=4, nv=6, thick=0.008)

    def sleeve(cuff):
        return lambda u, up, side: "glove" if u > cuff else ("suit_accent" if (up > 0.5 and u < 0.36) else "suit")

    limb(k, "upper_arm", [(0, 0.06, 0), (0.1, 0.062, 0), (0.5, 0.052, 0), (0.92, 0.046, 0.006), (1, 0.045, 0.01)],
         lambda u, up, side: "suit_accent" if 0.2 < u < 0.34 else "suit")
    limb(k, "forearm", [(0, 0.046, 0.012), (0.12, 0.05, 0.01), (0.5, 0.045, 0), (0.78, 0.038, 0), (0.8, 0.044, 0), (1, 0.042, 0)], sleeve(0.7))
    limb(k, "thigh", [(0, 0.082, 0), (0.25, 0.082, 0), (0.7, 0.068, 0), (1, 0.062, 0.006)], "suit", ring=10)
    limb(k, "shin", [(0, 0.06, 0.02), (0.12, 0.062, 0.022), (0.3, 0.06, 0.008), (0.52, 0.05, 0), (0.55, 0.057, 0), (0.8, 0.054, 0), (1, 0.052, 0)], sleeve(0.56), ring=10)

    k.begin("glove")
    k.loft([(-0.06, -0.022, 0.022, 0.03), (-0.04, -0.034, 0.036, 0.044, 3, 3), (0.0, -0.038, 0.042, 0.05, 3, 3), (0.04, -0.036, 0.036, 0.048, 3, 3), (0.058, -0.02, 0.02, 0.036)],
           lambda u, up, side: "suit_accent" if (up > 0.7 and 0.3 < u < 0.8) else "glove", ring=10, steps=1, sharp=80)

    k.begin("boot")
    k.loft([(-0.085, -0.03, 0.03, 0.03), (-0.07, -0.038, 0.06, 0.044, 2.4, 4), (-0.02, -0.038, 0.075, 0.05, 2.4, 4), (0.05, -0.038, 0.04, 0.052, 2.4, 4),
            (0.13, -0.038, 0.018, 0.049, 2.4, 4), (0.17, -0.034, 0.0, 0.034, 2.4, 3)],
           lambda u, up, side: "suit_accent" if up < -0.8 else "glove", ring=10, steps=2, sharp=80)

    k.finish(OUT, budget=5000, alone=tuple(k.nodes))
    parts.preview(k, "rider")


build()
