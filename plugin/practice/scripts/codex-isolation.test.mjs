import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedEnv, hookResult, liveCheck, runOffline, commandProjection } from './codex-isolation.mjs';
import * as isolation from './codex-isolation.mjs';

test('R2 repository-contained temporary parent is rejected before installation', () => {
  assert.equal(typeof isolation.validateTempParent, 'function', 'No physical temp-root guard exists');
  assert.throws(() => isolation.validateTempParent(process.cwd()), /repository/);
});
test('R1 native protocol capability is implemented, not permanently blocked', () => {
  assert.equal(typeof isolation.nativeProbe, 'function', 'No native inventory/injection probe exists');
});

test('child environment drops credentials and inherited skill/session overrides', () => {
  const env = isolatedEnv('/fixture', { PATH: '/bin', OPENAI_API_KEY: 'secret', CODEX_HOME: '/outside', CODEX_THREAD_ID: 'outside' });
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_THREAD_ID, undefined);
  assert.equal(env.HOME, env.USERPROFILE);
  assert.notEqual(env.CODEX_HOME, '/outside');
});
test('copied installer and installed usage hooks pass; deleting a generated command fails', () => {
  const fixture = runOffline();
  assert.ok(fixture.entries.every(e => e.status === 'passed'), JSON.stringify(fixture.entries));
  const resumed = isolation.resumeFixture(fixture.root);
  assert.deepEqual(resumed.expected, fixture.expected);
  const dest = join(fixture.env.CODEX_HOME, 'skills');
  unlinkSync(join(dest, 'pending/SKILL.md'));
  assert.equal(commandProjection(fixture.source, dest).status, 'failed');
  assert.throws(() => isolation.resumeFixture(fixture.root));
});
test('quota fixture rejects an outside-profile signal', () => {
  assert.equal(hookResult('src=codex 5h=99.0 7d=99.0 ctx=- max=99.0').status, 'failed');
  assert.equal(hookResult('src=codex 5h=12.0 7d=13.0 ctx=- max=13.0').status, 'passed');
});
test('live prerequisites block missing CLI and unsupported help after valid version', async () => {
  const fixture = { project: '/fixture', env: {}, expected: { tokens: [], sources: [] } };
  assert.equal((await liveCheck('missing', fixture, () => ({ error: { code: 'ENOENT' }, status: null }))).status, 'blocked');
  const help = await liveCheck('stub', fixture, (_exe, args) => ({ status: 0, stdout: args[0] === '--version' ? 'codex-cli 0.155.1' : 'app-server' }));
  assert.equal(help.status, 'blocked'); assert.match(help.reason, /help/); assert.equal(help.cliVersion, 'codex-cli 0.155.1');
  fixture.root = mkdtempSync(join(tmpdir(), 'codex-schema-'));
  const schema = await liveCheck('stub', fixture, (_exe, args) => {
    if (args.includes('--out')) writeFileSync(join(args.at(-1), 'schema.json'), JSON.stringify({ method: { const: 'skills/list' } }));
    return { status: 0, stdout: args[0] === '--version' ? 'codex-cli 0.155.1' : 'app-server generate-json-schema --out' };
  });
  assert.equal(schema.status, 'blocked'); assert.match(schema.reason, /schema missing required/);
});

test('physical temp-root guard rejects junction/case aliases and CLI writes a blocked report', () => {
  const external = mkdtempSync(join(tmpdir(), 'codex-guard-'));
  assert.equal(isolation.validateTempParent(external).toLowerCase(), external.toLowerCase());
  const link = join(external, 'repo-link'); symlinkSync(process.cwd(), link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => isolation.validateTempParent(link), /repository/);
  if (process.platform === 'win32') assert.throws(() => isolation.validateTempParent(process.cwd().toUpperCase()), /repository/);
  const report = join(external, 'blocked.json');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./codex-isolation.mjs', import.meta.url)), '--offline', '--report', report], { env: { ...process.env, TEMP: process.cwd(), TMP: process.cwd(), TMPDIR: process.cwd() }, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(readFileSync(report, 'utf8')).entries[0].status, 'blocked');
});

test('native stdio protocol validates inventory, injection, trust and bounded child cleanup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-protocol-'));
  const env = isolatedEnv(root), project = join(root, 'project'); mkdirSync(project);
  const sources = [join(project, 'AGENTS.md'), join(env.CODEX_HOME, 'AGENTS.md'), join(env.CODEX_HOME, 'skills/isolation-probe/SKILL.md'), join(env.CODEX_HOME, 'skills/pending/SKILL.md')];
  for (const path of sources) { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, 'fixture-text'); }
  const hookSource = join(env.CODEX_HOME, 'hooks.json'), hookCommand = 'fixture-only-hook';
  writeFileSync(hookSource, JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: hookCommand }] }] } }));
  const tokens = ['project-token', 'global-token', 'skill-token'];
  const external = join(root, 'external-SKILL.md'); writeFileSync(external, 'external sentinel');
  writeFileSync(join(root, 'fixture.json'), JSON.stringify({ sources, tokens, hookSource, external }));
  const fixture = { root, project, env, hookSource, hookCommand, expected: { sources, tokens, commandContent: 'fixture-text' } };
  const stub = fileURLToPath(new URL('./fixtures/codex-native-stub.mjs', import.meta.url));
  for (const [mode, id, status, reason] of [
    ['positive', 'live-native-loading', 'passed', /Native skill input accepted/],
    ['external', 'live-native-discovery', 'failed', /external/],
    ['unsupported', 'live-native-discovery', 'blocked', /unsupported/],
    ['auth', 'live-native-loading', 'blocked', /authentication/],
    ['untrusted', 'live-native-hooks', 'blocked', /untrusted/],
    ['malformed', 'live-native-discovery', 'blocked', /Malformed/],
    ['failed', 'live-native-loading', 'blocked', /failed/],
    ['nonce', 'live-native-loading', 'failed', /differs/],
    ['timeout', 'live-native-discovery', 'blocked', /timeout/],
  ]) {
    const result = await isolation.nativeProbe(process.execPath, fixture, { prefix: [stub, mode], timeout: mode === 'timeout' ? 600 : 5000 });
    const observed = result.find(e => e.id === id);
    assert.equal(observed?.status, status, mode + JSON.stringify(result)); assert.match(observed.reason, reason);
    if (mode === 'positive') assert.ok(result.every(e => e.status === 'passed'));
    const pid = Number(readFileSync(join(root, 'stub.pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0), mode + ' left native child alive');
    if (mode === 'timeout') assert.throws(() => process.kill(Number(readFileSync(join(root, 'grandchild.pid'), 'utf8')), 0), 'left native grandchild alive');
  }
});
