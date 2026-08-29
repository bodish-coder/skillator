# deploy-niyoj — file templates

Verbatim artifacts. Fill in `<app>`, the subdomain, the ports and the health URL;
change nothing else without a reason you can state.

---

## 1. What NiYoj sends over the wire

Pressing Deploy opens one SSH connection and feeds this to `bash -s` on stdin —
no quoting games, nothing installed on the box:

```sh
set -euo pipefail
if [ ! -d /opt/<app>/.git ]; then git clone -b <branch> <repo> /opt/<app>; fi
cd /opt/<app>
git fetch --all --prune
git reset --hard origin/<branch>
git submodule update --init --recursive || true
if [ -f deploy/deploy.sh ]; then sudo bash deploy/deploy.sh;
 elif [ -f deploy.sh ]; then sudo bash deploy.sh;
 else echo 'no deploy.sh — files updated in place'; fi
```

Three properties, all deliberate:

- **A new app and the 200th redeploy take the identical path.** The clone is the
  only conditional; everything after it is a hard reset. That only works because
  `deploy.sh` is idempotent.
- **`git reset --hard`, never `git pull`.** A stray edit or a merge conflict on
  the server can wedge a pull forever. The working tree is forced to match
  origin; the server is a checkout, not a workspace.
- **A repo with no `deploy.sh` still deploys.** For a static site the pull *is*
  the deploy. Don't invent a script you don't need.

The SSH invocation:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=30 -o ConnectTimeout=12 \
    -i <key> -p <port> <user>@<host> "bash -s"
```

**Anything unusual gets a custom command.** An app can carry a `cmd` that
replaces the script above wholesale — a compose file in a subdirectory, a systemd
unit, an `ansible-playbook` line, a two-server dance. The default covers the
common case; the escape hatch is one field.

---

## 2. App entry (`apps.json`, beside the binary — never committed)

```json
"aerolens": {
  "server": "droplet-bodish",
  "repo":   "git@github-aerolens:<org>/<repo>.git",
  "branch": "main",
  "dir":    "/opt/aerolens",
  "cmd":    ""
}
```

`repo` is an SSH URL with a **per-app host alias** (`git@github-aerolens:`) when
one box deploys several private repos — one deploy key per repo, each pinned in
the server's `~/.ssh/config`.

Emergency pin to a known-good commit, as a temporary `cmd`:

```sh
set -euo pipefail
cd /opt/<app>
git fetch --all --prune
git checkout --detach <good-sha>
sudo bash deploy/deploy.sh
```

Clear the field once `main` is healthy, or the app is frozen at that SHA forever.

---

## 3. `deploy/deploy.sh`

One bash script that does **first-run provisioning** *and* **every subsequent
update**. Each phase detects and skips.

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/<app>
SUBDOMAIN=app.example.com
EMAIL=ops@example.com

say()  { printf "\n▶ %s\n" "$*"; }
ok()   { printf "  ✓ %s\n"  "$*"; }
warn() { printf "  ! %s\n"  "$*" >&2; }
die()  { printf "  ✗ %s\n"  "$*" >&2; exit 1; }

# 1. Base packages (skip if present)
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive          # BatchMode cannot answer prompts
apt-get update -qq
apt-get install -y -qq curl git nginx ca-certificates ufw \
                       certbot python3-certbot-nginx > /dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# 2. Firewall (idempotent)
say "Configuring UFW"
ufw allow 22,80,443/tcp >/dev/null
ufw --force enable >/dev/null

# 3. ── MAINTENANCE GATE ON ──
MAINT_FLAG="$APP_DIR/maintenance.flag"
trap 'rm -f "$MAINT_FLAG"' EXIT ERR HUP INT TERM
cp deploy/maintenance.html "$APP_DIR/maintenance.html"
touch "$MAINT_FLAG"

# 4. Snapshot the DB before anything rebuilds it
say "Pre-deploy snapshot"
docker compose exec -T api python -c \
  "from app.db import create_backup; create_backup('pre-deploy')" || warn "snapshot skipped"

# 5. Build frontend
say "Building frontend"
cd frontend && npm ci && npm run build && cd ..

# 6. Reclaim disk BEFORE rebuild
say "Reclaiming disk"
df -h / | tail -1
docker system prune -af > /dev/null 2>&1 || true
df -h / | tail -1

# 7. Build + start stack
say "Starting compose stack"
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  up -d --build

# 8. Wait for API to be healthy BEFORE clearing maintenance
say "Waiting for API"
for i in $(seq 1 45); do
  curl -fsS http://127.0.0.1:18000/api/health >/dev/null 2>&1 && break
  sleep 2
  [ "$i" -eq 45 ] && die "API never came up"
done
ok "API healthy"

# 9. Maintenance gate OFF (the trap clears it too — belt-and-braces)
rm -f "$MAINT_FLAG"
ok "Live"

# 10. nginx + TLS (certbot is a no-op if the cert is fresh)
say "Configuring nginx"
envsubst < deploy/nginx.conf.template > /etc/nginx/sites-available/<app>
ln -sf /etc/nginx/sites-available/<app> /etc/nginx/sites-enabled/<app>
nginx -t && systemctl reload nginx

certbot --nginx -d "$SUBDOMAIN" -m "$EMAIL" \
        --agree-tos --non-interactive --redirect || warn "TLS step skipped"
```

