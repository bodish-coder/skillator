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

test('A201: Write-Cmd converts canonical pending.toml and every Gemini pending alias identically and preserves paths with spaces', { skip: process.platform !== 'win32' ? 'Windows PowerShell required' : false }, t => {
  const root = mkdtempSync(join(tmpdir(), 'gemini-pending-alias-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const skillsDir = join(root, 'Profile With Spaces', '.gemini', 'skills');
  const outDir = join(root, 'Profile With Spaces', '.gemini', 'commands');

  for (const name of ['pending.toml', 'skillator-pending.toml']) {
    const tpl = join(plugin, 'host-commands', 'gemini', name);
    const target = join(outDir, name);
    const res = runWriteCmd(root, tpl, skillsDir, target);
    assert.equal(res.status, 0, `${name}: ${res.stdout}\n${res.stderr}`);
    const bytes = readFileSync(target);
    assert.ok(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${name} has BOM`);
    assert.ok(!bytes.includes(13), `${name} has CR`);
    const text = bytes.toString('utf8');
    assert.doesNotMatch(text, /^!\{sh /m, `${name} kept sh injection`);
    assert.ok(
      text.includes(`!{powershell -NoProfile -ExecutionPolicy Bypass -File "${skillsDir}\\tickets-zordon\\scripts\\pending.ps1"}`),
      `${name} missing PowerShell pending.ps1 injection with spaced path: ${text}`
    );
  }

  const canonical = readFileSync(join(outDir, 'pending.toml'), 'utf8');
  const alias = readFileSync(join(outDir, 'skillator-pending.toml'), 'utf8');
  assert.equal(alias, canonical, 'installed canonical pending.toml and skillator-pending.toml must have identical execution payload');

  // Portable shell projection preserves sh injection with quoted paths containing spaces
  const posixSkillsDir = '/Users/Profile With Spaces/.gemini/skills';
  for (const name of ['pending.toml', 'skillator-pending.toml']) {
    const raw = readFileSync(join(plugin, 'host-commands', 'gemini', name), 'utf8').replaceAll('\r', '');
    assert.match(raw, /^!\{sh "\{\{SKILLS\}\}\/tickets-zordon\/scripts\/pending\.sh"\}$/m, `portable template ${name}`);
    const projected = raw.replaceAll('{{SKILLS}}', posixSkillsDir);
    assert.ok(projected.includes(`!{sh "${posixSkillsDir}/tickets-zordon/scripts/pending.sh"}`), `portable projection with spaces in ${name}`);
  }

  // Shared payload conversion for any future Gemini pending alias
  const customTplDir = join(root, 'host-commands', 'gemini');
  mkdirSync(customTplDir, { recursive: true });
  const customAliasTpl = join(customTplDir, 'custom-pending-alias.toml');
  writeFileSync(customAliasTpl, readFileSync(join(plugin, 'host-commands', 'gemini', 'pending.toml'), 'utf8'), 'utf8');
  const customTarget = join(outDir, 'custom-pending-alias.toml');
  const customRes = runWriteCmd(root, customAliasTpl, skillsDir, customTarget);
  assert.equal(customRes.status, 0, customRes.stderr);
  assert.equal(readFileSync(customTarget, 'utf8'), canonical);

  // Missing shell line in pending.toml or skillator-pending.toml throws
  for (const name of ['pending.toml', 'skillator-pending.toml']) {
    const brokenTpl = join(customTplDir, name);
    writeFileSync(brokenTpl, 'description = "broken"\nprompt = "no shell line"\n', 'utf8');
    const brokenRes = runWriteCmd(root, brokenTpl, skillsDir, join(outDir, `broken-${name}`));
    assert.notEqual(brokenRes.status, 0, `expected ${name} without pending.sh line to fail`);
    assert.match(brokenRes.stderr + brokenRes.stdout, /no pending\.sh shell line/);
  }
});
