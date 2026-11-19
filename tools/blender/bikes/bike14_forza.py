# bike-14: Tim's scooter, from the owner's photo of it (front right
# three-quarter). A mid-size 300 cc class sports scooter, smaller and lighter
# than a maxi scooter: metallic deep blue upper bodywork (the front apron,
# the strip along the seat, the front mudguard), satin silver panels that
# sweep from the nose down and back under the blue, black below. A tall clear
# screen on black struts, mirrors on thick stalks from the fairing with the
# indicators in the stalks, twin LED headlights in the nose with a silver V
# between them, a long stepped black seat, a grab rail, a black silencer
# under a silver heat shield on the right, black five-double-spoke wheels, a
# single front disc on the left, short black forks with an amber reflector,
# a flat floor either side of a low tunnel. The engine swings with the rear
# wheel, its belt case on the left, twin shocks at the back. No badges, no
# plate lettering.
#
# Real size (the class's published figures): 1,510 mm wheelbase, 2,140 mm
# long, 780 mm seat, 26.5 degrees of caster, 120/70-15 and 140/70-14 tyres,
# a 256 mm front disc, a 240 mm rear disc.
#
# The rider sits upright with the feet forward on the boards. `peg` is where
# the boot rests on the board's sloping front end.
#   blender --background --factory-startup --python tools/blender/bikes/bike14_forza.py
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _kit_E as E  # noqa: E402
import bike_parts as parts  # noqa: E402

NAME = "bike14_forza"
OUT = os.path.join(E.OUT_DIR, NAME + ".glb")
FRONT, REAR = (0, 0.2745, 0.755), (0, 0.276, -0.755)
FRONT_R, REAR_R = 0.2745, 0.276
# A 15 inch front rim and a 14 inch rear
RIM_F, RIM_R = 0.1905, 0.1778
RAKE = math.radians(26.5)
FORK_LEN = 0.47
TOP = (FRONT[1] + FORK_LEN * math.cos(RAKE), FRONT[2] - FORK_LEN * math.sin(RAKE))
FORK_X = 0.1
# The one front disc is on the left (-x as written here: the kit mirrors on export)
DISC_SIDE = -1
DISC_X, DISC_R = 0.062, 0.128
# The rear disc is on the right, opposite the belt
RDISC_X, RDISC_R = 0.07, 0.12
GRIP = (0.3, 1.02, 0.36)
PEG = (0.17, 0.445, 0.33)
SEAT = (0, 0.785, -0.18)
# Where the engine hangs from the frame (y, z)
PIVOT = (0.31, -0.22)
FLOOR = 0.33

COLOURS = {"paint": 0x20376B, "paint_dark": 0x16284C, "accent": 0xC4C7CB, "rim": 0x17181A, "caliper": 0x2A2B2E, "spring": 0x1B1C1F,
           "trim": 0x141517, "glass": 0x2A3036, "seat": 0x151517, "pillion": 0x19191C}
EXTRA = {
    # The satin silver panels
    "silver": (0xC4C7CB, 0.42, 0.55),
    "alu": (0x8A8D92, 0.36, 0.9),
    "casing": (0x26272A, 0.5, 0.6),
    # The floor's textured side panel
    "grain": (0x2B2D31, 0.85, 0.1),
    # The silencer's black body: not `dark_metal`, which tests/unit/bike-handedness.test.js reads as the belt's pulley
    "can": (0x1A1B1D, 0.5, 0.7),
    # The centre panel under the screen
    "gloss": (0x0B0C0E, 0.16, 0.3),
    # Inside the lamps
    "housing": (0x15171A, 0.3, 0.6),
}


def wheels(k):
    for name, centre, radius, width, rim, hub in (("wheel_front", FRONT, FRONT_R, 0.12, RIM_F, 0.045), ("wheel_rear", REAR, REAR_R, 0.14, RIM_R, 0.05)):
        k.begin(name, centre)
        E.wheel(k, centre, radius, width, rim, spokes="cast", count=5, pair=True, hub=hub, sweep=0.1, hub_width=0.045, blade=1.8)
    k.begin("disc_front", (DISC_SIDE * DISC_X, FRONT[1], FRONT[2]))
    k.disc((DISC_SIDE * DISC_X, FRONT[1], FRONT[2]), DISC_R, arms=5)
    k.begin("disc_rear", (RDISC_X, REAR[1], REAR[2]))
    k.disc((RDISC_X, REAR[1], REAR[2]), RDISC_R, arms=5)


