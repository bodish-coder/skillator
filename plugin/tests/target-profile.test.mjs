// F204: the scoped installer (`--target-host/--target-profile`, `-TargetHost/-TargetProfile`)
// run against a temp HOME and temp profiles only - never the real home folder. Each case is a
// real scoped install of one profile, so the file runs on its own in a few minutes, unlike the
// full selftests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const available = (exe, args) => spawnSync(exe, args, { windowsHide: true, timeout: 10000 }).status === 0;
const ps = ['powershell', 'pwsh'].find(exe => available(exe, ['-NoProfile', '-Command', 'exit 0']));
const hasSh = available('sh', ['-c', 'exit 0']);
const fwd = p => p.replaceAll('\\', '/');
const version = JSON.parse(readFileSync(join(plugin, '.claude-plugin/plugin.json'), 'utf8')).version;

function home(t) {
  const T = mkdtempSync(join(tmpdir(), 'f204-'));
  t.diagnostic(`fixture: ${T}`);
  const env = { ...process.env, HOME: T, USERPROFILE: T, CODEX_HOME: join(T, '.codex'), SKILLATOR_AGY_IDE: join(T, 'no-ide') };
  for (const key of ['XDG_CONFIG_HOME', 'PI_CODING_AGENT_DIR', 'GEMINI_CLI_HOME', 'SKILLATOR_SELFTEST_GUARDED']) delete env[key];
  return { T, env };
}
const profile = (T, ...parts) => { const p = join(T, ...parts); mkdirSync(p, { recursive: true }); return p; };
// plain: no -Force / --force, the run that keeps an existing skill copy
const install = {
  ps: (env, host, prof, plain) => spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'),
    ...(plain ? [] : ['-Force']), '-TargetHost', host, '-TargetProfile', prof], { env, encoding: 'utf8', timeout: 600000, windowsHide: true }),
  sh: (env, host, prof, plain) => spawnSync('sh', [fwd(join(plugin, 'install.sh')), ...(plain ? [] : ['--force']), '--target-host', host, '--target-profile', fwd(prof)],
    { env, encoding: 'utf8', timeout: 600000, windowsHide: true }),
};
// a skills dir as each installer writes it into {{SKILLS}}: install.ps1 C:\..., install.sh C:/...
const asHost = (port, p) => port === 'ps' ? p : fwd(p);
const ok = r => assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
const ports = [['ps', !ps && 'no powershell'], ['sh', !hasSh && 'no sh']];

