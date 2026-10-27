# F114 implementation and baseline preflight

Date: 2026-10-27. Read-only preflight; the only created/changed file is this report. No paid runs, source edits, index changes, commits, board changes, lease changes, credential reads, or external file moves were performed. CodeGraph was consulted first for imgdiff/parity/tests; the run worktree has no own index. A read-only diff confirmed those source files match main, making main's CodeGraph source applicable. Shell and Markdown were read directly after the graph lookup.

## Verdict

Implementable after the orchestrator rules on findings 1–3 below. The five-run verification should use the isolated local profile described below and explicitly report a **different host configuration**. Do not copy or execute the old `trim.sh`. Description D is exactly 80 whitespace-separated words. The existing signatures and test classes support the proposed changes without new production dependencies or scripts.

## Substantive findings

1. **Verified: orientation algorithm contradicts the promised full-page web behavior.** Design line 33 says 1440x3000 web captures do not trip orientation. The proposed `platform_report` at lines 183–195 compares `h > w` against the default 1440x900 orientation. Executing that exact function in memory with two 1440x3000 images returns `['original', 'clone']`; 390x844 mobile web does the same. This is not an aspect-ratio corner case: a PNG cannot reveal its browser viewport height. **Recommended ruling:** retain platform metadata for all four platforms; exempt `web` from orientation warnings, document why, and retain the simple advisory default-orientation check for Android/iOS/Windows. Add regression cases for tall web, mobile web, retina web, square images and native mismatch. This supersedes Q-F114-2's advice to drop `--platform` on mobile web. Alternatively limit the documented promise to viewport-only screenshots, but then explicitly abandon full-page/mobile-web platform validation.

2. **Verified: legacy parity JSON changes without the new flag.** Current `parity.py:134–155` emits visual entries with `file`, `score`, `mode`. Design line 268 unconditionally adds `platform: ""`, and `combine` returns those entries, violating CONSTRAINTS' unchanged no-flag output. Its new compatibility test supplies `visuals=[]`, so misses this. **Recommended ruling:** add the visual platform property only when an input JSON contains a meaningful platform name; use `v.get('platform')` in mixed-platform collection. Assert exact legacy JSON/text with one or more legacy visual reports. Interpret compatibility as no flag + legacy inputs; tagged visual inputs may display their newly supplied metadata even without the report flag, as DESIGN requests. Add the explicitly required two-different-visual-platforms/no-report-platform case; the two prescribed tests do not cover it. Preserve `--fail-under` feature/must-have semantics, including a passing matrix with only a platform warning.

3. **Verified: do not reuse old external trimming mechanics.** The live `C:/Users/Ikran/.claude-bodish/skills` is now a **Junction** to `C:/Users/Ikran/.claude/skills`, not the former ordinary directory. It has 150 child directories including `.trash`; `skills.a157-resynced` also exists beside it. The historical restoration target of 149 visible entries is not a sufficient identity/integrity check. Old `trim.sh:5–9` uses an unguarded move into a potentially existing destination; its INT/TERM/HUP traps restore but do not exit, and its restore message succeeds even if restoration did not. `drive2.sh` ends with `echo "rc=$?"`, masking a failed runner behind exit 0. **Ruling proposed:** replace the trim workflow with a local isolated profile, no live junction move, no live instruction-file rename. Use real exit status and result/init gates before proceeding to another run.

4. **Verified: checkout assumptions are stale, but the merge prerequisite remains.** At inspection, run HEAD was `9c4da388a596c2bf30008ae51fba245e89ec9023`, main `38443416b4cf438f0abb32c7d62e012cd5739952`, and run status was clean. Design's `d79cce6`/`399dd15` and pre-existing dirty-file list are historical. `git merge-base --is-ancestor 1f1935c HEAD` returned 1 in the run; its A157 file has no trimmed-host appendix. Recheck current status/merge base before the orchestrator merges main. Preserve F110's `skill-prometheus` text in UPSTREAM.md. Do not assume the former zero-conflict calculation still proves the new merge.

5. **Verified: two deterministic documentation checks are wrong as written.** Task 3's `tr '\n' ' '` review-sentence check preserves YAML indentation, so the prescribed literal sentence fails even for exact D; normalizing all whitespace makes it pass. The existing parity reference has four commands: adding one flag to each yields four matching lines, not the claimed five, unless another explanatory flag sentence is deliberately added. Also escape the `|` characters in platform choices inside SKILL.md's Markdown table cells. These are verification/rendering corrections, not added feature scope.

