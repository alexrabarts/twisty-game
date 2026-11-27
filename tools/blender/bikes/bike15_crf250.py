# bike-15: Lucy's trail bike. No photo of hers exists, so this is the
# well-known red road-legal 250 cc single-cylinder trail bike of about 2019
# from general knowledge: slim and tall on long-travel upside-down forks
# (gold tubes behind black guards), a 21 inch front and an 18 inch rear
# wire-spoked wheel on black rims with dual-purpose tyres, a high red front
# mudguard, a small square headlight in a red shroud shaped like a number
# board, red tank shrouds, side panels and rear mudguard with plain white
# and black graphics blocks, a flat narrow black seat in one piece, a black
# steel frame, a silver aluminium swingarm, an upswept silencer on the right
# under a heat shield, a black skid plate, hand guards, and the road parts:
# mirrors, small indicators, a tail light and a plate holder. A single wave
# front disc on the left, the chain on the left, the rear disc on the right.
# A small low mudguard on the swingarm keeps the rear tyre's spray off the
# shock. No badges, no wordmark, no plate lettering.
#
# It has been dropped many times and kept in use (`scuffs`): pale stress
# marks where the red plastics have bent, scratched hand guards and fork
# guards, a snapped and kinked brake lever, scraped bar ends, pegs, swingarm
# ends and skid plate, a dented silencer, a corner broken off the right side
# panel, a torn seat corner under a strip of tape.
#
# Real size (the class's published figures): 1,445 mm wheelbase, 875 mm
# seat, 27.6 degrees of caster, 3.00-21 and 120/80-18 tyres, a 256 mm front
# disc, a 220 mm rear disc.
#   blender --background --factory-startup --python tools/blender/bikes/bike15_crf250.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike15_crf250"
OUT = os.path.join(E.OUT_DIR, NAME + ".glb")
FRONT, REAR = (0, 0.343, 0.7225), (0, 0.325, -0.7225)
FRONT_R, REAR_R = 0.343, 0.325
# A 21 inch front rim and an 18 inch rear
RIM_F, RIM_R = 0.2667, 0.2286
RAKE = math.radians(27.6)
FORK_LEN = 0.82
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.105
# The one front disc is on the left (-x as written here: the kit mirrors on export)
DISC_SIDE = -1
DISC_X, DISC_R = 0.058, 0.128
# The rear disc is on the right, opposite the chain
RDISC_X, RDISC_R = 0.058, 0.11
ARM_X = 0.115
GRIP = (0.38, 1.135, 0.33)
PEG = (0.2, 0.41, -0.13)
# The rider sits forward, against the tank
SEAT = (0, 0.875, -0.08)
# Swingarm pivot (y, z)
PIVOT = (0.43, -0.17)
# The dual-purpose tyres' block tread: the depth cut between the knobs (m). TWISTY_KNOBS sets it for a variant build
KNOBS = float(os.environ.get("TWISTY_KNOBS") or 0.012)
# The engine's small parts (engine_parts). TWISTY_ENGINE=0 leaves them out, for a comparison
ENGINE_PARTS = os.environ.get("TWISTY_ENGINE", "1") != "0"
# The cast ribs round the barrel (engine_parts); TWISTY_RIBS sets the count for a variant build
RIBS = int(os.environ.get("TWISTY_RIBS") or 4)
# The spokes' finish. TWISTY_SPOKE sets it for a variant build
SPOKE = os.environ.get("TWISTY_SPOKE") or "steel"

COLOURS = {"paint": 0xD0101C, "paint_dark": 0x5A0508, "accent": 0xECECEC, "rim": 0x17181A, "caliper": 0x2B2C30, "fork_gold": 0xB8923E, "spring": 0xC4161C,
           "trim": 0x151618, "seat": 0x131315, "plastic": 0xECECEC}
