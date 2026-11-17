# The rider, as rigid segments the game poses itself (js/bikemodels.js): a
# jacketed torso, a full-face helmet with a visor, shaped arms and legs with
# armour at the elbows and knees, gloved fists and boots. Every node is
# modelled about its own origin:
#   torso        upright along y, centred where Vehicle.buildVariantRider
#                centres its torso; the game leans it
#   helmet       about the head's centre, facing +z; peak is the off-road
#                peak that goes with it, hump the racing back hump of the torso
#   helmet_<style>
#                another shell for the same head, for a character whose kit
#                names the style: helmet_streak is white over a black base
#                with black and copper streaks swept back from the visor
#   backpack     about the torso's origin like the hump, worn on the back
#   upper_arm, forearm, thigh, shin
#                along y from the near joint (-y) to the far one (+y), LENGTHS
#                long, with +z the outside of the bend (elbow, kneecap); the
#                game stretches them to the joints of each bike's pose
#   glove        a fist about the grip, knuckles toward +z
#   boot         about the point of the sole on the peg, toe toward +z
#
# The trousers (pants, pants_accent at the knee), the boots (boot, boot_accent
# at the sole), the helmet trim and the backpack are materials of their own
# so a character's kit can colour them; js/bikemodels.js gives each the
# colour it had before when a kit leaves it out.
#   blender --background --factory-startup --python tools/blender/rider.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bike_parts as parts  # noqa: E402
from bike_kit import Kit, spline  # noqa: E402
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


# The helmet shell's sections, along y (Kit.loft)
SHELL = [
    (-0.148, -0.08, 0.1, 0.08, 2.4, 2.2),
    (-0.125, -0.108, 0.14, 0.106, 2.4, 2.2),
    (-0.075, -0.128, 0.158, 0.124, 2.3, 2.1),
    (-0.01, -0.14, 0.152, 0.131, 2.2, 2.1),
    (0.05, -0.14, 0.132, 0.129, 2.1, 2.1),
    (0.1, -0.12, 0.098, 0.11, 2.0, 2.0),
    (0.132, -0.08, 0.055, 0.072, 2.0, 2.0),
    (0.146, -0.03, 0.018, 0.028),
]


# A full-face shell: an egg, longer than it is wide, with a chin bar, the
# visor across the eye port, vents and a lip at the back. `shell` picks each
# face's material.
def helmet(k, name, shell, ring=16, steps=3):
    k.begin(name)
    k.loft(SHELL, shell, axis="y", ring=ring, steps=steps, sharp=80)
    k.box((0.07, 0.022, 0.02), (0, -0.098, 0.146), "visor", rot=(0.25, 0, 0), bevel=0.006)
    for side in (-1, 1):
        k.box((0.03, 0.012, 0.045), (side * 0.05, 0.128, 0.03), "visor", rot=(0.35, 0, 0), bevel=0.004)
        k.cylinder(0.017, 0.012, (side * 0.129, -0.012, 0.03), "glove", axis="x", seg=8)
    k.loft([(-0.06, -0.165, -0.13, 0.05), (-0.005, -0.172, -0.13, 0.075, 2.4, 2.4), (0.05, -0.16, -0.125, 0.06), (0.075, -0.145, -0.115, 0.03)],
           "helmet_accent", axis="y", ring=8, steps=1)


