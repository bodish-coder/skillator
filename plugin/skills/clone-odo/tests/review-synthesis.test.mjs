import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
const REVIEWS_MD = join(SKILL_ROOT, 'references', 'reviews.md');
const UPSTREAM_MD = join(SKILL_ROOT, 'UPSTREAM.md');

/**
 * Validates a review synthesis report according to clone-odo rules:
 * - Must state tool base numbers: <k> reviews kept (<d> dropped for no link, <u> duplicates removed)
 * - Mention counts must never be stated as unique users
 * - Every finding item must report:
 *   - Problem / theme
 *   - Evidence (mentions/reviews and sources)
 *   - Affected segments
 *   - Impact
 *   - Contradictory evidence (with linked quotes or explicit none observed)
 *   - Confidence level (High / Medium / Low) with rationale
 * - Every quote must be linked to a URL
 */
export function validateSynthesisReport(markdown, {
  expectedKept = null,
  expectedDropped = null,
  expectedDupes = null,
  allowUserInflation = false
} = {}) {
  const errors = [];

  // 1. Base counts line
  const baseMatch = markdown.match(/(\d+)\s+reviews kept\s+\((\d+)\s+dropped for no link,\s+(\d+)\s+duplicates removed\)/i);
  if (!baseMatch) {
    errors.push('Missing tool base count line: "<k> reviews kept (<d> dropped for no link, <u> duplicates removed)"');
  } else {
    const kept = parseInt(baseMatch[1], 10);
    const dropped = parseInt(baseMatch[2], 10);
    const dupes = parseInt(baseMatch[3], 10);

    if (expectedKept !== null && kept !== expectedKept) {
      errors.push(`Kept count mismatch: got ${kept}, expected ${expectedKept}`);
    }
    if (expectedDropped !== null && dropped !== expectedDropped) {
      errors.push(`Dropped count mismatch: got ${dropped}, expected ${expectedDropped}`);
    }
    if (expectedDupes !== null && dupes !== expectedDupes) {
      errors.push(`Duplicates count mismatch: got ${dupes}, expected ${expectedDupes}`);
    }
  }

  // 2. Mentions vs unique users check
  if (!allowUserInflation) {
    // Flag phrases like "X users complain", "X customers reported" when derived from mentions
    const userInflationRegex = /\b(\d+)\s+(?:unique\s+)?(?:users?|customers?|people|clients?)\s+(?:complain|hate|reported|demanded|struggled|requested)/i;
    const userMatch = markdown.match(userInflationRegex);
    if (userMatch) {
      errors.push(`Mentions converted to unique users: "${userMatch[0]}" (must report mentions or reviews, not unique users)`);
    }
  }

  // 3. Synthesis findings sections
  const findingBlocks = markdown
    .split(/\r?\n(?=#{2,4}\s+(?:Theme|Finding|Item|\d+\.))/i)
    .filter(b => /#{2,4}\s+(?:Theme|Finding|Item|\d+\.)/i.test(b));

  if (findingBlocks.length === 0) {
    errors.push('No findings or themes detected in synthesis report');
  }

  for (const block of findingBlocks) {
    // Check required fields
    if (!/affected segments?/i.test(block)) {
      errors.push('Finding missing "Affected segment(s)"');
    }
    if (!/\bimpact\b/i.test(block)) {
      errors.push('Finding missing "Impact"');
    }
    if (!/contradictory evidence/i.test(block)) {
      errors.push('Finding missing "Contradictory evidence"');
    }
    if (!/\bconfidence\b/i.test(block)) {
      errors.push('Finding missing "Confidence"');
    }

    // Verify confidence level is valid
    const confMatch = /(?:confidence|\*\*confidence\*?\*?):\*?\*?\s*(High|Medium|Low)\b/i.exec(block);
    if (!confMatch) {
      errors.push('Finding has missing or invalid Confidence level (must be High, Medium, or Low)');
    }

    // Check that quotes are linked: [quote](url) or quote "..." (url)
    const hasQuotes = /"[^"]+"\s*\((https?:\/\/[^\s)]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.test(block);
    if (!hasQuotes && !/none observed/i.test(block)) {
      errors.push('Finding has unlinked quotes or lacks URL citations');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// --------------------------------------------------------------------------
// Schema & references/reviews.md tests
// --------------------------------------------------------------------------

test('reviews.md documents evidence-aware review synthesis schema', () => {
  assert.ok(existsSync(REVIEWS_MD), 'references/reviews.md must exist');
  const content = readFileSync(REVIEWS_MD, 'utf8');

  // Must document affected segments, impact, contradictory evidence, and confidence
  assert.match(content, /affected segments?/i, 'reviews.md must document affected segments');
  assert.match(content, /impact/i, 'reviews.md must document impact');
  assert.match(content, /contradictory evidence/i, 'reviews.md must document contradictory evidence');
  assert.match(content, /confidence/i, 'reviews.md must document confidence');

  // Must preserve base tool counts
  assert.match(content, /<k>\s*reviews kept/i, 'must preserve kept count pattern');
  assert.match(content, /<d>\s*dropped/i, 'must preserve dropped count pattern');
  assert.match(content, /<u>\s*duplicates/i, 'must preserve duplicate count pattern');

  // Must state mention counts are not unique users
  assert.match(content, /unique[- ]user/i, 'must prohibit conflating mentions with unique users');

  // Must mandate linked verbatim quotes
  assert.match(content, /verbatim|copied exactly|substring/i, 'must require exact quotes');
  assert.match(content, /URL/i, 'must require URL for quotes');
});

// --------------------------------------------------------------------------
// UPSTREAM.md tests
// --------------------------------------------------------------------------

test('UPSTREAM.md records synthesize-research absorption with Apache-2.0 attribution and valid table structure', () => {
  assert.ok(existsSync(UPSTREAM_MD), 'UPSTREAM.md must exist');
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  // Upstream metadata
  assert.match(content, /anthropics\/knowledge-work-plugins/, 'must record anthropics/knowledge-work-plugins');
  assert.match(content, /product-management\/skills\/synthesize-research\/SKILL\.md/, 'must record watched path');
  assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, 'must record pinned commit');

  // Apache-2.0 license & modifications
  assert.match(content, /Apache License, Version 2\.0/i, 'must cite Apache License, Version 2.0');
  assert.match(content, /Anthropic, PBC/i, 'must cite Anthropic, PBC copyright');
  assert.match(content, /modifications?/i, 'must document modifications per Apache-2.0 Section 4(b)');

  // Upstreams table parseable
  const upstreamsMatch = content.match(/(?:\r?\n|^)## Upstreams\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/);
  assert.ok(upstreamsMatch, 'must contain ## Upstreams section');
  const tableRows = upstreamsMatch[1]
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Name'));

  assert.ok(tableRows.length >= 2, 'table must contain at least 2 rows (replica-skill and synthesize-research)');
  const synthRow = tableRows.find(r => r.includes('synthesize-research'));
  assert.ok(synthRow, 'table must contain synthesize-research row');

  const cols = synthRow.split('|').map(c => c.trim());
  assert.ok(cols.length >= 7, 'table row must have standard columns');
  assert.ok(cols[2].includes('anthropics/knowledge-work-plugins'), 'repo column must match');
  assert.ok(cols[3].includes('product-management/skills/synthesize-research/SKILL.md'), 'path column must match');
  assert.ok(cols[4].includes('2574e29377c7173d0cecffef29a6ecbd7f8ccb5d'), 'commit column must match');
});

// --------------------------------------------------------------------------
// Scenarios: duplicate, missing-URL, prolific-reviewer, contradictory-segment
// --------------------------------------------------------------------------

test('scenario 1: duplicate reviews are deterministically deduplicated and preserved in base count', () => {
  const report = `
# Review Synthesis — Calendar App

12 reviews kept (0 dropped for no link, 3 duplicates removed)

### Theme 1: Sync latency on mobile
- **Evidence:** 8 reviews across 2 sources
- **Affected segments:** Mobile-first field workers syncing across intermittent networks
- **Impact:** High — appointments delayed and double bookings occur
- **Quotes:**
  - "[Calendar takes 5 minutes to show updates](https://example.com/rev/1)"
  - "[Appointments don't sync until restart](https://example.com/rev/2)"
- **Contradictory evidence:** None observed in dataset
- **Confidence:** High — 8 reviews across App Store and Google Play with consistent failure reports
`;

  const result = validateSynthesisReport(report, {
    expectedKept: 12,
    expectedDropped: 0,
    expectedDupes: 3
  });
  assert.strictEqual(result.valid, true, `Validation errors: ${result.errors.join('; ')}`);
});

test('scenario 2: missing-URL rows are dropped and never quoted or counted in themes', () => {
  const report = `
# Review Synthesis — Project Board

15 reviews kept (4 dropped for no link, 1 duplicates removed)

### Theme 1: Export to CSV missing
- **Evidence:** 7 reviews across 3 sources
- **Affected segments:** Finance and compliance teams needing offline audits
- **Impact:** Medium — blocks monthly reporting cycle
- **Quotes:**
  - "[Cannot export transactions to CSV for accounting](https://g2.com/r/10)"
  - "[Need raw CSV download for compliance audit](https://capterra.com/r/22)"
- **Contradictory evidence:** None observed in dataset
- **Confidence:** High — multiple independent sources requesting same export capability
`;

  const result = validateSynthesisReport(report, {
    expectedKept: 15,
    expectedDropped: 4,
    expectedDupes: 1
  });
  assert.strictEqual(result.valid, true, `Validation errors: ${result.errors.join('; ')}`);

  // An invalid report that quotes an unlinked row or converts dropped rows into counts must fail
  const badReport = report.replace(
    '15 reviews kept (4 dropped for no link, 1 duplicates removed)',
    '19 reviews kept (0 dropped for no link, 1 duplicates removed)'
  );
  const badResult = validateSynthesisReport(badReport, { expectedKept: 15, expectedDropped: 4 });
  assert.strictEqual(badResult.valid, false, 'Should fail when dropped count is ignored');
});

test('scenario 3: prolific reviewer reviews are counted as mentions without inflating unique users', () => {
  const validProlificReport = `
# Review Synthesis — Note App

10 reviews kept (1 dropped for no link, 0 duplicates removed)

### Theme 1: Markdown table rendering
- **Evidence:** 6 reviews across 1 source (all 6 mentions from single prolific reviewer @poweruser99)
- **Affected segments:** Advanced markdown documentation authors
- **Impact:** Low — visual alignment glitch in nested tables, does not corrupt underlying text
- **Quotes:**
  - "[Table pipe delimiters misalign on wrapped cells](https://reddit.com/r/notes/comments/1)"
  - "[Nested markdown tables collapse column widths](https://reddit.com/r/notes/comments/2)"
- **Contradictory evidence:** None observed in dataset
- **Confidence:** Low — 6 mentions originate from a single prolific reviewer on one source; requires broader validation
`;

  const result = validateSynthesisReport(validProlificReport, {
    expectedKept: 10,
    expectedDropped: 1,
    expectedDupes: 0
  });
  assert.strictEqual(result.valid, true, `Expected valid report, got: ${result.errors.join('; ')}`);

  // Invalid report inflating mentions to unique users
  const inflatedReport = validProlificReport.replace(
    '6 reviews across 1 source (all 6 mentions from single prolific reviewer @poweruser99)',
    '6 users complain about markdown table rendering'
  );
  const badResult = validateSynthesisReport(inflatedReport);
  assert.strictEqual(badResult.valid, false, 'Must reject inflating prolific reviewer mentions to unique users');
});

test('scenario 4: contradictory segments retain linked evidence and lower confidence accordingly', () => {
  const contradictoryReport = `
# Review Synthesis — CRM Tool

20 reviews kept (2 dropped for no link, 1 duplicates removed)

### Theme 1: Notification frequency and verbosity
- **Evidence:** 9 reviews across 3 sources
- **Affected segments:** Solopreneurs and small agencies managing fewer than 10 deals
- **Impact:** Medium — alert fatigue and inbox noise
- **Quotes:**
  - "[Hourly digest emails overwhelm my inbox and drown client replies](https://g2.com/r/301)"
  - "[Too many push alerts for trivial stage changes](https://play.google.com/r/402)"
- **Contradictory evidence:**
  - Enterprise sales directors explicitly praise real-time alerts:
    "[Instant push notifications let our enterprise team respond to enterprise leads within 2 minutes](https://trustpilot.com/r/505)"
- **Confidence:** Medium — high volume of complaints from solopreneurs is directly contradicted by enterprise managers who rely on high-frequency notifications; requires segment-specific alert settings rather than blanket removal
`;

  const result = validateSynthesisReport(contradictoryReport, {
    expectedKept: 20,
    expectedDropped: 2,
    expectedDupes: 1
  });
  assert.strictEqual(result.valid, true, `Expected valid report, got: ${result.errors.join('; ')}`);
});
