"""Rename one skill: directory, hooks, frontmatter, heading, references.

    python rename-skill.py <old> <new> [--dry-run]
    python rename-skill.py --selftest

Ported from a scratchpad script (`ren.py`, see TICKETS.md A80) into a
parameterised tool. Handles the mechanical pass only:
  - `git mv skills/<old> skills/<new>`
  - a hook script named after its skill (hooks/<old>.*)
  - the `practice/baselines/{scenario,green}-<old>[-suffix].txt` filenames
    (the verdict TEXT inside is left alone; it is historical prose)
  - bare-shape references that can only be a skill reference (never a bare
    word - `handoff` is a common noun and `func-ui` is also a fixture)
  - the `name:` frontmatter line in the renamed skill's SKILL.md

Deliberately excluded, per PLAN-rename.md S2:
  - practice/scripts/baseline-harness.sh  fixture names, not skill names, and
    every recorded verdict cites them
  - TICKETS.md closed entries, docs/handoffs/*  historical prose
  - the verdict TEXT inside practice/baselines/*.txt  (the FILENAME follows)
  - EXCLUDE_PATHS below: storage paths that are not references at all, e.g.
    `~/.claude/handoff-watch/` — a live session's on-disk flag directory, not
    a doc reference to the skill of the same family name.

After the mechanical pass this script greps the whole repo (minus .git) for
the bare old name and for `# <old-heading-ish>` headings, and prints them as
the manual pass. It exits non-zero if anything remains, so a caller (or CI)
can tell the rename is incomplete without reading the output.

Guards, asserted by --selftest:
  (a) a substitution whose *output* the *old* pattern would match again is
      refused before any file is touched (the r2d2-r2d2-relay bug: renaming
      "relay" -> "r2d2-relay" makes "hooks/relay." into "hooks/r2d2-relay.",
      and a later rule for "relay.sh" -> "r2d2-relay.sh" then matches inside
      that output, doubling it to "r2d2-r2d2-relay.sh").
  (b) EXCLUDE_PATHS are never rewritten or moved, even though their name
      matches the old skill name (~/.claude/handoff-watch/ is storage, not a
      reference).
  (c) the manual-pass grep (bare cross-references and `# heading` lines)
      fires and the script exits non-zero when such text remains.

UTF-8 I/O throughout: files are opened with encoding="utf-8" explicitly, since
bare open() on Windows defaults to cp1252 and silently fails to match the
docs' em dashes and other non-ASCII text.
"""
import io
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Rewritten. Everything else is left alone.
LIVE_DIRS = ("skills", "docs/plans", ".skillator", ".claude-plugin")
LIVE_FILES = ("README.md", "PRACTICE.md", "PLATFORMS.md", "WORKFLOW.md",
              "CASEFILE.md", "AGENTS.md", "GEMINI.md", "CLAUDE.md",
              "install.sh", "install.ps1")

# Storage paths that happen to share a skill's name but are not references to
# it -- a live session's on-disk flag/state directory, not documentation.
# Matched as a substring of the full path; never rewritten, never moved.
EXCLUDE_PATHS = (
    ".claude/handoff-watch/",
)


def git(root, *a):
    return subprocess.run(["git", "-C", root] + list(a),
                           capture_output=True, text=True)


def is_excluded(path):
    norm = path.replace("\\", "/")
    return any(ex in norm for ex in EXCLUDE_PATHS)


def live_files(root):
    out = []
    for f in LIVE_FILES:
        p = os.path.join(root, f)
        if os.path.isfile(p) and not is_excluded(p):
            out.append(p)
    for d in LIVE_DIRS:
        base = os.path.join(root, d)
        if not os.path.isdir(base):
            continue
        for r, dirs, names in os.walk(base):
            dirs[:] = [x for x in dirs if x != ".git"]
            # Don't descend into excluded storage dirs.
            dirs[:] = [x for x in dirs
                       if not is_excluded(os.path.join(r, x))]
            for n in names:
                p = os.path.join(r, n)
                if is_excluded(p):
                    continue
                if n.endswith((".md", ".sh", ".ps1", ".json", ".txt")):
                    out.append(p)
    return out


