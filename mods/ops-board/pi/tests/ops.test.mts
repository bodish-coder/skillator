import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { keyFromPi, OpsView, registerOps, splitArgs } from '../ops'
import type { PiApi, PiComponent, PiCtx, PiTui } from '../ops'
import type { Host, RunResult } from '../../ops/nodehost'
import { makeEngine } from '../../ops/engine'
import { initial } from '../../ops/state'
import { NO_SCRIPTS } from '../../hooks/lib/calls'

// F56: the pi adapter under plain node - no pi here. pi-tui's parseKey is stood in for by
// the names it gave, read from the installed @earendil-works/pi-tui 0.74.2 (2026-10-22).
const PI_TUI_0742: Record<string, string> = {
  a: 'a', D: 'D', '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\r': 'enter', '\x1b': 'escape', '\t': 'tab',
  '\x1b[Z': 'shift+tab', '\x7f': 'backspace', '\b': 'backspace', '\x1b[3~': 'delete', '\x03': 'ctrl+c', '1': '1', '2': '2',
  ' ': 'space', '@': '@', q: 'q', '\x1b[97u': 'a', '\x1b[68;2u': 'shift+d', '\x1b[13u': 'enter',
}
const parseKey = (d: string) => PI_TUI_0742[d]
const fit = (line: string, width: number) => line   // the frame is already fitted; the test checks it

const tmpDirs: string[] = []
const mkTmp = (prefix: string): string => { const d = mkdtempSync(join(tmpdir(), prefix)); tmpDirs.push(d); return d }
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })

const BOARD = '# Tickets\n\n- [ ] F90 - pi fixture ticket\n- [?] F91 - a decision [decide:@asha]\n'
const repo = () => { const d = mkTmp('ops-pi-repo-'); writeFileSync(join(d, 'TICKETS.md'), BOARD); return d }
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const width = (s: string) => [...strip(s)].length

test('keys: pi-tui names become the reducer keys (capitals keep their letter, Kitty too)', () => {
  const k = (d: string) => keyFromPi(d, parseKey(d))
  assert.deepEqual(k('\x1b[A'), { name: 'up', shift: false, ctrl: false })
  assert.deepEqual(k('\r'), { name: 'enter', shift: false, ctrl: false })
  assert.deepEqual(k('\x1b[13u'), { name: 'enter', shift: false, ctrl: false })
  assert.deepEqual(k('\x1b[Z'), { name: 'tab', shift: true, ctrl: false })
  assert.deepEqual(k('\x03'), { name: 'c', shift: false, ctrl: true })
  assert.deepEqual(k('D'), { name: 'D', sequence: 'D', shift: false, ctrl: false })
  assert.deepEqual(k('\x1b[68;2u'), { name: 'D', sequence: 'D', shift: true, ctrl: false })
  assert.deepEqual(k('\x1b[97u'), { name: 'a', sequence: 'a', shift: false, ctrl: false })
  assert.deepEqual(k(' '), { name: ' ', sequence: ' ', shift: false, ctrl: false })
  assert.deepEqual(k('@'), { name: '@', sequence: '@', shift: false, ctrl: false })
  assert.deepEqual(k('\x7f'), { name: 'backspace', shift: false, ctrl: false })
  assert.deepEqual(k('\x1b[3~'), { name: 'delete', shift: false, ctrl: false })
  assert.deepEqual(keyFromPi('é', undefined), { name: 'é', sequence: 'é', shift: false, ctrl: false })
  // Kitty: decodeKittyPrintable's character wins over the name (shift+2 with an @ layout)
  assert.deepEqual(keyFromPi('\x1b[50:64;2u', 'shift+2', '@'), { name: '@', sequence: '@', shift: true, ctrl: false })
  assert.deepEqual(keyFromPi('\x1b[233u', undefined, 'é'), { name: 'é', sequence: 'é', shift: false, ctrl: false })
  assert.deepEqual(keyFromPi('\x1b[99;5u', 'ctrl+c', undefined), { name: 'c', shift: false, ctrl: true })
  assert.equal(keyFromPi('\x1b[1;3A', 'alt+up'), null)
  assert.equal(keyFromPi('\x1b[999~', undefined), null)
})

