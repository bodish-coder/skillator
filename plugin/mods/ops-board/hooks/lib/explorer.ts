import type { Color } from 'claude-code'
import type { Action, ActionKind, Change, Commit, Explorer, StatusBadge, TreeRow, WorkTreeFile } from '../../types'
import type { Seg } from './bandlines'
import { clean } from './bandlines'
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
// F103: 'xs:incoming' and 'xi:<sha>' - the upstream's commits HEAD has not (after a fetch
// the objects are local, so they open to their changes as local commits do).

export const FILES = 'xs:files'
export const COMMITS = 'xs:commits'
export const INCOMING = 'xs:incoming'
export const CHANGES = 'xs:changes'
export const xwItem = (path: string) => 'xw:' + path
export const LOG_N = 40                 // the commits listed: the newest LOG_N
export const MAX_TREE = 2000            // tree rows drawn at most (a folder of 50k files)
export const MAX_CHANGES = 300          // a commit's files drawn at most
export const NO_GIT = 'git not found on PATH (absolute entries only)'

export type { Action, ActionKind, Change, Commit, Explorer, StatusBadge, TreeRow, WorkTreeFile } from '../../types'
export const EMPTY: Explorer = { open: [], selected: null, files: null, tree: [], treeMore: 0, commits: null, changes: {}, error: null,
  upstream: null, incoming: null, worktree: null }

// --- git's words: argv after the git binary. No shell; paths never quoted (-z, quotePath off). ---

export const LS_ARGS = ['ls-files', '-z']
export const STATUS_ARGS = ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-uall']
export const OUTGOING_ARGS = ['log', '@{upstream}..HEAD', '--oneline']
export const LOG_ARGS = ['-c', 'core.quotePath=false', 'log', `-n${LOG_N}`, '--date=short', '--format=%H%x1f%h%x1f%ad%x1f%an%x1f%s']
// With both, --name-status wins and --numstat is dropped: --raw carries the same A/M/D/R
// status and comes first, the numstat lines follow in the same order. A merge: against
// its first parent.
export const isSha = (s: string) => /^[0-9a-f]{7,64}$/.test(s)
export const changeArgs = (sha: string) =>
  ['-c', 'core.quotePath=false', 'log', '-1', '-m', '--first-parent', '--format=', '--raw', '--numstat', '-M', sha]

// F103: read-only - the upstream's name (exit 128: none), ahead/behind, the incoming log.
export const UPSTREAM_ARGS = ['rev-parse', '--abbrev-ref', '@{upstream}']
export const COUNT_ARGS = ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']   // "A\tB": ahead A, behind B
export const INCOMING_ARGS = [...LOG_ARGS, 'HEAD..@{upstream}']
export const BRANCH_ARGS = ['branch', '--show-current']   // unborn: branch name; detached: empty
export const DIRTY_ARGS = ['status', '--porcelain', '--untracked-files=no']
export const BRANCHES_ARGS = ['branch', '--format=%(refname:short)']
export const HEAD_ARGS = ['rev-parse', 'HEAD']
export const GIT_DIR_ARGS = ['rev-parse', '--absolute-git-dir']
// the branch's upstream remote and its ref there ("origin\trefs/heads/main"; "\t": none)
export const pushToArgs = (branch: string) => ['for-each-ref', '--format=%(upstream:remotename)%09%(upstream:remoteref)', 'refs/heads/' + branch]
export const stageArgs = (path: string) => ['add', '--', path]
export const unstageArgs = (path: string) => ['reset', 'HEAD', '--', path]
// in the git dir while a merge, revert, cherry-pick or rebase is stopped (a rebase at an edit step has a clean tree)
export const IN_PROGRESS = ['MERGE_HEAD', 'REVERT_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']

// F103 & F133: the actions. The only source of their argv: never a force flag of any kind.
export const ACTION_ARGS: Record<ActionKind, (target: string, branch?: string) => string[]> = {
  fetch: () => ['fetch', '--prune'],
  pull: () => ['pull', '--ff-only', '--no-rebase'],
  sync: () => ['pull', '--ff-only', '--no-rebase'],
  // an explicit refspec: remote.*.push and remote.*.mirror never widen it (git refuses one with mirror)
  push: (remote, branch = '') => ['push', remote, 'HEAD:refs/heads/' + branch],
  revert: sha => ['revert', '--no-edit', sha],
  merge: branch => ['merge', '--no-edit', '--', branch],     // --: a branch named -n is no option
  commit: msg => ['commit', '-m', msg],
}
const NEEDS_CLEAN: ActionKind[] = ['pull', 'sync', 'merge', 'revert']
export const isRunRef = (ref: string) => /^run\/RUN-\d+/.test(ref) || /\/\.skillator\/worktrees\//.test(ref.replace(/\\/g, '/'))

