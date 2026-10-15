# The route hook — a feature prompt lands on build-jarvis (Claude Code)

`hooks/feature-route.sh` (Windows: `hooks/feature-route.ps1`) is a Claude Code
`UserPromptSubmit` hook. It reads the prompt, and when the prompt reads as a
feature — a build verb opening a request, "log a feature", an F ticket being
worked — it prints one `additionalContext` JSON object, which Claude Code adds
to the turn as its own context block:

```
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"skillator route (build-jarvis hook): this prompt is a feature request. Your first action is the Skill tool with skill skillator:build-jarvis - ..."}}
```

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
needs no JSON escaping, and check the script is pure ASCII with LF endings.
The two print the same bytes for the same event. `classify "<text>"` (`-Mode classify -Text`) shows
the verdict for one prompt.

## Other hosts

Codex's `hooks.json` lists `UserPromptSubmit` and an `additionalContext`
output, but which events may emit it is not stated by the binary
(`PLATFORMS.md`, codex hooks) — unproven, so not wired. Everywhere else the
description and `grayskull-power`'s routing table are the route.
