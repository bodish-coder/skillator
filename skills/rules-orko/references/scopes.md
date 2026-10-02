# The two files - format, resolution, hosts

SKILL.md states the law: one standing rule, one scope, on disk before the next
tool call. This is what the files look like and where the script finds them.

## Resolution

| Scope | Path | Resolved from |
|---|---|---|
| global | `$SKILLATOR_HOME/rules.md`, else `$HOME/.skillator/rules.md` (`%USERPROFILE%\.skillator\rules.md` on Windows) | the environment - the same file for every repo this user opens on this machine |
| project | `<git toplevel>/.skillator/rules.md`; outside git, `./.skillator/rules.md` | `git rev-parse --show-toplevel` from the cwd, so it is right from a subdirectory too |

`rules-orko.sh paths` prints both, resolved. `SKILLATOR_HOME` exists for
tests and for a user who keeps their dotfiles elsewhere; in a test it points
at a temp dir so no run writes into a real home.

The project file sits beside `.skillator/grayskull.md` and
`.skillator/run-*.md` on purpose: everything skillator persists for a repo
lives under one committed directory.

## Format

Both files are Markdown with one header and one rule per `- ` line. The
script owns the header and the trailing stamp; nothing else is parsed.

```markdown
# Rules - project

How this codebase is worked on, for everyone who pulls it. Committed with
the repo. rules-orko reads it at session start; rules-orko.sh add project
"<rule>" appends to it. A personal habit does not belong here - it goes to
~/.skillator/rules.md, which follows its owner and nobody else.

- never edit notekeep/store.py without asking (Ada, 2026-10-02)
- migrations are generated, never hand-written (Bob, 2026-10-03)
```

```markdown
# Rules - global

How this user works, in every project, on every host. Personal: this file
lives outside every repo and is never committed. rules-orko reads it at
session start; rules-orko.sh add global "<rule>" appends to it.

- always run the tests before committing (2026-10-02)
```

A project line carries `(who, date)` - `git config user.name`, falling back to
the email, then `unknown` - so a teammate reading it knows whom to ask. A
global line carries the date only; the file has one owner.

Editing by hand is fine - it is a text file - but the script is the writer an
agent uses: it creates the header, dates the line, refuses an exact duplicate
at the same scope (`already a global rule, nothing added`), and reminds you to
commit a project rule.

## `show`

```
rules-orko: project 1 (C:/work/notekeep/.skillator/rules.md) . global 1 (C:/Users/ada/.skillator/rules.md) . user Ada
project: never edit notekeep/store.py without asking (Ada, 2026-10-02)
global:  always run the tests before committing (2026-10-02)
```

The first line is the one that goes into grayskull-power's active-set line,
shortened: `rules-orko: 1 project · 1 global`. An absent file reads
`(<path>, absent)` and counts 0 - a fresh clone with no project rules is not
an error. When both scopes have rules, stderr carries one reminder line that a
clash check is the agent's job, not the script's.

## Classifying - more examples

| Said | Scope | Why |
|---|---|---|
| "from now on run the tests before you commit" | global | the user's habit; no path, no repo |
| "never force-push, anywhere" | global | "anywhere" |
| "keep replies short, no preamble" | global | about the user, not the code |
| "in this repo nobody touches `store.py` without asking" | project | names this codebase |
| "we use tabs here" | project | "here" |
| "migrations are generated, never hand-written" | project | about this codebase's tooling |
| "always squash before merging" | ask | the user's habit, or this repo's policy? Both readings are common |
| "skip the tests for this one, I'm in a hurry" | none | about the task in hand - leave it in the conversation |

## Windows

`scripts/rules-orko.ps1` mirrors the `.sh` command for command - `show`,
`paths`, `add global|project TEXT`, `-Selftest` - and reads the same two
files, so a repo worked from Git Bash and from PowerShell sees one set of
rules. Invoke it as

```
powershell -NoProfile -ExecutionPolicy Bypass -File "<SKILL>/scripts/rules-orko.ps1" show
```

`<SKILL>` is this skill's directory. Installed as a Claude Code plugin it is
under the plugin cache; via `install.sh` / `install.ps1` it is the host's
global skills dir; in a git checkout of skillator it is
`skills/rules-orko`. Forward slashes work in every spelling.

## Other hosts

Nothing else varies. The files are plain text, the script is plain `sh` /
PowerShell, and `AskUserQuestion` becomes the numbered-options list that
`grayskull-power/references/hosts.md` describes - the same chips, the same
one-line consequence each.
