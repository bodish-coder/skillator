import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { devTunnelsArgv, loginStatus, loginMessage, powershellExe, LOGIN_FAILED } from '../../hooks/lib/calls'

test('status rejects cwd lookup and preserves a spaced executable path', async () => {
  const found = new Set(['./devtunnel.exe', 'C:/Tool Box/devtunnel.exe'])
  const r = await devTunnelsArgv('team-login-status', true,
    { path: '.;relative;C:/Tool Box', systemRoot: 'C:/Windows' }, async p => found.has(p))
  assert.deepEqual(r, { argv: ['C:/Tool Box/devtunnel.exe', 'user', 'show'] })
})

test('login uses system PowerShell and one literal executable, including metacharacters', async () => {
  for (const dir of ['C:/Tool Box', "C:/O'Brien", 'C:/$(bait)', 'C:/semi;colon', 'C:/tick`here']) {
    // A semicolon in a PATH entry is a separator, so cannot discover that directory.
    const bin = dir + '/devtunnel.exe'
    const r = await devTunnelsArgv('team-login', true, { path: dir }, async p => [bin, powershellExe(undefined)].includes(p))
    if (dir.includes(';')) { assert.ok('error' in r); continue }
    assert.ok('argv' in r)
    assert.deepEqual(r.argv.slice(0, 4), [powershellExe(undefined), '-NoProfile', '-NonInteractive', '-Command'])
    assert.equal(r.argv[4], "$ErrorActionPreference='Stop'; Start-Process -FilePath '" + bin.replace(/'/g, "''") + "' -ArgumentList @('user','login') -WindowStyle Normal -ErrorAction Stop | Out-Null")
  }
})

test('builder rejects relative/empty/UNC discovery, missing tools and unsupported login', async () => {
  const probes: string[] = []
  const missing = await devTunnelsArgv('team-login', true, { path: ';.;relative;\\\\server\\bin' }, async p => { probes.push(p); return true })
  assert.ok('error' in missing)
  assert.deepEqual(probes, [])
  const noPs = await devTunnelsArgv('team-login', true, { path: 'C:/tools', systemRoot: '../bait' }, async p => p === 'C:/tools/devtunnel.exe')
  assert.match('error' in noPs ? noPs.error : '', /PowerShell/)
  assert.match('error' in (await devTunnelsArgv('team-login', false, {}, async () => true)) ? 'unsupported' : '', /unsupported/)
  assert.deepEqual(await devTunnelsArgv('team-login-status', false, { path: '.:relative:/usr/bin' }, async p => p === '/usr/bin/devtunnel'), { argv: ['/usr/bin/devtunnel', 'user', 'show'] })
  assert.ok('error' in await devTunnelsArgv('team-login-status', false, { path: '//server/bin:relative' }, async () => true))
})

test('status normalization fails closed, prefers negative, and discards arbitrary output', () => {
  const result = (out: string, code = 0, err = '') => ({ out, code, err })
  assert.equal(loginStatus(result('Logged in as synthetic-test-identity')), 'Signed in to Dev Tunnels.')
  assert.equal(loginStatus(result('LOGGED IN AS synthetic-test-identity')), 'Signed in to Dev Tunnels.')
  assert.equal(loginStatus(result('Not logged in; previously Logged in as synthetic-test-identity')), 'Not signed in to Dev Tunnels.')
  assert.equal(loginStatus(result('', 1, 'Not signed in')), 'Not signed in to Dev Tunnels.')
  assert.equal(loginStatus(result('unexpected')), 'Could not determine Dev Tunnels sign-in status.')
  assert.match(loginStatus(result('Logged in as synthetic-test-identity', 1)), /^Could not check/)
  for (const code of [-1, 1, 127]) assert.equal(loginMessage(result('arbitrary private output', code, 'arbitrary failure')), LOGIN_FAILED)
  assert.doesNotMatch(loginMessage(result('arbitrary private output')), /private/)
})

test('Windows PowerShell parses the produced command literally with Start-Process stubbed', { skip: process.platform !== 'win32' }, async () => {
  const ps = powershellExe(process.env.SystemRoot ?? process.env.SYSTEMROOT)
  for (const dir of ['C:/Tool Box', "C:/O'Brien", 'C:/$(throw 123)', 'C:/tick`here']) {
    const bin = dir + '/devtunnel.exe'
    const built = await devTunnelsArgv('team-login', true, { path: dir, systemRoot: process.env.SystemRoot }, async p => p === ps || p === bin)
    assert.ok('argv' in built)
    // The function completely shadows Start-Process. No login process can run.
    const stub = "function Start-Process { param($FilePath,$ArgumentList,$WindowStyle,$ErrorAction) [Console]::WriteLine((@{file=$FilePath;args=$ArgumentList;window=$WindowStyle} | ConvertTo-Json -Compress)) }; "
    const parsed = JSON.parse(execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', stub + built.argv[4]], { encoding: 'utf8', windowsHide: true }))
    assert.deepEqual(parsed, { file: bin, args: ['user', 'login'], window: 'Normal' })
  }
})