EXTRA = {
    "alu": (0xA6A9AE, 0.36, 0.9),
    "casing": (0x3A3B3F, 0.5, 0.6),
    # The black steel frame
    "frame": (0x121214, 0.45, 0.6),
    # The graphics' black blocks
    "block": (0x101012, 0.6, 0.1),
    # Fall marks: red plastic bent pale, black plastic scratched grey, scraped metal, and cloth tape
    "scuff_plastic": (0xEFC4BE, 0.9, 0.0),
    "scuff_grey": (0x8B8D90, 0.9, 0.0),
    "scuff_metal": (0xC9CCD0, 0.45, 0.9),
    "tape": (0x9A9C9E, 0.8, 0.1),
    # The discs a darker, rougher steel: a bright mirror steel read as a flat white ring in the sun
    "disc": (0x8A8D92, 0.45, 1.0),
    # The blank plate off-white: pure white was the brightest thing on the bike and read as a lamp
    "plate": (0xC9C9C2, 0.55, 0.05),
    # The cases a cast-alloy grey: near black, the engine read as one dark blob
    "casing": (0x6A6C70, 0.5, 0.7),
}
# A finish as "name=colour,roughness,metalness" (TWISTY_FINISH, for a variant build)
if os.environ.get("TWISTY_FINISH"):
    name, value = os.environ["TWISTY_FINISH"].split("=")
    colour, rough, metal = value.split(",")
    EXTRA[name] = (int(colour, 16), float(rough), float(metal))


# The tank shroud's outline (z, y), and the middle its graphics and marks turn about (E.panel `about`).
# TWISTY_ONSHROUD=0 turns them about their own middles as before, for a comparison
SHROUD = [(0.46, 0.7), (0.56, 0.86), (0.47, 0.985), (0.24, 1.0), (0.0, 0.94), (0.05, 0.83), (0.26, 0.68)]
on_shroud = sum(z for z, _ in SHROUD) / len(SHROUD) if os.environ.get("TWISTY_ONSHROUD", "1") != "0" else None


def wheels(k):
    k.begin("wheel_front", FRONT)
    E.wheel(k, FRONT, FRONT_R, 0.08, RIM_F, spokes="wire", count=36, hub=0.05, knobs=KNOBS, spoke_mat=SPOKE)
    k.begin("wheel_rear", REAR)
    E.wheel(k, REAR, REAR_R, 0.12, RIM_R, spokes="wire", count=36, hub=0.055, knobs=KNOBS, spoke_mat=SPOKE)
    # Sprocket on the left, inboard of the swingarm
    parts.sprocket(k, REAR, -0.082, 0.105)
    k.begin("disc_front", (DISC_SIDE * DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_SIDE * DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=6)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=4)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        # Long upside-down forks: gold outer tubes above, the sliders below
        # behind black plastic guards
        E.usd_fork(k, side, axle, TOP, 0.027, 0.0205, "fork_gold", x=FORK_X, split=0.4, guard="trim",
                   disc=(DISC_X, DISC_R) if side == DISC_SIDE else None, caliper_angle=math.radians(205), caliper_size=(0.046, 0.052, 0.095))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.07, lower=0.74)

    # A braced bar on risers with the grips and levers, a hand guard in front
    # of each grip, and the mirrors a road bike must carry
    clamp = (TOP[0] + 0.05, TOP[1] - 0.03)
    k.begin("handlebar", (0, clamp[0], clamp[1]))
    for side in (-1, 1):
        g = (side * GRIP[0], GRIP[1], GRIP[2])
        k.tube([(0, clamp[0], clamp[1]), (side * 0.1, clamp[0] + 0.004, clamp[1]), (side * 0.2, GRIP[1], GRIP[2] + 0.015), (side * (GRIP[0] + 0.07), GRIP[1], GRIP[2] - 0.005)],
               0.012, "steel_dark", seg=8, smooth=2)
        k.cylinder(0.018, 0.05, (side * 0.05, clamp[0] - 0.025, clamp[1]), "alu", seg=8)
        E.lever_set(k, GRIP, side, 0.2, bent="scuff_metal" if side > 0 else None)
        # The hand guard: a black shell wrapped round the front of the grip
        k.loft([(g[2] + 0.04, GRIP[1] - 0.05, GRIP[1] + 0.04, 0.03, 2.4, 2.4, 0.5, 1, 1, side * (GRIP[0] - 0.09)),
                (g[2] + 0.085, GRIP[1] - 0.06, GRIP[1] + 0.05, 0.075, 2.6, 2.6, 0.5, 1, 1, side * (GRIP[0] - 0.01)),
                (g[2] + 0.1, GRIP[1] - 0.04, GRIP[1] + 0.03, 0.06, 2.6, 2.6, 0.5, 1, 1, side * (GRIP[0] - 0.005))], "trim", ring=10, steps=2)
    k.tube([(-0.17, GRIP[1] - 0.012, GRIP[2] + 0.03), (0, GRIP[1] - 0.02, GRIP[2] + 0.055), (0.17, GRIP[1] - 0.012, GRIP[2] + 0.03)], 0.008, "steel_dark", seg=6)
    E.mirror(k, (0.22, GRIP[1] + 0.01, GRIP[2] + 0.03), (0.33, GRIP[1] + 0.2, GRIP[2] + 0.02), size=(0.055, 0.04), mat="trim", shape="round")

    # The small square headlight in the face of its shroud
    k.begin("headlight", (0, 0.985, 0.56))
    k.box((0.11, 0.1, 0.014), (0, 0.985, 0.563), "headlight", rot=(-0.24, 0, 0), bevel=0.012)

    k.begin("brake_light", (0, 0.945, -1.04))
    k.box((0.085, 0.035, 0.03), (0, 0.945, -1.04), "brake", rot=(-0.2, 0, 0), bevel=0.008)


