import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARWEN_ROOT = join(HERE, '..');
const CRITIQUE_MD = join(ARWEN_ROOT, 'references', 'critique.md');
const UPSTREAM_MD = join(ARWEN_ROOT, 'UPSTREAM.md');

/**
 * Validates a design critique report text against the critique contract.
 *
 * Rules:
 * - Must specify design critique stage: Exploration, Refinement, or Implementation.
 * - Must specify evidence classification: Verified live-interface, Screenshot-only, Figma-unavailable, or Supplied mockup.
 * - Static/mockup/screenshot-only/Figma-unavailable scenarios MUST declare evidence limits.
 * - Static/mockup/screenshot-only/Figma-unavailable scenarios MUST NOT invent interaction, performance, or accessibility measurements.
 * - Measured numbers only allowed if live-interface and actually measured.
 * - Findings must be ranked by severity (P0, P1, P2) and include Where, What's wrong, and The fix.
 * - Must not contain code implementations (write no code).
 * - Must close with highest-leverage recommendation.
 */
export function validateCritiqueReport(reportText) {
  const errors = [];

  // 1. Stage specification
  const stageMatch = reportText.match(/\b(?:Stage|Design stage):\s*(Exploration|Refinement|Implementation)\b/i);
  if (!stageMatch) {
    errors.push('Missing explicit design stage (Exploration, Refinement, or Implementation)');
  }

  // 2. Evidence classification
  const evidenceMatch = reportText.match(/\b(?:Evidence|Evidence mode|Source type):\s*([^\n\r]+)/i);
  if (!evidenceMatch) {
    errors.push('Missing explicit evidence classification (e.g. Verified live-interface, Screenshot-only, Figma-unavailable, Supplied mockup)');
  }
  const evidenceType = evidenceMatch ? evidenceMatch[1].trim() : '';

  const isStatic = /screenshot-only|figma-unavailable|supplied mockup|static/i.test(evidenceType);
  const isLive = /verified live-interface|live-implementation|live interface/i.test(evidenceType);

  // 3. Evidence limits labeling
  const hasLimitsSection = /(?:Evidence limits?|Limitations?|Scope of evidence):\s*[^\n\r]+/i.test(reportText);
  if (isStatic && !hasLimitsSection) {
    errors.push('Static or mockup critique must explicitly label evidence limits');
  }

  // 4. Invention checks for static scenarios
  if (isStatic) {
    // Check for invented performance measurements
    if (/\b(?:LCP|FID|INP|CLS|TTFB)\s*(?:is|=|:)\s*\d+/i.test(reportText) || /\b\d+(?:\.\d+)?\s*(?:ms|seconds?|s)\s+(?:load|latency|TTFB|LCP)\b/i.test(reportText)) {
      errors.push('Static critique must not invent performance measurements');
    }
    // Check for invented interaction measurements
    if (/\b(?:measured|tested|verified)\s+(?:hover transition|focus ring|keyboard trap|drag-and-drop|continuous gesture)\b/i.test(reportText)) {
      errors.push('Static critique must not invent interaction measurements without live testing');
    }
    // Check for invented accessibility measurements
    if (/\b(?:screen reader announces|aria-live speaks|tab order is verified|axe scan completed)\b/i.test(reportText)) {
      errors.push('Static critique must not invent runtime accessibility measurements');
    }
  }

  // 5. Check for code implementations
  if (/```(?:html|css|js|javascript|tsx|jsx|ts|typescript|json|yaml|bash|sh)\s*\n[\s\S]*?```/i.test(reportText)) {
    errors.push('Critique mode must write no code');
  }

  // 6. Ranked findings
  const findings = [...reportText.matchAll(/-\s*\*\*(P[012])\*\*\s*—?\s*(.+)/g)];
  if (findings.length === 0) {
    // alternative format check: "P0", "P1", "P2" severity tags
    const altFindings = [...reportText.matchAll(/\b(P0|P1|P2)\b\s*[:—\-]\s*(.+)/g)];
    if (altFindings.length === 0) {
      errors.push('Report must contain ranked findings with P0/P1/P2 severity');
    }
  }

  // 7. Highest leverage closing
  const hasClosing = /(?:highest-leverage|highest leverage)/i.test(reportText);
  if (!hasClosing) {
    errors.push('Report must conclude with a single highest-leverage recommendation and improve/redesign lane');
  }

  return {
    valid: errors.length === 0,
    stage: stageMatch ? stageMatch[1] : null,
    evidenceType,
    isStatic,
    isLive,
    errors
  };
}

