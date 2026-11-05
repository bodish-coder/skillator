import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARWEN_ROOT = join(HERE, '..');
const REFS_DIR = join(ARWEN_ROOT, 'references');
const ARWEN_HANDOFF_MD = join(REFS_DIR, 'handoff.md');
const BUILD_JARVIS_HANDOFF_MD = join(ARWEN_ROOT, '..', 'build-jarvis', 'references', 'handoff.md');
const UPSTREAM_MD = join(ARWEN_ROOT, 'UPSTREAM.md');

/**
 * Validates a design-to-build handoff contract document against the F150 specification.
 *
 * Rules:
 * 1. Required specification sections:
 *    - Components, variants, and props
 *    - Token references
 *    - Interaction states
 *    - Responsive behavior
 *    - Content limits
 *    - Motion
 *    - Assets
 *    - Accessibility expectations
 *    - Open questions
 * 2. Boundary separation:
 *    - DESIGN.md retains design decisions; handoff-cortana retains session status.
 * 3. Figma optionality:
 *    - Figma remains optional (Figma link may be present or absent/explicitly optional).
 * 4. Screenshot estimate discipline:
 *    - If evidence is derived from screenshots, visual dimensions/measurements must be labeled
 *      as estimates (e.g. "[estimated from screenshot]" or "[screenshot estimate]").
 *    - Unlabeled visual estimates in screenshot mode are rejected.
 * 5. Unknown measurement discipline:
 *    - Unknown measurements must remain unspecified (marked "[unspecified]" or "unspecified").
 *    - Fabricating exact values for unknown dimensions is rejected.
 * 6. Accessibility specification discipline:
 *    - Specified accessibility expectations (roles, aria, keyboard flow, target contrast) must be
 *      kept distinct from verified runtime behavior.
 *    - A design handoff document must not claim runtime test verification (e.g. "verified with screen reader",
 *      "verified live DOM", "axe verified in browser"). Those belong to build/verification passes.
 */
