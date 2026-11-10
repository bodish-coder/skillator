import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../../', import.meta.url));
const installerPs1 = join(plugin, 'install.ps1');

function runWriteCmd(root, tpl, skillsDir, target) {
  const driver = join(root, 'run-write-cmd.ps1');
  writeFileSync(driver, `param($Installer, $Tpl, $SkillsDir, $Target)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Installer, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failure' }
$fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Write-Cmd' }, $true)
if (-not $fn) { throw 'Missing Write-Cmd' }
$DryRun = $false
. ([scriptblock]::Create($fn.Extent.Text))
Write-Cmd $Tpl $SkillsDir $Target
`, 'utf8');
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', driver, installerPs1, tpl, skillsDir, target], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
}

test('Write-Cmd converts only Gemini pending.toml, like install.sh, and preserves paths with spaces', { skip: process.platform !== 'win32' ? 'Windows PowerShell required' : false }, t => {
  const root = mkdtempSync(join(tmpdir(), 'gemini-pending-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const skillsDir = join(root, 'Profile With Spaces', '.gemini', 'skills');
  const outDir = join(root, 'Profile With Spaces', '.gemini', 'commands');
  const pendingTpl = join(plugin, 'host-commands', 'gemini', 'pending.toml');

  const target = join(outDir, 'pending.toml');
  const res = runWriteCmd(root, pendingTpl, skillsDir, target);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  const bytes = readFileSync(target);
  assert.ok(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), 'BOM');
  assert.ok(!bytes.includes(13), 'CR');
  const text = bytes.toString('utf8');
  assert.doesNotMatch(text, /^!\{sh /m, 'kept sh injection');
  assert.ok(
    text.includes(`!{powershell -NoProfile -ExecutionPolicy Bypass -File "${skillsDir}\\tickets-zordon\\scripts\\pending.ps1"}`),
    `missing PowerShell pending.ps1 injection with spaced path: ${text}`
  );

  // Portable shell projection preserves sh injection with quoted paths containing spaces
  const posixSkillsDir = '/Users/Profile With Spaces/.gemini/skills';
  const raw = readFileSync(pendingTpl, 'utf8').replaceAll('\r', '');
  assert.match(raw, /^!\{sh "\{\{SKILLS\}\}\/tickets-zordon\/scripts\/pending\.sh"\}$/m);
  assert.ok(raw.replaceAll('{{SKILLS}}', posixSkillsDir).includes(`!{sh "${posixSkillsDir}/tickets-zordon/scripts/pending.sh"}`));

  // F166: no alias conversion - another Gemini template is only substituted, as install.sh does
  const tplDir = join(root, 'host-commands', 'gemini');
  mkdirSync(tplDir, { recursive: true });
  const otherTpl = join(tplDir, 'other.toml');
  writeFileSync(otherTpl, readFileSync(pendingTpl, 'utf8'), 'utf8');
  const otherTarget = join(outDir, 'other.toml');
  const otherRes = runWriteCmd(root, otherTpl, skillsDir, otherTarget);
  assert.equal(otherRes.status, 0, otherRes.stderr);
  assert.match(readFileSync(otherTarget, 'utf8'), /^!\{sh /m);

  // Missing shell line in pending.toml throws
  const brokenTpl = join(tplDir, 'pending.toml');
  writeFileSync(brokenTpl, 'description = "broken"\nprompt = "no shell line"\n', 'utf8');
  const brokenRes = runWriteCmd(root, brokenTpl, skillsDir, join(outDir, 'broken-pending.toml'));
  assert.notEqual(brokenRes.status, 0, 'expected pending.toml without pending.sh line to fail');
  assert.match(brokenRes.stderr + brokenRes.stdout, /no pending\.sh shell line/);
});
