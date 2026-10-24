// F79: the Run tab's data - .skillator/run.json as the board reads it (only
// live-friday/scripts/run-entries writes it), the argv an entry runs and a job's output
// tail. Pure: the mod (hooks/runtab.tsx) and the standalone ops app (ops/runtab.ts) both
// build on it. A150: every program by absolute path, never a bare name the repo could supply.
import { findExe, findNode, norm, powershellExe, shellFor } from './calls'
import type { Job, RunEntry, RunFile } from '../../types'
export type { Job, RunEntry, RunFile, RunForm } from '../../types'

export const RUN_FILE = '.skillator/run.json'
// B4: entries are capped.
export const MAX_ENTRIES = 300
const MAX_TEXT = 300

const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '')

// run.json's text as the tab lists it; a file that is not the shape says so in `error`.
export function parseRunFile(text: string, path: string): RunFile {
  let j: unknown
  try { j = JSON.parse(text.replace(/^﻿/, '')) } catch (e) {
    return { path, entries: [], error: `${RUN_FILE} is not valid JSON (${(e as Error).message}) - fix it or delete it, then r to scan again` }
  }
  const list = (j as { entries?: unknown } | null)?.entries
  if (!Array.isArray(list)) return { path, entries: [], error: `${RUN_FILE} has no "entries" list - fix it or delete it, then r to scan again` }
  const entries = list.slice(0, MAX_ENTRIES).filter(x => x && typeof x === 'object').map((x): RunEntry => {
    const o = x as Record<string, unknown>
    return {
      id: str(o.id), name: str(o.name) || str(o.command) || str(o.id), kind: str(o.kind), target: str(o.target),
      args: Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string').slice(0, 50).map(a => a.slice(0, MAX_TEXT)) : [],
      command: str(o.command), cwd: str(o.cwd) || '.', source: str(o.source), missing: o.missing === true,
    }
  })
  return { path, entries, error: null }
}

// A path inside the repo: relative, no `..` segment, no drive, no backslash.
export const isSafeRel = (p: string) => p !== '' && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !/(^|\/)\.\.(\/|$)/.test(p) && !p.includes('\\')

// The programs the entries run, found once per run (absolute paths, or null when absent).
// npm: [node, npm-cli.js] on Windows (npm.cmd needs a shell), else the npm on PATH.
export type Bins = { sh: string | null; ps: string | null; make: string | null; npm: string[] | null }

export async function findBins(win: boolean, env: { path?: string; systemRoot?: string }, exists: (p: string) => Promise<boolean>,
  nodeExe?: string | null): Promise<Bins> {
  const sh = await shellFor(false, win, env, exists)
  const ps = win ? powershellExe(env.systemRoot) : await findExe('pwsh', env.path, false, exists)
  const make = await findExe('make', env.path, win, exists)
  let npm: string[] | null = null
  if (win) {
    const node = nodeExe ?? await findNode(env.path, true, exists)
    if (node) {
      const cli = norm(node).replace(/\/[^/]*$/, '') + '/node_modules/npm/bin/npm-cli.js'
      try { if (await exists(cli)) npm = [norm(node), cli] } catch { /* no npm beside node */ }
    }
  } else {
    const p = await findExe('npm', env.path, false, exists)
    if (p) npm = [p]
  }
  return { sh, ps, make, npm }
}

export type Planned = { argv: string[]; cwd: string } | { error: string }

// The exact argv and working directory an entry runs (shown before it runs).
export function planEntry(e: RunEntry, root: string, bins: Bins): Planned {
  if (e.missing) return { error: `${e.name}: its source is gone (${e.source || e.target}) - r scans again` }
  const cwd = e.cwd === '.' || e.cwd === '' ? norm(root) : isSafeRel(e.cwd) ? norm(root) + '/' + e.cwd : null
  if (!cwd) return { error: `${e.name}: cwd "${e.cwd}" is not inside the repo` }
  const need = (what: string) => ({ error: `${e.name}: ${what} not found on PATH (absolute entries only)` })
  switch (e.kind) {
    case 'npm':
      if (!e.target) break
      if (!bins.npm) return need('npm')
      return { argv: [...bins.npm, 'run', e.target, ...(e.args.length ? ['--', ...e.args] : [])], cwd }
    case 'make':
      if (!e.target) break
      if (!bins.make) return need('make')
      return { argv: [bins.make, e.target, ...e.args], cwd }
    case 'sh':
      if (!isSafeRel(e.target)) break
      if (!bins.sh) return need('sh')
      return { argv: [bins.sh, norm(root) + '/' + e.target, ...e.args], cwd }
    case 'ps1':
      if (!isSafeRel(e.target)) break
      if (!bins.ps) return need('PowerShell')
      return { argv: [bins.ps, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', norm(root) + '/' + e.target, ...e.args], cwd }
  }
  return { error: `${e.name}: not runnable - an entry needs a kind of npm, make, sh or ps1 and a target in the repo` }
}

const q = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
export const argvText = (argv: string[]) => argv.map(q).join(' ')

// One job at a time. B4: only the tail of its output is kept.
export const OUT_MAX = 16_000
export const keepTail = (out: string, add: string) => {
  const s = out + add
  return s.length <= OUT_MAX ? s : '…' + s.slice(s.length - OUT_MAX + 1)
}

export const duration = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m} min ${Math.round(s - m * 60)} s`
}

// The job's state line: running / exit code and duration / stopped / could not start.
export function jobStatus(j: Job, now: number): { text: string; color: 'warning' | 'success' | 'error' } {
  if (j.error) return { text: `✗ ${j.name} could not run: ${j.error}`, color: 'error' }
  if (j.ended === null) return { text: `● ${j.name} running - ${duration(now - j.started)}`, color: 'warning' }
  const took = duration(j.ended - j.started)
  if (j.stopped) return { text: `■ ${j.name} stopped after ${took}`, color: 'error' }
  return j.code === 0 ? { text: `✓ ${j.name} exit 0 in ${took}`, color: 'success' }
    : { text: `✗ ${j.name} exit ${j.code ?? '?'} in ${took}`, color: 'error' }
}

// The output's last `n` lines, control bytes dropped (a script's colours never reach the pane).
export function outLines(out: string, n: number): string[] {
  const ls = out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r\n/g, '\n').split('\n')
    .map(l => l.replace(/^.*\r(?=.)/, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ''))
  if (ls.length && ls[ls.length - 1] === '') ls.pop()
  return ls.slice(-n)
}

// The row's right column: why it cannot run, or where it was found.
export const entryNote = (e: RunEntry) => (e.missing ? 'missing' : e.source || e.kind)