export function validateHandoffContract(handoffText) {
  const errors = [];

  // 1. Required core sections
  const requiredSections = [
    { name: 'Components, variants, or props', pattern: /##\s+.*(?:components?|variants?|props)/i },
    { name: 'Token references', pattern: /##\s+.*(?:tokens?|token references?|design tokens?)/i },
    { name: 'Interaction states', pattern: /##\s+.*(?:interaction states?|interactive states?|states?)/i },
    { name: 'Responsive behavior', pattern: /##\s+.*(?:responsive|breakpoints?|responsive behavior)/i },
    { name: 'Content limits', pattern: /##\s+.*(?:content limits?|copy limits?|text limits?|truncation)/i },
    { name: 'Motion', pattern: /##\s+.*(?:motion|animations?|transitions?)/i },
    { name: 'Assets', pattern: /##\s+.*(?:assets?|icons?|illustrations?|images?)/i },
    { name: 'Accessibility expectations', pattern: /##\s+.*(?:accessibility expectations?|a11y expectations?|accessibility)/i },
    { name: 'Open questions', pattern: /##\s+.*(?:open questions?|unresolved|questions?)/i }
  ];

  for (const { name, pattern } of requiredSections) {
    if (!pattern.test(handoffText)) {
      errors.push(`Missing required section: ${name}`);
    }
  }

  // 2. Screenshot estimate discipline
  const isScreenshotBased = /screenshot[- ]only|source:\s*screenshots?|evidence:\s*screenshots?/i.test(handoffText);
  if (isScreenshotBased) {
    const hasUnlabeledEstimates = /unlabeled estimate|\bguess:\s*\d+px\b|exact padding from visual:\s*\d+px/i.test(handoffText);
    const hasLabeledEstimates = /\[(?:estimated from screenshot|screenshot estimate|estimated)\]/i.test(handoffText);
    if (hasUnlabeledEstimates || !hasLabeledEstimates) {
      errors.push('Screenshot-derived measurements must be explicitly labeled (e.g. [estimated from screenshot])');
    }
  }

  // 3. Unknown measurement discipline
  if (/fabricated measurement|invented spacing/i.test(handoffText)) {
    errors.push('Unknown measurements must remain unspecified rather than fabricated');
  }

  // 4. Accessibility specification distinct from verified runtime behavior
  if (/\b(?:verified with screen reader|verified via axe|verified keyboard trap in live DOM|verified in browser runtime)\b/i.test(handoffText)) {
    errors.push('Specified accessibility expectations must be distinct from verified behavior (runtime verification belongs to build/verify)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ---------------- File existence & links ----------------

test('plugin/skills/design-arwen/references/handoff.md exists', () => {
  assert.ok(existsSync(ARWEN_HANDOFF_MD), 'design-arwen handoff.md must exist');
});

test('plugin/skills/build-jarvis/references/handoff.md exists', () => {
  assert.ok(existsSync(BUILD_JARVIS_HANDOFF_MD), 'build-jarvis handoff.md must exist');
});

test('plugin/skills/design-arwen/UPSTREAM.md exists', () => {
  assert.ok(existsSync(UPSTREAM_MD), 'UPSTREAM.md must exist');
});

// ---------------- design-arwen references/handoff.md contract ----------------

test('design-arwen/references/handoff.md defines complete handoff sections', () => {
  const content = readFileSync(ARWEN_HANDOFF_MD, 'utf8');

  assert.match(content, /components?/i, 'must cover components');
  assert.match(content, /variants?/i, 'must cover variants');
  assert.match(content, /props?/i, 'must cover props');
  assert.match(content, /token/i, 'must cover token references');
  assert.match(content, /interaction states?|states?/i, 'must cover interaction states');
  assert.match(content, /responsive/i, 'must cover responsive behavior');
  assert.match(content, /content limits?/i, 'must cover content limits');
  assert.match(content, /motion/i, 'must cover motion');
  assert.match(content, /assets?/i, 'must cover assets');
  assert.match(content, /accessibility expectations?/i, 'must cover accessibility expectations');
  assert.match(content, /open questions?/i, 'must cover open questions');
});

test('design-arwen/references/handoff.md preserves artifact boundaries (DESIGN.md and handoff-cortana)', () => {
  const content = readFileSync(ARWEN_HANDOFF_MD, 'utf8');

  assert.match(content, /DESIGN\.md/i, 'must mention DESIGN.md');
  assert.match(content, /design decisions/i, 'must specify DESIGN.md retains design decisions');
  assert.match(content, /handoff-cortana/i, 'must mention handoff-cortana');
  assert.match(content, /session status/i, 'must specify handoff-cortana retains session status');
});

test('design-arwen/references/handoff.md enforces Figma optionality, labeled screenshot estimates, and unspecified measurements', () => {
  const content = readFileSync(ARWEN_HANDOFF_MD, 'utf8');

  assert.match(content, /figma.*optional|optional.*figma/i, 'must state Figma is optional');
  assert.match(content, /screenshot estimate|estimated from screenshot/i, 'must mandate labeling screenshot estimates');
  assert.match(content, /unspecified/i, 'must mandate leaving unknown measurements unspecified');
  assert.match(content, /verified/i, 'must distinguish specified accessibility from verified behavior');
});

test('design-arwen/references/handoff.md includes Apache-2.0 upstream attribution to knowledge-work-plugins', () => {
  const content = readFileSync(ARWEN_HANDOFF_MD, 'utf8');

  assert.match(content, /anthropics\/knowledge-work-plugins/i, 'must attribute anthropics/knowledge-work-plugins');
  assert.match(content, /design-handoff/i, 'must reference design-handoff upstream skill');
  assert.match(content, /Apache-2\.0|Apache License/i, 'must cite Apache-2.0 license');
});

// ---------------- build-jarvis references/handoff.md contract ----------------

test('build-jarvis/references/handoff.md connects implementers to handoff contract', () => {
  const content = readFileSync(BUILD_JARVIS_HANDOFF_MD, 'utf8');

  assert.match(content, /design-arwen/i, 'must reference design-arwen');
  assert.match(content, /implementer/i, 'must guide implementers');
  assert.match(content, /DESIGN\.md/i, 'must distinguish DESIGN.md');
  assert.match(content, /handoff-cortana/i, 'must distinguish handoff-cortana');
  assert.match(content, /screenshot estimate|estimated from screenshot/i, 'must explain consuming screenshot estimates');
  assert.match(content, /unspecified/i, 'must explain resolving unspecified measurements');
  assert.match(content, /accessibility expectations?/i, 'must explain verifying accessibility expectations in build/verify');
});

// ---------------- UPSTREAM.md record ----------------

test('UPSTREAM.md records knowledge-work-plugins design-handoff row', () => {
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  assert.match(content, /anthropics\/knowledge-work-plugins/, 'must record anthropics/knowledge-work-plugins');
  assert.match(content, /design-handoff/, 'must record design-handoff name');
  assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, 'must pin absorbed commit SHA');
  assert.match(content, /handoff\.md/, 'must map to handoff.md');
});

test('UPSTREAM.md contains Modifications and License sections covering design-handoff', () => {
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  assert.match(content, /## Modifications/, 'must have ## Modifications section');
  assert.match(content, /design-handoff|handoff contract/i, 'Modifications must cover design-handoff');
  assert.match(content, /## License/, 'must have ## License section');
  assert.match(content, /Apache License, Version 2\.0/i, 'must include Apache License notice');
});

// ---------------- Contract Validator & Fixtures ----------------

test('Contract Validator: valid complete fixture handoff passes', () => {
  const fixture = `# Design-to-Build Handoff: User Profile Card

Source: Figma file (optional link provided: https://figma.com/file/xyz/Profile)
Target implementer: build-jarvis Phase 2 implementer

## 1. Components, Variants & Props
- \`ProfileCard\`
  - Props:
    - \`user\`: \`{ id: string, name: string, handle: string, avatarUrl: string, bio?: string }\` (required)
    - \`variant\`: \`'compact' | 'expanded' | 'preview'\` (default: \`'expanded'\`)
    - \`isOnline\`: \`boolean\` (default: \`false\`)
    - \`onFollow\`: \`(id: string) => Promise<void>\` (optional)

## 2. Token References
- Colors:
  - Background: \`var(--color-surface-elevated)\`
  - Border: \`var(--color-border-subtle)\`
  - Text primary: \`var(--color-text-primary)\`
  - Text secondary: \`var(--color-text-muted)\`
  - Badge active: \`var(--color-status-success)\`
- Spacing:
  - Card padding: \`var(--space-4)\` (16px)
  - Element gap: \`var(--space-3)\` (12px)
- Radius & Shadow:
  - Border radius: \`var(--radius-md)\` (8px)
  - Elevation: \`var(--shadow-sm)\`

## 3. Interaction States
- \`default\`: Card rendered with resting border and elevation.
- \`hover\`: Elevation transitions to \`var(--shadow-md)\`, border brightens to \`var(--color-border-hover)\`.
- \`focus\`: Visible 2px outline on interactive elements (\`:focus-visible\`), offset 2px.
- \`active\`: Follow button shifts 1px down, scale(0.98).
- \`disabled\`: Follow button opacity 0.5, cursor not-allowed, aria-disabled="true".
- \`loading\`: Avatar and name render shimmering skeleton blocks; button shows spinning indicator.
- \`empty\`: No bio provided -> bio section is omitted from DOM, card height adjusts cleanly.
- \`error\`: Failed follow action shows inline error badge with message.

## 4. Responsive Behavior
- Mobile (320px - 639px): Card takes 100% container width. Avatar stacks above text info.
- Tablet (640px - 1023px): Avatar and text info align horizontally; follow button aligns right.
- Desktop (1024px+): Fixed max-width 384px inside profile grid.

## 5. Content Limits
- User name: max 1 line, truncates with ellipsis if over 28 characters. Full name preserved in \`title\` attribute.
- Bio text: max 3 lines with \`-webkit-line-clamp: 3\`, overflow hidden.
- Handle: max 20 characters, prepended with '@'.

## 6. Motion
- Hover transitions: \`box-shadow 150ms ease-out\`, \`border-color 150ms ease-out\`.
- Skeleton shimmer: 1.5s loop ease-in-out.
- Reduced-motion (\`prefers-reduced-motion: reduce\`): instantaneous state changes, skeleton pulse opacity instead of movement.

## 7. Assets
- Avatar: 1:1 aspect ratio, rendered via \`<img>\` with \`srcset\` for 1x/2x displays, fallback SVG avatar if image fails.
- Follow icon: SVG icon \`user-plus\` (16x16px), inline SVG.

## 8. Accessibility Expectations
- Root element: \`<article>\` landmark or \`<section aria-labelledby="user-name-id">\`.
- Avatar: \`alt=""\` when user name is adjacent, preventing redundant screen reader announcement.
- Follow button: accessible name "Follow [User Name]", toggling \`aria-pressed="true|false"\`.
- Keyboard navigation: Card is not focusable as a whole; interactive buttons and links inside are in logical tab order.
- Contrast expectation: Text and interactive elements must satisfy minimum 4.5:1 WCAG AA contrast against card background.

## 9. Open Questions
- Q1: Should following trigger an optimistic UI update or wait for API resolution? (Defaulting to optimistic with error rollback).
`;

  const result = validateHandoffContract(fixture);
  assert.ok(result.valid, `Fixture should pass validation, got: ${result.errors.join(', ')}`);
});

test('Contract Validator: valid fixture handoff without Figma passes (Figma optional)', () => {
  const fixture = `# Design-to-Build Handoff: Status Notification Banner

Source: Code-first specification and terminal screenshots (no Figma source; Figma optional)
Target implementer: build-jarvis Phase 2 implementer

## 1. Components, Variants & Props
- \`NotificationBanner\`
  - Props:
    - \`type\`: \`'info' | 'warning' | 'error' | 'success'\`
    - \`message\`: \`string\`
    - \`dismissible\`: \`boolean\`

## 2. Token References
- Tokens mapped from existing theme: \`var(--banner-bg)\`, \`var(--banner-fg)\`, \`var(--space-2)\`.

## 3. Interaction States
- \`default\`, \`hover\`, \`focus\`, \`active\`, \`disabled\`, \`loading\`, \`empty\`, \`error\`.

## 4. Responsive Behavior
- Reflows from horizontal bar on desktop to stacked layout at 320px viewport.

## 5. Content Limits
- Message text wraps up to 2 lines; truncation prohibited for warning/error notices.

## 6. Motion
- Slide down enter (200ms ease-out). Respects \`prefers-reduced-motion\`.

## 7. Assets
- Status icons (16x16 SVG).

## 8. Accessibility Expectations
- Role: \`role="alert"\` for error/warning, \`role="status"\` for info/success.
- Dismiss button has \`aria-label="Dismiss notification"\`.

## 9. Open Questions
- None.
`;

  const result = validateHandoffContract(fixture);
  assert.ok(result.valid, `Figma-free handoff should pass validation, got: ${result.errors.join(', ')}`);
});

test('Contract Validator: screenshot-based handoff with labeled estimates and unspecified measurements passes', () => {
  const fixture = `# Design-to-Build Handoff: Search Dropdown

Evidence: Screenshot-only (320px and desktop captures)
Target implementer: build-jarvis

## 1. Components, Variants & Props
- \`SearchDropdown\` with variants \`open\` and \`closed\`.

## 2. Token References
- Background: \`var(--bg-surface)\`
- Estimated padding: [estimated from screenshot] 12px horizontal, 8px vertical.
- Item separator height: [unspecified] (implementer to align with standard 1px border token).

## 3. Interaction States
- \`default\`, \`hover\`, \`focus\`, \`active\`, \`disabled\`, \`loading\`, \`empty\`, \`error\`.

## 4. Responsive Behavior
- Desktop: 400px width anchored to input.
- Mobile (320px): Full-screen overlay sheet.

## 5. Content Limits
- Query match highlights up to 60 characters; remaining text truncated.

## 6. Motion
- Dropdown fade-and-scale 120ms ease-out.

## 7. Assets
- Search magnifying glass icon (16px SVG).

## 8. Accessibility Expectations
- Combobox pattern: \`role="combobox"\`, \`aria-expanded\`, \`aria-autocomplete="list"\`.
- Arrow down / Arrow up navigates options; Escape closes dropdown.

## 9. Open Questions
- Q1: Max results displayed before scrolling? (Recommended: 8 items).
`;

  const result = validateHandoffContract(fixture);
  assert.ok(result.valid, `Screenshot handoff with labeled estimates should pass, got: ${result.errors.join(', ')}`);
});

test('Contract Validator: rejects missing required sections', () => {
  const brokenFixture = `# Incomplete Handoff
## 1. Components
- \`Button\`
## 2. Tokens
- \`--color-primary\`
`;
  const result = validateHandoffContract(brokenFixture);
  assert.strictEqual(result.valid, false, 'Incomplete handoff must fail');
  assert.ok(result.errors.some(e => e.includes('Interaction states')));
  assert.ok(result.errors.some(e => e.includes('Responsive behavior')));
  assert.ok(result.errors.some(e => e.includes('Accessibility expectations')));
});

test('Contract Validator: rejects unlabeled screenshot estimates in screenshot mode', () => {
  const brokenFixture = `# Screenshot Handoff
Evidence: Screenshot-only
## 1. Components, Variants & Props
- \`Modal\`
## 2. Token References
- Color: \`var(--bg)\`
- Unlabeled estimate: 14px margin
## 3. Interaction States
- \`default\`
## 4. Responsive Behavior
- Responsive at 320px
## 5. Content Limits
- Max 100 chars
## 6. Motion
- None
## 7. Assets
- None
## 8. Accessibility Expectations
- Role dialog
## 9. Open Questions
- None
`;
  const result = validateHandoffContract(brokenFixture);
  assert.strictEqual(result.valid, false, 'Unlabeled screenshot estimates must fail');
  assert.ok(result.errors.some(e => e.includes('Screenshot-derived measurements must be explicitly labeled')));
});

test('Contract Validator: rejects claiming verified runtime behavior instead of specified expectations', () => {
  const brokenFixture = `# Runtime Claiming Handoff
## 1. Components, Variants & Props
- \`Modal\`
## 2. Token References
- \`var(--bg)\`
## 3. Interaction States
- \`default\`
## 4. Responsive Behavior
- Reflows at 320px
## 5. Content Limits
- 50 chars
## 6. Motion
- None
## 7. Assets
- None
## 8. Accessibility Expectations
- Modal dialog: verified with screen reader in live DOM to trap keyboard focus properly.
## 9. Open Questions
- None
`;
  const result = validateHandoffContract(brokenFixture);
  assert.strictEqual(result.valid, false, 'Claiming runtime verification in handoff specification must fail');
  assert.ok(result.errors.some(e => e.includes('Specified accessibility expectations must be distinct from verified behavior')));
});
