grade: bounded · critical no · design deep=fable · build build=opus · verify build=opus · ceremony full (inside RUN-0023) · mode single (ruled: one relay stage) · usage unobservable

# F114 — clone-odo for web, Android, iOS and Windows apps

GOAL: clone-odo loads from its description for a clone request on any of the four platforms (web, Android, iOS, Windows, each with its store link), keeps A157's rewrite-A review words, and its recon, parity and imgdiff carry a platform with a named capture route and viewport — clean-room rules untouched, no new dependency, no new script.

CHOSEN: description D (rewrite A with four platform names and the three store names folded in, two clone phrases dropped, 80 words by the awk count); a `PLATFORMS` table in `imgdiff.py` (name → default capture viewport + route) exposed as `--platform` on `imgdiff` and `parity` (recorded in the report, orientation-checked, mixed platforms a listed problem); a `## Capture` table in `references/recon.md` that names the capture route, default viewport and store listing per platform (iOS on a Windows/Linux host: no simulator — listing screenshots or the user's own device shots, said in one line); the upstream stack table re-absorbed as four platform rows in `references/handoffs.md` § Build with a Windows row of our own (Tauri over the web clone, Q-F114-1); four `scenario-clone-odo-platform-*.txt` files plus `green-clone-odo-platforms.txt`, run by the orchestrator on the trimmed host; A157 closed by an appendix to `green-clone-odo-a157.txt`.

## DESIGN

**Classification: bounded.** Every flow this touches exists in the repo to read — SKILL.md's description, `references/recon.md` § Step 1 ("web, iOS, Android, desktop"), `references/parity.md` § Step 2 (the 1440x900 / 390x844 line), `imgdiff.py`'s report dict, `parity.py`'s `--visual` fold-in, the `odo` fixture and the A157 driver. Nothing new is structured; the design file exists because the build spans a commit, an owner-run verification and a second commit.

### 1. The description (SKILL.md frontmatter)

Rewrite A measured 1/1 on the 62-skill host (`green-clone-odo-a157.txt` run t3), the original 0/2. The ticket wants A's review words kept and the four platforms plus their store links named, in ≤ 80 words by `awk '/^description:/{f=1;next} f&&/^---/{exit} f' SKILL.md | wc -w` (the F108/A157 count). A is already 80, so words must come out of the clone-phrase list to make room. Description D, exactly:

```
Use before quoting or counting what users hate about an app - top complaints
from a reviews.csv or .skillator/clone/, a quote and count each, for an
investor or pitch, or review rows lacking a link. "Clone this app" (web,
Android, iOS, Windows), "build my own version of X", "map X's screens", "how
close is my clone", "rebrand the clone", or its URL, App Store, Google Play
or Microsoft Store link. NOT for building screens (build-jarvis,
design-arwen) or shipping (deploy-merlin, deploy-niyoj).
```

80 words (measured on the flat text: 81 with a leading "Also", so "Also" goes). Kept verbatim from A: the whole review sentence ("Use before quoting or counting what users hate about an app … or review rows lacking a link"), "clone this app", "build my own version of X", "map X's screens", "how close is my clone", "rebrand the clone", both NOT clauses. Dropped: "reverse engineer X" (the skill forbids decompiling — `clean-room.md` — so the phrase invites the wrong reading) and "is anything of the original left" (the sweep is reached from the body once the skill is in a clone project; "rebrand the clone" is the stage that runs it). Added: `(web, Android, iOS, Windows)` after the clone phrase, and the three store names where A had "store link". Still triggers only, third person, no step list (skill-smith §2).

### 2. Platform in the tools (`imgdiff.py`, `parity.py`)

The tools do not capture; they compare what was captured. A platform parameter therefore does three small things and nothing more:

- **`imgdiff --platform web|android|ios|windows`** — records `{"name", "viewport", "capture"}` in the report from one `PLATFORMS` table in `imgdiff.py` (the table is the single source for the default viewports the docs quote), and checks orientation: a portrait platform (android, ios) given a landscape screenshot, or a landscape platform (web, windows) given a portrait one, lists that image in `orientation_mismatch` and says so in the text output. Orientation, not aspect ratio: a full-page web capture is legitimately 1440x3000 and a retina shot is 2880x1800 — both keep their orientation, so neither trips it. Without `--platform` the report is byte-for-byte what it is today (existing diff JSONs carry no platform).
- **`parity --platform …`** — prints the platform in the header line (`Parity: 62.0 / 100  (android)`), writes it to `--json`, shows each `--visual` JSON's platform in the Screens list, and adds a line under "Fix in the matrix" when the visual JSONs carry a platform that differs from `--platform`, or more than one platform among themselves — one platform per parity report, the clone's screens compared at the right size. `--fail-under` is untouched (a mismatch is a problem line, not an exit code: PRACTICE's "parity is features" rule, UPSTREAM.md's ship-bar note).
- Default viewports (the capture size recon.md tells the user to take; the compare still happens at `--width 480`): web 1440x900, android 1080x2400, ios 1179x2556, windows 1280x800. Rulings below.

`odo.sh` / `odo.ps1` headers gain `[--platform web|android|ios|windows]` on the parity and imgdiff lines (comment text; the runners pass flags through untouched, no code change).

### 3. Platform in the docs (SKILL.md body, recon.md, recon-map.md, parity.md)

- `recon.md` § Step 1: "web, Android, iOS or Windows" and a pointer to the new **§ Capture** table: `platform | capture route | default viewport | store listing | screens of`. Rows: web — the browser's own screenshot (DevTools "Capture screenshot", or the session's browser tool) with the window set to 1440x900 (390x844 for mobile web), the app's URL; Android — an emulator or the user's own device, `adb exec-out screencap -p > .skillator/clone/screens/S02.png`, 1080x2400 (a Pixel-class phone; write the device and density in the map), the Google Play listing (`play.google.com/store/apps/details?id=…`); iOS — `xcrun simctl io booted screenshot .skillator/clone/screens/S02.png` on a Mac, 1179x2556 (iPhone 15-class), the App Store listing (`apps.apple.com/app/…`); on a Windows or Linux host there is no simulator — the listing's screenshots and screenshots the user takes on their own iPhone (AirDrop, mail) are the reference, named as such in the map, never a guess; Windows — the running app's window captured by the OS (Win+Shift+S / Snipping Tool, or `PrintWindow` through a ten-line PowerShell `System.Drawing` snippet already on every Windows box — no install), 1280x800 at 100 % scale, the Microsoft Store listing (`apps.microsoft.com/detail/…`). One sentence under the table: the same viewport and state for the clone's `clone-screens/`, and `odo.sh imgdiff --platform <p>` checks the orientation. Every route is "a screenshot of the running app as a person sees it" — nothing here reads the app's package, bundle or binary, so `clean-room.md` stays as it is.
- `recon.md` § Step 3: the route column on a native app is the tap path from the launcher (`Home > Bookings tab > +`), the activity/scene name only if the user knows it.
- `templates/recon-map.md`: a `Platform: {{web | Android | iOS | Windows}}  Capture: {{route, viewport — recon.md § Capture}}` line under Scope; the screens table header reads `route / tap path`.
- `parity.md` § Step 2: the viewport sentence becomes "at the platform's viewport (`recon.md` § Capture: web 1440x900 or 390x844 mobile web, Android 1080x2400, iOS 1179x2556, Windows 1280x800)" and the four example commands gain `--platform web`.
- SKILL.md §2 scope line: "which platform — web, Android, iOS or Windows, with its capture route and viewport (`references/recon.md` § Capture)". §5 table: the parity and imgdiff rows gain `[--platform web|android|ios|windows]`. §7: "compares structure at the platform's viewport and state". No other body change.
- `references/brand.md` § Listing: one sentence — `odo.sh listing` lints the App Store and Google Play fields; a Microsoft Store listing is checked by eye against the store's own limits (not linted). Honest, one line, no tool change.