def front_end(k):
    axle = (FRONT[1], FRONT[2])
    mid = E.along(axle, TOP, 0.5)
    for side, name in ((-1, "fork_left"), (1, "fork_right")):
        k.begin(name, (side * FORK_X, mid[0], mid[1]))
        a = (side * FORK_X, axle[0], axle[1])
        b = (side * FORK_X, TOP[0], TOP[1])
        # Conventional fork, all black: the sliders below, the stanchions
        # above under a black cover, mostly inside the apron
        k.box((0.06, 0.07, 0.07), E.along(a, b, 0.01), "casing", bevel=0.012)
        k.rod(E.along(a, b, 0.02), E.along(a, b, 0.5), 0.03, "casing", seg=14)
        k.rod(E.along(a, b, 0.49), b, 0.024, "trim", seg=12)
        if side == DISC_SIDE:
            # The caliper behind the leg, on its bracket
            ca = math.radians(205)
            cr = DISC_R * 0.86
            cat = (side * DISC_X, axle[0] + math.sin(ca) * cr, axle[1] + math.cos(ca) * cr)
            k.beam((side * (FORK_X - 0.005), axle[0] + 0.01, axle[1] - 0.02), (side * (DISC_X + 0.03), cat[1], cat[2]), (0.02, 0.03), "casing", bevel=0.004)
            E.caliper(k, (side * DISC_X, axle[0], axle[1]), DISC_R, ca, size=(0.048, 0.055, 0.1))
    k.begin("body")
    E.yokes(k, FORK_X, axle, TOP, 0.08)

    # The bar under its cover, with the grips and levers and the switchgear.
    # The front mudguard is here too: it is bolted to the fork, and this is
    # the node that turns with the steering without spinning.
    k.begin("handlebar", (0, 1.0, 0.39))
    clamp = (1.0, 0.39)
    for side in (-1, 1):
        k.tube([(0, clamp[0], clamp[1]), (side * 0.08, clamp[0] + 0.005, clamp[1]), (side * 0.19, GRIP[1] - 0.005, GRIP[2] + 0.025),
                (side * (GRIP[0] + 0.07), GRIP[1], GRIP[2] - 0.01)], 0.012, "dark_metal", seg=8, smooth=2)
        E.lever_set(k, GRIP, side, 0.2)
    # The bar's cover: a black pod over the clamp, a wing out to each switch block
    k.loft([(0.33, 0.985, 1.04, 0.07, 2.6, 2.6), (0.38, 0.975, 1.065, 0.11, 2.6, 2.6), (0.44, 0.985, 1.06, 0.1, 2.6, 2.6), (0.48, 1.0, 1.04, 0.06)], "trim",
           ring=14, steps=2)
    for side in (-1, 1):
        k.loft([(0.34, 0.99, 1.035, 0.06, 2.6, 2.6, 0.5, 1, 1, side * 0.14), (0.38, 0.985, 1.05, 0.075, 2.6, 2.6, 0.5, 1, 1, side * 0.14),
                (0.42, 0.99, 1.04, 0.06, 2.6, 2.6, 0.5, 1, 1, side * 0.14)], "trim", ring=10, steps=1)
    # Blue front mudguard, close over the tyre, a fin each side down to the fork leg
    k.guard((FRONT[1], FRONT[2]), FRONT_R + 0.026, 0.155, math.radians(18), math.radians(152), "paint", crown=0.032, nu=14)
    for side in (-1, 1):
        # The amber side reflector on each fork leg's outer face. Here, not in the leg's own node: the game reads the
        # steering axis from the legs' surfaces (Vehicle.steerAxis), and a plate on one side of a leg leans that line
        a = (side * (FORK_X + 0.032), axle[0], axle[1])
        b = (side * (FORK_X + 0.032), TOP[0], TOP[1])
        k.keep = True
        k.box((0.008, 0.05, 0.028), E.along(a, b, 0.42), "signal", rot=E.tilt(a, b), bevel=0.002)
        k.keep = False
        # Outboard of the disc's plane and above its rim
        k.panel([(0.87, 0.5), (0.8, 0.585), (0.66, 0.57), (0.6, 0.48), (0.67, 0.43), (0.77, 0.42)], side * 0.078, 0.008, "paint", bevel=0.003)

    headlights(k)

    k.begin("brake_light", (0, 0.845, -1.07))
    k.loft([(-1.045, 0.81, 0.875, 0.11, 3, 3), (-1.07, 0.815, 0.87, 0.095, 3, 3), (-1.082, 0.82, 0.865, 0.055)], "brake", ring=12, steps=1)


