---
name: rules-orko
description: >-
  Use when the user states how they work - "always X", "never Y", "from now
  on", "stop doing", "I prefer", "in this repo nobody", "we don't" - or asks
  what rules apply here, why a preference was forgotten
  between chats, or how a teammate gets the same conventions. Also at session
  start, to load the standing rules. NOT for a one-off instruction about the
  task in hand, NOT for ticket status (`tickets-zordon`), NOT for host
  settings or hooks (`update-config`).
---

# rules-orko - how the user works, written down

The user says how they want things done. The session ends. The next session,
the next host and the next teammate start from zero, and the user says it
again - until they stop bothering. Orko is the one who remembers: a standing
rule goes on disk the moment it is stated, at the scope it belongs to, and is
read back at the start of every session on every host.

## The rule

```
A STANDING RULE THE USER STATES IS ON DISK BEFORE YOUR NEXT TOOL CALL
```

Standing means the wording reaches past this task: *from now on*, *always*,
*never*, *stop doing*, *in this repo nobody*, *we don't*, *I prefer*. A rule
about the task in hand - *for this fix*, *this time*, *skip the tests today* -
is not one; leave it in the conversation.

Two isolated baseline runs (`practice/baselines/scenario-rules-orko.txt`) each
received two standing rules alongside a two-line task. Both runs did the task
well, ran the tests, committed, and then answered the rules with a promise:

| The run said | Reality |
|---|---|
| "I'll keep running the tests before every commit from now on." | A promise made by a session that ends on that line. The next session never hears it. |
| "I'll ask you before ever changing `store.py`." | Same. The teammate who pulls tomorrow has never heard of the rule at all. |

Neither run wrote a word to disk, and neither argued against doing so - it did
not come up. That is the failure: not refusal, omission. "Noted" is the
symptom.

**Violating the letter of this is violating the spirit of it.** Writing it at
the end of the reply instead of before the next tool call is the omission with
a delay; the end is where sessions get cut off.

## Two scopes, two files

| Scope | File | Follows | Committed |
|---|---|---|---|
| **global** | `~/.skillator/rules.md` (`SKILLATOR_HOME` overrides the directory) | the user, into every project on every host | never |
| **project** | `.skillator/rules.md` at the repo root | the repo, to everyone who pulls it | yes |

**Which scope?** Decide from the wording, not from the mood:

- Says how *this user* works and names nothing of this codebase - *always run
  the tests before you commit*, *never force-push*, *answer in short lines* -
  → **global**.
- Names *this codebase* - a path, a module, a tool this repo uses, "in this
  repo" - *nobody touches `notekeep/store.py` without asking* → **project**.
- Could be either → **ask**, one `AskUserQuestion` (the host's equivalent
  elsewhere - `grayskull-power/references/hosts.md`) with two chips, *global*
  and *project*, and the one-line consequence of each. User unavailable and
  still ambiguous → **global**, said in the reply: a rule that turns out to be
  the repo's is promoted with one line later; a personal habit pushed onto a
  team is not taken back as easily.

A second git user on the same clone changes nothing here. The project file
arrives with their `git pull`; their global file is their own, under their
own home, and this user's personal rules never reach it. Orko never copies
one user's global rules into the project to "share" them, and never writes a
rule the user in front of it did not state.

## Writing one

The script is the only writer - it finds both files, dates the line, names the
author on project rules, and refuses duplicates:

```sh
sh <SKILL>/scripts/rules-orko.sh add global  "always run the tests before committing"
sh <SKILL>/scripts/rules-orko.sh add project "never edit notekeep/store.py without asking"
```

`<SKILL>` is this skill's own directory (`powershell -NoProfile
-ExecutionPolicy Bypass -File "<SKILL>/scripts/rules-orko.ps1" add ...` on
Windows; resolution in [references/scopes.md](references/scopes.md)). Then say
where each rule went and why that scope, in one line each. A project rule
rides in the commit you were already making, or the next one; it is never
pushed on its own - a push is a side effect outside the worktree and stops
for the user like any other.

## Reading them back - session start

`grayskull-power` arms orko on invoke:

```sh
sh <SKILL>/scripts/rules-orko.sh show
```

prints the project rules, then the user's global rules, scope-tagged, plus a
header line that goes into the active-set line (`rules-orko: 2 project · 1
global`). Read both lists before the first task. Every rule in them binds
this session exactly as if the user had just typed it.

**A clash is asked, never settled.** A global rule and a project rule on the
same subject pulling opposite ways - *I always squash* against *this repo
never rewrites history* - is one `AskUserQuestion` per clash, before any work
the clash touches: what the project says, what their global says, which
applies here, and whether to make the answer permanent. Picking the "safer"
one yourself, the project one because it is shared, or the global one because
it is the user's, is the silent resolution this skill forbids. The full
procedure, question shape and a worked example are in
[references/clashes.md](references/clashes.md).

## Red flags - you are about to lose the rule if you think

"I'll remember that" · "noted, will do" · "I'll keep doing X from now on" ·
"I'll mention it in the summary" · "it's obvious which one wins" · "it goes
in CLAUDE.md with the rest" (a personal habit in a committed file is now
every teammate's rule) · "they're away, I'll just follow the project rule".

## Related

- `grayskull-power` - arms orko on invoke and routes a stated rule here
- `tickets-zordon` - work items are tickets, not rules; a rule is how the
  work is done, not what the work is
- `update-config` - a rule that needs a *hook* to be enforced ("every time X,
  run Y") is written here *and* wired there
- [references/scopes.md](references/scopes.md) - the two files, their format,
  path resolution, Windows
- [references/clashes.md](references/clashes.md) - the clash procedure
