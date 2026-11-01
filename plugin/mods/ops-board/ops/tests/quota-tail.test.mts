import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const hooks = fileURLToPath(new URL('../../../../skills/watch-cortana/hooks/', import.meta.url))
const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'"
function fixture() {
  const root = mkdtempSync(`${hooks}/.quota-tail-`).replace(/\\/g, '/')
  const env = { ...process.env, HOME: root, USERPROFILE: root }
  for (const key of Object.keys(env)) {
    if (/^(CODEX_|CLAUDE_|SKILLATOR_|AGY_|ANTIGRAVITY_|MUSE_|CURSOR_)/.test(key)) delete env[key]
  }
  Object.assign(env, { SKILLATOR_CLI: 'codex', SKILLATOR_PROFILE_DIR: root, CODEX_HOME: root })
  return { root, env }
}
const token = (n: number) => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', text: '配額 café', rate_limits: { primary: { used_percent: n, window_minutes: 300 }, secondary: { used_percent: 59, window_minutes: 10080 } } } })

test('PowerShell: 24 MB long-line rollout fits the five-second status reader budget', () => {
  const { root, env } = fixture()
  try {
    mkdirSync(`${root}/sessions`)
    const filler = JSON.stringify({ type: 'event_msg', text: 'x'.repeat(60 * 1024) })
    writeFileSync(`${root}/sessions/rollout-large.jsonl`, Array(399).fill(filler).concat(token(17)).join('\n') + '\n')
    // Run the real level reader: selection and quota parsing both read the rollout.
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${hooks}/usage-watch.ps1`, '-Mode', 'level'], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 })
    assert.equal(out.trim(), 'src=codex 5h=17.0 7d=59.0 ctx=- max=59.0')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('PowerShell tail preserves latest match, 400-line boundary, UTF8 and empty inputs with a live writer; shell agrees', () => {
  const { root, env } = fixture()
  try {
    const cases = [
      { name: 'latest', body: token(12) + '\n{}\n' + token(17) + '\n', want: token(17) },
      { name: '400th', body: token(17) + '\n' + '{}\n'.repeat(399), want: token(17) },
      { name: '401st', body: token(17) + '\n' + '{}\n'.repeat(400), want: '' },
      { name: 'crlf', body: token(17) + '\r\n' + '{}\r\n'.repeat(399), want: token(17) },
      { name: 'unterminated', body: token(17) + '\n' + Array(399).fill('{}').join('\n'), want: token(17) },
      { name: 'bom', body: '\ufeff' + token(17), want: token(17) },
      { name: 'empty', body: '', want: '' },
      { name: 'no-token', body: '{}\n\n', want: '' },
      { name: 'blank-boundary', body: token(17) + '\n'.repeat(401), want: '' },
    ]
    const paths = cases.map(c => `${root}/配額-${c.name}.jsonl`)
    cases.forEach((c, i) => writeFileSync(paths[i]!, c.body))
    // Extract the actual function without running watcher initialization or refresh.
    const source = readFileSync(`${hooks}/usage-watch.ps1`, 'utf8')
    const fn = source.match(/^function Get-CodexLastTc\(\$path\) \{[\s\S]*?^\}/m)![0]
    const script = `${root}/tail.ps1`
    writeFileSync(script, '\ufeff' + `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n` + fn + '\n' +
      `$writer = [IO.File]::Open(${quote(paths[0]!)}, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)\n` +
      `try {\n$results = @(\n${paths.map(p => `[string](Get-CodexLastTc ${quote(p)})`).join('\n')}\n)\nConvertTo-Json -InputObject $results -Compress\n} finally { $writer.Dispose() }\n`)
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 })
    assert.deepEqual(JSON.parse(out).map((line: string | null) => line ?? ''), cases.map(c => c.want))
    const shSource = readFileSync(`${hooks}/usage-watch.sh`, 'utf8').match(/^codex_last_tc\(\) \{.*\}$/m)![0]
    const shScript = `${root}/tail.sh`
    writeFileSync(shScript, shSource + '\ncodex_last_tc "$1"\n')
    for (const [i, c] of cases.entries()) {
      const shell = execFileSync('sh', [shScript, paths[i]!], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 })
      assert.equal(shell.replace(/^[\ufeff]/, '').replace(/[\r\n]+$/, ''), c.want, c.name)
    }
    // Caller must treat absent sessions as no reading, without attempting refresh.
    const absent = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${hooks}/usage-watch.ps1`, '-Mode', 'level'], { env, encoding: 'utf8', windowsHide: true, timeout: 5000 })
    assert.match(absent, /^src=none 5h=- 7d=- ctx=- max=-/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
