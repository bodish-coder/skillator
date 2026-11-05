import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const skillRoot = resolve(here, '..');
const pluginRoot = resolve(skillRoot, '../..');
const armingPath = join(skillRoot, 'references/arming.md');

export function resolvePayloadRoot(repoRoot, skillDir = null) {
  if (existsSync(join(repoRoot, 'plugin/skills/design-arwen/UPSTREAM.md'))) {
    return join(repoRoot, 'plugin');
  }
  if (existsSync(join(repoRoot, 'skills/design-arwen/UPSTREAM.md'))) {
    return repoRoot;
  }
  if (skillDir) {
    const candidate = resolve(skillDir, '../..');
    if (existsSync(join(candidate, 'skills/design-arwen/UPSTREAM.md'))) {
      return candidate;
    }
  }
  return null;
}

export function watcherTargets(payloadRoot) {
  return {
    manifest: join(payloadRoot, 'skills/design-arwen/UPSTREAM.md'),
    arwenSh: join(payloadRoot, 'practice/scripts/upstream-check.sh'),
    arwenPs1: join(payloadRoot, 'practice/scripts/upstream-check.ps1'),
    yodaSh: join(payloadRoot, 'skills/code-yoda/upstream-check.sh'),
    yodaPs1: join(payloadRoot, 'skills/code-yoda/upstream-check.ps1'),
    odoSh: join(payloadRoot, 'skills/clone-odo/upstream-check.sh'),
    odoPs1: join(payloadRoot, 'skills/clone-odo/upstream-check.ps1'),
    nextIdSh: join(payloadRoot, 'practice/scripts/next-id.sh'),
    nextIdPs1: join(payloadRoot, 'practice/scripts/next-id.ps1'),
  };
}

function buildFixtureLayout(baseDir, movedCheckout) {
  const payload = movedCheckout ? join(baseDir, 'plugin') : baseDir;
  mkdirSync(join(payload, 'practice/scripts'), { recursive: true });
  mkdirSync(join(payload, 'skills/design-arwen'), { recursive: true });
  mkdirSync(join(payload, 'skills/code-yoda'), { recursive: true });
  mkdirSync(join(payload, 'skills/clone-odo'), { recursive: true });
  mkdirSync(join(payload, 'skills/grayskull-power'), { recursive: true });

  for (const rel of [
    'practice/scripts/upstream-check.sh',
    'practice/scripts/upstream-check.ps1',
    'practice/scripts/next-id.sh',
    'practice/scripts/next-id.ps1',
    'skills/code-yoda/upstream-check.sh',
    'skills/code-yoda/upstream-check.ps1',
    'skills/clone-odo/upstream-check.sh',
    'skills/clone-odo/upstream-check.ps1',
  ]) {
    copyFileSync(join(pluginRoot, rel), join(payload, rel));
  }

  const sha = 'a'.repeat(40);
  for (const [skill, name, repo] of [
    ['design-arwen', 'frontend-design', 'org/arwen'],
    ['code-yoda', 'ponytail', 'org/yoda'],
    ['clone-odo', 'replica-skill', 'org/odo'],
  ]) {
    writeFileSync(
      join(payload, `skills/${skill}/UPSTREAM.md`),
      `# ${skill} upstreams\n\n## Upstreams\n\n| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |\n|---|---|---|---|---|---|\n| ${name} | \`${repo}\` | \`SKILL.md\` | \`${sha}\` | 2026-10-01 | s |\n`,
      'utf8'
    );
  }
  return payload;
}

