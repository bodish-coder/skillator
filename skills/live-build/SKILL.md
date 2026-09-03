---
name: live-build
description: >-
  Start the project's app or build in the background FIRST and hand the user the
  URL, command, or progress stream in the opening reply — so they watch the thing
  run while the agent works, instead of staring at a spinner waiting for a reply.
  Covers JS/web dev servers (hot reload), Rust (cargo watch / cargo run), C++
  (ninja/make with [n/total] progress), Python, Go, Electron, mobile and plain
  CLIs. Use when the user says "let me see it", "show me while you work", "don't
  make me wait", "live preview", "run it while you build", "stream the build",
  or whenever a change is about to be made to a project that has a runnable
  surface. Armed as standard by grayskull-power. NOT for taking screenshots
  (screenshot-loop) and NOT a substitute for tests — it is exposure, not
  verification.
---

# live-build — start it first, then work

The default failure this fixes: the agent edits for five minutes, *then* runs the
app, and the user has spent five minutes watching a spinner with nothing to look
at. Invert it. **The runnable thing starts before the first edit.**

## The move

1. **Detect** the launcher (table below). None applies → say so in one line, skip
   this skill, work normally. Do not invent a launcher.
2. **Start it in the background** — `Bash` with `run_in_background: true`. It
   survives across turns.
3. **Hand it over in the opening reply**, before any edit, on its own line:

   ```
   live: http://localhost:5173 — open it, hot reload will show my edits as they land
   ```

   or for a compiled build:

   ```
   live: cargo watch running · rebuilds + relaunches on each save · last-good binary at target/debug/app still runs
   ```

4. **Then do the work.** Normal edits, normal verification.
5. **Report the state** at the end: still running (and how to stop it), or exited
   with what.

Steps 2 and 3 are the whole point. An app started at the *end* of the turn is
what this skill exists to prevent.

## Launchers

Pick by what the repo actually contains — read the manifest, do not guess.

| Repo has | Launch | What the user watches |
|---|---|---|
| `package.json` with a `dev`/`start` script | that script | the app; hot reload shows edits live |
| `vite.config.*`, `next.config.*`, `astro.config.*` | `npm run dev` (or pnpm/yarn/bun per lockfile) | the app, HMR |
| `Cargo.toml` | `cargo watch -x run` if installed, else `cargo run` | rebuild + relaunch per save; `cargo build` prints its own progress |
| `CMakeLists.txt` / `build.ninja` | `cmake --build build -j` or `ninja -C build` | `[142/380]` progress lines |
| `Makefile` | `make -j` | compiler output as it goes |
| `go.mod` | `go run .` | the app |
| `pyproject.toml` / `manage.py` / `app.py` | the project's dev command (`uvicorn --reload`, `flask run`, `manage.py runserver`) | the app, autoreload |
| Electron main in `package.json` | `npm run dev`/`electron .` | the window |
| iOS / Android | **do not auto-launch** — say what to run; simulators are slow and stateful |
| A library with no entry point | nothing to launch — say so, rely on tests |

Ambiguous or several candidates → `AskUserQuestion` with the two most likely,
recommended first. Do not start three servers to be safe. A repo whose only
scripts are `dev:web`/`dev:mobile`/`start` is ambiguous — ask, do not pick.

**Deps are not proven by a `node_modules/` directory.** It can exist and still be
a field of dangling symlinks (a cleared pnpm store, a pruned install), and the
launch dies with `MODULE_NOT_FOUND` a second later. Check the launcher binary
itself — `node_modules/next/`, `node_modules/.bin/vite`, `target/`, `build/` —
and on a missing-module crash, **report it and offer the install**. Never run
`npm install` unasked: it rewrites a lockfile the user did not ask you to touch.

## Compiled builds are different — be honest about it

JS hot-reloads; C++ and Rust do not. There is no preview of a binary mid-link.
What you *can* expose, and should:

- **Progress instead of silence.** `ninja`, `cmake --build`, and `cargo build`
  already emit `[n/total]` or per-crate lines. Surface them; that is the
  difference between "compiling, 142/380" and a dead terminal.
- **The last-good binary stays runnable.** Do not delete or overwrite it while
  the new one builds. The user can keep using the previous build.
- **`cargo watch -x run`** (Rust) and a `--watch`-capable generator (C++) close
  the loop automatically on save. Offer to install `cargo-watch` once; never
  install silently.

The ceiling is real: a four-minute link step stays four minutes. Say that rather
than implying a preview exists.

## Rules

- **One live process per project.** Already running from earlier in the session →
  reuse it, say so, do not start a second. Port already bound is the usual tell.
- **Never start something destructive.** A dev server, a build, a local run —
  yes. Migrations, deploys, seed scripts, anything writing to a shared or remote
  target — no, ask first.
- **Do not block on it.** No foreground waits, no polling loops. Background it
  and move on; the harness notifies you when it exits.
- **A crash on startup is a finding, not a footnote.** Read the output, report
  it, fix it before continuing — that is the first thing the user would have
  seen anyway.
- **Leave it running** at the end of the turn unless the user says otherwise;
  tell them how to stop it. Killing the server they are looking at is rude.
- **Exposure ≠ verification.** The app running proves it boots. It does not
  prove the change is correct — tests and `superpowers:verification-before-completion`
  still apply.

## Related

- `run` — the deeper "launch and drive this project's app" skill; use it when the
  point is to *verify* a change in the running app rather than to expose it early.
  `live-build` starts things; `run` inspects them.
- `screenshot-loop` — the return path: the user screenshots what they saw here
  and drops it in the folder.
- `grayskull-power` — arms this as standard, so the first reply of any change to
  a runnable project carries a `live:` line.