for (const [port, skip] of ports) {
  test(`${port}: a pi profile given with a trailing separator still gets its prompts, extension and version record`, { skip }, t => {
    const { T, env } = home(t);
    const pi = profile(T, '.pi', 'agent');
    ok(install[port](env, 'pi', pi + (port === 'ps' ? '\\' : '/')));
    for (const f of ['prompts/skillator-update.md', 'prompts/skillator-update-all.md', 'extensions/skillator-ops.ts', 'skills/tickets-zordon/SKILL.md'])
      assert.ok(existsSync(join(pi, f)), `${port}: missing ${f}`);
    // review item 4: the profile records the version it was installed at, read before the next pull
    assert.equal(readFileSync(join(pi, 'skills/.skillator-version'), 'utf8'), `${version}\n`);
    // review 2, item 1: the written /skillator-update names this profile and its own records
    const prompt = readFileSync(join(pi, 'prompts/skillator-update.md'), 'utf8'), sk = asHost(port, join(pi, 'skills'));
    for (const want of [`\`${sk}/..\``, `${sk}/.skillator-version`, `${sk}/.skillator-source`, 'Target host: `pi`'])
      assert.ok(prompt.includes(want), `${port}: pi prompt lacks ${want}`);
    assert.ok(!existsSync(join(T, '.codex')) && !existsSync(join(T, '.gemini')), `${port}: wrote outside the selected profile`);
    // review 4, item 2: pi's default profile also gets ~/.pi/skills, as a full install fills it
    for (const f of ['tickets-zordon/SKILL.md', '.skillator-source', '.skillator-installed', 'ops-board'])
      assert.ok(existsSync(join(T, '.pi/skills', f)), `${port}: the default pi profile's sibling ~/.pi/skills lacks ${f}`);
  });

  test(`${port}: an Antigravity IDE target refreshes the IDE's ops board extension`, { skip }, t => {
    const { T, env } = home(t);
    const ide = join(T, port === 'ps' ? 'fake-ide.cmd' : 'fake-ide');
    const calls = join(T, 'ide-calls');
    if (port === 'ps') writeFileSync(ide, `@echo %*>>"${calls}"\r\n`);
    else writeFileSync(ide, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${fwd(calls)}"\n`, { mode: 0o755 });
    const config = profile(T, '.gemini', 'config');
    ok(install[port]({ ...env, SKILLATOR_AGY_IDE: port === 'ps' ? ide : fwd(ide) }, 'antigravity', config));
    assert.ok(existsSync(join(config, 'skills/ops-board/antigravity/skillator-ops.vsix')), `${port}: vsix not packed`);
    assert.match(readFileSync(calls, 'utf8'), /--install-extension .*skillator-ops\.vsix --force/, `${port}: IDE extension not installed`);
  });

  test(`${port}: a Gemini-only update refreshes skillator's old command skill dirs and keeps the user's`, { skip }, t => {
    const { T, env } = home(t);
    const gem = profile(T, '.gemini');
    const stale = profile(gem, 'skills', 'skillator-update');
    writeFileSync(join(stale, 'SKILL.md'), '---\nname: skillator-update\ndescription: old\n---\nRead {{SKILLS}}/.skillator-source - old text, every host this machine has\n');
    const mine = profile(gem, 'skills', 'skillator-pending');
    writeFileSync(join(mine, 'SKILL.md'), '---\nname: skillator-pending\ndescription: mine\n---\nmy own command\n');
    const extra = profile(gem, 'skills', 'team');
    writeFileSync(join(extra, 'SKILL.md'), 'reads tickets-zordon\n');
    writeFileSync(join(extra, 'notes.txt'), 'the user keeps notes here\n');
    ok(install[port](env, 'gemini', gem));
    for (const n of ['skillator-update', 'skillator-update-all']) assert.ok(existsSync(join(gem, `commands/${n}.toml`)), `${port}: missing ${n}.toml`);
    const refreshed = readFileSync(join(stale, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(refreshed, /old text/, `${port}: stale skillator command dir not refreshed`);
    assert.match(refreshed, /Update Skillator for the CLI and profile running this command/);
    assert.doesNotMatch(refreshed, /\{\{SKILLS\}\}/);
    // review 2, items 1-2: Gemini CLI loads this Antigravity-style copy - it names gemini and this profile
    const sk = asHost(port, join(gem, 'skills'));
    assert.match(refreshed, /Gemini CLI -> `gemini`/, `${port}: the copy in Gemini's skills dir does not name gemini`);
    for (const want of [`\`${sk}/..\``, `${sk}/.skillator-version`, `${sk}/.skillator-source`]) {
      assert.ok(refreshed.includes(want), `${port}: Gemini skill copy lacks ${want}`);
      assert.ok(readFileSync(join(gem, 'commands/skillator-update.toml'), 'utf8').includes(want), `${port}: Gemini TOML lacks ${want}`);
    }
    assert.equal(readFileSync(join(mine, 'SKILL.md'), 'utf8'), '---\nname: skillator-pending\ndescription: mine\n---\nmy own command\n', `${port}: rewrote a dir skillator does not own`);
    assert.equal(readFileSync(join(extra, 'SKILL.md'), 'utf8'), 'reads tickets-zordon\n', `${port}: rewrote a dir holding user files`);
    // a fresh profile gets no command skill dirs: Gemini reads the TOML commands
    assert.ok(!existsSync(join(gem, 'skills/skillator-update-all')), `${port}: created a command skill dir`);
  });
}

test('ps: a skill linked elsewhere in the selected profile is skipped, as install.sh skips it', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const shared = profile(T, 'shared', 'tickets-zordon');
  writeFileSync(join(shared, 'SKILL.md'), 'shared copy\n');
  const pi = profile(T, '.pi', 'agent', 'skills');
  symlinkSync(shared, join(pi, 'tickets-zordon'), 'junction');
  ok(install.ps(env, 'pi', join(T, '.pi', 'agent')));
  assert.equal(readFileSync(join(shared, 'SKILL.md'), 'utf8'), 'shared copy\n', 'the link target was changed');
  assert.ok(existsSync(join(pi, 'team-messages')) || existsSync(join(T, '.pi/agent/prompts/skillator-update.md')), 'the rest was not installed');
});

for (const [port, skip] of ports) test(`${port}: an empty target profile prints usage and exits 2`, { skip }, t => {
  const { T, env } = home(t);
  const r = port === 'ps'
    ? spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'), '-Force', '-TargetHost', 'pi', '-TargetProfile', ''], { env, encoding: 'utf8', timeout: 60000, windowsHide: true })
    : spawnSync('sh', [fwd(join(plugin, 'install.sh')), '--force', '--target-host', 'pi', '--target-profile', ''], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /usage: install\.(ps1|sh)/);
  assert.ok(!existsSync(join(T, '.pi')));
});

// review 2, item 5: a bare drive is the filesystem root under MSYS (C:\ -> /c). --dry-run, so a
// regression could never write into a real drive root.
for (const prof of [String.raw`C:\ `.trim(), 'C:/', 'C:', '/c', '/c/', '/C'])
  test(`sh: a bare drive ${JSON.stringify(prof)} as the target profile prints usage and exits 2`, { skip: !hasSh && 'no sh' }, t => {
    const { env } = home(t);
    const r = spawnSync('sh', [fwd(join(plugin, 'install.sh')), '--dry-run', '--force', '--target-host', 'pi', '--target-profile', prof],
      { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /below the filesystem root/);
    assert.match(r.stderr, /usage: install\.sh/);
    assert.doesNotMatch(r.stdout, /would write/);
  });

const psRun = (env, prof) => spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'),
  '-DryRun', '-Force', '-TargetHost', 'pi', '-TargetProfile', prof], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
// review 2, item 6: a UNC share root is a filesystem root too - refused from the path string, no share needed
for (const prof of [String.raw`\\server\share`, String.raw`\\server\share\ `.trim(), String.raw`C:\ `.trim()])
  test(`ps: the filesystem root ${JSON.stringify(prof)} as the target profile exits 2`, { skip: !ps && 'no powershell' }, t => {
    const { env } = home(t);
    const r = psRun(env, prof);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /below the filesystem root/);
  });
// review 2, item 7: a bad target profile is one line on stderr and exit 2, as install.sh - never a thrown error
test('ps: a relative target profile prints one line and exits 2', { skip: !ps && 'no powershell' }, t => {
  const { env } = home(t);
  const r = psRun(env, String.raw`relative\profile`);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr.trim().split(/\r?\n/).length, 1, r.stderr);
  assert.match(r.stderr, /TargetProfile must be an existing, absolute profile directory/);
});