6. **Verified/inferred: capture wording needs a small host correction.** The specified Android binary redirection is a Git Bash/POSIX command; label its shell so a Windows PowerShell 5.1 user does not use its text redirection for PNG bytes. The Windows row can simply recommend Win+Shift+S/Snipping Tool. `PrintWindow` is not a `System.Drawing` method or an already-existing snippet; avoid promising an unspecified ten-line snippet installed on every machine. No added script is needed. The iOS metadata route should mention the supplied-device/listing fallback too, or describe `capture` explicitly as a suggested route rather than provenance of the actual PNG.

7. **Verified: record results conditionally.** Task 6's proposed A157 closure text says the Done line is met even though its inserted verdict allows `loaded NO`. Only close after the new reviews run actually loads; otherwise record the regression and leave completion pending. Do not combine A's historical 1/1 with D's failure to claim D passed. Scenarios use fictional store links: grade loading separately from successful navigation/capture, which is not proved by these prompts.

## Existing baseline evidence and exact paths

Historical scratch directory:

`C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/147ee797-591f-4b4f-98fa-687ea69de7d9/scratchpad/a157`

Present files inspected: `drive2.sh` (1,135 bytes), `trim.sh` (976 bytes), `t3.jsonl`, plus `prefix0`, `prefix1`, `prefix2` and the old fixture/run files. `drive2.sh` hard-codes the **main checkout** harness; replace that with the run-worktree harness for F114.

The saved `t3.jsonl` system/init record proves 62 skills and model `claude-sonnet-5-5`. It includes 30 `skillator:*` skills, 13 `anthropic-skills:*` skills, and 19 other names. Its plugins include inline skillator, **code-review, security-guidance, rust-analyzer-lsp**, and builtin plugins. Its MCP names are `ake`, `omniroute`, `scrapling`, `rea`, `anything-api`, `rea-wsl`, `claude.ai Claude Docs`. Thus the description “every other user plugin off” is false for that historical run. The driver disables six specific plugins, omitting those three; it also does not disable synced skills/MCPs.

Current CLI: **2.1.311** (`claude --version`), historical 2.1.310. Current shell environment names only `CLAUDE_CONFIG_DIR=C:/Users/Ikran/.claude-bodish` among the relevant auth variables; no `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN` was present. No credential value was read. `claude --help` verifies support for `--setting-sources`, `--settings`, `--plugin-dir`, `--strict-mcp-config`, and `--no-session-persistence`. It also explicitly says `--bare` does not read OAuth, so bare mode is not an interchangeable fix for this subscription-authenticated host.

## Concrete isolated-profile plan — prepare locally, then run separately

The following are **proposed commands/artifacts**, not executed preparation. The task's write scope was this report only. Parent's later preference for `.skillator/baselines/F114` replaces the original external trim proposal.

Use these exact roots:

```text
W = C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104
R = C:/tools/Projects/skillator2/.skillator/baselines/F114
H = W/plugin/practice/scripts/baseline-harness.sh
R/profile/                 isolated CLI config, no skills/agents/plugins copied in
R/prefix/                  immutable harness prefix from the F114 commit
R/fixtures/p-web/          fresh odo fixture
R/fixtures/p-android/
R/fixtures/p-ios/
R/fixtures/p-windows/
R/fixtures/r-reviews/
R/logs/                    JSONL, stderr, exit/result summaries
R/settings.json            explicit permissions and isolation settings
R/empty-mcp.json            {"mcpServers":{}}
R/drive-local.sh            corrected local driver
R/run-local.ps1             process-environment/auth wrapper
R/evidence/                old init inventory, source/fixture hashes, commands
```

Before constructing R, require it absent (or choose a new explicitly numbered sibling), resolve its absolute path within the repo, and make it ignored **without editing repo git state** by placing a local `R/.gitignore` containing `*`. `git check-ignore` must confirm the profile/settings/log paths are ignored before introducing any auth or transcript content. No credentials should be stored there by this plan. Prefix and fixture creation are local reversible work; they can precede authorization/execution of paid runs. Creating fixture git repositories is preparation, not a baseline result.

Git Bash preparation after F114 commits, with all path variables assigned to the literal roots above:

```sh
git -C "$W" diff --quiet HEAD -- plugin/skills/clone-odo
sh "$H" prefix "$R/prefix" > "$R/evidence/prefix-path.txt" 2> "$R/evidence/prefix-build.err"
sh "$H" verify-prefix "$R/prefix"
for id in p-web p-android p-ios p-windows r-reviews; do
  sh "$H" fixture odo "$R/fixtures/$id"
  git -C "$R/fixtures/$id" rev-parse HEAD > "$R/evidence/$id.fixture-sha.txt"
done
sh "$H" settings "$R/prefix" > "$R/settings.base.json"
```

