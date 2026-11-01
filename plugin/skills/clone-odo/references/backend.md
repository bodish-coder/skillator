# Backend handback: build-jarvis

Read architecture.md and the current data-layer interface. Use
[the backend checklist](../templates/backend.md) for `.skillator/clone/backend.md`.
Only requirements supported by recon belong in scope; mark others not applicable.

The owner creates service projects, developer apps and keys. Generate variable
names in the project's `.env.example` with no values; the owner provisions secrets
outside tracked files. Use official APIs, least-privilege scopes and test/sandbox
modes. Never reuse the original's OAuth client, credentials or private endpoints.

| Area | Implement and return evidence |
|---|---|
| Auth | required verification/reset/magic-link/OAuth flows, secure session handling, logout/revocation, role/organization permissions and account deletion; provider-specific mobile mechanisms where applicable |
| Database | versioned migrations, synthetic seed data, access rules for every owned read/write, second-user denial tests, backup/restore checks and hard race constraints |
| Payments | hosted checkout/customer portal where suitable, server-owned entitlements, verified webhook signatures, stored event IDs/idempotent handlers, subscription update/cancel/failure tests, clear cancellation; all in test mode |
| Email/jobs | original transactional templates, verified sending-domain plan, UTC scheduling/user-zone presentation, bounded retries, duplicate handling and dead-letter/recovery evidence |
| Integrations | official API and scopes per feature, rate/size limits, token lifecycle, webhook validation, provider-review lead times and tests with the owner's test project |

For web sessions specify HttpOnly/Secure cookie settings and session revocation,
including sign-out of all sessions; native clients use the chosen provider's
secure platform storage. For Stripe, cover checkout completion, subscription
update/deletion and invoice payment failure with the project's configured API
version; other payment providers need equivalent state-transition tests.

Security acceptance includes server-side input validation, authorization on each
read/write, auth/email/SMS rate limiting, upload type/size/storage rules, secrets
excluded from bundles/logs/URLs, dependency checks appropriate to the stack, and
a processor inventory for privacy documentation. Evidence names the command/test,
result, date and FL case, or the missing dependency/owner action. A checked box
without evidence is pending. Do not make current provider-policy or legal claims
from memory; consult official sources when that project reaches the decision.

Return migrations/server code, backend.md, .env.example variable names and the
updated feature matrix. Test duplicate submits/webhooks against authoritative
stored results, not just one success message. Mock/provider-unavailable paths remain
partial or blocked. Live payments, purchases and account steps belong to the owner
and the deployment gate, not this handoff.