def bodywork(k):
    k.begin("body")

    # High front mudguard, red: a long blade from behind the forks out over the wheel
    def fender(u, v):
        across = (v - 0.5) * 2
        z = 0.34 + 0.8 * u
        half = 0.088 - 0.036 * abs(u - 0.35)
        return (across * half, 0.815 + 0.075 * math.sin(u * math.pi * 0.85) - 0.035 * across * across - 0.05 * u, z)

    k.sheet(fender, "paint", nu=12, nv=4, thick=0.012)
    k.box((0.1, 0.05, 0.1), (0, 0.845, 0.46), "trim", rot=(-0.48, 0, 0), bevel=0.01)

    # The headlight's shroud: a red board leaning back in front of the forks,
    # a black frame round the lamp, a white block under it
    k.loft([(0.88, 0.5, 0.535, 0.085, 3, 3), (0.94, 0.505, 0.56, 0.115, 3, 3), (1.04, 0.47, 0.545, 0.115, 3, 3), (1.1, 0.445, 0.5, 0.08, 3, 3)], "paint", axis="y", ring=12,
           steps=2)
    k.box((0.135, 0.125, 0.012), (0, 0.985, 0.555), "trim", rot=(-0.24, 0, 0), bevel=0.01)
    k.box((0.12, 0.03, 0.008), (0, 0.905, 0.553), "plastic", rot=(-0.24, 0, 0), bevel=0.002)
    # The clocks behind the shroud
    k.box((0.1, 0.06, 0.03), (0, 1.1, 0.42), "trim", rot=(-0.9, 0, 0), bevel=0.008)
    k.box((0.08, 0.04, 0.004), (0, 1.108, 0.408), "dash", rot=(-0.9, 0, 0), bevel=0)
    # Front indicators on short stalks at the shroud's sides
    for side in (-1, 1):
        E.indicator(k, (side * 0.09, 0.97, 0.47), (side * 0.17, 0.975, 0.48), radius=0.011, stalk="trim")

    # Slim tank under the seat's nose, the filler cap on top
    k.loft([(0.4, 0.84, 0.95, 0.06), (0.32, 0.79, 1.0, 0.105, 2.6, 2.6), (0.16, 0.77, 0.99, 0.115, 2.6, 2.6), (0.02, 0.78, 0.95, 0.1, 2.6, 2.6), (-0.06, 0.8, 0.92, 0.07)],
           "paint", ring=14, steps=2)
    k.cylinder(0.032, 0.022, (0, 1.003, 0.3), "trim", rot=(-0.08, 0, 0), seg=12)

    for side in (-1, 1):
        # Tank shroud: a red wing from the tank out and forward over the
        # radiator, a white block and a black block along it
        E.panel(k, SHROUD, side * 0.165, 0.028, "paint", toe=side * -0.2, bevel=0.01)
        E.panel(k, [(0.5, 0.84), (0.45, 0.93), (0.2, 0.955), (0.1, 0.9), (0.3, 0.86)], side * 0.183, 0.008, "plastic", toe=side * -0.2, bevel=0, about=on_shroud)
        E.panel(k, [(0.47, 0.745), (0.52, 0.825), (0.3, 0.845), (0.14, 0.83), (0.27, 0.72)], side * 0.183, 0.008, "block", toe=side * -0.2, bevel=0, about=on_shroud)
        # The radiator behind the shroud (the left one carries the core, the right a blank)
        k.box((0.03, 0.2, 0.1), (side * 0.115, 0.77, 0.33), "vent", rot=(0, side * -0.2, 0), bevel=0.004)
        # Side panel under the seat: red, with a white board and a black block
        # The right one has lost its rear corner in a fall
        corner = [(-0.585, 0.805), (-0.555, 0.812), (-0.54, 0.834)] if side > 0 else [(-0.66, 0.85)]
        E.panel(k, [(-0.08, 0.64), (-0.42, 0.66), (-0.6, 0.78)] + corner + [(-0.4, 0.815), (-0.08, 0.79)], side * 0.128, 0.02, "paint", toe=side * 0.06, bevel=0.008)
        E.panel(k, [(-0.16, 0.68), (-0.4, 0.695), (-0.54, 0.77), (-0.36, 0.78), (-0.16, 0.77)], side * 0.141, 0.006, "plastic", toe=side * 0.06, bevel=0)
        block = [(-0.44, 0.795), (-0.54, 0.792), (-0.53, 0.816), (-0.44, 0.81)] if side > 0 else [(-0.44, 0.795), (-0.58, 0.79), (-0.62, 0.835), (-0.44, 0.81)]
        E.panel(k, block, side * 0.141, 0.006, "block", toe=side * 0.06, bevel=0)

    # The flat narrow seat, one piece, black: up the tank at the front, level
    # to the rear mudguard
    k.loft([(0.3, 0.955, 1.0, 0.045), (0.2, 0.93, 1.0, 0.08, 3.4, 3), (0.04, 0.885, 0.945, 0.095, 3.4, 3), (-0.1, 0.83, 0.875, 0.1, 3.4, 3), (-0.34, 0.83, 0.878, 0.1, 3.4, 3),
            (-0.56, 0.86, 0.905, 0.09, 3.4, 3), (-0.66, 0.89, 0.925, 0.055)], "seat", ring=14, steps=2)

    # Rear mudguard, red: from under the seat's end up and back over the wheel
    def tail(u, v):
        across = (v - 0.5) * 2
        z = -0.5 - 0.6 * u
        return (across * (0.095 - 0.03 * u), 0.9 + 0.1 * u ** 1.3 - 0.03 * across * across, z)

    k.sheet(tail, "paint", nu=8, nv=4, thick=0.012)
    # The tail light's black housing under the mudguard's tip, the plate
    # holder hanging from it with a blank plate, the rear indicators
    k.box((0.11, 0.05, 0.08), (0, 0.945, -1.0), "trim", rot=(-0.2, 0, 0), bevel=0.01)
    k.beam((0, 0.92, -0.98), (0, 0.72, -1.09), (0.07, 0.016), "trim")
    E.plate(k, (0, 0.7, -1.105), size=(0.18, 0.14), lean=0.35)
    for side in (-1, 1):
        E.indicator(k, (side * 0.04, 0.88, -0.99), (side * 0.14, 0.885, -1.0), radius=0.011, stalk="trim")


