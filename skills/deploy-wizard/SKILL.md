---
name: deploy-wizard
description: >-
  Use when the user says "prep the deployment", "set up deploy", "deployment
  wizard", "get this ready to ship to my server", "scaffold the deploy", or is
  about to stand up a new app on a Linux VPS with the standard single-VPS
  pattern (Docker Compose + nginx + GitHub Actions, one-push deploy,
  maintenance gate, TLS via Let's Encrypt). NOT for non-VPS / managed-PaaS
  deploys, or for the actual server administration.
---

# Deploy Wizard — prep the standard VPS deployment

Runs as a **wizard**: one step at a time, confirm before moving on. It gathers the
deployment-specific values, scaffolds the filled-in config/scripts, and hands the
user an ordered checklist of the manual steps only a human should do.

**Target pattern:** a single Linux VPS where **nginx** is the only public-facing
service (static frontend + `/api/` proxy + maintenance gate + TLS), **Docker
Compose** owns the app stack (api, workers, postgres, redis, object storage), and
**GitHub Actions** SSHes in on `push main` to run an idempotent `deploy.sh`.

**Public-safe & secure by construction:**
- **Prompt for every specific** — nothing about a real deployment is baked in.
- **Never collect secret *values*.** DB/storage passwords, SSH private keys, API
  tokens are *never* typed into chat or written into repo files. The wizard records
  their **names** and tells the user to place them in a server-side `.env` (mode 600)
  or a GitHub secret — done by the user, not the wizard.
- **Never touch remote/DNS/credentials.** The wizard prepares; the human executes
  every step that reaches a server, DNS provider, or secret store.

## Step 0 — Orient

1. Detect the project: is there a frontend (build step), a backend (health route),
   a `docker-compose.yml`, existing `deploy/` or `.github/workflows/`? Note what
   already exists so the wizard fills gaps, not overwrites blindly.
2. **Authoritative templates:** if the project root (or the user) has a
   `DEPLOYMENT_PLAYBOOK.md`, treat it as the source of truth for artifact *contents*
   and only substitute the wizard's answers into it. Otherwise generate artifacts
   from the structure in Step 2. (Never copy private values out of any playbook.)
3. Confirm the platform is this VPS pattern; if it's a managed PaaS (Vercel, Fly,
   Render, etc.), stop — this wizard is for the self-hosted VPS pattern.

## Step 1 — Interview (the wizard Q&A)

Ask in small, grounded batches; use multiple-choice / sensible defaults where you
can; confirm each batch. Collect these values (names only for secrets):

- **Identity:** `APP_SLUG` (used in `/opt/<slug>`, filenames, keys), `GITHUB_ORG`,
  `GITHUB_REPO`, `APP_DIR` (default `/opt/<APP_SLUG>`).
