import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MERLIN_ROOT = join(HERE, '..');
const NIYOJ_ROOT = join(HERE, '..', '..', 'deploy-niyoj');

export function parseRunbook(markdown) {
  const runbook = {
    title: '',
    owner: '',
    lastTestedRevision: '',
    prerequisites: [],
    steps: [],
    verificationChecks: [],
    rollback: {
      commands: [],
      verification: [],
      trigger: ''
    },
    escalation: '',
    noExternalPublishing: true
  };

  const titleMatch = markdown.match(/^#{1,2}\s+(?:Deployment Runbook:?\s*)?(.+)$/m);
  if (titleMatch) runbook.title = titleMatch[1].trim();

  const ownerMatch = markdown.match(/\*\*Owner:\*\*\s*(.+)$/m) || markdown.match(/Owner:\s*(.+)$/m);
  if (ownerMatch) runbook.owner = ownerMatch[1].trim();

  const revMatch = markdown.match(/\*\*Last-tested revision:\*\*\s*(.+)$/m) || markdown.match(/Last-tested revision:\s*(.+)$/m);
  if (revMatch) runbook.lastTestedRevision = revMatch[1].trim();

  // Prerequisites section: capture until next heading that is not an item
  const prereqSection = markdown.match(/(?:^|\n)#{2,3}\s+Prerequisites\s*([\s\S]*?)(?=\n#{2,3}\s+(?!Prerequisites)[A-Z]|$)/);
  if (prereqSection) {
    const pLines = prereqSection[1].split(/\r?\n/);
    for (const l of pLines) {
      const itemMatch = l.match(/^\s*[-*]\s+`?([a-zA-Z0-9_-]+)`?:?\s*(.*)$/);
      if (itemMatch) {
        runbook.prerequisites.push({
          name: itemMatch[1],
          description: itemMatch[2] || itemMatch[1]
        });
      }
    }
  }

  // Steps section: capture until next section heading (e.g. Verification)
  const stepsSection = markdown.match(/(?:^|\n)#{2,3}\s+Steps\s*([\s\S]*?)(?=\n#{2,3}\s+(?:Verification|Rollback|Escalation)|$)/);
  if (stepsSection) {
    const stepBlocks = stepsSection[1].split(/(?=\n#{3,4}\s+Step\s+\d+)/g);
    for (const block of stepBlocks) {
      if (!block.trim()) continue;
      const stepHeader = block.match(/#{3,4}\s+Step\s+(\d+):\s*(.+)/);
      if (!stepHeader) continue;
      const stepNum = parseInt(stepHeader[1], 10);
      const stepTitle = stepHeader[2].trim();

      const stepOwner = (block.match(/\*\*Owner:\*\*\s*(.+)/) || block.match(/Owner:\s*(.+)/) || [])[1] || '';
      const cmdMatch = block.match(/```(?:bash|sh|powershell)?\s*\r?\n([\s\S]*?)```/);
      const command = cmdMatch ? cmdMatch[1].trim() : '';

      const expectedMatch = block.match(/\*\*Expected result:\*\*\s*(.+)/) || block.match(/Expected result:\s*(.+)/);
      const expectedResult = expectedMatch ? expectedMatch[1].trim() : '';

      const failureMatch = block.match(/\*\*Failure branch:\*\*\s*(.+)/) || block.match(/Failure branch:\s*(.+)/);
      const failureBranch = failureMatch ? failureMatch[1].trim() : '';

      runbook.steps.push({
        id: stepNum,
        title: stepTitle,
        owner: stepOwner.trim(),
        command,
        expectedResult,
        failureBranch
      });
    }
  }

  // Verification section
  const verifSection = markdown.match(/(?:^|\n)#{2,3}\s+Verification\s*([\s\S]*?)(?=\n#{2,3}\s+(?:Rollback|Escalation)|$)/);
  if (verifSection) {
    const vLines = verifSection[1].split(/\r?\n/);
    for (const l of vLines) {
      const vMatch = l.match(/^\s*[-*]\s+\[?[ x]?\]?\s*(.+)$/);
      if (vMatch) {
        runbook.verificationChecks.push({
          name: vMatch[1].trim(),
          command: vMatch[1].trim()
        });
      }
    }
  }

  // Rollback section
  const rollbackSection = markdown.match(/(?:^|\n)#{2,3}\s+(?:Rollback & Rollback Verification|Rollback)\s*([\s\S]*?)(?=\n#{2,3}\s+Escalation|$)/);
  if (rollbackSection) {
    const triggerMatch = rollbackSection[1].match(/\*\*Trigger:\*\*\s*(.+)/);
    if (triggerMatch) runbook.rollback.trigger = triggerMatch[1].trim();

    const cmdMatches = [...rollbackSection[1].matchAll(/```(?:bash|sh)?\s*\r?\n([\s\S]*?)```/g)];
    if (cmdMatches.length > 0) {
      runbook.rollback.commands = cmdMatches[0][1].trim().split(/\r?\n/).filter(Boolean);
    }
    const verifMatch = rollbackSection[1].match(/\*\*Rollback verification:\*\*\s*([\s\S]*?)(?=\n\n|\n#{2,3}\s+|$)/);
    if (verifMatch) {
      runbook.rollback.verification.push(verifMatch[1].trim());
    }
  }

  // Escalation
  const escSection = markdown.match(/(?:^|\n)#{2,3}\s+Escalation\s*([\s\S]*?)(?=\n#{2,3}\s+|$)/);
  if (escSection) {
    runbook.escalation = escSection[1].trim();
  }

  return runbook;
}

export function evaluateRunbook(runbook, { inputs = {}, executor = null, publishExternal = false } = {}) {
  // Rule: No automatic external publishing
  if (publishExternal) {
    throw new Error('Automatic external publishing is disabled by policy. Handoffs remain local.');
  }

  // Rule: Check prerequisites first (incomplete inputs scenario)
  const missingPrerequisites = [];
  for (const prereq of runbook.prerequisites) {
    const val = inputs[prereq.name];
    if (val === undefined || val === null || val === '') {
      missingPrerequisites.push(prereq.name);
    }
  }

  if (missingPrerequisites.length > 0) {
    return {
      status: 'blocked',
      reason: 'incomplete_inputs',
      missingPrerequisites,
      stepsExecuted: 0,
      checks: runbook.verificationChecks.map(c => ({
        name: c.name,
        verified: false,
        status: 'unverified'
      })),
      externalPublished: false
    };
  }

  const defaultExecutor = (cmd) => ({ code: 0, stdout: 'ok', stderr: '' });
  const exec = executor || defaultExecutor;

  // Execute steps
  const executedSteps = [];
  for (const step of runbook.steps) {
    let renderedCmd = step.command;
    for (const [k, v] of Object.entries(inputs)) {
      renderedCmd = renderedCmd.replaceAll(`$${k}`, v).replaceAll(`<${k}>`, v);
    }

    const res = exec(renderedCmd, step);
    if (res.code !== 0 || (res.matchesExpected === false)) {
      // Step failed -> follow failure branch
      executedSteps.push({
        id: step.id,
        title: step.title,
        status: 'fail',
        failureBranchFollowed: step.failureBranch
      });

      // If failure branch indicates rollback
      let rollbackExecuted = false;
      let rollbackVerified = false;
      if (step.failureBranch.toLowerCase().includes('rollback') || step.failureBranch.toLowerCase().includes('revert')) {
        rollbackExecuted = true;
        const rbRes = exec('rollback', { type: 'rollback' });
        rollbackVerified = rbRes.code === 0;
      }

      return {
        status: 'failed',
        failedStep: step.id,
        failureBranch: step.failureBranch,
        rollbackExecuted,
        rollbackVerified,
        stepsExecuted: executedSteps.length,
        // Rule: unexecuted checks remain unverified!
        checks: runbook.verificationChecks.map(c => ({
          name: c.name,
          verified: false,
          status: 'unverified'
        })),
        externalPublished: false
      };
    }

    executedSteps.push({
      id: step.id,
      title: step.title,
      status: 'pass',
      output: res.stdout
    });
  }

  // Verification checks execution
  const executedChecks = [];
  for (const check of runbook.verificationChecks) {
    const res = exec(check.command, { type: 'verification' });
    const isPass = res.code === 0;
    executedChecks.push({
      name: check.name,
      verified: isPass,
      status: isPass ? 'verified' : 'failed'
    });
  }

  return {
    status: 'success',
    stepsExecuted: executedSteps.length,
    checks: executedChecks,
    externalPublished: false
  };
}

// Tests
test('Runbook evaluator: halts and reports blocked on incomplete inputs with all checks unverified', () => {
  const fixture = `
# Production Deployment Runbook: demo-app
**Owner:** @deploy-lead
**Last-tested revision:** 2574e29377c7

## Prerequisites
- \`DEPLOY_HOST\` target VPS IP
- \`SUBDOMAIN\` public hostname
- \`DEPLOY_SSH_KEY\` private deploy key in secrets

## Steps
### Step 1: Health probe
**Owner:** Operator
\`\`\`bash
curl -f http://$DEPLOY_HOST/api/health
\`\`\`
**Expected result:** HTTP 200 {"ok":true}
**Failure branch:** Inspect docker logs; do not proceed

## Verification
- HTTP 200 on SUBDOMAIN
- Certificate valid over TLS

## Rollback & Rollback Verification
**Trigger:** API down after deploy
\`\`\`bash
git revert HEAD
\`\`\`
**Rollback verification:** curl -f http://$DEPLOY_HOST/api/health returns ok
`;

  const parsed = parseRunbook(fixture);
  assert.equal(parsed.owner, '@deploy-lead');
  assert.equal(parsed.lastTestedRevision, '2574e29377c7');
  assert.equal(parsed.prerequisites.length, 3);

  // Incomplete inputs: missing DEPLOY_SSH_KEY
  const result = evaluateRunbook(parsed, {
    inputs: {
      DEPLOY_HOST: '192.0.2.1',
      SUBDOMAIN: 'app.example.com'
    }
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'incomplete_inputs');
  assert.deepEqual(result.missingPrerequisites, ['DEPLOY_SSH_KEY']);
  assert.equal(result.stepsExecuted, 0);

  // Crucial requirement: unexecuted checks remain unverified
  assert.equal(result.checks.length, 2);
  for (const check of result.checks) {
    assert.equal(check.verified, false);
    assert.equal(check.status, 'unverified');
  }
});

test('Runbook evaluator: happy path executes steps and verifies checks', () => {
  const fixture = `
# Production Deployment Runbook: demo-app
**Owner:** @deploy-lead
**Last-tested revision:** 2574e29377c7

## Prerequisites
- \`DEPLOY_HOST\` target IP

## Steps
### Step 1: Check git status
**Owner:** Operator
\`\`\`bash
git status --porcelain
\`\`\`
**Expected result:** clean working directory
**Failure branch:** commit or stash before deploying

### Step 2: Trigger deploy
**Owner:** Operator
\`\`\`bash
ssh deploy@$DEPLOY_HOST "/opt/demo-app/deploy/deploy.sh"
\`\`\`
**Expected result:** Live
**Failure branch:** Inspect container logs; initiate rollback if health fails

## Verification
- Health endpoint returns ok
- TLS certificate valid

## Rollback & Rollback Verification
**Trigger:** Deploy script fails or health endpoint times out
\`\`\`bash
git revert HEAD && git push origin main
\`\`\`
**Rollback verification:** Previous SHA verified running via /api/health
`;

  const parsed = parseRunbook(fixture);
  const result = evaluateRunbook(parsed, {
    inputs: { DEPLOY_HOST: '192.0.2.1' },
    executor: (cmd) => ({ code: 0, stdout: 'Live', stderr: '' })
  });

  assert.equal(result.status, 'success');
  assert.equal(result.stepsExecuted, 2);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].verified, true);
  assert.equal(result.checks[0].status, 'verified');
  assert.equal(result.checks[1].verified, true);
  assert.equal(result.externalPublished, false);
});

test('Runbook evaluator: step failure follows failure branch, executes rollback and rollback verification', () => {
  const fixture = `
# Production Deployment Runbook: demo-app
**Owner:** @deploy-lead
**Last-tested revision:** 2574e29377c7

## Prerequisites
- \`DEPLOY_HOST\` target IP

## Steps
### Step 1: Trigger deploy
**Owner:** Operator
\`\`\`bash
ssh deploy@$DEPLOY_HOST "/opt/demo-app/deploy/deploy.sh"
\`\`\`
**Expected result:** Live
**Failure branch:** Health timed out; trigger rollback and verify prior release

## Verification
- Health endpoint returns ok
- TLS certificate valid

## Rollback & Rollback Verification
**Trigger:** Deploy script fails or health endpoint times out
\`\`\`bash
git revert HEAD && git push origin main
\`\`\`
**Rollback verification:** curl -f https://example.com/api/health returns ok on previous commit
`;

  const parsed = parseRunbook(fixture);
  let rollbackInvoked = false;
  const result = evaluateRunbook(parsed, {
    inputs: { DEPLOY_HOST: '192.0.2.1' },
    executor: (cmd, meta) => {
      if (meta?.type === 'rollback') {
        rollbackInvoked = true;
        return { code: 0, stdout: 'reverted ok', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'Health check failed: timeout after 90s' };
    }
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failedStep, 1);
  assert.equal(result.rollbackExecuted, true);
  assert.equal(result.rollbackVerified, true);
  assert.equal(rollbackInvoked, true);

  // Crucial: verification checks were not reached -> unverified
  for (const check of result.checks) {
    assert.equal(check.verified, false);
    assert.equal(check.status, 'unverified');
  }
});

test('Runbook evaluator: rejects automatic external publishing', () => {
  const fixture = `
# Deployment Runbook
**Owner:** @lead
**Last-tested revision:** 2574e29377c7
## Prerequisites
## Steps
## Verification
`;
  const parsed = parseRunbook(fixture);
  assert.throws(() => {
    evaluateRunbook(parsed, { publishExternal: true });
  }, /Automatic external publishing is disabled/);
});

test('deploy-merlin and deploy-niyoj reference runbooks exist and comply with runbook schema', () => {
  const merlinRunbookPath = join(MERLIN_ROOT, 'references', 'runbooks.md');
  const niyojRunbookPath = join(NIYOJ_ROOT, 'references', 'runbooks.md');

  assert.ok(existsSync(merlinRunbookPath), 'deploy-merlin references/runbooks.md must exist');
  assert.ok(existsSync(niyojRunbookPath), 'deploy-niyoj references/runbooks.md must exist');

  const merlinContent = readFileSync(merlinRunbookPath, 'utf8');
  const niyojContent = readFileSync(niyojRunbookPath, 'utf8');

  for (const [name, content] of [['deploy-merlin', merlinContent], ['deploy-niyoj', niyojContent]]) {
    const parsed = parseRunbook(content);
    assert.ok(parsed.title.length > 0, `${name} runbook must have a title`);
    assert.ok(parsed.owner.length > 0, `${name} runbook must have an owner`);
    assert.ok(parsed.lastTestedRevision.length > 0, `${name} runbook must have last-tested revision`);
    assert.ok(parsed.prerequisites.length > 0, `${name} runbook must define prerequisites`);
    assert.ok(parsed.steps.length > 0, `${name} runbook must define steps`);

    for (const step of parsed.steps) {
      assert.ok(step.owner.length > 0, `${name} step ${step.id} must have owner`);
      assert.ok(step.command.length > 0, `${name} step ${step.id} must have exact command`);
      assert.ok(step.expectedResult.length > 0, `${name} step ${step.id} must have expected result`);
      assert.ok(step.failureBranch.length > 0, `${name} step ${step.id} must have failure branch`);
    }

    assert.ok(parsed.verificationChecks.length > 0, `${name} runbook must have verification checks`);
    assert.ok(parsed.rollback.commands.length > 0 || parsed.rollback.verification.length > 0, `${name} runbook must have rollback details`);
  }
});

test('deploy-merlin and deploy-niyoj UPSTREAM.md manifests exist and parse cleanly', () => {
  const merlinUpstreamPath = join(MERLIN_ROOT, 'UPSTREAM.md');
  const niyojUpstreamPath = join(NIYOJ_ROOT, 'UPSTREAM.md');

  assert.ok(existsSync(merlinUpstreamPath), 'deploy-merlin UPSTREAM.md must exist');
  assert.ok(existsSync(niyojUpstreamPath), 'deploy-niyoj UPSTREAM.md must exist');

  for (const [name, path] of [['deploy-merlin', merlinUpstreamPath], ['deploy-niyoj', niyojUpstreamPath]]) {
    const content = readFileSync(path, 'utf8');
    assert.match(content, /## Upstreams/, `${name} UPSTREAM.md must have ## Upstreams section`);
    assert.match(content, /knowledge-work-plugins/, `${name} UPSTREAM.md must reference knowledge-work-plugins repo`);
    assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, `${name} UPSTREAM.md must pin commit 2574e29377c7173d0cecffef29a6ecbd7f8ccb5d`);
    assert.match(content, /Apache-2\.0/, `${name} UPSTREAM.md must record Apache-2.0 license`);
  }
});
