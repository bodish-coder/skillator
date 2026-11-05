import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest import mock

from _load import load

sweep = load("sweep")


def put(root, rel, text, binary=False):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb" if binary else "w") as fh:
        fh.write(text)
    return path


class Sweep(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.root = self.tmp.name
        put(r, "src/app/page.tsx", "export default function Page() {\n"
                                   "  return <h1>Slotwise</h1>\n}\n")
        put(r, "src/components/CalendlyEmbed.tsx", "// left over\n")
        put(r, "src/lib/copy.ts", "export const hero = 'The calendly alternative'\n")
        put(r, "src/styles/tokens.css", ":root { --accent: #006BFF; --bg: #fff; }\n")
        put(r, "src/lib/links.ts", "const help = 'https://help.calendly.com/x'\n")
        put(r, "src/lib/team.ts", "export const AcuitySchedulingSync = 1\n")
        put(r, ".skillator/clone/recon.md", "# Recon: Calendly\n")
        put(r, "node_modules/x/index.js", "calendly\n")
        put(r, "public/logo.png", b"\x89PNG\0calendly", binary=True)
        put(r, "package-lock.json", '{"calendly": 1}\n')

    def tearDown(self):
        self.tmp.cleanup()

    def run_sweep(self, **kw):
        return sweep.sweep(self.root, avoid=["Calendly", "Acuity Scheduling"],
                           domains=["calendly.com"], colors=["#006bff"], **kw)

    def test_finds_names_paths_domains_and_colours(self):
        hits = self.run_sweep()
        kinds = {(h["kind"], os.path.basename(h["file"].rstrip("/"))) for h in hits}
        self.assertIn(("path", "CalendlyEmbed.tsx"), kinds)
        self.assertIn(("name", "copy.ts"), kinds)
        self.assertIn(("domain", "links.ts"), kinds)
        self.assertIn(("color", "tokens.css"), kinds)
        self.assertIn(("name", "team.ts"), kinds)   # AcuitySchedulingSync

    def test_skips_planning_folder_deps_locks_and_binaries(self):
        files = {h["file"] for h in self.run_sweep()}
        self.assertFalse(any(f.startswith(".skillator") for f in files))
        self.assertFalse(any("node_modules" in f for f in files))
        self.assertNotIn("package-lock.json", files)
        self.assertNotIn(os.path.join("public", "logo.png"), files)
        self.assertNotIn(os.path.join("src", "app", "page.tsx"), files)

    def test_include_planning(self):
        files = {h["file"] for h in self.run_sweep(include_planning=True)}
        self.assertIn(os.path.join(".skillator", "clone", "recon.md"), files)

    def test_a_folder_named_replica_is_swept(self):
        put(self.root, "replica/leftover.ts", "export const CalendlyWidget = 1\n")
        files = {h["file"] for h in self.run_sweep()}
        self.assertIn(os.path.join("replica", "leftover.ts"), files)

    def test_short_hex_matches_long(self):
        put(self.root, "src/a.css", "a { color: #06f }\n")
        hits = sweep.sweep(self.root, colors=["#0066FF"])
        self.assertTrue(any(h["file"].endswith("a.css") for h in hits))

    def test_cli_exit_codes_and_config(self):
        cfg = put(self.root, "brand.json", json.dumps({"avoid": ["Calendly"]}))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(sweep.main([self.root, "--config", cfg]), 1)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(sweep.main([self.root, "--avoid", "Calendly", "--include-planning"]), 1)
        clean = tempfile.mkdtemp(dir=self.root)
        put(clean, "index.html", "<h1>Slotwise</h1>")
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(sweep.main([clean, "--avoid", "Calendly"]), 0)
        self.assertIn("Clean", buf.getvalue())
        with redirect_stderr(io.StringIO()):
            self.assertEqual(sweep.main([clean]), 2)

    def test_invalid_or_inaccessible_roots_and_unreadable_files_fail(self):
        missing = os.path.join(self.root, "does-not-exist")
        file_target = put(self.root, "single.txt", "clean text\n")

        with self.assertRaises(FileNotFoundError):
            sweep.sweep(missing, avoid=["Calendly"])
        with self.assertRaises(NotADirectoryError):
            sweep.sweep(file_target, avoid=["Calendly"])

        for bad_target in (missing, file_target):
            out, err = io.StringIO(), io.StringIO()
            with redirect_stdout(out), redirect_stderr(err):
                self.assertEqual(sweep.main([bad_target, "--avoid", "Calendly"]), 2)
            self.assertNotIn("Clean", out.getvalue())
            self.assertIn("incomplete", err.getvalue().lower())

        clean = tempfile.mkdtemp(dir=self.root)
        secret = put(clean, "src/secret.ts", "export const ok = 1\n")

        def walk_with_error(top, onerror=None, **kw):
            if onerror is not None:
                onerror(PermissionError(13, "Permission denied", os.path.join(top, "locked")))
            return iter(())

        with mock.patch.object(sweep.os, "walk", side_effect=walk_with_error):
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(sweep.main([clean, "--avoid", "Calendly"]), 2)
            self.assertNotIn("Clean", out.getvalue())
            self.assertIn("Incomplete sweep", out.getvalue())

        real_open = open

        def deny_secret(path, *args, **kwargs):
            if os.path.abspath(path) == os.path.abspath(secret):
                raise PermissionError(13, "Permission denied", path)
            return real_open(path, *args, **kwargs)

        with mock.patch("builtins.open", side_effect=deny_secret):
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(sweep.main([clean, "--avoid", "Calendly"]), 2)
            self.assertNotIn("Clean", out.getvalue())
            self.assertIn("Incomplete sweep", out.getvalue())


if __name__ == "__main__":
    unittest.main()