# The front bodywork's feature lines, as (x, y, z) knots on the right side.
# The face is a broad shield, not a cone: a bonnet of two silver blades
# either side of a gloss black centre, raked back from a blunt silver beak to
# the screen; a shoulder each side that the slim light runs along; under the
# shoulder the blue apron, leaning out to a crease and tucking in below it.
# Each panel is drawn between these lines (E.Patch), so two panels that meet
# share the line they meet on.
APEX = (0, 0.865, 0.94)
LIPC = (0, 0.672, 0.982)
S0 = (0.024, 0.805, 0.978)
C0 = (0.012, 0.676, 0.98)
T1 = (0.15, 0.862, 0.875)
H1 = (0.088, 0.69, 0.94)
X1 = (0.142, 0.836, 0.884)
X2 = (0.133, 0.806, 0.895)
S3 = (0.24, 0.955, 0.62)
S4 = (0.26, 0.985, 0.46)
R1 = (0.274, 0.93, 0.46)
F1 = (0.27, 0.19, 0.42)
LB = (0.14, 0.655, 0.875)
DECK = (0, 1.02, 0.62)
# Down the middle of the beak, and down its edge
PROW = E.smooth([APEX, (0, 0.805, 0.988), (0, 0.74, 1.002), LIPC])
BEAK = E.smooth([S0, (0.026, 0.74, 0.992), C0])
# The shoulder: the blades' outer edge, from the beak up and back to the mirror's root and the leg shield
SHOULDER = E.smooth([S0, T1, (0.205, 0.908, 0.765), S3, S4])
# The blades' inner edge, the black centre's outline
VEE = E.smooth([APEX, (0.092, 0.898, 0.865), (0.172, 0.94, 0.745), S3])
CENTRE = E.smooth([APEX, (0, 0.93, 0.87), (0, 0.975, 0.8), (0, 1.0, 0.72), DECK])
# The lamp's rear edge, where the blue apron's front edge climbs to the shoulder
RISE = E.smooth([T1, X1, X2, H1], 1)
# Under the slim light, and the crease below it where the apron is widest
BROW = E.smooth([X1, (0.207, 0.884, 0.77), (0.245, 0.937, 0.625), S4])
CREASE = E.smooth([X2, (0.222, 0.852, 0.775), (0.262, 0.902, 0.63), R1])
LOWER = E.smooth([H1, LB, (0.175, 0.6, 0.79), (0.2, 0.5, 0.68), (0.225, 0.38, 0.575), (0.245, 0.25, 0.5), F1])
TRAIL = E.smooth([R1, (0.283, 0.75, 0.455), (0.285, 0.55, 0.45), (0.28, 0.35, 0.435), F1])
SILL = E.smooth([C0, (0.05, 0.68, 0.965), H1])
LIP = E.smooth([(0, 0.645, 0.968), (0.03, 0.646, 0.962), (0.085, 0.648, 0.928), LB])
ROOF = E.smooth([(0, 0.645, 0.968), (0, 0.642, 0.9), (0, 0.642, 0.8), (0, 0.642, 0.66)])

BLADE = E.Patch(VEE, E.piece(SHOULDER, 0, 3), [APEX, S0], [S3, S3], out=(0.3, 1, 0.6))
BLACK = E.Patch(CENTRE, VEE, [APEX, APEX], [DECK, (0.12, 1.0, 0.62), S3], out=(0, 1, 0.5))
LAMP = E.Patch(E.piece(SHOULDER, 0, 1), SILL, BEAK, RISE)
LIGHT = E.Patch(E.piece(SHOULDER, 1, 4), BROW, [T1, X1], [S4, S4])
FACET = E.Patch(BROW, CREASE, [X1, X2], [S4, R1], out=(1, 0.8, 0.4))
APRON = E.Patch(CREASE, LOWER, [X2, H1], TRAIL, bulge=0.018)