// F204 review 3, item 2: the IDE CLI installs into the IDE's default extensions, so only the IDE's
// default profile (~/.gemini/config) gets the extension; any other antigravity profile is skipped
// with a note. Item 4: the antigravity writer never overwrites a shipped skill of the same name
// (code-vader, skillator-sync) with its command wrapper.
const shippedSkills = ['code-vader', 'skillator-sync'];
const realBodies = (port, skills) => {
  for (const n of shippedSkills) {
    const got = readFileSync(join(skills, n, 'SKILL.md'), 'utf8');
    assert.equal(got, readFileSync(join(plugin, 'skills', n, 'SKILL.md'), 'utf8'), `${port}: ${n}/SKILL.md is not the shipped skill`);
  }
};
for (const [port, skip] of ports) {
  test(`${port}: an Antigravity target that is not the IDE's default profile skips the IDE extension and keeps the shipped skills`, { skip }, t => {
    const { T, env } = home(t);
    const ide = join(T, port === 'ps' ? 'fake-ide.cmd' : 'fake-ide');
    const calls = join(T, 'ide-calls');
    if (port === 'ps') writeFileSync(ide, `@echo %*>>"${calls}"\r\n`);
    else writeFileSync(ide, `#!/bin/sh\nprintf '%s\n' "$*" >> "${fwd(calls)}"\n`, { mode: 0o755 });
    const other = profile(T, 'other-ide', 'config');
    const r = install[port]({ ...env, SKILLATOR_AGY_IDE: port === 'ps' ? ide : fwd(ide) }, 'antigravity', other);
    ok(r);
    assert.ok(!existsSync(calls), `${port}: installed the IDE extension for a profile the IDE does not use: ${existsSync(calls) && readFileSync(calls, 'utf8')}`);
    assert.equal((r.stdout.match(/not the Antigravity IDE's default profile/g) || []).length, 1, `${port}: no single note line\n${r.stdout}`);
    realBodies(port, join(other, 'skills'));
    assert.ok(existsSync(join(other, 'skills/skillator-update/SKILL.md')), `${port}: the command skills were not written`);
  });

  test(`${port}: a Codex install keeps the shipped skills whose names are also commands`, { skip }, t => {
    const { T, env } = home(t);
    const codex = profile(T, '.codex');
    ok(install[port](env, 'codex', codex));
    realBodies(port, join(codex, 'skills'));
    assert.ok(existsSync(join(codex, 'skills/skillator-update/SKILL.md')), `${port}: the command skills were not written`);
  });
}

// F204 review 3, item 3: an installer reached through a link must still see that the selected
// profile's skills dir is its own source. --dry-run, so a regression can never touch the repo.
test('ps: a target profile whose skills dir is the source, reached through a junction, exits 2', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const via = join(T, 'via');
  symlinkSync(plugin, via, 'junction');
  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(via, 'install.ps1'),
    '-DryRun', '-Force', '-TargetHost', 'pi', '-TargetProfile', plugin.replace(/[\/]$/, '')], { env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /overlaps the installer source/);
});
test('sh: a target profile whose skills dir is the source, reached through a link, exits 2', { skip: !hasSh && 'no sh' }, t => {
  const { T, env } = home(t);
  const via = join(T, 'via');
  symlinkSync(plugin, via, 'junction');
  const r = spawnSync('sh', [fwd(join(via, 'install.sh')), '--dry-run', '--force', '--target-host', 'pi', '--target-profile', fwd(plugin).replace(/\/$/, '')],
    { env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /overlaps the installer source/);
});

// B38: the guard runs both ways - a source checkout inside the selected skills dir is refused
// too. A minimal copy of the installer under <profile>/skills; --dry-run, so nothing is written.
for (const [port, skip] of ports) test(`${port}: an installer source inside the selected skills dir exits 2`, { skip }, t => {
  const { T, env } = home(t);
  const prof = profile(T, 'prof');
  const clone = profile(prof, 'skills', 'clone');
  for (const f of ['install.ps1', 'install.sh', '.claude-plugin/plugin.json', 'skills/tickets-zordon/SKILL.md']) {
    mkdirSync(join(clone, f, '..'), { recursive: true });
    writeFileSync(join(clone, f), readFileSync(join(plugin, f)));
  }
  const r = port === 'ps'
    ? spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(clone, 'install.ps1'), '-DryRun', '-Force', '-TargetHost', 'pi', '-TargetProfile', prof],
      { env, encoding: 'utf8', timeout: 120000, windowsHide: true })
    : spawnSync('sh', [fwd(join(clone, 'install.sh')), '--dry-run', '--force', '--target-host', 'pi', '--target-profile', fwd(prof)],
      { env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /overlaps the installer source/);
});

// A254: pwsh on Linux/macOS takes a POSIX target profile; Windows keeps the drive/UNC rule.
// The check line itself, run with $posixHost either way (no pwsh-on-Linux needed).
test('ps: a POSIX target profile counts as absolute only off Windows', { skip: !ps && 'no powershell' }, () => {
  const line = readFileSync(join(plugin, 'install.ps1'), 'utf8').match(/^\s*\$absolute = .*$/m)?.[0];
  assert.ok(line, 'install.ps1: no $absolute check');
  const absolute = (posix, p) => spawnSync(ps, ['-NoProfile', '-Command', `$posixHost = $${posix}; $TargetProfile = '${p}'\n${line}\nif ($absolute) { exit 0 } else { exit 1 }`],
    { encoding: 'utf8', timeout: 30000, windowsHide: true }).status === 0;
  assert.ok(absolute(true, '/home/me/.pi/agent'), 'a POSIX path off Windows');
  assert.ok(!absolute(true, 'home/me'), 'a relative path off Windows');
  assert.ok(!absolute(false, '/home/me/.pi/agent'), 'a POSIX path on Windows');
  assert.ok(absolute(false, String.raw`C:\Users\me\.pi`) && absolute(false, String.raw`\\server\share\p`), 'a drive or UNC path on Windows');
});

// A254: a plain run over a dest already recorded at this version skips the per-skill hashing -
// a kept copy edited since is not compared, so the record stays
for (const [port, skip] of ports) test(`${port}: a plain run over a dest recorded at this version skips the comparison`, { skip }, t => {
  const { T, env } = home(t);
  const codex = profile(T, '.codex');
  const skills = join(codex, 'skills');
  ok(install[port](env, 'codex', codex));
  writeFileSync(join(skills, 'tickets-zordon/SKILL.md'), readFileSync(join(skills, 'tickets-zordon/SKILL.md'), 'utf8') + '\nedited\n');
  ok(install[port](env, 'codex', codex, true));
  assert.equal(readFileSync(join(skills, '.skillator-version'), 'utf8'), `${version}\n`, `${port}: the record was dropped, so the copies were hashed`);
  assert.match(readFileSync(join(skills, 'tickets-zordon/SKILL.md'), 'utf8'), /edited/, `${port}: a plain run replaced a kept copy`);
});

// B37: a full -Force install keeps a skill dir linked to another copy, as install.sh does -
// never deleting it (or recursing through it into the copy it points at)
test('ps: a full -Force install keeps a skill dir linked to another copy', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const shared = profile(T, 'shared', 'tickets-zordon');
  writeFileSync(join(shared, 'SKILL.md'), 'shared copy\n');
  writeFileSync(join(shared, 'notes.txt'), 'the user keeps notes here\n');
  const link = join(profile(T, '.codex', 'skills'), 'tickets-zordon');
  symlinkSync(shared, link, 'junction');
  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'), '-Force', '-Profile', join(T, 'profile.ps1')],
    { env: { ...env, LOCALAPPDATA: join(T, 'lad'), SKILLATOR_MUSE: join(T, 'no-muse') }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  ok(r);
  assert.equal(readFileSync(join(shared, 'SKILL.md'), 'utf8'), 'shared copy\n', 'the link target was changed');
  assert.equal(readFileSync(join(shared, 'notes.txt'), 'utf8'), 'the user keeps notes here\n', 'a file in the link target was deleted');
  assert.ok(lstatSync(link).isSymbolicLink(), 'the link was replaced');
});

// B37 review: a dangling link is no live copy - it is removed (by itself) and the skill reinstalled
test('ps: a dangling skill link is replaced by the shipped skill', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const gone = profile(T, 'gone', 'tickets-zordon');
  const link = join(profile(T, '.codex', 'skills'), 'tickets-zordon');
  symlinkSync(gone, link, 'junction');
  rmSync(join(T, 'gone'), { recursive: true });
  ok(install.ps(env, 'codex', join(T, '.codex')));
  assert.ok(!lstatSync(link).isSymbolicLink(), 'the dangling link was kept');
  assert.equal(readFileSync(join(link, 'SKILL.md'), 'utf8'), readFileSync(join(plugin, 'skills/tickets-zordon/SKILL.md'), 'utf8'));
});

