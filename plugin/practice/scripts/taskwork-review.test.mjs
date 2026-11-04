import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ps1 = resolve(here, 'taskwork.ps1');
const shScript = resolve(here, 'taskwork.sh');

const gitExe = 'git';

function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), 'taskwork-review-test-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  const env = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: '*',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  const git = (args, options = {}) => {
    const res = spawnSync(gitExe, args, { cwd: repo, env, encoding: 'utf8', ...options });
    if (res.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout.trim();
  };

  git(['init', '-q']);
  git(['config', 'user.email', 'test@test.local']);
  git(['config', 'user.name', 'Tester']);
  git(['config', 'commit.gpgsign', 'false']);

  writeFileSync(join(repo, 'file.txt'), 'first line\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'first commit']);
  const baseSha = git(['rev-parse', 'HEAD']);
  const baseShort = git(['rev-parse', '--short', 'HEAD']);

  writeFileSync(join(repo, 'file.txt'), 'first line\nsecond line\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'second commit']);
  const headSha = git(['rev-parse', 'HEAD']);
  const headShort = git(['rev-parse', '--short', 'HEAD']);

  const blobSha = git(['rev-parse', 'HEAD:file.txt']);
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);

  const designFile = join(repo, 'design.md');
  writeFileSync(designFile, 'GOAL: verify review command\n');

  const taskworkDir = join(repo, '.taskwork');

  return { root, repo, env, baseSha, baseShort, headSha, headShort, blobSha, treeSha, designFile, taskworkDir };
}

function runPs1(ctx, args, extraEnv = {}) {
  const env = { ...ctx.env, ...extraEnv };
  return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args], {
    cwd: ctx.repo,
    env,
    encoding: 'utf8',
  });
}

function runSh(ctx, args, extraEnv = {}) {
  const env = { ...ctx.env, ...extraEnv };
  return spawnSync('sh', [shScript, ...args], {
    cwd: ctx.repo,
    env,
    encoding: 'utf8',
  });
}

function listReviewFiles(taskworkDir) {
  if (!existsSync(taskworkDir)) return [];
  return readdirSync(taskworkDir).filter(name => name.startsWith('review-') && name.endsWith('.md'));
}

test('valid refs produce complete evidence atomically (PowerShell)', () => {
  const ctx = setupRepo();
  const res = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, ctx.headSha]);
  assert.equal(res.status, 0, `Failed with stderr: ${res.stderr}`);

  const packetPath = res.stdout.trim();
  assert.ok(existsSync(packetPath), `Packet file does not exist: ${packetPath}`);
  assert.equal(packetPath, join(ctx.taskworkDir, `review-${ctx.baseShort}-${ctx.headShort}.md`));

  const buf = readFileSync(packetPath);
  // Assert no UTF-8 BOM
  assert.ok(buf[0] !== 0xef || buf[1] !== 0xbb || buf[2] !== 0xbf, 'Must not emit UTF-8 BOM');

  const content = buf.toString('utf8');
  assert.ok(!content.includes('\r\n'), 'Must use LF line endings, not CRLF');
  assert.ok(content.endsWith('\n'), 'Must have trailing newline');

  assert.ok(content.includes('# Review package\n'));
  assert.ok(content.includes(`Base: ${ctx.baseSha}\n`));
  assert.ok(content.includes(`Head: ${ctx.headSha}\n`));
  assert.ok(content.includes('## Commits\n```\n'));
  assert.ok(content.includes('second commit\n'));
  assert.ok(content.includes('## Stat\n```\n'));
  assert.ok(content.includes('file.txt'));
  assert.ok(content.includes('## Diff\n```diff\n'));
  assert.ok(content.includes('+second line\n'));
});

test('bad refs return nonzero and leave no review packet (PowerShell)', () => {
  const ctx = setupRepo();
  const res = runPs1(ctx, ['review', ctx.designFile, 'nosuchbase', ctx.headSha]);
  assert.notEqual(res.status, 0, 'Must exit nonzero for invalid base ref');
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');

  const res2 = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, 'nosuchhead']);
  assert.notEqual(res2.status, 0, 'Must exit nonzero for invalid head ref');
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');
});

test('noncommit blob ref returns nonzero and leaves no review packet (PowerShell)', () => {
  const ctx = setupRepo();
  const res = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, ctx.blobSha]);
  assert.notEqual(res.status, 0, 'Must exit nonzero for blob ref');
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');
});

