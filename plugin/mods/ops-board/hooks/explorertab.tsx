import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import { clean } from './lib/bandlines'
import { gitBin } from './lib/host'
import { BRANCH_ARGS, BRANCHES_ARGS, changeArgs, COUNT_ARGS, DIRTY_ARGS, EMPTY, explorerLines, explorerOffset, GIT_DIR_ARGS, HEAD_ARGS,
  IN_PROGRESS, INCOMING_ARGS, LOG_ARGS, LS_ARGS, moveSel, NO_GIT, parseFiles, pickBranch, planAction, pushToArgs, selectedOf, staleAction, toggle,
  UPSTREAM_ARGS, withChanges, withError, withFiles, withIncoming, withLog, withUpstream } from './lib/explorer'
import type { Action, ActionKind, Explorer, Here, Need } from './lib/explorer'

// F75: the Explorer tab - the git-tracked files as a tree, the newest commits each
// opening to what it changed (lib/explorer.ts). git ls-files and git log, run by the
// mod's absolute git (A150, host.ts gitBin) in the repo. $.state holds only what is
// drawn (B4); the file list itself stays in this module, read again on entering the
// tab and on r. F103: fetch/pull/push/revert/merge, each only after a confirm drawn in
// place of the tab that names the exact argv run (ACTION_ARGS).

const explorerA = atom({ plugin: 'ops-board', key: 'explorer' } as const, EMPTY)
const actionA = atom({ plugin: 'ops-board', key: 'explorer-action' } as const, null)
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')
const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

let files: string[] | null = null          // the last git ls-files, this load

type Git = { ok: true; out: string; said: string; cut: boolean } | { ok: false; err: string; code: number | null }

