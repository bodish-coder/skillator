# Handoff — skill testing campaign (A51–A58)

**Written:** 2026-09-05, at the 97% usage gate. **Branch:** `main`, clean tree.
**Head:** `f8b9a99`. **Nothing pushed** — three commits sit local.

## Why this session existed

A9 had closed the skill-testing pass with most of it void: three RED baselines
(`handoff`, `grayskull-power`, `sherlock-codes`) ran from inside this repo and
inherited `.skillator/grayskull.md`, and per A47 a contaminated RED that
*complies* cannot be told from the project file that fed it. This session re-ran
those, then tested the rest of the library.

## Verified state — checked against the repo, not from memory

| Ticket | State | What actually landed |
|---|---|---|
| A51 | `[x]` | 3 REDs re-run from a clean cwd. sherlock VIOLATED (health score at `AUDIT.md:3`, unasked `git mv` restructure committed as `b27f328`, `file:line` evidence stripped). grayskull VIOLATED (edited with no blast-radius line, no verified/inferred/guessed tags). handoff COMPLIED. |
| A52 | `[x]` | 13 skills shape-classified first — only 7 are Discipline. 7 REDs: **5 violated** (`live-build`, `merge-prep`, `deploy-niyoj`, `skill-smith`, and `deploy-wizard` on its no-push rule), 2 complied (`merge-agent`, `design-arwen`). |
| A53 | `[x]` | handoff RED on a 99-file fixture, 6 claims planted 2-true/4-false. COMPLIED again, more thoroughly. Rule is **unfalsifiable on this model** — recorded as unfalsified, explicitly NOT unnecessary. |
| A54 | `[x]` | `skill-smith:46` said "Three shapes" over a four-row table. Fixed. |
| A55 | `[x]` | Blocker dissolved. 5 GREEN tasks: prime/mid/lite/handoff-resume **PASS**, `func-ui` **FAIL**. |
| A56 | `[x]` | `testing.md` now says a baseline is per **rule**, not per skill. Earned by deploy-wizard holding one rule and breaking another in one run. |
| A57 | `[ ]` | **Open.** Skills do not auto-invoke in a bare `claude -p`. |
| A58 | `[ ]` | **Open.** `func-ui` fails its GREEN test. |
| A33 | `[>]` | Deferred, untouched — needs an interactive Codex session or a build newer than codex-cli 0.153.2. |

Board: **2 open · 1 deferred · 66 closed · 69 total.** No in-flight agent work —
every background run completed and is graded; nothing was left undescribed.

## The harness, which is the reusable part

`practice/baselines/README.md` carries both, with the reasoning:

- **RED** — headless `claude -p` from a throwaway fixture *outside* this repo,
  with `--disallowed-tools Skill`. That flag is mandatory: a probe confirmed all
  19 skillator skills are invocable from any cwd, so without it RED can load the
  skill under test.
- **GREEN** — `--plugin-dir` + `--add-dir` on a prefix built by `git archive
  HEAD` with `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and `.skillator/` removed.
  The skills read `PRACTICE.md` at the *plugin root*, not the cwd, so the canon
  resolves while the cwd stays clean. `--plugin-dir` alone is not enough — the
  sandbox blocks the plugin root.
- **Residual, unfixable today:** `~/.claude/CLAUDE.md` still loads. It states
  none of the tested rules, but its ledger/reporting style is visible in
  transcripts. Per the asymmetry rule a violation stays valid; a compliance
  needs the caveat (this is why `design-arwen`'s pass is marked weak).

## Next, in order

1. **A57 first — it gates the rest.** Until it is settled, every future GREEN
   must prove invocation via `--output-format stream-json`, or it grades a skill
   that never loaded. Decide: explicit invocation required, or does the plugin
   need its own always-on router entry for bare hosts?
2. **A58.** Per `testing.md` Meta, rule out buried-rule and competing-instruction
   before rewording. The likely hole: `func-ui`'s sign-off gate defines no
   behaviour for a user who has declared themselves away — the same no-user
   branch A45 added to `design-arwen`.
3. **`design-arwen`'s pass is weak evidence.** Re-run from a config dir without
   `~/.claude/CLAUDE.md` when one is available.
4. Optional: GREEN runs for the 5 skills whose REDs violated in A52 — the rules
   are earned but not shown to hold.

## Resuming the in-flight-style work

Fixtures and transcripts are in a **session-scoped scratchpad** that will not
survive: `SCRATCH/a51/` — `plugin-under-test/`, `fix-*/` (fixtures), `red2-*/`,
`green-*/`, `g2-*/`, `g3-*/` (run copies), `runs/*.out|jsonl` (transcripts).
The *scenarios* are committed at `practice/baselines/scenario-*.txt`; the
fixtures are not, and the build commands are in this session's history only.

To redo an A58 run from scratch: build a Vite-ish mockup fixture (hardcoded
array page, a `console.log` button handler, a `const connected = true` badge, an
api client whose endpoints the express server does not implement), then:

```sh
cd "$FIXTURE" && claude -p "$(cat practice/baselines/scenario-...)" \
  --plugin-dir "$CLEAN_PREFIX" --add-dir "$CLEAN_PREFIX" \
  --permission-mode bypassPermissions --output-format stream-json --verbose
```

`green-func-ui.txt` and `green-handoff-resume.txt` were **not** committed —
recreate them from the A55 section of `practice/baselines/README.md`, or rewrite
them; they are ordinary GREEN task prompts with no pressure stacking.

## Honest limits

- No GREEN for the 7 Discipline skills — REDs only. Their rules are earned, not
  shown to hold.
- `handoff`'s unfalsifiable result is model-specific and not a licence to trim it.
- Grading of prime/mid/lite used artifacts on disk plus each run's own
  who-did-what table. The per-subagent `model` field was not independently
  captured; those three runs did not use stream-json.
