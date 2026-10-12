# remote-cerebro hosts: what can be driven from a phone, and how

Tags: `verified` = run on the build machine or read in the tool's shipped docs or
binary · `inferred` = follows from what was read, not exercised · `guessed` =
neither · **must-verify** = blocks a claim until run. Versions probed 2026-10-11:
`codex-cli 0.162.1`, `cursor-agent 2026.10.01-e373342`, `pi 0.74.2`, `gemini
0.57.0`, `agy 1.3.1`. `cerebro doctor` prints what is installed today; when a
version moves, re-read the row before trusting it.

"Own" = the bridge starts the CLI in its protocol mode. "Attach" = drive a session
already open at the desk. "Native" = the vendor's own remote, run under the
cerebro supervisor (TTL, teardown, checklist).

| Host | Route | Verdict | Evidence |
|---|---|---|---|
| codex | native: `codex remote-control --no-daemon --json` (embedded, preferred) or `remote-control start` (shared daemon) + ChatGPT app | **unknown until risk 1**: experimental; OpenAI's page says setup starts in the ChatGPT desktop app by QR and "you can't set it up from the Codex CLI"; Windows pairing unproven | surface `verified`; end to end **must-verify** |
| codex | own: bridge to `codex app-server --listen stdio://`, `approval_policy=on-request`, sandbox `read-only` / `workspace-write` | works offline against the stub; approvals are structured (`item/*/requestApproval`) | protocol `verified` (generated v2 schema); live run **must-verify** |
| cursor-agent | native: `agent worker start --worker-dir <cwd> --idle-release-timeout 1800`, Cloud Agent from Cursor mobile/web | **works, caveat**: a cloud agent loop whose tool calls run here, not the local TUI; Windows worker and plan requirements unproven (risk 2) | surface `verified`; behaviour `inferred` |
| cursor-agent | own: bridge to `agent acp` | **unknown until risk 3**; ships, but `arm` refuses until `doctor --acp-proof cursor` records the proof | exists `verified` |
| cursor-agent | attach: `stop` hook `followup_message` | v2; CLI support not documented, `loop_limit` 5 | **must-verify** (risk 5) |
| pi | own: bridge to `pi --mode rpc --no-extensions -e pi-cerebro.ts --tools ...` | **works** (offline, stub): steer, abort, dialogs as `extension_ui_request` | `verified` docs (`rpc.md`); live **must-verify** |
| pi | attach: `cerebro arm pi --mode attach` launches the interactive pi with the extension | **works** (offline, mock pi API): the closest to Claude Remote Control; only a pi that cerebro launched | `verified` docs (`extensions.md`); live **must-verify** |
| gemini | own: bridge to `gemini --acp --approval-mode default --policy cerebro-gemini.toml` | **unknown until risk 3**; ships, `arm` refuses until `doctor --acp-proof gemini` | docs `verified`; `ask_user` reaching ACP `inferred` |
| gemini | attach: `AfterAgent` hook, `decision:"deny"` + `reason` as the next prompt | v2, shipped disabled; turn-end only, **approvals cannot be answered from the phone**, blocks the desk while waiting | docs `verified`; behaviour **must-verify** (risk 4) |
| gemini | native | **not possible**: no remote, server or daemon option in 0.57.0 | `verified` |
| agy | native: session-scoped `agy --remote-control`; `agy remote-control stop` at teardown | works (outside the ticket's list) | surface `verified` |

## Where it cannot be done

1. gemini has no native remote. Only the bridge drives it.
2. Attaching to a pi, gemini or cursor session started before cerebro was armed:
   none has an IPC endpoint to adopt (`inferred`). For pi it is also refused by
   design: the extension needs a fresh arm token and the nonce `arm` put in its
   own environment.
3. Answering gemini approvals from the phone in attach mode: the Notification hook
   is observe-only (`verified`).
4. Cursor's local TUI session, natively: the native route is a cloud agent.
5. A pty/TUI mirror on Windows: no tmux; winpty is fragile.
6. prime-agent: not installed, not probed, not claimed.

## Host notes the code depends on

- **cursor on Windows:** the Git-Bash `cursor-agent` shim prints Node's version and
  help (`verified` defect). `which()` only accepts PATHEXT names on Windows, so
  cerebro runs `cursor-agent.cmd` / `agent.exe`; `doctor` flags the shim.
- **`.cmd` shims** (codex, pi, gemini, cursor npm installs) run through `cmd.exe
  /d /s /c`; arguments carrying `% ^ & | < > "` are refused, not quoted. Prompts
  travel on stdin, never argv. `taskkill /T /F` reaching the grandchild through a
  shim is selftested (risk 10).
- **codex v2 protocol:** no `"jsonrpc"` field; `initialize` then `initialized`,
  `thread/start {cwd, approvalPolicy, sandbox}`, `turn/start`, `turn/steer
  {expectedTurnId}`, `turn/interrupt`. `AskForApproval` is `untrusted |
  on-request | never` (no `on-failure`). Answers are `accept` / `decline` only;
  `acceptForSession` and exec-policy amendments are never sent.
- **codex `requirements.toml`:** written to `$CODEX_HOME/requirements.toml`
  while a native codex route is armed (`allowed_approval_policies = ["untrusted",
  "on-request"]`, `allowed_sandbox_modes = ["read-only", "workspace-write"]`) and
  restored byte for byte at teardown, or deleted if it did not exist. A user file
  is only ever narrowed: each key becomes the user's own list intersected with
  that limit (a stricter `["read-only"]` stays `["read-only"]`); if the
  intersection is empty (`["never"]`, `["danger-full-access"]`) arming is refused
  and the file is not touched. The backup
  sits in `~/.skillator/cerebro/` first, so `cerebro stop` restores it after a
  crash. That codex reads this path, and that it binds phone-created threads, is
  `inferred` (risk 1).
- **codex `agents --json`** output format is `guessed`; the supervisor falls back
  to counting lines.
- **pi tools:** `read`, `grep`, `find`, `ls`, `edit`, `write` all take `path`
  (`verified` from the shipped tool schemas); `bash` takes `command`.
- **gemini tools** (`reference/tools.md`): reads `read_file`, `read_many_files`,
  `glob`, `grep_search`, `list_directory`; writes `run_shell_command`,
  `write_file`, `replace`; plus `web_fetch`. Which policy tier `--policy` loads
  into is not documented (risk 3).
- **ACP:** wire methods `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/update`, `session/request_permission` (`inferred`
  from the ACP spec; gemini's page names `newSession`, `prompt`, `cancel`). Only
  `allow_once` / `reject_once` options are ever picked.

## Open risks (must-verify, owner present, stop #2)

1. codex native pairing on Windows: embedded and shared routes, each with the
   desktop-app QR flow and `remote-control pair`; whether a TUI session shows as a
   daemon thread; whether a phone thread can pick `never`; whether
   `requirements.toml` stops it.
2. cursor `agent worker start` on Windows, the plan it needs, how mobile picks "My
   Machines".
3. ACP permission flow and read gating for gemini and cursor: capture one real
   `session/request_permission` each; confirm `ask_user` reaches ACP and the deny
   `argsPattern` blocks a secret. `doctor --acp-proof <host>` records it.
4. gemini `AfterAgent` deny+reason as a remote feed.
5. cursor `stop` hook `followup_message` in the CLI.
6. Telegram limits (4096 characters, 64-byte `callback_data`, plaintext bot chats).
7. No self-hosted channel yet.
11. codex sandboxed reads without an approval request (residual risk on the
    arming screen).
12. Windows path forms: junctions, symlinks, 8.3 names, `\\?\`, case folding,
    Git-Bash `/c/...` and NTFS streams are selftested against the denylist; the
    device and UNC forms (`\\?\GLOBALROOT`, `\\.\pipe`, `\??\`, `\\localhost\C$`,
    any `\\host\share`) are refused outright. pi's `@` prefix and Unicode spaces
    and gemini's `file://` and percent-encoding are mirrored too (SEC3, SEC12).
