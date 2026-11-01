# Clone QA handback

Use the project's existing runner with PRACTICE sections 4-5; this recipe is the
clone-specific contract, not a replacement for the shared test/review process.
Fill [test-plan.md](../templates/test-plan.md) into `.skillator/clone/test-plan.md`
from every FL flow. Include happy paths, applicable edges and negative cases.
Use stable FL01-H1/E1/N1 IDs and tie results to S IDs and feature tickets.

For each flow consider empty/long/Unicode input, double submits, two tabs,
back/refresh, slow/offline network, expired sessions, permission/deleted records,
second-user isolation, timezone/DST, compact layouts, keyboard and assistive labels.
Choose relevant cases rather than ticking unexecuted rows. Payment negatives use
provider test mode; real-provider/OAuth/email acceptance remains an explicit manual
case until the owner executes it.

For web, create one role/label-based Playwright spec per flow using synthetic
seed data and an explicitly identified local/approved clone. The optional
[example](../templates/e2e.example.spec.ts) demonstrates local-only navigation,
console/server-error checks and axe on a screen; it needs the project's
@playwright/test and @axe-core/playwright dev dependencies and adapted routes.
It is not an installed test suite or proof a target app works.
It needs Playwright 1.31+ for route.fetch maxRedirects. The HTTP guard fetches
without following redirects, rejects every 3xx response (including local ones),
and fulfills only nonredirect responses. Use a direct-response seeded fixture;
redirect-dependent flows need their own approved-clone test/isolation design.
See [the Route API](https://playwright.dev/docs/api/class-route#route-fetch-option-max-redirects).
 Its one happy-path
example does not prove double-submit or backend isolation: implement those with
actual database/API assertions from the backend contract. Do not install runners
or browsers without the project's authorization. Native apps use their existing
UI/integration runner and the same flow/edge assertions; a web example does not
certify Android, iOS or Windows acceptance.

For web flows, fail on browser console errors, server 5xx responses and relevant
axe violations; scan each applicable screen, not just the success page.
Capture each applicable screen's accessibility/console/5xx results and screenshots
with the existing runner/browser or screenshot-argus. Automation that cannot run is
blocked or assigned a manual checklist, never passed. Test the clone only; do not
redirect fixtures, requests, fuzzing or load to the original's servers.

Every reproduced defect uses [the bug template](../templates/bug-report.md) and a
canonical B ticket, with detail under `.skillator/clone/bugs/B<n>.md`. S1 means
security/data/payment/core-flow failure; S2 broken feature without a workaround;
S3 has a workaround or visible fault; S4 is cosmetic. Unreproduced suspicions are
a separate to-check list. Fix S1/S2 first with a failing test and independent
verification, then rerun appropriate regression checks. The handback states cases
run/passed/failed/manual/blocked, bugs by severity and revision/evidence. No open
S1/S2 can pass the release gate. Next is parity, with failures routed back to build.
