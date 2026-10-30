# remote-cerebro hosts: what can be driven from a phone, and how

Support levels and evidence live in the canonical [remote-route ledger](../../../PLATFORMS.md#remote-routes).
This file describes routes and risks. **Surface inspected** means help, schema,
shipped docs or binary text was inspected; it never means a live remote session.
**Tested with stubs** means offline protocol/lifecycle behavior only. A live
claim needs a real host/version, date and durable record of the named capability;
pairing, skill loading and hook trust are independent.

Historical surface probes, 2026-10-11: `codex-cli 0.162.1`,
`cursor-agent 2026.10.01-e373342`, `pi 0.74.2`, `gemini 0.57.0`, `agy 1.3.1`.
These are not live-pairing versions. `cerebro doctor` reports the installed
version; changed versions need new evidence.

"Own" = the bridge starts the CLI in its protocol mode. "Attach" = drive a session
already open at the desk. "Native" = the vendor's own remote, run under the
cerebro supervisor (TTL, teardown, checklist).

| Host | Route | Support and limitation |
|---|---|---|
| codex | native: `codex remote-control --no-daemon --json` or `remote-control start` + ChatGPT app | **tested with stubs**: supervisor lifecycle only; Windows QR/pairing and phone-thread restrictions unverified. |
| codex | own: `codex app-server --listen stdio://` | **tested with stubs**: structured approvals; real protocol round trip and phone pairing unverified. |
| cursor-agent | native: `agent worker start` (options before `start`) | **tested with stubs**: lifecycle; Windows worker, plan requirements and mobile selection unverified. Intended cloud worker route, not local TUI attachment. |
| cursor-agent | own: `agent acp` | **tested with stubs**; `arm` requires real permission/read-gating proof from `doctor --acp-proof cursor`. |
| cursor-agent | attach: `stop` hook `followup_message` | **unverified gap**: v2 proposal; CLI support not established, documented loop limit 5. |
| pi | own: `pi --mode rpc --no-extensions -e pi-cerebro.ts --tools ...` | **tested with stubs**: steer, abort and dialogs; real Pi/phone round trip unverified. |
| pi | attach: `cerebro arm pi --mode attach` | **tested with stubs** (mock Pi API); only a Pi session cerebro launched, real attach unverified. |
| gemini | own: `gemini --acp --approval-mode default --policy cerebro-gemini.toml` | **tested with stubs**; `arm` requires real permission/read-gating proof from `doctor --acp-proof gemini`. |
| gemini | attach: `AfterAgent` deny + reason | **implemented**, disabled v2 route; real feed unverified, turn-end only, approvals cannot be answered from phone. |
| gemini | native | **not implemented** in this adapter; historical 0.57.0 help had no native remote option. |
| agy | native: `agy --remote-control --mode plan`; `agy remote-control stop` | **tested with stubs**. Historical 1.4.2 arm/teardown was reported 2026-10-19, without a linked durable live record. Phone pairing/mode enforcement remains unverified; phone may switch mode (A134). |

The canonical ledger links the committed bridge, supervisor, extension and test
sources. A reported arm/teardown alone would not prove phone pairing even with
a durable record. No live run was performed for this documentation review.

## Where it cannot be done

1. This adapter implements no Gemini native remote; use its bridge route, subject to the proof gate.
2. Attaching to a pi, gemini or cursor session started before cerebro was armed:
   none has an IPC endpoint to adopt (`inferred`). For pi it is also refused by
   design: the extension needs a fresh arm token and the nonce `arm` put in its
   own environment.
3. Answering gemini approvals from the phone in attach mode: the Notification hook
   is observe-only (`surface inspected`).
4. Cursor's local TUI session, natively: the native route is a cloud agent.
5. A pty/TUI mirror on Windows: no tmux; winpty is fragile.
6. prime-agent: not installed, not probed, not claimed.

## Host notes the code depends on

- **cursor on Windows:** every `cursor-agent.exe` / `agent.exe` in
  `%LOCALAPPDATA%\cursor-agent` is the bundled Node (prints `v24.5.0`); only
  `cursor-agent.cmd` is the CLI (`surface inspected`, 2026.10.12-d47ca18). cerebro looks up
  `cursor-agent.cmd` only, has no bare `agent` fallback (`~/.grok/bin/agent.exe`
  is another CLI), and refuses an arm whose binary reports a Node version.
  `worker` options go before `start` (`agent worker [options] start`, `surface inspected`
  from help; A133).
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
  (`surface inspected` from the shipped tool schemas); `bash` takes `command`.
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