def chassis(k):
    k.begin("body")
    head = (TOP[0] - 0.09, TOP[1] + 0.045)
    for side in (-1, 1):
        # Black steel frame: a spar each side from the steering head back and
        # down to the swingarm pivot, a down tube into a cradle under the
        # engine, and the subframe out to the tail
        k.tube([(side * 0.035, head[0], head[1]), (side * 0.1, 0.86, 0.2), (side * 0.12, 0.66, -0.06), (side * 0.115, PIVOT[0] - 0.02, PIVOT[1])], 0.02, "frame", seg=6,
               smooth=2)
        k.tube([(side * 0.03, head[0] - 0.08, head[1] + 0.03), (side * 0.06, 0.56, 0.36), (side * 0.09, 0.34, 0.24), (side * 0.095, 0.3, -0.02),
                (side * 0.115, PIVOT[0] - 0.04, PIVOT[1])], 0.016, "frame", seg=6, smooth=2)
        k.tube([(side * 0.115, 0.82, -0.02), (side * 0.11, 0.87, -0.4), (side * 0.08, 0.905, -0.72)], 0.012, "frame", seg=6)
        k.tube([(side * 0.115, 0.52, -0.16), (side * 0.11, 0.74, -0.4), (side * 0.085, 0.89, -0.66)], 0.012, "frame", seg=6)
    k.cylinder(0.038, 0.19, (0, head[0] - 0.02, head[1] + 0.01), "frame", rot=(-RAKE, 0, 0), seg=10)

    # The single: crankcases, the barrel leaning forward, the head under the
    # tank, a round clutch cover on the right and the generator on the left
    k.loft([(0.24, 0.32, 0.46, 0.09, 3, 3), (0.16, 0.3, 0.52, 0.125, 3, 3), (-0.06, 0.3, 0.52, 0.125, 3, 3), (-0.14, 0.34, 0.5, 0.09)], "casing", ring=14, steps=2)
    k.box((0.12, 0.17, 0.13), (0, 0.6, 0.15), "casing", rot=(0.24, 0, 0), bevel=0.012)
    k.box((0.14, 0.09, 0.16), (0, 0.72, 0.18), "dark_metal", rot=(0.24, 0, 0), bevel=0.014)
    k.lathe([(0, 0), (0.085, 0), (0.085, 0.018), (0.062, 0.034), (0, 0.036)], (0.122, 0.42, 0.02), "casing", axis="x", seg=20)
    k.lathe([(0, 0), (0.07, 0), (0.07, 0.016), (0.05, 0.03), (0, 0.032)], (-0.122, 0.42, 0.08), "casing", axis="x", rot=(0, 0, math.pi), seg=18)
    if ENGINE_PARTS:
        engine_parts(k)
    # Skid plate under the cradle, black
    k.loft([(0.34, 0.33, 0.41, 0.07, 4, 3), (0.24, 0.265, 0.33, 0.115, 4, 3), (0.0, 0.255, 0.3, 0.12, 4, 3), (-0.14, 0.27, 0.3, 0.09)], "trim", ring=10, steps=2)

    # Silver aluminium swingarm, a guide for the chain on its left arm
    parts.swingarm(k, pivot=PIVOT, axle=(REAR[1], REAR[2]), x=ARM_X, size=(0.034, 0.072), mat="alu", brace=True)
    k.rod((-0.15, PIVOT[0], PIVOT[1]), (0.15, PIVOT[0], PIVOT[1]), 0.02, "dark_metal", seg=10)
    k.rod((-0.14, REAR[1], REAR[2]), (0.14, REAR[1], REAR[2]), 0.012, "steel", seg=8)
    parts.shock(k, (0, 0.8, -0.16), (0, 0.43, -0.3), 0.036)
    parts.chain(k, x=-0.082, front=(0.43, -0.06, 0.036), rear=(REAR[1], REAR[2], 0.105))
    k.box((0.03, 0.05, 0.07), (-0.082, REAR[1] - 0.115, REAR[2] + 0.19), "trim", bevel=0.006)
    # The small low mudguard on the swingarm, ahead of the rear tyre
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.15, math.radians(15), math.radians(75), "trim", crown=0.02, nu=6)
    # Rear caliper on the right, over the disc behind the axle, on a carrier from the arm
    ra = math.radians(118)
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, ra, size=(0.044, 0.05, 0.085), pistons=False)
    k.beam((ARM_X - 0.022, REAR[1] + 0.03, REAR[2]), (RDISC_X + 0.03, REAR[1] + math.sin(ra) * 0.095, REAR[2] + math.cos(ra) * 0.095), (0.012, 0.03), "steel_dark",
           bevel=0)

    # Exhaust: the header out of the head's front, round the right of the
    # barrel and back under the side panel to an upswept silencer, a silver
    # heat shield along its outer side, a black end cap
    k.tube([(0.0, 0.67, 0.25), (0.05, 0.62, 0.34), (0.12, 0.52, 0.3), (0.15, 0.52, 0.06), (0.15, 0.6, -0.16), (0.155, 0.68, -0.3)], 0.022, "steel", seg=7, smooth=3)
    a, b = (0.155, 0.68, -0.3), (0.175, 0.86, -0.86)
    parts.can(k, a, b, 0.056, "steel_dark", cap="dark_metal")
    lean = E.tilt(a, b)
    k.box((0.012, 0.36, 0.09), E.along((a[0] + 0.058, a[1], a[2]), (b[0] + 0.058, b[1], b[2]), 0.5), "alu", rot=lean, bevel=0.004)

    parts.pegs(k, PEG, hanger=(0.5, -0.12), wide=0.07)
    k.side_stand((-0.13, 0.31, -0.04), (-0.28, 0.03, 0.05), 0.01, "steel_dark", seg=6)


