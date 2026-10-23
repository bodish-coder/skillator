import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { argvOf, htmlOf, keyFromDom, ONCE, OPEN, pageHtml, registerOps } from '../ops'
import type { Disposable, VsApi, VsPanel } from '../ops'
// @ts-ignore - plain .mjs, no types
import { vsixEntries, zip } from '../pack.mjs'

// F57: the Antigravity IDE adapter under plain node - no IDE here. The vscode API is
// stood in for by the slice ops.ts names (VS Code 1.107 / Antigravity IDE 1.107.0).

const tmpDirs: string[] = []
const mkTmp = (prefix: string): string => { const d = mkdtempSync(join(tmpdir(), prefix)); tmpDirs.push(d); return d }
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })

const BOARD = '# Tickets\n\n- [ ] F90 - agy fixture ticket <b>\n- [?] F91 - a decision [decide:@asha]\n'
const repo = () => { const d = mkTmp('ops-agy-repo-'); writeFileSync(join(d, 'TICKETS.md'), BOARD); return d }
const appDir = resolve(import.meta.dirname, '..')
const untag = (h: string) => h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

test('keys: DOM keydowns become the reducer keys (capitals keep their letter, ctrl+c quits)', () => {
  assert.deepEqual(keyFromDom({ key: 'ArrowUp' }), { name: 'up', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'ArrowDown' }), { name: 'down', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'Enter' }), { name: 'enter', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'Escape' }), { name: 'escape', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'Tab', shift: true }), { name: 'tab', shift: true, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'Backspace' }), { name: 'backspace', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'Delete' }), { name: 'delete', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'D', shift: true }), { name: 'D', sequence: 'D', shift: true, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'a' }), { name: 'a', sequence: 'a', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: '@', shift: true }), { name: '@', sequence: '@', shift: true, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'é' }), { name: 'é', sequence: 'é', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: ' ' }), { name: ' ', sequence: ' ', shift: false, ctrl: false })
  assert.deepEqual(keyFromDom({ key: 'C', ctrl: true, shift: true }), { name: 'c', shift: true, ctrl: true })
  assert.equal(keyFromDom({ key: 'ArrowUp', alt: true }), null)
  assert.equal(keyFromDom({ key: 'a', meta: true }), null)
  assert.equal(keyFromDom({ key: 'Shift', shift: true }), null)
  assert.equal(keyFromDom({ key: 'F5' }), null)
})

test('html: SGR runs become classed spans, text is escaped, other escapes are dropped', () => {
  assert.equal(htmlOf(['plain <b> & co']), 'plain &lt;b&gt; &amp; co')
  assert.equal(htmlOf(['a \x1b[33;1mwarn\x1b[0m b']), 'a <span class="c33 b">warn</span> b')
  assert.equal(htmlOf(['\x1b[7msel\x1b[0m', '\x1b[2mdim']), '<span class="i">sel</span>\n<span class="d">dim</span>')
  assert.equal(htmlOf(['x\x1b[Ky\x07z']), 'xyz')
})

