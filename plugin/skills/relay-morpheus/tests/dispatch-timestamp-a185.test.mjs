import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RELAY_PS1 = join(HERE, '..', 'hooks', 'relay-morpheus.ps1');
const ISO_MINUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/;

function runRelay(cwd, args, extraEnv = {}) {
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY_PS1, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELAY_WORKTREE: 'off',
        RELAY_LEVEL_CMD: "echo 'src=claude-code 5h=40 7d=10 ctx=5 max=40'",
        ...extraEnv,
      },
    }
  );
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

test('A185: benign refused-claim dispatch preserves dispatch timestamp separate from ticket IDs', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a185-test-'));
  try {
    const runDir = join(tmp, '.skillator');
    mkdirSync(runDir, { recursive: true });

    // Stub ticket-meta.ps1 so that:
    // - `claim` is refused (exit 1) with a note (e.g. ticket not on board / user not on team),
    // - `pick` reports F1 as unassigned (not skipped) and F3 as owned by foreign owner @vidul.
    const stubTicketMeta = join(tmp, 'stub-ticket-meta.ps1');
    writeFileSync(
      stubTicketMeta,
      [
        '$cmd = $args[0]',
        '$rest = @($args | Select-Object -Skip 1)',
        "if ($cmd -ceq 'claim') {",
        "  [Console]::Error.WriteLine('ticket-meta: F1 is not on the board or user not on team')",
        '  exit 1',
        '}',
        "if ($cmd -ceq 'pick') {",
        '  foreach ($id in $rest) {',
        "    if ($id -ceq 'F3') { Write-Output 'skip F3 @vidul' }",
        '  }',
        '  exit 0',
        '}',
        'exit 0',
      ].join('\n') + '\n',
      'utf8'
    );

    const env = {
      RELAY_DIR: runDir,
      RELAY_TICKET_META: stubTicketMeta,
      RELAY_CHAIN_DRIVER: '',
    };

    const initRes = runRelay(
      tmp,
      ['-Mode', 'init', '-Plan', 'TICKETS.md', '-Title', 'a185 test', '-Stages', 'F1 stage,F3 stage', '-Dir', runDir],
      env
    );
    assert.equal(initRes.status, 0, `init failed: ${initRes.stderr}`);

    const runFile = initRes.stdout.split(/\r?\n/)[0].trim();
    const runLines = readFileSync(runFile, 'utf8').split(/\r?\n/);
    const stage1Row = runLines.find((l) => /\|\s*\d+\s*\|\s*F1 stage\s*\|/.test(l));
    assert.ok(stage1Row, 'Stage 1 row should exist');
    const s1 = stage1Row.match(/^\|\s*(\d+)\s*\|/)[1];
    const s2 = String(Number(s1) + 1);

    const promptPath = join(tmp, 'prompt.txt');
    writeFileSync(promptPath, 'implement F1\n', 'utf8');

    // Plan stage 1 (unassigned ticket F1) and stage 2 (foreign-owned ticket F3)
    const plan1 = runRelay(
      tmp,
      ['-Mode', 'chain', '-Action', 'plan', '-N', s1, '-PromptFile', promptPath, '-Tickets', 'F1', '-Files', 'a.py', '-Run', runFile],
      env
    );
    assert.equal(plan1.status, 0, `plan s1 failed: ${plan1.stderr}`);

    const plan2 = runRelay(
      tmp,
      ['-Mode', 'chain', '-Action', 'plan', '-N', s2, '-PromptFile', promptPath, '-Tickets', 'F3', '-Files', 'b.py', '-Run', runFile],
      env
    );
    assert.equal(plan2.status, 0, `plan s2 failed: ${plan2.stderr}`);

    // Dispatch stage 1: claim is refused, but F1 has no foreign owner so dispatch must succeed.
    const disp1 = runRelay(
      tmp,
      ['-Mode', 'chain', '-Action', 'dispatch', '-N', s1, '-Driver', '@cc-test', '-Run', runFile],
      env
    );
    assert.equal(disp1.status, 0, `dispatch s1 should succeed on benign claim refusal: ${disp1.stderr}`);
    assert.match(disp1.stderr, /note: claim refused/, 'stderr should note benign claim refusal');

    const contentAfter = readFileSync(runFile, 'utf8');

    // Check Chain header driver cell: `driver: @cc-test <timestamp>     hold: -     mode: workflow`
    const driverLine = contentAfter.split(/\r?\n/).find((l) => l.startsWith('driver: '));
    assert.ok(driverLine, 'Chain driver header line should exist');
    const driverMatch = driverLine.match(/^driver:\s+@cc-test\s+(\S+)\s+hold:/);
    assert.ok(driverMatch, `Unexpected driver line format: ${driverLine}`);
    assert.notEqual(driverMatch[1], 'F1', 'Driver header timestamp must not be overwritten by ticket ID F1');
    assert.match(driverMatch[1], ISO_MINUTE_RE, `Driver header must contain valid UTC timestamp, got: ${driverMatch[1]}`);

    // Check In-flight stage block header: `### stage <s1> - <name>  (dispatched <timestamp>, @cc-test)`
    const inflightHeader = contentAfter.split(/\r?\n/).find((l) => l.startsWith(`### stage ${s1} - `));
    assert.ok(inflightHeader, 'In-flight stage header should exist');
    const dispMatch = inflightHeader.match(/\(dispatched\s+([^,]+),\s+@cc-test\)/);
    assert.ok(dispMatch, `Unexpected in-flight header format: ${inflightHeader}`);
    assert.notEqual(dispMatch[1], 'F1', 'In-flight dispatched timestamp must not be ticket ID F1');
    assert.match(dispMatch[1], ISO_MINUTE_RE, `In-flight header must contain valid UTC timestamp, got: ${dispMatch[1]}`);

    // Subsequent status, chain status, orphans, and heartbeat calls must succeed without DateTime/header parse errors
    const statusRes = runRelay(tmp, ['-Mode', 'status', '-Run', runFile], env);
    assert.equal(statusRes.status, 0, `status failed: ${statusRes.stderr}`);

    const chainStatusRes = runRelay(tmp, ['-Mode', 'chain', '-Action', 'status', '-Run', runFile], env);
    assert.equal(chainStatusRes.status, 0, `chain status failed: ${chainStatusRes.stderr}`);

    const hbRes = runRelay(tmp, ['-Mode', 'heartbeat', '-N', s1, '-Driver', '@cc-test', '-Run', runFile], env);
    assert.equal(hbRes.status, 0, `heartbeat failed: ${hbRes.stderr}`);

    const orphansRes = runRelay(tmp, ['-Mode', 'orphans', '-Run', runFile], env);
    assert.equal(orphansRes.status, 0, `orphans failed: ${orphansRes.stderr}`);

    // Dispatch by another driver without -Take must properly parse driver timestamp and refuse as active driver
    const otherDrvRes = runRelay(
      tmp,
      ['-Mode', 'chain', '-Action', 'dispatch', '-N', s2, '-Driver', '@cc-other', '-Run', runFile],
      env
    );
    assert.equal(otherDrvRes.status, 2, `Expected foreign driver refusal (exit 2), got ${otherDrvRes.status}: ${otherDrvRes.stderr}`);
    assert.match(otherDrvRes.stderr, /REFUSED: chain is driven by @cc-test/, 'Should refuse due to active driver');

    // Foreign-owner refusal on stage 2 (owned by @vidul) with same driver must still refuse properly
    const disp2 = runRelay(
      tmp,
      ['-Mode', 'chain', '-Action', 'dispatch', '-N', s2, '-Driver', '@cc-test', '-Run', runFile],
      { ...env, RELAY_CHAIN_PARALLEL: '2' }
    );
    assert.equal(disp2.status, 2, `Expected foreign ticket owner refusal (exit 2), got ${disp2.status}: ${disp2.stderr}`);
    assert.match(disp2.stderr, /REFUSED: stage \d+: F3 is owned by @vidul/, 'Should refuse foreign-owned ticket F3');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
