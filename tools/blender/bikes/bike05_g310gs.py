# The 313 cc single-cylinder adventure bike from the 2019 trip, in its red,
# white, grey and black livery (the rental firm's lettering left off): a red
# tank top and front shroud, a white lower front panel, grey knee panels,
# black radiator shrouds and frame, a short beak under the angular headlamp
# and small screen, gold upside-down forks, black five-way split-spoke wheels
# (19 in front, 17 in back) on dual-sport tyres, one front disc on the left,
# black hand guards, a reverse-inclined engine with its silver covers, a long
# silver swingarm, the angled silencer on the right and a black luggage rack.
#
# Real size: wheelbase 1420 mm, rake 26.4 degrees, seat 835 mm, 110/80 R19
# and 130/80 R17 tyres, 300 mm front and 240 mm rear discs.
#   blender --background --factory-startup --python tools/blender/bikes/bike05_g310gs.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_B as kb  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike05_g310gs"
FRONT, REAR = (0, 0.329, 0.71), (0, 0.32, -0.71)
RAKE = math.radians(26.4)
FORK_LENGTH = 0.86
TOP = (FRONT[1] + FORK_LENGTH * math.cos(RAKE), FRONT[2] - FORK_LENGTH * math.sin(RAKE))
GRIP = (0.4, 1.17, 0.24)
PEG = (0.17, 0.42, -0.1)
DISC_FRONT, DISC_REAR = 0.15, 0.12
RED = 0xC4122A


