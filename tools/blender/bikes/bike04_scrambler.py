# The 803 cc air-cooled scrambler from the 2018 trip: red teardrop tank with
# brushed aluminium knee panels, black trellis frame and side panels, a flat
# black seat, a round headlamp with a plain lens in a black shell, black
# 10-spoke cast wheels on block-tread dual-sport tyres (18 in front, 17 in
# back), black upside-down forks, one radial front disc on the right, a red
# front mudguard and rear tail hump, the stubby silencer tucked under the
# seat on the right and a swingarm-hung number plate.
#
# Real size: wheelbase 1445 mm, rake 24 degrees, seat 790 mm, 110/80 R18 and
# 180/55 R17 tyres, 330 mm front and 245 mm rear discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike04_scrambler.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_B as kb  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike04_scrambler"
FRONT, REAR = (0, 0.317, 0.7225), (0, 0.315, -0.7225)
RAKE = math.radians(24)
FORK_LENGTH = 0.74
TOP = (FRONT[1] + FORK_LENGTH * math.cos(RAKE), FRONT[2] - FORK_LENGTH * math.sin(RAKE))
GRIP = (0.39, 1.085, 0.28)
PEG = (0.17, 0.34, -0.1)
DISC_FRONT, DISC_REAR = 0.165, 0.1225
RED = 0xB5121B


