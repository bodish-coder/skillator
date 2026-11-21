import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [worktree, logDir] = process.argv.slice(2)
if (!worktree || !logDir) throw new Error('Usage: node gauntlet-checks.mjs <worktree> <stage-log-directory>')

const cwd = resolve(worktree)
if (!statSync(cwd).isDirectory()) throw new Error('The stage worktree must be a directory')
const dir = resolve(logDir)
mkdirSync(dir, { recursive: true })
const record = join(dir, 'result.json')
const previous = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null

function runChecks() {
  const windows = process.platform === 'win32'
  const ps = join(cwd, '.skillator', 'checks.ps1')
  const sh = join(cwd, '.skillator', 'checks.sh')
  const usePowerShell = existsSync(ps) && (windows || !existsSync(sh))
  const script = usePowerShell ? ps : sh
  if (!existsSync(script) && !previous?.attempt) {
    return { status: 'skip', reason: 'No .skillator/checks script configured' }
  }

  const attempt = (previous?.attempt ?? 0) + 1
  const log = join(dir, `attempt-${attempt}.log`)
  const fd = openSync(log, 'w')
  try {
    const shell = usePowerShell ? (windows ? 'powershell.exe' : 'pwsh') : (windows ? 'sh.exe' : 'sh')
    const args = usePowerShell
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]
      : [script.replaceAll('\\', '/')]
    writeSync(fd, `Running ${script} in ${cwd}\n`)
    const child = spawnSync(shell, args, { cwd, stdio: ['ignore', fd, fd] })
    if (child.error) writeSync(fd, `\n${child.error.message}\n`)
    const exit = child.status ?? 1
    writeSync(fd, `\nExit ${exit}${child.signal ? ' (' + child.signal + ')' : ''}\n`)
    const failures = (previous?.failures ?? 0) + Number(exit !== 0)
    return { status: exit === 0 ? 'pass' : failures >= 3 ? 'blocked' : 'retry', attempt, failures, exit, log }
  } finally {
    closeSync(fd)
  }
}

const result = previous?.status === 'blocked' ? previous : runChecks()
const tempRecord = record + '.tmp'
writeFileSync(tempRecord, JSON.stringify(result) + '\n')
renameSync(tempRecord, record)
console.log(JSON.stringify(result))
process.exitCode = result.exit ?? 0
