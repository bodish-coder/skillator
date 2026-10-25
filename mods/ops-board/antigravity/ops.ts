// F57: the ops board inside the Antigravity IDE (a VS Code fork, 1.107.0) as a webview,
// on the F55 data layer. Command "skillator: ops board" opens the standalone app's views -
// Tickets, Runs, Health, assign / decide - in an editor panel: ../ops/draw.ts draws (with
// colour; the SGR runs become spans here), ../ops/state.ts decides, ../ops/engine.ts polls
// and runs the calls through ../ops/nodehost.ts. Same keys, same words; no Agents /
// Workflows tabs. "skillator: ops board - one frame" returns one plain frame (and writes it
// to the "skillator ops" output channel): the headless proof.
// No vscode import here - extension.cjs hands in the API - so the tests drive this file
// under plain node.
import type { Key, State } from '../ops/state'
import type { Engine } from '../ops/engine'
import { initial } from '../ops/state'
import { frame } from '../ops/draw'
import { makeEngine } from '../ops/engine'
import { makeHost } from '../ops/nodehost'
import { parseArgs, repoName, USAGE } from '../ops/app'

// The slice of the vscode API this uses, by shape.
export type Disposable = { dispose(): unknown }
export type VsWebview = {
  html: string
  cspSource: string
  postMessage(m: unknown): Thenable<boolean> | Promise<boolean> | boolean
  onDidReceiveMessage(f: (m: unknown) => void): Disposable
}
type Thenable<T> = { then(f: (v: T) => unknown): unknown }
export type VsPanel = { webview: VsWebview; reveal(): void; dispose(): void; onDidDispose(f: () => void): Disposable }
export type VsOutput = { clear(): void; append(s: string): void; show(preserveFocus?: boolean): void }
export type VsApi = {
  commands: { registerCommand(id: string, f: (...args: unknown[]) => unknown): Disposable }
  window: {
    createWebviewPanel(viewType: string, title: string, column: number, options: { enableScripts: boolean; retainContextWhenHidden?: boolean }): VsPanel
    createOutputChannel(name: string): VsOutput
    showErrorMessage(m: string): unknown
  }
  workspace: { workspaceFolders?: readonly { uri: { fsPath: string } }[] | undefined }
  ViewColumn: { Active: number }
}
export type VsContext = { subscriptions: Disposable[] }
export type Deps = {
  appDir: string                                      // this dir: nodehost finds the skills two up (installed) or three up + /skills (repo)
  env?: Record<string, string | undefined>
  cwd?: string                                        // no workspace folder open: this, else process.cwd()
}

export const OPEN = 'skillator.ops'
export const ONCE = 'skillator.opsOnce'