def face(k):
    """The front bodywork, both sides."""
    for side in (-1, 1):
        # The silver blade stands proud of the black centre and of the light under its outer edge
        E.skin(k, BLADE, "silver", side, nu=12, nv=4, thick=0.016, lift=0.004, sharp=30)
        E.skin(k, BLACK, "gloss", side, nu=10, nv=4, thick=0.01, sharp=30)
        # The beak: the blades' meeting, down the nose between the lamps to the lip
        E.skin(k, E.Patch(PROW, E.piece(BEAK, 0, 2), [APEX, S0], [LIPC, C0], out=(0.3, 0.3, 1)), "silver", side, nu=8, nv=2, thick=0.012, lift=0.004)
        # Behind the screen: the black deck back to the leg shield's top
        deck = E.Patch([DECK, (0, 1.035, 0.55), (0, 1.0, 0.45)], E.piece(SHOULDER, 3, 4), [DECK, (0.12, 1.0, 0.62), S3],
                       [(0, 1.0, 0.45), (0.15, 1.0, 0.45), S4], out=(0, 1, 0))
        E.skin(k, deck, "trim", side, nu=4, nv=4, thick=0.01)
        # The blue apron: a narrow facet under the light that leans out to the crease, the broad side below it
        E.skin(k, FACET, "paint", side, nu=12, nv=1, thick=0.01, sharp=25)
        E.skin(k, APRON, "paint", side, nu=16, nv=10, thick=0.012, sharp=25)
        # The silver blade on the apron's trailing edge, a spike of it running forward over a dark scallop
        E.skin(k, E.Strip(APRON, [(0.95, 0.12), (0.87, 0.3), (0.85, 0.55), (0.88, 0.8), (0.95, 0.97)], [(0.995, 0.1), (0.995, 0.3), (0.995, 0.55), (0.995, 0.8), (0.995, 0.97)]),
               "silver", side, nu=10, nv=1, thick=0.008, lift=0.011)
        E.skin(k, E.Strip(APRON, [(0.5, 0.4), (0.88, 0.2)], [(0.5, 0.405), (0.88, 0.3)]), "silver", side, nu=4, nv=1, thick=0.008, lift=0.011)
        E.skin(k, E.Strip(APRON, [(0.52, 0.41), (0.87, 0.31)], [(0.66, 0.43), (0.87, 0.44)]), "paint_dark", side, nu=4, nv=1, thick=0.004, lift=0.009)
        # Black under the lamps, with an air slot, and the roof over the wheel
        lip = E.Patch([LIPC, C0] + E.piece(SILL, 0, 2)[1:] + E.piece(LOWER, 0, 1)[1:], LIP, [LIPC, LIP[0]], [LB, LB], out=(0.3, -0.2, 1))
        E.skin(k, lip, "trim", side, nu=8, nv=2, thick=0.01)
        k.keep = True
        E.skin(k, E.Strip(lip, [(0.12, 0.45), (0.4, 0.45)], [(0.12, 0.75), (0.4, 0.75)]), "vent", side, nu=2, nv=1, thick=0.003, lift=0.006)
        k.keep = False
        roof = E.Patch(ROOF, LIP + E.piece(LOWER, 1, 3)[1:], [LIP[0], LIP[0]], [(0, 0.642, 0.66), (0.1, 0.62, 0.665), (0.2, 0.5, 0.68)], out=(0, -1, 0))
        E.skin(k, roof, "trim", side, nu=8, nv=3, thick=0.008)
    # A black core behind the panels, so no gap between them shows daylight
    k.loft([(0.5, 0.67, 0.955, 0.235, 2.6, 2.6), (0.68, 0.675, 0.9, 0.165, 2.4, 2.4), (0.84, 0.69, 0.84, 0.085, 2.2, 2.2), (0.95, 0.7, 0.785, 0.022)], "trim", ring=12, steps=2)


def headlights(k):
    """The lights of the face: each side a lamp beside the beak, set into a dark housing under a
    clear lens, and one slim bright strip from the beak along the shoulder toward the mirror."""
    k.begin("headlight", (0, 0.8, 0.94))
    k.keep = True
    for side in (-1, 1):
        E.skin(k, LAMP, "housing", side, nu=4, nv=4, thick=0.006, lift=-0.012)
        E.skin(k, LIGHT, "housing", side, nu=10, nv=1, thick=0.006, lift=-0.004)
        # The reflector's cells and the lamp in them
        E.skin(k, E.Strip(LAMP, [(0.05, 0.34), (0.85, 0.3)], [(0.08, 0.95), (0.4, 0.95)]), "chrome", side, nu=4, nv=2, thick=0.004, lift=-0.008)
        E.skin(k, E.Strip(LAMP, [(0.12, 0.44), (0.5, 0.44)], [(0.14, 0.84), (0.3, 0.84)]), "headlight", side, nu=2, nv=2, thick=0.004, lift=-0.005)
        # The slim strip: across the lamp's top and on along the shoulder
        E.skin(k, E.Strip(LAMP, [(0.04, 0.06), (1.0, 0.03)], [(0.04, 0.28), (1.0, 0.14)]), "headlight", side, nu=4, nv=1, thick=0.004, lift=-0.004)
        E.skin(k, E.Strip(LIGHT, [(0.0, 0.15), (0.7, 0.2)], [(0.0, 0.85), (0.7, 0.8)]), "headlight", side, nu=8, nv=1, thick=0.004, lift=0.0)
        E.skin(k, LAMP, "glass", side, nu=4, nv=4, thick=0.003, lift=0.0)
    k.keep = False


