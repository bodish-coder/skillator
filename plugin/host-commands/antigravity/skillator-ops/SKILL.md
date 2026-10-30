---
name: skillator-ops
description: Open the ops board (TICKETS.md board, runs, health, messages, explorer, build) for this repo in a new terminal tab
---
From the repo root, run `ops --open` if `ops` is a command in your shell. It usually is
not (an agent's shell does not load the user's profile), so then run the installed script
by path - on Windows:
`powershell -NoProfile -ExecutionPolicy Bypass -File "{{SKILLS}}/ops-board/ops/ops.ps1" -Repo <repo root> -Open`,
elsewhere: `sh "{{SKILLS}}/ops-board/ops/ops.sh" <repo root> --open`.
Never without `-Open` / `--open`: a bare board opens a separate console window. Then say
one line: where it opened, or the error it printed. It reads; it never edits the board.