test('args: whitespace-split, double quotes keep a path with spaces', () => {
  assert.deepEqual(splitArgs(''), [])
  assert.deepEqual(splitArgs('  --once   --tab runs '), ['--once', '--tab', 'runs'])
  assert.deepEqual(splitArgs('--skills "C:/a b/skills" --ascii'), ['--skills', 'C:/a b/skills', '--ascii'])
})

// A host with no scripts: the board from disk, every run refused as nodehost does.
function hostOf(root: string, calls: string[] = []): Host {
  const real = (p: string) => (/^[A-Za-z]:|^\//.test(p) ? p : join(root, p))
  return {
    win: false, skillsDir: null, repoRoot: root.replace(/\\/g, '/'),
    async run(call, args): Promise<RunResult> { calls.push([call, ...args].join(' ')); return { code: 127, out: '', err: NO_SCRIPTS, argv: [] } },
    async stat(p) { try { const s = (await import('node:fs')).statSync(real(p)); return { mtimeMs: s.mtimeMs, size: s.size } } catch { return null } },
    read: async p => (await import('node:fs')).readFileSync(real(p), 'utf8'),
    gitEmail: async () => null,
  }
}

test('view: the frame at pi\'s width and the terminal\'s rows, each line within the width; keys reach the reducer', async () => {
  const root = repo()
  let renders = 0
  const engine = makeEngine({ host: hostOf(root), email: null, once: false, state: initial(80, 24, Date.now()), onChange: () => { renders++ }, onQuit: () => {} })
  await engine.readAll()
  const view = new OpsView(engine, { color: true, ascii: false }, () => 20, { parseKey, fit })
  for (const w of [100, 60, 30]) {
    const lines = view.render(w)
    assert.equal(lines.length, 20, `rows at ${w}`)
    for (const l of lines) assert.ok(width(l) <= w, `over ${w}: ${strip(l)}`)
  }
  const text = view.render(70).map(strip).join('\n')
  assert.match(text, /1 Tickets/)
  assert.match(text, /▸ Pending \(1\)/)                // F61: every group starts collapsed
  view.handleInput('\x1b[B')                          // down to the Pending header; Enter opens it
  view.handleInput('\r')
  assert.match(view.render(70).map(strip).join('\n'), /F90 +pi fixture ticket/)
  view.handleInput('2')
  assert.equal(engine.state.tab, 'runs')
  assert.match(view.render(70).map(strip)[0]!, /2 Runs/)
  view.handleInput('3')
  assert.match(view.render(70).map(strip).join('\n'), /Usage .*from watch-cortana/)
  view.handleInput('1')
  view.handleInput('\x1b[B')                          // from the Pending header to its row
  view.handleInput('a')                               // assign: the dialog opens on the selected ticket
  assert.equal(engine.state.dialog?.id, 'F90')
  assert.match(view.render(70).map(strip).join('\n'), /Assign F90/)
  view.handleInput('\x1b')
  assert.equal(engine.state.dialog, null)
  // A146: the Team view's footer lists q; ctrl+c in a half-typed Add person cancels the form, the board stays
  view.handleInput('t')
  assert.match(view.render(70).map(strip).join('\n'), /esc back · q quit/)
  view.handleInput('n'); view.handleInput('a')
  assert.equal(engine.state.person?.handle, 'a')
  view.handleInput('\x03')
  assert.equal(engine.state.person, null); assert.equal(engine.state.quit, false); assert.equal(engine.state.showTeam, true)
  assert.ok(renders > 0)
  view.dispose()
})

// A fake pi: registerCommand captured; ctx.ui.custom calls the factory with a fake TUI
// and resolves when done() is called.
function fakePi() {
  let cmd: { description: string; handler: (args: string, ctx: PiCtx) => Promise<void> } | null = null
  const pi: PiApi = { registerCommand(name, o) { assert.equal(name, 'ops'); cmd = o } }
  const notes: { msg: string; type?: string }[] = []
  let view: PiComponent | null = null
  let requested = 0
  const ctx = (cwd: string, hasUI = true): PiCtx => ({
    cwd, hasUI,
    ui: {
      notify: (msg, type) => { notes.push({ msg, type }) },
      custom: <T,>(factory: (tui: PiTui, theme: unknown, kb: unknown, done: (r: T) => void) => PiComponent, options?: object) =>
        new Promise<T>(res => {
          assert.deepEqual((options as { overlay?: boolean })?.overlay, true)
          view = factory({ terminal: { rows: 18 }, requestRender: () => { requested++ } }, {}, {}, r => { view?.dispose(); res(r) })
        }),
    },
  })
  return { pi, ctx, notes, get cmd() { return cmd! }, get view() { return view! }, get requested() { return requested } }
}

const opts = { parseKey, fit, appDir: resolve(import.meta.dirname, '..'), env: {} }

test('/ops --once notifies one plain frame of the repo it is run in, and opens nothing', async () => {
  const f = fakePi()
  registerOps(f.pi, opts)
  const root = repo()
  const nowhere = mkTmp('ops-pi-noskills-')
  await f.cmd.handler(`--once --cols 60 --rows 20 --skills "${nowhere}"`, f.ctx(root))
  assert.equal(f.notes.length, 1)
  const lines = f.notes[0]!.msg.split('\n')
  assert.equal(lines.length, 20)
  for (const l of lines) assert.ok([...l].length <= 60, l)
  assert.doesNotMatch(f.notes[0]!.msg, /\x1b/)
  assert.match(lines[0]!, /1 Tickets {3}2 Runs {3}3 Health/)
  assert.match(f.notes[0]!.msg, /▸ Pending \(1\)/)    // F61: headers only at first
})

test('/ops with a wrong flag says so with the usage, as an error', async () => {
  const f = fakePi()
  registerOps(f.pi, opts)
  await f.cmd.handler('--tab agents', f.ctx(repo()))
  assert.equal(f.notes[0]!.type, 'error')
  assert.match(f.notes[0]!.msg, /--tab is one of tickets, runs, health, messages, explorer, got agents/)
  assert.match(f.notes[0]!.msg, /^usage: \/ops /m)
})

test('/ops opens the full-screen overlay at the terminal\'s rows; q closes it and the polls stop', async () => {
  const f = fakePi()
  registerOps(f.pi, opts)
  const root = repo()
  const nowhere = mkTmp('ops-pi-noskills-')
  const open = f.cmd.handler(`--skills "${nowhere}"`, f.ctx(root))
  // A148: wait for the first board read (bounded), not a fixed 300 ms - under load the
  // view came late, the test threw before q, and the polls kept node alive (a hang).
  const shown = () => (f.view ? f.view.render(90).map(strip).join('\n') : '')
  for (const t0 = Date.now(); !/▸ Pending \(1\)/.test(shown()) && Date.now() - t0 < 10_000;) await new Promise(r => setTimeout(r, 50))
  try {
    const lines = f.view.render(90)
    assert.equal(lines.length, 18)
    assert.match(lines.map(strip).join('\n'), /▸ Pending \(1\)/)
    assert.ok(f.requested > 0, 'the engine asks pi to render')
  } finally {
    f.view?.handleInput('q')                       // always close: a failed assert must not leave the polls running
  }
  await open                                       // resolves: done() was called; the test ends, so no timer is left
})

test('/ops in a mode with no UI (print) opens nothing and says nothing', async () => {
  const f = fakePi()
  registerOps(f.pi, opts)
  await f.cmd.handler(`--skills "${mkTmp('ops-pi-noskills-')}"`, f.ctx(repo(), false))
  assert.equal(f.notes.length, 0)
})
