import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const GIT_CONFIG_GLOBAL = join(REPO_ROOT, '.skillator', '.gitconfig').replace(/\\/g, '/');
const RELAY_PS1 = join(HERE, '..', 'hooks', 'relay-morpheus.ps1');
const RELAY_SH = join(HERE, '..', 'hooks', 'relay-morpheus.sh');

function findGitBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\sh.exe',
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'sh',
  ];
  for (const c of candidates) {
    if (c !== 'sh' && !existsSync(c)) continue;
    const r = spawnSync(c, ['-c', 'echo ok'], { encoding: 'utf8' });
    if (r.status === 0 && (r.stdout || '').trim() === 'ok') return c;
  }
  return null;
}

const SH_BIN = findGitBash();

function gitEnv(extra = {}) {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL,
    ...extra,
  };
}

function initGitRepo(dir) {
  const env = gitEnv();
  const r1 = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', env });
  assert.equal(r1.status, 0, `git init failed: ${r1.stderr}`);
  spawnSync('git', ['-C', dir, 'config', 'user.name', 'test'], { encoding: 'utf8', env });
  spawnSync('git', ['-C', dir, 'config', 'user.email', 'test@example.invalid'], { encoding: 'utf8', env });
  spawnSync('git', ['-C', dir, 'config', 'core.autocrlf', 'false'], { encoding: 'utf8', env });
}

function runPs1(cwd, args, extraEnv = {}) {
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY_PS1, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: gitEnv({
        RELAY_WORKTREE: 'off',
        RELAY_TICKET_META: join(cwd, 'nope.ps1'),
        RELAY_LEVEL_CMD: "echo 'src=claude-code 5h=40 7d=10 ctx=5 max=40'",
        ...extraEnv,
      }),
    }
  );
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

