import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const artifactsMdPath = resolve(here, '../references/artifacts.md');
const upstreamMdPath = resolve(here, '../UPSTREAM.md');

/**
 * Lightweight validator for spec-watson specifications.
 * Enforces:
 * - Requirements must carry R IDs (R1, R2, ...)
 * - Trace table must map R IDs to Evidence paths
 * - Product outcomes are optional; mechanical edits do not require them
 * - When present, product outcomes include key fields and never fabricate targets for unknown values
 */
export function validateSpec(markdown, { isMechanical = false, allowedFabrications = false } = {}) {
  const errors = [];

  // 1. Requirements with R IDs
  const reqSection = markdown.match(/## Requirements([\s\S]*?)(?=\n## |$)/);
  if (!reqSection) {
    errors.push('Missing "## Requirements" section');
  } else {
    const rIds = [...reqSection[1].matchAll(/- (R\d+)\b/g)].map((m) => m[1]);
    if (rIds.length === 0) {
      errors.push('Requirements section must define at least one R ID (e.g. - R1)');
    }
  }

  // 2. Trace table
  const traceSection = markdown.match(/## Trace([\s\S]*?)(?=\n## |$)/);
  if (!traceSection) {
    errors.push('Missing "## Trace" section');
  } else {
    const traceRows = traceSection[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|') && !l.includes('---') && !l.includes('Requirement'));
    if (traceRows.length === 0) {
      errors.push('Trace table must have at least one data row');
    }
  }

  // 3. Product outcomes (optional)
  const outcomeMatch = markdown.match(/## Product outcomes[^\n]*\n([\s\S]*?)(?=\n## |$)/i);
  if (isMechanical && outcomeMatch) {
    // Allowed, but not required
  }

  if (outcomeMatch) {
    const outcomeText = outcomeMatch[1];

    // Check required outcome fields
    const hasAudienceProblem = /audience|problem/i.test(outcomeText);
    const hasDesiredOutcome = /desired outcome/i.test(outcomeText);
    const hasMetricSource = /metric source/i.test(outcomeText);
    const hasBaseline = /baseline/i.test(outcomeText);
    const hasTarget = /target/i.test(outcomeText);
    const hasWindow = /measurement window/i.test(outcomeText);
    const hasEvalDate = /evaluation date/i.test(outcomeText);

    if (!hasAudienceProblem) errors.push('Product outcomes missing audience or problem');
    if (!hasDesiredOutcome) errors.push('Product outcomes missing desired outcome');
    if (!hasMetricSource) errors.push('Product outcomes missing metric source');
    if (!hasBaseline) errors.push('Product outcomes missing baseline');
    if (!hasTarget) errors.push('Product outcomes missing target');
    if (!hasWindow) errors.push('Product outcomes missing measurement window');
    if (!hasEvalDate) errors.push('Product outcomes missing evaluation date');

    // Check for fabricated targets when source indicates missing/unknown measurements
    if (!allowedFabrications) {
      const targetMatch = outcomeText.match(/(?:target|\*\*target\*\*):\s*([^\n]+)/i);
      const baselineMatch = outcomeText.match(/(?:baseline|\*\*baseline\*\*):\s*([^\n]+)/i);
      const isUnknownBaseline = baselineMatch && /(unknown|tbd|none|n\/a|\?)/i.test(baselineMatch[1]);
      const hasSpecificTarget = targetMatch && !/(unknown|tbd|none|n\/a|\?|to be determined)/i.test(targetMatch[1]);

      if (isUnknownBaseline && hasSpecificTarget) {
        errors.push('Fabricated target detected: target was specified while baseline is unknown');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

test('artifacts.md documents optional product outcomes with all required fields', () => {
  assert.ok(existsSync(artifactsMdPath), 'artifacts.md must exist');
  const content = readFileSync(artifactsMdPath, 'utf8');

  // Must mention product outcomes as optional
  assert.match(content, /product outcome/i, 'artifacts.md must reference product outcomes');
  assert.match(content, /optional/i, 'product outcomes must be described as optional');

  // Must cover all specified elements
  assert.match(content, /audience/i, 'must cover audience');
  assert.match(content, /problem/i, 'must cover problem');
  assert.match(content, /desired outcome/i, 'must cover desired outcome');
  assert.match(content, /metric source/i, 'must cover metric source');
  assert.match(content, /baseline/i, 'must cover baseline');
  assert.match(content, /target/i, 'must cover target');
  assert.match(content, /measurement window/i, 'must cover measurement window');
  assert.match(content, /evaluation date/i, 'must cover evaluation date');

  // Must preserve R IDs and traceability
  assert.match(content, /R\d+|R IDs?/i, 'must preserve R IDs');
  assert.match(content, /trace/i, 'must preserve trace table');

  // Unknown values stay unknown / no fabricated targets
  assert.match(content, /unknown/i, 'must state that unknown values stay unknown');
  assert.match(content, /fabricat/i, 'must warn against fabricating targets');

  // No PRD ceremony for mechanical changes
  assert.match(content, /mechanical/i, 'must exempt mechanical changes from PRD ceremony');
});

test('scenario 1: vague product brief preserves traceability and marks unknown targets without fabricating', () => {
  const vagueBriefSpec = `
# Spec — Mobile Onboarding Simplification

## Source
> "Users say signing up on mobile feels tedious and confusing. Let's make it smoother."

## Product outcomes (optional)
- **Audience & Problem:** Mobile first-time users encountering friction during registration.
- **Desired outcome:** Reduced friction and improved onboarding completion.
- **Metric source:** Mobile signup funnel analytics (\`mobile_signup_funnel\`).
- **Baseline:** UNKNOWN
- **Target:** UNKNOWN (baseline not yet instrumented; do not fabricate target)
- **Measurement window:** 14 days post-launch
- **Evaluation date:** UNKNOWN

## Requirements
- R1 Mobile signup form displays on a single scrollable view.
- R2 Social auth buttons appear above email input.

## Trace
| Id | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| R1 | Single view signup | \`auth/signup.tsx:MobileSignup\` | \`tests/signup.test.tsx:test_single_view\` |
| R2 | Social auth placement | \`auth/signup.tsx:SocialButtons\` | \`tests/signup.test.tsx:test_social_order\` |
`;

  const result = validateSpec(vagueBriefSpec);
  assert.strictEqual(result.valid, true, `Expected valid spec, got errors: ${result.errors.join(', ')}`);

  // Disallow fabricated target
  const fabricatedSpec = vagueBriefSpec.replace(
    '**Target:** UNKNOWN (baseline not yet instrumented; do not fabricate target)',
    '**Target:** 85% completion rate'
  );
  const badResult = validateSpec(fabricatedSpec);
  assert.strictEqual(badResult.valid, false, 'Should reject fabricated target when baseline is unknown');
});

test('scenario 2: missing measurements preserve traceability without fabricated targets', () => {
  const missingMeasurementSpec = `
# Spec — Coupon Batch Purge

## Source
> "Purge expired coupons nightly so database queries stay fast."

## Product outcomes (optional)
- **Audience & Problem:** DB performance degraded by accumulated coupon rows.
- **Desired outcome:** Keep coupon table compact to maintain index lookup performance.
- **Metric source:** UNKNOWN (DB query latency metrics pending setup)
- **Baseline:** UNKNOWN
- **Target:** UNKNOWN
- **Measurement window:** UNKNOWN
- **Evaluation date:** UNKNOWN

## Requirements
- R1 Expired coupons are purged in batches of 1000 every 24 hours.

## Trace
| Id | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| R1 | Batch purge | \`jobs/purge.py:purge_expired\` | \`tests/test_purge.py:test_purge_batch\` |
`;

  const result = validateSpec(missingMeasurementSpec);
  assert.strictEqual(result.valid, true, `Expected valid spec, got errors: ${result.errors.join(', ')}`);
});

test('scenario 3: tiny technical edit does not require PRD ceremony', () => {
  const technicalEditSpec = `
# Spec — Fix postal code regex

## Source
> "The UK postal code regex rejects valid SW1A postcodes. Fix the pattern."

## Requirements
- R1 Postal code validator accepts valid UK postcode formats including spaces.

## Trace
| Id | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| R1 | UK postcode regex | \`utils/postal.ts:validatePostcode\` | \`tests/postal.test.ts:test_uk_postcodes\` |
`;

  const result = validateSpec(technicalEditSpec, { isMechanical: true });
  assert.strictEqual(result.valid, true, 'Mechanical change without product outcomes must be valid');
});

test('UPSTREAM.md records write-spec absorption with Apache-2.0 attribution and correct table structure', () => {
  assert.ok(existsSync(upstreamMdPath), 'plugin/skills/spec-watson/UPSTREAM.md must exist');
  const content = readFileSync(upstreamMdPath, 'utf8');

  // Check required repo, commit, path
  assert.match(content, /anthropics\/knowledge-work-plugins/, 'must record anthropics/knowledge-work-plugins');
  assert.match(content, /product-management\/skills\/write-spec\/SKILL\.md/, 'must record watched path');
  assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, 'must record pinned commit');

  // Check Apache-2.0 license notice & modification statements
  assert.match(content, /Apache License, Version 2\.0/i, 'must cite Apache License, Version 2.0');
  assert.match(content, /Anthropic, PBC/i, 'must cite Anthropic, PBC copyright');
  assert.match(content, /modification/i, 'must note modifications per Apache-2.0');

  // Verify table structure parseable by upstream-check
  const upstreamsMatch = content.match(/(?:\r?\n|^)## Upstreams\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/);
  assert.ok(upstreamsMatch, 'must contain ## Upstreams section');
  const tableRows = upstreamsMatch[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !l.includes('---') && !l.includes('Name'));
  assert.ok(tableRows.length >= 1, 'must have at least one upstreams table row');

  const cols = tableRows[0].split('|').map((c) => c.trim());
  assert.ok(cols.length >= 7, 'table row must have at least 6 columns');
  assert.strictEqual(cols[1], 'write-spec', 'Name should be write-spec');
  assert.ok(cols[2].includes('anthropics/knowledge-work-plugins'), 'Repo should match');
  assert.ok(cols[3].includes('product-management/skills/write-spec/SKILL.md'), 'Watched path should match');
  assert.ok(cols[4].includes('2574e29377c7173d0cecffef29a6ecbd7f8ccb5d'), 'Commit SHA should match');
});
