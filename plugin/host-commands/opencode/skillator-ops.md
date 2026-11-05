---
description: Open the ops board (TICKETS.md board, runs, health, messages, explorer, build) for this repo
---
If the argument is `terminal` (or `--open`):
Open the ops board in a new terminal tab. From the repo root, run on Windows:
`powershell -NoProfile -ExecutionPolicy Bypass -File "{{SKILLS}}/ops-board/ops/ops.ps1" -Repo <repo root> -Open`
elsewhere:
`sh "{{SKILLS}}/ops-board/ops/ops.sh" <repo root> --open`
Then say one line: where it opened, or the error it printed. It reads; it never edits the board.

Otherwise (bare `/ops`, or a tab name like `tickets`, `workflows`, `health`, `messages`, `explorer`, `build`):
Display the ops board frame right here in the opencode app. From the repo root, run on Windows:
`powershell -NoProfile -ExecutionPolicy Bypass -File "{{SKILLS}}/ops-board/ops/ops.ps1" -Repo <repo root> --once $ARGUMENTS`
elsewhere:
`sh "{{SKILLS}}/ops-board/ops/ops.sh" <repo root> --once $ARGUMENTS`
Paste what it outputs, unchanged. It reads; it never edits the board.
