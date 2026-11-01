# The complete clone workflow

Use this index when planning a whole clone or resuming one stage. The eleven
Replica workflows are contracts within clone-odo, not eleven extra installed
skills. Clone-odo owns the map and handbacks; the named execution skill does
its work under the clean-room guard in SKILL.md section 0.

Copy [the workflow ledger](../templates/workflow.md) to
`.skillator/clone/workflow.md`. Record each stage as not started, planned,
implemented, verified, blocked, or not applicable with a reason. A document
being present proves planning only. Verification requires the actual command,
result, date and relevant S/FL/F ticket IDs. Missing inputs block execution;
they do not prevent recording the remaining plan. Start at the requested stage
when its inputs exist rather than restarting recon unnecessarily.

All artifact paths below are relative to `.skillator/clone/`.

| Stage | Reads | Required handback | Execution owner and acceptance | Recipe |
|---|---|---|---|---|
| Recon | approved scope and allowed public/user-account sources | recon.md, features.csv, screens/ | clone-odo: source links, S/FL IDs, observed states, confidence and exclusions | [Recon](recon.md) |
| Architecture | recon.md, features.csv, existing project constraints | architecture.md, schema.sql or a named first migration | build-jarvis: schema/access constraints, per-flow API/jobs and vertical-slice order reviewed | [Architecture](architecture.md) |
| Design | recon.md, permitted screenshots, architecture.md | design/tokens.json, design/components.md, token bindings and primitive gallery evidence | design-arwen: measured roles, original assets, applicable states, contrast and accessibility evidence | [Design/build](design-build.md) |
| Build | recon.md, architecture.md, design/, feature tickets | project code, build-log.md, clone-screens/, updated features.csv | build-jarvis: core slice first, screen/state evidence; mocked data remains partial | [Design/build](design-build.md) |
| Backend | architecture.md, implemented slice and data-layer contract | migrations/server code, backend.md, project .env.example, updated feature rows | build-jarvis: isolation, races, idempotency, provider test-mode and recovery evidence | [Backend](backend.md) |
| Test | recon flows, implemented clone, synthetic seed data | test-plan.md, project specs and results, bugs/B<n>.md linked from TICKETS.md | PRACTICE and screenshot-argus: reproduced defects and honest executed/manual/blocked case counts | [Testing](testing.md) |
| Diff | current feature matrix, matching-state screenshots and test evidence | parity.md, diffs/, ordered missing features | clone-odo: feature/must-have bar and behavior comparison, never visual score alone | [Parity](parity.md) |
| Entrepreneur | linked reviews, changelog and tool output | reviews.csv, feedback.md, fixes.md and original=no feature rows | clone-odo: kept/dropped base, linked quotes, thin themes and evidence-based angle | [Reviews](reviews.md) |
| Brand | fixes.md angle, measured design roles | brand.md, brand.json, updated tokens/copy and sweep evidence | clone-odo plus design-arwen: independent identity, dated screening checks, clean sweep | [Brand](brand.md) |
| Launch | fixes.md, feedback.md, brand files, real product evidence | launch/landing.md, pricing.md, launch-plan.md, root listing.json | clone-odo prepares proposals; owner approves pricing/outreach; design-arwen builds the page | [Launch](launch.md) |
| Deploy | completed preflight.md, approved launch and release candidate | deploy.md with commands/results, release URL/artifact and recovery/monitoring plan | deploy-merlin/deploy-niyoj: explicit owner go, actual production checks, owner account steps | [Deploy](deploy.md) |

Launch files named pricing.md and launch-plan.md live under `launch/` too.
`listing.json` stays at the clone root for existing lint/preflight compatibility;
do not maintain a second divergent listing. Keep build migrations and executable
specs in the project's normal source/test locations, referenced by the handback.
A stage delegated to another skill is not complete until that handback returns.

All hosts use these same files. Load the execution skill using the current host's
skill mechanism; no Claude-only tool or another CLI's installed profile is a
prerequisite. Tools remain offline Python 3.8+ through odo.sh or odo.ps1. Browser,
mobile SDK, test runner and hosting access are project dependencies: record an
unavailable dependency as blocked, never as a passing stage. Existing project
choices win over illustrative stack defaults.
