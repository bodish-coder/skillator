import type { ProcessRunInit, ProcessRunResult } from 'claude-code'
import { BIN_SH, powershellExe, tasklistExe } from './calls'

// F48, design §9: a CLAUDE.md the baseline harness hid as CLAUDE.md.skillator-hidden
// (an interrupted GREEN run) is put back. Both ~/.claude and $CLAUDE_CONFIG_DIR are
// checked; a folder is touched only while CLAUDE.md is absent AND the hidden file is
// there. `report` (session start) says so and moves nothing, since another session may
// be mid-GREEN with the file hidden on purpose; `restore` (session end) puts it back:
// the text is written in-process ($.fs.write, fast, inside session end's budget) and
// read back to check it, and only then is the hidden copy removed by a host command
// ($.fs cannot delete). A removal that fails or times out leaves CLAUDE.md restored;
// the line then says the hidden copy is left behind, and where. Contract R1b: a
// `<hidden>.owner` naming a live process (a GREEN run still going) blocks the restore,
// as does a check that cannot be made, or an owner file over 6 hours old; a dead
// owner's file goes with the hidden copy.

// The part of `$` this file uses. The plugin's `$` is one.
export type RestoreApi = {
  env: { get: (name: string) => Promise<string | undefined> }
  clock: { now: () => Promise<number> }
  fs: {
    exists: (path: string) => Promise<boolean>
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
  }
  process: { run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult> }
  store: { set: (key: string, value: unknown) => Promise<void> }
}

export const HIDDEN = 'CLAUDE.md.skillator-hidden'
const OWNER_EXT = '.owner'                      // <hidden>.owner: the GREEN run holding it
export const RESTORE_NOTE = 'restoreNote'      // $.store key: the lines the next session shows
const OWNER_OLD_S = 6 * 3600                    // an owner file older than this is never restored by itself
const MIN_BUDGET_MS = 1000

const norm = (p: string) => p.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')
const same = (a: string, b: string, win: boolean) => (win ? a.toLowerCase() === b.toLowerCase() : a === b)
const quote = (p: string) => `'${p.replace(/'/g, "''")}'`

function moveArgv(win: boolean, from: string, to: string): string[] {
  return win
    ? ['powershell', '-NoProfile', '-Command', `Move-Item -LiteralPath ${quote(from)} -Destination ${quote(to)}`]
    : ['mv', '-n', from, to]
}

// A150: what runs does so by absolute path - System32's powershell / tasklist, /bin/sh -
// never a bare name the cwd (the session's repo) could supply on Windows. `rm` stays bare
// (Ruling: POSIX execvp never searches the cwd unless PATH names '.' or an empty entry).
// moveArgv above is only ever shown, for a person to type: it keeps the short names.
function removeArgv(win: boolean, sysRoot: string | undefined, paths: string[]): string[] {
  return win
    ? [powershellExe(sysRoot), '-NoProfile', '-Command', `Remove-Item -LiteralPath ${paths.map(quote).join(', ')}`]
    : ['rm', '-f', '--', ...paths]
}

// Contract R1b: while a GREEN run has CLAUDE.md hidden, the harness keeps
// `<hidden>.owner` = "<pid> <epoch> <winpid>" (winpid `-` when it has none; the older
// "<pid> <epoch>" reads as winpid `-`). The owner at session end: none (no owner file),
// dead, alive, or unknown (the file cannot be read or parsed, the check cannot be run
// or read, or Windows with winpid `-`). On Windows a numeric winpid is checked with
// tasklist (alive iff its output names that pid); elsewhere `kill -0 <pid>`.
type Owner = { state: 'none' }
  | { state: 'dead' | 'alive'; pid: string; epoch: number }
  | { state: 'unknown'; why: string; epoch: number | null }