def build_subs(old, new):
    return [
        ("skillator:" + old, "skillator:" + new),
        ("skills/" + old + "/", "skills/" + new + "/"),
        ("`" + old + "`", "`" + new + "`"),
        ("**" + old + "**", "**" + new + "**"),
        ("`/" + old + "`", "`/" + new + "`"),
        ("/" + old + "/SKILL.md", "/" + new + "/SKILL.md"),
        ("hooks/" + old + ".", "hooks/" + new + "."),
        (old + ".sh", new + ".sh"),
        (old + ".ps1", new + ".ps1"),
        ("scenario-" + old, "scenario-" + new),
        ("green-" + old, "green-" + new),
    ]


def apply_subs(s, subs):
    for a, b in subs:
        s = s.replace(a, b)
    return s


def check_no_self_collision(subs):
    """Guard (a): refuse a rename whose mechanical pass is not idempotent.

    The real bug (`hooks/relay.` -> `hooks/r2d2-relay.`, then the unrelated
    `relay.sh` -> `r2d2-relay.sh` rule matching *inside* that output because
    the untouched ".sh" suffix from the original text glued back onto it)
    only shows up once the FULL text is walked through the FULL ordered list
    of substitutions -- checking each rule's output in isolation misses it,
    since neither rule's own replacement text contains the colliding
    pattern; the collision happens at the boundary with text the rule didn't
    touch. So: build one realistic sample string per rule (its own `a`
    pattern, plus the common suffixes those patterns show up with in real
    files, e.g. a bare old name followed by ".sh"/".ps1"), run it through the
    substitution pipeline once, then run the RESULT through the same
    pipeline again. If the second pass changes anything, the first pass
    wasn't idempotent -- some rule matched text another rule's output left
    behind -- and the rename is refused before any file is touched.
    """
    problems = []
    samples = set()
    for a, _ in subs:
        samples.add(a)
        # rstrip: `hooks/<old>.` already ends in a dot; `hooks/<old>..sh` is not the real shape
        samples.add(a.rstrip(".") + ".sh")
        samples.add(a.rstrip(".") + ".ps1")
        samples.add("x/" + a)
    for s in sorted(samples):
        once = apply_subs(s, subs)
        twice = apply_subs(once, subs)
        if once != twice:
            problems.append(
                "substitution pipeline is not idempotent on %r: "
                "pass 1 -> %r, pass 2 -> %r" % (s, once, twice))
    return problems


def plan_baseline_moves(root, old, new):
    moves = []
    for pre in ("scenario", "green"):
        for suf in ("", "-resume", "-v2", "-v3"):
            f = "practice/baselines/%s-%s%s.txt" % (pre, old, suf)
            full = os.path.join(root, f)
            if os.path.isfile(full) and not is_excluded(full):
                moves.append(f)
    return moves


MANUAL_GREP_EXCLUDE_DIRS = (".git",)


def manual_pass_hits(root, old):
    """Grep the whole repo (minus .git and EXCLUDE_PATHS) for the bare old
    name and for `# <old>`-ish heading lines. Returns a list of
    (path, lineno, line) tuples."""
    hits = []
    for r, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in MANUAL_GREP_EXCLUDE_DIRS]
        dirs[:] = [d for d in dirs
                   if not is_excluded(os.path.join(r, d))]
        for n in names:
            p = os.path.join(r, n)
            if is_excluded(p):
                continue
            if not n.endswith((".md", ".sh", ".ps1", ".json", ".txt", ".py")):
                continue
            try:
                text = io.open(p, encoding="utf-8", newline="").read()
            except Exception:
                continue
            for i, line in enumerate(text.split("\n"), start=1):
                if old in line:
                    hits.append((p, i, line))
    return hits