def floor_x(z, y):
    """How far out the floor's side stands: tucked in toward the bottom."""
    v = min(1.0, max(0.0, (FLOOR + 0.005 - y) / 0.16))
    return 0.272 - 0.05 * v * v


def flank_x(z, y):
    """How far out the under-seat flank stands at a point of its side view: broadest a third of
    the way back, narrowing to the tail, a little rounded top to bottom, with a crease running
    up toward the tail under the blue: the face above it leans in, the face below stands upright."""
    u = min(1.0, max(0.0, -z / 1.08))
    mid = 0.4 + 0.33 * u
    v = min(1.0, max(0.0, (y - FLOOR) / 0.5))
    base = (0.2 + 0.04 * math.sin(math.pi * min(1.0, u * 1.7)) - 0.125 * u ** 2.2) * (1 - 0.1 * ((v - mid) / 0.6) ** 2)
    crease = 0.6 + max(0.0, -z - 0.1) * 0.25
    d = y - crease
    fade = min(1.0, max(0.0, (-z - 0.02) / 0.12)) * min(1.0, max(0.0, (1.05 + z) / 0.12))
    ridge = 0.02 * (max(0.0, 1 - d / 0.13) if d > 0 else max(0.0, 1 + d / 0.07))
    return base + ridge * fade