// `timeout` hands out the check's time only when a check runs.
async function ownerOf($: RestoreApi, owner: string, win: boolean, sysRoot: string | undefined, timeout: () => number): Promise<Owner> {
  if (!await exists($, owner)) return { state: 'none' }
  let text: string
  try { text = await $.fs.read(owner) } catch (e) { return { state: 'unknown', why: errText(e), epoch: null } }
  const f = /^\s*(\d+)\s+(\d+)(?:\s+(\d+|-))?\s*$/.exec(text)
  if (!f) return { state: 'unknown', why: `${OWNER_EXT} is not "<pid> <epoch> <winpid>"`, epoch: null }
  const pid = f[1]!, epoch = Number(f[2]), winpid = f[3] ?? '-'
  const unknown = (why: string): Owner => ({ state: 'unknown', why, epoch })
  if (win && winpid === '-') return unknown(`${OWNER_EXT} names no Windows pid`)
  const timeoutMs = timeout()
  if (timeoutMs < 1) return unknown('no time left in the session end budget')
  if (win) {
    try {
      const r = await $.process.run([tasklistExe(sysRoot), '/FI', `PID eq ${winpid}`, '/NH'], { timeoutMs })
      if (r.exitCode !== 0) return unknown(r.stderr.trim() || r.stdout.trim() || `tasklist exit ${r.exitCode}`)
      if (!r.stdout.trim()) return unknown('tasklist said nothing')
      const alive = new RegExp(`(^|\\s)${winpid}(\\s|$)`).test(r.stdout)
      return { state: alive ? 'alive' : 'dead', pid: winpid, epoch }
    } catch (e) {
      return unknown(errText(e))
    }
  }
  try {
    const r = await $.process.run([BIN_SH, '-c', `kill -0 ${pid}`], { timeoutMs })
    if (r.exitCode === 0) return { state: 'alive', pid, epoch }
    const err = r.stderr.trim()
    if (/not permitted/i.test(err)) return { state: 'alive', pid, epoch }   // EPERM: there, another user's
    if (r.exitCode === 126 || r.exitCode === 127) return unknown(err || `exit ${r.exitCode}`)
    return { state: 'dead', pid, epoch }
  } catch (e) {
    return unknown(errText(e))
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function exists($: RestoreApi, p: string): Promise<boolean> {
  try { return await $.fs.exists(p) } catch { return false }
}

// `remainingMs` is session end's budget: not a number, or under a second, counts as a
// second. It is split across the folders to restore, and each host command's timeout
// comes from what is left of it; the note is stored before any removal runs.
export async function restoreClaudeMd($: RestoreApi, mode: 'report' | 'restore', remainingMs = 5000): Promise<string[]> {
  const win = (await $.env.get('OS')) === 'Windows_NT'
  const sysRoot = win ? (await $.env.get('SystemRoot')) ?? (await $.env.get('SYSTEMROOT')) : undefined
  const homeRaw = win
    ? (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
    : (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const home = homeRaw ? norm(homeRaw) : null
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  const dirs: string[] = []
  if (home) dirs.push(home + '/.claude')
  if (cfg && !dirs.some(d => same(d, norm(cfg), win))) dirs.push(norm(cfg))
  const shown = (p: string) => (home && p.length > home.length && same(p.slice(0, home.length + 1), home + '/', win)
    ? '~' + p.slice(home.length) : p)

  const todo: string[] = []
  for (const dir of dirs) if (!await exists($, dir + '/CLAUDE.md') && await exists($, dir + '/' + HIDDEN)) todo.push(dir)

  const lines: string[] = []
  if (mode === 'report') {
    for (const dir of todo) {
      const md = dir + '/CLAUDE.md', argv = moveArgv(win, dir + '/' + HIDDEN, md)
      lines.push(`▲ ${shown(md)} is hidden as ${HIDDEN} - left as is now (a baseline GREEN may be running); it is put back at session end. By hand: ${byHand(argv)}`)
    }
    return lines
  }

  // The budget: what is left is the budget less the larger of the time gone by and the
  // timeouts already handed out (a frozen clock still cannot overspend it).
  const budget = Number.isFinite(remainingMs) && remainingMs >= MIN_BUDGET_MS ? remainingMs : MIN_BUDGET_MS
  const t0 = await nowMs($)
  let given = 0
  const left = async () => Math.max(0, budget - Math.max(given, (await nowMs($)) - t0))
  const take = (ms: number) => { const t = Math.max(0, Math.floor(ms)); given += t; return t }
  const save = async (extra: string[]) => {
    try { await $.store.set(RESTORE_NOTE, [...lines, ...extra]) } catch { /* the log line still says it */ }
  }

  for (let i = 0; i < todo.length; i++) {
    const dir = todo[i]!, md = dir + '/CLAUDE.md', hidden = dir + '/' + HIDDEN
    const cmd = byHand(moveArgv(win, hidden, md))
    const ownerPath = hidden + OWNER_EXT
    const share = (await left()) / (todo.length - i)
    const owner = await ownerOf($, ownerPath, win, sysRoot, () => take(Math.min(2000, share / 2)))
    if (owner.state === 'alive') {
      lines.push(`▲ ${shown(md)} is hidden by a running GREEN run (pid ${owner.pid}) - left alone`)
      continue
    }
    const old = owner.state !== 'none' && owner.epoch !== null && (await nowMs($)) / 1000 - owner.epoch > OWNER_OLD_S
    const then = `Once no GREEN run is going, by hand: ${cmd}; then delete ${ownerPath}`
    if (owner.state === 'unknown') {
      lines.push(`■ ${shown(md)} not restored from ${HIDDEN}: could not check the run holding it (${owner.why})${old ? '; its owner file is over 6 hours old' : ''}. ${then}`)
      continue
    }
    if (owner.state === 'dead' && old) {
      lines.push(`■ ${shown(md)} not restored from ${HIDDEN}: the run holding it (pid ${owner.pid}) is not running, but its owner file is over 6 hours old - not restored by itself. ${then}`)
      continue
    }
    const gone = owner.state === 'dead' ? [hidden, ownerPath] : [hidden]
    lines.push(await restoreOne($, win, sysRoot, md, hidden, gone, shown, save,
      async () => take((await left()) / (todo.length - i))))
  }
  if (lines.length) await save([])
  return lines
}

async function nowMs($: RestoreApi): Promise<number> {
  try { const t = await $.clock.now(); return Number.isFinite(t) ? t : 0 } catch { return 0 }
}

// The move as a person types it: the shell line, or the PowerShell command.
const byHand = (argv: string[]) => (argv[0] === 'mv' ? argv.join(' ') : argv[3]!)

// One folder: write CLAUDE.md from the hidden copy, check it, store the note, then
// remove the copy. `gone` = the hidden copy, and its owner file when there was one:
// removed together. `timeout` = what the removal may take, asked for when it runs.
async function restoreOne($: RestoreApi, win: boolean, sysRoot: string | undefined, md: string, hidden: string, gone: string[],
  shown: (p: string) => string, save: (extra: string[]) => Promise<void>, timeout: () => Promise<number>): Promise<string> {
  const failed = (why: string) =>
    `■ Could not restore ${shown(md)} from ${HIDDEN}: ${why}. The hidden copy is kept at ${hidden}.`
  let text: string
  try { text = await $.fs.read(hidden) } catch (e) { return failed(errText(e)) }
  // Checked again right before the write: CLAUDE.md is never written over.
  if (await exists($, md)) return failed(`${shown(md)} appeared meanwhile - not written over`)
  try { await $.fs.write(md, text) } catch (e) { return failed(errText(e)) }
  let back: string | null = null
  try { back = await $.fs.read(md) } catch { back = null }
  if (back !== text) return failed(`${shown(md)} does not read back as written - compare it with the hidden copy`)

  const argv = removeArgv(win, sysRoot, gone)
  const head = `✓ Restored ${shown(md)} from ${HIDDEN} (an interrupted baseline run left it hidden).`
  // Stored first: should session end be cut short during the removal, the note still says it.
  await save([`${head} ▲ If ${hidden} is still there, remove it by hand: ${argv.join(' ')}`])
  let why = ''
  const ms = await timeout()
  if (ms < 1) why = 'no time left in the session end budget'
  else {
    try {
      const r = await $.process.run(argv, { timeoutMs: ms })
      if (r.exitCode !== 0) why = r.stderr.trim() || r.stdout.trim() || `exit ${r.exitCode}`
    } catch (e) {
      why = errText(e)
    }
  }
  if (!why) for (const p of gone) if (await exists($, p)) { why = `${p} is still there`; break }
  const leftBehind = why ? ` ▲ The hidden copy is left behind at ${hidden}: ${why} - remove it by hand.` : ''
  return `${head}${leftBehind} ran: ${argv.join(' ')}`
}