# A point on the shell at height y and angle t round it (radians; 0 is the
# right side, pi/2 straight ahead), the way Kit.loft places its vertices,
# lifted `lift` off the surface
def on_shell(y, t, lift, steps=3):
    defaults = (2.4, 2.4, 0.5, 1.0, 1.0, 0.0)
    rows = spline([tuple(s) + defaults[len(s) - 4:] for s in SHELL], steps)
    y = min(max(y, rows[0][0]), rows[-1][0])
    i = next(n for n in range(1, len(rows)) if rows[n][0] >= y)
    a, b = rows[i - 1], rows[i]
    f = (y - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
    _, lo, hi, w, nt, nb, mid, wt, wb, c = (p + (q - p) * f for p, q in zip(a, b))
    centre = lo + (hi - lo) * mid
    cs, sn = math.cos(t), math.sin(t)
    n, h, narrow = (nt, hi - centre, wt) if sn >= 0 else (nb, centre - lo, wb)
    px = math.copysign(abs(cs) ** (2 / n), cs)
    py = math.copysign(abs(sn) ** (2 / n), sn)
    x = c + w * px * (1 - (1 - narrow) * abs(py))
    z = centre + h * py
    out = math.hypot(x, z - centre) or 1.0
    return (x + x / out * lift, y, z + (z - centre) / out * lift)


# A painted streak laid on the shell along `path`, (degrees round, height)
# points, `width` high, on both sides of the helmet
def streak(k, path, width, mat):
    for side in (1, -1):
        def at(u, v, side=side):
            span = u * (len(path) - 1)
            i = min(int(span), len(path) - 2)
            f = span - i
            degrees = path[i][0] + (path[i + 1][0] - path[i][0]) * f
            y = path[i][1] + (path[i + 1][1] - path[i][1]) * f + (v - 0.5) * width
            t = math.radians(degrees if side > 0 else 180 - degrees)
            return on_shell(y, t, 0.0025)
        k.sheet(at, mat, nu=12, nv=1, thick=0.0015, sharp=80)


def build():
    k = Kit(seed=23)

    # Jacket: wide at the shoulders, drawn in at the waist, a collar on top;
    # below the belt it is the trousers
    def jacket(u, up, side):
        if u <= 0.19:
            return "pants"
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

    # Helmet: a stripe over the crown
    def shell(u, up, side):
        if u < 0.07:
            return "glove"
        if up > 0.35 and 0.3 < u < 0.64:
            return "visor"
        if abs(side) < 0.25 and u > 0.3:
            return "helmet_accent"
        return "helmet"

    helmet(k, "helmet", shell)

    # The streak shell: white over a black base, a thin black stripe down
    # the crown, and streaks laid on it that sweep back and down from over
    # the visor: a black one between two copper lines
    def streaked(u, up, side):
        if u < 0.07:
            return "glove"
        if up > 0.35 and 0.3 < u < 0.64:
            return "visor"
        if u < 0.3 or (abs(side) < 0.12 and u > 0.66):
            return "helmet_accent"
        return "helmet"

    helmet(k, "helmet_streak", streaked)
    streak(k, [(84, 0.112), (35, 0.1), (-25, 0.056), (-88, -0.02)], 0.012, "helmet_trim")
    streak(k, [(80, 0.088), (32, 0.074), (-28, 0.024), (-88, -0.052)], 0.03, "helmet_accent")
    streak(k, [(16, 0.008), (-30, -0.026), (-88, -0.084)], 0.013, "helmet_trim")

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
    limb(k, "thigh", [(0, 0.082, 0), (0.25, 0.082, 0), (0.7, 0.068, 0), (1, 0.062, 0.006)], "pants", ring=10)
    limb(k, "shin", [(0, 0.06, 0.02), (0.12, 0.062, 0.022), (0.3, 0.06, 0.008), (0.52, 0.05, 0), (0.55, 0.057, 0), (0.8, 0.054, 0), (1, 0.052, 0)],
         lambda u, up, side: "boot" if u > 0.56 else ("pants_accent" if (up > 0.5 and u < 0.36) else "pants"), ring=10)

    k.begin("glove")
    k.loft([(-0.06, -0.022, 0.022, 0.03), (-0.04, -0.034, 0.036, 0.044, 3, 3), (0.0, -0.038, 0.042, 0.05, 3, 3), (0.04, -0.036, 0.036, 0.048, 3, 3), (0.058, -0.02, 0.02, 0.036)],
           lambda u, up, side: "suit_accent" if (up > 0.7 and 0.3 < u < 0.8) else "glove", ring=10, steps=1, sharp=80)

    k.begin("boot")
    k.loft([(-0.085, -0.03, 0.03, 0.03), (-0.07, -0.038, 0.06, 0.044, 2.4, 4), (-0.02, -0.038, 0.075, 0.05, 2.4, 4), (0.05, -0.038, 0.04, 0.052, 2.4, 4),
            (0.13, -0.038, 0.018, 0.049, 2.4, 4), (0.17, -0.034, 0.0, 0.034, 2.4, 3)],
           lambda u, up, side: "boot_accent" if up < -0.8 else "boot", ring=10, steps=2, sharp=80)

    # A daypack on the back, its straps over the shoulders
    k.begin("backpack")
    k.loft([(-0.13, -0.2, -0.1, 0.1), (-0.1, -0.235, -0.1, 0.14, 3, 3), (0.12, -0.245, -0.1, 0.145, 3, 3), (0.17, -0.225, -0.1, 0.12, 3, 3), (0.195, -0.19, -0.1, 0.06)],
           "backpack", axis="y", ring=12, steps=2, sharp=60)
    k.box((0.16, 0.12, 0.03), (0, -0.04, -0.25), "backpack", bevel=0.01)
    for side in (-1, 1):
        k.tube([(side * 0.075, 0.15, -0.1), (side * 0.08, 0.215, -0.03), (side * 0.085, 0.18, 0.1), (side * 0.09, 0.02, 0.135)], 0.012, "backpack", seg=5, smooth=2)

    joined = k.finish(OUT, alone=tuple(k.nodes))
    # The budget is the rider as seated: one helmet, every optional part and
    # both of each limb. The file holds every helmet a kit can pick.
    count = {name: k.triangles([obj]) for name, obj in joined.items()}
    helmets = max(n for name, n in count.items() if name.startswith("helmet"))
    pairs = sum(count[name] for name in ("upper_arm", "forearm", "thigh", "shin", "glove", "boot"))
    seated = count["torso"] + count["hump"] + count["peak"] + count["backpack"] + helmets + 2 * pairs
    print(f"rider as seated, at most: {seated} triangles")
    if seated > 5000:
        raise SystemExit(f"{OUT}: a seated rider of {seated} triangles is over the budget of 5000")
    parts.preview(k, "rider")


build()