def do_rename(root, old, new, dry_run):
    sk = os.path.join(root, "skills")
    old_dir = os.path.join(sk, old)
    new_dir = os.path.join(sk, new)
    assert os.path.isdir(old_dir), "no such skill: " + old
    assert not os.path.isdir(new_dir), "already exists: " + new
    assert not is_excluded(old_dir), "refusing to touch excluded path: " + old_dir

    subs = build_subs(old, new)
    problems = check_no_self_collision(subs)
    if problems:
        raise AssertionError("guard (a) failed:\n  " + "\n  ".join(problems))

    # hook_moves must be computed against the CURRENT tree (old dir name),
    # since the skill directory hasn't moved yet at plan time.
    hooks_before = os.path.join(old_dir, "hooks")
    hook_moves = []
    if os.path.isdir(hooks_before):
        for n in sorted(os.listdir(hooks_before)):
            stem, dot, ext = n.partition(".")
            if stem == old:
                src = "skills/%s/hooks/%s" % (new, n)
                dst = "skills/%s/hooks/%s%s%s" % (new, new, dot, ext)
                hook_moves.append((src, dst))

    baseline_moves = plan_baseline_moves(root, old, new)

    plan = {
        "skill_move": ("skills/" + old, "skills/" + new),
        "hook_moves": hook_moves,
        "baseline_moves": [
            (f, f.replace("-" + old, "-" + new, 1)) for f in baseline_moves
        ],
    }

    if dry_run:
        print("DRY RUN -- no changes made")
        print("  git mv %s %s" % plan["skill_move"])
        for src, dst in plan["hook_moves"]:
            print("  git mv %s %s" % (src, dst))
        for src, dst in plan["baseline_moves"]:
            print("  git mv %s %s" % (src, dst))

    changed_files = []
    for p in live_files(root):
        try:
            s = io.open(p, encoding="utf-8", newline="").read()
        except Exception:
            continue
        o = s
        for a, b in subs:
            s = s.replace(a, b)
        if s != o:
            changed_files.append(p)
            if not dry_run:
                io.open(p, "w", encoding="utf-8", newline="").write(s)

    if dry_run:
        for p in changed_files:
            print("  edit: %s" % os.path.relpath(p, root))
        print("%-22s -> %-22s  %d files would change" %
              (old, new, len(changed_files)))
        return

    git(root, "mv", "skills/" + old, "skills/" + new)
    for src, dst in hook_moves:
        git(root, "mv", src, dst)
    for src, dst in plan["baseline_moves"]:
        git(root, "mv", src, dst)

    p = os.path.join(sk, new, "SKILL.md")
    lines = io.open(p, encoding="utf-8", newline="").read().split("\n")
    assert lines[1].startswith("name: "), lines[1]
    lines[1] = "name: " + new
    io.open(p, "w", encoding="utf-8", newline="").write("\n".join(lines))

    print("%-22s -> %-22s  %d files" % (old, new, len(changed_files)))


def manual_pass(root, old):
    hits = manual_pass_hits(root, old)
    if hits:
        print("\nMANUAL PASS -- %d remaining reference(s) to %r:" % (len(hits), old))
        for p, i, line in hits:
            print("  %s:%d: %s" % (os.path.relpath(p, root), i, line.strip()))
        return 1
    print("\nMANUAL PASS -- clean, no remaining bare references to %r" % old)
    return 0


# --------------------------------------------------------------------------
# selftest
# --------------------------------------------------------------------------

def _write(path, text):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    io.open(path, "w", encoding="utf-8", newline="").write(text)


