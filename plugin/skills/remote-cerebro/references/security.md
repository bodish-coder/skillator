# remote-cerebro security, in operating form

The asset is a shell on the user's machine under the user's account, and every
credential that account can read. Plan for: anyone who learns the bot token;
anyone who can message the bot or tap an old button; a lost or unlocked phone;
Telegram or the vendor relay reading everything sent to the phone; and the agent
itself doing what nobody meant, including reading a secret into a reply.

## Who can send

- One numeric Telegram user id (`CEREBRO_TG_USER`). Usernames are refused: they
  change hands.
- Private chat only. Group, channel, forwarded and edited messages are dropped
  and logged `dropped:<reason>`, never answered.
- A 6-digit pairing code per arming, shown on the local screen only, sent as
  `/pair <code>` within 5 minutes. Three wrong codes disarm. Updates dated before
  the arm time are dropped; the stored `update_id` offset (one per channel: per bot,
  per file-channel folder) stops replay.
- Button taps (`callback_query`) carry only a 128-bit single-use nonce. A tap is
  honoured only from the allowlisted id, in the paired private chat, for a pending,
  unused nonce. Anything else gets "expired" and `dropped:stale-callback`. A nonce
  dies on first use, at the 10-minute timeout (deny), at `/abort`, `/kill` and
  disarm, and its buttons are removed. Only **allow once** and **deny** are ever
  offered: no host's "always allow".
- Native routes inherit the vendor's account, MFA and pairing. Pairing codes never
  go over any channel.

## The secret-path denylist (hard deny, no prompt)

The truth is `SECRET_HOME_PATHS` in `hooks/cerebro-core.mjs`; the gemini policy is
generated from the same module. Under the user's home:

`.ssh` · `.gnupg` · `.aws` · `.azure` · `.config/gcloud` · `.kube` ·
`.docker/config.json` · `.npmrc` · `.netrc` · `.git-credentials` · `.config/gh` ·
`.config/skillator` (the bot token) · `.skillator/cerebro` (arm token, audit log,
backups) · `$CODEX_HOME/auth.json` and every `.codex*/auth.json` ·
`.cursor/cli-config.json` (`authInfo`) · `.gemini/oauth_creds.json`,
`google_accounts.json`, `settings.json`, `.env` · `.pi/agent/auth.json` ·
`.claude.json` and every `.claude*/.credentials.json` · Chrome, Edge, Brave and
Firefox profile folders.

Anywhere, including inside the armed folder: `.env`, `.env.*`, `*.pem`, `*.key`,
`*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.ppk`, `*.kdbx`, `*.tfstate`, `id_*`,
`.npmrc`, `.netrc`, `.pgpass`, `.git-credentials`, `.pypirc`, `.htpasswd`,
`.dockercfg`, `credentials`, `credentials.json|yml|yaml`, `kubeconfig`,
`terraform.tfvars`, `secret(s).yml|yaml|json|toml|env|ini`, `service-account*.json`,
and any path through a folder named `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`
or `.password-store`.

Local additions, one path per line: `~/.config/skillator/cerebro-deny.txt`. The
phone can never add or remove entries.

### How a path is read: every spelling a host would open

The gate does not classify the string; it classifies **every path the host could
open for that string** (`pathCandidates` in `cerebro-core.mjs`), under both the
armed home and the process's own home. Secret if **any** spelling is secret;
inside the folder only if **all** are. Each spelling is checked as typed and as
resolved (`..`, symlinks, junctions, 8.3 short names, through the longest
existing prefix). Mirrored from the installed hosts:

- **pi 0.74.2** (`dist/core/tools/path-utils.js`): `expandPath` strips one
  leading `@` (`normalizeAtPrefix`), maps Unicode spaces to a space
  (`normalizeUnicodeSpaces`), expands `~` and `~/` with `os.homedir()`;
  `resolveReadPath` also tries the AM/PM, NFD and curly-quote variants.
- **gemini-cli 0.57.0**: NULs stripped; `resolveDefensiveToolPath` strips `@` and
  then leading slashes; `resolveToRealPath` turns `file://` URLs into paths and
  percent-decodes.
- **codex 0.162**: approval requests carry paths codex already resolved; the
  command string is shell text, scanned token by token with the same rules.