def bodywork(k):
    k.begin("body")

    face(k)

    # Inner leg shield behind the apron, black, with its glovebox lids, the
    # meter panel above it
    k.loft([(0.37, FLOOR, 0.96, 0.255, 3, 3, 0.4, 0.7, 1), (0.43, FLOOR, 1.0, 0.272, 3, 3, 0.4, 0.7, 1), (0.46, FLOOR + 0.02, 1.0, 0.278, 2.4, 2.4, 0.4, 0.7, 1)], "trim", ring=18, steps=1)
    k.box((0.34, 0.13, 0.04), (0, 1.035, 0.55), "trim", rot=(-1.0, 0, 0), bevel=0.012)
    k.box((0.26, 0.09, 0.004), (0, 1.045, 0.532), "dash", rot=(-1.0, 0, 0), bevel=0)
    for side in (-1, 1):
        k.box((0.12, 0.16, 0.01), (side * 0.13, 0.8, 0.366), "casing", rot=(-0.2, 0, 0), bevel=0.006)

    # The tall screen: clear, wider at its foot, its top corners rounded,
    # leaning back, on two black struts
    def screen(u, v):
        across = (v - 0.5) * 2
        x = across * (0.13 + 0.085 * min(1.0, u / 0.3) - 0.05 * u * u)
        return (x, 0.94 + 0.485 * u - 0.07 * u * across ** 4 + 0.9 * x * x * (1 - u), 0.875 - 0.405 * u ** 1.1 - (1.6 + 5.8 * (1 - u) ** 3) * x * x)

    k.sheet(screen, "glass", nu=8, nv=8, thick=0.005)
    # The screen's foot is masked black: with the panel under it, the dark centre between the blades

    def mask(u, v):
        x, y, z = screen(u * 0.2, v)
        return (x, y + 0.004, z + 0.004)

    k.sheet(mask, "gloss", nu=2, nv=8, thick=0.003)
    for side in (-1, 1):
        k.tube([(side * 0.1, 0.96, 0.7), (side * 0.105, 1.08, 0.665), (side * 0.1, 1.2, 0.585)], 0.011, "trim", seg=6, smooth=2)

    # Mirrors on thick black stalks from the fairing's shoulders, an
    # indicator strip in the front of each stalk
    for side in (-1, 1):
        root = (side * 0.2, 0.93, 0.62)
        elbow = (side * 0.29, 1.07, 0.6)
        head = (side * 0.36, 1.2, 0.56)
        k.tube([root, elbow, head], [0.034, 0.03, 0.026], "trim", seg=8, smooth=2)
        k.loft([(0.535, 1.165, 1.235, 0.05, 2.4, 2.4, 0.5, 1, 1, side * 0.385), (0.55, 1.15, 1.25, 0.085, 3.2, 3.2, 0.5, 1, 1, side * 0.385),
                (0.585, 1.155, 1.245, 0.08, 3.2, 3.2, 0.5, 1, 1, side * 0.385), (0.6, 1.17, 1.23, 0.055, 2.4, 2.4, 0.5, 1, 1, side * 0.385)], "trim", ring=12, steps=1)
        k.box((0.15, 0.085, 0.004), (side * 0.385, 1.2, 0.533), "chrome", bevel=0)
        k.keep = True
        k.box((0.085, 0.022, 0.012), (side * 0.3, 1.09, 0.624), "signal", rot=(-0.25, 0, side * 0.95), bevel=0.004)
        k.keep = False

    # The low tunnel between the boards, black, rising to the seat's front
    k.loft([
        (0.42, FLOOR, 0.72, 0.1, 3, 3),
        (0.3, FLOOR, 0.56, 0.105, 3, 3),
        (0.14, FLOOR, 0.5, 0.105, 3, 3),
        (0.02, FLOOR, 0.56, 0.12, 3, 3),
        (-0.06, FLOOR + 0.02, 0.68, 0.14),
    ], "trim", ring=14, steps=2)

    # Floor: the boards on top, flat, with rubber mats, their front ends
    # sloping up into the leg shield for the feet-forward position; the
    # floor's sides drop to a dark grained panel with a silver rail under it
    for side in (-1, 1):
        x = side * 0.185
        k.box((0.17, 0.02, 0.42), (x, FLOOR - 0.008, 0.06), "trim", bevel=0.006)
        k.box((0.17, 0.02, 0.2), (x, FLOOR + 0.05, 0.34), "trim", rot=(-0.62, 0, 0), bevel=0.006)
        if not k.low:
            for dx in (-0.05, 0.0, 0.05):
                k.box((0.03, 0.006, 0.38), (x + dx, FLOOR + 0.004, 0.05), "rubber", bevel=0)
                k.box((0.03, 0.006, 0.16), (x + dx, FLOOR + 0.061, 0.338), "rubber", rot=(-0.62, 0, 0), bevel=0)

        E.coons(k, [(0.46, FLOOR + 0.005), (0.2, FLOOR), (-0.1, FLOOR)], [(0.42, 0.185), (0.1, 0.17), (-0.16, 0.2)],
                [(0.46, FLOOR + 0.005), (0.44, 0.26), (0.42, 0.185)], [(-0.1, FLOOR), (-0.13, 0.27), (-0.16, 0.2)],
                lambda u, v, z, y, side=side: side * floor_x(z, y), "grain", nu=10, nv=5, thick=0.012)
        E.band(k, [(0.44, 0.222), (0.1, 0.205), (-0.15, 0.235), (-0.3, 0.33)], [(0.435, 0.19), (0.1, 0.172), (-0.16, 0.2), (-0.32, 0.29)], floor_x, side, "silver",
               nu=10, lift=0.009, thick=0.008)
    # Under the floor, between the skirts
    k.box((0.42, 0.1, 0.56), (0, 0.235, 0.14), "trim", bevel=0.02)

    # Under-seat body: a flank each side from the floor's rear up and back to
    # the tail, its lower edge climbing away from the engine and the rear
    # wheel. Blue above, along the seat; a silver sweep under the blue at the
    # front; black below and to the rear.
    top = [(0.03, 0.7), (-0.2, 0.715), (-0.45, 0.755), (-0.7, 0.815), (-0.95, 0.875), (-1.06, 0.89)]
    rear = [(-1.06, 0.89), (-1.09, 0.85), (-1.07, 0.8)]
    bottom = [(-0.06, FLOOR), (-0.17, 0.35), (-0.32, 0.44), (-0.55, 0.57), (-0.8, 0.68), (-1.07, 0.8)]
    front = [(0.03, 0.7), (-0.02, 0.53), (-0.06, FLOOR)]
    low = [(-0.03, 0.47), (-0.24, 0.5), (-0.45, 0.585), (-0.66, 0.69), (-0.86, 0.775), (-1.07, 0.84)]

    for side in (-1, 1):
        E.coons(k, top, bottom, front, rear, lambda u, v, z, y, side=side: side * flank_x(z, y), "paint", nu=28, nv=18, thick=0.01, sharp=20)
        E.band(k, low, bottom, flank_x, side, "trim", nu=18, nv=3, lift=0.009, thick=0.006)
        E.band(k, [(0.0, 0.645), (-0.2, 0.62), (-0.42, 0.655), (-0.6, 0.72), (-0.72, 0.78)], [(-0.03, 0.47), (-0.24, 0.5), (-0.45, 0.585), (-0.6, 0.665), (-0.72, 0.765)],
               flank_x, side, "silver", nu=14, nv=3, lift=0.011, thick=0.008)
        # A dark vent in the black, over the engine
        E.band(k, [(-0.3, 0.5), (-0.44, 0.555), (-0.56, 0.615)], [(-0.31, 0.46), (-0.44, 0.51), (-0.56, 0.59)], flank_x, side, "vent", nu=6, lift=0.014, thick=0.004)
    # The top under the seat and the inner tub, closing the flanks
    k.loft([(0.03, 0.64, 0.71, 0.19), (-0.2, 0.655, 0.725, 0.225, 3, 3), (-0.45, 0.69, 0.765, 0.22, 3, 3), (-0.7, 0.755, 0.825, 0.18, 3, 3),
            (-0.95, 0.815, 0.88, 0.1, 3, 3), (-1.06, 0.83, 0.892, 0.03)], "paint", ring=16, steps=2)
    k.loft([(-0.1, 0.4, 0.66, 0.15, 3, 3), (-0.3, 0.48, 0.7, 0.165, 3, 3), (-0.55, 0.6, 0.75, 0.155, 3, 3), (-0.8, 0.69, 0.8, 0.115, 3, 3), (-1.0, 0.76, 0.82, 0.05)],
           "trim", ring=14, steps=2)
    # Tail: a plate hanger with a blank plate and the rear indicators, the
    # hugger over the tyre
    k.beam((0, 0.79, -0.98), (0, 0.56, -1.07), (0.06, 0.02), "trim")
    E.plate(k, (0, 0.51, -1.085), size=(0.2, 0.14), lean=0.2)
    for side in (-1, 1):
        E.indicator(k, (side * 0.03, 0.66, -1.03), (side * 0.13, 0.665, -1.04), radius=0.01)
    k.guard((REAR[1], REAR[2]), REAR_R + 0.03, 0.16, math.radians(50), math.radians(118), "trim", crown=0.03, nu=8)

    # The long stepped seat, black: the rider's part low and dished, a hump
    # behind the rider's hips, the pillion part higher
    k.loft([(0.06, 0.7, 0.745, 0.1), (0.0, 0.705, 0.775, 0.16, 3, 3), (-0.18, 0.72, 0.785, 0.2, 3, 3), (-0.34, 0.74, 0.8, 0.2, 3, 3), (-0.44, 0.76, 0.865, 0.185, 3, 3),
            (-0.5, 0.78, 0.875, 0.17)], "seat", ring=16, steps=3)
    k.loft([(-0.48, 0.79, 0.875, 0.17), (-0.56, 0.795, 0.885, 0.185, 3, 3), (-0.78, 0.83, 0.905, 0.155, 3, 3), (-0.93, 0.86, 0.915, 0.095)], "pillion", ring=16, steps=2)
    # The grab rail: an arm along each side of the pillion seat, joined behind it
    for side in (-1, 1):
        k.tube([(side * 0.2, 0.8, -0.62), (side * 0.215, 0.87, -0.78), (side * 0.17, 0.925, -0.96), (side * 0.07, 0.935, -1.03), (0, 0.935, -1.04)], 0.016, "trim",
               seg=7, smooth=2)