**Key idempotency rule:** every step is *detect → skip-if-already-done →
otherwise-do*. Re-running the whole script must be safe at any time.

---

## 4. `deploy/nginx.conf.template`

```nginx
server {
    listen 80;
    server_name __SUBDOMAIN__;
    root __APP_DIR__/frontend/dist;
    index index.html;

    set $maintenance 0;
    if (-f __APP_DIR__/maintenance.flag) { set $maintenance 1; }
    if ($maintenance = 1) { rewrite ^.*$ /maintenance.html last; }

    location = /maintenance.html {
        root __APP_DIR__;
        # 200, NOT 503 — some browsers/proxies cache 5xx and strand users
        # on the maintenance page after the deploy finishes.
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        expires off;
        try_files /maintenance.html =200;
    }

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }

    location /api/ {
        proxy_pass http://127.0.0.1:18000;
        proxy_set_header Host $host;
        proxy_buffering off;       # SSE / streaming
        proxy_read_timeout 600s;
        client_max_body_size 2G;
    }
}
```

The `if (-f ...)` runs per request — no reload needed. Flip the flag, the next
request is the maintenance page; remove it, the next request is the app.

---

## 5. Server setup commands

Passphrase-less key dedicated to deploys:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/niyoj -C niyoj     # press Enter twice
ssh-copy-id -i ~/.ssh/niyoj.pub root@YOUR_IP
ssh -i ~/.ssh/niyoj root@YOUR_IP "echo connected"
```

Windows has no `ssh-copy-id`:

```powershell
type "$HOME\.ssh\niyoj.pub" | ssh root@YOUR_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Non-root deploy user — `deploy.sh` calls `sudo` and BatchMode cannot type a
password:

```sh
echo "deploy ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/deploy
```

---

## 6. Disk reclaim, with readable output

```bash
df -h / | tail -1 | awk '{printf "  before: %s used of %s (%s)\n", $3, $2, $5}'
docker system prune -af > /dev/null 2>&1 || true
df -h / | tail -1 | awk '{printf "  after:  %s used of %s (%s)\n", $3, $2, $5}'
```

Images belonging to running containers are "in use" and survive, so the live site
keeps serving.

---

## 7. Database safety

Keep the backup pattern from the CI playbook unchanged: `create_backup(label)`,
`restore_backup_append(filename)` that renames on clash instead of overwriting,
`_safe_path(name)` blocking `..` and separators, admin-only endpoints, and
per-label retention (`manual` never auto-prunes, each auto label keeps its last
10).

The one change in this variant: **there is no `.githooks/pre-push` snapshot.**
Push and deploy are separate acts, so a pre-push hook fires at a moment unrelated
to production. The pre-deploy snapshot in phase 4 of `deploy.sh` is the guarantee,
and it runs before the first container is touched.

---

## 8. Adapting for a new project

| Layer | Keep | Swap |
|---|---|---|
| NiYoj server entry | yes | host, user, port, key path |
| NiYoj app entry | yes | repo, branch, `/opt/<app>` |
| Custom command | only for non-standard layouts | the command itself |
| `deploy.sh` skeleton | yes, verbatim | package list, ports, health URL |
| `nginx.conf.template` | yes — the maintenance gate especially | server_name, proxy_pass port |
| `maintenance.html` | yes | branding |
| Health endpoint | yes — `/api/health`, unauthenticated | implement in your framework |
| `useMaintenanceMode` + modal | yes | colors, copy |
| localStorage persistence | yes | keys, what to persist |
| Disk prune | yes | nothing |
| Pre-deploy DB snapshot | yes — it replaces the pre-push hook | DB driver, container name |
| `.githooks/pre-push` snapshot | drop it | n/a |
| `.github/workflows/deploy.yml` | delete it | n/a |