test('references/critique.md exists', () => {
  assert.ok(existsSync(CRITIQUE_MD), 'critique.md must exist');
});

test('UPSTREAM.md exists', () => {
  assert.ok(existsSync(UPSTREAM_MD), 'UPSTREAM.md must exist');
});

test('references/critique.md defines explicit design critique stages', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  // Must distinguish Exploration, Refinement, Implementation
  assert.match(content, /exploration/i, 'critique.md must mention exploration stage');
  assert.match(content, /refinement/i, 'critique.md must mention refinement stage');
  assert.match(content, /implementation/i, 'critique.md must mention implementation stage');
});

test('references/critique.md distinguishes supplied mockup critique from verified live-interface findings', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  assert.match(content, /supplied mockup/i, 'critique.md must address supplied mockups');
  assert.match(content, /live[- ]interface|live[- ]implementation/i, 'critique.md must address live interface findings');
  assert.match(content, /evidence limits?/i, 'critique.md must mandate labeling evidence limits');
});

test('references/critique.md explicitly covers screenshot-only, Figma-unavailable, and live-implementation scenarios', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  assert.match(content, /screenshot-only/i, 'critique.md must cover screenshot-only scenario');
  assert.match(content, /figma-unavailable|figma unavailable/i, 'critique.md must cover Figma-unavailable scenario');
  assert.match(content, /live-implementation|live implementation/i, 'critique.md must cover live-implementation scenario');
});

test('references/critique.md prohibits inventing interaction, performance, or accessibility measurements', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  assert.match(content, /invent/i, 'critique.md must prohibit inventing measurements');
  assert.match(content, /interaction/i, 'critique.md must address interaction');
  assert.match(content, /performance/i, 'critique.md must address performance');
  assert.match(content, /accessibility/i, 'critique.md must address accessibility');
});

test('references/critique.md retains ranked evidence, concrete fixes, and no-code law', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  assert.match(content, /write no code/i, 'must retain no code law');
  assert.match(content, /P0/i, 'must retain P0 severity');
  assert.match(content, /P1/i, 'must retain P1 severity');
  assert.match(content, /P2/i, 'must retain P2 severity');
  assert.match(content, /fix/i, 'must retain concrete fix');
});

test('references/critique.md documents upstream attribution and Apache-2.0 license', () => {
  const content = readFileSync(CRITIQUE_MD, 'utf8');

  assert.match(content, /anthropics\/knowledge-work-plugins/, 'must cite upstream repository');
  assert.match(content, /design-critique/, 'must cite upstream design-critique skill');
  assert.match(content, /Apache-2\.0|Apache License/i, 'must state Apache-2.0 license');
});

test('UPSTREAM.md records knowledge-work-plugins design-critique row', () => {
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  assert.match(content, /anthropics\/knowledge-work-plugins/, 'must record anthropics/knowledge-work-plugins');
  assert.match(content, /design-critique/, 'must record design-critique name');
  assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, 'must pin absorbed commit SHA');
  assert.match(content, /critique\.md/, 'must map to critique.md');
});

