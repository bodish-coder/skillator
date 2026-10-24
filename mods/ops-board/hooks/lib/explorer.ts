import type { Color } from 'claude-code'
import type { Change, Commit, Explorer, TreeRow } from '../../types'
import type { Seg } from './bandlines'
import type { Model } from './ticketsmodel'
import { offsetFor, toggleGroup } from './ticketsmodel'

// F75: the Explorer tab's model - the project's git-tracked files as a tree and the
// recent commits, each opening to the files it changed. Pure: explorertab.tsx runs git
// and draws it in the pane, ops/explorer.ts does the same for the standalone app.
// Sections, folders and commits open and close as F61's groups (toggleGroup); `open`
// holds their items. Only what is drawn is held: the tree's rows of open folders, the
// changes of open commits (B4 - the pane's $.state caps a value at 4,194,304 chars).
// Items (what up/down walk, and the drawn line's key): 'xs:files', 'xs:commits',
// 'xd:<folder>', 'xf:<file>', 'xc:<sha>'. A commit's changes are lines, not items.

export const FILES = 'xs:files'
export const COMMITS = 'xs:commits'
export const LOG_N = 40                 // the commits listed: the newest LOG_N
export const MAX_TREE = 2000            // tree rows drawn at most (a folder of 50k files)
export const MAX_CHANGES = 300          // a commit's files drawn at most
export const NO_GIT = 'git not found on PATH (absolute entries only)'

export type { Change, Commit, Explorer, TreeRow } from '../../types'
export const EMPTY: Explorer = { open: [], selected: null, files: null, tree: [], treeMore: 0, commits: null, changes: {}, error: null }

// --- git's words: argv after the git binary. No shell; paths never quoted (-z, quotePath off). ---

export const LS_ARGS = ['ls-files', '-z']
export const LOG_ARGS = ['-c', 'core.quotePath=false', 'log', `-n${LOG_N}`, '--date=short', '--format=%H%x1f%h%x1f%ad%x1f%an%x1f%s']
// With both, --name-status wins and --numstat is dropped: --raw carries the same A/M/D/R
// status and comes first, the numstat lines follow in the same order. A merge: against
// its first parent.
export const isSha = (s: string) => /^[0-9a-f]{7,64}$/.test(s)
export const changeArgs = (sha: string) =>
  ['-c', 'core.quotePath=false', 'log', '-1', '-m', '--first-parent', '--format=', '--raw', '--numstat', '-M', sha]

export const parseFiles = (out: string) => out.split('\0').map(s => s.replace(/^\n+/, '')).filter(Boolean)

export function parseLog(out: string): Commit[] {
  const cs: Commit[] = []
  for (const l of out.split(/\r?\n/)) {
    const [sha, short, date, author, ...rest] = l.split('\x1f')
    if (sha && isSha(sha) && short !== undefined) cs.push({ sha, short, date: date ?? '', author: author ?? '', subject: rest.join('\x1f') })
  }
  return cs
}

export function parseChanges(out: string): Change[] {
  const lines = out.split(/\r?\n/)
  const raw = lines.filter(l => l.startsWith(':'))
  const nums = lines.filter(l => /^(\d+|-)\t(\d+|-)\t/.test(l))
  return raw.map((l, i) => {
    const [meta = '', ...paths] = l.split('\t')
    const status = (meta.split(' ').pop() ?? '?').charAt(0) || '?'
    const two = (status === 'R' || status === 'C') && paths.length > 1
    const n = nums[i]?.split('\t')
    const num = (v: string | undefined) => (v === undefined || v === '-' ? null : Number(v))
    return { status, path: (two ? paths[1] : paths[0]) ?? '', from: two ? paths[0] ?? null : null, add: num(n?.[0]), del: num(n?.[1]) }
  })
}

// --- the tree ---

type Dir = { dirs: Map<string, Dir>; files: string[]; count: number }
const newDir = (): Dir => ({ dirs: new Map(), files: [], count: 0 })