def engine_parts(k):
    """What makes the single read as an engine close up: the joint between barrel and head, the bolts round the
    covers and on the head, the coolant hoses from the radiator and the plug cap. It is water-cooled: no fins."""
    k.box((0.134, 0.012, 0.146), (0, 0.674, 0.168), "dark_metal", rot=(0.24, 0, 0), bevel=0.002)
    # Cast ribs round the barrel, as a water-cooled single has (shallow, square-edged), and the head's cam cover
    # rounded over the top
    for i in range(RIBS):
        t = (i + 0.5) / RIBS
        y = 0.53 + 0.13 * t
        k.box((0.132, 0.006, 0.142), (0, y, 0.15 + (y - 0.6) * math.tan(0.24)), "casing", rot=(0.24, 0, 0), bevel=0.0015)
    if RIBS:
        k.loft([(0.25, 0.75, 0.775, 0.05, 2.6, 2.6), (0.18, 0.75, 0.79, 0.065, 2.6, 2.6), (0.11, 0.75, 0.775, 0.05, 2.6, 2.6)], "dark_metal", ring=12, steps=2)
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        k.cylinder(0.0055, 0.008, (0.15, 0.42 + math.cos(a) * 0.074, 0.02 + math.sin(a) * 0.074), "steel", axis="x", seg=6)
    for i in range(6):
        a = 2 * math.pi * (i + 0.5) / 6
        k.cylinder(0.0055, 0.008, (-0.146, 0.42 + math.cos(a) * 0.06, 0.08 + math.sin(a) * 0.06), "steel", axis="x", seg=6)
    for x in (-0.05, 0.05):
        for z in (0.12, 0.23):
            k.cylinder(0.006, 0.01, (x, 0.765 - (z - 0.18) * 0.24, z), "steel", seg=6)
    k.tube([(0.1, 0.84, 0.3), (0.065, 0.82, 0.285), (0.03, 0.76, 0.265)], 0.011, "rubber", seg=7, smooth=2)
    k.tube([(0.1, 0.68, 0.31), (0.12, 0.6, 0.27), (0.125, 0.5, 0.2)], 0.012, "rubber", seg=7, smooth=2)
    k.cylinder(0.012, 0.045, (0, 0.785, 0.205), "rubber", rot=(-0.3, 0, 0), seg=8)