test('arming.md documents payload-root resolution and <payload>/... watcher commands', () => {
  const arming = readFileSync(armingPath, 'utf8');
  assert.match(arming, /plugin\/skills\/design-arwen\/UPSTREAM\.md/);
  assert.match(arming, /<payload>\/skills\/design-arwen\/UPSTREAM\.md/);
  assert.match(arming, /<payload>\/practice\/scripts\/upstream-check\.sh --daily/);
  assert.match(arming, /<payload>\/practice\/scripts\/upstream-check\.ps1" -Daily/);
  assert.match(arming, /<payload>\/skills\/code-yoda\/upstream-check\.sh --daily/);
  assert.match(arming, /<payload>\/skills\/code-yoda\/upstream-check\.ps1 -Daily/);
  assert.match(arming, /<payload>\/skills\/clone-odo\/upstream-check\.sh --daily/);
  assert.match(arming, /<payload>\/skills\/clone-odo\/upstream-check\.ps1 -Daily/);
  assert.match(arming, /<payload>\/practice\/scripts\/next-id\.sh A/);
  assert.match(arming, /<payload>\/practice\/scripts\/next-id\.ps1" A/);
  assert.match(arming, /tooling unavailable/);
});

test('current repo checkout resolves payload root to plugin/ and finds all watcher targets', () => {
  const repoRoot = resolve(pluginRoot, '..');
  const payload = resolvePayloadRoot(repoRoot, skillRoot);
  assert.equal(payload, pluginRoot);
  const targets = watcherTargets(payload);
  for (const [key, path] of Object.entries(targets)) {
    assert.ok(existsSync(path), `Expected ${key} to exist at ${path}`);
  }
});

test('moved-checkout and installed/flat layouts resolve payload root and execute watcher paths with offline stub', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a202-watch-'));
  const sha = 'a'.repeat(40);
  const stubPs1 = join(tmp, 'stub.ps1');
  writeFileSync(
    stubPs1,
    `param([string]$op, [string]$repo, [string]$x, [string]$y)\nif ($op -eq 'latest') { Write-Output '${sha}'; exit 0 }\nexit 0\n`,
    'utf8'
  );
  const stubSh = join(tmp, 'stub.sh');
  writeFileSync(
    stubSh,
    `#!/bin/sh\nif [ "$1" = latest ]; then echo ${sha}; exit 0; fi\nexit 0\n`,
    'utf8'
  );

  for (const [label, isMoved] of [['moved-checkout', true], ['installed-flat', false]]) {
    const dir = join(tmp, label);
    mkdirSync(dir, { recursive: true });
    const expectedPayload = buildFixtureLayout(dir, isMoved);
    const resolved = resolvePayloadRoot(dir, join(expectedPayload, 'skills/grayskull-power'));
    assert.equal(resolved, expectedPayload, `${label} should resolve payload root`);
    const targets = watcherTargets(resolved);
    for (const [k, p] of Object.entries(targets)) {
      assert.ok(existsSync(p), `${label}: missing ${k} at ${p}`);
    }

    if (process.platform === 'win32') {
      for (const [scriptPath, expectedName] of [
        [targets.arwenPs1, 'frontend-design'],
        [targets.yodaPs1, 'ponytail'],
        [targets.odoPs1, 'replica-skill'],
      ]) {
        const res = spawnSync(
          'powershell',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
          {
            cwd: dir,
            env: { ...process.env, UPSTREAM_CHECK_FETCH: stubPs1 },
            encoding: 'utf8',
          }
        );
        assert.equal(res.status, 0, `${label} ${scriptPath} failed: ${res.stderr || res.stdout}`);
        assert.match(res.stdout, new RegExp(`^unchanged ${expectedName} aaaaaaa`, 'm'));
      }
    }
  }
});

test('unavailable tooling or failed fetch never fakes a network query as successful', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'a202-fail-'));
  const payload = buildFixtureLayout(tmp, true);
  const targets = watcherTargets(payload);
  const failStubPs1 = join(tmp, 'fail-stub.ps1');
  writeFileSync(failStubPs1, 'exit 2\n', 'utf8');

  if (process.platform === 'win32') {
    const res = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', targets.arwenPs1],
      {
        cwd: tmp,
        env: { ...process.env, UPSTREAM_CHECK_FETCH: failStubPs1 },
        encoding: 'utf8',
      }
    );
    assert.equal(res.status, 2, 'Failed fetch must exit 2');
    assert.match(res.stdout, /^error\s+frontend-design/m);
    assert.doesNotMatch(res.stdout, /^unchanged /m, 'Must never fake unchanged on failure');
  }
});
