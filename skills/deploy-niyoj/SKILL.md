---
name: deploy-niyoj
description: >-
  Set up and run manual, no-CI deployment for a single-VPS app driven from the
  NiYoj desktop app — press Deploy, one SSH connection feeds an idempotent
  `deploy/deploy.sh` to the server over `bash -s`, and the log streams back.
  Same single-VPS pattern as `deploy-wizard` (Docker Compose + nginx +
  maintenance gate + Let's Encrypt) with GitHub Actions removed: no runner, no
  CI minutes, no `deploy.yml`, and the deploy key stays on your machine. Use
  when the user says "niyoj", "set up niyoj deploy", "deploy without CI",
  "manual deploy", "no github actions deploy", "one-button deploy from my
  laptop", when converting a project off `.github/workflows/deploy.yml`, or when
  a NiYoj deploy failed and needs diagnosing. Scaffolds `deploy/deploy.sh`,
  `deploy/nginx.conf.template`, `deploy/maintenance.html` and the health
  endpoint, and prints the human-only checklist (deploy key, sudoers, DNS, app
  entry). Never enters credentials, never edits files on the server, never
  commits `apps.json`. NOT for CI-triggered deploys (use `deploy-wizard`) or
  managed-PaaS targets.
---

# deploy-niyoj — one button, one SSH connection, no CI

`git push` triggers nothing. Push is "save my work"; Deploy is "ship it". Two
deliberate acts, and that separation is the entire point of this variant.

```
   your laptop
   ┌─────────────────────┐
   │  NiYoj  [ Deploy ]  │
   └──────────┬──────────┘
              │ ssh -i <key> -o BatchMode=yes   (script on stdin)
              ▼
   VPS  /opt/<app>/deploy/deploy.sh
                    │
   ┌────────────────┴────────────────┐
 nginx (front-door)          docker compose
 ├─ static frontend (dist/)   ├─ api
 ├─ /api/ → 127.0.0.1:18000   ├─ workers
 ├─ maintenance gate (flag)   ├─ postgres
 └─ TLS via certbot           └─ redis
```

Everything downstream of the trigger is identical to `deploy-wizard`'s CI
playbook. Adopting this one on a project that already follows that pattern means
**deleting `.github/workflows/deploy.yml`** and adding the app to NiYoj —
`deploy.sh`, nginx, the maintenance gate and the backups all stay as they are.

Full file templates (`deploy.sh`, `nginx.conf.template`, the SSH invocation, the
app entry) are in `references/templates.md`. Read it before scaffolding; do not
retype them from memory.

## The one constraint everything else follows from

NiYoj connects with `BatchMode=yes`. **A deploy can never answer a prompt.**

That single fact rules out: a passphrase on the deploy key, a sudo password,
`read` anywhere in a script, `apt` without `DEBIAN_FRONTEND=noninteractive`,
`certbot` without `--non-interactive`, a `docker login` prompt. Each of those
doesn't error — it *hangs*, holding the maintenance flag up until the connection
times out. When a NiYoj deploy stalls with no output, this is the first thing to
check.

## Phase 0 — which job is this

Ask only if the request is ambiguous; usually it's obvious:

- **Scaffold** — new project, no deploy artifacts. Phases 1–3.
- **Convert** — project has `.github/workflows/deploy.yml`. Phase 1 (the
  conversion), then verify.
- **Diagnose** — a deploy failed or hung. Skip to *Diagnosing a failed deploy*.

Establish the app slug, the subdomain, the server, and the branch that ships.
Never scaffold against a guessed subdomain.

## Phase 1 — converting off CI

1. **Delete `.github/workflows/deploy.yml`.** Not disable, not rename — delete.
   Two triggers racing on the same `git reset --hard` is a corrupted checkout
   waiting to happen, and "keeping it just in case" is exactly how that races.
2. **Move the DB snapshot from `.githooks/pre-push` into `deploy.sh`.** With
   push and deploy separated, a pre-push hook fires at a moment that has nothing
   to do with production. Drop the hook; the pre-deploy snapshot inside the
   script is now the guarantee.
3. Everything else — `deploy.sh`, nginx template, maintenance page, backup
   functions, health endpoint — stays byte-identical. Say so rather than
   rewriting working files.

## Phase 2 — the artifacts

Scaffold into the repo, filled in with the real values from Phase 0:

| File | Notes |
|---|---|
| `deploy/deploy.sh` | Ten phases, in order. `references/templates.md` |
| `deploy/nginx.conf.template` | Maintenance-flag rewrite is the part that matters |
| `deploy/maintenance.html` | Auto-refreshing static page; brand it |
| `GET /api/health` | Public, no auth, no DB touch, returns `{"ok": true}` |
| `useMaintenanceMode` + modal | Poll health, watch content-type, latch sticky |
| localStorage persistence | In-progress UI state, saved on every change |

**Idempotency is the whole design.** Every phase is *detect → skip-if-done →
otherwise-do*. A new app and the 200th redeploy take the identical path; the
clone is the only conditional and everything after it is a hard reset. Re-running
must be safe at any moment — which is exactly what happens when someone presses
Deploy twice because they weren't sure the first one took.

**Exit non-zero on failure.** The exit code is NiYoj's only verdict: it colours
the app card red and stamps the time. `set -euo pipefail` at the top, `die` on
every gate, and `|| true` **only** where failure is genuinely fine (the prune,
the submodule update). A script that swallows errors reports a green deploy of a
broken box.

### The maintenance gate, and why the trap is non-negotiable

While a deploy is in flight every request — `/api/*` included — is rewritten to
`/maintenance.html` with a **200, never a 503**: some browsers and proxies cache
5xx and strand users on the maintenance page after the deploy finishes. The
`if (-f ...)` runs per request, so flipping the flag needs no nginx reload.

```bash
trap 'rm -f "$MAINT_FLAG"' EXIT ERR HUP INT TERM
```

Manual deploys have a failure mode CI never had: **you close the laptop, or the
Wi-Fi drops.** The SSH session dies, remote bash takes SIGHUP, the trap fires,
the flag clears, and the site comes back on the old build. Without it, a dropped
connection leaves the site maintenance-stuck until you reconnect. Test it — kill
the connection mid-deploy and confirm the flag is gone. That test is part of
delivering this skill, not an optional extra.

### Gates worth keeping

- `nginx -t` **before** `systemctl reload` — never reload a config that doesn't
  parse.
- **Health-poll before clearing maintenance**, 45 × 2 s, then `die`. If the API
  never came up, the site stays on the maintenance page rather than serving a
  broken app.
- `docker compose ps` after `up` — a container not `running` is a failed deploy
  even when `up` returned 0.
- **Prune before `up --build`, never after.** Small VPS disks fill fast when a
  pip install dies mid-stream. Images belonging to running containers survive,
  so the live site keeps serving.
- **A closing line you can grep for.** `ok "Live"` as the last output means
  "scroll to the bottom" is a complete verification.

Write the script for someone *watching* — one `say` per phase, `ok` per success,
`die` with the reason per failure. NiYoj streams the log into a popup that can be
closed and reopened while the deploy keeps running.

## Phase 3 — the human-only checklist

Print it; never attempt these steps yourself.

1. VPS reachable; DNS `A` record for the subdomain points at it.
2. `ssh-keygen -t ed25519 -f ~/.ssh/niyoj -C niyoj` — **press Enter twice, no
   passphrase.** Public half into `authorized_keys`. (NiYoj's SSH key panel does
   both halves: generate, install over a one-time password login, verify with the
   key alone.)
3. Non-root deploy user? `echo "deploy ALL=(ALL) NOPASSWD:ALL" | sudo tee
   /etc/sudoers.d/deploy` — `deploy.sh` calls `sudo` and BatchMode cannot type a
   password.
4. Add the server in NiYoj → **Test connection** → save. It reports the box's
   kernel and git version, or the actual SSH error.
5. Private repo? Deploy key on the box, **one key per repo** with a per-app host
   alias (`git@github-<app>:`) pinned in the server's `~/.ssh/config`;
   `ssh -T git@<alias>` must succeed *as the deploy user*. A single shared key
   across repos is a lateral-movement gift.
6. Add the app: server, repo, branch, `/opt/<app>`. **Scan for apps** walks
   `/app`, `/opt`, `/srv`, `/var/www`, `/root`, `/home` for git checkouts and
   imports an existing box in one click — don't hand-write entries for anything
   already on disk.
7. **Deploy.** First run installs everything; expect several minutes.
8. Verify: `✓ Live` in the log, HTTPS on the subdomain, `/api/health` returns
   `{"ok": true}`, `docker compose ps` all running.
9. **Deploy a second time immediately.** Idempotency is only proven by the boring
   second run.

## The release ritual

Manual deploy means the discipline CI used to enforce is now the human's. Four
steps, in this order, every time:

1. **Merge and push to `main`.** NiYoj deploys `origin/<branch>`, not the working
   tree. Unpushed commits do not ship — this catches everyone out exactly once,
   and it is the single most common mistake in this model.
2. **Check the app card**: right server, right branch, right directory.
3. **Deploy.** Watch to `✓ Live`, or to the `✗` and its reason.
4. **Smoke test the real URL** — load the app, hit one authed endpoint, confirm
   the maintenance page is gone.

Deploy one app at a time when they share a box: two simultaneous
`docker system prune -af` runs will happily delete each other's build cache.

## Rollback

`git reset --hard origin/<branch>` means **the branch is the deployed state**, so
rollback is a git operation, not a NiYoj one:

```sh
git revert <bad-sha> && git push      # then press Deploy
```

`git revert`, not `reset --hard` + force-push: reverting keeps the history other
checkouts already have, and the next deploy is an ordinary fast-forward.

Emergency pin to an exact commit → set the app's **custom command** temporarily
(see `references/templates.md`), and **clear the field once `main` is healthy**
or the app is silently frozen at that SHA forever.

**Migrations are forward-only.** Reverting code does not un-apply a migration. If
the bad release migrated the schema, restore from the pre-deploy snapshot or ship
a compensating migration with the next number up — never edit an applied one.

## Diagnosing a failed deploy

| Symptom | Look here first |
|---|---|
| Hangs with no output, no error | Something is prompting — key passphrase, sudo password, `apt` without `DEBIAN_FRONTEND`, `certbot` without `--non-interactive` |
| Card red, log ends mid-phase | The `die` that fired names the gate; read the line above it |
| Site stuck on maintenance page | The trap didn't fire or isn't there. `rm /opt/<app>/maintenance.flag` on the box, then fix the trap |
| Deploy green, change not live | Committed but not **pushed**. `origin/<branch>` is what ships |
| "no such file deploy/deploy.sh" | Repo has no deploy script — fine for a static site, the pull *is* the deploy |
| Build fails on disk space | Prune ran after `up --build` instead of before, or two apps deployed at once |
| Worked yesterday, broken today, no commits | Someone edited files on the server; the hard reset took them away |

## Rules

- **Nothing in the deploy may prompt.** BatchMode is the constraint the whole
  design bends around.
- **The repo is the only place changes live.** Editing files on the server is
  erased by the next hard reset, without a word.
- **Push before Deploy.** `origin/<branch>` ships; the working tree does not.
- **The exit code is the verdict.** Never `|| true` a real failure.
- **`apps.json` is never committed.** It carries hosts, users, and key paths —
  gitignore it; NiYoj keeps it beside the binary.
- **Secrets never go in the custom-command field.** `apps.json` is plain local
  JSON. Environment values live in a `.env` on the server, referenced by compose.
- **One deploy key per repo**, one host alias per key.
- **Delete the CI workflow on adoption.** Two triggers, one `git reset --hard`.
- **Never run the deploy yourself.** Scaffold, verify, and hand the human the
  checklist. Pressing Deploy is theirs; so is anything touching DNS, keys, or the
  server.
- Sibling skill: `deploy-wizard` is this same architecture with GitHub Actions as
  the trigger. Changes to the shared parts (`deploy.sh` phases, nginx template,
  maintenance gate, backups) belong in both.