function runSh(cwd, args, extraEnv = {}) {
  const res = spawnSync(
    SH_BIN,
    [RELAY_SH.replace(/\\/g, '/'), ...args],
    {
      cwd,
      encoding: 'utf8',
      env: gitEnv({
        RELAY_WORKTREE: 'off',
        RELAY_TICKET_META: join(cwd, 'nope.sh').replace(/\\/g, '/'),
        RELAY_LEVEL_CMD: 'echo src=claude-code 5h=40 7d=10 ctx=5 max=40',
        ...extraEnv,
      }),
    }
  );
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

test('A183 (PowerShell): duplicate same-stage dispatches with declared files retain winner lease and block foreign run', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a183-ps1-'));
  try {
    initGitRepo(tmp);
    const runDir = join(tmp, '.skillator');
    mkdirSync(runDir, { recursive: true });

    const initA = runPs1(tmp, ['-Mode', 'init', '-Plan', 'T.md', '-Title', 'run a', '-Stages', 'stage a', '-Dir', runDir]);
    assert.equal(initA.status, 0, initA.stderr);
    const runA = initA.stdout.split(/\r?\n/)[0].trim();

    const initB = runPs1(tmp, ['-Mode', 'init', '-Plan', 'T.md', '-Title', 'run b', '-Stages', 'stage b', '-Dir', runDir]);
    assert.equal(initB.status, 0, initB.stderr);
    const runB = initB.stdout.split(/\r?\n/)[0].trim();

    const sA = readFileSync(runA, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage a\s*\|/m)[1];
    const sB = readFileSync(runB, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage b\s*\|/m)[1];

    const promptFile = join(tmp, 'p.txt');
    writeFileSync(promptFile, 'do work\n', 'utf8');

    assert.equal(runPs1(tmp, ['-Mode', 'chain', '-Action', 'plan', '-N', sA, '-PromptFile', promptFile, '-Files', 'src/shared.py', '-Run', runA]).status, 0);
    assert.equal(runPs1(tmp, ['-Mode', 'chain', '-Action', 'plan', '-N', sB, '-PromptFile', promptFile, '-Files', 'src/shared.py', '-Run', runB]).status, 0);

    // Deterministically interleave: hold the run lock while launching two dispatches of sA,
    // or race two concurrent dispatches of sA, then also run a second duplicate dispatch after winner claims.
    const spawnDispatch = () => new Promise((resolve) => {
      const child = spawn(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY_PS1, '-Mode', 'chain', '-Action', 'dispatch', '-N', sA, '-Driver', '@drv-a', '-Run', runA],
        {
          cwd: tmp,
          env: gitEnv({
            RELAY_WORKTREE: 'off',
            RELAY_TICKET_META: join(tmp, 'nope.ps1'),
            RELAY_LEVEL_CMD: "echo 'src=claude-code 5h=40 7d=10 ctx=5 max=40'",
          }),
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (status) => resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() }));
    });

    const [d1, d2] = await Promise.all([spawnDispatch(), spawnDispatch()]);
    const codes = [d1.status, d2.status].sort((a, b) => a - b);
    assert.deepEqual(codes, [0, 2], `Expected one winner (0) and one refused (2), got: ${d1.status} (${d1.stderr}), ${d2.status} (${d2.stderr})`);

    // Also run an explicit duplicate dispatch after winner is in-flight
    const d3 = runPs1(tmp, ['-Mode', 'chain', '-Action', 'dispatch', '-N', sA, '-Driver', '@drv-a', '-Run', runA]);
    assert.equal(d3.status, 2, `Duplicate dispatch should exit 2: ${d3.stderr}`);

    // Verify the lease registry still contains runA's lease on src/shared.py
    const leaseFile = join(tmp, '.git', 'skillator', 'leases');
    assert.ok(existsSync(leaseFile), 'Lease registry file must exist');
    const leases = readFileSync(leaseFile, 'utf8');
    assert.match(leases, new RegExp(`^src/shared\\.py\\tRUN-\\d+\\t${sA}\\t@drv-a\\t`, 'm'), `Winner lease must remain intact, got:\n${leases}`);

    // Foreign run B attempting to dispatch stage with overlapping file src/shared.py must be refused (exit 2, LEASED)
    const foreignDisp = runPs1(tmp, ['-Mode', 'chain', '-Action', 'dispatch', '-N', sB, '-Driver', '@drv-b', '-Run', runB]);
    assert.equal(foreignDisp.status, 2, `Foreign run must be refused while winner holds lease, got ${foreignDisp.status}: ${foreignDisp.stderr}`);
    assert.match(foreignDisp.stderr, /LEASED src\/shared\.py/, `Expected LEASED refusal, got: ${foreignDisp.stderr}`);

    // Landing stage sA releases the lease, allowing runB to dispatch
    assert.equal(runPs1(tmp, ['-Mode', 'stage', '-N', sA, '-State', 'x', '-Landed', 'abc1234', '-Run', runA]).status, 0);
    const leasesAfterLand = readFileSync(leaseFile, 'utf8');
    assert.doesNotMatch(leasesAfterLand, new RegExp(`\\t${sA}\\t`), 'Landing must release winner lease');

    const foreignDispAfter = runPs1(tmp, ['-Mode', 'chain', '-Action', 'dispatch', '-N', sB, '-Driver', '@drv-b', '-Run', runB]);
    assert.equal(foreignDispAfter.status, 0, `Foreign run should dispatch after winner lands: ${foreignDispAfter.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('A183 (Shell): duplicate same-stage dispatches with declared files retain winner lease and block foreign run', { skip: !SH_BIN }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a183-sh-'));
  try {
    initGitRepo(tmp);
    const runDir = join(tmp, '.skillator').replace(/\\/g, '/');
    mkdirSync(runDir, { recursive: true });

    const initA = runSh(tmp, ['init', 'T.md', 'run a', 'stage a'], { RELAY_DIR: runDir });
    assert.equal(initA.status, 0, initA.stderr);
    const runA = initA.stdout.split(/\r?\n/)[0].trim();

    const initB = runSh(tmp, ['init', 'T.md', 'run b', 'stage b'], { RELAY_DIR: runDir });
    assert.equal(initB.status, 0, initB.stderr);
    const runB = initB.stdout.split(/\r?\n/)[0].trim();

    const sA = readFileSync(runA, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage a\s*\|/m)[1];
    const sB = readFileSync(runB, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage b\s*\|/m)[1];

    const promptFile = join(tmp, 'p.txt').replace(/\\/g, '/');
    writeFileSync(promptFile, 'do work\n', 'utf8');

    assert.equal(runSh(tmp, ['chain', 'plan', sA, '--prompt-file', promptFile, '--files', 'src/shared.py'], { RELAY_RUN: runA }).status, 0);
    assert.equal(runSh(tmp, ['chain', 'plan', sB, '--prompt-file', promptFile, '--files', 'src/shared.py'], { RELAY_RUN: runB }).status, 0);

    const spawnDispatch = () => new Promise((resolve) => {
      const child = spawn(
        SH_BIN,
        [RELAY_SH.replace(/\\/g, '/'), 'chain', 'dispatch', sA, '--driver', '@drv-a'],
        {
          cwd: tmp,
          env: gitEnv({
            RELAY_WORKTREE: 'off',
            RELAY_RUN: runA,
            RELAY_TICKET_META: join(tmp, 'nope.sh').replace(/\\/g, '/'),
            RELAY_LEVEL_CMD: 'echo src=claude-code 5h=40 7d=10 ctx=5 max=40',
          }),
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (status) => resolve({ status, stdout: stdout.trim(), stderr: stderr.trim() }));
    });

    const [d1, d2] = await Promise.all([spawnDispatch(), spawnDispatch()]);
    const codes = [d1.status, d2.status].sort((a, b) => a - b);
    assert.deepEqual(codes, [0, 2], `Expected one winner (0) and one refused (2), got: ${d1.status} (${d1.stderr}), ${d2.status} (${d2.stderr})`);

    const d3 = runSh(tmp, ['chain', 'dispatch', sA, '--driver', '@drv-a'], { RELAY_RUN: runA });
    assert.equal(d3.status, 2, `Duplicate dispatch should exit 2: ${d3.stderr}`);

    const leaseFile = join(tmp, '.git', 'skillator', 'leases');
    assert.ok(existsSync(leaseFile), 'Lease registry file must exist');
    const leases = readFileSync(leaseFile, 'utf8');
    assert.match(leases, new RegExp(`^src/shared\\.py\\tRUN-\\d+\\t${sA}\\t@drv-a\\t`, 'm'), `Winner lease must remain intact, got:\n${leases}`);

    const foreignDisp = runSh(tmp, ['chain', 'dispatch', sB, '--driver', '@drv-b'], { RELAY_RUN: runB });
    assert.equal(foreignDisp.status, 2, `Foreign run must be refused while winner holds lease, got ${foreignDisp.status}: ${foreignDisp.stderr}`);
    assert.match(foreignDisp.stderr, /LEASED src\/shared\.py/, `Expected LEASED refusal, got: ${foreignDisp.stderr}`);

    assert.equal(runSh(tmp, ['stage', sA, 'x', 'build:opus', 'abc1234'], { RELAY_RUN: runA }).status, 0);
    const leasesAfterLand = readFileSync(leaseFile, 'utf8');
    assert.doesNotMatch(leasesAfterLand, new RegExp(`\\t${sA}\\t`), 'Landing must release winner lease');

    const foreignDispAfter = runSh(tmp, ['chain', 'dispatch', sB, '--driver', '@drv-b'], { RELAY_RUN: runB });
    assert.equal(foreignDispAfter.status, 0, `Foreign run should dispatch after winner lands: ${foreignDispAfter.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('A184 (PowerShell & Shell): heartbeat reads and updates under one lock without overwriting landed state or SHA', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a184-'));
  try {
    initGitRepo(tmp);
    const runDir = join(tmp, '.skillator');
    mkdirSync(runDir, { recursive: true });

    const initRes = runPs1(tmp, ['-Mode', 'init', '-Plan', 'T.md', '-Title', 'hb race', '-Stages', 'stage one,stage two', '-Dir', runDir]);
    assert.equal(initRes.status, 0, initRes.stderr);
    const runFile = initRes.stdout.split(/\r?\n/)[0].trim();

    const s1 = readFileSync(runFile, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage one\s*\|/m)[1];
    const s2 = readFileSync(runFile, 'utf8').match(/^\|\s*(\d+)\s*\|\s*stage two\s*\|/m)[1];

    // Put s1 in flight
    assert.equal(runPs1(tmp, ['-Mode', 'stage', '-N', s1, '-State', '~', '-Owner', 'build:sonnet', '-Run', runFile]).status, 0);

    // Deterministic lock-held interleaving (PowerShell):
    // Acquire runFile.lock simulating a concurrent landing writer, start heartbeat (which must block on lock,
    // NOT read stale ~ state before lock), then write landed state 'x' + SHA 'deadbeef' and release lock.
    const lockFile = `${runFile}.lock`;
    writeFileSync(lockFile, `${process.pid} ps1\n`, 'ascii');

    const hbPromise = new Promise((resolve) => {
      const child = spawn(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY_PS1, '-Mode', 'heartbeat', '-N', s1, '-Run', runFile],
        {
          cwd: tmp,
          env: gitEnv({
            RELAY_WORKTREE: 'off',
            RELAY_TICKET_META: join(tmp, 'nope.ps1'),
          }),
        }
      );
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (status) => resolve({ status, stderr: stderr.trim() }));
    });

    // Wait 300ms so the heartbeat process has started and reached Lock
    await new Promise((r) => setTimeout(r, 300));

    // Now simulate the lock holder landing stage s1 as 'x' with SHA 'deadbeef' and removing its In-flight block, then unlocking
    const content = readFileSync(runFile, 'utf8');
    const landedContent = content.replace(
      new RegExp(`^\\|\\s*${s1}\\s*\\|([^|]+)\\|[^|]+\\|([^|]+)\\|([^|]+)\\|[^|]+\\|`, 'm'),
      `| ${s1} |$1| x |$2|$3| deadbeef |`
    );
    writeFileSync(runFile, landedContent, 'utf8');
    rmSync(lockFile, { force: true });

    const hbRes = await hbPromise;
    assert.equal(hbRes.status, 0, `Heartbeat failed: ${hbRes.stderr}`);

    const afterPs1 = readFileSync(runFile, 'utf8');
    const rowPs1 = afterPs1.split(/\r?\n/).find((l) => new RegExp(`^\\|\\s*${s1}\\s*\\|`).test(l));
    assert.ok(rowPs1, 'Row s1 must exist');
    const cellsPs1 = rowPs1.split('|').map((c) => c.trim());
    assert.equal(cellsPs1[3], 'x', `Heartbeat interleaved with landing must NOT revert state 'x' back to '~', got row: ${rowPs1}`);
    assert.equal(cellsPs1[4], 'build:sonnet', `Heartbeat must preserve owner, got row: ${rowPs1}`);
    assert.equal(cellsPs1[6], 'deadbeef', `Heartbeat must preserve landed SHA, got row: ${rowPs1}`);

    // Now test Shell port with the same deterministic lock-held interleaving on stage s2
    if (SH_BIN) {
      assert.equal(runSh(tmp, ['stage', s2, '~', 'build:opus'], { RELAY_RUN: runFile.replace(/\\/g, '/') }).status, 0);

      writeFileSync(lockFile, `${process.pid} ps1\n`, 'ascii');
      const hbShPromise = new Promise((resolve) => {
        const child = spawn(
          SH_BIN,
          [RELAY_SH.replace(/\\/g, '/'), 'heartbeat', s2],
          {
            cwd: tmp,
            env: gitEnv({
              RELAY_WORKTREE: 'off',
              RELAY_RUN: runFile.replace(/\\/g, '/'),
              RELAY_TICKET_META: join(tmp, 'nope.sh').replace(/\\/g, '/'),
            }),
          }
        );
        let stderr = '';
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('close', (status) => resolve({ status, stderr: stderr.trim() }));
      });

      await new Promise((r) => setTimeout(r, 300));

      const content2 = readFileSync(runFile, 'utf8');
      const landedContent2 = content2.replace(
        new RegExp(`^\\|\\s*${s2}\\s*\\|([^|]+)\\|[^|]+\\|([^|]+)\\|([^|]+)\\|[^|]+\\|`, 'm'),
        `| ${s2} |$1| x |$2|$3| cafe1234 |`
      );
      writeFileSync(runFile, landedContent2, 'utf8');
      rmSync(lockFile, { force: true });

      const hbShRes = await hbShPromise;
      assert.equal(hbShRes.status, 0, `Shell heartbeat failed: ${hbShRes.stderr}`);

      const afterSh = readFileSync(runFile, 'utf8');
      const rowSh = afterSh.split(/\r?\n/).find((l) => new RegExp(`^\\|\\s*${s2}\\s*\\|`).test(l));
      assert.ok(rowSh, 'Row s2 must exist');
      const cellsSh = rowSh.split('|').map((c) => c.trim());
      assert.equal(cellsSh[3], 'x', `Shell heartbeat interleaved with landing must NOT revert state 'x' back to '~', got row: ${rowSh}`);
      assert.equal(cellsSh[4], 'build:opus', `Shell heartbeat must preserve owner, got row: ${rowSh}`);
      assert.equal(cellsSh[6], 'cafe1234', `Shell heartbeat must preserve landed SHA, got row: ${rowSh}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('A183 & A184 (Shell & PowerShell source-level ordering invariants)', () => {
  const shSrc = readFileSync(RELAY_SH, 'utf8');
  const ps1Src = readFileSync(RELAY_PS1, 'utf8');

  // A183 in relay-morpheus.sh: chain_dispatch must acquire lock and verify st in ''|'!' BEFORE lease_take_ and LEASED_N=$n
  const shDispBody = shSrc.slice(shSrc.indexOf('chain_dispatch()'), shSrc.indexOf('inflight_field()'));
  const shLockIdx = shDispBody.indexOf('\n  lock\n');
  const shStateCheckIdx = shDispBody.indexOf("case \"$st\" in ''|'!')");
  const shLeaseTakeIdx = shDispBody.indexOf('lease_locked lease_take_');
  const shLeasedNIdx = shDispBody.indexOf('LEASED_N=$n');
  assert.ok(shLockIdx > 0, 'chain_dispatch in .sh must acquire lock');
  assert.ok(shStateCheckIdx > shLockIdx, 'chain_dispatch in .sh must check stage state under lock');
  assert.ok(shLeaseTakeIdx > shStateCheckIdx, 'chain_dispatch in .sh must take lease only after stage state is verified pending/failed under lock');
  assert.ok(shLeasedNIdx > shLeaseTakeIdx, 'chain_dispatch in .sh must arm LEASED_N cleanup only after lease_take_ under lock');

  // A183 in relay-morpheus.ps1: DoChainDispatch must acquire Lock and verify $st in @('', '!') BEFORE LeaseLocked and $leased = $true
  const ps1DispBody = ps1Src.slice(ps1Src.indexOf('function DoChainDispatch'), ps1Src.indexOf('function RunTag'));
  const ps1LockIdx = ps1DispBody.indexOf('\n  Lock\n');
  const ps1StateCheckIdx = ps1DispBody.indexOf("if ($st -notin @('', '!'))");
  const ps1LeaseIdx = ps1DispBody.indexOf('LeaseLocked {');
  const ps1LeasedTrueIdx = ps1DispBody.indexOf('$leased = $true');
  assert.ok(ps1LockIdx > 0, 'DoChainDispatch in .ps1 must acquire Lock');
  assert.ok(ps1StateCheckIdx > ps1LockIdx, 'DoChainDispatch in .ps1 must check stage state under Lock');
  assert.ok(ps1LeaseIdx > ps1StateCheckIdx, 'DoChainDispatch in .ps1 must take lease only after stage state is verified pending/failed under Lock');
  assert.ok(ps1LeasedTrueIdx > ps1LeaseIdx, 'DoChainDispatch in .ps1 must arm $leased cleanup only after LeaseLocked under Lock');

  // A184 in relay-morpheus.sh: cmd_heartbeat must acquire lock once, read state inside awk, update only $6, and never call cmd_stage
  const shHbBody = shSrc.slice(shSrc.indexOf('cmd_heartbeat()'), shSrc.indexOf('cmd_list()'));
  assert.ok(!shHbBody.includes('cmd_stage'), 'cmd_heartbeat in .sh must not delegate to cmd_stage');
  assert.ok(!shHbBody.includes('row_cell'), 'cmd_heartbeat in .sh must not read state outside lock via row_cell');
  const shHbLockIdx = shHbBody.indexOf('\n  lock\n');
  const shHbAwkIdx = shHbBody.indexOf('$6 = " " t " "');
  const shHbUnlockIdx = shHbBody.indexOf('\n  unlock\n');
  assert.ok(shHbLockIdx > 0 && shHbAwkIdx > shHbLockIdx && shHbUnlockIdx > shHbAwkIdx, 'cmd_heartbeat in .sh must read state and update $6 inside lock..unlock');

  // A184 in relay-morpheus.ps1: DoHeartbeat must acquire Lock once, read state inside loop, update only $c[5], and never call DoStage
  const ps1HbBody = ps1Src.slice(ps1Src.indexOf('function DoHeartbeat'), ps1Src.indexOf('function DoStatus'));
  assert.ok(!ps1HbBody.includes('DoStage'), 'DoHeartbeat in .ps1 must not delegate to DoStage');
  assert.ok(!ps1HbBody.includes('RowCell'), 'DoHeartbeat in .ps1 must not read state outside Lock via RowCell');
  const ps1HbLockIdx = ps1HbBody.indexOf('\n  Lock\n');
  const ps1HbUpdateIdx = ps1HbBody.indexOf('$c[5] = " $t "');
  const ps1HbUnlockIdx = ps1HbBody.indexOf('finally { Unlock }');
  assert.ok(ps1HbLockIdx > 0 && ps1HbUpdateIdx > ps1HbLockIdx && ps1HbUnlockIdx > ps1HbUpdateIdx, 'DoHeartbeat in .ps1 must read state and update $c[5] inside Lock..Unlock');
});