def drivetrain(k):
    k.begin("body")
    # The engine swings with the rear wheel: its cylinder laid forward under
    # the floor's rear, the crankcase behind it, only their undersides showing
    k.loft([(0.02, 0.17, 0.33, 0.11, 3, 3), (-0.08, 0.15, 0.36, 0.15, 3, 3), (-0.26, 0.16, 0.4, 0.16, 3, 3), (-0.36, 0.2, 0.4, 0.13)], "casing", ring=14, steps=2)
    # The belt case on the left, a long black casting from the crankcase to
    # the rear axle, its cover ribbed toward the pulley's bulge
    left = -0.13
    k.loft([(PIVOT[1] + 0.03, 0.2, 0.4, 0.035, 3, 3, 0.5, 1, 1, left), (PIVOT[1] - 0.1, 0.19, 0.41, 0.04, 3, 3, 0.5, 1, 1, left),
            (REAR[2] + 0.15, 0.19, 0.37, 0.035, 3, 3, 0.5, 1, 1, left), (REAR[2] - 0.04, 0.21, 0.35, 0.03, 3, 3, 0.5, 1, 1, left)], "casing", ring=14, steps=2)
    k.loft([(PIVOT[1] - 0.02, 0.23, 0.38, 0.02, 3, 3, 0.5, 1, 1, left - 0.045), (PIVOT[1] - 0.12, 0.22, 0.39, 0.022, 3, 3, 0.5, 1, 1, left - 0.05),
            (REAR[2] + 0.12, 0.22, 0.36, 0.02, 3, 3, 0.5, 1, 1, left - 0.05), (REAR[2] + 0.04, 0.24, 0.34, 0.015, 3, 3, 0.5, 1, 1, left - 0.045)], "dark_metal",
           ring=12, steps=2)
    k.lathe([(0, 0), (0.115, 0), (0.115, 0.015), (0.088, 0.03), (0, 0.032)], (left - 0.06, REAR[1], REAR[2]), "dark_metal", axis="x", rot=(0, 0, math.pi), seg=20)
    # The air cleaner box over the belt case
    k.loft([(-0.36, 0.4, 0.5, 0.035, 3, 3, 0.5, 1, 1, left - 0.04), (-0.5, 0.4, 0.53, 0.045, 3, 3, 0.5, 1, 1, left - 0.045),
            (-0.72, 0.42, 0.54, 0.04, 3, 3, 0.5, 1, 1, left - 0.045), (-0.8, 0.44, 0.52, 0.03, 3, 3, 0.5, 1, 1, left - 0.04)], "trim", ring=12, steps=2)
    # The slim arm on the right, from the crankcase to the axle
    k.rod((0.13, 0.3, -0.4), (0.13, REAR[1] - 0.01, REAR[2] + 0.02), 0.022, "alu", seg=8)
    k.box((0.04, 0.06, 0.08), (0.13, REAR[1], REAR[2]), "alu", bevel=0.01)
    k.rod((-0.16, PIVOT[0], PIVOT[1]), (0.16, PIVOT[0], PIVOT[1]), 0.025, "dark_metal", seg=10)
    k.rod((-0.15, REAR[1], REAR[2]), (0.15, REAR[1], REAR[2]), 0.014, "steel", seg=8)
    # Rear caliper on the right, high behind the axle, on a bracket from the arm
    E.caliper(k, (RDISC_X, REAR[1], REAR[2]), RDISC_R, math.radians(158), size=(0.045, 0.05, 0.09))
    k.beam((0.115, REAR[1] + 0.01, REAR[2] - 0.02), (0.11, REAR[1] + 0.05, REAR[2] - 0.095), (0.012, 0.035), "alu")
    # Twin shocks, black springs: from the belt case and the right arm up to the frame
    for x in (left - 0.035, 0.165):
        parts.shock(k, (x, 0.36, REAR[2] + 0.03), (x, 0.66, REAR[2] + 0.15), 0.028)
    # Exhaust: the header under the engine, back along the right to a black
    # silencer angled up toward the tail, a silver heat shield over its outer
    # side, a black end cap
    k.tube([(0.04, 0.2, 0.0), (0.09, 0.16, -0.12), (0.14, 0.19, -0.3), (0.2, 0.27, -0.42)], 0.022, "steel_dark", seg=8, smooth=2)

    def can(u, up, side):
        if 0.3 < u < 0.78 and side > 0.3 and up > -0.1:
            return "silver"
        return "can"

    k.loft([(-0.4, 0.25, 0.32, 0.035, 3, 3, 0.5, 1, 1, 0.2), (-0.48, 0.24, 0.41, 0.07, 3.4, 3.4, 0.5, 0.85, 1, 0.215),
            (-0.9, 0.36, 0.55, 0.075, 3.4, 3.4, 0.5, 0.85, 1, 0.225), (-0.97, 0.4, 0.55, 0.055, 3, 3, 0.5, 1, 1, 0.225)], can, ring=16, steps=2)
    k.cylinder(0.024, 0.02, (0.225, 0.48, -0.975), "steel_dark", axis="z", seg=10)
    # Centre stand folded under, the side stand folded on the left
    for side in (-1, 1):
        k.rod((side * 0.11, 0.21, -0.2), (side * 0.15, 0.14, -0.42), 0.012, "steel_dark", seg=6)
    k.side_stand((-0.17, 0.21, 0.0), (-0.3, 0.02, 0.04), 0.011, "steel_dark", seg=6)


def draw(k):
    wheels(k)
    front_end(k)
    bodywork(k)
    drivetrain(k)


def build():
    k = E.EKit(seed=114, colours=COLOURS, extra=EXTRA)
    k.colours["paint"] = (COLOURS["paint"], 0.3, 0.55)
    for lod in E.LODS:
        k.level(lod)
        draw(k)
    k.finish_lods(OUT, {"grip": GRIP, "peg": PEG, "seat": SEAT})
    # The owner's photo is taken from the front right, a little above the bars
    d = 4.9
    E.previews(k, NAME, height=0.66, reach=1.0, extra={"photo": ((-d * 0.5, 1.55, d * 0.62), (0, 0.6, 0.1))})


build()