def build(k):
    low = k.low

    # ------------------------------------------------ wheels and brakes
    k.begin("wheel_front", FRONT)
    kb.wheel(k, FRONT, 0.317, 0.11, 0.2286, spokes=10, style="straight", tread="dual", hub=0.05, hub_width=0.045)
    k.begin("wheel_rear", REAR)
    kb.wheel(k, REAR, 0.315, 0.18, 0.216, spokes=10, style="straight", tread="dual", hub=0.055, hub_width=0.075)
    # The rear sprocket turns with the wheel
    if not low:
        k.lathe([(0, -0.005), (0.105, -0.005), (0.105, 0.005), (0, 0.005)], (-0.098, REAR[1], REAR[2]), "steel_dark", axis="x", seg=46,
                ripple=lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0, sharp=20)
    else:
        k.cylinder(0.105, 0.01, (-0.098, REAR[1], REAR[2]), "steel_dark", axis="x", seg=16)

    k.begin("disc_front", (0.058, FRONT[1], FRONT[2]))
    kb.disc(k, (0.058, FRONT[1], FRONT[2]), DISC_FRONT, holes=30, carrier="dark_metal", arms=6)
    k.begin("disc_rear", (0.092, REAR[1], REAR[2]))
    kb.disc(k, (0.092, REAR[1], REAR[2]), DISC_REAR, holes=0, carrier="steel_dark", arms=0, inner_frac=0.6)

    # Black upside-down forks; the radial caliper behind the right leg
    kb.forks(k, 0.093, FRONT[1:], TOP, 0.0205, usd=True, outer="dark_metal", inner="chrome", disc_r=DISC_FRONT, disc_x=0.058, disc_sides=(1,),
             caliper_angle=200, caliper_mat="caliper", yoke="dark_metal", bottom="dark_metal")

    # ------------------------------------------------ bar, lamp, lights
    k.begin("handlebar", (0, 1.04, 0.4))
    kb.handlebar(k, GRIP, (1.0, 0.405), rise=0.07, sweep=0.05, radius=0.0135, mat="dark_metal")
    kb.mirror(k, (0.25, 1.09, 0.33), (0.27, 1.17, 0.345), (0.3, 1.24, 0.335), size=(0.055, 0.04))

    k.begin("headlight", (0, 0.81, 0.635))
    kb.round_lamp(k, (0, 0.81, 0.64), 0.089, depth=0.12, shell="dark_metal", ring="dark_metal", tilt=-0.05, ring_led=True)

    k.begin("brake_light", (0, 0.735, -0.705))
    k.box((0.11, 0.035, 0.03), (0, 0.735, -0.705), "brake", rot=(0.4, 0, 0), bevel=0.01)

    k.begin("body")
    # Lamp brackets from the lower yoke, the single round clock offset right
    for side in (-1, 1):
        k.tube([(side * 0.093, 0.84, 0.49), (side * 0.085, 0.8, 0.55), (side * 0.08, 0.81, 0.59)], 0.008, "dark_metal", seg=6)
    k.lathe([(0, 0), (0.056, 0), (0.058, 0.035), (0.05, 0.045), (0, 0.045)], (0.045, 1.0, 0.38), "dark_metal", to=(0.045, 1.6, 0.68), seg=10 if low else 22)
    if not low:
        k.cylinder(0.046, 0.004, (0.045, 1.043, 0.401), "dash", rot=(-1.1, 0, 0), seg=20)
    # Front indicators on short stalks under the lamp
    for side in (-1, 1):
        kb.indicator(k, (side * 0.09, 0.86, 0.5), (side * 0.17, 0.86, 0.53), radius=0.02, length=0.045)
    # Steering head and stem
    head_lo = (0.79, 0.478)
    head_hi = (0.965, 0.40)
    k.rod((0, *head_lo), (0, *head_hi), 0.033, "dark_metal", seg=10 if low else 16)

    # Red front mudguard on stays from the fork feet
    k.guard((FRONT[1], FRONT[2]), 0.352, 0.135, math.radians(28), math.radians(150), "paint", crown=0.03, nu=6 if low else 12, nv=3 if low else 5)
    if not low:
        for side in (-1, 1):
            k.tube([(side * 0.085, 0.36, 0.73), (side * 0.072, 0.55, 0.62), (side * 0.066, 0.64, 0.6)], 0.007, "dark_metal", seg=6)

    # ------------------------------------------------ tank: a red teardrop
    def tank(u, up, side):
        return "paint"

    k.loft([
        (0.43, 0.83, 0.9, 0.06),
        (0.38, 0.77, 0.96, 0.12, 2.6, 2.6, 0.55),
        (0.27, 0.73, 0.985, 0.158, 2.5, 2.8, 0.5),
        (0.12, 0.72, 0.985, 0.17, 2.5, 2.8, 0.5, 0.82),
        (-0.0, 0.73, 0.955, 0.158, 2.5, 2.8, 0.5, 0.8),
        (-0.08, 0.75, 0.915, 0.13, 2.4, 2.6),
        (-0.12, 0.78, 0.87, 0.08),
    ], tank, ring=14 if low else 26, steps=2 if low else 4)
    # Filler cap, and the brushed aluminium panel in each knee recess
    k.cylinder(0.034, 0.012, (0, 0.986, 0.2), "steel", seg=10 if low else 20)
    for side in (-1, 1):
        outline = [(0.31, 0.9), (0.33, 0.85), (0.27, 0.78), (0.1, 0.765), (0.0, 0.79), (-0.02, 0.85), (0.04, 0.905), (0.2, 0.92)]
        k.panel(outline, side * 0.162, 0.012, "alu", toe=side * 0.07, bevel=0.003)
        if not low:
            # A thin black edging stripe on the tank's lower edge
            k.panel([(0.34, 0.79), (0.36, 0.775), (0.0, 0.74), (-0.04, 0.755)], side * 0.15, 0.006, "black_gloss", toe=side * 0.08, bevel=0)

    # ------------------------------------------------ seat, side panels, tail
    k.loft([(0.0, 0.74, 0.805, 0.09), (-0.06, 0.725, 0.815, 0.145, 3, 3), (-0.3, 0.72, 0.82, 0.148, 3.2, 3), (-0.55, 0.73, 0.825, 0.13, 3, 3),
            (-0.64, 0.745, 0.825, 0.095, 2.8, 3), (-0.68, 0.76, 0.81, 0.05)], "seat", ring=12 if low else 20, steps=2 if low else 3)
    if not low:
        # Ribs across the rider's half of the seat
        for n in range(7):
            z = -0.08 - n * 0.045
            k.box((0.25, 0.006, 0.012), (0, 0.822, z), "rubber", bevel=0.002)
        # Seat base pan
        k.box((0.24, 0.02, 0.62), (0, 0.715, -0.33), "dark_metal", bevel=0.006)
    for side in (-1, 1):
        k.panel([(-0.06, 0.745), (-0.27, 0.745), (-0.3, 0.66), (-0.2, 0.62), (-0.08, 0.65)], side * 0.128, 0.022, "black_gloss", toe=side * 0.05)
    # Red tail hump under the seat end, over the wheel
    k.guard((REAR[1], REAR[2]), 0.395, 0.12, math.radians(72), math.radians(112), "paint", crown=0.03, nu=4 if low else 8, nv=3 if low else 5, thick=0.014)
    # Rear indicators off the subframe
    for side in (-1, 1):
        kb.indicator(k, (side * 0.06, 0.72, -0.66), (side * 0.13, 0.715, -0.67), radius=0.017, length=0.04)

    # ------------------------------------------------ frame: black steel trellis
    head_top = (0.95, 0.41)
    head_bot = (0.8, 0.475)
    for side in (-1, 1):
        S = lambda y, z, x: (side * x, y, z)  # noqa: E731
        nodes = {
            "ht": S(*head_top, 0.045), "hb": S(*head_bot, 0.045),
            "t1": S(0.85, 0.2, 0.1), "t2": S(0.79, -0.02, 0.11),
            "l1": S(0.66, 0.33, 0.1), "l2": S(0.6, 0.1, 0.11),
            "r1": S(0.55, -0.15, 0.11),
        }
        for a, b in (("ht", "t1"), ("t1", "t2"), ("hb", "l1"), ("l1", "t1"), ("l1", "l2"), ("l2", "t1"), ("l2", "t2"), ("t2", "r1"), ("l2", "r1")):
            k.rod(nodes[a], nodes[b], 0.0125, "dark_metal", seg=6 if low else 10)
        # Subframe out to the tail, a stay under it
        k.rod(nodes["t2"], S(0.765, -0.66, 0.085), 0.011, "dark_metal", seg=6 if low else 10)
        k.rod(S(0.47, -0.16, 0.12), S(0.74, -0.5, 0.09), 0.01, "dark_metal", seg=6 if low else 10)
    k.rod((-0.085, 0.765, -0.66), (0.085, 0.765, -0.66), 0.01, "dark_metal", seg=6)

    # ------------------------------------------------ engine: air-cooled L-twin
    crank = (0.38, 0.08)
    front_dir = (math.sin(math.radians(23)), math.cos(math.radians(23)))
    rear_dir = (math.sin(math.radians(113)), math.cos(math.radians(113)))

    def at(d, t, x=0.0):
        return (x, crank[0] + d[0] * t, crank[1] + d[1] * t)

    # Crankcase, sump, covers
    k.loft([(0.26, 0.26, 0.44, 0.09), (0.18, 0.2, 0.5, 0.12, 3, 3), (-0.05, 0.19, 0.52, 0.13, 3, 3), (-0.16, 0.24, 0.5, 0.12, 3, 3), (-0.2, 0.31, 0.46, 0.09)],
           "engine_black", ring=10 if low else 16, steps=2)
    k.lathe([(0, 0), (0.1, 0), (0.105, 0.015), (0.09, 0.03), (0, 0.035)], (-0.12, 0.35, 0.06), "engine_black", axis="x", rot=(0, 0, math.pi), seg=12 if low else 28)
    k.lathe([(0, 0), (0.095, 0), (0.1, 0.018), (0.085, 0.032), (0, 0.036)], (0.12, 0.34, 0.08), "engine_black", axis="x", seg=12 if low else 28)
    if not low:
        for side in (-1, 1):
            k.lathe([(0.07, 0.0), (0.085, 0.0), (0.085, 0.006), (0.07, 0.006)], (side * (0.157 if side > 0 else 0.158), 0.34 if side > 0 else 0.35, 0.08 if side > 0 else 0.06), "alu", axis="x",
                    rot=(0, 0, 0 if side > 0 else math.pi), seg=28)
    if not low:
        k.lathe([(0, 0), (0.03, 0), (0.03, 0.012), (0, 0.012)], (0.155, 0.34, 0.08), "alu", axis="x", seg=12)
        # The engine casing's bolt heads round the covers
        for n in range(8):
            a = 2 * math.pi * n / 8
            k.cylinder(0.006, 0.01, (0.153, 0.34 + math.cos(a) * 0.088, 0.08 + math.sin(a) * 0.088), "steel", axis="x", seg=6)
    for d, length in ((front_dir, 0.2), (rear_dir, 0.2)):
        # Square-finned barrel: a core with fins stacked up it
        lean = math.atan2(d[1], d[0])
        k.rod(at(d, 0.07), at(d, 0.215), 0.055, "engine_black", seg=8 if low else 14)
        fins = 4 if low else 11
        for n in range(fins):
            t = 0.09 + n * (0.125 / max(1, fins - 1))
            k.box((0.17, 0.006 if not low else 0.03, 0.15), at(d, t), "fin", rot=(lean, 0, 0), bevel=0)
        # Head: a core under deep square fins, the ribbed silver valve cover on top
        k.box((0.15, 0.09, 0.13), at(d, 0.265), "engine_black", rot=(lean, 0, 0), bevel=0.01)
        k.box((0.135, 0.035, 0.115), at(d, 0.325), "alu", rot=(lean, 0, 0), bevel=0.012)
        if not low:
            for n in range(5):
                k.box((0.2 - 0.008 * abs(n - 2), 0.006, 0.17 - 0.006 * abs(n - 2)), at(d, 0.226 + n * 0.018), "fin", rot=(lean, 0, 0), bevel=0)
            for n in range(3):
                k.box((0.012, 0.012, 0.1), at(d, 0.345, (n - 1) * 0.035), "alu", rot=(lean, 0, 0), bevel=0.003)
            # Plug lead out of the head's left side
            k.tube([at(d, 0.27, -0.08), at(d, 0.28, -0.12), (-0.13, 0.62, 0.0)], 0.006, "rubber", seg=5)
        # The cam belt cover up the right side of each cylinder: rounded at
        # both ends, the big end over the crank pulley, ribbed down its face
        perp = (-d[1], d[0])

        def edge(t, off, d=d, perp=perp):
            p = at(d, t)
            return (p[2] + perp[1] * off, p[1] + perp[0] * off)

        outline = []
        for n in range(7):
            a = math.pi * n / 6
            outline.append(edge(0.3 + 0.045 * math.sin(a), 0.045 * math.cos(a)))
        for n in range(7):
            a = math.pi * n / 6
            outline.append(edge(0.05 - 0.06 * math.sin(a), -0.06 * math.cos(a)))
        k.panel(outline, 0.1, 0.022, "black_gloss", bevel=0 if low else 0.006)
        if not low:
            for off in (-0.022, 0.0, 0.022):
                k.panel([edge(0.1, off - 0.004), edge(0.29, off - 0.004), edge(0.29, off + 0.004), edge(0.1, off + 0.004)], 0.112, 0.006, "engine_black", bevel=0)
    # Throttle body and air box in the vee, under the tank
    k.box((0.16, 0.1, 0.16), (0, 0.66, 0.2), "dark_metal", rot=(0.3, 0, 0), bevel=0.02)
    k.rod((0, 0.6, 0.16), (0, 0.66, 0.1), 0.03, "alu", seg=8 if low else 14)

    # ------------------------------------------------ exhaust: under, then up under the seat on the right
    port_front = at(front_dir, 0.27)
    port_rear = at(rear_dir, 0.25)
    k.tube([(0.02, port_front[1] - 0.04, port_front[2] + 0.02), (0.04, 0.27, 0.33), (0.07, 0.15, 0.24), (0.08, 0.13, 0.04), (0.1, 0.16, -0.14), (0.14, 0.24, -0.25)],
           0.022, "steel", seg=8 if low else 12, smooth=3)
    k.tube([(0.04, port_rear[1] - 0.02, port_rear[2] - 0.05), (0.08, 0.52, -0.2), (0.12, 0.36, -0.22), (0.14, 0.26, -0.26)], 0.021, "steel", seg=8 if low else 12, smooth=3)
    # The silencer: a short brushed can with a slotted shield and two stacked outlets
    a, b = (0.15, 0.26, -0.27), (0.175, 0.42, -0.62)
    k.lathe([(0.03, 0), (0.06, 0.04), (0.062, 0.32), (0.055, 0.37), (0.0, 0.375)], a, "steel", to=b, seg=10 if low else 22)
    if not low:
        k.lathe([(0.064, 0.06), (0.068, 0.07), (0.068, 0.3), (0.064, 0.31)], a, "alu", to=b, seg=22, arc=(-1.2, 1.2), solid=0.003)
        for n in range(2):
            y = 0.395 + n * 0.035
            k.rod((0.175, y, -0.6), (0.18, y + 0.012, -0.66), 0.013, "steel_dark", seg=10)

    # ------------------------------------------------ swingarm, shock, chain
    # Cast aluminium swingarm: a tapered box arm each side over a lower
    # brace, tied by struts, the chain adjusters at the axle
    for side in (-1, 1):
        x = side * 0.125
        kb.tapered_beam(k, (x, 0.39, -0.08), (x, 0.315, -0.76), (0.04, 0.085), (0.032, 0.05), "alu")
        kb.tapered_beam(k, (x, 0.32, -0.14), (x, 0.3, -0.52), (0.03, 0.03), (0.026, 0.024), "alu")
        for z0, z1 in ((-0.25, -0.22), (-0.42, -0.44)):
            kb.tapered_beam(k, (x, 0.315, z0), (x, 0.375 - 0.03 * (z0 < -0.3), z1), (0.026, 0.02), (0.026, 0.02), "alu", bevel=0.004)
        k.box((0.02, 0.05, 0.06), (side * 0.145, REAR[1], REAR[2]), "steel_dark", bevel=0.005)
        if not low:
            k.rod((side * 0.15, REAR[1], REAR[2] - 0.03), (side * 0.15, REAR[1], REAR[2] - 0.09), 0.006, "steel", seg=6)
    k.box((0.25, 0.05, 0.06), (0, 0.39, -0.2), "alu", bevel=0.01)
    k.rod((-0.15, 0.38, -0.1), (0.15, 0.38, -0.1), 0.018, "steel_dark", seg=8)
    parts.shock(k, (-0.075, 0.64, -0.2), (-0.11, 0.4, -0.42), 0.028, mat="steel_dark")
    kb.chain_drive(k, -0.098, (0.36, -0.07), (REAR[1], REAR[2]), 0.04, 0.105, sprocket=False)
    # Rear caliper hung under the swingarm on the right, with its torque arm
    kb.caliper(k, (0.092, REAR[1], REAR[2]), DISC_REAR, 240, mat="caliper", length=0.09, radial=0.045, width=0.05, pistons=1, mount=(0.125, 0.3, -0.45))
    # Chain guard over the top run
    if not low:
        k.box((0.008, 0.03, 0.34), (-0.115, 0.43, -0.42), "dark_metal", rot=(0.12, 0, 0), bevel=0.003)
        k.box((0.06, 0.07, 0.07), (-0.11, 0.37, -0.06), "dark_metal", bevel=0.01)

    # ------------------------------------------------ pegs, stand, plate
    parts.pegs(k, PEG, hanger=(0.48, -0.06), mat="steel")
    for side in (-1, 1):
        k.rod((side * 0.13, 0.43, -0.34), (side * 0.2, 0.43, -0.36), 0.011, "steel", seg=8)
        k.beam((side * 0.13, 0.43, -0.34), (side * 0.12, 0.56, -0.24), (0.012, 0.04), "alu", bevel=0.004)
    k.rod((-0.15, 0.3, -0.03), (-0.25, 0.03, 0.07), 0.011, "steel_dark", seg=6)
    # Swingarm-hung plate: an arm from the left axle round behind the tyre
    k.tube([(-0.15, REAR[1], REAR[2]), (-0.15, 0.4, -0.95), (-0.09, 0.46, -1.06), (0.0, 0.47, -1.075)], 0.01, "dark_metal", seg=6, smooth=2)
    kb.plate(k, (0, 0.47, -1.08), size=(0.2, 0.14), tilt=0.1)
    if not low:
        k.box((0.06, 0.02, 0.02), (0, 0.395, -1.07), "lens_red", bevel=0.003)
        k.box((0.04, 0.02, 0.02), (0, 0.555, -1.075), "dark_metal", bevel=0.003)


