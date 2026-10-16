# The route hook — a feature prompt lands on build-jarvis (Claude Code)

`hooks/feature-route.sh` (Windows: `hooks/feature-route.ps1`) is a Claude Code
`UserPromptSubmit` hook. It reads the prompt, and when the prompt reads as a
feature — a build verb opening a request, "log a feature", an F ticket being
worked — it prints one `additionalContext` JSON object, which Claude Code adds
to the turn as its own context block:

```
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"skillator route (build-jarvis hook): this prompt is a feature request. Your first action is the Skill tool with skill skillator:build-jarvis - ..."}}
```

The route also says that once build-jarvis has loaded, the first reply text is
its `grade:` line, before the design-file Write and any Agent call, and that
the same line then opens the design file and every Agent prompt (A119). The
body's Step 0.7 says the same, but in F39 rounds 3a-4 direct prompts printed
the grade only in the final report, 0/6; the hook's line sits in the turn's own
context, read at the decision point.

JSON, not plain stdout: plain stdout reaches the model too, but prefixed
`UserPromptSubmit hook success:`, and a probe model asked to quote any line
beginning `skillator route` read past it; the JSON form it quoted back
(claude-code 2.1.300, 2026-10-15).

Anything else — a bug, a git chore, adding tests, a question — prints nothing.
The veto is checked before the F-ticket and build-verb patterns (only "log a
feature" beats it), and it fires on a git verb opening a sentence ("push it",
"merge the branch") or failure phrasing ("is failing", "crashes"), never on a
bare noun ("add error handling", "support push notifications"). A newline is a
sentence break. It never blocks a prompt and always exits 0. It exists for the bare direct
request: in F39's GREEN the description plus `tickets-zordon`'s hand-off routed
4/4 board and headless-ticket prompts to build-jarvis, but 0/2 direct "add X"
prompts loaded any skill (`practice/baselines/green-build-jarvis-f39.txt`).

## Install

Nothing installs it for you; `grayskull-power`'s arming checks it on Claude Code
and offers it in one line, never silently. Use **forward slashes** in every
path. Add to `~/.claude/settings.json` (all projects) or a project's
`.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/feature-route.ps1\" -Mode hook", "timeout": 5 } ] }
    ]
  }
}
```

- `<SKILL>` is this skill's directory (`.../skills/build-jarvis`).
- POSIX: `"command": "sh <SKILL>/hooks/feature-route.sh"`.
- Merge into an existing `UserPromptSubmit` array rather than replacing it.

## Verify

```
sh <SKILL>/hooks/feature-route.sh selftest
powershell -NoProfile -ExecutionPolicy Bypass -File <SKILL>/hooks/feature-route.ps1 -Mode selftest
```

Both print `ok`. They run the same table of prompts (fourteen feature-shaped,
eighteen not, plus a two-line prompt), feed event JSON through the hook path
(escaped quotes, an escaped newline, a nested `prompt` key that must not be
read, a `cwd` full of build words that must not match, bad and empty stdin),
check the route text
needs no JSON escaping and still orders the grade line first, and check the script is pure ASCII with LF endings.
The two print the same bytes for the same event. `classify "<text>"` (`-Mode classify -Text`) shows
the verdict for one prompt.

## The grade gate (A119)

The route's text was still read past: with it, direct prompts printed the grade
before spending 1/2 (direct-2, critical, narrated and dispatched first).
`hooks/grade-gate.sh` (Windows: `hooks/grade-gate.ps1`) is a `PreToolUse` hook
on `Agent|Task|Write|Edit|MultiEdit|NotebookEdit`. It reads the session transcript named in the event:
after the last assistant `Skill` call naming build-jarvis, if no assistant text
block has a line starting `grade:`, it denies the call with the reason "print
your one grade: line as reply text first ... then make this call again".
Thinking and the skill body (a user line) do not count. No build-jarvis load,
a missing or unreadable transcript, bad stdin: it prints nothing and allows.
Replayed on the F39/A119 direct transcripts cut at their first spend, it
denies both failing direct-2 runs and allows the passing direct-1.
Not gated: Bash and PowerShell - reading the code before the grade is allowed,
and a shell write is not told apart from a read. The text block and the tool
call of one message may reach the transcript in either order, so a grade
printed in the same message can be denied once; the reason says retry.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Agent|Task|Write|Edit|MultiEdit|NotebookEdit", "hooks": [ { "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/grade-gate.ps1\" -Mode hook", "timeout": 5 } ] }
    ]
  }
}
```

POSIX: `"command": "sh <SKILL>/hooks/grade-gate.sh"`. Verify with
`grade-gate.sh selftest` / `grade-gate.ps1 -Mode selftest` (both print `ok`);
`check <transcript>` (`-Mode check -Path`) prints `deny` or `-` for one file.

## Other hosts

Codex's `hooks.json` lists `UserPromptSubmit` and an `additionalContext`
output, but which events may emit it is not stated by the binary
(`PLATFORMS.md`, codex hooks) — unproven, so not wired. Everywhere else the
description and `grayskull-power`'s routing table are the route.
