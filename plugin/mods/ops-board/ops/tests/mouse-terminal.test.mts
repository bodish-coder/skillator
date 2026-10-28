import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// TTY-shaped capture of the actual app, with an empty fixture skills directory.
// No installed scripts, credentials, or live board can be reached.
if (process.argv[2] === 'capture-child') {
  Object.defineProperty(process.stdin, 'isTTY', { value: true })
  process.stdin.setRawMode = () => process.stdin
  Object.defineProperties(process.stdout, { isTTY: { value: true }, columns: { value: Number(process.argv[3]) }, rows: { value: 24 } })
  const { main } = await import('../app')
  await main(['--skills', process.cwd(), '--no-color'])
} else {
  for (const cols of [40, 60, 80, 100, 120]) test(`actual terminal input: SGR click opens Health at ${cols} columns`, { timeout: 15000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ops-mouse-'))
    writeFileSync(join(dir, 'TICKETS.md'), '# Tickets\n- [ ] B1 — Fixture\n')
    const child = spawn(process.execPath, ['--import', pathToFileURL(resolve(import.meta.dirname, '../loader.mjs')).href, import.meta.filename, 'capture-child', String(cols)], { cwd: dir, stdio: 'pipe' })
    let out = '', err = '', sent = false
    child.stderr.on('data', b => { err += b })
    child.stdout.on('data', b => {
      out += b
      if (!sent && out.includes('Tickets')) {
        sent = true
        child.stdin.write('\x1b[<0;28;1M')
        child.stdin.write('\x1b[<0;28;1m')
        setTimeout(() => child.stdin.write('\x03'), 250)
      }
    })
    const timer = setTimeout(() => child.kill(), 10000)
    const code = await new Promise<number | null>(done => child.on('exit', done))
    clearTimeout(timer)
    if (process.env.B19_CAPTURE_DIR) writeFileSync(join(process.env.B19_CAPTURE_DIR, `B19-terminal-${cols}.ansi`), out)
    rmSync(dir, { recursive: true, force: true })
    assert.equal(err, '')
    assert.equal(code, 0)
    assert.match(out, /Usage/)
    assert.match(out, /\x1b\[\?1000h\x1b\[\?1006h/)
    assert.match(out, /\x1b\[\?1006l\x1b\[\?1000l/)
  })
}