async function git($: EngineInterface, name: string, args: string[], timeoutMs = 15000, env?: Record<string, string>): Promise<Git> {
  const repo = await $.session.repo()
  if (!repo) return { ok: false, err: 'not a git repo - nothing to explore', code: null }
  const bin = await gitBin($)
  if (!bin) return { ok: false, err: NO_GIT, code: null }
  const t0 = Date.now()
  try {
    const r = await $.process.run([bin, ...args], { cwd: repo.root, timeoutMs, env })
    // both streams: git says CONFLICT on stdout, hints and fatals on stderr
    const said = [r.stderr.trim(), r.stdout.trim()].filter(Boolean).join('\n') || 'exit ' + r.exitCode
    if (r.exitCode !== 0) return { ok: false, err: `git ${name} failed: ${said}`, code: r.exitCode }
    return { ok: true, out: r.stdout, said: r.stderr, cut: r.isStdoutTruncated }
  } catch (e) {
    const said = errText(e)
    // the host kills git at the timeout: a write it was making can leave the index lock behind
    if (Date.now() - t0 >= timeoutMs || /timed? ?out/i.test(said))
      return { ok: false, err: `git ${name} timed out after ${timeoutMs / 1000}s - .git/index.lock may be left; remove it once no git runs`, code: null }
    return { ok: false, err: `git ${name} failed: ${said}`, code: null }
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// The file list; a list the host cut short loses its last (partial) name and says so.
async function readFiles($: EngineInterface): Promise<{ list: string[] | null; err: string | null }> {
  const r = await git($, 'ls-files', LS_ARGS)
  if (!r.ok) return { list: null, err: r.err }
  const list = parseFiles(r.out)
  if (r.cut) list.pop()
  files = list
  return { list, err: r.cut ? 'git ls-files: the list was cut by the host - the tree is partial' : null }
}

// Entering the tab, /ops explorer and r: the file list and the log read again; the
// open folders and commits stay, an open commit's files are read again.
export async function enterExplorer($: EngineInterface): Promise<void> {
  const f = await readFiles($)
  const log = await git($, 'log', LOG_ARGS)
  // F103: the upstream, read-only (no fetch): exit 128 is no upstream, any other failure leaves it unread
  const up = await git($, 'rev-parse', UPSTREAM_ARGS)
  const count = up.ok ? await git($, 'rev-list', COUNT_ARGS) : null
  const inc = up.ok ? await git($, 'log', INCOMING_ARGS) : null
  const errs = [f.err, log.ok ? null : log.err].filter((e): e is string => !!e)
  await update($, explorerA, x => {
    let y = f.list ? withFiles(x, f.list) : x
    if (log.ok) y = withLog(y, log.out)
    if (up.ok) y = withUpstream(y, up.out.trim(), count?.ok ? count.out : null)
    else if (up.code === 128) y = withUpstream(y, null, null)
    else y = { ...y, upstream: null, incoming: null }             // unread: no stale arrows drawn
    if (inc?.ok) y = withIncoming(y, inc.out)
    return withError(y, [...new Set(errs)].join('; ') || null)   // git missing: said once
  })
  const x = await read($, explorerA)
  for (const sha of Object.keys(x.changes)) await readChanges($, sha)
}

async function readChanges($: EngineInterface, sha: string) {
  const r = await git($, 'log', changeArgs(sha))
  await update($, explorerA, x => (r.ok ? withChanges(x, sha, r.out) : withError(x, r.err)))
}

// Enter or a click: a section, folder or commit opens or closes; what it then shows is read.
export async function toggleExplorer($: EngineInterface, item: string): Promise<void> {
  let need: Need = { files: false, sha: null }
  await update($, explorerA, x => { const t = toggle(x, item); need = t.need; return t.x })
  if (need.files) {
    const list = files ?? (await readFiles($)).list
    if (list) await update($, explorerA, x => withFiles(x, list))
  }
  if (need.sha) await readChanges($, need.sha)
}

export const isExplorerItem = (el: string) => /^x[sdfci]:/.test(el)

// The focus ring landing on an item selects it (Tab / shift-Tab).
export async function focusExplorer($: EngineInterface, el: string): Promise<void> {
  await update($, explorerA, x => ({ ...x, selected: el }))
}

// An arrow on the pane: the selection moves one item; the window follows only when the
// item would leave it. undefined: no item that way (the engine scrolls); null: in view.
export async function arrowExplorer($: EngineInterface, by: number, top: number, bodyRows: number, cols: number): Promise<number | null | undefined> {
  const x = await read($, explorerA)
  const to = moveSel(x, by)
  if (!to) return undefined
  await update($, explorerA, y => ({ ...y, selected: to }))
  void $.ui.focus({ requestId: 'ops-board', key: to }).catch(() => {})   // the ring follows, as on Tickets
  return explorerOffset(explorerLines({ ...x, selected: to }, cols), to, top, bodyRows, ['tabs', 'gap'])
}

export async function readExplorer($: EngineInterface): Promise<Explorer> {
  return read($, explorerA)
}

// --- F103: the git actions, each behind its confirm ---

const lines = (r: Git | null) => (r?.ok ? r.out.split(/\r?\n/).filter(Boolean) : [])

// What a plan stands on: the branch ('HEAD': detached), HEAD's sha ('' before the first commit), tracked changes.
async function readHere($: EngineInterface): Promise<Here | { err: string }> {
  const branch = await git($, 'branch', BRANCH_ARGS)
  const head = await git($, 'rev-parse', HEAD_ARGS)
  const dirty = await git($, 'status', DIRTY_ARGS)
  const failed = [branch, dirty].find(r => !r.ok)
  if (failed && !failed.ok) return { err: failed.err }
  return { branch: lines(branch)[0] ?? 'HEAD', head: lines(head)[0] ?? '', dirty: lines(dirty).length }
}

// A key: what the plan needs read now (branch, HEAD, tracked changes, branches, upstream,
// git-dir markers, root), then the plan - refused in a toast, or the confirm up, Esc its Cancel.
export async function openAction($: EngineInterface, kind: ActionKind): Promise<void> {
  if (running) { $.ui.toast(`■ git ${running} is still running`); return }
  const here = await readHere($)
  if ('err' in here) { $.ui.toast('■ ' + here.err); return }
  const branches = kind === 'merge' ? await git($, 'branch', BRANCHES_ARGS) : null
  // push/pull: the upstream read now, not as last drawn (one set by hand since counts)
  const up = kind === 'push' || kind === 'pull' ? await git($, 'rev-parse', UPSTREAM_ARGS) : null
  const to = kind === 'push' && here.branch !== 'HEAD' ? await git($, 'for-each-ref', pushToArgs(here.branch)) : null
  const gitDir = kind !== 'fetch' ? await git($, 'rev-parse', GIT_DIR_ARGS) : null
  const failed = [branches, to, gitDir].find(r => r && !r.ok)
  if (failed && !failed.ok) { $.ui.toast('■ ' + failed.err); return }
  let inProgress: string | null = null
  const dir = lines(gitDir)[0]
  for (const m of IN_PROGRESS) if (dir && !inProgress && await $.fs.exists(dir + '/' + m)) inProgress = m
  const [remote = '', ref = ''] = to?.ok ? to.out.trim().split('\t') : []
  const x = await read($, explorerA)
  const upstream = up && !up.ok && up.code === 128 ? 'none' as const : up ? null : x.upstream
  const p = planAction({ ...x, upstream, selected: selectedOf(x) }, kind, {
    ...here, root: (await $.session.repo())?.root ?? '', branches: lines(branches), inProgress, pushTo: { remote, ref } })
  if ('refused' in p) { $.ui.toast('■ ' + p.refused); return }
  await update($, actionA, () => p.action)
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  const first = p.action.pick?.[0]
  void $.ui.focus({ requestId: PANE, key: first ? 'xb:' + first : p.action.args.length ? 'xa:go' : 'xa:cancel' }).catch(() => {})
}

let running: string | null = null          // the action's argv while git runs: one at a time

async function pickAction($: EngineInterface, name: string): Promise<void> {
  await update($, actionA, a => (a ? pickBranch(a, name) : a))
  void $.ui.focus({ requestId: PANE, key: 'xa:go' }).catch(() => {})
}

// Run: the argv shown is the argv run (bin aside); git's own words said, a conflict left as git left it.
export async function actionGo($: EngineInterface): Promise<void> {
  if (running) return                       // a second Run press, or one while git runs
  running = '…'
  try {
    const a = await read($, actionA)
    if (!a || !a.args.length) return
    await cancelAction($)
    // the plan as shown still stands: nothing moved while the confirm was up
    const here = await readHere($)
    const why = 'err' in here ? here.err : staleAction(a, here)
    if (why) { $.ui.toast(`■ ${why} - nothing run`); return }
    const cmd = a.args.join(' ')
    running = cmd
    // fetch/pull/push talk to a remote; a credential prompt (terminal or GCM window) would wait unseen until the timeout
    const r = await git($, cmd, a.args, 120000, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })
    if (r.ok) $.ui.toast(`✓ git ${cmd}: ${(r.out.trim() || r.said.trim()).split(/\r?\n/)[0] || 'done'}`)
    else {
      const stopped = (a.kind === 'merge' || a.kind === 'revert') && /CONFLICT/.test(r.err)
        ? ` - ${a.kind} stopped on conflict: resolve by hand, or git ${a.kind} --abort` : ''
      $.ui.toast(`■ ${r.err.split(/\r?\n/).slice(0, 3).join(' ')}${stopped}`)
    }
  } finally {
    running = null
  }
  await enterExplorer($)
}

// Cancel, Esc: nothing run, the tab back and Esc the pane's own again.
export async function cancelAction($: EngineInterface): Promise<void> {
  if ((await read($, actionA)) === null) return
  await update($, actionA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

// /ops to another tab and an unload: the confirm just goes.
export async function dropAction($: EngineInterface): Promise<void> {
  if ((await read($, actionA)) !== null) await update($, actionA, () => null)
}

export async function isActionUp($: EngineInterface): Promise<boolean> {
  return (await read($, tabA)) === 'explorer' && (await read($, actionA)) !== null
}

export async function readExplorerAction($: EngineInterface): Promise<Action | null> {
  return read($, actionA)
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

// The confirm, drawn in place of the tab (B5: never a second pane).
export function ActionConfirm($: EngineInterface, els: Els, a: Action): RenderElement[] {
  const { Box, Text, Button } = els
  return [
    <Box key="xa:title"><Text bold>{`git ${a.kind}?`}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>,
    <Text> </Text>,
    a.args.length
      ? <Box key="xa:argv" flexDirection="row"><Text dimColor>{'runs    '}</Text><Text wrap="wrap">{'git ' + a.args.join(' ')}</Text></Box>
      : <Text key="xa:pickhead" dimColor>{a.pick?.length ? 'merge which branch into this one?' : 'no other branch to merge'}</Text>,
    <Box key="xa:on" flexDirection="row"><Text dimColor>{'on      '}</Text><Text>{clean(a.branch)}</Text></Box>,
    ...a.warn.map((w, i) => <Box key={'xa:warn:' + i}><Text color="warning" wrap="wrap">{clean(w)}</Text></Box>),
    ...(a.pick ?? []).map(name => <Button key={'xb:' + name} plain onPress={() => { void pickAction($, name).catch(e => { $.ui.toast('■ ' + errText(e)) }) }}>{'  ' + clean(name)}</Button>),
    <Text> </Text>,
    <Box flexDirection="row" gap={4}>
      {a.args.length ? <Button key="xa:go" variant="primary" onPress={() => { void actionGo($).catch(e => { $.ui.toast('■ ' + errText(e)) }) }}>Run</Button> : null}
      <Button key="xa:cancel" onPress={() => { void cancelAction($).catch(e => { $.ui.toast('■ ' + errText(e)) }) }}>Cancel</Button>
    </Box>,
  ]
}

// u = upload (push), v = revert: p/P would differ by Shift alone
const ACTION_KEYS: [ActionKind, string, string][] = [['fetch', 'f', 'fetch'], ['pull', 'p', 'pull'], ['push', 'u', 'push'], ['revert', 'v', 'revert'], ['merge', 'm', 'merge']]

export function ExplorerTab($: EngineInterface, els: Els, x: Explorer, cols: number): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  for (const l of explorerLines(x, cols)) {
    const body = <Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold} inverse={s.inverse}>{clean(s.text)}</Text>)}</Text>
    const item = l.item
    out.push(item
      ? <Button key={item} plain onPress={() => { void toggleExplorer($, item).catch(() => {}) }}>{body}</Button>
      : <Box key={l.key}>{body}</Box>)
  }
  const sel = selectedOf(x)
  out.push(<Text> </Text>)
  out.push(
    <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
      <Text dimColor>{sel.startsWith('xf:') ? '↑↓ move' : '↑↓ move · enter open/close'}</Text>
      {ACTION_KEYS.map(([kind, hotkey, label]) =>
        <Button key={'key:' + kind} plain dimColor hotkey={hotkey} onPress={() => { void openAction($, kind).catch(e => { $.ui.toast('■ ' + errText(e)) }) }}>{label}</Button>)}
      <Button key="key:reload" plain dimColor hotkey="r" onPress={() => { void enterExplorer($).catch(() => {}) }}>reload</Button>
    </Box>,
  )
  return out
}
