// F66: the Messages tab and the Teams setup form, in the shared reducer and frames (the
// standalone app, pi and the Antigravity IDE all draw these).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, onInbox, afterRun, settle, point } from '../state'
import type { State, Effect } from '../state'
import { frame, cells } from '../draw'
import { parseInbox, unreadCount } from '../../hooks/lib/inbox'
import { setupError, unmask, freshSetup } from '../../hooks/lib/teamsconfig'
import { makeEngine } from '../engine'
import type { Host } from '../nodehost'

const P = { color: false, ascii: false, plain: true }
const text = (s: State) => frame(s, P).join('\n')
const rec = (id: string, from: string, text: string, min: number) =>
  JSON.stringify({ ts: `2026-10-23T09:${String(min).padStart(2, '0')}:00.000Z`, from, email: from.slice(1) + '@x.com', text, id })
const INBOX = [rec('1', '@asha', 'can you look at F12?', 10), rec('2', '@vidul', 'build is red\nsecond line', 11), rec('3', '@asha', 'never mind', 12)].join('\n') + '\n'
const TOKEN = Buffer.from('a-32-byte-security-token-for-tst').toString('base64')
const CFG_NONE = '{"path":"/h/.skillator/teams.json","token":false,"workflowUrl":null,"port":3978,"statusPosts":false}\n'
const CFG_SET = '{"path":"/h/.skillator/teams.json","token":true,"workflowUrl":"prod.example","port":4000,"statusPosts":true}\n'
const ok = (out: string, argv = ['node', 'team.mjs']) => ({ code: 0, out, err: '', argv })
const press = (s: State, ...keys: (string | { name: string; sequence?: string; shift?: boolean; ctrl?: boolean })[]) =>
  keys.reduce((x, k) => reduce(x, typeof k === 'string' ? { name: k } : k).state, s)
const type = (s: State, str: string) => [...str].reduce((x, c) => reduce(x, { name: c, sequence: c }).state, s)
const runs = (effs: Effect[]) => effs.filter((e): e is Extract<Effect, { kind: 'run' }> => e.kind === 'run')

const s0 = onInbox(initial(80, 24, 0), INBOX, '1')

test('inbox: parsed, unread after the read marker', () => {
  const m = parseInbox(INBOX)
  assert.deepEqual(m.map(x => x.id), ['1', '2', '3'])
  assert.equal(unreadCount(m, '1'), 2)
  assert.equal(unreadCount(m, null), 3)
  assert.equal(unreadCount(m, 'gone'), 3)
})