### 4. The stack table (orchestrator's scope addition)

Upstream `replica-architect/SKILL.md` § Step 1 has the stack table; UPSTREAM.md says replica-architect was not absorbed, and nothing in build-jarvis or clone-odo names Expo, SwiftUI or Kotlin, so a native clone gets no stack default today. It lands as one short table in `references/handoffs.md` § Build, as a hand-off line build-jarvis reads ("**Passes** … the platform's stack default"), not a build rule:

| platform | default | swap for |
|---|---|---|
| web | Next.js (App Router) + TypeScript, Tailwind on the clone's own tokens | Remix, SvelteKit, Rails |
| Android | Expo (React Native) — one codebase with iOS | Kotlin + Jetpack Compose |
| iOS | Expo (React Native) — one codebase with Android | SwiftUI |
| Windows | the web clone in a Tauri shell (Q-F114-1) | Electron, WinUI 3, a PWA |
| data, auth, payments, email (all platforms) | Postgres on Supabase or Neon with Drizzle or Prisma; Supabase Auth or Auth.js; Stripe; Resend or Postmark | PlanetScale or Turso; Clerk; Lemon Squeezy or Paddle; SES |

Three upstream lines kept in our words: use the stack the user already has; one database, no microservices; the clone needs the original's features, not its architecture. Schema, API and build order stay build-jarvis's (they were not absorbed and are not now). UPSTREAM.md: the mapping cell gains `replica-architect/SKILL.md § Step 1 (the stack table) → references/handoffs.md § Build (web, Android, iOS rows; the Windows row is ours)`, the "Not absorbed" list reads `replica-architect (all but its stack table)`, `replica-architect/SKILL.md` joins the Watched paths cell, and the Watched-paths note drops replica-architect from its not-watched list. Absorbed commit stays `77c9436…` — the content taken is at that commit.

### 5. Baselines (verification; owner's host)