// The rows drawn: each folder (its file count) and, when open, what is in it - folders
// first, then files, by name.
export function treeRows(files: string[], open: readonly string[]): { rows: TreeRow[]; more: number } {
  const root = newDir()
  for (const f of files) {
    const parts = f.split('/')
    let d = root
    d.count++
    for (const p of parts.slice(0, -1)) {
      let next = d.dirs.get(p)
      if (!next) { next = newDir(); d.dirs.set(p, next) }
      d = next
      d.count++
    }
    d.files.push(parts[parts.length - 1]!)
  }
  const isOpen = new Set(open)
  const rows: TreeRow[] = []
  let more = 0
  const push = (r: TreeRow) => { if (rows.length < MAX_TREE) rows.push(r); else more++ }
  const walk = (d: Dir, at: string, depth: number) => {
    for (const name of [...d.dirs.keys()].sort()) {
      const sub = d.dirs.get(name)!
      const path = at + name
      push({ path, name, depth, dir: true, count: sub.count })
      if (isOpen.has('xd:' + path)) walk(sub, path + '/', depth + 1)
    }
    for (const name of [...d.files].sort()) push({ path: at + name, name, depth, dir: false, count: 0 })
  }
  walk(root, '', 0)
  return { rows, more }
}

// The file list read: its count, and the tree's rows when the Files section is open.
export function withFiles(x: Explorer, files: string[]): Explorer {
  const t = x.open.includes(FILES) ? treeRows(files, x.open) : { rows: [], more: 0 }
  return { ...x, files: files.length, tree: t.rows, treeMore: t.more }
}

export const withLog = (x: Explorer, out: string): Explorer => {
  const commits = parseLog(out)
  const keep = new Set(commits.map(c => c.sha))
  const changes = Object.fromEntries(Object.entries(x.changes).filter(([k]) => keep.has(k)))
  return { ...x, commits, changes }
}

export function withChanges(x: Explorer, sha: string, out: string): Explorer {
  if (!x.open.includes('xc:' + sha)) return x               // closed meanwhile: not held
  const all = parseChanges(out)
  return { ...x, changes: { ...x.changes, [sha]: { list: all.slice(0, MAX_CHANGES), more: Math.max(0, all.length - MAX_CHANGES) } } }
}

export const withError = (x: Explorer, error: string | null): Explorer => ({ ...x, error })

// What toggling an item needs read next: the file list (the tree's rows), a commit's
// changes, or nothing. A file is no group: it only selects.
export type Need = { files: boolean; sha: string | null }
export function toggle(x: Explorer, item: string): { x: Explorer; need: Need } {
  const none: Need = { files: false, sha: null }
  if (item.startsWith('xf:')) return { x: { ...x, selected: item }, need: none }
  const open = toggleGroup(x.open, item)
  const opened = open.includes(item)
  let y: Explorer = { ...x, open, selected: item }
  if (item === FILES || item.startsWith('xd:')) {
    // a folder closed: its open sub-folders close with it
    if (!opened && item.startsWith('xd:')) y = { ...y, open: open.filter(o => !o.startsWith(item + '/')) }
    if (item === FILES && !opened) y = { ...y, tree: [], treeMore: 0 }
    return { x: y, need: { files: opened || item !== FILES, sha: null } }
  }
  if (item.startsWith('xc:')) {
    const sha = item.slice(3)
    if (!opened) {
      const { [sha]: _gone, ...rest } = y.changes
      return { x: { ...y, changes: rest }, need: none }
    }
    return { x: y, need: { files: false, sha: isSha(sha) ? sha : null } }
  }
  return { x: y, need: none }
}

// --- the lines drawn ---

export type ExLine = { key: string; item: string | null; segs: Seg[] }

const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const STATUS_COLOR: Record<string, Color> = { A: 'success', M: 'warning', D: 'error', R: 'suggestion', C: 'suggestion' }

function itemsOf(x: Explorer): string[] {
  const out = [FILES]
  if (x.open.includes(FILES)) out.push(...x.tree.map(r => (r.dir ? 'xd:' : 'xf:') + r.path))
  out.push(COMMITS)
  if (x.open.includes(COMMITS)) out.push(...(x.commits ?? []).map(c => 'xc:' + c.sha))
  return out
}

// The selection in force: the stored one while drawn, else the first item.
export const selectedOf = (x: Explorer): string => {
  const items = itemsOf(x)
  return x.selected && items.includes(x.selected) ? x.selected : items[0]!
}

