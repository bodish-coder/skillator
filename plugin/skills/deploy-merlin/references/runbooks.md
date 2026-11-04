# deploy-merlin runbooks

A deployment handoff is not an informal checklist; it is an executable, repeatable
runbook that a fresh operator or evaluator can follow without guesswork.

This reference defines the standard runbook output structure adapted from upstream
knowledge-work-plugins (`operations/skills/runbook/SKILL.md`) for deploy-merlin's
GitHub Actions + single-VPS architecture.

## Runbook Rules

1. **Owner & Last-tested revision:** Every runbook identifies its designated human
   operator role and records the specific git commit revision (`last-tested revision`)
   when the procedure was last proven.
2. **Incomplete inputs stop execution:** Every required variable, DNS record, secret name,
   or environment prerequisite must be present before executing commands. If any
   prerequisite is missing, blank, or placeholder (`<set on server>`), the evaluator
   or operator halts immediately with status `blocked` / `incomplete_inputs`. Do not guess
   or execute partial steps.
3. **Exact copy-pasteable commands:** Each step provides the verbatim command. No
   ambiguous instructions or implied context.
4. **Expected result per step:** Each step states the exact expected outcome, HTTP code,
   exit status, or log message.
5. **Failure branch per step:** Each step specifies the remedial action to take if the
   step fails or times out (diagnostic command, repair step, or abort to rollback).
6. **Unexecuted checks remain unverified:** Verification checks that have not run
   (because a previous step failed or the run stopped early) MUST remain explicitly
   marked `unverified`. Never report unexecuted checks as passed.
7. **Rollback & Rollback Verification:** Rollback includes explicit trigger conditions,
   exact revert/restore commands, and verification commands proving the rollback
   succeeded.
8. **No automatic external publishing:** Deployment handoffs remain local markdown
   artifacts (`deploy/RUNBOOK.md` or chat handoff). They are never automatically
   published to external wikis, Slack, or remote services without human approval.

---

## Deployment Runbook: deploy-merlin

**Owner:** @<DEPLOY_USER>
**Last-tested revision:** <GIT_SHA>
**Target:** <DEPLOY_HOST> (port <DEPLOY_PORT>)

### Prerequisites
- `DEPLOY_HOST` target VPS IP address or hostname
- `DEPLOY_USER` sudo-capable user on VPS
- `SUBDOMAIN` public hostname configured with DNS A record pointing to DEPLOY_HOST
- `DEPLOY_SSH_KEY` private SSH key added to GitHub Actions secrets
- `CERTBOT_EMAIL` registration email for Let's Encrypt TLS
- Server `.env` file placed in `/opt/<APP_SLUG>/.env` (mode 600) with app secrets

### Steps

#### Step 1: Verify DNS propagation
**Owner:** Human operator
```bash
dig +short $SUBDOMAIN
```
**Expected result:** Returns $DEPLOY_HOST IP address
**Failure branch:** Wait for DNS propagation; verify registrar/nameserver records before proceeding.

#### Step 2: Confirm server prerequisites and deploy directory
**Owner:** Human operator
```bash
ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "sudo mkdir -p /opt/$APP_SLUG && sudo chown -R $DEPLOY_USER:$DEPLOY_USER /opt/$APP_SLUG"
```
**Expected result:** Exit code 0, directory created with correct ownership
**Failure branch:** Check SSH credentials, firewall port 22/$DEPLOY_PORT, and user sudo permissions.

#### Step 3: Verify server-side secret configuration
**Owner:** Human operator
```bash
ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "test -f /opt/$APP_SLUG/.env && stat -c %a /opt/$APP_SLUG/.env"
```
**Expected result:** Output "600", exit code 0
**Failure branch:** Copy .env template to /opt/$APP_SLUG/.env, populate real secrets, and run `chmod 600 /opt/$APP_SLUG/.env`.

#### Step 4: Issue TLS certificate
**Owner:** Human operator
```bash
ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "sudo certbot certonly --standalone --non-interactive --agree-tos -m $CERTBOT_EMAIL -d $SUBDOMAIN"
```
**Expected result:** Congratulations! Your certificate and chain have been saved...
**Failure branch:** Ensure port 80 is open in firewall; verify no conflicting process binds port 80; re-verify DNS.

#### Step 5: Trigger deployment via git push
**Owner:** Human operator
```bash
git push origin main
```
**Expected result:** GitHub Actions workflow triggered and runs green to completion
**Failure branch:** Inspect GitHub Actions run logs; check deploy key authorization in ~/.ssh/authorized_keys.

### Verification
- [ ] curl -f -s https://$SUBDOMAIN$HEALTH_PATH returns `{"ok":true}`
- [ ] curl -I https://$SUBDOMAIN returns HTTP 200 (not maintenance page)
- [ ] SSL certificate verified over TLS handshake: openssl s_client -connect $SUBDOMAIN:443 -servername $SUBDOMAIN
- [ ] Maintenance flag absent: ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "test ! -f /opt/$APP_SLUG/maintenance.flag"

### Rollback & Rollback Verification
**Trigger:** Deploy script fails, health check times out after 90 seconds, or 5xx error rate spikes post-deploy.
```bash
git revert HEAD --no-edit && git push origin main
```
**Rollback verification:** Confirm GitHub Actions finishes green and `curl -f -s https://$SUBDOMAIN$HEALTH_PATH` returns HTTP 200 on previous commit revision.

### Escalation
If rollback fails or database state is inconsistent, contact @<DEPLOY_USER> or lead maintainer. Inspect container logs with: `ssh -p $DEPLOY_PORT $DEPLOY_USER@$DEPLOY_HOST "cd /opt/$APP_SLUG && docker compose logs --tail=200"`.