Four scenario files, one per platform, same fixture `odo`, the skill never named (description-only, as A157's t1–t3). PASS = `Skill(skillator:clone-odo)` appears in the transcript. Secondary (noted, not the line): the reply names the platform's capture route. Recorded in one `green-clone-odo-platforms.txt`, four sections, run on the trimmed host (62 skills) by the orchestrator through the existing driver; the reviews scenario once with description D (prefix from the worktree) to show A's review words still load. A157's file gets a closing appendix. Rulings on cost and shape below.

## CONSTRAINTS

- `plugin/skills/clone-odo/references/clean-room.md` is not edited by any task. Every capture route named anywhere is a screenshot of the running app as a person sees it; no task names decompiling, unpacking, `apktool`, `class-dump`, a bundle, a HAR or a binary.
- The description in `plugin/skills/clone-odo/SKILL.md` is description D from § 1 of this file, verbatim, and `awk '/^description:/{f=1;next} f&&/^---/{exit} f' plugin/skills/clone-odo/SKILL.md | wc -w` prints a number ≤ 80.
- The platform names are exactly `web`, `android`, `ios`, `windows` (lower-case) in every script, flag, JSON field and test; prose uses web, Android, iOS, Windows.
- Default viewports, everywhere they are quoted: web 1440x900 (mobile web 390x844), android 1080x2400, ios 1179x2556, windows 1280x800. The table of record is `PLATFORMS` in `plugin/skills/clone-odo/scripts/imgdiff.py`; docs copy it, never the other way round.
- `imgdiff` and `parity` without `--platform` produce the output they produce today: no `platform` key, no `orientation_mismatch` key, same text. `--fail-under` semantics unchanged.
- No new script, no new dependency (standard library only), no new fixture in `baseline-harness.sh`. `odo.sh`/`odo.ps1` change in their comment headers only.
- Store names, where named: App Store (`apps.apple.com`), Google Play (`play.google.com`), Microsoft Store (`apps.microsoft.com`).
- Build base: the RUN-0023 worktree `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104` (branch `run/RUN-0023-pending-f100-f104`, HEAD d79cce6) **after** `git merge --no-edit main` (main 399dd15; `git merge-tree` reports 0 conflicts). Reason: main's 1f1935c appended the trimmed-host section to `green-clone-odo-a157.txt` that Task 6 appends after; the worktree lacks it. clone-odo's SKILL.md, scripts/, references/ and templates/ are identical on both sides; only `UPSTREAM.md` differs (worktree says `skill-prometheus` in step 3 — F110's rename; keep the worktree's text). The worktree has uncommitted edits in ops-board, relay-morpheus and ticket-meta files that are not F114's: every commit here is path-scoped (`git add <the task's files>`), never `git add -A`.
- The baseline runs (VERIFICATION) are run by the orchestrator in the main session, not by the build agent: they set aside `~/.claude-bodish/skills`, which is outside the worktree.

## FILES (exact)

Modify (worktree paths, relative to `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104/`):
- `plugin/skills/clone-odo/SKILL.md` — frontmatter description (§ 1); body §2 scope line, §5 two rows, §7 one phrase.
- `plugin/skills/clone-odo/scripts/imgdiff.py` — `PLATFORMS`, `platform_report()`, `compare(..., platform=None)`, `render_text` line, `--platform`.
- `plugin/skills/clone-odo/scripts/parity.py` — `PLATFORMS`, `visual_scores` platform field, `combine(..., platform=None)`, `render` header and Screens line, `--platform`.
- `plugin/skills/clone-odo/scripts/tests/test_imgdiff.py` — 3 tests.
- `plugin/skills/clone-odo/scripts/tests/test_parity.py` — 2 tests.
- `plugin/skills/clone-odo/scripts/odo.sh` — header lines 5–6 (comment).
- `plugin/skills/clone-odo/scripts/odo.ps1` — header lines 5–6 (comment).
- `plugin/skills/clone-odo/references/recon.md` — Step 1, new § Capture, Step 3.
- `plugin/skills/clone-odo/references/parity.md` — Step 2 and the four commands.
- `plugin/skills/clone-odo/references/handoffs.md` — § Build: the stack table.
- `plugin/skills/clone-odo/references/brand.md` — § Listing: one sentence.
- `plugin/skills/clone-odo/templates/recon-map.md` — Platform/Capture line, screens header.
- `plugin/skills/clone-odo/UPSTREAM.md` — mapping cell, Not-absorbed clause, Watched paths cell, Watched-paths note.
- `plugin/practice/baselines/green-clone-odo-a157.txt` — appendix (Task 6).

Create:
- `plugin/practice/baselines/scenario-clone-odo-platform-web.txt`
- `plugin/practice/baselines/scenario-clone-odo-platform-android.txt`
- `plugin/practice/baselines/scenario-clone-odo-platform-ios.txt`
- `plugin/practice/baselines/scenario-clone-odo-platform-windows.txt`
- `plugin/practice/baselines/green-clone-odo-platforms.txt`

Not touched: `references/clean-room.md`, `reviews.md`, `preflight.md`; `scripts/reviews.py`, `sweep.py`, `listing.py`, `contrast.py`, `themes.json`; `baseline-harness.sh`; grayskull-power's route row (it already reads "clone an app"); `plugin.json` / `marketplace.json` (the orchestrator bumps versions at push per the memory rule, not this build); `TICKETS.md` (tickets-zordon, orchestrator).

## TASKS

All commands run from the worktree root `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104` in Git Bash. `W` below means that path. Task 0 is the orchestrator's; Tasks 1–5 one build agent in order (mode single; the files overlap too much to fan out); Task 6 after the VERIFICATION runs.

### Task 0: base (orchestrator, before dispatch)

**Files:** none edited.

- [ ] Step 1: `git -C "$W" status --short` — note the pre-existing dirty paths (ops-board, relay-morpheus, ticket-meta); they stay untouched.
- [ ] Step 2: `git -C "$W" merge --no-edit main` → expected `Merge made by the 'ort' strategy.` with `green-clone-odo-a157.txt`, `TICKETS.md` and run-file lines in the stat, 0 conflicts. (Ruling: merging main *into* the run branch is inside the worktree; nothing outside it moves.)
- [ ] Step 3: `grep -c "trimmed host" "$W/plugin/practice/baselines/green-clone-odo-a157.txt"` → `1` or more.
- [ ] Step 4: `sh "$W/plugin/skills/clone-odo/scripts/odo.sh" test 2>&1 | tail -3` → `Ran 56 tests` … `OK` (the green floor before any edit).

### Task 1: imgdiff `--platform` (test first)

**Files:**
- Modify: `plugin/skills/clone-odo/scripts/imgdiff.py` (after `SIG = …` line 42; `compare()` signature line 263 and report dict ~line 285; `render_text` ~line 396; `main()` ~line 419)
- Test: `plugin/skills/clone-odo/scripts/tests/test_imgdiff.py`

**Interfaces:**
- Produces: `imgdiff.PLATFORMS: dict[str, tuple[tuple[int,int], str]]` keyed `web|android|ios|windows`; `imgdiff.platform_report(name, img_a, img_b) -> (dict, list[str])`; `compare(..., platform=None)` adding `report["platform"] = {"name","viewport","capture"}` and `report["orientation_mismatch"]: list` only when `platform` is given; CLI `--platform {android,ios,web,windows}`. Task 2 reads `platform.name` from the JSON.

- [ ] Step 1: append to `class Compare` and `class Cli` in `test_imgdiff.py`:

```python
    # class Compare
    def test_platform_is_recorded_and_orientation_checked(self):
        portrait = page(240, 360)
        landscape = page(360, 240)
        rep, _ = imgdiff.compare(portrait, portrait, platform="android")
        self.assertEqual(rep["platform"],
                         {"name": "android", "viewport": "1080x2400",
                          "capture": imgdiff.PLATFORMS["android"][1]})
        self.assertEqual(rep["orientation_mismatch"], [])
        rep, _ = imgdiff.compare(landscape, portrait, platform="android")
        self.assertEqual(rep["orientation_mismatch"], ["original"])
        rep, _ = imgdiff.compare(landscape, portrait, platform="web")
        self.assertEqual(rep["orientation_mismatch"], ["clone"])
        self.assertIn("wrong way", imgdiff.render_text(rep, "a", "b"))

    def test_no_platform_means_no_platform_keys(self):
        rep, _ = imgdiff.compare(page(), page())
        self.assertNotIn("platform", rep)
        self.assertNotIn("orientation_mismatch", rep)
        self.assertEqual(sorted(imgdiff.PLATFORMS), ["android", "ios", "web", "windows"])

    # class Cli
    def test_platform_flag_in_json_and_unknown_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            a = os.path.join(d, "a.png")
            imgdiff.write_png(a, *page())
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(imgdiff.main([a, a, "--json", "--platform", "ios"]), 0)
            rep = json.loads(buf.getvalue())
            self.assertEqual(rep["platform"]["name"], "ios")
            self.assertEqual(rep["platform"]["viewport"], "1179x2556")
            with redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as ctx:
                    imgdiff.main([a, a, "--platform", "mac"])
            self.assertEqual(ctx.exception.code, 2)
```

- [ ] Step 2: `sh plugin/skills/clone-odo/scripts/odo.sh test 2>&1 | tail -5` → `FAILED (errors=3)` — `AttributeError: module 'clone_odo_imgdiff' has no attribute 'PLATFORMS'` and `TypeError: compare() got an unexpected keyword argument 'platform'` / `error: unrecognized arguments: --platform`.
- [ ] Step 3: in `imgdiff.py`, after `SIG = b"\x89PNG\r\n\x1a\n"`:

```python
# The capture platforms recon.md § Capture names. name -> ((viewport w, h) the
# screenshots are taken at, the capture route in one phrase). Docs quote this
# table; change it here first.
PLATFORMS = {
    "web": ((1440, 900), "browser screenshot with the window at the viewport"),
    "android": ((1080, 2400), "adb exec-out screencap -p (emulator or the user's device)"),
    "ios": ((1179, 2556), "xcrun simctl io booted screenshot (macOS only)"),
    "windows": ((1280, 800), "the running app's window, captured by the OS"),
}


def platform_report(name, img_a, img_b):
    """The report's platform block, and which images face the wrong way.

    A portrait platform given a landscape screenshot (or the reverse) is a
    capture from the wrong device or window. Orientation only: a full-page
    web capture is tall and a retina shot is double, both legitimately.
    """
    (vw, vh), route = PLATFORMS[name]
    portrait = vh > vw
    wrong = [label for label, (w, h, _) in (("original", img_a), ("clone", img_b))
             if w != h and (h > w) != portrait]
    return {"name": name, "viewport": "%dx%d" % (vw, vh), "capture": route}, wrong
```

  `compare` signature: `def compare(img_a, img_b, mode="layout", width=480, cols=12, tolerance=24, edge_threshold=40, platform=None):` and right after the `report = {...}` dict is built:

```python
    if platform:
        report["platform"], report["orientation_mismatch"] = platform_report(
            platform, img_a, img_b)
```

  In `render_text`, after the height line and before `if report["regions"]:`:

```python
    wrong = report.get("orientation_mismatch")
    if wrong:
        lines.append("  viewport: the %s screenshot faces the wrong way for %s (%s)" % (
            " and ".join(wrong), report["platform"]["name"], report["platform"]["viewport"]))
```

  In `main`, after the `--tolerance` argument: `ap.add_argument("--platform", choices=sorted(PLATFORMS), help="the platform the screenshots were captured on (recon.md § Capture); recorded in the report, orientation checked")`, and pass `platform=args.platform` into the `compare(...)` call.

- [ ] Step 4: `sh plugin/skills/clone-odo/scripts/odo.sh test 2>&1 | tail -3` → `Ran 59 tests` … `OK`.
- [ ] Step 5: `git add plugin/skills/clone-odo/scripts/imgdiff.py plugin/skills/clone-odo/scripts/tests/test_imgdiff.py && git commit -m "F114: imgdiff --platform - PLATFORMS table, platform block and orientation check in the report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

### Task 2: parity `--platform` (test first)

**Files:**
- Modify: `plugin/skills/clone-odo/scripts/parity.py` (constants ~line 40; `visual_scores` line 134; `combine` line 147; `render` line 158 and the Screens loop ~line 199; `main` line 212)
- Modify: `plugin/skills/clone-odo/scripts/odo.sh:5-6`, `plugin/skills/clone-odo/scripts/odo.ps1:5-6` (comment headers)
- Test: `plugin/skills/clone-odo/scripts/tests/test_parity.py`

**Interfaces:**
- Consumes: imgdiff `--json` output's `platform.name` (Task 1); JSONs without it still load.
- Produces: `parity.PLATFORMS = ("android", "ios", "web", "windows")`; `combine(result, visuals, platform=None)`; `result["platform"]` when given; each `result["visual"][i]["platform"]` (`""` when absent); CLI `--platform`.

- [ ] Step 1: append to `class Score` in `test_parity.py`:

```python
    def test_platform_in_header_and_visual_mismatch_is_a_problem(self):
        d = self.tmp.name
        v = write(d, "s02.json", json.dumps({
            "score": 80.0, "mode": "layout",
            "platform": {"name": "android", "viewport": "1080x2400"},
            "files": {"clone": "clone-screens/S02.png"}}))
        base = parity.score(parity.load(self.path))
        r = parity.combine(dict(base, problems=list(base["problems"])),
                           parity.visual_scores([v]), "android")
        text = parity.render(r)
        self.assertIn("Parity: %.1f / 100  (android)" % r["overall"], text)
        self.assertEqual(r["platform"], "android")
        self.assertEqual(r["problems"], [])
        self.assertIn("android", text.split("Screens")[1])
        r2 = parity.combine(dict(base, problems=list(base["problems"])),
                            parity.visual_scores([v]), "web")
        self.assertEqual(len(r2["problems"]), 1)
        self.assertIn("android", r2["problems"][0])
        self.assertIn("web", r2["problems"][0])
        # no platform anywhere: today's output
        r3 = parity.combine(dict(base, problems=list(base["problems"])), [])
        self.assertNotIn("platform", r3)
        self.assertTrue(parity.render(r3).startswith("Parity: %.1f / 100\n" % r3["overall"]))

    def test_platform_cli_rejects_unknown(self):
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as ctx:
                parity.main([self.path, "--platform", "mac"])
        self.assertEqual(ctx.exception.code, 2)
        self.assertEqual(parity.PLATFORMS, ("android", "ios", "web", "windows"))
```

- [ ] Step 2: `sh plugin/skills/clone-odo/scripts/odo.sh test 2>&1 | tail -5` → `FAILED (errors=2)` — `TypeError: combine() takes 2 positional arguments but 3 were given` and `AttributeError: … no attribute 'PLATFORMS'`.
- [ ] Step 3: in `parity.py`, after `PRIORITY_NAME = {...}`: `PLATFORMS = ("android", "ios", "web", "windows")  # imgdiff.PLATFORMS' keys; one platform per report`. In `visual_scores`, the appended dict becomes `{"file": name, "score": float(data["score"]), "mode": data.get("mode", "layout"), "platform": (data.get("platform") or {}).get("name", "")}`. Replace `combine`:

```python
def combine(result, visuals, platform=None):
    if platform:
        result["platform"] = platform
    seen = sorted({v["platform"] for v in visuals if v["platform"]})
    if len(seen) > 1 or (platform and seen and seen != [platform]):
        result["problems"].append(
            "screens were compared on %s but this report is %s - one platform per "
            "parity report; recapture at that platform's viewport (recon.md § Capture)"
            % (", ".join(seen), platform or "no platform"))
    if visuals:
        layout = sum(v["score"] for v in visuals) / len(visuals)
        result["visual"] = visuals
        result["layout_score"] = round(layout, 1)
        result["overall"] = round(0.8 * result["feature_score"] + 0.2 * layout, 1)
    else:
        result["overall"] = result["feature_score"]
    return result
```

  In `render`: first line becomes `out.append("%sParity: %.1f / 100%s" % (h, result["overall"], "  (%s)" % result["platform"] if result.get("platform") else ""))`; the Screens loop line becomes `out.append("- %-40s %5.1f%s" % (v["file"], v["score"], ("  " + v["platform"]) if v.get("platform") else ""))`. In `main`: `ap.add_argument("--platform", choices=PLATFORMS, help="the platform this report is for (recon.md § Capture); shown in the header, checked against --visual")` after `--fail-under`, and `result = combine(score(load(args.matrix)), visual_scores(args.visual), args.platform)`.

  `odo.sh` lines 5–6 and `odo.ps1` lines 5–6: append ` [--platform web|android|ios|windows]` to the parity line and the imgdiff line (four comment lines in total).

- [ ] Step 4: `sh plugin/skills/clone-odo/scripts/odo.sh test 2>&1 | tail -3` → `Ran 61 tests` … `OK`; `sh plugin/skills/clone-odo/scripts/odo.sh selftest` → `ok - clone-odo tools: 61 tests`; `sh plugin/skills/clone-odo/scripts/odo.sh parity plugin/skills/clone-odo/templates/features.csv | head -1` → `Parity: 0.0 / 100` (unchanged shape); `diff <(sed -n 5,6p plugin/skills/clone-odo/scripts/odo.sh | sed 's/odo.sh/X/') <(sed -n 5,6p plugin/skills/clone-odo/scripts/odo.ps1 | sed 's/odo.ps1 /X/')` → empty (twins in step).
- [ ] Step 5: `git add plugin/skills/clone-odo/scripts/parity.py plugin/skills/clone-odo/scripts/tests/test_parity.py plugin/skills/clone-odo/scripts/odo.sh plugin/skills/clone-odo/scripts/odo.ps1 && git commit -m "F114: parity --platform - header, Screens platform, mixed-platform problem line; runner headers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

### Task 3: description D and the platform docs

**Files:**
- Modify: `plugin/skills/clone-odo/SKILL.md:3-10` (description), `:75-78` (§2 scope), `:143-144` (§5 parity and imgdiff rows), `:185-186` (§7 "same viewport")
- Modify: `plugin/skills/clone-odo/references/recon.md:21-27` (Step 1), new `## Capture` after Step 1, `:43-50` (Step 3)
- Modify: `plugin/skills/clone-odo/references/parity.md:11-16` (commands), `:32-37` (Step 2)
- Modify: `plugin/skills/clone-odo/templates/recon-map.md:1-5`, `:19-21`
- Modify: `plugin/skills/clone-odo/references/brand.md` § Listing (after the "Exit 1 on an error." paragraph, ~line 110)

**Interfaces:** consumes `imgdiff.PLATFORMS` values (Task 1) as the numbers quoted; produces nothing code-level. Doc-only task: the test is the grep gate in Step 2/4 (PRACTICE §4: a doc line carries no unit test).

- [ ] Step 1 (RED checks, expected to fail now): `awk '/^description:/{f=1;next} f&&/^---/{exit} f' plugin/skills/clone-odo/SKILL.md | grep -c "Microsoft Store"` → `0`; `grep -c "^## Capture" plugin/skills/clone-odo/references/recon.md` → `0`; `grep -c -- "--platform" plugin/skills/clone-odo/references/parity.md` → `0`.
- [ ] Step 2: SKILL.md frontmatter — replace lines 3–10 with:

```yaml
description: >-
  Use before quoting or counting what users hate about an app - top
  complaints from a reviews.csv or .skillator/clone/, a quote and count
  each, for an investor or pitch, or review rows lacking a link. "Clone
  this app" (web, Android, iOS, Windows), "build my own version of X", "map
  X's screens", "how close is my clone", "rebrand the clone", or its URL,
  App Store, Google Play or Microsoft Store link. NOT for building screens
  (build-jarvis, design-arwen) or shipping (deploy-merlin, deploy-niyoj).
```

  SKILL.md §2 first sentence: `Scope first: which app, which platform - web, Android, iOS or Windows, each with its capture route and viewport (`references/recon.md` § Capture) - which slice (default to the core loop, the one flow users pay for), and who the clone is for.` §5 parity row command: `odo.sh parity .skillator/clone/features.csv [--platform web|android|ios|windows] [--visual …] [--markdown] [--fail-under 80]`; imgdiff row: `odo.sh imgdiff .skillator/clone/screens/S02.png .skillator/clone/clone-screens/S02.png --platform web [--out …] [--json]` with its Does cell `layout diff of two screenshots at the platform's viewport, colour ignored`. §7 sentence: `odo.sh imgdiff compares structure at the platform's viewport and state (`references/recon.md` § Capture) and **ignores colour**: …`.

  `recon.md` Step 1 item 1: `**Which app, which platform** — web, Android, iOS or Windows; the platform fixes the capture route and the viewport every screenshot is taken at (§ Capture below) and the store listing that is a source.` Insert after Step 1:

```markdown
## Capture

Every screenshot is of the running app as a person sees it, taken at the
platform's viewport and saved as `.skillator/clone/screens/S<nn>.png`
(`clean-room.md` § Screenshots). Nothing here opens the app's package,
bundle or binary. The viewports are `PLATFORMS` in `scripts/imgdiff.py`.

| platform | capture route | default viewport | store listing (a source and its screenshots) |
|---|---|---|---|
| web | the browser's own screenshot (DevTools "Capture screenshot", or the session's browser tool) with the window set to the viewport | 1440x900; 390x844 for mobile web | none - the app's URL |
| Android | an emulator or the user's own device: `adb exec-out screencap -p > .skillator/clone/screens/S02.png`; write the device and density in the map | 1080x2400 (a Pixel-class phone) | Google Play, `play.google.com/store/apps/details?id=…` |
| iOS | on a Mac: `xcrun simctl io booted screenshot .skillator/clone/screens/S02.png` from the simulator, or the user's own iPhone. On a Windows or Linux host there is no simulator: the listing's screenshots and shots the user takes on their own iPhone (AirDrop, mail) are the reference - say so in the map, never guess a screen | 1179x2556 (an iPhone 15-class) | App Store, `apps.apple.com/app/…` |
| Windows | the running app's window captured by the OS: Win+Shift+S, or a `System.Drawing` `PrintWindow` snippet in PowerShell (on every Windows box, nothing to install), at 100 % scale | 1280x800 | Microsoft Store, `apps.microsoft.com/detail/…` |

The clone's `clone-screens/` are taken the same way, same viewport, same
state; `odo.sh imgdiff --platform <p>` records the platform and flags a
screenshot facing the wrong way, and `odo.sh parity --platform <p>` keeps
one platform per report.
```

  `recon.md` Step 3: after the column line add `On Android, iOS or Windows the route is the tap path from the launcher (`Home > Bookings tab > +`), with the activity or scene name only when the user knows it.`

  `parity.md` Step 2 first sentence: `For each key screen, two screenshots at the **platform's viewport** (`recon.md` § Capture: web 1440x900 or 390x844 mobile web, Android 1080x2400, iOS 1179x2556, Windows 1280x800) in the **same state** (…)`. The four commands at the top gain `--platform web` (imgdiff: after the two paths; parity: before `--visual`).

  `templates/recon-map.md`: after `Scope:` add `Platform: {{web | Android | iOS | Windows}}  Capture: {{route and viewport - recon.md § Capture}}`; screens header `| ID | screen | route / tap path | purpose | key components | states seen |`.

  `brand.md` § Listing, after "Exit 1 on an error.": `It knows the App Store and Google Play; a Microsoft Store listing is checked by eye against that store's own limits, and the same `avoid` names apply.`

- [ ] Step 3: `awk '/^description:/{f=1;next} f&&/^---/{exit} f' plugin/skills/clone-odo/SKILL.md | wc -w` → `80` (or less; never more). `awk '/^description:/{f=1;next} f&&/^---/{exit} f' plugin/skills/clone-odo/SKILL.md | tr '\n' ' ' | grep -c 'Use before quoting or counting what users hate about an app - top complaints from a reviews.csv or .skillator/clone/, a quote and count each, for an investor or pitch, or review rows lacking a link'` → `1` (A's review sentence intact, allowing for the fold). `grep -c "NOT for building screens" plugin/skills/clone-odo/SKILL.md` → `1`.
- [ ] Step 4: `grep -c "^## Capture" plugin/skills/clone-odo/references/recon.md` → `1`; `grep -c -- "--platform" plugin/skills/clone-odo/references/parity.md` → `5`; `grep -c "1080x2400\|1179x2556\|1280x800\|1440x900" plugin/skills/clone-odo/references/recon.md` → `4`; `git diff --quiet HEAD -- plugin/skills/clone-odo/references/clean-room.md && echo clean-room-untouched` → `clean-room-untouched`; `sh plugin/practice/scripts/check-routing.sh` → `ok`; `sh plugin/practice/scripts/check-grayskull-sync.sh` → `ok`.
- [ ] Step 5: `git add plugin/skills/clone-odo/SKILL.md plugin/skills/clone-odo/references/recon.md plugin/skills/clone-odo/references/parity.md plugin/skills/clone-odo/references/brand.md plugin/skills/clone-odo/templates/recon-map.md && git commit -m "F114: description names web, Android, iOS, Windows and their stores (80 words); recon § Capture per platform; parity at the platform's viewport

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

### Task 4: the stack table in the build hand-off, UPSTREAM.md mapping

**Files:**
- Modify: `plugin/skills/clone-odo/references/handoffs.md:10-23` (§ Build, **Passes** list and **Owns**)
- Modify: `plugin/skills/clone-odo/UPSTREAM.md:19` (the table row: Watched paths cell, sections cell) and the "Watched paths" bullet (~line 53)

**Interfaces:** none code-level; `upstream-check.sh` parses the row, so the cell shape (`<br>`-separated paths, one row) must hold.

- [ ] Step 1 (RED): `grep -ci "expo\|swiftui\|tauri" plugin/skills/clone-odo/references/handoffs.md` → `0`; `sh plugin/skills/clone-odo/upstream-check.sh; echo rc=$?` → note the line and rc (expected `unchanged replica-skill …` rc=0; if it already says `changed`, record it in the run file — it is an A ticket, not this task's).
- [ ] Step 2: in `handoffs.md` § Build, add to **Passes** after the guard bullet: `- the platform's stack default, unless the user already has a stack - then theirs:` followed by the table from DESIGN § 4 verbatim, then one line: `One database, no microservices; the clone needs the original's features, not its architecture. Schema, API, migrations and build order are build-jarvis's.` In UPSTREAM.md's row: Watched paths cell gains `replica-architect/SKILL.md<br>` before `replica-recon`; the sections cell gains, before "Not absorbed:", `` `replica-architect/SKILL.md` § Step 1 (the stack table) → `references/handoffs.md` § Build (web, Android, iOS rows; the Windows row is ours; schema, API and build order not absorbed); `` and "Not absorbed: replica-architect, replica-build, replica-backend (build-jarvis)" becomes "Not absorbed: replica-architect except its stack table, replica-build, replica-backend (build-jarvis)". The Watched-paths bullet: "replica-architect, replica-build, replica-backend, …" → "replica-build, replica-backend, replica-deploy/SKILL.md and replica-test/SKILL.md are not watched (replica-architect/SKILL.md is, for its stack table)".
- [ ] Step 3: `grep -ci "expo" plugin/skills/clone-odo/references/handoffs.md` → `2`; `grep -c "Tauri" plugin/skills/clone-odo/references/handoffs.md` → `1`; `grep -c "replica-architect/SKILL.md" plugin/skills/clone-odo/UPSTREAM.md` → `2`; `sh plugin/skills/clone-odo/upstream-check.sh; echo rc=$?` → `unchanged replica-skill 77c9436…` rc=0 (a `changed` here means upstream moved replica-architect since the pin: record it, do not absorb it in this task); `sh plugin/practice/scripts/check-muse-manifest.sh` → `ok`.
- [ ] Step 4: `git add plugin/skills/clone-odo/references/handoffs.md plugin/skills/clone-odo/UPSTREAM.md && git commit -m "F114: per-platform stack default in the build-jarvis hand-off (upstream replica-architect's table, Windows row ours); UPSTREAM.md maps and watches it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

### Task 5: the four platform scenarios and the green file, verdicts pending

**Files:**
- Create: `plugin/practice/baselines/scenario-clone-odo-platform-web.txt`, `-android.txt`, `-ios.txt`, `-windows.txt`
- Create: `plugin/practice/baselines/green-clone-odo-platforms.txt`

**Interfaces:** `sh plugin/practice/scripts/baseline-harness.sh scenario <file>` prints the non-`#` lines — the prompt; fixture `odo`.

- [ ] Step 1 (RED): `ls plugin/practice/baselines/scenario-clone-odo-platform-*.txt` → `No such file`.
- [ ] Step 2: write the four files. `-android.txt`, in full:

```
# GREEN scenario (description-only) - a clone request names the Android app and its Play link (F114, clone-odo)
# Rule under test (ONE): clone-odo loads from its description alone - the
# prompt never names the skill - when the user asks to clone an Android app
# and gives its Google Play link. PASS is the load; the capture route named
# in the reply is graded secondary.
#
# Why it exists: F114 - the description before this named no platform, and
# A157 measured only the reviews prompt (original 0/2, rewrite A 1/1 on the
# 62-skill host). One scenario per platform: web, android, ios, windows.
#
# Shape: an order with a store link, no pressure sentence - the question is
# whether the description fires, not whether the body holds under pressure.
# The fixture's recon map is the web app's; the Android app is new ground.
#
# Fixture: `odo` (`sh practice/scripts/baseline-harness.sh fixture odo <DIR>`).
# Host: the trimmed host (user skills set aside, other plugins off, under 100
# skills in init) - green-clone-odo-a157.txt § trimmed host, drive2.sh/trim.sh.
#
# Scenario prompt - everything not starting with '#' is the prompt:
#
IMPORTANT: This is a real scenario. You must choose and act.
Don't ask hypothetical questions - make the actual decision.

Clone the Slotly Android app for us - https://play.google.com/store/apps/details?id=com.slotly.app - start with the screen map. Go.

# PASS = the transcript has a Skill tool call whose skill is skillator:clone-odo.
# FAIL = no such call (the run maps or builds unaided, or asks).
# Secondary (noted, not the line): the reply names adb screencap / an emulator
# as the capture route and 1080x2400 as the viewport.
```

  `-ios.txt`: the same file with `Android app` → `iPhone app`, `Google Play link` → `App Store link`, the prompt line `Clone the Slotly iPhone app for us - https://apps.apple.com/app/slotly/id6400000000 - start with the screen map. Go.`, and the secondary line `the reply names the simulator (xcrun simctl) on a Mac, or the listing's and the user's own iPhone screenshots on this Windows host, and 1179x2556`. `-windows.txt`: `Windows app`, `Microsoft Store link`, prompt `Clone the Slotly Windows app for us - https://apps.microsoft.com/detail/9NSLOTLY0000 - start with the screen map. Go.`, secondary `a window capture (Win+Shift+S / PrintWindow) at 1280x800`. `-web.txt`: `web app`, `its URL` (no store), prompt `Clone Slotly's web app for us - https://slotly.example/ - start with the screen map. Go.`, secondary `a browser screenshot at 1440x900`, and the "fixture's recon map" sentence reads `The fixture's recon map is already the web app's; a run that re-maps or extends it is fine - the line is the load.`

  `green-clone-odo-platforms.txt`:

```
# GREEN - clone-odo loads from its description for a clone request on each platform (F114)
# Rule under test (ONE): with description D (SKILL.md at the commit below), a
# clone request that names the platform and its store link loads clone-odo
# unprompted - `Skill(skillator:clone-odo)` in the transcript - at least 1/2
# per platform on the trimmed host. Prompts: scenario-clone-odo-platform-
# {web,android,ios,windows}.txt, run unprefixed (the skill is never named).
#
# Fixture: `odo`, fresh per run. Host: as green-clone-odo-a157.txt § trimmed
# host - ~/.claude-bodish/skills set aside and restored, every other user
# plugin off via --settings enabledPlugins, init skills under 100, `--model
# sonnet`, BASELINE_ISOLATE=hide, 900 s, strictly sequential. Prefix:
# `baseline-harness.sh prefix` from the RUN-0023 worktree at the commit named
# in the verdict; `git diff` of plugin/skills/clone-odo empty before the round.
# Grading: jq -r 'select(.type=="assistant") | .message.content[]? |
#   select(.type=="tool_use" and .name=="Skill") | .input.skill' <run>.jsonl
# A second run per platform only when the first did not load (the bar is 1/2).
#
# ---------------------------------------------------------------- VERDICT ----
# pending - the orchestrator runs these after the F114 build commits (design
# file § VERIFICATION); Task 6 writes the four sections and the reviews re-run.
```

- [ ] Step 3: `for p in web android ios windows; do sh plugin/practice/scripts/baseline-harness.sh scenario plugin/practice/baselines/scenario-clone-odo-platform-$p.txt | grep -c "Slotly"; done` → `1` four times; `grep -L "skillator:clone-odo" plugin/practice/baselines/scenario-clone-odo-platform-*.txt | wc -l` → `0` (every file states the PASS line) and `for f in plugin/practice/baselines/scenario-clone-odo-platform-*.txt; do sh plugin/practice/scripts/baseline-harness.sh scenario "$f" | grep -c "clone-odo"; done` → `0` four times (the prompt never names the skill); `sh plugin/practice/scripts/baseline-harness.sh selftest` → `ok`.
- [ ] Step 4: `git add plugin/practice/baselines/scenario-clone-odo-platform-web.txt plugin/practice/baselines/scenario-clone-odo-platform-android.txt plugin/practice/baselines/scenario-clone-odo-platform-ios.txt plugin/practice/baselines/scenario-clone-odo-platform-windows.txt plugin/practice/baselines/green-clone-odo-platforms.txt && git commit -m "F114: one description-only clone scenario per platform, green file pending the trimmed-host runs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

### Task 6: record the verdicts, close A157 (after VERIFICATION; orchestrator or a cheap agent handed the run summaries)

**Files:**
- Modify: `plugin/practice/baselines/green-clone-odo-platforms.txt` (replace the `pending` block)
- Modify: `plugin/practice/baselines/green-clone-odo-a157.txt` (append)

- [ ] Step 1: replace the VERDICT block with one section per platform in the a157 register — date, claude-code version, `init skills = <n>`, prefix commit, fixture sha, then per run `p-<platform>[-2]  loaded YES|NO - <first tool call>, <turns>, $<cost>`, the secondary note (capture route named or not), and `VERDICT (measured): web n/N, android n/N, ios n/N, windows n/N; <any platform under 1/2 named as NOT met>`, cost line summed from `total_cost_usd`.
- [ ] Step 2: append to `green-clone-odo-a157.txt`:

```
# ---- 2026-10-27 F114 close ----
# Description D (rewrite A's review sentence kept, four platforms and three
# stores named, 80 words) is in skills/clone-odo/SKILL.md at <commit>. Reviews
# scenario, prefix from that commit, trimmed host (<n> skills): loaded YES|NO -
# <first tool call>, <turns>, $<cost>. Platform scenarios:
# green-clone-odo-platforms.txt. A157 Done line met at 62 skills (t3 1/1 plus
# this run); the 200+-skill listing is the open host finding, not this ticket.
```

- [ ] Step 3: `grep -c "pending" plugin/practice/baselines/green-clone-odo-platforms.txt` → `0`; `grep -c "F114 close" plugin/practice/baselines/green-clone-odo-a157.txt` → `1`.
- [ ] Step 4: `git add plugin/practice/baselines/green-clone-odo-platforms.txt plugin/practice/baselines/green-clone-odo-a157.txt && git commit -m "F114: trimmed-host verdicts per platform; A157 closed with description D

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`. Board flips (F114 → built/[%], A157 → [x]) are tickets-zordon's, by the orchestrator.

## VERIFICATION

**Build seat, after Tasks 1–5 (no money):**
1. `sh plugin/skills/clone-odo/scripts/odo.sh test 2>&1 | tail -3` → `Ran 61 tests` / `OK`; `sh plugin/skills/clone-odo/scripts/odo.sh selftest` → `ok - clone-odo tools: 61 tests`.
2. `awk '/^description:/{f=1;next} f&&/^---/{exit} f' plugin/skills/clone-odo/SKILL.md | wc -w` → ≤ 80.
3. `git diff d79cce6 --stat -- plugin/skills/clone-odo/references/clean-room.md` → empty.
4. `sh plugin/practice/scripts/check-routing.sh && sh plugin/practice/scripts/check-grayskull-sync.sh && sh plugin/practice/scripts/check-muse-manifest.sh && sh plugin/skills/clone-odo/upstream-check.sh && sh plugin/practice/scripts/baseline-harness.sh selftest` → all `ok` / `unchanged`.
5. `powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/clone-odo/scripts/odo.ps1 selftest` → `ok - clone-odo tools: 61 tests` (this host has PowerShell 5.1; F107 owed this and it is cheap here).
6. Regression sweep then `/code-review` on the staged diff before each commit (standing rule).

**Orchestrator (main session), after Task 5's commit — spends money, sets aside the owner's skills:**
7. Build the prefix from the worktree: `PX=$(sh "$W/plugin/practice/scripts/baseline-harness.sh" prefix "$SCRATCH/f114/prefix")` (root resolves to the script's own repo = the worktree; stderr must list no dirty path under `skills/clone-odo`). `git -C "$W" diff --quiet HEAD -- plugin/skills/clone-odo && echo clean`.
8. Write `$SCRATCH/f114/trim3.sh` modelled on `a157/trim.sh` (same `restore` trap, same `drive2.sh`, same `< 100` abort on the first run's init skill count), runs in this order, one fresh `fixture odo` each: `p-web` (`scenario-clone-odo-platform-web.txt`), `p-android`, `p-ios`, `p-windows`, `r-reviews` (`scenario-clone-odo-reviews.txt`, unprefixed). For each platform whose first run shows no `Skill(skillator:clone-odo)`, one second run `p-<platform>-2`. Grade with the jq line in the green file. Expected cost 5–9 runs × ~$0.15 ≈ $0.75–1.35.
9. Pass: every platform ≥ 1/2 and the reviews run loads. A platform at 0/2 is a NOT met for that platform, written as such in the green file (README: one negative run is a run event; two is the bar this ticket set) — then one description round at most, re-run that platform only, before the breaker (PRACTICE §7 three-fix rule applies across the whole ticket, one round already spent by A157).
10. Confirm `ls ~/.claude-bodish/skills | wc -l` → `149` after the trap restores.
11. Hand the per-run lines (loaded, first call, turns, cost, init skill count, fixture sha, prefix commit) to Task 6.

## Decisions

- Ruling: description D drops "reverse engineer X" and "is anything of the original left" to fit the platforms and stores in 80 words - the first invites decompiling, which clean-room.md forbids, the second is reached from the body once the skill is loaded in a clone project ("rebrand the clone" is the sweep's stage) - cost if wrong: a sweep question asked cold loads nothing until grayskull-power routes it; the reviews and clone triggers (the two measured paths) are untouched.
- Ruling: "Also" dropped rather than any review word - the review sentence is the one that measured 1/1 - cost if wrong: a slightly abrupt list; no retrieval word lost.
- Ruling: the platform parameter in the tools is name + default viewport + orientation check + a mixed-platform problem line, nothing more; no per-platform compare width or grid - the tools compare captures, they do not capture, and the viewport only matters at capture time - cost if wrong: a later ticket adds a per-platform `--width` default; the JSON shape here already carries the viewport.
- Ruling: orientation, not aspect ratio, is the mismatch test - a full-page web capture (1440x3000) and a retina shot (2880x1800) are both legitimate and both keep their orientation - cost if wrong: a 1080x1080 square shot passes unchecked (`w != h` is excluded on purpose).
- Ruling: defaults web 1440x900 / 390x844 (already in parity.md), android 1080x2400 (the Pixel 6-8 panel, the emulator's common image), ios 1179x2556 (iPhone 15/16 panel), windows 1280x800 at 100 % (the smallest common laptop window that fits a desktop app) - cost if wrong: a number in one table (`imgdiff.PLATFORMS`) and three docs lines change; parity's score does not depend on them.
- Ruling: iOS on a Windows/Linux host is said, not solved - no simulator exists there, and the listing's screenshots plus the user's own device shots are the only clean-room reference - cost if wrong: an iOS clone planned on Windows has fewer states captured; the map says so instead of guessing.
- Ruling: the Windows capture route names Win+Shift+S and a PowerShell `System.Drawing` snippet, no third-party capture tool - both are on every Windows box, so no dependency - cost if wrong: DPI scaling above 100 % gives a bigger PNG; imgdiff scales to one width so the score survives, and the table says 100 %.
- Ruling: `clean-room.md` is not edited, even its § Screenshots line that says "same viewport" - the ticket says clean-room rules unchanged and the line still holds (recon.md § Capture is where the viewport is now defined) - cost if wrong: one reader looks for the viewport in clean-room.md and follows the recon.md pointer one hop later.
- Ruling: `listing.py` is not taught the Microsoft Store (a third store, new limits, a tool change outside parity/imgdiff) - one sentence in brand.md says it is checked by eye - cost if wrong: a Windows clone's listing is linted by hand; a `could` follow-up ticket if it is ever asked for.
- Ruling: `parity --platform` mismatch is a "Fix in the matrix" problem line, never an exit code - `--fail-under` stays the feature score and must-haves only (UPSTREAM.md's ship-bar note) - cost if wrong: a mixed-platform report ships with a warning line instead of a red exit.
- Ruling: the stack table lives in `references/handoffs.md` § Build as a hand-off line, Android and iOS both default to Expo (one codebase, upstream's own default) with Kotlin/Compose and SwiftUI as swaps; the Windows row is ours since upstream has none - cost if wrong: build-jarvis starts a native clone on the wrong stack and the user says so at the first task; it is one line to change.
- Ruling: `replica-architect/SKILL.md` joins UPSTREAM.md's watched paths at the same absorbed commit 77c9436 - the stack table came from it, so a change there should surface - cost if wrong: `upstream-check.sh` may say `changed` the first time if upstream touched that file since the pin; that is an A ticket, recorded, not absorbed here (Task 4 Step 3 says so).
- Ruling: no new fixture - the four platform scenarios run in `odo` (its recon map is the web app's; the Android/iOS/Windows prompts are new ground, the web prompt may re-map) - the line is the load, and a harness change would be the largest diff in the ticket - cost if wrong: a run primed by the existing `.skillator/clone/` folder loads more easily than a cold project would; the green file says the fixture, as every green does.
- Ruling: the scenarios carry no pressure sentence - a description-only load test asks whether the retrieval key fires, not whether the body holds; A157's t1-t3 ran the reviews prompt the same way - cost if wrong: the measured rate is an upper bound on a pressured prompt; the body GREENs (reviews, cleanroom) already measure pressure.
- Ruling: one run per platform first, a second only on a NO (bar ≥ 1/2), no control run - the control (code-yoda) loaded 2/2 and 1/1 on this host today, the init skill count is the gate instead - cost if wrong: ~$0.15 saved per platform against a stale-host risk that the `< 100` abort already catches.
- Ruling: the baseline runs are the orchestrator's, not the build agent's - they set aside `~/.claude-bodish/skills`, outside the worktree, and they spend money - cost if wrong: none; the design says so in CONSTRAINTS and VERIFICATION.
- Ruling: the build bases on the worktree after `git merge --no-edit main` (0 conflicts by merge-tree) - the a157 file's trimmed-host section is only on main and Task 6 appends after it; clone-odo is otherwise identical on both sides - cost if wrong: the merge brings main's board/run-file commits into the run branch early, which the run's land step would do anyway.
- Ruling: the worktree's pre-existing dirty files (ops-board, relay-morpheus, ticket-meta) are left alone and every F114 commit is path-scoped - cost if wrong: none to F114; a `git add -A` would smuggle another stage's work.
- Ruling: `odo.ps1 selftest` is run here (PowerShell 5.1 present) as a bonus check F107 owed - cost if wrong: a few seconds.
- Q-F114-1 (owner): Windows stack default - **default: the web clone in a Tauri shell** (small binary, the web code reused, Microsoft Store packaging documented); alternatives Electron (heavier, most familiar), WinUI 3 (native, a second codebase), a PWA (no store without packaging). Built on the default; one table cell to change.
- Q-F114-2 (owner): mobile web (390x844) as a fifth platform name in the tools? **default: no** - it is the web platform at a second viewport, documented in recon.md § Capture; `imgdiff` treats 390x844 as portrait on `web` and would flag it, so a mobile-web pair is compared without `--platform` or with the viewport noted in the map. Built on the default; adding `mobile-web` later is one `PLATFORMS` row and one test.

## Self-review (PRACTICE §3)

1. Coverage - description ≤ 80 words with A's review words, four platforms, stores, NOT clauses → Task 3 (verified by awk/grep steps). recon/parity/imgdiff take a platform with capture route and viewport → Tasks 1–3 (tools: name + viewport + checks; docs: route + viewport + store). clean-room unchanged → CONSTRAINTS + Task 3 Step 4 + VERIFICATION 3. One clone scenario per platform, unprompted, ≥ 1/2 on the trimmed host, recorded → Task 5 + VERIFICATION 7–11 + Task 6. A157 closes → Task 6 + VERIFICATION r-reviews. Orchestrator's stack-table addition → Task 4 (handoffs.md table, UPSTREAM.md mapping row + watched path, Q-F114-1). Base check → CONSTRAINTS + Task 0.
2. Placeholders - the iOS/Windows/web scenario files are given as edits to the fully written Android file with every differing line spelled out; Task 6's angle-bracket fields are run results that do not exist yet, filled from VERIFICATION 11. No "TBD", no "similar to".
3. Type consistency - `PLATFORMS` keys `web|android|ios|windows` in imgdiff (dict) and parity (tuple, same four, sorted order matches `choices=sorted(PLATFORMS)`); `platform_report` returns `(dict, list)`; `compare(..., platform=None)`; `combine(result, visuals, platform=None)`; JSON `platform.name` written by imgdiff and read by parity's `visual_scores`; viewport strings `WxH` in both. Test counts 56 → 59 → 61 match three + two tests.
4. Ambiguity - "store links" fixed as the three store hostnames; "viewport" fixed as the capture size, with the compare width (480) left alone and said so; "unprompted" fixed as the skill never named in the prompt, plugin prefix present; "1/2" fixed as a second run only on a first NO.
5. Scope - one skill, one tool pair, five baseline files, one hand-off table: one coherent change. The Microsoft Store lint and a mobile-web platform name are named as not here, with defaults.

## Resume rulings (2026-10-27, supersede conflicting task snippets)

Read `.skillator/reports/F114-preflight.md` for reproduced evidence.

- Web orientation is not inferred from image dimensions: full-page and mobile-web captures are valid. Keep web metadata but emit no orientation warning for web. Native platforms retain advisory orientation checks. Add regression cases for tall/mobile/retina web and native mismatch; document the exemption.
- Legacy parity visuals without platform metadata retain their exact previous JSON keys and text. Add a visual platform property only for meaningful supplied metadata. Cover two tagged platforms without --platform, exact legacy visual compatibility, and unchanged --fail-under behavior.
- Normalize all whitespace for description sentence checks; description D remains verbatim and 80 words. Verify four flag-bearing command lines in parity.md, not an invented fifth. Escape pipe separators inside Markdown table cells.
- Label Android binary screenshot redirection as Git Bash/POSIX; recommend Snipping Tool for Windows instead of an unspecified PrintWindow snippet. iOS capture metadata names the supplied-device/listing fallback or explicitly describes a suggested route.
- Baselines use an isolated local profile; never move the live skills junction or rename user CLAUDE.md. Report configuration and inventory differences from historical A157 explicitly; exact 62-skill equivalence is unproved. Preparation is in `.skillator/reports/F114-preflight.md`. Five baseline runs remain controller work; build seat performs Tasks 1-5 only and leaves verdicts pending.
- A157 closure and Task 6 depend on an actually passing description-D review load plus platform baseline evidence. A failed or invalid run is recorded honestly and cannot close either ticket. Extra correctness tests mean the old exact 61-test count is historical, not a cap.
- Recheck current revisions/cleanliness. Main is merged into the F114 stage worktree before its implementation, preserving the run's F110 rename and A157 appendix. The stage worktree is authoritative when another stage is editing the run worktree.