export type Here = { branch: string; head: string; dirty: number }

// Detect potentially sensitive or unwanted files staged/untracked
export function detectUnwanted(path: string): string | undefined {
  const norm = path.replace(/\\/g, '/')
  const base = norm.split('/').pop() ?? ''
  if (/^\.env(\..+)?$/i.test(base)) return 'environment file (.env)'
  if (/(id_rsa|id_ed25519|\.pem|\.key|\.pfx|\.p12)$/i.test(base)) return 'credential/private key'
  if (/(token|secret|credential|password).*\.(json|txt|ya?ml)$/i.test(base)) return 'possible secret file'
  if (/(^|\/)(scratch|\.tmp|tmp)\//i.test(norm) || /\.(tmp|bak|swp|log)$/i.test(base)) return 'temporary scratch file'
  if (/(^|\/)(dist|build|out|\.next|node_modules)\//i.test(norm) && !norm.startsWith('scripts/build/')) return 'build artifact directory'
  return undefined
}

// Parse git status --porcelain=v1 -uall
export function parseStatus(out: string): import('../../types').WorkTreeFile[] {
  const list: import('../../types').WorkTreeFile[] = []
  for (const line of out.split(/\r?\n/)) {
    if (line.length < 3) continue
    const x = line.charAt(0)
    const y = line.charAt(1)
    let rawPath = line.slice(3).trim()
    if (rawPath.includes(' -> ')) {
      rawPath = rawPath.split(' -> ').pop()!.trim()
    }
    const path = clean(rawPath)
    if (!path) continue
    const isUntracked = x === '?' && y === '?'
    const staged = isUntracked ? null : (x !== ' ' && x !== '?' ? (x as import('../../types').StatusBadge) : null)
    const unstaged = isUntracked ? '?' as const : (y !== ' ' ? (y as import('../../types').StatusBadge) : null)
    const warning = detectUnwanted(path)
    list.push({ path, staged, unstaged, isUntracked, warning })
  }
  return list
}

// AI commit message drafting helper
export function draftCommitMessage(files: import('../../types').WorkTreeFile[], activeTicket?: string): string {
  const staged = files.filter(f => f.staged !== null)
  const target = staged.length > 0 ? staged : files
  if (target.length === 0) return 'chore: working tree changes'

  const paths = target.map(f => f.path)
  let prefix = 'feat'
  if (paths.every(p => p.startsWith('test') || p.includes('.test.') || p.includes('.spec.'))) {
    prefix = 'test'
  } else if (paths.every(p => p.endsWith('.md') || p.startsWith('docs/'))) {
    prefix = 'docs'
  } else if (paths.some(p => p.includes('ticket') || p === 'TICKETS.md')) {
    prefix = 'board'
  } else if (paths.every(p => p.startsWith('scripts/') || p.includes('install.'))) {
    prefix = 'build'
  }

  const first = paths[0]!
  const baseName = first.split('/').pop()?.replace(/\.[^.]+$/, '') ?? first
  const desc = paths.length === 1 ? `update ${baseName}` : `update ${baseName} and ${paths.length - 1} other files`
  if (activeTicket) return `${activeTicket}: ${desc}`
  return `${prefix}: ${desc}`
}

// AI change digest on incoming commits
export function summarizeIncoming(commits: Commit[]): string[] {
  if (commits.length === 0) return ['Up to date with upstream.']
  const digest: string[] = []
  const count = commits.length
  digest.push(`${count} new commit${count === 1 ? '' : 's'} from upstream:`)
  for (const c of commits.slice(0, 3)) {
    digest.push(`• ${c.short} ${c.subject} (${c.author})`)
  }
  if (count > 3) {
    digest.push(`• … and ${count - 3} more commits`)
  }
  return digest
}

// AI pre-push audit
export function auditOutgoing(out: string): { count: number; warnings: string[] } {
  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const warnings: string[] = []
  if (lines.length === 0) return { count: 0, warnings: ['No outgoing commits to push.'] }
  for (const l of lines) {
    if (/wip|temp|test\s*commit|scratch/i.test(l)) {
      warnings.push(`Commit "${l}" appears to be a temporary or WIP commit`)
    }
    if (/fixup!|squash!/i.test(l)) {
      warnings.push(`Commit "${l}" is a fixup/squash marker`)
    }
  }
  return { count: lines.length, warnings }
}

// The plan: the action with its argv and warnings, or why it is refused. ctx: read just before
// (branch 'HEAD': detached; inProgress: the IN_PROGRESS marker found; pushTo: pushToArgs read).
export function planAction(x: Explorer, kind: ActionKind, ctx: Here & { root: string; branches?: string[]; inProgress?: string | null
  pushTo?: { remote: string; ref: string }; activeTicket?: string; outgoing?: string; warn?: string[] }): { action: Action } | { refused: string } {
  const sel = x.selected ?? ''
  // a local commit only: an incoming one is not in HEAD's history, there is nothing to revert
  if (kind === 'revert' && !sel.startsWith('xc:')) return { refused: 'select a commit first' }
  if (kind !== 'fetch' && ctx.branch === 'HEAD') return { refused: `HEAD is detached - git ${kind} needs a branch; check one out first` }
  if (kind !== 'fetch' && ctx.inProgress)
    return { refused: `${ctx.inProgress} exists in the git dir - a merge, revert, cherry-pick or rebase is in progress; finish it or --abort it first` }
  if (NEEDS_CLEAN.includes(kind) && ctx.dirty > 0)
    return { refused: `working tree has ${ctx.dirty} uncommitted changes - git would refuse or stop half way; commit or stash first` }

  const on = { result: null, branch: ctx.branch, head: ctx.head }

  if (kind === 'commit') {
    const staged = (x.worktree ?? []).filter(f => f.staged !== null)
    if (staged.length === 0) return { refused: 'nothing staged to commit - toggle files with Space first' }
    const draft = draftCommitMessage(x.worktree ?? [], ctx.activeTicket)
    const warned = staged.filter(f => !!f.warning).map(f => `${f.path} (${f.warning})`)
    const warn = [...(ctx.warn ?? [])]
    if (warned.length > 0) warn.push(`⚠ staging ${warned.length} sensitive/unwanted file(s): ${warned.join(', ')}`)
    return { action: { kind, args: ACTION_ARGS.commit(draft), warn, pick: null, message: draft, files: staged, ...on } }
  }

  if (kind === 'sync' || kind === 'pull') {
    const digest = summarizeIncoming(x.incoming ?? [])
    const warn = [...(ctx.warn ?? [])]
    if (x.upstream && typeof x.upstream === 'object' && x.upstream.ahead > 0 && x.upstream.behind > 0) {
      warn.push(`diverged from upstream: ↑${x.upstream.ahead} ↓${x.upstream.behind} - fast-forward will fail; merge or rebase required`)
    }
    return { action: { kind, args: ACTION_ARGS[kind](''), warn, pick: null, digest, ...on } }
  }

  const to = ctx.pushTo
  if (((kind === 'push') && x.upstream === 'none') || (kind === 'push' && !(to?.remote && to.ref.startsWith('refs/heads/'))))
    return { refused: `no upstream for ${ctx.branch} - git push -u origin ${ctx.branch} by hand sets one` }
  if (kind === 'push' && to!.remote.startsWith('-'))
    return { refused: `remote ${to!.remote} starts with - - git push would read it as an option; rename the remote` }

  const warn: string[] = [...(ctx.warn ?? [])]
  if (isRunRef(ctx.branch)) warn.push(`on relay run branch ${ctx.branch} - runs land through relay-morpheus; continue only if you mean it`)
  if (isRunRef(ctx.root)) warn.push(`this checkout is a run worktree (${ctx.root})`)

  if (kind === 'push') {
    const audit = ctx.outgoing ? auditOutgoing(ctx.outgoing) : null
    if (audit?.warnings?.length) warn.push(...audit.warnings)
    return { action: { kind, args: ACTION_ARGS.push(to!.remote, to!.ref.slice('refs/heads/'.length)), warn, pick: null, auditWarning: audit?.warnings?.join('; '), ...on } }
  }

  if (kind === 'merge') {
    return { action: { kind, args: [], warn, pick: (ctx.branches ?? []).filter(b => b !== ctx.branch && !b.startsWith('(')), conflictAi: true, ...on } }
  }
  const args = ACTION_ARGS[kind](sel.slice(3))
  return { action: { kind, args, warn, pick: null, ...on } }
}

// Run: why the plan no longer stands (the branch or HEAD moved, or the tree turned dirty since the confirm opened), or null.
export function staleAction(a: Action, now: Here): string | null {
  if (now.branch !== a.branch) return `the branch changed (${a.branch} → ${now.branch}) since the confirm opened`
  if (now.head !== a.head) return 'HEAD moved since the confirm opened'
  if (NEEDS_CLEAN.includes(a.kind) && now.dirty > 0) return `working tree has ${now.dirty} uncommitted changes now`
  return null
}

// Merge: the branch picked fills the argv; a run branch is warned.
export const pickBranch = (a: Action, name: string): Action =>
  ({ ...a, args: ACTION_ARGS.merge(name), pick: null, warn: isRunRef(name) ? [...a.warn, `${name} is a run branch`] : a.warn })

// A154: names and subjects clean()ed as they are parsed, so what explorerLines() measures
// and cuts is what is drawn.
export const parseFiles = (out: string) => out.split('\0').map(s => clean(s.replace(/^\n+/, ''))).filter(Boolean)

export function parseLog(out: string): Commit[] {
  const cs: Commit[] = []
  for (const l of out.split(/\r?\n/)) {
    const [sha, short, date, author, ...rest] = l.split('\x1f').map(clean)
    if (sha && isSha(sha) && short !== undefined) cs.push({ sha, short, date: date ?? '', author: author ?? '', subject: rest.join('') })
  }
  return cs
}

export function parseChanges(out: string): Change[] {
  const lines = out.split(/\r?\n/)
  const raw = lines.filter(l => l.startsWith(':'))
  const nums = lines.filter(l => /^(\d+|-)\t(\d+|-)\t/.test(l))
  return raw.map((l, i) => {
    const [meta = '', ...paths] = l.split('\t').map(clean)
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

// Only the changes of listed commits are held: local and incoming share the map.
const held = (x: Explorer): Explorer => {
  const keep = new Set([...(x.commits ?? []), ...(x.incoming ?? [])].map(c => c.sha))
  return { ...x, changes: Object.fromEntries(Object.entries(x.changes).filter(([k]) => keep.has(k))) }
}

export const withLog = (x: Explorer, out: string): Explorer => held({ ...x, commits: parseLog(out) })

export const parseCount = (out: string): { ahead: number; behind: number } | null => {
  const m = /^(\d+)\t(\d+)\s*$/.exec(out)
  return m ? { ahead: Number(m[1]), behind: Number(m[2]) } : null
}

// name null: no upstream. Not behind: nothing incoming is held.
export function withUpstream(x: Explorer, name: string | null, count: string | null): Explorer {
  const c = name === null ? null : parseCount(count ?? '')
  const y = { ...x, upstream: name === null ? 'none' as const : c ? { name, ...c } : null }
  return hasIncoming(y) ? y : held({ ...y, incoming: null })
}

export const withIncoming = (x: Explorer, out: string): Explorer => held({ ...x, incoming: parseLog(out).slice(0, LOG_N) })

export function withChanges(x: Explorer, sha: string, out: string): Explorer {
  if (!x.open.includes('xc:' + sha) && !x.open.includes('xi:' + sha)) return x   // closed meanwhile: not held
  const all = parseChanges(out)
  return { ...x, changes: { ...x.changes, [sha]: { list: all.slice(0, MAX_CHANGES), more: Math.max(0, all.length - MAX_CHANGES) } } }
}

export const withError = (x: Explorer, error: string | null): Explorer => ({ ...x, error })
export const withWorktree = (x: Explorer, worktree: WorkTreeFile[]): Explorer => ({ ...x, worktree })

// What toggling an item needs read next: the file list (the tree's rows), a commit's
// changes, or nothing. A file is no group: it only selects.
export type Need = { files: boolean; sha: string | null; stagePath?: string | null }
export function toggle(x: Explorer, item: string): { x: Explorer; need: Need } {
  const none: Need = { files: false, sha: null }
  if (item === CHANGES) {
    const open = toggleGroup(x.open, CHANGES)
    return { x: { ...x, open, selected: item }, need: none }
  }
  if (item.startsWith('xw:')) {
    const stagePath = item.slice(3)
    return { x: { ...x, selected: item }, need: { files: false, sha: null, stagePath } }
  }
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
  if (item.startsWith('xc:') || item.startsWith('xi:')) {
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
const STATUS_COLOR: Record<string, Color> = { A: 'success', M: 'warning', D: 'error', R: 'suggestion', C: 'suggestion', '?': 'inactive', U: 'error' }

const hasIncoming = (x: Explorer) => typeof x.upstream === 'object' && !!x.upstream && x.upstream.behind > 0
export const hasChanges = (x: Explorer) => !!(x.worktree && x.worktree.length > 0)

function itemsOf(x: Explorer): string[] {
  const out: string[] = []
  if (hasChanges(x)) {
    out.push(CHANGES)
    if (x.open.includes(CHANGES)) {
      out.push(...x.worktree!.map(w => xwItem(w.path)))
    }
  }
  out.push(FILES)
  if (x.open.includes(FILES)) out.push(...x.tree.map(r => (r.dir ? 'xd:' : 'xf:') + r.path))
  out.push(COMMITS)
  if (x.open.includes(COMMITS)) out.push(...(x.commits ?? []).map(c => 'xc:' + c.sha))
  if (hasIncoming(x)) {
    out.push(INCOMING)
    if (x.open.includes(INCOMING)) out.push(...(x.incoming ?? []).map(c => 'xi:' + c.sha))
  }
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
  const head = (item: string, title: string, n: number | null, tail = '') =>
    line(item, '', [{ text: cut(`${x.open.includes(item) ? '▾' : '▸'} ${title}${n === null ? '' : ` (${n})`}`, cols - 1), bold: true },
      ...(tail ? [{ text: tail, dim: true }] : [])])
  const commitRows = (pre: string, list: Commit[]) => {
    for (const c of list) {
      const glyph = x.open.includes(pre + c.sha) ? '▾' : '▸'
      const fixed = `${glyph} ${c.short}  ${c.date}  `
      line(pre + c.sha, '  ', [{ text: `${glyph} ` }, { text: c.short, color: 'warning' }, { text: `  ${c.date}  `, dim: true },
        { text: cut(c.subject, Math.max(4, cols - 3 - fixed.length)) }])
      const ch = x.changes[c.sha]
      if (!x.open.includes(pre + c.sha)) continue
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

  if (x.error) out.push({ key: 'xerr', item: null, segs: [{ text: cut(x.error, cols - 1), color: 'error' }] })
  if (hasChanges(x)) {
    const stagedCount = x.worktree!.filter(f => f.staged !== null).length
    const unstagedCount = x.worktree!.filter(f => f.unstaged !== null).length
    const tail = `  staged ${stagedCount} · unstaged ${unstagedCount}`
    head(CHANGES, 'Changes', x.worktree!.length, tail)
    if (x.open.includes(CHANGES)) {
      for (const f of x.worktree!) {
        const itemKey = xwItem(f.path)
        const isStaged = f.staged !== null
        const isPartiallyStaged = f.staged !== null && f.unstaged !== null
        const dot = isPartiallyStaged ? '◑' : (isStaged ? '●' : '○')
        const badge = f.staged && f.unstaged ? `${f.staged}/${f.unstaged}` : (f.staged ?? f.unstaged ?? '?')
        const badgeColor = STATUS_COLOR[f.staged ?? f.unstaged ?? '?'] ?? 'inactive'
        const warnIcon = f.warning ? ' ⚠' : ''
        const room = Math.max(4, cols - 1 - 10 - warnIcon.length)
        const segs: Seg[] = [
          { text: `${dot} [` },
          { text: badge, color: badgeColor, bold: true },
          { text: '] ' },
          { text: cut(f.path, room) },
        ]
        if (f.warning) {
          segs.push({ text: warnIcon, color: 'warning' })
        }
        line(itemKey, '  ', segs)
      }
    }
  }
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
  const up = x.upstream
  head(COMMITS, 'Commits', x.commits ? x.commits.length : null,
    up === 'none' ? '  no upstream' : up ? `  ↑${up.ahead} ↓${up.behind} vs ${up.name}` : '')
  if (x.open.includes(COMMITS)) {
    if (!x.commits) out.push({ key: 'xlog:none', item: null, segs: [{ text: '  reading git log…', dim: true }] })
    else if (!x.commits.length) out.push({ key: 'xlog:none', item: null, segs: [{ text: '  no commits yet', dim: true }] })
    commitRows('xc:', x.commits ?? [])
  }
  if (hasIncoming(x)) {
    head(INCOMING, 'Incoming', x.incoming ? x.incoming.length : null)
    if (x.open.includes(INCOMING)) commitRows('xi:', x.incoming ?? [])
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