def build(k):
    low = k.low
    seg = (lambda hi, lo: lo if low else hi)  # noqa: E731

    # ------------------------------------------------ wheels and brakes
    k.begin("wheel_front", FRONT)
    kb.wheel(k, FRONT, 0.329, 0.11, 0.2413, spokes=5, style="y", tread="dual", hub=0.05, hub_width=0.045)
    k.begin("wheel_rear", REAR)
    kb.wheel(k, REAR, 0.32, 0.13, 0.216, spokes=5, style="y", tread="dual", hub=0.055, hub_width=0.06)
    if not low:
        k.lathe([(0, -0.005), (0.1, -0.005), (0.1, 0.005), (0, 0.005)], (-0.085, REAR[1], REAR[2]), "steel_dark", axis="x", seg=44,
                ripple=lambda i, j: 0.006 if (j in (1, 2) and i % 2) else 0.0, sharp=20)
    else:
        k.cylinder(0.1, 0.01, (-0.085, REAR[1], REAR[2]), "steel_dark", axis="x", seg=16)

    k.begin("disc_front", (-0.066, FRONT[1], FRONT[2]))
    kb.disc(k, (-0.066, FRONT[1], FRONT[2]), DISC_FRONT, petal=0, holes=24, carrier="dark_metal", arms=5)
    k.begin("disc_rear", (0.084, REAR[1], REAR[2]))
    kb.disc(k, (0.084, REAR[1], REAR[2]), DISC_REAR, holes=16, carrier="steel_dark", arms=0, inner_frac=0.62)

    # Gold upside-down forks, the radial caliper behind the left leg
    kb.forks(k, 0.1, FRONT[1:], TOP, 0.0205, usd=True, outer="gold", inner="chrome", disc_r=DISC_FRONT, disc_x=0.066, disc_sides=(-1,),
             caliper_angle=205, caliper_mat="caliper", yoke="alu", bottom="dark_metal", caps="alu")

    # ------------------------------------------------ bar with hand guards, lamp, lights
    k.begin("handlebar", (0, 1.13, 0.31))
    kb.handlebar(k, GRIP, (1.115, 0.315), rise=0.05, sweep=0.06, radius=0.0135, mat="dark_metal", guards="trim")
    kb.mirror(k, (0.26, 1.18, 0.29), (0.28, 1.27, 0.31), (0.31, 1.34, 0.3), size=(0.07, 0.045))

    k.begin("headlight", (0, 0.87, 0.66))
    # One wide lens, flat across the top and pointed below, raked back in a black surround
    lens = [(-0.105, 0.035), (0.105, 0.035), (0.088, -0.008), (0.035, -0.05), (-0.035, -0.05), (-0.088, -0.008)]
    kb.prism(k, (0, 0.868, 0.628), (0, 0.876, 0.668), lens, "headlight")
    kb.prism(k, (0, 0.862, 0.6), (0, 0.872, 0.655), [(x * 1.2, y * 1.25) for x, y in lens], "black_gloss")
    if not low:
        for side in (-1, 1):
            k.cylinder(0.022, 0.004, (side * 0.045, 0.877, 0.668), "chrome", axis="z", rot=(-0.17, 0, 0), seg=14)

    k.begin("brake_light", (0, 0.84, -0.86))
    k.box((0.12, 0.04, 0.03), (0, 0.84, -0.865), "brake", rot=(0.35, 0, 0), bevel=0.01)

    k.begin("body")
    # Small clear screen over the lamp, the dash behind it
    def screen(u, v):
        across = (v - 0.5) * 2
        half = 0.13 - 0.03 * u
        return (across * half, 0.95 + 0.16 * u, 0.62 - 0.08 * u - 0.03 * across * across)

    k.sheet(screen, "glass", nu=seg(4, 2), nv=seg(6, 2), thick=0.005)
    k.box((0.17, 0.11, 0.04), (0, 1.03, 0.5), "dark_metal", rot=(-0.7, 0, 0), bevel=0.01)
    k.box((0.13, 0.08, 0.006), (0, 1.04, 0.52), "dash", rot=(-0.7, 0, 0), bevel=0)
    # Front indicators on stalks from the shroud
    for side in (-1, 1):
        kb.indicator(k, (side * 0.15, 0.88, 0.56), (side * 0.22, 0.875, 0.56), radius=0.017, length=0.04)
    # Steering head
    k.rod((0, 0.87, 0.408), (0, 1.063, 0.312), 0.033, "dark_metal", seg=seg(16, 10))

    # Low front mudguard on the fork, and the beak under the lamp
    k.guard((FRONT[1], FRONT[2]), 0.36, 0.13, math.radians(35), math.radians(140), "trim", crown=0.03, nu=seg(12, 6), nv=seg(5, 3))
    k.loft([(0.56, 0.75, 0.82, 0.1, 2.6, 2.6), (0.64, 0.73, 0.8, 0.09, 2.6, 2.4), (0.71, 0.715, 0.765, 0.065, 2.6, 2.2), (0.75, 0.71, 0.735, 0.04)],
           "grey", ring=seg(14, 8), steps=seg(3, 1))
    # Headlight shroud: the nose round the lamp, in red
    k.loft([(0.44, 0.76, 0.97, 0.12, 3, 3), (0.56, 0.78, 0.97, 0.125, 3, 3), (0.62, 0.8, 0.96, 0.12, 3, 3), (0.655, 0.81, 0.95, 0.11, 3, 3)],
           lambda u, up, side: "paint" if up > -0.2 else "black_gloss", ring=seg(18, 10), steps=seg(2, 1))

    # ------------------------------------------------ tank and shrouds
    k.loft([
        (0.42, 0.88, 0.97, 0.08),
        (0.34, 0.8, 1.01, 0.14, 2.6, 2.6, 0.5),
        (0.2, 0.75, 1.02, 0.16, 2.6, 2.8, 0.5, 0.85),
        (0.04, 0.75, 1.0, 0.155, 2.6, 2.8, 0.5, 0.8),
        (-0.06, 0.77, 0.95, 0.13, 2.6, 2.6),
        (-0.1, 0.79, 0.91, 0.08),
    ], lambda u, up, side: "paint" if up > 0.15 else "grey", ring=seg(26, 14), steps=seg(4, 2))
    if not low:
        k.cylinder(0.04, 0.01, (0, 1.025, 0.24), "steel", seg=20, rot=(0.15, 0, 0))
        k.cylinder(0.026, 0.012, (0, 1.03, 0.24), "dark_metal", seg=14, rot=(0.15, 0, 0))
    # Side shrouds: one curved skin a side from the knee to the lamp, its
    # livery painted on by region (red top sweeping down to the nose with
    # its vent slots, white lower front, grey knee, black radiator foot),
    # black on the inner face
    def livery(u, up, across, side):
        if across * side < -0.3:
            return "black_gloss"
        frac = (up + 1) / 2
        red = 0.78 - 0.45 * u
        if frac >= red:
            return "vent" if (0.62 < u < 0.8 and red + 0.06 < frac < red + 0.16 and not low) else "paint"
        if frac < 0.12 and 0.2 < u < 0.9:
            return "black_gloss"
        return "white" if u > 0.42 else "grey"

    for side in (-1, 1):
        k.loft([(0.0, 0.68, 0.94, 0.02, 2.4, 2.4, 0.5, 1, 1, side * 0.148), (0.1, 0.65, 0.985, 0.038, 2.6, 2.4, 0.55, 1, 1, side * 0.162),
                (0.26, 0.61, 0.99, 0.042, 2.6, 2.4, 0.55, 1, 1, side * 0.168), (0.4, 0.62, 0.96, 0.04, 2.6, 2.4, 0.55, 1, 1, side * 0.16),
                (0.52, 0.66, 0.93, 0.033, 2.6, 2.4, 0.55, 1, 1, side * 0.148), (0.62, 0.72, 0.93, 0.025, 2.4, 2.4, 0.5, 1, 1, side * 0.135),
                (0.67, 0.78, 0.92, 0.012, 2.4, 2.4, 0.5, 1, 1, side * 0.125)],
               lambda u, up, across, side=side: livery(u, up, across, side), ring=seg(20, 10), steps=seg(4, 1))
    # The space between tank and engine filled: frame covers and the air box
    k.loft([(0.22, 0.5, 0.74, 0.08), (0.14, 0.47, 0.77, 0.11, 3, 3), (-0.04, 0.48, 0.78, 0.115, 3, 3), (-0.14, 0.52, 0.79, 0.1, 3, 3), (-0.18, 0.58, 0.79, 0.07)],
           "black_gloss", ring=seg(16, 10), steps=seg(2, 1))

    # Radiator behind the shrouds, the bash plate under the engine
    k.box((0.3, 0.26, 0.05), (0, 0.6, 0.33), "dark_metal", rot=(-0.25, 0, 0), bevel=0.01)
    k.box((0.27, 0.22, 0.01), (0, 0.6, 0.358), "vent", rot=(-0.25, 0, 0), bevel=0)
    k.loft([(0.24, 0.15, 0.22, 0.08), (0.18, 0.13, 0.2, 0.11, 3, 3), (-0.08, 0.13, 0.2, 0.11, 3, 3), (-0.13, 0.15, 0.21, 0.08)], "black_gloss", ring=seg(12, 8), steps=1)

    # ------------------------------------------------ seat, tail and rack
    k.loft([(0.02, 0.8, 0.84, 0.09), (-0.06, 0.78, 0.84, 0.14, 3, 3), (-0.3, 0.78, 0.845, 0.145, 3, 3), (-0.4, 0.79, 0.86, 0.12, 3, 3), (-0.43, 0.8, 0.875, 0.1)],
           "seat", ring=seg(18, 10), steps=seg(3, 2))
    k.loft([(-0.4, 0.84, 0.89, 0.1), (-0.45, 0.84, 0.895, 0.12, 3, 3), (-0.66, 0.85, 0.9, 0.11, 3, 3), (-0.72, 0.85, 0.895, 0.08)], "seat", ring=seg(16, 10), steps=seg(2, 1))
    for side in (-1, 1):
        k.panel([(-0.36, 0.855), (-0.6, 0.875), (-0.78, 0.88), (-0.82, 0.845), (-0.62, 0.8), (-0.4, 0.79)], side * 0.12, 0.02, "grey", toe=side * 0.05)
        k.panel([(-0.06, 0.78), (-0.38, 0.79), (-0.42, 0.72), (-0.22, 0.66), (-0.08, 0.68)], side * 0.125, 0.02, "black_gloss", toe=side * 0.04)
        # Grab rail along the rack
        k.tube([(side * 0.15, 0.85, -0.42), (side * 0.17, 0.9, -0.55), (side * 0.15, 0.91, -0.8), (side * 0.1, 0.91, -0.88)], 0.012, "dark_metal", seg=seg(8, 6), smooth=2)
    k.box((0.22, 0.015, 0.26), (0, 0.915, -0.75), "dark_metal", bevel=0.005)
    if not low:
        for n in range(3):
            k.box((0.2, 0.006, 0.03), (0, 0.925, -0.66 - n * 0.07), "steel_dark", bevel=0)
    # Tail light housing, the plate hanger, plate and indicators
    k.loft([(-0.8, 0.79, 0.86, 0.08), (-0.86, 0.8, 0.86, 0.07), (-0.88, 0.81, 0.85, 0.05)], "black_gloss", ring=seg(12, 8), steps=1)
    k.tube([(0, 0.79, -0.82), (0, 0.72, -0.9), (0, 0.66, -0.96)], 0.02, "black_gloss", seg=seg(8, 6))
    kb.plate(k, (0, 0.6, -0.99), size=(0.18, 0.13), tilt=0.12)
    for side in (-1, 1):
        kb.indicator(k, (side * 0.03, 0.72, -0.9), (side * 0.11, 0.725, -0.91), radius=0.016, length=0.04)
    if not low:
        k.box((0.06, 0.02, 0.01), (0, 0.52, -0.995), "reflector", bevel=0.002)

    # ------------------------------------------------ frame
    for side in (-1, 1):
        S = lambda y, z, x: (side * x, y, z)  # noqa: E731
        k.tube([S(1.0, 0.36, 0.05), S(0.92, 0.25, 0.09), S(0.84, 0.0, 0.11), S(0.68, -0.12, 0.12), S(0.48, -0.14, 0.12)], 0.015, "dark_metal", seg=seg(10, 6), smooth=2)
        k.tube([S(0.88, 0.43, 0.05), S(0.7, 0.36, 0.08), S(0.5, 0.3, 0.1), S(0.36, 0.24, 0.1)], 0.014, "dark_metal", seg=seg(10, 6), smooth=2)
        k.rod(S(0.84, 0.05, 0.11), S(0.7, 0.32, 0.09), 0.011, "dark_metal", seg=seg(8, 6))
        # Bolted rear subframe
        k.rod(S(0.84, 0.0, 0.11), S(0.85, -0.82, 0.08), 0.011, "dark_metal", seg=seg(8, 6))
        k.rod(S(0.55, -0.14, 0.12), S(0.83, -0.6, 0.09), 0.01, "dark_metal", seg=seg(8, 6))

    # ------------------------------------------------ engine: reverse-inclined single
    crank = (0.36, 0.03)
    d = (math.sin(math.radians(100)), math.cos(math.radians(100)))
    lean = math.atan2(d[1], d[0])
    at = lambda t, x=0.0: (x, crank[0] + d[0] * t, crank[1] + d[1] * t)  # noqa: E731
    k.loft([(0.2, 0.22, 0.42, 0.09), (0.14, 0.18, 0.47, 0.115, 3, 3), (-0.08, 0.18, 0.49, 0.12, 3, 3), (-0.16, 0.22, 0.47, 0.11, 3, 3), (-0.2, 0.3, 0.42, 0.08)],
           "engine_black", ring=seg(16, 10), steps=2)
    k.box((0.15, 0.17, 0.14), at(0.17), "engine_black", rot=(lean, 0, 0), bevel=0.015)
    k.box((0.17, 0.09, 0.16), at(0.29), "engine_black", rot=(lean, 0, 0), bevel=0.015)
    k.box((0.15, 0.04, 0.14), at(0.35), "silver", rot=(lean, 0, 0), bevel=0.012)
    # Silver clutch cover on the right, alternator cover on the left
    k.lathe([(0, 0), (0.09, 0), (0.095, 0.02), (0.08, 0.036), (0, 0.04)], (0.11, 0.33, -0.02), "silver", axis="x", seg=seg(28, 12))
    k.box((0.04, 0.14, 0.16), (0.12, 0.38, 0.08), "silver", bevel=0.02)
    k.lathe([(0, 0), (0.085, 0), (0.09, 0.02), (0.075, 0.034), (0, 0.036)], (-0.11, 0.34, -0.03), "silver", axis="x", rot=(0, 0, math.pi), seg=seg(28, 12))
    if not low:
        k.cylinder(0.03, 0.012, (0.155, 0.33, -0.02), "dark_metal", axis="x", seg=14)
        for n in range(8):
            a = 2 * math.pi * n / 8
            k.cylinder(0.006, 0.01, (0.152, 0.33 + math.cos(a) * 0.082, -0.02 + math.sin(a) * 0.082), "steel", axis="x", seg=6)
    # Throttle body and air box ahead of the cylinder, under the tank
    k.rod((0, 0.66, 0.16), (0, 0.72, 0.28), 0.03, "dark_metal", seg=seg(14, 8))
    k.box((0.2, 0.12, 0.22), (0, 0.72, -0.02), "dark_metal", bevel=0.02)

    # ------------------------------------------------ exhaust: out of the back of the head, round to the right
    port = at(0.28)
    k.tube([(0.02, port[1] - 0.02, port[2] - 0.08), (0.06, 0.5, -0.17), (0.09, 0.3, -0.12), (0.12, 0.25, -0.18), (0.145, 0.29, -0.26)], 0.022, "steel", seg=seg(12, 8), smooth=3)
    a, b = (0.15, 0.3, -0.27), (0.19, 0.56, -0.82)
    k.lathe([(0.02, 0), (0.06, 0.05), (0.068, 0.36), (0.064, 0.52), (0.04, 0.55), (0, 0.555)], a, "steel", to=b, seg=seg(16, 8))
    if not low:
        k.rod((0.186, 0.545, -0.79), (0.19, 0.56, -0.82), 0.024, "can_black", seg=12)

    # ------------------------------------------------ swingarm, shock, chain
    for side in (-1, 1):
        k.loft([(-0.1, 0.37, 0.49, 0.026, 3.5, 3.5, 0.5, 1, 1, side * 0.11), (-0.3, 0.35, 0.45, 0.024, 3.5, 3.5, 0.5, 1, 1, side * 0.112),
                (-0.65, 0.295, 0.355, 0.018, 3.5, 3.5, 0.5, 1, 1, side * 0.114), (-0.76, 0.29, 0.35, 0.018, 3.5, 3.5, 0.5, 1, 1, side * 0.114)],
               "silver", ring=seg(12, 8), steps=2)
        k.box((0.02, 0.05, 0.06), (side * 0.125, REAR[1], REAR[2]), "steel_dark", bevel=0.005)
    k.box((0.22, 0.05, 0.06), (0, 0.42, -0.24), "silver", bevel=0.01)
    k.rod((-0.14, 0.43, -0.1), (0.14, 0.43, -0.1), 0.018, "steel_dark", seg=8)
    parts.shock(k, (0, 0.74, -0.16), (0, 0.46, -0.27), 0.03, mat="spring")
    kb.chain_drive(k, -0.085, (0.33, -0.06), (REAR[1], REAR[2]), 0.04, 0.1, sprocket=False)
    kb.caliper(k, (0.084, REAR[1], REAR[2]), DISC_REAR, 230, mat="caliper", length=0.085, radial=0.045, width=0.05, pistons=1, mount=(0.11, 0.31, -0.48))
    if not low:
        k.box((0.008, 0.03, 0.3), (-0.1, 0.42, -0.42), "dark_metal", rot=(0.15, 0, 0), bevel=0.003)

    # ------------------------------------------------ pegs, stand
    parts.pegs(k, PEG, hanger=(0.5, -0.08), mat="steel")
    for side in (-1, 1):
        k.rod((side * 0.12, 0.5, -0.38), (side * 0.19, 0.5, -0.4), 0.011, "steel", seg=8)
        k.beam((side * 0.12, 0.5, -0.38), (side * 0.11, 0.66, -0.3), (0.012, 0.04), "dark_metal", bevel=0.004)
    k.rod((-0.14, 0.32, -0.02), (-0.26, 0.03, 0.08), 0.011, "steel_dark", seg=6)


kb.make(NAME, build, colours={"paint": RED, "caliper": 0x9A8550, "disc": 0xB4B7BC, "spring": 0xE6E6E6, "trim": 0x1A1B1E},
        anchors={"grip": GRIP, "peg": PEG})