test('page: nothing loads, the one script runs by nonce, and it posts size and keys', () => {
  const p = pageHtml('N0NCE', 'vscode-webview://x')
  assert.match(p, /default-src 'none'; style-src vscode-webview:\/\/x 'nonce-N0NCE'; script-src 'nonce-N0NCE';/)
  assert.equal((p.match(/<script/g) ?? []).length, 1)
  assert.match(p, /<script nonce="N0NCE">/)
  assert.match(p, /type: 'size'/)
  assert.match(p, /type: 'key', key: e\.key, shift: e\.shiftKey, ctrl: e\.ctrlKey/)
  assert.doesNotMatch(p, /src="http/)
})

test('args: an array or one whitespace-split string', () => {
  assert.deepEqual(argvOf(undefined), [])
  assert.deepEqual(argvOf(['--tab', 'runs', 3]), ['--tab', 'runs'])
  assert.deepEqual(argvOf('  --once  --cols 60 '), ['--once', '--cols', '60'])
})

// A fake IDE: commands captured; one webview panel at a time, its messages driven by hand.
function fakeIde(folder: string | null) {
  const cmds = new Map<string, (...a: unknown[]) => unknown>()
  const posted: { type: string; html: string }[] = []
  const errors: string[] = []
  const out: string[] = []
  let recv: ((m: unknown) => void) | null = null
  let disposed = 0, reveals = 0, created = 0
  let panel: VsPanel | null = null
  const newPanel = (): VsPanel => {
    let onDispose: (() => void) | null = null
    let gone = false
    return {
      webview: {
        html: '', cspSource: 'vscode-webview://fake',
        postMessage: m => { assert.ok(!gone, 'posted to a closed panel'); posted.push(m as { type: string; html: string }); return true },
        onDidReceiveMessage: f => { recv = f; return { dispose: () => { recv = null } } },
      },
      reveal: () => { reveals++ },
      dispose: () => { if (gone) return; gone = true; disposed++; onDispose?.() },
      onDidDispose: f => { onDispose = f; return { dispose: () => {} } },
    }
  }
  const subs: Disposable[] = []
  const api: VsApi = {
    commands: { registerCommand: (id, f) => { cmds.set(id, f); return { dispose: () => cmds.delete(id) } } },
    window: {
      createWebviewPanel: (type, title, _col, o) => {
        created++; assert.equal(type, 'skillator.ops'); assert.equal(title, 'ops'); assert.equal(o.enableScripts, true)
        return (panel = newPanel())
      },
      createOutputChannel: name => { assert.equal(name, 'skillator ops'); return { clear: () => { out.length = 0 }, append: s => { out.push(s) }, show: () => {} } },
      showErrorMessage: m => { errors.push(m) },
    },
    workspace: { workspaceFolders: folder ? [{ uri: { fsPath: folder } }] : undefined },
    ViewColumn: { Active: -1 },
  }
  return {
    api, ctx: { subscriptions: subs }, cmds, posted, errors, out, get panel() { return panel! },
    send: (m: unknown) => recv!(m),
    get disposed() { return disposed }, get reveals() { return reveals }, get created() { return created },
    lastFrame: () => untag(posted.filter(p => p.type === 'frame').at(-1)?.html ?? ''),
  }
}

const noSkills = () => ['--skills', mkTmp('ops-agy-noskills-')]

test('the one-frame command returns the plain frame of the workspace folder and writes it to the output channel', async () => {
  const f = fakeIde(repo())
  registerOps(f.api, f.ctx, { appDir, env: {} })
  assert.deepEqual([...f.cmds.keys()], [OPEN, ONCE])
  assert.equal(f.ctx.subscriptions.length, 3)
  const text = await f.cmds.get(ONCE)!([...noSkills(), '--cols', '60', '--rows', '20']) as string
  const lines = text.split('\n')
  assert.equal(lines.length, 20)
  for (const l of lines) assert.ok([...l].length <= 60, l)
  assert.doesNotMatch(text, /\x1b/)
  assert.match(lines[0]!, /1 Tickets {3}2 Runs {3}3 Health/)
  // F61: every group starts collapsed - headers with counts, no rows
  assert.match(text, /› ▸ Pending decision \(1\)\n  ▸ Pending \(1\)/)
  assert.equal(f.out.join(''), text + '\n')
})

test('no workspace folder: the frame is of deps.cwd; a wrong flag is an error message with the usage', async () => {
  const f = fakeIde(null)
  registerOps(f.api, f.ctx, { appDir, env: {}, cwd: repo() })
  assert.match(await f.cmds.get(ONCE)!(noSkills()) as string, /▸ Pending \(1\)/)
  assert.equal(await f.cmds.get(ONCE)!(['--tab', 'agents']), null)
  assert.match(f.errors[0]!, /--tab is one of tickets, runs, health, messages, got agents/)
  assert.match(f.errors[0]!, /^usage: skillator\.ops /m)
  await f.cmds.get(OPEN)!(['--tab', 'workflows'])
  assert.equal(f.created, 0)
  assert.equal(f.errors.length, 2)
})

test('the panel: frames at the size the page reports, keys reach the reducer, q closes it and the polls stop', async () => {
  const f = fakeIde(repo())
  registerOps(f.api, f.ctx, { appDir, env: {} })
  await f.cmds.get(OPEN)!(noSkills())
  assert.equal(f.created, 1)
  assert.match(f.panel.webview.html, /acquireVsCodeApi/)
  await new Promise(r => setTimeout(r, 300))           // the first board read
  f.send({ type: 'size', cols: 70, rows: 18 })
  const rows = f.lastFrame().split('\n')
  assert.equal(rows.length, 18)
  for (const l of rows) assert.ok([...l].length <= 70, l)
  assert.match(rows.join('\n'), /▸ Pending \(1\)/)
  f.send({ type: 'key', key: 'ArrowDown' })            // F61: down to the Pending header, Enter opens it
  f.send({ type: 'key', key: 'Enter' })
  await new Promise(r => setTimeout(r, 50))
  assert.match(f.lastFrame(), /▾ Pending \(1\)\n› ● F90 +agy fixture ticket <b>|▾ Pending \(1\)\n {2}● F90 +agy fixture ticket <b>/)
  assert.match(f.posted.at(-1)!.html, /&lt;b&gt;/)        // the title's markup is text, never markup
  // a second open reveals the same panel
  await f.cmds.get(OPEN)!()
  assert.equal(f.created, 1)
  assert.equal(f.reveals, 1)
  f.send({ type: 'key', key: '2' })
  await new Promise(r => setTimeout(r, 50))
  assert.match(f.lastFrame().split('\n')[0]!, /2 Runs/)
  f.send({ type: 'key', key: '3' })
  await new Promise(r => setTimeout(r, 50))
  assert.match(f.lastFrame(), /Usage .*from watch-cortana/)
  f.send({ type: 'key', key: '1' })
  f.send({ type: 'key', key: 'ArrowDown' })            // from the Pending header to its row
  f.send({ type: 'key', key: 'a' })                    // assign: the dialog opens on the selected ticket
  await new Promise(r => setTimeout(r, 50))
  assert.match(f.lastFrame(), /Assign F90/)
  f.send({ type: 'key', key: 'Escape' })
  f.send({ type: 'key', key: 'q' })
  await new Promise(r => setTimeout(r, 50))
  assert.equal(f.disposed, 1)
  const n = f.posted.length
  await new Promise(r => setTimeout(r, 2300))          // past one board poll: nothing more is drawn
  assert.equal(f.posted.length, n)
  // closed, it opens a fresh panel again
  await f.cmds.get(OPEN)!(noSkills())
  assert.equal(f.created, 2)
  f.ctx.subscriptions.at(-1)!.dispose()                // deactivation closes it
  assert.equal(f.disposed, 2)
})

test('pack: a VSIX the IDE reads - the manifest, and a shim requiring this dir\'s extension.cjs with the IDE\'s vscode', () => {
  const entries = vsixEntries(appDir) as [string, Buffer][]
  assert.deepEqual(entries.map(e => e[0]), ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/extension.cjs'])
  const get = (n: string) => entries.find(e => e[0] === n)![1].toString('utf8')
  const pkg = JSON.parse(get('extension/package.json'))
  assert.equal(`${pkg.publisher}.${pkg.name}`, 'skillator.skillator-ops')
  assert.equal(pkg.main, './extension.cjs')
  assert.deepEqual(pkg.contributes.commands.map((c: { command: string }) => c.command), [OPEN, ONCE])
  assert.match(get('extension.vsixmanifest'), /<Identity Language="en-US" Id="skillator-ops" Version="1\.0\.0" Publisher="skillator" \/>/)
  const shim = get('extension/extension.cjs')
  assert.ok(shim.includes(`require(${JSON.stringify(appDir.replace(/\\/g, '/') + '/extension.cjs')})`), shim)
  assert.match(shim, /ops\.activate\(context, require\('vscode'\)\)/)
  // the shim, loaded, hands the given vscode to the real entry
  const dir = mkTmp('ops-agy-shim-')
  writeFileSync(join(dir, 'shim.cjs'), shim.replace("require('vscode')", 'globalThis.__vscode'))
  const m = createRequire(join(dir, 'x.cjs'))(join(dir, 'shim.cjs'))
  assert.equal(typeof m.activate, 'function')
  assert.equal(typeof m.deactivate, 'function')
})

test('pack: the zip is well formed - every local header, the central directory and its end agree', () => {
  const entries: [string, Buffer][] = [['a.txt', Buffer.from('hello')], ['dir/é.json', Buffer.from('{}')]]
  const z = zip(entries) as Buffer
  const end = z.length - 22
  assert.equal(z.readUInt32LE(end), 0x06054b50)
  assert.equal(z.readUInt16LE(end + 10), 2)
  let at = z.readUInt32LE(end + 16)
  for (const [name, data] of entries) {
    assert.equal(z.readUInt32LE(at), 0x02014b50)
    const nl = z.readUInt16LE(at + 28), off = z.readUInt32LE(at + 42)
    assert.equal(z.subarray(at + 46, at + 46 + nl).toString('utf8'), name)
    assert.equal(z.readUInt32LE(off), 0x04034b50)
    assert.equal(z.readUInt16LE(off + 8), 0)            // stored
    const ln = z.readUInt16LE(off + 26)
    assert.deepEqual(z.subarray(off + 30 + ln, off + 30 + ln + data.length), data)
    at += 46 + nl
  }
  assert.equal(at, end)
})

test('the extension manifest and the entry agree with the commands ops.ts registers', () => {
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
  assert.equal(pkg.main, './extension.cjs')
  assert.equal(pkg.type, 'module')
  const entry = readFileSync(join(appDir, 'extension.cjs'), 'utf8')
  assert.match(entry, /'\.\.', 'ops', 'loader\.mjs'/)
  assert.match(entry, /exports\.activate = async function activate\(context, api\)/)
})
