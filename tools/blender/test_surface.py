# The surface layers' maths and switches (surface.py), with no Blender: python3 -m unittest tools/blender/test_surface.py
# (tests/unit/surface-layers.test.js runs it with the jest suite).
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface as S  # noqa: E402

# A ridge: a point on a convex edge with two neighbours falling away below it, and a crease the other way up
RIDGE = [(0.0, 0.0, 0.0), (0.1, -0.1, 0.0), (-0.1, -0.1, 0.0)]
CREASE = [(0.0, 0.0, 0.0), (0.1, 0.1, 0.0), (-0.1, 0.1, 0.0)]
UP = (0.0, 1.0, 0.0)
AROUND = [[1, 2], [0], [0]]


def stored(kind, steps, shade=0.8, point=(0.3, 0.6, 0.1), convex=0.0, **settings):
    cfg = S.config(steps, env="", **settings)
    return S.layer(point, UP, shade, convex, kind, cfg)


class Switches(unittest.TestCase):
    def test_no_step_leaves_the_occlusion(self):
        rgb, turn = stored("paint", [])
        self.assertEqual(rgb, (0.8, 0.8, 0.8))
        self.assertEqual(turn, (0.0, 0.0, 0.0))

    def test_default_is_every_step_a_vertex_colour_carries(self):
        self.assertEqual(S.config(env="")["on"], ("tone", "speckle", "cavity", "bump", "wear", "dirt"))

    def test_each_step_changes_something_alone(self):
        for step, kw in (("tone", {}), ("speckle", {}), ("cavity", {"convex": -0.7}), ("wear", {"convex": 0.7}), ("dirt", {"point": (0.0, 0.05, 0.0)})):
            rgb, _ = stored("paint", [step], **kw)
            self.assertNotEqual(rgb, (0.8, 0.8, 0.8), step)
        _, turn = stored("paint", ["bump"])
        self.assertNotEqual(turn, (0.0, 0.0, 0.0))

    def test_unlayered_finishes_keep_the_occlusion(self):
        for name in ("headlight", "brake", "scuff_plastic", "tape", "glass"):
            self.assertEqual(S.kind_of(name, 0.5, 0.0), "none")
            rgb, _ = stored("none", list(S.config(env="")["on"]), convex=0.7)
            self.assertEqual(rgb, (0.8, 0.8, 0.8))

    def test_roughness_is_refused_on_vertex_colours(self):
        with self.assertRaises(ValueError):
            stored("paint", ["roughness"])

    def test_unknown_steps_and_settings_are_refused(self):
        with self.assertRaises(ValueError):
            S.config(["shine"], env="")
        with self.assertRaises(ValueError):
            S.config(env="wear.colour_of=2")
        with self.assertRaises(ValueError):
            S.config(env="-shine")

    def test_environment_switches(self):
        self.assertEqual(S.config(env="tone,wear")["on"], ("tone", "wear"))
        self.assertNotIn("speckle", S.config(env="-speckle")["on"])
        cfg = S.config(env="-speckle;wear.amount=0.3")
        self.assertEqual(cfg["values"]["wear"]["amount"], 0.3)
        self.assertNotIn("speckle", cfg["on"])


class Maths(unittest.TestCase):
    def test_noise_is_smooth_bounded_and_fixed(self):
        values = [S.noise((x * 0.013, 0.2, 0.7), 0.3, 5) for x in range(400)]
        self.assertTrue(all(0.0 <= v <= 1.0 for v in values))
        self.assertLess(max(abs(a - b) for a, b in zip(values, values[1:])), 0.1)
        self.assertEqual(S.noise((0.1, 0.2, 0.3), 0.3, 5), S.noise((0.1, 0.2, 0.3), 0.3, 5))
        self.assertNotEqual(S.noise((0.1, 0.2, 0.3), 0.3, 5), S.noise((0.1, 0.2, 0.3), 0.3, 6))

    def test_speckle_stays_in_its_band(self):
        for x in range(50):
            rgb, _ = stored("paint", ["speckle"], shade=1.0, point=(x * 0.031, 0.5, 0.0))
            self.assertTrue(0.9 - 1e-9 <= rgb[0] <= 1.08 + 1e-9)

    def test_convexity_sign(self):
        self.assertGreater(S.convexity(RIDGE, [UP] * 3, AROUND)[0], 0.5)
        self.assertLess(S.convexity(CREASE, [UP] * 3, AROUND)[0], -0.5)

    def test_wear_lightens_edges_and_cavity_darkens_creases(self):
        edge, _ = stored("paint", ["wear"], convex=0.7)
        crease, _ = stored("paint", ["cavity"], convex=-0.7)
        flat_wear, _ = stored("paint", ["wear"], convex=0.0)
        self.assertGreater(edge[0], 0.8)
        self.assertLess(crease[0], 0.8)
        self.assertEqual(flat_wear, (0.8, 0.8, 0.8))
        metal, _ = stored("metal", ["wear"], convex=0.7, point=(0.0, 0.5, 0.0))
        paint, _ = stored("paint", ["wear"], convex=0.7, point=(0.0, 0.5, 0.0))
        self.assertGreater(metal[0], paint[0])

    def test_dirt_only_low_down(self):
        high, _ = stored("paint", ["dirt"], point=(0.0, 0.9, 0.0))
        low, _ = stored("paint", ["dirt"], point=(0.0, 0.05, 0.0))
        self.assertEqual(high, (0.8, 0.8, 0.8))
        self.assertLess(low[2], low[0])

    def test_bump_turns_across_the_normal_only(self):
        _, turn = stored("paint", ["bump"])
        self.assertAlmostEqual(sum(t * n for t, n in zip(turn, UP)), 0.0)

    def test_lift_keeps_the_mean_and_stays_under_one(self):
        self.assertEqual(S.lift((0.5, 0.1, 0.1), 1.15), 1.15)
        self.assertAlmostEqual(S.lift((0.95, 0.9, 0.9), 1.15), 1 / 0.95)
        self.assertEqual(S.lift((1.0, 1.0, 1.0), 1.15), 1.0)
        colours, normals = S.surface([(0.0, 0.6, 0.0)], [UP], [0.9], [[]], ["paint"], S.config([], env=""), lifts=[1.15])
        self.assertAlmostEqual(colours[0][0] * 1.15, 0.9)
        self.assertTrue(all(c <= 1.0 for c in colours[0]))
        self.assertEqual(normals[0], UP)


if __name__ == "__main__":
    unittest.main()