// F204 review 3, item 5: /c is a drive root only under MSYS (cygpath present) - a Linux /p is a
// valid directory - and a UNC share root //host/share is a root too
test('sh: root_profile refuses /c only where cygpath exists, and a bare UNC share root everywhere', { skip: !hasSh && 'no sh' }, () => {
  const shell = readFileSync(join(plugin, 'install.sh'), 'utf8').replaceAll('\r', '');
  const fn = shell.match(/^root_profile\(\) \{\n[\s\S]*?^\}/m)?.[0];
  assert.ok(fn, 'install.sh: root_profile not found');
  const isRoot = (p, noCygpath) => spawnSync('sh', ['-c', `${fn}\n${noCygpath ? 'PATH=/nonexistent-f204\n' : ''}root_profile "$1"`, 'sh', p],
    { encoding: 'utf8', timeout: 15000, windowsHide: true }).status === 0;
  for (const p of ['', 'C:', 'C:/', '//server/share', '//server']) assert.ok(isRoot(p, true), `${JSON.stringify(p)} is a root`);
  for (const p of ['/p', '/home/me/.pi', '//server/share/profile', 'C:/x']) assert.ok(!isRoot(p, true), `${JSON.stringify(p)} without cygpath is not a root`);
  if (available('sh', ['-c', 'command -v cygpath'])) assert.ok(isRoot('/c', false), '/c is a drive root under MSYS');
});
for (const prof of ['//server/share', '//server/share/'])
  test(`sh: the UNC share root ${JSON.stringify(prof)} as the target profile prints usage and exits 2`, { skip: !hasSh && 'no sh' }, t => {
    const { env } = home(t);
    const r = spawnSync('sh', [fwd(join(plugin, 'install.sh')), '--dry-run', '--force', '--target-host', 'pi', '--target-profile', prof],
      { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /below the filesystem root/);
  });

// F204 review 3, item 6: an unknown -TargetHost is one stderr line plus usage and exit 2, as install.sh
test('ps: an unknown target host prints one line plus usage and exits 2', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'),
    '-DryRun', '-Force', '-TargetHost', 'bogus', '-TargetProfile', T], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.deepEqual(r.stderr.trim().split(/\r?\n/), ['unknown target host: bogus', 'usage: install.ps1 [-DryRun] [-Force] [-Link] [-SelfTest] [-Profile <path>] [-OpsFontSize <6-72>] [-TargetHost <host> -TargetProfile <absolute path>]']);
});