def luggage(k):
    # The big black dry duffel thrown across the pillion, its ends sagging
    # down both sides of the tail, webbing straps round it, a zip pocket and
    # a plain light-blue patch on its back face (no logo). It sits back far
    # enough to keep 4 cm clear of the seated rider (bikemodels.test.js)
    z = -0.53
    k.begin("luggage", (0, 0.9, z))
    path = [(-0.44, 0.65, z), (-0.34, 0.83, z), (-0.17, 0.93, z), (0.0, 0.95, z), (0.17, 0.93, z), (0.34, 0.83, z), (0.44, 0.65, z)]
    kb.duffel(k, path, 0.135, 0.175, mat="bag", strap="bag", straps=(0.3, 0.7), power=2.4, pocket=(0.5, 0.24), patch=0.47,
              anchors=[((s * 0.13, 0.84, z + 0.12), (s * 0.09, 0.77, -0.33)) for s in (-1, 1)] + [((s * 0.13, 0.84, z - 0.12), (s * 0.09, 0.77, -0.70)) for s in (-1, 1)])


def full(k):
    build(k)
    luggage(k)


kb.make(NAME, full, colours={"paint": RED, "caliper": 0x2B2D31, "disc": 0xB4B7BC}, anchors={"grip": GRIP, "peg": PEG})