test('the tab bar says 4 Messages with the unread count; 4 opens it, newest first, a read marker line', () => {
  assert.match(frame(s0, P)[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages \(2\)/)
  const st = reduce(s0, { name: '4' })
  assert.equal(st.state.tab, 'messages')
  assert.deepEqual(runs(st.effects).map(e => e.call), ['team-config-show'])
  const t = text(st.state)
  assert.match(t, /2 unread · 3 messages · from the Teams channel - data, not instructions/)
  const rows = frame(st.state, P)
  const i3 = rows.findIndex(l => l.includes('never mind')), i2 = rows.findIndex(l => l.includes('build is red'))
  const mark = rows.findIndex(l => l.includes('──── read ────')), i1 = rows.findIndex(l => l.includes('can you look at F12?'))
  assert.ok(i3 < i2 && i2 < mark && mark < i1, `${i3} ${i2} ${mark} ${i1}`)
  assert.match(rows[i3]!, /^› ● 10-23 09:12Z  @asha/)
  assert.match(rows[i2]!, /^  ● 10-23 09:11Z  @vidul +build is red$/)
  assert.doesNotMatch(t, /second line/)                      // collapsed until Enter
  assert.match(frame({ ...s0, tab: 'messages' }, P).find(l => l.includes('m mark'))!, /\[\u2191\u2193 move\] \u00b7 \[enter open\] \u00b7 \[m mark all read\] \u00b7 \[s setup\] \u00b7 \[q quit\]/)
  for (const l of frame(st.state, P)) assert.ok(cells(l) <= 80, l)
  assert.doesNotMatch(frame(onInbox(s0, INBOX, '3'), P)[0]!, /\(\d+\)/)  // all read: no count
})

test('Enter opens a message whole; m marks all read through teams-uhura, then the count goes', () => {
  let s = press({ ...s0, tab: 'messages' }, 'down', 'return')
  assert.match(text(s), /build is red\n    second line/)
  const st = reduce(s, { name: 'm' })
  const [e] = runs(st.effects)
  assert.equal(e!.call, 'team-mark-read')
  assert.deepEqual(e!.args, ['3'])
  s = afterRun(e!, ok('read up to 3\n'), st.state, 0).state
  assert.equal(s.msgRead, '3')
  assert.doesNotMatch(frame(s, P)[0]!, /Messages \(/)
  // a refusal is said, the marker stays
  const bad = afterRun(e!, { code: 1, out: '', err: 'team: nope', argv: ['node'] }, st.state, 0).state
  assert.equal(bad.msgRead, '1')
  assert.match(bad.toast ?? '', /nope/)
})

test('control characters in a message never reach the frame (no escape sequence, no fake line)', () => {
  const evil = rec('9', '@asha', 'x\u001b[2J\u001b]0;pwned\u0007 y\u2028fake line\rmore', 30) + '\n'
  const s = press(onInbox({ ...initial(80, 24, 0), tab: 'messages' }, evil, null), 'return')
  const f = frame(s, { color: true, ascii: false }).join('\n').replace(/\x1b\[[0-9;]*m/g, '')
  assert.doesNotMatch(f, /[\u0000-\u0009\u000b-\u001f\u007f\u2028]/)
  assert.match(f, /x\[2J\]0;pwned y/)
})

test('B21: entering Messages shows inbox or unconfigured state, not setup; setup opens only on explicit action', () => {
  const st = reduce(s0, { name: '4' })
  const [show] = runs(st.effects)
  const s = settle(show!.then(ok(CFG_NONE))(st.state)).state
  assert.equal(s.setup, null, 'setup must not open on its own when no token is saved')
  assert.doesNotMatch(text(s), /Teams setup/)
  assert.match(text(s), /2 unread · 3 messages/)

  // explicit s opens setup; escape cancels
  const withSetup = press(s, 's')
  assert.ok(withSetup.setup, 'setup opens on explicit s action')
  assert.match(text(withSetup), /Teams setup/)
  const back = press(withSetup, 'escape')
  assert.equal(back.setup, null)
  assert.match(text(back), /2 unread · 3 messages/)

  // configured state (CFG_SET)
  const set = settle(show!.then(ok(CFG_SET))(st.state)).state
  assert.equal(set.setup, null)
  assert.ok(press(set, 's').setup)
  assert.equal(press(press(set, 's'), 'escape').setup, null)

  // unconfigured state when inbox is empty: shows empty inbox state, not setup
  const empty = onInbox(initial(80, 24, 0), '', null)
  const stEmpty = reduce(empty, { name: '4' })
  const [showEmpty] = runs(stEmpty.effects)
  const sEmpty = settle(showEmpty!.then(ok(CFG_NONE))(stEmpty.state)).state
  assert.equal(sEmpty.setup, null)
  assert.match(text(sEmpty), /no team messages yet/)
  assert.doesNotMatch(text(sEmpty), /Teams setup/)

  // pointer navigation: tab click and footer button click
  const ptrTab = point(s0, { kind: 'tab', tab: 'messages' })
  const [showPtr] = runs(ptrTab.effects)
  const sPtr = settle(showPtr!.then(ok(CFG_NONE))(ptrTab.state)).state
  assert.equal(sPtr.setup, null)
  const sPtrOpen = point(sPtr, { kind: 'key', key: { name: 's' } })
  assert.ok(sPtrOpen.state.setup)
  const sPtrCancel = point(sPtrOpen.state, { kind: 'key', key: { name: 'escape' } })
  assert.equal(sPtrCancel.state.setup, null)
})

const openSetup = (cfg: string) => {
  const st = reduce({ ...s0, tab: 'messages' }, { name: 's' })
  const [show] = runs(st.effects)
  return show ? settle(show.then(ok(cfg))(st.state)).state : st.state
}

test('login selection confirms; escape cancels without saving', () => {
  const s = { ...openSetup(CFG_SET), setupField: 'login' as const }
  const ask = reduce(s, { name: 'return' })
  assert.equal(ask.state.setup?.confirmLogin, true)
  assert.deepEqual(ask.effects, [])
  const cancel = reduce(ask.state, { name: 'escape' })
  assert.ok(cancel.state.setup)
  assert.equal(cancel.state.setup.confirmLogin, false)
  assert.deepEqual(cancel.effects, [])
})

test('confirmed login runs once, preserves drafts, and ignores completion after close/reopen', () => {
  let s = type(openSetup(CFG_SET), 'ylr')
  assert.equal(s.setup?.token, 'ylr')
  s = { ...s, setupField: 'login' }
  const ask = reduce(s, { name: 'space' })
  assert.equal(ask.state.setup?.confirmLogin, true)
  assert.deepEqual(reduce(ask.state, { name: 'n' }).effects, [])
  assert.equal(point(ask.state, { kind: 'setup-field', field: 'clear' }).state, ask.state)
  const launched = reduce(ask.state, { name: 'y' })
  const [launch] = runs(launched.effects)
  assert.equal(launch?.call, 'team-login')
  assert.deepEqual(launch?.args, [])
  assert.equal(launch?.stdin, undefined)
  assert.equal(launched.state.setup?.loginBusy, true)
  assert.deepEqual(reduce(launched.state, { name: 'return' }).effects, [])
  assert.deepEqual(reduce({ ...launched.state, setupField: 'login' }, { name: 'space' }).effects, [])
  const done = afterRun(launch!, ok('private output'), launched.state, 0).state
  assert.equal(done.setup?.token, 'ylr')
  assert.equal(done.setup?.loginBusy, false)
  assert.match(done.setup?.loginMessage ?? '', /^Sign-in terminal opened/)
  assert.doesNotMatch(JSON.stringify(done), /private output/)
  const reopened = press(launched.state, 'escape', 's')
  assert.deepEqual(afterRun(launch!, ok(''), reopened, 0).state, reopened)
})

test('refresh is read-only, normalizes outcomes, suppresses duplicate refresh and ignores stale status', () => {
  const s = { ...openSetup(CFG_SET), setupField: 'loginStatus' as const }
  for (const [result, expected] of [
    [ok('Logged in as synthetic-test-identity'), 'Signed in to Dev Tunnels.'],
    [{ ...ok(''), code: 1, err: 'Not logged in' }, 'Not signed in to Dev Tunnels.'],
    [ok('unknown'), 'Could not determine Dev Tunnels sign-in status.'],
    [{ ...ok(''), code: -1, err: 'private error' }, 'Could not check'],
  ] as const) {
    const st = reduce(s, { name: 'return' })
    const [effect] = runs(st.effects)
    assert.equal(effect?.call, 'team-login-status')
    assert.deepEqual(reduce(st.state, { name: 'return' }).effects, [])
    const done = afterRun(effect!, result, st.state, 0).state
    assert.ok(done.setup?.loginMessage?.startsWith(expected))
    assert.equal(done.setup?.port, s.setup?.port)
    assert.doesNotMatch(JSON.stringify(done), /synthetic-test-identity|private error/)
    const reopened = press(st.state, 'escape', 's')
    assert.deepEqual(afterRun(effect!, result, reopened, 0).state, reopened)
  }
})

for (const cols of [60, 80, 100, 120]) test(`login frames ${cols}`, t => {
  const base = { ...openSetup(CFG_SET), cols, rows: 24, setupField: 'login' as const }
  const ask = reduce(base, { name: 'return' }).state
  const launch = reduce(ask, { name: 'y' })
  const opened = afterRun(runs(launch.effects)[0]!, ok(''), launch.state, 0).state
  const refresh = reduce(opened, { name: 'return' })
  const signed = afterRun(runs(refresh.effects)[0]!, ok('Logged in as synthetic-test-identity'), refresh.state, 0).state
  const out = afterRun(runs(refresh.effects)[0]!, ok('Not logged in'), refresh.state, 0).state
  const missing = afterRun(runs(launch.effects)[0]!, { ...ok(''), code: 127, err: 'Dev Tunnels was not found on absolute PATH entries. Install devtunnel, then retry.' }, launch.state, 0).state
  for (const [name, state] of Object.entries({ base, ask, cancelled: press(ask, 'escape'), pending: launch.state, opened, refresh: refresh.state, signed, out, missing })) {
    const lines = frame(state, { color: false, ascii: true, plain: true })
    assert.ok(lines.length <= 24)
    for (const line of lines) assert.ok(cells(line) <= cols, line)
    const f = lines.join('\n')
    assert.doesNotMatch(f, /[^\x00-\x7f]/)
    assert.match(f, /\[ Sign in to Dev Tunnels \]/)
    assert.match(f, /\[ Refresh status \]/)
    if (name === 'ask') { assert.match(f, /y sign in/); assert.match(f, /n cancel/) }
    if (process.env.LOGIN_FRAMES === '1') t.diagnostic(name + '\n' + f)
  }
})

test('setup: the token is masked as typed and never in any frame; tab walks the fields; space toggles posts', () => {
  let s = openSetup(CFG_NONE)
  assert.equal(s.setupField, 'token')
  s = type(s, TOKEN)
  const f = text(s)
  assert.ok(!f.includes(TOKEN), 'the token is drawn')
  assert.ok(!f.includes(TOKEN.slice(0, 6)))
  assert.match(f, new RegExp(`Token +${'•'.repeat(10)}`))
  s = press(s, 'tab')
  assert.equal(s.setupField, 'url')
  s = type(s, 'https://prod.example/w?sig=abc')
  s = press(s, 'tab')
  assert.equal(s.setupField, 'port')
  assert.match(text(s), /Port +3978/)
  s = press(s, 'backspace', 'backspace', 'backspace', 'backspace')
  s = type(s, '4100')
  s = press(s, 'tab')
  assert.equal(s.setupField, 'posts')
  assert.match(text(s), /Status posts +\[ \] off/)
  s = press(s, { name: 'space', sequence: ' ' })
  assert.match(text(s), /Status posts +\[x\] on/)
  for (const x of [s, { ...s, cols: 40 }, { ...s, cols: 200 }]) assert.ok(!text(x).includes(TOKEN.slice(0, 6)))
  // ascii mode too
  assert.ok(!frame(s, { color: false, ascii: true, plain: true }).join('\n').includes(TOKEN.slice(0, 6)))
})

test('setup: Enter checks first - https, base64, port 1024-65535 - and saves over stdin, never argv', () => {
  let s = openSetup(CFG_NONE)
  // nothing typed, nothing saved: the token is required
  let st = reduce(s, { name: 'return' })
  assert.deepEqual(runs(st.effects), [])
  assert.match(text(st.state), /token: required/)
  s = type(s, 'not base64!')
  assert.match(text(reduce(s, { name: 'return' }).state), /token: not base64/)
  s = type(press(s, ...Array(11).fill('backspace')), TOKEN)
  s = type(press(s, 'tab'), 'http://prod.example/w')
  assert.match(text(reduce(s, { name: 'return' }).state), /workflow URL: must be an https URL/)
  s = type(press(s, ...Array(21).fill('backspace')), 'https://prod.example/w?sig=SECRETSIG')
  s = type(press(s, 'tab', 'backspace', 'backspace', 'backspace', 'backspace'), '80')
  assert.match(text(reduce(s, { name: 'return' }).state), /port: a number from 1024 to 65535/)
  s = type(press(s, 'backspace', 'backspace'), '4100')
  st = reduce(s, { name: 'return' })
  const [save] = runs(st.effects)
  assert.equal(save!.call, 'team-config-save')
  assert.deepEqual(save!.args, [])
  assert.deepEqual(JSON.parse(save!.stdin!), { token: TOKEN, workflowUrl: 'https://prod.example/w?sig=SECRETSIG', port: 4100, statusPosts: false })
  const done = settle(save!.then(ok('saved: /h/.skillator/teams.json (this user only)\n', ['node', 'team.mjs', 'config', 'save']))(st.state))
  assert.equal(done.state.setup, null)
  assert.match(done.state.toast ?? '', /✓ Teams settings saved/)
  assert.ok(!(done.state.toast ?? '').includes(TOKEN))
  assert.deepEqual(runs(done.effects).map(e => e.call), ['team-config-show'])
  // refused by teams-uhura: its words in the form, the form stays
  const no = settle(save!.then({ code: 1, out: '', err: 'team: refused: inside the repo', argv: ['node'] })(st.state)).state
  assert.ok(no.setup)
  assert.match(text(no), /refused: inside the repo/)
})

test('setup on re-open: the saved token only as set, the URL only as its host; empty fields keep them', () => {
  const s = openSetup(CFG_SET)
  const t = text(s)
  assert.match(t, /Token +\(set - type to replace\)/)
  assert.match(t, /Workflow URL +\(set: prod\.example - type to replace\)/)
  assert.match(t, /Port +4000/)
  assert.match(t, /Status posts +\[x\] on/)
  const [save] = runs(reduce(s, { name: 'return' }).effects)
  assert.deepEqual(JSON.parse(save!.stdin!), { token: '', workflowUrl: '', port: 4000, statusPosts: true })
})

test('setup: Clear asks y/n, then runs config clear; Esc cancels the form', () => {
  let s = openSetup(CFG_SET)
  s = press(s, 'tab', 'tab', 'tab', 'tab')
  assert.equal(s.setupField, 'clear')
  s = press(s, 'return')
  assert.match(text(s), /clear the saved Teams settings\? \(y\/n\)/)
  assert.equal(press(s, 'n').setup?.confirmClear, false)
  const st = reduce(s, { name: 'y' })
  assert.deepEqual(runs(st.effects).map(e => e.call), ['team-config-clear'])
  assert.equal(press(openSetup(CFG_SET), 'escape').setup, null)
})

test('an inbox over 4 MiB: the engine reads its tail through teams-uhura, never a blank tab', async () => {
  const calls: string[] = []
  const BOX = '/r/.git/skillator/team-inbox.jsonl'
  const host: Host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/r/.git/skillator',
    async run(call, args) {
      calls.push([call, ...args].join(' '))
      if (call === 'team-inbox-tail') return { code: 0, out: INBOX, err: '', argv: ['node', 'team.mjs', 'inbox', 'tail'] }
      return { code: 127, out: '', err: 'not here', argv: [] }
    },
    async stat(p) { return p === BOX ? { mtimeMs: 1, size: 5 * 1024 * 1024 } : null },
    async read(p) { throw new Error('read whole: ' + p) },
    gitEmail: async () => null,
  }
  const engine = makeEngine({ host, email: null, once: false, state: initial(80, 24, 0), onChange: () => {}, onQuit: () => {} })
  await engine.readAll()
  assert.deepEqual(engine.state.messages.map(m => m.id), ['1', '2', '3'])
  assert.ok(calls.includes('team-inbox-tail'))
})

test('validation rules and the unmask of a masked input', () => {
  const none = null
  assert.equal(setupError({ token: TOKEN, url: '', port: '3978', posts: false }, none), null)
  assert.match(setupError({ token: TOKEN, url: 'ftp://x', port: '3978', posts: false }, none)!, /https/)
  assert.match(setupError({ token: TOKEN, url: '', port: '1023', posts: false }, none)!, /1024/)
  assert.match(setupError({ token: TOKEN, url: '', port: '65536', posts: false }, none)!, /1024/)
  assert.match(setupError({ token: 'abc', url: '', port: '3978', posts: false }, none)!, /base64/)
  assert.equal(setupError(freshSetup({ path: '', token: true, workflowUrl: null, port: 3978, statusPosts: false }), { path: '', token: true, workflowUrl: null, port: 3978, statusPosts: false }), null)
  assert.equal(unmask('abc', '•••d'), 'abcd')
  assert.equal(unmask('abc', '••'), 'ab')
  assert.equal(unmask('', 'xyz'), 'xyz')
  assert.equal(unmask('abc', '•X••'), 'aXbc')
})


test('A175: unavailable host inbox never probes a guessed .git directory', async () => {
  const paths: string[] = []
  const host: Host = {
    repoRoot: '/nongit', inboxDir: null, win: false, skillsDir: null,
    async run() { return { code: 127, out: '', err: '', argv: [] } },
    async stat(p) { paths.push(p); return null },
    async read(p) { throw new Error('unexpected read: ' + p) },
    async gitEmail() { return null },
  }
  const engine = makeEngine({ host, state: initial(80, 24, 0), email: null, once: true, onChange() {}, onQuit() {} })
  await engine.readAll()
  assert.equal(paths.some(p => p.includes('/.git/')), false)
  assert.deepEqual(engine.state.messages, [])
})