Record `git -C "$W" rev-parse HEAD` and prefix manifest hash. Parse each of the five committed scenarios with `harness scenario`; assert the emitted prompt never contains `clone-odo`. Compare prefix clone-odo bytes to the worktree, and inspect prefix stderr for overlays (clone-odo must be clean). Prefix creation must not overlay uncommitted clone-odo code. Preserve original no-platform JSON/text from before implementation in the implementer's ordinary regression verification.

Merge the harness settings JSON with this explicit isolation overlay using a JSON writer, not textual interpolation:

```json
{
  "enabledPlugins": {},
  "autoMemoryEnabled": false,
  "claudeMdExcludes": ["**"],
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": {"instructionFiles": "managed-only"}
    }
  }
}
```

Keep the harness `permissions` including prefix write denials. Use `--setting-sources ''` to avoid user/project/local settings and their plugin lists; keep explicit `--settings` and `--plugin-dir`. Exclusion of ancestor instructions matters because fixtures now sit **inside this repository**, whose CLAUDE.md/AGENTS.md otherwise route directly to grayskull-power. `managed-only` plus glob exclusion prevents ordinary startup and later discovered instruction files; managed policy still applies and must be recorded if present. Do not disable bundled skills merely to force a desired count.

Official current documentation supports the selected config-directory and instruction-exclusion settings, but **their combined discovery behavior has not been runtime-proved here**. Keep that limitation visible: [settings/config directory](https://code.claude.com/docs/en/settings), [instruction exclusions and managed-only](https://code.claude.com/docs/en/memory#exclude-specific-claudemd-files), [skill sources and syncing](https://code.claude.com/docs/en/skills#where-synced-skills-load). Excluding the user setting source also prevents cloud skill syncing. A CLI init inventory is still the operational evidence, not a model's statement about its prompt.

For each run, the local driver changes to the exact fixture directory, loads the scenario prompt from the worktree, and runs this command with a real exit-code capture:

```sh
BASELINE_ISOLATE=off sh "$H" run 900 "$R/prefix" claude -p "$PROMPT" \
  --model sonnet --plugin-dir "$R/prefix" --add-dir "$R/prefix" \
  --setting-sources '' --settings "$R/settings.json" \
  --strict-mcp-config --mcp-config "$R/empty-mcp.json" \
  --permission-mode acceptEdits --no-session-persistence \
  --output-format stream-json --verbose > "$R/logs/$ID.jsonl" 2> "$R/logs/$ID.err"
rc=$?
printf '%s\n' "$rc" > "$R/logs/$ID.exit"
exit "$rc"
```

The wrapper must run the command with error handling that reaches `rc=$?`; do not let `set -e` bypass recording. The explicit settings carry the same permission allow-list the old driver used. `BASELINE_ISOLATE=off` is deliberate: the existing harness's `hide` mode hard-codes `$HOME/.claude/CLAUDE.md`, ignoring `CLAUDE_CONFIG_DIR`. Here instruction isolation is supplied by the new profile/settings, **not** by harness hide. Record the harness's “ISOLATION OFF” stderr verbatim with this explanation; do not relabel it as historical hide evidence or alter the harness.

The PowerShell wrapper sets `CLAUDE_CONFIG_DIR` to `R/profile` for the child process, restores the original process environment in `finally`, and uses the explicit `C:/Program Files/Git/bin/bash.exe` (the `bash.exe` first on PATH is Windows' WSL launcher). No HOME/CODEX_HOME repurposing. Invoke the reviewed local driver with discrete arguments, not an `Invoke-Expression` string.

### Authentication prerequisite and external-path inventory

An empty profile does not inherit the current stored login automatically. Choose one supported route before the paid launch:

- Preferred unattended route if authorized by the orchestrator: a PowerShell wrapper reads **only** `C:/Users/Ikran/.claude-bodish/.credentials.json`, parses its existing `claudeAiOauth.accessToken` into the child process's `CLAUDE_CODE_OAUTH_TOKEN`, and never prints, persists, passes in argv, or copies that value. Validate presence/expiry in memory, emitting only pass/fail. Restore/remove the process environment variable in `finally`; no credential refresh writes to the source profile. The expected field must be checked at execution; it was not inspected here. If missing/expired, stop before any model run.
- Otherwise an isolated-profile login is required; do not silently copy `.credentials.json`/`.claude.json`, symlink them, switch to bare/API billing, or launch an unauthenticated paid round. `claude auth status --text` under the isolated wrapper is the non-model auth gate; retain only a sanitized status, not account details.

Proposed external **mutation paths: none**. External read paths are the historical scratch evidence above, the CLI binary `C:/Users/Ikran/.local/bin/claude.exe`, and, only for the explicitly selected auth route, `C:/Users/Ikran/.claude-bodish/.credentials.json`. The live paths `C:/Users/Ikran/.claude-bodish/skills`, its target `C:/Users/Ikran/.claude/skills`, `skills.a157-resynced`, `C:/Users/Ikran/.claude/CLAUDE.md`, and its `.skillator-hidden[.owner]` siblings are never moved/written. Managed CLI policy may still be read normally. All profile state/log writes belong under R; verify this assumption before claiming isolation.

Restoration safeguards: snapshot the junction's LinkType/Target and instruction-file hash before/after for evidence; assert no hidden siblings appear; use no live skills backup destination at all. Restore only process environment in `finally`; never perform recursive cleanup against any user directory or junction target. If a run fails, leave local logs for review and stop the queue. A hard kill can leave local profile/log state but cannot strand the live skills directory or CLAUDE.md because this route does not rename either.

### Five-run order, gates, and truthful equivalence

1. `p-web`: `scenario-clone-odo-platform-web.txt`.
2. `p-android`: `scenario-clone-odo-platform-android.txt`.
3. `p-ios`: `scenario-clone-odo-platform-ios.txt`.
4. `p-windows`: `scenario-clone-odo-platform-windows.txt`.
5. `r-reviews`: `scenario-clone-odo-reviews.txt` with description D supplied by the prefix, **no extra skill-naming prompt prefix**.

Strictly sequential. For each, require real rc=0, exactly one system/init, a non-error result record, no harness timeout, and unchanged prefix. Check init skills **on every run**, not only the first: fewer than 100 and `skillator:clone-odo` present. Extract old t3's sorted `.skills` and compare against new init; save added/removed names and model/plugin/MCP lists. Count equality alone is not equivalence. Capture first tool call, Skill invocations, turns, raw total_cost_usd, fixture SHA, prefix commit, CLI version, and secondary route/viewport mention. Grade:

```jq
select(.type=="assistant") | .message.content[]? |
select(.type=="tool_use" and .name=="Skill") | .input.skill
```

The current prefix has also undergone F110's skill rename; historical inventory contains `skillator:skill-smith`. Together with the CLI/config/plugin/MCP differences, there is no basis to claim exact historical 62-skill equivalence without live inventory/context evidence. **Recommended record:** “description D on isolated-profile host, N skills, CLI 2.1.311; differs from A157 t3's 62-skill trimmed live profile.” Compare rates descriptively, not as a controlled A-versus-D experiment. A future exact-host control would require additional runs outside this five-run plan.

A platform gets one fresh second attempt only after a completed valid first run fails to load (max four retries). Infrastructure/auth/discovery errors are invalid runs, not load failures. New retries get distinct `fixtures/p-<platform>-2` and logs. Pass requires each platform at least 1/2 and the D reviews run loaded. Record any 0/2/NO honestly; do not perform description changes or additional rounds without the orchestrator's next ruling. Five successful first attempts complete the baseline round.

## Implementer dispatch scope and remaining checks

One fresh implementer, Tasks 1–5 only, after the orchestrator's current-base merge and rulings. Scope is the design's 13 clone-odo files (including two tests and comment-only runner headers) plus four scenarios and pending green file; clean-room remains byte-identical. Task 6 and all paid runs stay with the orchestrator. Additional tests needed for the correctness findings can change the design's exact 61-test count; verify success rather than enforce the old count.

Before commit: both runner selftests; Python suite; normalized 80-word/review-sentence checks; doc/platform consistency and escaped table cells; clean-room unchanged; routing, grayskull-sync, muse-manifest and baseline-harness selftests; upstream check separately records network/error/changed outcomes rather than calling them unchanged. Regression sweep and staged-diff review remain required. No upstream network check or full test suite was executed in this preflight; current green-floor evidence must come from the implementer/orchestrator.

Checks performed here: worktree/main revision/status/diff reads; A157 ancestor/file check; CodeGraph current source/test reads; complete design read; in-memory execution of proposed orientation helper and description normalization/count; historical driver/init inspection; current CLI help/version; live junction metadata and plugin-key inspection; auth-variable **presence only**. The in-memory orientation and whitespace probes reproduced the reported failures without modifying source.
