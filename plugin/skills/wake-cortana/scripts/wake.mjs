import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const self = fileURLToPath(import.meta.url)
const quotaScript = resolve(dirname(self), '../../watch-cortana/hooks/codex-quota.cjs')
const interval = 60_000
const idPattern = /^RUN-\d{4,}$/
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export function quotaAvailable(record, now = Date.now() / 1000) {
  return record?.src === 'codex' && Number.isFinite(record.at) &&
    record.at <= now + 5 && now - record.at <= 60 &&
    [['5h', 96], ['7d', 97]].every(([key, limit]) =>
      Number.isFinite(record[key]) && record[key] >= 0 && record[key] < limit)
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function runFile(root, id) {
  if (!idPattern.test(id)) throw new Error('expected a run ID such as RUN-0042')
  const prefix = 'run-' + id.slice(4) + '-'
  const dir = join(root, '.skillator')
  const names = readdirSync(dir).filter(name => name.startsWith(prefix) && name.endsWith('.md'))
  if (names.length !== 1) throw new Error('expected exactly one run file for ' + id)
  return join(dir, names[0])
}

function hasWork(file) {
  const text = readFileSync(file, 'utf8')
  const stages = text.split(/^## Stages\s*$/m)[1]?.split(/^## /m)[0] ?? ''
  return /^\|\s*\d+\s*\|[^|]*\|\s*[~!]?\s*\|/m.test(stages)
}

function within(dir, file) {
  const part = relative(dir, file)
  return part && part !== '..' && !part.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(part)
}

function quota(profile, executable) {
  try {
    return JSON.parse(execFileSync(process.execPath, [quotaScript, profile, executable], { encoding: 'utf8', timeout: 20_000, windowsHide: true }))
  } catch { return null }
}

async function withLock(dir, action) {
  const lock = join(dir, 'command.lock')
  for (let retry = 0; ; retry++) {
    try { mkdirSync(lock); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (retry === 20) throw new Error('another Wake Cortana command holds the local lock')
      await sleep(100)
    }
  }
  try { return await action() } finally { rmdirSync(lock) }
}

async function worker(root, dir, generation) {
  const arm = join(dir, 'arm.json')
  const disabled = join(dir, 'off')
  const claimed = join(dir, 'claimed-' + generation)
  for (;;) {
    if (existsSync(disabled) || !existsSync(arm)) return
    const job = JSON.parse(readFileSync(arm, 'utf8'))
    if (job.generation !== generation || !idPattern.test(job.id)) return
    const executable = job.executable ?? 'codex'
    if (!/^codex(?:-[a-z0-9_-]+)?$/.test(executable)) throw new Error('invalid Codex launcher')
    const watchdog = resolve(root, process.env.RELAY_DIR || '.skillator')
    const held = () => existsSync(join(watchdog, 'watchdog.hold')) && !existsSync(join(watchdog, 'watchdog.off'))
    if (job.handoff && !held() && quotaAvailable(quota(job.profile, executable))) {
      const child = await withLock(dir, () => {
        if (existsSync(disabled) || !existsSync(arm) || held()) return null
        if (JSON.parse(readFileSync(arm, 'utf8')).generation !== generation) return null
        if (!hasWork(runFile(root, job.id))) return null
        if (!statSync(job.handoff).isFile()) throw new Error('the recorded handoff is unavailable')
        try { mkdirSync(claimed) } catch (error) { if (error.code === 'EEXIST') return null; throw error }
        // The run ID is validated, and the new session uses ordinary permissions.
        const prompt = 'Resume ' + job.id + ' from its Relay Morpheus run record.'
        const env = { ...process.env, CODEX_HOME: job.profile }
        const args = ['exec', ...(process.platform === 'win32' ? ['"' + prompt + '"'] : [prompt])]
        return new Promise((done, reject) => {
          const resumed = spawn(executable, args, {
            cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'],
            shell: process.platform === 'win32', windowsHide: true,
          })
          resumed.once('spawn', () => done(resumed))
          resumed.once('error', reject)
        })
      })
      if (!child) return
      const result = await new Promise((done, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => done({ code, signal }))
      })
      writeFileSync(join(claimed, 'result.json'), JSON.stringify(result))
      return
    }
    await sleep(interval)
  }
}

function writeJob(path, job) {
  const temporary = path + '.' + randomUUID()
  try {
    writeFileSync(temporary, JSON.stringify(job), { flag: 'wx' })
    renameSync(temporary, path)
  } finally { rmSync(temporary, { force: true }) }
}

async function main([command, ...args]) {
  if (command === 'worker') {
    if (args.length !== 3 || !/^[0-9a-f-]{36}$/.test(args[2])) throw new Error('invalid worker invocation')
    return worker(...args)
  }
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir')
  const root = basename(common) === '.git' ? dirname(common) : git('rev-parse', '--show-toplevel')
  const dir = join(common, 'skillator', 'wake-cortana')
  if ((!command || command === 'status') && !args.length) return control(command, args, root, dir)
  mkdirSync(dir, { recursive: true })
  return withLock(dir, () => control(command, args, root, dir))
}

async function control(command, args, root, dir) {
  const enabled = join(dir, 'on')
  const disabled = join(dir, 'off')
  const arm = join(dir, 'arm.json')
  if (command === 'on' && !args.length) {
    writeFileSync(enabled, '')
    rmSync(disabled, { force: true })
    return console.log('wake-cortana: on')
  }
  if (command === 'off' && !args.length) {
    writeFileSync(disabled, '')
    rmSync(arm, { force: true })
    return console.log('wake-cortana: off')
  }
  if ((!command || command === 'status') && !args.length) {
    if (!existsSync(enabled) || existsSync(disabled)) return console.log('wake-cortana: off')
    if (!existsSync(arm)) return console.log('wake-cortana: on, no run armed')
    const job = JSON.parse(readFileSync(arm, 'utf8'))
    const claim = join(dir, 'claimed-' + job.generation)
    const result = join(claim, 'result.json')
    const state = existsSync(result) ? 'finished ' + readFileSync(result, 'utf8')
      : existsSync(claim) ? 'launch claimed; see worker.log'
      : job.handoff ? 'waiting for quota' : 'waiting for handoff'
    return console.log('wake-cortana: ' + job.id + ' ' + state)
  }
  if (!existsSync(enabled) || existsSync(disabled)) throw new Error('enable wake-cortana first')
  if (command === 'handoff' && args.length === 2 && existsSync(arm)) {
    const job = JSON.parse(readFileSync(arm, 'utf8'))
    if (args[0] !== job.id) throw new Error('this run is not armed')
    const handoff = realpathSync(resolve(args[1]))
    if (!within(realpathSync(root), handoff) || !statSync(handoff).isFile() || !basename(handoff).endsWith('.md')) {
      throw new Error('expected a saved Markdown handoff in this repository')
    }
    writeJob(arm, { ...job, handoff })
    return console.log('wake-cortana: handoff saved for ' + job.id)
  }
  if (idPattern.test(command ?? '') && !args.length) {
    if (existsSync(arm)) {
      const previous = JSON.parse(readFileSync(arm, 'utf8'))
      if (!existsSync(join(dir, 'claimed-' + previous.generation, 'result.json'))) {
        throw new Error('a run is already armed; use off to cancel it before rearming')
      }
    }
    if (!hasWork(runFile(root, command))) throw new Error('run has no unfinished stages')
    const profile = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'))
    const profileLauncher = basename(profile).replace(/^\./, '')
    const candidates = /^codex-[a-z0-9_-]+$/.test(profileLauncher) ? [profileLauncher, 'codex'] : ['codex']
    const executable = candidates.find(name => {
      try {
        if (process.platform === 'win32') execFileSync('where.exe', [name], { stdio: 'ignore' })
        else execFileSync(name, ['--version'], { stdio: 'ignore', timeout: 5_000 })
        return true
      } catch { return false }
    })
    if (!executable) throw new Error('Codex CLI must be on PATH in the selected profile')
    const generation = randomUUID()
    writeJob(arm, { id: command, profile, executable, generation, handoff: null })
    const log = openSync(join(dir, 'worker.log'), 'a')
    try {
      const child = spawn(process.execPath, [self, 'worker', root, dir, generation], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log],
      })
      await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject) })
      child.unref()
    } finally { closeSync(log) }
    return console.log('wake-cortana: armed ' + command)
  }
  throw new Error('usage: wake-cortana on | off | status | RUN-00xx')
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error('wake-cortana: ' + error.message)
    process.exitCode = 1
  })
}