// F204 review 4, item 2: a non-default pi profile leaves ~/.pi/skills alone, with one note line
for (const [port, skip] of ports) test(`${port}: a non-default pi profile leaves ~/.pi/skills alone and says so once`, { skip }, t => {
  const { T, env } = home(t);
  const other = profile(T, 'other-pi', 'agent');
  const r = install[port](env, 'pi', other);
  ok(r);
  assert.ok(existsSync(join(other, 'skills/tickets-zordon/SKILL.md')), `${port}: the selected profile was not filled`);
  assert.ok(!existsSync(join(T, '.pi')), `${port}: wrote ~/.pi for a non-default pi profile`);
  assert.equal((r.stdout.match(/not pi's default profile/g) || []).length, 1, `${port}: no single note line\n${r.stdout}`);
});

// F204 review 4, items 1 and 3: a plain run keeps existing skill copies, so it never records a
// newer version than the profile has (a stale record goes); a --force run records it. A shipped
// skill whose SKILL.md is an older run's command wrapper is reinstalled even without --force.
for (const [port, skip] of ports) test(`${port}: a plain run over an older install leaves no newer version record and replaces command wrappers; --force records the version`, { skip }, t => {
  const { T, env } = home(t);
  const codex = profile(T, '.codex');
  const skills = join(codex, 'skills');
  ok(install[port](env, 'codex', codex));
  // an older install: a changed skill copy, an older record, and the wrappers older runs wrote
  writeFileSync(join(skills, 'tickets-zordon/SKILL.md'), readFileSync(join(skills, 'tickets-zordon/SKILL.md'), 'utf8') + '\nolder text\n');
  writeFileSync(join(skills, '.skillator-version'), '0.0.1\n');
  for (const n of shippedSkills) {
    const wrapper = readFileSync(join(plugin, 'host-commands/antigravity', n, 'SKILL.md'), 'utf8').replaceAll('{{SKILLS}}', fwd(skills));
    writeFileSync(join(skills, n, 'SKILL.md'), wrapper);
  }
  ok(install[port](env, 'codex', codex, true));
  assert.ok(!existsSync(join(skills, '.skillator-version')), `${port}: a plain run left a version record: ${existsSync(join(skills, '.skillator-version')) && readFileSync(join(skills, '.skillator-version'), 'utf8')}`);
  assert.match(readFileSync(join(skills, 'tickets-zordon/SKILL.md'), 'utf8'), /older text/, `${port}: a plain run replaced a kept copy`);
  realBodies(port, skills);
  ok(install[port](env, 'codex', codex));
  assert.equal(readFileSync(join(skills, '.skillator-version'), 'utf8'), `${version}\n`, `${port}: --force did not record the version`);
});

// F204 review 5, item 1: a scoped /skillator-update installs from its private checkout,
// <profile>/.skillator-update-source - that run never repoints .skillator-source at it (the
// self-update hook and /skillator-update-all would take it for the user's own clone), but the
// version record is still written. The checkout is a link to this plugin, reached by its path.
for (const [port, skip] of ports) test(`${port}: an install run from a .skillator-update-source checkout keeps the old source pointer`, { skip }, t => {
  const { T, env } = home(t);
  const via = join(T, 'x', '.skillator-update-source', 'plugin');
  mkdirSync(join(T, 'x', '.skillator-update-source'), { recursive: true });
  symlinkSync(plugin.replace(/[\\/]$/, ''), via, 'junction');
  const codex = profile(T, '.codex');
  const skills = profile(T, '.codex', 'skills');
  writeFileSync(join(skills, '.skillator-source'), 'C:/old/clone/plugin\n');
  const r = port === 'ps'
    ? spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(via, 'install.ps1'), '-Force', '-TargetHost', 'codex', '-TargetProfile', codex],
      { env, encoding: 'utf8', timeout: 600000, windowsHide: true })
    : spawnSync('sh', [fwd(join(via, 'install.sh')), '--force', '--target-host', 'codex', '--target-profile', fwd(codex)],
      { env, encoding: 'utf8', timeout: 600000, windowsHide: true });
  ok(r);
  assert.equal(readFileSync(join(skills, '.skillator-source'), 'utf8'), 'C:/old/clone/plugin\n', `${port}: repointed the source at the private checkout`);
  assert.equal(readFileSync(join(skills, '.skillator-version'), 'utf8'), `${version}\n`, `${port}: no version record`);
});

// F204 review 4, item 7: the target host is exact, as install.sh's case
test('ps: a target host in the wrong case exits 2, as install.sh', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'),
    '-DryRun', '-Force', '-TargetHost', 'Pi', '-TargetProfile', T], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /^unknown target host: Pi/);
});

// F204 review 4, item 6: -Profile keeps its old position - `install.ps1 14 <path>` binds
// -OpsFontSize 14 and -Profile <path> (a dry run, so nothing is written)
test('ps: the second positional argument still binds -Profile', { skip: !ps && 'no powershell' }, t => {
  const { T, env } = home(t);
  const prof = join(T, 'positional-profile.ps1');
  profile(T, '.cursor');   // one host found, so the dry run reaches the profile step
  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, 'install.ps1'), '-DryRun', '14', prof],
    { env, encoding: 'utf8', timeout: 300000, windowsHide: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes(prof), `the dry run does not name the positional profile\n${r.stdout}`);
  assert.ok(!existsSync(prof), 'a dry run wrote the profile');
});
