# Deployment handback

First fill the existing [preflight](preflight.md) with actual results. Any failed,
blocked or unevidenced required row stops publication. Show the completed gate and
obtain the owner's go for the concrete release. Plans and templates are not a go.
Use [deploy.md](../templates/deploy.md) for `.skillator/clone/deploy.md`.

Pass the approved candidate to deploy-merlin/deploy-niyoj with the project's chosen
hosting/build route. Record any project-specific provider tool as a dependency;
clone-odo does not assume Vercel, buy accounts, enter credentials or run another
CLI's profile. Prepare commands and configuration names; the owner supplies
secrets and performs account/purchase actions.

1. Production services: separate production data/project, tested migration and
   recovery plan, enabled backups with restore evidence, synthetic-data removal,
   environment variable names matching .env.example. A failed/missing required
   backup or migration blocks the operation; a warning is not approval to continue.
2. Providers: production OAuth redirects/origins and required review approval;
   verified sending domain; payment products/prices approved by the owner, correct
   live webhook/signature settings and server entitlements. Any real payment/refund
   check is an explicit owner-controlled action; never perform a charge just because
   this checklist mentions one. Record test versus live evidence separately.
3. Domain/email: obtain exact current record values from the selected host/provider,
   not guessed stock IPs. Record type/name/value/TTL, owner/action/result, apex/www
   canonical redirect, HTTPS and renewal checks. Verify appropriate SPF/DKIM/DMARC
   and delivery from the selected email provider. Proposed DNS is not applied DNS.
4. Operations: error tracking, sanitized logs, uptime checks for home/core API,
   backup/job alerts, privacy-aware analytics, alert owner and first-week watch plan.
   Verify the real deployed core flow and mobile/keyboard experience after the
   release; a health URL alone does not establish business-flow success.
5. Platforms: web release/preview and rollback; Android/iOS internal beta builds,
   signing, store metadata and owner developer accounts; Windows packaging,
   signing/update and recovery checks as applicable. Use current official platform
   requirements, mark unavailable SDK/account checks blocked, and obtain explicit
   authorization for uploads/submissions. No fixed developer fees are assumed.
   Use the selected platform builder: Expo EAS build/submit, Xcode archive and
   App Store Connect, or a Gradle bundle and Play internal track as applicable;
   prepare current commands, with the owner approving account/submission steps.

Return the release revision, actual URL/artifact, exact commands/results, applied
DNS/provider configuration evidence, monitoring/rollback ownership and remaining
manual checks. If execution is blocked, return a prepared handoff with that state;
do not call the clone live or the release successful. Execution skill ownership
never waives this verification or the clean-room/rebrand gate.
