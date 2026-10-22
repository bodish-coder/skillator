// F56: the ops board inside pi (0.74.2), as a native extension on the F55 data layer.
// `/ops` opens the standalone app's views - Tickets, Runs, Health, assign / decide - as a
// full-screen overlay: ../ops/draw.ts draws, ../ops/state.ts decides, ../ops/engine.ts
// polls and runs the calls through ../ops/nodehost.ts. Same keys, same words; no
// Agents / Workflows tabs. `/ops --once` notifies one plain frame and opens nothing (the
// headless proof: it works in `pi --mode rpc`).
// No pi import here - index.ts hands in pi-tui's key parser and line fitter - so the
// tests drive this file under plain node.
import type { Key, State } from '../ops/state'
import type { Engine } from '../ops/engine'
import type { Paint } from '../ops/draw'
import { initial } from '../ops/state'
import { frame } from '../ops/draw'
import { makeEngine } from '../ops/engine'
import { makeHost } from '../ops/nodehost'
import { parseArgs, repoName, USAGE } from '../ops/app'

// The slice of pi's API this uses (ExtensionAPI, ExtensionCommandContext, TUI), by shape.
export type PiTui = { terminal: { rows: number }; requestRender(): void }
export type PiComponent = { render(width: number): string[]; handleInput(data: string): void; invalidate(): void; dispose(): void }
export type PiCtx = {
  cwd: string
  hasUI: boolean
  ui: {
    notify(message: string, type?: 'info' | 'warning' | 'error'): void
    custom<T>(factory: (tui: PiTui, theme: unknown, keybindings: unknown, done: (result: T) => void) => PiComponent, options?: object): Promise<T>
  }
}
export type PiApi = { registerCommand(name: string, options: { description: string; handler: (args: string, ctx: PiCtx) => Promise<void> }): void }
export type Deps = {
  parseKey: (data: string) => string | undefined      // pi-tui's parseKey
  kitty?: (data: string) => string | undefined        // pi-tui's decodeKittyPrintable
  fit: (line: string, width: number) => string        // pi-tui's truncateToWidth: a line over the width throws in pi
  appDir: string                                      // this dir: nodehost finds the skills two up (installed) or three up + /skills (repo)
  env?: Record<string, string | undefined>
}

// pi's raw input as the reducer's Key. `id` is pi-tui's name for it (parseKey): 'up',
// 'enter', 'escape', 'tab', 'shift+tab', 'backspace', 'delete', 'ctrl+c', 'a', 'D',
// 'shift+d' (Kitty), 'space', '@'. A capital keeps its letter (the reducer's 'D', 'R');
// a printable character rides along as `sequence` (the Add person form types it).
// `kitty` is the character a Kitty CSI-u sequence types (pi-tui's decodeKittyPrintable):
// it wins over the name, so shift+2 types '@' where the layout says so.
export function keyFromPi(data: string, id: string | undefined, kitty?: string): Key | null {
  const parts = id ? id.split('+') : []
  const base = parts.pop() ?? ''
  const mods = new Set(parts)
  const shift = mods.has('shift'), ctrl = mods.has('ctrl')
  if (mods.has('alt') || mods.has('super')) return null
  if (kitty && !ctrl && [...kitty].length === 1 && kitty >= ' ') return { name: kitty, sequence: kitty, shift, ctrl: false }
  let name = base === 'space' ? ' ' : base
  if (shift && /^[a-z]$/.test(name)) name = name.toUpperCase()
  // a character pi-tui does not name (é, ü): itself
  if (!name) {
    const one = [...data].length === 1 && data >= ' ' && data !== '\x7f' ? data : null
    return one ? { name: one, sequence: one, shift: false, ctrl: false } : null
  }
  const printable = !ctrl && [...name].length === 1 ? name : null
  return printable ? { name, sequence: printable, shift, ctrl } : { name, shift, ctrl }
}

// The command's argument string as argv: whitespace-split, "double quotes" keep spaces.
export function splitArgs(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  for (let m = re.exec(s); m; m = re.exec(s)) out.push(m[1] ?? m[2]!)
  return out
}

// The overlay: the frame at pi's width and the terminal's height, every line fitted
// (pi throws on a line wider than the width); a key goes to the engine.
export class OpsView implements PiComponent {
  private engine: Engine
  private paint: Paint
  private rows: () => number
  private deps: Pick<Deps, 'parseKey' | 'kitty' | 'fit'>
  constructor(engine: Engine, paint: Paint, rows: () => number, deps: Pick<Deps, 'parseKey' | 'kitty' | 'fit'>) {
    this.engine = engine; this.paint = paint; this.rows = rows; this.deps = deps
  }
  render(width: number): string[] {
    const cols = Math.max(1, width)
    this.engine.resize(cols, Math.max(1, this.rows()))
    return frame({ ...this.engine.state, now: Date.now() }, this.paint).map(l => this.deps.fit(l, cols))
  }
  handleInput(data: string): void {
    const k = keyFromPi(data, this.deps.parseKey(data), this.deps.kitty?.(data))
    if (k) void this.engine.key(k)
  }
  invalidate(): void { /* nothing cached */ }
  dispose(): void { this.engine.stop() }
}

const FULL = { overlay: true, overlayOptions: { anchor: 'top-left', width: '100%', maxHeight: '100%', margin: 0 } }

export function registerOps(pi: PiApi, deps: Deps): void {
  pi.registerCommand('ops', {
    description: 'skillator ops board: tickets, runs, health (--once: one frame)',
    handler: async (args, ctx) => {
      const opts = parseArgs(splitArgs(args), deps.env ?? process.env)
      if (opts.error) { ctx.ui.notify(`${opts.error}\n${USAGE.replace(/^usage: ops/, 'usage: /ops')}`, 'error'); return }
      const host = await makeHost({ appDir: deps.appDir, cwd: ctx.cwd, ...(opts.skills ? { skills: opts.skills } : {}) })
      const email = await host.gitEmail()
      const first = (cols: number, rows: number): State => ({ ...initial(cols, rows, Date.now()), tab: opts.tab, repo: repoName(host.repoRoot) })

      if (opts.once) {
        const engine = makeEngine({ host, email, once: true, state: first(opts.cols ?? 80, opts.rows ?? 24), onChange: () => {}, onQuit: () => {} })
        await engine.readAll()
        // plain text: the host styles its own notifications
        ctx.ui.notify(frame({ ...engine.state, now: Date.now() }, { color: false, ascii: opts.ascii }).join('\n'), 'info')
        return
      }
      if (!ctx.hasUI) return
      const paint: Paint = { color: opts.color, ascii: opts.ascii }
      let engine: Engine | null = null
      try {
        await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
          const rows = () => opts.rows ?? tui.terminal.rows
          const e = makeEngine({
            host, email, once: false, state: first(opts.cols ?? 80, rows()),
            onChange: () => tui.requestRender(),
            onQuit: () => { e.stop(); done(undefined) },
          })
          engine = e
          void e.start()
          return new OpsView(e, paint, rows, deps)
        }, FULL)
      } finally {
        // closed any way (q, ctrl+c, the host tearing the overlay down): the polls stop
        ;(engine as Engine | null)?.stop()
      }
    },
  })
}