- **Server / SSH:** `DEPLOY_HOST` (IP/host), `DEPLOY_USER`, `DEPLOY_PORT` (default 22).
- **Domain / TLS:** `SUBDOMAIN` (public hostname), `CERTBOT_EMAIL` (Let's Encrypt reg).
- **nginx / ports:** `API_PORT` (host port nginx proxies to, e.g. `127.0.0.1:18000`),
  `CONTAINER_API_PORT` (in-container app port, e.g. 8000), `HEALTH_PATH`
  (default `/api/health`), `MAX_BODY_SIZE` (nginx `client_max_body_size`, e.g. `2G`).
- **Stack:** which compose services (`STACK_SERVICES`: api / workers / postgres /
  redis / object-storage). For each present: `DB_NAME`, `DB_USER`; object-storage
  `bucket`. **DB_PASSWORD and storage access/secret keys are SECRET → record the
  variable name only, never the value.**
- **App-specific:** `CHILD_TABLES` (tables for restore-append backups), any per-app
  localStorage keys.

State back the collected config (secrets shown as `<set on server>`) and get a
confirm before scaffolding.

**Nobody to interview?** A subagent, a batch run, or "just set it up, I'm out" —
a deployment's specifics cannot be inferred, and a scaffold built on invented ones
is worse than no scaffold: it looks configured and points at a host that isn't
theirs. Don't scaffold. Write Step 1 out as an answer sheet, filled in where the
repo actually tells you (`APP_SLUG`, ports, `STACK_SERVICES`, `HEALTH_PATH`) and
blank where only the user can (`DEPLOY_HOST`, `SUBDOMAIN`, `CERTBOT_EMAIL`, secret
names), print the Step 3 checklist beneath it, and stop there. The wizard prepares
and the human executes — with no human in the loop, preparing is the whole job.

## Step 2 — Scaffold the artifacts (prep)

Generate these into the project, substituting the answers (secrets stay as
placeholders / env references — never literal values). List every file you write.
If a `DEPLOYMENT_PLAYBOOK.md` is present, take contents from it; otherwise follow
this structure:

- `.github/workflows/deploy.yml` — on `push main`: SSH to `DEPLOY_HOST:DEPLOY_PORT`
  as `DEPLOY_USER` using secret `DEPLOY_SSH_KEY`, run `APP_DIR/deploy/deploy.sh`.
- `deploy/deploy.sh` — idempotent first-run + update: install base pkgs, `ufw` allow
  22/80/443, clone-or-`git reset --hard origin/main`, **maintenance gate ON** (trap
  clears it on EXIT/ERR), `docker system prune -af` then frontend `npm ci && build`,
  pre-deploy DB snapshot, `docker compose up -d --build`, poll `HEALTH_PATH` (≤45×2s,
  dump logs + fail on timeout), **gate OFF**, `envsubst` nginx template → reload.
- `deploy/nginx.conf.template` — server for `SUBDOMAIN`: static root, `/api/` →
  `127.0.0.1:API_PORT`, maintenance-flag rewrite, `client_max_body_size MAX_BODY_SIZE`.
- `deploy/maintenance.html` — static page, auto-refresh ~10s, served with 200. Wears
  the app's own brand where one exists; inventing a look falls under the shared design
  floor `references/anti-slop.md` beside the installed skills — try
  `../references/anti-slop.md` first (the `install.sh` layout), then
  `../../references/anti-slop.md` (git checkout, plugin cache); neither resolves → say
  so in one line and stay on the system font stack.
- `docker-compose.yml` + `deploy/docker-compose.prod.yml` — base + prod overlay for
  the chosen `STACK_SERVICES`; secrets referenced from `.env`, never inlined.
- Backend **health endpoint** (`HEALTH_PATH` → `{ok:true}`, no auth/DB) if missing.
- If a frontend: `src/lib/maintenance.ts` (sticky content-type poller) +
  `MaintenanceModal.tsx` (overlay, OK reloads).
- Optional `.githooks/pre-push` — best-effort DB snapshot on push (never blocks).

Then **offer to run only the safe LOCAL steps** with per-step confirmation: write the
files, `chmod +x deploy/deploy.sh`, stage them. **Do NOT** `git push`, run anything
against the server, or write any secret. Confirm before each write if overwriting.

## Step 3 — Manual handoff checklist (the human-only steps)

Print an ordered, copy-pasteable checklist with the user's non-secret values filled
in (secrets as placeholders). These are the steps the wizard will NOT do:

1. **Deploy key** — `ssh-keygen` a deploy keypair; add the public key to
   `DEPLOY_USER@DEPLOY_HOST:~/.ssh/authorized_keys`.
2. **GitHub secrets** — add `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`,
   `DEPLOY_SSH_KEY` (the private key) in the repo's Actions secrets.
3. **DNS** — create an A record `SUBDOMAIN → DEPLOY_HOST`; wait for propagation.
4. **First bootstrap** — ensure `DEPLOY_USER` has sudo and `APP_DIR` is writable
   (or let the first `deploy.sh` create it).
5. **Server `.env`** — place `.env` (mode 600) in `APP_DIR` with the app secrets +
   `DB_PASSWORD` / storage keys. The runner holds no app secrets.
6. **Firewall** — confirm the provider firewall also allows 22/80/443.
7. **TLS** — first issuance: `certbot --nginx -d SUBDOMAIN -m CERTBOT_EMAIL`
   (needs live DNS + port 80 reachable); auto-renews after.
8. **Go live** — `git push main`, watch the Actions run, confirm the health check
   and `https://SUBDOMAIN` load.

## Step 4 — Verify first deploy

Walk the user through the first `push main` → Actions → SSH → `deploy.sh`. The deploy
is proven only when: the Action is green, `HEALTH_PATH` returns ok on the box, the
maintenance flag is cleared, and `https://SUBDOMAIN` serves the app over valid TLS.
If the health poll fails, the deploy script dumps container logs — read those, fix,
re-push.

## Rules

- **Wizard discipline:** one step at a time, confirm before advancing; never dump the
  whole thing and call it done.
- **Secrets are names, not values.** Never ask the user to paste a password/key into
  chat, never write a secret into a repo file. They go to the server `.env` / GitHub
  secrets, by the user.
- **Prep, don't execute the risky parts.** No `git push`, no SSH to the server, no DNS
  change, no credential entry — those are the user's manual steps by design.
- **Public-safe:** every deployment-specific value is prompted, never hardcoded. Use
  `example.com` / `203.0.113.10`-style placeholders in any illustration.
- **Idempotent artifacts:** the generated `deploy.sh` must be safe to re-run (clone-or-
  update, prune-before-build, trap-clears-maintenance) — that's the whole point.
- Overwriting an existing deploy file? Show the diff and confirm first.