- cerebro's own: `$HOME`, `%USERPROFILE%`, `$CODEX_HOME`, `$APPDATA`,
  `$LOCALAPPDATA` and `~\` are expanded; Git-Bash `/c/...` is read both ways.
- Windows: `\\?\X:\` and `\\.\X:\` lose the prefix, `\\?\UNC\` becomes UNC; an
  NTFS stream suffix (`name::$DATA`) and trailing dots and spaces are dropped as
  Win32 would. Case folds on Windows and macOS.

**Refused outright, whatever they point at** (`unnormalizable-path`, logged
`refused`): every other device-namespace path (`\\?\GLOBALROOT\...`,
`\\?\Volume{...}`, `\\.\pipe\...`, `\??\...`), every UNC path (`\\host\share`,
`//host/share`, admin shares such as `\\localhost\C$`, `\\127.0.0.1\C$`,
`\\<this machine>\C$`), a `file:` URL that does not parse, and a path component
that is only dots and spaces. Deny by default: a spelling cerebro cannot map onto
the denylist is never sent to the phone as an "ask".

## The gates

**pi** (`hooks/pi-cerebro.ts`, new code on `tool_call`, deny by default). The
bridge scrubs every `CEREBRO_*` variable from the child's environment, then puts
back exactly four for the gate: `CEREBRO_MODE` (`own` or `attach`),
`CEREBRO_CWD`, `CEREBRO_PROFILE`, `CEREBRO_HOME`; never the bot token. The
extension deletes them from `process.env` before any tool runs. **Without a valid
mode the extension blocks every tool** (fail closed): a lost environment, a hand
run `pi -e`, or a stray copy in an auto-discovery folder cannot run tools ungated.
The selftest drives own mode through the real `Bridge.startChild` with the real
extension loaded in the child (SEC1), not a hand-set mode.

| Tool | Rule |
|---|---|
| `read` `grep` `find` `ls` | device or UNC spelling: block. Secret: block. Resolved path outside the folder: ask. `grep` over a folder holding secret files, or one too big or too deep (over 3000 entries or 8 levels) to prove clean: ask, saying so. A `grep` glob aimed at a secret name: block. Otherwise allow. |
| `bash` | a literal secret path in the command: block. Otherwise ask, showing the command. |
| `edit` `write` | secret target: block. Otherwise ask, showing the path. |
| anything else | block (extension, MCP or custom tool) |

Profile `read` (the default) launches pi with `--tools read,grep,find,ls`, so
bash, edit and write do not exist. `write` must be passed at the desk.
`--no-extensions` keeps project extensions from registering an ungated tool.

**gemini** (`hooks/cerebro-gemini.toml`, generated; selftest fails if it drifts):
priority 999 deny on secret paths for every file and shell tool; `ask_user` for
the read tools, shell, write, replace and `web_fetch`; `ask_user` for every MCP
tool. The bridge then auto-allows a read request only when every path is inside
the folder and not secret.