// A DOM keydown (what the page posts) as the reducer's Key: the arrows, Enter, Escape,
// Tab, Backspace, Delete by the names readline gives them; a printable character is its
// own name and rides along as `sequence` (a capital keeps its letter - the reducer's 'D',
// 'R'); ctrl+<letter> is the letter with ctrl. Alt / meta chords and keys the board does
// not use (F5, Home, Shift alone) are null - the IDE keeps them.
export type DomKey = { key: string; shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean }
const NAMED: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Escape: 'escape',
  Tab: 'tab', Backspace: 'backspace', Delete: 'delete',
}
export function keyFromDom(e: DomKey): Key | null {
  if (e.alt || e.meta) return null
  const shift = !!e.shift, ctrl = !!e.ctrl
  const named = NAMED[e.key]
  if (named) return { name: named, shift, ctrl }
  if ([...e.key].length !== 1 || e.key < ' ' || e.key === '\x7f') return null
  if (ctrl) return { name: e.key.toLowerCase(), shift, ctrl: true }
  return { name: e.key, sequence: e.key, shift, ctrl: false }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// F89: draw.ts's highlight (1;97;44) shows as the inverse class here, in the IDE theme's colours
const CLASS: Record<string, string> = { '1': 'b', '2': 'd', '7': 'i', '44': 'i', '31': 'c31', '32': 'c32', '33': 'c33', '35': 'c35', '36': 'c36' }

// draw.ts's lines (SGR runs: `ESC[<codes>m text ESC[0m`) as HTML: each run a span with a
// class per code, text escaped, any other escape dropped. One line per frame row.
export function htmlOf(lines: string[]): string {
  return lines.map(line => {
    let out = '', open = false
    const re = /\x1b\[([0-9;]*)m/g
    let at = 0
    const text = (s: string) => esc(s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, ''))
    for (let m = re.exec(line); m; m = re.exec(line)) {
      out += text(line.slice(at, m.index))
      at = re.lastIndex
      if (open) { out += '</span>'; open = false }
      const cls = m[1]!.split(';').map(c => CLASS[c]).filter(Boolean)
      if (cls.length) { out += `<span class="${cls.join(' ')}">`; open = true }
    }
    out += text(line.slice(at))
    return open ? out + '</span>' : out
  }).join('\n')
}

// The page: one <pre> the frame is written into, a probe span to measure a cell, and a
// script that posts its size in cells and every keydown. CSP: nothing loads; the script
// runs by nonce. Colours are the IDE theme's terminal colours.
export function pageHtml(nonce: string, cspSource: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
html,body{margin:0;padding:0;height:100%;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground)}
pre{margin:0;padding:8px;font-family:var(--vscode-editor-font-family),monospace;font-size:var(--vscode-editor-font-size,13px);line-height:1.25;white-space:pre}
#m{position:absolute;visibility:hidden;white-space:pre}
.b{font-weight:bold}.d{opacity:.6}.i{background:var(--vscode-editor-foreground);color:var(--vscode-editor-background)}
.c31{color:var(--vscode-terminal-ansiRed)}.c32{color:var(--vscode-terminal-ansiGreen)}.c33{color:var(--vscode-terminal-ansiYellow)}
.c35{color:var(--vscode-terminal-ansiMagenta)}.c36{color:var(--vscode-terminal-ansiCyan)}
</style></head><body><pre id="f"></pre><pre id="m">MMMMMMMMMM</pre>
<script nonce="${nonce}">
const vs = acquireVsCodeApi(), f = document.getElementById('f'), m = document.getElementById('m')
const size = () => {
  const r = m.getBoundingClientRect(), cw = r.width / 10 || 8, ch = (r.height - 16) || 16
  vs.postMessage({ type: 'size', cols: Math.max(20, Math.floor((innerWidth - 16) / cw)), rows: Math.max(5, Math.floor((innerHeight - 16) / ch)) })
}
addEventListener('resize', size)
addEventListener('message', e => { if (e.data && e.data.type === 'frame') f.innerHTML = e.data.html })
addEventListener('keydown', e => {
  if (e.isComposing || e.altKey || e.metaKey) return
  if (e.ctrlKey && e.key.toLowerCase() !== 'c') return
  e.preventDefault()
  vs.postMessage({ type: 'key', key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey })
})
size()
</script></body></html>`
}

const nonceOf = () => Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('')

// A command's arguments as argv: an array of strings, or one string split on whitespace.
export function argvOf(a: unknown): string[] {
  if (Array.isArray(a)) return a.filter((x): x is string => typeof x === 'string')
  return typeof a === 'string' ? a.split(/\s+/).filter(Boolean) : []
}

export function registerOps(api: VsApi, context: VsContext, deps: Deps): void {
  const env = deps.env ?? process.env
  const cwd = () => api.workspace.workspaceFolders?.[0]?.uri.fsPath ?? deps.cwd ?? process.cwd()
  const setup = async (argv: string[]) => {
    const opts = parseArgs(argv, env)
    if (opts.error) return { error: `${opts.error}\n${USAGE.replace(/^usage: ops \[repo-dir\] /, 'usage: skillator.ops ')}` } as const
    const host = await makeHost({ appDir: deps.appDir, cwd: cwd(), ...(opts.skills ? { skills: opts.skills } : {}) })
    const email = await host.gitEmail()
    const first = (cols: number, rows: number): State => ({ ...initial(cols, rows, Date.now()), tab: opts.tab, repo: repoName(host.repoRoot) })
    return { opts, host, email, first } as const
  }
  let output: VsOutput | null = null

  // one plain frame, returned and written to the output channel; null on a wrong flag
  const once = async (...args: unknown[]): Promise<string | null> => {
    const s = await setup(argvOf(args[0]))
    if ('error' in s) { void api.window.showErrorMessage(s.error!); return null }
    const engine = makeEngine({ host: s.host, email: s.email, once: true, state: s.first(s.opts.cols ?? 80, s.opts.rows ?? 24), onChange: () => {}, onQuit: () => {} })
    await engine.readAll()
    const text = frame({ ...engine.state, now: Date.now() }, { color: false, ascii: s.opts.ascii, plain: true }).join('\n')
    output ??= api.window.createOutputChannel('skillator ops')
    output.clear()
    output.append(text + '\n')
    output.show(true)
    return text
  }

  let open: { panel: VsPanel; engine: Engine } | null = null
  const show = async (...args: unknown[]): Promise<void> => {
    const argv = argvOf(args[0])
    if (argv.includes('--once')) { await once(argv); return }
    if (open) { open.panel.reveal(); return }
    const s = await setup(argv)
    if ('error' in s) { void api.window.showErrorMessage(s.error!); return }
    const already = open as { panel: VsPanel } | null      // opened again while this one read git
    if (already) { already.panel.reveal(); return }
    const panel = api.window.createWebviewPanel('skillator.ops', 'ops', api.ViewColumn.Active, { enableScripts: true })
    const paint = { color: s.opts.color, ascii: s.opts.ascii }
    let last = ''
    const draw = () => {
      if (open?.panel !== panel) return
      const html = htmlOf(frame({ ...engine.state, now: Date.now() }, paint))
      if (html === last) return
      last = html
      void panel.webview.postMessage({ type: 'frame', html })
    }
    const engine = makeEngine({
      host: s.host, email: s.email, once: false, state: s.first(s.opts.cols ?? 80, s.opts.rows ?? 24),
      onChange: draw, onQuit: () => panel.dispose(),
    })
    open = { panel, engine }
    const subs: Disposable[] = []
    subs.push(panel.webview.onDidReceiveMessage(m => {
      const msg = m as { type?: string; cols?: number; rows?: number } & DomKey
      if (msg?.type === 'size' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
        engine.resize(s.opts.cols ?? Math.max(1, msg.cols!), s.opts.rows ?? Math.max(1, msg.rows!))
        last = ''
        draw()
      } else if (msg?.type === 'key' && typeof msg.key === 'string') {
        const k = keyFromDom(msg)
        if (k) void engine.key(k)
      }
    }))
    subs.push(panel.onDidDispose(() => {
      // closed any way (q, ctrl+c, the tab's x, the window closing): the polls stop
      engine.stop()
      if (open?.panel === panel) open = null
      for (const d of subs.splice(0)) d.dispose()
    }))
    panel.webview.html = pageHtml(nonceOf(), panel.webview.cspSource)
    void engine.start()
  }

  context.subscriptions.push(
    api.commands.registerCommand(OPEN, show),
    api.commands.registerCommand(ONCE, once),
    { dispose: () => { open?.panel.dispose(); open = null } },
  )
}