def selftest():
    import shutil
    import tempfile

    tmp = tempfile.mkdtemp(prefix="rename-skill-selftest-")
    try:
        # Build a minimal fixture repo.
        subprocess.run(["git", "init", "-q", tmp], check=True)
        subprocess.run(["git", "-C", tmp, "config", "user.email", "t@example.com"])
        subprocess.run(["git", "-C", tmp, "config", "user.name", "t"])

        skill_dir = os.path.join(tmp, "skills", "relay")
        _write(os.path.join(skill_dir, "SKILL.md"),
               "---\nname: relay\n---\n# relay\n\nUse `relay` for things.\n")
        _write(os.path.join(skill_dir, "hooks", "relay.sh"), "#!/bin/sh\necho relay\n")
        _write(os.path.join(tmp, "practice", "baselines", "scenario-relay.txt"),
               "verdict text mentioning relay, historical, untouched\n")
        _write(os.path.join(tmp, "README.md"),
               "See `relay` and hooks/relay.sh and skillator:relay.\n")
        # Storage path that must NOT be touched even though it matches "relay".
        excluded_dir = os.path.join(tmp, ".claude", "handoff-watch")
        _write(os.path.join(excluded_dir, "relay-flag.json"), '{"skill": "relay"}\n')

        subprocess.run(["git", "-C", tmp, "add", "-A"], check=True)
        subprocess.run(["git", "-C", tmp, "commit", "-q", "-m", "init"], check=True)

        # --- Guard (a): self-colliding substitution is refused ---
        old, new = "relay", "r2d2-relay"
        subs = build_subs(old, new)
        problems = check_no_self_collision(subs)
        assert problems, "guard (a) should have flagged relay -> r2d2-relay"
        print("selftest: guard (a) (self-collision) -- OK, refused:")
        print("  " + problems[0])

        # --- Guard (b) + (c) with a safe rename, run as a SUBPROCESS of a
        # copy of this script placed inside the fixture's own
        # practice/scripts/, so a hardcoded ROOT (rather than one derived
        # from __file__) would run against the real repo instead of the
        # fixture and fail these assertions.
        old, new = "relay", "beacon"
        this_script = os.path.abspath(__file__)
        fixture_script = os.path.join(tmp, "practice", "scripts", "rename-skill.py")
        _write(fixture_script,
               io.open(this_script, encoding="utf-8", newline="").read())

        proc = subprocess.run(
            [sys.executable, fixture_script, old, new],
            cwd=tmp, capture_output=True, text=True, encoding="utf-8")
        # main() runs the mechanical rename then the manual-pass grep; the
        # fixture still has an untouched "# relay" heading and baseline
        # prose (guard c below), so a non-zero exit here is expected and is
        # itself evidence the manual pass ran against the FIXTURE tree (a
        # hardcoded ROOT would either error finding skills/relay in the real
        # repo's unrelated tree, or silently rename the wrong repo).
        assert proc.returncode == 1, (
            "fixture-copy run gave unexpected rc=%d (expected 1, from the "
            "manual-pass guard):\nstdout:\n%s\nstderr:\n%s"
            % (proc.returncode, proc.stdout, proc.stderr))
        assert "no such skill: relay" not in proc.stderr, (
            "ROOT was not derived from __file__ -- ran against the wrong repo:\n"
            + proc.stderr)
        print("selftest: ran fixture-local copy of the script via subprocess "
              "(proves ROOT is derived from __file__, not hardcoded)")

        assert os.path.isdir(os.path.join(tmp, "skills", "beacon"))
        assert not os.path.isdir(os.path.join(tmp, "skills", "relay"))
        assert os.path.isfile(os.path.join(tmp, "skills", "beacon", "hooks", "beacon.sh"))
        assert os.path.isfile(
            os.path.join(tmp, "practice", "baselines", "scenario-beacon.txt"))

        readme = io.open(os.path.join(tmp, "README.md"), encoding="utf-8").read()
        assert "beacon" in readme and "skillator:beacon" in readme, readme

        # Guard (b): excluded storage path untouched.
        excluded_file = os.path.join(excluded_dir, "relay-flag.json")
        assert os.path.isfile(excluded_file), "excluded path was moved/deleted!"
        excluded_text = io.open(excluded_file, encoding="utf-8").read()
        assert '"relay"' in excluded_text, (
            "guard (b) failed: excluded storage path was rewritten: " + excluded_text)
        print("selftest: guard (b) (exclusion list) -- OK, "
              ".claude/handoff-watch/ left untouched")

        # Guard (c): manual pass must catch the untouched heading + baseline prose.
        skill_md = io.open(os.path.join(tmp, "skills", "beacon", "SKILL.md"),
                            encoding="utf-8").read()
        assert "# relay" in skill_md, "fixture should still have the old heading"
        rc = manual_pass(tmp, old)
        assert rc != 0, "guard (c) failed: manual pass should have found the heading"
        print("selftest: guard (c) (manual-pass grep) -- OK, "
              "non-zero exit on remaining '# relay' heading and baseline prose")

        print("\nselftest: ALL GUARDS OK")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv):
    if argv[:1] == ["--selftest"]:
        return selftest()

    if len(argv) < 2:
        print(__doc__)
        return 2

    old, new = argv[0], argv[1]
    dry_run = "--dry-run" in argv[2:]

    do_rename(ROOT, old, new, dry_run)
    if dry_run:
        return 0
    return manual_pass(ROOT, old)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
