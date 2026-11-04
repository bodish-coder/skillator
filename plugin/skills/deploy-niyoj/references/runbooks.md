# deploy-niyoj runbooks

A deployment handoff is not an informal checklist; it is an executable, repeatable
runbook that a fresh operator or evaluator can follow without guesswork.

This reference defines the standard runbook output structure adapted from upstream
knowledge-work-plugins (`operations/skills/runbook/SKILL.md`) for deploy-niyoj's
desktop app + SSH (`BatchMode=yes`) single-VPS architecture.

## Runbook Rules

1. **Owner & Last-tested revision:** Every runbook identifies its designated human
   operator role and records the specific git commit revision (`last-tested revision`)
   when the procedure was last proven.
2. **Incomplete inputs stop execution:** Every required variable, DNS record, SSH key,
   or server directory prerequisite must be present before executing commands. If any
   prerequisite is missing, blank, or unresolved, the evaluator or operator halts
   immediately with status `blocked` / `incomplete_inputs`. Do not guess or execute partial steps.
3. **Exact copy-pasteable commands:** Each step provides the verbatim command.
4. **Expected result per step:** Each step states the exact expected outcome, HTTP code,
   exit status, or log message (e.g. `✓ Live`).
5. **Failure branch per step:** Each step specifies the remedial action to take if the
   step fails or times out.
6. **Unexecuted checks remain unverified:** Verification checks that have not run
   (because a previous step failed or the run stopped early) MUST remain explicitly
   marked `unverified`. Never report unexecuted checks as passed.
7. **Rollback & Rollback Verification:** Rollback includes explicit trigger conditions,
   user-confirmed git revert commands, snapshot restore instructions if a schema migration
   failed, and verification commands proving the rollback succeeded.
8. **No automatic external publishing:** Deployment handoffs remain local markdown
   artifacts (`deploy/RUNBOOK.md` or chat handoff). They are never automatically
   published to external wikis, Slack, or remote services without human approval.

---

## Deployment Runbook: deploy-niyoj

**Owner:** @<DEPLOY_USER>
**Last-tested revision:** <GIT_SHA>
**Target:** <DEPLOY_HOST> (port <DEPLOY_PORT>)

### Prerequisites
- `DEPLOY_HOST` target VPS IP address or hostname
- `DEPLOY_USER` deploy user with passwordless sudo (`deploy ALL=(ALL) NOPASSWD:ALL`)
- `SUBDOMAIN` public hostname with DNS A record pointing to DEPLOY_HOST
- `DEPLOY_KEY_PASSPHRASELESS` ed25519 deploy key without passphrase for BatchMode=yes
- Server `.env` file placed in `/opt/<APP_SLUG>/.env` (mode 600) with app secrets
- Check-only CI workflow green on branch `origin/main`

### Steps

#### Step 1: Verify check-only CI status
**Owner:** Human operator
```bash
gh run list --branch main --limit 1 --json conclusion -q '.[0].conclusion'
```
**Expected result:** "success"
**Failure branch:** Do not deploy; inspect failing tests in CI, fix on local branch, push, and await green status.

#### Step 2: Confirm remote server accessibility and deploy user sudo
**Owner:** Human operator
```bash
ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "sudo -n true && test -d /opt/$APP_SLUG"
```
**Expected result:** Exit code 0, no password prompt
**Failure branch:** Verify sudoers configuration (`/etc/sudoers.d/deploy`) and ensure deploy directory exists.

#### Step 3: Trigger deployment via NiYoj or script on stdin
**Owner:** Human operator
```bash
ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "bash -s" < deploy/deploy.sh
```
**Expected result:** Output ends with "✓ Live" and exit code 0
**Failure branch:** Inspect the phase and gate that failed in output log; check if maintenance trap fired.

#### Step 4: Immediate second run for idempotency verification
**Owner:** Human operator
```bash
ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "bash -s" < deploy/deploy.sh
```
**Expected result:** Output completes cleanly and exits 0 ("✓ Live") without rebuilding unnecessary layers
**Failure branch:** Fix script idempotency issues before signing off on deployment.

### Verification
- [ ] curl -f -s https://$SUBDOMAIN/api/health returns `{"ok":true}`
- [ ] curl -I https://$SUBDOMAIN returns HTTP 200 without maintenance header
- [ ] TLS certificate verified over HTTPS
- [ ] docker compose ps reports all services running: ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "cd /opt/$APP_SLUG && docker compose ps"

### Rollback & Rollback Verification
**Trigger:** Deploy fails or health check fails to return ok after deployment.
```bash
git revert HEAD --no-edit && git push origin main
ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "bash -s" < deploy/deploy.sh
```
**Rollback verification:** Confirm /api/health returns HTTP 200 and previous release SHA is serving. If database migration was applied, restore pre-deploy snapshot from /opt/$APP_SLUG/backups/.

### Escalation
Contact @<DEPLOY_USER> or lead operations engineer. Logs available via: `ssh -i ~/.ssh/niyoj -o BatchMode=yes $DEPLOY_USER@$DEPLOY_HOST "cd /opt/$APP_SLUG && docker compose logs --tail=200"`.
