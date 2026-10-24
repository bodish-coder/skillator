import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import { gitBin } from './lib/host'
import { changeArgs, EMPTY, explorerLines, explorerOffset, LOG_ARGS, LS_ARGS, moveSel, NO_GIT, parseFiles, selectedOf, toggle,
  withChanges, withError, withFiles, withLog } from './lib/explorer'
import type { Explorer, Need } from './lib/explorer'

// F75: the Explorer tab - the git-tracked files as a tree, the newest commits each
// opening to what it changed (lib/explorer.ts). Read-only: git ls-files and git log, run
// by the mod's absolute git (A150, host.ts gitBin) in the repo. $.state holds only what
// is drawn (B4); the file list itself stays in this module, read again on entering the
// tab and on r.

const explorerA = atom({ plugin: 'ops-board', key: 'explorer' } as const, EMPTY)

let files: string[] | null = null          // the last git ls-files, this load

type Git = { ok: true; out: string; cut: boolean } | { ok: false; err: string }

async function git($: EngineInterface, name: string, args: string[]): Promise<Git> {
  const repo = await $.session.repo()
  if (!repo) return { ok: false, err: 'not a git repo - nothing to explore' }
  const bin = await gitBin($)
  if (!bin) return { ok: false, err: NO_GIT }
  try {
    const r = await $.process.run([bin, ...args], { cwd: repo.root, timeoutMs: 15000 })
    if (r.exitCode !== 0) return { ok: false, err: `git ${name} failed: ${r.stderr.trim() || r.stdout.trim() || 'exit ' + r.exitCode}` }
    return { ok: true, out: r.stdout, cut: r.isStdoutTruncated }
  } catch (e) {
    return { ok: false, err: `git ${name} failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

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
  const errs = [f.err, log.ok ? null : log.err].filter((e): e is string => !!e)
  await update($, explorerA, x => {
    let y = f.list ? withFiles(x, f.list) : x
    if (log.ok) y = withLog(y, log.out)
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

export const isExplorerItem = (el: string) => /^x[sdfc]:/.test(el)

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

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

export function ExplorerTab($: EngineInterface, els: Els, x: Explorer, cols: number): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  for (const l of explorerLines(x, cols)) {
    const body = <Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold} inverse={s.inverse}>{s.text}</Text>)}</Text>
    const item = l.item
    out.push(item
      ? <Button key={item} plain onPress={() => { void toggleExplorer($, item).catch(() => {}) }}>{body}</Button>
      : <Box key={l.key}>{body}</Box>)
  }
  const sel = selectedOf(x)
  out.push(<Text> </Text>)
  out.push(
    <Box key="keys" flexDirection="row" gap={2}>
      <Text dimColor>{sel.startsWith('xf:') ? '↑↓ move' : '↑↓ move · enter open/close'}</Text>
      <Button key="key:reload" plain dimColor hotkey="r" onPress={() => { void enterExplorer($).catch(() => {}) }}>reload</Button>
    </Box>,
  )
  return out
}