def scuffs(k):
    """The marks of many falls, on both sides. Each lies just proud of the part it is on; the big
    ones stay in the distant model."""
    k.begin("body")
    k.keep = True

    # Pale stress marks along the edges of the front and rear mudguards, where the plastic has bent
    def fender_edge(side, start, end, inner):
        def at(u, v):
            t = start + (end - start) * u
            across = side * (inner + (1.0 - inner) * v)
            half = 0.088 - 0.036 * abs(t - 0.35)
            return (across * half, 0.824 + 0.075 * math.sin(t * math.pi * 0.85) - 0.035 * across * across - 0.05 * t, 0.34 + 0.8 * t)
        k.sheet(at, "scuff_plastic", nu=4, nv=1, thick=0.003)

    fender_edge(1, 0.66, 1.0, 0.45)
    fender_edge(-1, 0.8, 1.0, 0.6)
    fender_edge(-1, 0.02, 0.2, 0.5)

    def tail_edge(side, start, end, inner):
        def at(u, v):
            t = start + (end - start) * u
            across = side * (inner + (1.0 - inner) * v)
            return (across * (0.095 - 0.03 * t), 0.909 + 0.1 * t ** 1.3 - 0.03 * across * across, -0.5 - 0.6 * t)
        k.sheet(at, "scuff_plastic", nu=4, nv=1, thick=0.003)

    tail_edge(1, 0.5, 1.0, 0.5)
    tail_edge(-1, 0.7, 1.0, 0.65)
    # The tank shrouds' leading edges and lower corners, and the side panels' lower edges
    for side, marks in ((1, ([(0.47, 0.72), (0.555, 0.855), (0.52, 0.87), (0.44, 0.74)], [(0.3, 0.69), (0.45, 0.705), (0.43, 0.725), (0.3, 0.71)])),
                        (-1, ([(0.5, 0.8), (0.555, 0.86), (0.5, 0.94), (0.48, 0.92), (0.52, 0.86)], [(0.28, 0.685), (0.36, 0.69), (0.35, 0.705)]))):
        for mark in marks:
            E.panel(k, mark, side * 0.189, 0.004, "scuff_plastic", toe=side * -0.2, bevel=0, about=on_shroud)
    E.panel(k, [(-0.12, 0.645), (-0.42, 0.665), (-0.56, 0.76), (-0.585, 0.8), (-0.54, 0.79), (-0.42, 0.69), (-0.14, 0.665)], 0.141, 0.004, "scuff_plastic", toe=0.06, bevel=0)
    E.panel(k, [(-0.3, 0.655), (-0.42, 0.662), (-0.5, 0.715), (-0.44, 0.7)], -0.141, 0.004, "scuff_plastic", toe=-0.06, bevel=0)
    # The silencer: its heat shield scraped along, a dent and bare metal behind the shield
    a, b = (0.155, 0.68, -0.3), (0.175, 0.86, -0.86)
    lean = E.tilt(a, b)
    k.box((0.004, 0.24, 0.035), E.along((a[0] + 0.066, a[1], a[2]), (b[0] + 0.066, b[1], b[2]), 0.52), "scuff_grey", rot=lean, bevel=0)
    k.box((0.004, 0.07, 0.05), E.along((a[0] + 0.057, a[1], a[2]), (b[0] + 0.057, b[1], b[2]), 0.86), "scuff_metal", rot=lean, bevel=0)
    k.box((0.004, 0.035, 0.03), E.along((a[0] + 0.059, a[1] + 0.015, a[2]), (b[0] + 0.059, b[1] + 0.015, b[2]), 0.87), "block", rot=lean, bevel=0)
    # The skid plate's underside and flanks, the swingarm's ends and the pegs' ends
    k.box((0.15, 0.004, 0.3), (0, 0.253, 0.1), "scuff_grey", bevel=0)
    for side in (-1, 1):
        k.box((0.004, 0.03, 0.22), (side * 0.121, 0.285, 0.1), "scuff_grey", bevel=0)
        k.box((0.004, 0.05, 0.1), (side * (ARM_X + 0.019), REAR[1], REAR[2] + 0.02), "scuff_grey", bevel=0)
        k.cylinder(0.014, 0.006, (side * (PEG[0] + 0.072), PEG[1] - 0.012, PEG[2]), "scuff_grey", axis="x", seg=8)
    # The seat's rear right corner, torn and taped over
    k.box((0.075, 0.004, 0.055), (0.05, 0.9075, -0.565), "tape", rot=(0.12, 0.3, 0), bevel=0)
    k.box((0.004, 0.04, 0.055), (0.092, 0.888, -0.57), "tape", rot=(0.12, 0, 0), bevel=0)

    # With the steering: the hand guards, the bar ends and the fork guards. Not in the fork legs' own nodes: the game
    # reads the steering axis from the legs' surfaces
    k.begin("handlebar", (0, TOP[0] + 0.05, TOP[1] - 0.03))
    axle = (FRONT[1], FRONT[2])
    for side in (-1, 1):
        k.box((0.005, 0.06, 0.05), (side * (GRIP[0] + 0.068), GRIP[1] - 0.005, GRIP[2] + 0.086), "scuff_grey", bevel=0)
        k.box((0.07, 0.012 if side > 0 else 0.02, 0.004), (side * (GRIP[0] - 0.01), GRIP[1] + 0.012 * side, GRIP[2] + 0.102), "scuff_grey", bevel=0)
        k.cylinder(0.021, 0.008, (side * (GRIP[0] + 0.083), GRIP[1], GRIP[2]), "scuff_metal", axis="x", seg=10)
        a = (side * (FORK_X + 0.05), axle[0], axle[1])
        b = (side * (FORK_X + 0.05), TOP[0], TOP[1])
        k.box((0.005, 0.14 if side > 0 else 0.08, 0.03), E.along(a, b, 0.2 if side > 0 else 0.27), "scuff_grey", rot=E.tilt(a, b), bevel=0)
    k.keep = False


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    chassis(k)
    scuffs(k)


def build():
    k = E.EKit(seed=115, colours=COLOURS, extra=EXTRA)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    E.previews(k, NAME, height=0.7, reach=1.0)


build()
