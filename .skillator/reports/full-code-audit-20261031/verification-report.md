# Fresh adversarial verification — RUN0028

Completed: 40 supplied records resolve to 38 unique candidates. 37 accepted at score80 or above; 1 excluded from the latent-defect count; 2 duplicate parent records collapsed into their integration entries; 0 pending.

Scope: current repository HEAD8b92f76, not a staged diff. Each supplied candidate was checked against current source and relevant caller/contract/test boundaries. No production source, board, Git, global installation, auth or external channel mutations. Only verification artifacts written. CodeGraph consulted first; inaccurate broad retrieval and nonindexed shell/PowerShell were followed with direct numbered source reads.

## Highest priorities

- AUTO-14: local remote-session teardown waits behind remote channel I/O. Production timeout limits individual requests, but does not make this ordering safe.
- AUTO-17 and AUTO-16: lease cleanup can remove winner protection; heartbeat can restore stale in-flight state. Both are source-proven conditional interleavings, not stress-test reproductions. The common heartbeat case preserves the completion SHA.
- integration-deploy-backup / integration-nginx-envsubst / integration-deploy-success: failed backup continues rebuild, nginx substitution destroys runtime variables, and failed TLS can report success.
- AUTO-05 / OPS-07 / AUTO-06: delivered message claims do not establish remote delivery, real recipients disappear at the Ops parser, and >200-message reads can consume unseen records.
- AUTO-10 / integration-reconcile-exit / parent-taskwork-review-errors / parent-context-layout: success signals can certify incomplete or failed checks.

## Exclusions and claim corrections

OPS-08 is retained as requested requirement work (F98a interactive first-time launch; B21 passive entry), not a latent defect. F98 explicitly asks to run the script after confirmation, so --check-only leaves that completion gap; tests intentionally codify the existing narrower implementation. Existing auto-open is not an accidental regression. This distinction does not revoke or replace the latest user request.

AUTO-01 survives because reviews.md:28-31 expressly demands each quote be an exact substring and says never shorten. The narrower defect is output-contract mismatch; normal editorial ellipses are not alleged to fabricate a reviewer opinion. AUTO-02 affects layout/region coverage, not the pixel score calculation. AUTO-08 can falsely settle the generated next wizard; separate answersToCommands finalization gates prevent claiming automatic relay application. OPS-01 standalone read-only policy and OPS-03 standalone paste-only policy are excluded from their native-surface defects.

Prior negative process-cleanup probes remain negative (parent-boundary-probes.json); AUTO-09 cwd hypothesis remains retracted because targets are repo-relative. Canceled NOPASSWD/unpinned-npx policy choices were not revived. These are hypothesis exclusions, not additional supplied candidate records.

## Evidence limits

New verifier execution: production UTF8 decoder; Session disarm with separately stalled send/editButtons; wrong-set unreviewed nextWizardSet;201-message production formatter; long-review snippet;101px imgdiff remainder; missing-root sweep. Every probe is pure/in-memory or read-only. No native coding host, live auth, Teams transport, production database, certificate issuance, real dispatch, race stress or browser acceptance was exercised.

Late F86 candidates were also resolved: exact PowerShell argument-expression and TunnelHosted probes confirm mutation-capable fallback on unknown options and false hosting detection for an unrelated tunnel. These ran with a stub process object and never entered setup. Both are included in the counts and disposition table. Parent reports the earlier shell allocator/freshness environment blocks resolved by successful reruns in parent-helper-rerun.json; they are not outstanding blockers for this verification.

Reviewed investigator proofs include isolated Git quoted-path failure, extracted installer functions with report-owned Muse stub, actual envsubst output, isolated PowerShell review packet, split-layout context audit, synthetic contrast helper and helper parser/archive dry-run. Existing broad test counts are not used as proof of missing integration behavior. Complete per-candidate reasons, exact verified refs, proof refs and limits are in verification-findings.json.

## Candidate dispositions

| ID | Verdict | Score |
|---|---|---|
| OPS-01 | ACCEPT | 95 |
| OPS-02 | ACCEPT | 100 |
| OPS-03 | ACCEPT | 95 |
| OPS-04 | ACCEPT | 100 |
| OPS-05 | ACCEPT | 100 |
| OPS-06 | ACCEPT | 95 |
| OPS-07 | ACCEPT | 100 |
| OPS-08 | REJECT | 75 |
| OPS-09 | ACCEPT | 95 |
| integration-muse-override | ACCEPT | 95 |
| integration-gemini-alias | ACCEPT | 90 |
| integration-reconcile-exit | ACCEPT | 95 |
| integration-nginx-envsubst | ACCEPT | 100 |
| integration-deploy-backup | ACCEPT | 95 |
| integration-deploy-success | ACCEPT | 95 |
| integration-upstream-root | ACCEPT | 90 |
| parent-taskwork-review-errors | ACCEPT | 85 |
| parent-context-layout | ACCEPT | 100 |
| integration-alpha-contrast | ACCEPT | 95 |
| HELP-01 | ACCEPT | 100 |
| HELP-02 | ACCEPT | 90 |
| AUTO-01 | ACCEPT | 90 |
| AUTO-02 | ACCEPT | 95 |
| AUTO-03 | ACCEPT | 95 |
| AUTO-05 | ACCEPT | 100 |
| AUTO-06 | ACCEPT | 95 |
| AUTO-07 | ACCEPT | 85 |
| AUTO-08 | ACCEPT | 95 |
| AUTO-10 | ACCEPT | 100 |
| AUTO-11 | ACCEPT | 100 |
| AUTO-12 | ACCEPT | 95 |
| AUTO-13 | ACCEPT | 100 |
| AUTO-14 | ACCEPT | 95 |
| AUTO-15 | ACCEPT | 95 |
| AUTO-16 | ACCEPT | 90 |
| AUTO-17 | ACCEPT | 90 |
| verification-setup-unknown-args | ACCEPT | 90 |
| verification-setup-tunnel-identity | ACCEPT | 95 |