**ACP and codex-app approvals** (bridge `requestPolicy`): any secret, device or
UNC path in the request, or a secret literal in its command: deny, logged
`refused:secret-path` / `refused:unnormalizable-path`, the phone told. A search
(gemini `grep_search`, cursor search) inside the folder is auto-allowed only when
the folder provably holds no secret file; otherwise it asks, like pi's `grep`.
A request that carries a command is never auto-allowed, whatever kind the host
labels it (ACP kinds are agent-supplied hints): it is treated as execute.
Codex grants are shown and checked whole: an `item/permissions/requestApproval`
shows every field (each `fileSystem` read/write path and entry, `network`, any
other key, the model's reason marked as model-written), and every path is checked
as a grant; a `fileChange` `grantRoot` (writes under that root for the rest of the
session) is shown and checked the same way. A grant path that is a secret, or a
folder that **contains** a secret root (the home folder holds `~/.ssh`), is
denied (`refused:grant-contains-secret`) without reaching the phone; a grant
cerebro cannot read in full is declined. Allow returns exactly the grant shown.
Profile `read` is read-only on every host: edits, executes, extra permissions
**and codex command approvals** (a command asking to leave the read-only sandbox)
are denied without reaching the phone. Everything else goes to the phone.

## Refused, no override

`--yolo`, `-y`, `--force`, `-f`, `--dangerously-*`, `--approval-mode yolo`, `-a
never`, `-s danger-full-access`, `-c approval_policy=never`, `-c
sandbox_mode=danger-full-access`, `--allowed-tools`, `--full-auto`, a `ws://0.0.0.0`
listener, and cursor's `--computer-use`, `--share-desktop`, `--connect-workspace`,
`--sync-dashboard-secrets`, `--mint-github-token`. The CLI refuses them as its own
flags (exit 3, `refused:yolo` in `audit.log`) and every spawn line is re-checked.

Widening configs abort the arm (failure mode 7): gemini
`general.defaultApprovalMode` other than `default`, a non-empty `tools.allowed`, a
user or workspace policy with ANY `allow` rule (deny by default: shell, edit, write,
`web_fetch`, the read tools and MCP tools alike; no allow rule is permitted); codex
`approval_policy = "never"` or `sandbox_mode = "danger-full-access"` anywhere in
`config.toml`; cursor `cli-config.json` with a blanket `permissions.allow` (`*`,
`Shell(*)`, `Write(**)`), an `approvalMode` outside `default|ask|manual|prompt|request`
(unknown values refuse: the unsafe set was not pinned from cursor's docs), or a
disabled sandbox.

## No secrets in transit or logs

- **Redaction** before every send and ask: the bot token; the value of every
  environment variable whose name contains `KEY`, `TOKEN`, `SECRET`, `PASSW`,
  `PASSPHRASE`, `CREDENTIAL`, `PRIVATE`, `COOKIE`, `DSN` or ends `_PAT` (6+
  characters; not `PWD`); PEM and PGP private-key blocks (`... KEY-----`, `... KEY
  BLOCK-----`) and base64-encoded PEM; `sk-...`, Stripe `sk_live_`/`rk_live_`,
  `ghp_`/`github_pat_`, GitLab `glpat-`, npm `npm_`, Hugging Face `hf_`, Google
  `AIza...`, `AKIA`/`ASIA` key ids, Slack `xox?-`, JWTs, `Bearer ...`, Telegram bot
  tokens; the password in `scheme://user:password@host`; and the value of any
  `name = value` / `name: value` whose name says secret, password, passphrase,
  token, api key, access key, private key or credential (this is what catches
  `aws_secret_access_key=...`), quoted values with spaces included; a YAML block
  value under such a key (`password: |`); `--password x` style flags;
  `Authorization: Basic ...`; XML elements named that way. Replaced by
  `[redacted:<kind>]`. The bot token and every env secret are also matched in
  their JSON-escaped, URL-encoded (`%3A`, lower-case hex, `+` for space) and
  base64 / base64url spellings (all three byte alignments inside a longer base64
  run). Token prefixes (`ghp_`, `glpat-`, `npm_`, `AIza`, `sk_live_` ...) match even
  glued to other text. A host's non-JSON stdout line is redacted whole **before**
  it is cut to 120 characters, so a secret straddling the cut cannot leak its head.
  Not covered: a secret split across two separate lines or messages, and any
  encoding not listed here (hex, gzip, a secret the agent re-types with changes).
- **Scrubbed child environment:** every `CEREBRO_*` variable is removed before the
  CLI starts; the four gate keys above are put back for pi only; the extension
  deletes them (and the attach nonce) from `process.env` before any tool runs.
- **Audit log** `~/.skillator/cerebro/audit.log`: time, direction, kind, sender
  id, byte length, reason. `prompt` and `reply` add a 16-hex HMAC keyed per arming
  and discarded at disarm. Never a body. `pair` and `answer` carry no hash. A
  `/command` is recorded by class (`/status`, `/abort`, `/new`, `/kill`, `/pair`,
  or `other`), never the typed token: a secret pasted after a slash is a body.
- **State folder** `~/.skillator/cerebro/`: created `0700` on POSIX (an older
  looser folder is tightened at arming); its files `0600`. On Windows Node does not
  apply modes: the folder inherits the ACL of the user profile (you, SYSTEM,
  Administrators in a default profile), and nothing more is done to it.
- **Attach-mode channel** (bridge <-> pi extension): no file ever holds a prompt,
  ask or reply body. The bridge listens on a local socket: on Windows a named pipe
  with a random 128-bit name (`\\.\pipe\cerebro-<hex>`), elsewhere a Unix socket
  (`0600`) inside a `0700` folder (`~/.skillator/cerebro/ipc/`, or a private
  `mkdtemp` folder if that path is too long for a socket). The extension's first
  line must be the arm token (256-bit, from `arm.token`, user-only) and the bridge
  sends nothing to a connection before it, accepts one authenticated connection
  per arming, and drops everything else. Messages wait in memory until the
  extension connects. Windows ACL, plainly: a named pipe Node creates gets the
  default pipe DACL (full control for you, SYSTEM and Administrators; **read**
  access for Everyone and anonymous). Another local account can therefore open
  the pipe, but it cannot send the token it does not have, and a connection that
  has not sent it receives nothing. The `ipc/` folder is cleared at arming, at
  disarm, by the orphan cleanup and by `cerebro stop` (older versions left
  plaintext body files there; those are deleted too).
- **Attach-mode `mirror.log`** (`~/.skillator/cerebro/mirror.log`, the desk's live
  view while pi owns the terminal): metadata only (`[REMOTE] <- (prompt, 41
  bytes)`), never a prompt, ask or reply body; recreated user-only (`0600`) at each
  arming and deleted at disarm. In own mode the same lines go to the bridge's own
  terminal, redacted, and are not written to disk. On Windows `0600` is not
  enforced by Node: the file inherits the ACL of `~/.skillator`, which is
  user-only in a default profile.
- **The `file` channel** is a test channel: same user, local disk only. The arm
  refuses a UNC or other network folder (decided from the string, before any
  filesystem call), a folder owned by another user, or one any other account can
  read or write (POSIX: mode `& 077`; Windows: any ACE beyond you, SYSTEM and
  Administrators). Anything that can drop a JSON file in `inbox/` with the right
  `from.id` drives the agent: `CEREBRO_FILE_USER` is not a secret.
- Output: the final text per turn, chunked at 4096, capped at 20 chunks; one
  status line per tool; never tool output, never attachments.

## Bounds and the dead-man

TTL (default 2 h, max 12 h) and idle (30 min without an inbound message), both on
the wall clock and checked before any backlog runs. A message that arrived while
the laptop slept is echoed back ("received while asleep, resend to run"), not
executed. 20 inbound messages in 10 minutes disarm. One lock per machine
(`~/.skillator/cerebro/lock`); a stale lock's orphan child is killed, its arm token
deleted and any codex `requirements.toml` restored before the new arming. The
lock is taken atomically: a new lock is published whole (a hard link of a written
temp file), and a stale one is replaced only by the process holding a takeover
mutex (an exclusive `mkdir`) and only while the lock still holds the exact bytes
it judged stale, so two near-simultaneous armings cannot both win, nobody deletes
a lock it did not create, and only one of them runs the orphan cleanup. `cerebro
stop` removes the lock only if it is still the one it read. Kill:
Ctrl-C, `cerebro stop`, the `KILL` file, `/kill`, TTL, idle. A crashed child is
reported and not restarted.

**The dead-man does not wait on the host.** TTL, idle, the pairing window and the
`KILL` file are checked by their own timer (every 0.25 s), not only inside the
poll loop, so a host rpc or channel call that never returns cannot hold them
off. Control rpcs (`initialize`, `session/new`, `thread/start`, `turn/*`) time
out after 60 s; every pending rpc is rejected when the child exits or is killed
(a whole ACP turn, `session/prompt`, has no timeout but still rejects on exit).
Commands from the phone that call the host (`/new`, `/abort`, `/status`) run
detached from the poll loop, and the host is started in the background with
prompts held in memory until it is up, so a stalled host never stops `/kill`
from being read. Selftest SEC16 drives this with a stub host that never answers.

**Teardown kills the child tree.** Windows: `taskkill /T /F` (follows the
parent-pid chain; selftest CMD-kill-cmd-shim). POSIX: the hosts start every
shell command in a **new** process group or session (pi `detached: true`, gemini
`detached` + node-pty `setsid`), so killing the host's group is not enough.
Teardown first sends the host its abort (`abort` / `session/cancel` /
`turn/interrupt`), then `killTreePosix`: snapshot the whole process table (Linux
`/proc/*/stat`: pid, ppid, pgrp, session; macOS/BSD `ps -A -o pid,ppid,pgid`),
collect every descendant of the host, SIGTERM the host and give it 1.5 s to reap
what it tracks, re-snapshot, then SIGKILL every process group and (Linux) every
session any descendant was in, which reaches commands that double-forked and were
reparented to init, then every descendant and the host. It never signals pid 0/1,
cerebro itself, or cerebro's own group or session.
**Not executed on POSIX, plainly:** this was written and checked on Windows. The
descendant walk and kill order are unit-tested against a fake process table
(SEC17: setsid shell, its child, double-forked members of its session, a second
detached command, an unrelated process, cerebro's own session); no real Linux or
macOS process was killed by it, and the `/proc` and `ps` readers have not run.
Known gaps even when it runs: on macOS/BSD there is no portable session-id column,
so only the parent chain and process groups are followed (a double-forked command
that left its group and was reparented before the snapshot is missed there); on
any POSIX system a process that left both the tree (reparented) and every
recorded group and session before the first snapshot is invisible to it.

**No kill by bare pid.** A pid is a number the OS hands out again. Whenever
cerebro starts a process it records its start time next to the pid (Linux: boot
id + `/proc/<pid>/stat` starttime; macOS/BSD: `ps -o lstart`; Windows:
`Process.StartTime`), and the lock records the bridge's own. Teardown clears
`childPid`. `cerebro stop` and the orphan cleanup kill a child only while the
state still says `armed` **and** the pid's start time still matches; they kill
the lock holder only if its start time matches. Otherwise they say "not killed:
pid reused / identity never recorded, check by hand" and leave it. On the bridge
routes the start time is read in the background (about a second on Windows);
a bridge that dies inside that second leaves a child `stop` will not kill, but
pi, ACP and codex app-server children exit on stdin EOF anyway.

Native routes: TTL only (the relay's traffic is invisible), stated at arming.
Embedded codex teardown kills only its own child. The shared route lists threads
and asks before `remote-control stop`; at TTL with nobody at the desk it only runs
`daemon disable-remote-control` and logs that the daemon was left running.

### The native dead-man, and where it still fails open

The TTL of a native route is enforced by two processes:

1. **The supervisor** (`cerebro native`, `runNative`) ticks once a second. Ctrl-C
   writes the `KILL` file (an attended stop). SIGTERM, SIGHUP (the terminal tab
   closed), SIGBREAK and any uncaught exception or unhandled rejection run an
   unattended teardown first and exit after it (`installDeadman`).
2. **The watchdog** (`cerebro watchdog`, started by the supervisor, detached: its
   own session on POSIX, so closing the terminal does not reach it) polls every
   0.5 s. Supervisor gone (SIGKILL, a native crash, OOM): tear down at once. Past
   `expiresAt` plus 5 s: tear down. Supervisor alive but its heartbeat 30 s stale
   (wedged; not counted across a laptop sleep): tear down. Teardown is the
   orphan cleanup above (identity-checked kill, codex `requirements.toml`
   restored, `disable-remote-control` / `agy remote-control stop` for the
   daemon routes), then the supervisor is killed and the lock removed. It exits as
   soon as the state is no longer armed or belongs to a newer arming.

Selftested end to end with the supervisor in its own process (SEC6-SEC9): killed
with SIGKILL, sent SIGHUP and SIGTERM, crashed, and wedged past its TTL.

**What still fails open, plainly:**

- **SIGKILL of both** the supervisor and the watchdog (`kill -9` of both pids,
  `pkill -9 node`, `taskkill /F /T` on the supervisor's tree on Windows, where
  the watchdog is a descendant): the native child keeps the vendor route open
  with no TTL until someone runs `cerebro stop` (which then works, identity
  checked) or reboots.
- Up to 0.5 s (one poll) after the supervisor dies, and up to 5 s past the TTL,
  the route is still open.
- A power loss or reboot ends the children, but leaves a codex
  `requirements.toml` modified (tighter, not looser: each key is the user's own
  list intersected with cerebro's limit, and an empty intersection refuses to
  arm) until the next `cerebro stop` or arming restores it.
- Anything the vendor runs outside this machine (the relay, a cloud agent, a
  shared codex daemon started as a service) is outside both processes' reach;
  only `disable-remote-control`, `remote-control stop` and the vendor app's
  unpairing end it.

## Residual risk, said at arming

- A bash command can read a secret by a route the literal filter misses. It still
  needs the phone's approval, and its output still goes through redaction.
- codex's sandbox may read outside the folder without an approval request (risk
  11): `cat ~/.ssh/...` inside codex's read-only sandbox never reaches cerebro.
  The gate sees only commands that ask to leave the sandbox (denied under
  profile `read`); redaction is the only line for what the sandbox reads.
- A secret that matches no pattern and is in no environment variable reaches
  Telegram if the agent prints it. Redaction is the second line; the denylist is
  the first.
- Telegram's servers see prompts and replies in plaintext.