test('UPSTREAM.md contains Modifications section and Apache-2.0 License notice', () => {
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  assert.match(content, /## Modifications/, 'must have ## Modifications section');
  assert.match(content, /## License/, 'must have ## License section');
  assert.match(content, /Apache License, Version 2\.0/i, 'must include Apache License notice');
});

test('Critique validator: screenshot-only valid report passes', () => {
  const report = `Stage: Refinement
Evidence: Screenshot-only (320px, tablet, desktop captures)
Evidence limits: Static visual evidence only; no live DOM inspection, keyboard navigation, or dynamic interaction/performance states measured.

Findings:
- **P0** — Checkout button text (#999 on #fff): contrast is 2.8:1, failing WCAG AA (file:src/checkout.css:12). Fix: change text color to #595959 or darker.
- **P1** — Desktop nav bar: logo and navigation links overlap at 1024px width. Fix: introduce mobile hamburger breakpoint at 1080px.

Highest-leverage change: Increase checkout button contrast to meet WCAG AA; improve via targeted accessibility fix.`;

  const result = validateCritiqueReport(report);
  assert.ok(result.valid, `Report should be valid, got errors: ${result.errors.join(', ')}`);
});

test('Critique validator: screenshot-only invalid report inventing measurements fails', () => {
  const report = `Stage: Exploration
Evidence: Screenshot-only
Evidence limits: Static screenshot.

Findings:
- **P1** — Hero section: LCP is 3200ms which hurts Core Web Vitals. Fix: optimize hero image.
- **P2** — Header link: keyboard trap observed when pressing Tab. Fix: fix tabindex.

Highest-leverage change: Improve LCP.`;

  const result = validateCritiqueReport(report);
  assert.strictEqual(result.valid, false, 'Report inventing LCP and keyboard trap on static screenshot must fail');
  assert.ok(result.errors.some(e => e.includes('invent performance measurements')));
});

test('Critique validator: Figma-unavailable scenario valid report passes', () => {
  const report = `Stage: Exploration
Evidence: Figma-unavailable (critiquing exported PNG preview; Figma tokens and component specs unavailable)
Evidence limits: Limited to visual inspection of exported preview; design system tokens, autolayout constraints, and interactive states are unverified.

Findings:
- **P1** — Pricing card: four competing CTA buttons in same visual tier confuse user path. Fix: style Primary tier with solid fill and secondary tiers with ghost border.

Highest-leverage change: Establish clear primary CTA hierarchy across pricing tiers; improve via visual hierarchy lane.`;

  const result = validateCritiqueReport(report);
  assert.ok(result.valid, `Figma-unavailable report should be valid, got errors: ${result.errors.join(', ')}`);
});

test('Critique validator: Live-implementation scenario valid report passes', () => {
  const report = `Stage: Implementation
Evidence: Verified live-interface (driven via Playwright on localhost:3000, desktop and 320px viewport)
Evidence limits: Live rendering and DOM inspected; synthetic load test not run so server latency unmeasured.

Findings:
- **P0** — Modal dialog: pressing Tab escapes dialog into background body (src/components/Modal.tsx:45). Fix: trap focus inside modal while open using focus-trap.
- **P1** — Data table: header row obscures top row cells when scrolled horizontally. Fix: apply sticky positioning with explicit z-index.

Highest-leverage change: Trap focus in modal dialog to ensure WCAG compliance; improve via accessibility fix.`;

  const result = validateCritiqueReport(report);
  assert.ok(result.valid, `Live-implementation report should be valid, got errors: ${result.errors.join(', ')}`);
});

test('Critique validator: report containing code blocks is rejected', () => {
  const report = `Stage: Refinement
Evidence: Screenshot-only
Evidence limits: Static visual inspection.

Findings:
- **P1** — Button padding is irregular. Fix: apply consistent padding.
\`\`\`css
.btn { padding: 8px 16px; }
\`\`\`

Highest-leverage change: Unify button padding; improve lane.`;

  const result = validateCritiqueReport(report);
  assert.strictEqual(result.valid, false, 'Critique report containing code block must fail');
  assert.ok(result.errors.some(e => e.includes('write no code')));
});
