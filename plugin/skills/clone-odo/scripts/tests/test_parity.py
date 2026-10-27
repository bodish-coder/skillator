import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr

from _load import load, TEMPLATES

parity = load("parity")

MATRIX = """feature,area,priority,original,clone,notes
Pick a time slot,booking page,must,yes,yes,
Confirmation email,booking page,must,yes,partial,no calendar file yet
Reschedule link,booking page,must,yes,no,
Round-robin across a team,team,should,yes,no,
Custom booking questions,booking page,should,yes,yes,
Embed on a website,sharing,could,yes,no,
Their partner marketplace,integrations,could,yes,skip,their network not ours
SMS reminders,notifications,should,no,yes,ours: the top request in reviews
"""


def write(d, name, text):
    path = os.path.join(d, name)
    with open(path, "w") as fh:
        fh.write(text)
    return path


class Score(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = write(self.tmp.name, "features.csv", MATRIX)

    def tearDown(self):
        self.tmp.cleanup()

    def test_weighted_score(self):
        r = parity.score(parity.load(self.path))
        # counted weights: 3+3+3+2+2+1 = 14, earned: 3 + 1.5 + 0 + 0 + 2 + 0 = 6.5
        self.assertAlmostEqual(r["feature_score"], round(100 * 6.5 / 14, 1))
        self.assertEqual(r["counted"], 6)
        self.assertEqual((r["must_have_done"], r["must_have_total"]), (1, 3))

    def test_skip_and_extras_are_not_scored_but_listed(self):
        r = parity.score(parity.load(self.path))
        self.assertEqual([m["feature"] for m in r["skipped"]], ["Their partner marketplace"])
        self.assertEqual([m["feature"] for m in r["extras"]], ["SMS reminders"])

    def test_missing_is_in_build_order(self):
        r = parity.score(parity.load(self.path))
        order = [m["feature"] for m in r["missing"]]
        self.assertEqual(order[0], "Reschedule link")          # must, not started
        self.assertEqual(order[1], "Confirmation email")       # must, partial
        self.assertEqual(order[2], "Round-robin across a team")
        self.assertEqual(order[-1], "Embed on a website")
        self.assertEqual(r["missing"][0]["priority"], "must")

    def test_weakest_area_first(self):
        r = parity.score(parity.load(self.path))
        self.assertEqual(r["by_area"][0]["score"], 0.0)
        self.assertIn(r["by_area"][0]["area"], ("team", "sharing"))

    def test_render_says_not_shippable(self):
        r = parity.combine(parity.score(parity.load(self.path)), [])
        text = parity.render(r)
        self.assertIn("Not shippable yet: 2 must-have", text)
        self.assertIn("their network not ours", text)

    def test_visual_folds_in_at_20_percent(self):
        d = self.tmp.name
        v1 = write(d, "a.json", json.dumps({"score": 80.0, "mode": "layout",
                                            "files": {"clone": "clone/home.png"}}))
        v2 = write(d, "b.json", json.dumps({"score": 60.0, "mode": "layout"}))
        r = parity.combine(parity.score(parity.load(self.path)),
                           parity.visual_scores([v1, v2]))
        self.assertEqual(r["layout_score"], 70.0)
        self.assertAlmostEqual(r["overall"], round(0.8 * r["feature_score"] + 14.0, 1))

    def test_bad_values_are_reported_not_fatal(self):
        p = write(self.tmp.name, "bad.csv",
                  "feature,priority,clone\nThing,urgent,maybe\n")
        r = parity.score(parity.load(p))
        self.assertEqual(len(r["problems"]), 2)
        self.assertEqual(r["feature_score"], 0.0)

    def test_missing_column_is_an_error(self):
        p = write(self.tmp.name, "nocol.csv", "feature,area\nx,y\n")
        with redirect_stderr(io.StringIO()):
            self.assertEqual(parity.main([p]), 2)

    def test_cli_fail_under(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(parity.main([self.path, "--fail-under", "80"]), 1)
            # 2 must-haves not done: under the ship bar at any N (clone-odo change)
            self.assertEqual(parity.main([self.path, "--fail-under", "10"]), 1)

    def test_fail_under_is_the_feature_score_not_overall(self):
        # features 75 (must yes 3 + could no 1 = 3/4) + layout 100 -> overall 80;
        # the ship bar reads the feature score, so 80 fails (deliberate, see UPSTREAM.md).
        d = self.tmp.name
        m = write(d, "f75.csv", "feature,area,priority,original,clone,notes\n"
                  "Pick a slot,booking,must,yes,yes,\nEmbed,sharing,could,yes,no,\n")
        v = write(d, "v.json", json.dumps({"score": 100.0, "mode": "layout"}))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(parity.main([m, "--visual", v, "--fail-under", "80"]), 1)
            self.assertEqual(parity.main([m, "--visual", v, "--fail-under", "75"]), 0)

    def test_fail_under_fails_on_a_missing_must_have(self):
        rows = "".join("M%d,a,must,yes,yes,\n" % i for i in range(5))
        p = write(self.tmp.name, "m.csv", "feature,area,priority,original,clone,notes\n"
                  + rows + "Last,a,must,yes,no,\n")          # 15/18 = 83.3
        with redirect_stdout(io.StringIO()):
            self.assertEqual(parity.main([p, "--fail-under", "80"]), 1)

    def test_ticket_column_is_ignored_and_template_has_it(self):
        p = write(self.tmp.name, "t.csv",
                  "feature,area,priority,original,clone,ticket,notes\n"
                  "Pick a slot,booking,must,yes,yes,F12,\n")
        r = parity.score(parity.load(p))
        self.assertEqual(r["feature_score"], 100.0)
        self.assertEqual(r["problems"], [])
        with open(os.path.join(TEMPLATES, "features.csv"), newline="") as fh:
            self.assertEqual(fh.readline().strip(),
                             "feature,area,priority,original,clone,ticket,notes")

    def test_shipped_template_parses(self):
        path = os.path.join(TEMPLATES, "features.csv")
        r = parity.score(parity.load(path))
        self.assertGreater(r["counted"], 0)
        self.assertEqual(r["problems"], [])


    def test_tagged_visuals_and_mixed_platforms(self):
        paths = [write(self.tmp.name, name + ".json", json.dumps({
            "score": 80, "platform": {"name": name}})) for name in ("android", "ios")]
        visuals = parity.visual_scores(paths)
        for report_platform, selected, warnings in (("android", visuals[:1], 0),
                ("web", visuals[:1], 1), (None, visuals, 1), (None, visuals[:1], 0)):
            with self.subTest(platform=report_platform, count=len(selected)):
                r = parity.combine(parity.score(parity.load(self.path)), selected, report_platform)
                self.assertEqual(len(r["problems"]), warnings)
                self.assertIn("android", parity.render(r).split("Screens")[1])
                if report_platform:
                    self.assertEqual(r["platform"], report_platform)
                    self.assertIn("  (" + report_platform + ")", parity.render(r).splitlines()[0])
                else:
                    self.assertNotIn("platform", r)

    def test_legacy_visual_json_and_text_are_exact(self):
        m = write(self.tmp.name, "done.csv", "feature,area,priority,original,clone,notes\nSlot,booking,must,yes,yes,\n")
        expected = {"feature_score": 100.0, "counted": 1, "must_have_done": 1,
                    "must_have_total": 1, "by_area": [{"area": "booking", "score": 100.0, "features": 1}],
                    "missing": [], "skipped": [], "extras": [], "problems": [],
                    "visual": [{"file": "home.png", "score": 80.0, "mode": "layout"}],
                    "layout_score": 80.0, "overall": 96.0}
        expected_text = ("Parity: 96.0 / 100\n\nfeatures 100.0  (1 counted, must-haves 1 of 1 done)\n"
                         "layout   80.0  (1 screens compared)\n\nBy area, weakest first\n"
                         "- booking                      100.0  (1 features)\n\nMissing, in build order\n"
                         "- nothing. Every counted feature is done.\n\nScreens\n"
                         "- home.png                                  80.0")
        for metadata in ({}, {"platform": None}, {"platform": {}}, {"platform": {"name": ""}}):
            v = write(self.tmp.name, "legacy.json", json.dumps(dict(
                {"score": 80, "mode": "layout", "files": {"clone": "home.png"}}, **metadata)))
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(parity.main([m, "--visual", v, "--json"]), 0)
            self.assertEqual(buf.getvalue(), json.dumps(expected, indent=2) + "\n")
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(parity.main([m, "--visual", v]), 0)
            self.assertEqual(buf.getvalue(), expected_text + "\n")

    def test_platform_warning_does_not_change_ship_bar(self):
        m = write(self.tmp.name, "done.csv", "feature,priority,clone\nSlot,must,yes\n")
        v = write(self.tmp.name, "android.json", json.dumps({"score": 0, "platform": {"name": "android"}}))
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(parity.main([m, "--visual", v, "--platform", "web", "--fail-under", "100", "--json"]), 0)
            self.assertEqual(parity.main([self.path, "--platform", "android", "--fail-under", "10"]), 1)
        self.assertIn("one platform per", buf.getvalue())
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
            parity.main([m, "--platform", "mac"])
        self.assertEqual(ctx.exception.code, 2)
        self.assertEqual(parity.PLATFORMS, ("android", "ios", "web", "windows"))


if __name__ == "__main__":
    unittest.main()
