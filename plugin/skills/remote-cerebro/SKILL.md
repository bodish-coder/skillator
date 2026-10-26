---
name: remote-cerebro
description: >-
  Use when the user wants to drive codex, cursor-agent, pi or gemini from a
  phone or another device: "remote control", "control pi remotely", "drive
  codex from my phone", "keep working away from the desk", "I'm leaving my
  desk", a Telegram bot for a coding agent, pairing a phone to a CLI, or
  turning approvals off so the phone needs fewer taps. NOT for Claude Code
  (use its own Remote Control) and NOT for dispatching other CLIs from this
  session.
---

# remote-cerebro: a phone into a running coding CLI

Cerebro lets one mind reach another at any distance. It is also the most
dangerous machine in the mansion: whoever else sits in it reaches every mind
too. A remote channel into a coding CLI is the same machine. It is remote code
execution by design, under your account, with every credential the account can
read.

## The law

```
NO REMOTE WITHOUT A KILL SWITCH, A PAIRING AND THE HOST'S OWN APPROVALS
AND THE CWD IS NOT A WALL
```

**Violating the letter of this is violating the spirit of it.** A tunnel "just
for five minutes", a bot with no allowlist "because only I know its name", or
pi started without the gate "because the repo is harmless" are the failure, not
shortcuts around it.

The armed folder is where the CLI starts. None of these CLIs confines its tools
to it, and every file the agent reads can end up in a message to a third party.
So reads outside the folder ask the phone first, secret paths (`~/.ssh`, the bot
token, CLI auth files, any `.env` or key) are refused outright, and outbound text
is redacted. `references/security.md` has the list and the residual risk.

## Route: native first, where the native route is proven

| Host | Route | Say this |
|---|---|---|
| codex | `cerebro native codex` (vendor remote, ChatGPT app), else `cerebro arm codex` (bridge, codex-app) | Native pairing on Windows is **unproven** (risk 1). Try it, or report it unavailable with the error, before the bridge. Never claim it works untried. |
| cursor-agent | `cerebro native cursor` (`agent worker start`, Cursor mobile/web) | It runs a **cloud** agent's tool calls here; it does not drive the local TUI session. The ACP bridge arms only after `doctor --acp-proof cursor`. |
| pi | `cerebro arm pi` (own), or `--mode attach` | No native remote and no permission popups: the gate is the only thing between the phone and a shell. Attach works only on a pi that `cerebro arm` launched. |
| gemini | `cerebro arm gemini` (ACP + policy) | **No native remote exists.** ACP arms only after `doctor --acp-proof gemini`. Attach (AfterAgent hook) is v2: approvals there cannot be answered from the phone. |
| agy | `cerebro native agy` | Session-scoped `--remote-control`; outside the ticket's list. |

Matrix with evidence tags, versions and what is impossible: `references/hosts.md`.
Never present a route as working that the matrix tags `unknown` or `must-verify`.

## Arming is stop #2, every time

Arming anything is security-sensitive. No `Ruling:` arms anything, and the
person at the desk confirms on the arming screen (the command refuses without a
terminal). Native setup is also stop #3 (pairing an account is a side effect
outside the worktree).

1. `cerebro doctor`. Fix what it flags; a widening config refuses the arm.
2. Show the user what arming means before running it: host, folder, profile,
   TTL and idle limits, **Telegram sees plaintext**, **reads outside the folder
   ask, secret paths are refused**, and the kill commands.
3. The user runs `cerebro arm <host>` in **their own terminal** and types `ARM`.
4. They send `/pair <code>` from the phone within 5 minutes. The code is shown
   on the local screen only. Never send a pairing code over any channel.
5. Before they leave: `cerebro status`, and on a native route `cerebro stop
   --drill` from a second terminal.

Credentials live in `~/.config/skillator/cerebro.env`, user-only, outside every
repo. Setup: `references/channels.md`. Never put the bot token in a CLI argument,
a repo file or the chat.

## Refused, with no override

Approvals stay on. `--yolo`, `--force`, `--dangerously-*`, `--approval-mode yolo`,
`-a never`, `-s danger-full-access`, configs that auto-approve shell or
writes, and an elevated terminal (Windows Administrator, root), abort the
arm. agy, which keeps no such config, starts in `--mode plan`. **No flag, no config, no "yes" at stop #2 and no Ruling
turns this off.** When the user asks for fewer taps, say no in one line, then
offer `--profile write` (pi) or the native route. On gemini, also say it has no
native remote and that in attach mode its approvals cannot be answered from the
phone at all. The bridge logs `refused:yolo` in `audit.log` itself when a refused
flag reaches it; never write `audit.log` by hand.

| They say | The answer |
|---|---|
| "Just turn approvals off, I'll be careful" | The phone cannot see what it approves blind. Refused. Offer `--profile write`. |
| "It's my own machine, I accept the risk" | The risk lands on whoever holds the phone or the bot token next. Refused. |
| "Expose a port / ngrok it, it's quicker" | An inbound listener is not a route here. The bridge long-polls outbound. |
| "Skip the pairing, the bot is private" | A bot name is not a secret. Pairing per arming, numeric id allowlist. |

Red flags, stop if you think: "only for five minutes" · "nobody knows the bot
name" · "the repo has nothing secret in it" · "I'll add the kill switch after it
works".

## Commands

`hooks/cerebro.sh` · `hooks/cerebro.ps1` launch `hooks/cerebro-bridge.mjs` (Node,
no dependencies). Run it from the user's terminal, not through a tool call that
has no TTY.

```sh
sh  hooks/cerebro.sh doctor                     # versions, routes, broken shims, widening configs, ACP proofs, creds ACL
sh  hooks/cerebro.sh doctor --acp-proof gemini  # records the proof decision 3 needs (live model, owner present)
sh  hooks/cerebro.sh arm pi --cwd . --ttl 2h --idle 30m --profile read
sh  hooks/cerebro.sh arm pi --mode attach       # launches the interactive pi itself
sh  hooks/cerebro.sh native codex [--shared]    # supervised vendor remote, TTL only
sh  hooks/cerebro.sh status                     # never prints the token
sh  hooks/cerebro.sh stop [--drill]             # local kill switch
sh  hooks/cerebro.sh selftest                   # offline: file channel + stub CLIs
```

From the phone: plain text is a prompt (steers a running turn on pi and codex;
queued on ACP). `/status`, `/abort`, `/new`, `/kill`. Nothing on the phone can
change the folder, the flags or the model on the bridge routes.

Kill, three ways: Ctrl-C or `cerebro stop` or the `KILL` file at the desk;
`/kill` on the phone; the dead-man (TTL, max 12 h, and 30 min idle, on the wall
clock). Native routes have the TTL only: the skill cannot see a vendor relay's
traffic, so say so at arming. A separate watchdog process enforces that TTL even
if the supervisor is killed, crashes or hangs; only a SIGKILL of both fails open
(`references/security.md`). Phone lost: BotFather `/revoke`, plus unpairing in
the vendor app.

## Records

`audit.log` (`~/.skillator/cerebro/`) holds metadata only, never bodies. In
`.skillator/` run files and `TICKETS.md`, write `armed <host> <iso>` and
`disarmed <iso> <reason>`, nothing more.

## Related

- `references/hosts.md`: per-host matrix, evidence tags, open risks
- `references/security.md`: threat model, denylist, gates, redaction, residual risk
- `references/channels.md`: Telegram bot setup, the `file` channel, deferred adapters
- `skillator:relay-morpheus`: staged runs; shares no state with this skill