export function explorerLines(x: Explorer, cols: number): ExLine[] {
  const sel = selectedOf(x)
  const out: ExLine[] = []
  const line = (item: string, lead: string, segs: Seg[]) => {
    const on = item === sel
    out.push({ key: item, item, segs: [{ text: lead }, ...segs.map(s => (on ? { ...s, inverse: true } : s))] })
  }
  const head = (item: string, title: string, n: number | null) =>
    line(item, '', [{ text: cut(`${x.open.includes(item) ? '▾' : '▸'} ${title}${n === null ? '' : ` (${n})`}`, cols - 1), bold: true }])

  if (x.error) out.push({ key: 'xerr', item: null, segs: [{ text: cut(x.error, cols - 1), color: 'error' }] })
  head(FILES, 'Files', x.files)
  if (x.open.includes(FILES)) {
    if (x.files === null) out.push({ key: 'xtree:none', item: null, segs: [{ text: '  reading git ls-files…', dim: true }] })
    else if (!x.files) out.push({ key: 'xtree:none', item: null, segs: [{ text: '  no tracked files', dim: true }] })
    for (const r of x.tree) {
      const lead = '  ' + '  '.repeat(r.depth)
      if (r.dir) line('xd:' + r.path, lead, [{ text: cut(`${x.open.includes('xd:' + r.path) ? '▾' : '▸'} ${r.name}/ (${r.count})`, cols - lead.length - 1) }])
      else line('xf:' + r.path, lead + '  ', [{ text: cut(r.name, cols - lead.length - 3) }])
    }
    if (x.treeMore) out.push({ key: 'xtree:more', item: null, segs: [{ text: `  … ${x.treeMore} more rows - close a folder`, dim: true }] })
  }
  head(COMMITS, 'Commits', x.commits ? x.commits.length : null)
  if (x.open.includes(COMMITS)) {
    if (!x.commits) out.push({ key: 'xlog:none', item: null, segs: [{ text: '  reading git log…', dim: true }] })
    else if (!x.commits.length) out.push({ key: 'xlog:none', item: null, segs: [{ text: '  no commits yet', dim: true }] })
    for (const c of x.commits ?? []) {
      const glyph = x.open.includes('xc:' + c.sha) ? '▾' : '▸'
      const fixed = `${glyph} ${c.short}  ${c.date}  `
      line('xc:' + c.sha, '  ', [{ text: `${glyph} ` }, { text: c.short, color: 'warning' }, { text: `  ${c.date}  `, dim: true },
        { text: cut(c.subject, Math.max(4, cols - 3 - fixed.length)) }])
      const ch = x.changes[c.sha]
      if (!x.open.includes('xc:' + c.sha)) continue
      if (!ch) { out.push({ key: `xch:${c.sha}:none`, item: null, segs: [{ text: '      reading…', dim: true }] }); continue }
      if (!ch.list.length) out.push({ key: `xch:${c.sha}:none`, item: null, segs: [{ text: '      no files changed', dim: true }] })
      ch.list.forEach((f, i) => {
        const counts = f.add === null || f.del === null ? 'binary' : `+${f.add} -${f.del}`
        const name = f.from ? `${f.from} → ${f.path}` : f.path
        const room = Math.max(4, cols - 1 - 9 - 2 - counts.length)
        const segs: Seg[] = [{ text: '      ' }, { text: f.status, color: STATUS_COLOR[f.status] ?? 'inactive' }, { text: '  ' + cut(name, room) + '  ' }]
        segs.push(...(f.add === null || f.del === null ? [{ text: counts, dim: true }]
          : [{ text: `+${f.add}`, color: 'success' as Color }, { text: ' ' }, { text: `-${f.del}`, color: 'error' as Color }]))
        out.push({ key: `xch:${c.sha}:${i}`, item: null, segs })
      })
      if (ch.more) out.push({ key: `xch:${c.sha}:more`, item: null, segs: [{ text: `      … ${ch.more} more files`, dim: true }] })
    }
  }
  return out
}

// up/down: the next item in drawn order, or none at an end.
export function moveSel(x: Explorer, by: number): string | null {
  const items = itemsOf(x)
  return items[items.indexOf(selectedOf(x)) + by] ?? null
}

// The first line of the window that keeps `item` in view, or null when it shows. `lead`:
// the lines drawn above the tab's own (the tab bar and its gap in the pane).
export function explorerOffset(lines: ExLine[], item: string, top: number, bodyRows: number, lead: string[] = []): number | null {
  const m = { lines: [...lead, ...lines.map(l => (l.item ? 'row:' + l.item : l.key))].map(key => ({ key, rows: 1 })) } as Pick<Model, 'lines'> as Model
  return offsetFor(m, item, top, bodyRows)
}