test('noncommit tree ref returns nonzero and leaves no review packet (PowerShell)', () => {
  const ctx = setupRepo();
  const res = runPs1(ctx, ['review', ctx.designFile, ctx.treeSha, ctx.headSha]);
  assert.notEqual(res.status, 0, 'Must exit nonzero for tree ref');
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');
});

test('injected git log failure returns nonzero, leaves no review packet, cleans stale output (PowerShell)', () => {
  const ctx = setupRepo();
  const targetPacket = join(ctx.taskworkDir, `review-${ctx.baseShort}-${ctx.headShort}.md`);
  mkdirSync(ctx.taskworkDir, { recursive: true });
  writeFileSync(targetPacket, 'stale content that must be purged on error\n');

  // Create injected git wrapper in temp dir
  const injectDir = mkdtempSync(join(tmpdir(), 'inject-git-log-'));
  const gitPs1 = join(injectDir, 'git.ps1');
  writeFileSync(
    gitPs1,
    `param([Parameter(ValueFromRemainingArguments)]$args)\r\n` +
      `if ($args.Count -gt 0 -and $args[0] -eq 'log') {\r\n` +
      `  [Console]::Error.WriteLine('injected git log failure')\r\n` +
      `  exit 128\r\n` +
      `}\r\n` +
      `& 'C:\\Program Files\\Git\\cmd\\git.exe' @args\r\n` +
      `exit $LASTEXITCODE\r\n`
  );

  const res = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, ctx.headSha], {
    PATH: `${injectDir};${process.env.PATH}`,
  });
  assert.notEqual(res.status, 0, `Must exit nonzero when git log fails. Stderr: ${res.stderr}`);
  assert.ok(!existsSync(targetPacket), `Stale or partial packet must be removed on error. Stderr: ${res.stderr}`);
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');
});

test('injected git diff failure returns nonzero, leaves no review packet, cleans stale output (PowerShell)', () => {
  const ctx = setupRepo();
  const targetPacket = join(ctx.taskworkDir, `review-${ctx.baseShort}-${ctx.headShort}.md`);
  mkdirSync(ctx.taskworkDir, { recursive: true });
  writeFileSync(targetPacket, 'stale content that must be purged on error\n');

  const injectDir = mkdtempSync(join(tmpdir(), 'inject-git-diff-'));
  const gitPs1 = join(injectDir, 'git.ps1');
  writeFileSync(
    gitPs1,
    `param([Parameter(ValueFromRemainingArguments)]$args)\r\n` +
      `if ($args.Count -gt 0 -and $args[0] -eq 'diff') {\r\n` +
      `  [Console]::Error.WriteLine('injected git diff failure')\r\n` +
      `  exit 128\r\n` +
      `}\r\n` +
      `& 'C:\\Program Files\\Git\\cmd\\git.exe' @args\r\n` +
      `exit $LASTEXITCODE\r\n`
  );

  const res = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, ctx.headSha], {
    PATH: `${injectDir};${process.env.PATH}`,
  });
  assert.notEqual(res.status, 0, `Must exit nonzero when git diff fails. Stderr: ${res.stderr}`);
  assert.ok(!existsSync(targetPacket), `Stale or partial packet must be removed on error. Stderr: ${res.stderr}`);
  assert.deepEqual(listReviewFiles(ctx.taskworkDir), [], 'No review packet should remain');
});

test('valid refs agree across shell and PowerShell when sh is available', (t) => {
  const ctx = setupRepo();
  const probe = spawnSync('sh', ['-c', 'exit 0'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    t.skip('sh is not available on this platform/environment');
    return;
  }

  const resPs = runPs1(ctx, ['review', ctx.designFile, ctx.baseSha, ctx.headSha]);
  assert.equal(resPs.status, 0, `PS failed: ${resPs.stderr}`);
  const psPacket = resPs.stdout.trim();

  // Create clean design file in another dir so sh creates its own packet
  const shDir = join(ctx.root, 'sh-copy');
  mkdirSync(shDir);
  const shDesign = join(shDir, 'design.md');
  writeFileSync(shDesign, 'GOAL: verify review command\n');

  const resSh = runSh(ctx, ['review', shDesign, ctx.baseSha, ctx.headSha]);
  assert.equal(resSh.status, 0, `Sh failed: ${resSh.stderr}`);
  const shPacket = resSh.stdout.trim();

  const psBytes = readFileSync(psPacket);
  const shBytes = readFileSync(shPacket);
  assert.ok(psBytes.equals(shBytes), 'PowerShell review packet must agree byte-for-byte with shell packet');
});
