import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ps1Path = resolve(here, '../scripts/ticket-meta.ps1');
const shPath = resolve(here, '../scripts/ticket-meta.sh');
const repoRoot = resolve(here, '../../../..');

function extractPs1MonorepoSelftest(ps1Content) {
  const preSelftestIdx = ps1Content.indexOf('function Invoke-Selftest {');
  assert.ok(preSelftestIdx > 0, 'Invoke-Selftest must exist in ticket-meta.ps1');
  const preamble = ps1Content.slice(0, preSelftestIdx);

  const tryIdx = ps1Content.indexOf('\n  try {', preSelftestIdx);
  assert.ok(tryIdx > 0, 'try block must exist in Invoke-Selftest');
  const selftestHead = ps1Content.slice(preSelftestIdx, tryIdx + '\n  try {'.length);

  const monoStart = ps1Content.indexOf('    # --- monorepo fixture', tryIdx);
  const edgeStart = ps1Content.indexOf('    # --- edge fixture', monoStart);
  assert.ok(monoStart > 0 && edgeStart > monoStart, 'monorepo fixture block must be bounded');
  const monoBlock = ps1Content.slice(monoStart, edgeStart);

  const selftestEnd = ps1Content.indexOf('if ($args.Count -lt 1)', edgeStart);
  const finallyStart = ps1Content.indexOf('\n  } finally {', edgeStart);
  assert.ok(finallyStart > edgeStart && selftestEnd > finallyStart, 'finally block must exist in Invoke-Selftest');
  const selftestTail = ps1Content.slice(finallyStart, selftestEnd);

  return `${preamble}\n${selftestHead}\n${monoBlock}\n${selftestTail}\nInvoke-Selftest\n`;
}

function runPs1Snippet(scriptContent, env) {
  const tmpFile = join(tmpdir(), `ticket-meta-a212-${process.pid}-${Date.now()}.ps1`);
  writeFileSync(tmpFile, '\uFEFF' + scriptContent, 'utf8');
  try {
    return spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile],
      { encoding: 'utf8', env }
    );
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

test('A212: ticket-meta.ps1 and ticket-meta.sh selftests refresh snapshot after assign-app and retain [app: web, api] on F12', () => {
  const ps1 = readFileSync(ps1Path, 'utf8');
  const sh = readFileSync(shPath, 'utf8');

  const ps1MonoMatch = ps1.match(/# --- monorepo fixture([\s\S]*?)# --- edge fixture/);
  assert.ok(ps1MonoMatch, 'monorepo fixture must exist in ticket-meta.ps1');
  const ps1Mono = ps1MonoMatch[1];

  // After assign-app F12 web, api and no-change check, $before must be refreshed before Refused assign F1 '@nobody'
  assert.match(
    ps1Mono,
    /Run assign-app F12 web, api[\s\S]*?\$before = \[System\.IO\.File\]::ReadAllBytes\("\$M\/TICKETS\.md"\)[\s\S]*?Refused assign F1 '@nobody'/,
    'ticket-meta.ps1 must refresh $before after assign-app before checking Refused assign F1'
  );
  assert.ok(
    ps1Mono.includes(`Eq 'assign F12' (Run assign F12 '@asha') "- [ ] F12 $dash Bulk delete [app: web, api] [owner: @asha]"`),
    'ticket-meta.ps1 assign F12 expectation must retain [app: web, api]'
  );
  assert.ok(
    ps1Mono.includes(`- [ ] F12 $dash Bulk delete [app: web, api] [owner: @asha]\`n`),
    'ticket-meta.ps1 $want snapshot must retain [app: web, api] on F12'
  );

  const shMonoMatch = sh.match(/# --- monorepo fixture([\s\S]*?)# --- edge fixture/);
  assert.ok(shMonoMatch, 'monorepo fixture must exist in ticket-meta.sh');
  const shMono = shMonoMatch[1];

  assert.match(
    shMono,
    /run assign-app F12 web, api[\s\S]*?cp TICKETS\.md "\$T\/before\.md"[\s\S]*?assign F1 @nobody/,
    'ticket-meta.sh must refresh $T/before.md after assign-app before checking refused assign F1'
  );
  assert.ok(
    shMono.includes(`eq "assign F12" "$(run assign F12 @asha)" "- [ ] F12 $D Bulk delete [app: web, api] [owner: @asha]"`),
    'ticket-meta.sh assign F12 expectation must retain [app: web, api]'
  );
  assert.ok(
    shMono.includes(`- [ ] F12 %s Bulk delete [app: web, api] [owner: @asha]\\n`),
    'ticket-meta.sh want.md snapshot must retain [app: web, api] on F12'
  );
});

test('A212: extracted PowerShell monorepo selftest block passes and fails when assign-app is corrupted', () => {
  const ps1 = readFileSync(ps1Path, 'utf8');
  const script = extractPs1MonorepoSelftest(ps1);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: resolve(repoRoot, '.skillator/.gitconfig').replace(/\\/g, '/'),
  };

  const passRun = runPs1Snippet(script, env);
  assert.equal(passRun.status, 0, `Expected monorepo selftest to pass, stdout:\n${passRun.stdout}\nstderr:\n${passRun.stderr}`);
  assert.match(passRun.stdout.trim(), /^ok$/, 'Expected clean ok output from monorepo selftest');

  // Deliberately corrupt Do-AssignApp so assign-app writes only 'web' instead of 'web, api'
  const corruptedScript = script.replace(
    `$apps = [string]::Join(', ', $tokens.ToArray())`,
    `$apps = 'web'`
  );
  const failRun = runPs1Snippet(corruptedScript, env);
  assert.notEqual(failRun.status, 0, 'Expected corrupted assign-app selftest to exit non-zero');
  assert.match(failRun.stdout, /FAIL: assign-app explicit/, 'Expected FAIL on assign-app explicit when corrupted');
  assert.match(failRun.stdout, /FAIL: assign F12/, 'Expected FAIL on later assign F12 expectation when app tag is corrupted');
  assert.match(failRun.stdout, /FAIL: board bytes differ beyond the edited tags/, 'Expected FAIL on final $want snapshot when app tag is corrupted');
});
